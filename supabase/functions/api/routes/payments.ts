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
import type { PaymentStatus } from "../lib/repo.ts";
import type { GoPlus, ScamReports } from "../lib/risk.ts";
import { decide, formatUsdc, lookAlikeOf, parseUsdc, type Verdict } from "../lib/rules.ts";
import { body, evmAddress, hex32 } from "../lib/validate.ts";

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

const statusFor: Record<Verdict, PaymentStatus> = {
  refused: "refused",
  needs_trustee: "checked", // becomes awaiting_trustee once the Arkiv request exists
  cooldown: "cooling_down",
  safe: "ready",
};

export function paymentRoutes(deps: PaymentDeps) {
  const r = new Hono<AppEnv>();
  const now = deps.now ?? (() => new Date());

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
    if (reports.verified > 0) flags.push("scam_report");
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
    const repo = c.var.repo;
    const payment = await repo.getPayment(c.req.param("id"), user.id);
    if (!payment) fail(404, "payment_not_found");
    if (payment.status !== "awaiting_trustee") {
      return c.json({ status: payment.status, unlockAt: payment.unlockAt?.toISOString() ?? null });
    }

    const approval = payment.approvalId ? await repo.getApproval(payment.approvalId) : null;
    const pair = await repo.getActivePair(user.id);
    if (!approval || !pair) fail(409, "no_active_trustee");

    const decision = await deps.arkiv.findDecision(approval.requestKey, pair.pairKeyAddress);
    if (!decision) {
      if (now().getTime() > approval.createdAt.getTime() + REQUEST_TTL_MS) {
        await repo.expirePayment(payment.id);
        return c.json({ status: "expired", unlockAt: null });
      }
      return c.json({ status: "awaiting_trustee", unlockAt: null });
    }

    const check = checkDecision({
      decision, pairId: pair.pairId, now: now(),
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

    return c.json({
      status,
      unlockAt: check.verdict === "allow" ? check.validFrom.toISOString() : null,
      validUntil: check.verdict === "allow" ? check.validUntil.toISOString() : null,
    });
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
