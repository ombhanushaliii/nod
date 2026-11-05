// All database access goes through this interface, so endpoints can be tested
// with an in-memory fake. supabaseRepo is the real implementation.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotifyMode, Verdict } from "./rules.ts";

export type User = { id: string; privy_user_id: string; wallet_address: string; created_at: string };

export type Payee = { firstAttemptAt: Date; firstPaidAt: Date | null; overLimitApprovedAt: Date | null };
export type Rules = { amountLimit: bigint; notifyMode: NotifyMode };
export type PaymentStatus =
  | "checked" | "refused" | "awaiting_trustee" | "denied" | "cooling_down"
  | "ready" | "sent" | "failed" | "expired";
export type NewPayment = {
  userId: string; toAddress: string; amount: bigint; verdict: Verdict; reasons: string[];
  status: PaymentStatus; unlockAt: Date | null; nonce: string;
};

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

  // Payments (D3).
  hasActivePair(userId: string): Promise<boolean>;
  // Records the first attempt to pay this address (starts the no-trustee cooldown).
  touchPayee(userId: string, address: string): Promise<Payee>;
  getRules(userId: string): Promise<Rules>;
  hasSentPayment(userId: string): Promise<boolean>;
  paidPayees(userId: string): Promise<string[]>;
  createPayment(p: NewPayment): Promise<{ id: string }>;
}

const date = (v: string | null) => (v ? new Date(v) : null);

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

    async hasActivePair(userId) {
      const { count, error } = await db.from("pairs").select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("status", "active");
      if (error) rethrow(error);
      return (count ?? 0) > 0;
    },
    async touchPayee(userId, address) {
      const ins = await db.from("payees").upsert({ user_id: userId, address }, { onConflict: "user_id,address", ignoreDuplicates: true });
      if (ins.error) rethrow(ins.error);
      const { data, error } = await db.from("payees")
        .select("first_attempt_at, first_paid_at, over_limit_approved_at")
        .eq("user_id", userId).eq("address", address).single();
      if (error) rethrow(error);
      return {
        firstAttemptAt: new Date(data.first_attempt_at),
        firstPaidAt: date(data.first_paid_at),
        overLimitApprovedAt: date(data.over_limit_approved_at),
      };
    },
    async getRules(userId) {
      const { data, error } = await db.from("rules").select("amount_limit, notify_mode").eq("user_id", userId).single();
      if (error) rethrow(error);
      return { amountLimit: BigInt(data.amount_limit), notifyMode: data.notify_mode };
    },
    async hasSentPayment(userId) {
      const { count, error } = await db.from("payments").select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("status", "sent");
      if (error) rethrow(error);
      return (count ?? 0) > 0;
    },
    async paidPayees(userId) {
      const { data, error } = await db.from("payees").select("address")
        .eq("user_id", userId).not("first_paid_at", "is", null);
      if (error) rethrow(error);
      return data.map((r) => r.address);
    },
    async createPayment(p) {
      const { data, error } = await db.from("payments").insert({
        user_id: p.userId, to_address: p.toAddress, amount: p.amount.toString(),
        verdict: p.verdict, reasons: p.reasons, status: p.status,
        unlock_at: p.unlockAt?.toISOString() ?? null, nonce: p.nonce,
      }).select("id").single();
      if (error) rethrow(error);
      return data;
    },
  };
}
