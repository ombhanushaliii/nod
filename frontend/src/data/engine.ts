// Mock of the backend's payment rules (docs/architecture-decisions.md, D3), ported from the
// prototype so the app behaves the same. When the real backend lands, `evaluate` is replaced
// by POST /payments/check and these helpers move server-side.

import { DAY, HOUR, m0, money } from '@/lib/format';
import type { ApprovalRequest, CheckResult, Payee, Payment, Reason, RequestState, Rules } from './types';

export const ADDR = {
  MOM: '0x51b0c3d9a8e74f2b6c1d0e9f8a7b6c5d4e3f2a10',
  ARI: '0x8f2c41b9e07d3a6c5512e9a04b7d1c3e6f0a92d4',
  SCAM: '0x7a3f00c1d2e4b5a6978812ab34cd56ef7890dead',
  RISKY: '0x3e9d0bad1c2f4a5b6c7d8e9f0a1b2c3d4e5f6071',
  LOOK: '0x51b0c3e0a1f2b3c4d5e6f708192a3b4c5d6e2a10',
  RUMOR: '0x9c4e7d1a2b3c4d5e6f708192a3b4c5d6e7f8beef',
} as const;

/** The user's own (mock) wallet address. */
export const MY_ADDRESS = '0x4c1d7b2e9f3a6c8d0e5b4a7f1c9d2e6b3f8aa7e2';

export const QUESTIONS = [
  'Did someone contact you first and ask for this money?',
  'Are you being rushed, or promised more money back?',
  'Do you know this person in real life?',
];
/** The answer to each question that's a warning sign. */
export const BAD_ANSWERS = [true, true, false];

export const FIRST_PAYMENT_CAP = 10;
export const NEW_PAYEE_CAP = 10;
export const REQUEST_TTL = 24 * 3600e3; // approval_request lives 24 h
// An allowed payment has no time limit to send (demo matches the backend).
export const APPROVAL_WINDOW = 10 * 365 * 24 * HOUR;
export const TAKEN_USERNAMES = ['admin', 'satoshi', 'wallet'];

export type EngineState = {
  payees: Payee[];
  payments: Payment[];
  requests: ApprovalRequest[];
  reports: string[];
  rules: Rules;
  firstDone: boolean;
};

export const same = (a?: string, b?: string) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase();

/** When an allowed request stops being usable: the backend's time when live. Payments: no limit in practice. */
export const approvalEnds = (r: Pick<ApprovalRequest, 'validFrom' | 'validUntil'>) => r.validUntil ?? (r.validFrom ?? 0) + APPROVAL_WINDOW;

export function reqState(r: ApprovalRequest, now: number): RequestState {
  if (r.status === 'pending' && now >= (r.expiresAt ?? r.createdAt + REQUEST_TTL)) return 'expired';
  return r.status;
}

export function payeeBy(s: Pick<EngineState, 'payees'>, address?: string) {
  return s.payees.find((p) => same(p.address, address));
}

/** How much of the $10 new-person allowance is left for this address. */
export function capLeft(s: Pick<EngineState, 'payees' | 'payments'>, address: string, now: number) {
  const p = payeeBy(s, address);
  const since = p ? p.addedAt : now;
  const sent = s.payments.filter((x) => same(x.address, address) && x.time >= since).reduce((t, x) => t + x.amount, 0);
  return Math.max(0, Math.round((NEW_PAYEE_CAP - sent) * 100) / 100);
}

export function sentToday(s: Pick<EngineState, 'payments'>, now: number) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return s.payments.filter((p) => p.time >= d.getTime()).reduce((t, p) => t + p.amount, 0);
}

/** Scam reports for an address: verified (trusted reporters) vs unverified. Mock of Arkiv `queryReports`. */
export function reportsFor(s: Pick<EngineState, 'reports'>, address: string) {
  const a = address.toLowerCase();
  return {
    verified: (a === ADDR.SCAM ? 3 : 0) + s.reports.filter((x) => x === a).length,
    unverified: a === ADDR.SCAM || a === ADDR.RUMOR ? 2 : 0,
  };
}

export function flags(s: Pick<EngineState, 'reports' | 'payees'>, address: string): Reason[] {
  const a = address.toLowerCase();
  const out: Reason[] = [];
  const rep = reportsFor(s, a);
  if (rep.verified) {
    out.push({
      title: 'Reported as a scam',
      detail: `${rep.verified} verified report${rep.verified > 1 ? 's' : ''}${rep.unverified ? ` · ${rep.unverified} unverified` : ''}`,
      tag: 'VERIFIED',
      tone: 'red',
    });
  }
  // Stand-in for the GoPlus risk lookup.
  if (!a.startsWith('@') && a.includes('bad')) {
    out.push({ title: 'Failed the security check', detail: 'Linked to phishing activity', tag: 'RISK CHECK', tone: 'red' });
  }
  const look = s.payees.find(
    (p) => p.address.toLowerCase() !== a && p.address.slice(0, 6).toLowerCase() === a.slice(0, 6) && p.address.slice(-4).toLowerCase() === a.slice(-4),
  );
  if (look) {
    out.push({ title: `Looks like ${look.name}'s address`, detail: 'Same start and end, different middle. A common trick.', tag: 'LOOK-ALIKE', tone: 'amber' });
  }
  return out;
}

/** The D3 rules, in order: first-payment cap, approvals, flags, daily max, limit, new-person 24h. */
export function evaluate(s: EngineState, address: string, amount: number, now: number): CheckResult {
  const R = s.rules;
  const payee = payeeBy(s, address);
  if (!s.firstDone && amount > FIRST_PAYMENT_CAP) return { verdict: 'refused' };

  const appr = s.requests.find(
    (r) => r.kind === 'payment' && same(r.address, address) && r.amount === amount && r.status === 'allowed' && !r.used && now < (r.validFrom ?? 0) + APPROVAL_WINDOW,
  );
  if (appr) {
    return now < (appr.validFrom ?? 0) ? { verdict: 'cooldown', unlockAt: appr.validFrom, reqId: appr.id } : { verdict: 'safe', reqId: appr.id };
  }

  const pend = s.requests.find((r) => r.kind === 'payment' && same(r.address, address) && reqState(r, now) === 'pending');
  if (pend) return { verdict: 'waiting', reqId: pend.id };

  const reasons = flags(s, address);
  if (reasons.length) return { verdict: 'needs_trustee', why: 'flagged', reasons };

  const today = sentToday(s, now);
  if (R.daily && today + amount > R.daily) {
    return {
      verdict: 'needs_trustee',
      why: 'daily',
      reasons: [{ title: `Over the ${m0(R.daily)} daily max`, detail: `Already sent ${money(today)} today. This would make ${money(today + amount)}.`, tag: 'DAILY', tone: 'amber' }],
    };
  }

  if (amount > R.limit && (R.mode === 'every_time' || !payee?.overCleared)) {
    return {
      verdict: 'needs_trustee',
      why: 'limit',
      reasons: [
        {
          title: `Over the ${m0(R.limit)} limit`,
          detail: R.mode === 'every_time' ? 'Every payment above the limit needs an OK.' : 'First time above the limit to this person.',
          tag: 'LIMIT',
          tone: 'amber',
        },
      ],
    };
  }

  if (!payee || now < payee.unlockAt) {
    const unlockAt = payee ? payee.unlockAt : now + DAY;
    const left = capLeft(s, address, now);
    return amount <= left ? { verdict: 'safe', newPayee: !payee, capped: true, unlockAt } : { verdict: 'cooldown', unlockAt, newPayee: !payee, left };
  }
  return { verdict: 'safe' };
}

export function modeLabel(m: Rules['mode']) {
  return m === 'every_time' ? 'Every time' : 'First time per person';
}

/** "alex.rivera@gmail.com" → "alexrivera". Mirrors the prototype's handle generator. */
export function handleFrom(email: string) {
  let h = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 15) || 'user';
  if (h.length < 3) h = h + '_' + Math.floor(Math.random() * 90 + 10);
  return h;
}

/** Trustee display name: what they set, or a guess from their email. */
export function trusteeNameFrom(displayName: string, contact: string) {
  if (displayName) return displayName;
  if (contact.includes('@')) {
    const p = contact.split('@')[0].replace(/[^a-z]/gi, ' ').trim().split(' ')[0] || 'Trustee';
    return p[0].toUpperCase() + p.slice(1).toLowerCase();
  }
  return 'Your trustee';
}

export const isValidAddress = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v) || /^@[a-z0-9_]{3,}$/i.test(v);
export const isValidContact = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) || /^\+?[\d\s()-]{7,}$/.test(v);
export const isValidUsername = (v: string) => /^[a-z0-9_]{3,15}$/.test(v);
