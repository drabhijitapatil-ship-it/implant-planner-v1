// iter-376 — Transfer Approval card (Feb 2026).
// Mirrors the Phase 1-4 approve/reject UX. Renders at the bottom of the case
// detail screen and shows the right buttons for the right actor:
//   • supervisor  during status=pending_supervisor  → Approve / Reject Transfer
//   • incharge    during status=pending_incharge    → Approve / Reject Transfer
//   • recipient   during status=pending_recipient   → Accept / Decline Transfer
//   • initiator   at any pending stage              → Cancel Transfer (secondary)
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, TextInput, ActivityIndicator, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

type Props = {
  procedure: any;
  onChanged?: () => void;
};

const NEEDS_INCHARGE = new Set(['pending_supervisor', 'pending_incharge']);

export default function TransferApprovalCard({ procedure, onChanged }: Props) {
  const { user } = useAuth();
  const tr = procedure?.transfer_request;
  const [submitting, setSubmitting] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const role = user?.role;
  const uid = String(user?.id || user?._id || '');

  const view: 'supervisor' | 'incharge' | 'recipient' | 'initiator' | 'observer' | null = useMemo(() => {
    if (!tr || !uid) return null;
    const supId = String(procedure.supervisor_id || '');
    const incId = String(procedure.implant_incharge_id || '');
    const fromId = String(tr.from_student_id || '');
    const toId = String(tr.to_student_id || '');
    if (role === 'supervisor' && supId === uid && tr.status === 'pending_supervisor') return 'supervisor';
    if (role === 'implant_incharge' && incId === uid && tr.status === 'pending_incharge') return 'incharge';
    if (role === 'student' && uid === toId && tr.status === 'pending_recipient') return 'recipient';
    if (role === 'student' && uid === fromId && NEEDS_INCHARGE.has(tr.status)) return 'initiator';
    // iter-382: faculty / admin always see the transfer as read-only when it
    // is not their turn — the card never silently disappears for them.
    if (role === 'supervisor' || role === 'implant_incharge' || role === 'administrator') return 'observer';
    return null;
  }, [tr, role, uid, procedure]);

  if (!tr || !view) return null;

  const doApprove = async () => {
    setSubmitting(true);
    try {
      const path = view === 'supervisor'
        ? 'transfer/supervisor-approve'
        : view === 'incharge'
          ? 'transfer/incharge-approve'
          : 'transfer/accept';
      await api.post(`/procedures/${procedure.id || procedure._id}/${path}`);
      Alert.alert(
        view === 'recipient' ? 'Transfer Accepted' : 'Transfer Approved',
        view === 'recipient'
          ? 'You are now the owner of this case. Your handoff brief is available in the Transfer Handoff tab.'
          : 'Next in the approval chain has been notified.',
        [{ text: 'OK', onPress: () => onChanged?.() }],
      );
    } catch (e: any) {
      Alert.alert('Action failed', e?.response?.data?.detail || 'Unable to approve transfer.');
    } finally {
      setSubmitting(false);
    }
  };

  const doDecline = async () => {
    setSubmitting(true);
    try {
      await api.post(`/procedures/${procedure.id || procedure._id}/transfer/decline`,
        { reason: rejectReason.trim() });
      setShowRejectModal(false);
      Alert.alert(
        view === 'initiator' ? 'Transfer Cancelled' : 'Transfer Rejected',
        'All parties have been notified.',
        [{ text: 'OK', onPress: () => onChanged?.() }],
      );
    } catch (e: any) {
      Alert.alert('Action failed', e?.response?.data?.detail || 'Unable to reject transfer.');
    } finally {
      setSubmitting(false);
    }
  };

  const observerStage = tr.status === 'pending_supervisor'
    ? `Awaiting Supervisor approval (${procedure.supervisor_name || 'assigned supervisor'})`
    : tr.status === 'pending_incharge'
      ? `Awaiting Implant In-Charge approval (${procedure.implant_incharge_name || 'assigned In-Charge'})`
      : 'Awaiting recipient acceptance';

  const stageLabel = {
    supervisor: 'Awaiting your Supervisor approval',
    incharge: 'Awaiting your Implant In-Charge approval',
    recipient: 'Awaiting your acceptance',
    initiator: `Transfer in progress → ${tr.status.replace('pending_', '').replace('_', ' ')}`,
    observer: observerStage,
  }[view];

  const primaryTxt = view === 'recipient' ? 'Accept Transfer' : 'Approve Transfer';
  const secondaryTxt = view === 'recipient'
    ? 'Decline Transfer'
    : view === 'initiator'
      ? 'Cancel Transfer'
      : 'Reject Transfer';

  return (
    <View style={s.card} data-testid="transfer-approval-card" testID="transfer-approval-card">
      <View style={s.headerRow}>
        <Ionicons name="swap-horizontal" size={18} color="#0D47A1" />
        <Text style={s.title}>Case Transfer</Text>
        <View style={s.stagePill}>
          <Text style={s.stagePillTxt}>{stageLabel}</Text>
        </View>
      </View>

      <View style={s.factGrid}>
        <View style={s.factRow}>
          <Text style={s.factLabel}>From</Text>
          <Text style={s.factValue}>{tr.from_student_name}</Text>
        </View>
        <View style={s.factRow}>
          <Text style={s.factLabel}>To</Text>
          <Text style={s.factValue}>{tr.to_student_name}</Text>
        </View>
        <View style={s.factRow}>
          <Text style={s.factLabel}>At phase</Text>
          <Text style={s.factValue}>Phase {tr.at_phase} (recipient continues at Phase {Math.min((tr.at_phase || 0) + 1, 4)})</Text>
        </View>
        {tr.reason ? (
          <View style={[s.factRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 4 }]}>
            <Text style={s.factLabel}>Reason</Text>
            <Text style={s.reasonBox}>{tr.reason}</Text>
          </View>
        ) : null}
        {tr.soft_limit_exceeded ? (
          <View style={s.warnBox}>
            <Ionicons name="warning-outline" size={14} color="#F57C00" />
            <Text style={s.warnTxt}>This case has been transferred 3+ times already. Please confirm this transfer is academically justified.</Text>
          </View>
        ) : null}
      </View>

      {view === 'observer' && (
        <View style={s.observerNote} data-testid="transfer-observer-note" testID="transfer-observer-note">
          <Ionicons name="information-circle-outline" size={15} color="#546E7A" />
          <Text style={s.observerNoteTxt}>
            {tr.status === 'pending_supervisor' && role === 'supervisor'
              ? 'This transfer is assigned to a different supervisor for approval.'
              : tr.status === 'pending_incharge' && role === 'implant_incharge'
                ? 'This transfer is assigned to a different Implant In-Charge for approval.'
                : 'No action needed from you at this stage — it is not your turn in the approval chain.'}
          </Text>
        </View>
      )}

      {view !== 'initiator' && view !== 'observer' && (
        <View style={s.btnRow}>
          <Pressable
            style={[s.btn, s.btnPrimary, submitting && s.btnDisabled]}
            onPress={doApprove}
            disabled={submitting}
            data-testid={view === 'recipient' ? 'transfer-accept-btn' : 'transfer-approve-btn'}
            testID={view === 'recipient' ? 'transfer-accept-btn' : 'transfer-approve-btn'}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : (<><Ionicons name="checkmark-circle" size={18} color="#fff" /><Text style={s.btnPrimaryTxt}>{primaryTxt}</Text></>)}
          </Pressable>
          <Pressable
            style={[s.btn, s.btnDanger, submitting && s.btnDisabled]}
            onPress={() => setShowRejectModal(true)}
            disabled={submitting}
            data-testid={view === 'recipient' ? 'transfer-decline-btn' : 'transfer-reject-btn'}
            testID={view === 'recipient' ? 'transfer-decline-btn' : 'transfer-reject-btn'}
          >
            <Ionicons name="close-circle" size={18} color="#fff" />
            <Text style={s.btnDangerTxt}>{secondaryTxt}</Text>
          </Pressable>
        </View>
      )}

      {view === 'initiator' && (
        <Pressable
          style={[s.btn, s.btnDanger, s.btnFull, submitting && s.btnDisabled]}
          onPress={() => setShowRejectModal(true)}
          disabled={submitting}
          data-testid="transfer-cancel-btn"
          testID="transfer-cancel-btn"
        >
          <Ionicons name="close-circle" size={18} color="#fff" />
          <Text style={s.btnDangerTxt}>Cancel Transfer</Text>
        </Pressable>
      )}

      <Modal transparent animationType="fade" visible={showRejectModal} onRequestClose={() => setShowRejectModal(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>{secondaryTxt}</Text>
            <Text style={s.modalHelp}>Optional — a short reason helps the initiator understand the decision.</Text>
            <TextInput
              multiline
              placeholder="e.g. Student rotation still active; case must stay with current owner."
              placeholderTextColor="#90A4AE"
              style={s.reasonInput}
              value={rejectReason}
              onChangeText={setRejectReason}
              data-testid="transfer-reject-reason-input"
              testID="transfer-reject-reason-input"
            />
            <View style={s.btnRow}>
              <Pressable
                style={[s.btn, s.btnGhost]}
                onPress={() => setShowRejectModal(false)}
                disabled={submitting}
              >
                <Text style={s.btnGhostTxt}>Back</Text>
              </Pressable>
              <Pressable
                style={[s.btn, s.btnDanger, submitting && s.btnDisabled]}
                onPress={doDecline}
                disabled={submitting}
                data-testid="transfer-reject-confirm-btn"
                testID="transfer-reject-confirm-btn"
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnDangerTxt}>Confirm {secondaryTxt}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginTop: 16,
    borderWidth: 1, borderColor: '#BBDEFB',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  title: { fontSize: 16, fontWeight: '800', color: '#0D47A1', flexGrow: 1 },
  stagePill: {
    backgroundColor: '#E3F2FD', borderColor: '#90CAF9', borderWidth: 1,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2,
  },
  stagePillTxt: { fontSize: 11, color: '#0D47A1', fontWeight: '700' },
  factGrid: { marginTop: 10, gap: 8 },
  factRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  factLabel: { fontSize: 12, color: '#546E7A', fontWeight: '700' },
  factValue: { fontSize: 13, color: '#0D47A1', fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
  reasonBox: {
    backgroundColor: '#F5F9FF', color: '#37474F', fontSize: 12,
    padding: 8, borderRadius: 8, lineHeight: 17,
  },
  warnBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: '#FFF3E0', borderColor: '#FFE0B2', borderWidth: 1,
    borderRadius: 8, padding: 8, marginTop: 4,
  },
  warnTxt: { fontSize: 12, color: '#E65100', flex: 1 },
  observerNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 12,
    backgroundColor: '#F5F7F9', borderRadius: 8, padding: 10,
  },
  observerNoteTxt: { fontSize: 12, color: '#546E7A', flex: 1, lineHeight: 17 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: {
    flex: 1, height: 44, borderRadius: 10, alignItems: 'center',
    justifyContent: 'center', flexDirection: 'row', gap: 6,
  },
  btnFull: { flex: 0, marginTop: 14 },
  btnPrimary: { backgroundColor: '#2E7D32' },
  btnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnDanger: { backgroundColor: '#C62828' },
  btnDangerTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnGhost: { backgroundColor: '#ECEFF1' },
  btnGhostTxt: { color: '#37474F', fontWeight: '700', fontSize: 14 },
  btnDisabled: { opacity: 0.6 },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(15,27,45,0.55)',
    justifyContent: 'center', padding: 20,
  },
  modalCard: { backgroundColor: '#fff', borderRadius: 14, padding: 18, gap: 10 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#C62828' },
  modalHelp: { fontSize: 12, color: '#546E7A', lineHeight: 17 },
  reasonInput: {
    borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10, padding: 10,
    fontSize: 13, color: '#263238', minHeight: 88, textAlignVertical: 'top',
  },
});
