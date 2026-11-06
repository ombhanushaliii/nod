import { assertEquals, assertRejects } from "@std/assert";
import { canonicalize } from "../lib/jcs.ts";
import {
  authorizationSignature, SEPOLIA_USDC, importAuthorizationKey, privySender, rawToDer, SendError,
  transferCalldata,
} from "../lib/privySigner.ts";

// A throwaway P-256 key in Privy's "wallet-auth:<base64 PKCS#8>" format.
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
const WALLET_AUTH = `wallet-auth:${btoa(String.fromCharCode(...pkcs8))}`;

// DER -> raw r||s, to verify with Web Crypto.
function derToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> {
  let i = 2;
  const read = () => {
    const len = der[i + 1];
    const v = der.slice(i + 2, i + 2 + len);
    i += 2 + len;
    const trimmed = v[0] === 0 ? v.slice(1) : v;
    const out = new Uint8Array(32);
    out.set(trimmed, 32 - trimmed.length);
    return out;
  };
  return new Uint8Array([...read(), ...read()]);
}

Deno.test("transfer calldata is ERC-20 transfer(address,uint256)", () => {
  assertEquals(
    transferCalldata("0x1234567890abcdef1234567890abcdef12345678", 25_000_000n),
    "0xa9059cbb" + "000000000000000000000000" + "1234567890abcdef1234567890abcdef12345678" +
      (25_000_000).toString(16).padStart(64, "0"),
  );
});

Deno.test("rawToDer adds a 0x00 pad when the high bit is set and strips leading zeros", () => {
  const r = new Uint8Array(32).fill(0xff);
  const s = new Uint8Array(32);
  s[31] = 1;
  const der = rawToDer(new Uint8Array([...r, ...s]));
  assertEquals(Array.from(der.slice(0, 4)), [0x30, 2 + 33 + 2 + 1, 0x02, 33]);
  assertEquals(der[4], 0);
  assertEquals(Array.from(der.slice(-3)), [0x02, 1, 1]);
});

Deno.test("authorization signature verifies over the RFC 8785 payload", async () => {
  const key = await importAuthorizationKey(WALLET_AUTH);
  const body = { method: "eth_sendTransaction", sponsor: true, caip2: "eip155:11155111", params: { transaction: { to: "0x1" } } };
  const url = "https://api.privy.io/v1/wallets/w1/rpc";
  const sig = await authorizationSignature(key, { method: "POST", url, body, appId: "app1" });

  const expected = canonicalize({ version: 1, method: "POST", url, body, headers: { "privy-app-id": "app1" } });
  const der = Uint8Array.from(atob(sig), (c) => c.charCodeAt(0));
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" }, pair.publicKey, derToRaw(der), new TextEncoder().encode(expected),
  );
  assertEquals(ok, true);
});

Deno.test("sender posts a sponsored USDC transfer to Privy with the right headers", async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  const sender = privySender({
    appId: "app1", appSecret: "secret1", authorizationKey: WALLET_AUTH,
    fetch: (url, init) => {
      seen = { url: String(url), init: init! };
      return Promise.resolve(Response.json({ method: "eth_sendTransaction", data: { hash: "", transaction_id: "tx9", user_operation_hash: "0xop" } }));
    },
  });
  const out = await sender.sendUsdc({ walletId: "w1", to: "0x" + "9".repeat(40), amount: 5n, referenceId: "pay-1" });
  assertEquals(out, { transactionId: "tx9", userOperationHash: "0xop", hash: null });

  assertEquals(seen!.url, "https://api.privy.io/v1/wallets/w1/rpc");
  const headers = seen!.init.headers as Record<string, string>;
  assertEquals(headers.authorization, `Basic ${btoa("app1:secret1")}`);
  assertEquals(headers["privy-app-id"], "app1");
  assertEquals(typeof headers["privy-authorization-signature"], "string");
  const body = JSON.parse(seen!.init.body as string);
  assertEquals(body.sponsor, true);
  assertEquals(body.caip2, "eip155:11155111");
  assertEquals(body.reference_id, "pay-1");
  assertEquals(body.params.transaction.to, SEPOLIA_USDC);
  assertEquals(body.params.transaction.data, transferCalldata("0x" + "9".repeat(40), 5n));
});

Deno.test("sender turns Privy errors into SendError with the status", async () => {
  const sender = privySender({
    appId: "a", appSecret: "s", authorizationKey: WALLET_AUTH,
    fetch: () => Promise.resolve(new Response("policy violation", { status: 400 })),
  });
  const err = await assertRejects(
    () => sender.sendUsdc({ walletId: "w", to: "0x" + "1".repeat(40), amount: 1n, referenceId: "r" }),
    SendError,
  );
  assertEquals(err.status, 400);
});

Deno.test("canonical JSON: sorted keys, no spaces, nested, undefined dropped", () => {
  assertEquals(
    canonicalize({ b: [1, "x", { z: true, a: null }], a: { d: 2, c: "é\n" }, u: undefined, "€": 0, "\u0080": 1 }),
    '{"a":{"c":"é\\n","d":2},"b":[1,"x",{"a":null,"z":true}],"\u0080":1,"€":0}',
  );
});
