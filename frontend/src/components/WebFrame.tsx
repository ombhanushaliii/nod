import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

/** The web app is laid out for phones: wider screens get a centred column this wide. */
export const WEB_MAX_WIDTH = 512;

/**
 * Web only: keeps every page (and every sheet, which renders outside the page)
 * in a phone-width column, centred, with plain white around it on wide
 * screens. Narrow screens are unchanged. Native renders the children as they are.
 *
 * transparent: for sheets, whose backdrop sits over the page.
 */
export function WebFrame({ children, transparent }: { children: ReactNode; transparent?: boolean }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return (
    <View style={[styles.outer, !transparent && styles.white]}>
      <View style={styles.column}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, alignItems: 'center' },
  white: { backgroundColor: colors.white },
  column: { flex: 1, width: '100%', maxWidth: WEB_MAX_WIDTH },
});
