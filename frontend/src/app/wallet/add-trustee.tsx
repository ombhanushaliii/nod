import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Label, Screen, StepBars, TextField, Txt } from '@/components';
import { isValidContact } from '@/data/engine';
import { useStore } from '@/data/store';
import { useInviteTrustee } from '@/hooks/api';
import { isDemo } from '@/wallet/config';
import { haptic } from '@/lib/haptics';
import { colors } from '@/theme';

/** Sign-up step 2: the trustee is required (docs D7). */
export default function AddTrustee() {
  const saved = useStore((s) => s.trusteeContact);
  const invite = useInviteTrustee();
  const [contact, setContact] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Live invites go by email only.
  const ok = isDemo ? isValidContact(contact.trim()) : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact.trim());

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await invite(contact);
      haptic('success');
      router.push('/wallet/ready');
    } catch (err) {
      haptic('error');
      setError(err instanceof Error ? err.message : 'The invite could not be sent. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen keyboard>
      <StepBars step={2} />
      <View style={{ gap: 8, paddingTop: 18, paddingBottom: 24 }}>
        <Label color={colors.accFg}>STEP 2 OF 2</Label>
        <Txt size={30} w={800} ls={-0.03} lh={1.1}>
          Add a trustee
        </Txt>
        <Txt size={17} lh={1.5} color={colors.sub}>
          Someone you trust, like a parent or friend. They check risky payments before they go out.
        </Txt>
      </View>
      <TextField
        value={contact}
        onChangeText={setContact}
        placeholder="Their email address"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        returnKeyType="send"
        onSubmitEditing={() => ok && void send()}
      />
      <Txt size={14} lh={1.5} color={colors.sub} style={{ paddingTop: 12, paddingHorizontal: 4 }}>
        They can&apos;t touch your money. This step is required.
      </Txt>
      {error && (
        <Txt size={14} color={colors.accFg} accessibilityRole="alert" style={{ paddingTop: 12, paddingHorizontal: 4 }}>
          {error}
        </Txt>
      )}
      <View style={{ flex: 1 }} />
      <Button label={busy ? 'Sending…' : 'Send invite'} disabled={!ok || busy} onPress={() => void send()} />
    </Screen>
  );
}
