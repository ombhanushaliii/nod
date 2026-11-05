import { useEffect, useState } from 'react';
import { Animated, Easing, type StyleProp, View, type ViewStyle } from 'react-native';

import { colors } from '@/theme';
import { Txt } from './Txt';

// The prototype's keyframes (pop, pulse, rowIn, spin), rebuilt with Animated.

const popEase = Easing.bezier(0.3, 1.4, 0.5, 1);

export function Pop({ children, delay = 0, duration = 550, style }: { children: React.ReactNode; delay?: number; duration?: number; style?: StyleProp<ViewStyle> }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration, delay, easing: popEase, useNativeDriver: true }).start();
  }, [v, delay, duration]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
        },
      ]}>
      {children}
    </Animated.View>
  );
}

export function FadeInRow({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [v]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

export function Spinner({ size = 56 }: { size?: number }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View
      accessibilityLabel="Loading"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 4,
        borderColor: colors.accBg,
        borderTopColor: colors.acc,
        transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
      }}
    />
  );
}

type IconCircleProps = {
  icon: React.ReactNode;
  bg: string;
  fg: string;
  size?: number;
  fontSize?: number;
  /** pop: springs in once. pulse: soft orange ring keeps breathing (waiting states). */
  anim?: 'pop' | 'pulse' | 'none';
  /** The pale 10px halo the prototype puts around status icons. */
  halo?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Big round status icon used on result screens (✓, !, $10, ◷, •••). */
export function IconCircle({ icon, bg, fg, size = 88, fontSize = 36, anim = 'pop', halo, style }: IconCircleProps) {
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (anim !== 'pulse') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, pulse]);

  const body = (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {halo && (
        <View
          style={{
            position: 'absolute',
            width: size + 20,
            height: size + 20,
            borderRadius: (size + 20) / 2,
            backgroundColor: 'rgba(220,231,234,0.35)',
          }}
        />
      )}
      {anim === 'pulse' && (
        <Animated.View
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: 'rgba(229,91,0,0.3)',
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, (size + 32) / size] }) }],
          }}
        />
      )}
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        {typeof icon === 'string' ? (
          <Txt size={fontSize} w={800} color={fg} tabular>
            {icon}
          </Txt>
        ) : (
          icon
        )}
      </View>
    </View>
  );

  return anim === 'pop' ? <Pop style={style}>{body}</Pop> : <View style={style}>{body}</View>;
}
