/**
 * EndTreatmentPendingBanner — shown on the Case Detail page while an End
 * Implant Treatment request is awaiting the next role-based approval
 * (student → supervisor → in-charge). The banner:
 *   • Displays initiator + timeline
 *   • Shows Approve / Reject buttons ONLY to the currently expected
 *     approver (assigned supervisor for `pending_end_treatment_supervisor`,
 *     assigned in-charge for `pending_end_treatment_incharge`).
 *   • Rejection requires a mandatory comment (matches backend contract).
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, Pressable, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

type Props = {
  procedure: any;
  currentUser: any;
  onResolved: () => void;
};

const fmtDate = (v: any): string => {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return String(v); }
};

export default function EndTreatmentPendingBanner({ procedure, currentUser, onResolved }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [rejectModal, setRejectModal] = useState<{ open: boolean; comment: string }>({ open: false, comment: '' });
  const pending = procedure?.pending_end_treatment || {};

  const status = procedure?.status;
  const uid = String(currentUser?.id || currentUser?._id || '');
  const supervisorId = String(procedure?.supervisor_id || '');
  const inchargeId = String(procedure?.implant_incharge_id || '');
  const isSupervisor = uid === supervisorId;
  const isIncharge = uid === inchargeId;

  // Only the CURRENTLY expected approver can act.
  const canAct = useMemo(() => {
    if (status === 'pending_end_treatment_supervisor') return isSupervisor;
    if (status === 'pending_end_treatment_incharge') return isIncharge;
    return false;
  }, [status, isSupervisor, isIncharge]);

  const awaitingText = status === 'pending_end_treatment_supervisor'
    ? `Awaiting ${procedure?.supervisor_name || 'Supervisor'} approval`
    : `Awaiting ${procedure?.implant_incharge_name || 'Implant In-Charge'} approval`;

  const handleApprove = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await api.post(`/procedures/${procedure?.id || procedure?._id}/end-treatment/approve`, { action: 'approve' });
      onResolved();
    } catch (e: any) {
      Alert.alert('Approval failed', e?.response?.data?.detail || 'Please try again');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (submitting) return;
    if (!rejectModal.comment.trim()) {
      Alert.alert('Reason required', 'Please provide a reason for rejecting the end-treatment request.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/procedures/${procedure?.id || procedure?._id}/end-treatment/approve`, {
        action: 'reject',
        comment: rejectModal.comment.trim(),
      });
      setRejectModal({ open: false, comment: '' });
      onResolved();
    } catch (e: any) {
      Alert.alert('Rejection failed', e?.response?.data?.detail || 'Please try again');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <View style={s.banner} testID="end-treatment-pending-banner">
        <View style={s.topRow}>
          <View style={s.iconWrap}>
            <Ionicons name="hourglass-outline" size={22} color="#FFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>End Implant Treatment · Pending Approval</Text>
            <Text style={s.subtitle}>{awaitingText}</Text>
          </View>
        </View>

        <View style={s.metaBox}>
          <MetaRow k="Initiated by" v={`${pending.initiated_by_name || '—'} (${pending.initiated_by_role || '—'})`} />
          <MetaRow k="Initiated on" v={fmtDate(pending.initiated_at)} />
          <MetaRow k="Decision by" v={pending.decision_maker || '—'} />
          <MetaRow k="Reason" v={pending.reason || '—'} multiline />
          {pending.supervisor_approved_at && (
            <MetaRow k="Supervisor OK" v={`${pending.supervisor_approved_by || '—'} · ${fmtDate(pending.supervisor_approved_at)}`} />
          )}
        </View>

        {canAct && (
          <View style={s.actions}>
            <TouchableOpacity
              style={[s.actionBtn, s.rejectBtn]}
              onPress={() => setRejectModal({ open: true, comment: '' })}
              disabled={submitting}
              testID="end-treatment-reject-btn"
              // @ts-ignore
              data-testid="end-treatment-reject-btn"
            >
              <Ionicons name="close-outline" size={16} color="#C62828" />
              <Text style={[s.actionText, { color: '#C62828' }]}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, s.approveBtn]}
              onPress={handleApprove}
              disabled={submitting}
              testID="end-treatment-approve-btn"
              // @ts-ignore
              data-testid="end-treatment-approve-btn"
            >
              {submitting ? <ActivityIndicator color="#FFF" size="small" /> : (
                <>
                  <Ionicons name="checkmark" size={16} color="#FFF" />
                  <Text style={[s.actionText, { color: '#FFF' }]}>Approve</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
        {!canAct && (
          <Text style={s.readOnly}>
            You do not have approval rights on this request.
          </Text>
        )}
        <Text style={s.foot}>Case is frozen until this request is resolved. No Phase 3 / edits are permitted.</Text>
      </View>

      {/* Reject modal */}
      <Modal transparent visible={rejectModal.open} animationType="fade" onRequestClose={() => setRejectModal({ open: false, comment: '' })}>
        <Pressable style={s.backdrop} onPress={() => setRejectModal({ open: false, comment: '' })}>
          <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Reject End Treatment Request</Text>
              <TouchableOpacity onPress={() => setRejectModal({ open: false, comment: '' })}>
                <Ionicons name="close" size={22} color="#37474F" />
              </TouchableOpacity>
            </View>
            <Text style={s.sheetHelp}>
              Provide a clinical reason. This will be visible to the initiator and audit-logged.
            </Text>
            <TextInput
              style={s.textarea}
              multiline
              numberOfLines={4}
              placeholder="e.g., Patient is willing to try one more replacement; refer to periodontist first."
              value={rejectModal.comment}
              onChangeText={(v) => setRejectModal((m) => ({ ...m, comment: v }))}
              // @ts-ignore
              data-testid="end-treatment-reject-comment"
              testID="end-treatment-reject-comment"
            />
            <TouchableOpacity
              style={[s.confirmRejectBtn, submitting && { opacity: 0.6 }]}
              onPress={handleReject}
              disabled={submitting}
              testID="end-treatment-reject-confirm"
              // @ts-ignore
              data-testid="end-treatment-reject-confirm"
            >
              {submitting ? <ActivityIndicator color="#FFF" /> : (
                <Text style={s.confirmRejectText}>Confirm Rejection</Text>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const MetaRow = ({ k, v, multiline }: { k: string; v: string; multiline?: boolean }) => (
  <View style={s.metaRow}>
    <Text style={s.metaKey}>{k}</Text>
    <Text style={s.metaVal} numberOfLines={multiline ? 3 : 1}>{v}</Text>
  </View>
);

const s = StyleSheet.create({
  banner: {
    marginHorizontal: 16, marginTop: 8, marginBottom: 12,
    padding: 14, borderRadius: 16,
    backgroundColor: '#FFF8E1', borderWidth: 2, borderColor: '#F57C00', gap: 10,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#F57C00',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 15, fontWeight: '800', color: '#E65100', letterSpacing: 0.3 },
  subtitle: { fontSize: 12, color: '#8B4513', marginTop: 2 },
  metaBox: { backgroundColor: '#FFF', padding: 10, borderRadius: 10, gap: 6, borderLeftWidth: 3, borderLeftColor: '#F57C00' },
  metaRow: { gap: 2 },
  metaKey: { fontSize: 10, color: '#8E6900', fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  metaVal: { fontSize: 12.5, color: '#3E2723', fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10 },
  approveBtn: { backgroundColor: '#2E7D32' },
  rejectBtn: { backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#C62828' },
  actionText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4 },
  readOnly: { fontSize: 11, color: '#8E6900', fontStyle: 'italic', textAlign: 'center' },
  foot: { fontSize: 10.5, color: '#8E6900', fontStyle: 'italic', textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: {
    width: '100%', maxWidth: 460, backgroundColor: '#FFF', borderRadius: 16, padding: 18, gap: 10,
    borderTopWidth: 4, borderTopColor: '#C62828',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 15, fontWeight: '800', color: '#B71C1C' },
  sheetHelp: { fontSize: 11.5, color: '#546E7A', fontStyle: 'italic' },
  textarea: {
    borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10, padding: 12,
    fontSize: 13, color: '#263238', minHeight: 100, textAlignVertical: 'top',
  },
  confirmRejectBtn: {
    backgroundColor: '#C62828', borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', justifyContent: 'center', marginTop: 6,
  },
  confirmRejectText: { color: '#FFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.4 },
});
