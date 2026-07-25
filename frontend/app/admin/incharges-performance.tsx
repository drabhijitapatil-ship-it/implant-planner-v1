/**
 * Full Implant In-Charge Performance directory — reached from the
 * dashboard's "Show more" button under the top-3 preview. College Admin
 * only. An incharge tagged to 2 departments at once shows both.
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
import { getDepartmentBadgeColors } from '../../utils/departmentBadge';

type DeptRef = { department_id: string | null; department_name: string | null; department_color: string | null };

type InchargeRow = {
  incharge_id: string;
  incharge_name: string;
  total: number;
  completed: number;
  pending: number;
  rejected?: number;
  students_count?: number;
  supervisors_count?: number;
  departments?: DeptRef[];
  department_name?: string | null;
  department_color?: string | null;
};

export default function InchargesPerformanceScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  // College Admin = org owner (is_admin) — a college org's owner has
  // role="implant_incharge" with is_admin=True, so this can't gate on role.
  const canAccess = !!user?.is_admin;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<InchargeRow[]>([]);
  const [query, setQuery] = useState('');

  const [selectedDept, setSelectedDept] = useState<string>('all');

  const load = useCallback(async () => {
    try {
      const res = await api.get('/admin/incharges');
      setRows((res.data?.incharges || []).filter((ic: InchargeRow) => ic.incharge_name));
    } catch {
      // Silent — screen shows an empty state below.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { if (canAccess) load(); else if (!authLoading) setLoading(false); }, [canAccess, authLoading, load]);

  const deptsOf = (r: InchargeRow): DeptRef[] =>
    r.departments && r.departments.length > 0
      ? r.departments
      : r.department_name
        ? [{ department_id: null, department_name: r.department_name, department_color: r.department_color || null }]
        : [];

  const departments = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => deptsOf(r).forEach((d) => d.department_name && set.add(d.department_name)));
    return Array.from(set).sort();
  }, [rows]);

  const hasUnassigned = useMemo(() => rows.some((r) => deptsOf(r).length === 0), [rows]);

  const deptColorByName = useMemo(() => {
    const map: Record<string, string> = {};
    rows.forEach((r) => deptsOf(r).forEach((d) => {
      if (d.department_name && d.department_color && !map[d.department_name]) {
        map[d.department_name] = d.department_color;
      }
    }));
    return map;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = [...rows].sort((a, b) => (b.total || 0) - (a.total || 0));
    if (selectedDept !== 'all') {
      if (selectedDept === 'unassigned') {
        list = list.filter((r) => deptsOf(r).length === 0);
      } else {
        list = list.filter((r) => deptsOf(r).some((d) => d.department_name === selectedDept));
      }
    }
    if (!q) return list;
    return list.filter((r) => (r.incharge_name || '').toLowerCase().includes(q));
  }, [rows, query, selectedDept]);

  if (authLoading || loading) {
    return <SafeAreaView style={s.c}><ActivityIndicator size="large" color="#00695C" style={{ marginTop: 80 }} /></SafeAreaView>;
  }

  if (!canAccess) {
    return (
      <SafeAreaView style={s.c}>
        <View style={s.blockedCard}>
          <Ionicons name="lock-closed-outline" size={36} color="#C62828" />
          <Text style={s.blockedTitle}>Access denied</Text>
          <Text style={s.blockedBody}>Only the organization admin can view Implant In-Charge performance.</Text>
          <TouchableOpacity style={s.blockedBtn} onPress={() => router.back()}><Text style={s.blockedBtnT}>Go back</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.c} edges={['top', 'bottom']}>
      <View style={s.h}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }} data-testid="incharges-perf-back" testID="incharges-perf-back">
          <Ionicons name="arrow-back" size={22} color="#00695C" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={s.title}>Implant In-Charge Performance</Text>
          <Text style={s.sub}>{rows.length} in-charge{rows.length === 1 ? '' : 's'}</Text>
        </View>
      </View>

      <View style={s.searchBox}>
        <Ionicons name="search" size={16} color="#78909C" />
        <TextInput
          style={s.searchInput}
          placeholder="Search in-charge by name"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          data-testid="incharges-perf-search"
          testID="incharges-perf-search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} data-testid="incharges-perf-search-clear">
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
              const count = rows.filter((r) => deptsOf(r).some((d) => d.department_name === dept)).length;
              const active = selectedDept === dept;
              const color = deptColorByName[dept] || '#E1BEE7';
              return (
                <TouchableOpacity
                  key={dept}
                  style={[s.deptChip, active && { backgroundColor: color, borderColor: color }]}
                  onPress={() => setSelectedDept(dept)}
                  data-testid={`dept-filter-${dept}`}
                >
                  {!active && <View style={[s.deptChipDot, { backgroundColor: color }]} />}
                  <Text style={[s.deptChipText, active && s.deptChipTextActiveDark]}>
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
                  Unassigned ({rows.filter((r) => deptsOf(r).length === 0).length})
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
          <Text style={s.empty}>{query || selectedDept !== 'all' ? 'No in-charges match your filter.' : 'No Implant In-Charge data yet.'}</Text>
        ) : (
          filtered.map((ic, idx) => {
            const decided = (ic.completed || 0) + (ic.rejected || 0);
            const completionRate = decided > 0 ? Math.round(((ic.completed || 0) / decided) * 100) : null;
            const rowDepts = deptsOf(ic);
            return (
              <TouchableOpacity
                key={ic.incharge_id}
                style={s.card}
                activeOpacity={0.7}
                onPress={() => router.push(`/admin/incharge/${ic.incharge_id}`)}
                data-testid={`incharges-perf-row-${idx}`}
              >
                <View style={s.rank}><Text style={s.rankT}>#{idx + 1}</Text></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.name} numberOfLines={1} ellipsizeMode="tail">{ic.incharge_name}</Text>
                  {rowDepts.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 3, marginBottom: 2 }}>
                      {rowDepts.map((d, dIdx) => {
                        const colors = getDepartmentBadgeColors(d.department_color);
                        return (
                          <View
                            key={d.department_id || dIdx}
                            style={[
                              s.deptTag,
                              { backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1 }
                            ]}
                          >
                            <View style={[s.deptChipDot, { backgroundColor: colors.dot }]} />
                            <Text style={[s.deptText, { color: colors.text }]} numberOfLines={1}>
                              {d.department_name}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                  <View style={s.stats}>
                    <View style={s.chip}><Text style={[s.chipT, { color: '#1A73E8' }]}>{ic.total} cases</Text></View>
                    <View style={s.chip}><Text style={[s.chipT, { color: '#4CAF50' }]}>{ic.completed} completed</Text></View>
                    <View style={s.chip}><Text style={[s.chipT, { color: '#FF9800' }]}>{ic.pending} pending</Text></View>
                    <View style={s.chip}><Text style={[s.chipT, { color: '#00695C' }]}>{ic.students_count || 0} students</Text></View>
                    {completionRate !== null && (
                      <View style={s.chip}><Text style={[s.chipT, { color: '#6A1B9A' }]}>{completionRate}% completion</Text></View>
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
  title: { fontSize: 16, fontWeight: '800', color: '#00695C' },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CFD8DC',
  },
  deptChipDot: { width: 7, height: 7, borderRadius: 3.5 },
  deptChipActive: {
    backgroundColor: '#00695C',
    borderColor: '#00695C',
  },
  deptChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#455A64',
  },
  deptChipTextActive: {
    color: '#FFFFFF',
  },
  deptChipTextActiveDark: {
    color: '#37474F',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1e2a44' },
  empty: { fontSize: 13, color: '#78909C', textAlign: 'center', marginTop: 40 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 14,
    padding: 10, paddingRight: 8, marginBottom: 8, gap: 8, borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  rank: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#E0F2F1', justifyContent: 'center', alignItems: 'center' },
  rankT: { fontSize: 12, fontWeight: '800', color: '#00695C' },
  name: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  deptTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 12, alignSelf: 'flex-start',
    marginRight: 4, marginBottom: 4, maxWidth: '100%',
  },
  deptText: { fontSize: 10.5, fontWeight: '700' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 },
  chip: { backgroundColor: '#F1F5F9', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2.5, marginRight: 4, marginBottom: 4 },
  chipT: { fontSize: 10, fontWeight: '700' },
  blockedCard: { margin: 24, backgroundColor: '#FFF', borderRadius: 14, padding: 24, alignItems: 'center', gap: 10 },
  blockedTitle: { fontSize: 16, fontWeight: '800', color: '#C62828' },
  blockedBody: { fontSize: 13, color: '#546E7A', textAlign: 'center' },
  blockedBtn: { marginTop: 8, backgroundColor: '#1565C0', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  blockedBtnT: { color: '#FFF', fontWeight: '700', fontSize: 13 },
});
