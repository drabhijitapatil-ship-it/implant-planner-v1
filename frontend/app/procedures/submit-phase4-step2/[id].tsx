import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import api, { getAuthFileUrl } from '../../../utils/api';
import { useAuth } from '../../../contexts/AuthContext';
import { PhaseHeader } from '../../../components/PhaseHeader';
import { Ionicons } from '@expo/vector-icons';
import { CHECKLIST_DATA } from '../../../constants/checklist';
import { showUploadPicker } from '../../../utils/uploadPicker';

const TRIAL_ITEMS = CHECKLIST_DATA.prosthetic_phase.step2.items;
const FULL_ARCH_TYPES = new Set(['All on 4', 'All on 6', 'All on X']);

type Upload = { filename: string; original_name: string; content_type: string };
type LabeledUpload = Upload & { label: string };

export default function Phase4Step2Screen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const isFaculty = user?.role === 'supervisor' || user?.role === 'implant_incharge';
  const notesLabel = isFaculty ? "Operator's Notes" : "Student Notes";
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);

  // Procedure context
  const [procedure, setProcedure] = useState<any>(null);
  const [loadingProc, setLoadingProc] = useState(true);

  // Form state
  const [trialChecklist, setTrialChecklist] = useState<Record<string, boolean>>({});
  const [studentNotes, setStudentNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  // Imaging uploads
  const [iopaUploads, setIopaUploads] = useState<Record<string, Upload>>({});
  const [opgUpload, setOpgUpload] = useState<Upload | null>(null);
  const [iopaUploadingFor, setIopaUploadingFor] = useState<string | null>(null);
  const [opgUploading, setOpgUploading] = useState(false);

  // Prosthesis photos: 2 mandatory pre-labeled + dynamic extras
  const [prosthesisPhotos, setProsthesisPhotos] = useState<(LabeledUpload | null)[]>([
    null, null,
  ]);
  const [photoLabels, setPhotoLabels] = useState<string[]>(['Frontal view', 'Occlusal view']);
  const [photoUploadingIdx, setPhotoUploadingIdx] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/procedures/${id}`);
        setProcedure(res.data);
      } catch (e: any) {
        Alert.alert('Error', e?.response?.data?.detail || 'Failed to load case');
      } finally {
        setLoadingProc(false);
      }
    })();
  }, [id]);

  const isFullArch = procedure && FULL_ARCH_TYPES.has(procedure.implant_procedure_type);
  const implantPositions: string[] = (procedure?.implant_plans || [])
    .map((p: any) => String(p.position || ''))
    .filter(Boolean);
  const isInchargeSelfCreated =
    user?.role === 'implant_incharge'
    && procedure?.created_by_role === 'implant_incharge'
    && user?.id === procedure?.created_by_id;

  const submitLabel = isInchargeSelfCreated ? 'Done' : 'Submit for Final Approval';

  const uploadFile = async (mimeAccept: string[]): Promise<Upload | null> => {
    const picked = await showUploadPicker(mimeAccept);
    if (!picked) return null;
    const fp = new FormData();
    fp.append('file', {
      uri: picked.uri,
      name: picked.name || 'upload.jpg',
      type: picked.mimeType || 'application/octet-stream',
    } as any);
    const res = await api.post('/uploads/media-temp', fp, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data as Upload;
  };

  const pickIopa = async (position: string) => {
    setIopaUploadingFor(position);
    try {
      const up = await uploadFile(['image/png', 'image/jpeg', 'image/heic', 'image/heif', 'application/pdf']);
      if (up) setIopaUploads(prev => ({ ...prev, [position]: up }));
    } catch (e: any) {
      Alert.alert('Upload Failed', e?.response?.data?.detail || 'Could not upload IOPA');
    } finally {
      setIopaUploadingFor(null);
    }
  };

  const pickOpg = async () => {
    setOpgUploading(true);
    try {
      const up = await uploadFile(['image/png', 'image/jpeg', 'image/heic', 'image/heif', 'application/pdf']);
      if (up) setOpgUpload(up);
    } catch (e: any) {
      Alert.alert('Upload Failed', e?.response?.data?.detail || 'Could not upload OPG');
    } finally {
      setOpgUploading(false);
    }
  };

  const pickPhoto = async (idx: number) => {
    setPhotoUploadingIdx(idx);
    try {
      const up = await uploadFile(['image/png', 'image/jpeg', 'image/heic', 'image/heif']);
      if (up) {
        setProsthesisPhotos(prev => {
          const next = [...prev];
          next[idx] = { ...up, label: photoLabels[idx] || `Photo ${idx + 1}` };
          return next;
        });
      }
    } catch (e: any) {
      Alert.alert('Upload Failed', e?.response?.data?.detail || 'Could not upload photo');
    } finally {
      setPhotoUploadingIdx(null);
    }
  };

  const addPhotoSlot = () => {
    setProsthesisPhotos(prev => [...prev, null]);
    setPhotoLabels(prev => [...prev, '']);
  };

  const removePhotoSlot = (idx: number) => {
    setProsthesisPhotos(prev => prev.filter((_, i) => i !== idx));
    setPhotoLabels(prev => prev.filter((_, i) => i !== idx));
  };

  const updatePhotoLabel = (idx: number, label: string) => {
    setPhotoLabels(prev => prev.map((l, i) => (i === idx ? label : l)));
    setProsthesisPhotos(prev => prev.map((p, i) => (p && i === idx ? { ...p, label } : p)));
  };

  const callApproveForSelfCreated = async () => {
    // After Phase 4 Step 2 submit, status becomes 'pending_final_delivery'.
    // Auto-approve via the Step 2 approve endpoint.
    try {
      await api.post(`/procedures/${id}/stage2/prosthetic/step2/approve`, {
        action: 'approve',
        comment: '',
      });
    } catch (e: any) {
      // Non-fatal: case still in pending state if approve fails; user gets normal flow
      Alert.alert('Auto-approve note', e?.response?.data?.detail || 'Submit succeeded, but auto-approval did not run. Please approve from the case page.');
    }
  };

  const handleSubmit = async () => {
    const unchecked = TRIAL_ITEMS.filter(i => !trialChecklist[i.id]);
    if (unchecked.length > 0) {
      Alert.alert('Checklist Incomplete', `Please complete: ${unchecked[0].label}`);
      return;
    }
    if (!confirmed) {
      Alert.alert('Confirmation Required', 'Please confirm the prosthesis delivery statement.');
      return;
    }
    if (isFullArch) {
      if (!opgUpload) {
        Alert.alert('OPG Required', 'Upload the post-delivery OPG for this full-arch case.');
        return;
      }
    } else {
      const missing = implantPositions.filter(pos => !iopaUploads[pos]);
      if (implantPositions.length > 0 && missing.length > 0) {
        Alert.alert('IOPA Required', `Upload IOPA for tooth: ${missing.join(', ')}`);
        return;
      }
    }
    const validPhotos = prosthesisPhotos.filter((p): p is LabeledUpload => !!p);
    if (validPhotos.length < 2) {
      Alert.alert('Prosthesis Photos Required', 'Upload at least 2 final intraoral prosthesis photos.');
      return;
    }
    // Ensure every photo has a label
    if (validPhotos.some(p => !p.label || !p.label.trim())) {
      Alert.alert('Photo Label Required', 'Every uploaded prosthesis photo needs a descriptive label.');
      return;
    }

    setLoading(true);
    try {
      await api.post(`/procedures/${id}/stage2/prosthetic/step2`, {
        trial_checklist: trialChecklist,
        student_notes: studentNotes || null,
        confirmation_statement: confirmed,
        iopa_uploads: isFullArch ? null : iopaUploads,
        opg_upload: isFullArch ? opgUpload : null,
        prosthesis_photos: validPhotos,
      });

      if (isInchargeSelfCreated) {
        await callApproveForSelfCreated();
      }
      setCompleted(true);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to submit');
    } finally {
      setLoading(false);
    }
  };

  // ── Success / Done state ──
  if (completed) {
    return (
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <PhaseHeader title="Phase 4 - Prosthetic Rehabilitation" subtitle="Step 2 of 2: Final Restoration" />
        <View style={s.successWrap}>
          <View style={s.successIcon}>
            <Ionicons name="trophy" size={64} color="#43A047" />
          </View>
          <Text style={s.successTitle}>
            {isInchargeSelfCreated ? 'Treatment Marked Complete' : 'Submitted for Final Approval'}
          </Text>
          <Text style={s.successMsg}>
            {isInchargeSelfCreated
              ? 'Phase 4 Step 2 has been auto-approved. The treatment is now sealed and the case PDF is ready to download.'
              : 'Phase 4 Step 2 has been submitted. Once your supervisor and implant in-charge approve, the treatment will be marked complete.'}
          </Text>
          <TouchableOpacity
            style={[s.submitBtn, { backgroundColor: '#1565C0', marginTop: 24 }]}
            onPress={() => router.replace(`/procedures/${id}`)}
            testID="phase4-step2-go-to-case"
          >
            <Ionicons name="document-text" size={20} color="#FFF" />
            <Text style={s.submitText}>View Case</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loadingProc) {
    return (
      <SafeAreaView style={s.container}>
        <PhaseHeader title="Phase 4 - Prosthetic Rehabilitation" subtitle="Step 2 of 2: Final Restoration" />
        <View style={s.successWrap}><ActivityIndicator size="large" color="#1565C0" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <PhaseHeader title="Phase 4 - Prosthetic Rehabilitation" subtitle="Step 2 of 2: Final Restoration" testID="phase4-step2-submit-header" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} nestedScrollEnabled>
          <View style={s.infoBox}>
            <Ionicons name="star" size={22} color="#FF6F00" />
            <Text style={s.infoText}>
              This is the final step. Complete the trial and delivery checklist, attach the post-delivery imaging and final prosthesis photos to finalize the treatment.
            </Text>
          </View>

          {/* ── Trial Checklist ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="flask-outline" size={20} color="#D84315" />
              <Text style={s.sectionTitle}>Trial and Delivery Checklist <Text style={{ color: '#DC3545' }}>*</Text></Text>
            </View>
            {TRIAL_ITEMS.map(item => (
              <View key={item.id} style={s.checkRow}>
                <Text style={[s.checkLabel, { flex: 1 }]}>{item.label}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {['Yes', 'No'].map(opt => (
                    <TouchableOpacity key={opt}
                      style={[{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#D0DCE8', backgroundColor: '#F8FAFC', minWidth: 50, alignItems: 'center' as const },
                        trialChecklist[item.id] === true && opt === 'Yes' && { borderColor: '#4CAF50', backgroundColor: '#4CAF50' },
                        trialChecklist[item.id] === false && opt === 'No' && { borderColor: '#F44336', backgroundColor: '#F44336' }]}
                      onPress={() => setTrialChecklist(prev => ({ ...prev, [item.id]: opt === 'Yes' }))}>
                      <Text style={[{ fontSize: 13, color: '#666', fontWeight: '600' as const },
                        (trialChecklist[item.id] === true && opt === 'Yes') || (trialChecklist[item.id] === false && opt === 'No') ? { color: '#FFF' } : {}]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </View>

          {/* ── Imaging: IOPA per implant OR OPG ── */}
          <View style={s.section} testID="phase4-step2-imaging-section">
            <View style={s.sectionHeader}>
              <Ionicons name="images-outline" size={20} color="#0D47A1" />
              <Text style={s.sectionTitle}>
                {isFullArch ? 'Post-Delivery OPG' : 'Post-Delivery IOPA (per implant)'}
                <Text style={{ color: '#DC3545' }}> *</Text>
              </Text>
            </View>

            {isFullArch ? (
              <View style={s.uploadRow}>
                {opgUpload ? (
                  <>
                    <TouchableOpacity style={s.viewBtn}
                      onPress={() => {
                        const url = getAuthFileUrl(`/uploads/${opgUpload.filename}`);
                        if (Platform.OS === 'web') window.open(url, '_blank');
                      }}
                      testID="opg-view-btn">
                      <Ionicons name="document-text" size={16} color="#0D47A1" />
                      <Text style={s.viewBtnText} numberOfLines={1}>{opgUpload.original_name}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setOpgUpload(null)} testID="opg-remove-btn">
                      <Ionicons name="close-circle" size={24} color="#D32F2F" />
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity style={s.uploadBtn} onPress={pickOpg} disabled={opgUploading} testID="opg-upload-btn">
                    {opgUploading ? <ActivityIndicator color="#0D47A1" /> : (
                      <>
                        <Ionicons name="cloud-upload-outline" size={18} color="#0D47A1" />
                        <Text style={s.uploadBtnText}>Upload OPG</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <>
                {implantPositions.length === 0 && (
                  <Text style={s.helperText}>No implants found on this case — IOPA upload is skipped.</Text>
                )}
                {implantPositions.map(pos => {
                  const up = iopaUploads[pos];
                  return (
                    <View key={pos} style={[s.uploadRow, { marginBottom: 8 }]} testID={`iopa-row-${pos}`}>
                      <View style={s.toothBadge}><Text style={s.toothBadgeText}>{pos}</Text></View>
                      {up ? (
                        <>
                          <TouchableOpacity style={[s.viewBtn, { flex: 1 }]}
                            onPress={() => {
                              const url = getAuthFileUrl(`/uploads/${up.filename}`);
                              if (Platform.OS === 'web') window.open(url, '_blank');
                            }}
                            testID={`iopa-view-${pos}`}>
                            <Ionicons name="document-text" size={16} color="#0D47A1" />
                            <Text style={s.viewBtnText} numberOfLines={1}>{up.original_name}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => setIopaUploads(prev => { const c = { ...prev }; delete c[pos]; return c; })} testID={`iopa-remove-${pos}`}>
                            <Ionicons name="close-circle" size={22} color="#D32F2F" />
                          </TouchableOpacity>
                        </>
                      ) : (
                        <TouchableOpacity style={[s.uploadBtn, { flex: 1 }]} onPress={() => pickIopa(pos)}
                          disabled={iopaUploadingFor === pos} testID={`iopa-upload-${pos}`}>
                          {iopaUploadingFor === pos ? <ActivityIndicator color="#0D47A1" /> : (
                            <>
                              <Ionicons name="cloud-upload-outline" size={16} color="#0D47A1" />
                              <Text style={s.uploadBtnText}>Upload IOPA — Tooth {pos}</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </View>

          {/* ── Prosthesis Photos ── */}
          <View style={s.section} testID="phase4-step2-photos-section">
            <View style={s.sectionHeader}>
              <Ionicons name="camera-outline" size={20} color="#6A1B9A" />
              <Text style={s.sectionTitle}>Upload Prosthesis Photos <Text style={{ color: '#DC3545' }}>*</Text></Text>
            </View>
            <Text style={s.helperText}>Minimum 2 intraoral photos of the completed final prosthesis. Tap "+" to add more views.</Text>
            {prosthesisPhotos.map((p, idx) => (
              <View key={idx} style={s.photoRow} testID={`photo-row-${idx}`}>
                <TextInput
                  style={[s.input, { flex: 1, marginRight: 8 }]}
                  value={photoLabels[idx] ?? ''}
                  onChangeText={(t) => updatePhotoLabel(idx, t)}
                  placeholder={idx === 0 ? 'Frontal view' : idx === 1 ? 'Occlusal view' : 'Label (e.g., Right buccal view)'}
                  testID={`photo-label-${idx}`}
                />
                {p ? (
                  <>
                    <TouchableOpacity style={[s.viewBtn, { maxWidth: 110 }]}
                      onPress={() => {
                        const url = getAuthFileUrl(`/uploads/${p.filename}`);
                        if (Platform.OS === 'web') window.open(url, '_blank');
                      }}
                      testID={`photo-view-${idx}`}>
                      <Ionicons name="image" size={14} color="#0D47A1" />
                      <Text style={s.viewBtnText} numberOfLines={1}>{p.original_name}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setProsthesisPhotos(prev => prev.map((x, i) => (i === idx ? null : x)))} testID={`photo-clear-${idx}`}>
                      <Ionicons name="close-circle" size={20} color="#D32F2F" />
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity style={s.uploadBtn} onPress={() => pickPhoto(idx)} disabled={photoUploadingIdx === idx} testID={`photo-upload-${idx}`}>
                    {photoUploadingIdx === idx ? <ActivityIndicator color="#0D47A1" size="small" /> : (
                      <>
                        <Ionicons name="cloud-upload-outline" size={14} color="#0D47A1" />
                        <Text style={s.uploadBtnText}>Upload</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
                {idx >= 2 && (
                  <TouchableOpacity onPress={() => removePhotoSlot(idx)} testID={`photo-remove-slot-${idx}`} style={{ marginLeft: 6 }}>
                    <Ionicons name="trash-outline" size={18} color="#D32F2F" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity style={s.addPhotoBtn} onPress={addPhotoSlot} testID="photo-add-slot-btn">
              <Ionicons name="add-circle" size={18} color="#6A1B9A" />
              <Text style={{ color: '#6A1B9A', fontWeight: '700' }}>Add another photo</Text>
            </TouchableOpacity>
          </View>

          {/* ── Notes ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="document-text-outline" size={20} color="#00695C" />
              <Text style={s.sectionTitle}>Notes</Text>
            </View>
            <View style={s.field}>
              <Text style={s.label}>{notesLabel}</Text>
              <TextInput style={[s.input, s.textArea]} value={studentNotes} onChangeText={setStudentNotes}
                placeholder="Final observations, occlusion notes, delivery notes..."
                multiline numberOfLines={4} testID="phase4-step2-notes" />
            </View>
            {user?.role !== 'implant_incharge' && (
              <Text style={s.helperText} testID="phase4-step2-approval-helper">
                {user?.role === 'supervisor'
                  ? 'Implant In-Charge remark will be added during approval.'
                  : 'Supervisor and In-Charge remarks added during approval.'}
              </Text>
            )}
          </View>

          {/* ── Confirmation Statement ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#1B5E20" />
              <Text style={s.sectionTitle}>Confirmation</Text>
            </View>
            <Text style={[s.confirmText, { marginBottom: 12 }]}>
              I hereby confirm that the prosthesis has been delivered to the patient, all trial procedures have been completed satisfactorily, and the treatment is ready for final sign-off.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#333', flex: 1 }}>Treatment Confirmed Complete</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {['Yes', 'No'].map(opt => (
                  <TouchableOpacity key={opt}
                    style={[{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#D0DCE8', backgroundColor: '#F8FAFC', minWidth: 50, alignItems: 'center' as const },
                      confirmed === true && opt === 'Yes' && { borderColor: '#4CAF50', backgroundColor: '#4CAF50' },
                      confirmed === false && opt === 'No' && { borderColor: '#F44336', backgroundColor: '#F44336' }]}
                    onPress={() => setConfirmed(opt === 'Yes')}>
                    <Text style={[{ fontSize: 13, color: '#666', fontWeight: '600' as const },
                      (confirmed === true && opt === 'Yes') || (confirmed === false && opt === 'No') ? { color: '#FFF' } : {}]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* ── Submit ── */}
          <View style={{ padding: 16, paddingBottom: 32 }}>
            <TouchableOpacity style={[s.submitBtn, loading && { opacity: 0.6 }]} onPress={handleSubmit}
              disabled={loading} testID="phase4-step2-submit">
              {loading ? <ActivityIndicator color="#FFF" /> : (
                <><Ionicons name={isInchargeSelfCreated ? 'checkmark-circle' : 'trophy'} size={22} color="#FFF" />
                <Text style={s.submitText}>{submitLabel}</Text></>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  scroll: { paddingBottom: 32 },
  pageTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A2E', textAlign: 'center', paddingVertical: 16 },
  infoBox: { flexDirection: 'row', backgroundColor: '#FFF3E0', margin: 16, padding: 14, borderRadius: 12, gap: 10, borderWidth: 1, borderColor: '#FFE0B2' },
  infoText: { flex: 1, fontSize: 13, color: '#E65100', lineHeight: 20 },
  section: { backgroundColor: '#FFF', marginHorizontal: 16, marginBottom: 16, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E8EDF2' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E' },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 10, fontSize: 13, backgroundColor: '#FAFAFA', minHeight: 40 },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  helperText: { fontSize: 12, color: '#999', fontStyle: 'italic', marginTop: 4, marginBottom: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  checkLabel: { flex: 1, fontSize: 14, color: '#333', lineHeight: 20 },
  confirmRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8 },
  confirmText: { flex: 1, fontSize: 13, color: '#333', lineHeight: 20 },
  submitBtn: { flexDirection: 'row', backgroundColor: '#1B5E20', borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  uploadRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E3F2FD', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: '#90CAF9' },
  uploadBtnText: { fontSize: 12, fontWeight: '700', color: '#0D47A1' },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: '#90CAF9' },
  viewBtnText: { fontSize: 12, fontWeight: '600', color: '#0D47A1' },
  toothBadge: { backgroundColor: '#0D47A1', borderRadius: 6, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  toothBadgeText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  addPhotoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingVertical: 10, borderRadius: 8, backgroundColor: '#F3E5F5', borderWidth: 1, borderColor: '#CE93D8', marginTop: 4 },
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  successIcon: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  successTitle: { fontSize: 22, fontWeight: '800', color: '#1B5E20', textAlign: 'center', marginBottom: 12 },
  successMsg: { fontSize: 14, color: '#37474F', textAlign: 'center', lineHeight: 22 },
});
