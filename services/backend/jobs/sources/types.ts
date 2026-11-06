import type { Address } from "viem"

// One address to report as a scam, from an outside list.
// source and category end up on the scam_report entity (indexed), so other
// wallets can filter on them.
export type ScamEntry = {
  address: Address // checksummed
  source: "ofac" | "list"
  category: "sanctioned" | "phishing" | "exploit"
  reason: string // short, human-readable, says where it came from
}
