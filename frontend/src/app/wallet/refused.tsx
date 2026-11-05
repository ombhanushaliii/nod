import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, IconCircle, Screen, Txt } from '@/components';
import { colors, tones } from '@/theme';

/** The wallet's first-ever payment is capped at $10 (docs D3, rule 1). */
export default function Refused() {
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
