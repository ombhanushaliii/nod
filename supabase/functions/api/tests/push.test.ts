import { assertEquals, assertRejects } from "@std/assert";
import { addr, hex32 } from "./helpers.ts";
import { setup, TRUSTEE, USER } from "./flow.ts";
import { EXPO_PUSH_URL, expoPush, MESSAGES } from "../lib/push.ts";

const TOK_U = "ExponentPushToken[user-phone]";
const TOK_T = "ExponentPushToken[trustee-phone]";
const TOK_T2 = "ExpoPushToken[trustee_tablet]";

async function withTokens() {
  const t = await setup();
  await t.call(USER, "POST", "/push/register", { expoToken: TOK_U });
  await t.call(TRUSTEE, "POST", "/push/register", { expoToken: TOK_T });
  await t.call(TRUSTEE, "POST", "/push/register", { expoToken: TOK_T2 });
  t.markPaid(addr("9"));
  return t;
}

Deno.test("register: validates the token, is idempotent", async () => {
  const t = await setup();
  assertEquals((await t.call(USER, "POST", "/push/register", { expoToken: "not-a-token" })).status, 422);
  assertEquals((await t.call(USER, "POST", "/push/register", { expoToken: TOK_U })).status, 200);
  assertEquals((await t.call(USER, "POST", "/push/register", { expoToken: TOK_U })).status, 200);
  assertEquals([...t.repo.pushTokens], [[TOK_U, t.repo.users[0].id]]);
});

Deno.test("register on a shared device moves the token to the new account", async () => {
  const t = await setup();
  await t.call(USER, "POST", "/push/register", { expoToken: TOK_U });
  await t.call(TRUSTEE, "POST", "/push/register", { expoToken: TOK_U });
  assertEquals(t.repo.pushTokens.get(TOK_U), t.repo.users[1].id);
});

Deno.test("unregister removes only your own token", async () => {
  const t = await withTokens();
  await t.call(USER, "POST", "/push/unregister", { expoToken: TOK_T });
  assertEquals(t.repo.pushTokens.has(TOK_T), true);
  await t.call(TRUSTEE, "POST", "/push/unregister", { expoToken: TOK_T });
  assertEquals(t.repo.pushTokens.has(TOK_T), false);
});

Deno.test("attaching a request pushes all the trustee's devices, with no payment details", async () => {
  const t = await withTokens();
  await t.askTrustee(addr("9"), "150");
  assertEquals(t.state.pushes, [{ to: [TOK_T, TOK_T2], message: MESSAGES.approvalRequest(t.pairId) }]);
  // Only the (random) pairId travels in data; the text has no amount or address.
  const { title, body, data } = t.state.pushes[0].message;
  for (const secret of ["150", addr("9"), "0x9"]) assertEquals(`${title} ${body}`.includes(secret), false);
  assertEquals(Object.keys(data).sort(), ["pairId", "type"]);
});

Deno.test("no push when the request is rejected", async () => {
  const t = await withTokens();
  const check = await t.call(USER, "POST", "/payments/check", { to: addr("9"), amount: "150" });
  const res = await t.call(USER, "POST", `/payments/${check.body.paymentId}/request`, { requestKey: hex32("2") });
  assertEquals(res.body.error, "request_not_on_arkiv");
  assertEquals(t.state.pushes, []);
});

Deno.test("Expo being down doesn't fail the request", async () => {
  const t = await withTokens();
  t.state.pushFails = true;
  const p = await t.askTrustee(addr("9"), "150"); // asserts 200 inside
  assertEquals(t.repo.payments.find((x) => x.id === p.paymentId)!.status, "awaiting_trustee");
});

Deno.test("tokens Expo reports dead are deleted", async () => {
  const t = await withTokens();
  t.state.deadTokens = [TOK_T2];
  await t.askTrustee(addr("9"), "150");
  assertEquals(t.repo.pushTokens.has(TOK_T2), false);
  assertEquals(t.repo.pushTokens.has(TOK_T), true);
});

Deno.test("trustee changing the rules pushes the user; a no-op change doesn't", async () => {
  const t = await withTokens();
  await t.call(TRUSTEE, "PATCH", `/trustee/users/${t.pairId}/rules`, { amountLimit: "100" });
  assertEquals(t.state.pushes, []);
  await t.call(TRUSTEE, "PATCH", `/trustee/users/${t.pairId}/rules`, { amountLimit: "300" });
  assertEquals(t.state.pushes, [{ to: [TOK_U], message: MESSAGES.rulesChanged() }]);
});

Deno.test("expoPush: batches of 100, reports DeviceNotRegistered tokens", async () => {
  const calls: unknown[][] = [];
  const push = expoPush({
    fetch: (url, init) => {
      assertEquals(String(url), EXPO_PUSH_URL);
      const msgs = JSON.parse(init!.body as string) as { to: string }[];
      calls.push(msgs);
      return Promise.resolve(Response.json({
        data: msgs.map((m) =>
          m.to.endsWith("[dead]") ? { status: "error", details: { error: "DeviceNotRegistered" } }
          : m.to.endsWith("[rate]") ? { status: "error", details: { error: "MessageRateExceeded" } }
          : { status: "ok", id: "x" }
        ),
      }));
    },
  });
  const tokens = Array.from({ length: 150 }, (_, i) => `ExponentPushToken[t${i}]`);
  tokens[120] = "ExponentPushToken[dead]";
  tokens[3] = "ExponentPushToken[rate]";
  const out = await push.send(tokens, MESSAGES.rulesChanged());
  assertEquals(calls.map((c) => c.length), [100, 50]);
  assertEquals(out.deadTokens, ["ExponentPushToken[dead]"]);
  assertEquals((calls[0][0] as Record<string, unknown>).title, MESSAGES.rulesChanged().title);
});

Deno.test("expoPush: HTTP errors throw", async () => {
  const push = expoPush({ fetch: () => Promise.resolve(new Response("nope", { status: 500 })) });
  await assertRejects(() => push.send(["ExponentPushToken[a]"], MESSAGES.rulesChanged()));
});
