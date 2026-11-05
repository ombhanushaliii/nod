import { router } from 'expo-router';
import { View } from 'react-native';

import { Avatar, AvatarPicker, Button, Label, Screen, StepBars, Txt } from '@/components';
import { useStore } from '@/data/store';
import { colors } from '@/theme';

/** Sign-up step 1: the username comes from the Google email; the user picks an avatar. */
export default function Welcome() {
  const username = useStore((s) => s.username);
  const avatar = useStore((s) => s.userAvatar);
  const setAvatar = useStore((s) => s.setUserAvatar);

  return (
    <Screen>
      <StepBars step={1} />
      <View style={{ gap: 8, paddingTop: 18, paddingBottom: 24 }}>
        <Label color={colors.accFg}>STEP 1 OF 2</Label>
        <Txt size={30} w={800} ls={-0.03} lh={1.1}>
          Pick your avatar
        </Txt>
        <Txt size={17} lh={1.5} color={colors.sub}>
          Your username is{' '}
          <Txt size={17} w={700}>
            @{username}
          </Txt>
          , made from your email.
        </Txt>
      </View>
      <View style={{ gap: 22, paddingBottom: 8 }}>
        <View style={{ alignSelf: 'center' }}>
          <Avatar index={avatar} size={104} />
        </View>
        <View style={{ gap: 12 }}>
          <Label>CHOOSE ONE</Label>
          <AvatarPicker value={avatar} onChange={setAvatar} />
        </View>
      </View>
      <View style={{ flex: 1 }} />
      <Button label="Continue" onPress={() => router.push('/wallet/add-trustee')} />
    </Screen>
  );
}
