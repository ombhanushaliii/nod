import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppLogo, Chip, GoogleG, Screen, Sheet, Tap, Txt } from '@/components';
import { trusteeNameFrom } from '@/data/engine';
import { DEMO_USER_EMAIL, useStore } from '@/data/store';
import type { Role } from '@/data/types';
import { useAuth } from '@/hooks/api';
import { haptic } from '@/lib/haptics';
import { colors, type Tone } from '@/theme';
import { isDemo } from '@/wallet/config';
import { WalletLogin } from '@/wallet/WalletLogin';

type Account = { role: Role; name: string; email: string; chip: string; tone: Tone; enabled: boolean };

export default function Login() {
  return isDemo ? <DemoLogin /> : <WalletLogin />;
}

function DemoLogin() {
  const params = useLocalSearchParams<{ as?: string }>();
  const [mode, setMode] = useState<Role>(params.as === 'trustee' ? 'trustee' : 'user');
  const [choosing, setChoosing] = useState(false);
  const { signIn } = useAuth();
  const username = useStore((s) => s.username);
  const contact = useStore((s) => s.trusteeContact);
  const status = useStore((s) => s.trusteeStatus);
  const tDisplayName = useStore((s) => s.tDisplayName);

  const tn = trusteeNameFrom(tDisplayName, contact);
  const accounts: Account[] = [
    { role: 'user', name: 'Alex Rivera', email: DEMO_USER_EMAIL, chip: 'Wallet', tone: 'acc', enabled: true },
    {
      role: 'trustee',
      name: status === 'none' ? 'Trustee' : tn,
      email: contact || 'Invite needed',
      chip: status === 'none' ? 'No invite yet' : status === 'pending' ? 'Invited' : 'Trustee',
      tone: status === 'none' ? 'gray' : status === 'pending' ? 'amber' : 'green',
      enabled: status !== 'none',
    },
  ];

  const trusteeMsg =
    status === 'none'
      ? 'No invites yet. Finish signing up on the wallet account first.'
      : status === 'pending'
        ? `@${username} invited you to be their trustee. Sign in with ${contact}.`
        : 'Welcome back.';

  const pick = (a: Account) => {
    if (!a.enabled) return haptic('error');
    haptic('success');
    setChoosing(false);
    void signIn(a.role, a.email);
  };

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: 22 }}>
        <AppLogo />
        <View style={{ gap: 12 }}>
          <Txt size={40} w={800} ls={-0.035} lh={1.05}>
            {mode === 'user' ? 'Money, with\na safety net.' : 'Look out for\nsomeone you love.'}
          </Txt>
          <Txt size={17} lh={1.5} color={colors.sub}>
            {mode === 'user' ? 'A simple wallet with someone you trust looking out for you.' : trusteeMsg}
          </Txt>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <Tap onPress={() => setChoosing(true)} pressedScale={0.97} style={styles.google} accessibilityLabel="Continue with Google">
          <View style={styles.gTile}>
            <GoogleG />
          </View>
          <Txt size={17} w={700} color={colors.white} align="center" style={{ flex: 1, marginRight: 42 }}>
            Continue with Google
          </Txt>
        </Tap>
        {mode === 'user' && (
          <Txt size={13} lh={1.45} color={colors.sub} align="center" style={{ paddingTop: 8, paddingHorizontal: 12 }}>
            No passwords or secret words to remember.
          </Txt>
        )}
        <Tap feedback="opacity" haptics={false} onPress={() => setMode(mode === 'user' ? 'trustee' : 'user')} style={{ paddingVertical: 10, alignItems: 'center' }}>
          <Txt size={14} w={700} color={colors.accFg}>
            {mode === 'user' ? 'Were you invited to be a trustee?' : 'Back to wallet sign-in'}
          </Txt>
        </Tap>
      </View>

      <Sheet visible={choosing} onClose={() => setChoosing(false)} gap={14}>
        <View style={{ gap: 6, paddingTop: 6 }}>
          <Txt size={22} w={800} ls={-0.025}>
            Choose an account
          </Txt>
          <Txt size={15} color={colors.sub}>
            to continue to Nod. The account decides which app you see.
          </Txt>
        </View>
        <View style={{ gap: 8 }}>
          {accounts.map((a) => (
            <Tap
              key={a.role}
              feedback="opacity"
              haptics={false}
              onPress={() => pick(a)}
              accessibilityLabel={`${a.name}, ${a.email}`}
              style={[styles.account, !a.enabled && { opacity: 0.45 }]}>
              <View style={[styles.initial, { backgroundColor: a.role === 'user' ? colors.accBg : colors.soft }]}>
                <Txt size={15} w={800} color={a.role === 'user' ? colors.avatarFg : colors.softInk}>
                  {a.name[0]}
                </Txt>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Txt size={15} w={700} numberOfLines={1}>
                  {a.name}
                </Txt>
                <Txt size={13} color={colors.sub} numberOfLines={1}>
                  {a.email}
                </Txt>
              </View>
              <Chip label={a.chip} tone={a.tone} />
            </Tap>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 4 }}>
          <GoogleG size={14} />
          <Txt size={13} color={colors.sub}>
            Demo sign-in. No real Google account is used.
          </Txt>
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  google: {
    height: 58,
    borderRadius: 18,
    backgroundColor: colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 8,
    paddingRight: 20,
    shadowColor: colors.ink,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  gTile: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  account: { borderRadius: 18, backgroundColor: colors.bg, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  initial: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
