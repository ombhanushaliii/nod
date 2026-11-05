import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, InfoDot, NavRow, Screen, Sheet, Tap, Txt } from '@/components';
import { useNow } from '@/data/clock';
import { capLeft, payeeBy, sentToday } from '@/data/engine';
import { trusteeName, useStore } from '@/data/store';
import { useBalance, useRules } from '@/hooks/api';
import { m0, money } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { colors, tones } from '@/theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

export default function Amount() {
  const now = useNow();
  const draft = useStore((s) => s.draft);
  const setDraft = useStore((s) => s.setDraft);
  const firstDone = useStore((s) => s.firstDone);
  const payees = useStore((s) => s.payees);
  const payments = useStore((s) => s.payments);
  const tn = useStore(trusteeName);
  const { balance } = useBalance();
  const R = useRules();
  const [amountStr, setAmountStr] = useState(draft?.amount ? String(draft.amount) : '');
  const [info, setInfo] = useState(false);

  const cur = draft ?? { address: '', name: '' };
  const amt = parseFloat(amountStr) || 0;
  const overBal = amt > balance;
  const hintFirst = !firstDone;
  const curPayee = cur.address ? payeeBy({ payees }, cur.address) : undefined;
  const curIsNew = !!cur.address && (!curPayee || now < curPayee.unlockAt);
  const left = cur.address ? capLeft({ payees, payments }, cur.address, now) : 10;

  const amountColor = overBal ? tones.red.fg : (hintFirst && amt > 10) || (curIsNew && amt > left) ? tones.amber.fg : colors.ink;
  const hintText = hintFirst
    ? 'First payment: $10 max'
    : curIsNew
      ? left < 10
        ? `New person: ${m0(left)} left for 24h`
        : 'New person: $10 max for 24h'
      : `Over ${m0(R.limit)} asks ${tn}`;
  const hint = hintFirst || curIsNew ? tones.amber : tones.info;

  const sheet =
    curIsNew && !hintFirst
      ? {
          title: 'Why $10 for new people?',
          body: `Most scams happen with someone you just added. For the first 24 hours you can send up to $10 to ${cur.name || 'them'}. If an address looks like a scam, even $10 needs ${tn}'s OK.`,
        }
      : hintFirst
        ? { title: 'Why $10?', body: 'Your very first payment is capped at $10 so you can try things out safely. After that, the cap goes away.' }
        : {
            title: `When does ${tn} check?`,
            body: `${R.mode === 'every_time' ? 'Every payment' : 'The first payment to a person'} above ${m0(R.limit)}. Also anything that looks like a scam. New people always unlock 24 hours after you first try to pay them.`,
          };

  const press = (k: string) => {
    let s = amountStr;
    if (k === '⌫') s = s.slice(0, -1);
    else if (k === '.') {
      if (s.includes('.')) return;
      s = (s || '0') + '.';
    } else {
      if (s.includes('.') && s.split('.')[1].length >= 2) return;
      if (s.replace('.', '').length >= 6) return;
      s = s === '0' ? k : s + k;
    }
    haptic('selection');
    setAmountStr(s);
  };

  const ok = amt > 0 && !overBal;

  return (
    <Screen padH={20}>
      <NavRow onBack={() => router.back()} />
      <Txt size={17} color={colors.sub} align="center">
        To{' '}
        <Txt size={17} w={700}>
          {cur.name}
        </Txt>
      </Txt>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Txt size={32} w={700} color={amountColor}>
            $
          </Txt>
          <Txt size={66} w={800} ls={-0.05} tabular color={amountColor} adjustsFontSizeToFit numberOfLines={1}>
            {amountStr || '0'}
          </Txt>
        </View>
        <Tap onPress={() => setInfo(true)} style={[styles.hint, { backgroundColor: hint.bg }]} accessibilityLabel={`${hintText}. More info`}>
          <Txt size={13} w={700} color={hint.fg}>
            {hintText}
          </Txt>
          <InfoDot color={hint.fg} />
        </Tap>
        <Txt size={14} w={500} color={overBal ? tones.red.fg : colors.sub}>
          {overBal ? 'Not enough money' : `Balance ${money(balance)} · ${m0(Math.max(0, R.daily - sentToday({ payments }, now)))} left today`}
        </Txt>
      </View>

      <View style={styles.keys}>
        {KEYS.map((k) => (
          <Pressable
            key={k}
            onPress={() => press(k)}
            accessibilityRole="button"
            accessibilityLabel={k === '⌫' ? 'Delete' : k}
            style={({ pressed }) => [styles.key, pressed && { backgroundColor: colors.pressed }]}>
            <Txt size={26} w={600}>
              {k}
            </Txt>
          </Pressable>
        ))}
      </View>

      <Button
        label="Continue"
        disabled={!ok}
        style={{ marginTop: 10 }}
        onPress={() => {
          setDraft({ ...cur, amount: amt });
          router.push('/wallet/checking');
        }}
      />

      <Sheet visible={info} onClose={() => setInfo(false)} gap={16}>
        <View style={{ gap: 8, paddingTop: 6 }}>
          <Txt size={24} w={800} ls={-0.025}>
            {sheet.title}
          </Txt>
          <Txt size={16} lh={1.5} color={colors.sub}>
            {sheet.body}
          </Txt>
        </View>
        <Button label="Got it" onPress={() => setInfo(false)} style={{ marginTop: 4 }} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingLeft: 13, paddingRight: 8, borderRadius: 999 },
  keys: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 },
  key: { width: '33.333%', height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
