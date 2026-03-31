import Constants from 'expo-constants';

// Priority chain for resolving the backend URL:
// 1. EXPO_PUBLIC_* env var (inlined by Metro during EAS builds via eas.json)
// 2. app.json extra.backendUrl (hardcoded fallback, always available)
const BACKEND_URL: string =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  Constants.expoConfig?.extra?.backendUrl ||
  '';

export { BACKEND_URL };
