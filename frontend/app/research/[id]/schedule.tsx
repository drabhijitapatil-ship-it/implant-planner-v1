/**
 * Research Module — schedule editor (S6): timepoints with anchor/offset/window
 * and the timepoint × variable matrix.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet, Switch, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@react-native-vector-icons/ionicons';
import api from '../../../utils/api';
import { RC, Card, Chip, Field, Loading, PillSelect, PrimaryButton, ScreenHeader, SectionTitle, Timepoint, Variable, ANCHOR_LABEL, errText, u } from '../../../components/research/ResearchUI';

const blankTp = (): Timepoint => ({ key: '', label: '', anchor_event: 'placement_date', anchor_variable_key: null, offset_days: 0, window_before_days: 0, window_after_days: 7, is_baseline: false, variables: [] });

export default function ScheduleEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tps, setTps] = useState<Timepoint[] | null>(null);
  const [vars, setVars] = useState<Variable[]>([]);
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ idx: number; t: Timepoint } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/research/studies/${id}`).then(s => {
      setTps(s.data.timepoints || []); setVars(s.data.variables || []);
      if (s.data.status !== 'draft') setLocked(new Set(s.data.timepoints.map((t: Timepoint) => t.key)));
    }).catch(e => Alert.alert('Error', errText(e)));
  }, [id]);

  const save = async (list: Timepoint[]) => {
    setSaving(true);
    try {
      const s = await api.put(`/research/studies/${id}`, { timepoints: list });
      setTps(s.data.timepoints);
      if (s.data.protocol_errors?.length) Alert.alert('Saved — check these', s.data.protocol_errors.join('\n'));
    } catch (e) { Alert.alert('Could not save', errText(e)); } finally { setSaving(false); }
  };

  const commit = () => {
    if (!editing || !tps) return;
    const t = { ...editing.t };
    t.key = (t.key || t.label).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'm$1');
    if (!t.key) { Alert.alert('Missing', 'Timepoint needs a label.'); return; }
    if (tps.some((x, i) => x.key === t.key && i !== editing.idx)) { Alert.alert('Duplicate key', `'${t.key}' already exists.`); return; }
    let list = editing.idx < 0 ? [...tps, t] : tps.map((x, i) => (i === editing.idx ? t : x));
    if (t.is_baseline) list = list.map(x => (x.key === t.key ? x : { ...x, is_baseline: false }));
    setEditing(null);
    save(list);
  };

  const remove = (idx: number) => {
    if (!tps) return;
    if (locked.has(tps[idx].key)) { Alert.alert('Protocol active', 'Existing timepoints cannot be removed after activation.'); return; }
    Alert.alert('Remove timepoint?', tps[idx].label, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => save(tps.filter((_, i) => i !== idx)) }]);
  };

  if (!tps) return <Loading />;
  const dateVars = vars.filter(v => v.data_type === 'date');

  return (
    <SafeAreaView style={u.container} edges={['top']}>
      <ScreenHeader title="Schedule" subtitle="Timepoints anchored to clinical events" testID="schedule-title"
        right={<PrimaryButton label="+ Timepoint" onPress={() => setEditing({ idx: -1, t: blankTp() })} testID="add-timepoint" style={{ paddingVertical: 8, minHeight: 36 }} />} />
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {tps.map((t, i) => (
          <Card key={t.key}>
            <TouchableOpacity onPress={() => setEditing({ idx: i, t: { ...t, variables: [...t.variables] } })} testID={`tp-${t.key}`}>
              <View style={u.row}>
                <Text style={u.strong}>{t.label}</Text>
                {t.is_baseline && <View style={{ marginLeft: 6 }}><Chip label="Baseline" color={RC.primary} bg={RC.primarySoft} small /></View>}
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={() => remove(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name={locked.has(t.key) ? 'lock-closed-outline' : 'trash-outline'} size={18} color={locked.has(t.key) ? RC.muted : RC.red} />
                </TouchableOpacity>
              </View>
              <Text style={u.kv}>{ANCHOR_LABEL[t.anchor_event]}{t.anchor_event === 'variable' ? ` (${t.anchor_variable_key})` : ''} + {t.offset_days} d · window −{t.window_before_days} / +{t.window_after_days} d</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                {t.variables.map(k => <Chip key={k} label={vars.find(v => v.key === k)?.label || k} color={RC.sub} bg={RC.greySoft} small />)}
                {t.variables.length === 0 && <Text style={u.kv}>No variables collected — tap to assign.</Text>}
              </View>
            </TouchableOpacity>
          </Card>
        ))}
        <Text style={s.help}>Due date = anchor + offset; window = [due − before, due + after]. Visits outside the window are accepted but flagged as deviations and need a reason. Missed = more than 2× the after-window past due.</Text>
      </ScrollView>

      <Modal visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        {editing && (
          <SafeAreaView style={u.container}>
            <ScreenHeader title={editing.idx < 0 ? 'New timepoint' : 'Edit timepoint'} onBack={() => setEditing(null)}
              right={<PrimaryButton label="Done" onPress={commit} loading={saving} testID="tp-done" style={{ paddingVertical: 8, minHeight: 36 }} />} />
            <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
              <Field label="Label" value={editing.t.label} onChangeText={l => setEditing({ ...editing, t: { ...editing.t, label: l, key: editing.idx < 0 ? l.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') : editing.t.key } })} placeholder="e.g. 12 months" testID="tp-label" />
              <Field label="Key" value={editing.t.key} editable={!locked.has(editing.t.key)} onChangeText={k => setEditing({ ...editing, t: { ...editing.t, key: k } })} hint="Used in formulas: v('bl_mesial','baseline') and export columns" testID="tp-key" />
              <Text style={u.label}>Anchor event</Text>
              <PillSelect value={editing.t.anchor_event} onChange={a => setEditing({ ...editing, t: { ...editing.t, anchor_event: a } })} options={Object.entries(ANCHOR_LABEL).map(([key, label]) => ({ key, label }))} testID="tp-anchor" />
              {editing.t.anchor_event === 'variable' && (
                <View style={{ marginTop: 10 }}>
                  <Text style={u.label}>Date variable</Text>
                  {dateVars.length ? <PillSelect value={editing.t.anchor_variable_key || ''} onChange={k => setEditing({ ...editing, t: { ...editing.t, anchor_variable_key: k } })} options={dateVars.map(v => ({ key: v.key, label: v.label }))} />
                    : <Text style={u.kv}>No date-type variables defined yet.</Text>}
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <View style={{ flex: 1 }}><Field label="Offset (days)" value={String(editing.t.offset_days)} onChangeText={t => setEditing({ ...editing, t: { ...editing.t, offset_days: Number(t) || 0 } })} keyboardType="number-pad" testID="tp-offset" /></View>
                <View style={{ flex: 1 }}><Field label="Window before" value={String(editing.t.window_before_days)} onChangeText={t => setEditing({ ...editing, t: { ...editing.t, window_before_days: Number(t) || 0 } })} keyboardType="number-pad" /></View>
                <View style={{ flex: 1 }}><Field label="Window after" value={String(editing.t.window_after_days)} onChangeText={t => setEditing({ ...editing, t: { ...editing.t, window_after_days: Number(t) || 0 } })} keyboardType="number-pad" /></View>
              </View>
              <View style={[u.row, { justifyContent: 'space-between', marginBottom: 12 }]}>
                <View style={{ flex: 1 }}><Text style={u.strong}>Baseline timepoint</Text><Text style={u.kv}>Exactly one per study; formulas reference it.</Text></View>
                <Switch value={editing.t.is_baseline} onValueChange={b => setEditing({ ...editing, t: { ...editing.t, is_baseline: b } })} testID="tp-baseline" />
              </View>
              <Card style={{ marginHorizontal: 0 }}>
                <SectionTitle title={`Variables collected (${editing.t.variables.length})`} icon="checkbox-outline"
                  right={<TouchableOpacity onPress={() => setEditing({ ...editing, t: { ...editing.t, variables: editing.t.variables.length === vars.length ? [] : vars.map(v => v.key) } })}><Text style={{ color: RC.primary, fontSize: 12, fontWeight: '700' }}>{editing.t.variables.length === vars.length ? 'Clear' : 'Select all'}</Text></TouchableOpacity>} />
                {vars.map(v => {
                  const on = editing.t.variables.includes(v.key);
                  return (
                    <TouchableOpacity key={v.key} style={s.varRow} testID={`tp-var-${v.key}`}
                      onPress={() => setEditing({ ...editing, t: { ...editing.t, variables: on ? editing.t.variables.filter(k => k !== v.key) : [...editing.t.variables, v.key] } })}>
                      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? RC.primary : RC.muted} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={u.strong}>{v.label}</Text>
                        <Text style={u.kv}>{v.level} · {v.source}{v.unit ? ` · ${v.unit}` : ''}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {vars.length === 0 && <Text style={u.kv}>Define variables first.</Text>}
              </Card>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  help: { marginHorizontal: 14, marginTop: 14, fontSize: 11, color: RC.sub, lineHeight: 16 },
  varRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F0F3F7', minHeight: 48 },
});
