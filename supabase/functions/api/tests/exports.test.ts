import { assertEquals } from "@std/assert";
import { addr, hex32 } from "./helpers.ts";
import { HOUR, MIN, PAIR_KEY, setup, TRUSTEE, USER } from "./flow.ts";
import { exportIntentHash, intentHash } from "../lib/intent.ts";

// User asks to export, writes the (fake) Arkiv request and attaches it.
async function askExport(t: Awaited<ReturnType<typeof setup>>, requestKey = hex32("7")) {
  await t.call(USER, "POST", "/push/register", { expoToken: "ExponentPushToken[user]" });
  await t.call(TRUSTEE, "POST", "/push/register", { expoToken: "ExponentPushToken[trustee]" });
  const created = await t.call(USER, "POST", "/exports");
  assertEquals(created.status, 201);
  t.state.arkivRequests.set(requestKey, {
    entityKey: requestKey, owner: addr("a"), pairId: t.pairId, kind: "export", createdAt: t.state.now,
  });
  const req = await t.call(USER, "POST", `/exports/${created.body.exportId}/request`, { requestKey });
  assertEquals(req.status, 200);
  return { exportId: created.body.exportId as string, nonce: created.body.nonce as string, requestKey };
}

const allow = (t: Awaited<ReturnType<typeof setup>>, requestKey: string, hash: string) =>
  t.decide(requestKey, { intentHash: hash, expiresAt: new Date(t.state.now.getTime() + HOUR) });

const poll = (t: Awaited<ReturnType<typeof setup>>, id: string) => t.call(USER, "POST", `/exports/${id}/approval`);

Deno.test("export: ask, trustee allows, the page claims it once", async () => {
  const t = await setup();
  const e = await askExport(t);
  assertEquals(t.state.pushes.at(-1)?.message.body, "They want to export their wallet key.");
  assertEquals((await poll(t, e.exportId)).body.status, "awaiting_trustee");
  // The export page can't open anything yet.
  assertEquals((await t.call(USER, "POST", "/exports/claim")).body.error, "export_not_allowed");

  allow(t, e.requestKey, exportIntentHash(addr("a"), e.nonce));
  const res = await poll(t, e.exportId);
  assertEquals(res.body.status, "allowed");
  assertEquals(res.body.validUntil, new Date(t.state.now.getTime() + HOUR).toISOString());

  const claim = await t.call(USER, "POST", "/exports/claim");
  assertEquals(claim.body.exportId, e.exportId);
  // Single use.
  assertEquals((await t.call(USER, "POST", "/exports/claim")).body.error, "export_not_allowed");
  assertEquals((await poll(t, e.exportId)).body.status, "used");
});

Deno.test("export: deny never lets the page open it", async () => {
  const t = await setup();
  const e = await askExport(t);
  t.decide(e.requestKey, { verdict: "deny" });
  assertEquals((await poll(t, e.exportId)).body.status, "denied");
  assertEquals((await t.call(USER, "POST", "/exports/claim")).status, 409);
});

Deno.test("export: a payment-shaped Allow or another wallet's hash is rejected", async () => {
  const t = await setup();
  const e = await askExport(t);
  allow(t, e.requestKey, intentHash(addr("a"), 0n, e.nonce));
  assertEquals((await poll(t, e.exportId)).body.error, "intent_mismatch");

  const t2 = await setup();
  const e2 = await askExport(t2);
  allow(t2, e2.requestKey, exportIntentHash(addr("9"), e2.nonce));
  assertEquals((await poll(t2, e2.exportId)).body.error, "intent_mismatch");
});

Deno.test("export: an Allow written by another key is ignored", async () => {
  const t = await setup();
  const e = await askExport(t);
  t.decide(e.requestKey, { owner: addr("7"), intentHash: exportIntentHash(addr("a"), e.nonce) });
  assertEquals((await poll(t, e.exportId)).body.status, "awaiting_trustee");
});

Deno.test("export: the Allow can't be claimed after its hour", async () => {
  const t = await setup();
  const e = await askExport(t);
  allow(t, e.requestKey, exportIntentHash(addr("a"), e.nonce));
  assertEquals((await poll(t, e.exportId)).body.status, "allowed");
  t.state.now = new Date(t.state.now.getTime() + HOUR + MIN);
  assertEquals((await t.call(USER, "POST", "/exports/claim")).body.error, "export_not_allowed");
});

Deno.test("export: no answer in 24 hours expires the request", async () => {
  const t = await setup();
  const e = await askExport(t);
  t.state.now = new Date(t.state.now.getTime() + 24 * HOUR + MIN);
  assertEquals((await poll(t, e.exportId)).body.status, "expired");
});

Deno.test("export: the request must be the user's own, for their pair, of kind export", async () => {
  const t = await setup();
  const created = await t.call(USER, "POST", "/exports");
  const attach = (k: string) => t.call(USER, "POST", `/exports/${created.body.exportId}/request`, { requestKey: k });
  t.state.arkivRequests.set(hex32("2"), { entityKey: hex32("2"), owner: addr("9"), pairId: t.pairId, kind: "export", createdAt: t.state.now });
  assertEquals((await attach(hex32("2"))).body.error, "request_not_yours");
  t.state.arkivRequests.set(hex32("3"), { entityKey: hex32("3"), owner: addr("a"), pairId: t.pairId, kind: "payment", createdAt: t.state.now });
  assertEquals((await attach(hex32("3"))).body.error, "request_wrong_kind");
  t.state.arkivRequests.set(hex32("4"), { entityKey: hex32("4"), owner: addr("a"), pairId: hex32("5"), kind: "export", createdAt: t.state.now });
  assertEquals((await attach(hex32("4"))).body.error, "request_pair_mismatch");
});

Deno.test("export: needs an active trustee", async () => {
  const t = await setup();
  t.repo.pairs.forEach((p) => (p.status = "revoked"));
  assertEquals((await t.call(USER, "POST", "/exports")).body.error, "no_active_trustee");
});

Deno.test("export: the trustee's app records the answer and the user is told", async () => {
  const t = await setup();
  const e = await askExport(t);
  allow(t, e.requestKey, exportIntentHash(addr("a"), e.nonce));
  const res = await t.call(TRUSTEE, "POST", "/trustee/decisions", { pairId: t.pairId, requestKey: e.requestKey });
  assertEquals(res.body.status, "allowed");
  assertEquals(t.state.pushes.at(-1)?.message.data.type, "export_answered");
  // PAIR_KEY is the pair's key; the decision came from it.
  assertEquals(t.state.arkivDecisions[0]?.owner, PAIR_KEY);
});
