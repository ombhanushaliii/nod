import { View } from 'react-native';

import { Button, IconCircle, Screen, Txt } from '@/components';
import { useStore } from '@/data/store';
import { goWalletHome, useBackGoesHome } from '@/hooks/nav';
import { colors } from '@/theme';

export default function Sent() {
  const sentText = useStore((s) => s.sentText);
  useBackGoesHome();
  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <IconCircle icon="✓" bg={colors.acc} fg={colors.white} fontSize={40} />
        <Txt size={30} w={800} ls={-0.03}>
          Sent
        </Txt>
        <Txt size={17} color={colors.sub}>
          {sentText}
        </Txt>
      </View>
      <Button label="Done" variant="soft" onPress={goWalletHome} />
    </Screen>
  );
}
