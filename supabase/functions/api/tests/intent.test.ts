import { assertEquals } from "@std/assert";
import { EXPORT_TAG, exportIntentHash, intentHash } from "../lib/intent.ts";

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

// Expected value computed with viem (packages/arkiv exportIntentHash):
// keccak256(encodeAbiParameters([bytes32, address, bytes32], [EXPORT_TAG, wallet, nonce]))
Deno.test("exportIntentHash matches the Arkiv package", () => {
  assertEquals(EXPORT_TAG, "0x9a970eaf11e767508bd1372d4686bb92eed8ff13c3ba8a09e794120412f81970");
  assertEquals(
    exportIntentHash("0x1234567890ABCDEF1234567890abcdef12345678", "0x" + "cd".repeat(32)),
    "0x5609f52abe2747d8cd54a43bc45bb6b3449b3c36784df957b1b5e83d8b92f5bf",
  );
});
