import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppLogo, Button, Screen, Txt } from '@/components';
import type { Role } from '@/data/types';
import { useAuth } from '@/hooks/api';
import { colors } from '@/theme';

export function WalletLogin() {
  const params = useLocalSearchParams<{ as?: string }>();
  const [role, setRole] = useState<Role>(params.as === 'trustee' ? 'trustee' : 'user');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const auth = useAuth();
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await action(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.'); }
    finally { setBusy(false); }
  };
  return <Screen>
    <View style={{ flex: 1, justifyContent: 'center', gap: 20 }}>
      <AppLogo />
      <Txt size={40} w={800} ls={-0.035} lh={1.05}>{role === 'user' ? 'Money, with\na safety net.' : 'Look out for\nsomeone you love.'}</Txt>
      <Txt size={17} color={colors.sub}>Sign in to connect your secure wallet.</Txt>
      {(error || auth.error) && <Txt size={15} color={colors.accFg} accessibilityRole="alert">{error || auth.error}</Txt>}
    </View>
    <View style={{ gap: 12 }}>
      <Button label={busy ? 'Connecting…' : 'Continue with Google'} variant="dark" disabled={busy || !auth.ready || !!auth.error} onPress={() => void run(() => auth.signIn(role))} />
      <Button label={role === 'user' ? 'I was invited as a trustee' : 'Back to wallet sign-in'} variant="ghost" disabled={busy}
        onPress={() => setRole(role === 'user' ? 'trustee' : 'user')} />
      <Txt align="center" size={13} color={colors.sub}>No passwords or secret words to remember.</Txt>
    </View>
  </Screen>;
}
