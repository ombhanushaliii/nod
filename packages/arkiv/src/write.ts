import {
  createWalletClient,
  type CreateEntityOptions,
  type CreateEntityReturnType,
  type CreateEntityValues,
  type DeleteEntityParameters,
  type DeleteEntityReturnType,
  type ExtendEntityParameters,
  type ExtendEntityReturnType,
  type Schema,
  type TxParams,
  type WalletArkivClient,
} from "@arkiv-network/sdk"
import { custom, type Address } from "viem"
import { getBlock, getGasPrice, getTransactionCount, getTransactionReceipt } from "viem/actions"

// Write rules from the Arkiv plugin (Rabdi):
// estimate first, then send with explicit gas, latest nonce and current gas price.
// Check the receipt. Never retry on our own.

const RABDI_CHAIN_ID = 7794095
const GAS_FLOOR = 1_000_000n

// Only these calls may pass while we estimate. Anything else (like sending) is blocked.
const ESTIMATE_READS = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getTransactionCount",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_estimateGas",
])

class EstimateDone extends Error {}

// Runs the write up to the gas estimate and stops there. Nothing is signed or sent.
async function estimate(
  wallet: WalletArkivClient,
  address: Address,
  write: (dryRun: WalletArkivClient) => Promise<unknown>,
): Promise<bigint> {
  let gas: bigint | undefined
  const transport = custom(
    {
      async request(args: { method: string; params?: unknown[] }) {
        if (!ESTIMATE_READS.has(args.method)) throw new Error("Blocked during estimate")
        const params =
          args.method === "eth_estimateGas" ? [args.params?.[0], "latest"] : args.params
        const result = await wallet.request({ method: args.method, params } as never)
        if (args.method === "eth_estimateGas") {
          gas = BigInt(result as string)
          throw new EstimateDone()
        }
        return result
      },
    },
    { retryCount: 0 },
  )
  const dryRun = createWalletClient({ account: address, chain: wallet.chain, transport })
  try {
    await write(dryRun)
  } catch {
    // Expected: we throw EstimateDone on purpose
  }
  if (gas === undefined || gas <= 0n) throw new Error("Gas estimate failed")
  return gas
}

// gas = max(1,000,000, 2 x estimate), and it must fit in half a block
async function txParams(wallet: WalletArkivClient, address: Address, estimate: bigint): Promise<TxParams> {
  const gas = 2n * estimate > GAS_FLOOR ? 2n * estimate : GAS_FLOOR
  const block = await getBlock(wallet, { blockTag: "latest" })
  if (gas > block.gasLimit / 2n) throw new Error("Gas is more than half the block limit")

  const latest = await getTransactionCount(wallet, { address, blockTag: "latest" })
  const pending = await getTransactionCount(wallet, { address, blockTag: "pending" })
  if (latest !== pending) throw new Error("This wallet has a pending transaction, wait for it first")

  return { gas, nonce: latest, gasPrice: await getGasPrice(wallet) }
}

// Estimate, send with explicit params, then check the receipt. No retry.
async function safeWrite<R extends { txHash: `0x${string}` }>(
  wallet: WalletArkivClient,
  write: (client: WalletArkivClient, params?: TxParams) => Promise<R>,
): Promise<R> {
  if (!wallet.account) throw new Error("Wallet has no account")
  if (wallet.chain?.id !== RABDI_CHAIN_ID) throw new Error("Wallet is not on Rabdi")
  const address = wallet.account.address

  const gas = await estimate(wallet, address, (dryRun) => write(dryRun))
  const params = await txParams(wallet, address, gas)
  const result = await write(wallet, params)

  const receipt = await getTransactionReceipt(wallet, { hash: result.txHash })
  if (receipt.status !== "success") {
    // Don't send again here. Check the tx hash first.
    throw new Error(`Receipt is not success for ${result.txHash}`)
  }
  return result
}

// Creates one entity safely
export function safeCreate<S extends Schema>(
  wallet: WalletArkivClient,
  schema: S,
  values: CreateEntityValues<S>,
  options: CreateEntityOptions,
): Promise<CreateEntityReturnType> {
  return safeWrite(wallet, (client, params) => client.createEntity(schema, values, options, params))
}

// Extends one entity's expiry safely (used by the renewer)
export function safeExtend(
  wallet: WalletArkivClient,
  data: ExtendEntityParameters,
): Promise<ExtendEntityReturnType> {
  return safeWrite(wallet, (client, params) => client.extendEntity(data, params))
}

// Deletes one entity safely (the importer's --prune: reports for addresses
// no list has any more). Only the entity's owner can delete it.
export function safeDelete(
  wallet: WalletArkivClient,
  data: DeleteEntityParameters,
): Promise<DeleteEntityReturnType> {
  return safeWrite(wallet, (client, params) => client.deleteEntity(data, params))
}
