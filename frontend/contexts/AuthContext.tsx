import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import api, { getToken, setToken, removeToken, setOnAuthFailure } from '../utils/api';
import { BACKEND_URL } from '../utils/config';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  profile_photo?: string | null;
  /** ISO timestamp set when the user first dismisses the onboarding + workflow
   *  help. Null/undefined means they haven't seen it → frontend routes them
   *  through /onboarding → /help-workflow once before the dashboard. */
  workflow_seen_at?: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, role: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfilePhoto: (photoBase64: string) => Promise<void>;
  recordActivity: () => void;
  /** Re-fetch /auth/me and update context (used after ack-workflow). */
  refreshUser: () => Promise<User | null>;
  /** Hit POST /auth/me/ack-workflow so onboarding + workflow help stop showing. */
  ackWorkflow: () => Promise<void>;
}

// Auto-logout after 15 minutes of inactivity. Clinic devices are often shared,
// so a session timeout protects patient data when a user walks away.
// 15 min aligns with HIPAA best-practice recommendations for workstation timeout.
const SESSION_TIMEOUT_MS = 15 * 60 * 1000;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const lastActivityRef = useRef<number>(Date.now());
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    loadStoredAuth();
    // Register auth failure callback so interceptor can trigger logout safely
    setOnAuthFailure(() => {
      setUser(null);
    });
  }, []);

  // Session inactivity timer — auto-logout when no activity for SESSION_TIMEOUT_MS.
  useEffect(() => {
    if (!user) {
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
        sessionTimerRef.current = null;
      }
      return;
    }
    lastActivityRef.current = Date.now();
    sessionTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed > SESSION_TIMEOUT_MS) {
        if (sessionTimerRef.current) {
          clearInterval(sessionTimerRef.current);
          sessionTimerRef.current = null;
        }
        logout().then(() => {
          Alert.alert(
            'Session Expired',
            'You have been logged out after 15 minutes of inactivity. Please log in again.'
          );
        });
      }
    }, 30000); // check every 30 seconds
    return () => {
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
        sessionTimerRef.current = null;
      }
    };
  }, [user]);

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

  const refreshUser = async (): Promise<User | null> => {
    try {
      const resp = await api.get('/auth/me');
      setUser(resp.data);
      await setToken('user', JSON.stringify(resp.data));
      return resp.data as User;
    } catch {
      // Silent — /auth/me has its own 401 handling via interceptor.
      return null;
    }
  };

  const ackWorkflow = async () => {
    await api.post('/auth/me/ack-workflow');
    // Don't refetch here — caller decides whether to refresh user context.
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateProfilePhoto, recordActivity, refreshUser, ackWorkflow }}>
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
