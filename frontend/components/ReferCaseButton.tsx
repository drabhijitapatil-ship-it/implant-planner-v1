import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import CalendarPicker from './CalendarPicker';

// Mirrors the backend's "referral in progress" set (server.py, refer_procedure) —
// while any of these is true for the case, the receiving department hasn't sent
// it back yet, so the originating department can't open a new referral on it.
const REFERRAL_IN_PROGRESS_STATUSES = [
  'pending_supervisor_approval',
  'pending_incharge_approval',
  'pending',
  'active',
];

/**
 * Header-icon action for referring a case to another department for
 * collaborative treatment (e.g. Prosthodontics → Oral Surgery for implant
 * placement).
 *
 * Referral creation follows the same role-based approval chain as Phase
 * 1-4 submissions: a student's referral needs their case's own supervisor
 * to approve; a supervisor's referral needs their own department's
 * Implant Incharge; Incharge/Admin referrals go straight out. The backend
 * is authoritative on all of this — the role/ownership checks here just
 * decide whether to render the button at all.
 *
 * Self-contained: fetches its own department list, renders nothing if the
 * org has no other department to refer into (fewer than 2 departments, or
 * caller's own case-department is the only one).
 */

type Department = { id: string; name: string };
const PHASES = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'];

export default function ReferCaseButton({
  procedureId,
  caseDepartmentId,
  caseStudentId,
  caseSupervisorId,
}: {
  procedureId: string;
  caseDepartmentId?: string | null;
  caseStudentId?: string | null;
  caseSupervisorId?: string | null;
}) {
  const { user } = useAuth();
  const canRefer =
    (user?.role === 'student' && caseStudentId === user?.id) ||
    (user?.role === 'supervisor' && caseSupervisorId === user?.id) ||
    user?.role === 'implant_incharge' ||
    user?.role === 'administrator';

  const [departments, setDepartments] = useState<Department[]>([]);
  useEffect(() => {
    if (!canRefer) return;
    api
      .get('/departments')
      .then((res) => setDepartments(res.data?.departments || []))
      .catch(() => {});
  }, [canRefer]);

  const targetDepartments = departments.filter((d) => d.id !== caseDepartmentId);

  // Re-checked on every screen focus so returning from another referral
  // action (e.g. the receiving department just sent it back) unlocks this
  // button again without needing an app restart.
  const [hasActiveReferral, setHasActiveReferral] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (!canRefer) return;
      let cancelled = false;
      api
        .get(`/procedures/${procedureId}/referrals`)
        .then((res) => {
          if (cancelled) return;
          const referrals = res.data?.referrals || [];
          setHasActiveReferral(
            referrals.some((r: any) => REFERRAL_IN_PROGRESS_STATUSES.includes(r.status)),
          );
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [canRefer, procedureId]),
  );

  const [showModal, setShowModal] = useState(false);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [assignedPhase, setAssignedPhase] = useState('Phase 4');
  const [priority, setPriority] = useState<'routine' | 'urgent'>('routine');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const openModal = () => {
    setSelectedDeptId(null);
    setReason('');
    setAssignedPhase('Phase 4');
    setPriority('routine');
    setExpectedReturnDate('');
    setNotes('');
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!selectedDeptId) {
      Alert.alert('Error', 'Pick a department to refer this case to');
      return;
    }
    if (!reason.trim()) {
      Alert.alert('Error', 'Enter a reason for the referral');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post(`/procedures/${procedureId}/refer`, {
        to_department_id: selectedDeptId,
        reason: reason.trim(),
        assigned_phase: assignedPhase,
        priority,
        expected_return_date: expectedReturnDate || undefined,
        notes: notes.trim() || undefined,
      });
      setShowModal(false);
      setHasActiveReferral(true);
      const needsApproval = user?.role === 'student' || user?.role === 'supervisor';
      Alert.alert(
        needsApproval ? 'Referral Submitted' : 'Referral Sent',
        res.data?.message === 'Referral submitted for approval'
          ? (user?.role === 'student'
              ? "Your case supervisor needs to approve this before it's sent to the receiving department."
              : "Your department's Implant Incharge needs to approve this before it's sent to the receiving department.")
          : 'The receiving department will see this in their Incoming Referrals.',
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to send referral');
    } finally {
      setSubmitting(false);
    }
  };

  const canShow = canRefer && targetDepartments.length > 0 && !hasActiveReferral;

  return (
    <>
      {/* Fixed 44px slot regardless of visibility — this replaces the header's
          old {width:44} spacer, so the title must stay centered either way. */}
      <View style={styles.iconBtn}>
        {canShow && (
          <TouchableOpacity
            onPress={openModal}
            data-testid="refer-case-btn"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="share-social-outline" size={20} color="#1565C0" />
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.sheet} data-testid="refer-case-modal">
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.header}>
                <Text style={styles.title}>Refer Case</Text>
                <TouchableOpacity onPress={() => setShowModal(false)}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Refer To Department</Text>
              {targetDepartments.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={[styles.optRow, selectedDeptId === d.id && styles.optRowActive]}
                  onPress={() => setSelectedDeptId(d.id)}
                  data-testid={`refer-dept-${d.id}`}
                >
                  <Ionicons
                    name={selectedDeptId === d.id ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={selectedDeptId === d.id ? '#1A73E8' : '#94A3B8'}
                  />
                  <Text style={styles.optRowText}>{d.name}</Text>
                </TouchableOpacity>
              ))}

              <Text style={styles.label}>Reason</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Implant Prosthesis"
                placeholderTextColor="#999"
                value={reason}
                onChangeText={setReason}
                data-testid="refer-reason-input"
              />

              <Text style={styles.label}>Expected Work</Text>
              <View style={styles.chipRow}>
                {PHASES.map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.chip, assignedPhase === p && styles.chipActive]}
                    onPress={() => setAssignedPhase(p)}
                    data-testid={`refer-phase-${p.replace(/\s+/g, '-')}`}
                  >
                    <Text style={[styles.chipText, assignedPhase === p && styles.chipTextActive]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Priority</Text>
              <View style={styles.permRow}>
                {(['routine', 'urgent'] as const).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.permBtn, priority === p && styles.permBtnActive]}
                    onPress={() => setPriority(p)}
                    data-testid={`refer-priority-${p}`}
                  >
                    <Text style={[styles.permBtnText, priority === p && styles.permBtnTextActive]}>
                      {p === 'routine' ? 'Routine' : 'Urgent'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Expected Return Date (Optional)</Text>
              <CalendarPicker
                value={expectedReturnDate}
                onChange={setExpectedReturnDate}
                placeholder="Select date"
                allowPast={false}
                allowFuture
                testID="refer-expected-return"
                style={{ marginBottom: 0 }}
              />

              <Text style={styles.label}>Referral Notes</Text>
              <TextInput
                style={styles.input}
                placeholder="What work needs to be done"
                placeholderTextColor="#999"
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
                data-testid="refer-notes-input"
              />

              <TouchableOpacity
                style={[styles.submitBtn, submitting && styles.btnDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
                data-testid="submit-refer-case"
              >
                {submitting ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.submitBtnText}>Send Referral</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    maxHeight: '88%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', color: '#1A202C' },
  label: { fontSize: 13, fontWeight: '600', color: '#546E7A', marginBottom: 8, marginTop: 14 },
  optRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  optRowActive: { borderColor: '#1A73E8', backgroundColor: '#E3F2FD' },
  optRowText: { fontSize: 14, fontWeight: '600', color: '#1A202C' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999,
    borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FAFAFA',
  },
  chipActive: { borderColor: '#1A73E8', backgroundColor: '#E3F2FD' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  chipTextActive: { color: '#1A73E8' },
  permRow: { flexDirection: 'row', gap: 8 },
  permBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  permBtnActive: { borderColor: '#1A73E8', backgroundColor: '#E3F2FD' },
  permBtnText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  permBtnTextActive: { color: '#1A73E8' },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#1A202C',
    textAlignVertical: 'top',
  },
  submitBtn: { backgroundColor: '#1A73E8', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 20 },
  submitBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
});
