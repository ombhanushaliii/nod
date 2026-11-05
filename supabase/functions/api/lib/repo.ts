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

export type Payment = NewPayment & { id: string; approvalId: string | null; createdAt: Date };
export type ActivePair = { id: string; pairId: string; pairKeyAddress: string };
export type ApprovalRow = { id: string; requestKey: string; createdAt: Date };

export type InviteView = { pairId: string; expiresAt: string; usable: boolean };

// Short codes raised by the SQL functions in the migrations.
export type InviteError = "pair_active" | "invite_not_found" | "invite_used" | "invite_expired" | "self_trustee";
export type ApprovalError =
  | "payment_not_found" | "trustee_not_needed" | "already_requested" | "no_active_trustee"
  | "request_key_used" | "not_awaiting_trustee" | "decision_key_used";
export type RepoErrorCode = InviteError | ApprovalError;

export class RepoError extends Error {
  constructor(readonly code: RepoErrorCode) {
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

  // Approvals (D5).
  getPayment(id: string, userId: string): Promise<Payment | null>;
  getActivePair(userId: string): Promise<ActivePair | null>;
  getApproval(id: string): Promise<ApprovalRow | null>;
  attachRequest(paymentId: string, userId: string, requestKey: string): Promise<void>;
  // Returns the payment's new status.
  recordDecision(paymentId: string, d: { decisionKey: string; verdict: "allow" | "deny"; validFrom: Date | null; validUntil: Date | null }): Promise<PaymentStatus>;
  // Request ran out with no decision. Returns false if the status had moved on.
  expirePayment(paymentId: string): Promise<boolean>;
}

const date = (v: string | null) => (v ? new Date(v) : null);

const KNOWN: RepoErrorCode[] = [
  "pair_active", "invite_not_found", "invite_used", "invite_expired", "self_trustee",
  "payment_not_found", "trustee_not_needed", "already_requested", "no_active_trustee",
  "request_key_used", "not_awaiting_trustee", "decision_key_used",
];

function rethrow(error: { message: string }): never {
  const code = KNOWN.find((k) => error.message === k);
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

    async getPayment(id, userId) {
      const { data, error } = await db.from("payments").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
      if (error) rethrow(error);
      if (!data) return null;
      return {
        id: data.id, userId: data.user_id, toAddress: data.to_address, amount: BigInt(data.amount),
        verdict: data.verdict, reasons: data.reasons, status: data.status,
        unlockAt: date(data.unlock_at), nonce: data.nonce, approvalId: data.approval_id,
        createdAt: new Date(data.created_at),
      };
    },
    async getActivePair(userId) {
      const { data, error } = await db.from("pairs").select("id, pair_id, pair_key_address")
        .eq("user_id", userId).eq("status", "active").maybeSingle();
      if (error) rethrow(error);
      return data ? { id: data.id, pairId: data.pair_id, pairKeyAddress: data.pair_key_address } : null;
    },
    async getApproval(id) {
      const { data, error } = await db.from("approvals").select("id, request_key, created_at").eq("id", id).maybeSingle();
      if (error) rethrow(error);
      return data ? { id: data.id, requestKey: data.request_key, createdAt: new Date(data.created_at) } : null;
    },
    async attachRequest(paymentId, userId, requestKey) {
      const { error } = await db.rpc("attach_approval_request", {
        p_payment_id: paymentId, p_user_id: userId, p_request_key: requestKey,
      });
      if (error) rethrow(error);
    },
    async recordDecision(paymentId, d) {
      const { data, error } = await db.rpc("record_decision", {
        p_payment_id: paymentId, p_decision_key: d.decisionKey, p_verdict: d.verdict,
        p_valid_from: d.validFrom?.toISOString() ?? null, p_valid_until: d.validUntil?.toISOString() ?? null,
      });
      if (error) rethrow(error);
      return data as PaymentStatus;
    },
    async expirePayment(paymentId) {
      const { data, error } = await db.from("payments").update({ status: "expired" })
        .eq("id", paymentId).eq("status", "awaiting_trustee").select("id");
      if (error) rethrow(error);
      return data.length > 0;
    },
  };
}
