// All database access goes through this interface, so endpoints can be tested
// with an in-memory fake. supabaseRepo is the real implementation.
import type { SupabaseClient } from "@supabase/supabase-js";

export type User = { id: string; privy_user_id: string; wallet_address: string; created_at: string };

export type InviteView = { pairId: string; expiresAt: string; usable: boolean };

// Short codes raised by the SQL functions in the invite_functions migration.
export type InviteError = "pair_active" | "invite_not_found" | "invite_used" | "invite_expired" | "self_trustee";

export class RepoError extends Error {
  constructor(readonly code: InviteError) {
    super(code);
  }
}

export interface Repo {
  findUserByPrivyId(privyUserId: string): Promise<User | null>;
  findUserByWallet(address: string): Promise<User | null>;
  // Creates the user and their default rules.
  createUser(privyUserId: string, walletAddress: string): Promise<User>;
  createInvite(args: { userId: string; pairId: string; contact: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  findInvite(tokenHash: string): Promise<InviteView | null>;
  // Returns the Arkiv pairId.
  acceptInvite(args: { tokenHash: string; trusteeId: string; pairKeyAddress: string; encPubKey: string }): Promise<string>;
}

const KNOWN: InviteError[] = ["pair_active", "invite_not_found", "invite_used", "invite_expired", "self_trustee"];

function rethrow(error: { message: string }): never {
  const code = KNOWN.find((k) => error.message.includes(k));
  if (code) throw new RepoError(code);
  throw new Error(error.message);
}

export function supabaseRepo(db: SupabaseClient): Repo {
  return {
    async findUserByPrivyId(privyUserId) {
      const { data, error } = await db.from("users").select("*").eq("privy_user_id", privyUserId).maybeSingle();
      if (error) rethrow(error);
      return data;
    },
    async findUserByWallet(address) {
      const { data, error } = await db.from("users").select("*").eq("wallet_address", address).maybeSingle();
      if (error) rethrow(error);
      return data;
    },
    async createUser(privyUserId, walletAddress) {
      const { data, error } = await db.from("users")
        .insert({ privy_user_id: privyUserId, wallet_address: walletAddress }).select("*").single();
      if (error) rethrow(error);
      const rules = await db.from("rules").insert({ user_id: data.id });
      if (rules.error) rethrow(rules.error);
      return data;
    },
    async createInvite({ userId, pairId, contact, tokenHash, expiresAt }) {
      const { error } = await db.rpc("create_invite", {
        p_user_id: userId, p_pair_id: pairId, p_contact: contact,
        p_token_hash: tokenHash, p_expires_at: expiresAt.toISOString(),
      });
      if (error) rethrow(error);
    },
    async findInvite(tokenHash) {
      const { data, error } = await db.from("invites")
        .select("expires_at, accepted_at, pairs!inner(pair_id, status)")
        .eq("token_hash", tokenHash).maybeSingle();
      if (error) rethrow(error);
      if (!data) return null;
      const pair = data.pairs as unknown as { pair_id: string; status: string };
      return {
        pairId: pair.pair_id,
        expiresAt: data.expires_at,
        usable: !data.accepted_at && pair.status === "invited" && new Date(data.expires_at) > new Date(),
      };
    },
    async acceptInvite({ tokenHash, trusteeId, pairKeyAddress, encPubKey }) {
      const { data, error } = await db.rpc("accept_invite", {
        p_token_hash: tokenHash, p_trustee_id: trusteeId,
        p_pair_key_address: pairKeyAddress, p_enc_pubkey: encPubKey,
      });
      if (error) rethrow(error);
      return data as string;
    },
  };
}
