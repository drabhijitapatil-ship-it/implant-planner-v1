/**
 * iter-393 — Pre-Implant Augmentation section on the case detail screen.
 * Shows each augmentation round with status pill, Step 1/2 launch buttons
 * for the owner, faculty approve/reject actions, and submitted-data readback.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  step1_pending: { label: 'Step 1 — Pre-procedure Pending', bg: '#ECEFF1', fg: '#546E7A' },
  step2_pending: { label: 'Step 2 — Post-procedure Pending', bg: '#E3F2FD', fg: '#1565C0' },
  pending_supervisor: { label: 'Awaiting Supervisor', bg: '#FFF3E0', fg: '#E65100' },
  pending_incharge: { label: 'Awaiting In-Charge', bg: '#FFF3E0', fg: '#E65100' },
  approved: { label: 'Approved', bg: '#E8F5E9', fg: '#1B5E20' },
  rejected: { label: 'Rejected — Revise', bg: '#FFEBEE', fg: '#C62828' },
};

const Row = ({ label, value }: { label: string; value?: string }) => {
  if (!value) return null;
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
};

const list = (v?: string[]) => (v && v.length ? v.join(', ') : undefined);

export default function AugmentationSection({ procedure, onChanged }: { procedure: any; onChanged: () => void }) {
  const { user } = useAuth();
  const router = useRouter();
  const rounds: any[] = procedure?.augmentations || [];
  const [openRound, setOpenRound] = useState<number | null>(rounds.length ? rounds[rounds.length - 1].round : null);
  const [comment, setComment] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [acting, setActing] = useState(false);

  if (!procedure?.augmentation_required || rounds.length === 0) return null;

  const uid = String(user?.id || (user as any)?._id || '');
  const isOwner = uid && (uid === String(procedure.student_id || '') || uid === String(procedure.created_by_id || ''));
  const isSup = uid === String(procedure.supervisor_id || '');
  const isInc = uid === String(procedure.implant_incharge_id || '');
  const samePerson = procedure.supervisor_id && procedure.supervisor_id === procedure.implant_incharge_id;
  const current = rounds[rounds.length - 1];

  const canReview = (rnd: any) =>
    (rnd.status === 'pending_supervisor' && (isSup || (samePerson && isInc))) ||
    (rnd.status === 'pending_incharge' && isInc);

  const act = async (action: 'approve' | 'reject') => {
    if (action === 'reject' && !rejectReason.trim()) {
      Alert.alert('Reason required', 'Please enter a reason for rejection.');
      return;
    }
    setActing(true);
    try {
      const res = await api.post(`/procedures/${procedure._id || procedure.id}/augmentation/approve`, {
        action,
        comment: comment.trim() || undefined,
        rejection_reason: action === 'reject' ? rejectReason.trim() : undefined,
      });
      Alert.alert(action === 'approve' ? 'Approved' : 'Rejected', res.data?.message || 'Done');
      setComment(''); setRejectReason(''); setShowReject(false);
      onChanged();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Action failed');
    } finally { setActing(false); }
  };

  return (
    <View style={s.section} testID="augmentation-section">
      <View style={s.header}>
        <Ionicons name="bandage" size={20} color="#8D6E63" />
        <Text style={s.title}>Pre-Implant Augmentation</Text>
      </View>

      {rounds.map(rnd => {
        let meta = STATUS_META[rnd.status] || { label: rnd.status, bg: '#ECEFF1', fg: '#546E7A' };
        if (rnd.status === 'step3_approved') {
          meta = rnd.step3?.decision === 'failed'
            ? { label: 'Reviewed — Graft Failed', bg: '#FFEBEE', fg: '#C62828' }
            : { label: 'Augmentation Complete', bg: '#E8F5E9', fg: '#1B5E20' };
        } else if ((rnd.status === 'pending_supervisor' || rnd.status === 'pending_incharge') && rnd.step3) {
          meta = { ...meta, label: `Step 3 — ${meta.label}` };
        } else if (rnd.status === 'approved') {
          meta = { label: 'Approved — Step 3 Review Pending', bg: '#E8F5E9', fg: '#1B5E20' };
        }
        const open = openRound === rnd.round;
        const isCurrent = rnd.round === current.round;
        const s1 = rnd.step1; const s2 = rnd.step2; const s3 = rnd.step3;
        return (
          <View key={rnd.round} style={s.card} testID={`aug-round-${rnd.round}`}>
            <TouchableOpacity style={s.cardHead} onPress={() => setOpenRound(open ? null : rnd.round)} testID={`aug-toggle-${rnd.round}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={s.cardTitle}>Bone Grafting — Round {rnd.round}</Text>
                <View style={{ flex: 1 }} />
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#78909C" />
              </View>
              <View style={[s.pill, { backgroundColor: meta.bg, alignSelf: 'flex-start', marginTop: 7 }]}>
                <Text style={[s.pillText, { color: meta.fg }]}>{meta.label}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 7 }}>
                <Ionicons name="calendar-outline" size={13} color="#90A4AE" />
                <Text style={s.cardSub}>Surgery: {rnd.scheduled_date ? `${rnd.scheduled_date} · ${rnd.scheduled_time}` : 'To be scheduled'}</Text>
              </View>
            </TouchableOpacity>

            {rnd.status === 'rejected' && rnd.rejection_reason ? (
              <View style={s.rejectBox} testID={`aug-rejection-${rnd.round}`}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#C62828' }}>Rejected by {rnd.rejected_by}</Text>
                <Text style={{ fontSize: 12, color: '#5D4037', marginTop: 2 }}>{rnd.rejection_reason}</Text>
              </View>
            ) : null}

            {/* Owner actions on the current round */}
            {isOwner && isCurrent && rnd.status === 'step1_pending' && (
              <TouchableOpacity style={s.actionBtn} onPress={() => router.push(`/procedures/augmentation-step1/${procedure._id || procedure.id}`)} testID="aug-fill-step1-btn">
                <Ionicons name="create-outline" size={16} color="#FFF" />
                <Text style={s.actionBtnText}>Fill Step 1 — Pre-procedure Details</Text>
              </TouchableOpacity>
            )}
            {isOwner && isCurrent && rnd.status === 'step2_pending' && (
              <View>
                <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#546E7A', alignSelf: 'center', paddingHorizontal: 28 }]} onPress={() => router.push(`/procedures/augmentation-step1/${procedure._id || procedure.id}`)} testID="aug-edit-step1-btn">
                  <Ionicons name="pencil-outline" size={15} color="#FFF" />
                  <Text style={s.actionBtnText}>Edit Step 1</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.bigBtn} onPress={() => router.push(`/procedures/augmentation-step2/${procedure._id || procedure.id}`)} testID="aug-fill-step2-btn">
                  <Ionicons name="create-outline" size={18} color="#FFF" />
                  <Text style={s.bigBtnText}>Fill Step 2 — Post-procedure Details</Text>
                </TouchableOpacity>
              </View>
            )}
            {isOwner && isCurrent && rnd.status === 'rejected' && !rnd.step3 && (
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#C62828' }]} onPress={() => router.push(`/procedures/augmentation-step2/${procedure._id || procedure.id}`)} testID="aug-revise-step2-btn">
                <Ionicons name="refresh-outline" size={16} color="#FFF" />
                <Text style={s.actionBtnText}>Revise & Resubmit Step 2</Text>
              </TouchableOpacity>
            )}
            {isOwner && isCurrent && rnd.status === 'rejected' && !!rnd.step3 && (
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#C62828' }]} onPress={() => router.push(`/procedures/augmentation-step3/${procedure._id || procedure.id}`)} testID="aug-revise-step3-btn">
                <Ionicons name="refresh-outline" size={16} color="#FFF" />
                <Text style={s.actionBtnText}>Revise & Resubmit Step 3 Review</Text>
              </TouchableOpacity>
            )}

            {/* Faculty review actions */}
            {isCurrent && canReview(rnd) && (
              <View style={s.reviewBox} testID="aug-review-box">
                <TextInput style={s.inputSm} placeholder="Optional remark..." value={comment} onChangeText={setComment} testID="aug-review-comment" />
                {showReject && (
                  <TextInput style={[s.inputSm, { borderColor: '#EF9A9A' }]} placeholder="Reason for rejection (required)..." value={rejectReason} onChangeText={setRejectReason} testID="aug-reject-reason" />
                )}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TouchableOpacity style={[s.reviewBtn, { backgroundColor: '#1B5E20' }]} disabled={acting} onPress={() => act('approve')} testID="aug-approve-btn">
                    {acting ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={s.reviewBtnText}>Approve</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.reviewBtn, { backgroundColor: '#C62828' }]} disabled={acting}
                    onPress={() => showReject ? act('reject') : setShowReject(true)} testID="aug-reject-btn">
                    <Text style={s.reviewBtnText}>{showReject ? 'Confirm Reject' : 'Reject'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {open && (
              <View style={{ marginTop: 10 }}>
                {s1 ? (
                  <>
                    <Text style={s.subHead}>Step 1 — Pre-procedure</Text>
                    <Row label="Reason for grafting" value={`${(s1.reasons || []).join(', ')}${s1.reason_other_text ? ` — ${s1.reason_other_text}` : ''}`} />
                    <Row label="Defect location (FDI)" value={list(s1.defect_teeth)} />
                    <Row label="Bone defect side" value={list(s1.defect_sides)} />
                    <Row label="Horizontal / Vertical defect" value={`${s1.horizontal_defect || '—'} / ${s1.vertical_defect || '—'}`} />
                    <Row label="Other defect notes" value={s1.defect_other} />
                    <Row label="Bone before graft (W × H)" value={`${s1.bone_width_before || '—'} mm × ${s1.bone_height_before || '—'} mm`} />
                  </>
                ) : <Text style={s.emptyTxt}>Step 1 not yet completed.</Text>}
                {s2 ? (
                  <>
                    <Text style={[s.subHead, { marginTop: 10 }]}>Step 2 — Post-procedure</Text>
                    <Row label="Procedure performed" value={`${(s2.procedures_performed || []).join(', ')}${s2.procedure_other_text ? ` — ${s2.procedure_other_text}` : ''}`} />
                    <Row label="Autogenous graft" value={s2.autogenous_used === 'Yes' ? `Yes — ${list(s2.autogenous_sites)}${s2.autogenous_other_text ? ` (${s2.autogenous_other_text})` : ''}` : s2.autogenous_used} />
                    <Row label="Allograft" value={s2.allograft_used} />
                    <Row label="Other graft materials" value={`${list(s2.other_graft_materials) || ''}${s2.graft_material_other_text ? ` — ${s2.graft_material_other_text}` : ''}` || undefined} />
                    <Row label="Membrane" value={s2.membrane_used === 'Yes' ? `Yes — ${list(s2.membrane_types)}${s2.membrane_other_text ? ` (${s2.membrane_other_text})` : ''}` : s2.membrane_used} />
                    <Row label="Fixation" value={list(s2.fixation)} />
                    <Row label="Soft tissue graft" value={s2.soft_tissue_graft === 'Yes'
                      ? `Yes — ${list(s2.soft_tissue_types)} · Donor: ${list(s2.soft_tissue_donor_sites)} · Indication: ${list(s2.soft_tissue_indications)}${s2.soft_tissue_other_text ? ` (${s2.soft_tissue_other_text})` : ''}`
                      : s2.soft_tissue_graft} />
                    <Row label="Healing protocol" value={s2.healing_protocol === 'Custom' ? `Custom — ${s2.healing_custom_text}` : s2.healing_protocol} />
                  </>
                ) : null}
                {s3 ? (
                  <>
                    <Text style={[s.subHead, { marginTop: 10 }]}>Step 3 — Review of Augmentation</Text>
                    <Row label="Healing status" value={s3.healing_status} />
                    <Row label="Complications" value={`${(s3.complications || []).join(', ')}${s3.complication_other_text ? ` — ${s3.complication_other_text}` : ''}` || undefined} />
                    <Row label="Bone graft outcome" value={s3.outcome} />
                    <Row label="Bone gain (H × V after graft)" value={(s3.bone_width_after || s3.bone_height_after) ? `${s3.bone_width_after || '—'} mm × ${s3.bone_height_after || '—'} mm` : undefined} />
                    <Row label="CBCT after graft" value={(s3.cbct_files || []).length ? `${s3.cbct_files.length} file(s) uploaded` : 'Not uploaded'} />
                    <Row label="Decision" value={s3.decision === 'complete'
                      ? 'Bone Graft Augmentation Complete'
                      : `Bone Graft Augmentation Failed — ${({ terminate: 'Terminate Treatment', repeat: 'Repeat Pre-Implant Bone Augmentation', proceed_phase2: 'Proceed to Phase 2' } as any)[s3.failed_action] || ''}`} />
                  </>
                ) : null}
                {(rnd.faculty_comments || []).map((c: any, i: number) => (
                  <Row key={i} label={`${c.role === 'supervisor' ? 'Supervisor' : 'In-Charge'} remark`} value={c.comment} />
                ))}
              </View>
            )}

            {/* iter-394: big CTAs live at the bottom of the card, below the
                step readback details and just above Treatment Progress. */}
            {isOwner && isCurrent && rnd.status === 'approved' && !rnd.step3 && (
              <TouchableOpacity style={[s.bigBtn, { backgroundColor: '#6A1B9A' }]} onPress={() => router.push(`/procedures/augmentation-step3/${procedure._id || procedure.id}`)} testID="aug-fill-step3-btn">
                <Ionicons name="clipboard-outline" size={18} color="#FFF" />
                <Text style={s.bigBtnText}>Proceed to Step 3 — Review of Pre-Implant Augmentation</Text>
              </TouchableOpacity>
            )}
            {isOwner && isCurrent && rnd.status === 'step3_approved'
              && procedure.augmentation_outcome === 'proceed_phase2'
              && procedure.status === 'augmentation_in_progress' && (
              <TouchableOpacity style={[s.bigBtn, { backgroundColor: '#1B5E20' }]} onPress={() => router.push(`/(tabs)/new-procedure?augResumeId=${procedure._id || procedure.id}`)} testID="aug-proceed-phase2-btn">
                <Ionicons name="arrow-forward-circle" size={18} color="#FFF" />
                <Text style={s.bigBtnText}>Proceed to Phase 2 — Complete Phase 1 Details</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  section: { backgroundColor: '#FFF', marginHorizontal: 16, marginBottom: 16, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E8EDF2' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  title: { fontSize: 16, fontWeight: '700', color: '#1A1A2E', flex: 1 },
  card: { borderWidth: 1, borderColor: '#E0E7EE', borderRadius: 10, padding: 12, marginBottom: 10, backgroundColor: '#FAFCFD' },
  cardHead: { },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#37474F' },
  cardSub: { fontSize: 11.5, color: '#78909C', fontWeight: '600' },
  pill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 10.5, fontWeight: '800' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1565C0', borderRadius: 9, paddingVertical: 11, marginTop: 10 },
  actionBtnText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  bigBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#1565C0', borderRadius: 11, paddingVertical: 15, paddingHorizontal: 18, marginTop: 12, alignSelf: 'center', width: '100%', maxWidth: 480 },
  bigBtnText: { color: '#FFF', fontSize: 13.5, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
  rejectBox: { backgroundColor: '#FFEBEE', borderRadius: 8, borderWidth: 1, borderColor: '#EF9A9A', padding: 9, marginTop: 8 },
  reviewBox: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#ECEFF1', paddingTop: 10 },
  inputSm: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 9, fontSize: 12.5, backgroundColor: '#FFF', marginTop: 6 },
  reviewBtn: { flex: 1, borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
  reviewBtnText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  subHead: { fontSize: 13, fontWeight: '800', color: '#455A64', marginBottom: 4 },
  row: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F4F7F9', gap: 10 },
  rowLabel: { fontSize: 12, color: '#78909C', flex: 1 },
  rowValue: { fontSize: 12, color: '#263238', fontWeight: '600', flex: 1.4, textAlign: 'right' },
  emptyTxt: { fontSize: 12, color: '#B0BEC5', fontStyle: 'italic' },
});
