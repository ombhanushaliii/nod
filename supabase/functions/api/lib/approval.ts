// Checks a trustee decision from Arkiv against the payment it claims to approve
// (D5), and works out when the payment may go out. Pure, so it's easy to test.
import type { ArkivDecision } from "./arkiv.ts";
import { exportIntentHash, intentHash } from "./intent.ts";
import { COOLDOWN_MS } from "./rules.ts";

export const REQUEST_TTL_MS = 24 * 60 * 60 * 1000; // approval_request lives 24 h
// A payment Allow has no time limit once it unlocks; the database needs an
// end time, so it gets one far away. It still works once, for that exact payment.
export const PAYMENT_ALLOW_MS = 10 * 365 * 24 * 60 * 60 * 1000;
// A key export Allow is usable for 1 hour from the Allow, once.
export const ALLOW_WINDOW_MS = 60 * 60 * 1000;

export type DecisionCheck =
  | { ok: true; verdict: "deny" }
  | { ok: true; verdict: "allow"; validFrom: Date; validUntil: Date }
  | { ok: false; reason: "pair_mismatch" | "intent_mismatch" | "decision_expired" };

export function checkDecision(args: {
  decision: ArkivDecision;
  pairId: string;
  payment: { to: string; amount: bigint; nonce: string; newPayee: boolean };
  // When the request reached the backend. An Allow can't be older than that,
  // so a backdated createdAt can't shorten the 24h wait.
  requestAttachedAt: Date;
  now: Date;
}): DecisionCheck {
  const { decision: d, payment: p } = args;
  if (d.pairId.toLowerCase() !== args.pairId.toLowerCase()) return { ok: false, reason: "pair_mismatch" };
  if (d.verdict === "deny") return { ok: true, verdict: "deny" };

  if ((d.intentHash ?? "").toLowerCase() !== intentHash(p.to, p.amount, p.nonce)) {
    return { ok: false, reason: "intent_mismatch" };
  }

  // The backend enforces the cooldown itself instead of trusting the
  // trustee app's validFrom: new payee = 24h after the Allow was written.
  const allowedAt = d.createdAt > args.requestAttachedAt ? d.createdAt : args.requestAttachedAt;
  const earliest = new Date(allowedAt.getTime() + (p.newPayee ? COOLDOWN_MS : 0));
  const validFrom = d.validFrom && d.validFrom > earliest ? d.validFrom : earliest;
  // No window to send in: once recorded, the Allow stays usable (Supabase keeps
  // it after the Arkiv entity expires). Single use is enforced when sending.
  const validUntil = new Date(validFrom.getTime() + PAYMENT_ALLOW_MS);
  return { ok: true, verdict: "allow", validFrom, validUntil };
}

// Same checks for a key export (D2). The Allow must carry
// exportIntentHash(wallet, nonce) for this user's wallet and this export's
// nonce. There's no 24h wait: it can be used from the Allow for 1 hour, once.
export function checkExportDecision(args: {
  decision: ArkivDecision;
  pairId: string;
  export: { wallet: string; nonce: string };
  requestAttachedAt: Date;
  now: Date;
}): DecisionCheck {
  const { decision: d } = args;
  if (d.pairId.toLowerCase() !== args.pairId.toLowerCase()) return { ok: false, reason: "pair_mismatch" };
  if (d.verdict === "deny") return { ok: true, verdict: "deny" };

  if ((d.intentHash ?? "").toLowerCase() !== exportIntentHash(args.export.wallet, args.export.nonce)) {
    return { ok: false, reason: "intent_mismatch" };
  }
  const allowedAt = d.createdAt > args.requestAttachedAt ? d.createdAt : args.requestAttachedAt;
  const validFrom = d.validFrom && d.validFrom > allowedAt ? d.validFrom : allowedAt;
  const windowEnd = new Date(validFrom.getTime() + ALLOW_WINDOW_MS);
  const validUntil = d.expiresAt < windowEnd ? d.expiresAt : windowEnd;
  if (validUntil <= args.now || validUntil <= validFrom) return { ok: false, reason: "decision_expired" };
  return { ok: true, verdict: "allow", validFrom, validUntil };
}
