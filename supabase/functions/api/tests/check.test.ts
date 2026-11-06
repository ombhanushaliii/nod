import { assertEquals } from "@std/assert";
import { addr, hex32, makeTestApp } from "./helpers.ts";

const USER = "did:privy:user";
const TRUSTEE = "did:privy:trustee";
const NEWCOMER = "did:privy:newcomer";

// An address the user paid, and a copy that keeps its first 4 and last 4 characters.
const PAID = `0x1234${"0".repeat(32)}5678`;
const COPY = `0x1234${"f".repeat(32)}5678`;

// A user with an active trustee, who has paid PAID before.
async function paired() {
  const t = makeTestApp();
  t.privyWallets.set(USER, [addr("a")]);
  t.privyWallets.set(TRUSTEE, [addr("b")]);
  await t.call(USER, "POST", "/onboarding/user", { walletAddress: addr("a") });
  await t.call(TRUSTEE, "POST", "/onboarding/user", { walletAddress: addr("b") });
  await t.call(USER, "POST", "/onboarding/invite", { trusteeEmail: "t@example.com" });
  const token = t.mails[0].url.replace("guardian://invite/", "");
  assertEquals((await t.call(TRUSTEE, "POST", "/pairs/accept", { token, pairKeyAddress: addr("c"), encPubKey: hex32("e") })).status, 200);
  const user = t.repo.users.find((u) => u.wallet_address === addr("a"))!;
  t.repo.payees.set(`${user.id}|${PAID}`, { firstAttemptAt: new Date(0), firstPaidAt: new Date(0), overLimitApprovedAt: null });
  return t;
}

Deno.test("address check: needs sign-in, and a real address", async () => {
  const t = makeTestApp();
  assertEquals((await t.call(null, "GET", `/address-check/${addr("d")}`)).status, 401);
  const bad = await t.call(NEWCOMER, "GET", "/address-check/0x123");
  assertEquals(bad.status, 422);
  assertEquals(bad.body.error, "invalid_address");
});

Deno.test("address check: nothing found is clear, even before the account is set up", async () => {
  const t = makeTestApp();
  const res = await t.call(NEWCOMER, "GET", `/address-check/${addr("D")}`);
  assertEquals(res.status, 200);
  assertEquals(res.body, { address: addr("d"), verdict: "clear", reasons: [], paidBefore: false, goplusChecked: true });
});

Deno.test("address check: verified reports and GoPlus labels are danger, in the payment check's words", async () => {
  const t = makeTestApp();
  t.state.reports.set(addr("d"), { verified: 2, unverified: 1, categories: ["phishing"] });
  t.state.goplus.set(addr("d"), { flagged: ["stealing_attack"] });
  const res = await t.call(NEWCOMER, "GET", `/address-check/${addr("d")}`);
  assertEquals(res.body.verdict, "danger");
  assertEquals(res.body.reasons, ["scam_report", "reported:phishing", "goplus:stealing_attack"]);
});

Deno.test("address check: an unverified report, or GoPlus being down, is caution", async () => {
  const t = makeTestApp();
  t.state.reports.set(addr("d"), { verified: 0, unverified: 3 });
  t.state.goplus.set(addr("e"), { unavailable: true });
  const unverified = await t.call(NEWCOMER, "GET", `/address-check/${addr("d")}`);
  assertEquals(unverified.body.verdict, "caution");
  assertEquals(unverified.body.reasons, ["unverified_scam_report"]);
  const down = await t.call(NEWCOMER, "GET", `/address-check/${addr("e")}`);
  assertEquals(down.body.verdict, "caution");
  assertEquals(down.body.reasons, ["risk_check_unavailable"]);
  assertEquals(down.body.goplusChecked, false);
});

Deno.test("address check: a trustee sees copies of addresses their people paid, and ones they paid before", async () => {
  const t = await paired();
  const copy = await t.call(TRUSTEE, "GET", `/address-check/${COPY}`);
  assertEquals(copy.body.verdict, "danger");
  assertEquals(copy.body.reasons, ["look_alike"]);
  assertEquals(copy.body.paidBefore, false);

  const known = await t.call(TRUSTEE, "GET", `/address-check/${PAID.toUpperCase().replace("0X", "0x")}`);
  assertEquals(known.body.verdict, "clear");
  assertEquals(known.body.paidBefore, true);

  // Someone else's payees stay private: a non-trustee gets no look-alike.
  assertEquals((await t.call(NEWCOMER, "GET", `/address-check/${COPY}`)).body.verdict, "clear");
});
