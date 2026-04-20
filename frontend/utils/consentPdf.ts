import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import api from './api';

/**
 * Download the pre-filled consent form PDF for a procedure and open it with the
 * platform PDF viewer. On web, opens in a new tab. On native, saves to the cache
 * folder and opens the share sheet so the user can print / save / send.
 */
export async function downloadConsentTemplate(procedureId: string) {
  try {
    const res = await api.get(`/procedures/${procedureId}/consent-form-template`, {
      responseType: 'blob',
    });

    if (Platform.OS === 'web') {
      // On web, trigger a download / open directly from the blob.
      const blob = res.data as Blob;
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return;
    }

    // React Native: read the blob as base64, write to cache, open via share sheet.
    const blob = res.data as Blob;
    const base64 = await blobToBase64(blob);
    const fileUri = `${FileSystem.cacheDirectory}consent_${procedureId}.pdf`;
    await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Patient Consent Form',
        UTI: 'com.adobe.pdf',
      });
    } else {
      await WebBrowser.openBrowserAsync(fileUri);
    }
  } catch (err: any) {
    const msg = err?.response?.data?.detail || 'Could not generate consent form';
    Alert.alert('Download failed', msg);
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      // Strip the "data:*/*;base64," prefix.
      const comma = res.indexOf(',');
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
