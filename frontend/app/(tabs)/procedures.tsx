import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { STATUS_COLORS, STATUS_LABELS } from '../../constants/checklist';
import BackToDashboard from '../../components/BackToDashboard';

export default function ProceduresScreen() {
  const [procedures, setProcedures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const router = useRouter();

  useEffect(() => {
    loadProcedures();
  }, [filter]);

  const loadProcedures = async () => {
    try {
      const params: any = {};
      if (filter !== 'all') {
        params.status = filter;
      }
      const response = await api.get('/procedures', { params });
      setProcedures(response.data);
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

  const renderProcedure = ({ item }: any) => (
    <TouchableOpacity
      style={styles.procedureCard}
      onPress={() => router.push(`/procedures/${item.id}`)}
    >
      <View style={styles.procedureHeader}>
        <View style={styles.headerLeft}>
          <Text style={styles.patientName}>{item.patient_name}</Text>
          <Text style={styles.registrationNumber}>#{item.registration_number}</Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: STATUS_COLORS[item.status as keyof typeof STATUS_COLORS] },
          ]}
        >
          <Text style={styles.statusText}>
            {STATUS_LABELS[item.status as keyof typeof STATUS_LABELS]}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.detailRow}>
        <Ionicons name="person" size={16} color="#666" />
        <Text style={styles.detailText}>Student: {item.student_name}</Text>
      </View>

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
    </TouchableOpacity>
  );

  const filterButtons = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'completed', label: 'Completed' },
    { key: 'rejected', label: 'Rejected' },
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
      <BackToDashboard />

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

      {procedures.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={64} color="#CCC" />
          <Text style={styles.emptyText}>No procedures found</Text>
        </View>
      ) : (
        <FlatList
          data={procedures}
          renderItem={renderProcedure}
          keyExtractor={(item: any) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContainer}
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
});
