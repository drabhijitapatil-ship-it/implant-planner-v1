/**
 * iter-395 — Reusable "Step 2 — Post-procedure" augmentation capture form
 * (Sections 1–6: Bone Graft Procedure → Healing Protocol). Used inline in the
 * Phase 2 surgery form for "Bone and Soft Tissue Augmentation". Controlled:
 * parent owns the value object (same schema as AugmentationStep2Submit).
 */
import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AugDropdown from './AugDropdown';
import {
  AUGMENTATION_PROCEDURES, AUTOGENOUS_SITES, OTHER_GRAFT_MATERIALS,
  MEMBRANE_TYPES, FIXATION_OPTIONS, SOFT_TISSUE_GRAFT_TYPES,
  SOFT_TISSUE_DONOR_SITES, SOFT_TISSUE_INDICATIONS, HEALING_PROTOCOLS,
} from '../constants/checklist';

export const emptyAugStep2 = () => ({
  procedures_performed: [], procedure_other_text: '',
  autogenous_used: '', autogenous_sites: [], autogenous_other_text: '',
  allograft_used: '', other_graft_materials: [], graft_material_other_text: '',
  membrane_used: '', membrane_types: [], membrane_other_text: '',
  fixation: [],
  soft_tissue_graft: '', soft_tissue_types: [], soft_tissue_donor_sites: [],
  soft_tissue_indications: [], soft_tissue_other_text: '',
  healing_protocol: '', healing_custom_text: '',
});

const YesNo = ({ value, onChange, testPrefix }: any) => (
  <View style={{ flexDirection: 'row', gap: 8 }}>
    {['Yes', 'No'].map(o => (
      <TouchableOpacity key={o} style={[s.chip, value === o && s.chipActive]} onPress={() => onChange(o)} testID={`${testPrefix}-${o.toLowerCase()}`}>
        <Text style={[s.chipText, value === o && s.chipTextActive]}>{o}</Text>
      </TouchableOpacity>
    ))}
  </View>
);

interface Props {
  value: any;
  onChange: (v: any) => void;
  testPrefix?: string;
}

export default function AugStep2Form({ value, onChange, testPrefix = 'p2aug' }: Props) {
  const v = value || emptyAugStep2();
  const set = (patch: any) => onChange({ ...v, ...patch });

  return (
    <View style={s.wrap} testID={`${testPrefix}-form`}>
      <View style={s.block}>
        <View style={s.blockHead}>
          <Ionicons name="construct-outline" size={16} color="#1565C0" />
          <Text style={s.blockTitle}>1. Bone Graft Procedure</Text>
        </View>
        <Text style={s.label}>Procedure performed <Text style={{ color: '#DC3545' }}>*</Text></Text>
        <AugDropdown options={AUGMENTATION_PROCEDURES} selected={v.procedures_performed} onChange={(x) => set({ procedures_performed: x })} testPrefix={`${testPrefix}-proc`} placeholder="Select procedure(s)…" />
        {v.procedures_performed.includes('Other') && (
          <TextInput style={[s.input, { marginTop: 8 }]} placeholder="Other procedure details..." value={v.procedure_other_text} onChangeText={(t) => set({ procedure_other_text: t })} testID={`${testPrefix}-proc-other`} />
        )}
      </View>

      <View style={s.block}>
        <View style={s.blockHead}>
          <Ionicons name="flask-outline" size={16} color="#1565C0" />
          <Text style={s.blockTitle}>2. Graft Material Used</Text>
        </View>
        <Text style={s.label}>Autogenous</Text>
        <YesNo value={v.autogenous_used} onChange={(x: string) => set({ autogenous_used: x, autogenous_sites: x === 'Yes' ? v.autogenous_sites : [] })} testPrefix={`${testPrefix}-auto`} />
        {v.autogenous_used === 'Yes' && (
          <View style={{ marginTop: 8 }}>
            <Text style={s.label}>Harvest site(s)</Text>
            <AugDropdown options={AUTOGENOUS_SITES} selected={v.autogenous_sites} onChange={(x) => set({ autogenous_sites: x })} testPrefix={`${testPrefix}-auto-site`} placeholder="Select harvest site(s)…" />
          </View>
        )}
        <Text style={[s.label, { marginTop: 10 }]}>Allograft</Text>
        <YesNo value={v.allograft_used} onChange={(x: string) => set({ allograft_used: x })} testPrefix={`${testPrefix}-allo`} />
        <Text style={[s.label, { marginTop: 10 }]}>Other graft materials</Text>
        <AugDropdown options={OTHER_GRAFT_MATERIALS} selected={v.other_graft_materials} onChange={(x) => set({ other_graft_materials: x })} testPrefix={`${testPrefix}-material`} placeholder="Select graft material(s)…" />
        {v.other_graft_materials.includes('Other') && (
          <TextInput style={[s.input, { marginTop: 8 }]} placeholder="Other material details..." value={v.graft_material_other_text} onChangeText={(t) => set({ graft_material_other_text: t })} testID={`${testPrefix}-material-other`} />
        )}
      </View>

      <View style={s.block}>
        <View style={s.blockHead}>
          <Ionicons name="layers-outline" size={16} color="#1565C0" />
          <Text style={s.blockTitle}>3. Membrane</Text>
        </View>
        <YesNo value={v.membrane_used} onChange={(x: string) => set({ membrane_used: x, membrane_types: x === 'Yes' ? v.membrane_types : [] })} testPrefix={`${testPrefix}-membrane`} />
        {v.membrane_used === 'Yes' && (
          <View style={{ marginTop: 8 }}>
            <Text style={s.label}>Membrane type(s)</Text>
            <AugDropdown options={MEMBRANE_TYPES} selected={v.membrane_types} onChange={(x) => set({ membrane_types: x })} testPrefix={`${testPrefix}-membrane-type`} placeholder="Select membrane type(s)…" />
            {v.membrane_types.includes('Other') && (
              <TextInput style={[s.input, { marginTop: 8 }]} placeholder="Other membrane details..." value={v.membrane_other_text} onChangeText={(t) => set({ membrane_other_text: t })} testID={`${testPrefix}-membrane-other`} />
            )}
          </View>
        )}
      </View>

      <View style={s.block}>
        <View style={s.blockHead}>
          <Ionicons name="hardware-chip-outline" size={16} color="#1565C0" />
          <Text style={s.blockTitle}>4. Fixation</Text>
        </View>
        <AugDropdown options={FIXATION_OPTIONS} selected={v.fixation} onChange={(x) => set({ fixation: x })} testPrefix={`${testPrefix}-fixation`} placeholder="Select fixation…" />
      </View>

      <View style={s.block}>
        <View style={s.blockHead}>
          <Ionicons name="leaf-outline" size={16} color="#1565C0" />
          <Text style={s.blockTitle}>5. Soft Tissue Graft</Text>
        </View>
        <YesNo value={v.soft_tissue_graft} onChange={(x: string) => set({ soft_tissue_graft: x, ...(x === 'No' ? { soft_tissue_types: [], soft_tissue_donor_sites: [], soft_tissue_indications: [] } : {}) })} testPrefix={`${testPrefix}-stt`} />
        {v.soft_tissue_graft === 'Yes' && (
          <View style={{ marginTop: 8 }}>
            <Text style={s.label}>Graft type(s)</Text>
            <AugDropdown options={SOFT_TISSUE_GRAFT_TYPES} selected={v.soft_tissue_types} onChange={(x) => set({ soft_tissue_types: x })} testPrefix={`${testPrefix}-stt-type`} placeholder="Select graft type(s)…" />
            <Text style={[s.label, { marginTop: 8 }]}>Donor site(s)</Text>
            <AugDropdown options={SOFT_TISSUE_DONOR_SITES} selected={v.soft_tissue_donor_sites} onChange={(x) => set({ soft_tissue_donor_sites: x })} testPrefix={`${testPrefix}-stt-donor`} placeholder="Select donor site(s)…" />
            <Text style={[s.label, { marginTop: 8 }]}>Indication(s)</Text>
            <AugDropdown options={SOFT_TISSUE_INDICATIONS} selected={v.soft_tissue_indications} onChange={(x) => set({ soft_tissue_indications: x })} testPrefix={`${testPrefix}-stt-indication`} placeholder="Select indication(s)…" />
            <TextInput style={[s.input, { marginTop: 8 }]} placeholder="Other soft-tissue details..." value={v.soft_tissue_other_text} onChangeText={(t) => set({ soft_tissue_other_text: t })} testID={`${testPrefix}-stt-other`} />
          </View>
        )}
      </View>

      <View style={s.block}>
        <View style={s.blockHead}>
          <Ionicons name="hourglass-outline" size={16} color="#1565C0" />
          <Text style={s.blockTitle}>6. Healing Protocol</Text>
        </View>
        <AugDropdown options={HEALING_PROTOCOLS} selected={v.healing_protocol ? [v.healing_protocol] : []} onChange={(x) => set({ healing_protocol: x[0] || '' })} multi={false} testPrefix={`${testPrefix}-healing`} placeholder="Select healing period…" />
        {v.healing_protocol === 'Custom' && (
          <TextInput style={[s.input, { marginTop: 8 }]} placeholder="Custom healing period (e.g. 5 months)" value={v.healing_custom_text} onChangeText={(t) => set({ healing_custom_text: t })} testID={`${testPrefix}-healing-custom`} />
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 10, gap: 10 },
  block: { borderWidth: 1, borderColor: '#DCE6F0', borderRadius: 10, padding: 12, backgroundColor: '#FAFCFE' },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  blockTitle: { fontSize: 13.5, fontWeight: '800', color: '#1565C0', letterSpacing: 0.2 },
  label: { fontSize: 12.5, fontWeight: '600', color: '#1565C0', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 10, fontSize: 13, backgroundColor: '#FFF', minHeight: 40 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#D0DCE8', backgroundColor: '#F8FAFC' },
  chipActive: { borderColor: '#1565C0', backgroundColor: '#1565C0' },
  chipText: { fontSize: 12.5, color: '#666', fontWeight: '600' },
  chipTextActive: { color: '#FFF' },
});
