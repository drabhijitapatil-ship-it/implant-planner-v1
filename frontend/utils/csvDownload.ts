/**
 * iter-365 — Shared CSV download utility.
 *
 * Web: `fetch()` with Authorization header → Blob → anchor download.
 * Native: `FileSystem.downloadAsync` with Authorization header → `expo-sharing`.
 *
 * Matches the working pattern in `admin/audit-log.tsx`.
 */
import { Alert, Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getToken } from './api';

/**
 * Download a CSV (or any text/binary) from a protected backend URL.
 * `absoluteUrl` must be the full URL including `/api/…`.
 * `suggestedFilename` — used as the download filename on web / share title on native.
 */
export async function downloadAuthenticated(
  absoluteUrl: string,
  suggestedFilename: string,
  mimeType: string = 'text/csv',
): Promise<void> {
  try {
    const token = (await getToken('access_token')) || '';
    if (Platform.OS === 'web') {
      const res = await fetch(absoluteUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Export failed (HTTP ${res.status})`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = suggestedFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    } else {
      const dest = `${FileSystem.cacheDirectory}${suggestedFilename}`;
      const r = await FileSystem.downloadAsync(absoluteUrl, dest, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.status !== 200) throw new Error(`Export failed (HTTP ${r.status})`);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(r.uri, { mimeType, dialogTitle: `Save ${suggestedFilename}` });
      } else {
        await Share.share({ url: r.uri });
      }
    }
  } catch (e: any) {
    Alert.alert('Download failed', e?.message || 'Could not download file');
    throw e;
  }
}
