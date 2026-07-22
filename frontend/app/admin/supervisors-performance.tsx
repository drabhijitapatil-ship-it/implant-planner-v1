/**
 * Full Supervisor Performance directory — reached from the dashboard's
 * "Show more" button under the top-3 preview. Search-as-you-type filter
 * on supervisor name so this stays usable as the faculty roster grows.
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

type SupervisorRow = {
  supervisor_id: string;
  supervisor_name: string;
  total: number;
  approved: number;
  pending: number;
  rejected?: number;
  department_name?: string | null;
};

export default function SupervisorsPerformanceScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const canAccess = user?.role === 'implant_incharge' || user?.role === 'administrator' || user?.role === 'supervisor';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<SupervisorRow[]>([]);
  const [query, setQuery] = useState('');

  const [selectedDept, setSelectedDept] = useState<string>('all');

  const load = useCallback(async () => {
    try {
      const res = await api.get('/dashboard/stats');
      setRows((res.data?.supervisor_stats || []).filter((sp: SupervisorRow) => sp.supervisor_name));
    } catch {
      // Silent — screen shows an empty state below.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { if (canAccess) load(); else if (!authLoading) setLoading(false); }, [canAccess, authLoading, load]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.department_name) set.add(r.department_name);
    });
    return Array.from(set).sort();
  }, [rows]);

  const hasUnassigned = useMemo(() => rows.some((r) => !r.department_name), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = [...rows].sort((a, b) => (b.approved || 0) - (a.approved || 0));
    if (selectedDept !== 'all') {
      if (selectedDept === 'unassigned') {
        list = list.filter((r) => !r.department_name);
      } else {
        list = list.filter((r) => r.department_name === selectedDept);
      }
    }
    if (!q) return list;
    return list.filter((r) => (r.supervisor_name || '').toLowerCase().includes(q));
  }, [rows, query, selectedDept]);

  if (authLoading || loading) {
    return <SafeAreaView style={s.c}><ActivityIndicator size="large" color="#6A1B9A" style={{ marginTop: 80 }} /></SafeAreaView>;
  }

  if (!canAccess) {
    return (
      <SafeAreaView style={s.c}>
        <View style={s.blockedCard}>
          <Ionicons name="lock-closed-outline" size={36} color="#C62828" />
          <Text style={s.blockedTitle}>Access denied</Text>
          <Text style={s.blockedBody}>Only Supervisor, Implant In-Charge and Administrator accounts can view supervisor performance.</Text>
          <TouchableOpacity style={s.blockedBtn} onPress={() => router.back()}><Text style={s.blockedBtnT}>Go back</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.c} edges={['top', 'bottom']}>
      <View style={s.h}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }} data-testid="supervisors-perf-back" testID="supervisors-perf-back">
          <Ionicons name="arrow-back" size={22} color="#6A1B9A" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={s.title}>Supervisor Performance</Text>
          <Text style={s.sub}>{rows.length} supervisor{rows.length === 1 ? '' : 's'}</Text>
        </View>
      </View>

      <View style={s.searchBox}>
        <Ionicons name="search" size={16} color="#78909C" />
        <TextInput
          style={s.searchInput}
          placeholder="Search supervisor by name"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          data-testid="supervisors-perf-search"
          testID="supervisors-perf-search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} data-testid="supervisors-perf-search-clear">
            <Ionicons name="close-circle" size={16} color="#B0BEC5" />
          </TouchableOpacity>
        )}
      </View>

      {(departments.length > 0 || hasUnassigned) && (
        <View style={{ height: 48 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.deptFilterBar}
          >
            <TouchableOpacity
              style={[s.deptChip, selectedDept === 'all' && s.deptChipActive]}
              onPress={() => setSelectedDept('all')}
              data-testid="dept-filter-all"
            >
              <Text style={[s.deptChipText, selectedDept === 'all' && s.deptChipTextActive]}>
                All ({rows.length})
              </Text>
            </TouchableOpacity>
            {departments.map((dept) => {
              const count = rows.filter((r) => r.department_name === dept).length;
              const active = selectedDept === dept;
              return (
                <TouchableOpacity
                  key={dept}
                  style={[s.deptChip, active && s.deptChipActive]}
                  onPress={() => setSelectedDept(dept)}
                  data-testid={`dept-filter-${dept}`}
                >
                  <Text style={[s.deptChipText, active && s.deptChipTextActive]}>
                    {dept} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
            {hasUnassigned && (
              <TouchableOpacity
                style={[s.deptChip, selectedDept === 'unassigned' && s.deptChipActive]}
                onPress={() => setSelectedDept('unassigned')}
                data-testid="dept-filter-unassigned"
              >
                <Text style={[s.deptChipText, selectedDept === 'unassigned' && s.deptChipTextActive]}>
                  Unassigned ({rows.filter((r) => !r.department_name).length})
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {filtered.length === 0 ? (
          <Text style={s.empty}>{query || selectedDept !== 'all' ? 'No supervisors match your filter.' : 'No supervisor data yet.'}</Text>
        ) : (
          filtered.map((sp, idx) => {
            const decided = (sp.approved || 0) + (sp.rejected || 0);
            const approvalRate = decided > 0 ? Math.round(((sp.approved || 0) / decided) * 100) : null;
            return (
              <TouchableOpacity
                key={sp.supervisor_id}
                style={s.card}
                activeOpacity={0.7}
                onPress={() => router.push(`/admin/supervisor/${sp.supervisor_id}`)}
                data-testid={`supervisors-perf-row-${idx}`}
              >
                <View style={s.rank}><Text style={s.rankT}>#{idx + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{sp.supervisor_name}</Text>
                  {sp.department_name ? (
                    <View style={s.deptTag}>
                      <Ionicons name="business-outline" size={11} color="#37474F" />
                      <Text style={s.deptText} numberOfLines={1}>{sp.department_name}</Text>
                    </View>
                  ) : null}
                  <View style={s.stats}>
                    <View style={s.chip}><Text style={[s.chipT, { color: '#1A73E8' }]}>{sp.total} cases</Text></View>
                    <View style={s.chip}><Text style={[s.chipT, { color: '#4CAF50' }]}>{sp.approved} approved</Text></View>
                    <View style={s.chip}><Text style={[s.chipT, { color: '#FF9800' }]}>{sp.pending} pending</Text></View>
                    {approvalRate !== null && (
                      <View style={s.chip}><Text style={[s.chipT, { color: '#6A1B9A' }]}>{approvalRate}% approval</Text></View>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#B0BEC5" />
              </TouchableOpacity>
            );
          })
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
    marginHorizontal: 16, marginTop: 12, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1, borderColor: '#CFD8DC',
  },
  deptFilterBar: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 8,
    alignItems: 'center',
  },
  deptChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CFD8DC',
  },
  deptChipActive: {
    backgroundColor: '#6A1B9A',
    borderColor: '#6A1B9A',
  },
  deptChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#455A64',
  },
  deptChipTextActive: {
    color: '#FFFFFF',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1e2a44' },
  empty: { fontSize: 13, color: '#78909C', textAlign: 'center', marginTop: 40 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 14,
    padding: 12, marginBottom: 8, gap: 12, borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  rank: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F3E5F5', justifyContent: 'center', alignItems: 'center' },
  rankT: { fontSize: 12, fontWeight: '800', color: '#6A1B9A' },
  name: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  deptTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECEFF1',
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start', marginTop: 3, marginBottom: 2,
  },
  deptText: { fontSize: 11, fontWeight: '700', color: '#37474F' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { backgroundColor: '#F5F7FA', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  chipT: { fontSize: 10.5, fontWeight: '700' },
  blockedCard: { margin: 24, backgroundColor: '#FFF', borderRadius: 14, padding: 24, alignItems: 'center', gap: 10 },
  blockedTitle: { fontSize: 16, fontWeight: '800', color: '#C62828' },
  blockedBody: { fontSize: 13, color: '#546E7A', textAlign: 'center' },
  blockedBtn: { marginTop: 8, backgroundColor: '#1565C0', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  blockedBtnT: { color: '#FFF', fontWeight: '700', fontSize: 13 },
});
