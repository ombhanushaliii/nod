// Checks a trustee decision from Arkiv against the payment it claims to approve
// (D5), and works out when the payment may go out. Pure, so it's easy to test.
import type { ArkivDecision } from "./arkiv.ts";
import { intentHash } from "./intent.ts";
import { COOLDOWN_MS } from "./rules.ts";

export const REQUEST_TTL_MS = 30 * 60 * 1000; // approval_request lives 30 min
export const ALLOW_WINDOW_MS = 60 * 60 * 1000; // 1h to send once unlocked

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
  const windowEnd = new Date(validFrom.getTime() + ALLOW_WINDOW_MS);
  const validUntil = d.expiresAt < windowEnd ? d.expiresAt : windowEnd;
  if (validUntil <= args.now || validUntil <= validFrom) return { ok: false, reason: "decision_expired" };
  return { ok: true, verdict: "allow", validFrom, validUntil };
}
