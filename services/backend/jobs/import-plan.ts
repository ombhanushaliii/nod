import type { ScamEntry } from "./sources/types"

// Gas the shared write helper (packages/arkiv/src/write.ts) asks for at least,
// per report. The real fee is usually lower; this is the most one can cost.
export const GAS_PER_REPORT = 1_000_000n

export type ImportPlan = {
  todo: ScamEntry[]
  // Already reported by the seed wallet, so skipped.
  done: number
  // Reported by the seed wallet earlier but no longer in any source loaded now
  // (for example taken off the OFAC list). Only counted; never deleted here.
  stale: number
  byCategory: Record<string, number>
  bySource: Record<string, number>
}

const count = (items: ScamEntry[], key: (e: ScamEntry) => string) => {
  const out: Record<string, number> = {}
  for (const e of items) out[key(e)] = (out[key(e)] ?? 0) + 1
  return out
}

// Sources come in priority order: when two list the same address, the first
// one wins (OFAC before eth-labels, so a sanctioned wallet is filed as "ofac").
export function planImport(sources: ScamEntry[][], alreadyReported: Iterable<string>): ImportPlan {
  const reported = new Set([...alreadyReported].map((a) => a.toLowerCase()))
  const merged = new Map<string, ScamEntry>()
  for (const source of sources) {
    for (const e of source) {
      const lower = e.address.toLowerCase()
      if (!merged.has(lower)) merged.set(lower, e)
    }
  }
  const todo = [...merged.entries()].filter(([lower]) => !reported.has(lower)).map(([, e]) => e)
  return {
    todo,
    done: merged.size - todo.length,
    stale: [...reported].filter((a) => !merged.has(a)).length,
    byCategory: count(todo, (e) => e.category),
    bySource: count(todo, (e) => e.source),
  }
}

// The most `reports` writes can cost at this gas price, in wei.
export const worstCaseCost = (reports: number, gasPrice: bigint) => BigInt(reports) * GAS_PER_REPORT * gasPrice

export type Options = { write: boolean; sources: ("ofac" | "eth-labels")[]; limit: number | null; maxSpend: string }

export function parseArgs(argv: string[]): Options {
  const value = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
  const source = value("source") ?? "all"
  if (!["all", "ofac", "eth-labels"].includes(source)) throw new Error(`--source must be all, ofac or eth-labels, not ${source}`)
  const limitText = value("limit")
  const limit = limitText === undefined ? null : Number(limitText)
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) throw new Error("--limit must be a whole number above 0")
  const maxSpend = value("max-spend") ?? "1"
  if (!/^\d+(\.\d+)?$/.test(maxSpend)) throw new Error("--max-spend must be a GLM amount, e.g. 0.5")
  return {
    write: argv.includes("--yes"),
    sources: source === "all" ? ["ofac", "eth-labels"] : [source as "ofac" | "eth-labels"],
    limit,
    maxSpend,
  }
}
