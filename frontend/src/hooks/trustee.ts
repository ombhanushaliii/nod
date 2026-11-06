// The trustee's side, live mode: accept the invite, read requests from Arkiv,
// answer them with the per-pair key, and set the rules.
import { createPublicClient, createWalletClient, type PublicArkivClient, type WalletArkivClient } from '@arkiv-network/sdk';
import { createDecision, createScamReport } from '@guardian/arkiv/src/create';
import { exportIntentHash, intentHash, open } from '@guardian/arkiv/src/crypto';
import { parseExportPayload, parsePaymentPayload } from '@guardian/arkiv/src/payload';
import { queryPendingRequests } from '@guardian/arkiv/src/query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { bytesToHex, http, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { useStore } from '@/data/store';
import type { ApprovalRequest, Rules } from '@/data/types';
import { useLiveApi } from '@/hooks/api';
import { apiRequest, ApiError } from '@/wallet/backend';
import { rabdi } from '@/wallet/chains';
import { useWallet } from '@/wallet/context';
import { useWalletSetup } from '@/wallet/hooks';
import { onPush } from '@/wallet/push';
import { useWalletSigning } from '@/wallet/signing';
import { decide, type LivePerson, mergeRequests, notifyDecision, readRequests, withRefill } from '@/wallet/trustee';

type UserView = { pairId: string; walletAddress: string; pairKeyAddress: string; username: string | null; amountLimit: string; notifyMode: LivePerson['mode'] };

const toPerson = (u: UserView): LivePerson => ({ pairId: u.pairId, walletAddress: u.walletAddress, username: u.username, limit: Number(u.amountLimit), mode: u.notifyMode });

type EncKey = { publicKey: Uint8Array; secretKey: Uint8Array };
type PairKey = { privateKey: Hex; address: Address };

// Derived keys live in memory only, per wallet, so the wallet signs each message once per launch.
const keyCache = new Map<string, { enc?: Promise<EncKey>; pairs: Map<string, Promise<PairKey>> }>();

let reader: PublicArkivClient | null = null;
const arkivReader = () => (reader ??= createPublicClient({ chain: rabdi, transport: http(undefined, { retryCount: 0 }), cacheTime: 0 }) as PublicArkivClient);

function useTrusteeKeys() {
  const { walletAddress } = useWallet();
  const signing = useWalletSigning();
  return useMemo(() => {
    const entry = () => {
      if (!walletAddress) throw new Error('Connect your wallet first.');
      const id = walletAddress.toLowerCase();
      let e = keyCache.get(id);
      if (!e) keyCache.set(id, (e = { pairs: new Map() }));
      return e;
    };
    const remember = <T,>(get: () => Promise<T> | undefined, set: (p: Promise<T>) => void, make: () => Promise<T>) => {
      const hit = get();
      if (hit) return hit;
      // A failed signature is not cached, so the next try asks again.
      const p = make().catch((err) => { set(undefined as never); throw err; });
      set(p);
      return p;
    };
    return {
      enc: () => {
        const e = entry();
        return remember(() => e.enc, (p) => { e.enc = p; }, signing.deriveEncryptionKey);
      },
      pair: (pairId: string) => {
        const e = entry();
        const id = pairId.toLowerCase();
        return remember(
          () => e.pairs.get(id),
          (p) => { if (p) e.pairs.set(id, p); else e.pairs.delete(id); },
          async () => { const k = await signing.derivePairKey(id); return { privateKey: k.privateKey, address: k.address }; },
        );
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the signing helpers only change with the wallet
  }, [walletAddress]);
}

const pairClient = (key: PairKey): WalletArkivClient =>
  createWalletClient({ chain: rabdi, account: privateKeyToAccount(key.privateKey), transport: http(undefined, { retryCount: 0 }) });

const patchInbox = (id: string, patch: Partial<ApprovalRequest>) =>
  useStore.setState((s) => ({ inbox: s.inbox.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));

/** Checks the per-pair keys this phone derives against the ones the backend has. */
async function checkPairKeys(users: UserView[], pair: (pairId: string) => Promise<PairKey>) {
  for (const u of users) {
    const k = await pair(u.pairId);
    if (k.address.toLowerCase() !== u.pairKeyAddress.toLowerCase()) {
      throw new Error("This phone's trustee key doesn't match the one you accepted with. Your answers wouldn't count.");
    }
  }
}

/**
 * Who this trustee protects, and their requests from Arkiv. Read when the
 * trustee app opens, when it comes back to the front, and when a push says a
 * request is waiting. Also tops up the per-pair keys' tGLM once per launch.
 */
export function useTrusteeSync() {
  const { live, api, assertSession } = useLiveApi();
  // The session object is rebuilt on every render; key on who is signed in.
  const { userId, session } = useWallet();
  const signedIn = !!session;
  const register = useWalletSetup({ signer: false });
  const keys = useTrusteeKeys();
  useEffect(() => {
    if (!live || !signedIn) return;
    let stopped = false;
    let running = false;
    const sync = async () => {
      if (running || stopped) return;
      running = true;
      try {
        const { users } = await api<{ users: UserView[] }>('/trustee/users');
        if (stopped) return;
        assertSession();
        const people = users.map(toPerson);
        useStore.setState({ people });
        if (people.length === 0) return;
        await checkPairKeys(users, keys.pair);
        const enc = await keys.enc();
        // One query per person, limited to rows their own wallet wrote.
        const rows = (await Promise.all(people.map((p) =>
          queryPendingRequests(arkivReader(), [p.pairId], { createdBy: p.walletAddress as Address })))).flat();
        if (stopped) return;
        assertSession();
        const fresh = readRequests({
          rows, people, open: (b) => open(b, enc.secretKey), parse: parsePaymentPayload, parseExport: parseExportPayload,
        });
        useStore.setState((s) => ({ inbox: mergeRequests(s.inbox, fresh), trusteeError: null }));
      } catch (err) {
        if (!stopped) {
          // A fresh account has nothing to read yet; that's not an error.
          const fresh = err instanceof ApiError && err.code === 'not_onboarded';
          useStore.setState({ trusteeError: fresh ? null : err instanceof Error ? err.message : "Couldn't load requests." });
        }
      } finally {
        running = false;
      }
    };
    // Registers the wallet (and tops up), then reads.
    register().catch(() => {}).finally(() => void sync());
    const app = AppState.addEventListener('change', (st) => { if (st === 'active') void sync(); });
    const push = onPush((data) => { if (data.type === 'approval_request') void sync(); });
    return () => { stopped = true; app.remove(); push(); };
  }, [live, signedIn, userId, api, assertSession, register, keys]);
}

/** An invite sent to the signed-in trustee's email, from GET /trustee/invites. */
export type EmailInvite = { inviteId: string; pairId: string; expiresAt: string; from: string | null };

/**
 * The trustee accepts an invite: the link opened on this phone, or, when given,
 * an invite sent to their email (no link needed; the backend checks the email).
 */
export function useAcceptInvite() {
  const { api, assertSession } = useLiveApi();
  const register = useWalletSetup({ signer: false });
  const keys = useTrusteeKeys();
  return useCallback(async (emailInvite?: Pick<EmailInvite, 'inviteId' | 'pairId'>) => {
    const token = useStore.getState().inviteToken;
    if (!emailInvite && !token) throw new Error('Open the invite link again.');
    try {
      await register();
      const pairId = emailInvite?.pairId ?? (await api<{ pairId: string }>(`/invites/${encodeURIComponent(token!)}`)).pairId;
      assertSession();
      const [pair, enc] = await Promise.all([keys.pair(pairId), keys.enc()]);
      await api('/pairs/accept', {
        ...(emailInvite ? { inviteId: emailInvite.inviteId } : { token }),
        pairKeyAddress: pair.address.toLowerCase(), encPubKey: bytesToHex(enc.publicKey),
      });
      assertSession();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
        useStore.setState({ inviteToken: null });
        throw new Error('This invite was used or has expired. Ask them to send a new one.');
      }
      if (err instanceof ApiError && err.code === 'self_trustee') throw new Error("You can't be your own trustee.");
      throw err;
    }
    const { users } = await api<{ users: UserView[] }>('/trustee/users');
    assertSession();
    useStore.setState({ inviteToken: null, people: users.map(toPerson) });
  }, [api, assertSession, register, keys]);
}

/**
 * Invites sent to the signed-in trustee's email, so they can accept in the app
 * without opening the email link. Read when the screen opens and when the app
 * comes back to the front.
 */
export function useEmailInvites() {
  const { live, api, assertSession } = useLiveApi();
  const register = useWalletSetup({ signer: false });
  const [state, setState] = useState<{ invites: EmailInvite[]; loading: boolean; error: string | null }>({
    invites: [], loading: live, error: null,
  });
  // "Check again" bumps this to read once more.
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!live) return;
    let stopped = false;
    const read = async () => {
      try {
        // The list needs an account, like accepting does.
        await register();
        const { invites } = await api<{ invites: EmailInvite[] }>('/trustee/invites');
        if (stopped) return;
        assertSession();
        setState({ invites, loading: false, error: null });
      } catch {
        if (!stopped) setState((s) => ({ ...s, loading: false, error: "Couldn't check for invites. Try again." }));
      }
    };
    void read();
    const app = AppState.addEventListener('change', (st) => { if (st === 'active') void read(); });
    return () => { stopped = true; app.remove(); };
  }, [live, revision, api, assertSession, register]);
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    setRevision((v) => v + 1);
  }, []);
  return { ...state, reload };
}

/** Allow or deny, written to Arkiv with the per-pair key. The backend then tells the user. */
export function useLiveDecide() {
  const { api, assertSession } = useLiveApi();
  const register = useWalletSetup({ signer: false });
  const keys = useTrusteeKeys();
  return useCallback(async (requestKey: string, allow: boolean) => {
    const r = useStore.getState().inbox.find((x) => x.id === requestKey);
    if (!r?.pairId) throw new Error('This request is gone.');
    const client = pairClient(await keys.pair(r.pairId));
    // /onboarding/user tops up the per-pair keys too.
    const refill = () => register();
    const patch = await decide(r, allow, {
      intentHash: (to, amount, nonce) => intentHash(to, amount, nonce),
      exportIntentHash: (wallet, nonce) => exportIntentHash(wallet, nonce),
      writeReport: (address) => withRefill(async () => (await createScamReport(client, {
        address: address as Address, source: 'trustee', category: 'scam', reason: 'A trustee denied a payment to this address.',
      })).entityKey, refill),
      writeDecision: (d) => withRefill(async () => (await createDecision(client, {
        pairId: d.pairId, requestKey: d.requestKey as Hex, verdict: d.verdict,
        intentHash: d.intentHash as Hex | undefined, validFrom: d.validFrom, reportKey: d.reportKey as Hex | undefined,
      })).entityKey, refill),
      notify: (pairId, key) => notifyDecision(() => api<{ status?: string }>('/trustee/decisions', { pairId, requestKey: key })),
    });
    assertSession();
    patchInbox(r.id, patch);
  }, [api, assertSession, register, keys]);
}

/** Rules apply at once. Shows the change straight away and puts it back if the backend says no. */
export function useSetLiveRules() {
  const { getAccessToken } = useWallet();
  const { assertSession } = useLiveApi();
  return useCallback(async (pairId: string, patch: Partial<Rules>) => {
    const before = useStore.getState().people.find((p) => p.pairId === pairId);
    if (!before) return;
    const body: { amountLimit?: string; notifyMode?: Rules['mode'] } = {};
    if (patch.limit !== undefined) body.amountLimit = String(patch.limit);
    if (patch.mode !== undefined) body.notifyMode = patch.mode;
    if (!body.amountLimit && !body.notifyMode) return;
    const put = (p: LivePerson) => useStore.setState((s) => ({ people: s.people.map((x) => (x.pairId === pairId ? p : x)) }));
    put({ ...before, ...(patch.limit !== undefined ? { limit: patch.limit } : {}), ...(patch.mode ? { mode: patch.mode } : {}) });
    try {
      const saved = await apiRequest<{ amountLimit: string; notifyMode: Rules['mode'] }>(
        getAccessToken, `/trustee/users/${encodeURIComponent(pairId)}/rules`, body, 'PATCH');
      assertSession();
      put({ ...before, limit: Number(saved.amountLimit), mode: saved.notifyMode });
    } catch (err) {
      put(before);
      throw err;
    }
  }, [getAccessToken, assertSession]);
}
