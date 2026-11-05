import { useEffect, useRef, useState } from 'react';
import { Animated, type GestureResponderEvent, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Mask, Path, Rect, Text as SvgText } from 'react-native-svg';

import { haptic } from '@/lib/haptics';
import { colors, font } from '@/theme';

const BRUSH = 40;
const CELL = 14;

/**
 * Scratch-off cover for the wallet key (the prototype draws this on a canvas).
 * Strokes are cut out of an SVG mask; once about half the card is cleared it fades away.
 */
export function ScratchCard({ onDone }: { onDone: () => void }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [path, setPath] = useState('');
  const [fade] = useState(() => new Animated.Value(1));
  const cleared = useRef(new Set<string>());
  const done = useRef(false);
  const moves = useRef(0);
  const sizeRef = useRef(size);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const mark = (x: number, y: number) => {
    const r = BRUSH / 2;
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
      for (let cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r) / CELL); cy++) {
        const mx = cx * CELL + CELL / 2;
        const my = cy * CELL + CELL / 2;
        if ((mx - x) ** 2 + (my - y) ** 2 <= r * r) cleared.current.add(`${cx}:${cy}`);
      }
    }
  };

  // Count coverage along the whole stroke, not just the sampled touch points:
  // a fast swipe only reports a few points, but the drawn line covers everything between them.
  const last = useRef<{ x: number; y: number } | null>(null);
  const markTo = (x: number, y: number) => {
    const from = last.current ?? { x, y };
    const steps = Math.max(1, Math.ceil(Math.hypot(x - from.x, y - from.y) / (CELL / 2)));
    for (let i = 1; i <= steps; i++) mark(from.x + ((x - from.x) * i) / steps, from.y + ((y - from.y) * i) / steps);
    last.current = { x, y };
  };

  const check = () => {
    const { w, h } = sizeRef.current;
    if (done.current || !w || !h) return;
    const total = Math.ceil(w / CELL) * Math.ceil(h / CELL);
    let inside = 0;
    cleared.current.forEach((k) => {
      const [cx, cy] = k.split(':').map(Number);
      if (cx >= 0 && cy >= 0 && cx * CELL < w && cy * CELL < h) inside++;
    });
    if (inside / total > 0.5) {
      done.current = true;
      haptic('success');
      Animated.timing(fade, { toValue: 0, duration: 420, useNativeDriver: true }).start(() => onDoneRef.current());
    }
  };

  // Plain responder props (event handlers), so nothing reads the refs during render.
  const onGrant = (e: GestureResponderEvent) => {
    const { locationX: x, locationY: y } = e.nativeEvent;
    last.current = null;
    markTo(x, y);
    setPath((p) => `${p} M${x.toFixed(1)} ${y.toFixed(1)} L${(x + 0.1).toFixed(1)} ${y.toFixed(1)}`);
  };
  const onMove = (e: GestureResponderEvent) => {
    const { locationX: x, locationY: y } = e.nativeEvent;
    markTo(x, y);
    setPath((p) => `${p} L${x.toFixed(1)} ${y.toFixed(1)}`);
    moves.current++;
    if (moves.current % 6 === 0) check();
    if (moves.current % 9 === 0) haptic('selection');
  };

  const { w, h } = size;
  const dots = [];
  for (let x = 8; x < w; x += 14) for (let y = 8; y < h; y += 14) dots.push(<Circle key={`${x}-${y}`} cx={x} cy={y} r={1.6} fill="rgba(255,255,255,0.14)" />);

  return (
    <Animated.View
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={onGrant}
      onResponderMove={onMove}
      onResponderRelease={check}
      onResponderTerminate={check}
      onLayout={(e) => {
        const next = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
        sizeRef.current = next;
        setSize(next);
      }}
      accessibilityLabel="Scratch to reveal your key"
      style={[StyleSheet.absoluteFill, { borderRadius: 22, overflow: 'hidden', opacity: fade, transform: [{ scale: fade.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1] }) }] }]}>
      {w > 0 && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Svg width={w} height={h}>
            <Defs>
              <Mask id="scratch" x={0} y={0} width={w} height={h} maskUnits="userSpaceOnUse">
                <Rect width={w} height={h} fill="#fff" />
                <Path d={path || 'M0 0'} stroke="#000" strokeWidth={BRUSH} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </Mask>
            </Defs>
            <G mask="url(#scratch)">
              <Rect width={w} height={h} fill={colors.acc} />
              {dots}
              <SvgText x={w / 2} y={h / 2 - 4} fill="#fff" fontSize={21} fontFamily={font[800]} fontWeight="800" textAnchor="middle">
                Scratch to reveal
              </SvgText>
              <SvgText x={w / 2} y={h / 2 + 20} fill="rgba(255,255,255,0.88)" fontSize={13} fontFamily={font[600]} fontWeight="600" textAnchor="middle">
                Make sure no one is watching
              </SvgText>
            </G>
          </Svg>
        </View>
      )}
    </Animated.View>
  );
}
