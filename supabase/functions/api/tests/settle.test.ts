import { assertEquals } from "@std/assert";
import { addr } from "./helpers.ts";
import { setup, USER } from "./flow.ts";
import { outcomeOf, privySender } from "../lib/privySigner.ts";

const HASH = "0x" + "ab".repeat(32);

async function submitted() {
  const t = await setup();
  t.markPaid(addr("9"));
  const check = await t.call(USER, "POST", "/payments/check", { to: addr("9"), amount: "25" });
  const sent = await t.call(USER, "POST", `/payments/${check.body.paymentId}/send`);
  assertEquals(sent.body.status, "submitted");
  return { t, id: check.body.paymentId as string, txId: sent.body.transactionId as string };
}

Deno.test("still pending at Privy: stays submitted", async () => {
  const { t, id } = await submitted();
  const res = await t.call(USER, "GET", `/payments/${id}`);
  assertEquals(res.body.status, "submitted");
  assertEquals(res.body.txHash, null);
});

Deno.test("confirmed: sent, with hash and explorer link", async () => {
  const { t, id, txId } = await submitted();
  t.state.txOutcomes.set(txId, { outcome: "sent", hash: HASH });
  const res = await t.call(USER, "GET", `/payments/${id}`);
  assertEquals(res.body.status, "sent");
  assertEquals(res.body.txHash, HASH);
  assertEquals(res.body.explorerUrl, `https://sepolia.etherscan.io/tx/${HASH}`);
  assertEquals(res.body.amount, "25");
  // Stored: a later read doesn't need Privy.
  t.state.txLookupFails = true;
  assertEquals((await t.call(USER, "GET", `/payments/${id}`)).body.status, "sent");
});

Deno.test("failed on-chain: failed, and a first payment to that payee is no longer 'paid'", async () => {
  const t = await setup();
  // A new payee, sent after its 24h wait.
  await t.call(USER, "POST", "/payments/check", { to: addr("8"), amount: "5" });
  t.state.now = new Date(t.state.now.getTime() + 24 * 3600 * 1000);
  const check = await t.call(USER, "POST", "/payments/check", { to: addr("8"), amount: "5" });
  const sent = await t.call(USER, "POST", `/payments/${check.body.paymentId}/send`);
  assertEquals(t.repo.payees.get(`${t.repo.users[0].id}|${addr("8")}`)!.firstPaidAt !== null, true);

  t.state.txOutcomes.set(sent.body.transactionId, { outcome: "failed", reason: "execution_reverted" });
  const res = await t.call(USER, "GET", `/payments/${check.body.paymentId}`);
  assertEquals(res.body.status, "failed");
  assertEquals(res.body.failureReason, "execution_reverted");
  assertEquals(t.repo.payees.get(`${t.repo.users[0].id}|${addr("8")}`)!.firstPaidAt, null);
});

Deno.test("Privy down: read still works, stays submitted", async () => {
  const { t, id } = await submitted();
  t.state.txLookupFails = true;
  const res = await t.call(USER, "GET", `/payments/${id}`);
  assertEquals(res.status, 200);
  assertEquals(res.body.status, "submitted");
});

Deno.test("list: newest first, settles submitted ones, only mine", async () => {
  const { t, id, txId } = await submitted();
  t.state.txOutcomes.set(txId, { outcome: "sent", hash: HASH });
  t.state.now = new Date(t.state.now.getTime() + 1000);
  const later = await t.call(USER, "POST", "/payments/check", { to: addr("9"), amount: "1" });
  const res = await t.call(USER, "GET", "/payments?limit=2");
  assertEquals(res.body.payments.map((p: { paymentId: string }) => p.paymentId), [later.body.paymentId, id]);
  assertEquals(res.body.payments[1].status, "sent");
  assertEquals((await t.call("did:privy:trustee", "GET", "/payments")).body.payments, []);
});

Deno.test("unknown or someone else's payment: 404", async () => {
  const { t, id } = await submitted();
  assertEquals((await t.call(USER, "GET", "/payments/not-a-uuid")).status, 404);
  assertEquals((await t.call("did:privy:trustee", "GET", `/payments/${id}`)).status, 404);
});

Deno.test("Privy status mapping", () => {
  assertEquals(outcomeOf("confirmed", HASH.toUpperCase().replace("0X", "0x")), { outcome: "sent", hash: HASH });
  assertEquals(outcomeOf("finalized", HASH), { outcome: "sent", hash: HASH });
  assertEquals(outcomeOf("confirmed", null), { outcome: "pending" });
  for (const s of ["pending", "broadcasted", "replaced"]) assertEquals(outcomeOf(s, HASH), { outcome: "pending" });
  for (const s of ["failed", "execution_reverted", "provider_error"]) {
    assertEquals(outcomeOf(s, null), { outcome: "failed", reason: s });
  }
});

Deno.test("transaction lookup calls Privy's GET /v1/transactions/:id with app auth", async () => {
  let seen: { url: string; headers: Record<string, string> } | undefined;
  const sender = privySender({
    appId: "app1", appSecret: "s1", authorizationKey: "wallet-auth:unused",
    fetch: (url, init) => {
      seen = { url: String(url), headers: init!.headers as Record<string, string> };
      return Promise.resolve(Response.json({ id: "t1", status: "confirmed", transaction_hash: HASH }));
    },
  });
  assertEquals(await sender.transactionOutcome("t1"), { outcome: "sent", hash: HASH });
  assertEquals(seen!.url, "https://api.privy.io/v1/transactions/t1");
  assertEquals(seen!.headers.authorization, `Basic ${btoa("app1:s1")}`);
  assertEquals(seen!.headers["privy-app-id"], "app1");
});
