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
