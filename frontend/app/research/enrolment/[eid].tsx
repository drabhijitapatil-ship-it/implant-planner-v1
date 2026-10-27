/**
 * Research Module — form entry (S13): one enrolment, one timepoint at a time.
 * Linked values read-only (BR-03), study fields editable, derived live,
 * not-done + reason (BR-10), window deviation reason (BR-09), complete / lock.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet, TextInput, Switch, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../utils/api';
import CalendarPicker from '../../../components/CalendarPicker';
import { RC, Card, Chip, Field, Loading, PillSelect, PrimaryButton, ScreenHeader, SectionTitle, FORM_STATUS, Variable, errText, u } from '../../../components/research/ResearchUI';
import RadiographMeasure from '../../../components/research/RadiographMeasure';
import { QueryThread } from '../../../components/research/QueryThread';

export default function FormEntry() {
  const { eid, tp } = useLocalSearchParams<{ eid: string; tp?: string }>();
  const router = useRouter();
  const [enr, setEnr] = useState<any | null>(null);
  const [tpKey, setTpKey] = useState<string>(tp || '');
  const [values, setValues] = useState<Record<string, any>>({});
  const [notDone, setNotDone] = useState<Record<string, string>>({});
  const [visitDate, setVisitDate] = useState('');
  const [devReason, setDevReason] = useState('');
  const [editReason, setEditReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [rxOpen, setRxOpen] = useState(false);
  const [queries, setQueries] = useState<any[]>([]);
  const [flagVar, setFlagVar] = useState<string | null>(null);
  const [flagText, setFlagText] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/research/enrolments/${eid}`);
      setEnr(r.data);
      api.get(`/research/enrolments/${eid}/queries`).then(q => setQueries(q.data)).catch(() => {});
      if (!tpKey) {
        const first = r.data.forms.find((f: any) => ['in_window', 'overdue', 'missed'].includes(f.status)) || r.data.forms.find((f: any) => !f.completed_at) || r.data.forms[0];
        setTpKey(first?.timepoint_key || '');
      }
    } catch (e) { Alert.alert('Error', errText(e)); }
  }, [eid, tpKey]);
  useEffect(() => { load(); }, [load]);

  const form = useMemo(() => enr?.forms.find((f: any) => f.timepoint_key === tpKey), [enr, tpKey]);
  useEffect(() => {
    if (!form) return;
    setValues({ ...(form.values || {}) }); setNotDone({ ...(form.not_done || {}) });
    setVisitDate(form.visit_date || ''); setDevReason(form.deviation_reason || ''); setEditReason('');
  }, [form]);

  if (!enr || !form) return <Loading />;
  const study = enr.study;
  const vars: Record<string, Variable> = Object.fromEntries(study.variables.map((v: Variable) => [v.key, v]));
  const tpDef = study.timepoints.find((t: any) => t.key === tpKey);
  const keys: string[] = tpDef?.variables || [];
  const isPI = study.my_roles.includes('pi');
  const canEdit = ['pi', 'co_investigator', 'data_collector'].some(r => study.my_roles.includes(r)) && study.status !== 'data_locked' && ['enrolled', 'active', 'completed'].includes(enr.status);
  const locked = !!form.locked_at;
  const canRaise = ['pi', 'guide', 'statistician'].some(r => study.my_roles.includes(r));
  const formQueries = queries.filter(q => q.timepoint_key === tpKey);
  const hasMmVars = keys.some(k => vars[k]?.source === 'study' && (vars[k].unit || '').toLowerCase() === 'mm');
  const raiseQuery = async () => {
    if (!flagVar || !flagText.trim()) { Alert.alert('Message required', 'Describe what looks wrong.'); return; }
    try {
      const r = await api.post(`/research/enrolments/${eid}/queries`, { text: flagText, timepoint_key: tpKey, variable_key: flagVar, value_at_raise: values[flagVar] ?? null });
      setQueries(qs => [r.data, ...qs]); setFlagVar(null); setFlagText('');
    } catch (e) { Alert.alert('Error', errText(e)); }
  };
  const editable = canEdit && !locked;
  const fs = FORM_STATUS[form.status] || FORM_STATUS.not_due;
  const inWindow = visitDate && form.window_start && form.window_end ? visitDate >= form.window_start && visitDate <= form.window_end : true;

  const submit = async (action: 'save' | 'complete' | 'lock' | 'unlock', confirmWarnings = false) => {
    setBusy(action);
    try {
      const body: any = { action, values, not_done: notDone, visit_date: visitDate || null, deviation_reason: devReason, reason: editReason, confirm_warnings: confirmWarnings };
      const r = await api.put(`/research/enrolments/${eid}/forms/${tpKey}`, body);
      setEnr(r.data);
      if (action !== 'save') Alert.alert(action === 'lock' ? 'Locked' : action === 'unlock' ? 'Unlocked' : 'Completed', r.data.warnings?.length ? r.data.warnings.join('\n') : `Form ${action === 'unlock' ? 'reopened' : action + 'd'}.`);
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      if (e?.response?.status === 409 && d?.warnings) {
        Alert.alert('Please confirm', d.warnings.join('\n'), [{ text: 'Cancel', style: 'cancel' }, { text: 'Confirm & continue', onPress: () => submit(action, true) }]);
      } else Alert.alert('Not saved', errText(e));
    } finally { setBusy(null); }
  };

  const changeStatus = (status: string, title: string) => {
    Alert.prompt?.(title, 'Reason (required)', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: async (reason?: string) => {
        try { await api.post(`/research/enrolments/${eid}/status`, { status, reason }); load(); } catch (e) { Alert.alert('Error', errText(e)); }
      } },
    ]) ?? Alert.alert(title, 'Use the web/iOS app to provide a reason, or ask the PI.');
  };

  const renderInput = (v: Variable) => {
    const val = values[v.key];
    const nd = notDone[v.key] !== undefined;
    const set = (x: any) => setValues(s => ({ ...s, [v.key]: x }));
    if (nd) return <TextInput value={notDone[v.key]} onChangeText={t => setNotDone(s => ({ ...s, [v.key]: t }))} placeholder="Reason not done (required)" placeholderTextColor={RC.muted} style={[u.input, { borderColor: RC.amber }]} editable={editable} testID={`nd-${v.key}`} />;
    switch (v.data_type) {
      case 'boolean':
        return <PillSelect value={val === true ? 'yes' : val === false ? 'no' : ''} onChange={k => editable && set(k === 'yes')} options={[{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }]} testID={`f-${v.key}`} />;
      case 'single_select':
        return <PillSelect value={val == null ? '' : String(val)} onChange={k => editable && set(k)} options={v.options.map(o => ({ key: String(o.code), label: o.label }))} testID={`f-${v.key}`} />;
      case 'multi_select': {
        const arr: string[] = Array.isArray(val) ? val.map(String) : [];
        return (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {v.options.map(o => { const on = arr.includes(String(o.code)); return (
              <TouchableOpacity key={String(o.code)} style={[u.pill, on && { backgroundColor: RC.primary, borderColor: RC.primary }]} disabled={!editable}
                onPress={() => set(on ? arr.filter(x => x !== String(o.code)) : [...arr, String(o.code)])}><Text style={[u.pillTxt, on && { color: '#FFF' }]}>{o.label}</Text></TouchableOpacity>); })}
          </View>
        );
      }
      case 'date':
        return <CalendarPicker value={val || ''} onChange={d => editable && set(d)} allowPast allowFuture compact testID={`f-${v.key}`} />;
      case 'scale': {
        const lo = v.min ?? 0, hi = v.max ?? 10;
        if (hi - lo <= 14) return <PillSelect value={val == null ? '' : String(val)} onChange={k => editable && set(Number(k))} options={Array.from({ length: hi - lo + 1 }, (_, i) => ({ key: String(lo + i), label: String(lo + i) }))} testID={`f-${v.key}`} />;
        return <TextInput value={val == null ? '' : String(val)} onChangeText={t => set(t)} keyboardType="numbers-and-punctuation" style={u.input} editable={editable} testID={`f-${v.key}`} />;
      }
      case 'integer': case 'decimal':
        return <TextInput value={val == null ? '' : String(val)} onChangeText={t => set(t)} keyboardType="numbers-and-punctuation" placeholder={`${v.min ?? ''}${v.min != null || v.max != null ? ' – ' : ''}${v.max ?? ''} ${v.unit || ''}`.trim()} placeholderTextColor={RC.muted} style={u.input} editable={editable} testID={`f-${v.key}`} />;
      default:
        return <TextInput value={val == null ? '' : String(val)} onChangeText={t => set(t)} style={u.input} editable={editable} multiline testID={`f-${v.key}`} />;
    }
  };

  const linkedKeys = keys.filter(k => vars[k]?.source === 'linked');
  const studyKeys = keys.filter(k => vars[k]?.source === 'study');
  const derivedKeys = keys.filter(k => vars[k]?.source === 'derived');

  return (
    <SafeAreaView style={u.container} edges={['bottom']}>
      <ScreenHeader title={enr.subject_code} subtitle={`${study.code} · tooth ${enr.tooth_number}${enr.patient_name ? ` · ${enr.patient_name}` : ''}`} testID="form-title"
        right={enr.case_accessible ? (
          <TouchableOpacity onPress={() => router.push(`/procedures/${enr.procedure_id}`)} style={s.caseBtn} testID="open-case-btn">
            <Ionicons name="folder-open-outline" size={16} color={RC.primary} /><Text style={s.caseBtnTxt}>Case</Text>
          </TouchableOpacity>) : null} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
        {enr.forms.map((f: any) => {
          const st = FORM_STATUS[f.status] || FORM_STATUS.not_due; const on = f.timepoint_key === tpKey;
          return (
            <TouchableOpacity key={f.timepoint_key} onPress={() => setTpKey(f.timepoint_key)} style={[s.tpChip, on && { borderColor: st.color, backgroundColor: st.bg }]} testID={`tp-chip-${f.timepoint_key}`}>
              <Text style={[s.tpChipTxt, on && { color: st.color }]}>{f.label}</Text>
              <Text style={[s.tpChipSub, on && { color: st.color }]}>{st.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
          <Card>
            <View style={u.row}>
              <View style={{ flex: 1 }}>
                <Text style={u.strong}>{form.label}</Text>
                <Text style={u.kv}>{form.due_date ? `Due ${form.due_date} · window ${form.window_start} → ${form.window_end}` : 'Anchor date missing in the case record — due date pending'}</Text>
              </View>
              <Chip label={fs.label} color={fs.color} bg={fs.bg} testID="form-status-chip" />
            </View>
            {locked && <Text style={s.lockTxt}>Locked by {form.locked_by} on {String(form.locked_at).slice(0, 10)}. Linked values are frozen snapshots.</Text>}
            {enr.status !== 'enrolled' && enr.status !== 'active' && enr.status !== 'completed' && <Text style={s.lockTxt}>Enrolment {enr.status.replace(/_/g, ' ')}: {enr.status_reason}</Text>}
            <View style={{ marginTop: 10 }}>
              <CalendarPicker label="Visit date" value={visitDate} onChange={d => editable && setVisitDate(d)} allowPast testID="visit-date" />
            </View>
            {visitDate && !inWindow ? (
              <View style={{ marginTop: 10 }}>
                <Field label="Outside window — deviation reason" value={devReason} onChangeText={setDevReason} placeholder="e.g. patient travelled; visit rescheduled" editable={editable} testID="deviation-reason" />
              </View>
            ) : null}
          </Card>

          {linkedKeys.length > 0 && (
            <Card>
              <SectionTitle title="From the clinical record" icon="link-outline" />
              {linkedKeys.map(k => { const l = form.linked[k] || {}; return (
                <View key={k} style={s.linkedRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.lbl}>{vars[k].label}</Text>
                    {l.changed && <Text style={{ fontSize: 10, color: RC.amber }}>Source changed after lock · now {fmt(l.live, vars[k])}</Text>}
                  </View>
                  <Text style={[s.linkedVal, l.value == null && { color: RC.muted }]} testID={`linked-${k}`}>{fmt(l.value, vars[k])}</Text>
                </View>); })}
              <Text style={[u.kv, { marginTop: 6 }]}>Read-only — correct values in the case itself{enr.case_accessible ? ' (tap "Case" above)' : ''}.</Text>
            </Card>
          )}

          {studyKeys.length > 0 && (
            <Card>
              <SectionTitle title="Study measurements" icon="create-outline" />
              {studyKeys.map(k => { const v = vars[k]; const nd = notDone[k] !== undefined; return (
                <View key={k} style={{ marginBottom: 14 }}>
                  <View style={u.row}>
                    <Text style={s.lbl}>{v.label}{v.unit ? ` (${v.unit})` : ''}{v.required ? ' *' : ''}</Text>
                    {v.level === 'patient' && <View style={{ marginLeft: 6 }}><Chip label="patient-level" color={RC.purple} bg={RC.purpleSoft} small /></View>}
                    {formQueries.some(q => q.variable_key === k && q.status !== 'closed') && <View style={{ marginLeft: 6 }}><Chip label="query open" color={RC.red} bg={RC.redSoft} small /></View>}
                    <View style={{ flex: 1 }} />
                    {canRaise && (
                      <TouchableOpacity onPress={() => { setFlagVar(k); setFlagText(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginRight: 8 }} testID={`flag-${k}`}>
                        <Ionicons name="flag-outline" size={16} color={RC.amber} />
                      </TouchableOpacity>
                    )}
                    {editable && (
                      <TouchableOpacity onPress={() => setNotDone(s => { const n = { ...s }; if (nd) delete n[k]; else { n[k] = ''; setValues(vv => ({ ...vv, [k]: null })); } return n; })} style={u.row} testID={`nd-toggle-${k}`}>
                        <Text style={{ fontSize: 11, color: nd ? RC.amber : RC.muted, marginRight: 4 }}>not done</Text>
                        <Switch value={nd} onValueChange={() => setNotDone(s => { const n = { ...s }; if (nd) delete n[k]; else { n[k] = ''; setValues(vv => ({ ...vv, [k]: null })); } return n; })} style={{ transform: [{ scale: 0.8 }] }} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {!!v.method_note && <Text style={s.method}>{v.method_note}</Text>}
                  <View style={{ marginTop: 6 }}>{renderInput(v)}</View>
                </View>); })}
              {(() => { const pk = studyKeys.filter(k => vars[k].level === 'patient'); return pk.length ? <Text style={u.kv}>Patient-level values are stored once per patient per timepoint and shared across this patient{"'"}s other implants in the study (D2).</Text> : null; })()}
            </Card>
          )}

          {hasMmVars && (
            <View style={{ marginHorizontal: 14, marginTop: 12 }}>
              <PrimaryButton label={form.images?.iopa ? `Radiograph · grade ${form.images.iopa.quality_grade} · measure` : 'Upload radiograph & measure bone levels'} variant="outline" icon="scan-outline" onPress={() => setRxOpen(true)} testID="open-radiograph" />
            </View>
          )}

          {(formQueries.length > 0 || flagVar) && (
            <Card>
              <SectionTitle title={`Data queries (${formQueries.filter(q => q.status !== 'closed').length} open)`} icon="flag-outline" />
              {flagVar && (
                <View style={{ marginBottom: 8 }}>
                  <Field label={`Flag "${vars[flagVar]?.label}" — what looks wrong?`} value={flagText} onChangeText={setFlagText} multiline placeholder="e.g. 4.2 mm at 6 months but 0.8 mm at 12 months — please re-check the IOPA" testID="flag-text" />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <PrimaryButton label="Raise query" onPress={raiseQuery} style={{ flex: 1 }} testID="raise-query" />
                    <PrimaryButton label="Cancel" variant="ghost" onPress={() => setFlagVar(null)} />
                  </View>
                </View>
              )}
              {formQueries.map(q => <QueryThread key={q.id} q={q} compact canClose={isPI || q.raised_by_id === study.pi_user_id} canReopen={canRaise} onChanged={nq => setQueries(qs => qs.map(x => (x.id === nq.id ? nq : x)))} />)}
            </Card>
          )}

          {derivedKeys.length > 0 && (
            <Card>
              <SectionTitle title="Derived (computed on save)" icon="calculator-outline" />
              {derivedKeys.map(k => (
                <View key={k} style={s.linkedRow}>
                  <View style={{ flex: 1 }}><Text style={s.lbl}>{vars[k].label}{vars[k].unit ? ` (${vars[k].unit})` : ''}</Text><Text style={{ fontSize: 10, color: RC.muted }}>{vars[k].formula}</Text></View>
                  <Text style={[s.linkedVal, form.derived?.[k] == null && { color: RC.muted }]} testID={`derived-${k}`}>{fmt(form.derived?.[k], vars[k])}</Text>
                </View>
              ))}
            </Card>
          )}

          {form.completed_at && !locked && editable && (
            <Card><Field label="Reason for editing a completed form (BR-18)" value={editReason} onChangeText={setEditReason} placeholder="e.g. transcription error corrected" testID="edit-reason" /></Card>
          )}

          <View style={{ marginHorizontal: 14, marginTop: 14, gap: 8 }}>
            {editable && (
              <>
                <PrimaryButton label="Save draft" variant="outline" icon="save-outline" onPress={() => submit('save')} loading={busy === 'save'} testID="save-form" />
                <PrimaryButton label={form.completed_at ? 'Save changes' : 'Mark visit complete'} icon="checkmark-done-outline" onPress={() => submit('complete')} loading={busy === 'complete'} testID="complete-form" />
                {isPI && <PrimaryButton label="Complete & lock (PI)" variant="outline" icon="lock-closed-outline" onPress={() => submit('lock')} loading={busy === 'lock'} testID="lock-form" />}
              </>
            )}
            {locked && isPI && study.status !== 'data_locked' && (
              <>
                <Field label="Unlock reason" value={editReason} onChangeText={setEditReason} placeholder="Why this locked form must be reopened" testID="unlock-reason" />
                <PrimaryButton label="Unlock form (PI)" variant="danger" icon="lock-open-outline" onPress={() => submit('unlock')} loading={busy === 'unlock'} testID="unlock-form" />
              </>
            )}
            {canEdit && ['enrolled', 'active'].includes(enr.status) && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <PrimaryButton label="Withdraw" variant="ghost" onPress={() => changeStatus('withdrawn', 'Withdraw consent / enrolment')} style={{ flex: 1 }} />
                <PrimaryButton label="Lost to follow-up" variant="ghost" onPress={() => changeStatus('lost_to_follow_up', 'Mark lost to follow-up')} style={{ flex: 1 }} />
                <PrimaryButton label="Completed" variant="ghost" onPress={() => changeStatus('completed', 'Mark follow-up completed')} style={{ flex: 1 }} />
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <RadiographMeasure visible={rxOpen} onClose={() => setRxOpen(false)} enrolmentId={String(eid)} tpKey={tpKey} form={form}
        variables={keys.map(k => vars[k]).filter(Boolean)} implantLength={enr.implant?.length ? Number(enr.implant.length) : null} editable={editable}
        onUpdated={nenr => { setEnr(nenr); }} />
    </SafeAreaView>
  );
}

function fmt(v: any, var_: Variable) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.join(', ');
  if (var_.options?.length) { const o = var_.options.find(o => String(o.code) === String(v)); if (o) return o.label; }
  return String(v);
}

const s = StyleSheet.create({
  caseBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: RC.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, minHeight: 32 },
  caseBtnTxt: { color: RC.primary, fontWeight: '700', fontSize: 12 },
  tpChip: { borderWidth: 1.5, borderColor: RC.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#FFF', minHeight: 44, justifyContent: 'center' },
  tpChipTxt: { fontSize: 12, fontWeight: '700', color: RC.text },
  tpChipSub: { fontSize: 10, color: RC.muted },
  lockTxt: { marginTop: 8, fontSize: 12, color: RC.purple, backgroundColor: RC.purpleSoft, padding: 8, borderRadius: 8 },
  linkedRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#F0F3F7' },
  lbl: { fontSize: 13, fontWeight: '600', color: RC.text },
  linkedVal: { fontSize: 14, fontWeight: '700', color: RC.primary, marginLeft: 10 },
  method: { fontSize: 11, color: RC.sub, marginTop: 2, fontStyle: 'italic' },
});
