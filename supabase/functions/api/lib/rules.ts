// The payment rules from decisions doc D3, as a pure function so every
// branch is easy to test. Amounts are USDC base units (6 decimals).

export const USDC = 1_000_000n;
export const FIRST_PAYMENT_CAP = 10n * USDC; // fixed, not overridable
export const COOLDOWN_MS = 24 * 3600 * 1000;

export type Verdict = "refused" | "needs_trustee" | "cooldown" | "safe";
export type NotifyMode = "first_per_payee" | "every_time";

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
};

export type RuleResult = { verdict: Verdict; reasons: string[]; unlockAt: Date | null };

export function decide(i: RuleInput): RuleResult {
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
  const isNew = i.payee.firstPaidAt === null;
  if (reasons.length > 0) {
    // For a new payee the 24h cooldown starts at the trustee's Allow.
    if (isNew) reasons.push("new_payee");
    return { verdict: "needs_trustee", reasons, unlockAt: null };
  }

  // 4. New payee, nothing else wrong: 24h from the first attempt.
  if (isNew) {
    const unlockAt = new Date(i.payee.firstAttemptAt.getTime() + COOLDOWN_MS);
    if (i.now < unlockAt) return { verdict: "cooldown", reasons: ["new_payee"], unlockAt };
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
