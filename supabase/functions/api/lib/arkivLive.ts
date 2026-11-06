// Live reads from Arkiv (Rabdi testnet): approval requests, trustee decisions
// and scam reports. Implements the ArkivApprovals and ScamReports interfaces.
//
// The schemas below must match packages/arkiv/src/schemas.ts (same names and
// columns). They're repeated here because that package imports without file
// extensions, which Supabase's Deno runtime can't load.
//
// Rules for trusting what's on Arkiv:
// - Times come from the block an entity landed in, never from a time the
//   entity claims, so nothing can be backdated.
// - Queries skip entities that don't fit our schemas, so one bad entity
//   written by anyone can't break a read.
// - A report is "verified" only if our seed wallet or a trustee pair key wrote it.
import {
  createPublicClient,
  NoEntityFoundError,
  type PublicArkivClient,
} from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { asc, eq } from "@arkiv-network/sdk/query";
import { addr, bytes, defineSchema, key, SchemaMismatchError, str, u64 } from "@arkiv-network/sdk/schema";
import { http, type Hex } from "viem";
import type { ArkivApprovals, ArkivDecision, ArkivRequest } from "./arkiv.ts";
import type { ReportCounts, ScamReports } from "./risk.ts";

export const ApprovalRequest = defineSchema("approval_request", {
  pairId: str().indexed(),
  kind: str().indexed(),
  createdAt: u64().indexed(),
  payload: bytes(),
});

export const TrusteeDecision = defineSchema("trustee_decision", {
  pairId: str().indexed(),
  requestKey: key().indexed(),
  verdict: str().indexed(),
  createdAt: u64().indexed(),
  intentHash: str().optional(),
  validFrom: u64().optional(),
  reportKey: key().optional(),
});

export const ScamReport = defineSchema("scam_report", {
  address: addr().indexed(),
  source: str().indexed(),
  category: str().indexed(),
  reason: bytes(),
  evidenceRef: str().optional(),
});

// Reads go straight to the node: no retries, no redirects (the access key is
// in the URL), nothing cached.
export function arkivClient(accessKey: string): PublicArkivClient {
  return createPublicClient({
    chain: rabdi({ accessKey }),
    transport: http(undefined, { timeout: 10_000, retryCount: 0, fetchOptions: { cache: "no-store", redirect: "error" } }),
    cacheTime: 0,
  }) as PublicArkivClient;
}

export type BlockTiming = { currentBlock: bigint; currentBlockTime: number; blockDuration: number };

// Wall-clock time of a block, from the node's current block and block length.
export function blockToDate(block: bigint, t: BlockTiming): Date {
  const seconds = t.currentBlockTime + Number(block - t.currentBlock) * t.blockDuration;
  return new Date(seconds * 1000);
}

export type DecisionRow = Omit<ArkivDecision, "verdict"> & { verdict: string };

// One decision per request is expected. If the trustee's app wrote more than
// one, any deny wins; otherwise the earliest allow counts. Unknown verdicts
// are ignored.
export function pickDecision(rows: DecisionRow[]): ArkivDecision | null {
  const valid = rows.filter((r): r is ArkivDecision => r.verdict === "allow" || r.verdict === "deny");
  const deny = valid.find((r) => r.verdict === "deny");
  if (deny) return deny;
  return valid.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null;
}

export function countReports(creators: string[], trusted: Set<string>): ReportCounts {
  const verified = creators.filter((c) => trusted.has(c.toLowerCase())).length;
  return { verified, unverified: creators.length - verified };
}

const isNotOurs = (err: unknown) => err instanceof NoEntityFoundError || err instanceof SchemaMismatchError;

export function arkivApprovals(client: PublicArkivClient): ArkivApprovals {
  return {
    async getRequest(entityKey): Promise<ArkivRequest | null> {
      let e;
      try {
        e = await client.getEntity(entityKey as Hex, ApprovalRequest);
      } catch (err) {
        // Missing, expired, or not one of our approval requests.
        if (isNotOurs(err)) return null;
        throw err;
      }
      const kind = e.kind.value;
      if (kind !== "payment" && kind !== "export") return null;
      const timing = await client.getBlockTiming();
      return {
        entityKey: e.$key.toLowerCase(),
        owner: e.$owner.toLowerCase(),
        pairId: e.pairId.value.toLowerCase(),
        kind,
        createdAt: blockToDate(e.$createdAt, timing),
      };
    },

    async findDecision(requestKey, owner) {
      const [{ entities }, timing] = await Promise.all([
        client
          .select({
            $key: true, $owner: true, $createdAt: true, $expiresAt: true,
            pairId: true, requestKey: true, verdict: true, intentHash: true, validFrom: true,
          })
          .from(TrusteeDecision, { onMismatch: "skip" })
          .where(eq("requestKey", key(requestKey as Hex)))
          .ownedBy(owner as Hex)
          .limit(10)
          .fetch(),
        client.getBlockTiming(),
      ]);
      return pickDecision(entities.map((d) => ({
        entityKey: d.$key.toLowerCase(),
        owner: d.$owner.toLowerCase(),
        pairId: d.pairId.value.toLowerCase(),
        requestKey: d.requestKey.value.toLowerCase(),
        verdict: d.verdict.value,
        intentHash: d.intentHash?.value ?? null,
        validFrom: d.validFrom === undefined ? null : new Date(Number(d.validFrom.value)),
        createdAt: blockToDate(d.$createdAt, timing),
        expiresAt: blockToDate(d.$expiresAt, timing),
      })));
    },
  };
}

// The node returns at most 100 entities a page. Past 500 reports the count
// no longer changes the risk level, so reading stops there.
const PAGE = 100;
const MAX_PAGES = 5;

// Reports on Arkiv for an address. If Arkiv can't answer, the Supabase archive
// (the permanent copy the mirror keeps) answers instead.
export function arkivScamReports(deps: {
  client: PublicArkivClient;
  // Lower-case: the seed wallet plus every trustee pair key.
  trustedCreators: () => Promise<string[]>;
  archive: (address: string) => Promise<ReportCounts>;
}): ScamReports {
  return {
    async countFor(address) {
      try {
        const readCreators = async () => {
          const creators: string[] = [];
          for (let page = 0; page < MAX_PAGES; page++) {
            const res = await deps.client
              .select({ $creator: true })
              .from(ScamReport, { onMismatch: "skip" })
              .where(eq("address", addr(address as Hex)))
              .orderBy(asc("$key"))
              .limit(PAGE)
              .offset(page * PAGE)
              .fetch();
            creators.push(...res.entities.map((r) => r.$creator));
            // The offset counts skipped entities too, so a full page is rows + skipped.
            if (res.entities.length + res.skipped < PAGE) break;
          }
          return creators;
        };
        const [creators, trusted] = await Promise.all([readCreators(), deps.trustedCreators()]);
        return countReports(creators, new Set(trusted.map((a) => a.toLowerCase())));
      } catch (err) {
        console.error("arkiv report read failed, using the archive", err);
        return await deps.archive(address);
      }
    },
  };
}
