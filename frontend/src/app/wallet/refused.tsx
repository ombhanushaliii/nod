import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, IconCircle, Screen, Txt } from '@/components';
import { useStore } from '@/data/store';
import { goWalletHome } from '@/hooks/nav';
import { short } from '@/lib/format';
import { colors, tones } from '@/theme';
import { trusteeReportersIn } from '@/wallet/trustee';

/**
 * The payment can't go out at all: either the address was reported by 5 or
 * more trustees (blocked for everyone), or it's the wallet's first-ever
 * payment and over $10 (docs D3, rule 1).
 */
export default function Refused() {
  const codes = useStore((s) => s.result?.codes ?? []);
  const address = useStore((s) => s.draft?.address ?? '');

  if (codes.includes('blocked_by_trustees')) {
    const n = trusteeReportersIn(codes);
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <IconCircle icon="✕" bg={tones.red.bg} fg={tones.red.fg} fontSize={28} />
          <Txt size={28} w={800} ls={-0.03} align="center">
            This address is blocked
          </Txt>
          <Txt size={17} lh={1.5} color={colors.sub} align="center" style={{ maxWidth: 320 }}>
            {n} Nod trustees stopped payments to {short(address)} and reported it as a scam, so nobody can send money to it.
          </Txt>
          <Txt size={15} lh={1.5} color={colors.sub} align="center" style={{ maxWidth: 320 }}>
            If someone is pressing you to pay this address, it&apos;s very likely a scam. Your trustee has been told.
          </Txt>
        </View>
        <Button label="Back to home" onPress={goWalletHome} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <IconCircle icon="$10" bg={tones.amber.bg} fg={tones.amber.fg} fontSize={28} />
        <Txt size={28} w={800} ls={-0.03} align="center">
          First payment: $10 max
        </Txt>
        <Txt size={17} lh={1.5} color={colors.sub} align="center" style={{ maxWidth: 300 }}>
          Start small while you get the hang of it. After your first payment, you can send more.
        </Txt>
      </View>
      <Button label="Change amount" onPress={() => router.back()} />
    </Screen>
  );
}
