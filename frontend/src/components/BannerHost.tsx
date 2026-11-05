import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '@/data/store';
import { haptic } from '@/lib/haptics';
import { colors } from '@/theme';
import { Txt } from './Txt';

/**
 * In-app notification banner (the prototype's push notification look).
 * Banners are kept per role, so on a single demo phone the trustee sees the alert
 * for a new request when they sign in, and the user sees "Sam said yes" when they do.
 * With the real backend this is where an Expo push for the current role would show.
 */
export function BannerHost() {
  const role = useStore((s) => s.session?.role ?? null);
  const banner = useStore((s) => (role ? s.banners[role] : null));
  const clear = useStore((s) => s.clearBanner);
  const insets = useSafeAreaInsets();
  const [v] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!banner || !role) return;
    haptic(role === 'trustee' ? 'heavy' : 'medium');
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 450, easing: Easing.bezier(0.2, 0.9, 0.3, 1.1), useNativeDriver: true }).start();
    const t = setTimeout(() => clear(role), role === 'trustee' ? 6000 : 5000);
    return () => clearTimeout(t);
  }, [banner, role, v, clear]);

  if (!banner || !role) return null;

  const onPress = () => {
    clear(role);
    if (role === 'trustee') router.push(banner.reqId ? `/trustee/request/${banner.reqId}` : '/trustee');
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { top: insets.top + 6, opacity: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }), transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-140, 0] }) }] },
      ]}>
      <Pressable onPress={onPress} accessibilityRole="alert" accessibilityLabel={`${banner.title}. ${banner.body}`} style={styles.banner}>
        <View style={styles.icon}>
          <View style={styles.ring} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt size={13} w={700} numberOfLines={1} style={{ flexShrink: 1 }}>
              {banner.title}
            </Txt>
            <Txt size={13} color={colors.sub}>
              now
            </Txt>
          </View>
          <Txt size={14} color={colors.bannerBody}>
            {banner.body}
          </Txt>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 10, right: 10, zIndex: 45 },
  banner: {
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(246,246,248,0.97)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  icon: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.acc, alignItems: 'center', justifyContent: 'center' },
  ring: { width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: colors.white },
});
