import { Redirect, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AccountHeader, Avatar, Chip, FadeInRow, ScrollScreen, Tap, Txt } from '@/components';
import { useNow } from '@/data/clock';
import { approvalEnds, reqState } from '@/data/engine';
import { trusteeAvatarOf, trusteeName, useStore } from '@/data/store';
import { useBalance, useRefreshHome } from '@/hooks/api';
import { ago, dur, m0, money, moneyParts, when } from '@/lib/format';
import { colors, tones, type Tone } from '@/theme';
import { isDemo } from '@/wallet/config';

export default function WalletIndex() {
  const onboarded = useStore((s) => s.onboarded);
  if (!onboarded) return <Redirect href="/wallet/welcome" />;
  return <Home />;
}

type PendingRow = { key: string; title: string; sub: string; chip: string; tone: Tone; onOpen: () => void };

function Home() {
  const now = useNow();
  const { balance, hasBalance, loading, error: balanceError, refresh } = useBalance();
  const s = useStore();
  const tn = trusteeName(s);
  // Live: one read of requests in progress and payment history each time home shows.
  useRefreshHome();
  const active = s.trusteeStatus === 'active';
  const bal = hasBalance ? moneyParts(balance) : { whole: '—', cents: '—' };

  const openWaiting = (id: string) => {
    s.setWaiting(id);
    router.push('/wallet/waiting');
  };
  const resume = (d: { address: string; name: string; amount: number }, paymentId?: string) => {
    s.setDraft(d);
    if (!isDemo && paymentId) {
      // An approved payment: send that exact payment, don't check a new one.
      s.setResult({ verdict: 'safe', paymentId });
      router.push('/wallet/review');
      return;
    }
    s.setResult(null);
    router.push('/wallet/checking');
  };

  // "In progress": trustee requests and new-person payments waiting for their 24h unlock.
  const pending: PendingRow[] = [];
  for (const r of s.requests) {
    if (r.kind !== 'payment' || r.used || r.dismissed || r.amount == null || !r.name || !r.address) continue;
    const st = reqState(r, now);
    const title = `${m0(r.amount)} to ${r.name}`;
    const validFrom = r.validFrom ?? 0;
    const ends = approvalEnds(r);
    const base = { key: r.id, title, onOpen: () => openWaiting(r.id) };
    if (st === 'pending') pending.push({ ...base, sub: `Waiting on ${tn}`, chip: 'Waiting', tone: 'amber' });
    else if (st === 'allowed') {
      if (now < validFrom) pending.push({ ...base, sub: `Approved · unlocks ${when(validFrom, now)}`, chip: 'Locked', tone: 'gray' });
      else if (now < ends) {
        const d = { address: r.address, name: r.name, amount: r.amount };
        pending.push({ ...base, sub: `Approved · send within ${dur(ends - now)}`, chip: 'Ready', tone: 'green', onOpen: () => resume(d, r.paymentId) });
      } else pending.push({ ...base, sub: 'The 1-hour window passed', chip: 'Expired', tone: 'gray' });
    } else if (st === 'denied') pending.push({ ...base, sub: `${tn} said no`, chip: 'Declined', tone: 'red' });
    else pending.push({ ...base, sub: 'No answer in time', chip: 'Expired', tone: 'gray' });
  }
  for (const i of s.intents) {
    const title = `${m0(i.amount)} to ${i.name}`;
    if (now < i.unlockAt) {
      pending.push({
        key: i.id,
        title,
        sub: `New person · unlocks ${when(i.unlockAt, now)}`,
        chip: 'Locked',
        tone: 'gray',
        onOpen: () => {
          s.setDraft({ address: i.address, name: i.name, amount: i.amount });
          if (isDemo) {
            s.setResult({ verdict: 'cooldown', unlockAt: i.unlockAt });
            router.push('/wallet/cooldown');
            return;
          }
          // Live: check again, so the backend says what can still go today (and re-checks for scams).
          s.setResult(null);
          router.push('/wallet/checking');
        },
      });
    } else pending.push({ key: i.id, title, sub: 'Unlocked · ready to send', chip: 'Ready', tone: 'green', onOpen: () => resume(i) });
  }

  return (
    <ScrollScreen>
      {/* Your name and handle. Also a trustee, or invited to be one: tap it to switch sides. */}
      <AccountHeader settings="/wallet/settings" />

      <View style={{ gap: 6 }}>
        <Txt size={15} w={500} color={colors.sub}>
          Balance
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <Txt size={26} w={700} style={{ alignSelf: 'center', marginRight: 2 }}>
            $
          </Txt>
          <Txt size={58} w={800} ls={-0.04} tabular style={{ lineHeight: 62 }}>
            {bal.whole}
          </Txt>
          <Txt size={30} w={700} ls={-0.02} color={colors.faint} style={{ paddingTop: 10 }}>
            .{bal.cents}
          </Txt>
        </View>
        <Txt size={13} color={colors.sub}>
          {loading ? 'Refreshing balance…' : 'USDC · Ethereum Sepolia'}
        </Txt>
        {balanceError && <Tap onPress={refresh}><Txt size={14} color={colors.accFg}>{balanceError}</Txt></Tap>}
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Tap onPress={() => router.push('/wallet/send')} style={[styles.action, { backgroundColor: colors.acc }]}>
          <Txt size={17} w={700} color={colors.white}>
            ↑ Send
          </Txt>
        </Tap>
        <Tap onPress={() => router.push('/wallet/receive')} style={[styles.action, { backgroundColor: colors.soft }]}>
          <Txt size={17} w={700}>
            ↓ Receive
          </Txt>
        </Tap>
      </View>

      {s.notice && (
        <FadeInRow style={styles.notice}>
          <View style={[styles.round40, { backgroundColor: tones.green.bg }]}>
            <Txt size={16} w={800} color={tones.green.fg}>
              {s.notice.icon}
            </Txt>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt size={15} w={700}>
              {s.notice.title}
            </Txt>
            <Txt size={14} lh={1.4} color={colors.sub}>
              {s.notice.body}
            </Txt>
          </View>
          <Tap onPress={s.dismissNotice} accessibilityLabel="Dismiss" hitSlop={8} style={styles.close}>
            <Txt size={12} color={colors.sub}>
              ✕
            </Txt>
          </Tap>
        </FadeInRow>
      )}

      {pending.length > 0 && (
        <View style={{ gap: 8 }}>
          <Txt size={20} w={800} ls={-0.02}>
            In progress
          </Txt>
          {pending.map((p) => (
            <FadeInRow key={p.key}>
              <Tap onPress={p.onOpen} pressedScale={0.98} style={styles.pendingRow}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt size={16} w={700}>
                    {p.title}
                  </Txt>
                  <Txt size={13} color={colors.sub}>
                    {p.sub}
                  </Txt>
                </View>
                <Chip label={p.chip} tone={p.tone} />
              </Tap>
            </FadeInRow>
          ))}
        </View>
      )}

      <View style={styles.trustee}>
        <Avatar index={trusteeAvatarOf(s)} size={42} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt size={16} w={700} numberOfLines={1}>
            {tn} · your trustee
          </Txt>
          <Txt size={13} color={colors.sub} numberOfLines={1}>
            {active ? 'Checks risky payments' : `Invite sent · ${s.trusteeContact}`}
          </Txt>
        </View>
        <Chip label={active ? 'Active' : 'Invited'} tone={active ? 'green' : 'amber'} />
      </View>

      <View style={{ gap: 2 }}>
        <Txt size={20} w={800} ls={-0.02} style={{ paddingBottom: 6 }}>
          Recent
        </Txt>
        {s.payments.length === 0 && (
          <Txt size={15} lh={1.5} color={colors.sub}>
            No payments yet.
          </Txt>
        )}
        {s.payments.map((p) => {
          const a = ago(p.time, now);
          return (
            <FadeInRow key={p.id} style={styles.payment}>
              <View style={[styles.round42, { backgroundColor: colors.soft }]}>
                <Txt size={17} w={700}>
                  ↑
                </Txt>
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Txt size={16} w={700}>
                  Sent to {p.to}
                </Txt>
                <Txt size={13} color={colors.sub}>
                  {a === 'Now' ? 'Just now' : `${a} ago`}
                </Txt>
              </View>
              <Txt size={16} w={700} tabular>
                −{money(p.amount)}
              </Txt>
            </FadeInRow>
          );
        })}
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  action: { flex: 1, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  notice: {
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  round40: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  round42: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  close: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  pendingRow: { borderRadius: 18, backgroundColor: colors.white, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  trustee: { borderRadius: 20, backgroundColor: colors.white, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  payment: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
});
