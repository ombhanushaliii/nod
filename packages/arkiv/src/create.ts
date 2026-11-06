import type { WalletArkivClient } from "@arkiv-network/sdk"
import { addr, key, u64 } from "@arkiv-network/sdk/schema"
import type { Address, Hex } from "viem"
import {
  ApprovalRequest,
  EXPIRY,
  type ReportSource,
  type RequestKind,
  ScamReport,
  TrusteeDecision,
  type Verdict,
} from "./schemas"
import { safeCreate } from "./write"

// User app: asks the trustee to approve. sealed comes from seal() in crypto.ts
export function createApprovalRequest(
  walletClient: WalletArkivClient,
  input: { pairId: string; kind: RequestKind; sealed: Uint8Array },
) {
  return safeCreate(
    walletClient,
    ApprovalRequest,
    {
      pairId: input.pairId,
      kind: input.kind,
      createdAt: u64(Date.now()),
      payload: input.sealed,
    },
    { expiration: EXPIRY.request },
  )
}

// Trustee app: writes allow or deny with the per-pair key.
// Allow needs intentHash + validFrom. Deny can link the scam report.
export function createDecision(
  pairKeyClient: WalletArkivClient,
  input: {
    pairId: string
    requestKey: Hex
    verdict: Verdict
    intentHash?: Hex
    validFrom?: number // ms
    reportKey?: Hex
  },
) {
  if (input.verdict === "allow" && (!input.intentHash || input.validFrom === undefined)) {
    throw new Error("Allow needs intentHash and validFrom")
  }

  // Deny: 30 min. Allow: 1 h, or 25 h when validFrom is in the future (new payee cooldown)
  let expiration = EXPIRY.deny
  if (input.verdict === "allow") {
    expiration = input.validFrom! > Date.now() ? EXPIRY.allowNewPayee : EXPIRY.allowKnownPayee
  }

  return safeCreate(
    pairKeyClient,
    TrusteeDecision,
    {
      pairId: input.pairId,
      requestKey: key(input.requestKey),
      verdict: input.verdict,
      createdAt: u64(Date.now()),
      intentHash: input.intentHash,
      validFrom: input.validFrom === undefined ? undefined : u64(input.validFrom),
      reportKey: input.reportKey === undefined ? undefined : key(input.reportKey),
    },
    { expiration },
  )
}

// Trustee app or importer: public report. Anyone can extend it, so the backend can renew it.
export function createScamReport(
  client: WalletArkivClient,
  input: {
    address: Address
    source: ReportSource
    category: string
    reason: string
    evidenceRef?: string
  },
) {
  return safeCreate(
    client,
    ScamReport,
    {
      address: addr(input.address),
      source: input.source,
      category: input.category,
      reason: new TextEncoder().encode(input.reason),
      evidenceRef: input.evidenceRef,
    },
    { expiration: EXPIRY.report, flags: { permissionlessExtension: true } },
  )
}
