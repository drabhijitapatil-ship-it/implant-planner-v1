/**
 * Over-the-air update banner. While a new update downloads it shows
 * "Updating Implanr…"; once it's ready, a "Restart" button applies it right
 * away instead of waiting for the next cold start. Also checks again when the
 * app comes back to the foreground (expo-updates only checks on launch).
 */
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import * as ScreenCapture from 'expo-screen-capture';

export default function UpdateBanner() {
  const insets = useSafeAreaInsets();
  const { isUpdateAvailable, isUpdatePending, isDownloading, isRestarting, downloadProgress } = Updates.useUpdates();
  const fetching = useRef(false);
  const enabled = Updates.isEnabled && !__DEV__;

  // Re-check when the app returns from the background.
  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') Updates.checkForUpdateAsync().catch(() => {});
    });
    return () => sub.remove();
  }, [enabled]);

  // An update was found but not downloaded yet (e.g. found on resume): fetch it.
  useEffect(() => {
    if (!enabled || !isUpdateAvailable || isUpdatePending || isDownloading || fetching.current) return;
    fetching.current = true;
    Updates.fetchUpdateAsync().catch(() => {}).finally(() => { fetching.current = false; });
  }, [enabled, isUpdateAvailable, isUpdatePending, isDownloading]);

  // Restart into the new update. Screen-capture protection (FLAG_SECURE) is
  // dropped first: reloading with it on left a stuck black screen. The app
  // turns it back on as soon as the reloaded app has the user signed in.
  const restart = async () => {
    await ScreenCapture.allowScreenCaptureAsync('hipaa-phi-guard').catch(() => {});
    try {
      await Updates.reloadAsync({
        reloadScreenOptions: {
          backgroundColor: '#FFFFFF',
          image: require('../assets/images/splash-icon.png'),
          imageResizeMode: 'contain',
          spinner: { enabled: true, color: '#1565C0' },
          fade: true,
        },
      });
    } catch {
      ScreenCapture.preventScreenCaptureAsync('hipaa-phi-guard').catch(() => {});
    }
  };

  if (!enabled || !(isDownloading || isUpdatePending)) return null;

  const pct = typeof downloadProgress === 'number' && downloadProgress > 0 ? ` ${Math.round(downloadProgress * 100)}%` : '';

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 12 }]}>
      <View style={styles.banner} testID="ota-update-banner">
        {isUpdatePending ? (
          <>
            <Ionicons name="cloud-done-outline" size={18} color="#FFF" />
            <Text style={styles.text}>Update ready</Text>
            <TouchableOpacity
              style={styles.btn}
              onPress={restart}
              disabled={isRestarting}
              testID="ota-restart-btn"
            >
              {isRestarting ? <ActivityIndicator size="small" color="#1565C0" /> : <Text style={styles.btnText}>Restart</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <ActivityIndicator size="small" color="#FFF" />
            <Text style={styles.text}>Updating Implanr…{pct}</Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 1000, elevation: 20 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#1565C0', borderRadius: 24, paddingVertical: 10, paddingLeft: 16, paddingRight: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 6,
  },
  text: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  btn: { backgroundColor: '#FFF', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, minWidth: 72, alignItems: 'center' },
  btnText: { color: '#1565C0', fontSize: 13, fontWeight: '800' },
});
