import { View } from 'react-native';

import { Avatar, Button, Screen, Txt } from '@/components';
import { useStore } from '@/data/store';
import { useAuth } from '@/hooks/api';
import { haptic } from '@/lib/haptics';
import { colors } from '@/theme';

/** The trustee's first screen: accept the invite from the wallet user. */
export default function Invite() {
  const username = useStore((s) => s.username);
  const avatar = useStore((s) => s.userAvatar);
  const accept = useStore((s) => s.acceptInvite);
  const { signOut } = useAuth();

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: 22 }}>
        <Avatar index={avatar} size={72} />
        <View style={{ gap: 10 }}>
          <Txt size={30} w={800} ls={-0.03} lh={1.12}>
            @{username} added you as their trustee
          </Txt>
          <Txt size={17} lh={1.5} color={colors.sub}>
            You&apos;ll check risky payments before they go out. You can&apos;t touch their money.
          </Txt>
        </View>
      </View>
      <View style={{ gap: 8 }}>
        {/* Accepting flips the route guard to profile setup. */}
        <Button
          label="Accept"
          onPress={() => {
            haptic('success');
            accept();
          }}
        />
        <Button label="Not now" variant="ghost" height={48} size={16} onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}
