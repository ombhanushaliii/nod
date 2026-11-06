import type { ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaFrameContext, SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { colors } from '@/theme';

// iPhone 17 Pro Max-sized screen, in points, and the bezel drawn around it.
const SCREEN_W = 440;
const SCREEN_H = 956;
const BEZEL = 14;
const DEVICE_W = SCREEN_W + 2 * BEZEL;
const DEVICE_H = SCREEN_H + 2 * BEZEL;
const SCREEN_RADIUS = 56;
// What the app sees as safe areas inside the frame, like on the real phone:
// the status bar / Dynamic Island at the top, the home bar at the bottom.
const INSETS = { top: 59, bottom: 34, left: 0, right: 0 };
const SCREEN_FRAME = { x: 0, y: 0, width: SCREEN_W, height: SCREEN_H };

/** Windows at least this wide show the phone frame; narrower ones (phones) use the whole screen. */
const FRAME_MIN_WIDTH = 700;
const MARGIN = 24;

/** The column narrower screens get. */
export const WEB_MAX_WIDTH = 512;

function useFrame() {
  const { width, height } = useWindowDimensions();
  if (Platform.OS !== 'web' || width < FRAME_MIN_WIDTH) return null;
  // Short windows scale the whole phone down so it always fits.
  const scale = Math.min(1, (height - 2 * MARGIN) / DEVICE_H, (width - 2 * MARGIN) / DEVICE_W);
  return { scale };
}

/**
 * Web only. On wide screens, every page (and every sheet, which renders
 * outside the page) sits inside a drawn phone: an iPhone 17 Pro Max-sized
 * screen with its bezel, Dynamic Island and home bar, on plain white. The app
 * gets that phone's safe areas, so nothing hides under the island. Narrower
 * screens get a centred column; native renders the children as they are.
 *
 * transparent: for sheets. Same screen position and shape, but no bezel or
 * background, so the sheet and its backdrop stay inside the phone's screen.
 */
export function WebFrame({ children, transparent }: { children: ReactNode; transparent?: boolean }) {
  const frame = useFrame();
  if (Platform.OS !== 'web') return <>{children}</>;

  if (!frame) {
    return (
      <View style={[styles.outer, !transparent && styles.white]}>
        <View style={styles.column}>{children}</View>
      </View>
    );
  }

  const { scale } = frame;
  return (
    <View style={[styles.outer, styles.center, !transparent && styles.white]} pointerEvents="box-none">
      {/* Takes the scaled size in the layout; the phone inside is drawn at full size and scaled. */}
      <View style={{ width: DEVICE_W * scale, height: DEVICE_H * scale }} pointerEvents="box-none">
        <View
          pointerEvents="box-none"
          style={[
            styles.device,
            !transparent && styles.body,
            {
              left: (DEVICE_W * scale - DEVICE_W) / 2,
              top: (DEVICE_H * scale - DEVICE_H) / 2,
              transform: [{ scale }],
            },
          ]}>
          <View style={[styles.screen, !transparent && styles.screenBg]}>
            <SafeAreaFrameContext.Provider value={SCREEN_FRAME}>
              <SafeAreaInsetsContext.Provider value={INSETS}>{children}</SafeAreaInsetsContext.Provider>
            </SafeAreaFrameContext.Provider>
            {!transparent && (
              <>
                <View pointerEvents="none" style={styles.island} />
                <View pointerEvents="none" style={styles.homeBar} />
              </>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, alignItems: 'center' },
  center: { justifyContent: 'center' },
  white: { backgroundColor: colors.white },
  column: { flex: 1, width: '100%', maxWidth: WEB_MAX_WIDTH },
  device: {
    position: 'absolute',
    width: DEVICE_W,
    height: DEVICE_H,
    padding: BEZEL,
    borderRadius: SCREEN_RADIUS + BEZEL,
  },
  // The phone's body: dark titanium with a thin lighter edge and a soft shadow.
  body: {
    backgroundColor: '#1D1D1F',
    borderWidth: 2,
    borderColor: '#3A3A3C',
    boxShadow: '0px 30px 60px rgba(0,0,0,0.18), 0px 8px 20px rgba(0,0,0,0.12)',
  },
  screen: { flex: 1, borderRadius: SCREEN_RADIUS, overflow: 'hidden' },
  screenBg: { backgroundColor: colors.bg },
  island: {
    position: 'absolute',
    top: 11,
    alignSelf: 'center',
    width: 126,
    height: 37,
    borderRadius: 19,
    backgroundColor: '#000',
  },
  homeBar: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    width: 140,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(37,40,43,0.45)',
  },
});
