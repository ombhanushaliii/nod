import nacl from "tweetnacl"
import { type Address, encodeAbiParameters, type Hex, hexToBytes, keccak256, sha256 } from "viem"
import { privateKeyToAccount } from "viem/accounts"

// Sealed bytes layout: senderPubKey (32) | nonce (24) | ciphertext
const PUB = nacl.box.publicKeyLength
const NONCE = nacl.box.nonceLength

// Encrypts the request details so only the trustee can read them (D4).
// Uses a fresh one-time sender key, so the user needs no key of their own.
export function seal(payload: unknown, trusteePubKey: Uint8Array): Uint8Array {
  const sender = nacl.box.keyPair()
  const nonce = nacl.randomBytes(NONCE)
  const message = new TextEncoder().encode(JSON.stringify(payload))
  const box = nacl.box(message, nonce, trusteePubKey, sender.secretKey)

  const out = new Uint8Array(PUB + NONCE + box.length)
  out.set(sender.publicKey, 0)
  out.set(nonce, PUB)
  out.set(box, PUB + NONCE)
  return out
}

// Trustee side: decrypts what seal() made. Throws on a wrong key or changed bytes.
// The result is untrusted data, check its fields before use.
export function open(sealed: Uint8Array, encSecretKey: Uint8Array): unknown {
  if (sealed.length <= PUB + NONCE) throw new Error("Sealed data too short")
  const senderPub = sealed.subarray(0, PUB)
  const nonce = sealed.subarray(PUB, PUB + NONCE)
  const box = sealed.subarray(PUB + NONCE)

  const message = nacl.box.open(box, nonce, senderPub, encSecretKey)
  if (!message) throw new Error("Could not decrypt")
  return JSON.parse(new TextDecoder().decode(message))
}

// The message the trustee signs with Privy to get the per-pair key (D5)
export function pairKeyMessage(pairId: string) {
  return "guardian-pair:" + pairId
}

// Per-pair Arkiv key: keccak256(signature) used as the private key (D5).
// Never leaves the phone.
export function derivePairKey(signature: Hex) {
  const privateKey = keccak256(signature)
  const account = privateKeyToAccount(privateKey)
  return { privateKey, account, address: account.address }
}

// Trustee encryption keypair: sha256(signature) as the x25519 secret (D8).
// Only publicKey goes to Supabase.
export function deriveEncKey(signature: Hex) {
  return nacl.box.keyPair.fromSecretKey(hexToBytes(sha256(signature)))
}

// intentHash binds an Allow to one exact payment (D5). Must match the backend
// (supabase/functions/api/lib/intent.ts):
//   keccak256(abi.encode(address to, uint256 amount, bytes32 nonce))
// amount is USDC base units (6 decimals); nonce comes from POST /payments/check.
export function intentHash(recipient: Address, amount: bigint, nonce: Hex): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "bytes32" }],
      [recipient, amount, nonce],
    ),
  )
}
