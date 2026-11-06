import { appendFileSync } from "node:fs"
import { EntityMutationError } from "@arkiv-network/sdk"
import { formatEther, parseEther } from "viem"
import { getBalance, getGasPrice } from "viem/actions"
import { createScamReport, listReports, safeDelete } from "../../../packages/arkiv/src/index"
import { arkivReader, seedWallet } from "./arkiv-clients"
import { parseArgs, planImport, planPrune, worstCaseCost } from "./import-plan"
import { loadEthLabels } from "./sources/eth-labels"
import { loadOfacSdn } from "./sources/ofac"
import type { ScamEntry } from "./sources/types"

// Importer: writes known scam wallets to Arkiv as scam_report entities from
// our seed wallet, so the backend counts them as verified and every wallet can
// read them. Sources, in priority order:
//   1. OFAC SDN list (US Treasury): sanctioned wallets.
//   2. eth-labels (Etherscan labels, MIT): phishing, exploit and sanctioned wallets.
//
// Run:  bun run import                       dry run of both sources, writes nothing
//       bun run import --source=ofac         one source only (ofac or eth-labels)
//       bun run import --yes --limit=5       write the first 5, to try it out
//       bun run import --yes                 write everything left to do
//       --max-spend=1                        refuse to start if the worst case costs more GLM (default 1)
//       bun run import --prune               dry run: the seed's reports for addresses no list has any more
//       bun run import --prune --yes         delete those reports (then the renewer stops extending them)
//
// Writes go one at a time through safeCreate: estimate, explicit gas, nonce and
// gas price, then a receipt check. The first error stops the run and nothing
// is retried. A run first reads which addresses the seed wallet already
// reported, so starting again picks up where the last run stopped.
const LOG_FILE = "import-log.jsonl"

const log = (line: Record<string, unknown>) =>
  appendFileSync(LOG_FILE, JSON.stringify({ at: new Date().toISOString(), ...line }) + "\n")

const txHashOf = (err: unknown) =>
  err instanceof EntityMutationError ? err.txHash : /0x[0-9a-fA-F]{64}/.exec(String((err as Error)?.message))?.[0]

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const reader = arkivReader()
  const seed = seedWallet()

  // Load every source before touching the chain: a failed download stops here.
  const loaders = { ofac: loadOfacSdn, "eth-labels": loadEthLabels }
  const sources: ScamEntry[][] = []
  for (const name of opts.sources) {
    const entries = await loaders[name]()
    console.log(`${name}: ${entries.length} addresses`)
    sources.push(entries)
  }

  const seedReports = await listReports(reader, { createdBy: seed.account.address })
  if (opts.prune) return prune(opts, sources, seedReports)
  const reported = seedReports.map((r) => r.address)
  const plan = planImport(sources, reported)
  const todo = opts.limit === null ? plan.todo : plan.todo.slice(0, opts.limit)

  const [balance, gasPrice] = await Promise.all([
    getBalance(reader, { address: seed.account.address }),
    getGasPrice(reader),
  ])
  const cost = worstCaseCost(todo.length, gasPrice)
  console.log(`seed wallet ${seed.account.address}, balance ${formatEther(balance)} GLM`)
  console.log(`already reported ${plan.done}, left to write ${plan.todo.length}`, plan.bySource, plan.byCategory)
  if (opts.sources.length === 2 && plan.stale > 0) {
    console.log(`${plan.stale} earlier reports are on no list any more (left on Arkiv until they expire)`)
  }
  console.log(`this run writes ${todo.length}, costing at most ${formatEther(cost)} GLM`)

  if (!opts.write) return console.log("dry run: nothing written. Add --yes to write.")
  if (todo.length === 0) return console.log("nothing to write.")
  if (cost > parseEther(opts.maxSpend)) throw new Error(`worst case is over --max-spend=${opts.maxSpend} GLM. Raise it or use --limit.`)
  if (cost > balance) throw new Error("the seed wallet can't cover the worst case. Top it up or use --limit.")

  for (const [i, item] of todo.entries()) {
    try {
      const { entityKey, txHash } = await createScamReport(seed, item)
      log({ status: "written", address: item.address, source: item.source, category: item.category, entityKey, txHash })
      console.log(`${i + 1}/${todo.length} ${item.address} -> ${entityKey} (tx ${txHash})`)
    } catch (err) {
      const txHash = txHashOf(err)
      log({ status: "stopped", address: item.address, txHash: txHash ?? null, error: String((err as Error)?.message ?? err).slice(0, 300) })
      console.error(`stopped at ${i + 1}/${todo.length} (${item.address}).`)
      console.error(txHash
        ? `Look up tx ${txHash} on https://rabdi.explorer.arkiv.network before running again.`
        : "No transaction hash: wait a minute, then run the dry run to see if it landed.")
      throw err
    }
  }
  console.log(`done. Log: ${LOG_FILE}`)
}

// --prune: deletes the seed wallet's reports for addresses that are on no
// list any more. Same rules as writing: one at a time, stop on the first
// error, no retries, every delete logged.
async function prune(
  opts: ReturnType<typeof parseArgs>,
  sources: ScamEntry[][],
  seedReports: Awaited<ReturnType<typeof listReports>>,
) {
  const reader = arkivReader()
  const seed = seedWallet()
  const stale = planPrune(sources, seedReports.map((r) => ({ key: r.key, address: r.address, source: r.source })))
  const todo = opts.limit === null ? stale : stale.slice(0, opts.limit)
  const [balance, gasPrice] = await Promise.all([
    getBalance(reader, { address: seed.account.address }),
    getGasPrice(reader),
  ])
  const cost = worstCaseCost(todo.length, gasPrice)
  console.log(`seed wallet has ${seedReports.length} reports; ${stale.length} are on no list any more`)
  for (const r of todo.slice(0, 20)) console.log(`  ${r.address} (${r.source}) ${r.key}`)
  if (todo.length > 20) console.log(`  ... and ${todo.length - 20} more`)
  console.log(`this run deletes ${todo.length}, costing at most ${formatEther(cost)} GLM`)

  if (!opts.write) return console.log("dry run: nothing deleted. Add --yes to delete.")
  if (todo.length === 0) return console.log("nothing to delete.")
  if (cost > parseEther(opts.maxSpend)) throw new Error(`worst case is over --max-spend=${opts.maxSpend} GLM. Raise it or use --limit.`)
  if (cost > balance) throw new Error("the seed wallet can't cover the worst case. Top it up or use --limit.")

  for (const [i, r] of todo.entries()) {
    try {
      const { txHash } = await safeDelete(seed, { entityKey: r.key as `0x${string}` })
      log({ status: "deleted", address: r.address, source: r.source, entityKey: r.key, txHash })
      console.log(`${i + 1}/${todo.length} deleted ${r.address} (${r.key}, tx ${txHash})`)
    } catch (err) {
      const txHash = txHashOf(err)
      log({ status: "stopped", action: "delete", address: r.address, entityKey: r.key, txHash: txHash ?? null, error: String((err as Error)?.message ?? err).slice(0, 300) })
      console.error(`stopped at ${i + 1}/${todo.length} (${r.address}).`)
      console.error(txHash
        ? `Look up tx ${txHash} on https://rabdi.explorer.arkiv.network before running again.`
        : "No transaction hash: wait a minute, then run the dry run to see if it landed.")
      throw err
    }
  }
  console.log(`done. Log: ${LOG_FILE}`)
}

// Only run when started directly, not when imported
if (import.meta.main) await main()
