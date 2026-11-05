// The hooks layer from docs/task-split.md ("A defines, B and C fill in").
// Screens call these, never the mock store's internals, so swapping a mock for the real
// Privy / backend / Arkiv call means changing only this file.
//
// Today every hook is backed by the local mock store in src/data.

import { useShallow } from 'zustand/react/shallow';

import { MY_ADDRESS, reportsFor, reqState } from '@/data/engine';
import { useStore } from '@/data/store';
import type { CheckResult, Draft, RequestState, Role } from '@/data/types';

/** B: Privy login (Google), the session's role, and the wallet address. */
export function useAuth() {
  const { session, username, signIn, signOut } = useStore(
    useShallow((s) => ({ session: s.session, username: s.username, signIn: s.signIn, signOut: s.signOut })),
  );
  return {
    session,
    role: session?.role ?? null,
    user: session ? { email: session.email, username } : null,
    walletAddress: session ? MY_ADDRESS : null,
    signIn: async (role: Role, email: string) => signIn(role, email),
    signOut: async () => signOut(),
  };
}

/** B: USDC balance on Base Sepolia. */
export function useBalance() {
  const balance = useStore((s) => s.balance);
  return { balance, symbol: 'USDC' as const };
}

/** C: POST /payments/check. Returns safe / needs_trustee / cooldown / refused (or waiting on a pending request). */
export function useCheckPayment() {
  const check = useStore((s) => s.check);
  return async (draft: Draft): Promise<CheckResult> => check(draft);
}

/** B + C: POST /payments/:id/send, relayed with gas sponsorship. */
export function useSendPayment() {
  const confirmSend = useStore((s) => s.confirmSend);
  return async (): Promise<{ txHash: string }> => {
    confirmSend();
    return { txHash: '0x' + Math.random().toString(16).slice(2).padEnd(64, '0') };
  };
}

/** B + D: encrypt the payment + answers to the trustee and write an approval_request to Arkiv. */
export function useRequestApproval() {
  const submit = useStore((s) => s.submitApproval);
  return async (): Promise<{ requestKey: string | null }> => ({ requestKey: submit() });
}

/** D: status of an approval request on Arkiv. */
export function useApprovalStatus(requestKey: string | null, now: number): RequestState | null {
  const req = useStore((s) => s.requests.find((r) => r.id === requestKey));
  return req ? reqState(req, now) : null;
}

/** D: decrypted requests waiting for this trustee. */
export function usePendingRequests(now: number) {
  const requests = useStore((s) => s.requests);
  return requests.filter((r) => reqState(r, now) === 'pending');
}

/** B + D: write the trustee_decision (and scam_report on deny) with the per-pair key. */
export function useDecide() {
  const decide = useStore((s) => s.decide);
  return async (requestKey: string, allow: boolean) => decide(requestKey, allow);
}

/** C: the user's safety rules (limit, how often, daily max). */
export function useRules() {
  return useStore((s) => s.rules);
}

/** D: verified vs unverified scam reports for an address. */
export function useScamReports(address?: string | null) {
  const reports = useStore((s) => s.reports);
  return address ? reportsFor({ reports }, address) : { verified: 0, unverified: 0 };
}
