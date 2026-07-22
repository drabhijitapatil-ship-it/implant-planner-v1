/**
 * Full Student Performance directory — reached from the dashboard's
 * "Show more" button under the top-3 preview. Search-as-you-type filter
 * on student name so this stays usable as the roster grows.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

type StudentRow = {
  student_id: string;
  student_name: string;
  total: number;
  completed: number;
  active: number;
  department_name?: string | null;
};

export default function StudentsPerformanceScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const canAccess = user?.role === 'implant_incharge' || user?.role === 'administrator' || user?.role === 'supervisor';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.get('/dashboard/stats');
      setRows((res.data?.student_stats || []).filter((st: StudentRow) => st.student_name));
    } catch {
      // Silent — screen shows an empty state below.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { if (canAccess) load(); else if (!authLoading) setLoading(false); }, [canAccess, authLoading, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...rows].sort((a, b) => (b.completed || 0) - (a.completed || 0));
    if (!q) return sorted;
    return sorted.filter((r) => (r.student_name || '').toLowerCase().includes(q));
  }, [rows, query]);

  if (authLoading || loading) {
    return <SafeAreaView style={s.c}><ActivityIndicator size="large" color="#1565C0" style={{ marginTop: 80 }} /></SafeAreaView>;
  }

  if (!canAccess) {
    return (
      <SafeAreaView style={s.c}>
        <View style={s.blockedCard}>
          <Ionicons name="lock-closed-outline" size={36} color="#C62828" />
          <Text style={s.blockedTitle}>Access denied</Text>
          <Text style={s.blockedBody}>Only Supervisor, Implant In-Charge and Administrator accounts can view student performance.</Text>
          <TouchableOpacity style={s.blockedBtn} onPress={() => router.back()}><Text style={s.blockedBtnT}>Go back</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.c} edges={['top', 'bottom']}>
      <View style={s.h}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }} data-testid="students-perf-back" testID="students-perf-back">
          <Ionicons name="arrow-back" size={22} color="#1565C0" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={s.title}>Student Performance</Text>
          <Text style={s.sub}>{rows.length} student{rows.length === 1 ? '' : 's'}</Text>
        </View>
      </View>

      <View style={s.searchBox}>
        <Ionicons name="search" size={16} color="#78909C" />
        <TextInput
          style={s.searchInput}
          placeholder="Search student by name"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          data-testid="students-perf-search"
          testID="students-perf-search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} data-testid="students-perf-search-clear">
            <Ionicons name="close-circle" size={16} color="#B0BEC5" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {filtered.length === 0 ? (
          <Text style={s.empty}>{query ? 'No students match your search.' : 'No student data yet.'}</Text>
        ) : (
          filtered.map((st, idx) => (
            <TouchableOpacity
              key={st.student_id}
              style={s.card}
              activeOpacity={0.7}
              onPress={() => router.push(`/admin/student/${st.student_id}`)}
              data-testid={`students-perf-row-${idx}`}
            >
              <View style={s.rank}><Text style={s.rankT}>#{idx + 1}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{st.student_name}</Text>
                {st.department_name && (
                  <Text style={s.dept} numberOfLines={1}>
                    <Ionicons name="business-outline" size={10} color="#78909C" /> {st.department_name}
                  </Text>
                )}
                <View style={s.stats}>
                  <View style={s.chip}><Text style={[s.chipT, { color: '#1A73E8' }]}>{st.total} total</Text></View>
                  <View style={s.chip}><Text style={[s.chipT, { color: '#4CAF50' }]}>{st.completed} done</Text></View>
                  <View style={s.chip}><Text style={[s.chipT, { color: '#FF9800' }]}>{st.active} active</Text></View>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#B0BEC5" />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: '#F5F7FA' },
  h: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E0E6EF' },
  title: { fontSize: 16, fontWeight: '800', color: '#1A237E' },
  sub: { fontSize: 12, color: '#546E7A', marginTop: 2 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF',
    marginHorizontal: 16, marginTop: 12, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1, borderColor: '#CFD8DC',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1e2a44' },
  empty: { fontSize: 13, color: '#78909C', textAlign: 'center', marginTop: 40 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12,
    padding: 12, marginBottom: 8, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  rank: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center' },
  rankT: { fontSize: 12, fontWeight: '800', color: '#1565C0' },
  name: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  dept: { fontSize: 11, color: '#78909C', marginTop: 2 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 4 },
  chip: { backgroundColor: '#F5F7FA', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  chipT: { fontSize: 10, fontWeight: '600' },
  blockedCard: { margin: 24, backgroundColor: '#FFF', borderRadius: 14, padding: 24, alignItems: 'center', gap: 10 },
  blockedTitle: { fontSize: 16, fontWeight: '800', color: '#C62828' },
  blockedBody: { fontSize: 13, color: '#546E7A', textAlign: 'center' },
  blockedBtn: { marginTop: 8, backgroundColor: '#1565C0', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  blockedBtnT: { color: '#FFF', fontWeight: '700', fontSize: 13 },
});
