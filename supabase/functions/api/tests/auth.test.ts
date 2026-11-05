import { assertEquals } from "@std/assert";
import { exportSPKI, generateKeyPair, SignJWT } from "jose";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createApp } from "../app.ts";
import { privyAuth } from "../lib/auth.ts";

const APP_ID = "test-app-id";
const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
const pem = await exportSPKI(publicKey);

// Minimal stand-in for the one query /me makes.
const fakeDb = {
  from: () => ({
    select: () => ({
      eq: (_col: string, did: string) => ({
        maybeSingle: () =>
          Promise.resolve({
            data: did === "did:privy:known" ? { id: "u1", wallet_address: "0xabc" } : null,
            error: null,
          }),
      }),
    }),
  }),
} as unknown as SupabaseClient;

const app = createApp({ auth: privyAuth({ appId: APP_ID, verificationKey: pem }), db: fakeDb });

function token(opts: { sub?: string; iss?: string; aud?: string; exp?: string; key?: CryptoKey } = {}) {
  return new SignJWT({ sid: "s1" })
    .setProtectedHeader({ alg: "ES256" })
    .setSubject(opts.sub ?? "did:privy:known")
    .setIssuer(opts.iss ?? "privy.io")
    .setAudience(opts.aud ?? APP_ID)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "1h")
    .sign(opts.key ?? privateKey);
}

const me = (auth?: string) =>
  app.request("/api/me", { headers: auth ? { authorization: auth } : {} });

Deno.test("health needs no token", async () => {
  assertEquals((await app.request("/api/health")).status, 200);
});

Deno.test("missing token is 401", async () => {
  const res = await me();
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, "missing_token");
});

Deno.test("valid token reaches the handler", async () => {
  const res = await me(`Bearer ${await token()}`);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.privyUserId, "did:privy:known");
  assertEquals(body.user.id, "u1");
});

Deno.test("unknown user gets user: null", async () => {
  const res = await me(`Bearer ${await token({ sub: "did:privy:new" })}`);
  assertEquals((await res.json()).user, null);
});

for (const [name, opts] of [
  ["wrong audience", { aud: "other-app" }],
  ["wrong issuer", { iss: "evil.io" }],
  ["expired", { exp: "-1m" }],
] as const) {
  Deno.test(`${name} is 401`, async () => {
    const res = await me(`Bearer ${await token(opts)}`);
    assertEquals(res.status, 401);
    assertEquals((await res.json()).error, "invalid_token");
  });
}

Deno.test("token signed by another key is 401", async () => {
  const other = await generateKeyPair("ES256");
  const res = await me(`Bearer ${await token({ key: other.privateKey })}`);
  assertEquals(res.status, 401);
});

Deno.test("non-Bearer header is 401", async () => {
  assertEquals((await me(`Basic abc`)).status, 401);
});
