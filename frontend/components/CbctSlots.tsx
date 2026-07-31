/**
 * iter-396 — Reusable Phase-1-style CBCT upload slots (numbered rows, blue
 * upload buttons, View/remove, Add extra). Owns upload + auth-token logic.
 * files: (file|null)[] controlled by the parent.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api, { getToken } from '../utils/api';
import { showUploadPicker } from '../utils/uploadPicker';

export type CbctFile = { filename: string; original_name: string; content_type: string } | null;

export default function CbctSlots({ files, onChange, testPrefix = 'aug' }: {
  files: CbctFile[];
  onChange: (next: CbctFile[]) => void;
  testPrefix?: string;
}) {
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [authToken, setAuthToken] = useState('');
  useEffect(() => { getToken('access_token').then(t => setAuthToken(t || '')); }, []);
  const baseUrl = api.defaults.baseURL || '';

  const pickAtIndex = async (idx: number) => {
    try {
      const picked = await showUploadPicker(['application/pdf', 'image/png', 'image/jpeg', 'image/heic', 'image/heif']);
      if (!picked) return;
      setUploadingIdx(idx);
      const fd = new FormData();
      fd.append('file', { uri: picked.uri, name: picked.name || 'cbct_report.pdf', type: picked.type || 'application/pdf' } as any);
      const res = await api.post('/uploads/cbct-temp', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const u = [...files];
      u[idx] = { filename: res.data.cbct_file, original_name: res.data.cbct_original_name, content_type: res.data.cbct_content_type };
      onChange(u);
    } catch (e: any) {
      Alert.alert('Upload Failed', e?.response?.data?.detail || 'Could not upload CBCT file');
    } finally { setUploadingIdx(null); }
  };

  return (
    <View>
      {files.map((file, idx) => {
        const isExtra = idx >= 2;
        return (
          <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }} testID={`${testPrefix}-cbct-slot-${idx}`}>
            <View style={{ width: 30, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#555' }}>{idx + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              {file ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {file.filename.match(/\.(png|jpg|jpeg)$/i) ? (
                    <Image source={{ uri: `${baseUrl}/uploads/${file.filename}?token=${authToken}`, headers: { Authorization: `Bearer ${authToken}` } }}
                      style={{ width: 36, height: 36, borderRadius: 6 }} resizeMode="cover" />
                  ) : (
                    <Ionicons name="document-attach" size={22} color="#4CAF50" />
                  )}
                  <TouchableOpacity
                    style={s.viewBtn}
                    onPress={() => Linking.openURL(`${baseUrl}/uploads/${file.filename}?token=${authToken}`).catch(() => Alert.alert('Error', 'Could not open file'))}
                    testID={`${testPrefix}-view-cbct-${idx}`}
                  >
                    <Text style={s.viewBtnText} numberOfLines={1}>View CBCT Report</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { const u = [...files]; u[idx] = null; onChange(u); }} testID={`${testPrefix}-remove-cbct-${idx}`}>
                    <Ionicons name="close-circle" size={22} color="#E53935" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={s.uploadBtn} onPress={() => pickAtIndex(idx)} disabled={uploadingIdx === idx} testID={`${testPrefix}-upload-cbct-${idx}`}>
                  {uploadingIdx === idx ? <ActivityIndicator color="#FFF" size="small" /> : (
                    <><Ionicons name="cloud-upload" size={18} color="#FFF" /><Text style={s.uploadBtnText}>Upload CBCT Report</Text></>
                  )}
                </TouchableOpacity>
              )}
            </View>
            {isExtra && (
              <TouchableOpacity onPress={() => onChange(files.filter((_, j) => j !== idx))} testID={`${testPrefix}-remove-extra-cbct-${idx}`}>
                <Ionicons name="remove-circle" size={26} color="#E53935" />
              </TouchableOpacity>
            )}
          </View>
        );
      })}
      <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 }}
        onPress={() => onChange([...files, null])} testID={`${testPrefix}-add-extra-cbct-btn`}>
        <Ionicons name="add-circle" size={26} color="#4CAF50" />
        <Text style={{ color: '#4CAF50', fontWeight: '700', fontSize: 14 }}>Add CBCT Report</Text>
      </TouchableOpacity>
    </View>
  );
}

export const padCbct = (files: any[]): CbctFile[] =>
  files.length >= 2 ? files : [...files, ...new Array(2 - files.length).fill(null)];

const s = StyleSheet.create({
  viewBtn: { flex: 1, backgroundColor: '#E3F2FD', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: '#90CAF9' },
  viewBtnText: { color: '#1565C0', fontSize: 13, fontWeight: '700' },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20 },
  uploadBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
