import {
  ExpirationTime,
  NoEntityFoundError,
  type PublicArkivClient,
  type WalletArkivClient,
} from "@arkiv-network/sdk"
import type { Hex } from "viem"
import { safeExtend } from "../../../packages/arkiv/src/index"

// 30 days in blocks (2 s per block)
const RENEW_WINDOW = (30n * 24n * 60n * 60n) / 2n

// Renewer (D6): keeps reports that are on file in Supabase alive on Arkiv.
// Under 30 days left -> extend to the max (~182.5 days), paid by the seed wallet.
// Works because reports are created with permissionlessExtension.
export async function runRenewer(deps: {
  client: PublicArkivClient
  seed: WalletArkivClient
  listArchivedKeys: () => Promise<Hex[]>
}) {
  const keys = await deps.listArchivedKeys()
  const head = await deps.client.getBlockNumber({ cacheTime: 0 })
  let renewed = 0

  for (const key of keys) {
    let expiresAt: bigint
    try {
      expiresAt = (await deps.client.getEntity(key)).$expiresAt
    } catch (err) {
      // Already expired or deleted: nothing to renew
      if (err instanceof NoEntityFoundError) continue
      throw err
    }
    if (expiresAt - head >= RENEW_WINDOW) continue

    // One at a time. Any error stops the run, so we never send twice by mistake.
    await safeExtend(deps.seed, { entityKey: key, expiration: ExpirationTime.max() })
    renewed++
  }
  return renewed
}
