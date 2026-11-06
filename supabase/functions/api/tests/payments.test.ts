import { assert, assertEquals } from "@std/assert";
import { addr, makeTestApp } from "./helpers.ts";

const USER = "did:privy:user";
const HOUR = 3600 * 1000;

async function setup({ firstPaymentDone = true } = {}) {
  const t = makeTestApp();
  t.privyWallets.set(USER, [addr("a")]);
  await t.call(USER, "POST", "/onboarding/user", { walletAddress: addr("a") });
  const user = t.repo.users[0];
  if (firstPaymentDone) {
    t.repo.payments.push({
      id: "old", userId: user.id, toAddress: addr("f"), amount: 1n, verdict: "safe",
      reasons: [], status: "sent", unlockAt: null, nonce: "0x0", approvalId: null, createdAt: new Date(0),
    });
  }
  const check = (to: string, amount: string) => t.call(USER, "POST", "/payments/check", { to, amount });
  // Mark a payee as already paid long ago.
  const markPaid = (a: string) =>
    t.repo.payees.set(`${user.id}|${a}`, {
      firstAttemptAt: new Date(t.state.now.getTime() - 72 * HOUR),
      firstPaidAt: new Date(t.state.now.getTime() - 71 * HOUR),
      overLimitApprovedAt: null,
    });
  return { ...t, user, check, markPaid };
}

Deno.test("needs onboarding", async () => {
  const t = makeTestApp();
  assertEquals((await t.call(USER, "POST", "/payments/check", { to: addr("b"), amount: "1" })).status, 403);
});

Deno.test("validates input", async () => {
  const t = await setup();
  assertEquals((await t.check(addr("b"), "1.0000001")).body.error, "invalid_amount");
  assertEquals((await t.check("0x12", "1")).status, 422);
  assertEquals((await t.check(addr("a"), "1")).body.error, "self_payment");
});

Deno.test("known clean payee under the limit is safe and stored as ready", async () => {
  const t = await setup();
  t.markPaid(addr("b"));
  const res = await t.check(addr("B"), "50");
  assertEquals(res.status, 200);
  assertEquals(res.body.verdict, "safe");
  assertEquals(res.body.amount, "50");
  const row = t.repo.payments.find((p) => p.id === res.body.paymentId)!;
  assertEquals(row.status, "ready");
  assertEquals(row.toAddress, addr("b"));
  assertEquals(row.amount, 50_000_000n);
  assertEquals(row.nonce, res.body.nonce);
});

Deno.test("first-ever payment over $10 is refused", async () => {
  const t = await setup({ firstPaymentDone: false });
  t.markPaid(addr("b"));
  const res = await t.check(addr("b"), "10.01");
  assertEquals(res.body.verdict, "refused");
  assertEquals(t.repo.payments.at(-1)!.status, "refused");
});

Deno.test("new payee: over $10 waits from the first attempt, then safe after 24h", async () => {
  const t = await setup();
  const first = await t.check(addr("c"), "15");
  assertEquals(first.body.verdict, "cooldown");
  assertEquals(first.body.unlockAt, new Date(t.state.now.getTime() + 24 * HOUR).toISOString());
  assertEquals(first.body.newPayeeLeft, "10");
  // Trying again later doesn't restart the clock.
  t.state.now = new Date(t.state.now.getTime() + 23 * HOUR);
  assertEquals((await t.check(addr("c"), "15")).body.verdict, "cooldown");
  t.state.now = new Date(t.state.now.getTime() + 1 * HOUR);
  assertEquals((await t.check(addr("c"), "15")).body.verdict, "safe");
});

Deno.test("new payee: up to $10 in total goes in the first 24h, the rest waits", async () => {
  const t = await setup();
  const MIN = 60 * 1000;
  const small = await t.check(addr("c"), "6");
  assertEquals(small.body.verdict, "safe");
  assertEquals(small.body.newPayeeLeft, null);
  // The $6 goes out.
  t.repo.payments.find((p) => p.id === small.body.paymentId)!.status = "sent";
  const more = await t.check(addr("c"), "5");
  assertEquals(more.body.verdict, "cooldown");
  assertEquals(more.body.newPayeeLeft, "4");
  // $4 fits, and a check that can still be sent counts too.
  assertEquals((await t.check(addr("c"), "4")).body.verdict, "safe");
  assertEquals((await t.check(addr("c"), "1")).body.newPayeeLeft, "0");
  // Once that $4 check is too old to send, it no longer counts.
  t.state.now = new Date(t.state.now.getTime() + 11 * MIN);
  assertEquals((await t.check(addr("c"), "4")).body.verdict, "safe");
  // After the first day, no cap.
  t.state.now = new Date(t.state.now.getTime() + 24 * HOUR);
  assertEquals((await t.check(addr("c"), "50")).body.verdict, "safe");
});

Deno.test("verified scam report needs the trustee; unverified only warns", async () => {
  const t = await setup();
  t.markPaid(addr("b"));
  t.markPaid(addr("d"));
  t.state.reports.set(addr("b"), { verified: 2, unverified: 0 });
  t.state.reports.set(addr("d"), { verified: 0, unverified: 3 });
  const bad = await t.check(addr("b"), "5");
  assertEquals(bad.body.verdict, "needs_trustee");
  assertEquals(bad.body.reasons, ["scam_report"]);
  const meh = await t.check(addr("d"), "5");
  assertEquals(meh.body.verdict, "safe");
  assertEquals(meh.body.warnings, ["unverified_scam_report"]);
});

Deno.test("a verified report says what the address is", async () => {
  const t = await setup();
  t.markPaid(addr("b"));
  t.state.reports.set(addr("b"), { verified: 2, unverified: 1, categories: ["sanctioned", "phishing"] });
  const res = await t.check(addr("b"), "5");
  assertEquals(res.body.verdict, "needs_trustee");
  assertEquals(res.body.reasons, ["scam_report", "reported:sanctioned", "reported:phishing"]);
});

Deno.test("GoPlus flags and outages both go to the trustee", async () => {
  const t = await setup();
  t.markPaid(addr("b"));
  t.markPaid(addr("d"));
  t.state.goplus.set(addr("b"), { flagged: ["sanctioned", "stealing_attack"] });
  t.state.goplus.set(addr("d"), { unavailable: true });
  assertEquals((await t.check(addr("b"), "5")).body.reasons, ["goplus:sanctioned", "goplus:stealing_attack"]);
  assertEquals((await t.check(addr("d"), "5")).body.reasons, ["risk_check_unavailable"]);
});

Deno.test("look-alike of a paid address goes to the trustee", async () => {
  const t = await setup();
  const real = "0x1234aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa5678";
  const fake = "0x1234bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb5678";
  t.markPaid(real);
  const res = await t.check(fake, "5");
  assertEquals(res.body.verdict, "needs_trustee");
  assertEquals(res.body.reasons, ["look_alike", "new_payee"]);
  assertEquals(res.body.lookAlikeOf, real);
  assertEquals(t.repo.payments.at(-1)!.status, "checked");
});

Deno.test("over the default $100 limit needs the trustee", async () => {
  const t = await setup();
  t.markPaid(addr("b"));
  const res = await t.check(addr("b"), "100.50");
  assertEquals(res.body.verdict, "needs_trustee");
  assertEquals(res.body.reasons, ["over_limit"]);
  assert(typeof res.body.nonce === "string" && res.body.nonce.length === 66);
});

Deno.test("reports whether the trustee is active", async () => {
  const t = await setup();
  t.markPaid(addr("b"));
  assertEquals((await t.check(addr("b"), "1")).body.trusteeActive, false);
});
