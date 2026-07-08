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

const LOCAL_BACKEND_PORT = 8001;

// On a REAL device (not simulator/emulator), "localhost" means the phone
// itself and "10.0.2.2" doesn't exist — neither reaches the dev machine.
// Expo's dev server already knows the LAN IP the phone used to connect
// (hostUri, e.g. "192.168.31.34:3000"); reuse that host so the backend URL
// always matches whatever network the phone is actually on, with no IP to
// hardcode or update when networks change. Falls back to localhost for
// simulators/emulators/web, where hostUri may be absent.
function resolveLocalDevUrl(): string {
  const hostUri: string | undefined =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri;
  if (hostUri) {
    const host = hostUri.split(":")[0];
    return `http://${host}:${LOCAL_BACKEND_PORT}`;
  }
  return `http://localhost:${LOCAL_BACKEND_PORT}`;
}

const _rawUrl: string = resolveLocalDevUrl();
// const _rawUrl: string =
//   process.env.EXPO_PUBLIC_BACKEND_URL ||
//   Constants.expoConfig?.extra?.backendUrl ||
//   "https://api.implanr.com";

const BACKEND_URL: string = resolveUrl(_rawUrl);

export { BACKEND_URL };
