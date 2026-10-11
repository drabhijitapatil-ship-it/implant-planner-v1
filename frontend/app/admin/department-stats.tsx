/**
 * Department / Unit statistics — Organization admin only.
 *
 * Per department and unit: members per role, case outcomes, and a per-role
 * breakdown with each member's caseload inside that department. Data comes
 * from GET /api/org/department-stats. Units are departments whose name
 * contains "Unit" (same convention as admin/departments.tsx).
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import ScrollView from '@/components/KeyboardAwareScrollView';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

type CaseStats = {
  total: number; in_progress: number; pending_approval: number; completed: number;
  terminated: number; draft: number; new_last_30_days: number;
};
type MemberRow = CaseStats & { id: string; name: string; role: string; onboarded: boolean; guest: boolean };
type Dept = {
  id: string; name: string; color: string; is_unit: boolean;
  members_total: number; members_by_role: Record<string, number>;
  cases: CaseStats; roles: Record<string, MemberRow[]>;
};
type Payload = {
  org_totals: { departments: number; units: number; members: number; cases: CaseStats };
  departments: Dept[];
};

const ROLES: { key: string; label: string; icon: any; color: string; caseload: boolean }[] = [
  { key: 'student', label: 'PG Students', icon: 'school-outline', color: '#1565C0', caseload: true },
  { key: 'supervisor', label: 'Supervisors', icon: 'person-outline', color: '#6A1B9A', caseload: true },
  { key: 'implant_incharge', label: 'Implant In-Charges', icon: 'shield-checkmark-outline', color: '#00695C', caseload: true },
  { key: 'nurse', label: 'Nurses', icon: 'medkit-outline', color: '#AD1457', caseload: false },
  { key: 'administrator', label: 'Administrators', icon: 'briefcase-outline', color: '#5D4037', caseload: false },
];

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'department', label: 'Departments' },
  { key: 'unit', label: 'Units' },
] as const;

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');

function StatChip({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <View style={[s.chip, { borderColor: color + '33', backgroundColor: color + '0F' }]}>
      <Text style={[s.chipValue, { color }]}>{value}</Text>
      <Text style={s.chipLabel}>{label}</Text>
    </View>
  );
}

function CaseRow({ c }: { c: CaseStats }) {
  return (
    <View style={s.chipRow}>
      <StatChip label="Cases" value={c.total} color="#0D47A1" />
      <StatChip label="In progress" value={c.in_progress} color="#1565C0" />
      <StatChip label="Awaiting approval" value={c.pending_approval} color="#E65100" />
      <StatChip label="Completed" value={c.completed} color="#2E7D32" />
      <StatChip label="Ended early" value={c.terminated} color="#C62828" />
      <StatChip label="Completion" value={pct(c.completed, c.total)} color="#00695C" />
      <StatChip label="New (30 days)" value={c.new_last_30_days} color="#5E35B1" />
      {c.draft > 0 && <StatChip label="Drafts" value={c.draft} color="#78909C" />}
    </View>
  );
}

function DeptCard({ d, initialOpen = false, onLayoutY }: { d: Dept; initialOpen?: boolean; onLayoutY?: (y: number) => void }) {
  const [open, setOpen] = useState(initialOpen);
  const roleTabs = ROLES.filter((r) => (d.roles[r.key] || []).length > 0);
  const [role, setRole] = useState<string | null>(null);
  const activeRole = role && roleTabs.some((r) => r.key === role) ? role : roleTabs[0]?.key;
  const meta = ROLES.find((r) => r.key === activeRole);
  const rows = (activeRole && d.roles[activeRole]) || [];

  return (
    <View
      style={[s.card, { borderLeftColor: d.color }]}
      testID={`dept-card-${d.id}`}
      onLayout={onLayoutY ? (e) => onLayoutY(e.nativeEvent.layout.y) : undefined}
    >
      <TouchableOpacity onPress={() => setOpen((v) => !v)} activeOpacity={0.7} testID={`dept-toggle-${d.id}`}>
        <View style={s.cardHead}>
          <View style={[s.dot, { backgroundColor: d.color }]} />
          <Text style={s.cardTitle} numberOfLines={2}>{d.name}</Text>
          {d.is_unit && <View style={s.unitBadge}><Text style={s.unitBadgeText}>UNIT</Text></View>}
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#78909C" />
        </View>
        <Text style={s.cardSub}>
          {d.members_total} member{d.members_total === 1 ? '' : 's'}
          {ROLES.filter((r) => d.members_by_role[r.key]).map((r) => `  ·  ${d.members_by_role[r.key]} ${r.label}`).join('')}
        </Text>
        <CaseRow c={d.cases} />
      </TouchableOpacity>

      {open && (
        <View style={s.breakdown} testID={`dept-breakdown-${d.id}`}>
          <Text style={s.breakdownTitle}>By role</Text>
          {roleTabs.length === 0 ? (
            <Text style={s.empty}>No members or case activity yet.</Text>
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {roleTabs.map((r) => {
                  const active = r.key === activeRole;
                  return (
                    <TouchableOpacity
                      key={r.key}
                      onPress={() => setRole(r.key)}
                      style={[s.roleTab, active && { backgroundColor: r.color, borderColor: r.color }]}
                      testID={`dept-${d.id}-role-${r.key}`}
                    >
                      <Ionicons name={r.icon} size={14} color={active ? '#FFF' : r.color} />
                      <Text style={[s.roleTabText, { color: active ? '#FFF' : r.color }]}>
                        {r.label} ({d.members_by_role[r.key] || 0})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {meta?.caseload && (
                <View style={s.tableHead}>
                  <Text style={[s.th, { flex: 2.4, textAlign: 'left' }]}>Name</Text>
                  <Text style={s.th}>Cases</Text>
                  <Text style={s.th}>Active</Text>
                  <Text style={s.th}>Pending</Text>
                  <Text style={s.th}>Done</Text>
                </View>
              )}
              {rows.map((m) => (
                <View key={`${m.id}-${m.guest}`} style={s.tr} testID={`dept-${d.id}-member-${m.id}`}>
                  <View style={{ flex: 2.4 }}>
                    <Text style={s.memberName} numberOfLines={1}>{m.name}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                      {m.guest && <Text style={[s.tag, s.tagGuest]}>From another dept</Text>}
                      {!m.onboarded && !m.guest && <Text style={[s.tag, s.tagPending]}>Not logged in yet</Text>}
                    </View>
                  </View>
                  {meta?.caseload ? (
                    <>
                      <Text style={s.td}>{m.total}</Text>
                      <Text style={s.td}>{m.in_progress}</Text>
                      <Text style={[s.td, m.pending_approval > 0 && { color: '#E65100', fontWeight: '700' }]}>{m.pending_approval}</Text>
                      <Text style={[s.td, { color: '#2E7D32' }]}>{m.completed}</Text>
                    </>
                  ) : null}
                </View>
              ))}
              {meta?.caseload && (
                <Text style={s.footnote}>
                  Counts are this {d.is_unit ? 'unit' : 'department'}'s cases only. "Active" = in progress, "Pending" = awaiting approval.
                </Text>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

export default function DepartmentStatsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  // ?dept=<id> (from the Home "Departments & Units" rows) → open + scroll to it.
  const { dept: focusDept } = useLocalSearchParams<{ dept?: string }>();
  const scrollRef = useRef<any>(null);
  const scrolledTo = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await api.get('/org/department-stats');
      setData(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not load statistics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const list = useMemo(() => {
    const all = data?.departments || [];
    if (filter === 'unit') return all.filter((d) => d.is_unit);
    if (filter === 'department') return all.filter((d) => !d.is_unit);
    return all;
  }, [data, filter]);

  if (!user?.is_admin) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.center}><Text style={s.empty}>Only the organization admin can view this page.</Text></View>
      </SafeAreaView>
    );
  }

  const t = data?.org_totals;
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} testID="dept-stats-back">
          <Ionicons name="arrow-back" size={22} color="#1A1A1A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Departments & Units</Text>
          <Text style={s.subtitle}>Statistics by department, unit and role</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#1565C0" /></View>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {error ? (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => { setLoading(true); load(); }} style={s.retryBtn}>
                <Text style={s.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : t ? (
            <>
              <View style={s.summary} testID="dept-stats-summary">
                <Text style={s.summaryTitle}>Organization</Text>
                <Text style={s.cardSub}>
                  {t.departments} department{t.departments === 1 ? '' : 's'}  ·  {t.units} unit{t.units === 1 ? '' : 's'}  ·  {t.members} members
                </Text>
                <CaseRow c={t.cases} />
              </View>

              <View style={s.filterRow}>
                {FILTERS.map((f) => (
                  <TouchableOpacity
                    key={f.key}
                    onPress={() => setFilter(f.key)}
                    style={[s.filterBtn, filter === f.key && s.filterBtnActive]}
                    testID={`dept-filter-${f.key}`}
                  >
                    <Text style={[s.filterText, filter === f.key && s.filterTextActive]}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {list.length === 0 ? (
                <Text style={[s.empty, { marginTop: 24 }]}>
                  {filter === 'unit' ? 'No units yet.' : filter === 'department' ? 'No departments yet.' : 'No departments or units yet.'}
                </Text>
              ) : (
                list.map((d) => (
                  <DeptCard
                    key={d.id}
                    d={d}
                    initialOpen={d.id === focusDept}
                    onLayoutY={
                      d.id === focusDept
                        ? (y) => {
                            if (scrolledTo.current === d.id) return;
                            scrolledTo.current = d.id;
                            setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true }), 150);
                          }
                        : undefined
                    }
                  />
                ))
              )}
            </>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F5F7' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  subtitle: { fontSize: 12, color: '#777', marginTop: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  summary: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E8EDF5' },
  summaryTitle: { fontSize: 16, fontWeight: '800', color: '#0D47A1' },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#D0DCE8', backgroundColor: '#FFF', alignItems: 'center' },
  filterBtnActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  filterText: { fontSize: 13, fontWeight: '600', color: '#546E7A' },
  filterTextActive: { color: '#FFF' },
  card: {
    backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#E8EDF5', borderLeftWidth: 4,
    shadowColor: '#1565C0', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#1A2332' },
  cardSub: { fontSize: 12, color: '#607D8B', marginTop: 4 },
  unitBadge: { backgroundColor: '#EDE7F6', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  unitBadgeText: { fontSize: 10, fontWeight: '800', color: '#5E35B1', letterSpacing: 0.5 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, minWidth: 72 },
  chipValue: { fontSize: 16, fontWeight: '800' },
  chipLabel: { fontSize: 10, color: '#607D8B', marginTop: 1 },
  breakdown: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#ECEFF1' },
  breakdownTitle: { fontSize: 13, fontWeight: '700', color: '#37474F', marginBottom: 8 },
  roleTab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: '#CFD8DC', backgroundColor: '#FFF' },
  roleTabText: { fontSize: 12, fontWeight: '700' },
  tableHead: { flexDirection: 'row', marginTop: 12, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  th: { flex: 1, fontSize: 11, fontWeight: '700', color: '#78909C', textAlign: 'right' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  td: { flex: 1, fontSize: 13, color: '#263238', textAlign: 'right' },
  memberName: { fontSize: 13, fontWeight: '600', color: '#1A2332' },
  tag: { fontSize: 10, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, overflow: 'hidden' },
  tagGuest: { backgroundColor: '#E3F2FD', color: '#1565C0' },
  tagPending: { backgroundColor: '#FFF3E0', color: '#E65100' },
  footnote: { fontSize: 11, color: '#90A4AE', marginTop: 8 },
  empty: { fontSize: 13, color: '#78909C', textAlign: 'center' },
  errorBox: { backgroundColor: '#FFEBEE', borderRadius: 12, padding: 16, alignItems: 'center', gap: 10 },
  errorText: { color: '#C62828', fontSize: 13, textAlign: 'center' },
  retryBtn: { backgroundColor: '#C62828', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  retryText: { color: '#FFF', fontWeight: '700' },
});
