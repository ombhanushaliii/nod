// intentHash binds a trustee's "Allow once" to one exact payment (D5).
//
//   intentHash = keccak256(abi.encode(address to, uint256 amount, bytes32 nonce))
//
// amount is USDC base units; nonce comes from POST /payments/check. The trustee
// app computes the same value (e.g. viem's encodeAbiParameters + keccak256).
import { keccak_256 } from "@noble/hashes/sha3";
import { encodeHex } from "./encoding.ts";

function word(hex: string): string {
  return hex.replace(/^0x/, "").toLowerCase().padStart(64, "0");
}

export function intentHash(to: string, amount: bigint, nonce: string): `0x${string}` {
  const encoded = word(to) + word(amount.toString(16)) + word(nonce);
  const bytes = new Uint8Array(encoded.match(/../g)!.map((b) => parseInt(b, 16)));
  return `0x${encodeHex(keccak_256(bytes))}`;
}

const keccakHex = (bytes: Uint8Array) => `0x${encodeHex(keccak_256(bytes))}` as `0x${string}`;
const hexBytes = (hex: string) => new Uint8Array(hex.match(/../g)!.map((b) => parseInt(b, 16)));

// Domain tag for export approvals: keccak256("nod:export:v1").
export const EXPORT_TAG = keccakHex(new TextEncoder().encode("nod:export:v1"));

// exportIntentHash binds a trustee's Allow to one key export (D2):
//   keccak256(abi.encode(bytes32 EXPORT_TAG, address wallet, bytes32 nonce))
// Same as exportIntentHash in packages/arkiv/src/crypto.ts.
export function exportIntentHash(wallet: string, nonce: string): `0x${string}` {
  return keccakHex(hexBytes(word(EXPORT_TAG) + word(wallet) + word(nonce)));
}
