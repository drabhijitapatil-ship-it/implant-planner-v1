import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { BACKEND_URL } from './config';

// HTTPS enforcement check
if (BACKEND_URL && !BACKEND_URL.startsWith('https://')) {
  console.warn('[SECURITY] BACKEND_URL does not use HTTPS:', BACKEND_URL);
}

const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
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
