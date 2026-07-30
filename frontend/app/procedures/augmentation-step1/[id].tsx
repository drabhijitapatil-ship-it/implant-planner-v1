/**
 * iter-393 — Pre-Implant Augmentation: Step 1 — Pre-procedure Details.
 * Reason for grafting, defect location (FDI multi-select), defect type,
 * baseline bone dimensions, Medical Assessment (compulsory) + Haematology
 * (optional) — same UI language as Phase 1.
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

const MultiChips = ({ options, values, onToggle, testPrefix }: any) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
    {options.map((opt: string) => {
      const on = values.includes(opt);
      return (
        <TouchableOpacity key={opt} style={[s.chip, on && s.chipActive]} onPress={() => onToggle(opt)}
          testID={`${testPrefix}-${opt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`}>
          <Text style={[s.chipText, on && s.chipTextActive]}>{opt}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

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
        } else if (res.data.medical_assessment) {
          setMedical(res.data.medical_assessment);
        }
      } catch (e: any) {
        Alert.alert('Error', e?.response?.data?.detail || 'Failed to load case');
      } finally { setLoadingProc(false); }
    })();
  }, [id]);

  const toggle = (setter: any) => (opt: string) =>
    setter((prev: string[]) => prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]);

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
            <MultiChips options={AUGMENTATION_REASONS} values={reasons} onToggle={toggle(setReasons)} testPrefix="aug-reason" />
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
            <MultiChips options={BONE_DEFECT_SIDES} values={defectSides} onToggle={toggle(setDefectSides)} testPrefix="aug-side" />

            <Text style={[s.label, { marginTop: 16 }]}>Horizontal defect <Text style={{ color: '#DC3545' }}>*</Text></Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {DEFECT_SEVERITY.map(o => (
                <TouchableOpacity key={o} style={[s.chip, horizontalDefect === o && s.chipActive]} onPress={() => setHorizontalDefect(o)} testID={`aug-hdefect-${o.toLowerCase()}`}>
                  <Text style={[s.chipText, horizontalDefect === o && s.chipTextActive]}>{o}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[s.label, { marginTop: 12 }]}>Vertical defect <Text style={{ color: '#DC3545' }}>*</Text></Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {DEFECT_SEVERITY.map(o => (
                <TouchableOpacity key={o} style={[s.chip, verticalDefect === o && s.chipActive]} onPress={() => setVerticalDefect(o)} testID={`aug-vdefect-${o.toLowerCase()}`}>
                  <Text style={[s.chipText, verticalDefect === o && s.chipTextActive]}>{o}</Text>
                </TouchableOpacity>
              ))}
            </View>
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

          <View style={s.section} testID="aug-medical-section">
            <View style={s.sectionHeader}>
              <Ionicons name="medkit" size={20} color="#00695C" />
              <Text style={s.sectionTitle}>Medical Assessment <Text style={{ color: '#DC3545' }}>*</Text></Text>
            </View>
            {MEDICAL_RISK_FACTORS.map(f => (
              <View key={f.id} style={{ marginBottom: 12 }}>
                <Text style={s.label}>{f.label}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {f.options.map(o => (
                    <TouchableOpacity key={o} style={[s.chip, medical[f.id] === o && s.chipActive]}
                      onPress={() => setMedical(prev => ({ ...prev, [f.id]: o }))}
                      testID={`aug-medical-${f.id}-${o.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`}>
                      <Text style={[s.chipText, medical[f.id] === o && s.chipTextActive]}>{o}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
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
                    onChangeText={t => setMedical(prev => ({ ...prev, [f.id]: t }))}
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
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E', flex: 1 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  helperText: { fontSize: 12, color: '#999', fontStyle: 'italic', marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 10, fontSize: 13, backgroundColor: '#FAFAFA', minHeight: 40 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#D0DCE8', backgroundColor: '#F8FAFC' },
  chipActive: { borderColor: '#1565C0', backgroundColor: '#1565C0' },
  chipText: { fontSize: 12.5, color: '#666', fontWeight: '600' },
  chipTextActive: { color: '#FFF' },
  riskBadge: { borderRadius: 10, borderWidth: 1, padding: 10, marginTop: 4 },
  haemWrap: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#ECEFF1', paddingTop: 12 },
  haemHeading: { fontSize: 14, fontWeight: '700', color: '#37474F', marginBottom: 10 },
  submitBtn: { flexDirection: 'row', backgroundColor: '#1B5E20', borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
