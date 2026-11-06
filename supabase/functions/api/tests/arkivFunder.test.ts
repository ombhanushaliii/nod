import { assertEquals, assertRejects } from "@std/assert";
import type { Hex } from "viem";
import { MIN_BALANCE, seedFunder, type SeedWallet, TARGET } from "../lib/arkivFunder.ts";
import { addr } from "./helpers.ts";

function fakeWallet(balances: Record<string, bigint>, sendErrors: string[] = []) {
  const sent: { to: string; value: bigint }[] = [];
  let inFlight = 0, maxInFlight = 0;
  const wallet: SeedWallet = {
    balanceOf: (a) => Promise.resolve(balances[a] ?? 0n),
    async send(to, value) {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      const err = sendErrors.shift();
      if (err) throw new Error(err);
      sent.push({ to, value });
      return "0x1" as Hex;
    },
  };
  return { wallet, sent, maxInFlight: () => maxInFlight };
}

Deno.test("funder: fills a low wallet up to the target, skips one that has enough", async () => {
  const f = fakeWallet({ [addr("a")]: 0n, [addr("b")]: MIN_BALANCE - 1n, [addr("c")]: MIN_BALANCE });
  const funder = seedFunder(f.wallet);
  await funder.fund(addr("a"));
  await funder.fund(addr("B")); // mixed case is lower-cased
  await funder.fund(addr("c"));
  assertEquals(f.sent, [{ to: addr("a"), value: TARGET }, { to: addr("b"), value: TARGET - MIN_BALANCE + 1n }]);
});

Deno.test("funder: one send at a time", async () => {
  const f = fakeWallet({});
  const funder = seedFunder(f.wallet);
  await Promise.all([addr("1"), addr("2"), addr("3")].map((a) => funder.fund(a)));
  assertEquals(f.sent.length, 3);
  assertEquals(f.maxInFlight(), 1);
});

Deno.test("funder: retries once on a nonce clash, not on other errors", async () => {
  const ok = fakeWallet({}, ["nonce too low"]);
  await seedFunder(ok.wallet).fund(addr("a"));
  assertEquals(ok.sent.length, 1);

  const bad = fakeWallet({}, ["insufficient funds"]);
  const funder = seedFunder(bad.wallet);
  await assertRejects(() => funder.fund(addr("a")), Error, "insufficient funds");
  // A failure doesn't jam the queue.
  await funder.fund(addr("b"));
  assertEquals(bad.sent, [{ to: addr("b"), value: TARGET }]);
});
