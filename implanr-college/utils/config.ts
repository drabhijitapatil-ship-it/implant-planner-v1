import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Priority chain for resolving the backend URL:
// 1. EXPO_PUBLIC_BACKEND_URL env var (set in .env.local for local dev)
// 2. app.json extra.backendUrl (production fallback)
// 3. Platform-aware hardcoded default
//
// Android emulator CANNOT use `localhost` — it points to the emulator's own
// loopback, not the host Mac. We replace localhost/127.0.0.1 with 10.0.2.2
// which is the Android emulator's built-in alias for the host machine.

function resolveUrl(url: string): string {
  if (Platform.OS === 'android') {
    // Replace localhost or 127.0.0.1 with the Android emulator → host bridge
    return url
      .replace(/localhost/g, '10.0.2.2')
      .replace(/127\.0\.0\.1/g, '10.0.2.2');
  }
  return url;
}

const _rawUrl: string =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  Constants.expoConfig?.extra?.backendUrl ||
  // 'http://localhost:8001';
  'https://api.implanr.com';

const BACKEND_URL: string = resolveUrl(_rawUrl);

export { BACKEND_URL };
