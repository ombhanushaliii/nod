import { assertEquals } from "@std/assert";
import type { PublicArkivClient } from "@arkiv-network/sdk";
import { arkivApprovals, arkivScamReports, blockToDate, countReports, type DecisionRow, pickDecision } from "../lib/arkivLive.ts";
import { addr } from "./helpers.ts";

const timing = { currentBlock: 1000n, currentBlockTime: 1_800_000_000, blockDuration: 2 };

Deno.test("blockToDate: counts back and forward from the current block", () => {
  assertEquals(blockToDate(1000n, timing).getTime(), 1_800_000_000_000);
  assertEquals(blockToDate(970n, timing).getTime(), 1_800_000_000_000 - 60_000);
  assertEquals(blockToDate(1030n, timing).getTime(), 1_800_000_000_000 + 60_000);
});

const row = (verdict: string, minute: number, k = String(minute)): DecisionRow => ({
  entityKey: k, owner: "o", pairId: "p", requestKey: "r", verdict, intentHash: null, validFrom: null,
  createdAt: new Date(minute * 60_000), expiresAt: new Date((minute + 60) * 60_000),
});

Deno.test("pickDecision: any deny wins, else the earliest allow, unknown verdicts ignored", () => {
  assertEquals(pickDecision([]), null);
  assertEquals(pickDecision([row("maybe", 1)]), null);
  assertEquals(pickDecision([row("allow", 5), row("allow", 2), row("maybe", 1)])!.entityKey, "2");
  assertEquals(pickDecision([row("allow", 1), row("deny", 9)])!.verdict, "deny");
});

Deno.test("countReports: only trusted creators are verified, case-insensitively", () => {
  const trusted = new Set([addr("a")]);
  assertEquals(countReports([addr("A"), addr("b"), addr("a"), addr("c")], trusted), { verified: 2, unverified: 2 });
});

function fakeClient(fetch: (offset: number) => Promise<unknown>): PublicArkivClient {
  let offset = 0;
  const q = {
    from: () => q, where: () => q, orderBy: () => q, limit: () => q,
    offset: (n: number) => ((offset = n), q),
    fetch: () => fetch(offset),
  };
  return { select: () => q } as unknown as PublicArkivClient;
}

Deno.test("scam reports: counts creators from Arkiv", async () => {
  const reports = arkivScamReports({
    client: fakeClient(() => Promise.resolve({ entities: [{ $creator: addr("a") }, { $creator: addr("b") }], skipped: 0 })),
    trustedCreators: () => Promise.resolve([addr("a")]),
    archive: () => Promise.reject(new Error("not used")),
  });
  assertEquals(await reports.countFor(addr("9")), { verified: 1, unverified: 1 });
});

Deno.test("scam reports: Arkiv down falls back to the archive", async () => {
  const reports = arkivScamReports({
    client: fakeClient(() => Promise.reject(new Error("timeout"))),
    trustedCreators: () => Promise.resolve([]),
    archive: (a) => Promise.resolve(a === addr("9") ? { verified: 3, unverified: 0 } : { verified: 0, unverified: 0 }),
  });
  assertEquals(await reports.countFor(addr("9")), { verified: 3, unverified: 0 });
});

Deno.test("scam reports: pages of 100 (skipped ones count), stops at a short page", async () => {
  const offsets: number[] = [];
  const reports = arkivScamReports({
    client: fakeClient((offset) => {
      offsets.push(offset);
      // Page 1: 90 rows + 10 skipped (full). Page 2: 3 rows (short, last).
      const n = offset === 0 ? 90 : 3;
      return Promise.resolve({ entities: Array.from({ length: n }, () => ({ $creator: addr("b") })), skipped: offset === 0 ? 10 : 0 });
    }),
    trustedCreators: () => Promise.resolve([]),
    archive: () => Promise.reject(new Error("not used")),
  });
  assertEquals(await reports.countFor(addr("9")), { verified: 0, unverified: 93 });
  assertEquals(offsets, [0, 100]);
});

Deno.test("decisions: only ones the pair key created, never by owner", async () => {
  const calls: string[] = [];
  const q = {
    from: () => q, where: () => q, limit: () => q,
    createdBy: (a: string) => (calls.push(`createdBy ${a}`), q),
    ownedBy: (a: string) => (calls.push(`ownedBy ${a}`), q),
    fetch: () => Promise.resolve({ entities: [], skipped: 0 }),
  };
  const client = {
    select: () => q,
    getBlockTiming: () => Promise.resolve(timing),
  } as unknown as PublicArkivClient;
  assertEquals(await arkivApprovals(client).findDecision("0x" + "1".repeat(64), addr("p")), null);
  assertEquals(calls, [`createdBy ${addr("p")}`]);
});
