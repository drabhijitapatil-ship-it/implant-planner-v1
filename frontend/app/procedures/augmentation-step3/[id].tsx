/**
 * iter-393 — Pre-Implant Augmentation: Step 3 — Review of Pre-Implant
 * Augmentation. Healing status, complications, bone graft outcome, bone gain,
 * optional CBCT upload → decision (Complete / Failed + next action) →
 * Submit for approval (Supervisor + In-Charge).
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
import { showUploadPicker } from '../../../utils/uploadPicker';
import AugDropdown from '../../../components/AugDropdown';
import {
  GRAFT_HEALING_STATUS, AUGMENTATION_COMPLICATIONS, GRAFT_OUTCOMES,
} from '../../../constants/checklist';

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const Chips = ({ options, value, values, onSelect, onToggle, testPrefix }: any) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
    {options.map((opt: string) => {
      const on = values ? values.includes(opt) : value === opt;
      return (
        <TouchableOpacity key={opt} style={[s.chip, on && s.chipActive]}
          onPress={() => (onToggle ? onToggle(opt) : onSelect(opt))} testID={`${testPrefix}-${slug(opt)}`}>
          <Text style={[s.chipText, on && s.chipTextActive]}>{opt}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const FAILED_ACTIONS = [
  { id: 'terminate', label: 'Terminate Treatment', icon: 'close-circle-outline', color: '#C62828' },
  { id: 'repeat', label: 'Repeat Pre-Implant Bone Augmentation', icon: 'refresh-circle-outline', color: '#E65100' },
  { id: 'proceed_phase2', label: 'Proceed to Phase 2', icon: 'arrow-forward-circle-outline', color: '#1565C0' },
];

export default function AugmentationStep3() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingProc, setLoadingProc] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [healing, setHealing] = useState('');
  const [complications, setComplications] = useState<string[]>([]);
  const [complicationOther, setComplicationOther] = useState('');
  const [outcome, setOutcome] = useState('');
  const [widthAfter, setWidthAfter] = useState('');
  const [heightAfter, setHeightAfter] = useState('');
  const [cbctFiles, setCbctFiles] = useState<{ filename: string; original_name: string; content_type: string }[]>([]);
  const [decision, setDecision] = useState<'' | 'complete' | 'failed'>('');
  const [failedAction, setFailedAction] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/procedures/${id}`);
        const rnd = (res.data.augmentations || []).slice(-1)[0];
        const s3 = rnd?.step3;
        if (s3) {
          setHealing(s3.healing_status || '');
          setComplications(s3.complications || []);
          setComplicationOther(s3.complication_other_text || '');
          setOutcome(s3.outcome || '');
          setWidthAfter(s3.bone_width_after || '');
          setHeightAfter(s3.bone_height_after || '');
          setCbctFiles(s3.cbct_files || []);
          setDecision(s3.decision || '');
          setFailedAction(s3.failed_action || '');
        }
      } catch (e: any) {
        Alert.alert('Error', e?.response?.data?.detail || 'Failed to load case');
      } finally { setLoadingProc(false); }
    })();
  }, [id]);

  const onComplicationsChange = (next: string[]) =>
    setComplications(prev => {
      if (next.includes('None') && !prev.includes('None')) return ['None'];
      return next.filter(o => o !== 'None' || !next.some(x => x !== 'None'));
    });

  const pickCbct = async () => {
    try {
      const picked = await showUploadPicker(['application/pdf', 'image/png', 'image/jpeg', 'image/heic', 'image/heif']);
      if (!picked) return;
      setUploading(true);
      const fd = new FormData();
      fd.append('file', { uri: picked.uri, name: picked.name || 'cbct_report.pdf', type: picked.type || 'application/pdf' } as any);
      const res = await api.post('/uploads/cbct-temp', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setCbctFiles(prev => [...prev, {
        filename: res.data.cbct_file,
        original_name: res.data.cbct_original_name,
        content_type: res.data.cbct_content_type,
      }]);
    } catch (e: any) {
      Alert.alert('Upload Failed', e?.response?.data?.detail || 'Could not upload CBCT file');
    } finally { setUploading(false); }
  };

  const handleSubmit = async () => {
    const missing: string[] = [];
    if (!healing) missing.push('Healing status of Bone graft');
    if (complications.length === 0) missing.push('Complications (select None if there were none)');
    if (complications.includes('Other') && !complicationOther.trim()) missing.push('Other complication details');
    if (!outcome) missing.push('Bone graft outcome');
    if (!decision) missing.push('Bone Graft Augmentation Complete or Failed');
    if (decision === 'failed' && !failedAction) missing.push('Next step for the failed augmentation');
    if (missing.length) {
      Alert.alert('Incomplete', `Please complete:\n• ${missing.join('\n• ')}`);
      return;
    }
    setLoading(true);
    try {
      await api.post(`/procedures/${id}/augmentation/step3`, {
        healing_status: healing,
        complications, complication_other_text: complicationOther,
        outcome,
        bone_width_after: widthAfter, bone_height_after: heightAfter,
        cbct_files: cbctFiles,
        decision, failed_action: decision === 'failed' ? failedAction : '',
      });
      setCompleted(true);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to submit Step 3 Review');
    } finally { setLoading(false); }
  };

  if (completed) {
    return (
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <PhaseHeader title="Pre-Implant Augmentation" subtitle="Step 3 — Review of Pre-Implant Augmentation" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="checkmark-circle" size={64} color="#1B5E20" />
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#1B5E20', marginTop: 10 }} testID="aug-step3-submitted">Submitted for Approval</Text>
          <TouchableOpacity onPress={() => router.replace(`/procedures/${id}`)} style={{ marginTop: 14 }} testID="aug-step3-view-case">
            <Text style={{ color: '#1565C0', fontWeight: '600', fontSize: 14, textDecorationLine: 'underline' }}>View Case</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  if (loadingProc) {
    return (
      <SafeAreaView style={s.container}>
        <PhaseHeader title="Pre-Implant Augmentation" subtitle="Step 3 — Review of Pre-Implant Augmentation" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color="#1565C0" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <PhaseHeader title="Pre-Implant Augmentation" subtitle="Step 3 — Review of Pre-Implant Augmentation" testID="aug-step3-header" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll}>

          <View style={s.section} testID="aug-healing-status-section">
            <View style={s.sectionHeader}>
              <Ionicons name="pulse-outline" size={20} color="#00695C" />
              <Text style={s.sectionTitle}>Healing status of Bone graft <Text style={{ color: '#DC3545' }}>*</Text></Text>
            </View>
            <Chips options={GRAFT_HEALING_STATUS} value={healing} onSelect={setHealing} testPrefix="aug-heal" />
          </View>

          <View style={s.section} testID="aug-complications-section">
            <View style={s.sectionHeader}>
              <Ionicons name="warning-outline" size={20} color="#E65100" />
              <Text style={s.sectionTitle}>Complications <Text style={{ color: '#DC3545' }}>*</Text></Text>
            </View>
            <AugDropdown options={AUGMENTATION_COMPLICATIONS} selected={complications} onChange={onComplicationsChange} testPrefix="aug-comp" placeholder="Select complication(s), or None…" />
            {complications.includes('Other') && (
              <TextInput style={[s.input, { marginTop: 10 }]} placeholder="Describe the other complication..."
                value={complicationOther} onChangeText={setComplicationOther} testID="aug-comp-other" />
            )}
          </View>

          <View style={s.section} testID="aug-outcome-section">
            <View style={s.sectionHeader}>
              <Ionicons name="analytics-outline" size={20} color="#6A1B9A" />
              <Text style={s.sectionTitle}>Bone graft outcome <Text style={{ color: '#DC3545' }}>*</Text></Text>
            </View>
            <AugDropdown options={GRAFT_OUTCOMES} selected={outcome ? [outcome] : []} onChange={(v) => setOutcome(v[0] || '')} multi={false} testPrefix="aug-outcome" placeholder="Select outcome…" />

            <Text style={[s.label, { marginTop: 16 }]}>Bone gain achieved</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Horizontal after bone graft (mm)</Text>
                <TextInput style={s.input} keyboardType="decimal-pad" placeholder="mm" value={widthAfter}
                  onChangeText={v => setWidthAfter(v.replace(/[^0-9.]/g, ''))} testID="aug-bone-width-after" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Vertical after bone graft (mm)</Text>
                <TextInput style={s.input} keyboardType="decimal-pad" placeholder="mm" value={heightAfter}
                  onChangeText={v => setHeightAfter(v.replace(/[^0-9.]/g, ''))} testID="aug-bone-height-after" />
              </View>
            </View>
          </View>

          <View style={s.section} testID="aug-cbct-section">
            <View style={s.sectionHeader}>
              <Ionicons name="scan-outline" size={20} color="#0277BD" />
              <Text style={s.sectionTitle}>CBCT Report</Text>
            </View>
            <Text style={s.helperText}>Upload the post-graft CBCT report (PDF or image).</Text>
            {cbctFiles.map((f, i) => (
              <View key={i} style={s.fileRow} testID={`aug-cbct-file-${i}`}>
                <Ionicons name="document-attach-outline" size={16} color="#1565C0" />
                <Text style={{ flex: 1, fontSize: 12.5, color: '#37474F' }} numberOfLines={1}>{f.original_name}</Text>
                <TouchableOpacity onPress={() => setCbctFiles(prev => prev.filter((_, j) => j !== i))} testID={`aug-cbct-remove-${i}`}>
                  <Ionicons name="trash-outline" size={16} color="#C62828" />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={s.uploadBtn} onPress={pickCbct} disabled={uploading} testID="aug-cbct-upload-btn">
              {uploading ? <ActivityIndicator size="small" color="#1565C0" /> : (
                <><Ionicons name="cloud-upload-outline" size={17} color="#1565C0" /><Text style={s.uploadBtnText}>Upload CBCT Report</Text></>
              )}
            </TouchableOpacity>
          </View>

          <View style={s.section} testID="aug-decision-section">
            <View style={s.sectionHeader}>
              <Ionicons name="git-branch-outline" size={20} color="#37474F" />
              <Text style={s.sectionTitle}>Augmentation Decision <Text style={{ color: '#DC3545' }}>*</Text></Text>
            </View>
            <View style={{ gap: 10 }}>
              <TouchableOpacity
                style={[s.decisionBtn, { borderColor: '#1B5E20' }, decision === 'complete' && { backgroundColor: '#1B5E20' }]}
                onPress={() => { setDecision('complete'); setFailedAction(''); }} testID="aug-graft-complete-btn">
                <Ionicons name="checkmark-circle-outline" size={18} color={decision === 'complete' ? '#FFF' : '#1B5E20'} />
                <Text style={[s.decisionText, { color: decision === 'complete' ? '#FFF' : '#1B5E20' }]}>Bone Graft Augmentation Complete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.decisionBtn, { borderColor: '#C62828' }, decision === 'failed' && { backgroundColor: '#C62828' }]}
                onPress={() => setDecision('failed')} testID="aug-graft-failed-btn">
                <Ionicons name="close-circle-outline" size={18} color={decision === 'failed' ? '#FFF' : '#C62828'} />
                <Text style={[s.decisionText, { color: decision === 'failed' ? '#FFF' : '#C62828' }]}>Bone Graft Augmentation Failed</Text>
              </TouchableOpacity>
            </View>
            {decision === 'failed' && (
              <View style={{ marginTop: 14 }}>
                <Text style={s.label}>Next step <Text style={{ color: '#DC3545' }}>*</Text></Text>
                {FAILED_ACTIONS.map(a => (
                  <TouchableOpacity key={a.id}
                    style={[s.failedOption, failedAction === a.id && { borderColor: a.color, backgroundColor: `${a.color}14` }]}
                    onPress={() => setFailedAction(a.id)} testID={`aug-failed-${a.id.replace(/_/g, '-')}`}>
                    <Ionicons name={a.icon as any} size={18} color={a.color} />
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: failedAction === a.id ? a.color : '#546E7A' }}>{a.label}</Text>
                    <View style={[s.radio, failedAction === a.id && { borderColor: a.color }]}>
                      {failedAction === a.id && <View style={[s.radioDot, { backgroundColor: a.color }]} />}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {decision === 'failed' && failedAction === 'terminate' && (
              <Text style={s.warnText}>On approval, the treatment ends and the case will not proceed further.</Text>
            )}
            {decision === 'failed' && failedAction === 'repeat' && (
              <Text style={s.warnText}>On approval, a new Bone Grafting round opens. Records of this round are preserved.</Text>
            )}
          </View>

          <View style={{ padding: 16, paddingBottom: 32 }}>
            <TouchableOpacity style={[s.submitBtn, loading && { opacity: 0.6 }]} onPress={handleSubmit} disabled={loading} testID="aug-step3-submit">
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
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1565C0', flex: 1, letterSpacing: 0.3 },
  label: { fontSize: 13, fontWeight: '600', color: '#1565C0', marginBottom: 6 },
  helperText: { fontSize: 12, color: '#999', fontStyle: 'italic', marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 10, fontSize: 13, backgroundColor: '#FAFAFA', minHeight: 40 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#D0DCE8', backgroundColor: '#F8FAFC' },
  chipActive: { borderColor: '#1565C0', backgroundColor: '#1565C0' },
  chipText: { fontSize: 12.5, color: '#666', fontWeight: '600' },
  chipTextActive: { color: '#FFF' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F1F7FE', borderRadius: 8, padding: 9, marginBottom: 8 },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: '#1565C0', borderStyle: 'dashed', borderRadius: 10, paddingVertical: 12 },
  uploadBtnText: { color: '#1565C0', fontSize: 13.5, fontWeight: '700' },
  decisionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 10, paddingVertical: 13 },
  decisionText: { fontSize: 14, fontWeight: '800' },
  failedOption: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: '#E0E7EE', borderRadius: 10, padding: 12, marginBottom: 8, backgroundColor: '#FFF' },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#CFD8DC', alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 9, height: 9, borderRadius: 5 },
  warnText: { fontSize: 12, color: '#8D6E63', marginTop: 10, fontStyle: 'italic' },
  submitBtn: { flexDirection: 'row', backgroundColor: '#1B5E20', borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
