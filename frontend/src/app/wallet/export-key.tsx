import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Button, FadeInRow, NavRow, Screen, ScratchCard, Tap, Txt } from '@/components';
import { MY_ADDRESS } from '@/data/engine';
import { trusteeName, useStore } from '@/data/store';
import { short } from '@/lib/format';
import { colors } from '@/theme';
import { markExportUsed } from '@/hooks/api';
import { isDemo, walletConfig } from '@/wallet/config';

// Mock key. With Privy, this screen shows Privy's own export UI after the trustee allows it.
const KEY_HEX = '7f3a9c21e84b06d5fa1c3e87b2049d6ac5e1f08b73d29a64e0c5b18f2d7a4c93';
const CHUNKS = KEY_HEX.match(/.{4}/g) ?? [];

/** Shown once, after the trustee allowed the export request. */
export default function ExportKey() {
  return isDemo ? <DemoExportKey /> : <LiveExportKey />;
}

type ExportResult = { status: 'success' } | { status: 'error'; error?: string };

/** The result the export page sends back in the return link (landing/src/Export.tsx). */
function parseResult(params: Record<string, unknown>): ExportResult | null {
  if (params.status === 'success') return { status: 'success' };
  if (params.status === 'error') return { status: 'error', error: typeof params.error === 'string' ? params.error.slice(0, 64) : undefined };
  return null;
}

/**
 * Live (D2): the trustee allowed this export once. Privy's export screen runs
 * on our hosted page, which checks with the backend and uses up the Allow
 * before it shows anything. The key never passes through this app.
 *
 * The page opens in the system's in-app browser (an auth session), not an
 * embedded WebView: Google refuses sign-in inside WebViews. When it's done,
 * the page sends the user back here with ?status=success or ?status=error.
 */
function LiveExportKey() {
  const tn = useStore(trusteeName);
  const req = useStore((s) => s.requests.find((r) => r.kind === 'export'));
  const params = useLocalSearchParams<{ status?: string; error?: string }>();
  const [result, setResult] = useState<ExportResult | null>(null);
  const [busy, setBusy] = useState(false);
  // The return link can also arrive as this screen's params.
  const shown = result ?? parseResult(params);

  const finish = (r: ExportResult) => {
    setResult(r);
    // The page only gets past its backend check by using up the Allow.
    if (req && (r.status === 'success' || r.error === 'export_failed')) markExportUsed(req.id);
  };

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const back = Linking.createURL('/wallet/export-key');
      const url = `${walletConfig.exportUrl}?return=${encodeURIComponent(back)}`;
      if (Platform.OS === 'web') { window.location.assign(url); return; }
      const res = await WebBrowser.openAuthSessionAsync(url, back);
      if (res.type === 'success') {
        const r = parseResult(Linking.parse(res.url).queryParams ?? {});
        if (r) finish(r);
      }
    } finally {
      setBusy(false);
    }
  };

  if (shown?.status === 'success') {
    return <Screen>
      <NavRow onBack={() => router.back()} backLabel="Settings" />
      <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
        <Txt size={30} w={800} ls={-0.03}>Key exported</Txt>
        <Txt size={16} lh={1.5} color={colors.sub}>
          Keep it somewhere only you can reach. Anyone with it controls your money, and {tn} can no longer stop a payment from it.
        </Txt>
      </View>
      <Button label="Done" variant="dark" onPress={() => router.back()} />
    </Screen>;
  }

  return <Screen>
    <NavRow onBack={() => router.back()} backLabel="Settings" />
    <Txt size={30} w={800} ls={-0.03} style={{ paddingTop: 4, paddingBottom: 8 }}>Your wallet key</Txt>
    <View style={{ flex: 1, gap: 14 }}>
      <Txt size={16} lh={1.5} color={colors.sub}>
        {tn} allowed this once, for an hour. Privy shows the key on its own secure page: sign in there with the same Google account.
      </Txt>
      <Txt size={16} lh={1.5} color={colors.sub}>
        Never share it. Nobody from Nod will ever ask for it.
      </Txt>
      {shown?.status === 'error' && (
        <Txt size={15} lh={1.45} color={colors.accFg} accessibilityRole="alert">
          {shown.error === 'export_not_allowed'
            ? `This approval was used or ran out. Ask ${tn} again from Settings.`
            : shown.error === 'wrong_account'
              ? 'That was a different account. Sign in with the Google account this wallet uses.'
              : "The export didn't finish. Try again."}
        </Txt>
      )}
    </View>
    <View style={{ gap: 8 }}>
      <Button label={busy ? 'Opening…' : "Open Privy's export"} variant="dark" disabled={busy} onPress={() => void start()} />
      <Button label="Not now" variant="soft" height={52} size={16} onPress={() => router.back()} />
    </View>
  </Screen>;
}

function DemoExportKey() {
  const tn = useStore(trusteeName);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scratchKey, setScratchKey] = useState(0);

  return (
    <Screen>
      <NavRow onBack={() => router.back()} backLabel="Settings" />
      <Txt size={30} w={800} ls={-0.03} style={{ paddingTop: 4, paddingBottom: 8 }}>
        Your wallet key
      </Txt>
      <Txt size={16} lh={1.5} color={colors.sub}>
        {tn} allowed this once. Never share it — anyone with it controls your money.
      </Txt>
      <View style={{ flex: 1, justifyContent: 'center', gap: 14 }}>
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Txt size={11} w={800} ls={0.08} color="rgba(255,255,255,0.55)">
              PRIVATE KEY
            </Txt>
            <View style={styles.addr}>
              <Txt size={12} w={700} color="rgba(255,255,255,0.7)">
                {short(MY_ADDRESS)}
              </Txt>
            </View>
          </View>
          <View style={styles.grid} accessible accessibilityLabel={revealed ? `Private key ${KEY_HEX}` : 'Private key, hidden'}>
            {CHUNKS.map((c, i) => (
              <Txt key={i} size={16} w={700} ls={0.05} tabular color={colors.white} style={{ width: '25%', paddingVertical: 5 }}>
                {c}
              </Txt>
            ))}
          </View>
          {!revealed && <ScratchCard key={scratchKey} onDone={() => setRevealed(true)} />}
        </View>
        {revealed ? (
          <FadeInRow style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              label="Hide again"
              variant="soft"
              height={48}
              radius={14}
              size={15}
              style={{ flex: 1 }}
              onPress={() => {
                setRevealed(false);
                setCopied(false);
                setScratchKey((k) => k + 1);
              }}
            />
            <Button
              label={copied ? 'Copied ✓' : 'Copy key'}
              variant="accSoft"
              height={48}
              radius={14}
              size={15}
              style={{ flex: 1 }}
              onPress={() => {
                void Clipboard.setStringAsync(KEY_HEX);
                setCopied(true);
              }}
            />
          </FadeInRow>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Txt size={14} color={colors.sub}>
              Scratch the card with your finger
            </Txt>
            <Txt size={14} color={colors.dot}>
              ·
            </Txt>
            <Tap feedback="opacity" onPress={() => setRevealed(true)}>
              <Txt size={14} w={700} color={colors.accFg}>
                Tap to reveal
              </Txt>
            </Tap>
          </View>
        )}
      </View>
      <Button label="Done" variant="dark" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    backgroundColor: colors.ink,
    padding: 20,
    minHeight: 210,
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 24 },
    elevation: 8,
  },
  addr: { paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
});
