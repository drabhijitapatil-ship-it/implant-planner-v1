import React, { createContext, useState, useContext, useEffect } from 'react';
import api, { getToken, setToken, removeToken } from '../utils/api';
import { BACKEND_URL } from '../utils/config';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  profile_photo?: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, role: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfilePhoto: (photoBase64: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedAccessToken = await getToken('access_token');
      if (storedAccessToken) {
        try {
          const resp = await api.get('/auth/me');
          setUser(resp.data);
        } catch {
          // Token invalid — try refresh silently (interceptor handles it)
          // If refresh also fails, interceptor clears tokens
          await removeToken('access_token');
          await removeToken('refresh_token');
          await removeToken('user');
        }
      }
    } catch (error) {
      console.error('Failed to load stored auth:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (identifier: string, password: string) => {
    const response = await api.post('/auth/login', { identifier, password });

    const { access_token, refresh_token, user: newUser } = response.data;

    await setToken('access_token', access_token);
    await setToken('refresh_token', refresh_token);
    await setToken('user', JSON.stringify(newUser));

    setUser(newUser);
  };

  const register = async (name: string, email: string, password: string, role: string) => {
    await api.post('/auth/register', { name, email, password, role });
    // Auto login after register
    await login(email, password);
  };

  const logout = async () => {
    try {
      const accessToken = await getToken('access_token');
      if (accessToken) {
        await api.post('/auth/logout');
      }
    } catch {
      // Ignore logout API errors
    }
    await removeToken('access_token');
    await removeToken('refresh_token');
    await removeToken('user');
    setUser(null);
  };

  const updateProfilePhoto = async (photoBase64: string) => {
    await api.put('/auth/profile-photo', { profile_photo: photoBase64 });
    if (user) {
      const updatedUser = { ...user, profile_photo: photoBase64 };
      setUser(updatedUser);
      await setToken('user', JSON.stringify(updatedUser));
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateProfilePhoto }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
