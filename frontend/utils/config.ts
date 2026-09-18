import Constants from 'expo-constants';
import { Platform } from 'react-native';

const envUrl =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  Constants.expoConfig?.extra?.backendUrl ||
  (Constants.manifest as any)?.extra?.backendUrl;

function resolveBackendUrl(): string {
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    let url = envUrl.trim().replace(/\/+$/, '');
    // If running on Android and URL targets localhost, rewrite to 10.0.2.2 (host alias)
    if (Platform.OS === 'android' && (url.includes('localhost') || url.includes('127.0.0.1'))) {
      url = url.replace('localhost', '10.0.2.2').replace('127.0.0.1', '10.0.2.2');
    }
    return url;
  }
  // Local backend default (Android emulator -> 10.0.2.2, iOS/Web -> localhost)
  if (Platform.OS === 'android') {
    return 'https://api.implanr.com';
  }
  return 'https://api.implanr.com';
}

const BACKEND_URL: string = resolveBackendUrl();

export { BACKEND_URL };
