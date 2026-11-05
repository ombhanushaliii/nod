import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, NavRow, Screen, Tap, Txt } from '@/components';
import { QUESTIONS } from '@/data/engine';
import { trusteeName, useStore } from '@/data/store';
import { useRequestApproval } from '@/hooks/api';
import { haptic } from '@/lib/haptics';
import { colors } from '@/theme';

/** The 3 scam questions. Answers are encrypted to the trustee with the request (docs D4). */
export default function Questions() {
  const answers = useStore((s) => s.answers);
  const setAnswer = useStore((s) => s.setAnswer);
  const tn = useStore(trusteeName);
  const requestApproval = useRequestApproval();
  const done = answers.every((a) => a !== null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      haptic('medium');
      await requestApproval();
      router.replace('/wallet/waiting');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request approval.');
    } finally { setBusy(false); }
  };

  return (
    <Screen padH={20}>
      <NavRow onBack={() => router.back()} />
      <View style={{ gap: 8, paddingTop: 4, paddingBottom: 18 }}>
        <Txt size={28} w={800} ls={-0.03}>
          3 quick questions
        </Txt>
        <Txt size={16} lh={1.5} color={colors.sub}>
          Be honest. Only {tn} sees your answers.
        </Txt>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false}>
        {QUESTIONS.map((q, i) => (
          <View key={q} style={styles.card}>
            <Txt size={16} w={700} lh={1.4}>
              {q}
            </Txt>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([true, false] as const).map((v) => {
                const on = answers[i] === v;
                return (
                  <Tap
                    key={String(v)}
                    onPress={() => setAnswer(i, v)}
                    accessibilityState={{ selected: on }}
                    style={[styles.choice, { backgroundColor: on ? colors.ink : colors.bg }]}>
                    <Txt size={15} w={700} color={on ? colors.white : colors.ink}>
                      {v ? 'Yes' : 'No'}
                    </Txt>
                  </Tap>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
      {error && <Txt size={14} color={colors.accFg} accessibilityRole="alert">{error}</Txt>}
      <Button label={busy ? 'Requesting…' : `Send to ${tn}`} disabled={!done || busy} style={{ marginTop: 14 }} onPress={() => void submit()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, backgroundColor: colors.white, padding: 16, gap: 12 },
  choice: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
