import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import * as Print from 'expo-print';
import api, { getToken } from './api';

/**
 * Fetch the consent form PDF to a local cache file and return its URI (native only).
 * Used by both the Print and Download flows so we hit the backend just once.
 */
async function fetchConsentToCache(procedureId: string): Promise<string | null> {
  const token = await getToken('access_token');
  if (!token) {
    Alert.alert('Session expired', 'Please log in again.');
    return null;
  }
  const baseUrl = api.defaults.baseURL || '';
  const remoteUrl = `${baseUrl}/procedures/${procedureId}/consent-form-template`;
  const localUri = `${FileSystem.cacheDirectory}consent_${procedureId}_${Date.now()}.pdf`;
  const result = await FileSystem.downloadAsync(remoteUrl, localUri, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (result.status !== 200) {
    Alert.alert('Download failed', `Server returned ${result.status}.`);
    return null;
  }
  return result.uri;
}

/**
 * Download the consent PDF and open via native Share sheet (iOS/Android) or new
 * browser tab (web). Used when the user wants to save, email, or send the PDF.
 */
export async function downloadConsentTemplate(procedureId: string) {
  try {
    if (Platform.OS === 'web') {
      const res = await api.get(`/procedures/${procedureId}/consent-form-template`, {
        responseType: 'blob',
      });
      const blob = res.data as Blob;
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      return;
    }

    const uri = await fetchConsentToCache(procedureId);
    if (!uri) return;
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Patient Consent Form',
        UTI: 'com.adobe.pdf',
      });
    } else {
      await WebBrowser.openBrowserAsync(uri);
    }
  } catch (err: any) {
    const msg = err?.response?.data?.detail || err?.message || 'Could not generate consent form';
    Alert.alert('Download failed', msg);
  }
}

/**
 * Download the consent PDF and open the native print dialog (AirPrint / Android Print
 * Services) or the browser print dialog on web.
 */
export async function printConsentTemplate(procedureId: string) {
  try {
    if (Platform.OS === 'web') {
      const res = await api.get(`/procedures/${procedureId}/consent-form-template`, {
        responseType: 'blob',
      });
      const blob = res.data as Blob;
      const url = URL.createObjectURL(blob);
      // Use a hidden iframe to trigger the browser's native print dialog.
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          window.open(url, '_blank');
        }
      };
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch {}
        URL.revokeObjectURL(url);
      }, 60000);
      return;
    }

    const uri = await fetchConsentToCache(procedureId);
    if (!uri) return;
    // expo-print opens the OS print dialog — AirPrint on iOS, Android Print Services
    // on Android (supports Wi-Fi printers, Save to PDF, Google Cloud Print, etc.).
    await Print.printAsync({ uri });
  } catch (err: any) {
    const msg = err?.response?.data?.detail || err?.message || 'Could not open print dialog';
    Alert.alert('Print failed', msg);
  }
}
