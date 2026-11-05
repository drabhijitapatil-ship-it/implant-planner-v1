/**
 * Whether screenshots are allowed — a platform-wide switch the super admin
 * controls (Super Admin dashboard → "Allow screenshots"). Read from
 * GET /app-config when a user signs in and whenever the app returns to the
 * foreground, so a change reaches every phone without an app update.
 */
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import api from '../utils/api';

let current = true; // matches the server default
const listeners = new Set<(v: boolean) => void>();

function publish(v: boolean) {
  current = v;
  listeners.forEach((l) => l(v));
}

/** Apply a new value straight away (used right after the super admin saves). */
export function setScreenshotsAllowedLocally(v: boolean) {
  publish(v);
}

export function useScreenshotPolicy(signedIn: boolean): boolean {
  const [allowed, setAllowed] = useState(current);

  useEffect(() => {
    listeners.add(setAllowed);
    return () => { listeners.delete(setAllowed); };
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    const refresh = () => {
      api.get('/app-config')
        .then((r) => {
          if (typeof r.data?.screenshots_allowed === 'boolean') publish(r.data.screenshots_allowed);
        })
        .catch(() => {});
    };
    refresh();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    return () => sub.remove();
  }, [signedIn]);

  return allowed;
}
