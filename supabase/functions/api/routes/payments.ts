// POST /payments/check: applies the D3 rules and records the payment.
import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, fail, requireUser } from "../lib/http.ts";
import { randomHex32 } from "../lib/crypto.ts";
import type { PaymentStatus } from "../lib/repo.ts";
import type { GoPlus, ScamReports } from "../lib/risk.ts";
import { decide, formatUsdc, lookAlikeOf, parseUsdc, type Verdict } from "../lib/rules.ts";
import { body, evmAddress } from "../lib/validate.ts";

export type PaymentDeps = {
  scamReports: ScamReports;
  goPlus: GoPlus;
  now?: () => Date;
};

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

  return r;
}
