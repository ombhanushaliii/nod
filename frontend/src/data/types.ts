import type { Tone } from '@/theme';

export type Role = 'user' | 'trustee';

export type Session = { role: Role; email: string; method: 'Google' };

export type RulesMode = 'first_per_payee' | 'every_time';
export type Rules = { limit: number; mode: RulesMode; daily: number };

export type TrusteeStatus = 'none' | 'pending' | 'active';

export type Payee = {
  id: string;
  name: string;
  address: string;
  /** New people unlock 24h after the first attempt (or after the trustee's OK). */
  unlockAt: number;
  /** In "first time per person" mode, set once the trustee OK'd an over-limit payment to them. */
  overCleared: boolean;
  addedAt: number;
};

export type Payment = { id: string; to: string; address: string; amount: number; time: number };

/** Why a payment was stopped. Shown to the user and on the trustee's context card. */
export type Reason = { title: string; detail: string; tag: string; tone: Tone };

export type Why = 'flagged' | 'daily' | 'limit';

export type RequestStatus = 'pending' | 'allowed' | 'denied' | 'expired';
/** `expired` is derived: a pending request older than 30 minutes. */
export type RequestState = RequestStatus | 'expired';

export type ApprovalRequest = {
  id: string;
  kind: 'payment' | 'export';
  createdAt: number;
  status: RequestStatus;
  decidedAt?: number;
  /** Allowed payments become usable from here (Allow + 24h for a new person). */
  validFrom?: number;
  /** Live: the backend's end of the approval window (otherwise validFrom + 1h). */
  validUntil?: number;
  /** Live: when the request runs out, from the backend (otherwise createdAt + 30 min). */
  expiresAt?: number;
  /** Live: the backend payment this request is for. */
  paymentId?: string;
  /** Live, trustee side: which person (pair) asked. */
  pairId?: string;
  /** Live, trustee side: the exact payment an Allow is bound to (intentHash). */
  nonce?: string;
  amountUnits?: string;
  used?: boolean;
  /** Hidden from the user's "In progress" list. */
  dismissed?: boolean;
  // payment requests only
  address?: string;
  name?: string;
  amount?: number;
  reasons?: Reason[];
  why?: Why;
  answers?: boolean[];
  newPayee?: boolean;
};

/** A payment to a new person the user chose to send later, once the 24h lock ends. */
export type Intent = { id: string; address: string; name: string; amount: number; unlockAt: number };

/** Trustee-side activity feed entry. */
export type ActivityEvent = { id: string; time: number; icon: string; title: string; sub: string };

export type Verdict = 'refused' | 'waiting' | 'needs_trustee' | 'safe' | 'cooldown';

export type CheckResult = {
  paymentId?: string;
  nonce?: string;
  /** Live: the amount as the backend normalized it, e.g. "12.5". */
  amountText?: string;
  /** Live: scam reports for the recipient, from the check. */
  reports?: { verified: number; unverified: number };
  verdict: Verdict;
  reqId?: string;
  why?: Why;
  reasons?: Reason[];
  /** Live: the reason codes from the check, as the backend sent them. They go to the trustee. */
  codes?: string[];
  newPayee?: boolean;
  capped?: boolean;
  unlockAt?: number;
  left?: number;
};

export type Notice = { icon: string; title: string; body: string };

export type Banner = { id: string; title: string; body: string; reqId?: string };

/** What the user is in the middle of sending. */
export type Draft = { address: string; name: string; amount?: number };
