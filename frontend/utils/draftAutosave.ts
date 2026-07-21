/**
 * Local-device draft autosave for Phase 2/3/4 submission forms.
 *
 * Mirrors the AsyncStorage pattern Phase 1 (new-procedure.tsx) already uses,
 * so mid-form data (post-surgical notes, IOPA uploads, checklist toggles,
 * etc.) survives the app being backgrounded/foregrounded or the user
 * navigating back before hitting the final Submit button.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useContext, useEffect, useRef } from 'react';
import { AppState, Alert, AppStateStatus } from 'react-native';
import { NavigationContext } from '@react-navigation/native';

export function draftStorageKey(screen: string, procedureId: string, userId?: string): string {
  return `phase_draft_${screen}_${procedureId}_${userId || 'anon'}`;
}

export async function saveDraft(key: string, data: Record<string, any>): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ data, savedAt: Date.now() }));
  } catch {
    // Best-effort — a failed local save shouldn't block the user.
  }
}

export async function loadDraft(key: string): Promise<Record<string, any> | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.data || null;
  } catch {
    return null;
  }
}

export async function clearDraft(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Periodically (and on backgrounding) snapshots `getSnapshot()` to
 * AsyncStorage under `storageKey`. Returns `saveNow` for a manual "Save
 * Draft" button.
 */
export function useDraftAutosave(opts: {
  enabled: boolean;
  storageKey: string;
  getSnapshot: () => Record<string, any>;
  intervalMs?: number;
}) {
  const { enabled, storageKey, intervalMs = 20000 } = opts;
  const snapshotRef = useRef(opts.getSnapshot);
  snapshotRef.current = opts.getSnapshot;
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const saveNow = useCallback(async () => {
    if (!enabled) return;
    await saveDraft(storageKey, snapshotRef.current());
  }, [enabled, storageKey]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(saveNow, intervalMs);
    return () => clearInterval(id);
  }, [enabled, saveNow, intervalMs]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current === 'active' && /inactive|background/.test(next)) {
        saveNow();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [saveNow]);

  return { saveNow };
}

/**
 * Intercepts back navigation (header back, swipe-back gesture, hardware
 * back) while `hasUnsavedChanges` is true and offers Save / Discard /
 * Cancel instead of silently discarding form state.
 */
export function useUnsavedChangesGuard(opts: {
  enabled: boolean;
  hasUnsavedChanges: boolean;
  onSave: () => void | Promise<void>;
}) {
  const { enabled, hasUnsavedChanges, onSave } = opts;
  // useContext (not useNavigation()) so a screen rendered before its
  // NavigationContainer/Stack context is fully attached — a real timing
  // case with Expo Router + the RN new architecture — gets `undefined`
  // instead of useNavigation()'s hard throw ("Couldn't find a navigation
  // object"), which was crashing the Phase 2/3/4 submission screens on mount.
  const navigation = useContext(NavigationContext);

  useEffect(() => {
    if (!enabled || !navigation) return undefined;
    // @ts-ignore — expo-router screens sit on a React Navigation stack, so
    // beforeRemove is always available even though the expo-router type
    // doesn't declare it.
    const sub = navigation.addListener('beforeRemove', (e: any) => {
      if (!hasUnsavedChanges) return;
      e.preventDefault();
      Alert.alert(
        'Save before leaving?',
        'You have unsaved changes on this form. Save a draft so nothing is lost, or discard them?',
        [
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save',
            style: 'default',
            onPress: async () => {
              await onSave();
              navigation.dispatch(e.data.action);
            },
          },
        ],
      );
    });
    return sub;
  }, [navigation, enabled, hasUnsavedChanges, onSave]);
}
