/**
 * Upload (or replace) a case's Patient Consent Form. Shared by the case page
 * and the nurse Home section so both send the file the same way and report
 * the real reason when an upload fails.
 */
import { Platform } from 'react-native';
import api from './api';
import type { PickedFile } from './attachPickerManager';

const EXT_BY_TYPE: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/heic': '.heic',
  'image/heif': '.heif',
};
const TYPE_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.heic': 'image/heic', '.heif': 'image/heif',
};
const ALLOWED_EXT = Object.keys(TYPE_BY_EXT);

// The server accepts a file by its name's extension, so make sure the name
// carries one that matches the file (camera / gallery names often don't).
function fileNameFor(picked: NonNullable<PickedFile>): string {
  const raw = (picked.name || 'consent_form').trim();
  const dot = raw.lastIndexOf('.');
  const ext = dot > 0 ? raw.slice(dot).toLowerCase() : '';
  if (ALLOWED_EXT.includes(ext)) return raw;
  const byType = EXT_BY_TYPE[(picked.type || '').toLowerCase()];
  return `${dot > 0 ? raw.slice(0, dot) : raw}${byType || ext || '.pdf'}`;
}

export async function uploadConsentFile(procedureId: string, picked: NonNullable<PickedFile>) {
  const name = fileNameFor(picked);
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  const type = picked.type && picked.type !== 'application/octet-stream'
    ? picked.type
    : TYPE_BY_EXT[ext] || 'application/pdf';
  const payload = new FormData();
  if (Platform.OS === 'web') {
    const blob = await fetch(picked.uri).then(r => r.blob());
    payload.append('file', blob, name);
  } else {
    payload.append('file', { uri: picked.uri, name, type } as any);
  }
  const res = await api.post(`/procedures/${procedureId}/upload-consent`, payload, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
  return res.data;
}

/** A readable reason for a failed upload, for the error alert. */
export function consentUploadError(err: any): string {
  const status = err?.response?.status;
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string' && detail) return detail;
  if (status === 413) return 'The file is too large. Please upload a smaller file (under 25 MB) or a photo instead of a scan.';
  if (status === 401) return 'Your session has expired. Please log in again and retry.';
  if (status === 403) return 'You are not allowed to upload the consent form for this case.';
  if (status) return `Upload failed (error ${status}). Please try again.`;
  if (err?.code === 'ECONNABORTED') return 'The upload took too long. Check your internet connection and try again.';
  if (err?.message === 'Network Error') return 'No internet connection, or the file could not be read. Please try again.';
  return err?.message || 'Could not upload consent form';
}
