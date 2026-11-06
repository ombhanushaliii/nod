import { useEffect, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';

/**
 * Like a bank app: whenever Nod isn't the active app (app switcher, home screen,
 * notification centre), a black layer hides the screen, so the OS's snapshot in
 * the app switcher shows no balance or addresses.
 *
 * Native Modals (the app lock, sheets) sit above the normal view tree, so each
 * of them renders one of these too.
 */
export function PrivacyCover() {
  // Starts uncovered: at launch the state can still read 'unknown'.
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (state) => setHidden(state !== 'active'));
    return () => sub.remove();
  }, []);
  if (Platform.OS === 'web' || !hidden) return null;
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.cover]} />;
}

const styles = StyleSheet.create({
  cover: { backgroundColor: '#000', zIndex: 1000, elevation: 1000 },
});
