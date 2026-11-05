import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';

import { colors, tones } from '@/theme';
import { Tap } from './Tap';
import { Txt } from './Txt';

export type ButtonVariant = 'primary' | 'dark' | 'soft' | 'danger' | 'ghost' | 'signOut' | 'accSoft';

const VARIANTS: Record<ButtonVariant, { bg: string; fg: string }> = {
  primary: { bg: colors.acc, fg: colors.white },
  dark: { bg: colors.ink, fg: colors.white },
  soft: { bg: colors.soft, fg: colors.ink },
  danger: { bg: tones.red.fg, fg: colors.white },
  ghost: { bg: 'transparent', fg: colors.sub },
  signOut: { bg: colors.white, fg: tones.red.fg },
  accSoft: { bg: colors.accSoft, fg: colors.avatarFg },
};

type Props = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** Overrides the variant's background, for buttons whose color depends on state. */
  bg?: string;
  fg?: string;
  height?: number;
  radius?: number;
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  bg,
  fg,
  height = 56,
  radius = 16,
  size = 17,
  disabled,
  style,
  accessibilityLabel,
}: Props) {
  const v = VARIANTS[variant];
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.base, { height, borderRadius: radius, backgroundColor: bg ?? v.bg }, style]}>
      <Txt size={size} w={variant === 'ghost' ? 600 : 700} color={fg ?? v.fg} numberOfLines={1}>
        {label}
      </Txt>
    </Tap>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
});
