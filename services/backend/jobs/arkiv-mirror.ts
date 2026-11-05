import type { PublicArkivClient } from "@arkiv-network/sdk"
import type { Address, Hex } from "viem"
import { listReports } from "../../../packages/arkiv/src/index"

// Proposed row for Supabase scam_reports_archive (C makes the migration).
// entity_key is the unique key, so saving again just updates the row.
export type ArchiveRow = {
  entity_key: Hex
  address: Address
  source: string
  category: string
  reason: string
  evidence_ref: string | null
  creator: Address
  verified: boolean // creator is our seed wallet or a pair key
  expires_at_block: string // Arkiv block number, as text (bigint)
}

// Report mirror (D6): copies every live scam report into Supabase, the permanent record.
export async function runMirror(deps: {
  client: PublicArkivClient
  trustedCreators: () => Promise<Address[]>
  saveReports: (rows: ArchiveRow[]) => Promise<void>
}) {
  const [reports, trustedList] = await Promise.all([listReports(deps.client), deps.trustedCreators()])
  const trusted = new Set(trustedList.map((a) => a.toLowerCase()))

  const rows: ArchiveRow[] = reports.map((r) => ({
    entity_key: r.key,
    address: r.address,
    source: r.source,
    category: r.category,
    reason: r.reason,
    evidence_ref: r.evidenceRef ?? null,
    creator: r.creator,
    verified: trusted.has(r.creator.toLowerCase()),
    expires_at_block: r.expiresAt.toString(),
  }))

  if (rows.length > 0) await deps.saveReports(rows)
  return rows.length
}
