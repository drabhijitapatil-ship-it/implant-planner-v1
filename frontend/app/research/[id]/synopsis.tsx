/**
 * Research Module — synopsis / dissertation editor + export (S19/S20, D3).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import api from '../../../utils/api';
import { downloadAuthenticated } from '../../../utils/csvDownload';
import { Card, Field, Loading, PrimaryButton, ScreenHeader, SectionTitle, errText, u } from '../../../components/research/ResearchUI';

const FREE: { key: string; label: string; hint: string }[] = [
  { key: 'introduction', label: 'Introduction', hint: 'Background and rationale (≈300–500 words).' },
  { key: 'review_of_literature', label: 'Review of literature', hint: 'Optional — key studies supporting the question.' },
  { key: 'aims_objectives', label: 'Aims and objectives', hint: 'Leave blank to generate from the research question.' },
  { key: 'materials_methods_extra', label: 'Materials & methods — additional details', hint: 'Armamentarium, surgical protocol, radiographic technique. Design, criteria, schedule and variables are generated from the protocol.' },
  { key: 'sample_size_text', label: 'Sample size justification', hint: 'Leave blank for a one-line statement of the target n.' },
  { key: 'statistical_analysis', label: 'Statistical analysis', hint: 'Leave blank for a standard descriptive + mixed-model statement.' },
  { key: 'ethical_considerations', label: 'Ethical considerations', hint: 'IEC and consent details are added automatically.' },
  { key: 'references', label: 'References', hint: 'One per line, Vancouver style.' },
];

export default function SynopsisEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [study, setStudy] = useState<any | null>(null);
  const [syn, setSyn] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => { api.get(`/research/studies/${id}`).then(r => { setStudy(r.data); setSyn(r.data.synopsis || {}); }).catch(e => Alert.alert('Error', errText(e))); }, [id]);
  if (!study) return <Loading />;
  const canEdit = ['pi', 'guide', 'co_investigator'].some(r => study.my_roles.includes(r));
  const set = (k: string) => (v: string) => setSyn(s => ({ ...s, [k]: v }));

  const save = async () => {
    setSaving(true);
    try { const r = await api.put(`/research/studies/${id}/synopsis`, syn); setSyn(r.data); Alert.alert('Saved', 'Synopsis text saved.'); }
    catch (e) { Alert.alert('Could not save', errText(e)); } finally { setSaving(false); }
  };
  const doExport = async (fmt: 'docx' | 'pdf') => {
    setExporting(fmt);
    try {
      if (canEdit) await api.put(`/research/studies/${id}/synopsis`, syn);
      await downloadAuthenticated(`${api.defaults.baseURL}/research/studies/${id}/synopsis.${fmt}`, `${study.code}_synopsis.${fmt}`,
        fmt === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    } catch { /* handled */ } finally { setExporting(null); }
  };

  return (
    <SafeAreaView style={u.container} edges={['bottom']}>
      <ScreenHeader title="Synopsis / dissertation" subtitle={`${study.code} · university format DOCX & PDF`} testID="synopsis-title" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
          <Card>
            <SectionTitle title="Title page" icon="school-outline" />
            <Field label="University" value={syn.university_name || ''} onChangeText={set('university_name')} placeholder="e.g. Maharashtra University of Health Sciences, Nashik" editable={canEdit} testID="syn-university" />
            <Field label="College" value={syn.college_name || ''} onChangeText={set('college_name')} editable={canEdit} />
            <Field label="Department" value={syn.department_name || ''} onChangeText={set('department_name')} placeholder="Department of Prosthodontics / Periodontology / Oral Implantology" editable={canEdit} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Field label="Degree" value={syn.degree || ''} onChangeText={set('degree')} placeholder="MDS" editable={canEdit} /></View>
              <View style={{ flex: 1 }}><Field label="Academic year" value={syn.academic_year || ''} onChangeText={set('academic_year')} placeholder="2026–29" editable={canEdit} /></View>
            </View>
            <Field label="Candidate" value={syn.student_name || ''} onChangeText={set('student_name')} placeholder={study.pi_name} editable={canEdit} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Field label="Guide" value={syn.guide_name || ''} onChangeText={set('guide_name')} placeholder={study.guide_name || ''} editable={canEdit} /></View>
              <View style={{ flex: 1 }}><Field label="Co-guide" value={syn.co_guide_name || ''} onChangeText={set('co_guide_name')} editable={canEdit} /></View>
            </View>
          </Card>
          <Card>
            <SectionTitle title="Generated from the protocol" icon="sparkles-outline" />
            <Text style={u.kv}>Title · Investigators · Research question · Study design, unit of analysis, target n · Assessment schedule · Linked baseline variables · Study variables with methods · Inclusion / exclusion criteria · IEC & consent · Current recruitment status · Annexure A: CRF (variables × timepoints).</Text>
          </Card>
          {FREE.map(f => (
            <Card key={f.key}>
              <Field label={f.label} value={syn[f.key] || ''} onChangeText={set(f.key)} multiline hint={f.hint} editable={canEdit} testID={`syn-${f.key}`} />
            </Card>
          ))}
          <View style={{ marginHorizontal: 14, marginTop: 14, gap: 8 }}>
            {canEdit && <PrimaryButton label="Save text" variant="outline" icon="save-outline" onPress={save} loading={saving} testID="syn-save" />}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PrimaryButton label="Download DOCX" icon="document-outline" onPress={() => doExport('docx')} loading={exporting === 'docx'} style={{ flex: 1 }} testID="syn-docx" />
              <PrimaryButton label="Download PDF" icon="document-text-outline" variant="outline" onPress={() => doExport('pdf')} loading={exporting === 'pdf'} style={{ flex: 1 }} testID="syn-pdf" />
            </View>
            <Text style={[u.kv, { textAlign: 'center' }]}>Section order follows the common Indian university synopsis format; edit the DOCX for college-specific formatting.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
