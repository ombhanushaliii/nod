import { getAddress } from "viem"
import type { ScamEntry } from "./types"

// OFAC's Specially Designated Nationals (SDN) list, from the US Treasury.
// Crypto addresses sit in each entry's <idList> as
// "Digital Currency Address - <ticker>" (ETH, USDT, USDC, ARB, BSC, ...).
export const OFAC_SDN_URL = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML"

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/
const MAX_REASON = 160

const decode = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")

const tag = (xml: string, name: string) => {
  const m = new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)
  return m ? decode(m[1]!.trim()) : ""
}

const all = (xml: string, name: string) =>
  [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "g"))].map((m) => m[1]!)

// Every EVM address on the SDN list, one entry per address. Tickers like TRX
// or XBT hold other address formats and are skipped by the 0x check.
export function parseOfacSdn(xml: string): ScamEntry[] {
  if (!xml.includes("<sdnList")) throw new Error("OFAC: not an SDN list")
  const found = new Map<string, ScamEntry>()
  for (const entry of all(xml, "sdnEntry")) {
    const ids = all(entry, "id").filter((id) => tag(id, "idType").startsWith("Digital Currency Address - "))
    if (ids.length === 0) continue
    const name = [tag(entry, "firstName"), tag(entry, "lastName")].filter(Boolean).join(" ") || "unnamed entry"
    const programs = all(entry, "program").map((p) => decode(p.trim()))
    const reason = `OFAC SDN: ${name}${programs.length ? ` (${programs.join(", ")})` : ""}`.slice(0, MAX_REASON)
    for (const id of ids) {
      const address = tag(id, "idNumber")
      if (!EVM_ADDRESS.test(address)) continue
      const lower = address.toLowerCase()
      if (!found.has(lower)) found.set(lower, { address: getAddress(lower), source: "ofac", category: "sanctioned", reason })
    }
  }
  return [...found.values()]
}

export async function loadOfacSdn(doFetch: typeof fetch = fetch): Promise<ScamEntry[]> {
  const res = await doFetch(OFAC_SDN_URL)
  if (!res.ok) throw new Error(`OFAC download failed: HTTP ${res.status}`)
  return parseOfacSdn(await res.text())
}
