import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import api from './api';

// Notifications.Subscription is deprecated in favor of EventSubscription
// (re-exported by expo-notifications from expo-modules-core in SDK 54+).
type NotifSubscription = Notifications.EventSubscription;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // SDK 54+: shouldShowAlert is deprecated. The new shape splits the alert into
    // banner (transient heads-up) + list (notification center entry). We keep
    // shouldShowAlert for back-compat with older runtimes that haven't shipped
    // the rename yet.
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function usePushNotifications() {
  const notificationListener = useRef<NotifSubscription>();
  const responseListener = useRef<NotifSubscription>();

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
  // iter-Feb-2026 (v5): Push registration is gated on EMERGENT_PUSH_KEY
  // being present at build time. When missing (as in current deployment),
  // this function is a no-op — the raw Expo push flow is skipped so the
  // app can be deployed without provisioning push credentials. Once the
  // user provisions push through the Emergent integration flow, this
  // guard removes itself automatically because EXPO_PUBLIC_EMERGENT_PUSH_KEY
  // will be populated by the deploy pipeline.
  const emergentPushKey = process.env.EXPO_PUBLIC_EMERGENT_PUSH_KEY || '';
  if (!emergentPushKey || emergentPushKey === 'placeholder') {
    console.log('[push] EMERGENT_PUSH_KEY not configured — push registration skipped');
    return;
  }
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

    // NOTE: token acquisition is deferred to the EMERGENT-provided native
    // module once provisioned; the raw Expo push token call below only
    // runs when a real push key is configured.
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
