/**
 * Research Module — ethics & consent (part of S8): IEC, CTRI, consent version,
 * planned dates, notes. Required before activation (BR-07 / BR-16).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert, KeyboardAvoidingView, Platform, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showUploadPicker } from '../../../utils/uploadPicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import api, { getToken } from '../../../utils/api';
import CalendarPicker from '../../../components/CalendarPicker';
import { RC, Card, Chip, Field, Loading, PillSelect, PrimaryButton, ScreenHeader, SectionTitle, errText, u } from '../../../components/research/ResearchUI';

export default function EthicsEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [form, setForm] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [letter, setLetter] = useState<any | null>(null);
  const [canViewLetter, setCanViewLetter] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.get(`/research/studies/${id}`).then(s => { setLetter(s.data.iec_letter || null); setCanViewLetter(!!s.data.can_view_iec_letter); setForm({
      research_question: s.data.research_question || '', target_n: String(s.data.target_n || ''), iec_ref: s.data.iec_ref || '',
      iec_approval_date: s.data.iec_approval_date || '', ctri_number: s.data.ctri_number || '', consent_form_version: s.data.consent_form_version || '',
      planned_start: s.data.planned_start || '', planned_end: s.data.planned_end || '', notes: s.data.notes || '', study_type: s.data.study_type, title: s.data.title,
      recruitment_scope: s.data.recruitment_scope || 'team', iec_multi_operator_declared: !!s.data.iec_multi_operator_declared,
    }); }).catch(e => Alert.alert('Error', errText(e)));
  }, [id]);

  const save = async () => {
    setSaving(true);
    try { await api.put(`/research/studies/${id}`, { ...form, target_n: Number(form.target_n) || 1 }); router.back(); }
    catch (e) { Alert.alert('Could not save', errText(e)); } finally { setSaving(false); }
  };

  const uploadLetter = async () => {
    try {
      const picked = await showUploadPicker(['application/pdf', 'image/jpeg', 'image/png']);
      if (!picked) return;
      setUploading(true);
      const fd = new FormData();
      if (Platform.OS === 'web') { const blob = await (await fetch(picked.uri)).blob(); fd.append('file', blob, picked.name || 'iec_letter.pdf'); }
      else fd.append('file', { uri: picked.uri, name: picked.name || 'iec_letter.pdf', type: picked.type || 'application/pdf' } as any);
      const r = await api.post(`/research/studies/${id}/iec-letter`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setLetter(r.data); setCanViewLetter(true);
    } catch (e) { Alert.alert('Upload failed', errText(e)); } finally { setUploading(false); }
  };
  const openLetter = async () => {
    const tok = await getToken('access_token');
    Linking.openURL(`${api.defaults.baseURL}/research/studies/${id}/iec-letter?token=${tok}`);
  };
  const removeLetter = () => Alert.alert('Remove IEC letter?', '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: async () => {
    try { await api.delete(`/research/studies/${id}/iec-letter`); setLetter(null); } catch (e) { Alert.alert('Error', errText(e)); }
  } }]);

  if (!form) return <Loading />;
  const set = (k: string) => (v: string) => setForm((f: any) => ({ ...f, [k]: v }));
  return (
    <SafeAreaView style={u.container} edges={['bottom']}>
      <ScreenHeader title="Ethics & consent" subtitle="Required before activation" testID="ethics-title" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
          <Card>
            <SectionTitle title="Study" icon="document-text-outline" />
            <Field label="Title" value={form.title} onChangeText={set('title')} />
            <Field label="Research question" value={form.research_question} onChangeText={set('research_question')} multiline testID="ethics-question" />
            <Field label="Target sample size (n)" value={form.target_n} onChangeText={set('target_n')} keyboardType="number-pad" />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><CalendarPicker label="Planned start" value={form.planned_start} onChange={set('planned_start')} allowPast allowFuture compact /></View>
              <View style={{ flex: 1 }}><CalendarPicker label="Planned end" value={form.planned_end} onChange={set('planned_end')} allowPast allowFuture compact /></View>
            </View>
          </Card>
          <Card>
            <SectionTitle title="Ethics committee" icon="shield-checkmark-outline" />
            <Field label="IEC reference number" value={form.iec_ref} onChangeText={set('iec_ref')} placeholder="e.g. IEC/2026/042" testID="iec-ref" />
            <CalendarPicker label="IEC approval date" value={form.iec_approval_date} onChange={set('iec_approval_date')} allowPast allowFuture testID="iec-date" />
            <View style={{ marginTop: 12 }}>
              <Text style={u.label}>IEC approval letter (PDF / JPG / PNG)</Text>
              {letter ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: RC.greenSoft, borderRadius: 10, padding: 10, minHeight: 48 }} testID="iec-letter-row">
                  <Ionicons name={letter.content_type === 'application/pdf' ? 'document-text' : 'image'} size={20} color={RC.green} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={u.strong} numberOfLines={1}>{letter.filename || 'Approval letter uploaded'}</Text>
                    {!!letter.uploaded_by && <Text style={u.kv}>by {letter.uploaded_by} · {String(letter.uploaded_at || '').slice(0, 10)}</Text>}
                  </View>
                  {canViewLetter && <TouchableOpacity onPress={openLetter} style={{ padding: 8 }} testID="iec-letter-open"><Ionicons name="eye-outline" size={20} color={RC.primary} /></TouchableOpacity>}
                  <TouchableOpacity onPress={removeLetter} style={{ padding: 8 }} testID="iec-letter-remove"><Ionicons name="trash-outline" size={20} color={RC.red} /></TouchableOpacity>
                </View>
              ) : (
                <PrimaryButton label="Upload approval letter" variant="outline" icon="cloud-upload-outline" onPress={uploadLetter} loading={uploading} testID="iec-letter-upload" />
              )}
              <View style={{ flexDirection: 'row', marginTop: 6 }}><Chip label="Visible to PI & guide only" color={RC.purple} bg={RC.purpleSoft} small /></View>
            </View>
            <View style={{ height: 12 }} />
            <Field label={`CTRI registration number${form.study_type === 'rct' ? ' (required for RCT)' : ' (optional)'}`} value={form.ctri_number} onChangeText={set('ctri_number')} placeholder="CTRI/2026/06/0xxxxx" testID="ctri" />
          </Card>
          <Card>
            <SectionTitle title="Consent" icon="create-outline" />
            <Field label="Consent form version" value={form.consent_form_version} onChangeText={set('consent_form_version')} placeholder="e.g. v1.0 (English / Marathi / Hindi)" hint="Enrolment records which version the patient signed." testID="consent-version" />
            <Field label="Notes (protocol summary, references)" value={form.notes} onChangeText={set('notes')} multiline />
            <Text style={u.kv}>Per ICMR 2017 guidelines: versioned consent in the patient{"'"}s language; withdrawal is honoured (future-only or all data).</Text>
          </Card>
          <Card testID="recruitment-scope-card">
            <SectionTitle title="Recruitment scope" icon="business-outline" />
            <PillSelect value={form.recruitment_scope} onChange={(v: string) => setForm((f: any) => ({ ...f, recruitment_scope: v }))}
              options={[{ key: 'team', label: 'Team cases only' }, { key: 'department', label: 'Department-wide' }]} testID="recruitment-scope" />
            <Text style={[u.kv, { marginTop: 8 }]}>
              {form.recruitment_scope === 'department'
                ? 'Eligible implants treated by any clinician in the department appear in screening without patient identity. The study team sends an inclusion request; the treating student or supervisor confirms the patient\'s consent, the case is enrolled and they can enter its visit data. Treating clinicians can also offer their cases from the case screen.'
                : 'Only cases the study team can already open clinically (own cases / supervised cases) can be screened and enrolled.'}
            </Text>
            {form.recruitment_scope === 'department' && (
              <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 10, minHeight: 44 }} onPress={() => setForm((f: any) => ({ ...f, iec_multi_operator_declared: !f.iec_multi_operator_declared }))} testID="iec-multi-operator">
                <Ionicons name={form.iec_multi_operator_declared ? 'checkbox' : 'square-outline'} size={22} color={form.iec_multi_operator_declared ? RC.primary : RC.muted} />
                <Text style={[u.kv, { flex: 1, marginLeft: 8, marginTop: 2 }]}>The IEC application states that patients treated by other clinicians in the department may be recruited (multi-operator recruitment). Required for activation.</Text>
              </TouchableOpacity>
            )}
          </Card>
          <View style={{ marginHorizontal: 14, marginTop: 14 }}>
            <PrimaryButton label="Save" icon="save-outline" onPress={save} loading={saving} testID="save-ethics" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
