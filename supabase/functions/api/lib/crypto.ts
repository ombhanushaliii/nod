// Random ids and hashing with Web Crypto (available in the Edge runtime).
import { encodeBase64Url, encodeHex } from "./encoding.ts";

export function randomHex32(): `0x${string}` {
  return `0x${encodeHex(crypto.getRandomValues(new Uint8Array(32)))}`;
}

// Token for the invite link. Only its hash is stored.
export function randomToken(): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return encodeHex(new Uint8Array(digest));
}
