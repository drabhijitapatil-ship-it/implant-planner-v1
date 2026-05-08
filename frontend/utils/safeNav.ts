/**
 * Navigate back if the stack has history, otherwise fall back to Home.
 * Mirrors the smart fallback in `<BackButton />` so success-flow Alerts
 * never strand the user on a blank screen after `router.replace`, deep
 * links, or fresh-tab loads on web.
 */
import { Platform } from 'react-native';
import { router } from 'expo-router';

export function goBackOrHome(fallbackHref: string = '/(tabs)/dashboard') {
  let canBack = true;
  try {
    // @ts-ignore — expo-router exposes canGoBack on native; truthy on web with history.
    canBack = typeof router.canGoBack === 'function' ? router.canGoBack() : true;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if ((window.history?.length ?? 0) <= 1) canBack = false;
    }
  } catch { /* fall through */ }
  if (canBack) router.back();
  else router.replace(fallbackHref as any);
}
