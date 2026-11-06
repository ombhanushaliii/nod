// Paging and decision rules, with a fake client (no network).
import { expect, test } from "bun:test"
import type { PublicArkivClient } from "@arkiv-network/sdk"
import { getDecision, listReports } from "../src/query"

const hexKey = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as const
const A = `0x${"a".repeat(40)}` as const

function fake(pages: (offset: number) => { entities: unknown[]; skipped: number }) {
  const calls: { offset?: number; createdBy?: string }[] = []
  const client = {
    select: () => {
      const call: { offset?: number; createdBy?: string } = {}
      calls.push(call)
      const q = {
        from: () => q, where: () => q, orderBy: () => q, limit: () => q,
        offset: (n: number) => ((call.offset = n), q),
        createdBy: (c: string) => ((call.createdBy = c), q),
        ownedBy: () => { throw new Error("ownedBy must not be used") },
        fetch: () => Promise.resolve(pages(call.offset ?? 0)),
      }
      return q
    },
  } as unknown as PublicArkivClient
  return { client, calls }
}

const report = (n: number) => ({
  $key: hexKey(n), $creator: A, $expiresAt: 1n,
  address: { value: A }, source: { value: "list" }, category: { value: "exploit" },
  reason: { value: "0x" }, evidenceRef: undefined,
})

test("listReports: skipped entities count toward a full page, so paging goes on", async () => {
  const { client, calls } = fake((offset) =>
    offset === 0
      ? { entities: Array.from({ length: 60 }, (_, i) => report(i)), skipped: 40 }
      : { entities: [report(100), report(59)], skipped: 0 }, // 59 repeats: dropped
  )
  const rows = await listReports(client)
  expect(calls.map((c) => c.offset)).toEqual([0, 100])
  expect(rows.length).toBe(61)
})

const decision = (n: number, verdict: string, createdAt: bigint) => ({
  $key: hexKey(n), $creator: A, $createdAt: createdAt, $expiresAt: 9n,
  pairId: { value: "p" }, verdict: { value: verdict }, createdAt: { value: 0n },
  intentHash: undefined, validFrom: undefined, reportKey: undefined,
})

test("getDecision: by creator; any deny wins, else the earliest allow", async () => {
  const one = fake(() => ({ entities: [decision(1, "allow", 5n), decision(2, "allow", 3n), decision(3, "maybe", 1n)], skipped: 0 }))
  expect((await getDecision(one.client, hexKey(9), A))?.key).toBe(hexKey(2))
  expect(one.calls[0]?.createdBy).toBe(A)

  const deny = fake(() => ({ entities: [decision(1, "allow", 1n), decision(2, "deny", 9n)], skipped: 0 }))
  expect((await getDecision(deny.client, hexKey(9), A))?.verdict).toBe("deny")

  const none = fake(() => ({ entities: [], skipped: 3 }))
  expect(await getDecision(none.client, hexKey(9), A)).toBeNull()
})
