// Asking the trustee (D4/D5), live mode. The user's wallet writes a sealed
// approval_request to Arkiv (Rabdi), then tells the backend, which checks it
// and pushes the trustee. The trustee's answer is read back through the
// backend, which verifies it on Arkiv.
//
// Plain functions with their dependencies passed in, so tests can run them
// with node. Only type imports here.
import type { PaymentRequestPayload } from '@guardian/arkiv/src/payload';
import type { ApprovalRequest } from '@/data/types';

export type Api = <T>(path: string, body?: unknown) => Promise<T>;

export type PairView =
  | { status: 'none' }
  | { status: 'invited' | 'invite_expired'; contact: string; inviteExpiresAt: string }
  | { status: 'active'; pairId: string; trusteeEncPubKey: string; acceptedAt: string };

export type ApprovalInput = {
  paymentId: string;
  to: string;
  /** As the check returned it, e.g. "12.5". Never a float from the screen. */
  amountText: string;
  nonce: string;
  name: string;
  reasons: string[];
  answers: [boolean, boolean, boolean];
  newPayee: boolean;
};

export type ApprovalDeps = {
  api: Api;
  toUnits: (amount: string) => string;
  seal: (payload: PaymentRequestPayload, trusteePubKey: Uint8Array) => Uint8Array;
  /** Writes the approval_request from the user's wallet; returns its entity key. */
  writeRequest: (pairId: string, sealed: Uint8Array) => Promise<string>;
  /** Tops up tGLM (POST /onboarding/user). */
  refill: () => Promise<unknown>;
  savedKey: (paymentId: string) => string | undefined;
  saveKey: (paymentId: string, requestKey: string) => void;
  /** Throws if the signed-in account changed while we waited. */
  assertSession: () => void;
  wait?: (ms: number) => Promise<void>;
};

const errorCode = (err: unknown) => (err as { code?: unknown })?.code;
const isOutOfGas = (err: unknown) => /insufficient funds/i.test(String((err as Error)?.message ?? err));

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, '');
  if (!/^[\da-f]*$/i.test(clean) || clean.length % 2) throw new Error('Bad hex');
  return Uint8Array.from(clean.match(/../g) ?? [], (b) => parseInt(b, 16));
}

export function buildPayload(input: ApprovalInput, toUnits: (a: string) => string): PaymentRequestPayload {
  return {
    v: 1,
    kind: 'payment',
    paymentId: input.paymentId,
    to: input.to.toLowerCase() as `0x${string}`,
    amount: toUnits(input.amountText),
    nonce: input.nonce.toLowerCase() as `0x${string}`,
    name: input.name.slice(0, 80),
    reasons: input.reasons.slice(0, 20),
    answers: input.answers,
    newPayee: input.newPayee,
  };
}

/**
 * Writes the request (once per payment) and attaches it. Safe to call again
 * after a failure: a request already written is reused, not written again.
 */
export async function requestPaymentApproval(input: ApprovalInput, deps: ApprovalDeps): Promise<{ requestKey: string; expiresAt: number | null }> {
  const wait = deps.wait ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));

  let requestKey = deps.savedKey(input.paymentId);
  if (!requestKey) {
    // Read fresh: seal to the trustee's current key, never a remembered one.
    const pair = await deps.api<PairView>('/pair');
    deps.assertSession();
    if (pair.status !== 'active') throw new Error("Your trustee hasn't accepted the invite yet.");
    const sealed = deps.seal(buildPayload(input, deps.toUnits), hexToBytes(pair.trusteeEncPubKey));
    try {
      requestKey = await deps.writeRequest(pair.pairId, sealed);
    } catch (err) {
      if (!isOutOfGas(err)) throw err;
      // Out of tGLM: the backend tops up on sign-in. Once, then try again.
      await deps.refill();
      requestKey = await deps.writeRequest(pair.pairId, sealed);
    }
    deps.saveKey(input.paymentId, requestKey);
    deps.assertSession();
  }

  // Arkiv may take a block or two to show the new entity to the backend.
  const path = `/payments/${encodeURIComponent(input.paymentId)}/request`;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await deps.api<{ status: string; expiresAt: string }>(path, { requestKey });
      deps.assertSession();
      return { requestKey, expiresAt: Date.parse(res.expiresAt) || null };
    } catch (err) {
      if (errorCode(err) === 'already_requested') return { requestKey, expiresAt: null };
      if (errorCode(err) !== 'request_not_on_arkiv' || attempt >= 4) throw err;
      await wait(1500 * (attempt + 1));
      deps.assertSession();
    }
  }
}

export type ApprovalView = { status: string; unlockAt?: string | null; validUntil?: string | null };

/** What the backend's answer means for the request shown on the phone. */
export function approvalPatch(view: ApprovalView, now: number): Partial<ApprovalRequest> | null {
  const at = (v?: string | null) => (v ? Date.parse(v) : undefined);
  switch (view.status) {
    case 'awaiting_trustee':
      return { status: 'pending' };
    case 'ready':
    case 'cooling_down': {
      const patch: Partial<ApprovalRequest> = { status: 'allowed', validFrom: at(view.unlockAt) ?? now };
      if (view.validUntil) patch.validUntil = at(view.validUntil);
      return patch;
    }
    case 'denied':
      return { status: 'denied', decidedAt: now };
    case 'expired':
      return { status: 'expired' };
    case 'sending':
    case 'submitted':
    case 'sent':
    case 'failed':
      return { used: true };
    default:
      return null;
  }
}

/** Seconds to wait before asking again: 5, 10, 15, then every 30. */
export const pollDelay = (attempt: number) => (attempt < 3 ? (attempt + 1) * 5000 : 30_000);
