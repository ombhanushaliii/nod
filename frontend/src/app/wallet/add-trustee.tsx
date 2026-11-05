import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Label, Screen, StepBars, TextField, Txt } from '@/components';
import { isValidContact } from '@/data/engine';
import { useStore } from '@/data/store';
import { haptic } from '@/lib/haptics';
import { colors } from '@/theme';

/** Sign-up step 2: the trustee is required (docs D7). */
export default function AddTrustee() {
  const saved = useStore((s) => s.trusteeContact);
  const invite = useStore((s) => s.invite);
  const [contact, setContact] = useState(saved);
  const ok = isValidContact(contact.trim());

  const send = () => {
    haptic('success');
    invite(contact);
    router.push('/wallet/ready');
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
        onSubmitEditing={() => ok && send()}
      />
      <Txt size={14} lh={1.5} color={colors.sub} style={{ paddingTop: 12, paddingHorizontal: 4 }}>
        They can&apos;t touch your money. This step is required.
      </Txt>
      <View style={{ flex: 1 }} />
      <Button label="Send invite" disabled={!ok} onPress={send} />
    </Screen>
  );
}
