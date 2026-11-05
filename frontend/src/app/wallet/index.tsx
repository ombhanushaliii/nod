import { Redirect } from 'expo-router';

import { Button, Screen, Txt } from '@/components';
import { useStore } from '@/data/store';
import { useAuth } from '@/hooks/api';

export default function WalletIndex() {
  const onboarded = useStore((s) => s.onboarded);
  if (!onboarded) return <Redirect href="/wallet/welcome" />;
  return <Home />;
}

function Home() {
  const { user, signOut } = useAuth();
  return (
    <Screen style={{ justifyContent: 'center', gap: 16 }}>
      <Txt size={28} w={800}>
        @{user?.username}
      </Txt>
      <Button label="Sign out" variant="soft" onPress={() => void signOut()} />
    </Screen>
  );
}
