// The trustee's side (D5), live mode. Plain functions with their
// dependencies passed in, so tests can run them with node. Type imports only.
import type { ExportRequestPayload, PaymentRequestPayload } from '@guardian/arkiv/src/payload';
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

/** Who is reading: the wallet user ("you") or their trustee ("they"). */
export type Viewer = 'user' | 'trustee';

type Words = Omit<Reason, 'tag' | 'detail'> & { chip: string; detail: string | Record<Viewer, string> };

const REASONS: Record<string, Words> = {
  new_payee: { title: 'New person', chip: 'new', tone: 'gray',
    detail: { user: "You've never paid this address.", trustee: 'They have never paid this address.' } },
  over_limit: { title: 'Over the limit', chip: 'limit', tone: 'amber',
    detail: { user: 'Bigger than the limit your trustee set.', trustee: 'Bigger than the amount you set.' } },
  first_payment_cap: { title: 'First payment', chip: 'first', tone: 'amber',
    detail: { user: 'Your first payment is capped at $10.', trustee: 'Their first payment is capped at $10.' } },
  scam_report: { title: 'Reported as a scam', chip: 'reported', tone: 'red', detail: 'A trusted source reported this address.' },
  // What the verified reports say the address is (from the backend's check).
  'reported:sanctioned': { title: 'Sanctioned by the US government', chip: 'sanctioned', tone: 'red',
    detail: 'On the OFAC sanctions list. Money sent here is likely lost, and paying it can be illegal.' },
  'reported:phishing': { title: 'Reported for phishing', chip: 'phishing', tone: 'red',
    detail: 'Known for tricking people into sending money to it.' },
  'reported:exploit': { title: 'Linked to a hack', chip: 'hack', tone: 'red',
    detail: 'Used to steal money in a known hack.' },
  'reported:scam': { title: 'Reported by a trustee', chip: 'reported', tone: 'red',
    detail: 'Another Nod trustee stopped a payment here and reported it.' },
  unverified_scam_report: { title: 'Unconfirmed report', chip: 'unconfirmed', tone: 'amber',
    detail: 'Someone reported this address. Not verified.' },
  look_alike: { title: 'Looks like someone you know', chip: 'look-alike', tone: 'red',
    detail: {
      user: 'Close to an address you paid before. Scammers copy addresses like this.',
      trustee: 'Close to an address they paid before. Scammers copy addresses like this.',
    } },
  risk_check_unavailable: { title: 'Safety check was down', chip: 'unchecked', tone: 'amber',
    detail: "The address couldn't be checked right now." },
};

// GoPlus labels (supabase/functions/api/lib/risk.ts), in words.
const GOPLUS: Record<string, string> = {
  sanctioned: 'on a sanctions list',
  phishing_activities: 'phishing',
  stealing_attack: 'stealing funds',
  cybercrime: 'cybercrime',
  money_laundering: 'money laundering',
  financial_crime: 'financial crime',
  darkweb_transactions: 'darkweb payments',
  fake_kyc: 'fake identity checks',
  blacklist_doubt: 'a blocklist',
  blackmail_activities: 'blackmail',
  mixer: 'a coin mixer',
  honeypot_related_address: 'a honeypot scam',
  fake_token: 'fake tokens',
  malicious_contracts_created: 'creating malicious contracts',
};

/** A reason code from the backend, in words for whoever is reading. */
export function reasonFromTag(tag: string, viewer: Viewer = 'trustee'): Reason {
  const known = REASONS[tag];
  if (known) {
    const detail = typeof known.detail === 'string' ? known.detail : known.detail[viewer];
    return { title: known.title, detail, tone: known.tone, tag: known.chip };
  }
  if (tag.startsWith('goplus:')) {
    const label = tag.slice(7);
    const what = GOPLUS[label] ?? label.replaceAll('_', ' ');
    return { title: 'Flagged by a security service', detail: `GoPlus links this address to ${what}.`, tone: 'red', tag: 'risk' };
  }
  return { title: tag.replaceAll('_', ' '), detail: 'The safety check flagged this.', tone: 'amber', tag: 'check' };
}

/**
 * Reason codes in words, in the order the check gave them. The generic
 * "reported as a scam" row is left out when a report says what the address is.
 */
export function reasonsFor(codes: string[], viewer: Viewer): Reason[] {
  const specific = codes.some((c) => c.startsWith('reported:'));
  return codes.filter((c) => !(specific && c === 'scam_report')).map((c) => reasonFromTag(c, viewer));
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
  parseExport: (value: unknown) => ExportRequestPayload | null;
}): ApprovalRequest[] {
  const byPair = new Map(args.people.map((p) => [p.pairId.toLowerCase(), p]));
  const out: ApprovalRequest[] = [];
  for (const row of args.rows) {
    const person = byPair.get(row.pairId.toLowerCase());
    if (!person || (row.kind !== 'payment' && row.kind !== 'export')) continue;
    if (row.creator.toLowerCase() !== person.walletAddress.toLowerCase()) continue;
    let opened: unknown;
    try {
      opened = args.open(row.sealed);
    } catch {
      continue;
    }
    if (row.kind === 'export') {
      const exp = args.parseExport(opened);
      if (!exp) continue;
      out.push({
        id: row.key.toLowerCase(), kind: 'export', pairId: person.pairId, exportId: exp.exportId,
        createdAt: row.createdAt, expiresAt: row.createdAt + REQUEST_TTL_MS, status: 'pending',
        nonce: exp.nonce, userWallet: person.walletAddress.toLowerCase(),
      });
      continue;
    }
    const payload = args.parse(opened);
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
      reasons: reasonsFor(payload.reasons, 'trustee'),
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
  exportIntentHash: (wallet: `0x${string}`, nonce: `0x${string}`) => string;
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
  const now = (deps.now ?? Date.now)();
  if (r.kind === 'export') return decideExport(r, allow, deps, now);
  if (!r.pairId || !r.address || !r.amountUnits || !r.nonce) throw new Error('This request is missing details.');
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

/**
 * A key export (D2). Allow is bound to this export and this user's wallet
 * (exportIntentHash), and the backend lets it be used once, within an hour.
 * Deny reports nothing: there's no address to report.
 */
async function decideExport(r: ApprovalRequest, allow: boolean, deps: DecideDeps, now: number): Promise<Partial<ApprovalRequest>> {
  if (!r.pairId || !r.nonce || !r.userWallet) throw new Error('This request is missing details.');
  await deps.writeDecision(allow
    ? {
      pairId: r.pairId, requestKey: r.id, verdict: 'allow', validFrom: now,
      intentHash: deps.exportIntentHash(r.userWallet as `0x${string}`, r.nonce as `0x${string}`),
    }
    : { pairId: r.pairId, requestKey: r.id, verdict: 'deny' });
  await deps.notify(r.pairId, r.id).catch(() => {});
  return allow ? { status: 'allowed', decidedAt: now, validFrom: now } : { status: 'denied', decidedAt: now };
}
