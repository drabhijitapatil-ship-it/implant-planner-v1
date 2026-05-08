import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Switch, Image, Linking, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import api, { getAuthFileUrl, getToken } from '../../../utils/api';
import { showUploadPicker } from '../../../utils/uploadPicker';
import { useAuth } from '../../../contexts/AuthContext';
import BackToDashboard from '../../../components/BackToDashboard';
import { PhaseHeader } from '../../../components/PhaseHeader';
import { Ionicons } from '@expo/vector-icons';
import { CHECKLIST_DATA } from '../../../constants/checklist';

const CHECKLIST_ITEMS = CHECKLIST_DATA.second_stage.items;

export default function Stage2SurgicalSubmissionScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const isFaculty = user?.role === 'supervisor' || user?.role === 'implant_incharge';
  const notesLabel = isFaculty ? "Operator's Notes" : "Student Notes";
  const [loading, setLoading] = useState(false);

  // ── Phase 2 context (drives the Phase 3 simplified checklist + banner per product spec) ──
  // If Phase 2 selected "Immediate Loading Done" or "Healing Abutment Placed",
  // we show a summary banner at the top and trim the checklist to 4 items
  // (no All-Components-Available, no Healing-Abutment-Placed rows).
  const [phase2Component, setPhase2Component] = useState<string>('');
  const [phase2ProsthesisType, setPhase2ProsthesisType] = useState<string>('');
  const [phase2ProsthesisOther, setPhase2ProsthesisOther] = useState<string>('');
  const [phase2HealingCuffs, setPhase2HealingCuffs] = useState<string[]>([]);
  const [createdById, setCreatedById] = useState<string | null>(null);
  const [createdByRole, setCreatedByRole] = useState<string | null>(null);
  const [doneCompleted, setDoneCompleted] = useState(false);

  // Always drop the Healing-Abutment-Placed checklist row — by product spec, Phase 3 never
  // re-captures it. When Phase 2 had Immediate Loading / Healing Abutment, also drop the
  // All-Components-Available row so only the 4 spec'd items remain.
  const simplifyChecklist = phase2Component === 'Immediate Loading Done'
    || phase2Component === 'Healing Abutment Placed';
  const CHECKLIST_ITEMS_FILTERED = React.useMemo(() => (
    CHECKLIST_DATA.second_stage.items.filter(i => {
      if (i.id === 'healing_abutment') return false; // never surface in Phase 3 per spec
      if (simplifyChecklist && i.id === 'components_available') return false;
      return true;
    })
  ), [simplifyChecklist]);

  // Checklist state
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});
  // Text fields embedded in checklist
  const [isqValues, setIsqValues] = useState<string[]>(['']);
  const [healingAbutmentHeight, setHealingAbutmentHeight] = useState<string[]>(['']);
  const [implantPositions, setImplantPositions] = useState<string[]>([]);
  // IOPA uploads
  const [iopaFiles, setIopaFiles] = useState<(null | { filename: string; original_name: string; tooth_label: string })[]>([]);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [authToken, setAuthToken] = useState('');

  useEffect(() => { getToken('access_token').then(t => setAuthToken(t || '')); }, []);
  // Notes
  const [studentNotes, setStudentNotes] = useState('');

  // ── Phase 2 edit-request workflow ──
  // Student can flag wrong prosthesis/cuff data locked in Phase 2.
  // Non-blocking: student can still submit Phase 3, sees a pending-banner
  // until Supervisor/In-Charge resolves (via Phase2EditModal on case-detail).
  const [pendingEditRequest, setPendingEditRequest] = useState<any>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editFieldsSel, setEditFieldsSel] = useState<Record<string, boolean>>({});
  const [editNote, setEditNote] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const isOwner = !!user && user.role === 'student';

  useEffect(() => { loadImplantPlan(); }, []);

  const loadImplantPlan = async () => {
    try {
      const res = await api.get(`/procedures/${id}/implant-plan`);
      const count = res.data.number_of_implants || 1;
      const positions = (res.data.implant_plans || []).map((p: any) => p.position);
      setImplantPositions(positions);
      setHealingAbutmentHeight(new Array(count).fill(''));
      setIsqValues(new Array(count).fill(''));
      setIopaFiles(new Array(count).fill(null));
    } catch {
      setHealingAbutmentHeight(['']);
      setIsqValues(['']);
      setIopaFiles([null]);
    }
    // Pull Phase 2 fields so we can render the Phase 3 banner and decide checklist shape.
    // Phase 2 surgical fields are nested under `phase2_data` by the backend.
    try {
      const p = await api.get(`/procedures/${id}`);
      const d = p.data || {};
      const p2 = d.phase2_data || {};
      setPhase2Component(p2.prosthetic_component || '');
      setPhase2ProsthesisType(p2.prosthesis_type || '');
      setPhase2ProsthesisOther(p2.prosthesis_type_other || '');
      setCreatedById(d.created_by_id || null);
      setCreatedByRole(d.created_by_role || null);
      if (Array.isArray(p2.healing_abutment_cuff_height)) setPhase2HealingCuffs(p2.healing_abutment_cuff_height);
      // Latest pending edit request (backend blocks more than one at a time).
      const reqs: any[] = Array.isArray(d.phase2_edit_requests) ? d.phase2_edit_requests : [];
      setPendingEditRequest(reqs.find(r => r?.status === 'pending') || null);
    } catch {}
  };

  // ── Phase 2 edit-request handlers (student only) ──
  const openEditRequestModal = () => {
    setEditFieldsSel({});
    setEditNote('');
    setEditModalOpen(true);
  };
  const submitEditRequest = async () => {
    const chosen = Object.keys(editFieldsSel).filter(k => editFieldsSel[k]);
    if (chosen.length === 0 && !editNote.trim()) {
      Alert.alert('Nothing to send', 'Please select at least one field or add a note.');
      return;
    }
    setEditSubmitting(true);
    try {
      const res = await api.post(`/procedures/${id}/phase2-edit-request`, {
        fields: chosen,
        note: editNote.trim() || null,
      });
      setPendingEditRequest(res.data);
      setEditModalOpen(false);
      Alert.alert('Request sent', 'Your Supervisor and Implant In-Charge have been notified. You can still submit Phase 3 — a pending-edit indicator will stay visible until they update the data.');
    } catch (err: any) {
      Alert.alert('Could not send', err?.response?.data?.detail || 'Failed to send edit request');
    } finally {
      setEditSubmitting(false);
    }
  };
  const cancelEditRequest = async () => {
    if (!pendingEditRequest?.id) return;
    try {
      await api.post(`/procedures/${id}/phase2-edit-request/${pendingEditRequest.id}/cancel`);
      setPendingEditRequest(null);
    } catch (err: any) {
      Alert.alert('Could not cancel', err?.response?.data?.detail || 'Failed to cancel request');
    }
  };

  const toggleChecklist = (itemId: string) => {
    setChecklistState(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  // ── IOPA Upload helpers ──
  const getIopaLabel = (idx: number): string => {
    return implantPositions[idx] ? `Tooth #${implantPositions[idx]}` : `Implant ${idx + 1}`;
  };

  const pickIopaFile = async (idx: number) => {
    try {
      const picked = await showUploadPicker(['image/png', 'image/jpeg', 'image/heic', 'image/heif', 'application/pdf']);
      if (!picked) return;
      setUploadingIdx(idx);
      const formPayload = new FormData();
      formPayload.append('file', {
        uri: picked.uri, name: picked.name || 'iopa.jpg', type: picked.type || 'image/jpeg',
      } as any);
      const res = await api.post('/uploads/cbct-temp', formPayload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const updated = [...iopaFiles];
      updated[idx] = {
        filename: res.data.cbct_file,
        original_name: res.data.cbct_original_name,
        tooth_label: getIopaLabel(idx),
      };
      setIopaFiles(updated);
    } catch (err: any) {
      Alert.alert('Upload Failed', err.response?.data?.detail || 'Could not upload IOPA');
    } finally {
      setUploadingIdx(null);
    }
  };

  const handleSubmit = async () => {
    // Validate all visible checklist items answered — ISQ item is optional per product spec
    // (user can tick Yes + enter a value, or skip entirely).
    const unanswered = CHECKLIST_ITEMS_FILTERED.filter(
      i => i.id !== 'isq_checked' && checklistState[i.id] === undefined
    );
    if (unanswered.length > 0) {
      Alert.alert('Checklist Incomplete', `Please answer: ${unanswered[0].label}`);
      return;
    }

    // Validate mandatory IOPA uploads
    const missingIopa = iopaFiles.filter(f => f === null);
    if (missingIopa.length > 0) {
      Alert.alert('Missing IOPA', `Please upload all ${iopaFiles.length} IOPA Radiographs before submitting.`);
      return;
    }

    setLoading(true);
    try {
      await api.post(`/procedures/${id}/stage2/surgical`, {
        checklist_items: checklistState,
        isq_value: isqValues.length === 1 ? (isqValues[0] || null) : isqValues,
        healing_abutment_height: healingAbutmentHeight || null,
        iopa_files: iopaFiles.filter(f => f !== null).map(f => ({
          filename: f!.filename,
          original_name: f!.original_name,
          tooth_label: f!.tooth_label,
        })),
        student_notes: studentNotes || null,
      });
      const isInchargeSelfCreated = user?.role === 'implant_incharge' && createdByRole === 'implant_incharge' && user?.id === createdById;
      if (isInchargeSelfCreated) {
        try { await api.post(`/procedures/${id}/stage2/surgical/approve`, { action: 'approve', comment: '' }); } catch {}
        setDoneCompleted(true);
      } else {
        Alert.alert('Success',
          'Phase 3 submitted successfully! Awaiting approval.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to submit Phase 3');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <PhaseHeader
        title="Phase 3 - Healing and Second Stage Surgery"
        testID="phase3-submit-header"
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} nestedScrollEnabled>
          <View style={s.infoBox}>
            <Ionicons name="information-circle" size={22} color="#1565C0" />
            <Text style={s.infoText}>
              Stage 1 Implant Placement is complete. Please complete the second stage surgical checklist for healing and exposure phase assessment.
            </Text>
          </View>

          {/* ── Phase 2 summary banner (per product spec) ── */}
          {phase2Component === 'Immediate Loading Done' && (
            <View style={[s.section, { borderLeftWidth: 4, borderLeftColor: '#2E7D32', backgroundColor: '#F1F8E9' }]} testID="phase3-immediate-prosthesis-banner">
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#1B5E20' }}>Immediate Prosthesis Done</Text>
              <Text style={{ marginTop: 6, fontSize: 13, color: '#33691E' }}>
                {phase2ProsthesisType === 'Other' ? (phase2ProsthesisOther || 'Other') : (phase2ProsthesisType || '—')}
              </Text>
              {isOwner && !pendingEditRequest && (
                <TouchableOpacity style={s.requestEditBtn} onPress={openEditRequestModal} data-testid="phase3-request-edit-btn">
                  <Ionicons name="alert-circle-outline" size={16} color="#E65100" />
                  <Text style={s.requestEditBtnText}>Need Changes — Request Edit</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {phase2Component === 'Healing Abutment Placed' && (
            <View style={[s.section, { borderLeftWidth: 4, borderLeftColor: '#1565C0', backgroundColor: '#E3F2FD' }]} testID="phase3-healing-abutment-banner">
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#0D47A1' }}>Healing Abutment Placed</Text>
              {phase2HealingCuffs.length > 0 ? phase2HealingCuffs.map((h, i) => (
                <Text key={i} style={{ marginTop: 4, fontSize: 13, color: '#1A237E' }}>
                  {implantPositions[i] ? `Tooth #${implantPositions[i]}` : `Implant ${i + 1}`}: {h || '—'} mm
                </Text>
              )) : (
                <Text style={{ marginTop: 4, fontSize: 13, color: '#1A237E' }}>No cuff heights recorded</Text>
              )}
              {isOwner && !pendingEditRequest && (
                <TouchableOpacity style={s.requestEditBtn} onPress={openEditRequestModal} data-testid="phase3-request-edit-btn">
                  <Ionicons name="alert-circle-outline" size={16} color="#E65100" />
                  <Text style={s.requestEditBtnText}>Need Changes — Request Edit</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── Pending edit-request banner ── */}
          {pendingEditRequest && (
            <View style={[s.section, { borderLeftWidth: 4, borderLeftColor: '#F9A825', backgroundColor: '#FFFDE7' }]} testID="phase3-pending-edit-banner">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="time-outline" size={18} color="#E65100" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#E65100', flex: 1 }}>Edit requested — waiting for Supervisor / In-Charge</Text>
              </View>
              {!!pendingEditRequest.note && (
                <Text style={{ marginTop: 6, fontSize: 12, color: '#6D4C41', fontStyle: 'italic' }}>“{pendingEditRequest.note}”</Text>
              )}
              {isOwner && (
                <TouchableOpacity style={s.cancelRequestBtn} onPress={cancelEditRequest} data-testid="phase3-cancel-edit-request-btn">
                  <Text style={s.cancelRequestText}>Cancel request</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── Checklist ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="clipboard-outline" size={20} color="#1565C0" />
              <Text style={s.sectionTitle}>Second Stage Checklist <Text style={{ color: '#DC3545' }}>*</Text></Text>
            </View>

            {CHECKLIST_ITEMS_FILTERED.map(item => (
              <View key={item.id}>
                <View style={s.checkRow}>
                  <Text style={[s.checkLabel, { flex: 1 }]}>{item.label}</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {['Yes', 'No'].map(opt => (
                      <TouchableOpacity key={opt}
                        style={[{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#D0DCE8', backgroundColor: '#F8FAFC', minWidth: 50, alignItems: 'center' as const },
                          checklistState[item.id] === true && opt === 'Yes' && { borderColor: '#4CAF50', backgroundColor: '#4CAF50' },
                          checklistState[item.id] === false && opt === 'No' && { borderColor: '#F44336', backgroundColor: '#F44336' }]}
                        onPress={() => setChecklistState(prev => ({ ...prev, [item.id]: opt === 'Yes' }))}>
                        <Text style={[{ fontSize: 13, color: '#666', fontWeight: '600' as const },
                          (checklistState[item.id] === true && opt === 'Yes') || (checklistState[item.id] === false && opt === 'No') ? { color: '#FFF' } : {}]}>{opt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Upload IOPA Radiographs below Radiograph Made */}
                {item.id === 'radiograph_made' && checklistState[item.id] && (
                  <View style={{ paddingLeft: 0, paddingVertical: 8, backgroundColor: '#E3F2FD', borderRadius: 8, marginBottom: 4, padding: 12, borderWidth: 1, borderColor: '#90CAF9' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#1565C0', marginBottom: 10 }}>Upload IOPA Radiograph</Text>
                    {iopaFiles.map((file, idx) => {
                      const label = implantPositions[idx] ? `Tooth #${implantPositions[idx]}` : `Implant ${idx + 1}`;
                      const baseUrl = api.defaults.baseURL || '';
                      return (
                        <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }} data-testid={`p3-iopa-slot-${idx}`}>
                          <View style={{ flex: 1, backgroundColor: '#BBDEFB', padding: 8, borderRadius: 8 }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: '#0D47A1' }}>{label}</Text>
                          </View>
                          <View style={{ flex: 1.5, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            {file ? (
                              <>
                                {file.filename.match(/\.(png|jpg|jpeg)$/i) ? (
                                  <Image source={{ uri: `${baseUrl}/uploads/${file.filename}?token=${authToken}` }}
                                    style={{ width: 36, height: 36, borderRadius: 6 }} resizeMode="cover" />
                                ) : (
                                  <Ionicons name="document-attach" size={22} color="#4CAF50" />
                                )}
                                <TouchableOpacity
                                  style={{ backgroundColor: '#4CAF50', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}
                                  onPress={() => Linking.openURL(`${baseUrl}/uploads/${file.filename}?token=${authToken}`).catch(() => Alert.alert('Error', 'Could not open file'))}
                                  data-testid={`p3-view-iopa-${idx}`}
                                >
                                  <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }} numberOfLines={1}>View</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => { const u = [...iopaFiles]; u[idx] = null; setIopaFiles(u); }}
                                  data-testid={`p3-remove-iopa-${idx}`}>
                                  <Ionicons name="close-circle" size={22} color="#E53935" />
                                </TouchableOpacity>
                              </>
                            ) : (
                              <TouchableOpacity
                                style={{ backgroundColor: '#1A73E8', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'center' }}
                                onPress={() => pickIopaFile(idx)} disabled={uploadingIdx === idx}
                                data-testid={`p3-upload-iopa-${idx}`}
                              >
                                {uploadingIdx === idx ? (
                                  <ActivityIndicator color="#FFF" size="small" />
                                ) : (
                                  <>
                                    <Ionicons name="cloud-upload" size={16} color="#FFF" />
                                    <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '600' }}>Upload IOPA</Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* ISQ Value per implant - green theme */}
                {item.id === 'isq_checked' && checklistState[item.id] && (
                  <View style={{ backgroundColor: '#E8F5E9', borderRadius: 8, padding: 12, marginBottom: 4, borderWidth: 1, borderColor: '#A5D6A7' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#2E7D32', marginBottom: 10 }}>ISQ Values</Text>
                    {isqValues.map((val, idx) => {
                      const label = implantPositions[idx] ? `Tooth #${implantPositions[idx]}` : `Implant ${idx + 1}`;
                      return (
                        <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }} data-testid={`isq-slot-${idx}`}>
                          <View style={{ flex: 1, backgroundColor: '#C8E6C9', padding: 8, borderRadius: 8 }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: '#1B5E20' }}>{label}</Text>
                          </View>
                          <TextInput
                            style={{ flex: 1, borderWidth: 1.5, borderColor: '#4CAF50', borderRadius: 8, padding: 8, fontSize: 16, fontWeight: '700', textAlign: 'center', backgroundColor: '#FFF' }}
                            value={val}
                            onChangeText={(text) => {
                              const updated = [...isqValues];
                              updated[idx] = text;
                              setIsqValues(updated);
                            }}
                            placeholder="e.g. 72"
                            keyboardType="decimal-pad"
                            maxLength={5}
                            data-testid={`isq-input-${idx}`}
                          />
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Healing Abutment cuff height - per implant */}
                {item.id === 'healing_abutment' && checklistState[item.id] && (
                  <View style={{ paddingLeft: 16, paddingVertical: 8, backgroundColor: '#FFF8E1', borderRadius: 8, marginBottom: 4, padding: 12, borderWidth: 1, borderColor: '#FFE082' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#E65100', marginBottom: 8 }}>Cuff Height (mm)</Text>
                    {healingAbutmentHeight.map((val, idx) => (
                      <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <View style={{ flex: 1, backgroundColor: '#FFF3E0', padding: 8, borderRadius: 8 }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#BF360C' }}>
                            Implant {idx + 1}{implantPositions[idx] ? ` (#${implantPositions[idx]})` : ''}
                          </Text>
                        </View>
                        <TextInput
                          style={s.smallInput}
                          value={val}
                          onChangeText={v => { const u = [...healingAbutmentHeight]; u[idx] = v; setHealingAbutmentHeight(u); }}
                          placeholder="mm"
                          keyboardType="decimal-pad"
                          maxLength={5}
                          data-testid={`healing-abutment-height-${idx}`}
                        />
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#888' }}>mm</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>

          {/* ── Clinical / Radiographical Assessment Notes ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="document-text-outline" size={20} color="#00695C" />
              <Text style={s.sectionTitle}>Clinical / Radiographical Assessment</Text>
            </View>

            <View style={s.field}>
              <Text style={s.label}>{notesLabel}</Text>
              <TextInput
                style={[s.input, s.textArea]}
                value={studentNotes}
                onChangeText={setStudentNotes}
                placeholder="Clinical findings, healing assessment, implant stability observations, soft tissue status..."
                multiline
                numberOfLines={4}
                data-testid="phase3-student-notes"
              />
            </View>

            {user?.role !== 'implant_incharge' && (
              <Text style={s.helperText} testID="phase3-approval-helper">
                {user?.role === 'supervisor'
                  ? 'Implant In-Charge remark will be added during approval.'
                  : 'Supervisor and In-Charge remarks will be added during approval.'}
              </Text>
            )}
          </View>

          {/* ── Submit ── */}
          {doneCompleted ? (
            <View style={{ padding: 16, paddingBottom: 32, alignItems: 'center' }} testID="phase3-done-success">
              <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Ionicons name="checkmark-circle" size={64} color="#43A047" />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#1B5E20', marginBottom: 8 }}>Phase 3 Complete</Text>
              <Text style={{ fontSize: 13, color: '#37474F', textAlign: 'center', marginBottom: 20 }}>Submitted and auto-approved. You can begin Phase 4 Step 1 now.</Text>
              <TouchableOpacity style={[s.submitBtn, { backgroundColor: '#6A1B9A', paddingHorizontal: 28 }]}
                onPress={() => router.replace(`/procedures/submit-stage2-prosthetic/${id}`)}
                testID="phase3-proceed-phase4-btn">
                <Ionicons name="arrow-forward-circle" size={22} color="#FFF" />
                <Text style={s.submitText}>Proceed to Phase 4 Step 1</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.replace(`/procedures/${id}`)} style={{ marginTop: 12 }}>
                <Text style={{ color: '#1565C0', fontWeight: '600' }}>View Case</Text>
              </TouchableOpacity>
            </View>
          ) : (
          <View style={{ padding: 16, paddingBottom: 32 }}>
            <TouchableOpacity
              style={[s.submitBtn, loading && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={loading}
              data-testid="phase3-submit-btn"
            >
              {loading ? <ActivityIndicator color="#FFF" /> : (
                <>
                  <Ionicons name="checkmark-circle" size={22} color="#FFF" />
                  <Text style={s.submitText}>{(user?.role === 'implant_incharge' && createdByRole === 'implant_incharge' && user?.id === createdById) ? 'Done' : 'Submit Phase 3 for Approval'}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Phase 2 Edit Request Modal ── */}
      <Modal visible={editModalOpen} transparent animationType="slide" onRequestClose={() => setEditModalOpen(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Request Phase 2 Edit</Text>
              <TouchableOpacity onPress={() => setEditModalOpen(false)} data-testid="phase3-edit-modal-close">
                <Ionicons name="close" size={22} color="#607D8B" />
              </TouchableOpacity>
            </View>
            <Text style={s.modalHint}>Select what needs changing. Your Supervisor and Implant In-Charge will be notified.</Text>
            {phase2Component === 'Immediate Loading Done' && (
              <TouchableOpacity
                style={[s.modalChoice, editFieldsSel.prosthesis_type && s.modalChoiceActive]}
                onPress={() => setEditFieldsSel(v => ({ ...v, prosthesis_type: !v.prosthesis_type }))}
                data-testid="phase3-edit-choice-prosthesis-type">
                <Ionicons name={editFieldsSel.prosthesis_type ? 'checkbox' : 'square-outline'} size={20} color={editFieldsSel.prosthesis_type ? '#1565C0' : '#90A4AE'} />
                <Text style={s.modalChoiceText}>Prosthesis Type</Text>
              </TouchableOpacity>
            )}
            {phase2Component === 'Healing Abutment Placed' && (
              <TouchableOpacity
                style={[s.modalChoice, editFieldsSel.healing_abutment_cuff_height && s.modalChoiceActive]}
                onPress={() => setEditFieldsSel(v => ({ ...v, healing_abutment_cuff_height: !v.healing_abutment_cuff_height }))}
                data-testid="phase3-edit-choice-cuff-height">
                <Ionicons name={editFieldsSel.healing_abutment_cuff_height ? 'checkbox' : 'square-outline'} size={20} color={editFieldsSel.healing_abutment_cuff_height ? '#1565C0' : '#90A4AE'} />
                <Text style={s.modalChoiceText}>Healing Abutment Cuff Height</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[s.modalChoice, editFieldsSel.other && s.modalChoiceActive]}
              onPress={() => setEditFieldsSel(v => ({ ...v, other: !v.other }))}
              data-testid="phase3-edit-choice-other">
              <Ionicons name={editFieldsSel.other ? 'checkbox' : 'square-outline'} size={20} color={editFieldsSel.other ? '#1565C0' : '#90A4AE'} />
              <Text style={s.modalChoiceText}>Other</Text>
            </TouchableOpacity>
            <Text style={[s.label, { marginTop: 12 }]}>Note to reviewer (optional)</Text>
            <TextInput
              style={[s.input, s.textArea]}
              value={editNote}
              onChangeText={setEditNote}
              placeholder="Briefly describe what's wrong and what should change..."
              multiline
              maxLength={500}
              data-testid="phase3-edit-note-input"
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={[s.modalBtn, s.modalCancel]} onPress={() => setEditModalOpen(false)} disabled={editSubmitting}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, s.modalSubmit, editSubmitting && { opacity: 0.6 }]}
                onPress={submitEditRequest}
                disabled={editSubmitting}
                data-testid="phase3-edit-submit-btn">
                {editSubmitting ? <ActivityIndicator color="#FFF" /> : <Text style={s.modalSubmitText}>Send Request</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F4F8' },
  scroll: { paddingBottom: 32 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#0D47A1', textAlign: 'center', paddingVertical: 16, letterSpacing: 0.3 },
  infoBox: { flexDirection: 'row', backgroundColor: '#E3F2FD', margin: 16, padding: 16, borderRadius: 14, gap: 10, borderWidth: 1.5, borderColor: '#BBDEFB', shadowColor: '#1565C0', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  infoText: { flex: 1, fontSize: 13, color: '#1565C0', lineHeight: 20 },
  section: { backgroundColor: '#FFF', marginHorizontal: 16, marginBottom: 16, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#E0E7EE', shadowColor: '#1565C0', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1565C0', letterSpacing: 0.3 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F4F8' },
  checkLabel: { flex: 1, fontSize: 14, color: '#333', lineHeight: 20 },
  inlineInput: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 32, paddingVertical: 8, backgroundColor: '#F0F4F8', borderRadius: 10, marginBottom: 4 },
  inlineLabel: { fontSize: 13, fontWeight: '600', color: '#1565C0' },
  smallInput: { width: 90, borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 10, padding: 8, fontSize: 16, fontWeight: '700', textAlign: 'center', backgroundColor: '#FFF' },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#1565C0', marginBottom: 6, letterSpacing: 0.2 },
  input: { borderWidth: 1.5, borderColor: '#D0DCE8', borderRadius: 10, padding: 12, fontSize: 14, backgroundColor: '#F8FAFC', minHeight: 44 },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  helperText: { fontSize: 12, color: '#90A4AE', fontStyle: 'italic', marginTop: 4 },
  submitBtn: { flexDirection: 'row', backgroundColor: '#1565C0', borderRadius: 14, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: '#1565C0', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 5 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  requestEditBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#FFB74D', backgroundColor: '#FFF3E0' },
  requestEditBtnText: { fontSize: 12.5, fontWeight: '700', color: '#E65100', letterSpacing: 0.2 },
  cancelRequestBtn: { alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#CFD8DC', backgroundColor: '#FFF' },
  cancelRequestText: { fontSize: 12, fontWeight: '600', color: '#607D8B' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(13,71,161,0.35)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#0D47A1' },
  modalHint: { fontSize: 13, color: '#546E7A', marginBottom: 14, lineHeight: 19 },
  modalChoice: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E0E7EE', marginBottom: 8 },
  modalChoiceActive: { borderColor: '#1565C0', backgroundColor: '#E3F2FD' },
  modalChoiceText: { fontSize: 14, fontWeight: '600', color: '#37474F' },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modalCancel: { backgroundColor: '#ECEFF1' },
  modalCancelText: { fontSize: 14, fontWeight: '700', color: '#546E7A' },
  modalSubmit: { backgroundColor: '#1565C0' },
  modalSubmitText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
});
