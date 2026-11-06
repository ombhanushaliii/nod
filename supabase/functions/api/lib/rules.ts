// The payment rules from decisions doc D3, as a pure function so every
// branch is easy to test. Amounts are USDC base units (6 decimals).

export const USDC = 1_000_000n;
export const FIRST_PAYMENT_CAP = 10n * USDC; // fixed, not overridable
// A new payee can get up to this much in total during their first 24h.
export const NEW_PAYEE_CAP = 10n * USDC;
export const COOLDOWN_MS = 24 * 3600 * 1000;

export type Verdict = "refused" | "needs_trustee" | "cooldown" | "safe";
export type NotifyMode = "first_per_payee" | "every_time";

// This many different trustees reporting an address blocks payments to it.
export const TRUSTEE_BLOCK_AT = 5;

export type RuleInput = {
  amount: bigint;
  now: Date;
  // Has this wallet ever sent a payment?
  firstPaymentDone: boolean;
  amountLimit: bigint;
  notifyMode: NotifyMode;
  payee: { firstAttemptAt: Date; firstPaidAt: Date | null; overLimitApprovedAt: Date | null };
  // Reasons the payee is flagged (verified reports, GoPlus, look-alike).
  flags: string[];
  // Already going to this payee in the last 24h: sent, submitted or sending,
  // plus payments checked as safe that can still be sent.
  sentToPayee: bigint;
  // How many different trustees reported the payee (Deny & report).
  trusteeReporters?: number;
};

export type RuleResult = {
  verdict: Verdict; reasons: string[]; unlockAt: Date | null;
  // Cooldown only: what can still go to this new payee before the unlock.
  newPayeeLeft?: bigint;
};

export function decide(i: RuleInput): RuleResult {
  // 0. Reported by TRUSTEE_BLOCK_AT or more trustees: blocked, nobody can allow it.
  const reporters = i.trusteeReporters ?? 0;
  if (reporters >= TRUSTEE_BLOCK_AT) {
    return { verdict: "refused", reasons: ["blocked_by_trustees", `trustee_reporters:${reporters}`], unlockAt: null };
  }

  // 1. First-ever payment is capped at $10.
  if (!i.firstPaymentDone && i.amount > FIRST_PAYMENT_CAP) {
    return { verdict: "refused", reasons: ["first_payment_cap"], unlockAt: null };
  }

  // 2 + 3. Flags and the amount limit both need the trustee.
  const reasons = [...i.flags];
  const overLimit = i.amount > i.amountLimit;
  if (overLimit && (i.notifyMode === "every_time" || !i.payee.overLimitApprovedAt)) {
    reasons.push("over_limit");
  }
  const firstDayEnds = new Date(i.payee.firstAttemptAt.getTime() + COOLDOWN_MS);
  const inFirstDay = i.now < firstDayEnds;
  // New: never paid, or still in their first 24h. A small payment in that
  // window doesn't make them known, or $5 could unlock the rest at once.
  const isNew = i.payee.firstPaidAt === null || inFirstDay;
  if (reasons.length > 0) {
    // For a new payee the 24h cooldown starts at the trustee's Allow.
    if (isNew) reasons.push("new_payee");
    return { verdict: "needs_trustee", reasons, unlockAt: null };
  }

  // 4. New payee, nothing else wrong: for 24h from the first attempt, up to
  // $10 in total can go to them; anything more waits for the unlock.
  if (inFirstDay) {
    const left = i.sentToPayee >= NEW_PAYEE_CAP ? 0n : NEW_PAYEE_CAP - i.sentToPayee;
    if (i.amount > left) return { verdict: "cooldown", reasons: ["new_payee"], unlockAt: firstDayEnds, newPayeeLeft: left };
  }

  // 5. Safe.
  return { verdict: "safe", reasons: [], unlockAt: null };
}

// "12.5" -> 12_500_000n. Rejects more than 6 decimals, signs and junk.
export function parseUsdc(text: string): bigint | null {
  const m = /^(\d{1,12})(?:\.(\d{1,6}))?$/.exec(text.trim());
  if (!m) return null;
  const value = BigInt(m[1]) * USDC + BigInt((m[2] ?? "").padEnd(6, "0"));
  return value > 0n ? value : null;
}

export function formatUsdc(units: bigint): string {
  const whole = units / USDC;
  const frac = (units % USDC).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

// Address poisoning: same first 4 and last 4 hex characters as an address the
// user has paid before, but a different address.
export function lookAlikeOf(candidate: string, paid: string[]): string | null {
  const c = candidate.toLowerCase();
  const key = (a: string) => a.slice(2, 6) + a.slice(-4);
  return paid.find((p) => p.toLowerCase() !== c && key(p.toLowerCase()) === key(c)) ?? null;
}
