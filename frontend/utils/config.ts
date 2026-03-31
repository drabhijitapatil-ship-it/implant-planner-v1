import Constants from 'expo-constants';

// In deployed environment, REACT_APP_BACKEND_URL is set by Emergent to the production URL.
// app.config.js maps it to extra.backendUrl, with EXPO_PUBLIC_BACKEND_URL as fallback.
const BACKEND_URL: string =
  Constants.expoConfig?.extra?.backendUrl ||
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  '';

export { BACKEND_URL };
