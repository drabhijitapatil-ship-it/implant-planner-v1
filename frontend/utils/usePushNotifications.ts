import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import api, { setToken } from './api';
import { useAuth } from '../contexts/AuthContext';

const isExpoGo = Constants.appOwnership === 'expo';

// Must NOT be a top-level import — expo-notifications module-level code
// throws in Expo Go SDK 53+. Lazy require() prevents evaluation until called.
if (!isExpoGo) {
  const Notifications = require('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

export function usePushNotifications() {
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);
  const { user } = useAuth();
  const userId = user?.id;

  // (Re-)register whenever a different user signs in on this device, so the
  // server always maps this phone's token to the current user.
  useEffect(() => {
    if (isExpoGo || !userId) return;
    registerForPushNotifications(require('expo-notifications'));
  }, [userId]);

  useEffect(() => {
    if (isExpoGo) return;

    const Notifications = require('expo-notifications');

    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification: any) => {
        console.log('Notification received:', notification.request.content.title);
      }
    );

    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response: any) => {
        const data = response.notification.request.content.data || {};
        // Tapping a case notification opens that case.
        if (data.procedure_id) {
          try { router.push(`/procedures/${data.procedure_id}` as any); } catch {}
        }
      }
    );

    return () => {
      try {
        const n: any = notificationListener.current;
        if (n) {
          if (typeof n.remove === 'function') n.remove();
          else if (typeof Notifications.removeNotificationSubscription === 'function')
            Notifications.removeNotificationSubscription(n);
        }
      } catch {}
      try {
        const r: any = responseListener.current;
        if (r) {
          if (typeof r.remove === 'function') r.remove();
          else if (typeof Notifications.removeNotificationSubscription === 'function')
            Notifications.removeNotificationSubscription(r);
        }
      } catch {}
    };
  }, []);
}

async function registerForPushNotifications(Notifications: any) {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return;
  }

  try {
    // Android 8+: the channel must exist before the permission prompt /
    // token, otherwise notifications can be silently dropped.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2196F3',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission not granted');
      return;
    }

    // projectId is required in standalone/EAS builds; without it the token
    // call can throw and no push ever reaches this device.
    const projectId =
      (Constants as any)?.expoConfig?.extra?.eas?.projectId ?? (Constants as any)?.easConfig?.projectId;
    const pushToken = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    await api.post('/auth/push-token', { push_token: pushToken });
    await setToken('push_token', pushToken).catch(() => {});

    console.log('Push token registered:', pushToken);
  } catch (error) {
    console.log('Error registering push notifications:', error);
  }
}
