import { assertEquals } from "@std/assert";
import { addr, hex32, makeTestApp } from "./helpers.ts";
import { intentHash } from "../lib/intent.ts";
import type { ArkivDecision } from "../lib/arkiv.ts";

const USER = "did:privy:user";
const TRUSTEE = "did:privy:trustee";
const HOUR = 3600 * 1000;
const MIN = 60 * 1000;
const PAIR_KEY = addr("c");

// User + trustee paired through the real invite endpoints.
async function setup() {
  const t = makeTestApp();
  t.privyWallets.set(USER, [addr("a")]);
  t.privyWallets.set(TRUSTEE, [addr("b")]);
  await t.call(USER, "POST", "/onboarding/user", { walletAddress: addr("a") });
  await t.call(TRUSTEE, "POST", "/onboarding/user", { walletAddress: addr("b") });
  await t.call(USER, "POST", "/onboarding/invite", { trusteeEmail: "t@example.com" });
  const token = t.mails[0].url.replace("guardian://invite/", "");
  const { body } = await t.call(TRUSTEE, "POST", "/pairs/accept", { token, pairKeyAddress: PAIR_KEY, encPubKey: hex32("e") });
  const pairId: string = body.pairId;
  const user = t.repo.users[0];
  // Not the first payment, so the $10 cap is out of the way.
  t.repo.payments.push({
    id: "old", userId: user.id, toAddress: addr("f"), amount: 1n, verdict: "safe", reasons: [],
    status: "sent", unlockAt: null, nonce: "0x0", approvalId: null, createdAt: new Date(0),
  });
  const markPaid = (a: string) =>
    t.repo.payees.set(`${user.id}|${a}`, {
      firstAttemptAt: new Date(t.state.now.getTime() - 72 * HOUR),
      firstPaidAt: new Date(t.state.now.getTime() - 71 * HOUR), overLimitApprovedAt: null,
    });

  // Runs check -> writes a fake Arkiv request -> attaches it.
  async function askTrustee(to: string, amount: string, requestKey = hex32("1")) {
    const check = await t.call(USER, "POST", "/payments/check", { to, amount });
    assertEquals(check.body.verdict, "needs_trustee");
    t.state.arkivRequests.set(requestKey, {
      entityKey: requestKey, owner: addr("a"), pairId, kind: "payment", createdAt: t.state.now,
    });
    const req = await t.call(USER, "POST", `/payments/${check.body.paymentId}/request`, { requestKey });
    assertEquals(req.status, 200);
    return { paymentId: check.body.paymentId as string, nonce: check.body.nonce as string, requestKey };
  }

  function decide(requestKey: string, d: Partial<ArkivDecision> & { to?: string; amount?: bigint; nonce?: string }) {
    const decision: ArkivDecision = {
      entityKey: d.entityKey ?? hex32("d"), owner: d.owner ?? PAIR_KEY, pairId: d.pairId ?? pairId, requestKey,
      verdict: d.verdict ?? "allow",
      intentHash: d.intentHash ?? (d.to ? intentHash(d.to, d.amount!, d.nonce!) : null),
      validFrom: d.validFrom ?? null, createdAt: d.createdAt ?? t.state.now,
      expiresAt: d.expiresAt ?? new Date(t.state.now.getTime() + 25 * HOUR),
    };
    t.state.arkivDecisions.push(decision);
  }

  const poll = (id: string) => t.call(USER, "POST", `/payments/${id}/approval`);
  return { ...t, pairId, markPaid, askTrustee, decide, poll };
}

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
  t.decide(p.requestKey, {
    to: addr("9"), amount: 150_000_000n, nonce: p.nonce,
    createdAt: new Date(t.state.now.getTime() - 2 * HOUR),
  });
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
