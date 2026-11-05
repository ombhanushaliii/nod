import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { AppLogo, Button, Screen, Txt } from '@/components';
import type { Role } from '@/data/types';
import { useAuth } from '@/hooks/api';
import { colors } from '@/theme';

export function WalletLogin() {
  const params = useLocalSearchParams<{ as?: string }>();
  const [role, setRole] = useState<Role>(params.as === 'trustee' ? 'trustee' : 'user');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
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
  const inputStyle = { backgroundColor: colors.white, borderRadius: 16, padding: 16, color: colors.ink, fontSize: 17 };
  return <Screen>
    <View style={{ flex: 1, justifyContent: 'center', gap: 20 }}>
      <AppLogo />
      <Txt size={40} w={800} ls={-0.035} lh={1.05}>{role === 'user' ? 'Money, with\na safety net.' : 'Look out for\nsomeone you love.'}</Txt>
      <Txt size={17} color={colors.sub}>Sign in to connect your secure wallet.</Txt>
      {(error || auth.error) && <Txt size={15} color={colors.accFg} accessibilityRole="alert">{error || auth.error}</Txt>}
    </View>
    <View style={{ gap: 12 }}>
      <Button label={busy ? 'Connecting…' : 'Continue with Google'} variant="dark" disabled={busy || !auth.ready || !!auth.error} onPress={() => void run(() => auth.signIn(role))} />
      <Txt align="center" size={13} color={colors.sub}>or use your phone number</Txt>
      <TextInput accessibilityLabel="Phone number with country code" placeholder="+91 9876543210" placeholderTextColor={colors.sub}
        keyboardType="phone-pad" autoComplete="tel" editable={!busy && !codeSent} value={phone}
        onChangeText={(v) => setPhone(v.replace(/\s/g, ''))} style={inputStyle} />
      {codeSent && <TextInput accessibilityLabel="Verification code" placeholder="Verification code" placeholderTextColor={colors.sub}
        keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" value={code} onChangeText={setCode} style={inputStyle} />}
      <Button label={codeSent ? 'Verify and sign in' : 'Send verification code'} variant="soft" disabled={busy || !phone || !auth.ready || !!auth.error}
        onPress={() => void run(async () => {
          if (codeSent) await auth.verifyPhoneCode(role, phone, code);
          else { await auth.sendPhoneCode(role, phone); setCodeSent(true); }
        })} />
      {codeSent && <Button label="Use another number or resend" variant="ghost" disabled={busy} onPress={() => { setCodeSent(false); setCode(''); }} />}
      <Button label={role === 'user' ? 'I was invited as a trustee' : 'Back to wallet sign-in'} variant="ghost" disabled={busy}
        onPress={() => setRole(role === 'user' ? 'trustee' : 'user')} />
    </View>
  </Screen>;
}
