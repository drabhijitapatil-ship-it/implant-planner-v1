import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import { STATUS_COLORS, STATUS_LABELS } from '../../constants/checklist';
import { useAuth } from '../../contexts/AuthContext';
import CaseSubmissionStatus from '../../components/CaseSubmissionStatus';
import NurseCasesScreen from '../../components/NurseCasesScreen';
import ShareToForumModal from '../../components/ShareToForumModal';
import RescheduleModal from '../../components/RescheduleModal';
import TransferCaseModal from '../../components/TransferCaseModal';

export default function ProceduresScreen() {
  const { user } = useAuth();
  // Nurses get a simplified Pending/Completed/All flow driven by consent-upload status.
  if (user?.role === 'nurse') {
    return <NurseCasesScreen />;
  }
  return <DefaultProceduresScreen />;
}

function DefaultProceduresScreen() {
  const { user } = useAuth();
  const [procedures, setProcedures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // iter-267: unified filter row — single set of tabs replaces the older
  // dual-row design (server-side status row + client-side pipeline row).
  // Filtering is now done entirely client-side over the full case list so
  // the four tabs (All / In Progress / Completed / Rejected) stay
  // consistent for every role.
  const [filter, setFilter] = useState<'all' | 'in_progress' | 'completed' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [shareCase, setShareCase] = useState<{ id: string; patientName?: string } | null>(null);
  // iter-269: case selected for reschedule via the three-dot menu.
  const [rescheduleCase, setRescheduleCase] = useState<{ id: string; patientName?: string; currentDate?: string; currentTime?: string } | null>(null);
  // iter-374: case selected for transfer via the three-dot menu.
  const [transferCase, setTransferCase] = useState<{ id: string } | null>(null);
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string; phase?: string }>();

  useEffect(() => {
    if (params.phase) {
      setFilter(`phase_${params.phase}` as any);
    } else if (params.filter === 'pending') {
      // Legacy URL param — map "pending" → new "in_progress" tab
      setFilter('in_progress');
    } else if (params.filter && ['in_progress', 'completed', 'rejected'].includes(params.filter)) {
      setFilter(params.filter as any);
    }
  }, [params.filter, params.phase]);

  useEffect(() => {
    loadProcedures();
  }, [filter]);

  const loadProcedures = async () => {
    try {
      const reqParams: any = {};
      const f = String(filter);
      if (f.startsWith('phase_')) {
        reqParams.phase = f.replace('phase_', '');
      }
      // For All / In Progress / Completed / Rejected we fetch the full
      // case list and filter client-side so categories stay consistent
      // across roles (see filteredProcedures below).
      const response = await api.get('/procedures', { params: reqParams });
      const filtered = f.startsWith('phase_')
        ? response.data
        : response.data.filter((p: any) => p.status !== 'draft');
      setProcedures(filtered);
    } catch (error) {
      console.error('Failed to load procedures:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadProcedures();
  };

  const handleArchive = async (id: string) => {
    setMenuOpenId(null);
    if (!id) { Alert.alert('Error', 'Missing case ID'); return; }
    Alert.alert('Archive', 'Archive this case? It will be moved to Archived Cases.', [
      { text: 'Cancel' },
      { text: 'Archive', onPress: async () => {
        try {
          await api.post(`/procedures/${id}/archive`);
          setProcedures((prev: any) => prev.filter((p: any) => (p.id || p._id) !== id));
          Alert.alert('Done', 'Case archived');
        } catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Failed to archive'); }
      }}
    ]);
  };

  const handleDelete = async (id: string) => {
    setMenuOpenId(null);
    if (!id) { Alert.alert('Error', 'Missing case ID'); return; }
    Alert.alert('Delete', 'Permanently delete this case? This cannot be undone.', [
      { text: 'Cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/procedures/${id}`);
          setProcedures((prev: any) => prev.filter((p: any) => (p.id || p._id) !== id));
          Alert.alert('Done', 'Case deleted');
        } catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Failed to delete'); }
      }}
    ]);
  };

  const handleEdit = (id: string) => {
    setMenuOpenId(null);
    router.push(`/procedures/${id}?edit=true`);
  };

  const getMenuActions = (item: any) => {
    const role = user?.role;
    if (role === 'nurse') return [];
    const actions: { key: string; label: string; icon: string; color: string; onPress: () => void }[] = [];
    const isCompleted = item.status === 'completed';
    const pid = item.id || item._id;

    if (role === 'implant_incharge') {
      if (!isCompleted) actions.push({ key: 'edit', label: 'Edit', icon: 'create-outline', color: '#1565C0', onPress: () => handleEdit(pid) });
      actions.push({ key: 'delete', label: 'Delete', icon: 'trash-outline', color: '#1565C0', onPress: () => handleDelete(pid) });
      actions.push({ key: 'archive', label: 'Archive', icon: 'archive-outline', color: '#1565C0', onPress: () => handleArchive(pid) });
    } else if (role === 'supervisor') {
      if (!isCompleted) actions.push({ key: 'edit', label: 'Edit', icon: 'create-outline', color: '#1565C0', onPress: () => handleEdit(pid) });
      actions.push({ key: 'archive', label: 'Archive', icon: 'archive-outline', color: '#1565C0', onPress: () => handleArchive(pid) });
    } else if (role === 'student') {
      actions.push({ key: 'archive', label: 'Archive', icon: 'archive-outline', color: '#1565C0', onPress: () => handleArchive(pid) });
      // iter-374: Transfer Case — student can only initiate transfer of a case
      // they currently own, that is not archived/completed and does not have
      // a phase submission pending approval. Backend re-enforces every guard.
      const isCurrentOwner = item.student_id === user?.id;
      const isBlockedStatus = new Set([
        'pending_phase1', 'pending_phase2', 'pending_phase3', 'pending_phase4',
        'pending_stage2_surgical',
      ]).has(item.status);
      const hasPendingTransfer = !!item.transfer_request;
      if (isCurrentOwner && !isCompleted && !isBlockedStatus && !hasPendingTransfer) {
        actions.push({
          key: 'transfer',
          label: 'Transfer Case',
          icon: 'swap-horizontal-outline',
          color: '#1565C0',
          onPress: () => setTransferCase({ id: pid }),
        });
      }
    }
    // Add to Discussion Forum — Students (own case), Supervisors (supervised), In-Charges (any)
    const canShare = role === 'implant_incharge'
      || (role === 'supervisor' && item.supervisor_id === user?.id)
      || (role === 'student' && (item.student_id === user?.id || item.created_by_id === user?.id));
    if (canShare) {
      actions.push({
        key: 'forum',
        label: 'Add to Discussion Forum',
        icon: 'chatbubbles-outline',
        color: '#1565C0',
        onPress: () => setShareCase({ id: pid, patientName: item.patient_name }),
      });
    }
    // iter-269: Reschedule — case creator + faculty, only while
    // Phase 2 has NOT been initiated. Eligibility set mirrors backend
    // RESCHEDULE_ELIGIBLE_STATUSES.
    const rescheduleEligible = new Set(['draft', 'pending_phase1', 'rejected_phase1', 'phase1_approved']);
    const isCreator = item.created_by_id === user?.id || item.student_id === user?.id;
    const isFaculty = role === 'supervisor' || role === 'implant_incharge' || role === 'administrator';
    if (rescheduleEligible.has(item.status) && (isCreator || isFaculty)) {
      actions.push({
        key: 'reschedule',
        label: 'Reschedule',
        icon: 'calendar-outline',
        color: '#1565C0',
        onPress: () => setRescheduleCase({
          id: pid,
          patientName: item.patient_name,
          currentDate: item.procedure_date,
          currentTime: item.procedure_time,
        }),
      });
    }
    return actions;
  };

  const renderProcedure = ({ item }: any) => {
    const actions = getMenuActions(item);
    const isMenuOpen = menuOpenId === item.id;

    return (
      <TouchableOpacity
        style={styles.procedureCard}
        onPress={() => { setMenuOpenId(null); router.push(`/procedures/${item.id}`); }}
      >
        <View style={styles.procedureHeader}>
          <View style={styles.headerLeft}>
            <Text style={styles.patientName}>{item.patient_name}</Text>
            <Text style={styles.registrationNumber}>#{item.registration_number}</Text>
            {Array.isArray(item.reschedule_history) && item.reschedule_history.length > 0 ? (
              <View style={styles.rescheduledChip} data-testid={`rescheduled-chip-${item.id}`}>
                <Ionicons name="swap-horizontal" size={11} color="#E65100" />
                <Text style={styles.rescheduledChipTxt}>
                  Rescheduled{item.reschedule_history.length > 1 ? ` · ${item.reschedule_history.length}×` : ''}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status as keyof typeof STATUS_COLORS] }]}>
              <Text style={styles.statusText}>{STATUS_LABELS[item.status as keyof typeof STATUS_LABELS]}</Text>
            </View>
            {item.augmentation_required && (item.augmentations || []).length > 0 && item.status !== 'augmentation_in_progress' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFEBE9', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: '#D7CCC8' }} data-testid={`aug-done-badge-${item.id}`}>
                <Ionicons name="bandage" size={11} color="#5D4037" />
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#5D4037' }}>Pre-Implant Augmentation ✓</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.divider} />

        {/* iter-Jun-2026 (v8): Zygoma / Pterygoid / Config pills — highlights
            advanced procedure types at-a-glance on the My Cases list. */}
        {(() => {
          const pt = String(item.implant_procedure_type || '');
          const hasZyg = /zygoma/i.test(pt);
          const hasPter = /pterygoid/i.test(pt);
          const cfg = String(item.zygoma_pterygoid_configuration || '').trim();
          if (!hasZyg && !hasPter) return null;
          return (
            <View style={styles.zygPillRow} data-testid={`zyg-pills-${item.id}`}>
              {hasZyg && (
                <View style={[styles.zygPill, { backgroundColor: '#FFF3E0', borderColor: '#FB8C00' }]} data-testid={`zyg-pill-zygoma-${item.id}`}>
                  <Ionicons name="body-outline" size={11} color="#E65100" />
                  <Text style={[styles.zygPillTxt, { color: '#E65100' }]}>Zygoma</Text>
                </View>
              )}
              {hasPter && (
                <View style={[styles.zygPill, { backgroundColor: '#E3F2FD', borderColor: '#1E88E5' }]} data-testid={`zyg-pill-pterygoid-${item.id}`}>
                  <Ionicons name="triangle-outline" size={11} color="#1565C0" />
                  <Text style={[styles.zygPillTxt, { color: '#1565C0' }]}>Pterygoid</Text>
                </View>
              )}
              {!!cfg && (
                <View style={[styles.zygPill, { backgroundColor: '#EDE7F6', borderColor: '#5E35B1' }]} data-testid={`zyg-pill-config-${item.id}`}>
                  <Ionicons name="options-outline" size={11} color="#4527A0" />
                  <Text style={[styles.zygPillTxt, { color: '#4527A0' }]} numberOfLines={1}>{cfg}</Text>
                </View>
              )}
            </View>
          );
        })()}

        {item.student_name ? (
          <View style={styles.detailRow}>
            <Ionicons name="person" size={16} color="#666" />
            <Text style={styles.detailText}>Student: {item.student_name}</Text>
          </View>
        ) : null}

        <View style={styles.detailRow}>
          <Ionicons name="school" size={16} color="#666" />
          <Text style={styles.detailText}>Supervisor: {item.supervisor_name}</Text>
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="calendar" size={16} color="#666" />
          <Text style={styles.detailText}>
            {(() => {
              const d = item.procedure_date ? new Date(item.procedure_date) : null;
              return d && !isNaN(d.getTime())
                ? `${format(d, 'MMM dd, yyyy')} at ${item.procedure_time || '—'}`
                : 'Date not set';
            })()}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="location" size={16} color="#666" />
          <Text style={styles.detailText}>Site: {item.implant_site}</Text>
        </View>

        {/* iter-264: compact 4-cell Treatment Progress strip inside each
            list card so reviewers can spot half-finished cases without
            opening them. The whole card is already tappable → navigates
            to the case detail. */}
        <CaseSubmissionStatus procedure={item} user={user} compact />

        {item.rejection_reason && (
          <View style={styles.rejectionContainer}>
            <Ionicons name="alert-circle" size={16} color="#F44336" />
            <Text style={styles.rejectionText}>{item.rejection_reason}</Text>
          </View>
        )}

        {/* Three-dot menu */}
        {actions.length > 0 && (
          <View style={{ position: 'relative', alignItems: 'flex-end', marginTop: 4 }}>
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); setMenuOpenId(isMenuOpen ? null : item.id); }}
              style={{ padding: 4 }}
              data-testid={`three-dot-menu-${item.id}`}
            >
              <Ionicons name="ellipsis-vertical" size={20} color="#666" />
            </TouchableOpacity>
            {isMenuOpen && (
              <View style={styles.popupMenu} data-testid={`popup-menu-${item.id}`}>
                {actions.map(action => (
                  <TouchableOpacity key={action.key} style={styles.popupItem}
                    onPress={(e) => { e.stopPropagation(); action.onPress(); }}
                    data-testid={`menu-${action.key}-${item.id}`}>
                    <Ionicons name={action.icon as any} size={18} color={action.color} />
                    <Text style={[styles.popupItemText, { color: action.color }]}>{action.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const filterButtons = [
    { key: 'all', label: 'All' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'completed', label: 'Completed' },
    { key: 'rejected', label: 'Rejected' },
  ];

  const searchFiltered = searchQuery.trim()
    ? procedures.filter((p: any) => {
        const q = searchQuery.toLowerCase();
        return (
          p.patient_name?.toLowerCase().includes(q) ||
          p.registration_number?.toLowerCase().includes(q) ||
          p.student_name?.toLowerCase().includes(q) ||
          p.supervisor_name?.toLowerCase().includes(q)
        );
      })
    : procedures;

  // iter-267: unified client-side status categorisation. Drafts are
  // already excluded upstream (Dashboard owns them).
  //   • In Progress = anything actively moving through the workflow,
  //     including cases awaiting faculty approval AND cases that have
  //     cleared a phase but are not yet completed.
  //   • Completed = final state.
  //   • Rejected = any rejected_* phase status.
  const PENDING_STATUSES = new Set(['pending_phase1', 'pending_phase2', 'pending_stage2_surgical', 'pending_phase4_step1', 'pending_phase4_step2']);
  const IN_PROGRESS_STATUSES = new Set([
    ...PENDING_STATUSES,
    'phase1_approved', 'phase2_approved', 'stage2_surgical_approved', 'phase4_step1_approved',
  ]);
  const REJECTED_STATUSES = new Set(['rejected_phase1', 'rejected_phase2', 'rejected_stage2_surgical', 'rejected_phase4_step1', 'rejected_phase4_step2']);

  // iter-268: per-tab counts so users see workload at a glance.
  // Counts reflect the active search query (mirrors the visible list).
  const tabCounts: Record<string, number> = {
    all: searchFiltered.length,
    in_progress: searchFiltered.filter((p: any) => IN_PROGRESS_STATUSES.has(p.status)).length,
    completed: searchFiltered.filter((p: any) => p.status === 'completed').length,
    rejected: searchFiltered.filter((p: any) => REJECTED_STATUSES.has(p.status)).length,
  };

  const filteredProcedures = (() => {
    const f = String(filter);
    if (f.startsWith('phase_')) return searchFiltered; // phase deep-link
    if (f === 'all') return searchFiltered;
    return searchFiltered.filter((p: any) => {
      const s = p.status;
      if (f === 'in_progress') return IN_PROGRESS_STATUSES.has(s);
      if (f === 'completed') return s === 'completed';
      if (f === 'rejected') return REJECTED_STATUSES.has(s);
      return true;
    });
  })();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>

      <View style={styles.filterContainer}>
        {filterButtons.map((btn) => {
          const isActive = filter === btn.key;
          const count = tabCounts[btn.key] ?? 0;
          return (
            <TouchableOpacity
              key={btn.key}
              style={[styles.filterButton, isActive && styles.filterButtonActive]}
              onPress={() => setFilter(btn.key as any)}
              testID={`filter-tab-${btn.key}`}
            >
              <Text style={[styles.filterText, isActive && styles.filterTextActive]} numberOfLines={1}>
                {btn.label}
                <Text style={[styles.filterCount, isActive && styles.filterCountActive]}>{` (${count})`}</Text>
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.searchContainer} data-testid="search-bar-container">
        <Ionicons name="search" size={18} color="#999" style={{ marginLeft: 12 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by patient, registration, student..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
          data-testid="search-input"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 8 }} data-testid="search-clear">
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {filteredProcedures.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name={searchQuery ? 'search-outline' : 'document-text-outline'} size={64} color="#CCC" />
          <Text style={styles.emptyText}>{searchQuery ? 'No matching cases found' : 'No procedures found'}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredProcedures}
          renderItem={renderProcedure}
          keyExtractor={(item: any) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContainer}
          keyboardShouldPersistTaps="handled"
        />
      )}
      {shareCase && (
        <ShareToForumModal
          visible={!!shareCase}
          procedureId={shareCase.id}
          patientName={shareCase.patientName}
          onClose={() => setShareCase(null)}
          onShared={(tid) => { setShareCase(null); router.push(`/forum/${tid}` as any); }}
        />
      )}
      {rescheduleCase && (
        <RescheduleModal
          visible={!!rescheduleCase}
          procedureId={rescheduleCase.id}
          patientName={rescheduleCase.patientName}
          currentDate={rescheduleCase.currentDate}
          currentTime={rescheduleCase.currentTime}
          onClose={() => setRescheduleCase(null)}
          onRescheduled={() => { setRescheduleCase(null); loadProcedures(); }}
        />
      )}
      {transferCase && (
        <TransferCaseModal
          procedureId={transferCase.id}
          onClose={() => setTransferCase(null)}
          onSubmitted={() => { setTransferCase(null); loadProcedures(); }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    gap: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
  filterContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 6,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: '#007AFF',
  },
  filterText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  filterTextActive: {
    color: '#FFF',
  },
  filterCount: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9AA0A6',
  },
  filterCountActive: {
    color: '#E3F2FD',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    fontSize: 14,
    color: '#1A1A1A',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
  },
  listContainer: {
    padding: 16,
  },
  procedureCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  procedureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
  },
  patientName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  registrationNumber: {
    fontSize: 14,
    color: '#666',
  },
  rescheduledChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FFE0B2',
  },
  rescheduledChipTxt: {
    fontSize: 10,
    fontWeight: '700',
    color: '#E65100',
    letterSpacing: 0.3,
  },
  // iter-Jun-2026 (v8): Zygoma / Pterygoid procedure-type pills.
  zygPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    marginBottom: 4,
  },
  zygPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: 240,
  },
  zygPillTxt: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 8,
  },
  statusText: {
    fontSize: 10,
    color: '#FFF',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  rejectionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  rejectionText: {
    fontSize: 13,
    color: '#F44336',
    flex: 1,
  },
  popupMenu: {
    position: 'absolute',
    bottom: 30,
    right: 0,
    backgroundColor: '#FFF',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#1565C0',
    paddingVertical: 4,
    minWidth: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 100,
  },
  popupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  popupItemText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
