import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import api from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function usePushNotifications() {
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    registerForPushNotifications();

    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification.request.content.title);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      console.log('Notification tapped, data:', data);
    });

    return () => {
      // expo-notifications dropped removeNotificationSubscription in newer SDKs.
      // Subscription objects expose `.remove()` directly. Guard for both APIs.
      try {
        const n: any = notificationListener.current;
        if (n) {
          if (typeof n.remove === 'function') n.remove();
          else if (typeof (Notifications as any).removeNotificationSubscription === 'function') (Notifications as any).removeNotificationSubscription(n);
        }
      } catch {}
      try {
        const r: any = responseListener.current;
        if (r) {
          if (typeof r.remove === 'function') r.remove();
          else if (typeof (Notifications as any).removeNotificationSubscription === 'function') (Notifications as any).removeNotificationSubscription(r);
        }
      } catch {}
    };
  }, []);
}

async function registerForPushNotifications() {
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

    // Send token to backend (api module auto-attaches auth header)
    await api.post('/auth/push-token', { push_token: pushToken });

    // Android notification channel
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
