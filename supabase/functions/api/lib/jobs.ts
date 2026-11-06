// Scheduled Arkiv jobs (D6). Supabase Cron calls them over HTTP (see the
// arkiv_cron migration):
// - mirror (hourly): copies verified scam reports from Arkiv into
//   scam_reports_archive, the permanent record.
// - renewer (hourly): extends archived reports that expire within 30 days,
//   paid by the seed wallet.
//
// Only verified reports (written by the seed wallet or a trustee pair key) are
// archived and renewed. Anyone can write scam_report entities, so archiving
// everything would let strangers fill our database and spend our tGLM.
import { ExpirationTime, NoEntityFoundError, type PublicArkivClient, type WalletArkivClient } from "@arkiv-network/sdk";
import { asc, gt } from "@arkiv-network/sdk/query";
import { key } from "@arkiv-network/sdk/schema";
import { type Hex, hexToString } from "viem";
import { blockToDate, ScamReport } from "./arkivLive.ts";

export type ArchiveRow = {
  entity_key: string;
  address: string;
  source: "trustee" | "ofac" | "list";
  category: string | null;
  reason: string | null;
  creator: string;
  verified: true;
  arkiv_expires_at: string;
};

export type RenewalCandidate = { entityKey: string };

export interface JobsRepo {
  saveArchive(rows: ArchiveRow[]): Promise<void>;
  // Archived reports whose Arkiv copy expires before `before`, soonest first,
  // leaving out ones that failed to extend in the last day.
  renewalCandidates(before: Date, limit: number): Promise<RenewalCandidate[]>;
  markRenewFailed(entityKey: string): Promise<void>;
  // expiresAt null = gone from Arkiv (the archive keeps it, no more renewing).
  markExpiry(entityKey: string, expiresAt: Date | null, extended: boolean): Promise<void>;
}

const SOURCES = new Set(["trustee", "ofac", "list"]);
const PAGE = 100;
const MAX_PAGES = 50;
const DAY_MS = 24 * 3600 * 1000;
export const RENEW_WINDOW_MS = 30 * DAY_MS;

// One creator's reports, page by page on $key.
async function reportsBy(client: PublicArkivClient, creator: Hex) {
  const rows = [];
  let after: Hex | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = client
      .select({ $key: true, $creator: true, $expiresAt: true, address: true, source: true, category: true, reason: true })
      .from(ScamReport, { onMismatch: "skip" })
      .createdBy(creator)
      .orderBy(asc("$key"))
      .limit(PAGE);
    const res = await (after ? q.where(gt("$key", key(after))) : q).fetch();
    rows.push(...res.entities);
    if (res.entities.length + res.skipped < PAGE) return rows;
    // A page with no rows has no key to continue from. Our own writers
    // always fit the schema, so this means something is wrong: stop.
    if (res.entities.length === 0) {
      console.error(`mirror: a full page of mismatched reports from ${creator}, stopping`);
      return rows;
    }
    after = res.entities[res.entities.length - 1].$key;
  }
  console.error(`mirror: ${creator} has more than ${MAX_PAGES * PAGE} reports, stopped`);
  return rows;
}

export async function runMirror(deps: {
  client: PublicArkivClient;
  trustedCreators: () => Promise<string[]>;
  repo: JobsRepo;
}): Promise<{ saved: number }> {
  const creators = [...new Set((await deps.trustedCreators()).map((a) => a.toLowerCase()))];
  const timing = await deps.client.getBlockTiming();
  const rows: ArchiveRow[] = [];
  for (const creator of creators) {
    for (const r of await reportsBy(deps.client, creator as Hex)) {
      if (!SOURCES.has(r.source.value)) continue; // the table only takes these
      rows.push({
        entity_key: r.$key.toLowerCase(),
        address: r.address.value.toLowerCase(),
        source: r.source.value as ArchiveRow["source"],
        category: r.category.value || null,
        reason: decodeReason(r.reason.value),
        creator: r.$creator.toLowerCase(),
        verified: true,
        arkiv_expires_at: blockToDate(r.$expiresAt, timing).toISOString(),
      });
    }
  }
  if (rows.length > 0) await deps.repo.saveArchive(rows);
  return { saved: rows.length };
}

function decodeReason(bytes: Hex): string | null {
  try {
    return hexToString(bytes) || null;
  } catch {
    return null;
  }
}

const isNonceClash = (err: unknown) =>
  /nonce too low|replacement transaction underpriced|already known/i.test(String((err as Error)?.message ?? err));
const isOutOfFunds = (err: unknown) => /insufficient funds/i.test(String((err as Error)?.message ?? err));

export async function runRenewer(deps: {
  client: PublicArkivClient;
  seed: Pick<WalletArkivClient, "extendEntity">;
  repo: JobsRepo;
  now?: () => number;
  // Stop starting new extends after this long; each one waits for a receipt.
  budgetMs?: number;
  limit?: number;
}): Promise<{ renewed: number; checked: number; failed: number; gone: number }> {
  const now = deps.now ?? Date.now;
  const start = now();
  const budget = deps.budgetMs ?? 60_000;
  const out = { renewed: 0, checked: 0, failed: 0, gone: 0 };
  const candidates = await deps.repo.renewalCandidates(new Date(start + RENEW_WINDOW_MS), deps.limit ?? 25);

  for (const { entityKey } of candidates) {
    if (now() - start > budget) break;
    out.checked++;
    try {
      // Extension is permissionless, so someone may have extended it already.
      let entity;
      try {
        entity = await deps.client.getEntity(entityKey as Hex);
      } catch (err) {
        if (!(err instanceof NoEntityFoundError)) throw err;
        await deps.repo.markExpiry(entityKey, null, false);
        out.gone++;
        continue;
      }
      const timing = await deps.client.getBlockTiming();
      const expiresAt = blockToDate(entity.$expiresAt, timing);
      if (expiresAt.getTime() - now() >= RENEW_WINDOW_MS) {
        await deps.repo.markExpiry(entityKey, expiresAt, false);
        continue;
      }

      const extend = () => deps.seed.extendEntity({ entityKey: entityKey as Hex, expiration: ExpirationTime.max() });
      try {
        await extend();
      } catch (err) {
        if (!isNonceClash(err)) throw err;
        await new Promise((r) => setTimeout(r, 2_500)); // one block
        await extend();
      }
      const after = await deps.client.getEntity(entityKey as Hex);
      await deps.repo.markExpiry(entityKey, blockToDate(after.$expiresAt, await deps.client.getBlockTiming()), true);
      out.renewed++;
    } catch (err) {
      // Out of tGLM: every other extend would fail too.
      if (isOutOfFunds(err)) throw err;
      // Otherwise skip this one (e.g. a report made without permissionless
      // extension) so it can't block the rest.
      console.error(`renewer: ${entityKey} failed`, err);
      await deps.repo.markRenewFailed(entityKey).catch(() => {});
      out.failed++;
    }
  }
  return out;
}
