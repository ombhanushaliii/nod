import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Button, NavRow, Screen, Txt } from '@/components';
import { useAuth } from '@/hooks/api';
import { short } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { colors } from '@/theme';

export default function Receive() {
  const { user, walletAddress } = useAuth();
  const [copied, setCopied] = useState(false);
  const address = walletAddress;

  const copy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    haptic('success');
    setCopied(true);
  };

  return (
    <Screen>
      <NavRow onBack={() => router.back()} />
      <Txt size={30} w={800} ls={-0.03} style={{ paddingTop: 4, paddingBottom: 8 }}>
        Receive
      </Txt>
      <Txt size={17} lh={1.5} color={colors.sub}>
        Share your username to get paid in USDC.
      </Txt>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <View style={{ width: 220, height: 220, borderRadius: 24, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
          {address ? <QRCode value={`ethereum:${address}@84532`} size={176} color={colors.ink} backgroundColor={colors.white} /> : <Txt>Connecting wallet…</Txt>}
        </View>
        <Txt size={24} w={800}>
          @{user?.username}
        </Txt>
        <Txt size={13} color={colors.sub} tabular>
          {short(address)} · Base
        </Txt>
      </View>
      <Button label={copied ? 'Copied ✓' : 'Copy address'} disabled={!address} onPress={() => void copy()} />
    </Screen>
  );
}
