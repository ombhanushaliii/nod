// Service-role Supabase client. Only this function holds the key; every table
// has RLS on with no policies, so nothing else can read or write.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createDb(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
