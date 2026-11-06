import { assert, assertEquals } from "@std/assert";
import { addr } from "./helpers.ts";
import { HOUR, MIN, setup, USER } from "./flow.ts";
import { SendError } from "../lib/privySigner.ts";

const send = (t: Awaited<ReturnType<typeof setup>>, id: string) => t.call(USER, "POST", `/payments/${id}/send`);
const status = (t: Awaited<ReturnType<typeof setup>>, id: string) => t.repo.payments.find((p) => p.id === id)!.status;

Deno.test("safe payment: sent from the user's Privy wallet, payee marked paid, can't send twice", async () => {
  const t = await setup();
  t.markPaid(addr("9"));
  const check = await t.call(USER, "POST", "/payments/check", { to: addr("9"), amount: "25" });
  assertEquals(check.body.verdict, "safe");

  const res = await send(t, check.body.paymentId);
  assertEquals(res.status, 200);
  assertEquals(res.body.status, "submitted");
  assertEquals(t.state.sent, [{
    walletId: `wallet-${addr("a")}`, to: addr("9"), amount: 25_000_000n, referenceId: check.body.paymentId,
  }]);
  assertEquals(status(t, check.body.paymentId), "submitted");
  assertEquals((await send(t, check.body.paymentId)).body.error, "not_ready");
  assertEquals(t.state.sent.length, 1);
});

Deno.test("safe payment checked over 10 minutes ago must be re-checked", async () => {
  const t = await setup();
  t.markPaid(addr("9"));
  const check = await t.call(USER, "POST", "/payments/check", { to: addr("9"), amount: "25" });
  t.state.now = new Date(t.state.now.getTime() + 11 * MIN);
  assertEquals((await send(t, check.body.paymentId)).body.error, "check_stale");
  assertEquals(t.state.sent.length, 0);
});

Deno.test("new payee without trustee: over $10 is blocked during the wait, re-check after it", async () => {
  const t = await setup();
  const first = await t.call(USER, "POST", "/payments/check", { to: addr("8"), amount: "15" });
  assertEquals(first.body.verdict, "cooldown");
  assertEquals((await send(t, first.body.paymentId)).body.error, "still_cooling_down");
  t.state.now = new Date(t.state.now.getTime() + 24 * HOUR);
  // The old check is a day old: it has to be checked again.
  assertEquals((await send(t, first.body.paymentId)).body.error, "check_stale");
  const again = await t.call(USER, "POST", "/payments/check", { to: addr("8"), amount: "15" });
  assertEquals(again.body.verdict, "safe");
  assertEquals((await send(t, again.body.paymentId)).body.status, "submitted");
});

Deno.test("new payee: up to $10 sends right away", async () => {
  const t = await setup();
  const check = await t.call(USER, "POST", "/payments/check", { to: addr("8"), amount: "10" });
  assertEquals(check.body.verdict, "safe");
  assertEquals((await send(t, check.body.paymentId)).body.status, "submitted");
  assertEquals(t.state.sent.at(-1)!.amount, 10_000_000n);
});

Deno.test("trustee-approved new payee: waits 24h after the Allow, then sends once", async () => {
  const t = await setup();
  const p = await t.askTrustee(addr("8"), "150");
  t.decide(p.requestKey, { to: addr("8"), amount: 150_000_000n, nonce: p.nonce });
  assertEquals((await t.poll(p.paymentId)).body.status, "cooling_down");

  assertEquals((await send(t, p.paymentId)).body.error, "still_cooling_down");
  t.state.now = new Date(t.state.now.getTime() + 24 * HOUR);
  assertEquals((await send(t, p.paymentId)).body.status, "submitted");
  assertEquals(t.state.sent.at(-1)!.amount, 150_000_000n);
  assertEquals((await send(t, p.paymentId)).body.error, "not_ready");
});

Deno.test("an approval has no time limit: sent a week later, once", async () => {
  const t = await setup();
  t.markPaid(addr("9"));
  const p = await t.askTrustee(addr("9"), "150");
  t.decide(p.requestKey, { to: addr("9"), amount: 150_000_000n, nonce: p.nonce });
  await t.poll(p.paymentId);
  t.state.now = new Date(t.state.now.getTime() + 7 * 24 * HOUR);
  assertEquals((await send(t, p.paymentId)).body.status, "submitted");
  // Still single use.
  assertEquals((await send(t, p.paymentId)).status, 409);
});

Deno.test("denied or still-waiting payments can't be sent", async () => {
  const t = await setup();
  t.markPaid(addr("9"));
  const waiting = await t.askTrustee(addr("9"), "150");
  assertEquals((await send(t, waiting.paymentId)).body.error, "not_ready");
  t.decide(waiting.requestKey, { verdict: "deny" });
  await t.poll(waiting.paymentId);
  assertEquals((await send(t, waiting.paymentId)).body.error, "not_ready");
  assertEquals(t.state.sent.length, 0);
});

Deno.test("Privy failure: 502, payment and approval back to usable, retry works", async () => {
  const t = await setup();
  t.markPaid(addr("9"));
  const p = await t.askTrustee(addr("9"), "150");
  t.decide(p.requestKey, { to: addr("9"), amount: 150_000_000n, nonce: p.nonce });
  await t.poll(p.paymentId);

  t.state.sendFails = new SendError("boom", 400);
  const res = await send(t, p.paymentId);
  assertEquals(res.status, 502);
  assertEquals(res.body.message, "Privy refused the transaction.");
  assertEquals(status(t, p.paymentId), "ready");

  t.state.sendFails = null;
  assertEquals((await send(t, p.paymentId)).body.status, "submitted");
});

Deno.test("first_per_payee: after one approved over-limit payment, the next one is safe", async () => {
  const t = await setup();
  t.markPaid(addr("9"));
  const p = await t.askTrustee(addr("9"), "150");
  t.decide(p.requestKey, { to: addr("9"), amount: 150_000_000n, nonce: p.nonce });
  await t.poll(p.paymentId);
  await send(t, p.paymentId);

  const next = await t.call(USER, "POST", "/payments/check", { to: addr("9"), amount: "300" });
  assertEquals(next.body.verdict, "safe");
});

Deno.test("another user can't send my payment", async () => {
  const t = await setup();
  t.markPaid(addr("9"));
  const check = await t.call(USER, "POST", "/payments/check", { to: addr("9"), amount: "25" });
  const res = await t.call("did:privy:trustee", "POST", `/payments/${check.body.paymentId}/send`);
  assertEquals(res.status, 404);
  assert(t.state.sent.length === 0);
});

Deno.test("new payee: checking again replaces an unsent check instead of using up the $10", async () => {
  const t = await setup();
  // Check $10 to someone new, then back out without sending.
  const first = await t.call(USER, "POST", "/payments/check", { to: addr("7"), amount: "10" });
  assertEquals(first.body.verdict, "safe");

  // Trying again (even a smaller amount) is still allowed: the unsent check doesn't count.
  const again = await t.call(USER, "POST", "/payments/check", { to: addr("7"), amount: "10" });
  assertEquals(again.body.verdict, "safe");
  const small = await t.call(USER, "POST", "/payments/check", { to: addr("7"), amount: "1" });
  assertEquals(small.body.verdict, "safe");

  // Only the newest check can be sent, so the $10 can't be spent twice.
  assertEquals((await send(t, first.body.paymentId)).body.error, "not_ready");
  assertEquals((await send(t, again.body.paymentId)).body.error, "not_ready");
  assertEquals((await send(t, small.body.paymentId)).status, 200);

  // What was really sent still counts: $1 sent, so $9 more is fine and $10 waits.
  assertEquals((await t.call(USER, "POST", "/payments/check", { to: addr("7"), amount: "9" })).body.verdict, "safe");
  assertEquals((await t.call(USER, "POST", "/payments/check", { to: addr("7"), amount: "10" })).body.verdict, "cooldown");
});
