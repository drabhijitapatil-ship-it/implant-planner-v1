import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import api from '../../../utils/api';
import { useAuth } from '../../../contexts/AuthContext';
import BackToDashboard from '../../../components/BackToDashboard';
import { PhaseHeader } from '../../../components/PhaseHeader';
import { Ionicons } from '@expo/vector-icons';
import {
  PHASE4_SINGLE_MULTIPLE_OPTIONS,
  PHASE4_FULL_ARCH_OPTIONS,
  CUSTOM_ABUTMENT_OPTIONS,
  FP_MATERIAL_OPTIONS,
  OVERDENTURE_ATTACHMENT_OPTIONS,
  FULL_ARCH_GROUP,
  SINGLE_GROUP,
  MULTIPLE_GROUP,
} from '../../../constants/checklist';

export default function Phase4Step1Screen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const isFaculty = user?.role === 'supervisor' || user?.role === 'implant_incharge';
  const notesLabel = isFaculty ? "Operator's Notes" : "Student Notes";
  const [loading, setLoading] = useState(false);
  const [procedure, setProcedure] = useState<any>(null);

  // Form state
  const [finalProsthesis, setFinalProsthesis] = useState('');
  const [prosthesisOpen, setProsthesisOpen] = useState(false);
  const [prostheticMaterial, setProstheticMaterial] = useState('');
  const [materialOpen, setMaterialOpen] = useState(false);
  const [customAbutment, setCustomAbutment] = useState('');
  const [abutmentOpen, setAbutmentOpen] = useState(false);
  const [overdentureAttachment, setOverdentureAttachment] = useState('');
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [componentsAvailable, setComponentsAvailable] = useState(false);
  const [impressionType, setImpressionType] = useState('');
  const [studentNotes, setStudentNotes] = useState('');

  // Per-implant prosthetic plan for multiple implants (non-bridge)
  const [perImplantPlans, setPerImplantPlans] = useState<{ prosthesis: string; material: string; openProsthesis: boolean; openMaterial: boolean }[]>([]);
  const [implantPositions, setImplantPositions] = useState<string[]>([]);

  useEffect(() => { loadProcedure(); }, []);

  const loadProcedure = async () => {
    try {
      const [procRes, planRes] = await Promise.all([
        api.get(`/procedures/${id}`),
        api.get(`/procedures/${id}/implant-plan`),
      ]);
      setProcedure(procRes.data);
      const positions = (planRes.data.implant_plans || []).map((p: any) => p.position || p.tooth_number || '');
      setImplantPositions(positions);
      // Initialize per-implant plans if needed
      if (positions.length > 1) {
        setPerImplantPlans(positions.map(() => ({ prosthesis: '', material: '', openProsthesis: false, openMaterial: false })));
      }
    } catch {}
  };

  // Determine if per-implant mode: Multiple implants + no bridge in Phase 1 prosthetic plan
  const isPerImplantMode = (() => {
    if (!procedure) return false;
    const procType = procedure.implant_procedure_type || '';
    if (!MULTIPLE_GROUP.has(procType)) return false;
    const plan = (procedure.prosthetic_plan || '').toLowerCase();
    const hasBridge = plan.includes('bridge');
    return !hasBridge && implantPositions.length > 1;
  })();

  // Crown-only options for per-implant mode (no bridge options)
  const perImplantOptions = [
    'Cement Retained Crown FP1',
    'Cement Retained Crown FP2',
    'Cement Retained Crown FP3',
    'Screw Retained Crown FP1',
    'Screw Retained Crown FP2',
    'Screw Retained Crown FP3',
  ];

  const getOptions = () => {
    if (!procedure) return [];
    const procType = procedure.implant_procedure_type || '';
    if (SINGLE_GROUP.has(procType) || MULTIPLE_GROUP.has(procType)) return PHASE4_SINGLE_MULTIPLE_OPTIONS;
    if (FULL_ARCH_GROUP.has(procType)) return PHASE4_FULL_ARCH_OPTIONS;
    return [...PHASE4_SINGLE_MULTIPLE_OPTIONS, ...PHASE4_FULL_ARCH_OPTIONS];
  };

  const showMaterial = finalProsthesis && (finalProsthesis.includes('FP1') || finalProsthesis.includes('FP2') || finalProsthesis.includes('FP3'));
  const showOverdenture = finalProsthesis && finalProsthesis.includes('Overdenture');

  const handleSubmit = async () => {
    if (isPerImplantMode) {
      // Validate per-implant plans
      for (let i = 0; i < perImplantPlans.length; i++) {
        if (!perImplantPlans[i].prosthesis) {
          Alert.alert('Missing', `Please select prosthesis for Implant ${i + 1}${implantPositions[i] ? ` (#${implantPositions[i]})` : ''}`);
          return;
        }
        const showMat = perImplantPlans[i].prosthesis.includes('FP1') || perImplantPlans[i].prosthesis.includes('FP2') || perImplantPlans[i].prosthesis.includes('FP3');
        if (showMat && !perImplantPlans[i].material) {
          Alert.alert('Missing', `Please select material for Implant ${i + 1}${implantPositions[i] ? ` (#${implantPositions[i]})` : ''}`);
          return;
        }
      }
    } else {
      if (!finalProsthesis) { Alert.alert('Missing', 'Please select Final Prosthesis'); return; }
    }
    if (!impressionType) { Alert.alert('Missing', 'Please select impression type'); return; }

    setLoading(true);
    try {
      const payload: any = {
        custom_abutment: customAbutment || null,
        overdenture_attachment: overdentureAttachment || null,
        payment_complete: paymentComplete,
        components_available: componentsAvailable,
        impression_type: impressionType,
        student_notes: studentNotes || null,
      };

      if (isPerImplantMode) {
        payload.per_implant_plans = perImplantPlans.map((p, idx) => ({
          position: implantPositions[idx] || '',
          prosthesis: p.prosthesis,
          material: p.material || null,
        }));
        payload.final_prosthetic_plan = perImplantPlans.map((p, idx) =>
          `#${implantPositions[idx] || idx + 1}: ${p.prosthesis}${p.material ? ' - ' + p.material : ''}`
        ).join('; ');
        payload.prosthetic_material = perImplantPlans.map(p => p.material).filter(Boolean).join(', ') || null;
      } else {
        payload.final_prosthetic_plan = finalProsthesis + (prostheticMaterial ? ` - ${prostheticMaterial}` : '');
        payload.prosthetic_material = prostheticMaterial || null;
      }

      await api.post(`/procedures/${id}/stage2/prosthetic`, payload);
      Alert.alert('Success', 'Phase 4 Step 1 submitted! Awaiting approval.',
        [{ text: 'OK', onPress: () => router.back() }]);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to submit');
    } finally {
      setLoading(false);
    }
  };

  const renderDropdown = (label: string, value: string, options: string[],
    open: boolean, setOpen: (v: boolean) => void, onSelect: (v: string) => void, required = true) => (
    <View style={s.field}>
      <Text style={s.label}>{label} {required && <Text style={{ color: '#DC3545' }}>*</Text>}</Text>
      <TouchableOpacity style={s.dropdown} onPress={() => setOpen(!open)}>
        <Text style={[s.dropdownText, !value && { color: '#999' }]}>{value || `Select...`}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
      </TouchableOpacity>
      {open && (
        <ScrollView style={s.ddList} nestedScrollEnabled>
          {options.map(opt => (
            <TouchableOpacity key={opt} style={[s.ddItem, value === opt && s.ddItemActive]}
              onPress={() => { onSelect(opt); setOpen(false); }}>
              <Text style={[s.ddItemText, value === opt && { color: '#1A73E8', fontWeight: '700' }]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <PhaseHeader
        title="Phase 4 - Prosthetic Rehabilitation"
        subtitle="Step 1 of 2: Prosthetic Planning"
        testID="phase4-step1-submit-header"
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} nestedScrollEnabled>
          {/* ── Final Prosthesis Selection ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="construct-outline" size={20} color="#6A1B9A" />
              <Text style={s.sectionTitle}>Final Prosthesis Selection</Text>
            </View>
            {procedure && <Text style={s.helperText}>Procedure Type: {procedure.implant_procedure_type}</Text>}

            {isPerImplantMode ? (
              <>
                <Text style={[s.helperText, { color: '#1565C0', fontWeight: '600', fontStyle: 'normal', marginBottom: 8 }]}>
                  Each implant requires a separate prosthesis selection
                </Text>
                {perImplantPlans.map((plan, idx) => {
                  const showMat = plan.prosthesis.includes('FP1') || plan.prosthesis.includes('FP2') || plan.prosthesis.includes('FP3');
                  return (
                    <View key={idx} style={{ backgroundColor: '#F8F9FE', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E0E7EE' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#6A1B9A', marginBottom: 8 }}>
                        Implant {idx + 1}{implantPositions[idx] ? ` (#${implantPositions[idx]})` : ''}
                      </Text>

                      {/* Prosthesis Type */}
                      <View style={s.field}>
                        <Text style={s.label}>Prosthesis Type <Text style={{ color: '#DC3545' }}>*</Text></Text>
                        <TouchableOpacity style={s.dropdown} onPress={() => {
                          setPerImplantPlans(prev => prev.map((p, i) => i === idx ? { ...p, openProsthesis: !p.openProsthesis, openMaterial: false } : { ...p, openProsthesis: false, openMaterial: false }));
                        }}>
                          <Text style={[s.dropdownText, !plan.prosthesis && { color: '#999' }]}>{plan.prosthesis || 'Select...'}</Text>
                          <Ionicons name={plan.openProsthesis ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
                        </TouchableOpacity>
                        {plan.openProsthesis && (
                          <ScrollView style={s.ddList} nestedScrollEnabled>
                            {perImplantOptions.map(opt => (
                              <TouchableOpacity key={opt} style={[s.ddItem, plan.prosthesis === opt && s.ddItemActive]}
                                onPress={() => {
                                  setPerImplantPlans(prev => prev.map((p, i) => i === idx ? { ...p, prosthesis: opt, material: '', openProsthesis: false } : p));
                                }}>
                                <Text style={[s.ddItemText, plan.prosthesis === opt && { color: '#1A73E8', fontWeight: '700' }]}>{opt}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        )}
                      </View>

                      {/* Material */}
                      {showMat && (
                        <View style={s.field}>
                          <Text style={s.label}>Prosthetic Material <Text style={{ color: '#DC3545' }}>*</Text></Text>
                          <TouchableOpacity style={s.dropdown} onPress={() => {
                            setPerImplantPlans(prev => prev.map((p, i) => i === idx ? { ...p, openMaterial: !p.openMaterial, openProsthesis: false } : { ...p, openProsthesis: false, openMaterial: false }));
                          }}>
                            <Text style={[s.dropdownText, !plan.material && { color: '#999' }]}>{plan.material || 'Select...'}</Text>
                            <Ionicons name={plan.openMaterial ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
                          </TouchableOpacity>
                          {plan.openMaterial && (
                            <ScrollView style={s.ddList} nestedScrollEnabled>
                              {FP_MATERIAL_OPTIONS.map(opt => (
                                <TouchableOpacity key={opt} style={[s.ddItem, plan.material === opt && s.ddItemActive]}
                                  onPress={() => {
                                    setPerImplantPlans(prev => prev.map((p, i) => i === idx ? { ...p, material: opt, openMaterial: false } : p));
                                  }}>
                                  <Text style={[s.ddItemText, plan.material === opt && { color: '#1A73E8', fontWeight: '700' }]}>{opt}</Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </>
            ) : (
              <>
                {renderDropdown('Final Prosthesis Type', finalProsthesis, getOptions(),
                  prosthesisOpen, setProsthesisOpen, (v) => { setFinalProsthesis(v); setProstheticMaterial(''); setOverdentureAttachment(''); })}

                {showMaterial && renderDropdown('Prosthetic Material', prostheticMaterial, FP_MATERIAL_OPTIONS,
                  materialOpen, setMaterialOpen, setProstheticMaterial)}

                {showOverdenture && renderDropdown('Overdenture Attachment', overdentureAttachment, OVERDENTURE_ATTACHMENT_OPTIONS,
                  attachmentOpen, setAttachmentOpen, setOverdentureAttachment)}
              </>
            )}

            {renderDropdown('Custom Abutment (optional)', customAbutment, CUSTOM_ABUTMENT_OPTIONS,
              abutmentOpen, setAbutmentOpen, setCustomAbutment, false)}
          </View>

          {/* ── Payment & Components ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="card-outline" size={20} color="#1565C0" />
              <Text style={s.sectionTitle}>Payment & Components <Text style={{ color: '#DC3545' }}>*</Text></Text>
            </View>
            <View style={s.checkRow}>
              <Text style={[s.checkLabel, { flex: 1 }]}>Complete Payment Done</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {['Yes', 'No'].map(opt => (
                  <TouchableOpacity key={opt}
                    style={[{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#D0DCE8', backgroundColor: '#F8FAFC', minWidth: 50, alignItems: 'center' as const },
                      paymentComplete === true && opt === 'Yes' && { borderColor: '#4CAF50', backgroundColor: '#4CAF50' },
                      paymentComplete === false && opt === 'No' && { borderColor: '#F44336', backgroundColor: '#F44336' }]}
                    onPress={() => setPaymentComplete(opt === 'Yes')}>
                    <Text style={[{ fontSize: 13, color: '#666', fontWeight: '600' as const },
                      (paymentComplete === true && opt === 'Yes') || (paymentComplete === false && opt === 'No') ? { color: '#FFF' } : {}]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={s.checkRow}>
              <Text style={[s.checkLabel, { flex: 1 }]}>All Prosthetic Components Available</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {['Yes', 'No'].map(opt => (
                  <TouchableOpacity key={opt}
                    style={[{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#D0DCE8', backgroundColor: '#F8FAFC', minWidth: 50, alignItems: 'center' as const },
                      componentsAvailable === true && opt === 'Yes' && { borderColor: '#4CAF50', backgroundColor: '#4CAF50' },
                      componentsAvailable === false && opt === 'No' && { borderColor: '#F44336', backgroundColor: '#F44336' }]}
                    onPress={() => setComponentsAvailable(opt === 'Yes')}>
                    <Text style={[{ fontSize: 13, color: '#666', fontWeight: '600' as const },
                      (componentsAvailable === true && opt === 'Yes') || (componentsAvailable === false && opt === 'No') ? { color: '#FFF' } : {}]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* ── Impressions ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="scan-outline" size={20} color="#E65100" />
              <Text style={s.sectionTitle}>Impressions</Text>
            </View>
            <Text style={s.label}>Select Impression Type <Text style={{ color: '#DC3545' }}>*</Text></Text>
            <View style={{ gap: 10 }}>
              {[
                { id: 'intraoral_scans', label: 'Intra-Oral Scans Made', icon: 'phone-portrait-outline' },
                { id: 'conventional', label: 'Conventional Impressions Made', icon: 'hand-left-outline' },
              ].map(opt => (
                <TouchableOpacity key={opt.id} style={[s.impressionCard, impressionType === opt.id && s.impressionCardActive]}
                  onPress={() => setImpressionType(opt.id)}>
                  <Ionicons name={opt.icon as any} size={24} color={impressionType === opt.id ? '#1A73E8' : '#999'} />
                  <Text style={[s.impressionLabel, impressionType === opt.id && { color: '#1A73E8', fontWeight: '700' }]}>{opt.label}</Text>
                  {impressionType === opt.id && <Ionicons name="checkmark-circle" size={22} color="#1A73E8" />}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Notes ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="document-text-outline" size={20} color="#00695C" />
              <Text style={s.sectionTitle}>Notes</Text>
            </View>
            {/* iter-140: one-tap Copy MUA from Phase 2 — only surfaces when
                Phase 2 captured Yes + per-tooth details. Non-destructive:
                appends to existing notes with a separator, never overwrites. */}
            {(() => {
              const mua = procedure?.phase2_data?.multi_unit_abutment_placed;
              const details = procedure?.phase2_data?.multi_unit_abutment_details;
              const hasMua = mua === 'yes' && Array.isArray(details) && details.length > 0;
              if (!hasMua) return null;
              const copyMuaToNotes = () => {
                const lines = details.map((r: any) => {
                  const t = r?.tooth ?? '—';
                  const a = (r?.angulation ?? '').toString().trim();
                  const c = (r?.cuff_height ?? '').toString().trim();
                  const aStr = a ? `${a}°` : '—';
                  const cStr = c ? `${c} mm` : '—';
                  return `- Tooth ${t}: Angulation ${aStr}, Cuff Height ${cStr}`;
                }).join('\n');
                const block = `Multi-unit Abutments (from Phase 2):\n${lines}`;
                const existing = (studentNotes || '').trim();
                if (existing.includes('Multi-unit Abutments (from Phase 2):')) {
                  Alert.alert('Already copied', 'MUA details are already in the notes. Edit freely below.');
                  return;
                }
                const next = existing ? `${existing}\n\n${block}` : block;
                setStudentNotes(next);
                Alert.alert('Copied', `Multi-unit Abutment details (${details.length} ${details.length === 1 ? 'tooth' : 'teeth'}) added to ${notesLabel}. You can still edit them below.`);
              };
              return (
                <TouchableOpacity
                  style={s.copyMuaBtn}
                  onPress={copyMuaToNotes}
                  testID="copy-mua-to-notes-btn"
                  /* @ts-ignore */ data-testid="copy-mua-to-notes-btn"
                >
                  <Ionicons name="copy-outline" size={16} color="#0277BD" />
                  <Text style={s.copyMuaText}>Copy MUA from Phase 2 ({details.length})</Text>
                </TouchableOpacity>
              );
            })()}
            <View style={s.field}>
              <Text style={s.label}>{notesLabel}</Text>
              <TextInput style={[s.input, s.textArea]} value={studentNotes} onChangeText={setStudentNotes}
                placeholder="Treatment planning notes, special considerations..." multiline numberOfLines={3}
                data-testid="phase4-step1-notes" />
            </View>
            {user?.role !== 'implant_incharge' && (
              <Text style={s.helperText} data-testid="phase4-step1-approval-helper">
                {user?.role === 'supervisor'
                  ? 'Implant In-Charge remark will be added during approval.'
                  : 'Supervisor and In-Charge remarks added during approval.'}
              </Text>
            )}
          </View>

          {/* ── Submit ── */}
          <View style={{ padding: 16, paddingBottom: 32 }}>
            <TouchableOpacity style={[s.submitBtn, loading && { opacity: 0.6 }]} onPress={handleSubmit} disabled={loading}
              data-testid="phase4-step1-submit">
              {loading ? <ActivityIndicator color="#FFF" /> : (
                <><Ionicons name="checkmark-circle" size={22} color="#FFF" />
                <Text style={s.submitText}>Submit Step 1 for Approval</Text></>
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
  section: { backgroundColor: '#FFF', marginHorizontal: 16, marginBottom: 16, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E8EDF2' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E' },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12, fontSize: 14, backgroundColor: '#FAFAFA', minHeight: 44 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  helperText: { fontSize: 12, color: '#999', fontStyle: 'italic', marginTop: 4 },
  dropdown: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12, backgroundColor: '#FAFAFA' },
  dropdownText: { fontSize: 14, color: '#333', flex: 1 },
  ddList: { maxHeight: 250, borderWidth: 1, borderColor: '#DDD', borderRadius: 8, marginTop: 4, backgroundColor: '#FFF' },
  ddItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  ddItemActive: { backgroundColor: '#E8F0FE' },
  ddItemText: { fontSize: 14, color: '#333' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  checkLabel: { flex: 1, fontSize: 14, color: '#333' },
  impressionCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1.5, borderColor: '#DDD', borderRadius: 10, backgroundColor: '#FAFAFA' },
  impressionCardActive: { borderColor: '#1A73E8', backgroundColor: '#E8F0FE' },
  impressionLabel: { flex: 1, fontSize: 14, color: '#555' },
  submitBtn: { flexDirection: 'row', backgroundColor: '#6A1B9A', borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  // iter-140: Copy MUA from Phase 2 affordance (blue theme matches Phase 2 MUA card)
  copyMuaBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: '#E1F5FE', borderColor: '#B3E5FC', borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  copyMuaText: { fontSize: 12, fontWeight: '700', color: '#0277BD', letterSpacing: 0.2 },
});
