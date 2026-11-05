import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler } from 'react-native';

/**
 * Back to the wallet home. Every wallet screen lives in one stack whose first screen is home,
 * so pop the whole stack. (dismissTo('/wallet') did nothing on iOS after the check screens
 * had replaced each other.)
 */
export const goWalletHome = () => {
  if (router.canDismiss()) router.dismissAll();
  else router.replace('/wallet');
};

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
