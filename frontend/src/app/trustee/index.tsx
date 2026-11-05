import { Button, Screen, Txt } from '@/components';
import { useAuth } from '@/hooks/api';

export default function TrusteeHome() {
  const { session, signOut } = useAuth();
  return (
    <Screen style={{ justifyContent: 'center', gap: 16 }}>
      <Txt size={28} w={800}>
        Trustee · {session?.email}
      </Txt>
      <Button label="Sign out" variant="soft" onPress={() => void signOut()} />
    </Screen>
  );
}
