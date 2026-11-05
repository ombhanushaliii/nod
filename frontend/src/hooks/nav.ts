import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler } from 'react-native';

export const goWalletHome = () => router.dismissTo('/wallet');

/**
 * Result screens (sent, waiting, cooldown, ...) have swipe-back turned off, since going
 * back into a finished check makes no sense. This sends Android's back button home instead.
 */
export function useBackGoesHome(home: () => void = goWalletHome) {
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        home();
        return true;
      });
      return () => sub.remove();
    }, [home]),
  );
}
