import { View } from 'react-native';

import { Button, IconCircle, Screen, Txt } from '@/components';
import { trusteeName, useStore } from '@/data/store';
import { colors, tones } from '@/theme';

/** After the invite: waiting for the trustee (or they're already on board). */
export default function Ready() {
  const active = useStore((s) => s.trusteeStatus === 'active');
  const contact = useStore((s) => s.trusteeContact);
  const tn = useStore(trusteeName);
  const finish = useStore((s) => s.finishOnboarding);

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <IconCircle
          key={active ? 'on' : 'wait'}
          icon={active ? '✓' : '…'}
          bg={active ? tones.green.bg : colors.accBg}
          fg={active ? tones.green.fg : colors.accFg}
          anim={active ? 'pop' : 'pulse'}
          halo
        />
        <Txt size={28} w={800} ls={-0.03} align="center">
          {active ? `${tn} is on board` : `Waiting for ${tn}`}
        </Txt>
        <Txt size={17} lh={1.5} color={colors.sub} align="center" style={{ maxWidth: 300 }}>
          {active ? 'Your wallet is ready.' : `We sent an invite to ${contact}. You can look around while you wait.`}
        </Txt>
      </View>
      {/* Finishing sign-up flips the route guard, which opens the wallet home. */}
      <Button label={active ? 'Open my wallet' : 'Continue'} onPress={finish} />
    </Screen>
  );
}
