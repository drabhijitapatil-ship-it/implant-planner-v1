import Constants from "expo-constants";
import { Platform } from "react-native";

// Priority chain:
// 1. EXPO_PUBLIC_BACKEND_URL env var (set in .env.local for local dev)
// 2. app.json extra.backendUrl (production: https://api.implanr.com)
// 3. Hardcoded production fallback
//
// Android emulator CANNOT use `localhost` — replace with 10.0.2.2.
// Production URL (api.implanr.com) passes through unchanged.

function resolveUrl(url: string): string {
  if (Platform.OS === "android") {
    return url
      .replace(/localhost/g, "10.0.2.2")
      .replace(/127\.0\.0\.1/g, "10.0.2.2");
  }
  return url;
}

const _rawUrl: string = "http://localhost:8001";
// process.env.EXPO_PUBLIC_BACKEND_URL ||
// Constants.expoConfig?.extra?.backendUrl ||
// "https://api.implanr.com";

const BACKEND_URL: string = resolveUrl(_rawUrl);

export { BACKEND_URL };
