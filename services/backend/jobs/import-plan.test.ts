import { expect, test } from "bun:test"
import { parseEther } from "viem"
import { parseArgs, planImport, worstCaseCost } from "./import-plan"
import type { ScamEntry } from "./sources/types"

const A = "0x098B716B8Aaf21512996dC57EB0615e2383E2f96"
const B = "0x252a8bD2319d8a555b872990601221b3A2053bCE"
const C = "0xdcbEfFBECcE100cCE9E4b153C4e15cB885643193"

const ofac: ScamEntry[] = [{ address: A, source: "ofac", category: "sanctioned", reason: "OFAC SDN: X" }]
const labels: ScamEntry[] = [
  { address: A, source: "list", category: "exploit", reason: "Ronin Bridge Exploiter (eth-labels: ofac-sanctioned)" },
  { address: B, source: "list", category: "phishing", reason: "Fake_Phishing1 (eth-labels: phish-hack)" },
  { address: C, source: "list", category: "exploit", reason: "Exploiter (eth-labels: exploit)" },
]

test("the first source wins an address listed twice", () => {
  const plan = planImport([ofac, labels], [])
  expect(plan.todo.map((e) => [e.address, e.source])).toEqual([[A, "ofac"], [B, "list"], [C, "list"]])
  expect(plan.bySource).toEqual({ ofac: 1, list: 2 })
  expect(plan.byCategory).toEqual({ sanctioned: 1, phishing: 1, exploit: 1 })
})

test("skips addresses already reported, in any case", () => {
  const plan = planImport([ofac, labels], [B.toLowerCase()])
  expect(plan.todo.map((e) => e.address)).toEqual([A, C])
  expect(plan.done).toBe(1)
})

test("counts reported addresses no source lists any more", () => {
  const gone = "0x0000000000000000000000000000000000000abc"
  expect(planImport([ofac], [A, gone]).stale).toBe(1)
})

test("worst-case cost is 1M gas per report", () => {
  expect(worstCaseCost(800, 10_000_000n)).toBe(parseEther("0.008"))
})

test("parseArgs: dry run of everything by default", () => {
  expect(parseArgs([])).toEqual({ write: false, sources: ["ofac", "eth-labels"], limit: null, maxSpend: "1" })
})

test("parseArgs: one source, a limit, a cap and --yes", () => {
  expect(parseArgs(["--source=ofac", "--limit=5", "--max-spend=0.1", "--yes"]))
    .toEqual({ write: true, sources: ["ofac"], limit: 5, maxSpend: "0.1" })
})

test("parseArgs refuses bad values", () => {
  expect(() => parseArgs(["--source=goplus"])).toThrow("--source")
  expect(() => parseArgs(["--limit=0"])).toThrow("--limit")
  expect(() => parseArgs(["--max-spend=lots"])).toThrow("--max-spend")
})
