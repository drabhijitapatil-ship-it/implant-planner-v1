import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import api from './api';

const isExpoGo = Constants.appOwnership === 'expo';

function getNotifications() {
  if (isExpoGo) return null;
  try {
    return require('expo-notifications') as typeof import('expo-notifications');
  } catch {
    return null;
  }
}

function getDevice() {
  try {
    return require('expo-device') as typeof import('expo-device');
  } catch {
    return null;
  }
}

const Notifications = getNotifications();

if (Notifications) {
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

  useEffect(() => {
    if (!Notifications) return;

    registerForPushNotifications();

    notificationListener.current = Notifications.addNotificationReceivedListener((notification: any) => {
      console.log('Notification received:', notification.request.content.title);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response: any) => {
      console.log('Notification tapped, data:', response.notification.request.content.data);
    });

    return () => {
      try { notificationListener.current?.remove(); } catch {}
      try { responseListener.current?.remove(); } catch {}
    };
  }, []);
}

async function registerForPushNotifications() {
  const Device = getDevice();
  if (!Notifications || !Device?.isDevice) return;

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

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
  } catch (error) {
    console.log('Push notification setup skipped:', error);
  }
}

