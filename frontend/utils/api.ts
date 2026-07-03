import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { BACKEND_URL } from './config';
import { Platform } from 'react-native';

const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
});

// Secure token storage helpers (fallback to in-memory for unsupported platforms)
let memoryTokens: Record<string, string> = {};

export async function getToken(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return memoryTokens[key] || null;
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return memoryTokens[key] || null;
  }
}

export async function setToken(key: string, value: string): Promise<void> {
  memoryTokens[key] = value;
  if (Platform.OS !== 'web') {
    try { await SecureStore.setItemAsync(key, value); } catch {}
  }
}

export async function removeToken(key: string): Promise<void> {
  delete memoryTokens[key];
  if (Platform.OS !== 'web') {
    try { await SecureStore.deleteItemAsync(key); } catch {}
  }
}

// Auth failure callback — set by AuthContext to handle logout safely
let _onAuthFailure: (() => void) | null = null;
export function setOnAuthFailure(cb: () => void) { _onAuthFailure = cb; }

// iter-169: Activity recorder — set by AuthContext so every authenticated API
// call bumps the inactivity timer. This closes the HIPAA compliance gap where
// ScrollView / TextInput consumed touch events before they reached the
// top-level responder, so users were being logged out mid-session while
// actively using the app.
let _onActivity: (() => void) | null = null;
export function setOnActivity(cb: () => void) { _onActivity = cb; }

// Build authenticated URL for file viewing (appends token as query param)
export async function getAuthFileUrl(filename: string): Promise<string> {
  const baseUrl = api.defaults.baseURL || '';
  const token = await getToken('access_token');
  return `${baseUrl}/uploads/${filename}${token ? `?token=${token}` : ''}`;
}

// Preferred: build a file URL backed by a short-lived, single-file token (not the
// full access JWT). The mint call goes through axios (Authorization header, auto
// -refreshed), and only the scoped token lands in the URL — so a leaked link
// exposes just this one file, for a few minutes, at this user's permissions.
export async function mintFileToken(filename: string): Promise<string> {
  const baseUrl = api.defaults.baseURL || '';
  const { data } = await api.post('/uploads/mint-file-token', { filename });
  return `${baseUrl}/uploads/${filename}?ft=${encodeURIComponent(data.token)}`;
}

// Legacy fallback: file URL carrying a freshly-refreshed full access token. Kept
// for viewers not yet migrated to mintFileToken. Prefer mintFileToken for new use.
export async function getFreshAuthFileUrl(filename: string): Promise<string> {
  const baseUrl = api.defaults.baseURL || '';
  let token = await getToken('access_token');
  try {
    const refreshToken = await getToken('refresh_token');
    if (refreshToken) {
      const { data } = await axios.post(`${BACKEND_URL}/api/auth/refresh`, {
        refresh_token: refreshToken,
      });
      if (data?.access_token) {
        token = data.access_token;
        await setToken('access_token', token);
      }
    }
  } catch {
    // Refresh failed — fall back to whatever token we have.
  }
  return `${baseUrl}/uploads/${filename}${token ? `?token=${token}` : ''}`;
}

// Flag to prevent infinite refresh loops
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

// Attach access token to every request + record activity.
api.interceptors.request.use(async (config) => {
  const token = await getToken('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // iter-169: HIPAA — any authenticated API call is evidence the user is active.
  if (_onActivity) _onActivity();
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (isRefreshing) {
        return new Promise((resolve) => {
          refreshSubscribers.push((newToken: string) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            resolve(api(originalRequest));
          });
        });
      }

      isRefreshing = true;
      try {
        const refreshToken = await getToken('refresh_token');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${BACKEND_URL}/api/auth/refresh`, {
          refresh_token: refreshToken,
        });

        await setToken('access_token', data.access_token);
        onRefreshed(data.access_token);
        originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        return api(originalRequest);
      } catch {
        // Refresh failed — clear tokens, notify AuthContext (no direct navigation)
        await removeToken('access_token');
        await removeToken('refresh_token');
        await removeToken('user');
        if (_onAuthFailure) _onAuthFailure();
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
