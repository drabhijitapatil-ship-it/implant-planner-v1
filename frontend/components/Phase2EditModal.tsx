import React, { useMemo, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, TextInput, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

/**
 * Phase2EditModal — Supervisor / In-Charge surface to fix wrong prosthesis_type,
 * prosthesis_type_other, or healing_abutment_cuff_height values locked during
 * Phase 2 when a student files a phase2-edit-request. Writes via the existing
 * PATCH /procedures/{id}/edit-fields endpoint then calls /resolve.
 *
 * Only the 2 fields gated by the latest spec (3a) are editable here.
 */
export type Phase2EditModalProps = {
  visible: boolean;
  onClose: () => void;
  procedureId: string;
  request: any; // pending phase2_edit_request entry
  procedure: any; // full procedure object (needs phase2_data + implant_plans)
  onSaved: (updated: any) => void;
};

const PROSTHESIS_OPTIONS_SINGLE = ['PMMA Crown with Temporary Abutment', 'PMMA Crown with Ti-Base', 'Other'];
const PROSTHESIS_OPTIONS_MULTI = ['PMMA Crowns with Temporary Abutment', 'PMMA Crowns with Ti-Base', 'PMMA Bridge with Temporary Abutment', 'Other'];
const PROSTHESIS_OPTIONS_FULL = [
  'Full Arch Temporary Prosthesis with Multiunit Abutments and Temporary Cylinders',
  'Temporary PMMA CAD Prosthesis with Multiunit Abutments and Temporary Cylinders',
  'Temporary PMMA CAD Prosthesis on Ti-Base',
];
const FULL_ARCH = new Set(['All on 4', 'All on 6', 'All on X']);
const OVERLAP = new Set(['Immediate Implant', 'Partial Extraction Therapy', 'Implant Placement with Guided Bone Regeneration', 'Guided Surgery']);

export default function Phase2EditModal({ visible, onClose, procedureId, request, procedure, onSaved }: Phase2EditModalProps) {
  const p2 = procedure?.phase2_data || {};
  const implantPlans: any[] = Array.isArray(procedure?.implant_plans) ? procedure.implant_plans : [];
  const procType = procedure?.implant_procedure_type || '';
  const teethCount = Array.isArray(procedure?.teeth_present) ? procedure.teeth_present.length : 0;

  const [prosthesisType, setProsthesisType] = useState<string>(p2.prosthesis_type || '');
  const [prosthesisOther, setProsthesisOther] = useState<string>(p2.prosthesis_type_other || '');
  const initialCuffs: string[] = useMemo(() => {
    const v = p2.healing_abutment_cuff_height;
    if (Array.isArray(v)) return v.map(x => (x == null ? '' : String(x)));
    const n = Math.max(implantPlans.length || 1, 1);
    return Array(n).fill('');
  }, [p2.healing_abutment_cuff_height, implantPlans.length]);
  const [cuffs, setCuffs] = useState<string[]>(initialCuffs);
  const [saving, setSaving] = useState(false);

  const pc = p2.prosthetic_component || '';
  const showProsthesisType = pc === 'Immediate Loading Done';
  const showCuffs = pc === 'Healing Abutment Placed';

  const prosthesisOptions = useMemo(() => {
    if (FULL_ARCH.has(procType)) return PROSTHESIS_OPTIONS_FULL;
    const isSingle = procType === 'Single Conventional Implant' || (OVERLAP.has(procType) && teethCount <= 1);
    return isSingle ? PROSTHESIS_OPTIONS_SINGLE : PROSTHESIS_OPTIONS_MULTI;
  }, [procType, teethCount]);

  const save = async () => {
    const patch: Record<string, any> = { ...(p2 || {}) };
    if (showProsthesisType) {
      patch.prosthesis_type = prosthesisType || null;
      patch.prosthesis_type_other = prosthesisType === 'Other' ? (prosthesisOther || null) : null;
    }
    if (showCuffs) {
      patch.healing_abutment_cuff_height = cuffs;
    }
    setSaving(true);
    try {
      await api.patch(`/procedures/${procedureId}/edit-fields`, {
        fields: { phase2_data: patch },
      });
      if (request?.id) {
        await api.post(`/procedures/${procedureId}/phase2-edit-request/${request.id}/resolve`);
      }
      const fresh = await api.get(`/procedures/${procedureId}`);
      onSaved(fresh.data);
      onClose();
      Alert.alert('Saved', 'Phase 2 data updated. The student has been notified.');
    } catch (err: any) {
      Alert.alert('Save failed', err?.response?.data?.detail || 'Could not save Phase 2 edit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Edit Phase 2 Prosthesis Data</Text>
              {request?.requested_by_name ? (
                <Text style={s.sub}>Requested by {request.requested_by_name}</Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={onClose} data-testid="phase2-edit-modal-close">
              <Ionicons name="close" size={22} color="#607D8B" />
            </TouchableOpacity>
          </View>

          {request?.note ? (
            <View style={s.noteBox}>
              <Ionicons name="chatbubble-ellipses-outline" size={14} color="#6D4C41" />
              <Text style={s.noteText}>{request.note}</Text>
            </View>
          ) : null}

          <ScrollView style={{ maxHeight: 420 }}>
            {showProsthesisType && (
              <View style={{ marginTop: 8 }}>
                <Text style={s.label}>Prosthesis Type</Text>
                {prosthesisOptions.map(opt => (
                  <TouchableOpacity
                    key={opt}
                    style={[s.choice, prosthesisType === opt && s.choiceActive]}
                    onPress={() => setProsthesisType(opt)}
                    data-testid={`phase2-edit-prosthesis-${opt.replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    <Ionicons name={prosthesisType === opt ? 'radio-button-on' : 'radio-button-off'} size={18} color={prosthesisType === opt ? '#1565C0' : '#90A4AE'} />
                    <Text style={s.choiceText}>{opt}</Text>
                  </TouchableOpacity>
                ))}
                {prosthesisType === 'Other' && (
                  <TextInput
                    style={s.input}
                    value={prosthesisOther}
                    onChangeText={setProsthesisOther}
                    placeholder="Describe the prosthesis type..."
                    multiline
                    maxLength={500}
                    data-testid="phase2-edit-prosthesis-other"
                  />
                )}
              </View>
            )}

            {showCuffs && (
              <View style={{ marginTop: 14 }}>
                <Text style={s.label}>Healing Abutment Cuff Height (mm)</Text>
                {cuffs.map((val, idx) => {
                  const label = implantPlans[idx]?.position ? `Tooth #${implantPlans[idx].position}` : `Implant ${idx + 1}`;
                  return (
                    <View key={idx} style={s.cuffRow}>
                      <Text style={s.cuffLabel}>{label}</Text>
                      <TextInput
                        style={s.cuffInput}
                        value={val}
                        onChangeText={v => { const u = [...cuffs]; u[idx] = v; setCuffs(u); }}
                        placeholder="mm"
                        keyboardType="decimal-pad"
                        maxLength={5}
                        data-testid={`phase2-edit-cuff-${idx}`}
                      />
                      <Text style={s.cuffUnit}>mm</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {!showProsthesisType && !showCuffs && (
              <Text style={s.helper}>No Phase 2 dynamic fields to edit — Prosthetic Component was not "Immediate Loading Done" or "Healing Abutment Placed".</Text>
            )}
          </ScrollView>

          <View style={s.footer}>
            <TouchableOpacity style={[s.btn, s.btnCancel]} onPress={onClose} disabled={saving}>
              <Text style={s.btnCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.btnSave, saving && { opacity: 0.6 }]} onPress={save} disabled={saving || (!showProsthesisType && !showCuffs)} data-testid="phase2-edit-save-btn">
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnSaveText}>Save &amp; Resolve</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(13,71,161,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '800', color: '#0D47A1' },
  sub: { fontSize: 12, color: '#607D8B', marginTop: 2 },
  noteBox: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#FFFDE7', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#FFE082' },
  noteText: { flex: 1, fontSize: 13, color: '#4E342E', fontStyle: 'italic', lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '700', color: '#1565C0', marginBottom: 8, letterSpacing: 0.2 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E0E7EE', marginBottom: 8 },
  choiceActive: { borderColor: '#1565C0', backgroundColor: '#E3F2FD' },
  choiceText: { flex: 1, fontSize: 13.5, fontWeight: '600', color: '#37474F' },
  input: { borderWidth: 1.5, borderColor: '#D0DCE8', borderRadius: 10, padding: 12, fontSize: 14, backgroundColor: '#F8FAFC', minHeight: 60, textAlignVertical: 'top', marginTop: 4 },
  cuffRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  cuffLabel: { flex: 1, fontSize: 13.5, fontWeight: '600', color: '#37474F' },
  cuffInput: { width: 80, borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 10, padding: 8, fontSize: 15, fontWeight: '700', textAlign: 'center', backgroundColor: '#FFF' },
  cuffUnit: { fontSize: 12, fontWeight: '600', color: '#888' },
  helper: { fontSize: 13, color: '#607D8B', fontStyle: 'italic', paddingVertical: 16, textAlign: 'center' },
  footer: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  btnCancel: { backgroundColor: '#ECEFF1' },
  btnCancelText: { fontSize: 14, fontWeight: '700', color: '#546E7A' },
  btnSave: { backgroundColor: '#1565C0' },
  btnSaveText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
});
