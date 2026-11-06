import { getAddress, isAddress } from "viem"
import type { ScamEntry } from "./types"

// eth-labels (https://github.com/dawsbot/eth-labels, MIT): labels copied from
// Etherscan and other block explorers, for Ethereum and other EVM chains.
export const ETH_LABELS_URL = "https://raw.githubusercontent.com/dawsbot/eth-labels/v1/data/csv/accounts.csv"

// Labels that mean "don't pay this address". Everything else is left out on
// purpose, for example:
// - "blocked": mixes token contracts, exchange deposit addresses and null addresses.
// - "tornado-cash", "ofac-sanctions-lists": Tornado Cash contracts, delisted by OFAC in 2025.
// - "cpimp-attack": compromised contracts, the victims of an attack.
// - "spam-token", "fraud-proof": tokens and rollup contracts, not scam wallets.
export function categoryOf(label: string): ScamEntry["category"] | null {
  if (label === "phish-hack" || label === "scam") return "phishing"
  if (label === "exploit" || label.endsWith("-exploit") || label === "heist") return "exploit"
  if (label === "ofac-sanctioned") return "sanctioned"
  return null
}

// Small CSV parser: handles quoted fields, commas and "" inside quotes
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') field += '"', i++
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ",") row.push(field), (field = "")
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      row.push(field), rows.push(row), (row = []), (field = "")
    } else field += c
  }
  if (field || row.length) row.push(field), rows.push(row)
  return rows
}

// Scam addresses from the eth-labels CSV, one per address. An address is the
// same wallet on every EVM chain, so labels from any chain count.
export function parseEthLabels(csv: string): ScamEntry[] {
  const [header, ...lines] = parseCsv(csv)
  if (header?.join(",") !== "address,chainId,label,nameTag") throw new Error("eth-labels: unexpected CSV columns")

  const found = new Map<string, ScamEntry>()
  for (const [address = "", , label = "", nameTag = ""] of lines) {
    const category = categoryOf(label)
    if (!category || !isAddress(address, { strict: false })) continue
    const lower = address.toLowerCase()
    if (found.has(lower)) continue
    const name = nameTag && nameTag !== "null" ? nameTag : label
    found.set(lower, { address: getAddress(lower), source: "list", category, reason: `${name} (eth-labels: ${label})` })
  }
  return [...found.values()]
}

export async function loadEthLabels(doFetch: typeof fetch = fetch): Promise<ScamEntry[]> {
  const res = await doFetch(ETH_LABELS_URL)
  if (!res.ok) throw new Error(`eth-labels download failed: HTTP ${res.status}`)
  return parseEthLabels(await res.text())
}
