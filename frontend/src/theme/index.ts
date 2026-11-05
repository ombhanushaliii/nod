// Design tokens from Wallet Prototype v3. oklch() values are converted to sRGB hex,
// since React Native can't parse oklch.

export const colors = {
  bg: '#F7F6F2',
  ink: '#25282B',
  sub: '#6e6e73',
  faint: '#a3a3aa',
  line: '#ECE9E2',
  inputRing: '#E6E2D8',
  white: '#FFFFFF',
  acc: '#E55B00',
  accFg: '#C14900', // oklch(0.56 0.17 45)
  accBg: '#FFECDC', // oklch(0.96 0.035 55)
  accSoft: '#FFE8D6', // oklch(0.95 0.04 55)
  avatarFg: '#A93800', // oklch(0.5 0.16 42)
  soft: '#DCE7EA',
  softInk: '#2F4A52',
  pressed: '#ECEAE3',
  brown: '#6b4a33',
  chevron: '#c4c4ca',
  handle: '#d9d9de',
  stepOff: '#e8e8ec',
  dot: '#d0d0d6',
  bannerBody: '#3a3a3f',
  note: '#55555b',
} as const;

export const tones = {
  green: { bg: '#DCE7EA', fg: '#2F4A52' },
  amber: { bg: '#FFF1CC', fg: '#7B5100' }, // oklch(0.96 0.05 90) / oklch(0.47 0.1 75)
  red: { bg: '#FFEAE9', fg: '#C51B32' }, // oklch(0.96 0.03 20) / oklch(0.53 0.2 22)
  gray: { bg: '#ececf0', fg: '#55555b' },
  acc: { bg: '#FFECDC', fg: '#C14900' },
  info: { bg: '#DCE7EA', fg: '#55555b' },
  plain: { bg: '#DCE7EA', fg: '#25282B' },
} as const;

export type Tone = keyof typeof tones;

export const font = {
  400: 'Manrope_400Regular',
  500: 'Manrope_500Medium',
  600: 'Manrope_600SemiBold',
  700: 'Manrope_700Bold',
  800: 'Manrope_800ExtraBold',
} as const;

export type Weight = keyof typeof font;
