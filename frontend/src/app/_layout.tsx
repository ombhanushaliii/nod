import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';
import * as Linking from 'expo-linking';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AppLock, BannerHost, PrivacyCover, WebFrame } from '@/components';
import { useHydrated } from '@/data/clock';
import { useStore } from '@/data/store';
import { colors } from '@/theme';
import { useAuth } from '@/hooks/api';
import { isDemo } from '@/wallet/config';
import { inviteTokenFrom } from '@/wallet/trustee';
import { WalletProvider } from '@/wallet/WalletProvider';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const hydrated = useHydrated();
  if (!hydrated) return null;
  // Web: every page sits in a phone-width column (WebFrame); native is unchanged.
  return <WebFrame><WalletProvider><AppLayout /></WalletProvider></WebFrame>;
}

/** Keeps the token from an invite link until the trustee signs in and accepts. */
function useInviteLink() {
  const url = Linking.useURL();
  useEffect(() => {
    if (isDemo || !url) return;
    const { hostname, path, queryParams } = Linking.parse(url);
    const token = inviteTokenFrom({ hostname, path }, queryParams?.token);
    if (token) useStore.setState({ inviteToken: token });
  }, [url]);
}

function AppLayout() {
  const [fontsLoaded, fontError] = useFonts({ Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });
  const hydrated = useHydrated();
  const { role, ready: authReady } = useAuth();
  const ready = (fontsLoaded || !!fontError) && hydrated && authReady;
  useInviteLink();

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  // One app, two roles: which account signed in decides which stack is reachable.
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={!role}>
          <Stack.Screen name="login" />
        </Stack.Protected>
        <Stack.Protected guard={role === 'user'}>
          <Stack.Screen name="wallet" />
        </Stack.Protected>
        <Stack.Protected guard={role === 'trustee'}>
          <Stack.Screen name="trustee" />
        </Stack.Protected>
      </Stack>
      <BannerHost />
      <AppLock />
      {/* Last, so it covers everything in the normal view tree. */}
      <PrivacyCover />
    </>
  );
}
