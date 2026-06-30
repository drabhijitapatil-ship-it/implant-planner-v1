import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import api from './api';

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
  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();

  useEffect(() => {
    if (isExpoGo) return;

    const Notifications = require('expo-notifications');

    registerForPushNotifications(Notifications);

    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification: any) => {
        console.log('Notification received:', notification.request.content.title);
      }
    );

    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response: any) => {
        const data = response.notification.request.content.data;
        console.log('Notification tapped, data:', data);
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

    const pushToken = (await Notifications.getExpoPushTokenAsync()).data;
    await api.post('/auth/push-token', { push_token: pushToken });

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2196F3',
      });
    }

    console.log('Push token registered:', pushToken);
  } catch (error) {
    console.log('Error registering push notifications:', error);
  }
}
