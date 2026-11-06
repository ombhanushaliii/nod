// Push notifications (D9). The backend pushes the trustee when a request
// arrives, and the user when their trustee accepts or changes the rules.
//
// Needs an EAS project id (run `eas init`), Firebase (FCM) credentials for
// Android, and a dev build that includes expo-notifications. Until those
// exist this does nothing, and the apps refresh when opened instead.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

export type PushRegistration = 'registered' | 'skipped' | 'denied';

function projectId(): string | null {
  const id = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof id === 'string' && id ? id : null;
}

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false,
    }),
  });
}

/** Asks for permission and returns this device's Expo push token, or why there isn't one. */
export async function getPushToken(): Promise<{ status: PushRegistration; token?: string }> {
  const id = projectId();
  if (Platform.OS === 'web' || !Device.isDevice || !id) return { status: 'skipped' };
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Payments', importance: AndroidImportance.HIGH });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return { status: 'denied' };
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  return { status: 'registered', token: data };
}

/** Calls onPush with the push's data whenever one arrives or is tapped. */
export function onPush(onData: (data: Record<string, unknown>) => void): () => void {
  if (Platform.OS === 'web') return () => {};
  const received = Notifications.addNotificationReceivedListener((n) => onData(n.request.content.data ?? {}));
  const tapped = Notifications.addNotificationResponseReceivedListener((r) => onData(r.notification.request.content.data ?? {}));
  return () => { received.remove(); tapped.remove(); };
}
