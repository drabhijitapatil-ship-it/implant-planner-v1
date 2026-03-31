import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { BACKEND_URL } from './config';
import { Platform } from 'react-native';

const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
});

// Secure token storage helpers (fallback to in-memory for unsupported platforms)
let memoryTokens: { access_token?: string; refresh_token?: string } = {};

export async function getToken(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return memoryTokens[key as keyof typeof memoryTokens] || null;
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return memoryTokens[key as keyof typeof memoryTokens] || null;
  }
}

export async function setToken(key: string, value: string): Promise<void> {
  memoryTokens[key as keyof typeof memoryTokens] = value;
  if (Platform.OS !== 'web') {
    try { await SecureStore.setItemAsync(key, value); } catch {}
  }
}

export async function removeToken(key: string): Promise<void> {
  delete memoryTokens[key as keyof typeof memoryTokens];
  if (Platform.OS !== 'web') {
    try { await SecureStore.deleteItemAsync(key); } catch {}
  }
}

// Flag to prevent infinite refresh loops
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

// Attach access token to every request
api.interceptors.request.use(async (config) => {
  const token = await getToken('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
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
        // Queue this request until the refresh completes
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
        // Refresh failed — clear tokens and redirect to login
        await removeToken('access_token');
        await removeToken('refresh_token');
        await removeToken('user');
        router.replace('/auth/login');
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
