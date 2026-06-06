import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, TextInput, Image, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import BackButton from '../../components/BackButton';
import api from '../../utils/api';

type SupervisorKPI = {
  id: string;
  name: string;
  email: string;
  profile_photo?: string;
  kpis: {
    total: number;
    pending: number;
    completed: number;
    stale: number;
    approval_rate: number | null;
    students_supervised: number;
  };
};

export default function SupervisorsAnalyticsScreen() {
  const router = useRouter();
  const [supervisors, setSupervisors] = useState<SupervisorKPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await api.get('/admin/supervisors');
      setSupervisors(res.data?.supervisors || []);
    } catch { } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = supervisors.filter(s =>
    !search.trim() || s.name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator style={{ marginTop: 60 }} size="large" color="#1565C0" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <BackButton />
        <Text style={s.title}>Supervisor Summaries</Text>
        <Text style={s.subtitle}>{supervisors.length} supervisor{supervisors.length !== 1 ? 's' : ''}</Text>
      </View>

      <View style={s.searchRow}>
        <Ionicons name="search" size={16} color="#999" style={{ marginRight: 8 }} />
        <TextInput
          style={s.searchInput}
          placeholder="Search by name..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#bbb"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color="#bbb" />
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="people-outline" size={48} color="#ddd" />
            <Text style={s.emptyText}>No supervisors found</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.card}
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: '/admin/supervisor/[id]', params: { id: item.id } })}
          >
            <View style={s.cardTop}>
              {item.profile_photo ? (
                <Image source={{ uri: item.profile_photo }} style={s.avatar} />
              ) : (
                <View style={[s.avatar, s.avatarPlaceholder]}>
                  <Text style={s.avatarInitial}>{(item.name || '?')[0].toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.name || 'Unknown'}</Text>
                <Text style={s.email} numberOfLines={1}>{item.email}</Text>
              </View>
              {item.kpis.stale > 0 && (
                <View style={s.staleBadge}>
                  <Ionicons name="time-outline" size={11} color="#C62828" />
                  <Text style={s.staleBadgeText}>{item.kpis.stale} stale</Text>
                </View>
              )}
              {item.kpis.pending > 0 && item.kpis.stale === 0 && (
                <View style={s.pendingBadge}>
                  <Text style={s.pendingBadgeText}>{item.kpis.pending} pending</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={16} color="#ccc" style={{ marginLeft: 4 }} />
            </View>

            <View style={s.kpiRow}>
              <KPIBox label="Cases" value={item.kpis.total} color="#555" />
              <KPIBox label="Pending" value={item.kpis.pending} color={item.kpis.pending > 0 ? '#E65100' : '#555'} />
              <KPIBox label="Done" value={item.kpis.completed} color="#2E7D32" />
              <KPIBox
                label="Approve%"
                value={item.kpis.approval_rate !== null ? `${item.kpis.approval_rate}%` : '—'}
                color={
                  item.kpis.approval_rate === null ? '#999'
                    : item.kpis.approval_rate >= 75 ? '#2E7D32'
                    : item.kpis.approval_rate >= 50 ? '#E65100'
                    : '#C62828'
                }
              />
            </View>

            <View style={s.studentRow}>
              <Ionicons name="school-outline" size={13} color="#888" />
              <Text style={s.studentText}>
                {item.kpis.students_supervised} student{item.kpis.students_supervised !== 1 ? 's' : ''} supervised
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

function KPIBox({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <View style={s.kpiBox}>
      <Text style={[s.kpiValue, { color }]}>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f6fa' },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a1a1a', marginTop: 4 },
  subtitle: { fontSize: 13, color: '#888', marginTop: 2, marginBottom: 8 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 8,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#e8e8e8',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#333' },
  card: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 12,
    padding: 14, shadowColor: '#000', shadowOpacity: 0.05,
    shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 10 },
  avatarPlaceholder: { backgroundColor: '#E65100', justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { color: '#fff', fontWeight: '700', fontSize: 16 },
  name: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  email: { fontSize: 12, color: '#888', marginTop: 1 },
  staleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#FFEBEE', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 12, marginLeft: 8,
  },
  staleBadgeText: { fontSize: 11, color: '#C62828', fontWeight: '600' },
  pendingBadge: {
    backgroundColor: '#FFF3E0', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 12, marginLeft: 8,
  },
  pendingBadgeText: { fontSize: 11, color: '#E65100', fontWeight: '600' },
  kpiRow: {
    flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#f0f0f0',
    paddingTop: 10, marginBottom: 8,
  },
  kpiBox: { flex: 1, alignItems: 'center' },
  kpiValue: { fontSize: 18, fontWeight: '700' },
  kpiLabel: { fontSize: 11, color: '#999', marginTop: 2 },
  studentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderTopWidth: 1, borderTopColor: '#f5f5f5', paddingTop: 8,
  },
  studentText: { fontSize: 12, color: '#888' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#aaa', marginTop: 12, fontSize: 15 },
});
