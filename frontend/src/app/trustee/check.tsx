import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { BackButton, Button, FadeInRow, Label, Screen, Tap, Txt } from '@/components';
import { ADDR } from '@/data/engine';
import { type AddressCheck, type AddressVerdict, useAddressCheck } from '@/hooks/trustee';
import { haptic } from '@/lib/haptics';
import { colors, font, tones } from '@/theme';
import { ApiError } from '@/wallet/backend';
import { isDemo } from '@/wallet/config';

const isEvmAddress = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v);

// One address Nod knows is bad, to see what a warning looks like. Live: the
// Ronin bridge hacker (sanctioned). Demo: the engine's reported scam.
const EXAMPLE = isDemo
  ? { label: 'A reported scam', address: ADDR.SCAM }
  : { label: 'Ronin bridge hacker', address: '0x098b716b8aaf21512996dc57eb0615e2383e2f96' };

type Phase = 'empty' | 'checking' | 'result' | 'error';

const TONE: Record<AddressVerdict, { bg: string; fg: string; eyebrow: string }> = {
  danger: { bg: tones.red.bg, fg: tones.red.fg, eyebrow: 'SCAM WARNING' },
  caution: { bg: tones.amber.bg, fg: tones.amber.fg, eyebrow: 'BE CAREFUL' },
  clear: { bg: colors.soft, fg: colors.softInk, eyebrow: 'LOOKS OKAY' },
};

function headline(r: AddressCheck): { title: string; body: string } {
  const has = (code: string) => r.codes.some((c) => c === code || c.endsWith(`:${code}`));
  if (r.verdict === 'danger') {
    if (has('sanctioned')) {
      return { title: "Don't pay this address", body: "It's on a sanctions list. Money sent here is almost certainly gone, and paying it can be illegal." };
    }
    if (r.codes.length === 1 && has('look_alike')) {
      return { title: "Don't pay this address", body: 'It copies an address someone you look after has paid. Scammers do this to trick people.' };
    }
    return { title: "Don't pay this address", body: 'Nod links it to scams. Money sent here is almost certainly gone.' };
  }
  if (r.verdict === 'caution') {
    return r.goplusChecked
      ? { title: 'Ask before paying this one', body: 'Someone reported this wallet to Nod, but nobody has confirmed the report yet.' }
      : { title: "Couldn't finish the check", body: "Nod couldn't check everything just now. Try again in a minute." };
  }
  return { title: 'No warning signs', body: 'Nod has no warnings for this wallet. Still make sure you know who it belongs to.' };
}

/** A trustee looks up any address: is it a known scam, before anyone pays it? */
export default function CheckAddress() {
  const check = useAddressCheck();
  const [phase, setPhase] = useState<Phase>('empty');
  const [typed, setTyped] = useState('');
  const [address, setAddress] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AddressCheck | null>(null);

  const run = async (a: string) => {
    setAddress(a);
    setPhase('checking');
    setHint(null);
    setError(null);
    setResult(null);
    try {
      const r = await check(a);
      haptic(r.verdict === 'clear' ? 'success' : 'warning');
      setResult(r);
      setPhase('result');
    } catch (err) {
      // The backend's own messages are written for people; anything else (no network, a gateway page) isn't.
      setError(err instanceof ApiError ? err.message : "Couldn't check that address. Check your connection and try again.");
      setPhase('error');
    }
  };

  const onType = (v: string) => {
    const clean = v.replace(/\s+/g, '');
    setTyped(clean);
    setHint(null);
    // A whole address checks itself: no extra button to find.
    if (isEvmAddress(clean)) void run(clean);
  };

  const paste = async () => {
    const text = (await Clipboard.getStringAsync()).replace(/\s+/g, '');
    if (isEvmAddress(text)) {
      setTyped(text);
      void run(text);
    } else {
      haptic('error');
      setHint(text ? "That isn't a wallet address. It should start with 0x and be 42 characters long." : 'Your clipboard is empty. Copy an address first.');
    }
  };

  const reset = () => {
    setPhase('empty');
    setTyped('');
    setAddress('');
    setHint(null);
    setError(null);
    setResult(null);
  };

  const partial = typed && !isEvmAddress(typed) && typed.length >= 4
    ? "Keep going: an address starts with 0x and is 42 characters long."
    : null;

  return (
    <Screen padH={20} keyboard>
      <View style={styles.header}>
        <BackButton onPress={() => router.back()} />
        <Txt size={20} w={800} ls={-0.02}>
          Check an address
        </Txt>
      </View>

      <ScrollView
        style={{ flex: 1, marginHorizontal: -20 }}
        contentContainerStyle={{ gap: 16, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {phase === 'empty' ? (
          <>
            <Txt size={16} lh={1.5} color={colors.sub}>
              Is it a known scam? Paste the address and find out before anyone sends money to it.
            </Txt>

            <View style={styles.inputCard}>
              <Txt size={13} w={700} color={colors.sub} nativeID="address-label">
                Address
              </Txt>
              <TextInput
                value={typed}
                onChangeText={onType}
                placeholder="0x…"
                placeholderTextColor={colors.faint}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                returnKeyType="search"
                onSubmitEditing={() => isEvmAddress(typed) && void run(typed)}
                accessibilityLabelledBy="address-label"
                accessibilityLabel="Address"
                maxFontSizeMultiplier={1.3}
                style={styles.input}
              />
            </View>
            {(hint ?? partial) && (
              <Txt size={13} lh={1.45} color={hint ? colors.accFg : colors.sub} style={{ marginTop: -6, paddingHorizontal: 4 }} accessibilityLiveRegion="polite">
                {hint ?? partial}
              </Txt>
            )}

            <View style={{ gap: 8, paddingTop: 12 }}>
              <Label style={{ paddingHorizontal: 4 }}>TRY AN EXAMPLE</Label>
              <Tap
                feedback="opacity"
                onPress={() => {
                  setTyped(EXAMPLE.address);
                  void run(EXAMPLE.address);
                }}
                style={styles.example}
                accessibilityLabel={`Check ${EXAMPLE.label}`}>
                <View style={[styles.exampleIcon, { backgroundColor: tones.red.bg }]}>
                  <AlertIcon color={tones.red.fg} size={18} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt size={15} w={700}>
                    {EXAMPLE.label}
                  </Txt>
                  <Txt size={13} color={colors.sub}>
                    {EXAMPLE.address.slice(0, 6)}…{EXAMPLE.address.slice(-4)}
                  </Txt>
                </View>
                <ChevronIcon />
              </Tap>
            </View>
          </>
        ) : (
          <AddressCard address={address} onClear={reset} />
        )}

        {phase === 'checking' && (
          <View style={styles.checking} accessible accessibilityLabel="Checking this address" accessibilityLiveRegion="polite">
            <ActivityIndicator size="large" color={colors.acc} />
            <Txt size={17} w={800} style={{ paddingTop: 4 }}>
              Checking…
            </Txt>
            <Txt size={14} color={colors.sub}>
              Looking it up in Nod&apos;s scam data
            </Txt>
          </View>
        )}

        {phase === 'error' && (
          <View style={styles.checking} accessibilityRole="alert">
            <Txt size={17} w={800}>
              Couldn&apos;t check it
            </Txt>
            <Txt size={14} lh={1.45} color={colors.sub} align="center">
              {error}
            </Txt>
          </View>
        )}

        {phase === 'result' && result && <Result r={result} />}
      </ScrollView>

      {phase === 'empty' && <Button label="Paste address" icon={<ClipboardIcon />} radius={18} onPress={() => void paste()} />}
      {phase === 'result' && <Button label="Check another address" variant="dark" radius={18} onPress={reset} />}
      {phase === 'error' && <Button label="Try again" radius={18} onPress={() => void run(address)} />}
    </Screen>
  );
}

/** The address that was checked, in full, with a way to clear it and check another. */
function AddressCard({ address, onClear }: { address: string; onClear: () => void }) {
  return (
    <View style={styles.addressCard}>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Txt size={13} w={700} color={colors.sub}>
          Address
        </Txt>
        <Txt size={15} w={500} lh={1.45} selectable>
          {address}
        </Txt>
      </View>
      <Tap onPress={onClear} style={styles.clear} pressedScale={0.9} accessibilityLabel="Clear this address">
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.sub} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M6 6l12 12" />
          <Path d="M18 6L6 18" />
        </Svg>
      </Tap>
    </View>
  );
}

function Result({ r }: { r: AddressCheck }) {
  const tone = TONE[r.verdict];
  const { title, body } = headline(r);
  const rows = [
    ...r.reasons.map((reason) => ({ title: reason.title, detail: reason.detail, dot: reason.tone === 'red' ? tones.red.fg : reason.tone === 'amber' ? tones.amber.fg : colors.softInk })),
    ...(r.paidBefore ? [{ title: 'Paid before', detail: 'Someone you look after has sent money here.', dot: colors.softInk }] : []),
  ];
  return (
    <FadeInRow>
      <View style={{ gap: 16 }}>
        <View style={[styles.hero, { backgroundColor: tone.bg }]} accessible accessibilityLabel={`${title}. ${body}`}>
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              {r.verdict === 'danger' ? <AlertIcon color={tone.fg} size={20} bare /> : r.verdict === 'caution' ? <QuestionIcon color={tone.fg} /> : <CheckIcon color={tone.fg} />}
            </View>
            <Txt size={12} w={800} ls={0.08} color={tone.fg}>
              {tone.eyebrow}
            </Txt>
          </View>
          <Txt size={26} w={800} ls={-0.025} lh={1.12} style={{ paddingTop: 4 }}>
            {title}
          </Txt>
          <Txt size={15} lh={1.5} color={colors.bannerBody}>
            {body}
          </Txt>
        </View>

        {rows.length > 0 && (
          <View style={{ gap: 8 }}>
            <Label style={{ paddingHorizontal: 4 }}>{r.verdict === 'clear' ? 'GOOD TO KNOW' : 'WHY'}</Label>
            <View style={styles.reasons}>
              {rows.map((row, i) => (
                <View key={`${i}-${row.title}`} style={[styles.reason, i < rows.length - 1 && styles.reasonLine]}>
                  <View style={[styles.dot, { backgroundColor: row.dot }]} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Txt size={16} w={700}>
                      {row.title}
                    </Txt>
                    <Txt size={14} lh={1.45} color={colors.sub}>
                      {row.detail}
                    </Txt>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        <Txt size={13} color={colors.sub} style={{ paddingHorizontal: 4 }}>
          Checked against Nod&apos;s scam reports.
        </Txt>
      </View>
    </FadeInRow>
  );
}

function AlertIcon({ color, size, bare }: { color: string; size: number; bare?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 7v6" />
      <Path d="M12 16.5v.5" />
      {!bare && <Circle cx={12} cy={12} r={9} />}
    </Svg>
  );
}

function QuestionIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8v.5" />
      <Path d="M12 17v.5" />
    </Svg>
  );
}

function CheckIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  );
}

function ChevronIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.faint} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

function ClipboardIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={8} y={3} width={8} height={4} rx={1.5} />
      <Path d="M8 5H6.5A1.5 1.5 0 0 0 5 6.5v13A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 17.5 5H16" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  inputCard: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 1.5, borderColor: colors.line, paddingTop: 14, paddingBottom: 16, paddingHorizontal: 16, gap: 6 },
  input: { fontFamily: font[500], fontSize: 16, color: colors.ink, padding: 0 },
  example: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: colors.white },
  exampleIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  addressCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: 20, paddingVertical: 14, paddingLeft: 16, paddingRight: 10 },
  clear: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  checking: { backgroundColor: colors.white, borderRadius: 24, paddingVertical: 32, paddingHorizontal: 20, alignItems: 'center', gap: 8 },
  hero: { borderRadius: 24, padding: 20, gap: 10 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  reasons: { backgroundColor: colors.white, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 2 },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 },
  reasonLine: { borderBottomWidth: 1, borderBottomColor: colors.line },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
});
