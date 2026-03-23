import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// HTTPS enforcement check
if (EXPO_PUBLIC_BACKEND_URL && !EXPO_PUBLIC_BACKEND_URL.startsWith('https://')) {
  console.warn('[SECURITY] EXPO_PUBLIC_BACKEND_URL does not use HTTPS:', EXPO_PUBLIC_BACKEND_URL);
}

const api = axios.create({
  baseURL: `${EXPO_PUBLIC_BACKEND_URL}/api`,
});

// Add token to requests
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Catch 401 → clear token → redirect to Login
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('user');
      router.replace('/auth/login');
    }
    return Promise.reject(error);
  }
);

export default api;
