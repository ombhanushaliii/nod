import { createPublicClient, createWalletClient } from "@arkiv-network/sdk"
import { rabdi } from "@arkiv-network/sdk/chains"
import { http, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"

// Env vars for the Arkiv jobs. Keep them server-side only.
function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing env var ${name}`)
  return value
}

// Fresh reads, no retries, no redirects (the access key is in the URL)
function transport() {
  return http(undefined, { timeout: 10_000, retryCount: 0, fetchOptions: { cache: "no-store", redirect: "error" } })
}

export function arkivReader() {
  return createPublicClient({ chain: rabdi({ accessKey: env("ARKIV_ACCESS_KEY") }), transport: transport(), cacheTime: 0 })
}

// Seed wallet: writes imported reports and pays for renewals
export function seedWallet() {
  return createWalletClient({
    account: privateKeyToAccount(env("SEED_PRIVATE_KEY") as Hex),
    chain: rabdi({ accessKey: env("ARKIV_ACCESS_KEY") }),
    transport: transport(),
  })
}
