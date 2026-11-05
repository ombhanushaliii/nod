import { Text, type TextProps, type TextStyle } from 'react-native';

import { colors, font, type Weight } from '@/theme';

export type TxtProps = TextProps & {
  size?: number;
  w?: Weight;
  color?: string;
  /** Letter spacing in em, like the CSS in the design (-0.03 → -0.03em). */
  ls?: number;
  /** Line height as a multiple of the font size. */
  lh?: number;
  align?: TextStyle['textAlign'];
  tabular?: boolean;
};

export function Txt({ size = 16, w = 400, color = colors.ink, ls, lh, align, tabular, style, ...rest }: TxtProps) {
  return (
    <Text
      maxFontSizeMultiplier={1.3}
      {...rest}
      style={[
        { fontFamily: font[w], fontSize: size, color },
        ls != null && { letterSpacing: ls * size },
        lh != null && { lineHeight: lh * size },
        align != null && { textAlign: align },
        tabular && { fontVariant: ['tabular-nums'] },
        style,
      ]}
    />
  );
}

/** Small uppercase section label: "CHOOSE ONE", "SAFETY", ... */
export function Label({ children, style, color = colors.sub }: { children: React.ReactNode; style?: TextProps['style']; color?: string }) {
  return (
    <Txt size={12} w={800} ls={0.06} color={color} style={style}>
      {children}
    </Txt>
  );
}
