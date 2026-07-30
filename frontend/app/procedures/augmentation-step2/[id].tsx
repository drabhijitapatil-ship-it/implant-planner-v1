/**
 * iter-393 — Pre-Implant Augmentation: Step 2 — Post-procedure Details.
 * Bone graft procedure, graft materials, membrane, fixation, soft tissue
 * graft, healing protocol → Submit for approval (Supervisor + In-Charge).
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
import {
  AUGMENTATION_PROCEDURES, AUTOGENOUS_SITES, OTHER_GRAFT_MATERIALS,
  MEMBRANE_TYPES, FIXATION_OPTIONS, SOFT_TISSUE_GRAFT_TYPES,
  SOFT_TISSUE_DONOR_SITES, SOFT_TISSUE_INDICATIONS, HEALING_PROTOCOLS,
} from '../../../constants/checklist';

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

const YesNo = ({ value, onChange, testPrefix }: any) => (
  <View style={{ flexDirection: 'row', gap: 8 }}>
    {['Yes', 'No'].map(o => (
      <TouchableOpacity key={o} style={[s.chip, value === o && s.chipActive]} onPress={() => onChange(o)} testID={`${testPrefix}-${o.toLowerCase()}`}>
        <Text style={[s.chipText, value === o && s.chipTextActive]}>{o}</Text>
      </TouchableOpacity>
    ))}
  </View>
);

const Field = ({ label, required, children }: any) => (
  <View style={{ marginBottom: 14 }}>
    <Text style={s.label}>{label}{required ? <Text style={{ color: '#DC3545' }}> *</Text> : null}</Text>
    {children}
  </View>
);

export default function AugmentationStep2() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingProc, setLoadingProc] = useState(true);
  const [completed, setCompleted] = useState(false);

  const [proceduresPerformed, setProceduresPerformed] = useState<string[]>([]);
  const [procedureOther, setProcedureOther] = useState('');
  const [autogenous, setAutogenous] = useState('');
  const [autogenousSites, setAutogenousSites] = useState<string[]>([]);
  const [autogenousOther, setAutogenousOther] = useState('');
  const [allograft, setAllograft] = useState('');
  const [otherMaterials, setOtherMaterials] = useState<string[]>([]);
  const [materialOther, setMaterialOther] = useState('');
  const [membrane, setMembrane] = useState('');
  const [membraneTypes, setMembraneTypes] = useState<string[]>([]);
  const [membraneOther, setMembraneOther] = useState('');
  const [fixation, setFixation] = useState<string[]>([]);
  const [softTissue, setSoftTissue] = useState('');
  const [sttTypes, setSttTypes] = useState<string[]>([]);
  const [sttDonors, setSttDonors] = useState<string[]>([]);
  const [sttIndications, setSttIndications] = useState<string[]>([]);
  const [sttOther, setSttOther] = useState('');
  const [healing, setHealing] = useState('');
  const [healingCustom, setHealingCustom] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/procedures/${id}`);
        const rnd = (res.data.augmentations || []).slice(-1)[0];
        const s2 = rnd?.step2;
        if (s2) {
          setProceduresPerformed(s2.procedures_performed || []);
          setProcedureOther(s2.procedure_other_text || '');
          setAutogenous(s2.autogenous_used || '');
          setAutogenousSites(s2.autogenous_sites || []);
          setAutogenousOther(s2.autogenous_other_text || '');
          setAllograft(s2.allograft_used || '');
          setOtherMaterials(s2.other_graft_materials || []);
          setMaterialOther(s2.graft_material_other_text || '');
          setMembrane(s2.membrane_used || '');
          setMembraneTypes(s2.membrane_types || []);
          setMembraneOther(s2.membrane_other_text || '');
          setFixation(s2.fixation || []);
          setSoftTissue(s2.soft_tissue_graft || '');
          setSttTypes(s2.soft_tissue_types || []);
          setSttDonors(s2.soft_tissue_donor_sites || []);
          setSttIndications(s2.soft_tissue_indications || []);
          setSttOther(s2.soft_tissue_other_text || '');
          setHealing(s2.healing_protocol || '');
          setHealingCustom(s2.healing_custom_text || '');
        }
      } catch (e: any) {
        Alert.alert('Error', e?.response?.data?.detail || 'Failed to load case');
      } finally { setLoadingProc(false); }
    })();
  }, [id]);

  const toggle = (setter: any) => (opt: string) =>
    setter((prev: string[]) => prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]);

  const handleSubmit = async () => {
    const missing: string[] = [];
    if (proceduresPerformed.length === 0) missing.push('Procedure performed');
    if (proceduresPerformed.includes('Other') && !procedureOther.trim()) missing.push('Other procedure details');
    if (!autogenous) missing.push('Autogenous graft — Yes/No');
    if (autogenous === 'Yes' && autogenousSites.length === 0) missing.push('Autogenous donor site');
    if (autogenousSites.includes('Other') && !autogenousOther.trim()) missing.push('Autogenous other site details');
    if (!allograft) missing.push('Allograft — Yes/No');
    if (otherMaterials.includes('Others') && !materialOther.trim()) missing.push('Other graft material details');
    if (!membrane) missing.push('Membrane Used — Yes/No');
    if (membrane === 'Yes' && membraneTypes.length === 0) missing.push('Membrane type');
    if (membraneTypes.includes('Others') && !membraneOther.trim()) missing.push('Other membrane details');
    if (fixation.length === 0) missing.push('Fixation');
    if (!softTissue) missing.push('Soft Tissue Graft — Yes/No');
    if (softTissue === 'Yes') {
      if (sttTypes.length === 0) missing.push('Type of Soft Tissue Graft');
      if (sttDonors.length === 0) missing.push('Soft tissue Donor Site');
      if (sttIndications.length === 0) missing.push('Soft tissue Indication');
    }
    if (!healing) missing.push('Healing Protocol');
    if (healing === 'Custom' && !healingCustom.trim()) missing.push('Custom healing period');
    if (missing.length) {
      Alert.alert('Incomplete', `Please complete:\n• ${missing.slice(0, 8).join('\n• ')}${missing.length > 8 ? `\n…and ${missing.length - 8} more` : ''}`);
      return;
    }
    setLoading(true);
    try {
      await api.post(`/procedures/${id}/augmentation/step2`, {
        procedures_performed: proceduresPerformed, procedure_other_text: procedureOther,
        autogenous_used: autogenous, autogenous_sites: autogenousSites, autogenous_other_text: autogenousOther,
        allograft_used: allograft, other_graft_materials: otherMaterials, graft_material_other_text: materialOther,
        membrane_used: membrane, membrane_types: membraneTypes, membrane_other_text: membraneOther,
        fixation,
        soft_tissue_graft: softTissue, soft_tissue_types: sttTypes,
        soft_tissue_donor_sites: sttDonors, soft_tissue_indications: sttIndications,
        soft_tissue_other_text: sttOther,
        healing_protocol: healing, healing_custom_text: healingCustom,
      });
      setCompleted(true);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to submit Step 2');
    } finally { setLoading(false); }
  };

  if (completed) {
    return (
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <PhaseHeader title="Pre-Implant Augmentation" subtitle="Step 2 — Post-procedure Details" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="checkmark-circle" size={64} color="#1B5E20" />
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#1B5E20', marginTop: 10 }}>Submitted for Approval</Text>
          <TouchableOpacity onPress={() => router.replace(`/procedures/${id}`)} style={{ marginTop: 14 }} testID="aug-step2-view-case">
            <Text style={{ color: '#1565C0', fontWeight: '600', fontSize: 14, textDecorationLine: 'underline' }}>View Case</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  if (loadingProc) {
    return (
      <SafeAreaView style={s.container}>
        <PhaseHeader title="Pre-Implant Augmentation" subtitle="Step 2 — Post-procedure Details" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color="#1565C0" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <PhaseHeader title="Pre-Implant Augmentation" subtitle="Step 2 — Post-procedure Details" testID="aug-step2-header" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll}>

          <View style={s.section} testID="aug-procedure-section">
            <View style={s.sectionHeader}>
              <Ionicons name="construct-outline" size={20} color="#37474F" />
              <Text style={s.sectionTitle}>Bone Graft Procedure</Text>
            </View>
            <Field label="Procedure performed" required>
              <MultiChips options={AUGMENTATION_PROCEDURES} values={proceduresPerformed} onToggle={toggle(setProceduresPerformed)} testPrefix="aug-proc" />
              {proceduresPerformed.includes('Other') && (
                <TextInput style={[s.input, { marginTop: 8 }]} placeholder="Describe the other procedure..." value={procedureOther} onChangeText={setProcedureOther} testID="aug-proc-other" />
              )}
            </Field>
          </View>

          <View style={s.section} testID="aug-material-section">
            <View style={s.sectionHeader}>
              <Ionicons name="flask-outline" size={20} color="#6A1B9A" />
              <Text style={s.sectionTitle}>Graft Material Used</Text>
            </View>
            <Field label="Autogenous" required>
              <YesNo value={autogenous} onChange={(v: string) => { setAutogenous(v); if (v === 'No') { setAutogenousSites([]); setAutogenousOther(''); } }} testPrefix="aug-autogenous" />
              {autogenous === 'Yes' && (
                <View style={{ marginTop: 10 }}>
                  <MultiChips options={AUTOGENOUS_SITES} values={autogenousSites} onToggle={toggle(setAutogenousSites)} testPrefix="aug-auto-site" />
                  {autogenousSites.includes('Other') && (
                    <TextInput style={[s.input, { marginTop: 8 }]} placeholder="Other donor site..." value={autogenousOther} onChangeText={setAutogenousOther} testID="aug-auto-other" />
                  )}
                </View>
              )}
            </Field>
            <Field label="Allograft" required>
              <YesNo value={allograft} onChange={setAllograft} testPrefix="aug-allograft" />
            </Field>
            <Field label="Other graft materials">
              <MultiChips options={OTHER_GRAFT_MATERIALS} values={otherMaterials} onToggle={toggle(setOtherMaterials)} testPrefix="aug-material" />
              {otherMaterials.includes('Others') && (
                <TextInput style={[s.input, { marginTop: 8 }]} placeholder="Other material details..." value={materialOther} onChangeText={setMaterialOther} testID="aug-material-other" />
              )}
            </Field>
          </View>

          <View style={s.section} testID="aug-membrane-section">
            <View style={s.sectionHeader}>
              <Ionicons name="layers-outline" size={20} color="#0277BD" />
              <Text style={s.sectionTitle}>Membrane & Fixation</Text>
            </View>
            <Field label="Membrane Used" required>
              <YesNo value={membrane} onChange={(v: string) => { setMembrane(v); if (v === 'No') { setMembraneTypes([]); setMembraneOther(''); } }} testPrefix="aug-membrane" />
              {membrane === 'Yes' && (
                <View style={{ marginTop: 10 }}>
                  <MultiChips options={MEMBRANE_TYPES} values={membraneTypes} onToggle={toggle(setMembraneTypes)} testPrefix="aug-membrane-type" />
                  {membraneTypes.includes('Others') && (
                    <TextInput style={[s.input, { marginTop: 8 }]} placeholder="Other membrane details..." value={membraneOther} onChangeText={setMembraneOther} testID="aug-membrane-other" />
                  )}
                </View>
              )}
            </Field>
            <Field label="Fixation" required>
              <MultiChips options={FIXATION_OPTIONS} values={fixation} onToggle={toggle(setFixation)} testPrefix="aug-fixation" />
            </Field>
          </View>

          <View style={s.section} testID="aug-soft-tissue-section">
            <View style={s.sectionHeader}>
              <Ionicons name="leaf-outline" size={20} color="#C62828" />
              <Text style={s.sectionTitle}>Soft Tissue Graft</Text>
            </View>
            <Field label="Was Soft Tissue Graft Performed?" required>
              <YesNo value={softTissue} onChange={(v: string) => { setSoftTissue(v); if (v === 'No') { setSttTypes([]); setSttDonors([]); setSttIndications([]); setSttOther(''); } }} testPrefix="aug-stt" />
            </Field>
            {softTissue === 'Yes' && (
              <>
                <Field label="Type of Soft Tissue Graft" required>
                  <MultiChips options={SOFT_TISSUE_GRAFT_TYPES} values={sttTypes} onToggle={toggle(setSttTypes)} testPrefix="aug-stt-type" />
                </Field>
                <Field label="Donor Site" required>
                  <MultiChips options={SOFT_TISSUE_DONOR_SITES} values={sttDonors} onToggle={toggle(setSttDonors)} testPrefix="aug-stt-donor" />
                </Field>
                <Field label="Indication" required>
                  <MultiChips options={SOFT_TISSUE_INDICATIONS} values={sttIndications} onToggle={toggle(setSttIndications)} testPrefix="aug-stt-indication" />
                </Field>
                {(sttTypes.includes('Other') || sttDonors.includes('Other') || sttIndications.includes('Other')) && (
                  <TextInput style={s.input} placeholder="Other soft-tissue details..." value={sttOther} onChangeText={setSttOther} testID="aug-stt-other" />
                )}
              </>
            )}
          </View>

          <View style={s.section} testID="aug-healing-section">
            <View style={s.sectionHeader}>
              <Ionicons name="hourglass-outline" size={20} color="#E65100" />
              <Text style={s.sectionTitle}>Healing Protocol <Text style={{ color: '#DC3545' }}>*</Text></Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {HEALING_PROTOCOLS.map(o => (
                <TouchableOpacity key={o} style={[s.chip, healing === o && s.chipActive]} onPress={() => setHealing(o)} testID={`aug-healing-${o.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`}>
                  <Text style={[s.chipText, healing === o && s.chipTextActive]}>{o}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {healing === 'Custom' && (
              <TextInput style={[s.input, { marginTop: 10 }]} placeholder="Custom healing period (e.g. 5 months)" value={healingCustom} onChangeText={setHealingCustom} testID="aug-healing-custom" />
            )}
          </View>

          <View style={{ padding: 16, paddingBottom: 32 }}>
            <TouchableOpacity style={[s.submitBtn, loading && { opacity: 0.6 }]} onPress={handleSubmit} disabled={loading} testID="aug-step2-submit">
              {loading ? <ActivityIndicator color="#FFF" /> : (
                <><Ionicons name="checkmark-done" size={22} color="#FFF" /><Text style={s.submitText}>Submit for Approval</Text></>
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
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 10, fontSize: 13, backgroundColor: '#FAFAFA', minHeight: 40 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#D0DCE8', backgroundColor: '#F8FAFC' },
  chipActive: { borderColor: '#1565C0', backgroundColor: '#1565C0' },
  chipText: { fontSize: 12.5, color: '#666', fontWeight: '600' },
  chipTextActive: { color: '#FFF' },
  submitBtn: { flexDirection: 'row', backgroundColor: '#1B5E20', borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
