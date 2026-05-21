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
  const [filter, setFilter] = useState('all');
  // iter-265: client-side pipeline filter chips that overlay on top of the
  // server-side `filter` (status). Role-aware: faculty get
  // "Needs my approval" chip; students get "Awaiting approval" chip.
  const [pipelineFilter, setPipelineFilter] = useState<'all' | 'needs_review' | 'in_progress' | 'awaiting_other' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [shareCase, setShareCase] = useState<{ id: string; patientName?: string } | null>(null);
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string; phase?: string }>();

  useEffect(() => {
    if (params.phase) {
      setFilter(`phase_${params.phase}`);
    } else if (params.filter && ['pending', 'completed', 'rejected'].includes(params.filter)) {
      setFilter(params.filter);
    }
  }, [params.filter, params.phase]);

  useEffect(() => {
    loadProcedures();
  }, [filter]);

  const loadProcedures = async () => {
    try {
      const reqParams: any = {};
      if (filter.startsWith('phase_')) {
        reqParams.phase = filter.replace('phase_', '');
      } else if (filter !== 'all') {
        reqParams.status = filter;
      }
      const response = await api.get('/procedures', { params: reqParams });
      // Exclude draft cases from My Cases (drafts are shown on Dashboard)
      const filtered = filter.startsWith('phase_')
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
          </View>
          <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status as keyof typeof STATUS_COLORS] }]}>
            <Text style={styles.statusText}>{STATUS_LABELS[item.status as keyof typeof STATUS_LABELS]}</Text>
          </View>
        </View>

        <View style={styles.divider} />

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
            {format(new Date(item.procedure_date), 'MMM dd, yyyy')} at {item.procedure_time}
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
    { key: 'pending', label: 'Pending' },
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

  // iter-265: pipeline filter chips — client-side overlay on the
  // server-fetched list. Faculty see "Needs my approval"; students see
  // "Awaiting approval". "In progress" + "Rejected" apply to both.
  const isFaculty = user?.role === 'supervisor' || user?.role === 'implant_incharge' || user?.role === 'administrator';
  const PENDING_STATUSES = new Set(['pending_phase1', 'pending_phase2', 'pending_stage2_surgical', 'pending_phase4_step1', 'pending_phase4_step2']);
  const IN_PROGRESS_STATUSES = new Set(['draft', 'phase1_approved', 'phase2_approved', 'stage2_surgical_approved', 'phase4_step1_approved']);
  const REJECTED_STATUSES = new Set(['rejected_phase1', 'rejected_phase2', 'rejected_stage2_surgical', 'rejected_phase4_step1', 'rejected_phase4_step2']);

  const filteredProcedures = (() => {
    if (pipelineFilter === 'all') return searchFiltered;
    return searchFiltered.filter((p: any) => {
      const s = p.status;
      if (pipelineFilter === 'needs_review') {
        // Faculty: cases awaiting their approval (they're the supervisor or in-charge)
        if (!isFaculty) return false;
        if (!PENDING_STATUSES.has(s)) return false;
        return p.supervisor_id === user?.id || p.implant_incharge_id === user?.id;
      }
      if (pipelineFilter === 'awaiting_other') {
        // Students: cases they submitted that are pending faculty approval
        if (isFaculty) return false;
        return PENDING_STATUSES.has(s);
      }
      if (pipelineFilter === 'in_progress') return IN_PROGRESS_STATUSES.has(s);
      if (pipelineFilter === 'rejected') return REJECTED_STATUSES.has(s);
      return true;
    });
  })();

  const pipelineChips = isFaculty
    ? [
        { key: 'all', label: 'All', icon: 'apps-outline' },
        { key: 'needs_review', label: 'Needs my approval', icon: 'paper-plane-outline' },
        { key: 'in_progress', label: 'In progress', icon: 'pulse-outline' },
        { key: 'rejected', label: 'Rejected', icon: 'alert-circle-outline' },
      ]
    : [
        { key: 'all', label: 'All', icon: 'apps-outline' },
        { key: 'in_progress', label: 'In progress', icon: 'pulse-outline' },
        { key: 'awaiting_other', label: 'Awaiting approval', icon: 'paper-plane-outline' },
        { key: 'rejected', label: 'Rejected', icon: 'alert-circle-outline' },
      ];

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
        {filterButtons.map((btn) => (
          <TouchableOpacity
            key={btn.key}
            style={[styles.filterButton, filter === btn.key && styles.filterButtonActive]}
            onPress={() => setFilter(btn.key)}
          >
            <Text
              style={[styles.filterText, filter === btn.key && styles.filterTextActive]}
            >
              {btn.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* iter-265: pipeline filter chips — overlay on the status filter above. */}
      <View style={styles.pipelineChipRow} data-testid="pipeline-chip-row">
        {pipelineChips.map(chip => {
          const active = pipelineFilter === chip.key;
          return (
            <TouchableOpacity
              key={chip.key}
              style={[styles.pipelineChip, active && styles.pipelineChipActive]}
              onPress={() => setPipelineFilter(chip.key as any)}
              testID={`pipeline-chip-${chip.key}`}
            >
              <Ionicons name={chip.icon as any} size={13} color={active ? '#FFFFFF' : '#1565C0'} />
              <Text style={[styles.pipelineChipText, active && styles.pipelineChipTextActive]} numberOfLines={1}>{chip.label}</Text>
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
    gap: 8,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: '#007AFF',
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  filterTextActive: {
    color: '#FFF',
  },
  // iter-265: pipeline chips row
  pipelineChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  pipelineChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: '#BBDEFB', backgroundColor: '#F5FAFF' },
  pipelineChipActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  pipelineChipText: { fontSize: 11, fontWeight: '700', color: '#1565C0', letterSpacing: 0.2 },
  pipelineChipTextActive: { color: '#FFFFFF' },
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
