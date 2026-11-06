import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, FadeInRow, NavRow, Screen, ScratchCard, Tap, Txt } from '@/components';
import { MY_ADDRESS } from '@/data/engine';
import { trusteeName, useStore } from '@/data/store';
import { short } from '@/lib/format';
import { colors } from '@/theme';
import { isDemo } from '@/wallet/config';

// Mock key. With Privy, this screen shows Privy's own export UI after the trustee allows it.
const KEY_HEX = '7f3a9c21e84b06d5fa1c3e87b2049d6ac5e1f08b73d29a64e0c5b18f2d7a4c93';
const CHUNKS = KEY_HEX.match(/.{4}/g) ?? [];

/** Shown once, after the trustee allowed the export request. */
export default function ExportKey() {
  return isDemo ? <DemoExportKey /> : <LiveExportKey />;
}

function LiveExportKey() {
  return <Screen>
    <NavRow onBack={() => router.back()} backLabel="Settings" />
    <Txt size={30} w={800}>Export is coming soon</Txt>
    <Txt size={16} lh={1.5} color={colors.sub}>
      {"You'll be able to export your wallet key once your trustee approves it. That's not ready yet."}
    </Txt>
    <Button label="Back to settings" onPress={() => router.back()} />
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
