// Trustee-side view of "people you look after": the real wallet user from this demo,
// plus two mock people so the list looks like a real trustee's.

import { AVATAR_COUNT } from '@/components/Avatar';
import { m0, ago, short } from '@/lib/format';
import { isDemo } from '@/wallet/config';
import { avatarFor } from '@/wallet/trustee';
import type { Tone } from '@/theme';
import { reqState } from './engine';
import type { Store } from './store';
import type { ApprovalRequest, Rules } from './types';

export type FeedItem = { id: string; icon: string; tone: Tone; title: string; sub: string; time: string };

export type Person = {
  /** Demo: p1..p3. Live: the pairId. */
  id: string;
  username: string;
  since: string;
  avatar: number;
  feed: FeedItem[];
  review: ApprovalRequest[];
  rules: Rules;
};

export const reqIcon = (r: ApprovalRequest) => (r.kind === 'payment' ? '$' : '⚿');
export const reqTitle = (r: ApprovalRequest) => (r.kind === 'payment' ? `${m0(r.amount ?? 0)} to ${r.name}` : 'Export wallet key');

const toneFor = (icon: string): Tone => (icon === '✕' ? 'red' : icon === '✓' ? 'green' : 'plain');

/** Live: the people from the backend (address, and @handle when the backend could tell), with their requests from Arkiv. */
function livePeople(s: Store, now: number): Person[] {
  return s.people.map((p) => {
    const mine = s.inbox.filter((r) => r.pairId === p.pairId);
    const feed = mine.filter((r) => r.status === 'allowed' || r.status === 'denied').map((r) => {
      const allowed = r.status === 'allowed';
      if (r.kind === 'export') {
        return {
          id: r.id, icon: allowed ? '✓' : '✕', tone: (allowed ? 'green' : 'red') as Tone,
          title: `You ${allowed ? 'allowed' : 'denied'} a key export`,
          sub: allowed ? 'One time, within an hour' : 'Key stays hidden',
          time: ago(r.decidedAt ?? r.createdAt, now),
        };
      }
      return {
        id: r.id, icon: allowed ? '✓' : '✕', tone: (allowed ? 'green' : 'red') as Tone,
        title: `You ${allowed ? 'allowed' : 'denied'} ${m0(r.amount ?? 0)} to ${r.name}`,
        sub: allowed ? (r.newPayee ? 'Unlocks after 24h' : 'One time') : r.why === 'flagged' ? 'Address reported' : 'Payment stopped',
        time: ago(r.decidedAt ?? r.createdAt, now),
      };
    });
    return {
      id: p.pairId,
      username: p.username || short(p.walletAddress),
      since: 'You look after them',
      avatar: avatarFor(p.walletAddress, AVATAR_COUNT),
      feed,
      review: mine.filter((r) => reqState(r, now) === 'pending'),
      rules: { limit: p.limit, mode: p.mode, daily: 0 },
    };
  });
}

export function buildPeople(s: Store, now: number): Person[] {
  if (!isDemo) return livePeople(s, now);
  const review = s.requests.filter((r) => reqState(r, now) === 'pending');
  return [
    {
      id: 'p1',
      username: s.username,
      since: 'Trustee since today',
      avatar: s.userAvatar,
      feed: s.events.map((e) => ({ id: e.id, icon: e.icon, tone: toneFor(e.icon), title: e.title, sub: e.sub, time: ago(e.time, now) })),
      review,
      rules: s.rules,
    },
    {
      id: 'p2',
      username: 'nana_rose',
      since: 'Trustee since March',
      avatar: 5,
      feed: [
        { id: 'n1', icon: '↑', tone: 'plain', title: 'Sent $15.00 to Dr. Patel', sub: 'Passed all checks', time: '1h' },
        { id: 'n2', icon: '+', tone: 'plain', title: 'Added Dr. Patel', sub: 'New person · unlocked', time: '2d' },
      ],
      review: [],
      rules: s.mockRules.p2,
    },
    {
      id: 'p3',
      username: 'leo_k',
      since: 'Trustee since June',
      avatar: 6,
      feed: [{ id: 'l1', icon: '+', tone: 'plain', title: 'Added Coffee Club', sub: 'New person · unlocked', time: '3d' }],
      review: [],
      rules: s.mockRules.p3,
    },
  ];
}
