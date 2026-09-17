import Constants from 'expo-constants';

// Fail-safe backend URL resolution:
// 1. Inlined EXPO_PUBLIC_BACKEND_URL from build/environment
// 2. Constants.expoConfig?.extra?.backendUrl from dynamic app.config.js
// 3. Fallback to production API: https://api.implanr.com
// Trailing slashes are stripped to prevent double-slash (//api) routing errors.
const rawUrl =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  Constants.expoConfig?.extra?.backendUrl ||
  (Constants.manifest as any)?.extra?.backendUrl ||
  'https://api.implanr.com';

const BACKEND_URL: string = (rawUrl && rawUrl.trim() ? rawUrl.trim() : 'https://api.implanr.com').replace(/\/+$/, '');

export { BACKEND_URL };
