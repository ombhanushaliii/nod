// Trustee-side view of "people you look after": the real wallet user from this demo,
// plus two mock people so the list looks like a real trustee's.

import { m0, ago } from '@/lib/format';
import type { Tone } from '@/theme';
import { reqState } from './engine';
import type { Store } from './store';
import type { ApprovalRequest, Rules } from './types';

export type FeedItem = { id: string; icon: string; tone: Tone; title: string; sub: string; time: string };

export type Person = {
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

export function buildPeople(s: Store, now: number): Person[] {
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
