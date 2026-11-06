import type { ReactNode } from 'react';
import { Linking, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaFrameContext, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '@/theme';
import { Button } from './Button';
import { Txt } from './Txt';

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

// The Android app, from the GitHub release. Shown beside the phone when there's room.
const ANDROID_APK_URL = 'https://github.com/ombhanushaliii/nod/releases/download/v1.0.0/nod-v1.0.0.apk';
const PANEL_W = 280;
const PANEL_GAP = 64;

/** The column narrower screens get. */
export const WEB_MAX_WIDTH = 512;

function useFrame() {
  const { width, height } = useWindowDimensions();
  if (Platform.OS !== 'web' || width < FRAME_MIN_WIDTH) return null;
  // Short windows scale the whole phone down so it always fits.
  const scale = Math.min(1, (height - 2 * MARGIN) / DEVICE_H, (width - 2 * MARGIN) / DEVICE_W);
  // The Android card only when phone, gap and card all fit side by side.
  const panel = width >= DEVICE_W * scale + PANEL_GAP + PANEL_W + 2 * MARGIN;
  return { scale, panel };
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

  const { scale, panel } = frame;
  return (
    <View style={[styles.outer, styles.center, styles.row, !transparent && styles.white]} pointerEvents="box-none">
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
      {/* Sheets draw the same empty space, so they stay lined up with the phone. */}
      {panel && (
        <View style={{ width: PANEL_W, marginLeft: PANEL_GAP }} pointerEvents={transparent ? 'none' : 'auto'}>
          {!transparent && <AndroidCard />}
        </View>
      )}
    </View>
  );
}

/** "Also on Android": a QR code and a button for the APK, beside the web phone. */
function AndroidCard() {
  return (
    <View style={styles.card}>
      <View style={styles.androidBadge}>
        <Svg width={32} height={24} viewBox="4 6 16 12" fill="none" aria-hidden>
          <Path d="M5 15a7 7 0 0 1 14 0v1H5v-1z" fill="#3DDC84" />
          <Path d="M7.5 9.6 6 7.2M16.5 9.6 18 7.2" stroke="#3DDC84" strokeWidth={1.6} strokeLinecap="round" />
          <Circle cx={9.3} cy={12.6} r={0.9} fill="#fff" />
          <Circle cx={14.7} cy={12.6} r={0.9} fill="#fff" />
        </Svg>
      </View>
      <View style={{ gap: 6 }}>
        <Txt size={22} w={800} ls={-0.02}>
          Also on Android
        </Txt>
        <Txt size={15} lh={1.45} color={colors.sub}>
          Scan with your Android phone to download the Nod app.
        </Txt>
      </View>
      <View style={styles.qr}>
        <QRCode value={ANDROID_APK_URL} size={168} color={colors.ink} backgroundColor={colors.white} />
      </View>
      <Button label="Download APK" variant="dark" height={50} size={16} onPress={() => void Linking.openURL(ANDROID_APK_URL)} />
      <Txt size={12} color={colors.sub} align="center">
        v1.0.0
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  card: { gap: 18, padding: 24, borderRadius: 28, backgroundColor: colors.bg },
  androidBadge: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#E8F8EF', alignItems: 'center', justifyContent: 'center' },
  qr: { alignSelf: 'center', padding: 14, borderRadius: 20, backgroundColor: colors.white },
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
