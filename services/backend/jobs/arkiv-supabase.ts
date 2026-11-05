import { createClient } from "@supabase/supabase-js"
import type { Address } from "viem"

// Reads from the pairs table (docs: task-split §4). C owns the table.
function supabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  return createClient(url, key, { auth: { persistSession: false } })
}

// pairIds the push watcher looks for
export async function acceptedPairIds(): Promise<string[]> {
  const { data, error } = await supabase().from("pairs").select("pair_id").eq("status", "accepted")
  if (error) throw new Error(`Supabase pairs read failed: ${error.message}`)
  return data.map((row) => row.pair_id as string)
}

// Per-pair keys, used to mark reports as verified
export async function pairKeyAddresses(): Promise<Address[]> {
  const { data, error } = await supabase().from("pairs").select("pair_key_address").not("pair_key_address", "is", null)
  if (error) throw new Error(`Supabase pairs read failed: ${error.message}`)
  return data.map((row) => row.pair_key_address as Address)
}
