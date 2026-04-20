import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import api, { getToken } from './api';

/**
 * Download the pre-filled consent form PDF for a procedure and open it.
 * - Web: axios blob → window.open.
 * - Native: FileSystem.downloadAsync with Authorization header → Share sheet.
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

    // ── Native path ──
    const token = await getToken('access_token');
    if (!token) {
      Alert.alert('Session expired', 'Please log in again.');
      return;
    }
    const baseUrl = api.defaults.baseURL || '';
    const remoteUrl = `${baseUrl}/procedures/${procedureId}/consent-form-template`;
    const localUri = `${FileSystem.cacheDirectory}consent_${procedureId}.pdf`;

    const result = await FileSystem.downloadAsync(remoteUrl, localUri, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (result.status !== 200) {
      Alert.alert('Download failed', `Server returned ${result.status}.`);
      return;
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(result.uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Patient Consent Form',
        UTI: 'com.adobe.pdf',
      });
    } else {
      await WebBrowser.openBrowserAsync(result.uri);
    }
  } catch (err: any) {
    const msg = err?.response?.data?.detail || err?.message || 'Could not generate consent form';
    Alert.alert('Download failed', msg);
  }
}
