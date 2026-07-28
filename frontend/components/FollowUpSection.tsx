/**
 * iter-388 — Phase 5: Follow-up & Maintenance section on the case detail.
 * Renders only for completed cases: start-next-appointment button (owner),
 * approval actions (assigned faculty, combined rule when sup == in-charge)
 * and expandable read-only tabs for every appointment.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Alert, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
const nextLabel = (n: number) => `${ORDINALS[n - 1] || `${n}th`} Follow up Appointment`;

const STATUS_META: Record<string, { txt: string; bg: string; fg: string }> = {
  pending_supervisor: { txt: 'Awaiting Supervisor', bg: '#FFF3E0', fg: '#E65100' },
  pending_incharge: { txt: 'Awaiting In-Charge', bg: '#FFF3E0', fg: '#E65100' },
  approved: { txt: 'Approved', bg: '#E8F5E9', fg: '#1B5E20' },
  rejected: { txt: 'Returned for Revision', bg: '#FFEBEE', fg: '#B71C1C' },
};

const Row = ({ label, value }: { label: string; value?: any }) => {
  if (value === undefined || value === null || value === '') return null;
  return (
    <View style={st.row}>
      <Text style={st.rowLabel}>{label}</Text>
      <Text style={st.rowValue}>{String(value)}</Text>
    </View>
  );
};

function FollowUpDetails({ fu }: { fu: any }) {
  const g = fu.general || {}; const h = fu.oral_hygiene || {}; const po = fu.prosthesis_occlusion || {};
  const stt = fu.soft_tissue || {}; const od = fu.overdenture;
  const fmt = (o: any) => o?.status ? `${o.status}${o.details ? ` — ${o.details}` : ''}` : undefined;
  return (
    <View style={{ marginTop: 8 }}>
      <Row label="Date" value={fu.date} />
      {fu.preexisting_condition_review?.status ? <Row label="Pre-existing condition" value={fmt(fu.preexisting_condition_review)} /> : null}
      <Row label="New systemic condition" value={fu.new_systemic_condition?.answer ? `${fu.new_systemic_condition.answer}${fu.new_systemic_condition.details ? ` — ${fu.new_systemic_condition.details}` : ''}` : undefined} />
      {Object.entries(fu.survival_review || {}).map(([tooth, v]: any) => (
        <Row key={tooth} label={`Implant ${tooth} survival`} value={`${v.status}${v.details ? ` — ${v.details}` : ''}`} />
      ))}
      <Row label="Comfort" value={g.comfort === 'No' ? `No — ${g.comfort_details}` : g.comfort} />
      <Row label="Pain" value={g.pain === 'Yes' ? `Yes — ${g.pain_details}` : g.pain} />
      <Row label="Chewing ability" value={g.chewing_ability} />
      <Row label="Speech" value={g.speech} />
      <Row label="Esthetics" value={g.esthetics} />
      <Row label="Lindquist Plaque index" value={h.plaque_index} />
      <Row label="Hygiene — prosthesis" value={h.hygiene_prosthesis} />
      <Row label="Hygiene — implant components" value={h.hygiene_components} />
      <Row label="Access for cleaning" value={h.access_cleaning} />
      {Object.entries(fu.probing_depths || {}).map(([tooth, v]: any) => (
        <Row key={`pd-${tooth}`} label={`Probing ${tooth} (KGW/V/D/M/L mm)`}
          value={`${v.kgw || '—'} / ${v.vestibular || '—'} / ${v.distal || '—'} / ${v.mesial || '—'} / ${v.lingual || '—'}`} />
      ))}
      <Row label="Bleeding on probing" value={fmt(stt.bleeding_on_probing)} />
      <Row label="Soft tissue inflammation" value={fmt(stt.soft_tissue_inflammation)} />
      <Row label="Ulceration" value={fmt(stt.ulceration)} />
      <Row label="Swelling" value={fmt(stt.swelling)} />
      <Row label="Implant mobility" value={po.implant_mobility} />
      <Row label="Prosthesis stability" value={po.prosthesis_stability === 'Mobile' ? `Mobile — ${po.prosthesis_stability_details}` : po.prosthesis_stability} />
      <Row label="Prosthesis integrity" value={po.prosthesis_integrity} />
      <Row label="Component integrity" value={po.component_integrity} />
      <Row label="Occlusion" value={po.occlusion} />
      {od ? (<>
        <Row label="Pressure areas (overdenture)" value={od.pressure_areas} />
        <Row label="Occlusion / balanced contact" value={od.occlusion_balanced} />
        <Row label="Attachment integrity" value={od.attachment_integrity} />
        <Row label="Denture hygiene" value={od.denture_hygiene} />
      </>) : null}
      <Row label="Patient feedback" value={fu.patient_feedback} />
      <Row label="Radiographs" value={fu.opg_upload ? 'OPG uploaded' : Object.keys(fu.iopa_uploads || {}).length ? `IOPA × ${Object.keys(fu.iopa_uploads || {}).length}` : undefined} />
      {(fu.faculty_comments || []).map((c: any, i: number) => (
        <Row key={i} label={`${c.role === 'supervisor' ? 'Supervisor' : 'In-Charge'} remark`} value={c.comment} />
      ))}
      {fu.rejection_reason ? <Row label="Rejection reason" value={`${fu.rejection_reason} (${fu.rejected_by})`} /> : null}
    </View>
  );
}

export default function FollowUpSection({ procedure, onChanged }: { procedure: any; onChanged: () => void }) {
  const { user } = useAuth();
  const router = useRouter();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [acting, setActing] = useState(false);
  const [rejectFor, setRejectFor] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  if (procedure?.status !== 'completed') return null;
  const followups: any[] = procedure.followups || [];
  const uid = String(user?.id || (user as any)?._id || '');
  const role = user?.role;
  const isOwner = (role === 'student' && String(procedure.student_id) === uid) || String(procedure.created_by_id) === uid;
  const isSup = String(procedure.supervisor_id) === uid;
  const isInc = String(procedure.implant_incharge_id) === uid;
  const samePerson = procedure.supervisor_id && procedure.supervisor_id === procedure.implant_incharge_id;

  const last = followups[followups.length - 1];
  const canStartNext = isOwner && (!last || last.status === 'approved');
  const canResubmit = isOwner && last?.status === 'rejected';
  const nextNum = last ? (last.status === 'rejected' ? last.number : last.number + 1) : 1;

  const canApprove = (fu: any) => {
    if (fu.status === 'pending_supervisor') return (role === 'supervisor' && isSup) || (samePerson && isInc && role === 'implant_incharge') || (samePerson && isSup && role === 'supervisor');
    if (fu.status === 'pending_incharge') return (role === 'implant_incharge' && isInc) || (samePerson && isSup && role === 'supervisor');
    return false;
  };

  const doApprove = async (fu: any) => {
    setActing(true);
    try {
      const res = await api.post(`/procedures/${procedure.id || procedure._id}/followups/${fu.number}/approve`, { action: 'approve', comment: '' });
      Alert.alert('Approved', res.data?.message || 'Follow-up approved.', [{ text: 'OK', onPress: onChanged }]);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Approval failed');
    } finally { setActing(false); }
  };

  const doReject = async () => {
    if (!rejectReason.trim()) { Alert.alert('Reason required', 'Please provide a reason for returning this follow-up.'); return; }
    setActing(true);
    try {
      await api.post(`/procedures/${procedure.id || procedure._id}/followups/${rejectFor}/approve`, { action: 'reject', rejection_reason: rejectReason.trim() });
      setRejectFor(null); setRejectReason('');
      Alert.alert('Returned', 'Follow-up returned to the student for revision.', [{ text: 'OK', onPress: onChanged }]);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Rejection failed');
    } finally { setActing(false); }
  };

  return (
    <View style={st.section} data-testid="followup-section" testID="followup-section">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Ionicons name="repeat" size={20} color="#00695C" />
        <Text style={st.title}>Phase 5 — Follow-up &amp; Maintenance</Text>
      </View>

      {followups.length === 0 && (
        <Text style={st.emptyTxt}>No follow-up appointments recorded yet. Every appointment starts with an Implant Survival Review.</Text>
      )}

      {followups.map(fu => {
        const meta = STATUS_META[fu.status] || STATUS_META.approved;
        const open = expanded === fu.number;
        return (
          <View key={fu.number} style={st.fuCard} data-testid={`followup-card-${fu.number}`}>
            <TouchableOpacity style={st.fuHeader} onPress={() => setExpanded(open ? null : fu.number)} testID={`followup-toggle-${fu.number}`}>
              <Text style={st.fuLabel}>{fu.label}</Text>
              <View style={[st.pill, { backgroundColor: meta.bg }]}>
                <Text style={[st.pillTxt, { color: meta.fg }]}>{meta.txt}</Text>
              </View>
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#90A4AE" />
            </TouchableOpacity>
            {open && <FollowUpDetails fu={fu} />}
            {canApprove(fu) && (
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <TouchableOpacity style={[st.btn, { backgroundColor: '#1B5E20' }]} disabled={acting} onPress={() => doApprove(fu)} testID={`followup-approve-${fu.number}`}>
                  {acting ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={st.btnTxt}>{samePerson ? 'Approve (Supervisor & In-Charge)' : 'Approve'}</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[st.btn, { backgroundColor: '#B71C1C' }]} disabled={acting} onPress={() => setRejectFor(fu.number)} testID={`followup-reject-${fu.number}`}>
                  <Text style={st.btnTxt}>Reject</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}

      {(canStartNext || canResubmit) && (
        <TouchableOpacity
          style={st.startBtn}
          onPress={() => router.push(`/procedures/followup/${procedure.id || procedure._id}?n=${nextNum}`)}
          data-testid="start-followup-btn" testID="start-followup-btn"
        >
          <Ionicons name={canResubmit ? 'refresh' : 'add-circle'} size={18} color="#FFF" />
          <Text style={st.btnTxt}>
            {canResubmit ? `Revise & Resubmit ${nextLabel(nextNum)}` : `Start ${nextLabel(nextNum)}`}
          </Text>
        </TouchableOpacity>
      )}

      <Modal visible={rejectFor !== null} transparent animationType="fade" onRequestClose={() => setRejectFor(null)}>
        <View style={st.modalOverlay}>
          <View style={st.modalCard}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#1A1A2E', marginBottom: 10 }}>Return Follow-up for Revision</Text>
            <TextInput style={st.reasonInput} multiline placeholder="Reason for rejection..."
              value={rejectReason} onChangeText={setRejectReason} testID="followup-reject-reason" />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity style={[st.btn, { backgroundColor: '#78909C' }]} onPress={() => setRejectFor(null)}>
                <Text style={st.btnTxt}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.btn, { backgroundColor: '#B71C1C' }]} disabled={acting} onPress={doReject} testID="followup-reject-confirm">
                {acting ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={st.btnTxt}>Confirm Reject</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  section: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginTop: 16, borderWidth: 1, borderColor: '#B2DFDB' },
  title: { fontSize: 16, fontWeight: '700', color: '#00695C', flex: 1 },
  emptyTxt: { fontSize: 12.5, color: '#78909C', fontStyle: 'italic', marginBottom: 10 },
  fuCard: { borderWidth: 1, borderColor: '#E0E7EE', borderRadius: 10, padding: 12, marginBottom: 10, backgroundColor: '#FAFCFD' },
  fuHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fuLabel: { flex: 1, fontSize: 13.5, fontWeight: '700', color: '#263238' },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  pillTxt: { fontSize: 10.5, fontWeight: '800' },
  row: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F0F4F7', gap: 8 },
  rowLabel: { width: 150, fontSize: 11.5, color: '#78909C', fontWeight: '600' },
  rowValue: { flex: 1, fontSize: 12, color: '#263238' },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  btnTxt: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  startBtn: { flexDirection: 'row', gap: 8, backgroundColor: '#00695C', borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 16 },
  reasonInput: { borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10, padding: 10, fontSize: 13, color: '#263238', minHeight: 88, textAlignVertical: 'top' },
});
