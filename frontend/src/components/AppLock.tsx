import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, Modal, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { trusteeName, useStore } from '@/data/store';
import { haptic } from '@/lib/haptics';
import { colors } from '@/theme';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { AppLogo } from './layout';
import { Txt } from './Txt';

type Method = 'face' | 'finger' | 'passcode';

function methodLabel(m: Method | null) {
  if (m === 'face') return Platform.OS === 'ios' ? 'Face ID' : 'face unlock';
  if (m === 'finger') return Platform.OS === 'ios' ? 'Touch ID' : 'fingerprint';
  return 'your passcode';
}

/** Errors that mean this device can't lock at all, so the wallet opens instead of trapping the user. */
const CANNOT_LOCK = new Set(['not_enrolled', 'passcode_not_set', 'not_available']);

/**
 * Biometric lock on app open. While someone is signed in, the app locks on a cold start and
 * every time it comes back from the background, and asks for Face ID / Touch ID / fingerprint
 * (falling back to the device passcode). The lock sits in a Modal so it also covers open sheets.
 * Skipped on web and on devices with no screen lock set up.
 */
export function AppLock() {
  const signedIn = useStore((s) => !!s.session);
  const [locked, setLocked] = useState(signedIn);
  const [supported, setSupported] = useState<boolean | null>(Platform.OS === 'web' ? false : null);
  const [method, setMethod] = useState<Method | null>(null);
  const authing = useRef(false);
  const startedLocked = useRef(signedIn);
  const appState = useRef<AppStateStatus | string | null | undefined>(AppState.currentState);

  const unlock = useCallback(async () => {
    if (authing.current) return;
    authing.current = true;
    try {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Haven',
        promptSubtitle: 'Confirm it’s you to open your wallet',
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use passcode',
      });
      if (res.success) {
        haptic('success');
        setLocked(false);
      } else if (CANNOT_LOCK.has(res.error)) {
        setLocked(false);
      } else if (res.error !== 'user_cancel' && res.error !== 'app_cancel' && res.error !== 'system_cancel') {
        haptic('error');
      }
    } catch {
      haptic('error');
    } finally {
      authing.current = false;
    }
  }, []);

  // Lock whenever the app goes to the background; ask again when it comes back.
  // Only background → active counts: the Face ID sheet itself makes the app briefly
  // inactive, and re-prompting on that would loop after a cancel.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appState.current;
      appState.current = next;
      if (next === 'background' && useStore.getState().session) setLocked(true);
      if (prev === 'background' && next === 'active' && useStore.getState().session) void unlock();
    });
    return () => sub.remove();
  }, [unlock]);

  // Work out what the device supports, then prompt right away if we started locked (cold start).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    (async () => {
      const level = await LocalAuthentication.getEnrolledLevelAsync();
      if (cancelled) return;
      if (level === LocalAuthentication.SecurityLevel.NONE) return setSupported(false);
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (cancelled) return;
      const enrolledBiometric = level >= LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK;
      setMethod(
        enrolledBiometric && types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
          ? 'face'
          : enrolledBiometric && types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
            ? 'finger'
            : 'passcode',
      );
      setSupported(true);
      if (startedLocked.current && AppState.currentState === 'active') void unlock();
    })().catch(() => setSupported(false));
    return () => {
      cancelled = true;
    };
  }, [unlock]);

  const visible = signedIn && locked && supported !== false;
  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => {}}>
      <LockScreen method={method} onUnlock={() => void unlock()} />
    </Modal>
  );
}

function LockScreen({ method, onUnlock }: { method: Method | null; onUnlock: () => void }) {
  const insets = useSafeAreaInsets();
  const role = useStore((s) => s.session?.role);
  const username = useStore((s) => s.username);
  const userAvatar = useStore((s) => s.userAvatar);
  const trusteeAvatar = useStore((s) => s.trusteeAvatar);
  const tn = useStore(trusteeName);
  const label = methodLabel(method);
  const who = role === 'trustee' ? tn : `@${username}`;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 24, paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
      <View style={{ flex: 1, justifyContent: 'center', gap: 22 }}>
        <View>
          <AppLogo />
          <View style={styles.lockBadge}>
            <LockIcon />
          </View>
        </View>
        <View style={{ gap: 12 }}>
          <Txt size={40} w={800} ls={-0.035} lh={1.05}>
            Haven is{'\n'}locked.
          </Txt>
          <Txt size={17} lh={1.5} color={colors.sub}>
            {role === 'trustee'
              ? `Use ${label} to see requests from the people you look after.`
              : `Use ${label} to open your wallet. Your money stays safe while it’s locked.`}
          </Txt>
        </View>
      </View>
      <View style={{ gap: 14 }}>
        <View style={styles.who}>
          <Avatar index={role === 'trustee' ? trusteeAvatar : userAvatar} size={36} />
          <View style={{ flex: 1, gap: 1 }}>
            <Txt size={15} w={700}>
              {who}
            </Txt>
            <Txt size={13} color={colors.sub}>
              {role === 'trustee' ? 'Trustee' : 'Your wallet'}
            </Txt>
          </View>
        </View>
        <Button label={`Unlock with ${label === 'your passcode' ? 'passcode' : label}`} variant="dark" height={58} radius={18} onPress={onUnlock} />
      </View>
    </View>
  );
}

function LockIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 11h12v9H6z" />
      <Path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  lockBadge: {
    position: 'absolute',
    left: 46,
    top: 46,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.ink,
    borderWidth: 3,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  who: { borderRadius: 18, backgroundColor: colors.white, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
