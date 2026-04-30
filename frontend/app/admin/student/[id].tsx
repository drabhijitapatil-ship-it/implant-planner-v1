import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  TextInput, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import api from '../../../utils/api';
import { useAuth } from '../../../contexts/AuthContext';
import { STATUS_COLORS, STATUS_LABELS } from '../../../constants/checklist';
import { RecentActivityWidget } from '../../../components/RecentActivityWidget';

type Summary = {
  profile: { id?: string; name?: string; email?: string; role?: string; username?: string } | null;
  kpis: {
    total: number; completed: number; rejected: number; active: number;
    pending_approval: number; approval_rate: number | null;
  };
  phase_pipeline: { phase1: number; phase2: number; phase3: number; phase4: number; complete: number };
  monthly_throughput: { label: string; count: number }[];
};

type Procedure = {
  id: string;
  patient_name: string;
  registration_number?: string;
  status: string;
  implant_procedure_type?: string;
  procedure_date?: string;
  procedure_time?: string;
  created_at?: string;
  updated_at?: string;
};

type Filter = 'all' | 'active' | 'completed' | 'rejected' | 'pending_approval';

const PENDING_STATUSES = ['pending_phase1', 'pending_phase2', 'pending_stage2_surgical', 'pending_stage2_prosthetic'];
const REJECTED_STATUSES = ['rejected', 'permanently_rejected', 'stage2_surgical_rejected', 'stage2_prosthetic_rejected'];

export default function StudentDrillDown() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  // Defensive role gate — bounce non-privileged users out
  useEffect(() => {
    if (user && !['implant_incharge', 'administrator'].includes(user.role)) {
      router.replace('/(tabs)/dashboard');
    }
  }, [user, router]);

  const load = async () => {
    if (!id) return;
    try {
      const [summaryRes, procRes] = await Promise.all([
        api.get(`/admin/students/${id}/summary`),
        api.get(`/procedures?student_id=${id}`),
      ]);
      setSummary(summaryRes.data);
      setProcedures(procRes.data || []);
    } catch (e) {
      // silently fail (auth gate already protects)
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const filtered = useMemo(() => {
    let rows = procedures;
    if (filter === 'active') rows = rows.filter(p => !['completed', ...REJECTED_STATUSES].includes(p.status));
    if (filter === 'completed') rows = rows.filter(p => p.status === 'completed');
    if (filter === 'rejected') rows = rows.filter(p => REJECTED_STATUSES.includes(p.status));
    if (filter === 'pending_approval') rows = rows.filter(p => PENDING_STATUSES.includes(p.status));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(p =>
        (p.patient_name || '').toLowerCase().includes(q) ||
        (p.registration_number || '').toLowerCase().includes(q) ||
        (p.implant_procedure_type || '').toLowerCase().includes(q),
      );
    }
    return rows;
  }, [procedures, filter, search]);

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.loadingWrap}><ActivityIndicator size="large" color="#1565C0" /></View>
      </SafeAreaView>
    );
  }

  const k = summary?.kpis || { total: 0, completed: 0, active: 0, rejected: 0, pending_approval: 0, approval_rate: null };
  const pp = summary?.phase_pipeline || { phase1: 0, phase2: 0, phase3: 0, phase4: 0, complete: 0 };
  const monthly = summary?.monthly_throughput || [];
  const monthlyMax = Math.max(1, ...monthly.map(m => m.count));
  const profile = summary?.profile;
  const studentName = profile?.name || (procedures[0]?.patient_name && procedures.length ? procedures[0]?.['student_name' as any] : null) || 'Student';

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} data-testid="student-drilldown-back">
          <Ionicons name="arrow-back" size={22} color="#1565C0" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{studentName}</Text>
          <Text style={s.headerSubtitle} numberOfLines={1}>
            {profile?.email || profile?.username || 'Student performance'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        data-testid="student-drilldown-scroll"
      >
        {/* KPI tiles */}
        <View style={s.kpiGrid} data-testid="student-kpis">
          <KpiTile label="Total" value={k.total} color="#1A73E8" icon="documents-outline" />
          <KpiTile label="Completed" value={k.completed} color="#4CAF50" icon="checkmark-done-outline" />
          <KpiTile label="Active" value={k.active} color="#FF9800" icon="time-outline" />
          <KpiTile label="Rejected" value={k.rejected} color="#F44336" icon="close-circle-outline" />
          <KpiTile label="Pending Review" value={k.pending_approval} color="#7E57C2" icon="hourglass-outline" />
          <KpiTile label="Approval Rate" value={k.approval_rate == null ? '—' : `${k.approval_rate}%`} color="#26A69A" icon="trending-up-outline" />
        </View>

        {/* Phase Pipeline */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons name="git-branch-outline" size={16} color="#1565C0" />
            <Text style={s.sectionTitle}>Case Pipeline</Text>
          </View>
          <View style={s.pipelineRow}>
            <PhaseBar label="P1" value={pp.phase1} max={Math.max(1, pp.phase1, pp.phase2, pp.phase3, pp.phase4, pp.complete)} color="#90CAF9" />
            <PhaseBar label="P2" value={pp.phase2} max={Math.max(1, pp.phase1, pp.phase2, pp.phase3, pp.phase4, pp.complete)} color="#42A5F5" />
            <PhaseBar label="P3" value={pp.phase3} max={Math.max(1, pp.phase1, pp.phase2, pp.phase3, pp.phase4, pp.complete)} color="#FFB74D" />
            <PhaseBar label="P4" value={pp.phase4} max={Math.max(1, pp.phase1, pp.phase2, pp.phase3, pp.phase4, pp.complete)} color="#AB47BC" />
            <PhaseBar label="Done" value={pp.complete} max={Math.max(1, pp.phase1, pp.phase2, pp.phase3, pp.phase4, pp.complete)} color="#66BB6A" />
          </View>
        </View>

        {/* Monthly throughput sparkline */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons name="bar-chart-outline" size={16} color="#1565C0" />
            <Text style={s.sectionTitle}>Last 6 Months — Cases Completed</Text>
          </View>
          <View style={s.sparkRow}>
            {monthly.map((m, i) => (
              <View key={`m-${i}`} style={s.sparkCol}>
                <View style={s.sparkBarOuter}>
                  <View style={[s.sparkBarInner, { height: `${(m.count / monthlyMax) * 100}%` }]} />
                </View>
                <Text style={s.sparkVal}>{m.count}</Text>
                <Text style={s.sparkLbl} numberOfLines={1}>{m.label.split(' ')[0]}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Filtered case list */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons name="folder-open-outline" size={16} color="#1565C0" />
            <Text style={s.sectionTitle}>Cases ({filtered.length})</Text>
          </View>

          <View style={s.filterRow}>
            {(['all', 'active', 'pending_approval', 'completed', 'rejected'] as Filter[]).map(f => (
              <TouchableOpacity
                key={f}
                style={[s.filterPill, filter === f && s.filterPillActive]}
                onPress={() => setFilter(f)}
                data-testid={`student-filter-${f}`}
              >
                <Text style={[s.filterPillText, filter === f && s.filterPillTextActive]}>
                  {f === 'pending_approval' ? 'Pending Review' : f.charAt(0).toUpperCase() + f.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={s.searchWrap}>
            <Ionicons name="search-outline" size={16} color="#90A4AE" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by patient, reg #, procedure type"
              placeholderTextColor="#B0BEC5"
              style={s.searchInput}
              data-testid="student-cases-search"
            />
          </View>

          {filtered.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="file-tray-outline" size={28} color="#CFD8DC" />
              <Text style={s.emptyText}>No cases match this filter.</Text>
            </View>
          ) : (
            filtered.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={s.caseCard}
                onPress={() => router.push(`/procedures/${p.id}`)}
                activeOpacity={0.7}
                data-testid={`student-case-${p.id}`}
              >
                <View style={[s.caseStatusPill, { backgroundColor: (STATUS_COLORS[p.status] || '#90A4AE') + '22', borderColor: STATUS_COLORS[p.status] || '#90A4AE' }]}>
                  <Text style={[s.caseStatusText, { color: STATUS_COLORS[p.status] || '#37474F' }]}>
                    {STATUS_LABELS[p.status] || p.status}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.caseTitle} numberOfLines={1}>{p.patient_name || 'Unnamed'}</Text>
                  <Text style={s.caseMeta} numberOfLines={1}>
                    {p.implant_procedure_type || 'Procedure'}
                    {p.registration_number ? ` · ${p.registration_number}` : ''}
                  </Text>
                  {p.procedure_date && (
                    <Text style={s.caseMetaSub} numberOfLines={1}>
                      {(() => { try { return format(new Date(p.procedure_date), 'MMM dd, yyyy'); } catch { return p.procedure_date; } })()}
                      {p.procedure_time ? ` · ${p.procedure_time}` : ''}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color="#B0BEC5" />
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Recent activity for THIS student — auto-paginated */}
        <RecentActivityWidget router={router} limit={5} studentId={id as string} />
      </ScrollView>
    </SafeAreaView>
  );
}

function KpiTile({ label, value, color, icon }: { label: string; value: number | string; color: string; icon: string }) {
  return (
    <View style={[s.kpiTile, { borderLeftColor: color }]}>
      <Ionicons name={icon as any} size={16} color={color} />
      <Text style={[s.kpiValue, { color }]}>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
    </View>
  );
}

function PhaseBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <View style={s.phaseCol}>
      <View style={s.phaseBarOuter}>
        <View style={[s.phaseBarInner, { backgroundColor: color, height: `${(value / max) * 100}%` }]} />
      </View>
      <Text style={[s.phaseVal, { color }]}>{value}</Text>
      <Text style={s.phaseLbl}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F0F4F8' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E0E0E0',
  },
  backBtn: { padding: 6 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#0D47A1' },
  headerSubtitle: { fontSize: 12, color: '#78909C', marginTop: 2 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 16 },
  kpiTile: {
    flexBasis: '48%', flexGrow: 1,
    backgroundColor: '#FFF', borderRadius: 12, padding: 12,
    borderLeftWidth: 4, gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  kpiValue: { fontSize: 22, fontWeight: '800' },
  kpiLabel: { fontSize: 11, color: '#546E7A', fontWeight: '600', letterSpacing: 0.3 },

  section: { paddingHorizontal: 16, marginTop: 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1565C0' },

  pipelineRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: '#FFF', borderRadius: 14, padding: 16, gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  phaseCol: { flex: 1, alignItems: 'center', gap: 4 },
  phaseBarOuter: { width: 22, height: 80, backgroundColor: '#ECEFF1', borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' },
  phaseBarInner: { width: '100%' },
  phaseVal: { fontSize: 14, fontWeight: '800' },
  phaseLbl: { fontSize: 10, color: '#90A4AE', fontWeight: '600' },

  sparkRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: '#FFF', borderRadius: 14, padding: 16, gap: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  sparkCol: { flex: 1, alignItems: 'center', gap: 3 },
  sparkBarOuter: { width: 18, height: 60, backgroundColor: '#E3F2FD', borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  sparkBarInner: { width: '100%', backgroundColor: '#1A73E8', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  sparkVal: { fontSize: 11, fontWeight: '700', color: '#0D47A1' },
  sparkLbl: { fontSize: 9, color: '#90A4AE', fontWeight: '600' },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  filterPill: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1, borderColor: '#CFD8DC', backgroundColor: '#FFF',
  },
  filterPillActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  filterPillText: { fontSize: 11, fontWeight: '700', color: '#546E7A', letterSpacing: 0.2 },
  filterPillTextActive: { color: '#FFF' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, marginBottom: 10,
    borderRadius: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E0E0E0',
  },
  searchInput: { flex: 1, fontSize: 13, color: '#37474F', paddingVertical: 4, paddingHorizontal: 0 } as any,

  empty: { alignItems: 'center', paddingVertical: 28, gap: 6 },
  emptyText: { fontSize: 12, color: '#90A4AE', fontWeight: '600' },

  caseCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFF', borderRadius: 12, padding: 12, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  caseStatusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, alignSelf: 'flex-start' },
  caseStatusText: { fontSize: 10, fontWeight: '700' },
  caseTitle: { fontSize: 14, fontWeight: '700', color: '#0D47A1' },
  caseMeta: { fontSize: 11, color: '#546E7A', marginTop: 2 },
  caseMetaSub: { fontSize: 10, color: '#90A4AE', marginTop: 1 },
});
