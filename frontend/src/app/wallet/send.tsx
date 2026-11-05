import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Chip, FadeInRow, Label, NavRow, Screen, Tap, TextField, Txt } from '@/components';
import { useNow } from '@/data/clock';
import { ADDR, capLeft, isValidAddress, payeeBy } from '@/data/engine';
import { useStore } from '@/data/store';
import { dur, m0, short } from '@/lib/format';
import { colors, tones, type Tone } from '@/theme';

/** Test addresses that trigger each rule, so the flow can be demoed without a backend. */
const DEMO_CHIPS: { label: string; address: string; name: string; sub: string; tone: Tone; icon: string }[] = [
  { label: 'New person', address: ADDR.ARI, name: 'Ari', sub: '$10 max for 24h', tone: 'green', icon: '✓' },
  { label: 'Reported scam', address: ADDR.SCAM, name: 'Crypto Support', sub: 'Goes to trustee', tone: 'red', icon: '!' },
  { label: 'Risky address', address: ADDR.RISKY, name: 'Airdrop', sub: 'Fails security check', tone: 'red', icon: '!' },
  { label: 'Mom look-alike', address: ADDR.LOOK, name: 'Mom (new)', sub: 'Copycat address', tone: 'amber', icon: '≈' },
  { label: 'Unconfirmed', address: ADDR.RUMOR, name: 'Jules', sub: 'Reports not verified', tone: 'info', icon: '?' },
];

/** "Send to": paste an address, pick a test address, or pick someone already added. */
export default function SendTo() {
  const now = useNow();
  const payees = useStore((s) => s.payees);
  const payments = useStore((s) => s.payments);
  const setDraft = useStore((s) => s.setDraft);
  const [to, setTo] = useState('');
  const [name, setName] = useState('');

  const tv = to.trim();
  const valid = isValidAddress(tv);
  const known = valid ? payeeBy({ payees }, tv) : undefined;

  const pick = (p: { address: string; name: string }) => {
    setDraft({ address: p.address, name: p.name });
    router.push('/wallet/amount');
  };

  return (
    <Screen padH={20} keyboard>
      <NavRow onBack={() => router.back()} />
      <Txt size={30} w={800} ls={-0.03} style={{ paddingTop: 4, paddingBottom: 16 }}>
        Send to
      </Txt>
      <TextField
        value={to}
        onChangeText={(v) => setTo(v.trim())}
        placeholder="Paste address or @username"
        size={15}
        autoCapitalize="none"
        spellCheck={false}
      />
      {valid && !known && (
        <TextField value={name} onChangeText={setName} placeholder="Name them, e.g. Ari" style={{ marginTop: 10 }} autoCapitalize="words" />
      )}

      <View style={{ gap: 8, paddingTop: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 }}>
          <Label>TRY A TEST ADDRESS</Label>
          <Txt size={12} w={600} color={colors.faint}>
            Swipe →
          </Txt>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={{ marginHorizontal: -20 }}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingTop: 2, paddingBottom: 6 }}>
          {DEMO_CHIPS.map((d) => {
            const t = tones[d.tone];
            const on = to.toLowerCase() === d.address.toLowerCase();
            return (
              <Tap
                key={d.label}
                onPress={() => {
                  setTo(d.address);
                  setName(d.name);
                }}
                accessibilityLabel={d.label}
                style={[styles.demo, { backgroundColor: t.bg, borderColor: on ? t.fg : 'transparent' }]}>
                <View style={styles.demoIcon}>
                  <Txt size={14} w={800} color={t.fg}>
                    {d.icon}
                  </Txt>
                </View>
                <View style={{ gap: 2 }}>
                  <Txt size={14} w={700} lh={1.25}>
                    {d.label}
                  </Txt>
                  <Txt size={12} lh={1.3} color={colors.sub}>
                    {d.sub}
                  </Txt>
                </View>
              </Tap>
            );
          })}
        </ScrollView>
      </View>

      <Label style={{ paddingTop: 18, paddingBottom: 4 }}>PEOPLE YOU&apos;VE ADDED</Label>
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {payees.map((p) => {
          const locked = now < p.unlockAt;
          return (
            <FadeInRow key={p.id}>
              <Tap feedback="opacity" onPress={() => pick(p)} style={styles.payee}>
                <View style={styles.initial}>
                  <Txt size={16} w={800}>
                    {p.name[0].toUpperCase()}
                  </Txt>
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                  <Txt size={16} w={700} numberOfLines={1}>
                    {p.name}
                  </Txt>
                  <Txt size={13} color={colors.sub} tabular>
                    {short(p.address)}
                  </Txt>
                </View>
                <Chip
                  label={locked ? `${m0(capLeft({ payees, payments }, p.address, now))} left · ${dur(p.unlockAt - now)}` : 'Ready'}
                  tone={locked ? 'amber' : 'green'}
                />
              </Tap>
            </FadeInRow>
          );
        })}
      </ScrollView>

      <Button
        label="Next"
        disabled={!valid}
        onPress={() => pick(known ?? { address: tv, name: name.trim() || (tv.startsWith('@') ? tv : 'New person') })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  demo: { width: 128, borderRadius: 16, borderWidth: 1.5, padding: 12, gap: 8 },
  demoIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  payee: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  initial: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
});
