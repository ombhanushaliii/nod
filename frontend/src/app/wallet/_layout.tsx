import { Stack } from 'expo-router';

import { useStore } from '@/data/store';
import { colors } from '@/theme';

export default function WalletLayout() {
  const onboarded = useStore((s) => s.onboarded);
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      {/* Home sends new users into sign-up (avatar → trustee invite → waiting). */}
      <Stack.Screen name="index" />
      <Stack.Protected guard={!onboarded}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="add-trustee" />
        <Stack.Screen name="ready" options={{ gestureEnabled: false }} />
      </Stack.Protected>
    </Stack>
  );
}
