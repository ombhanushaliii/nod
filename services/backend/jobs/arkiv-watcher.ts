import type { PublicArkivClient } from "@arkiv-network/sdk"
import type { Hex } from "viem"
import { queryPendingRequests } from "../../../packages/arkiv/src/index"

// Push watcher (D9): polls Arkiv for new approval requests and asks C's sender to push the trustee.
// The push carries no details, only the pairId goes to the sender.
export function createWatcher(deps: {
  client: PublicArkivClient
  getPairIds: () => Promise<string[]>
  sendPush: (pairId: string) => Promise<void>
}) {
  // Requests we already pushed. Lost on restart, so a live request may be pushed again.
  const pushed = new Set<Hex>()

  return async function tick() {
    const pairIds = await deps.getPairIds()
    const requests = await queryPendingRequests(deps.client, pairIds)

    for (const req of requests) {
      if (pushed.has(req.key)) continue
      try {
        await deps.sendPush(req.pairId)
        pushed.add(req.key)
      } catch (err) {
        // Not marked, so the next tick tries again
        console.error(`push failed for request ${req.key}:`, err)
      }
    }

    // Forget requests that expired, so the set stays small
    const live = new Set(requests.map((r) => r.key))
    for (const key of pushed) if (!live.has(key)) pushed.delete(key)
  }
}
