/**
 * IntraoralPhotosSection — "Patient Intra-oral Photograph" uploader, shared by
 * Phase 2, Phase 3 and Phase 4 so they match Phase 1 (new-procedure.tsx)
 * exactly: two fixed-label slots (Occlusal View / Lateral-Frontal View), extra
 * slots with an editable custom label, thumbnail + "View Photograph" +
 * remove, and "Add Photograph".
 *
 * Value shape is the same as Phase 1's `intraoral_photos`:
 *   (null | { filename, original_name, content_type, label })[]
 * Files go through the same temp-upload route Phase 1 uses.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, ActivityIndicator, Alert, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api, { getToken } from '../utils/api';
import { showUploadPicker } from '../utils/uploadPicker';

export type IntraoralPhoto = {
  filename: string;
  original_name: string;
  content_type: string;
  label: string;
};
export type IntraoralPhotoSlots = (IntraoralPhoto | null)[];

export const INTRAORAL_LABELS = ['Occlusal View Photo', 'Lateral/Frontal View'];
export const emptyIntraoralSlots = (): IntraoralPhotoSlots => [null, null];

/** Slots from a saved list (restores labels; always at least the 2 fixed slots). */
export function slotsFromSaved(saved: any[] | null | undefined): IntraoralPhotoSlots {
  const out: IntraoralPhotoSlots = (saved || []).map((f: any, i: number) =>
    f && f.filename
      ? {
          filename: f.filename,
          original_name: f.original_name || '',
          content_type: f.content_type || '',
          label: f.label || (i < INTRAORAL_LABELS.length ? INTRAORAL_LABELS[i] : ''),
        }
      : null,
  );
  while (out.length < 2) out.push(null);
  return out;
}

/** Payload for the backend: uploaded photos only, with labels filled in. */
export function photosPayload(slots: IntraoralPhotoSlots): IntraoralPhoto[] {
  return slots
    .map((f, i) => (f ? { ...f, label: f.label || (i < INTRAORAL_LABELS.length ? INTRAORAL_LABELS[i] : '') } : null))
    .filter((f): f is IntraoralPhoto => !!f);
}

type Props = {
  value: IntraoralPhotoSlots;
  onChange: (next: IntraoralPhotoSlots) => void;
  /** Show the red asterisk + "Minimum 2" hint (validation is the caller's). */
  required?: boolean;
  title?: string;
  /** Prefix for testIDs so each phase's slots are distinguishable. */
  testIDPrefix?: string;
};

export default function IntraoralPhotosSection({
  value, onChange, required = false, title = 'Patient Intra-oral Photograph', testIDPrefix = 'intraoral',
}: Props) {
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [authToken, setAuthToken] = useState('');
  const baseUrl = api.defaults.baseURL || '';
  const slots = value.length >= 2 ? value : [...value, ...Array(2 - value.length).fill(null)];

  useEffect(() => {
    getToken('access_token').then((t) => setAuthToken(t || '')).catch(() => {});
  }, []);

  const setSlot = (idx: number, next: IntraoralPhoto | null) => {
    const u = [...slots];
    while (u.length <= idx) u.push(null);
    u[idx] = next;
    onChange(u);
  };

  const pickAt = async (idx: number) => {
    try {
      const picked = await showUploadPicker(['image/png', 'image/jpeg', 'image/heic', 'image/heif']);
      if (!picked) return;
      setUploadingIdx(idx);
      const form = new FormData();
      form.append('file', { uri: picked.uri, name: picked.name || 'intraoral.jpg', type: picked.type || 'image/jpeg' } as any);
      const res = await api.post('/uploads/cbct-temp', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setSlot(idx, {
        filename: res.data.cbct_file,
        original_name: res.data.cbct_original_name,
        content_type: res.data.cbct_content_type,
        label: slots[idx]?.label || (idx < INTRAORAL_LABELS.length ? INTRAORAL_LABELS[idx] : ''),
      });
    } catch (err: any) {
      Alert.alert('Upload Failed', err?.response?.data?.detail || 'Could not upload intra-oral photograph');
    } finally {
      setUploadingIdx(null);
    }
  };

  const fileUrl = (f: IntraoralPhoto) => `${baseUrl}/uploads/${f.filename}?token=${authToken}`;

  return (
    <View style={st.section} testID={`${testIDPrefix}-section`}>
      <Text style={st.sectionTitle}>
        {title} {required && <Text style={{ color: '#DC3545' }}>*</Text>}
      </Text>
      {slots.map((file, idx) => {
        const isExtra = idx >= 2;
        const fixedLabel = idx < INTRAORAL_LABELS.length ? INTRAORAL_LABELS[idx] : '';
        return (
          <View key={idx} style={{ marginBottom: 12 }} testID={`${testIDPrefix}-slot-${idx}`}>
            {isExtra ? (
              <TextInput
                style={st.labelInput}
                value={file?.label || ''}
                onChangeText={(t) => file && setSlot(idx, { ...file, label: t })}
                placeholder="e.g., Right buccal view"
                placeholderTextColor="#90A4AE"
                editable={!!file}
                testID={`${testIDPrefix}-label-${idx}`}
              />
            ) : file ? (
              <Text style={st.fixedLabel}>{file.label || fixedLabel}</Text>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 30, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#555' }}>{idx + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                {file ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Image
                      source={{ uri: fileUrl(file), headers: { Authorization: `Bearer ${authToken}` } }}
                      style={{ width: 36, height: 36, borderRadius: 6 }}
                      resizeMode="cover"
                    />
                    <TouchableOpacity
                      style={st.viewBtn}
                      onPress={() => Linking.openURL(fileUrl(file)).catch(() => Alert.alert('Error', 'Could not open file'))}
                      testID={`${testIDPrefix}-view-${idx}`}
                    >
                      <Text style={st.viewBtnText} numberOfLines={1}>View Photograph</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setSlot(idx, null)} testID={`${testIDPrefix}-remove-${idx}`}>
                      <Ionicons name="close-circle" size={22} color="#E53935" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={st.uploadBtn}
                    onPress={() => pickAt(idx)}
                    disabled={uploadingIdx === idx}
                    testID={`${testIDPrefix}-upload-${idx}`}
                  >
                    {uploadingIdx === idx ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload" size={18} color="#FFF" />
                        <Text style={st.uploadBtnText}>
                          {idx === 0 ? 'Upload Occlusal View Photo' : idx === 1 ? 'Upload Lateral/Frontal View' : 'Upload Photograph'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
              {isExtra && (
                <TouchableOpacity
                  onPress={() => { const u = [...slots]; u.splice(idx, 1); onChange(u); }}
                  testID={`${testIDPrefix}-remove-extra-${idx}`}
                >
                  <Ionicons name="remove-circle" size={26} color="#E53935" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}
      <TouchableOpacity style={st.addBtn} onPress={() => onChange([...slots, null])} testID={`${testIDPrefix}-add-extra`}>
        <Ionicons name="add-circle" size={26} color="#4CAF50" />
        <Text style={{ color: '#4CAF50', fontWeight: '700', fontSize: 14 }}>Add Photograph</Text>
      </TouchableOpacity>
      <Text style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
        {required ? 'Minimum 2 Photographs required. ' : ''}Accepted: PNG, JPEG, HEIC (Max 20 MB each)
      </Text>
    </View>
  );
}

// Same visual tokens as Phase 1's section / CBCT buttons in new-procedure.tsx.
const st = StyleSheet.create({
  section: {
    backgroundColor: '#FFF', borderRadius: 16, marginHorizontal: 16, marginBottom: 16, padding: 18,
    shadowColor: '#1565C0', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1565C0', marginBottom: 14, letterSpacing: 0.3 },
  labelInput: {
    fontSize: 13, fontWeight: '700', color: '#1565C0', marginBottom: 6, paddingVertical: 6, paddingHorizontal: 10,
    borderWidth: 1, borderColor: '#B3D4FC', borderRadius: 8, backgroundColor: '#F5FAFF',
  },
  fixedLabel: { fontSize: 13, fontWeight: '800', color: '#1565C0', marginBottom: 6, letterSpacing: 0.3 },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1565C0',
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20,
  },
  uploadBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  viewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#43A047',
    borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, flex: 1,
  },
  viewBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
});
