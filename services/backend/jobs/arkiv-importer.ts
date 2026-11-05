import { type Address, formatEther, getAddress, isAddress } from "viem"
import { getBalance } from "viem/actions"
import { createScamReport, listReports } from "../../../packages/arkiv/src/index"
import { arkivReader, seedWallet } from "./arkiv-clients"

// Importer: turns exploiter wallets from eth-labels (labels copied from Etherscan, MIT)
// into scam reports written by our seed wallet.
// Run:  bun run import          -> dry run, writes nothing
//       bun run import --yes    -> writes, one report at a time
const SOURCE_URL = "https://raw.githubusercontent.com/dawsbot/eth-labels/v1/data/csv/accounts.csv"
const CHAINS = new Set(["1", "8453"]) // Ethereum + Base

type Label = { address: string; chainId: string; label: string; nameTag: string }

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

export async function loadExploiters(): Promise<Map<string, { address: Address; reason: string }>> {
  const res = await fetch(SOURCE_URL)
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)
  const [header, ...lines] = parseCsv(await res.text())
  if (header?.join(",") !== "address,chainId,label,nameTag") throw new Error("Unexpected CSV columns")

  // One report per address, even if it shows up on both chains
  const found = new Map<string, { address: Address; reason: string }>()
  for (const [address, chainId, label, nameTag] of lines as [string, string, string, string][]) {
    const row: Label = { address, chainId, label, nameTag }
    if (!CHAINS.has(row.chainId) || !row.label?.endsWith("-exploit") || !isAddress(row.address)) continue
    const lower = row.address.toLowerCase()
    if (found.has(lower)) continue
    const name = row.nameTag && row.nameTag !== "null" ? row.nameTag : row.label
    found.set(lower, { address: getAddress(row.address), reason: `${name} (eth-labels)` })
  }
  return found
}

async function main() {
  const write = process.argv.includes("--yes")
  const reader = arkivReader()
  const seed = seedWallet()

  const exploiters = await loadExploiters()
  // Skip addresses our seed wallet already reported (re-runs pick up where they stopped)
  const done = new Set(
    (await listReports(reader, { createdBy: seed.account.address })).map((r) => r.address.toLowerCase()),
  )
  const todo = [...exploiters.entries()].filter(([lower]) => !done.has(lower)).map(([, v]) => v)

  const balance = await getBalance(reader, { address: seed.account.address })
  console.log(`seed wallet ${seed.account.address}, balance ${formatEther(balance)} GLM`)
  console.log(`found ${exploiters.size}, already reported ${exploiters.size - todo.length}, to write ${todo.length}`)
  if (!write) return console.log("dry run: nothing written. Add --yes to write.")

  for (const [i, item] of todo.entries()) {
    // Stops on the first error. Check that tx before running again.
    const { entityKey, txHash } = await createScamReport(seed, {
      address: item.address,
      source: "list",
      category: "exploit",
      reason: item.reason,
    })
    console.log(`${i + 1}/${todo.length} ${item.address} -> ${entityKey} (tx ${txHash})`)
  }
}

// Only run when started directly, not when imported
if (import.meta.main) await main()
