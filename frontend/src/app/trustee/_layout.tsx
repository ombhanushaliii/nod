import { Stack } from 'expo-router';

import { trusteeSide, useStore } from '@/data/store';
import { usePushRegistration } from '@/hooks/api';
import { useTrusteeSync } from '@/hooks/trustee';
import { colors } from '@/theme';

export default function TrusteeLayout() {
  const status = useStore(trusteeSide);
  const hasName = useStore((s) => !!s.tDisplayName);
  useTrusteeSync();
  usePushRegistration(status === 'active');
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      {/* Home routes to the invite or profile setup until the trustee is set up. */}
      <Stack.Screen name="index" />
      <Stack.Protected guard={status === 'pending'}>
        <Stack.Screen name="invite" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'active' && !hasName}>
        <Stack.Screen name="profile" options={{ gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={status === 'active' && hasName}>
        <Stack.Screen name="person/[id]" />
        <Stack.Screen name="request/[id]" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="reported" />
        <Stack.Screen name="check" />
      </Stack.Protected>
    </Stack>
  );
}
