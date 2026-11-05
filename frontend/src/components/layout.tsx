import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type StyleProp,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { colors, font, tones, type Tone } from '@/theme';
import { Tap } from './Tap';
import { Txt } from './Txt';

type ScreenProps = {
  children: React.ReactNode;
  /** Side padding: 24 on hero/result screens, 20 on form screens (matches the prototype). */
  padH?: number;
  style?: StyleProp<ViewStyle>;
  /** Lift content above the keyboard (screens with text inputs). */
  keyboard?: boolean;
};

/** Full-screen page with safe-area padding. Content is laid out top-to-bottom like the prototype's flex columns. */
export function Screen({ children, padH = 24, style, keyboard }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const body = (
    <View
      style={[
        { flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) + 8, paddingHorizontal: padH },
        style,
      ]}>
      {children}
    </View>
  );
  if (!keyboard) return body;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {body}
    </KeyboardAvoidingView>
  );
}

/** Scrolling page (home, settings, person): fixed top bar slot, scrolling body. */
export function ScrollScreen({ children, top, contentStyle }: { children: React.ReactNode; top?: React.ReactNode; contentStyle?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      {top}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 40, gap: 22 }, contentStyle]}>
        {children}
      </ScrollView>
    </View>
  );
}

export function BackButton({ onPress, label = 'Back' }: { onPress: () => void; label?: string }) {
  return (
    <Tap onPress={onPress} accessibilityLabel={label} pressedScale={0.9} hitSlop={8} style={styles.back}>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M15 5l-7 7 7 7" />
      </Svg>
    </Tap>
  );
}

/** The 48px row that holds the round back button, with an optional right-side slot. */
export function NavRow({ onBack, backLabel, right, title, style }: { onBack: () => void; backLabel?: string; right?: React.ReactNode; title?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.navRow, style]}>
      <BackButton onPress={onBack} label={backLabel} />
      {title ? (
        <Txt size={15} w={700} color={colors.sub} style={{ marginLeft: 12, marginRight: 'auto' }}>
          {title}
        </Txt>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {right}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Key/value line inside a card: "Payment … $25 to Ari". */
export function KV({ k, v, last, size = 16, kColor = colors.sub }: { k: string; v: React.ReactNode; last?: boolean; size?: number; kColor?: string }) {
  return (
    <View style={[styles.kv, !last && styles.divider]}>
      <Txt size={size} color={kColor}>
        {k}
      </Txt>
      {typeof v === 'string' ? (
        <Txt size={size} w={700} tabular numberOfLines={1} style={{ flexShrink: 1, textAlign: 'right' }}>
          {v}
        </Txt>
      ) : (
        v
      )}
    </View>
  );
}

export function Chip({ label, tone, size = 12 }: { label: string; tone: Tone; size?: number }) {
  const t = tones[tone];
  return (
    <View style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, backgroundColor: t.bg, flexShrink: 0 }}>
      <Txt size={size} w={700} color={t.fg} tabular numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

/** Uppercase reason tag: VERIFIED, LOOK-ALIKE, LIMIT, ... */
export function Tag({ label, tone }: { label: string; tone: Tone }) {
  const t = tones[tone];
  return (
    <View style={{ paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, backgroundColor: t.bg, flexShrink: 0 }}>
      <Txt size={11} w={800} ls={0.03} color={t.fg}>
        {label}
      </Txt>
    </View>
  );
}

export function StepBars({ step, total = 2 }: { step: number; total?: number }) {
  return (
    <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < step ? colors.acc : colors.stepOff }} />
      ))}
    </View>
  );
}

/** Haven mark: orange rounded tile with a white ring. */
export function AppLogo({ size = 64 }: { size?: number }) {
  const ring = size * 0.40625;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3125, backgroundColor: colors.acc, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: ring, height: ring, borderRadius: ring / 2, borderWidth: ring * 0.19, borderColor: colors.white }} />
    </View>
  );
}

export function GoogleG({ size = 19 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <Path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </Svg>
  );
}

/** White rounded input with the hairline inner border. */
export function TextField({ style, size = 17, ...rest }: TextInputProps & { size?: number }) {
  return (
    <TextInput
      placeholderTextColor={colors.faint}
      autoCorrect={false}
      maxFontSizeMultiplier={1.3}
      {...rest}
      style={[styles.input, { fontSize: size }, style]}
    />
  );
}

/** Info "i" in a small circle, used on the amount hint pill. */
export function InfoDot({ color, glyph = 'i', size = 17 }: { color: string; glyph?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Txt size={size * 0.6} w={800} color={color} style={{ lineHeight: size * 0.75 }}>
        {glyph}
      </Txt>
    </View>
  );
}

export const styles = StyleSheet.create({
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  navRow: { height: 48, flexDirection: 'row', alignItems: 'center' },
  card: { borderRadius: 20, backgroundColor: colors.white, paddingHorizontal: 16 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  input: {
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.inputRing,
    paddingHorizontal: 16,
    fontFamily: font[600],
    color: colors.ink,
  },
});

