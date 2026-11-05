import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme';
import { Tap } from './Tap';

export const AVATAR_COUNT = 8;

/**
 * The prototype's 8 avatars are CSS gradients (radial, conic, repeating stripes).
 * React Native can't paint those, so each one is redrawn here as SVG shapes.
 */
function art(i: number, s: number) {
  const c = s / 2;
  switch (i) {
    case 0:
      return (
        <>
          <Rect width={s} height={s} fill="#EF6C22" />
          <Circle cx={0.34 * s} cy={0.34 * s} r={0.19 * s} fill="#fff" />
        </>
      );
    case 1:
      return (
        <>
          <Rect width={s} height={s} fill="#ffd9b8" />
          <Path d={`M${s} 0 L${s} ${s} L0 ${s} Z`} fill="#DF500C" />
        </>
      );
    case 2: {
      // repeating-radial-gradient: 5px navy / 5px peach rings from the center.
      const rings = [];
      for (let k = Math.ceil((c * Math.SQRT2) / 5); k >= 1; k--) {
        rings.push(<Circle key={k} cx={c} cy={c} r={k * 5} fill={k % 2 ? '#23304d' : '#ffb27a'} />);
      }
      return rings;
    }
    case 3: {
      // repeating-linear-gradient(45deg): 5px diagonal stripes.
      const lines = [];
      const step = 10 * Math.SQRT2;
      for (let x = -s - 10; x <= s + 10; x += step) {
        lines.push(<Line key={x} x1={x - 10} y1={-10} x2={x + s + 10} y2={s + 10} stroke="#5fa38f" strokeWidth={5} />);
      }
      return (
        <>
          <Rect width={s} height={s} fill="#dff0ea" />
          {lines}
        </>
      );
    }
    case 4:
      return (
        <>
          <Rect width={s} height={s} fill="#3d5a80" />
          <Circle cx={c} cy={s} r={0.47 * s} fill="#ffcc4d" />
        </>
      );
    case 5: {
      // Polka dots on an 11px grid.
      const dots = [];
      for (let x = 5.5; x < s + 5.5; x += 11) {
        for (let y = 5.5; y < s + 5.5; y += 11) dots.push(<Circle key={`${x}-${y}`} cx={x} cy={y} r={1.8} fill="#fff" />);
      }
      return (
        <>
          <Rect width={s} height={s} fill="#9b7ede" />
          {dots}
        </>
      );
    }
    case 6:
      return (
        <>
          <Rect x={c} y={0} width={c} height={c} fill="#ef6f5e" />
          <Rect x={c} y={c} width={c} height={c} fill="#ffd166" />
          <Rect x={0} y={c} width={c} height={c} fill="#4cc9a0" />
          <Rect x={0} y={0} width={c} height={c} fill="#4a90c8" />
        </>
      );
    default:
      return (
        <>
          <Rect width={s} height={s} fill="#2b2d42" />
          <Circle cx={c} cy={c} r={0.283 * s} fill="#f1ede4" />
          <Circle cx={0.64 * s} cy={0.38 * s} r={0.25 * s} fill="#2b2d42" />
        </>
      );
  }
}

export function Avatar({ index, size }: { index: number; size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: colors.accBg }}>
      <Svg width={size} height={size}>
        {art(((index % AVATAR_COUNT) + AVATAR_COUNT) % AVATAR_COUNT, size)}
      </Svg>
    </View>
  );
}

/** Avatar with the white gap + thin outer ring the prototype draws with box-shadow. */
export function RingedAvatar({ index, size, ring = '#e6e6ea', gap = 2, width = 1.5 }: { index: number; size: number; ring?: string; gap?: number; width?: number }) {
  const outer = size + 2 * (gap + width);
  return (
    <View
      style={{
        width: outer,
        height: outer,
        borderRadius: outer / 2,
        borderWidth: width,
        borderColor: ring,
        backgroundColor: colors.white,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Avatar index={index} size={size} />
    </View>
  );
}

/** 4-column picker that sizes itself to its width. The chosen avatar gets the orange ring. */
export function AvatarPicker({ value, onChange }: { value: number; onChange: (i: number) => void }) {
  const [width, setWidth] = useState(0);
  const cell = Math.floor((width - 3 * 14) / 4);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {cell > 0 &&
        Array.from({ length: AVATAR_COUNT }, (_, i) => (
        <Tap
          key={i}
          accessibilityLabel={`Avatar ${i + 1}`}
          accessibilityState={{ selected: value === i }}
          onPress={() => onChange(i)}
          style={{
            width: cell,
            height: cell,
            borderRadius: cell / 2,
            borderWidth: 2.5,
            borderColor: value === i ? colors.acc : 'transparent',
            padding: 3,
            backgroundColor: colors.white,
          }}>
          <Avatar index={i} size={cell - 11} />
        </Tap>
        ))}
    </View>
  );
}
