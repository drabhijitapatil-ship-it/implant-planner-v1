import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  StyleSheet, TextInput, RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../utils/api';

interface CaseItem {
  id: string;
  patient_name: string;
  student_name: string;
  status: string;
  implant_procedure_type: string;
  procedure_date: string;
  photos_uploaded: number;
  photos_total: number;
  missing_count: number;
  missing_steps: { phase: number; label: string }[];
}

export default function ImplantLensCaseAlbum() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const loadCases = useCallback(async () => {
    try {
      const res = await api.get('/implantlens/cases');
      setCases(res.data.cases || []);
    } catch (err) {
      console.error('Failed to load cases:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadCases(); }, [loadCases]));

  const filtered = search.trim()
    ? cases.filter(c =>
        c.patient_name.toLowerCase().includes(search.toLowerCase()) ||
        c.student_name.toLowerCase().includes(search.toLowerCase()))
    : cases;

  const getProgressColor = (uploaded: number, total: number) => {
    const pct = total > 0 ? uploaded / total : 0;
    if (pct >= 1) return '#4CAF50';
    if (pct >= 0.5) return '#FF9800';
    return '#F44336';
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { bg: string; color: string; label: string }> = {
      draft: { bg: '#FFF3E0', color: '#E65100', label: 'Draft' },
      pending_phase1: { bg: '#E3F2FD', color: '#1565C0', label: 'Phase 1 Pending' },
      phase1_approved: { bg: '#E8F5E9', color: '#2E7D32', label: 'Phase 1 Approved' },
      pending_phase2: { bg: '#E3F2FD', color: '#1565C0', label: 'Phase 2 Pending' },
      phase2_approved: { bg: '#E8F5E9', color: '#2E7D32', label: 'Phase 2 Approved' },
      completed: { bg: '#E8F5E9', color: '#1B5E20', label: 'Completed' },
      permanently_rejected: { bg: '#FFEBEE', color: '#B71C1C', label: 'Rejected' },
    };
    const s = map[status] || { bg: '#F5F5F5', color: '#666', label: status.replace(/_/g, ' ') };
    return s;
  };

  const renderCase = ({ item }: { item: CaseItem }) => {
    const pct = item.photos_total > 0 ? (item.photos_uploaded / item.photos_total) * 100 : 0;
    const progressColor = getProgressColor(item.photos_uploaded, item.photos_total);
    const badge = getStatusBadge(item.status);

    return (
      <TouchableOpacity
        style={st.card}
        onPress={() => router.push(`/implantlens/${item.id}`)}
        data-testid={`case-card-${item.id}`}
      >
        <View style={st.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={st.patientName}>{item.patient_name}</Text>
            {item.student_name ? <Text style={st.studentName}>{item.student_name}</Text> : null}
          </View>
          <View style={[st.statusBadge, { backgroundColor: badge.bg }]}>
            <Text style={[st.statusText, { color: badge.color }]}>{badge.label}</Text>
          </View>
        </View>

        {item.procedure_date ? (
          <Text style={st.dateText}>{item.implant_procedure_type} | {item.procedure_date}</Text>
        ) : null}

        {/* Progress Bar */}
        <View style={st.progressSection}>
          <View style={st.progressBarBg}>
            <View style={[st.progressBarFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: progressColor }]} />
          </View>
          <Text style={[st.progressText, { color: progressColor }]}>
            {item.photos_uploaded}/{item.photos_total}
          </Text>
        </View>

        {/* Missing Alert */}
        {item.missing_count > 0 && (
          <View style={st.missingAlert}>
            <Ionicons name="alert-circle" size={14} color="#F57C00" />
            <Text style={st.missingText}>
              {item.missing_count} photo{item.missing_count !== 1 ? 's' : ''} missing
              {item.missing_steps.length > 0 && ` (${item.missing_steps[0].label}${item.missing_steps.length > 1 ? ` +${item.missing_steps.length - 1} more` : ''})`}
            </Text>
          </View>
        )}

        {pct >= 100 && (
          <View style={st.completeAlert}>
            <Ionicons name="checkmark-circle" size={14} color="#2E7D32" />
            <Text style={st.completeText}>All photos captured</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[st.container, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 60 }} />
      </View>
    );
  }

  return (
    <View style={[st.container, { paddingTop: insets.top }]} data-testid="implantlens-screen">
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>ImplantLens</Text>
          <Text style={st.subtitle}>Clinical Case Album</Text>
        </View>
        <Ionicons name="camera" size={28} color="#007AFF" />
      </View>

      {/* Search */}
      <View style={st.searchRow}>
        <Ionicons name="search" size={18} color="#999" />
        <TextInput
          style={st.searchInput}
          placeholder="Search by patient or student name..."
          placeholderTextColor="#999"
          value={search}
          onChangeText={setSearch}
          data-testid="search-input"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color="#999" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Stats */}
      <View style={st.statsRow}>
        <View style={st.statBox}>
          <Text style={st.statNum}>{cases.length}</Text>
          <Text style={st.statLabel}>Total Cases</Text>
        </View>
        <View style={st.statBox}>
          <Text style={[st.statNum, { color: '#4CAF50' }]}>{cases.filter(c => c.photos_uploaded >= c.photos_total).length}</Text>
          <Text style={st.statLabel}>Complete</Text>
        </View>
        <View style={st.statBox}>
          <Text style={[st.statNum, { color: '#F57C00' }]}>{cases.filter(c => c.missing_count > 0 && c.photos_uploaded > 0).length}</Text>
          <Text style={st.statLabel}>In Progress</Text>
        </View>
        <View style={st.statBox}>
          <Text style={[st.statNum, { color: '#F44336' }]}>{cases.filter(c => c.photos_uploaded === 0).length}</Text>
          <Text style={st.statLabel}>No Photos</Text>
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderCase}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadCases(); }} />}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 40 }}>
            <Ionicons name="images-outline" size={48} color="#CCC" />
            <Text style={{ color: '#999', marginTop: 8, fontSize: 15 }}>
              {search ? 'No matching cases' : 'No cases found'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: '#1A1A2E', letterSpacing: -0.5 },
  subtitle: { fontSize: 12, color: '#666', marginTop: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', marginHorizontal: 16, marginBottom: 12, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#E8E8E8' },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: '#333' },
  statsRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, gap: 8 },
  statBox: { flex: 1, backgroundColor: '#FFF', borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#F0F0F0' },
  statNum: { fontSize: 20, fontWeight: '800', color: '#333' },
  statLabel: { fontSize: 10, color: '#888', marginTop: 2 },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#F0F0F0' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  patientName: { fontSize: 16, fontWeight: '700', color: '#1A1A2E' },
  studentName: { fontSize: 12, color: '#888', marginTop: 2 },
  dateText: { fontSize: 11, color: '#999', marginBottom: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '700' },
  progressSection: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressBarBg: { flex: 1, height: 6, backgroundColor: '#F0F0F0', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 3 },
  progressText: { fontSize: 12, fontWeight: '700', width: 42, textAlign: 'right' },
  missingAlert: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: '#FFF8E1', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  missingText: { fontSize: 11, color: '#F57C00', flex: 1 },
  completeAlert: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  completeText: { fontSize: 11, color: '#2E7D32', fontWeight: '600' },
});
