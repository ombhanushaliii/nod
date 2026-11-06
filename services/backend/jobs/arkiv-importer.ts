import { formatEther } from "viem"
import { getBalance } from "viem/actions"
import { createScamReport, listReports } from "../../../packages/arkiv/src/index"
import { arkivReader, seedWallet } from "./arkiv-clients"
import { loadEthLabels } from "./sources/eth-labels"

// Importer: turns scam wallets from eth-labels (labels copied from Etherscan, MIT)
// into scam reports written by our seed wallet. See sources/eth-labels.ts for
// which labels count.
// Run:  bun run import          -> dry run, writes nothing
//       bun run import --yes    -> writes, one report at a time

async function main() {
  const write = process.argv.includes("--yes")
  const reader = arkivReader()
  const seed = seedWallet()

  const exploiters = new Map((await loadEthLabels()).map((e) => [e.address.toLowerCase(), e]))
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
      source: item.source,
      category: item.category,
      reason: item.reason,
    })
    console.log(`${i + 1}/${todo.length} ${item.address} -> ${entityKey} (tx ${txHash})`)
  }
}

// Only run when started directly, not when imported
if (import.meta.main) await main()
