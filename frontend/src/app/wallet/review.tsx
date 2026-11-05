import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Card, InfoDot, KV, NavRow, Pop, Screen, Txt } from '@/components';
import { trusteeName, useStore } from '@/data/store';
import { useScamReports, useSendPayment } from '@/hooks/api';
import { money, moneyParts, short } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { colors } from '@/theme';

const HOLD_MS = 900;

export default function Review() {
  const draft = useStore((s) => s.draft);
  const result = useStore((s) => s.result);
  const tn = useStore(trusteeName);
  const send = useSendPayment();
  const reports = useScamReports(draft?.address);
  const [holding, setHolding] = useState(false);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [progress] = useState(() => new Animated.Value(0));

  const amount = draft?.amount ?? 0;
  const parts = moneyParts(amount);

  // Hold-to-send: the bar fills over 0.9s; letting go early cancels. A timer decides the send
  // (like the prototype) so it never depends on an animation frame finishing.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const start = () => {
    if (timer.current || sendingRef.current) return;
    setError(null);
    haptic('light');
    setHolding(true);
    Animated.timing(progress, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false }).start();
    timer.current = setTimeout(async () => {
      timer.current = null;
      setHolding(false);
      sendingRef.current = true;
      setSending(true);
      try {
        await send();
        haptic('success');
        router.replace('/wallet/sent');
      } catch (err) {
        haptic('error');
        setError(err instanceof Error ? err.message : 'The payment could not be sent.');
      } finally {
        sendingRef.current = false;
        setSending(false);
        progress.setValue(0);
      }
    }, HOLD_MS);
  };
  const cancel = () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
    progress.stopAnimation();
    Animated.timing(progress, { toValue: 0, duration: 250, easing: Easing.out(Easing.ease), useNativeDriver: false }).start();
  };

  return (
    <Screen padH={20}>
      <NavRow onBack={() => router.back()} title="Review" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 18, paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', gap: 14, paddingTop: 18, paddingBottom: 4 }}>
          <Txt size={14} w={600} color={colors.sub}>
            You&apos;re sending
          </Txt>
          <Pop duration={500} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <Txt size={30} w={700} style={{ alignSelf: 'center', marginRight: 2 }}>
              $
            </Txt>
            <Txt size={68} w={800} ls={-0.045} tabular style={{ lineHeight: 72 }}>
              {parts.whole}
            </Txt>
            <Txt size={30} w={700} color={colors.faint} style={{ paddingTop: 10 }}>
              .{parts.cents}
            </Txt>
          </Pop>
          <View style={styles.arrow}>
            <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={colors.softInk} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12 5v14" />
              <Path d="M6 13l6 6 6-6" />
            </Svg>
          </View>
          <View style={styles.recipient}>
            <View style={styles.recipientInitial}>
              <Txt size={15} w={800} color={colors.avatarFg}>
                {(draft?.name || '?')[0].toUpperCase()}
              </Txt>
            </View>
            <View style={{ gap: 1 }}>
              <Txt size={16} w={800}>
                {draft?.name}
              </Txt>
              <Txt size={12} color={colors.sub} tabular>
                {short(draft?.address)}
              </Txt>
            </View>
          </View>
        </View>

        <Card>
          <KV k="From" v="Your wallet" size={15} />
          <KV k="Arrives" v="In seconds" size={15} />
          <KV
            k="Network fee"
            size={15}
            last
            v={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Txt size={13} color={colors.faint} style={{ textDecorationLine: 'line-through' }}>
                  $0.02
                </Txt>
                <Txt size={15} w={700}>
                  Free
                </Txt>
              </View>
            }
          />
        </Card>

        {!!result?.reqId && (
          <View style={styles.approved}>
            <View style={styles.approvedTick}>
              <Txt size={12} color={colors.white}>
                ✓
              </Txt>
            </View>
            <Txt size={14} w={700} color={colors.softInk}>
              {tn} approved this once
            </Txt>
          </View>
        )}
        {reports.unverified > 0 && reports.verified === 0 && (
          <View style={styles.unverified}>
            <Txt size={14} lh={1.45} color={colors.note}>
              {reports.unverified} unverified reports mention this address. We couldn&apos;t confirm them, so they don&apos;t block it.
            </Txt>
          </View>
        )}
      </ScrollView>

      <View style={{ gap: 12 }}>
        {error && <Txt size={14} color={colors.accFg} accessibilityRole="alert">{error}</Txt>}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <InfoDot color={colors.sub} glyph="!" size={16} />
          <Txt size={13} color={colors.sub}>
            Payments can&apos;t be undone
          </Txt>
        </View>
        <Pressable
          disabled={sending}
          onPressIn={start}
          onPressOut={cancel}
          accessibilityRole="button"
          accessibilityLabel={`Hold to send ${money(amount)}`}
          style={styles.hold}>
          <Animated.View style={[styles.fill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <View style={styles.holdIcon}>
              <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M12 19V5" />
                <Path d="M6 11l6-6 6 6" />
              </Svg>
            </View>
            <Txt size={17} w={700} color={colors.white}>
              {sending ? 'Confirming payment…' : holding ? 'Keep holding…' : `Hold to send ${money(amount)}`}
            </Txt>
          </View>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  arrow: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  recipient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 16,
    borderRadius: 999,
    backgroundColor: colors.white,
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  recipientInitial: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accSoft, alignItems: 'center', justifyContent: 'center' },
  approved: { borderRadius: 16, backgroundColor: colors.soft, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  approvedTick: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.softInk, alignItems: 'center', justifyContent: 'center' },
  unverified: { borderRadius: 16, backgroundColor: colors.white, paddingVertical: 12, paddingHorizontal: 14 },
  hold: { height: 60, borderRadius: 18, backgroundColor: colors.ink, overflow: 'hidden', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.acc },
  holdIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
});
