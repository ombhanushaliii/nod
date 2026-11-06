import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Avatar, Button, Card, Chip, IconCircle, KV, Label, NavRow, Screen, Sheet, Tag, Txt } from '@/components';
import { useNow } from '@/data/clock';
import { BAD_ANSWERS, QUESTIONS, reqState } from '@/data/engine';
import { buildPeople } from '@/data/people';
import { useStore } from '@/data/store';
import { useDecide } from '@/hooks/api';
import { useLiveDecide } from '@/hooks/trustee';
import { m0, money, short } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { colors, tones, type Tone } from '@/theme';
import { isDemo } from '@/wallet/config';

const STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Needs you', tone: 'amber' },
  allowed: { label: 'Allowed', tone: 'green' },
  denied: { label: 'Denied', tone: 'red' },
  expired: { label: 'Expired', tone: 'gray' },
};

/** The trustee's context card: what, to whom, why it was flagged, and the user's answers. */
export default function Request() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const now = useNow();
  const r = useStore((s) => (isDemo ? s.requests : s.inbox).find((x) => x.id === id));
  const s = useStore();
  // Live: who asked, from the pair. Demo: the one wallet user.
  const person = isDemo ? null : buildPeople(s, now).find((p) => p.id === r?.pairId);
  const username = person?.username ?? s.username;
  const userAvatar = person?.avatar ?? s.userAvatar;
  const demoDecide = useDecide();
  const liveDecide = useLiveDecide();
  const decide = isDemo ? demoDecide : liveDecide;
  const [confirm, setConfirm] = useState<'allow' | 'deny' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!r) {
    return (
      <Screen padH={20}>
        <NavRow onBack={() => router.back()} />
        <Txt size={17} color={colors.sub}>
          This request is gone.
        </Txt>
      </Screen>
    );
  }

  const state = reqState(r, now);
  const chip = STATUS[state];
  const isPayment = r.kind === 'payment';
  const risky = isPayment && r.why === 'flagged';
  const amount = r.amount ?? 0;

  const rows = isPayment
    ? [
        { k: 'To', v: `${r.name} · ${short(r.address)}` },
        { k: 'Amount', v: money(amount) },
        { k: 'New person', v: r.newPayee ? 'Yes · 24h wait after OK' : 'No' },
      ]
    : [{ k: 'Request', v: 'Export wallet key' }];

  const cf =
    confirm === 'allow'
      ? isPayment
        ? {
            icon: risky ? '!' : '✓',
            ...(risky ? tones.red : tones.acc),
            title: `Allow ${m0(amount)} once?`,
            body:
              (risky ? `We found warning signs. If it's a scam, @${username} could lose this money.` : `@${username} can send it to ${r.name} once.`) +
              (r.newPayee ? ' It unlocks 24 hours after you allow it.' : ''),
            btn: 'Yes, allow once',
            btnBg: risky ? tones.red.fg : colors.acc,
          }
        : {
            icon: '!',
            ...tones.red,
            title: 'Allow key export?',
            body: `@${username} will see their key once. Only allow if they asked you directly.`,
            btn: 'Allow export',
            btnBg: tones.red.fg,
          }
      : isPayment && risky
        ? {
            icon: '✕',
            ...tones.plain,
            title: 'Deny and report?',
            body: 'The payment won’t go out, and the address gets reported so other wallets are warned.',
            btn: 'Deny & report',
            btnBg: colors.ink,
          }
        : isPayment
          ? {
              icon: '✕',
              ...tones.plain,
              title: 'Deny this payment?',
              body: `It won’t go out, and @${username} will be told you said no. Nothing gets reported.`,
              btn: 'Deny',
              btnBg: colors.ink,
            }
          : { icon: '✕', ...tones.plain, title: 'Deny this request?', body: `@${username} will be told you said no.`, btn: 'Deny', btnBg: colors.ink };

  // Live, each answer is one or two Arkiv writes: a few seconds. One at a time.
  const onConfirm = async () => {
    if (busy) return;
    const allow = confirm === 'allow';
    setConfirm(null);
    setBusy(true);
    setError(null);
    try {
      await decide(r.id, allow);
      haptic(allow ? 'success' : 'heavy');
    } catch (err) {
      haptic('error');
      setError(err instanceof Error ? err.message : "Your answer didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen padH={20}>
      <NavRow onBack={() => router.back()} right={<Chip label={chip.label} tone={chip.tone} />} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 20, paddingTop: 6, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar index={userAvatar} size={44} />
          <Txt size={15} color={colors.sub}>
            Request from{' '}
            <Txt size={15} w={700}>
              @{username}
            </Txt>
          </Txt>
        </View>
        <Txt size={28} w={800} ls={-0.03} lh={1.12}>
          {isPayment ? `Send ${money(amount)} to ${r.name}?` : 'Show their wallet key?'}
        </Txt>
        <Card>
          {rows.map((w, i) => (
            <KV key={w.k} k={w.k} v={w.v} size={15} last={i === rows.length - 1} />
          ))}
        </Card>

        {isPayment && (
          <View style={{ gap: 8 }}>
            <Label>WHY IT CAME TO YOU</Label>
            <Card>
              {(r.reasons ?? []).map((x, i, arr) => (
                <View key={`${i}-${x.title}`} style={[styles.reason, i < arr.length - 1 && styles.divider]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt size={15} w={700}>
                      {x.title}
                    </Txt>
                    <Txt size={13} lh={1.45} color={colors.sub}>
                      {x.detail}
                    </Txt>
                  </View>
                  <Tag label={x.tag} tone={x.tone} />
                </View>
              ))}
            </Card>
          </View>
        )}

        {isPayment && (
          <View style={{ gap: 8 }}>
            <Label>THEIR ANSWERS</Label>
            <Card>
              {QUESTIONS.map((q, i) => {
                const a = !!r.answers?.[i];
                const bad = a === BAD_ANSWERS[i];
                const t = bad ? tones.red : tones.green;
                return (
                  <View key={q} style={[styles.answer, i < QUESTIONS.length - 1 && styles.divider]}>
                    <Txt size={14} lh={1.4} style={{ flex: 1 }}>
                      {q}
                    </Txt>
                    <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: t.bg }}>
                      <Txt size={13} w={800} color={t.fg}>
                        {a ? 'Yes' : 'No'}
                      </Txt>
                    </View>
                  </View>
                );
              })}
            </Card>
          </View>
        )}

        {!isPayment && (
          <Txt size={14} lh={1.5} color={colors.sub}>
            Anyone with the key controls the money. Scammers often ask for it. Only allow if they asked you in person.
          </Txt>
        )}
      </ScrollView>

      {error && (
        <Txt size={14} lh={1.5} color={colors.accFg} accessibilityRole="alert" style={{ paddingBottom: 8 }}>
          {error}
        </Txt>
      )}
      {state === 'pending' && (
        <View style={styles.actions}>
          <Button label={risky ? 'Deny & report' : 'Deny'} variant="dark" size={16} style={{ flex: 1 }} disabled={busy} onPress={() => setConfirm('deny')} />
          <Button label={busy ? 'Sending…' : isPayment ? 'Allow once' : 'Allow'} size={16} style={{ flex: 1 }} disabled={busy} onPress={() => setConfirm('allow')} />
        </View>
      )}

      <Sheet visible={!!confirm} onClose={() => setConfirm(null)} center gap={14} dim={0.32}>
        <IconCircle key={confirm ?? 'none'} icon={cf.icon} bg={cf.bg} fg={cf.fg} size={56} fontSize={24} style={{ marginTop: 8 }} />
        <View style={{ gap: 6, paddingHorizontal: 8 }}>
          <Txt size={22} w={800} ls={-0.025} align="center">
            {cf.title}
          </Txt>
          <Txt size={16} lh={1.5} color={colors.sub} align="center">
            {cf.body}
          </Txt>
        </View>
        <View style={{ alignSelf: 'stretch', gap: 8, paddingTop: 8 }}>
          <Button label={cf.btn} bg={cf.btnBg} fg={colors.white} onPress={() => void onConfirm()} />
          <Button label="Cancel" variant="soft" height={54} onPress={() => setConfirm(null)} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 },
  answer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: -20,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 4,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
});
