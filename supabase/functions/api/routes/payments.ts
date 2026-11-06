// Payments: the D3 rules check, then the trustee approval flow (D5).
import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, fail, requireUser } from "../lib/http.ts";
import { randomHex32 } from "../lib/crypto.ts";
import { mapRepoError } from "../lib/errors.ts";
import { checkDecision, REQUEST_TTL_MS } from "../lib/approval.ts";
import type { ArkivApprovals } from "../lib/arkiv.ts";
import { type PaymentSender, SendError } from "../lib/privySigner.ts";
import { MESSAGES, notifyUser, type PushSender } from "../lib/push.ts";
import type { ActivePair, Payment, PaymentStatus, Repo } from "../lib/repo.ts";
import type { GoPlus, ScamReports } from "../lib/risk.ts";
import { decide, formatUsdc, lookAlikeOf, parseUsdc, type Verdict } from "../lib/rules.ts";
import { body, evmAddress, hex32 } from "../lib/validate.ts";
import { syncExportDecision } from "./exports.ts";

export type PaymentDeps = {
  scamReports: ScamReports;
  goPlus: GoPlus;
  arkiv: ArkivApprovals;
  sender: PaymentSender;
  push: PushSender;
  now?: () => Date;
};

// A payment with no trustee approval must be sent soon after its check, so a
// scam report that appears in between isn't missed.
export const MAX_CHECK_AGE_MS = 10 * 60 * 1000;

export const EXPLORER_TX = "https://sepolia.etherscan.io/tx/";

function view(p: Payment) {
  return {
    paymentId: p.id,
    status: p.status,
    to: p.toAddress,
    amount: formatUsdc(p.amount),
    verdict: p.verdict,
    reasons: p.reasons,
    unlockAt: p.unlockAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    txHash: p.txHash ?? null,
    explorerUrl: p.txHash ? `${EXPLORER_TX}${p.txHash}` : null,
    failureReason: p.failureReason ?? null,
  };
}

// A submitted payment is finished by asking Privy how its transaction ended,
// when the app reads it. No polling job. If Privy can't answer, it stays
// submitted and the next read tries again.
async function settle(repo: Repo, sender: PaymentSender, p: Payment): Promise<Payment> {
  if (p.status !== "submitted" || !p.privyTransactionId) return p;
  try {
    const tx = await sender.transactionOutcome(p.privyTransactionId);
    if (tx.outcome === "pending") return p;
    const status = await repo.settlePayment(p.id, tx);
    return tx.outcome === "sent"
      ? { ...p, status, txHash: tx.hash }
      : { ...p, status, failureReason: tx.reason };
  } catch (err) {
    console.error("settle failed", err);
    return p;
  }
}

const statusFor: Record<Verdict, PaymentStatus> = {
  refused: "refused",
  needs_trustee: "checked", // becomes awaiting_trustee once the Arkiv request exists
  cooldown: "cooling_down",
  safe: "ready",
};

export function paymentRoutes(deps: PaymentDeps) {
  const r = new Hono<AppEnv>();
  const now = deps.now ?? (() => new Date());

  // Reads the trustee's decision for a payment from Arkiv, checks it against
  // the payment, and records it. Used by the user's poll and the trustee app.
  async function syncDecision(repo: Repo, payment: Payment, pair: ActivePair | null) {
    if (payment.status !== "awaiting_trustee") {
      return { status: payment.status, unlockAt: payment.unlockAt?.toISOString() ?? null };
    }
    const approval = payment.approvalId ? await repo.getApproval(payment.approvalId) : null;
    if (!approval || !pair) fail(409, "no_active_trustee");

    const decision = await deps.arkiv.findDecision(approval.requestKey, pair.pairKeyAddress);
    if (!decision) {
      if (now().getTime() > approval.createdAt.getTime() + REQUEST_TTL_MS) {
        await repo.expirePayment(payment.id);
        return { status: "expired", unlockAt: null };
      }
      return { status: "awaiting_trustee", unlockAt: null };
    }

    const check = checkDecision({
      decision, pairId: pair.pairId, now: now(), requestAttachedAt: approval.createdAt,
      payment: {
        to: payment.toAddress, amount: payment.amount, nonce: payment.nonce,
        newPayee: payment.reasons.includes("new_payee"),
      },
    });
    if (!check.ok) fail(409, check.reason, "The trustee's decision doesn't match this payment.");

    const status = await repo.recordDecision(payment.id, {
      decisionKey: decision.entityKey,
      verdict: check.verdict,
      validFrom: check.verdict === "allow" ? check.validFrom : null,
      validUntil: check.verdict === "allow" ? check.validUntil : null,
    }).catch(mapRepoError);

    return {
      status,
      unlockAt: check.verdict === "allow" ? check.validFrom.toISOString() : null,
      validUntil: check.verdict === "allow" ? check.validUntil.toISOString() : null,
    };
  }

  r.post("/payments/check", async (c) => {
    const user = await requireUser(c);
    const input = await body(c, z.object({
      to: evmAddress,
      // USDC as a decimal string, e.g. "12.50".
      amount: z.string(),
    }));
    const amount = parseUsdc(input.amount);
    if (amount === null) fail(422, "invalid_amount", "Amount must be a positive USDC value with at most 6 decimals.");
    if (input.to === user.wallet_address) fail(422, "self_payment");

    const repo = c.var.repo;
    const [payee, rules, firstPaymentDone, paid, reports, goplus, trusteeActive] = await Promise.all([
      repo.touchPayee(user.id, input.to),
      repo.getRules(user.id),
      repo.hasSentPayment(user.id),
      repo.paidPayees(user.id),
      deps.scamReports.countFor(input.to),
      deps.goPlus.check(input.to),
      repo.hasActivePair(user.id),
    ]);

    const flags: string[] = [];
    const warnings: string[] = [];
    if (reports.verified > 0) {
      flags.push("scam_report");
      // What the reports say it is, so both apps can say why in plain words.
      flags.push(...(reports.categories ?? []).map((c) => `reported:${c}`));
    }
    else if (reports.unverified > 0) warnings.push("unverified_scam_report");
    // If GoPlus can't answer, don't send unchecked: ask the trustee.
    if ("unavailable" in goplus) flags.push("risk_check_unavailable");
    else flags.push(...goplus.flagged.map((f) => `goplus:${f}`));
    const lookAlike = lookAlikeOf(input.to, paid);
    if (lookAlike) flags.push("look_alike");

    const result = decide({
      amount, now: now(), firstPaymentDone,
      amountLimit: rules.amountLimit, notifyMode: rules.notifyMode,
      payee, flags,
    });

    const nonce = randomHex32();
    const { id } = await repo.createPayment({
      userId: user.id, toAddress: input.to, amount,
      verdict: result.verdict, reasons: result.reasons,
      status: statusFor[result.verdict], unlockAt: result.unlockAt, nonce,
    });

    return c.json({
      paymentId: id,
      verdict: result.verdict,
      reasons: result.reasons,
      warnings,
      unlockAt: result.unlockAt?.toISOString() ?? null,
      // Goes into intentHash = hash(recipient, amount, nonce) for the trustee.
      nonce,
      amount: formatUsdc(amount),
      lookAlikeOf: lookAlike,
      reports,
      trusteeActive,
    });
  });

  // The user's payments, newest first. ?limit= (default 20, max 50).
  r.get("/payments", async (c) => {
    const user = await requireUser(c);
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 20) || 20, 1), 50);
    const list = await c.var.repo.listPayments(user.id, limit);
    const settled = await Promise.all(list.map((p) => settle(c.var.repo, deps.sender, p)));
    return c.json({ payments: settled.map(view) });
  });

  r.get("/payments/:id", async (c) => {
    const user = await requireUser(c);
    const payment = await c.var.repo.getPayment(c.req.param("id"), user.id);
    if (!payment) fail(404, "payment_not_found");
    return c.json(view(await settle(c.var.repo, deps.sender, payment)));
  });

  // The app wrote an approval_request on Arkiv for this payment. The backend
  // checks it's really there, written by this user, for this user's pair,
  // then pushes the trustee (D9). No polling: every request comes through here,
  // because the payment can't go ahead without it.
  r.post("/payments/:id/request", async (c) => {
    const user = await requireUser(c);
    const { requestKey } = await body(c, z.object({ requestKey: hex32 }));
    const repo = c.var.repo;

    const payment = await repo.getPayment(c.req.param("id"), user.id);
    if (!payment) fail(404, "payment_not_found");
    const pair = await repo.getActivePair(user.id);
    if (!pair) fail(409, "no_active_trustee", "Your trustee hasn't accepted the invite yet.");

    const req = await deps.arkiv.getRequest(requestKey);
    if (!req) fail(404, "request_not_on_arkiv", "Arkiv doesn't have that request yet. Retry in a few seconds.");
    if (req.owner.toLowerCase() !== user.wallet_address) fail(403, "request_not_yours");
    if (req.pairId.toLowerCase() !== pair.pairId.toLowerCase()) fail(422, "request_pair_mismatch");
    if (req.kind !== "payment") fail(422, "request_wrong_kind");

    await repo.attachRequest(payment.id, user.id, requestKey).catch(mapRepoError);
    // Awaited so the Edge Function doesn't stop before it's sent; never throws.
    await notifyUser(repo, deps.push, pair.trusteeId, MESSAGES.approvalRequest(pair.pairId));
    return c.json({
      status: "awaiting_trustee",
      expiresAt: new Date(req.createdAt.getTime() + REQUEST_TTL_MS).toISOString(),
    });
  });

  // Has the trustee decided? Reads the decision from Arkiv, verifies it, and
  // records it. Safe to poll.
  r.post("/payments/:id/approval", async (c) => {
    const user = await requireUser(c);
    const payment = await c.var.repo.getPayment(c.req.param("id"), user.id);
    if (!payment) fail(404, "payment_not_found");
    const pair = await c.var.repo.getActivePair(user.id);
    return c.json(await syncDecision(c.var.repo, payment, pair));
  });

  // The trustee app just wrote a decision on Arkiv. The backend verifies and
  // records it the same way, then pushes the user so they don't have to wait.
  r.post("/trustee/decisions", async (c) => {
    const me = await requireUser(c);
    const { pairId, requestKey } = await body(c, z.object({ pairId: hex32, requestKey: hex32 }));
    const repo = c.var.repo;
    const pair = await repo.trusteePair(pairId, me.id);
    if (!pair) fail(404, "not_your_pair", "You're not this user's trustee.");
    const payment = await repo.paymentByRequestKey(requestKey, pair.userId);
    if (!payment) {
      // Not a payment: maybe a key export request (D2).
      const exp = await repo.exportByRequestKey(requestKey, pair.userId);
      const wallet = exp && await repo.walletOf(pair.userId);
      if (!exp || !wallet) fail(404, "payment_not_found");
      const before = exp.status;
      const out = await syncExportDecision(deps, repo, exp, pair, wallet);
      if (before === "awaiting_trustee" && out.status !== "awaiting_trustee") {
        await notifyUser(repo, deps.push, pair.userId, MESSAGES.exportAnswered());
      }
      return c.json(out);
    }
    const before = payment.status;
    const out = await syncDecision(repo, payment, pair);
    if (before === "awaiting_trustee" && out.status !== "awaiting_trustee") {
      await notifyUser(repo, deps.push, pair.userId, MESSAGES.trusteeAnswered());
    }
    return c.json(out);
  });

  // Sends the payment from the user's wallet as the backend signer, gas
  // sponsored by Privy. The backend builds the USDC transfer itself, so the
  // app can't change the recipient or amount after the check.
  r.post("/payments/:id/send", async (c) => {
    const user = await requireUser(c);
    if (!user.privy_wallet_id) fail(409, "wallet_not_linked", "Register again so the backend knows your Privy wallet id.");
    const repo = c.var.repo;

    const payment = await repo.claimPayment(c.req.param("id"), user.id, MAX_CHECK_AGE_MS).catch(mapRepoError);

    let result;
    try {
      result = await deps.sender.sendUsdc({
        walletId: user.privy_wallet_id, to: payment.toAddress, amount: payment.amount, referenceId: payment.id,
      });
    } catch (err) {
      // Nothing went out, or Privy will reject a repeat of this reference id,
      // so it's safe to let the user retry.
      await repo.releasePayment(payment.id);
      console.error(err);
      const status = err instanceof SendError ? err.status : null;
      fail(502, "send_failed", status && status < 500 ? "Privy refused the transaction." : "Couldn't reach Privy. Try again.");
    }

    await repo.markSubmitted(payment.id, result);
    return c.json({
      status: "submitted",
      transactionId: result.transactionId,
      userOperationHash: result.userOperationHash,
      txHash: result.hash,
    });
  });

  return r;
}
