/**
 * Research Module — study design picker with ⓘ primer sheets, and
 * multi-select primary-unit picker with custom units.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { STUDY_DESIGNS, STUDY_DESIGN_MAP } from '../../constants/studyDesigns';
import { RC, Chip, ScreenHeader, u } from './ResearchUI';

export function StudyDesignPicker({ value, onChange, disabled }: { value: string; onChange: (k: string) => void; disabled?: boolean }) {
  const [info, setInfo] = useState<string | null>(null);
  const d = info ? STUDY_DESIGN_MAP[info] : null;
  return (
    <View>
      {STUDY_DESIGNS.map(sd => {
        const on = value === sd.key;
        return (
          <View key={sd.key} style={s.designRow}>
            <TouchableOpacity disabled={disabled} onPress={() => onChange(sd.key)} style={[s.designBtn, on && s.designOn]} testID={`study-type-${sd.key}`}>
              <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={18} color={on ? '#FFF' : RC.muted} />
              <Text style={[s.designTxt, on && { color: '#FFF' }]}>{sd.label}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setInfo(sd.key)} style={s.infoBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID={`design-info-${sd.key}`}>
              <Ionicons name="information-circle-outline" size={22} color={RC.primary} />
            </TouchableOpacity>
          </View>
        );
      })}
      <Modal visible={!!d} animationType="slide" onRequestClose={() => setInfo(null)}>
        {d && (
          <SafeAreaView style={u.container} edges={['bottom']}>
            <ScreenHeader title={d.label} subtitle={d.evidenceLevel} onBack={() => setInfo(null)} testID="design-info-title" />
            <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60 }}>
              <Section title="What it is" body={d.definition} />
              <Section title="When to use it in implantology" body={d.whenToUse} />
              <Section title="Strengths" bullets={d.strengths} color={RC.green} />
              <Section title="Limitations" bullets={d.limitations} color={RC.amber} />
              <View style={s.block}>
                <Text style={s.blockTitle}>Level of evidence & reporting</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  <Chip label={d.evidenceLevel} color={RC.purple} bg={RC.purpleSoft} small />
                  <Chip label={d.reporting} color={RC.primary} bg={RC.primarySoft} small />
                </View>
              </View>
              <Section title="Example in Implanr" body={d.implantExample} />
              <Section title="Key references" bullets={d.references} color={RC.sub} />
              <TouchableOpacity style={s.useBtn} onPress={() => { onChange(d.key); setInfo(null); }} testID="design-info-use">
                <Text style={s.useTxt}>Use this design</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
    </View>
  );
}

function Section({ title, body, bullets, color }: { title: string; body?: string; bullets?: string[]; color?: string }) {
  return (
    <View style={s.block}>
      <Text style={s.blockTitle}>{title}</Text>
      {!!body && <Text style={s.body}>{body}</Text>}
      {bullets?.map((b, i) => (
        <View key={i} style={{ flexDirection: 'row', marginTop: 4 }}>
          <Text style={[s.body, { color: color || RC.text, marginRight: 6 }]}>•</Text>
          <Text style={[s.body, { flex: 1 }]}>{b}</Text>
        </View>
      ))}
    </View>
  );
}

const BASE_UNITS = [{ key: 'patient', label: 'Patient' }, { key: 'implant', label: 'Implant' }, { key: 'site', label: 'Site' }];

export function UnitPicker({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const [custom, setCustom] = useState('');
  const toggle = (k: string) => onChange(value.includes(k) ? value.filter(x => x !== k) : [...value, k]);
  const customs = value.filter(v => !BASE_UNITS.some(b => b.key === v));
  const add = () => {
    const k = custom.trim().toLowerCase().replace(/[^a-z0-9 _-]/g, '').slice(0, 30);
    if (k && !value.includes(k)) onChange([...value, k]);
    setCustom('');
  };
  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[...BASE_UNITS, ...customs.map(c => ({ key: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))].map(o => {
          const on = value.includes(o.key);
          return (
            <TouchableOpacity key={o.key} disabled={disabled} onPress={() => toggle(o.key)} style={[u.pill, on && { backgroundColor: RC.primary, borderColor: RC.primary }]} testID={`study-unit-${o.key}`}>
              <Text style={[u.pillTxt, on && { color: '#FFF' }]}>{on && value[0] === o.key ? '★ ' : ''}{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!disabled && (
        <View style={[u.row, { marginTop: 8, gap: 8 }]}>
          <TextInput value={custom} onChangeText={setCustom} placeholder="Add custom unit (e.g. prosthesis, sinus, socket)" placeholderTextColor={RC.muted}
            style={[u.input, { flex: 1 }]} onSubmitEditing={add} returnKeyType="done" testID="study-unit-custom" />
          <TouchableOpacity onPress={add} style={s.addBtn} testID="study-unit-add"><Ionicons name="add" size={20} color="#FFF" /></TouchableOpacity>
        </View>
      )}
      <Text style={u.hint}>Select one or more. ★ = primary unit (first chosen) — drives subject coding and feasibility counts.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  designRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  designBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#CFD8DC', backgroundColor: '#FFF', minHeight: 44 },
  designOn: { backgroundColor: RC.primary, borderColor: RC.primary },
  designTxt: { marginLeft: 8, fontSize: 13, fontWeight: '600', color: RC.text },
  infoBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  block: { backgroundColor: '#FFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: RC.border, marginBottom: 10 },
  blockTitle: { fontSize: 12, fontWeight: '800', color: RC.sub, textTransform: 'uppercase', letterSpacing: 0.4 },
  body: { fontSize: 13, color: RC.text, lineHeight: 19, marginTop: 4 },
  useBtn: { backgroundColor: RC.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 6, minHeight: 46, justifyContent: 'center' },
  useTxt: { color: '#FFF', fontWeight: '700' },
  addBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: RC.primary, alignItems: 'center', justifyContent: 'center' },
});
