import { assert, assertEquals } from "@std/assert";
import { addr, hex32, makeTestApp } from "./helpers.ts";

const USER = "did:privy:user";
const TRUSTEE = "did:privy:trustee";

// Fresh app with a registered user and trustee.
async function setup() {
  const t = makeTestApp();
  t.privyWallets.set(USER, [addr("a")]);
  t.privyWallets.set(TRUSTEE, [addr("b")]);
  assertEquals((await t.call(USER, "POST", "/onboarding/user", { walletAddress: addr("a") })).status, 201);
  assertEquals((await t.call(TRUSTEE, "POST", "/onboarding/user", { walletAddress: addr("b") })).status, 201);
  return t;
}

const tokenFrom = (url: string) => url.replace("guardian://invite/", "");

Deno.test("register: wallet must belong to the Privy user", async () => {
  const t = makeTestApp();
  t.privyWallets.set(USER, [addr("a")]);
  const res = await t.call(USER, "POST", "/onboarding/user", { walletAddress: addr("c") });
  assertEquals(res.status, 403);
  assertEquals(res.body.error, "wallet_not_owned");
});

Deno.test("register: accepts mixed-case, stores lower-case, funds tGLM, creates rules", async () => {
  const t = makeTestApp();
  t.privyWallets.set(USER, [addr("a")]);
  const res = await t.call(USER, "POST", "/onboarding/user", { walletAddress: addr("A") });
  assertEquals(res.status, 201);
  assertEquals(res.body.user.wallet_address, addr("a"));
  assertEquals(t.funded, [addr("a")]);
  assert(t.repo.rules.has(res.body.user.id));
});

Deno.test("register: idempotent, and refuses a different wallet later", async () => {
  const t = await setup();
  assertEquals((await t.call(USER, "POST", "/onboarding/user", { walletAddress: addr("a") })).body.created, false);
  assertEquals((await t.call(USER, "POST", "/onboarding/user", { walletAddress: addr("d") })).status, 409);
});

Deno.test("register: rejects a bad address", async () => {
  const t = makeTestApp();
  assertEquals((await t.call(USER, "POST", "/onboarding/user", { walletAddress: "0x123" })).status, 422);
});

Deno.test("invite: needs onboarding first", async () => {
  const t = makeTestApp();
  const res = await t.call(USER, "POST", "/onboarding/invite", { trusteeEmail: "t@example.com" });
  assertEquals(res.status, 403);
  assertEquals(res.body.error, "not_onboarded");
});

Deno.test("invite: rejects a bad email", async () => {
  const t = await setup();
  assertEquals((await t.call(USER, "POST", "/onboarding/invite", { trusteeEmail: "nope" })).status, 422);
});

Deno.test("full flow: invite → look up → accept", async () => {
  const t = await setup();
  const inv = await t.call(USER, "POST", "/onboarding/invite", { trusteeEmail: " T@Example.com " });
  assertEquals(inv.status, 200);
  assertEquals(t.mails.length, 1);
  assertEquals(t.mails[0].to, "t@example.com");
  // The raw token is never stored, only its hash.
  const token = tokenFrom(t.mails[0].url);
  assert(!t.repo.invites.some((i) => i.tokenHash === token));

  const look = await t.call(TRUSTEE, "GET", `/invites/${token}`);
  assertEquals(look.status, 200);
  const pairId = look.body.pairId;
  assertEquals(pairId, t.repo.pairs[0].pairId);

  const acc = await t.call(TRUSTEE, "POST", "/pairs/accept", { token, pairKeyAddress: addr("c"), encPubKey: hex32("e") });
  assertEquals(acc.status, 200);
  assertEquals(acc.body.pairId, pairId);
  assertEquals(t.repo.pairs[0].status, "active");
  assertEquals(t.repo.invites[0].contact, null);
  assert(t.funded.includes(addr("c")));

  // Used link can't be looked up or accepted again; user can't invite again.
  assertEquals((await t.call(TRUSTEE, "GET", `/invites/${token}`)).status, 410);
  assertEquals((await t.call(TRUSTEE, "POST", "/pairs/accept", { token, pairKeyAddress: addr("c"), encPubKey: hex32("e") })).status, 410);
  assertEquals((await t.call(USER, "POST", "/onboarding/invite", { trusteeEmail: "x@example.com" })).status, 409);
});

Deno.test("re-sending an invite kills the old link", async () => {
  const t = await setup();
  await t.call(USER, "POST", "/onboarding/invite", { trusteeEmail: "t@example.com" });
  await t.call(USER, "POST", "/onboarding/invite", { trusteeEmail: "t@example.com" });
  assertEquals(t.repo.pairs.length, 1);
  assertEquals((await t.call(TRUSTEE, "GET", `/invites/${tokenFrom(t.mails[0].url)}`)).status, 404);
  assertEquals((await t.call(TRUSTEE, "GET", `/invites/${tokenFrom(t.mails[1].url)}`)).status, 200);
});

Deno.test("accept: can't be your own trustee", async () => {
  const t = await setup();
  await t.call(USER, "POST", "/onboarding/invite", { trusteeEmail: "t@example.com" });
  const res = await t.call(USER, "POST", "/pairs/accept", { token: tokenFrom(t.mails[0].url), pairKeyAddress: addr("c"), encPubKey: hex32("e") });
  assertEquals(res.status, 409);
  assertEquals(res.body.error, "self_trustee");
});

Deno.test("accept: per-pair key can't be the trustee's main wallet", async () => {
  const t = await setup();
  await t.call(USER, "POST", "/onboarding/invite", { trusteeEmail: "t@example.com" });
  const res = await t.call(TRUSTEE, "POST", "/pairs/accept", { token: tokenFrom(t.mails[0].url), pairKeyAddress: addr("b"), encPubKey: hex32("e") });
  assertEquals(res.status, 422);
  assertEquals(res.body.error, "pair_key_is_main_wallet");
});

Deno.test("accept: unknown token is 404", async () => {
  const t = await setup();
  const res = await t.call(TRUSTEE, "POST", "/pairs/accept", { token: "nope", pairKeyAddress: addr("c"), encPubKey: hex32("e") });
  assertEquals(res.status, 404);
});

Deno.test("invite: email failure is a 502, and retrying works", async () => {
  const t = await setup();
  t.state.mailFails = true;
  assertEquals((await t.call(USER, "POST", "/onboarding/invite", { trusteeEmail: "t@example.com" })).status, 502);
  t.state.mailFails = false;
  assertEquals((await t.call(USER, "POST", "/onboarding/invite", { trusteeEmail: "t@example.com" })).status, 200);
});

Deno.test("tGLM top-up failing doesn't fail sign-up or accept", async () => {
  const t = makeTestApp();
  t.privyWallets.set(USER, [addr("a")]);
  t.state.fundFails = true;
  assertEquals((await t.call(USER, "POST", "/onboarding/user", { walletAddress: addr("a") })).status, 201);
  assertEquals(t.funded, [addr("a")]);
});

Deno.test("signing in again tops up the wallet and the trustee's pair keys", async () => {
  const t = await setup();
  await t.call(USER, "POST", "/onboarding/invite", { trusteeEmail: "t@example.com" });
  const token = tokenFrom(t.mails[0].url);
  await t.call(TRUSTEE, "POST", "/pairs/accept", { token, pairKeyAddress: addr("c"), encPubKey: hex32("e") });
  t.funded.length = 0;
  await t.call(TRUSTEE, "POST", "/onboarding/user", { walletAddress: addr("b") });
  assertEquals(t.funded, [addr("b"), addr("c")]);
  await t.call(USER, "POST", "/onboarding/user", { walletAddress: addr("a") });
  assertEquals(t.funded, [addr("b"), addr("c"), addr("a")]);
});

Deno.test("GET /pair: none, then invited, then active with what the app needs", async () => {
  const t = await setup();
  assertEquals((await t.call(USER, "GET", "/pair")).body, { status: "none" });

  await t.call(USER, "POST", "/onboarding/invite", { trusteeEmail: "t@example.com" });
  const invited = await t.call(USER, "GET", "/pair");
  assertEquals(invited.body.status, "invited");
  assertEquals(invited.body.contact, "t@example.com");
  assertEquals("pairId" in invited.body, false);

  const token = tokenFrom(t.mails[0].url);
  await t.call(TRUSTEE, "POST", "/pairs/accept", { token, pairKeyAddress: addr("c"), encPubKey: hex32("e") });
  const active = await t.call(USER, "GET", "/pair");
  assertEquals(active.body.status, "active");
  assertEquals(active.body.pairId, t.repo.pairs[0].pairId);
  assertEquals(active.body.trusteeEncPubKey, hex32("e"));
  // The trustee's identity and pair key aren't shown to the user.
  assertEquals(Object.keys(active.body).sort(), ["acceptedAt", "pairId", "status", "trusteeEncPubKey"]);
});

Deno.test("GET /pair: an expired invite says so", async () => {
  const t = await setup();
  await t.call(USER, "POST", "/onboarding/invite", { trusteeEmail: "t@example.com" });
  t.repo.invites[0].expiresAt = new Date(Date.now() - 1000);
  assertEquals((await t.call(USER, "GET", "/pair")).body.status, "invite_expired");
});

Deno.test("public invite status: no sign-in, no pairId, closes once used", async () => {
  const t = await setup();
  await t.call(USER, "POST", "/onboarding/invite", { trusteeEmail: "t@example.com" });
  const token = tokenFrom(t.mails[0].url);
  const get = async (tok: string) => {
    const res = await t.app.request(`/api/public/invites/${tok}`);
    return { status: res.status, body: await res.json() };
  };
  const open = await get(token);
  assertEquals(open.status, 200);
  assertEquals(Object.keys(open.body).sort(), ["expiresAt", "status"]);
  assertEquals(open.body.status, "open");
  assertEquals((await get("nope")).status, 404);

  await t.call(TRUSTEE, "POST", "/pairs/accept", { token, pairKeyAddress: addr("c"), encPubKey: hex32("e") });
  assertEquals((await get(token)).body.status, "closed");
});
