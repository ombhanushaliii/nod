import { expect, test } from "bun:test"
import { categoryOf, parseCsv, parseEthLabels } from "./eth-labels"

const CSV = [
  "address,chainId,label,nameTag",
  '"0x00000952c5165e391ed0f8adffcfaf45f3b80000",10,"phish-hack","Fake_Phishing59"',
  '"0x098b716b8aaf21512996dc57eb0615e2383e2f96",1,"ofac-sanctioned","Ronin Bridge Exploiter"',
  '"0x0d6e286a7cfd25e0c01fee9756765d8033b32c71",56,"heist","PolyNetwork Exploiter"',
  '"0x155da45d374a286d383839b1ef27567a15e67528",10,"exploit","HundredFinance Exploiter"',
  '"0x47666fab8bd0ac7003bce3f5c3585383f09486e2",1,"bybit-exploit",null',
  // Same address again on another chain: kept once
  '"0x47666FAB8BD0AC7003BCE3F5C3585383F09486E2",8453,"bybit-exploit","Bybit Exploiter 2"',
  // Left out
  '"0x0000000000000000000000000000000000000000",1,"blocked","Null: 0x000...000"',
  '"0x03893a7c7463ae47d46bc7f091665f1893656003",1,"tornado-cash","Tornado.Cash: 50,000 cDAI 2"',
  '"0x0e8cf9bead36ee59a63a16672d024888b057f864",1,"cpimp-attack","Compromised: 0x0e8...864"',
  '"not-an-address",1,"scam","Fake_Phishing1"',
].join("\n")

test("keeps scam labels only, one entry per address", () => {
  const entries = parseEthLabels(CSV)
  expect(entries.map((e) => [e.address.toLowerCase(), e.category])).toEqual([
    ["0x00000952c5165e391ed0f8adffcfaf45f3b80000", "phishing"],
    ["0x098b716b8aaf21512996dc57eb0615e2383e2f96", "sanctioned"],
    ["0x0d6e286a7cfd25e0c01fee9756765d8033b32c71", "exploit"],
    ["0x155da45d374a286d383839b1ef27567a15e67528", "exploit"],
    ["0x47666fab8bd0ac7003bce3f5c3585383f09486e2", "exploit"],
  ])
  expect(entries.every((e) => e.source === "list")).toBe(true)
})

test("reason names the entry and the label, falling back to the label", () => {
  const entries = parseEthLabels(CSV)
  expect(entries[0]?.reason).toBe("Fake_Phishing59 (eth-labels: phish-hack)")
  expect(entries[4]?.reason).toBe("bybit-exploit (eth-labels: bybit-exploit)")
})

test("addresses come out checksummed", () => {
  const e = parseEthLabels(CSV).find((x) => x.category === "sanctioned")!
  expect(e.address).toBe("0x098B716B8Aaf21512996dC57EB0615e2383E2f96")
})

test("refuses a CSV with other columns", () => {
  expect(() => parseEthLabels("addr,label\n0x1,scam")).toThrow("unexpected CSV columns")
})

test("categoryOf", () => {
  expect(categoryOf("scam")).toBe("phishing")
  expect(categoryOf("wazirx-exploit")).toBe("exploit")
  expect(categoryOf("blocked")).toBeNull()
  expect(categoryOf("fraud-proof")).toBeNull()
})

test("parseCsv handles quotes, commas and doubled quotes", () => {
  expect(parseCsv('a,"b,c","d ""e"""\r\n1,2,3')).toEqual([["a", "b,c", 'd "e"'], ["1", "2", "3"]])
})
