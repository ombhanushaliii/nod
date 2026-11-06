import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { isAddress } from 'viem';

import { seal } from '@guardian/arkiv/src/crypto';
import { usdcToUnits } from '@guardian/arkiv/src/payload';
import { createApprovalRequest } from '@guardian/arkiv/src/create';
import { reportsFor, reqState } from '@/data/engine';
import { useStore } from '@/data/store';
import type { ApprovalRequest, CheckResult, Draft, Payment, RequestState, RulesMode } from '@/data/types';
import { short } from '@/lib/format';
import { approvalPatch, type ApprovalView, type PairView, pollDelay, requestExportApproval, requestPaymentApproval } from '@/wallet/approvals';
import { apiRequest, ApiError } from '@/wallet/backend';
import { useWallet } from '@/wallet/context';
import { useWalletAuth, useUsdcBalance, useWalletSetup } from '@/wallet/hooks';
import { getPushToken, onPush } from '@/wallet/push';
import { useWalletSigning } from '@/wallet/signing';
import { reasonsFor, whyFrom } from '@/wallet/trustee';
import { amountString, buildUsdcTransfer } from '@/wallet/transactions';
import { sendCheckedPayment } from '@/wallet/payments';

export { useWalletSetup } from '@/wallet/hooks';
export { useWalletSigning } from '@/wallet/signing';

export function useAuth() {
  return useWalletAuth();
}

export function useBalance() {
  return useUsdcBalance();
}

/** Calls the backend as the signed-in user, and a guard that throws if the account changed meanwhile. */
export function useLiveApi() {
  const { mode, getAccessToken, userId } = useWallet();
  const api = useCallback(<T,>(path: string, body?: unknown) => apiRequest<T>(getAccessToken, path, body), [getAccessToken]);
  const assertSession = useCallback(() => {
    const s = useStore.getState();
    if (!s.session || s.liveUserId !== userId) throw new Error('Your account changed. Start again.');
  }, [userId]);
  return { live: mode !== 'demo', api, assertSession };
}

const patchRequest = (id: string, patch: Partial<ApprovalRequest>) =>
  useStore.setState((s) => ({ requests: s.requests.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));

export function useCheckPayment() {
  const check = useStore((s) => s.check);
  const { live, api, assertSession } = useLiveApi();
  const setup = useWalletSetup();
  return useCallback(async (draft: Draft): Promise<CheckResult> => {
    if (!live) return check(draft);
    if (!isAddress(draft.address)) throw new Error('Enter a valid recipient address.');
    const amount = amountString(draft.amount ?? 0);
    await setup();
    const checked = await api<{
      paymentId: string; nonce: string; verdict: CheckResult['verdict']; reasons: string[]; unlockAt: string | null;
      amount: string; reports: { verified: number; unverified: number };
      // Cooldown for a new person: how much of their $10 can still go now.
      newPayeeLeft?: string | null;
    }>('/payments/check', { to: draft.address.toLowerCase(), amount });
    assertSession();
    const unlockAt = checked.unlockAt ? new Date(checked.unlockAt).getTime() : undefined;
    const result: CheckResult = {
      paymentId: checked.paymentId, nonce: checked.nonce, amountText: checked.amount, reports: checked.reports,
      verdict: checked.verdict,
      unlockAt,
      newPayee: checked.reasons.includes('new_payee'),
      left: checked.newPayeeLeft != null ? Number(checked.newPayeeLeft) : undefined,
      why: whyFrom(checked.reasons),
      reasons: reasonsFor(checked.reasons, 'user'),
      codes: checked.reasons,
    };
    useStore.setState((s) => ({
      draft, result,
      answers: result.verdict === 'needs_trustee' ? [null, null, null] : s.answers,
      // A new person with no trustee OK: show it on home until it unlocks.
      intents: result.verdict === 'cooldown' && unlockAt
        ? [{ id: 'i' + checked.paymentId, address: draft.address, name: draft.name, amount: draft.amount ?? 0, unlockAt },
          ...s.intents.filter((i) => !(i.address.toLowerCase() === draft.address.toLowerCase() && i.amount === draft.amount))]
        : s.intents,
    }));
    return result;
  }, [live, check, setup, api, assertSession]);
}

export function useSendPayment() {
  const confirmSend = useStore((s) => s.confirmSend);
  const { live, api, assertSession } = useLiveApi();
  const setup = useWalletSetup();
  return async (): Promise<{ txHash: string }> => {
    if (live) {
      const { draft, result } = useStore.getState();
      if (!result?.paymentId || !draft) throw new Error('Check this payment before sending.');
      const tx = buildUsdcTransfer(draft.address, amountString(draft.amount ?? 0));
      await setup();
      // The backend rebuilds the transfer from its saved payment.
      let txHash: string;
      try {
        txHash = await sendCheckedPayment(result.paymentId, tx, api, assertSession);
      } catch (err) {
        // Privy refused: the signer may have been removed. Add it again next time.
        if (err instanceof ApiError && err.code === 'send_failed') useStore.setState({ signerAddedFor: null });
        throw err;
      }
      const state = useStore.getState();
      useStore.setState({
        sentText: `${amountString(draft.amount ?? 0)} USDC to ${draft.name}`,
        payments: [{ id: result.paymentId, to: draft.name, address: draft.address, amount: draft.amount ?? 0, time: Date.now() }, ...state.payments.filter((p) => p.id !== result.paymentId)],
        requests: state.requests.map((r) => (r.paymentId === result.paymentId ? { ...r, used: true } : r)),
        intents: state.intents.filter((i) => !(i.address.toLowerCase() === draft.address.toLowerCase() && i.amount === draft.amount)),
      });
      return { txHash };
    }
    confirmSend();
    return { txHash: '0x' + Math.random().toString(16).slice(2).padEnd(64, '0') };
  };
}

/** Sign-up step 2: email the trustee an invite. */
export function useInviteTrustee() {
  const invite = useStore((s) => s.invite);
  const { live, api, assertSession } = useLiveApi();
  const setup = useWalletSetup();
  return async (contact: string) => {
    if (live) {
      // Registers the wallet first (the invite needs an account) and tops up tGLM.
      await setup();
      // The @handle the user sees in the app, so the trustee knows who asked.
      await api('/onboarding/invite', { trusteeEmail: contact.trim(), inviterName: useStore.getState().username || undefined });
      assertSession();
    }
    invite(contact);
  };
}

/** Writes the sealed request to Arkiv, then hands it to the backend, which pushes the trustee. */
export function useRequestApproval() {
  const submit = useStore((s) => s.submitApproval);
  const { live, api, assertSession } = useLiveApi();
  const setup = useWalletSetup();
  const { getArkivWalletClient } = useWalletSigning();
  return async (): Promise<{ requestKey: string | null }> => {
    if (!live) return { requestKey: submit() };
    const { draft, result, answers } = useStore.getState();
    if (!draft || !result?.paymentId || !result.nonce || !result.amountText) throw new Error('Check this payment again first.');
    const input = {
      paymentId: result.paymentId, to: draft.address, amountText: result.amountText, nonce: result.nonce,
      name: draft.name, reasons: result.codes ?? [], answers: answers.map((a) => !!a) as [boolean, boolean, boolean],
      newPayee: !!result.newPayee,
    };
    const { requestKey, expiresAt } = await requestPaymentApproval(input, {
      api, toUnits: usdcToUnits, seal, refill: setup, assertSession,
      writeRequest: async (pairId, sealed) => {
        const client = await getArkivWalletClient();
        const { entityKey } = await createApprovalRequest(client, { pairId, kind: 'payment', sealed });
        return entityKey;
      },
      savedKey: (id) => useStore.getState().requestKeys[id],
      saveKey: (id, key) => useStore.setState((s) => ({ requestKeys: { ...s.requestKeys, [id]: key } })),
    });
    const now = Date.now();
    const req: ApprovalRequest = {
      id: requestKey, kind: 'payment', paymentId: result.paymentId, createdAt: now, status: 'pending',
      expiresAt: expiresAt ?? undefined, address: draft.address, name: draft.name, amount: draft.amount,
      reasons: result.reasons, why: result.why, answers: input.answers, newPayee: input.newPayee,
    };
    useStore.setState((s) => ({ requests: [req, ...s.requests.filter((r) => r.id !== requestKey)], waitingId: requestKey }));
    return { requestKey };
  };
}

/** Key export (D2): asks the trustee, live. Demo mode keeps its local request. */
export function useRequestExport() {
  const demoRequest = useStore((s) => s.requestExport);
  const { live, api, assertSession } = useLiveApi();
  const setup = useWalletSetup();
  const { getArkivWalletClient } = useWalletSigning();
  return useCallback(async () => {
    if (!live) return demoRequest();
    const { exportId, requestKey, expiresAt } = await requestExportApproval({
      api, seal, refill: setup, assertSession,
      writeRequest: async (pairId, sealed) => {
        const client = await getArkivWalletClient();
        return (await createApprovalRequest(client, { pairId, kind: 'export', sealed })).entityKey;
      },
    });
    const req: ApprovalRequest = {
      id: requestKey, kind: 'export', exportId, createdAt: Date.now(), status: 'pending', expiresAt: expiresAt ?? undefined,
    };
    // One export request at a time: a new one replaces the old.
    useStore.setState((s) => ({ requests: [req, ...s.requests.filter((r) => r.kind !== 'export')] }));
  }, [live, demoRequest, api, assertSession, setup, getArkivWalletClient]);
}

/** Marks the live export used once the export page reports back. */
export const markExportUsed = (id: string) => patchRequest(id, { used: true });

/** Asks the backend about one request: has the trustee answered? */
function useRefreshRequest() {
  const { api, assertSession } = useLiveApi();
  return useCallback(async (req: ApprovalRequest) => {
    const path = req.exportId
      ? `/exports/${encodeURIComponent(req.exportId)}/approval`
      : req.paymentId ? `/payments/${encodeURIComponent(req.paymentId)}/approval` : null;
    if (!path) return null;
    try {
      const view = await api<ApprovalView>(path, {});
      assertSession();
      const patch = approvalPatch(view, Date.now());
      if (patch) patchRequest(req.id, patch);
      return patch;
    } catch (err) {
      // The decision didn't match this payment, or the trustee link ended: stop waiting.
      if (err instanceof ApiError && err.status === 409) patchRequest(req.id, { status: 'expired' });
      return null;
    }
  }, [api, assertSession]);
}

export function useApprovalStatus(requestKey: string | null, now: number): RequestState | null {
  const req = useStore((s) => s.requests.find((r) => r.id === requestKey));
  const { live } = useLiveApi();
  const refresh = useRefreshRequest();
  const attempt = useRef(0);
  const pending = !!req && reqState(req, now) === 'pending';

  // Live: ask while this screen is open and the app is in front, backing off,
  // and never past the request's expiry. A push or reopening asks at once.
  useFocusEffect(useCallback(() => {
    if (!live || !(req?.paymentId || req?.exportId) || !pending) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const tick = async () => {
      if (stopped || AppState.currentState !== 'active') return;
      const patch = await refresh(req);
      if (stopped || (patch && patch.status !== 'pending')) return;
      const ends = req.expiresAt ?? Infinity;
      const delay = pollDelay(attempt.current++);
      if (Date.now() + delay < ends + 60_000) timer = setTimeout(tick, delay);
    };
    void tick();
    const app = AppState.addEventListener('change', (s) => { if (s === 'active') { attempt.current = 0; void tick(); } });
    const push = onPush(() => { attempt.current = 0; void tick(); });
    return () => { stopped = true; if (timer) clearTimeout(timer); app.remove(); push(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when the request or its state changes
  }, [live, req?.id, pending]));

  return req ? reqState(req, now) : null;
}

/** Home: one read of everything in progress, and the payment history. */
export function useRefreshHome() {
  const { live, api, assertSession } = useLiveApi();
  const refresh = useRefreshRequest();
  useFocusEffect(useCallback(() => {
    if (!live) return;
    const now = Date.now();
    for (const r of useStore.getState().requests) {
      const st = reqState(r, now);
      if ((r.paymentId || r.exportId) && !r.used && !r.dismissed && (st === 'pending' || st === 'allowed')) void refresh(r);
    }
    api<{ payments: { paymentId: string; status: string; to: string; amount: string; createdAt: string }[] }>('/payments?limit=20')
      .then(({ payments }) => {
        assertSession();
        const named = new Map(useStore.getState().payments.map((p) => [p.id, p.to]));
        const sent: Payment[] = payments.filter((p) => p.status === 'sent' || p.status === 'submitted').map((p) => ({
          id: p.paymentId, to: named.get(p.paymentId) ?? short(p.to), address: p.to, amount: Number(p.amount), time: Date.parse(p.createdAt),
        }));
        useStore.setState({ payments: sent, firstDone: sent.length > 0 || useStore.getState().firstDone });
      })
      .catch(() => {});
  }, [live, api, assertSession, refresh]));
}

const pairToStore = (pair: PairView) => {
  if (pair.status === 'active') return { trusteeStatus: 'active' as const, pairId: pair.pairId, onboarded: true };
  if (pair.status === 'none') return { trusteeStatus: 'none' as const, pairId: null };
  return { trusteeStatus: 'pending' as const, trusteeContact: pair.contact, pairId: null, onboarded: true };
};

/**
 * The user's trustee link and rules, kept fresh without polling: read when the
 * wallet opens, when the app comes back to the front, and when a push says
 * something changed (trustee accepted, rules changed).
 */
export function useUserSync() {
  const { live, api, assertSession } = useLiveApi();
  const { session } = useWallet();
  useEffect(() => {
    if (!live || !session) return;
    let stopped = false;
    const readPair = () => api<PairView>('/pair')
      .then((pair) => { if (!stopped) { assertSession(); useStore.setState(pairToStore(pair)); } })
      // not_onboarded: a fresh sign-up, nothing to read yet.
      .catch(() => {});
    const readRules = () => api<{ amountLimit: string; notifyMode: RulesMode }>('/rules')
      .then((r) => {
        if (stopped) return;
        assertSession();
        useStore.setState((s) => ({ rules: { ...s.rules, limit: Number(r.amountLimit), mode: r.notifyMode } }));
      })
      .catch(() => {});
    const readAll = () => { void readPair(); void readRules(); };
    readAll();
    const app = AppState.addEventListener('change', (s) => { if (s === 'active') readAll(); });
    const push = onPush((data) => {
      if (data.type === 'trustee_accepted') void readPair();
      if (data.type === 'rules_changed') void readRules();
    });
    return () => { stopped = true; app.remove(); push(); };
  }, [live, session, api, assertSession]);
}

/** Registers this phone for pushes once the account exists. Quietly does nothing until push is set up. */
export function usePushRegistration(enabled: boolean) {
  const { live, api } = useLiveApi();
  const { userId } = useWallet();
  useEffect(() => {
    if (!live || !enabled || !userId) return;
    let stopped = false;
    getPushToken()
      .then(async ({ token }) => { if (token && !stopped) await api('/push/register', { expoToken: token }); })
      .catch(() => {});
    return () => { stopped = true; };
  }, [live, enabled, userId, api]);
}

export function usePendingRequests(now: number) {
  const requests = useStore((s) => s.requests);
  return requests.filter((r) => reqState(r, now) === 'pending');
}

export function useDecide() {
  const decide = useStore((s) => s.decide);
  const { mode } = useWallet();
  return async (requestKey: string, allow: boolean) => {
    if (mode !== 'demo') throw new Error('Arkiv decision submission must be connected before approving requests.');
    return decide(requestKey, allow);
  };
}

export function useRules() {
  return useStore((s) => s.rules);
}

export function useScamReports(address?: string | null) {
  const reports = useStore((s) => s.reports);
  const result = useStore((s) => s.result);
  const draft = useStore((s) => s.draft);
  const { live } = useLiveApi();
  if (!address) return { verified: 0, unverified: 0 };
  if (live) {
    // From this payment's check (the backend reads Arkiv).
    const same = draft?.address.toLowerCase() === address.toLowerCase();
    return same && result?.reports ? result.reports : { verified: 0, unverified: 0 };
  }
  return reportsFor({ reports }, address);
}
