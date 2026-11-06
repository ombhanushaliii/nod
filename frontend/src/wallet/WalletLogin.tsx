import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppLogo, Button, GoogleG, Screen, Txt } from '@/components';
import { useStore } from '@/data/store';
import { useAuth } from '@/hooks/api';
import { colors } from '@/theme';

/**
 * One sign-in for everyone. The app works out which side to open: an invite
 * link opened on this phone starts on the trustee side; otherwise the wallet
 * side checks for trustee invites after sign-in, and the switcher at the top
 * moves between the two.
 */
export function WalletLogin() {
  const invited = useStore((s) => !!s.inviteToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const auth = useAuth();
  const signIn = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await auth.signIn(invited ? 'trustee' : 'user'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.'); }
    finally { setBusy(false); }
  };
  return <Screen>
    <View style={{ flex: 1, justifyContent: 'center', gap: 20 }}>
      <AppLogo />
      <Txt size={40} w={800} ls={-0.035} lh={1.05}>{invited ? 'Look out for\nsomeone you love.' : 'Money, with\na safety net.'}</Txt>
      <Txt size={17} color={colors.sub}>Sign in to connect your secure wallet.</Txt>
      {(error || auth.error) && <Txt size={15} color={colors.accFg} accessibilityRole="alert">{error || auth.error}</Txt>}
    </View>
    <View style={{ gap: 12 }}>
      <Button
        label={busy ? 'Connecting…' : 'Continue with Google'}
        variant="dark"
        height={58}
        radius={18}
        icon={<View style={styles.gTile}><GoogleG /></View>}
        disabled={busy || !auth.ready || !!auth.error}
        onPress={() => void signIn()}
      />
      <Txt align="center" size={13} color={colors.sub}>No passwords or secret words to remember.</Txt>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  gTile: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
});
