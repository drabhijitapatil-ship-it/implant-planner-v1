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
import { NudgeBottomSheet } from '../../../components/NudgeBottomSheet';

type Summary = {
  profile: { id?: string; name?: string; email?: string; role?: string; username?: string } | null;
  kpis: {
    total: number; approved: number; rejected: number; pending: number; completed: number;
    stale_count: number; avg_review_hours: number | null;
    approval_rate: number | null; rejection_rate: number | null; permanent_rejection_share: number | null;
  };
  phase_approvals: { phase1: number; phase2: number; phase3: number; phase4: number };
  monthly_decisions: { label: string; approvals: number; rejections: number }[];
  supervised_students: { student_id: string; student_name: string; total: number; completed: number; active: number }[];
  peer_comparison: {
    review_time_percentile: number | null;
    rejection_rate_percentile: number | null;
    peer_median_review_hours: number | null;
    peer_median_rejection_rate: number | null;
    peer_count_review_time: number;
    peer_count_rejection_rate: number;
  };
  recent_actions: { procedure_id: string; patient_name: string; status: string; field: string; new_value: string | null; edited_at: string | null }[];
};

type Procedure = {
  id: string;
  patient_name: string;
  registration_number?: string;
  status: string;
  implant_procedure_type?: string;
  procedure_date?: string;
  procedure_time?: string;
};

type Filter = 'all' | 'pending' | 'approved' | 'rejected' | 'completed';

const PENDING_STATUSES = ['pending_phase1', 'pending_phase2', 'pending_stage2_surgical', 'pending_stage2_prosthetic'];
const REJECTED_STATUSES = ['rejected', 'permanently_rejected', 'stage2_surgical_rejected', 'stage2_prosthetic_rejected'];

export default function SupervisorDrillDown() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [nudgeOpen, setNudgeOpen] = useState(false);

  useEffect(() => {
    if (user && !['implant_incharge', 'administrator'].includes(user.role)) {
      router.replace('/(tabs)/dashboard');
    }
  }, [user, router]);

  const load = async () => {
    if (!id) return;
    try {
      const [summaryRes, procRes] = await Promise.all([
        api.get(`/admin/supervisors/${id}/summary`),
        api.get(`/procedures?supervisor_id=${id}`),
      ]);
      setSummary(summaryRes.data);
      setProcedures(procRes.data || []);
    } catch (e) {
      // gate already protects; silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const filtered = useMemo(() => {
    let rows = procedures;
    if (filter === 'pending') rows = rows.filter(p => PENDING_STATUSES.includes(p.status));
    if (filter === 'approved') rows = rows.filter(p => ['phase1_approved', 'phase2_approved', 'stage2_surgical_approved', 'stage2_prosthetic_step1_approved'].includes(p.status));
    if (filter === 'rejected') rows = rows.filter(p => REJECTED_STATUSES.includes(p.status));
    if (filter === 'completed') rows = rows.filter(p => p.status === 'completed');
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
        <View style={s.loadingWrap}><ActivityIndicator size="large" color="#6A1B9A" /></View>
      </SafeAreaView>
    );
  }

  const k = summary?.kpis || { total: 0, approved: 0, rejected: 0, pending: 0, completed: 0, stale_count: 0, avg_review_hours: null, approval_rate: null, rejection_rate: null, permanent_rejection_share: null };
  const pa = summary?.phase_approvals || { phase1: 0, phase2: 0, phase3: 0, phase4: 0 };
  const md = summary?.monthly_decisions || [];
  const mdMax = Math.max(1, ...md.map(m => Math.max(m.approvals, m.rejections)));
  const ss = summary?.supervised_students || [];
  const pc = summary?.peer_comparison || { review_time_percentile: null, rejection_rate_percentile: null, peer_median_review_hours: null, peer_median_rejection_rate: null, peer_count_review_time: 0, peer_count_rejection_rate: 0 };
  const ra = summary?.recent_actions || [];
  const profile = summary?.profile;
  const supervisorName = profile?.name || 'Supervisor';

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} data-testid="supervisor-drilldown-back">
          <Ionicons name="arrow-back" size={22} color="#6A1B9A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{supervisorName}</Text>
          <Text style={s.headerSubtitle} numberOfLines={1}>{profile?.email || profile?.username || 'Supervisor performance'}</Text>
        </View>
        <TouchableOpacity onPress={() => setNudgeOpen(true)} style={s.nudgeBtn} data-testid="open-supervisor-nudge-btn" activeOpacity={0.85}>
          <Ionicons name="megaphone-outline" size={14} color="#FFF" />
          <Text style={s.nudgeBtnText}>Nudge</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {/* Stale-review red flag banner */}
        {k.stale_count > 0 && (
          <View style={s.staleBanner} data-testid="supervisor-stale-banner">
            <Ionicons name="warning" size={16} color="#B71C1C" />
            <Text style={s.staleText}>
              <Text style={{ fontWeight: '800' }}>{k.stale_count}</Text> case{k.stale_count === 1 ? '' : 's'} have been pending review for more than 48 hours.
            </Text>
          </View>
        )}

        {/* KPI tiles */}
        <View style={s.kpiGrid} data-testid="supervisor-kpis">
          <KpiTile label="Cases Supervised" value={k.total} color="#1A73E8" icon="folder-open-outline" />
          <KpiTile label="Approved" value={k.approved} color="#4CAF50" icon="checkmark-done-outline" />
          <KpiTile label="Pending Review" value={k.pending} color="#FF9800" icon="hourglass-outline" />
          <KpiTile label="Rejected" value={k.rejected} color="#F44336" icon="close-circle-outline" />
          <KpiTile label="Stale > 48h" value={k.stale_count} color="#B71C1C" icon="alert-circle-outline" />
          <KpiTile label="Avg Review Time" value={k.avg_review_hours == null ? '—' : `${k.avg_review_hours}h`} color="#26A69A" icon="time-outline" />
          <KpiTile label="Approval Rate" value={k.approval_rate == null ? '—' : `${k.approval_rate}%`} color="#6A1B9A" icon="trending-up-outline" />
          <KpiTile label="Rejection Rate" value={k.rejection_rate == null ? '—' : `${k.rejection_rate}%`} color="#7E57C2" icon="thumbs-down-outline" />
        </View>

        {/* Peer Comparison */}
        {(pc.peer_count_review_time >= 2 || pc.peer_count_rejection_rate >= 2) && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="people-outline" size={16} color="#6A1B9A" />
              <Text style={s.sectionTitle}>Performance vs. Peers</Text>
            </View>
            <View style={s.peerRow}>
              {pc.review_time_percentile !== null && (
                <View style={[s.peerCard, pc.review_time_percentile >= 50 ? s.peerCardGood : s.peerCardWarn]}>
                  <Ionicons name={pc.review_time_percentile >= 50 ? 'rocket-outline' : 'snail-outline' as any} size={18} color={pc.review_time_percentile >= 50 ? '#1B5E20' : '#E65100'} />
                  <Text style={[s.peerHeadline, { color: pc.review_time_percentile >= 50 ? '#1B5E20' : '#E65100' }]}>
                    Faster than {pc.review_time_percentile}% of supervisors
                  </Text>
                  <Text style={s.peerSub}>Peer median: {pc.peer_median_review_hours != null ? `${pc.peer_median_review_hours}h` : '—'} · n={pc.peer_count_review_time}</Text>
                </View>
              )}
              {pc.rejection_rate_percentile !== null && (
                <View style={[s.peerCard, pc.rejection_rate_percentile <= 50 ? s.peerCardGood : s.peerCardWarn]}>
                  <Ionicons name="git-compare-outline" size={18} color={pc.rejection_rate_percentile <= 50 ? '#1B5E20' : '#E65100'} />
                  <Text style={[s.peerHeadline, { color: pc.rejection_rate_percentile <= 50 ? '#1B5E20' : '#E65100' }]}>
                    {pc.rejection_rate_percentile <= 50 ? `Rejection rate near peer median` : `Higher rejection rate than peer median`}
                  </Text>
                  <Text style={s.peerSub}>Peer median: {pc.peer_median_rejection_rate != null ? `${pc.peer_median_rejection_rate}%` : '—'} · n={pc.peer_count_rejection_rate}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Per-Phase Approval Distribution */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons name="bar-chart-outline" size={16} color="#6A1B9A" />
            <Text style={s.sectionTitle}>Per-Phase Approval Distribution</Text>
          </View>
          <View style={s.pipelineRow}>
            <PhaseBar label="P1" value={pa.phase1} max={Math.max(1, pa.phase1, pa.phase2, pa.phase3, pa.phase4)} color="#90CAF9" />
            <PhaseBar label="P2" value={pa.phase2} max={Math.max(1, pa.phase1, pa.phase2, pa.phase3, pa.phase4)} color="#42A5F5" />
            <PhaseBar label="P3" value={pa.phase3} max={Math.max(1, pa.phase1, pa.phase2, pa.phase3, pa.phase4)} color="#FFB74D" />
            <PhaseBar label="P4" value={pa.phase4} max={Math.max(1, pa.phase1, pa.phase2, pa.phase3, pa.phase4)} color="#AB47BC" />
          </View>
        </View>

        {/* Monthly decisions sparkline (paired bars: approvals + rejections) */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons name="stats-chart-outline" size={16} color="#6A1B9A" />
            <Text style={s.sectionTitle}>Last 6 Months — Review Decisions</Text>
          </View>
          <View style={s.sparkRow}>
            {md.map((m, i) => (
              <View key={`md-${i}`} style={s.sparkCol}>
                <View style={s.dualBarsRow}>
                  <View style={s.sparkBarOuter}>
                    <View style={[s.sparkBarApproved, { height: `${(m.approvals / mdMax) * 100}%` }]} />
                  </View>
                  <View style={s.sparkBarOuter}>
                    <View style={[s.sparkBarRejected, { height: `${(m.rejections / mdMax) * 100}%` }]} />
                  </View>
                </View>
                <Text style={s.sparkVal}>{m.approvals}/{m.rejections}</Text>
                <Text style={s.sparkLbl} numberOfLines={1}>{m.label.split(' ')[0]}</Text>
              </View>
            ))}
          </View>
          <View style={s.legendRow}>
            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#4CAF50' }]} /><Text style={s.legendText}>Approved</Text></View>
            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#F44336' }]} /><Text style={s.legendText}>Rejected</Text></View>
          </View>
        </View>

        {/* Supervised Students mini-list (cross-link to student drill-down) */}
        {ss.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="school-outline" size={16} color="#6A1B9A" />
              <Text style={s.sectionTitle}>Top Students Under Supervision</Text>
            </View>
            {ss.map((st, i) => (
              <TouchableOpacity
                key={`ss-${i}`}
                style={s.studentMiniCard}
                onPress={() => router.push(`/admin/student/${st.student_id}`)}
                activeOpacity={0.7}
                data-testid={`supervised-student-${i}`}
              >
                <View style={s.studentMiniRank}><Text style={s.studentMiniRankText}>#{i + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.studentMiniName} numberOfLines={1}>{st.student_name}</Text>
                  <View style={s.perfStats}>
                    <View style={s.perfChip}><Text style={[s.perfChipText, { color: '#1A73E8' }]}>{st.total} cases</Text></View>
                    <View style={s.perfChip}><Text style={[s.perfChipText, { color: '#4CAF50' }]}>{st.completed} done</Text></View>
                    <View style={s.perfChip}><Text style={[s.perfChipText, { color: '#FF9800' }]}>{st.active} active</Text></View>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#B0BEC5" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Cases under this supervisor */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons name="folder-open-outline" size={16} color="#6A1B9A" />
            <Text style={s.sectionTitle}>Cases ({filtered.length})</Text>
          </View>

          <View style={s.filterRow}>
            {(['all', 'pending', 'approved', 'rejected', 'completed'] as Filter[]).map(f => (
              <TouchableOpacity
                key={f}
                style={[s.filterPill, filter === f && s.filterPillActive]}
                onPress={() => setFilter(f)}
                data-testid={`supervisor-filter-${f}`}
              >
                <Text style={[s.filterPillText, filter === f && s.filterPillTextActive]}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
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
              data-testid="supervisor-cases-search"
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
                data-testid={`supervisor-case-${p.id}`}
              >
                <View style={[s.caseStatusPill, { backgroundColor: (STATUS_COLORS[p.status] || '#90A4AE') + '22', borderColor: STATUS_COLORS[p.status] || '#90A4AE' }]}>
                  <Text style={[s.caseStatusText, { color: STATUS_COLORS[p.status] || '#37474F' }]}>{STATUS_LABELS[p.status] || p.status}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.caseTitle} numberOfLines={1}>{p.patient_name || 'Unnamed'}</Text>
                  <Text style={s.caseMeta} numberOfLines={1}>{p.implant_procedure_type || 'Procedure'}{p.registration_number ? ` · ${p.registration_number}` : ''}</Text>
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

        {/* Recent review actions timeline */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons name="time-outline" size={16} color="#6A1B9A" />
            <Text style={s.sectionTitle}>Recent Review Actions</Text>
          </View>
          {ra.length === 0 ? (
            <View style={s.empty}><Text style={s.emptyText}>No review actions yet.</Text></View>
          ) : (
            ra.map((r, i) => (
              <TouchableOpacity
                key={`ra-${i}`}
                style={s.actionRow}
                onPress={() => router.push(`/procedures/${r.procedure_id}`)}
                activeOpacity={0.7}
                data-testid={`supervisor-action-${i}`}
              >
                <View style={s.actionDot} />
                <View style={{ flex: 1 }}>
                  <Text style={s.actionField} numberOfLines={1}>{r.field || 'edit'}: <Text style={{ color: '#37474F', fontWeight: '700' }}>{r.new_value || '—'}</Text></Text>
                  <Text style={s.actionMeta} numberOfLines={1}>
                    {r.patient_name}{r.edited_at ? ` · ${(() => { try { return format(new Date(r.edited_at), 'MMM dd, HH:mm'); } catch { return r.edited_at; } })()}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#B0BEC5" />
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      <NudgeBottomSheet
        visible={nudgeOpen}
        onClose={() => setNudgeOpen(false)}
        studentId={id as string}
        studentName={supervisorName}
        pendingCount={k.stale_count || k.pending || 0}
        pendingCaseIds={procedures.filter(p => PENDING_STATUSES.includes(p.status)).map(p => p.id).slice(0, 10)}
      />
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
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#4A148C' },
  headerSubtitle: { fontSize: 12, color: '#78909C', marginTop: 2 },
  nudgeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: '#6A1B9A',
  },
  nudgeBtnText: { fontSize: 11, fontWeight: '800', color: '#FFF', letterSpacing: 0.3 },

  staleBanner: {
    marginHorizontal: 16, marginTop: 14, padding: 12,
    backgroundColor: '#FFEBEE', borderColor: '#FFCDD2', borderWidth: 1, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  staleText: { fontSize: 12, color: '#B71C1C', flex: 1 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 16 },
  kpiTile: {
    flexBasis: '48%', flexGrow: 1,
    backgroundColor: '#FFF', borderRadius: 12, padding: 12,
    borderLeftWidth: 4, gap: 4,
  },
  kpiValue: { fontSize: 22, fontWeight: '800' },
  kpiLabel: { fontSize: 11, color: '#546E7A', fontWeight: '600', letterSpacing: 0.3 },

  section: { paddingHorizontal: 16, marginTop: 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#6A1B9A' },

  peerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  peerCard: {
    flexBasis: '48%', flexGrow: 1, padding: 12, borderRadius: 12, borderWidth: 1, gap: 4,
  },
  peerCardGood: { backgroundColor: '#E8F5E9', borderColor: '#A5D6A7' },
  peerCardWarn: { backgroundColor: '#FFF3E0', borderColor: '#FFCC80' },
  peerHeadline: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  peerSub: { fontSize: 10, color: '#546E7A', fontWeight: '600' },

  pipelineRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: '#FFF', borderRadius: 14, padding: 16, gap: 8,
  },
  phaseCol: { flex: 1, alignItems: 'center', gap: 4 },
  phaseBarOuter: { width: 22, height: 80, backgroundColor: '#ECEFF1', borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' },
  phaseBarInner: { width: '100%' },
  phaseVal: { fontSize: 14, fontWeight: '800' },
  phaseLbl: { fontSize: 10, color: '#90A4AE', fontWeight: '600' },

  sparkRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: '#FFF', borderRadius: 14, padding: 16, gap: 6,
  },
  sparkCol: { flex: 1, alignItems: 'center', gap: 3 },
  dualBarsRow: { flexDirection: 'row', gap: 2 },
  sparkBarOuter: { width: 9, height: 60, backgroundColor: '#F3E5F5', borderRadius: 3, justifyContent: 'flex-end', overflow: 'hidden' },
  sparkBarApproved: { width: '100%', backgroundColor: '#4CAF50', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  sparkBarRejected: { width: '100%', backgroundColor: '#F44336', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  sparkVal: { fontSize: 10, fontWeight: '700', color: '#4A148C' },
  sparkLbl: { fontSize: 9, color: '#90A4AE', fontWeight: '600' },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, color: '#546E7A', fontWeight: '600' },

  studentMiniCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFF', borderRadius: 12, padding: 12, marginBottom: 8,
  },
  studentMiniRank: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center' },
  studentMiniRankText: { fontSize: 11, fontWeight: '800', color: '#1565C0' },
  studentMiniName: { fontSize: 14, fontWeight: '700', color: '#0D47A1' },
  perfStats: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  perfChip: { backgroundColor: '#F5F7FA', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  perfChipText: { fontSize: 10, fontWeight: '600' },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  filterPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#CFD8DC', backgroundColor: '#FFF' },
  filterPillActive: { backgroundColor: '#6A1B9A', borderColor: '#6A1B9A' },
  filterPillText: { fontSize: 11, fontWeight: '700', color: '#546E7A', letterSpacing: 0.2 },
  filterPillTextActive: { color: '#FFF' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, marginBottom: 10,
    borderRadius: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E0E0E0',
  },
  searchInput: { flex: 1, fontSize: 13, color: '#37474F', paddingVertical: 4 } as any,

  empty: { alignItems: 'center', paddingVertical: 28, gap: 6 },
  emptyText: { fontSize: 12, color: '#90A4AE', fontWeight: '600' },

  caseCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFF', borderRadius: 12, padding: 12, marginBottom: 8,
  },
  caseStatusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, alignSelf: 'flex-start' },
  caseStatusText: { fontSize: 10, fontWeight: '700' },
  caseTitle: { fontSize: 14, fontWeight: '700', color: '#4A148C' },
  caseMeta: { fontSize: 11, color: '#546E7A', marginTop: 2 },
  caseMetaSub: { fontSize: 10, color: '#90A4AE', marginTop: 1 },

  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFF', borderRadius: 10, padding: 12, marginBottom: 6,
  },
  actionDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6A1B9A' },
  actionField: { fontSize: 12, color: '#546E7A', fontWeight: '600' },
  actionMeta: { fontSize: 10, color: '#90A4AE', marginTop: 2 },
});
