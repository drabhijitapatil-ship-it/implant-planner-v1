import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import CenteredHeader from '../components/CenteredHeader';

/**
 * Cross-department case referral inbox/outbox/approvals.
 *
 * - Incoming / Outgoing: Implant In-Charge / Administrator manage the
 *   department-level referral dashboard (accept/decline/complete).
 * - Outgoing also surfaces a student's/supervisor's own referral requests
 *   (scoped to just what they personally requested) so they can track
 *   approval status.
 * - Approvals: supervisor/incharge/admin — referrals awaiting their
 *   internal sign-off before the referral even reaches the other
 *   department (mirrors Phase 1-4 submission approval).
 */

type Referral = {
  id: string;
  case_id: string;
  from_department_id: string | null;
  from_department_name?: string | null;
  from_student_name?: string | null;
  from_supervisor_name?: string | null;
  to_department_id: string;
  to_department_name: string;
  reason?: string;
  assigned_phase?: string;
  priority?: 'routine' | 'urgent';
  expected_return_date?: string | null;
  notes?: string;
  status: string;
  requested_by_name: string;
  requested_by_role?: string;
  requested_at: string;
  patient_name?: string;
  registration_number?: string;
  implant_procedure_type?: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending_supervisor_approval: 'Awaiting Supervisor Approval',
  pending_incharge_approval: 'Awaiting Incharge Approval',
  pending: 'Pending',
  active: 'Active',
  declined: 'Declined',
  rejected_internal: 'Rejected',
  returned: 'Returned',
  completed: 'Treatment Complete',
  transferred: 'Transferred Further',
  cancelled: 'Cancelled',
  closed: 'Closed',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending_supervisor_approval: { bg: '#FFF3E0', text: '#E65100' },
  pending_incharge_approval: { bg: '#FFF3E0', text: '#E65100' },
  pending: { bg: '#FFF3E0', text: '#E65100' },
  active: { bg: '#E8F5E9', text: '#2E7D32' },
  declined: { bg: '#FFEBEE', text: '#C62828' },
  rejected_internal: { bg: '#FFEBEE', text: '#C62828' },
  returned: { bg: '#ECEFF1', text: '#546E7A' },
  completed: { bg: '#E3F2FD', text: '#0D47A1' },
  transferred: { bg: '#EDE7F6', text: '#4527A0' },
  cancelled: { bg: '#ECEFF1', text: '#546E7A' },
  closed: { bg: '#ECEFF1', text: '#546E7A' },
};

const OUTCOME_OPTIONS: { key: string; label: string; needsTarget?: boolean }[] = [
  { key: 'returned', label: 'Return Patient' },
  { key: 'treatment_complete', label: 'Treatment Complete' },
  { key: 'cancelled', label: 'Referral Cancelled' },
  { key: 'patient_did_not_report', label: 'Patient Did Not Report' },
];

type Tab = 'incoming' | 'outgoing' | 'approvals';

export default function ReferralsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const isManager = user?.role === 'implant_incharge' || user?.role === 'administrator';
  const canCreate = user?.role === 'student' || user?.role === 'supervisor' || isManager;
  const canApprove = user?.role === 'supervisor' || isManager;
  const canView = canCreate;

  const [tab, setTab] = useState<Tab>(isManager ? 'incoming' : canApprove ? 'approvals' : 'outgoing');
  const [incoming, setIncoming] = useState<Referral[]>([]);
  const [outgoing, setOutgoing] = useState<Referral[]>([]);
  const [approvals, setApprovals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const [completeTarget, setCompleteTarget] = useState<Referral | null>(null);
  const [outcome, setOutcome] = useState<string>('returned');
  const [transferDeptId, setTransferDeptId] = useState<string | null>(null);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [completionNotes, setCompletionNotes] = useState('');
  const [completing, setCompleting] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const calls: Promise<any>[] = [];
      calls.push(isManager ? api.get('/referrals/incoming') : Promise.resolve({ data: { referrals: [] } }));
      calls.push(api.get('/referrals/outgoing'));
      calls.push(canApprove ? api.get('/referrals/pending-my-approval') : Promise.resolve({ data: { referrals: [] } }));
      const [inRes, outRes, apprRes] = await Promise.all(calls);
      setIncoming(inRes.data?.referrals || []);
      setOutgoing(outRes.data?.referrals || []);
      setApprovals(apprRes.data?.referrals || []);
    } catch (error: any) {
      if (error?.response?.status !== 401 && error?.response?.status !== 403) {
        console.error('Failed to load referrals:', error);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isManager, canApprove, user]);

  useEffect(() => {
    if (canView) load();
    else setLoading(false);
  }, [canView, load]);

  useEffect(() => {
    if (isManager) {
      api.get('/departments').then((res) => setDepartments(res.data?.departments || [])).catch(() => {});
    }
  }, [isManager]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const act = async (endpoint: string, id: string, confirmMsg?: string, body?: any) => {
    const run = async () => {
      setActingId(id);
      try {
        await api.post(`/referrals/${id}/${endpoint}`, body || {});
        load();
      } catch (error: any) {
        Alert.alert('Error', error.response?.data?.detail || `Failed to ${endpoint} referral`);
      } finally {
        setActingId(null);
      }
    };
    if (confirmMsg) {
      Alert.alert('Confirm', confirmMsg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: run },
      ]);
    } else {
      run();
    }
  };

  const openComplete = (referral: Referral) => {
    setCompleteTarget(referral);
    setOutcome('returned');
    setTransferDeptId(null);
    setCompletionNotes('');
  };

  const submitComplete = async () => {
    if (!completeTarget) return;
    const opt = OUTCOME_OPTIONS.find((o) => o.key === outcome);
    if (opt?.needsTarget && !transferDeptId) {
      Alert.alert('Error', 'Pick the department to transfer this case to');
      return;
    }
    setCompleting(true);
    try {
      await api.post(`/referrals/${completeTarget.id}/complete`, {
        outcome,
        transfer_to_department_id: transferDeptId || undefined,
        notes: completionNotes.trim() || undefined,
      });
      setCompleteTarget(null);
      load();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to complete referral');
    } finally {
      setCompleting(false);
    }
  };

  if (!canView) {
    return (
      <SafeAreaView style={styles.container}>
        <CenteredHeader title="Referrals" fallback="/(tabs)/dashboard" />
        <View style={styles.accessDenied}>
          <Ionicons name="lock-closed" size={48} color="#CCC" />
          <Text style={styles.accessDeniedText}>Access Restricted</Text>
          <Text style={styles.accessDeniedSubtext}>Nurses cannot access referrals</Text>
        </View>
      </SafeAreaView>
    );
  }

  const list = tab === 'incoming' ? incoming : tab === 'outgoing' ? outgoing : approvals;

  const daysPending = (item: Referral) => {
    const start = new Date(item.requested_at).getTime();
    const days = Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24));
    return days;
  };

  const renderCard = ({ item }: { item: Referral }) => {
    const colors = STATUS_COLORS[item.status] || STATUS_COLORS.pending;
    const isUrgent = item.priority === 'urgent';
    const regNo = item.registration_number ? item.registration_number.replace(/^#/, '') : null;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/procedures/${item.case_id}` as any)}
        activeOpacity={0.88}
        data-testid={`referral-card-${item.id}`}
      >
        {/* Card Header: Patient Name + Patient Registration Number (next to name) & Status Badge */}
        <View style={styles.cardHeader}>
          <View style={styles.cardPatientContainer}>
            <Text style={styles.cardPatient} numberOfLines={1}>
              {item.patient_name || 'Case ' + item.case_id.slice(-6)}
            </Text>
            {!!regNo && (
              <View style={styles.regBadge}>
                <Ionicons name="card-outline" size={11} color="#2563EB" style={{ marginRight: 3 }} />
                <Text style={styles.regBadgeText}>#{regNo}</Text>
              </View>
            )}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: colors.text }]} />
            <Text style={[styles.statusBadgeText, { color: colors.text }]}>
              {(STATUS_LABELS[item.status] || item.status).toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Highlight Container: Procedure Type & Phase */}
        {(!!item.implant_procedure_type || !!item.assigned_phase) && (
          <View style={styles.highlightBanner}>
            {!!item.implant_procedure_type && (
              <View style={styles.procedureTypeRow}>
                <Ionicons name="pulse-outline" size={14} color="#0F172A" />
                <Text style={styles.procedureTypeText} numberOfLines={1}>
                  {item.implant_procedure_type}
                </Text>
              </View>
            )}
            {!!item.assigned_phase && (
              <View style={styles.phasePill}>
                <Ionicons name="layers-outline" size={12} color="#3730A3" />
                <Text style={styles.phasePillText}>
                  {item.assigned_phase}{item.reason ? ` · ${item.reason}` : ''}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Department Transfer Bar */}
        <View style={styles.deptBox}>
          <Ionicons name="business" size={14} color="#2563EB" />
          <Text style={styles.deptText}>
            {tab === 'incoming' ? (
              <>
                From Dept: <Text style={styles.deptHighlight}>{item.from_department_name || 'Primary Dept'}</Text>
              </>
            ) : (
              <>
                To Dept: <Text style={styles.deptHighlight}>{item.to_department_name}</Text>
              </>
            )}
          </Text>
        </View>

        {/* Personnel Details */}
        <View style={styles.detailsGroup}>
          <View style={styles.cardRow}>
            <Ionicons name="person-outline" size={13} color="#64748B" />
            <Text style={styles.cardMetaSmall}>
              Referred By: <Text style={styles.metaBold}>{item.requested_by_name}</Text>
              {item.requested_by_role ? ` (${item.requested_by_role})` : ''}
            </Text>
          </View>

          {!!item.from_student_name && (
            <View style={styles.cardRow}>
              <Ionicons name="school-outline" size={13} color="#059669" />
              <Text style={styles.cardMetaSmall}>
                Treating Student: <Text style={styles.metaBold}>{item.from_student_name}</Text>
              </Text>
            </View>
          )}

          {!!item.from_supervisor_name && (
            <View style={styles.cardRow}>
              <Ionicons name="ribbon-outline" size={13} color="#7C3AED" />
              <Text style={styles.cardMetaSmall}>
                Assigned Supervisor: <Text style={styles.metaBold}>{item.from_supervisor_name}</Text>
              </Text>
            </View>
          )}
        </View>

        {/* Timeline & Priority Chips */}
        <View style={styles.metaFooterRow}>
          <View style={[styles.priorityChip, isUrgent ? styles.urgentChip : styles.routineChip]}>
            <Ionicons name={isUrgent ? 'alert-circle' : 'time-outline'} size={12} color={isUrgent ? '#DC2626' : '#475569'} />
            <Text style={[styles.priorityChipText, isUrgent ? styles.urgentChipText : styles.routineChipText]}>
              {isUrgent ? 'Urgent' : 'Routine'}
            </Text>
          </View>

          {(item.status === 'pending' || item.status === 'active') && (
            <View style={styles.pendingChip}>
              <Ionicons name="hourglass-outline" size={12} color="#B45309" />
              <Text style={styles.pendingChipText}>{daysPending(item)}d pending</Text>
            </View>
          )}

          {!!item.expected_return_date && (
            <View style={styles.dateChip}>
              <Ionicons name="calendar-outline" size={12} color="#475569" />
              <Text style={styles.dateChipText}>Return: {item.expected_return_date}</Text>
            </View>
          )}
        </View>

        {/* Notes Callout Box */}
        {!!item.notes && (
          <View style={styles.notesBox}>
            <Ionicons name="chatbox-ellipses-outline" size={14} color="#0284C7" style={{ marginTop: 1 }} />
            <Text style={styles.notesText} numberOfLines={2}>"{item.notes}"</Text>
          </View>
        )}

        {/* Action Buttons */}
        {tab === 'incoming' && item.status === 'pending' && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.acceptBtn]}
              onPress={() => act('accept', item.id)}
              disabled={actingId === item.id}
              data-testid={`accept-referral-${item.id}`}
            >
              {actingId === item.id ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#FFF" />
                  <Text style={styles.actionBtnText}>Accept</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.declineBtn]}
              onPress={() => act('decline', item.id)}
              disabled={actingId === item.id}
              data-testid={`decline-referral-${item.id}`}
            >
              <Ionicons name="close-circle-outline" size={16} color="#DC2626" />
              <Text style={[styles.actionBtnText, { color: '#DC2626' }]}>Decline</Text>
            </TouchableOpacity>
          </View>
        )}
        {tab === 'incoming' && item.status === 'active' && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.returnBtn]}
              onPress={() => openComplete(item)}
              disabled={actingId === item.id}
              data-testid={`complete-referral-${item.id}`}
            >
              <Ionicons name="checkmark-done-circle-outline" size={18} color="#FFF" />
              <Text style={styles.actionBtnText}>Complete Referral</Text>
            </TouchableOpacity>
          </View>
        )}
        {tab === 'outgoing' && (item.status === 'pending' || item.status === 'pending_supervisor_approval' || item.status === 'pending_incharge_approval') && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.declineBtn]}
              onPress={() => act('cancel', item.id, 'Withdraw this referral request?')}
              disabled={actingId === item.id}
              data-testid={`cancel-referral-${item.id}`}
            >
              <Ionicons name="close-circle-outline" size={16} color="#DC2626" />
              <Text style={[styles.actionBtnText, { color: '#DC2626' }]}>Cancel Request</Text>
            </TouchableOpacity>
          </View>
        )}
        {tab === 'approvals' && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.acceptBtn]}
              onPress={() => act('approve-internal', item.id)}
              disabled={actingId === item.id}
              data-testid={`approve-internal-${item.id}`}
            >
              {actingId === item.id ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#FFF" />
                  <Text style={styles.actionBtnText}>Approve</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.declineBtn]}
              onPress={() => act('reject-internal', item.id)}
              disabled={actingId === item.id}
              data-testid={`reject-internal-${item.id}`}
            >
              <Ionicons name="close-circle-outline" size={16} color="#DC2626" />
              <Text style={[styles.actionBtnText, { color: '#DC2626' }]}>Reject</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <CenteredHeader title="Referrals" fallback="/(tabs)/dashboard" />

      <View style={styles.tabRow}>
        {isManager && (
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'incoming' && styles.tabBtnActive]}
            onPress={() => setTab('incoming')}
            data-testid="referrals-tab-incoming"
          >
            <Text style={[styles.tabBtnText, tab === 'incoming' && styles.tabBtnTextActive]}>
              Incoming ({incoming.length})
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'outgoing' && styles.tabBtnActive]}
          onPress={() => setTab('outgoing')}
          data-testid="referrals-tab-outgoing"
        >
          <Text style={[styles.tabBtnText, tab === 'outgoing' && styles.tabBtnTextActive]}>
            Outgoing ({outgoing.length})
          </Text>
        </TouchableOpacity>
        {canApprove && (
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'approvals' && styles.tabBtnActive]}
            onPress={() => setTab('approvals')}
            data-testid="referrals-tab-approvals"
          >
            <Text style={[styles.tabBtnText, tab === 'approvals' && styles.tabBtnTextActive]}>
              Approvals ({approvals.length})
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1A73E8" />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={renderCard}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="git-branch-outline" size={48} color="#CCC" />
              <Text style={styles.emptyText}>
                No {tab} referrals
              </Text>
            </View>
          }
        />
      )}

      {/* Complete Referral — structured outcome picker */}
      <Modal visible={!!completeTarget} animationType="slide" transparent onRequestClose={() => setCompleteTarget(null)}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.sheet} data-testid="complete-referral-modal">
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.sheetHeaderRow}>
                <Text style={styles.title}>Complete Referral</Text>
                <TouchableOpacity onPress={() => setCompleteTarget(null)}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Outcome</Text>
              {OUTCOME_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.optRow, outcome === opt.key && styles.optRowActive]}
                  onPress={() => setOutcome(opt.key)}
                  data-testid={`outcome-${opt.key}`}
                >
                  <Ionicons
                    name={outcome === opt.key ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={outcome === opt.key ? '#1A73E8' : '#94A3B8'}
                  />
                  <Text style={styles.optRowText}>{opt.label}</Text>
                </TouchableOpacity>
              ))}

              {outcome === 'transfer_further' && (
                <>
                  <Text style={styles.label}>Transfer To</Text>
                  {departments
                    .filter((d) => d.id !== completeTarget?.to_department_id)
                    .map((d) => (
                      <TouchableOpacity
                        key={d.id}
                        style={[styles.optRow, transferDeptId === d.id && styles.optRowActive]}
                        onPress={() => setTransferDeptId(d.id)}
                        data-testid={`transfer-dept-${d.id}`}
                      >
                        <Ionicons
                          name={transferDeptId === d.id ? 'radio-button-on' : 'radio-button-off'}
                          size={18}
                          color={transferDeptId === d.id ? '#1A73E8' : '#94A3B8'}
                        />
                        <Text style={styles.optRowText}>{d.name}</Text>
                      </TouchableOpacity>
                    ))}
                </>
              )}

              <Text style={styles.label}>Notes (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Any closing notes"
                placeholderTextColor="#999"
                value={completionNotes}
                onChangeText={setCompletionNotes}
                multiline
                numberOfLines={3}
                data-testid="completion-notes-input"
              />

              <TouchableOpacity
                style={[styles.submitBtn, completing && styles.btnDisabled]}
                onPress={submitComplete}
                disabled={completing}
                data-testid="submit-complete-referral"
              >
                {completing ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>Confirm</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  accessDenied: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  accessDeniedText: { fontSize: 20, fontWeight: '700', color: '#333' },
  accessDeniedSubtext: { fontSize: 14, color: '#888', textAlign: 'center' },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: '#F1F5F9' },
  tabBtnActive: { backgroundColor: '#1A73E8' },
  tabBtnText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  tabBtnTextActive: { color: '#FFF' },
  listContent: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardPatientContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    marginRight: 8,
    flexWrap: 'wrap',
    gap: 6,
  },
  cardPatient: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  regBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  regBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  highlightBanner: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    gap: 6,
  },
  procedureTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  procedureTypeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
  },
  phasePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  phasePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3730A3',
  },
  deptBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  deptText: {
    fontSize: 12.5,
    color: '#64748B',
  },
  deptHighlight: {
    fontWeight: '700',
    color: '#1E293B',
  },
  detailsGroup: {
    gap: 5,
    marginBottom: 10,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardMetaSmall: {
    fontSize: 12.5,
    color: '#64748B',
  },
  metaBold: {
    fontWeight: '600',
    color: '#334155',
  },
  metaFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  priorityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  urgentChip: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
  },
  urgentChipText: {
    color: '#DC2626',
    fontWeight: '700',
    fontSize: 11,
  },
  routineChip: {
    backgroundColor: '#F1F5F9',
  },
  routineChipText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 11,
  },
  pendingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  pendingChipText: {
    color: '#B45309',
    fontWeight: '600',
    fontSize: 11,
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  dateChipText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 11,
  },
  notesBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F0F9FF',
    borderLeftWidth: 3,
    borderLeftColor: '#0284C7',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  notesText: {
    fontSize: 12,
    color: '#0369A1',
    fontStyle: 'italic',
    flex: 1,
    lineHeight: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  acceptBtn: {
    backgroundColor: '#2563EB',
  },
  declineBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  returnBtn: {
    backgroundColor: '#16A34A',
  },
  actionBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, gap: 8 },
  emptyText: { fontSize: 14, color: '#94A3B8' },
  // Complete Referral sheet (reuses ReferCaseButton's visual language)
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    maxHeight: '88%',
  },
  sheetHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
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
