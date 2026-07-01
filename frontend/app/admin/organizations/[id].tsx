import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Image, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../utils/api';
import { useAuth } from '../../../contexts/AuthContext';
import CenteredHeader from '../../../components/CenteredHeader';

/**
 * Full metrics drill-down for a single organization — super_admin only.
 * Aggregate sections (info / KPIs / phase pipeline / monthly throughput /
 * role breakdown) render as the FlatList header; the user list itself is
 * paginated (skip/limit) and loads more as you scroll to the bottom.
 */

type OrgProfile = {
  id: string;
  name: string;
  org_type: 'college' | 'clinic';
  created_at: string | null;
  declared_num_users?: number;
  state?: string;
  state_of_registration?: string;
  state_of_practice?: string;
  registration_number?: string;
};

type OrgDetailData = {
  profile: OrgProfile;
  kpis: { total: number; pending: number; approved: number; rejected: number; completed: number };
  phase_pipeline: { phase1: number; phase2: number; phase3: number; phase4: number; completed: number; rejected: number };
  role_breakdown: Record<string, number>;
  monthly_throughput: { label: string; count: number }[];
};

type OrgUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  profile_photo?: string | null;
  created_at?: string;
};

const ROLE_LABELS: Record<string, string> = {
  implant_incharge: 'Incharge',
  supervisor: 'Supervisor',
  student: 'Student',
  nurse: 'Nurse',
  administrator: 'Admin',
  chief_dentist: 'Chief Dentist',
  dentist: 'Dentist',
  dental_assistant: 'Assistant',
};

const ROLE_COLORS: Record<string, string> = {
  administrator: '#9C27B0',
  supervisor: '#2196F3',
  implant_incharge: '#FF9800',
  student: '#4CAF50',
  nurse: '#E91E63',
  chief_dentist: '#FF9800',
  dentist: '#2196F3',
  dental_assistant: '#E91E63',
};

const PAGE_SIZE = 20;

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

export default function OrganizationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [detail, setDetail] = useState<OrgDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);

  const [users, setUsers] = useState<OrgUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersLoadingMore, setUsersLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== 'super_admin') {
      router.replace('/profile');
    }
  }, [user]);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get(`/organizations/${id}/detail`);
      setDetail(res.data);
    } catch {
    } finally {
      setDetailLoading(false);
    }
  }, [id]);

  const loadUsers = useCallback(async (skip: number, replace: boolean) => {
    if (!id) return;
    try {
      const params: any = { skip, limit: PAGE_SIZE };
      if (roleFilter) params.role = roleFilter;
      const res = await api.get(`/organizations/${id}/users`, { params });
      const page: OrgUser[] = res.data?.users || [];
      setUsersTotal(res.data?.total || 0);
      setUsers((prev) => (replace ? page : [...prev, ...page]));
    } catch {
    } finally {
      setUsersLoading(false);
      setUsersLoadingMore(false);
      setRefreshing(false);
    }
  }, [id, roleFilter]);

  useEffect(() => { loadDetail(); }, [loadDetail]);
  useEffect(() => { setUsersLoading(true); loadUsers(0, true); }, [loadUsers]);

  const onRefresh = () => {
    setRefreshing(true);
    loadDetail();
    loadUsers(0, true);
  };

  const onEndReached = () => {
    if (usersLoading || usersLoadingMore || refreshing || users.length >= usersTotal) return;
    setUsersLoadingMore(true);
    loadUsers(users.length, false);
  };

  const profile = detail?.profile;
  const kpis = detail?.kpis || { total: 0, pending: 0, approved: 0, rejected: 0, completed: 0 };
  const pp = detail?.phase_pipeline || { phase1: 0, phase2: 0, phase3: 0, phase4: 0, completed: 0, rejected: 0 };
  const monthly = detail?.monthly_throughput || [];
  const roleBreakdown = detail?.role_breakdown || {};
  const maxMonthly = Math.max(1, ...monthly.map((m) => m.count));
  const maxPipeline = Math.max(1, pp.phase1, pp.phase2, pp.phase3, pp.phase4, pp.completed);

  const availableRoles = Object.keys(roleBreakdown);

  const renderHeader = () => (
    <View>
      {detailLoading ? (
        <View style={s.loadingBox}><ActivityIndicator color="#1565C0" /></View>
      ) : (
        <>
          <View style={s.infoCard}>
            <View style={s.infoTop}>
              <View style={[s.typeIconWrap, { backgroundColor: profile?.org_type === 'clinic' ? '#E8F5E9' : '#E3F2FD' }]}>
                <Ionicons name={profile?.org_type === 'clinic' ? 'medkit' : 'school'} size={22} color={profile?.org_type === 'clinic' ? '#2E7D32' : '#1565C0'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.orgName}>{profile?.name}</Text>
                <Text style={s.orgType}>{profile?.org_type === 'clinic' ? 'Dental Clinic' : 'Dental College'}</Text>
              </View>
            </View>
            <View style={s.infoGrid}>
              {profile?.org_type === 'college' ? (
                <InfoRow icon="location-outline" label="State" value={profile?.state || '—'} />
              ) : (
                <>
                  <InfoRow icon="document-text-outline" label="Registration No." value={profile?.registration_number || '—'} />
                  <InfoRow icon="location-outline" label="Registered in" value={profile?.state_of_registration || '—'} />
                  <InfoRow icon="business-outline" label="Practicing in" value={profile?.state_of_practice || '—'} />
                </>
              )}
              <InfoRow icon="calendar-outline" label="Onboarded" value={formatDate(profile?.created_at)} />
              <InfoRow icon="people-outline" label="Planned Users" value={String(profile?.declared_num_users ?? '—')} />
            </View>
          </View>

          <Text style={s.sectionTitle}>Case KPIs</Text>
          <View style={s.kpiGrid}>
            <KpiBox label="Total" value={kpis.total} color="#0D47A1" />
            <KpiBox label="Pending" value={kpis.pending} color="#EF6C00" />
            <KpiBox label="Approved" value={kpis.approved} color="#1565C0" />
            <KpiBox label="Completed" value={kpis.completed} color="#2E7D32" />
            <KpiBox label="Rejected" value={kpis.rejected} color="#C62828" />
          </View>

          <Text style={s.sectionTitle}>Phase Pipeline</Text>
          <View style={s.pipelineCard}>
            <PipelineBar label="Phase 1" value={pp.phase1} max={maxPipeline} color="#1565C0" />
            <PipelineBar label="Phase 2" value={pp.phase2} max={maxPipeline} color="#9C27B0" />
            <PipelineBar label="Phase 3" value={pp.phase3} max={maxPipeline} color="#EF6C00" />
            <PipelineBar label="Phase 4" value={pp.phase4} max={maxPipeline} color="#00838F" />
            <PipelineBar label="Completed" value={pp.completed} max={maxPipeline} color="#2E7D32" />
          </View>

          <Text style={s.sectionTitle}>Monthly Throughput (completed cases)</Text>
          <View style={s.monthlyCard}>
            {monthly.map((m) => (
              <View key={m.label} style={s.monthlyRow}>
                <Text style={s.monthlyLabel}>{m.label}</Text>
                <View style={s.monthlyBarTrack}>
                  <View style={[s.monthlyBarFill, { width: `${(m.count / maxMonthly) * 100}%` }]} />
                </View>
                <Text style={s.monthlyCount}>{m.count}</Text>
              </View>
            ))}
          </View>

          <View style={s.usersSectionHeader}>
            <Text style={s.sectionTitle}>Users ({usersTotal})</Text>
          </View>
          {availableRoles.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.roleFilterRow}
            >
              <TouchableOpacity
                style={[s.roleFilterChip, !roleFilter && s.roleFilterChipActive]}
                onPress={() => setRoleFilter(null)}
              >
                <Text style={[s.roleFilterText, !roleFilter && s.roleFilterTextActive]}>All</Text>
              </TouchableOpacity>
              {availableRoles.map((role) => (
                <TouchableOpacity
                  key={role}
                  style={[s.roleFilterChip, roleFilter === role && s.roleFilterChipActive]}
                  onPress={() => setRoleFilter(role)}
                >
                  <Text style={[s.roleFilterText, roleFilter === role && s.roleFilterTextActive]}>
                    {ROLE_LABELS[role] || role} ({roleBreakdown[role]})
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </>
      )}
    </View>
  );

  const renderUser = ({ item }: { item: OrgUser }) => (
    <View style={s.userCard} data-testid={`org-user-${item.id}`}>
      {item.profile_photo ? (
        <Image source={{ uri: item.profile_photo }} style={s.userAvatarImage} />
      ) : (
        <View style={[s.userAvatar, { backgroundColor: ROLE_COLORS[item.role] || '#757575' }]}>
          <Text style={s.userAvatarText}>{item.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.userName} numberOfLines={1}>{item.name}</Text>
        <Text style={s.userEmail} numberOfLines={1}>{item.email}</Text>
      </View>
      <View style={[s.userRoleTag, { backgroundColor: (ROLE_COLORS[item.role] || '#757575') + '15' }]}>
        <Text style={[s.userRoleTagText, { color: ROLE_COLORS[item.role] || '#757575' }]}>{ROLE_LABELS[item.role] || item.role}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <CenteredHeader title={profile?.name || 'Organization'} subtitle={profile?.org_type === 'clinic' ? 'Dental Clinic' : 'Dental College'} fallback="/admin/organizations" />
      {usersLoading ? (
        <View style={s.loadingBox}><ActivityIndicator size="large" color="#1565C0" /></View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderUser}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={s.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={usersLoadingMore ? <ActivityIndicator color="#1565C0" style={{ marginVertical: 16 }} /> : null}
          ListEmptyComponent={
            <View style={s.emptyState}>
              <Ionicons name="people-outline" size={40} color="#CCC" />
              <Text style={s.emptyText}>No users in this organization yet</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Ionicons name={icon} size={14} color="#78909C" style={{ marginRight: 6 }} />
      <Text style={s.infoLabel}>{label}:</Text>
      <Text style={s.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function KpiBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[s.kpiBox, { borderLeftColor: color }]}>
      <Text style={[s.kpiValue, { color }]}>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
    </View>
  );
}

function PipelineBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <View style={s.pipelineRow}>
      <Text style={s.pipelineLabel}>{label}</Text>
      <View style={s.pipelineTrack}>
        <View style={[s.pipelineFill, { width: `${(value / max) * 100}%`, backgroundColor: color }]} />
      </View>
      <Text style={s.pipelineCount}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F8FC' },
  loadingBox: { paddingVertical: 60, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 40 },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 13, color: '#90A4AE', fontWeight: '600' },
  infoCard: {
    backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 18,
    borderWidth: 1, borderColor: '#E8EEF5',
    shadowColor: '#0A2540', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 1,
  },
  infoTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  typeIconWrap: { width: 46, height: 46, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  orgName: { fontSize: 18, fontWeight: '800', color: '#0D47A1' },
  orgType: { fontSize: 12, color: '#607D8B', fontWeight: '600', marginTop: 2 },
  infoGrid: { gap: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center' },
  infoLabel: { fontSize: 12.5, color: '#78909C', fontWeight: '500', marginRight: 4 },
  infoValue: { fontSize: 12.5, color: '#37474F', fontWeight: '600', flexShrink: 1 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#0D47A1', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 16 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  kpiBox: {
    flexBasis: '30%', flexGrow: 1, minWidth: 100,
    backgroundColor: '#FFF', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center',
    borderWidth: 1, borderColor: '#E8EEF5', borderLeftWidth: 4,
    shadowColor: '#0A2540', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 6, elevation: 1,
  },
  kpiValue: { fontSize: 20, fontWeight: '800' },
  kpiLabel: { fontSize: 10.5, color: '#78909C', fontWeight: '600', marginTop: 4, textAlign: 'center' },
  pipelineCard: {
    backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 18, gap: 12,
    borderWidth: 1, borderColor: '#E8EEF5',
    shadowColor: '#0A2540', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 1,
  },
  pipelineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pipelineLabel: { fontSize: 12, fontWeight: '600', color: '#546E7A', width: 72 },
  pipelineTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: '#ECEFF1', overflow: 'hidden' },
  pipelineFill: { height: '100%', borderRadius: 5 },
  pipelineCount: { fontSize: 12.5, fontWeight: '800', color: '#0D47A1', width: 28, textAlign: 'right' },
  monthlyCard: {
    backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 18, gap: 12,
    borderWidth: 1, borderColor: '#E8EEF5',
    shadowColor: '#0A2540', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 1,
  },
  monthlyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  monthlyLabel: { fontSize: 12, fontWeight: '600', color: '#546E7A', width: 66 },
  monthlyBarTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: '#ECEFF1', overflow: 'hidden' },
  monthlyBarFill: { height: '100%', borderRadius: 5, backgroundColor: '#1565C0' },
  monthlyCount: { fontSize: 12.5, fontWeight: '800', color: '#0D47A1', width: 24, textAlign: 'right' },
  usersSectionHeader: { marginTop: 8 },
  roleFilterRow: { flexDirection: 'row', gap: 8, paddingBottom: 12 },
  roleFilterChip: {
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#FFF',
    borderWidth: 1, borderColor: '#CFD8DC',
    shadowColor: '#0A2540', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.02, shadowRadius: 2,
  },
  roleFilterChipActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  roleFilterText: { fontSize: 12, color: '#546E7A', fontWeight: '600' },
  roleFilterTextActive: { color: '#FFF' },
  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF',
    borderRadius: 14, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#E8EEF5',
    shadowColor: '#0A2540', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.02, shadowRadius: 8, elevation: 1,
  },
  userAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  userAvatarImage: { width: 40, height: 40, borderRadius: 20 },
  userAvatarText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  userName: { fontSize: 14.5, fontWeight: '700', color: '#0D47A1' },
  userEmail: { fontSize: 12, color: '#607D8B', marginTop: 1 },
  userRoleTag: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  userRoleTagText: { fontSize: 10.5, fontWeight: '700' },
});
