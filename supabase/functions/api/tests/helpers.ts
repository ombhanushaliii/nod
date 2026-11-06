// Test harness: real Privy-style tokens, in-memory repo, recorded side effects.
import { exportSPKI, generateKeyPair, SignJWT } from "jose";
import { createApp } from "../app.ts";
import { privyAuth } from "../lib/auth.ts";
import {
  type NewPayment, type Payee, type Payment, type PaymentStatus, type Repo, RepoError, type RuleChange, type Rules,
  type User,
} from "../lib/repo.ts";
import type { NotifyMode } from "../lib/rules.ts";
import type { GoPlusResult, ReportCounts } from "../lib/risk.ts";
import type { ArkivDecision, ArkivRequest } from "../lib/arkiv.ts";
import type { SendError, TxOutcome } from "../lib/privySigner.ts";
import type { PushMessage } from "../lib/push.ts";

type Approval = {
  id: string; pairRowId: string; requestKey: string; createdAt: Date;
  decisionKey?: string; verdict?: "allow" | "deny"; validFrom?: Date | null; validUntil?: Date | null; usedAt?: Date;
};

export const APP_ID = "test-app-id";
const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
export const PEM = await exportSPKI(publicKey);

export function signToken(sub: string, opts: { iss?: string; aud?: string; exp?: string; key?: CryptoKey } = {}) {
  return new SignJWT({ sid: "s1" })
    .setProtectedHeader({ alg: "ES256" })
    .setSubject(sub)
    .setIssuer(opts.iss ?? "privy.io")
    .setAudience(opts.aud ?? APP_ID)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "1h")
    .sign(opts.key ?? privateKey);
}

type Pair = {
  id: string; pairId: string; userId: string; trusteeId?: string;
  pairKeyAddress?: string; encPubKey?: string; status: "invited" | "active" | "revoked";
};
type Invite = { pairRowId: string; contact: string | null; tokenHash: string; expiresAt: Date; acceptedAt?: Date };

// Same rules as the SQL functions in the invite_functions migration.
export class MemoryRepo implements Repo {
  users: User[] = [];
  pairs: Pair[] = [];
  invites: Invite[] = [];
  rules = new Map<string, Rules>();
  rulesMeta = new Map<string, { updatedAt: Date; updatedBy: string | null }>();
  ruleHistory: (RuleChange & { userId: string })[] = [];
  payees = new Map<string, Payee>(); // key: userId|address
  payments: Payment[] = [];
  approvals: Approval[] = [];
  pushTokens = new Map<string, string>(); // expo token -> user id
  clock = () => new Date();

  registerPushToken(userId: string, token: string) {
    this.pushTokens.set(token, userId);
    return Promise.resolve();
  }
  removePushToken(userId: string, token: string) {
    if (this.pushTokens.get(token) === userId) this.pushTokens.delete(token);
    return Promise.resolve();
  }
  pushTokensFor(userId: string) {
    return Promise.resolve([...this.pushTokens].filter(([, u]) => u === userId).map(([t]) => t));
  }
  deletePushTokens(tokens: string[]) {
    tokens.forEach((t) => this.pushTokens.delete(t));
    return Promise.resolve();
  }

  archive: { address: string; verified: boolean }[] = [];
  trusteePairKeys() {
    return Promise.resolve(this.pairs.filter((p) => p.pairKeyAddress).map((p) => p.pairKeyAddress!.toLowerCase()));
  }
  pairKeysOfTrustee(trusteeId: string) {
    return Promise.resolve(this.pairs.filter((p) => p.trusteeId === trusteeId && p.status === "active").map((p) => p.pairKeyAddress!));
  }
  archivedReportCounts(address: string) {
    const rows = this.archive.filter((r) => r.address === address.toLowerCase());
    const verified = rows.filter((r) => r.verified).length;
    return Promise.resolve({ verified, unverified: rows.length - verified });
  }

  getPayment(id: string, userId: string) {
    const p = this.payments.find((x) => x.id === id && x.userId === userId);
    return Promise.resolve(p ? { ...p } : null);
  }
  getActivePair(userId: string) {
    const p = this.pairs.find((x) => x.userId === userId && x.status === "active");
    return Promise.resolve(p ? { id: p.id, pairId: p.pairId, pairKeyAddress: p.pairKeyAddress!, trusteeId: p.trusteeId! } : null);
  }
  getApproval(id: string) {
    const a = this.approvals.find((x) => x.id === id);
    return Promise.resolve(a ? { id: a.id, requestKey: a.requestKey, createdAt: a.createdAt } : null);
  }
  // Mirrors attach_approval_request.
  attachRequest(paymentId: string, userId: string, requestKey: string) {
    const p = this.payments.find((x) => x.id === paymentId && x.userId === userId);
    if (!p) return Promise.reject(new RepoError("payment_not_found"));
    if (p.verdict !== "needs_trustee") return Promise.reject(new RepoError("trustee_not_needed"));
    if (p.status !== "checked") return Promise.reject(new RepoError("already_requested"));
    const pair = this.pairs.find((x) => x.userId === userId && x.status === "active");
    if (!pair) return Promise.reject(new RepoError("no_active_trustee"));
    if (this.approvals.some((a) => a.requestKey === requestKey)) return Promise.reject(new RepoError("request_key_used"));
    const a: Approval = { id: crypto.randomUUID(), pairRowId: pair.id, requestKey, createdAt: this.clock() };
    this.approvals.push(a);
    Object.assign(p, { approvalId: a.id, status: "awaiting_trustee" });
    return Promise.resolve();
  }
  // Mirrors record_decision.
  recordDecision(paymentId: string, d: { decisionKey: string; verdict: "allow" | "deny"; validFrom: Date | null; validUntil: Date | null }) {
    const p = this.payments.find((x) => x.id === paymentId);
    if (!p) return Promise.reject(new RepoError("payment_not_found"));
    if (p.status !== "awaiting_trustee") return Promise.reject(new RepoError("not_awaiting_trustee"));
    if (this.approvals.some((a) => a.decisionKey === d.decisionKey)) return Promise.reject(new RepoError("decision_key_used"));
    const a = this.approvals.find((x) => x.id === p.approvalId)!;
    Object.assign(a, d);
    let status: PaymentStatus;
    if (d.verdict === "deny") {
      status = "denied";
      Object.assign(p, { status, unlockAt: null });
    } else {
      status = d.validFrom! > this.clock() ? "cooling_down" : "ready";
      Object.assign(p, { status, unlockAt: d.validFrom });
    }
    return Promise.resolve(status);
  }
  // Mirrors claim_payment.
  claimPayment(paymentId: string, userId: string, maxCheckAgeMs: number) {
    const p = this.payments.find((x) => x.id === paymentId && x.userId === userId);
    const now = this.clock();
    if (!p) return Promise.reject(new RepoError("payment_not_found"));
    let status = p.status;
    if (status === "cooling_down") {
      if (p.unlockAt! > now) return Promise.reject(new RepoError("still_cooling_down"));
      status = "ready";
    }
    if (status !== "ready") return Promise.reject(new RepoError("not_ready"));
    if (!p.approvalId) {
      if (p.verdict !== "safe" || p.createdAt.getTime() < now.getTime() - maxCheckAgeMs) {
        return Promise.reject(new RepoError("check_stale"));
      }
    } else {
      const a = this.approvals.find((x) => x.id === p.approvalId)!;
      if (a.verdict !== "allow" || a.usedAt || now < a.validFrom! || now >= a.validUntil!) {
        return Promise.reject(new RepoError("approval_not_usable"));
      }
      a.usedAt = now;
    }
    p.status = "sending";
    return Promise.resolve({ ...p });
  }
  // Mirrors mark_payment_submitted.
  markSubmitted(paymentId: string, r: { transactionId: string | null; userOperationHash: string | null; hash: string | null }) {
    const p = this.payments.find((x) => x.id === paymentId && x.status === "sending");
    if (!p) return Promise.reject(new RepoError("not_sending"));
    Object.assign(p, { status: "submitted", privyTransactionId: r.transactionId, txHash: r.hash });
    const payee = this.payees.get(`${p.userId}|${p.toAddress}`);
    if (payee) {
      payee.firstPaidAt ??= this.clock();
      if (p.approvalId && p.reasons.includes("over_limit")) payee.overLimitApprovedAt ??= this.clock();
    }
    return Promise.resolve();
  }
  // Mirrors settle_payment.
  settlePayment(paymentId: string, s: { outcome: "sent"; hash: string } | { outcome: "failed"; reason: string }) {
    const p = this.payments.find((x) => x.id === paymentId);
    if (!p) return Promise.reject(new RepoError("payment_not_found"));
    if (p.status !== "submitted") return Promise.resolve(p.status);
    if (s.outcome === "sent") {
      Object.assign(p, { status: "sent", txHash: s.hash });
      return Promise.resolve(p.status);
    }
    Object.assign(p, { status: "failed", failureReason: s.reason });
    const payee = this.payees.get(`${p.userId}|${p.toAddress}`);
    const others = this.payments.filter((x) =>
      x.userId === p.userId && x.toAddress === p.toAddress && (x.status === "submitted" || x.status === "sent")
    );
    if (payee) {
      if (others.length === 0) payee.firstPaidAt = null;
      if (!others.some((x) => x.approvalId && x.reasons.includes("over_limit"))) payee.overLimitApprovedAt = null;
    }
    return Promise.resolve(p.status);
  }
  listPayments(userId: string, limit: number) {
    return Promise.resolve(
      this.payments.filter((p) => p.userId === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit).map((p) => ({ ...p })),
    );
  }
  // Mirrors release_payment.
  releasePayment(paymentId: string) {
    const p = this.payments.find((x) => x.id === paymentId && x.status === "sending");
    if (p) {
      p.status = "ready";
      const a = this.approvals.find((x) => x.id === p.approvalId);
      if (a) a.usedAt = undefined;
    }
    return Promise.resolve();
  }
  expirePayment(paymentId: string) {
    const p = this.payments.find((x) => x.id === paymentId && x.status === "awaiting_trustee");
    if (p) p.status = "expired";
    return Promise.resolve(!!p);
  }

  hasActivePair(userId: string) {
    return Promise.resolve(this.pairs.some((p) => p.userId === userId && p.status === "active"));
  }
  touchPayee(userId: string, address: string) {
    const k = `${userId}|${address}`;
    if (!this.payees.has(k)) this.payees.set(k, { firstAttemptAt: this.clock(), firstPaidAt: null, overLimitApprovedAt: null });
    return Promise.resolve({ ...this.payees.get(k)! });
  }
  rulesView(userId: string, historyLimit: number) {
    const meta = this.rulesMeta.get(userId)!;
    return Promise.resolve({
      ...this.rules.get(userId)!, updatedAt: meta.updatedAt, setByTrustee: meta.updatedBy !== null,
      history: this.ruleHistory.filter((h) => h.userId === userId).reverse().slice(0, historyLimit)
        .map(({ from, to, at }) => ({ from, to, at })),
    });
  }
  protectedUsers(trusteeId: string) {
    return Promise.resolve(this.pairs.filter((p) => p.trusteeId === trusteeId && p.status === "active").map((p) => ({
      pairId: p.pairId,
      userId: p.userId,
      walletAddress: this.users.find((u) => u.id === p.userId)!.wallet_address,
      rules: { ...this.rules.get(p.userId)! },
    })));
  }
  // Same as set_rules in the trustee_rules migration.
  setRules(pairId: string, trusteeId: string, patch: { amountLimit: bigint | null; notifyMode: NotifyMode | null }) {
    const pair = this.pairs.find((p) => p.pairId === pairId && p.trusteeId === trusteeId && p.status === "active");
    if (!pair) return Promise.reject(new RepoError("not_your_pair"));
    const from = this.rules.get(pair.userId)!;
    const to = { amountLimit: patch.amountLimit ?? from.amountLimit, notifyMode: patch.notifyMode ?? from.notifyMode };
    this.rules.set(pair.userId, to);
    this.rulesMeta.set(pair.userId, { updatedAt: this.clock(), updatedBy: trusteeId });
    if (to.amountLimit !== from.amountLimit || to.notifyMode !== from.notifyMode) {
      this.ruleHistory.push({ userId: pair.userId, from, to, at: this.clock() });
    }
    return Promise.resolve({ ...to });
  }
  getRules(userId: string) {
    return Promise.resolve({ ...this.rules.get(userId)! });
  }
  hasSentPayment(userId: string) {
    return Promise.resolve(this.payments.some((p) => p.userId === userId && (p.status === "sent" || p.status === "submitted")));
  }
  paidPayees(userId: string) {
    return Promise.resolve(
      [...this.payees.entries()].filter(([k, p]) => k.startsWith(`${userId}|`) && p.firstPaidAt).map(([k]) => k.split("|")[1]),
    );
  }
  createPayment(p: NewPayment) {
    const row: Payment = { ...p, id: crypto.randomUUID(), approvalId: null, createdAt: this.clock() };
    this.payments.push(row);
    return Promise.resolve({ id: row.id });
  }

  findUserByPrivyId(id: string) {
    return Promise.resolve(this.users.find((u) => u.privy_user_id === id) ?? null);
  }
  findUserByWallet(a: string) {
    return Promise.resolve(this.users.find((u) => u.wallet_address === a) ?? null);
  }
  createUser(privyUserId: string, walletAddress: string, privyWalletId: string) {
    const user = {
      id: crypto.randomUUID(), privy_user_id: privyUserId, wallet_address: walletAddress,
      privy_wallet_id: privyWalletId, created_at: new Date().toISOString(),
    };
    this.users.push(user);
    this.rules.set(user.id, { amountLimit: 100_000_000n, notifyMode: "first_per_payee" });
    this.rulesMeta.set(user.id, { updatedAt: this.clock(), updatedBy: null });
    return Promise.resolve(user);
  }
  createInvite(a: { userId: string; pairId: string; contact: string; tokenHash: string; expiresAt: Date }) {
    const open = this.pairs.find((p) => p.userId === a.userId && p.status !== "revoked");
    if (open?.status === "active") return Promise.reject(new RepoError("pair_active"));
    if (open) {
      const inv = this.invites.find((i) => i.pairRowId === open.id)!;
      Object.assign(inv, { contact: a.contact, tokenHash: a.tokenHash, expiresAt: a.expiresAt, acceptedAt: undefined });
    } else {
      const pair: Pair = { id: crypto.randomUUID(), pairId: a.pairId, userId: a.userId, status: "invited" };
      this.pairs.push(pair);
      this.invites.push({ pairRowId: pair.id, contact: a.contact, tokenHash: a.tokenHash, expiresAt: a.expiresAt });
    }
    return Promise.resolve();
  }
  findInvite(tokenHash: string) {
    const inv = this.invites.find((i) => i.tokenHash === tokenHash);
    if (!inv) return Promise.resolve(null);
    const pair = this.pairs.find((p) => p.id === inv.pairRowId)!;
    return Promise.resolve({
      pairId: pair.pairId,
      expiresAt: inv.expiresAt.toISOString(),
      usable: !inv.acceptedAt && pair.status === "invited" && inv.expiresAt > new Date(),
    });
  }
  acceptInvite(a: { tokenHash: string; trusteeId: string; pairKeyAddress: string; encPubKey: string }) {
    const inv = this.invites.find((i) => i.tokenHash === a.tokenHash);
    if (!inv) return Promise.reject(new RepoError("invite_not_found"));
    const pair = this.pairs.find((p) => p.id === inv.pairRowId)!;
    if (inv.acceptedAt || pair.status !== "invited") return Promise.reject(new RepoError("invite_used"));
    if (inv.expiresAt < new Date()) return Promise.reject(new RepoError("invite_expired"));
    if (pair.userId === a.trusteeId) return Promise.reject(new RepoError("self_trustee"));
    Object.assign(pair, { trusteeId: a.trusteeId, pairKeyAddress: a.pairKeyAddress, encPubKey: a.encPubKey, status: "active" });
    Object.assign(inv, { acceptedAt: new Date(), contact: null });
    return Promise.resolve(pair.pairId);
  }
}

export function makeTestApp(options: { webOrigins?: string[] } = {}) {
  const repo = new MemoryRepo();
  const mails: { to: string; url: string }[] = [];
  const funded: string[] = [];
  // Privy DID -> embedded wallets, as Privy's API would report.
  const privyWallets = new Map<string, string[]>();
  const state: {
    mailFails: boolean;
    fundFails: boolean;
    now: Date;
    reports: Map<string, ReportCounts>;
    goplus: Map<string, GoPlusResult>;
    // Fake Arkiv: entities by key.
    arkivRequests: Map<string, ArkivRequest>;
    arkivDecisions: ArkivDecision[];
    // Fake Privy sender: every call, and whether the next one fails.
    sent: { walletId: string; to: string; amount: bigint; referenceId: string }[];
    sendFails: SendError | null;
    // Fake Privy transaction status by transaction id (missing = pending).
    txOutcomes: Map<string, TxOutcome>;
    txLookupFails: boolean;
    // Fake Expo push: every message sent, tokens Expo reports dead, and outages.
    pushes: { to: string[]; message: PushMessage }[];
    deadTokens: string[];
    pushFails: boolean;
  } = {
    mailFails: false, fundFails: false, now: new Date("2026-11-06T10:00:00Z"), reports: new Map(), goplus: new Map(),
    arkivRequests: new Map(), arkivDecisions: [], sent: [], sendFails: null, txOutcomes: new Map(), txLookupFails: false,
    pushes: [], deadTokens: [], pushFails: false,
  };
  repo.clock = () => state.now;

  const app = createApp({
    webOrigins: options.webOrigins,
    auth: privyAuth({ appId: APP_ID, verificationKey: PEM }),
    repo,
    privy: {
      embeddedEthWallets: (did) =>
        Promise.resolve((privyWallets.get(did) ?? []).map((a) => ({ address: a.toLowerCase(), id: `wallet-${a.toLowerCase()}` }))),
    },
    mailer: {
      sendTrusteeInvite(to, url) {
        if (state.mailFails) return Promise.reject(new Error("email down"));
        mails.push({ to, url });
        return Promise.resolve();
      },
    },
    funder: { fund: (a) => (funded.push(a), state.fundFails ? Promise.reject(new Error("rabdi down")) : Promise.resolve()) },
    inviteUrlBase: "guardian://invite/",
    scamReports: { countFor: (a) => Promise.resolve(state.reports.get(a) ?? { verified: 0, unverified: 0 }) },
    goPlus: { check: (a) => Promise.resolve(state.goplus.get(a) ?? { flagged: [] }) },
    arkiv: {
      getRequest: (k) => Promise.resolve(state.arkivRequests.get(k) ?? null),
      findDecision: (rk, owner) =>
        Promise.resolve(state.arkivDecisions.find((d) => d.requestKey === rk && d.owner === owner) ?? null),
    },
    sender: {
      sendUsdc(args) {
        if (state.sendFails) return Promise.reject(state.sendFails);
        state.sent.push(args);
        return Promise.resolve({ transactionId: `tx-${state.sent.length}`, userOperationHash: "0xop", hash: null });
      },
      transactionOutcome(id) {
        if (state.txLookupFails) return Promise.reject(new Error("privy down"));
        return Promise.resolve(state.txOutcomes.get(id) ?? { outcome: "pending" });
      },
    },
    push: {
      send(to, message) {
        if (state.pushFails) return Promise.reject(new Error("expo down"));
        state.pushes.push({ to, message });
        return Promise.resolve({ deadTokens: to.filter((t) => state.deadTokens.includes(t)) });
      },
    },
    now: () => state.now,
  });

  async function call(sub: string | null, method: string, path: string, json?: unknown) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (sub) headers.authorization = `Bearer ${await signToken(sub)}`;
    const res = await app.request(`/api${path}`, { method, headers, body: json === undefined ? undefined : JSON.stringify(json) });
    return { status: res.status, body: await res.json() };
  }

  return { app, repo, mails, funded, privyWallets, state, call };
}

export const addr = (ch: string) => `0x${ch.repeat(40)}`;
export const hex32 = (ch: string) => `0x${ch.repeat(64)}`;
