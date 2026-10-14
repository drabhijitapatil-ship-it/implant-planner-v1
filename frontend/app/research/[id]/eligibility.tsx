/**
 * Research Module — eligibility rule builder (S4) with live feasibility count.
 * Each rule = include/exclude × (query group of flat conditions | checklist item).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet, TextInput, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@react-native-vector-icons/ionicons';
import api from '../../../utils/api';
import { RC, Card, Chip, Loading, PillSelect, PrimaryButton, ScreenHeader, SectionTitle, Rule, OP_LABEL, errText, u } from '../../../components/research/ResearchUI';

type Cond = { field: string; op: string; value: any };
type RegField = { path: string; label: string; level: string; data_type: string; unit?: string; options?: { code: string; label: string }[] | null; phase: number };

const NUM_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'in', 'not_in', 'exists', 'not_exists'];
const CAT_OPS = ['eq', 'neq', 'in', 'not_in', 'exists', 'not_exists', 'contains'];

export default function EligibilityEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [registry, setRegistry] = useState<RegField[]>([]);
  const [feas, setFeas] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<{ ruleIdx: number; condIdx: number } | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([api.get(`/research/studies/${id}`), api.get('/research/registry'), api.get(`/research/studies/${id}/feasibility`)])
      .then(([s, r, f]) => { setRules(s.data.eligibility || []); setRegistry(r.data.fields); setFeas(f.data); })
      .catch(e => Alert.alert('Error', errText(e)));
  }, [id]);

  const regMap = useMemo(() => Object.fromEntries(registry.map(f => [f.path, f])), [registry]);

  const update = (i: number, patch: Partial<Rule>) => setRules(rs => rs!.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const conds = (r: Rule): Cond[] => (r.query?.all || r.query?.any || []) as Cond[];
  const grp = (r: Rule): 'all' | 'any' => (r.query?.any ? 'any' : 'all');
  const setConds = (i: number, list: Cond[], g?: 'all' | 'any') => update(i, { query: { [g || grp(rules![i])]: list } });

  const addRule = (kind: 'include' | 'exclude', mode: 'query' | 'checklist') =>
    setRules(rs => [...(rs || []), mode === 'query' ? { kind, mode, query: { all: [{ field: 'implant.site_fdi', op: 'in', value: [] }] } } : { kind, mode, checklist_text: '' }]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const clean = (rules || []).map(r => r.mode === 'query'
        ? { ...r, query: { [grp(r)]: conds(r).map(c => ({ ...c, value: normaliseValue(c, regMap[c.field]) })) } }
        : r);
      const s = await api.put(`/research/studies/${id}`, { eligibility: clean });
      if (s.data.protocol_errors?.length) Alert.alert('Saved with warnings', s.data.protocol_errors.join('\n'));
      const f = await api.get(`/research/studies/${id}/feasibility`);
      setFeas(f.data);
    } catch (e) { Alert.alert('Could not save', errText(e)); } finally { setSaving(false); }
  }, [rules, id, regMap]);

  if (!rules) return <Loading />;

  const pickerList = registry.filter(f => !search || f.label.toLowerCase().includes(search.toLowerCase()) || f.path.includes(search.toLowerCase()));

  return (
    <SafeAreaView style={u.container} edges={['bottom']}>
      <ScreenHeader title="Eligibility rules" subtitle="Include / exclude · query or checklist" testID="eligibility-title"
        right={<PrimaryButton label="Save" onPress={save} loading={saving} testID="save-eligibility" style={{ paddingVertical: 8, minHeight: 36 }} />} />
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
        {feas && (
          <Card testID="feasibility-card">
            <SectionTitle title="Feasibility — your existing cases" icon="speedometer-outline" />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Feas n={feas.eligible} label="Eligible" color={RC.green} />
              <Feas n={feas.needs_review} label="Needs review" color={RC.amber} />
              <Feas n={feas.excluded} label="Excluded" color={RC.red} />
              <Feas n={feas.enrolled} label="Enrolled" color={RC.primary} />
            </View>
            <Text style={[u.kv, { marginTop: 8 }]}>{feas.cases_scanned} cases scanned · implants/sites evaluated individually. Missing data → {'"needs review"'}, never auto-excluded.</Text>
          </Card>
        )}

        {rules.map((r, i) => (
          <Card key={i} testID={`rule-${i}`}>
            <View style={u.row}>
              <PillSelect value={r.kind} onChange={k => update(i, { kind: k })} options={[{ key: 'include', label: 'Include' }, { key: 'exclude', label: 'Exclude' }]} testID={`rule-${i}-kind`} />
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => setRules(rs => rs!.filter((_, j) => j !== i))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID={`rule-${i}-remove`}>
                <Ionicons name="trash-outline" size={20} color={RC.red} />
              </TouchableOpacity>
            </View>
            {r.mode === 'checklist' ? (
              <TextInput value={r.checklist_text} onChangeText={t => update(i, { checklist_text: t })} placeholder="Checklist item confirmed clinically at enrolment…"
                placeholderTextColor={RC.muted} style={[u.input, { marginTop: 10 }]} testID={`rule-${i}-text`} />
            ) : (
              <>
                <View style={[u.row, { marginTop: 10 }]}>
                  <Text style={u.kv}>Match </Text>
                  <PillSelect value={grp(r)} onChange={g => setConds(i, conds(r), g)} options={[{ key: 'all', label: 'ALL (AND)' }, { key: 'any', label: 'ANY (OR)' }]} />
                </View>
                {conds(r).map((c, ci) => {
                  const f = regMap[c.field];
                  const numeric = f && ['integer', 'decimal', 'date'].includes(f.data_type);
                  const ops = numeric ? NUM_OPS : CAT_OPS;
                  const needsValue = !['exists', 'not_exists'].includes(c.op);
                  return (
                    <View key={ci} style={s.cond}>
                      <TouchableOpacity style={s.fieldBtn} onPress={() => { setSearch(''); setPicker({ ruleIdx: i, condIdx: ci }); }} testID={`rule-${i}-cond-${ci}-field`}>
                        <Text style={s.fieldTxt} numberOfLines={1}>{f?.label || c.field}</Text>
                        <Text style={s.fieldSub}>{f ? `${f.level} · ${f.data_type}${f.unit ? ` (${f.unit})` : ''}` : 'tap to pick a case field'}</Text>
                      </TouchableOpacity>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                        <PillSelect value={c.op} onChange={op => setConds(i, conds(r).map((x, k) => (k === ci ? { ...x, op } : x)))}
                          options={ops.map(o => ({ key: o, label: OP_LABEL[o] }))} />
                      </ScrollView>
                      {needsValue && (f?.options?.length ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                          {f.options.map(o => {
                            const arr = Array.isArray(c.value) ? c.value.map(String) : (c.value !== undefined && c.value !== '' ? [String(c.value)] : []);
                            const on = arr.includes(String(o.code));
                            return (
                              <TouchableOpacity key={String(o.code)} style={[u.pill, on && { backgroundColor: RC.primary, borderColor: RC.primary }]}
                                onPress={() => {
                                  const multi = ['in', 'not_in'].includes(c.op);
                                  const next = multi ? (on ? arr.filter(x => x !== String(o.code)) : [...arr, String(o.code)]) : String(o.code);
                                  setConds(i, conds(r).map((x, k) => (k === ci ? { ...x, value: next } : x)));
                                }}>
                                <Text style={[u.pillTxt, on && { color: '#FFF' }]}>{o.label}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ) : (
                        <TextInput
                          value={Array.isArray(c.value) ? c.value.join(', ') : String(c.value ?? '')}
                          onChangeText={t => setConds(i, conds(r).map((x, k) => (k === ci ? { ...x, value: t } : x)))}
                          placeholder={['in', 'not_in', 'between'].includes(c.op) ? 'comma-separated, e.g. 13, 12, 11, 21, 22, 23' : 'value'}
                          placeholderTextColor={RC.muted} style={[u.input, { marginTop: 6 }]} keyboardType={numeric && f?.data_type !== 'date' ? 'numbers-and-punctuation' : 'default'}
                          testID={`rule-${i}-cond-${ci}-value`} />
                      ))}
                      {conds(r).length > 1 && (
                        <TouchableOpacity onPress={() => setConds(i, conds(r).filter((_, k) => k !== ci))} style={{ alignSelf: 'flex-end', marginTop: 4 }}>
                          <Text style={{ fontSize: 11, color: RC.red }}>remove condition</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
                <TouchableOpacity onPress={() => setConds(i, [...conds(r), { field: 'patient.age_years', op: 'gte', value: '' }])} style={s.addCond} testID={`rule-${i}-add-cond`}>
                  <Ionicons name="add-circle-outline" size={16} color={RC.primary} />
                  <Text style={{ color: RC.primary, fontWeight: '700', fontSize: 12, marginLeft: 4 }}>Add condition</Text>
                </TouchableOpacity>
              </>
            )}
          </Card>
        ))}

        <View style={{ marginHorizontal: 14, marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <PrimaryButton label="+ Include rule" variant="outline" onPress={() => addRule('include', 'query')} testID="add-include-rule" />
          <PrimaryButton label="+ Exclude rule" variant="outline" onPress={() => addRule('exclude', 'query')} testID="add-exclude-rule" />
          <PrimaryButton label="+ Checklist item" variant="outline" onPress={() => addRule('include', 'checklist')} testID="add-checklist-rule" />
        </View>
      </ScrollView>

      <Modal visible={!!picker} animationType="slide" onRequestClose={() => setPicker(null)}>
        <SafeAreaView style={u.container} edges={['bottom']}>
          <ScreenHeader title="Pick a case field" subtitle="Case Field Registry — Phase 1–5" onBack={() => setPicker(null)} />
          <View style={{ padding: 12 }}>
            <TextInput value={search} onChangeText={setSearch} placeholder="Search fields…" placeholderTextColor={RC.muted} style={u.input} autoFocus testID="registry-search" />
          </View>
          <FlatList data={pickerList} keyExtractor={f => f.path} renderItem={({ item: f }) => (
            <TouchableOpacity style={s.regRow} testID={`reg-${f.path}`} onPress={() => {
              if (!picker) return;
              const { ruleIdx, condIdx } = picker;
              const numeric = ['integer', 'decimal', 'date'].includes(f.data_type);
              setConds(ruleIdx, conds(rules[ruleIdx]).map((x, k) => (k === condIdx ? { field: f.path, op: numeric ? 'gte' : (f.options?.length ? 'in' : 'eq'), value: numeric ? '' : [] } : x)));
              setPicker(null);
            }}>
              <View style={{ flex: 1 }}>
                <Text style={u.strong}>{f.label}</Text>
                <Text style={u.kv}>{f.path}</Text>
              </View>
              <Chip label={f.level} color={RC.sub} bg={RC.greySoft} small />
              <View style={{ width: 6 }} />
              <Chip label={f.phase ? `Phase ${f.phase}` : 'Case'} color={RC.primary} bg={RC.primarySoft} small />
            </TouchableOpacity>
          )} />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function normaliseValue(c: Cond, f?: RegField) {
  if (['exists', 'not_exists'].includes(c.op)) return null;
  const numeric = f && ['integer', 'decimal'].includes(f.data_type);
  if (['in', 'not_in', 'between'].includes(c.op)) {
    const arr = Array.isArray(c.value) ? c.value : String(c.value ?? '').split(',').map(x => x.trim()).filter(Boolean);
    return numeric ? arr.map(Number).filter(n => !Number.isNaN(n)) : arr;
  }
  if (Array.isArray(c.value)) return c.value[0] ?? '';
  return numeric ? Number(c.value) : c.value;
}

function Feas({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#F7F9FC', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
      <Text style={{ fontSize: 18, fontWeight: '800', color }}>{n}</Text>
      <Text style={{ fontSize: 10, color: RC.sub, textTransform: 'uppercase' }}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  cond: { backgroundColor: '#F7F9FC', borderRadius: 10, padding: 10, marginTop: 8 },
  fieldBtn: { borderWidth: 1, borderColor: RC.primary, borderRadius: 10, padding: 10, backgroundColor: '#FFF', minHeight: 44 },
  fieldTxt: { fontSize: 14, fontWeight: '700', color: RC.text },
  fieldSub: { fontSize: 11, color: RC.sub, marginTop: 2 },
  addCond: { flexDirection: 'row', alignItems: 'center', marginTop: 10, minHeight: 32 },
  regRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F3F7', backgroundColor: '#FFF' },
});
