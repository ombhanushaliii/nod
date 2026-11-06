import { assertEquals } from "@std/assert";
import { addr, hex32 } from "./helpers.ts";
import { HOUR, MIN, setup, TRUSTEE, USER } from "./flow.ts";

Deno.test("allow for a known payee: ready now, usable for 1h", async () => {
  const t = await setup();
  t.markPaid(addr("9"));
  const p = await t.askTrustee(addr("9"), "150");
  assertEquals((await t.poll(p.paymentId)).body.status, "awaiting_trustee");

  t.decide(p.requestKey, { to: addr("9"), amount: 150_000_000n, nonce: p.nonce });
  const res = await t.poll(p.paymentId);
  assertEquals(res.body.status, "ready");
  assertEquals(res.body.unlockAt, t.state.now.toISOString());
  assertEquals(res.body.validUntil, new Date(t.state.now.getTime() + HOUR).toISOString());
  // Polling again just reports the stored status.
  assertEquals((await t.poll(p.paymentId)).body.status, "ready");
});

Deno.test("allow for a new payee: 24h cooldown from the Allow, even if the trustee app says sooner", async () => {
  const t = await setup();
  const p = await t.askTrustee(addr("8"), "150"); // flagged by over_limit + new payee
  t.decide(p.requestKey, { to: addr("8"), amount: 150_000_000n, nonce: p.nonce, validFrom: t.state.now });
  const res = await t.poll(p.paymentId);
  assertEquals(res.body.status, "cooling_down");
  assertEquals(res.body.unlockAt, new Date(t.state.now.getTime() + 24 * HOUR).toISOString());
  assertEquals(res.body.validUntil, new Date(t.state.now.getTime() + 25 * HOUR).toISOString());
});

Deno.test("deny marks the payment denied", async () => {
  const t = await setup();
  t.markPaid(addr("9"));
  const p = await t.askTrustee(addr("9"), "150");
  t.decide(p.requestKey, { verdict: "deny" });
  assertEquals((await t.poll(p.paymentId)).body.status, "denied");
});

Deno.test("an Allow for a different amount or recipient is rejected", async () => {
  const t = await setup();
  t.markPaid(addr("9"));
  const p = await t.askTrustee(addr("9"), "150");
  t.decide(p.requestKey, { to: addr("9"), amount: 999_000_000n, nonce: p.nonce });
  const res = await t.poll(p.paymentId);
  assertEquals(res.status, 409);
  assertEquals(res.body.error, "intent_mismatch");
  assertEquals(t.repo.payments.find((x) => x.id === p.paymentId)!.status, "awaiting_trustee");
});

Deno.test("a decision written by any other key is ignored", async () => {
  const t = await setup();
  t.markPaid(addr("9"));
  const p = await t.askTrustee(addr("9"), "150");
  t.decide(p.requestKey, { owner: addr("7"), to: addr("9"), amount: 150_000_000n, nonce: p.nonce });
  assertEquals((await t.poll(p.paymentId)).body.status, "awaiting_trustee");
});

Deno.test("a decision for another pair is rejected", async () => {
  const t = await setup();
  t.markPaid(addr("9"));
  const p = await t.askTrustee(addr("9"), "150");
  t.decide(p.requestKey, { pairId: hex32("5"), to: addr("9"), amount: 150_000_000n, nonce: p.nonce });
  assertEquals((await t.poll(p.paymentId)).body.error, "pair_mismatch");
});

Deno.test("an Allow that already ran out is rejected", async () => {
  const t = await setup();
  t.markPaid(addr("9"));
  const p = await t.askTrustee(addr("9"), "150");
  t.decide(p.requestKey, { to: addr("9"), amount: 150_000_000n, nonce: p.nonce });
  // Nobody polled until the 1h window was over.
  t.state.now = new Date(t.state.now.getTime() + 2 * HOUR);
  assertEquals((await t.poll(p.paymentId)).body.error, "decision_expired");
});

Deno.test("no decision after 30 minutes: expired", async () => {
  const t = await setup();
  t.markPaid(addr("9"));
  const p = await t.askTrustee(addr("9"), "150");
  t.state.now = new Date(t.state.now.getTime() + 29 * MIN);
  assertEquals((await t.poll(p.paymentId)).body.status, "awaiting_trustee");
  t.state.now = new Date(t.state.now.getTime() + 2 * MIN);
  assertEquals((await t.poll(p.paymentId)).body.status, "expired");
});

Deno.test("request: must exist on Arkiv, be the user's, for their pair, and kind payment", async () => {
  const t = await setup();
  t.markPaid(addr("9"));
  const check = await t.call(USER, "POST", "/payments/check", { to: addr("9"), amount: "150" });
  const id = check.body.paymentId;
  const attach = (k: string) => t.call(USER, "POST", `/payments/${id}/request`, { requestKey: k });

  assertEquals((await attach(hex32("2"))).body.error, "request_not_on_arkiv");
  const base = { owner: addr("a"), pairId: t.pairId, kind: "payment" as const, createdAt: t.state.now };
  t.state.arkivRequests.set(hex32("3"), { ...base, entityKey: hex32("3"), owner: addr("7") });
  assertEquals((await attach(hex32("3"))).body.error, "request_not_yours");
  t.state.arkivRequests.set(hex32("4"), { ...base, entityKey: hex32("4"), pairId: hex32("5") });
  assertEquals((await attach(hex32("4"))).body.error, "request_pair_mismatch");
  t.state.arkivRequests.set(hex32("6"), { ...base, entityKey: hex32("6"), kind: "export" });
  assertEquals((await attach(hex32("6"))).body.error, "request_wrong_kind");
});

Deno.test("request: only for payments that need the trustee, and only once", async () => {
  const t = await setup();
  t.markPaid(addr("9"));
  const safe = await t.call(USER, "POST", "/payments/check", { to: addr("9"), amount: "5" });
  t.state.arkivRequests.set(hex32("2"), { entityKey: hex32("2"), owner: addr("a"), pairId: t.pairId, kind: "payment", createdAt: t.state.now });
  assertEquals((await t.call(USER, "POST", `/payments/${safe.body.paymentId}/request`, { requestKey: hex32("2") })).body.error, "trustee_not_needed");

  const p = await t.askTrustee(addr("9"), "150");
  assertEquals((await t.call(USER, "POST", `/payments/${p.paymentId}/request`, { requestKey: hex32("2") })).body.error, "already_requested");
});

Deno.test("another user can't touch my payment", async () => {
  const t = await setup();
  t.markPaid(addr("9"));
  const p = await t.askTrustee(addr("9"), "150");
  assertEquals((await t.call(TRUSTEE, "POST", `/payments/${p.paymentId}/approval`)).status, 404);
});

Deno.test("a backdated Allow can't shorten the new-payee wait: it counts from when the request arrived", async () => {
  const t = await setup();
  const p = await t.askTrustee(addr("8"), "150"); // new payee + over limit
  const attachedAt = t.state.now;
  t.state.now = new Date(t.state.now.getTime() + 10 * MIN);
  t.decide(p.requestKey, {
    to: addr("8"), amount: 150_000_000n, nonce: p.nonce,
    // Claims to be from a day ago, before the request even existed.
    createdAt: new Date(attachedAt.getTime() - 24 * HOUR),
    expiresAt: new Date(t.state.now.getTime() + 25 * HOUR),
  });
  const res = await t.poll(p.paymentId);
  assertEquals(res.body.status, "cooling_down");
  assertEquals(res.body.unlockAt, new Date(attachedAt.getTime() + 24 * HOUR).toISOString());
});

Deno.test("the trustee app reports its decision: recorded at once, and the user is pushed", async () => {
  const t = await setup();
  t.markPaid(addr("9"));
  await t.call(USER, "POST", "/push/register", { expoToken: "ExponentPushToken[user]" });
  const p = await t.askTrustee(addr("9"), "150");
  t.state.pushes.length = 0;

  // Nothing on Arkiv yet: still waiting, nobody pushed.
  const early = await t.call(TRUSTEE, "POST", "/trustee/decisions", { pairId: t.pairId, requestKey: p.requestKey });
  assertEquals(early.body.status, "awaiting_trustee");
  assertEquals(t.state.pushes, []);

  t.decide(p.requestKey, { to: addr("9"), amount: 150_000_000n, nonce: p.nonce });
  const res = await t.call(TRUSTEE, "POST", "/trustee/decisions", { pairId: t.pairId, requestKey: p.requestKey });
  assertEquals(res.body.status, "ready");
  assertEquals(t.state.pushes.map((x) => x.message.data.type), ["trustee_answered"]);
  // The user's next poll sees it; telling the backend again pushes nobody.
  assertEquals((await t.poll(p.paymentId)).body.status, "ready");
  await t.call(TRUSTEE, "POST", "/trustee/decisions", { pairId: t.pairId, requestKey: p.requestKey });
  assertEquals(t.state.pushes.length, 1);
});

Deno.test("only the pair's trustee can report a decision", async () => {
  const t = await setup();
  const p = await t.askTrustee(addr("9"), "150");
  const asUser = await t.call(USER, "POST", "/trustee/decisions", { pairId: t.pairId, requestKey: p.requestKey });
  assertEquals(asUser.status, 404);
  const wrongKey = await t.call(TRUSTEE, "POST", "/trustee/decisions", { pairId: t.pairId, requestKey: hex32("7") });
  assertEquals(wrongKey.body.error, "payment_not_found");
});
