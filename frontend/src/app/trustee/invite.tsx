import { useState } from 'react';
import { View } from 'react-native';

import { Avatar, Button, Screen, Txt } from '@/components';
import { useStore } from '@/data/store';
import { useAuth } from '@/hooks/api';
import { useAcceptInvite } from '@/hooks/trustee';
import { haptic } from '@/lib/haptics';
import { colors } from '@/theme';
import { isDemo } from '@/wallet/config';

/** The trustee's first screen: accept the invite from the wallet user. */
export default function Invite() {
  const username = useStore((s) => s.username);
  const avatar = useStore((s) => s.userAvatar);
  const demoAccept = useStore((s) => s.acceptInvite);
  const liveAccept = useAcceptInvite();
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live: sets up this phone's keys for the pair and tells the backend.
  const accept = async () => {
    if (busy) return;
    if (isDemo) {
      haptic('success');
      return demoAccept();
    }
    setBusy(true);
    setError(null);
    try {
      await liveAccept();
      haptic('success');
    } catch (err) {
      haptic('error');
      setError(err instanceof Error ? err.message : "Couldn't accept the invite. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: 22 }}>
        <Avatar index={avatar} size={72} />
        <View style={{ gap: 10 }}>
          <Txt size={30} w={800} ls={-0.03} lh={1.12}>
            {isDemo ? `@${username} added you as their trustee` : "You've been asked to be a trustee"}
          </Txt>
          <Txt size={17} lh={1.5} color={colors.sub}>
            You&apos;ll check risky payments before they go out. You can&apos;t touch their money.
          </Txt>
        </View>
      </View>
      <View style={{ gap: 8 }}>
        {error && (
          <Txt size={14} lh={1.5} color={colors.accFg} accessibilityRole="alert">
            {error}
          </Txt>
        )}
        {/* Accepting flips the route guard to profile setup. */}
        <Button label={busy ? 'Setting up…' : 'Accept'} disabled={busy} onPress={() => void accept()} />
        <Button
          label="Not now"
          variant="ghost"
          height={48}
          size={16}
          disabled={busy}
          onPress={() => {
            if (!isDemo) useStore.setState({ inviteToken: null });
            void signOut();
          }}
        />
      </View>
    </Screen>
  );
}
