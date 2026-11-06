// The trustee's side (D5), live mode. Plain functions with their
// dependencies passed in, so tests can run them with node. Type imports only.
import type { PaymentRequestPayload } from '@guardian/arkiv/src/payload';
import type { ApprovalRequest, Reason, Why } from '@/data/types';

/** Someone this trustee protects, from GET /trustee/users. */
export type LivePerson = { pairId: string; walletAddress: string; limit: number; mode: 'first_per_payee' | 'every_time' };

/** An approval_request row from Arkiv (queryPendingRequests). */
export type RequestRow = { key: string; creator: string; pairId: string; kind: string; createdAt: number; sealed: Uint8Array };

/** The token from an invite link (nod://trustee/invite?token=…): 32 random bytes, base64url. */
// Linking.parse puts "trustee" in hostname for nod://trustee/invite, and in
// path for dev links (exp://…/--/trustee/invite). Both count.
export function inviteTokenFrom(link: { hostname?: string | null; path?: string | null }, token: unknown): string | null {
  const full = [link.hostname, link.path].filter(Boolean).join('/').replace(/^\/+|\/+$/g, '');
  if (full !== 'trustee/invite' && link.path?.replace(/^\/+|\/+$/g, '') !== 'trustee/invite') return null;
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export const REQUEST_TTL_MS = 30 * 60 * 1000;
export const NEW_PAYEE_WAIT_MS = 24 * 60 * 60 * 1000;

const LIMIT_REASONS = new Set(['new_payee', 'over_limit', 'first_payment_cap']);

const REASONS: Record<string, Omit<Reason, 'tag'>> = {
  new_payee: { title: 'New person', detail: 'They have never paid this address.', tone: 'gray' },
  over_limit: { title: 'Over their limit', detail: 'Bigger than the amount you set.', tone: 'amber' },
  first_payment_cap: { title: 'First payment', detail: 'Their first payment is capped at $10.', tone: 'amber' },
  scam_report: { title: 'Reported as a scam', detail: 'A trusted source reported this address.', tone: 'red' },
  unverified_scam_report: { title: 'Unconfirmed report', detail: 'Someone reported this address. Not verified.', tone: 'amber' },
  look_alike: { title: 'Looks like someone they paid', detail: 'The address is close to one they know. A common trick.', tone: 'red' },
  risk_check_unavailable: { title: 'Safety check was down', detail: "The address couldn't be checked right now.", tone: 'amber' },
};

/** A reason code from the backend, in words. */
export function reasonFromTag(tag: string): Reason {
  const known = REASONS[tag];
  if (known) return { ...known, tag: tag.replaceAll('_', ' ') };
  if (tag.startsWith('goplus:')) {
    return { title: 'Flagged by a security service', detail: tag.slice(7).replaceAll('_', ' '), tone: 'red', tag: 'risk' };
  }
  return { title: tag.replaceAll('_', ' '), detail: 'The safety check flagged this.', tone: 'amber', tag: 'check' };
}

/** A steady avatar for someone known only by their address. */
export const avatarFor = (address: string, count: number) => parseInt(address.slice(-4), 16) % count || 0;

const isOutOfGas = (err: unknown) => /insufficient funds/i.test(String((err as Error)?.message ?? err));

/** Runs an Arkiv write; if the key is out of tGLM, tops up once and tries again. */
export async function withRefill<T>(write: () => Promise<T>, refill: () => Promise<unknown>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (!isOutOfGas(err)) throw err;
    await refill();
    return write();
  }
}

export const whyFrom = (tags: string[]): Why => (tags.some((t) => !LIMIT_REASONS.has(t)) ? 'flagged' : 'limit');

/**
 * Turns Arkiv rows into requests the trustee can act on. A row counts only if
 * it was written by the protected user's own wallet for their pair, opens with
 * the trustee's key, and its contents check out. Everything else is dropped.
 */
export function readRequests(args: {
  rows: RequestRow[];
  people: LivePerson[];
  open: (sealed: Uint8Array) => unknown;
  parse: (value: unknown) => PaymentRequestPayload | null;
}): ApprovalRequest[] {
  const byPair = new Map(args.people.map((p) => [p.pairId.toLowerCase(), p]));
  const out: ApprovalRequest[] = [];
  for (const row of args.rows) {
    const person = byPair.get(row.pairId.toLowerCase());
    if (!person || row.kind !== 'payment') continue;
    if (row.creator.toLowerCase() !== person.walletAddress.toLowerCase()) continue;
    let payload: PaymentRequestPayload | null;
    try {
      payload = args.parse(args.open(row.sealed));
    } catch {
      continue;
    }
    if (!payload) continue;
    const units = BigInt(payload.amount);
    out.push({
      id: row.key.toLowerCase(),
      kind: 'payment',
      pairId: person.pairId,
      paymentId: payload.paymentId,
      createdAt: row.createdAt,
      expiresAt: row.createdAt + REQUEST_TTL_MS,
      status: 'pending',
      address: payload.to,
      name: payload.name || 'Someone new',
      amount: Number(units) / 1e6,
      amountUnits: payload.amount,
      nonce: payload.nonce,
      reasons: payload.reasons.map(reasonFromTag),
      why: whyFrom(payload.reasons),
      answers: payload.answers,
      newPayee: payload.newPayee,
    });
  }
  return out;
}

/** Keeps what the trustee already answered; adds new pending requests; drops nothing they decided. */
export function mergeRequests(current: ApprovalRequest[], fresh: ApprovalRequest[]): ApprovalRequest[] {
  const known = new Map(current.map((r) => [r.id, r]));
  const merged = [...current];
  for (const r of fresh) if (!known.has(r.id)) merged.unshift(r);
  return merged.sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);
}

/**
 * Tells the backend about a decision. Arkiv may take a block or two to show
 * it, so while the backend still says awaiting_trustee, ask again (1.5s, 3s).
 */
export async function notifyDecision(
  post: () => Promise<{ status?: string }>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const res = await post();
    if (res?.status !== 'awaiting_trustee' || attempt >= 2) return;
    await wait(1500 * (attempt + 1));
  }
}

export type DecideDeps = {
  intentHash: (to: `0x${string}`, amount: bigint, nonce: `0x${string}`) => string;
  writeReport: (address: string) => Promise<string>;
  writeDecision: (input: {
    pairId: string; requestKey: string; verdict: 'allow' | 'deny'; intentHash?: string; validFrom?: number; reportKey?: string;
  }) => Promise<string>;
  /** POST /trustee/decisions: the backend records it and tells the user. */
  notify: (pairId: string, requestKey: string) => Promise<unknown>;
  now?: () => number;
};

/**
 * Writes the trustee's answer with the per-pair key. Allow is bound to this
 * exact payment (intentHash). Deny of a flagged payment also reports the
 * address publicly; if the report fails, the deny still goes out. A deny only
 * because of the limit reports nothing: the address may be someone real.
 */
export async function decide(r: ApprovalRequest, allow: boolean, deps: DecideDeps): Promise<Partial<ApprovalRequest>> {
  if (!r.pairId || !r.address || !r.amountUnits || !r.nonce) throw new Error('This request is missing details.');
  const now = (deps.now ?? Date.now)();
  if (allow) {
    const validFrom = r.newPayee ? now + NEW_PAYEE_WAIT_MS : now;
    await deps.writeDecision({
      pairId: r.pairId, requestKey: r.id, verdict: 'allow', validFrom,
      intentHash: deps.intentHash(r.address as `0x${string}`, BigInt(r.amountUnits), r.nonce as `0x${string}`),
    });
    await deps.notify(r.pairId, r.id).catch(() => {});
    return { status: 'allowed', decidedAt: now, validFrom };
  }
  let reportKey: string | undefined;
  if (r.why === 'flagged') {
    try {
      reportKey = await deps.writeReport(r.address);
    } catch {
      reportKey = undefined;
    }
  }
  await deps.writeDecision({ pairId: r.pairId, requestKey: r.id, verdict: 'deny', reportKey });
  await deps.notify(r.pairId, r.id).catch(() => {});
  return { status: 'denied', decidedAt: now };
}
