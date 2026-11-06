import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Chip, FadeInRow, Label, NavRow, Screen, Tap, TextField, Txt } from '@/components';
import { useNow } from '@/data/clock';
import { ADDR, capLeft, isValidAddress, payeeBy } from '@/data/engine';
import { useStore } from '@/data/store';
import { dur, m0, short } from '@/lib/format';
import { colors, tones, type Tone } from '@/theme';
import { isDemo } from '@/wallet/config';

const isEvmAddress = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v);

type TestAddress = { label: string; address: string; name: string; sub: string; tone: Tone; icon: string };

/** Demo: made-up addresses the phone's own engine knows to flag. */
const DEMO_CHIPS: TestAddress[] = [
  { label: 'New person', address: ADDR.ARI, name: 'Ari', sub: '$10 max for 24h', tone: 'green', icon: '✓' },
  { label: 'Reported scam', address: ADDR.SCAM, name: 'Crypto Support', sub: 'Goes to trustee', tone: 'red', icon: '!' },
  { label: 'Risky address', address: ADDR.RISKY, name: 'Airdrop', sub: 'Fails security check', tone: 'red', icon: '!' },
  { label: 'Mom look-alike', address: ADDR.LOOK, name: 'Mom (new)', sub: 'Copycat address', tone: 'amber', icon: '≈' },
  { label: 'Unconfirmed', address: ADDR.RUMOR, name: 'Jules', sub: 'Reports not verified', tone: 'info', icon: '?' },
];

/**
 * Live: the backend checks the real address, so each chip must be one that really
 * trips the rule it names. Made-up addresses would come back clean and let you send.
 */
const LIVE_CHIPS: TestAddress[] = [
  { label: 'New person', address: ADDR.ARI, name: 'Ari', sub: '$10 max for 24h', tone: 'green', icon: '✓' },
  // A known phishing wallet (eth-labels "Fake_Phishing59"; also flagged for phishing by the security check).
  { label: 'Reported scam', address: '0x00000952c5165e391ed0f8adffcfaf45f3b80000', name: 'Crypto Support', sub: 'Goes to trustee', tone: 'red', icon: '!' },
  // Linked to stolen funds by the security check.
  { label: 'Risky address', address: '0x7c8601d4645b93cea45f71e118a729332e6b5ca0', name: 'Airdrop', sub: 'Fails security check', tone: 'red', icon: '!' },
  // Reported by 2 Nod trustees (scam_report entities on Arkiv): needs your trustee's OK.
  { label: 'Reported by trustees', address: '0x0fa2a84621adcf28d3e0b6feaa366811a921581a', name: 'Prize Desk', sub: 'Needs your trustee', tone: 'amber', icon: '!' },
  // Reported by 5 Nod trustees: blocked for everyone, nobody can allow it.
  { label: 'Blocked address', address: '0xd149bb71b7a049b49cdf86ffce5a523e814d04ac', name: 'Giveaway', sub: 'Blocked for everyone', tone: 'red', icon: '✕' },
];

/**
 * A copy of an address you paid: same first 4 and last 4 characters after 0x (what
 * the backend's look-alike check compares), different middle. The middle is the
 * original's, reversed and shifted, so it never matches the real one.
 */
function lookAlikeOf(address: string) {
  const a = address.toLowerCase();
  const middle = a.slice(6, -4).split('').reverse().map((c) => ((parseInt(c, 16) + 7) % 16).toString(16)).join('');
  return `${a.slice(0, 6)}${middle}${a.slice(-4)}`;
}

/** "Send to": paste an address, pick a test address, or pick someone already added. */
export default function SendTo() {
  const now = useNow();
  const payees = useStore((s) => s.payees);
  const payments = useStore((s) => s.payments);
  const setDraft = useStore((s) => s.setDraft);
  const [to, setTo] = useState('');
  const [name, setName] = useState('');
  // Live: a look-alike of the last person you paid, when there is one.
  const lastPaid = payments.find((p) => p.address && isEvmAddress(p.address));
  const chips: TestAddress[] = isDemo
    ? DEMO_CHIPS
    : lastPaid
      ? [...LIVE_CHIPS, { label: `${lastPaid.to} look-alike`, address: lookAlikeOf(lastPaid.address), name: `${lastPaid.to} (new)`, sub: 'Copycat address', tone: 'amber', icon: '≈' }]
      : LIVE_CHIPS;

  const tv = to.trim();
  // Live payments go to 0x addresses only; @usernames are a demo stand-in.
  const valid = isDemo ? isValidAddress(tv) : isEvmAddress(tv);
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
        placeholder={isDemo ? 'Paste address or @username' : 'Paste a wallet address (0x…)'}
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
          {chips.map((d) => {
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
