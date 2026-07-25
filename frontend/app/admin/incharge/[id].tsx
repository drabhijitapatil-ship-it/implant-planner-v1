import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import BackButton from '../../../components/BackButton';
import api from '../../../utils/api';
import { useAuth } from '../../../contexts/AuthContext';

type DeptRef = { department_id: string | null; department_name: string | null; department_color: string | null };

type Summary = {
  profile: {
    id?: string; name?: string; email?: string; role?: string; username?: string;
    profile_photo?: string; is_admin?: boolean; departments: DeptRef[];
    department_id?: string | null; department_name?: string | null; department_color?: string | null;
  } | null;
  kpis: {
    total: number; completed: number; rejected: number; pending: number;
    approval_rate: number | null; students_count: number; supervisors_count: number;
  };
  phase_pipeline: { phase1: number; phase2: number; phase3: number; phase4: number; complete: number };
  monthly_throughput: { label: string; count: number }[];
};

export default function InchargeDrillDown() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // College Admin = org owner (is_admin) — a college org's owner has
    // role="implant_incharge" with is_admin=True, so this can't gate on role.
    if (user && !user.is_admin) {
      router.replace('/(tabs)/dashboard');
    }
  }, [user, router]);

  const load = async () => {
    if (!id) return;
    try {
      const res = await api.get(`/admin/incharges/${id}/summary`);
      setSummary(res.data);
    } catch (e) {
      // silently fail (auth gate already protects)
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.loadingWrap}><ActivityIndicator size="large" color="#00695C" /></View>
      </SafeAreaView>
    );
  }

  const k = summary?.kpis || { total: 0, completed: 0, rejected: 0, pending: 0, approval_rate: null, students_count: 0, supervisors_count: 0 };
  const pp = summary?.phase_pipeline || { phase1: 0, phase2: 0, phase3: 0, phase4: 0, complete: 0 };
  const monthly = summary?.monthly_throughput || [];
  const monthlyMax = Math.max(1, ...monthly.map(m => m.count));
  const profile = summary?.profile;
  const departments = profile?.departments && profile.departments.length > 0
    ? profile.departments
    : (profile?.department_name ? [{ department_id: profile.department_id || null, department_name: profile.department_name, department_color: profile.department_color || null }] : []);
  const inchargeName = profile?.name || 'Implant In-Charge';

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <BackButton testID="incharge-drilldown-back" />
        <View style={s.identityChip}>
          {profile?.profile_photo ? (
            <Image source={{ uri: profile.profile_photo }} style={s.identityAvatarImg} />
          ) : (
            <View style={s.identityAvatar}>
              <Text style={s.identityAvatarTxt}>
                {(inchargeName?.[0] || '?').toUpperCase()}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={s.headerTitle} numberOfLines={1}>{inchargeName}</Text>
              {profile?.is_admin && (
                <View style={s.adminBadge}>
                  <Ionicons name="star" size={9} color="#B8860B" />
                  <Text style={s.adminBadgeText}>ORG ADMIN</Text>
                </View>
              )}
            </View>
            <Text style={s.headerSubtitle} numberOfLines={1}>
              {profile?.email || profile?.username || 'Implant In-Charge performance'}
            </Text>
            {departments.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {departments.map((d, idx) => (
                  <View key={d.department_id || idx} style={[s.headerDeptRow, { backgroundColor: d.department_color || '#BBDEFB' }]}>
                    <Ionicons name="business-outline" size={11} color="#37474F" />
                    <Text style={s.headerDeptText} numberOfLines={1}>{d.department_name}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        data-testid="incharge-drilldown-scroll"
      >
        {/* KPI tiles */}
        <View style={s.kpiGrid} data-testid="incharge-kpis">
          <KpiTile label="Total Cases" value={k.total} color="#1A73E8" icon="documents-outline" />
          <KpiTile label="Completed" value={k.completed} color="#4CAF50" icon="checkmark-done-outline" />
          <KpiTile label="Pending" value={k.pending} color="#FF9800" icon="time-outline" />
          <KpiTile label="Rejected" value={k.rejected} color="#F44336" icon="close-circle-outline" />
          <KpiTile label="Completion Rate" value={k.approval_rate == null ? '—' : `${k.approval_rate}%`} color="#26A69A" icon="trending-up-outline" />
          <KpiTile label="Students" value={k.students_count} color="#00695C" icon="school-outline" />
          <KpiTile label="Supervisors" value={k.supervisors_count} color="#6A1B9A" icon="people-outline" />
        </View>

        {/* Phase Pipeline */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons name="git-branch-outline" size={16} color="#00695C" />
            <Text style={s.sectionTitle}>Department Case Pipeline</Text>
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
            <Ionicons name="bar-chart-outline" size={16} color="#00695C" />
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
  identityChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#E0F2F1',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  identityAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#00695C',
    alignItems: 'center', justifyContent: 'center',
  },
  identityAvatarImg: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 2, borderColor: '#00695C',
  },
  identityAvatarTxt: { fontSize: 15, fontWeight: '800', color: '#FFF' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#00695C' },
  headerSubtitle: { fontSize: 12, color: '#546E7A', marginTop: 2 },
  headerDeptRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
  },
  headerDeptText: { fontSize: 11, color: '#37474F', fontWeight: '600' },
  adminBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#FFF8E1', borderWidth: 1, borderColor: '#FFECB3',
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999,
  },
  adminBadgeText: { fontSize: 9, fontWeight: '800', color: '#B8860B', letterSpacing: 0.2 },

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
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#00695C' },

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
  sparkBarOuter: { width: 18, height: 60, backgroundColor: '#E0F2F1', borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  sparkBarInner: { width: '100%', backgroundColor: '#00695C', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  sparkVal: { fontSize: 11, fontWeight: '700', color: '#00695C' },
  sparkLbl: { fontSize: 9, color: '#90A4AE', fontWeight: '600' },
});
