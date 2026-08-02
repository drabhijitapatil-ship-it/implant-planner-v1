/**
 * iter-393 — Pre-Implant Augmentation: Step 1 — Pre-procedure Details.
 * Reason for grafting, defect location (FDI multi-select), defect type,
 * baseline bone dimensions, Medical Assessment (compulsory) + Haematology
 * (optional) — same UI language as Phase 1.
 *
 * Port note (Fix #1): the Medical Assessment block below mirrors target's
 * own Phase 1 Medical Assessment rendering (frontend/app/(tabs)/new-procedure.tsx
 * — "Medical Assessment Sub-section", incl. the HbA1c conditional shown when
 * Diabetes is Controlled/Uncontrolled), rather than source's generic Yes/No
 * chip version which was missing the HbA1c sub-field.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import api from '../../../utils/api';
import { PhaseHeader } from '../../../components/PhaseHeader';
import { Ionicons } from '@expo/vector-icons';
import FDIChart from '../../../components/FDIChart';
import AugDropdown from '../../../components/AugDropdown';
import CbctSlots, { padCbct, CbctFile } from '../../../components/CbctSlots';
import {
  AUGMENTATION_REASONS, BONE_DEFECT_SIDES, DEFECT_SEVERITY,
  MEDICAL_RISK_FACTORS, calculateMedicalRisk,
} from '../../../constants/checklist';

const HAEMATOLOGY_FIELDS = [
  { id: 'hb', label: 'Haemoglobin (Hb)', placeholder: 'e.g. 13.5', hint: 'g/dL' },
  { id: 'tlc', label: 'Total Leucocyte Count', placeholder: 'e.g. 7500', hint: 'Normal 4,000 – 10,000 /cumm' },
  { id: 'bleeding_time', label: 'Bleeding Time', placeholder: 'e.g. 2.5', hint: 'minutes' },
  { id: 'clotting_time', label: 'Clotting Time', placeholder: 'e.g. 5.0', hint: 'minutes' },
  { id: 'prothrombin_time', label: 'Prothrombin Time', placeholder: 'e.g. 13', hint: 'Normal 11 – 16 seconds' },
  { id: 'inr', label: 'International Normalised Ratio (INR)', placeholder: 'e.g. 1.1', hint: 'ratio' },
];

export default function AugmentationStep1() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [procedure, setProcedure] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadingProc, setLoadingProc] = useState(true);

  const [reasons, setReasons] = useState<string[]>([]);
  const [reasonOther, setReasonOther] = useState('');
  const [defectTeeth, setDefectTeeth] = useState<string[]>([]);
  const [defectSides, setDefectSides] = useState<string[]>([]);
  const [horizontalDefect, setHorizontalDefect] = useState('');
  const [verticalDefect, setVerticalDefect] = useState('');
  const [defectOther, setDefectOther] = useState('');
  const [boneWidth, setBoneWidth] = useState('');
  const [boneHeight, setBoneHeight] = useState('');
  const [medical, setMedical] = useState<Record<string, string>>({});
  const [cbctFiles, setCbctFiles] = useState<CbctFile[]>([null, null]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/procedures/${id}`);
        setProcedure(res.data);
        const rnd = (res.data.augmentations || []).slice(-1)[0];
        const s1 = rnd?.step1;
        if (s1) {
          setReasons(s1.reasons || []);
          setReasonOther(s1.reason_other_text || '');
          setDefectTeeth(s1.defect_teeth || []);
          setDefectSides(s1.defect_sides || []);
          setHorizontalDefect(s1.horizontal_defect || '');
          setVerticalDefect(s1.vertical_defect || '');
          setDefectOther(s1.defect_other || '');
          setBoneWidth(s1.bone_width_before || '');
          setBoneHeight(s1.bone_height_before || '');
          setMedical(s1.medical_assessment || {});
          setCbctFiles(padCbct(s1.cbct_files || []));
        } else if (res.data.medical_assessment) {
          setMedical(res.data.medical_assessment);
        }
      } catch (e: any) {
        Alert.alert('Error', e?.response?.data?.detail || 'Failed to load case');
      } finally { setLoadingProc(false); }
    })();
  }, [id]);

  const updateMedical = (key: string, value: string) =>
    setMedical(prev => ({ ...prev, [key]: value }));

  const risk = calculateMedicalRisk(medical);
  const medicalComplete = MEDICAL_RISK_FACTORS.every(f => medical[f.id]);

  const handleSubmit = async () => {
    const missing: string[] = [];
    if (reasons.length === 0) missing.push('Reason for Bone Grafting');
    if (reasons.includes('Others') && !reasonOther.trim()) missing.push('Other reason details');
    if (defectTeeth.length === 0) missing.push('Defect Location (FDI chart)');
    if (defectSides.length === 0) missing.push('Bone Defect Side');
    if (!horizontalDefect) missing.push('Horizontal defect');
    if (!verticalDefect) missing.push('Vertical defect');
    if (!boneWidth.trim()) missing.push('Bone width before graft');
    if (!boneHeight.trim()) missing.push('Bone height before graft');
    if (cbctFiles.filter(Boolean).length === 0) missing.push('Pre-operative CBCT report (at least one)');
    if (!medicalComplete) missing.push('Medical Assessment (all factors)');
    if (missing.length) {
      Alert.alert('Incomplete', `Please complete:\n• ${missing.join('\n• ')}`);
      return;
    }
    setLoading(true);
    try {
      await api.post(`/procedures/${id}/augmentation/step1`, {
        reasons, reason_other_text: reasonOther,
        defect_teeth: defectTeeth, defect_sides: defectSides,
        horizontal_defect: horizontalDefect, vertical_defect: verticalDefect,
        defect_other: defectOther,
        bone_width_before: boneWidth, bone_height_before: boneHeight,
        medical_assessment: medical, medical_risk_level: risk.level,
        cbct_files: cbctFiles.filter(Boolean),
      });
      Alert.alert('Step 1 Complete', 'Step 2 — Post-procedure Details is now unlocked.');
      router.replace(`/procedures/${id}`);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to save Step 1');
    } finally { setLoading(false); }
  };

  if (loadingProc) {
    return (
      <SafeAreaView style={s.container}>
        <PhaseHeader title="Pre-Implant Augmentation" subtitle="Step 1 — Pre-procedure Details" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color="#1565C0" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <PhaseHeader title="Pre-Implant Augmentation" subtitle="Step 1 — Pre-procedure Details" testID="aug-step1-header" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll}>

          <View style={s.section} testID="aug-reason-section">
            <View style={s.sectionHeader}>
              <Ionicons name="help-circle-outline" size={20} color="#6A1B9A" />
              <Text style={s.sectionTitle}>Reason for Bone Grafting <Text style={{ color: '#DC3545' }}>*</Text></Text>
            </View>
            <AugDropdown options={AUGMENTATION_REASONS} selected={reasons} onChange={setReasons} testPrefix="aug-reason" placeholder="Select reason(s) for grafting…" />
            {reasons.includes('Others') && (
              <TextInput style={[s.input, { marginTop: 10 }]} placeholder="Describe the other reason..."
                value={reasonOther} onChangeText={setReasonOther} testID="aug-reason-other" />
            )}
          </View>

          <View style={s.section} testID="aug-defect-section">
            <View style={s.sectionHeader}>
              <Ionicons name="locate-outline" size={20} color="#C62828" />
              <Text style={s.sectionTitle}>Defect Location <Text style={{ color: '#DC3545' }}>*</Text></Text>
            </View>
            <Text style={s.helperText}>Tap the teeth at the defect site (multiple selection allowed).</Text>
            <FDIChart selectedTooth={null} selectedTeeth={defectTeeth}
              onSelect={(t) => setDefectTeeth(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])} />
            {defectTeeth.length > 0 && (
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#1565C0', marginTop: 8 }} testID="aug-defect-teeth-summary">
                Selected: {defectTeeth.join(', ')}
              </Text>
            )}

            <Text style={[s.label, { marginTop: 16 }]}>Bone Defect Side <Text style={{ color: '#DC3545' }}>*</Text></Text>
            <AugDropdown options={BONE_DEFECT_SIDES} selected={defectSides} onChange={setDefectSides} testPrefix="aug-side" placeholder="Select side(s)…" />

            <Text style={[s.label, { marginTop: 16 }]}>Horizontal defect <Text style={{ color: '#DC3545' }}>*</Text></Text>
            <AugDropdown options={DEFECT_SEVERITY} selected={horizontalDefect ? [horizontalDefect] : []} onChange={(v) => setHorizontalDefect(v[0] || '')} multi={false} testPrefix="aug-hdefect" placeholder="Select severity…" />
            <Text style={[s.label, { marginTop: 12 }]}>Vertical defect <Text style={{ color: '#DC3545' }}>*</Text></Text>
            <AugDropdown options={DEFECT_SEVERITY} selected={verticalDefect ? [verticalDefect] : []} onChange={(v) => setVerticalDefect(v[0] || '')} multi={false} testPrefix="aug-vdefect" placeholder="Select severity…" />
            <Text style={[s.label, { marginTop: 12 }]}>Other</Text>
            <TextInput style={s.input} placeholder="Other defect details (optional)..." value={defectOther} onChangeText={setDefectOther} testID="aug-defect-other" />

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Bone width before graft (mm) <Text style={{ color: '#DC3545' }}>*</Text></Text>
                <TextInput style={s.input} keyboardType="decimal-pad" placeholder="mm" value={boneWidth}
                  onChangeText={v => setBoneWidth(v.replace(/[^0-9.]/g, ''))} testID="aug-bone-width" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Bone height before graft (mm) <Text style={{ color: '#DC3545' }}>*</Text></Text>
                <TextInput style={s.input} keyboardType="decimal-pad" placeholder="mm" value={boneHeight}
                  onChangeText={v => setBoneHeight(v.replace(/[^0-9.]/g, ''))} testID="aug-bone-height" />
              </View>
            </View>
          </View>

          {/* iter-396: mandatory Pre-operative CBCT — compared with Step 3 post-op */}
          <View style={s.section} testID="aug-preop-cbct-section">
            <View style={s.sectionHeader}>
              <Ionicons name="scan-outline" size={20} color="#0277BD" />
              <Text style={s.sectionTitle}>Pre-operative CBCT <Text style={{ color: '#DC3545' }}>*</Text></Text>
            </View>
            <Text style={s.helperText}>Upload the pre-operative CBCT report (PDF or image). It will be compared with the post-operative CBCT in Step 3 — Review of Augmentation.</Text>
            <CbctSlots files={cbctFiles} onChange={setCbctFiles} testPrefix="aug-s1" />
          </View>

          {/* Fix #1: Medical Assessment now matches target's own Phase 1
              Medical Assessment pattern (yes/no risk-color chips + the
              HbA1c sub-field when Diabetes is Controlled/Uncontrolled),
              not source's generic Yes/No chip block which omitted HbA1c. */}
          <View style={s.section} testID="aug-medical-section">
            <View style={s.sectionHeader}>
              <Ionicons name="medkit" size={20} color="#00695C" />
              <Text style={s.sectionTitle}>Medical Assessment <Text style={{ color: '#DC3545' }}>*</Text></Text>
            </View>
            {MEDICAL_RISK_FACTORS.map(factor => (
              <View key={factor.id}>
                <View style={s.medicalRow}>
                  <Text style={s.medicalLabel}>{factor.label}</Text>
                  <View style={s.yesNoRow}>
                    {factor.options.map(opt => (
                      <TouchableOpacity key={opt}
                        style={[s.yesNoBtn, medical[factor.id] === opt && (opt === 'No' ? s.noActive : s.yesActive)]}
                        onPress={() => updateMedical(factor.id, opt)}
                        testID={`aug-medical-${factor.id}-${opt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`}>
                        <Text style={[s.yesNoText, medical[factor.id] === opt && s.yesNoTextActive]}>{opt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                {factor.id === 'diabetes' && (medical.diabetes === 'Controlled' || medical.diabetes === 'Uncontrolled') && (
                  <View style={s.hba1cRow} testID="aug-hba1c-row">
                    <Text style={s.hba1cLabel}>HbA1c Value <Text style={s.hba1cOptional}>(optional, %)</Text></Text>
                    <TextInput
                      style={s.hba1cInput}
                      value={medical.hba1c || ''}
                      onChangeText={(t) => updateMedical('hba1c', t)}
                      placeholder="e.g. 7.2"
                      placeholderTextColor="#90A4AE"
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      testID="aug-hba1c-input"
                    />
                  </View>
                )}
              </View>
            ))}
            {medicalComplete && (
              <View style={[s.riskBadge, { backgroundColor: `${risk.color}22`, borderColor: risk.color }]} testID="aug-risk-badge">
                <Text style={{ color: risk.color, fontWeight: '800', fontSize: 13 }}>{risk.level}</Text>
                {risk.warnings.map((w, i) => <Text key={i} style={{ color: '#5D4037', fontSize: 11.5, marginTop: 2 }}>• {w}</Text>)}
              </View>
            )}

            <View style={s.haemWrap} testID="aug-haematology">
              <Text style={s.haemHeading}>Haematology Examination <Text style={{ color: '#90A4AE', fontWeight: '400', fontSize: 12 }}>(all optional)</Text></Text>
              {HAEMATOLOGY_FIELDS.map(f => (
                <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#455A64' }}>{f.label}</Text>
                    {f.hint ? <Text style={{ fontSize: 10.5, color: '#90A4AE' }}>{f.hint}</Text> : null}
                  </View>
                  <TextInput style={[s.input, { width: 110, minHeight: 38 }]} value={medical[f.id] || ''}
                    onChangeText={t => updateMedical(f.id, t)}
                    placeholder={f.placeholder} keyboardType="decimal-pad" testID={`aug-haem-${f.id}`} />
                </View>
              ))}
            </View>
          </View>

          <View style={{ padding: 16, paddingBottom: 32 }}>
            <TouchableOpacity style={[s.submitBtn, loading && { opacity: 0.6 }]} onPress={handleSubmit} disabled={loading} testID="aug-step1-submit">
              {loading ? <ActivityIndicator color="#FFF" /> : (
                <><Ionicons name="checkmark-done" size={22} color="#FFF" /><Text style={s.submitText}>Step 1 Complete</Text></>
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
  scroll: { paddingBottom: 32, paddingTop: 8 },
  section: { backgroundColor: '#FFF', marginHorizontal: 16, marginBottom: 16, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E8EDF2' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1565C0', flex: 1, letterSpacing: 0.3 },
  label: { fontSize: 13, fontWeight: '600', color: '#1565C0', marginBottom: 6 },
  helperText: { fontSize: 12, color: '#999', fontStyle: 'italic', marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 10, fontSize: 13, backgroundColor: '#FAFAFA', minHeight: 40 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#D0DCE8', backgroundColor: '#F8FAFC' },
  chipActive: { borderColor: '#1565C0', backgroundColor: '#1565C0' },
  chipText: { fontSize: 12.5, color: '#666', fontWeight: '600' },
  chipTextActive: { color: '#FFF' },
  riskBadge: { borderRadius: 10, borderWidth: 1, padding: 10, marginTop: 4 },
  haemWrap: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#ECEFF1', paddingTop: 12 },
  haemHeading: { fontSize: 14, fontWeight: '700', color: '#37474F', marginBottom: 10 },
  // Fix #1 — mirrors target's Phase 1 Medical Assessment styling exactly
  // (frontend/app/(tabs)/new-procedure.tsx styles: medicalRow, medicalLabel,
  // yesNoRow, yesNoBtn, yesActive, noActive, yesNoText, yesNoTextActive,
  // hba1cRow, hba1cLabel, hba1cOptional, hba1cInput).
  medicalRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E0E7EE' },
  medicalLabel: { fontSize: 14, color: '#333', fontWeight: '500', marginBottom: 8 },
  yesNoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  yesNoBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#D0DCE8', backgroundColor: '#FFF' },
  yesActive: { backgroundColor: '#DC3545', borderColor: '#DC3545' },
  noActive: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  yesNoText: { fontSize: 13, color: '#666', fontWeight: '500' },
  yesNoTextActive: { color: '#FFF' },
  hba1cRow: { paddingHorizontal: 4, paddingTop: 4, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#E0E7EE', backgroundColor: '#FAFBFD' },
  hba1cLabel: { fontSize: 13, color: '#37474F', fontWeight: '600', marginBottom: 6 },
  hba1cOptional: { fontSize: 11, color: '#78909C', fontWeight: '400' },
  hba1cInput: { borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#263238', backgroundColor: '#FFF', maxWidth: 180 },
  submitBtn: { flexDirection: 'row', backgroundColor: '#1B5E20', borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
