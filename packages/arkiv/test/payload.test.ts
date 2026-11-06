import { expect, test } from "bun:test"
import { deriveEncKey, intentHash, open, seal } from "../src/crypto"
import { parseExportPayload, parsePaymentPayload, type PaymentRequestPayload, usdcToUnits } from "../src/payload"

const payload: PaymentRequestPayload = {
  v: 1, kind: "payment", paymentId: "p1",
  to: "0x1234567890abcdef1234567890abcdef12345678",
  amount: usdcToUnits("12.5"), nonce: `0x${"ab".repeat(32)}`,
  name: "Landlord", reasons: ["new_payee", "over_limit"], answers: [false, false, true], newPayee: true,
}

test("usdcToUnits", () => {
  expect(usdcToUnits("12.5")).toBe("12500000")
  expect(usdcToUnits("0.000001")).toBe("1")
  for (const bad of ["0", "1.0000001", "-1", "1e6", "", "1,5"]) expect(() => usdcToUnits(bad)).toThrow()
})

test("seal -> open -> parse keeps the payload, and the intent hash matches the backend vector", () => {
  const trustee = deriveEncKey(`0x${"11".repeat(65)}`)
  const back = parsePaymentPayload(open(seal(payload, trustee.publicKey), trustee.secretKey))
  expect(back).toEqual(payload)
  expect(intentHash(back!.to, BigInt(back!.amount), back!.nonce)).toBe(
    "0x7e35f3baf495f6f8baaaf7ddaac6ca1c703d2fcaca83d6f01ae1513b0ca5527e",
  )
})

test("parsePaymentPayload rejects anything off", () => {
  const bad: unknown[] = [
    null, "x", { ...payload, v: 2 }, { ...payload, to: "0xABC" }, { ...payload, to: payload.to.toUpperCase() },
    { ...payload, amount: "12.5" }, { ...payload, amount: "0" }, { ...payload, nonce: "0x12" },
    { ...payload, answers: [true, false] }, { ...payload, reasons: [1] }, { ...payload, name: "x".repeat(81) },
  ]
  for (const b of bad) expect(parsePaymentPayload(b)).toBeNull()
})

test("parseExportPayload accepts a well-formed export request only", () => {
  const good = { v: 1, kind: "export", exportId: "exp-1", nonce: `0x${"cd".repeat(32)}` }
  expect(parseExportPayload(good)).toEqual(good as never)
  expect(parseExportPayload({ ...good, kind: "payment" })).toBeNull()
  expect(parseExportPayload({ ...good, nonce: "0x12" })).toBeNull()
  expect(parseExportPayload({ ...good, exportId: "" })).toBeNull()
  expect(parseExportPayload(null)).toBeNull()
})
