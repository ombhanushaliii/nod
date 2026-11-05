// Local stand-in for the backend, Privy and Arkiv. Everything the two roles share
// (requests, decisions, reports, rules) lives here, so the full user ↔ trustee flow
// can be demoed on one phone by signing out and back in as the other account.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DAY, money } from '@/lib/format';
import { ADDR, evaluate, handleFrom, payeeBy, reqState, trusteeNameFrom } from './engine';
import type {
  ActivityEvent,
  ApprovalRequest,
  Banner,
  CheckResult,
  Draft,
  Intent,
  Notice,
  Payee,
  Payment,
  Role,
  Rules,
  Session,
  TrusteeStatus,
} from './types';

export const APP_NAME = 'Haven';

/** The two demo Google accounts. Which one signs in decides the UI. */
export const DEMO_USER_EMAIL = 'alex.rivera@gmail.com';

type Data = {
  session: Session | null;
  /** Simulated clock offset ("Skip 24 hours"). */
  offset: number;
  // wallet user
  username: string;
  userAvatar: number;
  onboarded: boolean;
  balance: number;
  firstDone: boolean;
  rules: Rules;
  payees: Payee[];
  payments: Payment[];
  intents: Intent[];
  notice: Notice | null;
  // the pair
  trusteeContact: string;
  trusteeStatus: TrusteeStatus;
  trusteeAvatar: number;
  tDisplayName: string;
  requests: ApprovalRequest[];
  reports: string[];
  events: ActivityEvent[];
  /** Rules for the trustee's two other (mock) people. */
  mockRules: Record<string, Rules>;
};

type Flow = {
  banners: Record<Role, Banner | null>;
  draft: Draft | null;
  result: CheckResult | null;
  answers: (boolean | null)[];
  waitingId: string | null;
  sentText: string;
};

type Actions = {
  now: () => number;
  // session
  signIn: (role: Role, email: string) => void;
  signOut: () => void;
  // user onboarding + profile
  setUserAvatar: (i: number) => void;
  invite: (contact: string) => void;
  finishOnboarding: () => void;
  setUsername: (u: string) => void;
  dismissNotice: () => void;
  // sending
  setDraft: (d: Draft | null) => void;
  setResult: (r: CheckResult | null) => void;
  setAnswer: (i: number, v: boolean) => void;
  resetAnswers: () => void;
  setWaiting: (id: string | null) => void;
  check: (d: Draft) => CheckResult;
  submitApproval: () => string | null;
  confirmSend: () => void;
  dismissRequest: (id: string) => void;
  requestExport: () => void;
  consumeExport: (id: string) => void;
  // trustee
  acceptInvite: () => void;
  setTrusteeProfile: (name: string) => void;
  setTrusteeAvatar: (i: number) => void;
  setTrusteeName: (name: string) => void;
  decide: (id: string, allow: boolean) => void;
  setRulesFor: (personId: string, patch: Partial<Rules>) => void;
  // banners
  pushBanner: (role: Role, title: string, body: string, reqId?: string) => void;
  clearBanner: (role: Role) => void;
  // demo controls
  skip: (ms: number) => void;
  resetDemo: () => void;
};

export type Store = Data & Flow & Actions;

function initialData(): Data {
  const t = Date.now();
  return {
    session: null,
    offset: 0,
    username: '',
    userAvatar: 0,
    onboarded: false,
    balance: 250,
    firstDone: false,
    rules: { limit: 100, mode: 'first_per_payee', daily: 200 },
    payees: [{ id: 'mom', name: 'Mom', address: ADDR.MOM, unlockAt: t - 2 * DAY, overCleared: false, addedAt: t - 2 * DAY }],
    payments: [],
    intents: [],
    notice: null,
    trusteeContact: '',
    trusteeStatus: 'none',
    trusteeAvatar: 3,
    tDisplayName: '',
    requests: [],
    reports: [],
    events: [],
    mockRules: { p2: { limit: 50, mode: 'every_time', daily: 100 }, p3: { limit: 100, mode: 'first_per_payee', daily: 500 } },
  };
}

function initialFlow(): Flow {
  return { banners: { user: null, trustee: null }, draft: null, result: null, answers: [null, null, null], waitingId: null, sentText: '' };
}

export const trusteeName = (s: Pick<Data, 'tDisplayName' | 'trusteeContact'>) => trusteeNameFrom(s.tDisplayName, s.trusteeContact);

export const useStore = create<Store>()(
  persist(
    (set, get) => {
      const now = () => Date.now() + get().offset;
      const ev = (e: Omit<ActivityEvent, 'id' | 'time'>) =>
        set((s) => ({ events: [{ id: Math.random().toString(36).slice(2), time: now(), ...e }, ...s.events] }));
      const addPayee = (name: string, address: string, unlockAt: number, overCleared = false) =>
        set((s) => ({ payees: [...s.payees, { id: 'p' + now(), name, address, unlockAt, overCleared, addedAt: now() }] }));

      return {
        ...initialData(),
        ...initialFlow(),
        now,

        signIn: (role, email) =>
          set((s) => ({
            session: { role, email, method: 'Google' },
            username: role === 'user' && !s.username ? handleFrom(email) : s.username,
          })),
        signOut: () => set({ session: null, draft: null, result: null, waitingId: null }),

        setUserAvatar: (i) => set({ userAvatar: i }),
        invite: (contact) => set({ trusteeContact: contact.trim(), trusteeStatus: 'pending' }),
        finishOnboarding: () => set({ onboarded: true }),
        setUsername: (u) => {
          set({ username: u });
          get().pushBanner('user', 'Username updated', '@' + u);
        },
        dismissNotice: () => set({ notice: null }),

        setDraft: (draft) => set({ draft }),
        setResult: (result) => set({ result }),
        setAnswer: (i, v) => set((s) => ({ answers: s.answers.map((a, j) => (j === i ? v : a)) })),
        resetAnswers: () => set({ answers: [null, null, null] }),
        setWaiting: (waitingId) => set({ waitingId }),

        check: (d) => {
          const s = get();
          const t = now();
          const amount = d.amount ?? 0;
          const res = evaluate(s, d.address, amount, t);
          set({ draft: d, result: res });
          if (res.verdict === 'waiting') set({ waitingId: res.reqId ?? null });
          if (res.verdict === 'needs_trustee') set({ answers: [null, null, null] });
          if (res.verdict === 'safe' && res.newPayee) {
            addPayee(d.name, d.address, res.unlockAt ?? t + DAY);
            ev({ icon: '+', title: `Added ${d.name}`, sub: 'New person · $10 max for 24h' });
          }
          if (res.verdict === 'cooldown') {
            if (res.newPayee) {
              addPayee(d.name, d.address, res.unlockAt ?? t + DAY);
              ev({ icon: '+', title: `Added ${d.name}`, sub: 'New person · unlocks in 24h' });
            }
            if (!res.reqId) {
              set((st) => ({
                intents: [
                  { id: 'i' + t, address: d.address, name: d.name, amount, unlockAt: res.unlockAt ?? t + DAY },
                  ...st.intents.filter((i) => !(i.address === d.address && i.amount === amount)),
                ],
              }));
            }
          }
          return res;
        },

        submitApproval: () => {
          const s = get();
          const d = s.draft;
          if (!d || !s.result) return null;
          const t = now();
          const id = 'r' + t;
          const req: ApprovalRequest = {
            id,
            kind: 'payment',
            address: d.address,
            name: d.name,
            amount: d.amount,
            reasons: s.result.reasons,
            why: s.result.why,
            answers: s.answers.map((a) => !!a),
            createdAt: t,
            status: 'pending',
            newPayee: !payeeBy(s, d.address),
          };
          set((st) => ({ requests: [req, ...st.requests], waitingId: id }));
          get().pushBanner('trustee', APP_NAME, 'A payment needs you. Tap to review.', id);
          return id;
        },

        confirmSend: () => {
          const s = get();
          const d = s.draft;
          if (!d || d.amount == null) return;
          const amount = d.amount;
          const t = now();
          const reqId = s.result?.reqId;
          set((st) => ({
            balance: st.balance - amount,
            firstDone: true,
            payments: [{ id: 'pay' + t, to: d.name, address: d.address, amount, time: t }, ...st.payments],
            requests: st.requests.map((r) => (r.id === reqId ? { ...r, used: true } : r)),
            intents: st.intents.filter((i) => !(i.address === d.address && i.amount === amount)),
            sentText: `${money(amount)} to ${d.name}`,
          }));
          ev({ icon: '↑', title: `Sent ${money(amount)} to ${d.name}`, sub: reqId ? 'Approved by you' : 'Passed all checks' });
        },

        dismissRequest: (id) => set((s) => ({ requests: s.requests.map((r) => (r.id === id ? { ...r, dismissed: true } : r)) })),

        requestExport: () => {
          const id = 'r' + now();
          set((s) => ({ requests: [{ id, kind: 'export', createdAt: now(), status: 'pending' }, ...s.requests] }));
          get().pushBanner('trustee', APP_NAME, 'A request needs you. Tap to review.', id);
        },
        consumeExport: (id) => set((s) => ({ requests: s.requests.map((r) => (r.id === id ? { ...r, used: true } : r)) })),

        acceptInvite: () => set({ trusteeStatus: 'active' }),
        setTrusteeProfile: (name) => {
          set({
            tDisplayName: name,
            notice: { icon: name[0].toUpperCase(), title: `${name} is now your trustee`, body: 'They’ll check risky payments before they go out.' },
          });
          get().pushBanner('user', `${name} accepted`, 'Your trustee is set up.');
        },
        setTrusteeAvatar: (i) => set({ trusteeAvatar: i }),
        setTrusteeName: (name) => set({ tDisplayName: name }),

        decide: (id, allow) => {
          const s = get();
          const t = now();
          const r = s.requests.find((x) => x.id === id);
          if (!r || reqState(r, t) !== 'pending') return;
          const tn = trusteeName(s);
          const patch: Partial<ApprovalRequest> = { status: allow ? 'allowed' : 'denied', decidedAt: t };
          if (r.kind === 'payment' && r.address && r.name && r.amount != null) {
            if (allow) {
              const isNew = !payeeBy(s, r.address);
              patch.validFrom = isNew ? t + DAY : t;
              const over = r.amount > s.rules.limit;
              if (isNew) addPayee(r.name, r.address, patch.validFrom, over);
              else if (over) set((st) => ({ payees: st.payees.map((p) => (p.address === r.address ? { ...p, overCleared: true } : p)) }));
              get().pushBanner('user', `${tn} said yes`, isNew ? `${r.name} is new, so it unlocks in 24 hours.` : 'You can send it now.');
              ev({ icon: '✓', title: `You allowed ${money(r.amount)} to ${r.name}`, sub: isNew ? 'Unlocks after 24h' : 'One time' });
            } else {
              // Deny & report: the address is reported so other wallets get warned (Arkiv scam_report).
              set((st) => ({ reports: [...st.reports, r.address!.toLowerCase()] }));
              get().pushBanner('user', `${tn} said no`, `The payment to ${r.name} won't go out.`);
              ev({ icon: '✕', title: `You denied ${money(r.amount)} to ${r.name}`, sub: 'Address reported' });
            }
          } else if (r.kind === 'export') {
            get().pushBanner('user', allow ? `${tn} allowed key export` : `${tn} said no`, allow ? 'Open Settings to view it.' : 'Your key stays hidden.');
            ev({ icon: '⚿', title: allow ? 'You allowed a key export' : 'You denied a key export', sub: 'Wallet key' });
          }
          set((st) => ({ requests: st.requests.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
        },

        setRulesFor: (personId, patch) =>
          personId === 'p1'
            ? set((s) => ({ rules: { ...s.rules, ...patch } }))
            : set((s) => ({ mockRules: { ...s.mockRules, [personId]: { ...s.mockRules[personId], ...patch } } })),

        pushBanner: (role, title, body, reqId) => {
          // Trustees only get alerts once they've accepted (no push token before that).
          if (role === 'trustee' && get().trusteeStatus !== 'active') return;
          set((s) => ({ banners: { ...s.banners, [role]: { id: Math.random().toString(36).slice(2), title, body, reqId } } }));
        },
        clearBanner: (role) => set((s) => ({ banners: { ...s.banners, [role]: null } })),

        skip: (ms) => set((s) => ({ offset: s.offset + ms })),
        resetDemo: () => set({ ...initialData(), ...initialFlow() }),
      };
    },
    {
      name: 'haven-demo-v1',
      storage: createJSONStorage(() => AsyncStorage),
      // Only durable data survives a restart; in-flight screens start fresh.
      partialize: (s): Data => ({
        session: s.session,
        offset: s.offset,
        username: s.username,
        userAvatar: s.userAvatar,
        onboarded: s.onboarded,
        balance: s.balance,
        firstDone: s.firstDone,
        rules: s.rules,
        payees: s.payees,
        payments: s.payments,
        intents: s.intents,
        notice: s.notice,
        trusteeContact: s.trusteeContact,
        trusteeStatus: s.trusteeStatus,
        trusteeAvatar: s.trusteeAvatar,
        tDisplayName: s.tDisplayName,
        requests: s.requests,
        reports: s.reports,
        events: s.events,
        mockRules: s.mockRules,
      }),
    },
  ),
);
