/**
 * AdvancedClinicalCard.tsx — iter-Jun-2026 (v13, Chunk B, Ask 3)
 *
 * Standalone Advanced Clinical (Zygoma) card for the Case Details page.
 * Not gated by Phase 2 approval — users can fill it any time. Has its own
 * "Send Advanced Clinical for Approval" workflow: the button becomes active
 * once Day 30 is filled; supervisors/in-charge can then approve the block
 * independently of Phase 2/Phase 5 gates.
 *
 * Renders only for Zygoma / Pterygoid procedure types (auto-hide otherwise).
 */
import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import api from '../utils/api';
import { calculateOris } from '../src/utils/orisCalculator';

interface AdvancedClinical {
  zaga_confirmed_right?: string;
  zaga_confirmed_left?: string;
  no_sinus_disease?: boolean;
  no_oro_antral_communication?: boolean;
  screw_retained_confirmed?: boolean;
  passive_fit_verified?: boolean;
  no_radiographic_peri_implant_lesion?: boolean;
  immediate_loading_day0_at?: string;
  immediate_loading_day7_at?: string;
  immediate_loading_day30_at?: string;
  oris_success_code?: number;
  supervisor_cosign_notes?: string;
  approval_status?: 'draft' | 'pending' | 'approved';
  approved_by?: string;
  approved_at?: string;
}

interface Props {
  procedure: any;
  onChanged?: () => void;
  currentUserRole?: string;
}

const AdvancedClinicalCard: React.FC<Props> = ({ procedure, onChanged, currentUserRole }) => {
  const proctype = String(procedure?.implant_procedure_type || '');
  const isZyg = /zygoma|pterygoid/i.test(proctype);
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<AdvancedClinical>({});
  const [pickerFor, setPickerFor] = useState<'day0' | 'day7' | 'day30' | null>(null);
  const [saving, setSaving] = useState(false);

  // Hydrate from procedure data. Re-runs when procedure changes so the
  // approval_status pill reflects the backend after `onChanged`/refresh.
  useEffect(() => {
    const p2 = procedure?.phase2_data || {};
    setState(p2.advanced_clinical || {});
  }, [procedure]);

  const plans = Array.isArray(procedure?.implant_plans) ? procedure.implant_plans : [];
  const zygPositions = plans.filter((p: any) => (p?.implant_type === 'zygoma')).map((p: any) => p.position);
  const minTorque = useMemo(() => {
    const perImplant = (procedure?.phase2_data?.per_implant) || {};
    const torques = zygPositions.map((pos: string) => Number(perImplant[pos]?.torque_ncm)).filter((v: number) => !Number.isNaN(v) && v > 0);
    return torques.length ? Math.min(...torques) : undefined;
  }, [zygPositions, procedure?.phase2_data?.per_implant]);
  const oris = useMemo(() => calculateOris({
    no_sinus_disease: state.no_sinus_disease,
    no_oro_antral_communication: state.no_oro_antral_communication,
    screw_retained_confirmed: state.screw_retained_confirmed,
    passive_fit_verified: state.passive_fit_verified,
    no_radiographic_peri_implant_lesion: state.no_radiographic_peri_implant_lesion,
    insertion_torque_min_ncm: minTorque,
    immediate_loading_day0_completed: !!state.immediate_loading_day0_at,
  }), [state, minTorque]);

  if (!isZyg) return null;

  const set = (k: keyof AdvancedClinical, v: any) => setState(prev => ({ ...prev, [k]: v }));
  const toggle = (k: keyof AdvancedClinical) => set(k, !state[k]);

  const day30Filled = !!state.immediate_loading_day30_at;
  const approvalStatus = state.approval_status || 'draft';
  const canApprove = ['supervisor', 'implant_incharge', 'administrator'].includes(String(currentUserRole || '').toLowerCase()) && approvalStatus === 'pending';
  const readOnly = approvalStatus === 'approved';

  const procId = String(procedure?.id || procedure?._id || '');

  const save = async (patch: Partial<AdvancedClinical>) => {
    setSaving(true);
    try {
      const next = { ...state, ...patch };
      setState(next);
      await api.patch(`/procedures/${procId}/tabbed-phase-data/2`, {
        advanced_clinical: { ...patch, oris_success_code: oris.code },
      });
      onChanged && onChanged();
    } catch (e: any) {
      Alert.alert('Save failed', e?.response?.data?.detail || e?.message || 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const sendForApproval = async () => {
    // iter-Jun-2026 (v13, Chunk B, Ask 3): Allow partial submission with
    // warning per user's UX choice — if Day 30 is not yet filled, we prompt
    // for confirmation instead of blocking the button entirely.
    const proceed = async () => {
      setSaving(true);
      try {
        await api.post(`/procedures/${procId}/advanced-clinical/send-for-approval`, {});
        Alert.alert('Sent', 'Advanced Clinical sent for approval.');
        onChanged && onChanged();
        setState(prev => ({ ...prev, approval_status: 'pending' }));
      } catch (e: any) {
        Alert.alert('Failed', e?.response?.data?.detail || e?.message || 'Unknown error');
      } finally {
        setSaving(false);
      }
    };
    if (!day30Filled) {
      Alert.alert(
        'Day 30 not yet filled',
        'You have not yet recorded the 30-day follow-up. Approvers may reject this submission. Do you still want to send it for approval now?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Send Anyway', style: 'destructive', onPress: proceed },
        ],
      );
      return;
    }
    await proceed();
  };

  const approve = async () => {
    setSaving(true);
    try {
      await api.post(`/procedures/${procId}/advanced-clinical/approve`, {});
      Alert.alert('Approved', 'Advanced Clinical approved.');
      onChanged && onChanged();
      setState(prev => ({ ...prev, approval_status: 'approved' }));
    } catch (e: any) {
      Alert.alert('Failed', e?.response?.data?.detail || e?.message || 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const orisColor = oris.code >= 3 ? '#2E7D32' : oris.code === 2 ? '#F57F17' : '#C62828';
  const statusColor = approvalStatus === 'approved' ? '#2E7D32' : approvalStatus === 'pending' ? '#F57F17' : '#78909C';

  return (
    <View style={s.card} testID="zyg-advanced-clinical-card">
      <TouchableOpacity style={s.header} onPress={() => setExpanded(v => !v)} activeOpacity={0.75}>
        <View style={s.headerLeft}>
          <View style={s.icon}><Ionicons name="medkit-outline" size={14} color="#FFF" /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Advanced Clinical (Zygoma)</Text>
            <Text style={s.sub}>ZAGA · ORIS · Immediate Loading · Approval</Text>
          </View>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color="#5E35B1" />
      </TouchableOpacity>

      {/* Meta row — ORIS pill + Status pill BELOW header so they no longer overlap */}
      {expanded && (
        <View style={s.metaRow}>
          <View style={[s.metaPill, { backgroundColor: orisColor }]} testID="oris-pill">
            <Text style={s.metaPillText}>ORIS {oris.code}/4 · {oris.label}</Text>
          </View>
          <View style={[s.metaPill, { backgroundColor: statusColor }]} testID="approval-status-pill">
            <Text style={s.metaPillText}>{approvalStatus.toUpperCase()}</Text>
          </View>
        </View>
      )}

      {expanded && (
        <View style={s.body}>
          {/* ZAGA */}
          <View style={s.row2}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>ZAGA Right</Text>
              <TextInput style={s.input} value={state.zaga_confirmed_right || ''} editable={!readOnly}
                onChangeText={v => set('zaga_confirmed_right', v)} placeholder="0-4" placeholderTextColor="#B0BEC5" testID="adv-zaga-right" />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={s.label}>ZAGA Left</Text>
              <TextInput style={s.input} value={state.zaga_confirmed_left || ''} editable={!readOnly}
                onChangeText={v => set('zaga_confirmed_left', v)} placeholder="0-4" placeholderTextColor="#B0BEC5" testID="adv-zaga-left" />
            </View>
          </View>

          {/* ORIS toggles */}
          <Text style={[s.label, { marginTop: 10 }]}>ORIS Success Criteria</Text>
          {[
            ['no_sinus_disease', 'D1 · No sinus disease'],
            ['no_oro_antral_communication', 'D1 · No oro-antral communication'],
            ['screw_retained_confirmed', 'D2 · Screw-retained prosthesis'],
            ['passive_fit_verified', 'D2 · Passive fit verified'],
            ['no_radiographic_peri_implant_lesion', 'D3 · No peri-implant lesion (radiograph)'],
          ].map(([k, label]) => (
            <TouchableOpacity key={k} style={s.toggleRow} disabled={readOnly}
              onPress={() => toggle(k as keyof AdvancedClinical)}
              testID={`adv-toggle-${k}`}>
              <Ionicons name={(state as any)[k] ? 'checkbox' : 'square-outline'} size={20}
                color={(state as any)[k] ? '#2E7D32' : '#78909C'} />
              <Text style={s.toggleText}>{label}</Text>
            </TouchableOpacity>
          ))}

          {/* Immediate Loading — 3 centred calendar tiles */}
          <Text style={[s.label, { marginTop: 12 }]}>Immediate Loading Protocol</Text>
          <View style={s.dayRow}>
            {(['day0', 'day7', 'day30'] as const).map(day => {
              const key = `immediate_loading_${day}_at` as keyof AdvancedClinical;
              const dateStr = String(state[key] || '');
              return (
                <TouchableOpacity key={day} style={s.dayTile}
                  onPress={() => !readOnly && setPickerFor(day)}
                  testID={`adv-day-${day}`}>
                  <Text style={s.dayLabel}>{day === 'day0' ? 'Day 0' : day === 'day7' ? 'Day 7' : 'Day 30'}</Text>
                  <Ionicons name="calendar-outline" size={24} color={dateStr ? '#5E35B1' : '#B0BEC5'} />
                  <Text style={[s.dayDate, { color: dateStr ? '#37474F' : '#B0BEC5' }]}>{dateStr || 'Pick date'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Approval workflow buttons */}
          <View style={s.actionsRow}>
            {approvalStatus === 'draft' && (
              <TouchableOpacity
                style={s.actionBtn}
                disabled={saving}
                onPress={sendForApproval}
                testID="adv-send-approval">
                {saving ? <ActivityIndicator color="#FFF" size="small" /> : (
                  <>
                    <Ionicons name="paper-plane-outline" size={14} color="#FFF" />
                    <Text style={s.actionBtnText}>Send Advanced Clinical for Approval</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            {canApprove && (
              <TouchableOpacity style={s.approveBtn} onPress={approve} disabled={saving} testID="adv-approve">
                {saving ? <ActivityIndicator color="#FFF" size="small" /> : (
                  <>
                    <Ionicons name="checkmark-done-outline" size={14} color="#FFF" />
                    <Text style={s.actionBtnText}>Approve Advanced Clinical</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
          {!day30Filled && approvalStatus === 'draft' && (
            <Text style={s.hint}>Day 30 follow-up not yet recorded — you can still send for approval, but reviewers may ask you to complete it first.</Text>
          )}
        </View>
      )}

      {/* Calendar Modal */}
      <Modal visible={pickerFor !== null} transparent animationType="fade" onRequestClose={() => setPickerFor(null)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard} testID="adv-calendar-modal">
            <Text style={s.modalTitle}>Pick date — {pickerFor === 'day0' ? 'Day 0' : pickerFor === 'day7' ? 'Day 7' : 'Day 30'}</Text>
            <Calendar
              onDayPress={(day: any) => {
                if (!pickerFor) return;
                const k = `immediate_loading_${pickerFor}_at` as keyof AdvancedClinical;
                setPickerFor(null);
                save({ [k]: day.dateString } as any);
              }}
              theme={{ selectedDayBackgroundColor: '#5E35B1', arrowColor: '#5E35B1', todayTextColor: '#5E35B1' }}
            />
            <TouchableOpacity style={s.modalCancel} onPress={() => setPickerFor(null)}>
              <Text style={s.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const s = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 12, marginHorizontal: 12, marginTop: 8, padding: 12, borderLeftWidth: 4, borderLeftColor: '#5E35B1', borderWidth: 1, borderColor: '#EDE7F6', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  icon: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#5E35B1', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '800', color: '#4527A0' },
  sub: { fontSize: 11, color: '#7E57C2', marginTop: 1 },
  metaRow: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  metaPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  metaPillText: { color: '#FFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
  body: { marginTop: 10 },
  row2: { flexDirection: 'row', marginBottom: 6 },
  label: { fontSize: 12, fontWeight: '700', color: '#455A64', marginBottom: 4, marginTop: 4 },
  input: { backgroundColor: '#F5F7FA', borderRadius: 6, borderWidth: 1, borderColor: '#CFD8DC', paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: '#263238' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  toggleText: { fontSize: 12, color: '#37474F' },
  dayRow: { flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'stretch' },
  dayTile: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#D1C4E9', backgroundColor: '#F3E5F5', gap: 4 },
  dayLabel: { fontSize: 11, fontWeight: '800', color: '#4527A0' },
  dayDate: { fontSize: 10, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8, backgroundColor: '#5E35B1' },
  actionBtnDisabled: { backgroundColor: '#B0BEC5' },
  approveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8, backgroundColor: '#2E7D32' },
  actionBtnText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  hint: { fontSize: 10, color: '#78909C', fontStyle: 'italic', marginTop: 6, textAlign: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 12 },
  modalCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 12, width: '100%', maxWidth: 380 },
  modalTitle: { fontSize: 13, fontWeight: '800', color: '#4527A0', marginBottom: 8, textAlign: 'center' },
  modalCancel: { paddingVertical: 10, marginTop: 6, alignItems: 'center' },
  modalCancelText: { color: '#5E35B1', fontWeight: '700' },
});

export default AdvancedClinicalCard;
