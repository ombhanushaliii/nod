import type { PublicArkivClient } from "@arkiv-network/sdk"
import { addr, key } from "@arkiv-network/sdk/schema"
import { asc, eq, exists, or } from "@arkiv-network/sdk/query"
import { type Address, type Hex, hexToBytes } from "viem"
import { ApprovalRequest, ScamReport, TrusteeDecision } from "./schemas"

const PAGE = 100
const MAX_PAGES = 10

// Reads page by page, sorted by $key. Anyone can write entities with our
// schema names, so ones that don't fit are skipped, not fatal. A skipped
// entity still takes a place in the page, so pages move by offset (rows plus
// skipped). Rows that repeat when something is written mid-read are dropped.
// Stops after maxPages so a flood of entities can't hang us.
async function readAll<T extends { $key: Hex }>(
  fetchPage: (offset: number) => Promise<{ entities: readonly T[]; skipped: number }>,
  maxPages = MAX_PAGES,
): Promise<T[]> {
  const seen = new Map<string, T>()
  for (let i = 0; i < maxPages; i++) {
    const { entities, skipped } = await fetchPage(i * PAGE)
    for (const e of entities) seen.set(e.$key.toLowerCase(), e)
    if (entities.length + skipped < PAGE) return [...seen.values()]
  }
  throw new Error("Too many results, stopped reading")
}

// Trustee app + push watcher: live approval requests for these pairs.
// Expired ones are gone on their own. `creator` is who wrote it ($creator; $owner
// can be handed to anyone). Check it against Supabase before trusting one.
export async function queryPendingRequests(client: PublicArkivClient, pairIds: string[]) {
  if (pairIds.length === 0) return []
  const byPair = or(...pairIds.map((id) => eq("pairId", id)))

  const rows = await readAll((offset) =>
    client
      .select({ $key: true, $creator: true, $expiresAt: true, pairId: true, kind: true, createdAt: true, payload: true })
      .from(ApprovalRequest, { onMismatch: "skip" })
      .where(byPair)
      .orderBy(asc("$key"))
      .limit(PAGE)
      .offset(offset)
      .fetch(),
  )

  return rows.map((r) => ({
    key: r.$key,
    creator: r.$creator,
    expiresAt: r.$expiresAt,
    pairId: r.pairId.value,
    kind: r.kind.value,
    createdAt: Number(r.createdAt.value),
    sealed: hexToBytes(r.payload.value),
  }))
}

// The decision for a request, written by the pair key from Supabase.
// Returns null if there is none (not made yet, or expired). Same rule as the
// backend (supabase/functions/api/lib/arkivLive.ts): only decisions the pair
// key created count, any deny wins, otherwise the earliest allow.
export async function getDecision(client: PublicArkivClient, requestKey: Hex, pairKey: Address) {
  const { entities } = await client
    .select({
      $key: true,
      $creator: true,
      $createdAt: true,
      $expiresAt: true,
      pairId: true,
      verdict: true,
      createdAt: true,
      intentHash: true,
      validFrom: true,
      reportKey: true,
    })
    .from(TrusteeDecision, { onMismatch: "skip" })
    .where(eq("requestKey", key(requestKey)))
    .createdBy(pairKey)
    .limit(10)
    .fetch()

  const valid = entities.filter((d) => d.verdict.value === "allow" || d.verdict.value === "deny")
  const d =
    valid.find((x) => x.verdict.value === "deny") ??
    [...valid].sort((a, b) => (a.$createdAt < b.$createdAt ? -1 : a.$createdAt > b.$createdAt ? 1 : 0))[0]
  if (!d) return null
  return {
    key: d.$key,
    creator: d.$creator,
    expiresAt: d.$expiresAt,
    pairId: d.pairId.value,
    verdict: d.verdict.value as "allow" | "deny",
    createdAt: Number(d.createdAt.value),
    intentHash: d.intentHash?.value as Hex | undefined,
    validFrom: d.validFrom === undefined ? undefined : Number(d.validFrom.value),
    reportKey: d.reportKey?.value,
  }
}

const REPORT_FIELDS = {
  $key: true,
  $creator: true,
  $expiresAt: true,
  address: true,
  source: true,
  category: true,
  reason: true,
  evidenceRef: true,
} as const

// Reads scam reports page by page: for one address, one creator, or all
async function readReports(
  client: PublicArkivClient,
  scope: { address?: Address; createdBy?: Address },
  maxPages?: number,
) {
  const match = scope.address ? eq("address", addr(scope.address)) : exists("address")
  const rows = await readAll((offset) => {
    const q = client.select(REPORT_FIELDS).from(ScamReport, { onMismatch: "skip" }).where(match).orderBy(asc("$key"))
    if (scope.createdBy) q.createdBy(scope.createdBy)
    return q.limit(PAGE).offset(offset).fetch()
  }, maxPages)

  return rows.map((r) => ({
    key: r.$key,
    creator: r.$creator,
    expiresAt: r.$expiresAt,
    address: r.address.value,
    source: r.source.value,
    category: r.category.value,
    reason: new TextDecoder().decode(hexToBytes(r.reason.value)),
    evidenceRef: r.evidenceRef?.value,
  }))
}

// Backend rules + app warnings: reports for an address.
// Verified = written by one of trustedCreators (our seed wallet or a pair key).
export async function queryReports(client: PublicArkivClient, address: Address, trustedCreators: Address[]) {
  const reports = await readReports(client, { address })
  const trusted = new Set(trustedCreators.map((a) => a.toLowerCase()))
  return {
    verified: reports.filter((r) => trusted.has(r.creator.toLowerCase())),
    unverified: reports.filter((r) => !trusted.has(r.creator.toLowerCase())),
  }
}

// Mirror + importer: every live report, or only one creator's.
// maxPages x 100 is the most it will read.
export function listReports(client: PublicArkivClient, opts: { createdBy?: Address; maxPages?: number } = {}) {
  return readReports(client, { createdBy: opts.createdBy }, opts.maxPages ?? 50)
}
