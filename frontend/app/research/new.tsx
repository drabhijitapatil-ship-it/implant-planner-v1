/**
 * Research Module — new study (S2/S3): start from template / blank / clone,
 * then identity fields. Protocol details are edited inside the study screen.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet, Switch, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@react-native-vector-icons/ionicons';
import api from '../../utils/api';
import { RC, Card, Field, PillSelect, PrimaryButton, ScreenHeader, SectionTitle, STUDY_TYPE_LABEL, errText, u } from '../../components/research/ResearchUI';

export default function NewStudy() {
  const router = useRouter();
  const { clone_from } = useLocalSearchParams<{ clone_from?: string }>();
  const [templates, setTemplates] = useState<any[]>([]);
  const [templateId, setTemplateId] = useState<string | null>(clone_from ? null : 'blank');
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [studyType, setStudyType] = useState('prospective_cohort');
  const [unit, setUnit] = useState('implant');
  const [targetN, setTargetN] = useState('30');
  const [dissertation, setDissertation] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get('/research/templates').then(r => setTemplates(r.data)).catch(() => {}); }, []);

  const pickTemplate = (t: any | null) => {
    if (!t) { setTemplateId('blank'); return; }
    setTemplateId(t.id); setCode(t.code_suggestion); setTitle(t.name); setStudyType(t.study_type); setUnit(t.primary_unit);
  };

  const create = async () => {
    if (!title.trim() || !code.trim()) { Alert.alert('Missing', 'Study code and title are required.'); return; }
    setSaving(true);
    try {
      const body: any = { code: code.trim().toUpperCase(), title: title.trim(), research_question: question, study_type: studyType,
        primary_unit: unit, target_n: Number(targetN) || 1, is_dissertation: dissertation };
      if (clone_from) body.clone_from = clone_from;
      else if (templateId && templateId !== 'blank') body.template_id = templateId;
      const r = await api.post('/research/studies', body);
      router.replace(`/research/${r.data.id}`);
    } catch (e) { Alert.alert('Could not create study', errText(e)); } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={u.container} edges={['top']}>
      <ScreenHeader title="New study" subtitle={clone_from ? 'Cloning protocol from an existing study' : 'Step 1 · Start from'} testID="new-study-title" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {!clone_from && (
            <Card>
              <SectionTitle title="Start from" icon="copy-outline" />
              <TouchableOpacity style={[s.tpl, templateId === 'blank' && s.tplOn]} onPress={() => pickTemplate(null)} testID="tpl-blank">
                <Ionicons name="document-outline" size={20} color={RC.primary} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={s.tplName}>Blank study</Text>
                  <Text style={s.tplDesc}>Define eligibility, variables and schedule yourself.</Text>
                </View>
              </TouchableOpacity>
              {templates.map(t => (
                <TouchableOpacity key={t.id} style={[s.tpl, templateId === t.id && s.tplOn]} onPress={() => pickTemplate(t)} testID={`tpl-${t.id}`}>
                  <Ionicons name="flask-outline" size={20} color={RC.purple} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={s.tplName}>{t.name}</Text>
                    <Text style={s.tplDesc}>{t.description}</Text>
                    <Text style={s.tplMeta}>{t.variable_count} variables · {t.timepoint_count} timepoints · {STUDY_TYPE_LABEL[t.study_type]}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </Card>
          )}

          <Card>
            <SectionTitle title="Identity" icon="id-card-outline" />
            <Field label="Study code" value={code} onChangeText={t => setCode(t.toUpperCase())} placeholder="e.g. CBL-IMM-MXA" hint="3–20 chars, A–Z 0–9 hyphen. Used as the prefix of every subject code." testID="study-code" />
            <Field label="Title" value={title} onChangeText={setTitle} placeholder="Short study title" testID="study-title" />
            <Field label="Research question" value={question} onChangeText={setQuestion} multiline placeholder="What is the mean crestal bone loss at 12 months around…" testID="study-question" />
            <Text style={u.label}>Study design</Text>
            <PillSelect value={studyType} onChange={setStudyType} testID="study-type"
              options={Object.entries(STUDY_TYPE_LABEL).map(([key, label]) => ({ key, label }))} />
            <Text style={[u.label, { marginTop: 12 }]}>Primary unit of analysis</Text>
            <PillSelect value={unit} onChange={setUnit} testID="study-unit"
              options={[{ key: 'patient', label: 'Patient' }, { key: 'implant', label: 'Implant' }, { key: 'site', label: 'Site' }]} />
            <View style={{ height: 12 }} />
            <Field label="Target sample size (n)" value={targetN} onChangeText={setTargetN} keyboardType="number-pad" testID="study-target" />
            <View style={[u.row, { justifyContent: 'space-between', marginTop: 4 }]}>
              <View style={{ flex: 1 }}>
                <Text style={u.strong}>Dissertation study</Text>
                <Text style={u.kv}>Adds guide sign-off before activation and data lock.</Text>
              </View>
              <Switch value={dissertation} onValueChange={setDissertation} testID="study-dissertation" />
            </View>
          </Card>

          <View style={{ marginHorizontal: 14, marginTop: 16 }}>
            <PrimaryButton label="Create study" icon="checkmark" onPress={create} loading={saving} testID="create-study-btn" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  tpl: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: RC.border, marginBottom: 8, backgroundColor: '#FAFBFD' },
  tplOn: { borderColor: RC.primary, backgroundColor: RC.primarySoft },
  tplName: { fontSize: 14, fontWeight: '700', color: RC.text },
  tplDesc: { fontSize: 12, color: RC.sub, marginTop: 2, lineHeight: 17 },
  tplMeta: { fontSize: 11, color: RC.muted, marginTop: 4 },
});
