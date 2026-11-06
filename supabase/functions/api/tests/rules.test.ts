import { assertEquals } from "@std/assert";
import { decide, formatUsdc, lookAlikeOf, parseUsdc, type RuleInput } from "../lib/rules.ts";

const NOW = new Date("2026-11-06T10:00:00Z");
const HOUR = 3600 * 1000;
const usdc = (n: number) => BigInt(Math.round(n * 1_000_000));

const knownPayee = { firstAttemptAt: new Date(NOW.getTime() - 48 * HOUR), firstPaidAt: new Date(NOW.getTime() - 47 * HOUR), overLimitApprovedAt: null };
const newPayee = (hoursAgo: number) => ({ firstAttemptAt: new Date(NOW.getTime() - hoursAgo * HOUR), firstPaidAt: null, overLimitApprovedAt: null });

const base = (o: Partial<RuleInput> = {}): RuleInput => ({
  amount: usdc(5), now: NOW, firstPaymentDone: true,
  amountLimit: usdc(100), notifyMode: "first_per_payee",
  payee: knownPayee, flags: [], sentToPayee: 0n, ...o,
});

Deno.test("1. first payment over $10 is refused", () => {
  assertEquals(decide(base({ firstPaymentDone: false, amount: usdc(10.000001) })).verdict, "refused");
});

Deno.test("1. first payment of exactly $10 is allowed past rule 1", () => {
  assertEquals(decide(base({ firstPaymentDone: false, amount: usdc(10) })).verdict, "safe");
});

Deno.test("1. refusal wins even when the payee is flagged", () => {
  const r = decide(base({ firstPaymentDone: false, amount: usdc(50), flags: ["scam_report"] }));
  assertEquals(r.verdict, "refused");
});

Deno.test("2. flagged known payee needs the trustee", () => {
  const r = decide(base({ flags: ["scam_report"] }));
  assertEquals(r, { verdict: "needs_trustee", reasons: ["scam_report"], unlockAt: null });
});

Deno.test("2. flagged new payee: trustee, cooldown comes after the Allow", () => {
  const r = decide(base({ flags: ["look_alike"], payee: newPayee(30) }));
  assertEquals(r.verdict, "needs_trustee");
  assertEquals(r.reasons, ["look_alike", "new_payee"]);
});

Deno.test("3. over the limit needs the trustee", () => {
  assertEquals(decide(base({ amount: usdc(100.01) })).reasons, ["over_limit"]);
});

Deno.test("3. exactly at the limit is fine", () => {
  assertEquals(decide(base({ amount: usdc(100) })).verdict, "safe");
});

Deno.test("3. first_per_payee: already-approved payee skips the trustee", () => {
  const payee = { ...knownPayee, overLimitApprovedAt: new Date(NOW.getTime() - HOUR) };
  assertEquals(decide(base({ amount: usdc(500), payee })).verdict, "safe");
});

Deno.test("3. every_time: approved payee still needs the trustee", () => {
  const payee = { ...knownPayee, overLimitApprovedAt: new Date(NOW.getTime() - HOUR) };
  assertEquals(decide(base({ amount: usdc(500), payee, notifyMode: "every_time" })).verdict, "needs_trustee");
});

Deno.test("3. trustee-set lower limit applies", () => {
  assertEquals(decide(base({ amount: usdc(30), amountLimit: usdc(25) })).verdict, "needs_trustee");
});

Deno.test("4. new clean payee: over $10 waits 24h from first attempt", () => {
  const r = decide(base({ amount: usdc(15), payee: newPayee(2) }));
  assertEquals(r.verdict, "cooldown");
  assertEquals(r.unlockAt, new Date(NOW.getTime() + 22 * HOUR));
  assertEquals(r.newPayeeLeft, usdc(10));
});

Deno.test("4. new clean payee: up to $10 in total goes right away", () => {
  assertEquals(decide(base({ amount: usdc(5), payee: newPayee(2) })).verdict, "safe");
  assertEquals(decide(base({ amount: usdc(10), payee: newPayee(2) })).verdict, "safe");
  // $6 already going to them leaves $4.
  assertEquals(decide(base({ amount: usdc(4), payee: newPayee(2), sentToPayee: usdc(6) })).verdict, "safe");
  const over = decide(base({ amount: usdc(5), payee: newPayee(2), sentToPayee: usdc(6) }));
  assertEquals(over.verdict, "cooldown");
  assertEquals(over.newPayeeLeft, usdc(4));
  assertEquals(decide(base({ amount: usdc(1), payee: newPayee(2), sentToPayee: usdc(10) })).newPayeeLeft, 0n);
});

Deno.test("4. a small payment doesn't make a payee known in their first day", () => {
  const paidALittle = { firstAttemptAt: new Date(NOW.getTime() - 2 * HOUR), firstPaidAt: new Date(NOW.getTime() - HOUR), overLimitApprovedAt: null };
  const r = decide(base({ amount: usdc(50), payee: paidALittle, sentToPayee: usdc(5) }));
  assertEquals(r.verdict, "cooldown");
  assertEquals(r.newPayeeLeft, usdc(5));
  // Flagged in that window, it still gets the 24h wait after the trustee's Allow.
  assertEquals(decide(base({ payee: paidALittle, sentToPayee: usdc(5), flags: ["look_alike"] })).reasons, ["look_alike", "new_payee"]);
});

Deno.test("4. new payee after 24h is safe", () => {
  assertEquals(decide(base({ amount: usdc(50), payee: newPayee(24) })).verdict, "safe");
});

Deno.test("4. brand-new user's first $10 to a new payee goes right away", () => {
  assertEquals(decide(base({ firstPaymentDone: false, amount: usdc(10), payee: newPayee(0) })).verdict, "safe");
});

Deno.test("parseUsdc", () => {
  assertEquals(parseUsdc("12.5"), 12_500_000n);
  assertEquals(parseUsdc("0.000001"), 1n);
  assertEquals(parseUsdc("100"), 100_000_000n);
  for (const bad of ["0", "-1", "1.0000001", "1e3", "abc", "", "1,5"]) assertEquals(parseUsdc(bad), null, bad);
});

Deno.test("formatUsdc", () => {
  assertEquals(formatUsdc(12_500_000n), "12.5");
  assertEquals(formatUsdc(100_000_000n), "100");
  assertEquals(formatUsdc(1n), "0.000001");
});

Deno.test("lookAlikeOf catches address poisoning", () => {
  const real = "0x1234aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa5678";
  const fake = "0x1234bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb5678";
  assertEquals(lookAlikeOf(fake, [real]), real);
  assertEquals(lookAlikeOf(real, [real]), null);
  assertEquals(lookAlikeOf("0x9999bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb5678", [real]), null);
});
