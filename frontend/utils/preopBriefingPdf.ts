/**
 * iter-329: Sinus Lift Pre-Op Briefing PDF helpers.
 *
 * Mirrors the structure of consentPdf.ts — backend renders the PDF at
 * /api/procedures/{id}/preop-briefing (POST so we get a clean audit
 * log entry). On web we open the blob in a new tab; on native we
 * download to cache and hand to the OS share sheet.
 */
import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import api from './api';

export async function downloadPreopBriefing(procedureId: string) {
  try {
    if (Platform.OS === 'web') {
      const res = await api.post(`/procedures/${procedureId}/preop-briefing`, undefined, {
        responseType: 'blob',
      });
      const blob = res.data as Blob;
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      return;
    }

    // Native path: axios → blob → cache file → share sheet
    const res = await api.post(`/procedures/${procedureId}/preop-briefing`, undefined, {
      responseType: 'arraybuffer',
    });
    const localUri = `${FileSystem.cacheDirectory}preop_${procedureId}_${Date.now()}.pdf`;
    const b64 = arrayBufferToBase64(res.data as ArrayBuffer);
    await FileSystem.writeAsStringAsync(localUri, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(localUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Sinus Lift Pre-Op Briefing',
        UTI: 'com.adobe.pdf',
      });
    } else {
      await WebBrowser.openBrowserAsync(localUri);
    }
  } catch (err: any) {
    let detail = err?.response?.data?.detail || err?.message;
    // axios returns the error body as the *blob* when responseType=blob,
    // so try to decode it explicitly so the user sees the actual reason.
    if (err?.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        const parsed = JSON.parse(text);
        detail = parsed.detail || parsed.error || text;
      } catch {}
    }
    Alert.alert('Download failed', detail || 'Could not generate Pre-Op Briefing.');
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  // btoa is available in React-Native's runtime (Hermes) as well.
  return globalThis.btoa(binary);
}
