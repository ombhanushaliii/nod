import { Stack } from 'expo-router';

import { useStore } from '@/data/store';
import { colors } from '@/theme';

/** Screens you shouldn't swipe back into: a finished check or a result. */
const noSwipe = { gestureEnabled: false } as const;

export default function WalletLayout() {
  const onboarded = useStore((s) => s.onboarded);
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      {/* Home sends new users into sign-up (avatar → trustee invite → waiting). */}
      <Stack.Screen name="index" />
      <Stack.Protected guard={!onboarded}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="add-trustee" />
        <Stack.Screen name="ready" options={noSwipe} />
      </Stack.Protected>
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="send" />
        <Stack.Screen name="amount" />
        <Stack.Screen name="checking" options={{ ...noSwipe, animation: 'fade' }} />
        <Stack.Screen name="review" />
        <Stack.Screen name="sent" options={noSwipe} />
        <Stack.Screen name="refused" />
        <Stack.Screen name="cooldown" options={noSwipe} />
        <Stack.Screen name="flagged" />
        <Stack.Screen name="questions" />
        <Stack.Screen name="waiting" options={noSwipe} />
      </Stack.Protected>
    </Stack>
  );
}
