import { assertEquals } from "@std/assert";
import { generateKeyPair } from "jose";
import { makeTestApp, signToken } from "./helpers.ts";

const { app, repo } = makeTestApp();
await repo.createUser("did:privy:known", "0xabc", "wallet-1");

const me = (auth?: string) => app.request("/api/me", { headers: auth ? { authorization: auth } : {} });

Deno.test("health needs no token", async () => {
  assertEquals((await app.request("/api/health")).status, 200);
});

Deno.test("missing token is 401", async () => {
  const res = await me();
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, "missing_token");
});

Deno.test("valid token reaches the handler", async () => {
  const res = await me(`Bearer ${await signToken("did:privy:known")}`);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.privyUserId, "did:privy:known");
  assertEquals(body.user.wallet_address, "0xabc");
});

Deno.test("unknown user gets user: null", async () => {
  const res = await me(`Bearer ${await signToken("did:privy:new")}`);
  assertEquals((await res.json()).user, null);
});

for (const [name, opts] of [
  ["wrong audience", { aud: "other-app" }],
  ["wrong issuer", { iss: "evil.io" }],
  ["expired", { exp: "-1m" }],
] as const) {
  Deno.test(`${name} is 401`, async () => {
    const res = await me(`Bearer ${await signToken("did:privy:known", opts)}`);
    assertEquals(res.status, 401);
    assertEquals((await res.json()).error, "invalid_token");
  });
}

Deno.test("token signed by another key is 401", async () => {
  const other = await generateKeyPair("ES256");
  const res = await me(`Bearer ${await signToken("did:privy:known", { key: other.privateKey })}`);
  assertEquals(res.status, 401);
});

Deno.test("non-Bearer header is 401", async () => {
  assertEquals((await me(`Basic abc`)).status, 401);
});
