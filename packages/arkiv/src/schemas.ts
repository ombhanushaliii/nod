import { ExpirationTime } from "@arkiv-network/sdk"
import { addr, bytes, defineSchema, key, str, u64 } from "@arkiv-network/sdk/schema"

// Allowed values for the string columns (docs: D3, D4, D5, D6)
export type RequestKind = "payment" | "export" | "rules"
export type Verdict = "allow" | "deny"
export type ReportSource = "trustee" | "ofac" | "list"

// Written by the user's wallet when a payment needs the trustee.
// payload is sealed to the trustee, see crypto.ts
export const ApprovalRequest = defineSchema("approval_request", {
  pairId: str().indexed(),
  kind: str().indexed(),
  createdAt: u64().indexed(), // ms
  payload: bytes(),
})

// Written by the per-pair trustee key.
// Allow has intentHash + validFrom, deny may point to a scam report.
export const TrusteeDecision = defineSchema("trustee_decision", {
  pairId: str().indexed(),
  requestKey: key().indexed(),
  verdict: str().indexed(),
  intentHash: str().optional(),
  validFrom: u64().optional(), // ms
  reportKey: key().optional(),
})

// Public report against an address. Anyone can read it.
export const ScamReport = defineSchema("scam_report", {
  address: addr().indexed(),
  source: str().indexed(),
  category: str().indexed(),
  reason: bytes(),
  evidenceRef: str().optional(),
})

// How long each entity lives (docs: D4, D5, D6)
export const EXPIRY = {
  request: ExpirationTime.fromMinutes(30),
  allowKnownPayee: ExpirationTime.fromHours(1),
  allowNewPayee: ExpirationTime.fromHours(25),
  deny: ExpirationTime.fromMinutes(30),
  report: ExpirationTime.fromDays(180),
}

// 24h cooldown before a new payee's allow becomes valid
export const NEW_PAYEE_COOLDOWN_MS = 24 * 60 * 60 * 1000
