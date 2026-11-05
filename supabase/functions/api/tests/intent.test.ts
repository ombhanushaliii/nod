import { assertEquals } from "@std/assert";
import { intentHash } from "../lib/intent.ts";

// Expected value computed with viem:
// keccak256(encodeAbiParameters([address, uint256, bytes32], [to, 12_500_000n, nonce]))
Deno.test("intentHash matches viem's abi.encode + keccak256", () => {
  assertEquals(
    intentHash("0x1234567890abcdef1234567890abcdef12345678", 12_500_000n, "0x" + "ab".repeat(32)),
    "0x7e35f3baf495f6f8baaaf7ddaac6ca1c703d2fcaca83d6f01ae1513b0ca5527e",
  );
});

Deno.test("intentHash ignores address case", () => {
  assertEquals(
    intentHash("0x1234567890ABCDEF1234567890abcdef12345678", 1n, "0x" + "00".repeat(32)),
    intentHash("0x1234567890abcdef1234567890abcdef12345678", 1n, "0x" + "00".repeat(32)),
  );
});
