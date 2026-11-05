import { useState } from 'react';
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { haptic } from '@/lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style' | 'children' | 'disabled'> & {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** Dimmed and inert, like the prototype's opacity:.35 buttons (a tap still gives an error buzz). */
  disabled?: boolean;
  /** scale: buttons shrink while pressed. opacity: list rows fade. none: no visual feedback. */
  feedback?: 'scale' | 'opacity' | 'none';
  pressedScale?: number;
  haptics?: boolean;
};

export function Tap({
  style,
  children,
  disabled,
  feedback = 'scale',
  pressedScale = 0.96,
  haptics = true,
  onPress,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  const [scale] = useState(() => new Animated.Value(1));
  const [pressed, setPressed] = useState(false);

  const springTo = (v: number) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 0 }).start();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      {...rest}
      onPressIn={(e) => {
        setPressed(true);
        if (feedback === 'scale' && !disabled) springTo(pressedScale);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        if (feedback === 'scale') springTo(1);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (disabled) {
          if (haptics) haptic('error');
          return;
        }
        if (haptics) haptic('light');
        onPress?.(e);
      }}
      style={[
        style,
        { transform: [{ scale }] },
        feedback === 'opacity' && pressed && { opacity: 0.55 },
        disabled && { opacity: 0.35 },
      ]}>
      {children}
    </AnimatedPressable>
  );
}
