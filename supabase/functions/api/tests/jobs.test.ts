import { assertEquals, assertRejects } from "@std/assert";
import { NoEntityFoundError, type PublicArkivClient } from "@arkiv-network/sdk";
import { type Hex, stringToHex } from "viem";
import { RENEW_WINDOW_MS, runMirror, runRenewer } from "../lib/jobs.ts";
import { addr, hex32, makeTestApp, MemoryRepo } from "./helpers.ts";

// Block 1000 is "now"; one block is 2 s.
const NOW = 1_800_000_000_000;
const timing = { currentBlock: 1000n, currentBlockTime: NOW / 1000, blockDuration: 2 };
const blockIn = (ms: number) => 1000n + BigInt(Math.round(ms / 2000));

type Report = { $key: string; $creator: string; $expiresAt: bigint; source: string };

function mirrorClient(reports: Report[], pageSize = 100) {
  const queries: string[] = [];
  const client = {
    getBlockTiming: () => Promise.resolve(timing),
    select: () => {
      let creator = "", after = "";
      const q = {
        from: () => q, orderBy: () => q, limit: () => q,
        createdBy: (c: string) => ((creator = c), q),
        where: (pred: { value?: unknown }) => ((after = JSON.stringify(pred)), q),
        fetch: () => {
          queries.push(creator);
          const mine = reports.filter((r) => r.$creator === creator).sort((a, b) => a.$key.localeCompare(b.$key));
          const last = after ? mine.findIndex((r) => after.includes(r.$key.slice(2))) + 1 : 0;
          const page = mine.slice(last, last + pageSize).map((r) => ({
            ...r,
            address: { value: addr("9") }, source: { value: r.source }, category: { value: "exploit" },
            reason: { value: stringToHex("drainer") },
          }));
          return Promise.resolve({ entities: page, skipped: 0 });
        },
      };
      return q;
    },
  } as unknown as PublicArkivClient;
  return { client, queries };
}

Deno.test("mirror: archives only trusted creators' reports with known sources", async () => {
  const repo = new MemoryRepo();
  const { client, queries } = mirrorClient([
    { $key: hex32("1"), $creator: addr("a"), $expiresAt: blockIn(10 * 86400_000), source: "list" },
    { $key: hex32("2"), $creator: addr("a"), $expiresAt: 2000n, source: "made-up" },
    { $key: hex32("3"), $creator: addr("b"), $expiresAt: 2000n, source: "trustee" },
    { $key: hex32("4"), $creator: addr("e"), $expiresAt: 2000n, source: "list" }, // stranger
  ]);
  const out = await runMirror({ client, repo, trustedCreators: () => Promise.resolve([addr("A"), addr("b")]) });
  assertEquals(out.saved, 2);
  assertEquals(queries, [addr("a"), addr("b")]);
  const first = repo.archive[0] as Record<string, unknown>;
  assertEquals(first.entity_key, hex32("1"));
  assertEquals(first.reason, "drainer");
  assertEquals(first.arkiv_expires_at, new Date(NOW + 10 * 86400_000).toISOString());
});

Deno.test("mirror: pages through a creator with more than one page", async () => {
  const repo = new MemoryRepo();
  const reports = Array.from({ length: 250 }, (_, i) => ({
    $key: "0x" + i.toString(16).padStart(64, "0"), $creator: addr("a"), $expiresAt: 2000n, source: "list",
  }));
  const { client, queries } = mirrorClient(reports);
  assertEquals((await runMirror({ client, repo, trustedCreators: () => Promise.resolve([addr("a")]) })).saved, 250);
  assertEquals(queries.length, 3);
});

function renewerSetup(entities: Record<string, bigint | "gone">, opts: { extendErrors?: string[] } = {}) {
  const repo = new MemoryRepo();
  repo.clock = () => new Date(NOW);
  for (const k of Object.keys(entities)) repo.expiry.set(k, { expiresAt: new Date(NOW + 86400_000) });
  const extended: string[] = [];
  const errors = [...(opts.extendErrors ?? [])];
  const client = {
    getBlockTiming: () => Promise.resolve(timing),
    getEntity: (k: string) => {
      const e = entities[k];
      if (e === "gone" || e === undefined) return Promise.reject(new NoEntityFoundError(k as Hex));
      return Promise.resolve({ $expiresAt: e });
    },
  } as unknown as PublicArkivClient;
  const seed = {
    extendEntity: ({ entityKey }: { entityKey: string }) => {
      const err = errors.shift();
      if (err) return Promise.reject(new Error(err));
      extended.push(entityKey);
      entities[entityKey] = blockIn(180 * 86400_000);
      return Promise.resolve({ entityKey, txHash: "0x1" });
    },
  } as never;
  return { repo, client, seed, extended };
}

Deno.test("renewer: extends what expires soon, skips what someone else extended, notes what's gone", async () => {
  const soon = hex32("1"), already = hex32("2"), gone = hex32("3");
  const t = renewerSetup({ [soon]: blockIn(86400_000), [already]: blockIn(RENEW_WINDOW_MS + 86400_000), [gone]: "gone" });
  const out = await runRenewer({ client: t.client, seed: t.seed, repo: t.repo, now: () => NOW });
  assertEquals(out, { renewed: 1, checked: 3, failed: 0, gone: 1 });
  assertEquals(t.extended, [soon]);
  assertEquals(t.repo.expiry.get(soon)!.expiresAt!.getTime(), NOW + 180 * 86400_000);
  assertEquals(t.repo.expiry.get(soon)!.extendedAt!.getTime(), NOW);
  assertEquals(t.repo.expiry.get(already)!.extendedAt, undefined);
  assertEquals(t.repo.expiry.get(gone)!.expiresAt, null);
  // Nothing is due any more.
  assertEquals((await runRenewer({ client: t.client, seed: t.seed, repo: t.repo, now: () => NOW })).checked, 0);
});

Deno.test("renewer: one failure doesn't stop the rest, and sits out for a day", async () => {
  const a = hex32("1"), b = hex32("2");
  const t = renewerSetup({ [a]: blockIn(1000), [b]: blockIn(2000) }, { extendErrors: ["not permitted"] });
  const out = await runRenewer({ client: t.client, seed: t.seed, repo: t.repo, now: () => NOW });
  assertEquals(out.failed, 1);
  assertEquals(t.extended.length, 1);
  assertEquals(await t.repo.renewalCandidates(new Date(NOW + RENEW_WINDOW_MS), 10), []);
});

Deno.test("renewer: retries once on a nonce clash; stops the run when out of tGLM", async () => {
  const t = renewerSetup({ [hex32("1")]: blockIn(1000) }, { extendErrors: ["nonce too low"] });
  assertEquals((await runRenewer({ client: t.client, seed: t.seed, repo: t.repo, now: () => NOW })).renewed, 1);

  const poor = renewerSetup({ [hex32("1")]: blockIn(1000), [hex32("2")]: blockIn(2000) }, {
    extendErrors: ["insufficient funds for gas"],
  });
  await assertRejects(() => runRenewer({ client: poor.client, seed: poor.seed, repo: poor.repo, now: () => NOW }));
  assertEquals(poor.extended, []);
});

Deno.test("renewer: stops starting extends after its time budget", async () => {
  const t = renewerSetup({ [hex32("1")]: blockIn(1000), [hex32("2")]: blockIn(2000) });
  let clock = NOW;
  const out = await runRenewer({
    client: t.client, seed: t.seed, repo: t.repo, budgetMs: 1000,
    now: () => (clock += 600), // each check takes 600 ms
  });
  assertEquals(out.checked, 1);
});

Deno.test("jobs endpoints need the secret, not a Privy token", async () => {
  const t = makeTestApp({ jobs: { secret: "s3cret", mirror: () => Promise.resolve({ saved: 0 }), renew: () => Promise.resolve({ renewed: 0 }) } });
  const call = (secret?: string) =>
    t.app.request("/api/jobs/mirror", { method: "POST", headers: secret ? { "x-jobs-secret": secret } : {} });
  assertEquals((await call()).status, 401);
  assertEquals((await call("wrong")).status, 401);
  const ok = await call("s3cret");
  assertEquals(ok.status, 200);
  assertEquals(await ok.json(), { saved: 0 });
});
