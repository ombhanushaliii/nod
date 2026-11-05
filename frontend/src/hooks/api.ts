import { useCallback } from 'react';
import { isAddress } from 'viem';

import { reportsFor, reqState } from '@/data/engine';
import { useStore } from '@/data/store';
import type { CheckResult, Draft, RequestState } from '@/data/types';
import { apiRequest } from '@/wallet/backend';
import { useWallet } from '@/wallet/context';
import { useWalletAuth, useUsdcBalance, useWalletSetup } from '@/wallet/hooks';
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

export function useCheckPayment() {
  const check = useStore((s) => s.check);
  const { mode, getAccessToken, userId } = useWallet();
  const setup = useWalletSetup();
  return useCallback(async (draft: Draft): Promise<CheckResult> => {
    if (mode === 'demo') return check(draft);
    if (!isAddress(draft.address)) throw new Error('Enter a valid recipient address.');
    const amount = amountString(draft.amount ?? 0);
    await setup();
    const checked = await apiRequest<{
      paymentId: string; nonce: string; verdict: CheckResult['verdict']; reasons: string[]; unlockAt: string | null;
    }>(getAccessToken, '/payments/check', { to: draft.address.toLowerCase(), amount });
    if (useStore.getState().liveUserId !== userId || !useStore.getState().session) throw new Error('Your account changed. Check the payment again.');
    const result: CheckResult = {
      paymentId: checked.paymentId, nonce: checked.nonce, verdict: checked.verdict,
      unlockAt: checked.unlockAt ? new Date(checked.unlockAt).getTime() : undefined,
      newPayee: checked.reasons.includes('new_payee'),
      why: checked.reasons.some((r) => !['new_payee', 'over_limit', 'first_payment_cap'].includes(r)) ? 'flagged' : 'limit',
      reasons: checked.reasons.map((reason) => ({ title: reason.replaceAll('_', ' '), detail: 'Your safety check requires this before sending.', tag: reason, tone: 'amber' })),
    };
    useStore.setState({ draft, result });
    return result;
  }, [mode, check, setup, getAccessToken, userId]);
}

export function useSendPayment() {
  const confirmSend = useStore((s) => s.confirmSend);
  const { mode, getAccessToken, userId } = useWallet();
  const setup = useWalletSetup();
  return async (): Promise<{ txHash: string }> => {
    if (mode !== 'demo') {
      const { draft, result } = useStore.getState();
      if (!result?.paymentId || !draft) throw new Error('Check this payment before sending.');
      const tx = buildUsdcTransfer(draft.address, amountString(draft.amount ?? 0));
      const assertSession = () => {
        const current = useStore.getState();
        if (!current.session || current.liveUserId !== userId) throw new Error('Your wallet session changed. Sign in to check payment status.');
      };
      await setup();
      // The backend rebuilds the transfer from its saved payment.
      const txHash = await sendCheckedPayment(result.paymentId, tx, (path, body) => apiRequest(getAccessToken, path, body), assertSession);
      const state = useStore.getState();
      useStore.setState({
        sentText: `${amountString(draft.amount ?? 0)} USDC to ${draft.name}`,
        payments: [{ id: result.paymentId, to: draft.name, address: draft.address, amount: draft.amount ?? 0, time: Date.now() }, ...state.payments.filter((p) => p.id !== result.paymentId)],
      });
      return { txHash };
    }
    confirmSend();
    return { txHash: '0x' + Math.random().toString(16).slice(2).padEnd(64, '0') };
  };
}

export function useRequestApproval() {
  const submit = useStore((s) => s.submitApproval);
  const { mode } = useWallet();
  return async (): Promise<{ requestKey: string | null }> => {
    if (mode !== 'demo') throw new Error('Arkiv approval requests must be connected before requesting trustee approval.');
    return { requestKey: submit() };
  };
}

export function useApprovalStatus(requestKey: string | null, now: number): RequestState | null {
  const req = useStore((s) => s.requests.find((r) => r.id === requestKey));
  return req ? reqState(req, now) : null;
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
  return address ? reportsFor({ reports }, address) : { verified: 0, unverified: 0 };
}
