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
import NurseCasesScreen from '../../components/NurseCasesScreen';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
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

  const filteredProcedures = searchQuery.trim()
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
