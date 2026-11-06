// Tops up wallets with tGLM on Rabdi from the backend's seed wallet, so users
// and trustees can write to Arkiv without ever seeing a faucet (D1).
//
// An Arkiv write costs about 0.00002-0.0002 tGLM. A wallet below MIN_BALANCE
// is filled back up to TARGET (enough for hundreds of writes), so calling
// fund() again is cheap and safe: a wallet that has enough gets nothing.
import { rabdi } from "@arkiv-network/sdk/chains";
import { createPublicClient, createWalletClient, type Hex, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ArkivFunder } from "./services.ts";

export const TARGET = parseEther("0.01");
export const MIN_BALANCE = parseEther("0.005");

export interface SeedWallet {
  balanceOf(address: Hex): Promise<bigint>;
  // Sends tGLM; resolves once the node accepts the transaction (not mined).
  send(to: Hex, value: bigint): Promise<Hex>;
}

export function rabdiSeedWallet(privateKey: Hex, accessKey: string): SeedWallet {
  const chain = rabdi({ accessKey });
  const transport = http(undefined, { timeout: 10_000, retryCount: 0, fetchOptions: { redirect: "error" } });
  const pub = createPublicClient({ chain, transport });
  const wallet = createWalletClient({ chain, transport, account: privateKeyToAccount(privateKey) });
  return {
    balanceOf: (address) => pub.getBalance({ address }),
    send: (to, value) => wallet.sendTransaction({ to, value }),
  };
}

// Another send (another function instance, or a job) took the same nonce.
const isNonceClash = (err: unknown) =>
  /nonce too low|replacement transaction underpriced|already known/i.test(String((err as Error)?.message ?? err));

export function seedFunder(wallet: SeedWallet): ArkivFunder {
  // One send at a time from this instance, so two sign-ups don't pick the same nonce.
  let queue: Promise<unknown> = Promise.resolve();

  async function topUp(address: Hex) {
    const balance = await wallet.balanceOf(address);
    if (balance >= MIN_BALANCE) return;
    try {
      await wallet.send(address, TARGET - balance);
    } catch (err) {
      if (!isNonceClash(err)) throw err;
      await wallet.send(address, TARGET - balance);
    }
  }

  return {
    fund(address) {
      const run = queue.then(() => topUp(address.toLowerCase() as Hex));
      queue = run.catch(() => {});
      return run;
    },
  };
}
