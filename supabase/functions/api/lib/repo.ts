// All database access goes through this interface, so endpoints can be tested
// with an in-memory fake. supabaseRepo is the real implementation.
import type { JobsRepo } from "./jobs.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotifyMode, Verdict } from "./rules.ts";

export type User = {
  id: string; privy_user_id: string; wallet_address: string; privy_wallet_id: string | null; created_at: string;
};

export type Payee = { firstAttemptAt: Date; firstPaidAt: Date | null; overLimitApprovedAt: Date | null };
export type Rules = { amountLimit: bigint; notifyMode: NotifyMode };
export type PaymentStatus =
  | "checked" | "refused" | "awaiting_trustee" | "denied" | "cooling_down"
  | "ready" | "sending" | "submitted" | "sent" | "failed" | "expired";
export type NewPayment = {
  userId: string; toAddress: string; amount: bigint; verdict: Verdict; reasons: string[];
  status: PaymentStatus; unlockAt: Date | null; nonce: string;
};

export type Payment = NewPayment & {
  id: string; approvalId: string | null; createdAt: Date;
  // Set once Privy accepted / confirmed the transaction.
  privyTransactionId?: string | null; txHash?: string | null; failureReason?: string | null;
};
export type ActivePair = { id: string; pairId: string; pairKeyAddress: string; trusteeId: string };
export type ApprovalRow = { id: string; requestKey: string; createdAt: Date };

export type InviteView = { pairId: string; expiresAt: string; usable: boolean };
// The user's open pair: waiting for the trustee, or active.
export type UserPair =
  | { status: "invited"; pairId: string; contact: string; inviteExpiresAt: Date }
  | { status: "active"; pairId: string; trusteeEncPubKey: string; acceptedAt: Date };

export type RuleChange = { from: Rules; to: Rules; at: Date };
export type RulesView = Rules & { updatedAt: Date; setByTrustee: boolean; history: RuleChange[] };
export type ProtectedUser = { pairId: string; userId: string; walletAddress: string; pairKeyAddress: string; rules: Rules };

// Short codes raised by the SQL functions in the migrations.
export type InviteError = "pair_active" | "invite_not_found" | "invite_used" | "invite_expired" | "self_trustee";
export type ApprovalError =
  | "payment_not_found" | "trustee_not_needed" | "already_requested" | "no_active_trustee"
  | "request_key_used" | "not_awaiting_trustee" | "decision_key_used"
  | "still_cooling_down" | "not_ready" | "check_stale" | "approval_not_usable" | "not_sending";
export type RulesError = "not_your_pair";
export type RepoErrorCode = InviteError | ApprovalError | RulesError;

export class RepoError extends Error {
  constructor(readonly code: RepoErrorCode) {
    super(code);
  }
}

export interface Repo extends JobsRepo {
  findUserByPrivyId(privyUserId: string): Promise<User | null>;
  findUserByWallet(address: string): Promise<User | null>;
  // Creates the user and their default rules.
  createUser(privyUserId: string, walletAddress: string, privyWalletId: string): Promise<User>;
  createInvite(args: { userId: string; pairId: string; contact: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  findInvite(tokenHash: string): Promise<InviteView | null>;
  userPair(userId: string): Promise<UserPair | null>;
  // The user a pair protects.
  pairUserId(pairId: string): Promise<string | null>;
  // An active pair this person is the trustee of, with the user it protects.
  trusteePair(pairId: string, trusteeId: string): Promise<(ActivePair & { userId: string }) | null>;
  // The user's payment that an Arkiv approval request was attached to.
  paymentByRequestKey(requestKey: string, userId: string): Promise<Payment | null>;
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

  // Sending (D3a). claim: ready -> sending and marks the approval used, or throws.
  claimPayment(paymentId: string, userId: string, maxCheckAgeMs: number): Promise<Payment>;
  markSubmitted(paymentId: string, r: { transactionId: string | null; userOperationHash: string | null; hash: string | null }): Promise<void>;
  // Privy refused: back to ready, approval usable again.
  releasePayment(paymentId: string): Promise<void>;
  // submitted -> sent / failed. Idempotent; returns the status afterwards.
  settlePayment(paymentId: string, s: { outcome: "sent"; hash: string } | { outcome: "failed"; reason: string }): Promise<PaymentStatus>;
  // Newest first.
  listPayments(userId: string, limit: number): Promise<Payment[]>;

  // Rules: only the trustee changes them, and changes apply at once.
  // History is newest first.
  rulesView(userId: string, historyLimit: number): Promise<RulesView>;
  // Users this person is the trustee for.
  protectedUsers(trusteeId: string): Promise<ProtectedUser[]>;
  // Null = keep. Throws not_your_pair unless trusteeId is this pair's active trustee.
  setRules(pairId: string, trusteeId: string, patch: { amountLimit: bigint | null; notifyMode: NotifyMode | null }): Promise<Rules>;

  // Push tokens. A token belongs to the last user who registered it on that device.
  registerPushToken(userId: string, expoToken: string): Promise<void>;
  removePushToken(userId: string, expoToken: string): Promise<void>;
  pushTokensFor(userId: string): Promise<string[]>;
  deletePushTokens(expoTokens: string[]): Promise<void>;

  // Scam reports. Lower-case pair keys of every trustee who ever accepted:
  // reports they wrote count as verified, even after the pair ends.
  trusteePairKeys(): Promise<string[]>;
  // Pair keys of the active pairs this person is the trustee for (to top up tGLM).
  pairKeysOfTrustee(trusteeId: string): Promise<string[]>;
  // Counts from the Supabase archive, used when Arkiv can't be reached.
  archivedReportCounts(address: string): Promise<{ verified: number; unverified: number }>;
}

const date = (v: string | null) => (v ? new Date(v) : null);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KNOWN: RepoErrorCode[] = [
  "pair_active", "invite_not_found", "invite_used", "invite_expired", "self_trustee",
  "payment_not_found", "trustee_not_needed", "already_requested", "no_active_trustee",
  "request_key_used", "not_awaiting_trustee", "decision_key_used",
  "still_cooling_down", "not_ready", "check_stale", "approval_not_usable", "not_sending",
  "not_your_pair",
];

// deno-lint-ignore no-explicit-any
function toPayment(data: any): Payment {
  return {
    id: data.id, userId: data.user_id, toAddress: data.to_address, amount: BigInt(data.amount),
    verdict: data.verdict, reasons: data.reasons, status: data.status,
    unlockAt: date(data.unlock_at), nonce: data.nonce, approvalId: data.approval_id,
    createdAt: new Date(data.created_at),
    privyTransactionId: data.privy_transaction_id ?? null, txHash: data.tx_hash ?? null,
    failureReason: data.failure_reason ?? null,
  };
}

// deno-lint-ignore no-explicit-any
const toRules = (r: any): Rules => ({ amountLimit: BigInt(r.amount_limit), notifyMode: r.notify_mode });

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
    async createUser(privyUserId, walletAddress, privyWalletId) {
      const { data, error } = await db.from("users")
        .insert({ privy_user_id: privyUserId, wallet_address: walletAddress, privy_wallet_id: privyWalletId })
        .select("*").single();
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
    async userPair(userId) {
      const { data, error } = await db.from("pairs")
        .select("pair_id, status, trustee_enc_pubkey, accepted_at, invites(contact, expires_at)")
        .eq("user_id", userId).in("status", ["invited", "active"]).maybeSingle();
      if (error) rethrow(error);
      if (!data) return null;
      if (data.status === "active") {
        return { status: "active", pairId: data.pair_id, trusteeEncPubKey: data.trustee_enc_pubkey, acceptedAt: new Date(data.accepted_at) };
      }
      // One invite per pair; PostgREST returns it as an object or a one-item list.
      const raw = data.invites as unknown;
      const inv = (Array.isArray(raw) ? raw[0] : raw) as { contact: string; expires_at: string };
      return { status: "invited", pairId: data.pair_id, contact: inv.contact, inviteExpiresAt: new Date(inv.expires_at) };
    },
    async trusteePair(pairId, trusteeId) {
      const { data, error } = await db.from("pairs").select("id, pair_id, pair_key_address, trustee_id, user_id")
        .eq("pair_id", pairId).eq("trustee_id", trusteeId).eq("status", "active").maybeSingle();
      if (error) rethrow(error);
      return data
        ? { id: data.id, pairId: data.pair_id, pairKeyAddress: data.pair_key_address, trusteeId: data.trustee_id, userId: data.user_id }
        : null;
    },
    async paymentByRequestKey(requestKey, userId) {
      const { data, error } = await db.from("payments").select("*, approvals!inner(request_key)")
        .eq("user_id", userId).eq("approvals.request_key", requestKey.toLowerCase()).maybeSingle();
      if (error) rethrow(error);
      return data ? toPayment(data) : null;
    },
    async pairUserId(pairId) {
      const { data, error } = await db.from("pairs").select("user_id").eq("pair_id", pairId).maybeSingle();
      if (error) rethrow(error);
      return data?.user_id ?? null;
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
        .eq("user_id", userId).in("status", ["submitted", "sent"]);
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
      // Not a uuid: Postgres would raise, but it simply doesn't exist.
      if (!UUID_RE.test(id)) return null;
      const { data, error } = await db.from("payments").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
      if (error) rethrow(error);
      return data ? toPayment(data) : null;
    },
    async getActivePair(userId) {
      const { data, error } = await db.from("pairs").select("id, pair_id, pair_key_address, trustee_id")
        .eq("user_id", userId).eq("status", "active").maybeSingle();
      if (error) rethrow(error);
      return data
        ? { id: data.id, pairId: data.pair_id, pairKeyAddress: data.pair_key_address, trusteeId: data.trustee_id }
        : null;
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
    async claimPayment(paymentId, userId, maxCheckAgeMs) {
      if (!UUID_RE.test(paymentId)) throw new RepoError("payment_not_found");
      const { data, error } = await db.rpc("claim_payment", {
        p_payment_id: paymentId, p_user_id: userId, p_max_check_age: `${Math.floor(maxCheckAgeMs / 1000)} seconds`,
      });
      if (error) rethrow(error);
      return toPayment(data);
    },
    async markSubmitted(paymentId, r) {
      const { error } = await db.rpc("mark_payment_submitted", {
        p_payment_id: paymentId, p_transaction_id: r.transactionId,
        p_user_op_hash: r.userOperationHash, p_tx_hash: r.hash,
      });
      if (error) rethrow(error);
    },
    async releasePayment(paymentId) {
      const { error } = await db.rpc("release_payment", { p_payment_id: paymentId });
      if (error) rethrow(error);
    },
    async settlePayment(paymentId, s) {
      const { data, error } = await db.rpc("settle_payment", {
        p_payment_id: paymentId, p_outcome: s.outcome,
        p_tx_hash: s.outcome === "sent" ? s.hash : null, p_reason: s.outcome === "failed" ? s.reason : null,
      });
      if (error) rethrow(error);
      return data as PaymentStatus;
    },
    async listPayments(userId, limit) {
      const { data, error } = await db.from("payments").select("*").eq("user_id", userId)
        .order("created_at", { ascending: false }).limit(limit);
      if (error) rethrow(error);
      return data.map(toPayment);
    },

    async rulesView(userId, historyLimit) {
      const [rules, history] = await Promise.all([
        db.from("rules").select("amount_limit, notify_mode, updated_at, updated_by").eq("user_id", userId).single(),
        db.from("rule_history").select("*").eq("user_id", userId)
          .order("created_at", { ascending: false }).limit(historyLimit),
      ]);
      if (rules.error) rethrow(rules.error);
      if (history.error) rethrow(history.error);
      return {
        ...toRules(rules.data),
        updatedAt: new Date(rules.data.updated_at),
        setByTrustee: rules.data.updated_by !== null,
        history: history.data.map((h) => ({
          from: { amountLimit: BigInt(h.old_amount_limit), notifyMode: h.old_notify_mode },
          to: { amountLimit: BigInt(h.new_amount_limit), notifyMode: h.new_notify_mode },
          at: new Date(h.created_at),
        })),
      };
    },
    async protectedUsers(trusteeId) {
      const pairs = await db.from("pairs").select("pair_id, user_id, pair_key_address").eq("trustee_id", trusteeId).eq("status", "active");
      if (pairs.error) rethrow(pairs.error);
      if (pairs.data.length === 0) return [];
      const ids = pairs.data.map((p) => p.user_id);
      const [users, rules] = await Promise.all([
        db.from("users").select("id, wallet_address").in("id", ids),
        db.from("rules").select("user_id, amount_limit, notify_mode").in("user_id", ids),
      ]);
      if (users.error) rethrow(users.error);
      if (rules.error) rethrow(rules.error);
      return pairs.data.map((p) => ({
        pairId: p.pair_id,
        userId: p.user_id,
        walletAddress: users.data.find((u) => u.id === p.user_id)!.wallet_address,
        pairKeyAddress: p.pair_key_address,
        rules: toRules(rules.data.find((r) => r.user_id === p.user_id)!),
      }));
    },
    async setRules(pairId, trusteeId, patch) {
      const { data, error } = await db.rpc("set_rules", {
        p_pair_id: pairId, p_trustee_id: trusteeId,
        p_amount_limit: patch.amountLimit?.toString() ?? null, p_notify_mode: patch.notifyMode,
      });
      if (error) rethrow(error);
      return toRules(data);
    },

    async registerPushToken(userId, expoToken) {
      const { error } = await db.from("push_tokens")
        .upsert({ user_id: userId, expo_token: expoToken }, { onConflict: "expo_token" });
      if (error) rethrow(error);
    },
    async removePushToken(userId, expoToken) {
      const { error } = await db.from("push_tokens").delete().eq("user_id", userId).eq("expo_token", expoToken);
      if (error) rethrow(error);
    },
    async pushTokensFor(userId) {
      const { data, error } = await db.from("push_tokens").select("expo_token").eq("user_id", userId);
      if (error) rethrow(error);
      return data.map((r) => r.expo_token);
    },
    async deletePushTokens(expoTokens) {
      const { error } = await db.from("push_tokens").delete().in("expo_token", expoTokens);
      if (error) rethrow(error);
    },

    async trusteePairKeys() {
      const { data, error } = await db.from("pairs").select("pair_key_address").not("pair_key_address", "is", null);
      if (error) rethrow(error);
      return data.map((r) => (r.pair_key_address as string).toLowerCase());
    },
    async pairKeysOfTrustee(trusteeId) {
      const { data, error } = await db.from("pairs").select("pair_key_address")
        .eq("trustee_id", trusteeId).eq("status", "active");
      if (error) rethrow(error);
      return data.map((r) => r.pair_key_address as string);
    },
    async saveArchive(rows) {
      const { error } = await db.from("scam_reports_archive").upsert(rows, { onConflict: "entity_key" });
      if (error) rethrow(error);
    },
    async renewalCandidates(before, limit) {
      const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data, error } = await db.from("scam_reports_archive").select("entity_key")
        .eq("verified", true).lt("arkiv_expires_at", before.toISOString())
        .or(`renew_failed_at.is.null,renew_failed_at.lt.${dayAgo}`)
        .order("arkiv_expires_at").limit(limit);
      if (error) rethrow(error);
      return data.map((r) => ({ entityKey: r.entity_key as string }));
    },
    async markExpiry(entityKey, expiresAt, extended) {
      const { error } = await db.from("scam_reports_archive").update({
        arkiv_expires_at: expiresAt?.toISOString() ?? null,
        renew_failed_at: null,
        ...(extended ? { last_extended_at: new Date().toISOString() } : {}),
      }).eq("entity_key", entityKey);
      if (error) rethrow(error);
    },
    async markRenewFailed(entityKey) {
      const { error } = await db.from("scam_reports_archive").update({ renew_failed_at: new Date().toISOString() })
        .eq("entity_key", entityKey);
      if (error) rethrow(error);
    },
    async archivedReportCounts(address) {
      const { data, error } = await db.from("scam_reports_archive").select("verified").eq("address", address.toLowerCase());
      if (error) rethrow(error);
      const verified = data.filter((r) => r.verified).length;
      return { verified, unverified: data.length - verified };
    },
  };
}
