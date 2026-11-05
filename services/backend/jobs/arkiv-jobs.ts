import type { Hex } from "viem"
import { arkivReader, seedWallet } from "./arkiv-clients"
import { type ArchiveRow, runMirror } from "./arkiv-mirror"
import { runRenewer } from "./arkiv-renewer"
import { acceptedPairIds, pairKeyAddresses } from "./arkiv-supabase"
import { createWatcher } from "./arkiv-watcher"

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// Runs a job now and then every `ms`. Skips a run if the last one is still going.
function every(name: string, ms: number, job: () => Promise<unknown>) {
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      await job()
    } catch (err) {
      console.error(`[${name}] failed:`, err)
    } finally {
      running = false
    }
  }
  void run()
  return setInterval(run, ms)
}

// Starts all Arkiv jobs in this process. C passes in the parts they own.
// Returns a function that stops them.
export function startArkivJobs(deps: {
  sendPush: (pairId: string) => Promise<void>
  saveReports: (rows: ArchiveRow[]) => Promise<void>
  listArchivedKeys: () => Promise<Hex[]>
}) {
  const client = arkivReader()
  const seed = seedWallet()
  const watch = createWatcher({ client, getPairIds: acceptedPairIds, sendPush: deps.sendPush })

  const timers = [
    every("watcher", MINUTE, watch),
    every("mirror", HOUR, () =>
      runMirror({
        client,
        trustedCreators: async () => [seed.account.address, ...(await pairKeyAddresses())],
        saveReports: deps.saveReports,
      }),
    ),
    every("renewer", DAY, () => runRenewer({ client, seed, listArchivedKeys: deps.listArchivedKeys })),
  ]
  return () => timers.forEach(clearInterval)
}
