import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Card, IconCircle, KV, NavRow, Screen, Tag, Txt } from '@/components';
import { trusteeName, useStore } from '@/data/store';
import { useRules } from '@/hooks/api';
import { goWalletHome } from '@/hooks/nav';
import { m0, money } from '@/lib/format';
import { colors, tones } from '@/theme';

/** The payment needs the trustee: flagged address, over the limit, or over the daily max. */
export default function Flagged() {
  const draft = useStore((s) => s.draft);
  const result = useStore((s) => s.result);
  const resetAnswers = useStore((s) => s.resetAnswers);
  const tn = useStore(trusteeName);
  // No trustee yet (invite not accepted): nobody can check it, so don't offer to ask.
  const canAsk = useStore((s) => s.trusteeStatus === 'active');
  const R = useRules();

  const why = result?.why;
  const isDaily = why === 'daily';
  const isLimit = why === 'limit' || isDaily;
  const icon = isLimit ? tones.amber : tones.red;
  const title = isDaily ? `Over today's ${m0(R.daily)} max` : isLimit ? `Over your ${m0(R.limit)} limit` : 'This might be a scam';
  const body = !canAsk
    ? `${isLimit ? 'This one needs your trustee’s OK' : 'We found warning signs'}, but ${tn} hasn’t accepted your invite yet, so nobody can check it. It can’t be sent for now.`
    : isDaily
      ? `${tn} set a daily max. They need to OK going over it.`
      : isLimit
        ? `${tn} needs to OK this one before it goes out.`
        : `We found warning signs. ${tn} has to check it before it can go out.`;

  return (
    <Screen padH={20}>
      <NavRow onBack={() => router.back()} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 18 }} showsVerticalScrollIndicator={false}>
        <IconCircle icon={isLimit ? '$' : '!'} bg={icon.bg} fg={icon.fg} size={64} fontSize={28} style={{ alignSelf: 'flex-start' }} />
        <View style={{ gap: 8 }}>
          <Txt size={28} w={800} ls={-0.03} lh={1.12}>
            {title}
          </Txt>
          <Txt size={17} lh={1.5} color={colors.sub}>
            {body}
          </Txt>
        </View>
        <Card>
          {(result?.reasons ?? []).map((r, i) => (
            <View key={`${i}-${r.title}`} style={styles.reason}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt size={16} w={700}>
                  {r.title}
                </Txt>
                <Txt size={14} lh={1.45} color={colors.sub}>
                  {r.detail}
                </Txt>
              </View>
              <Tag label={r.tag} tone={r.tone} />
            </View>
          ))}
          <KV k="Payment" v={`${money(draft?.amount ?? 0)} to ${draft?.name ?? ''}`} size={15} last />
        </Card>
      </ScrollView>
      <View style={{ gap: 8, paddingTop: 14 }}>
        {canAsk && (
          <Button
            label={`Ask ${tn} to check`}
            onPress={() => {
              resetAnswers();
              router.push('/wallet/questions');
            }}
          />
        )}
        <Button label={canAsk ? "Don't send" : 'Back to home'} variant={canAsk ? 'soft' : 'dark'} height={canAsk ? 50 : 56} size={canAsk ? 16 : 17} onPress={goWalletHome} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
});
