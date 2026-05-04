import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import api from '../../utils/api';
import BackButton from '../../components/BackButton';

/**
 * iter-148: Catalog editor — Implant In-Charge / Administrator add or edit a
 * system. Pass `?key=Brand|Name` to edit existing; omit `key` to create new.
 *
 * Persists via PUT /api/implant-catalog/by-key (server enforces RBAC).
 */

type Component = {
  type: string; subtype?: string;
  gingival_heights_mm?: string;       // CSV in form, parsed on submit
  angulations_deg?: string;
  retention?: string;
  material?: string;
  indication?: string;
  notes?: string;
};

const COMPONENT_TYPES = [
  'cover_screw', 'healing_abutment', 'final_abutment', 'multi_unit_abutment',
  'ti_base', 'scanbody', 'overdenture', 'impression_coping', 'analog',
];

const parseCSVNum = (s: string | undefined): number[] | undefined => {
  if (!s || !s.trim()) return undefined;
  const arr = s.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
  return arr.length ? arr : undefined;
};
const parseCSVStr = (s: string | undefined): string[] | undefined => {
  if (!s || !s.trim()) return undefined;
  const arr = s.split(',').map(v => v.trim()).filter(Boolean);
  return arr.length ? arr : undefined;
};

export default function CatalogEditor() {
  const { key: editKey } = useLocalSearchParams<{ key?: string }>();
  const isEdit = !!editKey;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const [brand, setBrand] = useState('');
  const [name, setName] = useState('');
  const [connType, setConnType] = useState('');
  const [connSubtype, setConnSubtype] = useState('');
  const [connIndexing, setConnIndexing] = useState('');  // CSV
  const [platformSwitching, setPlatformSwitching] = useState(false);
  const [features, setFeatures] = useState('');  // newline-separated
  const [diameters, setDiameters] = useState('');
  const [lengths, setLengths] = useState('');
  const [boneTypes, setBoneTypes] = useState('');
  const [healingModes, setHealingModes] = useState('');
  const [components, setComponents] = useState<Component[]>([]);
  const [compatibilityNotes, setCompatibilityNotes] = useState('');

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const res = await api.get('/implant-catalog/by-key', { params: { key: editKey } });
        const d = res.data;
        setBrand(d.brand || ''); setName(d.name || '');
        setConnType(d.connection?.type || ''); setConnSubtype(d.connection?.subtype || '');
        setConnIndexing((d.connection?.indexing || []).join(', '));
        setPlatformSwitching(!!d.platform_switching);
        setFeatures((d.features || []).join('\n'));
        setDiameters((d.implant?.diameters_mm || []).join(', '));
        setLengths((d.implant?.lengths_mm || []).join(', '));
        setBoneTypes((d.implant?.bone_types || []).join(', '));
        setHealingModes((d.implant?.healing_modes || []).join(', '));
        setComponents((d.components || []).map((c: any) => ({
          type: c.type, subtype: c.subtype || '',
          gingival_heights_mm: (c.gingival_heights_mm || []).join(', '),
          angulations_deg: (c.angulations_deg || []).join(', '),
          retention: (c.retention || []).join(', '),
          material: (c.material || []).join(', '),
          indication: c.indication || '', notes: c.notes || '',
        })));
        setCompatibilityNotes(d.compatibility_notes || '');
      } catch (e: any) {
        Alert.alert('Failed to load', e?.response?.data?.detail || String(e?.message || e));
      } finally { setLoading(false); }
    })();
  }, [editKey, isEdit]);

  const updateComponent = (idx: number, patch: Partial<Component>) => {
    setComponents(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  };
  const addComponent = () => setComponents(prev => [...prev, { type: 'healing_abutment' }]);
  const removeComponent = (idx: number) => setComponents(prev => prev.filter((_, i) => i !== idx));

  const save = useCallback(async () => {
    if (!brand.trim() || !name.trim()) {
      Alert.alert('Missing info', 'Brand and System Name are required.');
      return;
    }
    const key = `${brand.trim()}|${name.trim()}`;
    const body: any = {
      brand: brand.trim(), name: name.trim(),
      connection: connType.trim() || connSubtype.trim() || connIndexing.trim() ? {
        type: connType.trim() || undefined,
        subtype: connSubtype.trim() || undefined,
        indexing: parseCSVStr(connIndexing) || [],
      } : null,
      platform_switching: platformSwitching,
      features: features.split('\n').map(f => f.trim()).filter(Boolean),
      implant: {
        diameters_mm: parseCSVNum(diameters) || [],
        lengths_mm: parseCSVNum(lengths) || [],
        bone_types: parseCSVStr(boneTypes) || [],
        healing_modes: parseCSVStr(healingModes) || [],
      },
      components: components.map(c => ({
        type: c.type,
        subtype: c.subtype || undefined,
        gingival_heights_mm: parseCSVNum(c.gingival_heights_mm),
        angulations_deg: parseCSVNum(c.angulations_deg),
        retention: parseCSVStr(c.retention),
        material: parseCSVStr(c.material),
        indication: c.indication || undefined,
        notes: c.notes || undefined,
      })),
      compatibility_notes: compatibilityNotes.trim(),
    };
    setSaving(true);
    try {
      await api.put('/implant-catalog/by-key', body, { params: { key } });
      Alert.alert('Saved', `${brand} ${name} has been ${isEdit ? 'updated' : 'created'}.`);
      router.back();
    } catch (e: any) {
      Alert.alert('Save failed', e?.response?.data?.detail || String(e?.message || e));
    } finally { setSaving(false); }
  }, [brand, name, connType, connSubtype, connIndexing, platformSwitching, features,
      diameters, lengths, boneTypes, healingModes, components, compatibilityNotes, isEdit]);

  if (loading) {
    return <SafeAreaView style={s.container}><View style={s.center}><ActivityIndicator size="large" color="#0277BD" /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.headerBar}>
        <BackButton />
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{isEdit ? 'Edit System' : 'Add Implant System'}</Text>
          {isEdit && <Text style={s.headerSub}>{editKey}</Text>}
        </View>
        <TouchableOpacity
          style={[s.saveBtn, saving && { opacity: 0.5 }]}
          onPress={save} disabled={saving}
          testID="catalog-save"
          data-testid="catalog-save"
        >
          {saving
            ? <ActivityIndicator size="small" color="#FFF" />
            : <><Ionicons name="checkmark" size={16} color="#FFF" /><Text style={s.saveBtnText}>Save</Text></>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 64 }}>
        <Section title="Identity">
          <Field label="Brand *" v={brand} setV={setBrand} testID="cat-brand" placeholder="e.g. Dentsply Sirona" disabled={isEdit} />
          <Field label="System Name *" v={name} setV={setName} testID="cat-name" placeholder="e.g. Ankylos C/X" disabled={isEdit} />
          {isEdit && <Text style={s.hint}>Brand + System Name cannot be changed (they form the key). To rename, delete and recreate.</Text>}
        </Section>

        <Section title="Connection">
          <Field label="Type" v={connType} setV={setConnType} testID="cat-conn-type" placeholder="conical / internal_hex / external_hex" />
          <Field label="Subtype" v={connSubtype} setV={setConnSubtype} testID="cat-conn-subtype" placeholder="morse_taper, 6-cam, etc." />
          <Field label="Indexing (CSV)" v={connIndexing} setV={setConnIndexing} testID="cat-conn-indexing" placeholder="indexed, non_indexed" />
          <View style={s.switchRow}>
            <Text style={s.label}>Platform Switching</Text>
            <Switch value={platformSwitching} onValueChange={setPlatformSwitching} testID="cat-platform-switching" />
          </View>
        </Section>

        <Section title="Features (one per line)">
          <TextInput
            style={[s.input, { minHeight: 100 }]}
            value={features} onChangeText={setFeatures} multiline
            placeholder="Friction-lock Morse taper&#10;Platform switching&#10;..."
            placeholderTextColor="#aaa"
            testID="cat-features"
          />
        </Section>

        <Section title="Implant Specs">
          <Field label="Diameters mm (CSV)" v={diameters} setV={setDiameters} testID="cat-diam" placeholder="3.5, 4.5, 5.5" />
          <Field label="Lengths mm (CSV)" v={lengths} setV={setLengths} testID="cat-len" placeholder="8, 10, 12, 14" />
          <Field label="Bone Types (CSV)" v={boneTypes} setV={setBoneTypes} testID="cat-bone" placeholder="D1, D2, D3, D4" />
          <Field label="Healing Modes (CSV)" v={healingModes} setV={setHealingModes} testID="cat-healing" placeholder="submerged, transgingival" />
        </Section>

        <Section title={`Components (${components.length})`}>
          {components.map((c, i) => (
            <View key={i} style={s.compEditor}>
              <View style={s.compHeader}>
                <Text style={s.compHeaderText}>Component #{i + 1}</Text>
                <TouchableOpacity onPress={() => removeComponent(i)} testID={`cat-comp-remove-${i}`} data-testid={`cat-comp-remove-${i}`}>
                  <Ionicons name="trash" size={18} color="#D32F2F" />
                </TouchableOpacity>
              </View>
              <Text style={s.label}>Type</Text>
              <View style={s.typeRow}>
                {COMPONENT_TYPES.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[s.typeChip, c.type === t && s.typeChipActive]}
                    onPress={() => updateComponent(i, { type: t })}
                  >
                    <Text style={[s.typeChipText, c.type === t && s.typeChipTextActive]}>
                      {t.replace(/_/g, ' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Field label="Subtype" v={c.subtype || ''} setV={(v) => updateComponent(i, { subtype: v })} placeholder="optional" />
              <Field label="Gingival Heights mm (CSV)" v={c.gingival_heights_mm || ''} setV={(v) => updateComponent(i, { gingival_heights_mm: v })} placeholder="0.75, 1.5, 3, 4.5" />
              <Field label="Angulations ° (CSV)" v={c.angulations_deg || ''} setV={(v) => updateComponent(i, { angulations_deg: v })} placeholder="0, 7.5, 15, 30" />
              <Field label="Retention (CSV)" v={c.retention || ''} setV={(v) => updateComponent(i, { retention: v })} placeholder="cement, occlusal_screw, lateral_screw" />
              <Field label="Material (CSV)" v={c.material || ''} setV={(v) => updateComponent(i, { material: v })} placeholder="titanium, zirconia" />
              <Field label="Indication" v={c.indication || ''} setV={(v) => updateComponent(i, { indication: v })} placeholder="Single + bridge, anterior" />
              <Field label="Notes" v={c.notes || ''} setV={(v) => updateComponent(i, { notes: v })} placeholder="optional clinical notes" />
            </View>
          ))}
          <TouchableOpacity style={s.addBtn} onPress={addComponent} testID="cat-add-component" data-testid="cat-add-component">
            <Ionicons name="add-circle" size={18} color="#0277BD" />
            <Text style={s.addBtnText}>Add component</Text>
          </TouchableOpacity>
        </Section>

        <Section title="Compatibility Notes">
          <TextInput
            style={[s.input, { minHeight: 80 }]}
            value={compatibilityNotes} onChangeText={setCompatibilityNotes} multiline
            placeholder="Cross-compatibility, platform-switch rules, etc."
            placeholderTextColor="#aaa"
            testID="cat-compatibility"
          />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={s.section}>
    <Text style={s.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const Field: React.FC<{ label: string; v: string; setV: (s: string) => void; placeholder?: string; testID?: string; disabled?: boolean }> =
({ label, v, setV, placeholder, testID, disabled }) => (
  <View style={{ marginBottom: 10 }}>
    <Text style={s.label}>{label}</Text>
    <TextInput
      style={[s.input, disabled && { opacity: 0.6, backgroundColor: '#F0F4F8' }]}
      value={v} onChangeText={setV} editable={!disabled}
      placeholder={placeholder} placeholderTextColor="#aaa"
      testID={testID}
    />
  </View>
);

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#01579B' },
  headerSub: { fontSize: 11, color: '#607D8B', marginTop: 2 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#0277BD', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  saveBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  section: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#ECEFF1', padding: 14, marginBottom: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#01579B', marginBottom: 10, letterSpacing: 0.3 },
  label: { fontSize: 12, color: '#607D8B', fontWeight: '600', marginBottom: 4 },
  input: { backgroundColor: '#FAFCFE', borderColor: '#B3E5FC', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#263238' },
  hint: { fontSize: 11, color: '#90A4AE', fontStyle: 'italic', marginTop: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  compEditor: { backgroundColor: '#F5FBFF', borderColor: '#B3E5FC', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 10 },
  compHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  compHeaderText: { fontSize: 13, fontWeight: '700', color: '#01579B' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  typeChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: '#B3E5FC', backgroundColor: '#FFF' },
  typeChipActive: { backgroundColor: '#0277BD', borderColor: '#0277BD' },
  typeChipText: { fontSize: 11, color: '#0277BD', fontWeight: '600' },
  typeChipTextActive: { color: '#FFF' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#0277BD', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginTop: 4 },
  addBtnText: { fontSize: 13, color: '#0277BD', fontWeight: '700' },
});
