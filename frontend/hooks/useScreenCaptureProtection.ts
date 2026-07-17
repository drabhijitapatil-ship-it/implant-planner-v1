import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
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
 *
 * Re-applying on every foreground transition (not just once on mount)
 * guards against a known Android FLAG_SECURE quirk where the secure window
 * surface can fail to redraw after the screen has been off/idle for a
 * while, leaving the app rendering solid black until the Activity is
 * recreated (previously "fixed" by force-closing and reopening).
 */
export function useScreenCaptureProtection(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    if (Platform.OS === 'web') return;
    let cancelled = false;
    const apply = () => {
      ScreenCapture.preventScreenCaptureAsync('hipaa-phi-guard').catch(() => {
        // Non-fatal — continue even if the native module isn't available
        // (e.g. in Expo Go on very old OS versions).
      });
    };
    apply();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && !cancelled) apply();
    });
    return () => {
      cancelled = true;
      sub.remove();
      ScreenCapture.allowScreenCaptureAsync('hipaa-phi-guard').catch(() => {});
    };
  }, [enabled]);
}
