// Values the app, this package and the backend must all agree on. The same
// vector is in supabase/functions/api/tests/intent.test.ts.
import { expect, test } from "bun:test"
import { intentHash, pairKeyMessage } from "../src/crypto"

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
