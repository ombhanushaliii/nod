// What a payment approval request carries, sealed to the trustee (D4). The
// user app builds it; the trustee app opens it with open() and checks it with
// parsePaymentPayload before showing anything.
//
// No relative imports here: the app's node tests load this file directly.

export type PaymentRequestPayload = {
  v: 1
  kind: "payment"
  paymentId: string
  // Lower-case recipient address.
  to: `0x${string}`
  // USDC base units (6 decimals) as a decimal string, e.g. "12500000".
  amount: string
  // From POST /payments/check. intentHash(to, amount, nonce) binds the allow.
  nonce: `0x${string}`
  // The name the user gave the recipient. Only the trustee sees it.
  name: string
  // Reason codes from the check, e.g. "new_payee", "over_limit", "scam_report".
  reasons: string[]
  // Answers to the three scam questions, in order.
  answers: [boolean, boolean, boolean]
  newPayee: boolean
}

const ADDRESS = /^0x[0-9a-f]{40}$/
const HEX32 = /^0x[0-9a-f]{64}$/
const UNITS = /^[1-9][0-9]{0,30}$/

// "12.5" -> "12500000". Throws on anything that isn't a plain USDC amount.
export function usdcToUnits(amount: string): string {
  const m = /^(\d{1,24})(?:\.(\d{1,6}))?$/.exec(amount.trim())
  if (!m) throw new Error(`Not a USDC amount: ${amount}`)
  const units = BigInt(m[1]!) * 1_000_000n + BigInt((m[2] ?? "").padEnd(6, "0"))
  if (units <= 0n) throw new Error("Amount must be positive")
  return units.toString()
}

// Checks a decrypted payload. It came from the user's phone, so nothing in it
// is trusted until this passes. Returns null if anything is off.
export function parsePaymentPayload(value: unknown): PaymentRequestPayload | null {
  if (typeof value !== "object" || value === null) return null
  const p = value as Record<string, unknown>
  const answers = p.answers
  const ok =
    p.v === 1 &&
    p.kind === "payment" &&
    typeof p.paymentId === "string" && p.paymentId.length > 0 && p.paymentId.length <= 64 &&
    typeof p.to === "string" && ADDRESS.test(p.to) &&
    typeof p.amount === "string" && UNITS.test(p.amount) &&
    typeof p.nonce === "string" && HEX32.test(p.nonce) &&
    typeof p.name === "string" && p.name.length <= 80 &&
    Array.isArray(p.reasons) && p.reasons.length <= 20 &&
    p.reasons.every((r) => typeof r === "string" && r.length <= 64) &&
    Array.isArray(answers) && answers.length === 3 && answers.every((a) => typeof a === "boolean") &&
    typeof p.newPayee === "boolean"
  if (!ok) return null
  return {
    v: 1,
    kind: "payment",
    paymentId: p.paymentId as string,
    to: p.to as `0x${string}`,
    amount: p.amount as string,
    nonce: p.nonce as `0x${string}`,
    name: p.name as string,
    reasons: [...(p.reasons as string[])],
    answers: [...(answers as boolean[])] as [boolean, boolean, boolean],
    newPayee: p.newPayee as boolean,
  }
}
