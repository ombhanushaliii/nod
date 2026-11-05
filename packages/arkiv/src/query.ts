import type { PublicArkivClient } from "@arkiv-network/sdk"
import { addr, key } from "@arkiv-network/sdk/schema"
import { asc, eq, gt, or } from "@arkiv-network/sdk/query"
import { type Address, type Hex, hexToBytes } from "viem"
import { ApprovalRequest, ScamReport, TrusteeDecision } from "./schemas"

const PAGE = 100
const MAX_PAGES = 10

// Reads page by page using $key, so nothing is skipped or repeated.
// Stops after MAX_PAGES so a flood of entities can't hang us.
async function readAll<T extends { $key: Hex }>(
  fetchPage: (after: Hex | undefined) => Promise<{ entities: readonly T[] }>,
): Promise<T[]> {
  const all: T[] = []
  let after: Hex | undefined
  for (let i = 0; i < MAX_PAGES; i++) {
    const { entities } = await fetchPage(after)
    all.push(...entities)
    if (entities.length < PAGE) return all
    after = entities[entities.length - 1]!.$key
  }
  throw new Error("Too many results, stopped reading")
}

// Trustee app + push watcher: live approval requests for these pairs.
// Expired ones are gone on their own. Check $owner against Supabase before trusting one.
export async function queryPendingRequests(client: PublicArkivClient, pairIds: string[]) {
  if (pairIds.length === 0) return []
  const byPair = or(...pairIds.map((id) => eq("pairId", id)))

  const rows = await readAll((after) => {
    const q = client
      .select({ $key: true, $owner: true, $expiresAt: true, pairId: true, kind: true, createdAt: true, payload: true })
      .from(ApprovalRequest, { onMismatch: "throw" })
      .orderBy(asc("$key"))
      .limit(PAGE)
    return (after ? q.where(byPair, gt("$key", key(after))) : q.where(byPair)).fetch()
  })

  return rows.map((r) => ({
    key: r.$key,
    owner: r.$owner,
    expiresAt: r.$expiresAt,
    pairId: r.pairId.value,
    kind: r.kind.value,
    createdAt: Number(r.createdAt.value),
    sealed: hexToBytes(r.payload.value),
  }))
}

// Backend verify: the decision for a request, written by the pair key from Supabase.
// Returns null if there is none (not made yet, or expired).
export async function getDecision(client: PublicArkivClient, requestKey: Hex, expectedOwner: Address) {
  const { entities } = await client
    .select({
      $key: true,
      $owner: true,
      $expiresAt: true,
      pairId: true,
      verdict: true,
      intentHash: true,
      validFrom: true,
      reportKey: true,
    })
    .from(TrusteeDecision, { onMismatch: "throw" })
    .where(eq("requestKey", key(requestKey)))
    .ownedBy(expectedOwner)
    .limit(2)
    .fetch()

  if (entities.length === 0) return null
  // Two decisions for one request should never happen, so refuse to pick one
  if (entities.length > 1) throw new Error("More than one decision for this request")

  const d = entities[0]!
  return {
    key: d.$key,
    owner: d.$owner,
    expiresAt: d.$expiresAt,
    pairId: d.pairId.value,
    verdict: d.verdict.value,
    intentHash: d.intentHash?.value as Hex | undefined,
    validFrom: d.validFrom === undefined ? undefined : Number(d.validFrom.value),
    reportKey: d.reportKey?.value,
  }
}

// Backend rules + app warnings: reports for an address.
// Verified = written by one of trustedCreators (our seed wallet or a pair key).
export async function queryReports(client: PublicArkivClient, address: Address, trustedCreators: Address[]) {
  const forAddress = eq("address", addr(address))

  const rows = await readAll((after) => {
    const q = client
      .select({ $key: true, $creator: true, source: true, category: true, reason: true, evidenceRef: true })
      .from(ScamReport, { onMismatch: "throw" })
      .orderBy(asc("$key"))
      .limit(PAGE)
    return (after ? q.where(forAddress, gt("$key", key(after))) : q.where(forAddress)).fetch()
  })

  const trusted = new Set(trustedCreators.map((a) => a.toLowerCase()))
  const reports = rows.map((r) => ({
    key: r.$key,
    creator: r.$creator,
    source: r.source.value,
    category: r.category.value,
    reason: new TextDecoder().decode(hexToBytes(r.reason.value)),
    evidenceRef: r.evidenceRef?.value,
  }))

  return {
    verified: reports.filter((r) => trusted.has(r.creator.toLowerCase())),
    unverified: reports.filter((r) => !trusted.has(r.creator.toLowerCase())),
  }
}
