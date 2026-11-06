// Values the app, this package and the backend must all agree on. The same
// vector is in supabase/functions/api/tests/intent.test.ts.
import { expect, test } from "bun:test"
import { EXPORT_TAG, exportIntentHash, intentHash, pairKeyMessage } from "../src/crypto"

test("intentHash matches the backend's abi.encode(address, uint256, bytes32)", () => {
  expect(
    intentHash("0x1234567890abcdef1234567890abcdef12345678", 12_500_000n, `0x${"ab".repeat(32)}`),
  ).toBe("0x7e35f3baf495f6f8baaaf7ddaac6ca1c703d2fcaca83d6f01ae1513b0ca5527e")
})

test("intentHash changes with any field", () => {
  const base = intentHash("0x1234567890abcdef1234567890abcdef12345678", 1n, `0x${"00".repeat(32)}`)
  expect(intentHash("0x1234567890abcdef1234567890abcdef12345679", 1n, `0x${"00".repeat(32)}`)).not.toBe(base)
  expect(intentHash("0x1234567890abcdef1234567890abcdef12345678", 2n, `0x${"00".repeat(32)}`)).not.toBe(base)
  expect(intentHash("0x1234567890abcdef1234567890abcdef12345678", 1n, `0x${"00".repeat(31)}01`)).not.toBe(base)
})

test("pair key message is fixed", () => {
  expect(pairKeyMessage("0xabc")).toBe("guardian-pair:0xabc")
})

test("exportIntentHash matches the backend's abi.encode(bytes32 tag, address, bytes32)", () => {
  expect(EXPORT_TAG).toBe("0x9a970eaf11e767508bd1372d4686bb92eed8ff13c3ba8a09e794120412f81970")
  expect(exportIntentHash("0x1234567890abcdef1234567890abcdef12345678", `0x${"cd".repeat(32)}`))
    .toBe("0x5609f52abe2747d8cd54a43bc45bb6b3449b3c36784df957b1b5e83d8b92f5bf")
})

test("an export hash never equals a payment hash for the same values", () => {
  const nonce = `0x${"cd".repeat(32)}` as const
  expect(exportIntentHash("0x1234567890abcdef1234567890abcdef12345678", nonce))
    .not.toBe(intentHash("0x1234567890abcdef1234567890abcdef12345678", 0n, nonce))
})
