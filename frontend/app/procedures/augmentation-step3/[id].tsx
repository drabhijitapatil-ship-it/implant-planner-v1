/**
 * iter-393 — Pre-Implant Augmentation: Step 3 — Review of Pre-Implant
 * Augmentation. Healing status, complications, bone graft outcome, bone gain,
 * optional CBCT upload → decision (Complete / Failed + next action) →
 * Submit for approval (Supervisor + In-Charge).
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Image, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import api, { getToken } from '../../../utils/api';
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
  const [cbctFiles, setCbctFiles] = useState<({ filename: string; original_name: string; content_type: string } | null)[]>([null, null]);
  const [cbctUploadingIdx, setCbctUploadingIdx] = useState<number | null>(null);
  const [authToken, setAuthToken] = useState('');
  const [decision, setDecision] = useState<'' | 'complete' | 'failed'>('');
  const [failedAction, setFailedAction] = useState('');
  const [boneBefore, setBoneBefore] = useState<{ w: string; h: string }>({ w: '', h: '' });

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/procedures/${id}`);
        const rnd = (res.data.augmentations || []).slice(-1)[0];
        const s3 = rnd?.step3;
        const s1 = rnd?.step1 || {};
        setBoneBefore({ w: s1.bone_width_before || '', h: s1.bone_height_before || '' });
        if (s3) {
          setHealing(s3.healing_status || '');
          setComplications(s3.complications || []);
          setComplicationOther(s3.complication_other_text || '');
          setOutcome(s3.outcome || '');
          setWidthAfter(s3.bone_width_after || '');
          setHeightAfter(s3.bone_height_after || '');
          const files = (s3.cbct_files || []) as any[];
          setCbctFiles(files.length >= 2 ? files : [...files, ...new Array(2 - files.length).fill(null)]);
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

  useEffect(() => { getToken('access_token').then(t => setAuthToken(t || '')); }, []);

  const pickCbctAtIndex = async (idx: number) => {
    try {
      const picked = await showUploadPicker(['application/pdf', 'image/png', 'image/jpeg', 'image/heic', 'image/heif']);
      if (!picked) return;
      setCbctUploadingIdx(idx);
      const fd = new FormData();
      fd.append('file', { uri: picked.uri, name: picked.name || 'cbct_report.pdf', type: picked.type || 'application/pdf' } as any);
      const res = await api.post('/uploads/cbct-temp', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setCbctFiles(prev => {
        const u = [...prev];
        u[idx] = {
          filename: res.data.cbct_file,
          original_name: res.data.cbct_original_name,
          content_type: res.data.cbct_content_type,
        };
        return u;
      });
    } catch (e: any) {
      Alert.alert('Upload Failed', e?.response?.data?.detail || 'Could not upload CBCT file');
    } finally { setCbctUploadingIdx(null); }
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
        cbct_files: cbctFiles.filter(Boolean),
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
            {/* iter-396: live pre-op → post-op bone gain comparison */}
            {(() => {
              const seg = (before: string, after: string) => {
                const b = parseFloat(before); const a = parseFloat(after);
                if (isNaN(b) || isNaN(a)) return null;
                const d = Math.round((a - b) * 100) / 100;
                return `${b} → ${a} mm (${d >= 0 ? '+' : ''}${d} mm)`;
              };
              const w = seg(boneBefore.w, widthAfter);
              const h = seg(boneBefore.h, heightAfter);
              if (!w && !h) return null;
              return (
                <View style={s.gainBox} testID="aug-gain-preview">
                  <Ionicons name="trending-up" size={16} color="#1B5E20" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.gainTitle}>Bone gain vs pre-operative (Step 1)</Text>
                    {w ? <Text style={s.gainLine} testID="aug-gain-width">Width: {w}</Text> : null}
                    {h ? <Text style={s.gainLine} testID="aug-gain-height">Height: {h}</Text> : null}
                  </View>
                </View>
              );
            })()}
          </View>

          <View style={s.section} testID="aug-cbct-section">
            <View style={s.sectionHeader}>
              <Ionicons name="scan-outline" size={20} color="#0277BD" />
              <Text style={s.sectionTitle}>CBCT Report</Text>
            </View>
            <Text style={s.helperText}>Upload the post-graft CBCT report (PDF or image) — same as Phase 1.</Text>
            {cbctFiles.map((file, idx) => {
              const isExtra = idx >= 2;
              const baseUrl = api.defaults.baseURL || '';
              return (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }} testID={`aug-cbct-slot-${idx}`}>
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
                          style={s.cbctViewBtn}
                          onPress={() => Linking.openURL(`${baseUrl}/uploads/${file.filename}?token=${authToken}`).catch(() => Alert.alert('Error', 'Could not open file'))}
                          testID={`aug-view-cbct-${idx}`}
                        >
                          <Text style={s.cbctViewBtnText} numberOfLines={1}>View CBCT Report</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => { const u = [...cbctFiles]; u[idx] = null; setCbctFiles(u); }} testID={`aug-remove-cbct-${idx}`}>
                          <Ionicons name="close-circle" size={22} color="#E53935" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={s.cbctUploadBtn}
                        onPress={() => pickCbctAtIndex(idx)} disabled={cbctUploadingIdx === idx}
                        testID={`aug-upload-cbct-${idx}`}
                      >
                        {cbctUploadingIdx === idx ? (
                          <ActivityIndicator color="#FFF" size="small" />
                        ) : (
                          <>
                            <Ionicons name="cloud-upload" size={18} color="#FFF" />
                            <Text style={s.cbctUploadBtnText}>Upload CBCT Report</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                  {isExtra && (
                    <TouchableOpacity onPress={() => setCbctFiles(prev => prev.filter((_, j) => j !== idx))} testID={`aug-remove-extra-cbct-${idx}`}>
                      <Ionicons name="remove-circle" size={26} color="#E53935" />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 }}
              onPress={() => setCbctFiles(prev => [...prev, null])} testID="aug-add-extra-cbct-btn">
              <Ionicons name="add-circle" size={26} color="#4CAF50" />
              <Text style={{ color: '#4CAF50', fontWeight: '700', fontSize: 14 }}>Add CBCT Report</Text>
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
  cbctViewBtn: { flex: 1, backgroundColor: '#E3F2FD', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: '#90CAF9' },
  cbctViewBtnText: { color: '#1565C0', fontSize: 13, fontWeight: '700' },
  cbctUploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, borderStyle: 'dashed' as any },
  cbctUploadBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: '#1565C0', borderStyle: 'dashed', borderRadius: 10, paddingVertical: 12 },
  uploadBtnText: { color: '#1565C0', fontSize: 13.5, fontWeight: '700' },
  decisionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 10, paddingVertical: 13 },
  decisionText: { fontSize: 14, fontWeight: '800' },
  failedOption: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: '#E0E7EE', borderRadius: 10, padding: 12, marginBottom: 8, backgroundColor: '#FFF' },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#CFD8DC', alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 9, height: 9, borderRadius: 5 },
  warnText: { fontSize: 12, color: '#8D6E63', marginTop: 10, fontStyle: 'italic' },
  gainBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#E8F5E9', borderRadius: 10, borderWidth: 1, borderColor: '#A5D6A7', padding: 12, marginTop: 14 },
  gainTitle: { fontSize: 12, fontWeight: '800', color: '#1B5E20', marginBottom: 3 },
  gainLine: { fontSize: 12.5, fontWeight: '700', color: '#2E7D32' },
  submitBtn: { flexDirection: 'row', backgroundColor: '#1B5E20', borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
