import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import api, { getToken } from './api';

/**
 * Download the signed prescription PDF and open it via the native Share sheet
 * (iOS/Android) or a new browser tab (web). Mirrors utils/consentPdf.ts.
 */
export async function downloadPrescriptionPdf(procedureId: string) {
  try {
    if (Platform.OS === 'web') {
      const res = await api.get(`/procedures/${procedureId}/prescription/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      return;
    }
    const token = await getToken('access_token');
    if (!token) { Alert.alert('Session expired', 'Please log in again.'); return; }
    const baseUrl = api.defaults.baseURL || '';
    const localUri = `${FileSystem.cacheDirectory}prescription_${procedureId}_${Date.now()}.pdf`;
    const result = await FileSystem.downloadAsync(
      `${baseUrl}/procedures/${procedureId}/prescription/pdf`, localUri,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (result.status !== 200) { Alert.alert('Download failed', `Server returned ${result.status}.`); return; }
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: 'Prescription', UTI: 'com.adobe.pdf' });
    } else {
      await WebBrowser.openBrowserAsync(result.uri);
    }
  } catch (err: any) {
    const msg = err?.response?.data?.detail || err?.message || 'Could not generate the prescription';
    Alert.alert('Download failed', msg);
  }
}
