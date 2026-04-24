import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';

/**
 * HIPAA safeguard — prevents screenshots and screen recording of PHI.
 *
 * • Android: applies FLAG_SECURE at the window level → screenshots return
 *   black; screen-recording apps capture black frames.
 * • iOS: blocks screen-recording and shows a blurred placeholder when the
 *   user takes a screenshot. iOS still writes a black/blurred image to the
 *   photo library (Apple-imposed — we can't suppress the file entirely).
 * • Web: no-op (browsers don't expose this API).
 *
 * We enable protection once the user is authenticated and leave it on for
 * the whole session — the app only ever renders PHI on authenticated
 * routes, and toggling on every navigation causes flicker on Android.
 */
export function useScreenCaptureProtection(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    if (Platform.OS === 'web') return;
    let cancelled = false;
    (async () => {
      try {
        await ScreenCapture.preventScreenCaptureAsync('hipaa-phi-guard');
      } catch {
        // Non-fatal — continue even if the native module isn't available
        // (e.g. in Expo Go on very old OS versions).
      }
    })();
    return () => {
      if (cancelled) return;
      cancelled = true;
      ScreenCapture.allowScreenCaptureAsync('hipaa-phi-guard').catch(() => {});
    };
  }, [enabled]);
}
