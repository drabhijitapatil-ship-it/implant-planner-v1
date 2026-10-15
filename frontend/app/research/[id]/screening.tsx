/**
 * Research Module — screening list + enrol sheet (S10 / S11).
 * Retrospective pull of the caller's cases; per-rule pass / fail / unknown.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, StyleSheet, TextInput, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@react-native-vector-icons/ionicons';
import api from '../../../utils/api';
import { RC, Chip, Field, Loading, PillSelect, PrimaryButton, ScreenHeader, Segmented, Empty, errText, u } from '../../../components/research/ResearchUI';

type Filter = 'all' | 'eligible' | 'needs_review' | 'excluded';
const RES_STYLE: Record<string, { c: string; b: string; l: string }> = {
  eligible: { c: RC.green, b: RC.greenSoft, l: 'Eligible' }, needs_review: { c: RC.amber, b: RC.amberSoft, l: 'Needs review' },
  excluded: { c: RC.red, b: RC.redSoft, l: 'Excluded' },
};

export default function Screening() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<any | null>(null);
  const [study, setStudy] = useState<any | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [sheet, setSheet] = useState<any | null>(null);
  const [ticks, setTicks] = useState<boolean[]>([]);
  const [consent, setConsent] = useState(false);
  const [consentMethod, setConsentMethod] = useState('paper');
  const [consentLang, setConsentLang] = useState('');
  const [override, setOverride] = useState('');
  const [excludeReason, setExcludeReason] = useState('');
  const [mode, setMode] = useState<'enrol' | 'exclude'>('enrol');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([api.get(`/research/studies/${id}/candidates`, { params: { limit: 200, search } }), api.get(`/research/studies/${id}`)]);
      setData(c.data); setStudy(s.data);
    } catch (e) { Alert.alert('Error', errText(e)); }
  }, [id, search]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  if (!data || !study) return <Loading />;
  const checklist = study.eligibility.filter((r: any) => r.mode === 'checklist');
  const isPI = study.my_roles.includes('pi');
  const rows = data.rows.filter((r: any) => filter === 'all' || r.decision === filter);

  const openSheet = (row: any, m: 'enrol' | 'exclude') => {
    setSheet(row); setMode(m); setTicks(checklist.map(() => false)); setConsent(false); setOverride(''); setExcludeReason(''); setConsentLang('');
  };

  const submit = async () => {
    if (!sheet) return;
    setBusy(true);
    try {
      if (mode === 'exclude') {
        await api.post(`/research/studies/${id}/screening/exclude`, { procedure_id: sheet.procedure_id, tooth_number: sheet.tooth_number, reason: excludeReason });
      } else {
        const r = await api.post(`/research/studies/${id}/enrol`, {
          procedure_id: sheet.procedure_id, tooth_number: sheet.tooth_number, checklist_ticked: ticks, consent_confirmed: consent,
          consent_method: consentMethod, consent_language: consentLang, override_reason: override,
        });
        const also = r.data.also_in_studies?.length ? `\n\nNote: this site is also enrolled in ${r.data.also_in_studies.join(', ')} — coordinate radiograph timing (BR-12).` : '';
        Alert.alert('Enrolled', `Subject code ${r.data.subject_code}. ${r.data.forms.length} visit forms scheduled.${also}`);
      }
      setSheet(null); load();
    } catch (e) { Alert.alert('Not enrolled', errText(e)); } finally { setBusy(false); }
  };

  const unexclude = async (row: any) => {
    try { await api.delete(`/research/studies/${id}/screening/exclude`, { params: { procedure_id: row.procedure_id, tooth_number: row.tooth_number } }); load(); }
    catch (e) { Alert.alert('Error', errText(e)); }
  };

  const renderRow = ({ item: r }: { item: any }) => {
    const st = RES_STYLE[r.decision] || RES_STYLE.excluded;
    return (
      <View style={s.card} testID={`cand-${r.procedure_id}-${r.tooth_number}`}>
        <View style={u.row}>
          <View style={{ flex: 1 }}>
            <Text style={u.strong}>{r.patient_name} <Text style={{ color: RC.sub, fontWeight: '600' }}>· {r.age ? `${r.age} y` : ''} {r.sex || ''}</Text></Text>
            <Text style={u.kv}>Tooth {r.tooth_number}{r.planned_only ? ' (planned)' : ''} · {r.procedure_type}{r.implant?.system ? ` · ${r.implant.brand || ''} ${r.implant.system}` : ''}{r.implant?.insertion_torque_ncm ? ` · ${r.implant.insertion_torque_ncm} Ncm` : ''}</Text>
          </View>
          <Chip label={st.l} color={st.c} bg={st.b} />
        </View>
        <View style={{ marginTop: 8 }}>
          {r.eligibility.rules.filter((x: any) => x.mode === 'query').map((x: any) => (
            <View key={x.index} style={[u.row, { paddingVertical: 2 }]}>
              <Ionicons name={x.result === 'pass' ? 'checkmark-circle' : x.result === 'fail' ? 'close-circle' : 'help-circle'} size={14}
                color={(x.kind === 'include') === (x.result === 'pass') ? RC.green : x.result === 'unknown' ? RC.amber : RC.red} />
              <Text style={s.ruleTxt} numberOfLines={2}>{x.kind === 'exclude' ? 'EXCLUDE if ' : ''}{x.label}{x.result === 'unknown' ? '  (data missing)' : ''}</Text>
            </View>
          ))}
        </View>
        {r.other_studies?.length > 0 && <Text style={s.otherTxt}>Also in: {r.other_studies.join(', ')}</Text>}
        {r.exclusion_reason && <Text style={s.otherTxt}>Excluded manually: {r.exclusion_reason}</Text>}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {r.exclusion_reason ? (
            <PrimaryButton label="Undo exclusion" variant="outline" onPress={() => unexclude(r)} style={{ flex: 1 }} />
          ) : (
            <>
              {(r.decision === 'eligible' || isPI) && <PrimaryButton label={r.decision === 'eligible' ? 'Enrol' : 'Enrol (PI override)'} icon="person-add-outline" onPress={() => openSheet(r, 'enrol')} style={{ flex: 1 }} testID={`enrol-${r.procedure_id}-${r.tooth_number}`} />}
              <PrimaryButton label="Exclude" variant="ghost" onPress={() => openSheet(r, 'exclude')} />
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={u.container} edges={['bottom']}>
      <ScreenHeader title="Screen & enrol" subtitle={`${study.code} · ${data.summary.cases_scanned} cases scanned`} testID="screening-title" />
      <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
        <TextInput value={search} onChangeText={setSearch} placeholder="Search patient name…" placeholderTextColor={RC.muted} style={u.input} testID="screening-search" />
        <View style={{ height: 8 }} />
        <Segmented value={filter} onChange={setFilter} testID="screening-filter" options={[
          { key: 'all', label: `All ${data.total}` }, { key: 'eligible', label: `Eligible ${data.summary.eligible}` },
          { key: 'needs_review', label: `Review ${data.summary.needs_review}` }, { key: 'excluded', label: `Excl. ${data.summary.excluded + data.summary.manually_excluded}` }]} />
      </View>
      <FlatList data={rows} keyExtractor={r => `${r.procedure_id}-${r.tooth_number}`} renderItem={renderRow} contentContainerStyle={{ paddingBottom: 60 }}
        ListEmptyComponent={<Empty icon="search-outline" title="No candidate sites" body={`${data.summary.enrolled} already enrolled. Cases must be submitted (not draft) and within your clinical access.`} />} />

      <Modal visible={!!sheet} animationType="slide" transparent onRequestClose={() => setSheet(null)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={u.row}>
              <Text style={s.sheetTitle}>{mode === 'enrol' ? 'Enrol in study' : 'Exclude from study'}</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => setSheet(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Ionicons name="close" size={22} color={RC.sub} /></TouchableOpacity>
            </View>
            {sheet && <Text style={u.kv}>{sheet.patient_name} · tooth {sheet.tooth_number} · {study.code}</Text>}
            <ScrollView style={{ marginTop: 10, maxHeight: 440 }} keyboardShouldPersistTaps="handled">
              {mode === 'exclude' ? (
                <Field label="Exclusion reason" value={excludeReason} onChangeText={setExcludeReason} multiline placeholder="e.g. Declined consent / active periodontitis at site" testID="exclude-reason" />
              ) : (
                <>
                  {sheet?.decision !== 'eligible' && (
                    <Field label="PI override reason (eligibility not fully met)" value={override} onChangeText={setOverride} multiline placeholder="Why this case is being enrolled despite the rule result" testID="override-reason" />
                  )}
                  {checklist.length > 0 && <Text style={u.label}>Clinical checklist</Text>}
                  {checklist.map((c: any, i: number) => (
                    <TouchableOpacity key={i} style={s.tickRow} onPress={() => setTicks(t => t.map((x, j) => (j === i ? !x : x)))} testID={`tick-${i}`}>
                      <Ionicons name={ticks[i] ? 'checkbox' : 'square-outline'} size={22} color={ticks[i] ? RC.primary : RC.muted} />
                      <Text style={s.tickTxt}>{c.kind === 'exclude' ? 'Confirmed ABSENT: ' : ''}{c.checklist_text}</Text>
                    </TouchableOpacity>
                  ))}
                  <Text style={[u.label, { marginTop: 10 }]}>Research consent</Text>
                  <PillSelect value={consentMethod} onChange={setConsentMethod} options={[{ key: 'paper', label: 'Paper form signed' }, { key: 'e_consent', label: 'E-consent' }]} />
                  <View style={{ height: 8 }} />
                  <Field label="Consent language" value={consentLang} onChangeText={setConsentLang} placeholder="English / Hindi / Marathi…" />
                  <TouchableOpacity style={s.tickRow} onPress={() => setConsent(c => !c)} testID="consent-tick">
                    <Ionicons name={consent ? 'checkbox' : 'square-outline'} size={22} color={consent ? RC.primary : RC.muted} />
                    <Text style={s.tickTxt}>Patient signed research consent {study.consent_form_version ? `(${study.consent_form_version})` : ''} and understands withdrawal rights.</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
            <PrimaryButton label={mode === 'enrol' ? 'Confirm enrolment' : 'Exclude'} variant={mode === 'enrol' ? 'primary' : 'danger'} onPress={submit} loading={busy} style={{ marginTop: 12 }} testID="confirm-enrol" />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#FFF', marginHorizontal: 14, marginTop: 10, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: RC.border },
  ruleTxt: { fontSize: 12, color: RC.text, marginLeft: 6, flex: 1 },
  otherTxt: { fontSize: 11, color: RC.amber, marginTop: 6, fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(15,25,40,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 30 },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: RC.text },
  tickRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, minHeight: 44 },
  tickTxt: { flex: 1, marginLeft: 10, fontSize: 13, color: RC.text, lineHeight: 18 },
});
