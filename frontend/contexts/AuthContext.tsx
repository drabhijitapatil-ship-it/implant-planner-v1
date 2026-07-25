import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react';
import { Alert, AppState } from 'react-native';
import api, { getToken, setToken, removeToken, setOnAuthFailure, setOnActivity } from '../utils/api';
import { router } from 'expo-router';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  org_id?: string | null;
  org_type?: 'college' | 'clinic' | null;
  org_name?: string | null;
  profile_photo?: string | null;
  /** Org owner flag — set only on the org's founding user (via /auth/signup).
   *  Distinct from `role`: an is_admin user can create/edit departments and
   *  assign any user (incl. Implant In-Charges) to any department. */
  is_admin?: boolean;
  /** Department this user is scoped to. Null/undefined = org-wide (the
   *  behavior every account had before departments existed). */
  department_id?: string | null;
  department_name?: string | null;
  department_color?: string | null;
  /** Full list — an Implant In-Charge (or department-tagged org admin) can be
   *  tagged to up to 2 departments at once. department_id/_name/_color above
   *  are just the first one, kept for back-compat. */
  departments?: { department_id: string; department_name: string | null; department_color: string | null }[];
  /** ISO timestamp set when the user first dismisses the onboarding + workflow
   *  help. Null/undefined means they haven't seen it → frontend routes them
   *  through /onboarding → /help-workflow once before the dashboard. */
  workflow_seen_at?: string | null;
  /** Onboarding content version the user has acknowledged. When the client's
   *  ONBOARDING_VERSION constant exceeds this, the carousel re-fires. */
  workflow_seen_version?: number | null;
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
  /** Hit POST /auth/me/ack-workflow so onboarding + workflow help stop showing.
   *  Pass the current ONBOARDING_VERSION so version-based re-fire works. */
  ackWorkflow: (version?: number) => Promise<void>;
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
  const sessionExpiryPromptRef = useRef(false);
  // Mirror of `user` readable from long-lived closures (auth-failure callback).
  const userRef = useRef<User | null>(null);
  useEffect(() => { userRef.current = user; }, [user]);

  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const clearSession = useCallback(async () => {
    await removeToken('access_token');
    await removeToken('refresh_token');
    await removeToken('user');
    await removeToken('last_activity_at');
    setUser(null);
  }, []);

  const logout = useCallback(async () => {
    try {
      const accessToken = await getToken('access_token');
      if (accessToken) {
        await api.post('/auth/logout');
      }
    } catch {
      // Ignore logout API errors
    }
    await clearSession();
  }, [clearSession]);

  const finishSessionExpiry = useCallback(async () => {
    try {
      await logout();
    } finally {
      sessionExpiryPromptRef.current = false;
      setLoading(false);
      router.replace('/auth/login');
    }
  }, [logout]);

  const promptSessionExpired = useCallback((message: string, holdLoading = false) => {
    if (sessionExpiryPromptRef.current) return;
    sessionExpiryPromptRef.current = true;
    if (!holdLoading) {
      setLoading(false);
    }
    Alert.alert(
      'Session Expired',
      message,
      [{ text: 'OK', onPress: () => { void finishSessionExpiry(); } }],
      { cancelable: false }
    );
  }, [finishSessionExpiry]);

  const loadStoredAuth = useCallback(async () => {
    try {
      const storedAccessToken = await getToken('access_token');
      if (storedAccessToken) {
        // Enforce the 15-minute inactivity rule across app restarts too:
        // without this, killing and reopening the app silently re-logs the
        // user in via the 7-day refresh token — a hole on shared clinic
        // devices. `last_activity_at` is persisted on app background.
        const lastActivity = Number(await getToken('last_activity_at')) || 0;
        if (lastActivity && Date.now() - lastActivity > SESSION_TIMEOUT_MS) {
          promptSessionExpired(
            'You have been logged out after 15 minutes of inactivity. Please log in again.',
            true
          );
          return;
        }
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
      if (!sessionExpiryPromptRef.current) {
        setLoading(false);
      }
    }
  }, [promptSessionExpired]);

  useEffect(() => {
    loadStoredAuth();
    // Register auth failure callback so interceptor can trigger logout safely.
    // Fires when the access token is rejected AND the refresh attempt fails —
    // i.e. the session is genuinely over. Prompt the user first, then clear
    // auth state only after OK so iOS doesn't strand them on a black screen.
    setOnAuthFailure(() => {
      if (userRef.current) {
        promptSessionExpired('Your session has expired. Please log in again.');
      }
    });
    // iter-169: Every authenticated API call records activity. Closes the HIPAA
    // compliance gap where ScrollView / TextInput consumed touches before they
    // reached the top-level responder, logging users out mid-session.
    setOnActivity(() => {
      lastActivityRef.current = Date.now();
    });
  }, [clearSession, loadStoredAuth, promptSessionExpired]);

  // "Kicked out after 15 min of inactivity" flow — used by the in-app
  // interval only. Clears auth immediately so the route guard can send the
  // user back to sign-in without waiting on any confirmation UI.
  const expireSession = useCallback(() => {
    promptSessionExpired('You have been logged out after 15 minutes of inactivity. Please log in again.');
  }, [promptSessionExpired]);

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
        expireSession();
      }
    }, 30000); // check every 30 seconds
    return () => {
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
        sessionTimerRef.current = null;
      }
    };
  }, [user, expireSession]);

  // Persist the in-memory activity timestamp when the app backgrounds — the
  // restart check in loadStoredAuth() below reads this from storage, but
  // until now nothing ever wrote it after login. That left it pinned to the
  // login time, so any resume more than 15 minutes after login (regardless
  // of how recently the user was actually active) wiped the session and
  // left the current screen stranded with no token instead of a clean
  // logout — the "screen goes black" symptom.
  useEffect(() => {
    if (!user) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        setToken('last_activity_at', String(lastActivityRef.current)).catch(() => {});
      }
    });
    return () => sub.remove();
  }, [user]);

  const login = async (identifier: string, password: string) => {
    const response = await api.post('/auth/login', { identifier, password });

    const { access_token, refresh_token, user: newUser } = response.data;

    await setToken('access_token', access_token);
    await setToken('refresh_token', refresh_token);
    await setToken('user', JSON.stringify(newUser));
    await setToken('last_activity_at', String(Date.now()));

    setUser(newUser);
  };

  const register = async (name: string, email: string, password: string, role: string) => {
    await api.post('/auth/register', { name, email, password, role });
    // Auto login after register
    await login(email, password);
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

  const ackWorkflow = async (version?: number) => {
    await api.post('/auth/me/ack-workflow', { version: version ?? 1 });
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
