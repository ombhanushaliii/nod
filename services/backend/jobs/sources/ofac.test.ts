import { expect, test } from "bun:test"
import { parseOfacSdn } from "./ofac"

const entry = (body: string) => `<sdnEntry><uid>1</uid>${body}</sdnEntry>`
const id = (type: string, value: string) => `<id><uid>9</uid><idType>${type}</idType><idNumber>${value}</idNumber></id>`

const XML = `<?xml version="1.0" standalone="yes"?>
<sdnList xmlns="https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/XML">
  ${entry(`<lastName>LAZARUS GROUP</lastName><sdnType>Entity</sdnType>
    <programList><program>DPRK3</program><program>CYBER2</program></programList>
    <idList>
      ${id("Email Address", "someone@example.com")}
      ${id("Digital Currency Address - ETH", "0x098B716B8Aaf21512996dC57EB0615e2383E2f96")}
      ${id("Digital Currency Address - XBT", "12aNKp2iDKuhEde2YfPdd4DFGenRUTKupL")}
      ${id("Digital Currency Address - USDT", "0x252a8bd2319d8a555b872990601221b3a2053bce")}
    </idList>`)}
  ${entry(`<firstName>Roman</firstName><lastName>SEMENOV &amp; CO</lastName>
    <programList><program>CYBER2</program></programList>
    <idList>
      ${id("Digital Currency Address - ETH", "0xdcbEfFBECcE100cCE9E4b153C4e15cB885643193")}
      ${id("Digital Currency Address - ARB", "0x098b716b8aaf21512996dc57eb0615e2383e2f96")}
    </idList>`)}
  ${entry(`<lastName>NO CRYPTO LTD</lastName><idList>${id("Passport", "X123")}</idList>`)}
  ${entry(`<lastName>TRON ONLY</lastName><idList>${id("Digital Currency Address - TRX", "TAbbVaBKgH4VBLXgWqACuwoKF4cH1HinQh")}</idList>`)}
</sdnList>`

test("keeps every 0x address, whatever ticker it's listed under", () => {
  expect(parseOfacSdn(XML).map((e) => e.address.toLowerCase())).toEqual([
    "0x098b716b8aaf21512996dc57eb0615e2383e2f96",
    "0x252a8bd2319d8a555b872990601221b3a2053bce",
    "0xdcbeffbecce100cce9e4b153c4e15cb885643193",
  ])
})

test("all entries are sanctioned, from ofac, with the name and programs", () => {
  const [first, , third] = parseOfacSdn(XML)
  expect(first).toEqual({
    address: "0x098B716B8Aaf21512996dC57EB0615e2383E2f96",
    source: "ofac",
    category: "sanctioned",
    reason: "OFAC SDN: LAZARUS GROUP (DPRK3, CYBER2)",
  })
  expect(third?.reason).toBe("OFAC SDN: Roman SEMENOV & CO (CYBER2)")
})

test("an address listed twice keeps the first entry", () => {
  const dupes = parseOfacSdn(XML).filter((e) => e.address.toLowerCase() === "0x098b716b8aaf21512996dc57eb0615e2383e2f96")
  expect(dupes).toHaveLength(1)
})

test("refuses something that isn't the SDN list", () => {
  expect(() => parseOfacSdn("<html>maintenance</html>")).toThrow("not an SDN list")
})
