import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { BannerHost } from '@/components';
import { useHydrated } from '@/data/clock';
import { useStore } from '@/data/store';
import { colors } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });
  const hydrated = useHydrated();
  const role = useStore((s) => s.session?.role ?? null);
  const ready = (fontsLoaded || !!fontError) && hydrated;

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
    </>
  );
}
