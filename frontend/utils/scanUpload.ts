import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File as FSFile } from 'expo-file-system';
import api from './api';

export type PickedScan = { uri: string; name: string; size: number; mimeType?: string; file?: any };

const ALLOWED = ['stl', 'ply', 'obj', 'zip', 'dcm', 'pdf'];
export const MAX_SCAN_BYTES = 500 * 1024 * 1024;

/** iter-Jun-2026: pick one or more scan exports (STL/PLY/OBJ/ZIP/DCM/PDF). */
export async function pickScanFiles(): Promise<PickedScan[]> {
  const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: '*/*' });
  if (res.canceled) return [];
  const out: PickedScan[] = [];
  for (const a of res.assets || []) {
    const ext = (a.name || '').split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED.includes(ext)) throw new Error(`"${a.name}" is not a supported type. Allowed: STL, PLY, OBJ, ZIP, DCM, PDF.`);
    if ((a.size || 0) > MAX_SCAN_BYTES) throw new Error(`"${a.name}" is larger than 500 MB.`);
    out.push({ uri: a.uri, name: a.name, size: a.size || 0, mimeType: a.mimeType, file: (a as any).file });
  }
  return out;
}

/**
 * Chunked, resumable-per-chunk upload: init → PUT chunks (5 MB) → complete.
 * Web sends raw Blob slices; native reads base64 slices via expo-file-system.
 */
export async function uploadScanFile(
  procedureId: string,
  picked: PickedScan,
  onProgress: (fraction: number) => void,
): Promise<any> {
  let size = picked.size;
  let webFile: Blob | null = null;
  if (Platform.OS === 'web') {
    webFile = picked.file || (await (await fetch(picked.uri)).blob());
    size = webFile!.size;
  }
  const init = await api.post(`/procedures/${procedureId}/scan-files/init`, {
    filename: picked.name, size, mime: picked.mimeType || null,
  });
  const { upload_id, chunk_size, total_chunks } = init.data;
  const base = `/procedures/${procedureId}/scan-files/${upload_id}`;
  let fsFile: FSFile | null = null;
  if (Platform.OS !== 'web') fsFile = new FSFile(picked.uri);

  for (let i = 0; i < total_chunks; i++) {
    const start = i * chunk_size;
    const end = Math.min(size, start + chunk_size);
    let attempt = 0;
    // retry each chunk up to 3 times before failing the whole upload
    for (;;) {
      try {
        if (Platform.OS === 'web') {
          const blob = webFile!.slice(start, end);
          await api.put(`${base}/chunk/${i}`, blob, { headers: { 'Content-Type': 'application/octet-stream' }, timeout: 120000 });
        } else {
          const handle = fsFile!.open();
          try {
            handle.offset = start;
            const bytes = handle.readBytes(end - start);
            const b64 = bytesToBase64(bytes);
            await api.put(`${base}/chunk/${i}?encoding=base64`, b64, { headers: { 'Content-Type': 'text/plain' }, timeout: 120000 });
          } finally {
            handle.close();
          }
        }
        break;
      } catch (e) {
        attempt += 1;
        if (attempt >= 3) throw e;
      }
    }
    onProgress((i + 1) / total_chunks);
  }
  const done = await api.post(`${base}/complete`, {}, { timeout: 600000 });
  return done.data;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof (globalThis as any).btoa === 'function') {
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH)) as any);
    return (globalThis as any).btoa(bin);
  }
  return (globalThis as any).Buffer.from(bytes).toString('base64');
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
