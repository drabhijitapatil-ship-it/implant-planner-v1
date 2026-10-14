/**
 * Research Module — variables editor (S5): linked (registry), study-specific,
 * derived (formula with live test). Keys are stable identifiers used in export.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet, TextInput, Modal, FlatList, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@react-native-vector-icons/ionicons';
import api from '../../../utils/api';
import { RC, Card, Chip, Field, Loading, PillSelect, PrimaryButton, ScreenHeader, SectionTitle, Variable, errText, u } from '../../../components/research/ResearchUI';
import { sourceColor } from './index';

const DT_LABEL: Record<string, string> = { integer: 'Whole number', decimal: 'Decimal', text: 'Text', single_select: 'Single choice', multi_select: 'Multiple choice', boolean: 'Yes / No', date: 'Date', scale: 'Score / scale' };

const blank = (source: Variable['source']): Variable => ({
  key: '', label: '', level: 'site', source, data_type: source === 'derived' ? 'decimal' : 'decimal', unit: '', min: null, max: null, decimals: null,
  options: [], required: false, case_field_path: null, formula: source === 'derived' ? "v('a') - v('a','baseline')" : null, method_note: '', soft_warning: null,
});

export default function VariablesEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [vars, setVars] = useState<Variable[] | null>(null);
  const [lockedKeys, setLockedKeys] = useState<Set<string>>(new Set());
  const [registry, setRegistry] = useState<any[]>([]);
  const [editing, setEditing] = useState<{ idx: number; v: Variable } | null>(null);
  const [pickReg, setPickReg] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [optText, setOptText] = useState('');

  useEffect(() => {
    Promise.all([api.get(`/research/studies/${id}`), api.get('/research/registry')])
      .then(([s, r]) => { setVars(s.data.variables || []); setRegistry(r.data.fields); if (s.data.status !== 'draft') setLockedKeys(new Set(s.data.variables.map((v: Variable) => v.key))); })
      .catch(e => Alert.alert('Error', errText(e)));
  }, [id]);

  const regMap = useMemo(() => Object.fromEntries(registry.map(f => [f.path, f])), [registry]);

  const save = async (list: Variable[]) => {
    setSaving(true);
    try {
      const s = await api.put(`/research/studies/${id}`, { variables: list });
      setVars(s.data.variables);
      if (s.data.protocol_errors?.length) Alert.alert('Saved — check these', s.data.protocol_errors.join('\n'));
    } catch (e) { Alert.alert('Could not save', errText(e)); } finally { setSaving(false); }
  };

  const openEdit = (idx: number, v: Variable) => { setEditing({ idx, v: { ...v } }); setOptText(v.options.map(o => (o.code === o.label ? o.label : `${o.code}=${o.label}`)).join('\n')); };
  const commit = () => {
    if (!editing || !vars) return;
    const v = { ...editing.v };
    v.key = (v.key || v.label).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'v$1');
    if (!v.key) { Alert.alert('Missing', 'Variable needs a label.'); return; }
    if (vars.some((x, i) => x.key === v.key && i !== editing.idx)) { Alert.alert('Duplicate key', `'${v.key}' already exists.`); return; }
    if (['single_select', 'multi_select'].includes(v.data_type) && v.source === 'study') {
      v.options = optText.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [c, ...rest] = l.split('='); return rest.length ? { code: c.trim(), label: rest.join('=').trim() } : { code: c.trim(), label: c.trim() }; });
      if (!v.options.length) { Alert.alert('Options needed', 'Add at least one option (one per line, optionally code=label).'); return; }
    }
    const list = editing.idx < 0 ? [...vars, v] : vars.map((x, i) => (i === editing.idx ? v : x));
    setEditing(null);
    save(list);
  };
  const remove = (idx: number) => {
    if (!vars) return;
    if (lockedKeys.has(vars[idx].key)) { Alert.alert('Protocol active', 'Existing variables cannot be removed after activation (BR-06). Data already collected stays attached to this key.'); return; }
    Alert.alert('Remove variable?', vars[idx].label, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => save(vars.filter((_, i) => i !== idx)) }]);
  };

  if (!vars) return <Loading />;
  const keys = vars.map(v => v.key);
  const regList = registry.filter(f => !search || f.label.toLowerCase().includes(search.toLowerCase()) || f.path.includes(search.toLowerCase()));

  return (
    <SafeAreaView style={u.container} edges={['top']}>
      <ScreenHeader title="Variables" subtitle={`${vars.length} defined · keys appear as export columns`} testID="variables-title" />
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={{ marginHorizontal: 14, marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <PrimaryButton label="+ Linked (from case)" variant="outline" onPress={() => { setEditing({ idx: -1, v: blank('linked') }); setSearch(''); setPickReg(true); }} testID="add-linked" />
          <PrimaryButton label="+ Study-specific" variant="outline" onPress={() => openEdit(-1, blank('study'))} testID="add-study-var" />
          <PrimaryButton label="+ Derived" variant="outline" onPress={() => openEdit(-1, blank('derived'))} testID="add-derived" />
        </View>
        {(['patient', 'implant', 'site'] as const).map(level => {
          const list = vars.map((v, i) => ({ v, i })).filter(x => x.v.level === level);
          if (!list.length) return null;
          return (
            <Card key={level}>
              <SectionTitle title={`${level} level`} icon={level === 'patient' ? 'person-outline' : level === 'implant' ? 'hardware-chip-outline' : 'locate-outline'} />
              {list.map(({ v, i }) => (
                <TouchableOpacity key={v.key} style={s.varRow} onPress={() => openEdit(i, v)} testID={`var-${v.key}`}>
                  <Chip label={v.source} color={sourceColor(v.source).c} bg={sourceColor(v.source).b} small />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={u.strong} numberOfLines={1}>{v.label}{v.required ? ' *' : ''}</Text>
                    <Text style={u.kv} numberOfLines={1}>{v.key} · {DT_LABEL[v.data_type] || v.data_type}{v.unit ? ` · ${v.unit}` : ''}{v.source === 'linked' ? ` · ${regMap[v.case_field_path || '']?.label || v.case_field_path}` : ''}{v.source === 'derived' ? ` · ${v.formula}` : ''}</Text>
                  </View>
                  <TouchableOpacity onPress={() => remove(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID={`var-${v.key}-remove`}>
                    <Ionicons name={lockedKeys.has(v.key) ? 'lock-closed-outline' : 'trash-outline'} size={18} color={lockedKeys.has(v.key) ? RC.muted : RC.red} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </Card>
          );
        })}
        <Text style={s.help}>{"Linked variables read live from the clinical record and are never editable in a study form (BR-03). Derived formulas: v('key'), v('key','timepoint'), mean(), abs(), round(x,n), if(cond,a,b), days_between(d1,d2). Missing input → missing result, never 0."}</Text>
      </ScrollView>

      {/* Variable editor sheet */}
      <Modal visible={!!editing && !pickReg} animationType="slide" onRequestClose={() => setEditing(null)}>
        {editing && (
          <SafeAreaView style={u.container}>
            <ScreenHeader title={editing.idx < 0 ? 'New variable' : 'Edit variable'} subtitle={`${editing.v.source} variable`} onBack={() => setEditing(null)}
              right={<PrimaryButton label="Done" onPress={commit} loading={saving} testID="var-done" style={{ paddingVertical: 8, minHeight: 36 }} />} />
            <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
              {editing.v.source === 'linked' && (
                <TouchableOpacity style={s.linkBox} onPress={() => { setSearch(''); setPickReg(true); }} testID="var-pick-field">
                  <Ionicons name="link-outline" size={18} color={RC.primary} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={u.strong}>{regMap[editing.v.case_field_path || '']?.label || 'Pick a case field'}</Text>
                    <Text style={u.kv}>{editing.v.case_field_path || 'from the Case Field Registry'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={RC.muted} />
                </TouchableOpacity>
              )}
              <Field label="Label" value={editing.v.label} onChangeText={t => setEditing({ ...editing, v: { ...editing.v, label: t, key: editing.idx < 0 && !lockedKeys.has(editing.v.key) ? t.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') : editing.v.key } })} placeholder="e.g. Bone level mesial" testID="var-label" />
              <Field label="Key (export column)" value={editing.v.key} editable={!lockedKeys.has(editing.v.key)} onChangeText={t => setEditing({ ...editing, v: { ...editing.v, key: t } })} hint={lockedKeys.has(editing.v.key) ? 'Locked — protocol is active' : 'snake_case, stable across protocol versions'} testID="var-key" />
              {editing.v.source !== 'linked' && (
                <>
                  <Text style={u.label}>Level</Text>
                  <PillSelect value={editing.v.level} onChange={l => setEditing({ ...editing, v: { ...editing.v, level: l } })} options={[{ key: 'patient', label: 'Patient (stored once per patient)' }, { key: 'implant', label: 'Implant' }, { key: 'site', label: 'Site' }]} />
                  <Text style={[u.label, { marginTop: 12 }]}>Data type</Text>
                  <PillSelect value={editing.v.data_type} onChange={d => setEditing({ ...editing, v: { ...editing.v, data_type: d } })} options={Object.entries(DT_LABEL).map(([key, label]) => ({ key, label }))} testID="var-dtype" />
                  <View style={{ height: 12 }} />
                </>
              )}
              {editing.v.source === 'derived' && (
                <Field label="Formula" value={editing.v.formula || ''} onChangeText={t => setEditing({ ...editing, v: { ...editing.v, formula: t } })} multiline
                  hint={`Known keys: ${keys.filter(k => k !== editing.v.key).join(', ') || '—'}. Example: mean(v('cbl_mesial'), v('cbl_distal'))`} testID="var-formula" />
              )}
              {editing.v.source === 'study' && ['integer', 'decimal', 'scale'].includes(editing.v.data_type) && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}><Field label="Unit" value={editing.v.unit || ''} onChangeText={t => setEditing({ ...editing, v: { ...editing.v, unit: t } })} placeholder="mm" /></View>
                  <View style={{ flex: 1 }}><Field label="Min" value={editing.v.min == null ? '' : String(editing.v.min)} onChangeText={t => setEditing({ ...editing, v: { ...editing.v, min: t === '' ? null : Number(t) } })} keyboardType="numbers-and-punctuation" /></View>
                  <View style={{ flex: 1 }}><Field label="Max" value={editing.v.max == null ? '' : String(editing.v.max)} onChangeText={t => setEditing({ ...editing, v: { ...editing.v, max: t === '' ? null : Number(t) } })} keyboardType="numbers-and-punctuation" /></View>
                  <View style={{ flex: 1 }}><Field label="Decimals" value={editing.v.decimals == null ? '' : String(editing.v.decimals)} onChangeText={t => setEditing({ ...editing, v: { ...editing.v, decimals: t === '' ? null : Number(t) } })} keyboardType="number-pad" /></View>
                </View>
              )}
              {editing.v.source === 'study' && ['single_select', 'multi_select'].includes(editing.v.data_type) && (
                <Field label="Options (one per line, optional code=label)" value={optText} onChangeText={setOptText} multiline placeholder={'1=Elian Type I\n2=Elian Type II'} testID="var-options" />
              )}
              {editing.v.source === 'study' && (
                <View style={[u.row, { justifyContent: 'space-between', marginBottom: 12 }]}>
                  <View style={{ flex: 1 }}><Text style={u.strong}>Required</Text><Text style={u.kv}>Blocks {'"complete"'} unless entered or marked not-done with a reason.</Text></View>
                  <Switch value={editing.v.required} onValueChange={b => setEditing({ ...editing, v: { ...editing.v, required: b } })} testID="var-required" />
                </View>
              )}
              {editing.v.source !== 'linked' && ['integer', 'decimal', 'scale'].includes(editing.v.data_type) && (
                <Card style={{ marginHorizontal: 0 }}>
                  <SectionTitle title="Soft warning (optional)" icon="warning-outline" />
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                    <View><Text style={u.label}>When value</Text>
                      <PillSelect value={editing.v.soft_warning?.op || ''} onChange={op => setEditing({ ...editing, v: { ...editing.v, soft_warning: { op, value: editing.v.soft_warning?.value ?? 0, message: editing.v.soft_warning?.message || '' } } })}
                        options={[{ key: 'gt', label: '>' }, { key: 'gte', label: '≥' }, { key: 'lt', label: '<' }, { key: 'lte', label: '≤' }]} /></View>
                    <View style={{ flex: 1 }}><Field label="Threshold" value={editing.v.soft_warning ? String(editing.v.soft_warning.value) : ''} onChangeText={t => setEditing({ ...editing, v: { ...editing.v, soft_warning: { op: editing.v.soft_warning?.op || 'gt', value: Number(t) || 0, message: editing.v.soft_warning?.message || '' } } })} keyboardType="numbers-and-punctuation" /></View>
                  </View>
                  <Field label="Message" value={editing.v.soft_warning?.message || ''} onChangeText={t => setEditing({ ...editing, v: { ...editing.v, soft_warning: { op: editing.v.soft_warning?.op || 'gt', value: editing.v.soft_warning?.value ?? 0, message: t } } })} placeholder="Exceeds year-1 success threshold — confirm measurement" />
                  {editing.v.soft_warning && <TouchableOpacity onPress={() => setEditing({ ...editing, v: { ...editing.v, soft_warning: null } })}><Text style={{ color: RC.red, fontSize: 12 }}>Remove warning</Text></TouchableOpacity>}
                </Card>
              )}
              <Field label="Method note (shown on the form)" value={editing.v.method_note || ''} onChangeText={t => setEditing({ ...editing, v: { ...editing.v, method_note: t } })} multiline placeholder="Measurement technique, landmarks, instrument…" />
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>

      {/* Registry picker */}
      <Modal visible={pickReg} animationType="slide" onRequestClose={() => setPickReg(false)}>
        <SafeAreaView style={u.container}>
          <ScreenHeader title="Case Field Registry" subtitle="Linked variables read these live" onBack={() => { setPickReg(false); if (editing && editing.idx < 0 && !editing.v.case_field_path) setEditing(null); }} />
          <View style={{ padding: 12 }}><TextInput value={search} onChangeText={setSearch} placeholder="Search fields…" placeholderTextColor={RC.muted} style={u.input} autoFocus testID="var-registry-search" /></View>
          <FlatList data={regList} keyExtractor={f => f.path} renderItem={({ item: f }) => (
            <TouchableOpacity style={s.regRow} testID={`var-reg-${f.path}`} onPress={() => {
              if (!editing) return;
              const key = editing.v.key || f.path.split('.').pop()!.replace(/_mm$|_ncm$/, '');
              setEditing({ ...editing, v: { ...editing.v, case_field_path: f.path, label: editing.v.label || f.label, key, level: f.level, data_type: f.data_type, unit: f.unit || '', options: f.options || [] } });
              setPickReg(false);
            }}>
              <View style={{ flex: 1 }}><Text style={u.strong}>{f.label}</Text><Text style={u.kv}>{f.path}</Text></View>
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

const s = StyleSheet.create({
  varRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#F0F3F7', minHeight: 50 },
  help: { marginHorizontal: 14, marginTop: 14, fontSize: 11, color: RC.sub, lineHeight: 16 },
  linkBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: RC.primarySoft, borderRadius: 12, padding: 12, marginBottom: 12, minHeight: 56 },
  regRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F3F7', backgroundColor: '#FFF' },
});
