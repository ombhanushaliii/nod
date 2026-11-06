import { assertEquals } from "@std/assert";
import { addr, hex32 } from "./helpers.ts";
import { HOUR, setup, TRUSTEE, USER } from "./flow.ts";

const setRules = (t: Awaited<ReturnType<typeof setup>>, who: string, body: unknown, pairId = t.pairId) =>
  t.call(who, "PATCH", `/trustee/users/${pairId}/rules`, body);

Deno.test("user sees the default rules, the fixed $10 cap, and that only the trustee edits", async () => {
  const t = await setup();
  const res = await t.call(USER, "GET", "/rules");
  assertEquals(res.status, 200);
  assertEquals(res.body.amountLimit, "100");
  assertEquals(res.body.notifyMode, "first_per_payee");
  assertEquals(res.body.firstPaymentCap, "10");
  assertEquals(res.body.editableBy, "trustee");
  assertEquals(res.body.setByTrustee, false);
  assertEquals(res.body.history, []);
});

Deno.test("the user can't change their rules, not even to tighten them", async () => {
  const t = await setup();
  const res = await t.call(USER, "PATCH", "/rules", { amountLimit: "5" });
  assertEquals(res.status, 403);
  assertEquals(res.body.error, "rules_trustee_only");
  // Nor through the trustee route for their own pair.
  assertEquals((await setRules(t, USER, { amountLimit: "5" })).status, 404);
  assertEquals((await t.call(USER, "GET", "/rules")).body.amountLimit, "100");
});

Deno.test("trustee lists who they protect", async () => {
  const t = await setup();
  const res = await t.call(TRUSTEE, "GET", "/trustee/users");
  assertEquals(res.body.users, [{ pairId: t.pairId, walletAddress: addr("a"), pairKeyAddress: addr("c"), username: null, amountLimit: "100", notifyMode: "first_per_payee" }]);
  assertEquals((await t.call(USER, "GET", "/trustee/users")).body.users, []);
});

Deno.test("trustee loosens the limit: applies at once, user sees it in history", async () => {
  const t = await setup();
  const res = await setRules(t, TRUSTEE, { amountLimit: "250.5" });
  assertEquals(res.status, 200);
  assertEquals(res.body, { amountLimit: "250.5", notifyMode: "first_per_payee" });

  t.state.now = new Date(t.state.now.getTime() + HOUR);
  await setRules(t, TRUSTEE, { notifyMode: "every_time" });

  const view = (await t.call(USER, "GET", "/rules")).body;
  assertEquals(view.amountLimit, "250.5");
  assertEquals(view.notifyMode, "every_time");
  assertEquals(view.setByTrustee, true);
  assertEquals(view.history.length, 2);
  assertEquals(view.history[0].from, { amountLimit: "250.5", notifyMode: "first_per_payee" });
  assertEquals(view.history[0].to, { amountLimit: "250.5", notifyMode: "every_time" });
  assertEquals(view.history[1].from.amountLimit, "100");
});

Deno.test("a new limit is used by the next payment check", async () => {
  const t = await setup();
  t.markPaid(addr("9"));
  assertEquals((await t.call(USER, "POST", "/payments/check", { to: addr("9"), amount: "150" })).body.verdict, "needs_trustee");
  await setRules(t, TRUSTEE, { amountLimit: "200" });
  assertEquals((await t.call(USER, "POST", "/payments/check", { to: addr("9"), amount: "150" })).body.verdict, "safe");
  await setRules(t, TRUSTEE, { amountLimit: "20" });
  assertEquals((await t.call(USER, "POST", "/payments/check", { to: addr("9"), amount: "50" })).body.reasons, ["over_limit"]);
});

Deno.test("setting the same values again adds no history", async () => {
  const t = await setup();
  await setRules(t, TRUSTEE, { amountLimit: "100", notifyMode: "first_per_payee" });
  assertEquals((await t.call(USER, "GET", "/rules")).body.history, []);
});

Deno.test("trustee input is validated", async () => {
  const t = await setup();
  assertEquals((await setRules(t, TRUSTEE, {})).body.error, "nothing_to_change");
  assertEquals((await setRules(t, TRUSTEE, { amountLimit: "0" })).body.error, "invalid_amount");
  assertEquals((await setRules(t, TRUSTEE, { amountLimit: "1.1234567" })).body.error, "invalid_amount");
  assertEquals((await setRules(t, TRUSTEE, { notifyMode: "never" })).status, 422);
  assertEquals((await setRules(t, TRUSTEE, { amountLimit: "5", extra: 1 })).status, 422);
  assertEquals((await setRules(t, TRUSTEE, { amountLimit: "5" }, "nope")).body.error, "not_your_pair");
  assertEquals((await setRules(t, TRUSTEE, { amountLimit: "5" }, hex32("9"))).body.error, "not_your_pair");
});

Deno.test("someone who isn't the trustee can't change the rules", async () => {
  const t = await setup();
  const STRANGER = "did:privy:stranger";
  t.privyWallets.set(STRANGER, [addr("5")]);
  await t.call(STRANGER, "POST", "/onboarding/user", { walletAddress: addr("5") });
  const res = await setRules(t, STRANGER, { amountLimit: "5000" });
  assertEquals(res.status, 404);
  assertEquals((await t.call(USER, "GET", "/rules")).body.amountLimit, "100");
});

Deno.test("trustee sees each person's @handle, made from their email like the app does", async () => {
  const t = await setup();
  t.privyEmails.set(USER, "Yash.Joisar.me@gmail.com");
  const res = await t.call(TRUSTEE, "GET", "/trustee/users");
  assertEquals(res.body.users[0].username, "yashjoisarme");
});

const MINUTE = 60 * 1000;

Deno.test("rate limit: 5 rule changes in 10 minutes, the 6th waits", async () => {
  const t = await setup();
  for (const [i, limit] of ["110", "120", "130", "140", "150"].entries()) {
    t.state.now = new Date(t.state.now.getTime() + MINUTE); // minutes 1..5
    assertEquals((await setRules(t, TRUSTEE, { amountLimit: limit })).status, 200, `change ${i + 1}`);
  }
  const pushesBefore = t.state.pushes.length;

  t.state.now = new Date(t.state.now.getTime() + MINUTE); // minute 6
  const sixth = await setRules(t, TRUSTEE, { notifyMode: "every_time" });
  assertEquals(sixth.status, 429);
  assertEquals(sixth.body.error, "too_many_rule_changes");
  // The oldest change (minute 1) frees up at minute 11: 5 minutes from now.
  assertEquals(sixth.body.message, "You can change these rules 5 times in 10 minutes. Try again in 5 min.");
  assertEquals(sixth.body.retryAt, new Date(t.state.now.getTime() + 5 * MINUTE).toISOString());

  // Nothing changed, nothing was pushed, and the history has 5 entries.
  const view = (await t.call(USER, "GET", "/rules")).body;
  assertEquals([view.amountLimit, view.notifyMode, view.history.length], ["150", "first_per_payee", 5]);
  assertEquals(t.state.pushes.length, pushesBefore);

  // Saving the same values isn't a change, so it still goes through.
  assertEquals((await setRules(t, TRUSTEE, { amountLimit: "150" })).status, 200);
});

Deno.test("rate limit: the window slides, so changes come back one at a time", async () => {
  const t = await setup();
  const start = t.state.now.getTime();
  for (const limit of ["110", "120", "130", "140", "150"]) {
    assertEquals((await setRules(t, TRUSTEE, { amountLimit: limit })).status, 200);
  }
  // All 5 at minute 0: still blocked just before minute 10, free just after.
  t.state.now = new Date(start + 10 * MINUTE - 1000);
  assertEquals((await setRules(t, TRUSTEE, { amountLimit: "160" })).status, 429);
  t.state.now = new Date(start + 10 * MINUTE + 1000);
  assertEquals((await setRules(t, TRUSTEE, { amountLimit: "160" })).status, 200);
  assertEquals((await setRules(t, TRUSTEE, { amountLimit: "170" })).status, 200);
});
