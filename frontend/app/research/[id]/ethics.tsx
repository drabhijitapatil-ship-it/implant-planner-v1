/**
 * Research Module — ethics & consent (part of S8): IEC, CTRI, consent version,
 * planned dates, notes. Required before activation (BR-07 / BR-16).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import api from '../../../utils/api';
import CalendarPicker from '../../../components/CalendarPicker';
import { Card, Field, Loading, PrimaryButton, ScreenHeader, SectionTitle, errText, u } from '../../../components/research/ResearchUI';

export default function EthicsEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [form, setForm] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/research/studies/${id}`).then(s => setForm({
      research_question: s.data.research_question || '', target_n: String(s.data.target_n || ''), iec_ref: s.data.iec_ref || '',
      iec_approval_date: s.data.iec_approval_date || '', ctri_number: s.data.ctri_number || '', consent_form_version: s.data.consent_form_version || '',
      planned_start: s.data.planned_start || '', planned_end: s.data.planned_end || '', notes: s.data.notes || '', study_type: s.data.study_type, title: s.data.title,
    })).catch(e => Alert.alert('Error', errText(e)));
  }, [id]);

  const save = async () => {
    setSaving(true);
    try { await api.put(`/research/studies/${id}`, { ...form, target_n: Number(form.target_n) || 1 }); router.back(); }
    catch (e) { Alert.alert('Could not save', errText(e)); } finally { setSaving(false); }
  };

  if (!form) return <Loading />;
  const set = (k: string) => (v: string) => setForm((f: any) => ({ ...f, [k]: v }));
  return (
    <SafeAreaView style={u.container} edges={['top']}>
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
            <View style={{ height: 12 }} />
            <Field label={`CTRI registration number${form.study_type === 'rct' ? ' (required for RCT)' : ' (optional)'}`} value={form.ctri_number} onChangeText={set('ctri_number')} placeholder="CTRI/2026/06/0xxxxx" testID="ctri" />
          </Card>
          <Card>
            <SectionTitle title="Consent" icon="create-outline" />
            <Field label="Consent form version" value={form.consent_form_version} onChangeText={set('consent_form_version')} placeholder="e.g. v1.0 (English / Marathi / Hindi)" hint="Enrolment records which version the patient signed." testID="consent-version" />
            <Field label="Notes (protocol summary, references)" value={form.notes} onChangeText={set('notes')} multiline />
            <Text style={u.kv}>Per ICMR 2017 guidelines: versioned consent in the patient{"'"}s language; withdrawal is honoured (future-only or all data).</Text>
          </Card>
          <View style={{ marginHorizontal: 14, marginTop: 14 }}>
            <PrimaryButton label="Save" icon="save-outline" onPress={save} loading={saving} testID="save-ethics" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
