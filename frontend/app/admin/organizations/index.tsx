import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import api from '../../../utils/api';
import { useAuth } from '../../../contexts/AuthContext';
import CenteredHeader from '../../../components/CenteredHeader';

/**
 * Cross-org oversight screen — super_admin only. Lists every dental college
 * and clinic onboarded on the platform with their signup details plus live
 * headcount / case counts, so a platform admin can see everything of
 * everyone without hunting through individual org dashboards.
 */

type OrgDetail = {
  id: string;
  name: string;
  org_type: 'college' | 'clinic';
  created_at: string | null;
  declared_num_users?: number;
  actual_user_count: number;
  role_breakdown: Record<string, number>;
  cases_total: number;
  state?: string;
  state_of_registration?: string;
  state_of_practice?: string;
  registration_number?: string;
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

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

const PAGE_SIZE = 20;

export default function OrganizationsScreen() {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<OrgDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user && user.role !== 'super_admin') {
      router.replace('/profile');
    }
  }, [user]);

  const load = useCallback(async (skip: number, replace: boolean) => {
    try {
      const res = await api.get('/organizations/details', { params: { skip, limit: PAGE_SIZE } });
      const page: OrgDetail[] = res.data?.organizations || [];
      setTotal(res.data?.total || 0);
      setOrgs((prev) => (replace ? page : [...prev, ...page]));
    } catch {
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(0, true); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(0, true); };

  const onEndReached = () => {
    if (loading || loadingMore || refreshing || orgs.length >= total) return;
    setLoadingMore(true);
    load(orgs.length, false);
  };

  const renderOrg = ({ item }: { item: OrgDetail }) => (
    <TouchableOpacity
      style={s.card}
      activeOpacity={0.85}
      onPress={() => router.push(`/admin/organizations/${item.id}`)}
      data-testid={`org-card-${item.id}`}
    >
      <View style={s.cardTop}>
        <View style={[s.typeIconWrap, { backgroundColor: item.org_type === 'clinic' ? '#E8F5E9' : '#E3F2FD' }]}>
          <Ionicons
            name={item.org_type === 'clinic' ? 'medkit' : 'school'}
            size={20}
            color={item.org_type === 'clinic' ? '#2E7D32' : '#1565C0'}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.orgName} numberOfLines={2}>{item.name}</Text>
          <View style={[s.typeTag, { backgroundColor: item.org_type === 'clinic' ? '#E8F5E9' : '#E3F2FD' }]}>
            <Text style={[s.typeTagText, { color: item.org_type === 'clinic' ? '#2E7D32' : '#1565C0' }]}>
              {item.org_type === 'clinic' ? 'Dental Clinic' : 'Dental College'}
            </Text>
          </View>
        </View>
      </View>

      <View style={s.detailsGrid}>
        {item.org_type === 'college' ? (
          <DetailRow icon="location-outline" label="State" value={item.state || '—'} />
        ) : (
          <>
            <DetailRow icon="document-text-outline" label="Registration No." value={item.registration_number || '—'} />
            <DetailRow icon="location-outline" label="Registered in" value={item.state_of_registration || '—'} />
            <DetailRow icon="business-outline" label="Practicing in" value={item.state_of_practice || '—'} />
          </>
        )}
        <DetailRow icon="calendar-outline" label="Onboarded" value={formatDate(item.created_at)} />
      </View>

      <View style={s.statsRow}>
        <View style={s.statBox}>
          <Text style={s.statValue}>{item.actual_user_count}</Text>
          <Text style={s.statLabel}>Users{item.declared_num_users ? ` / ${item.declared_num_users} planned` : ''}</Text>
        </View>
        <View style={s.statBox}>
          <Text style={s.statValue}>{item.cases_total}</Text>
          <Text style={s.statLabel}>Cases</Text>
        </View>
      </View>

      {Object.keys(item.role_breakdown).length > 0 && (
        <View style={s.roleChipsRow}>
          {Object.entries(item.role_breakdown).map(([role, count]) => (
            <View key={role} style={[s.roleChip, { backgroundColor: (ROLE_COLORS[role] || '#757575') + '15' }]}>
              <Text style={[s.roleChipText, { color: ROLE_COLORS[role] || '#757575' }]}>
                {ROLE_LABELS[role] || role}: {count}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={s.viewMoreRow}>
        <Text style={s.viewMoreText}>View full details</Text>
        <Ionicons name="chevron-forward" size={14} color="#1565C0" />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <CenteredHeader title="Organizations" subtitle={`${total} onboarded`} fallback="/profile" />
      {loading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color="#1565C0" />
        </View>
      ) : (
        <FlatList
          data={orgs}
          keyExtractor={(item) => item.id}
          renderItem={renderOrg}
          contentContainerStyle={s.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#1565C0" style={{ marginVertical: 16 }} /> : null}
          ListEmptyComponent={
            <View style={s.emptyState}>
              <Ionicons name="business-outline" size={48} color="#CCC" />
              <Text style={s.emptyText}>No organizations onboarded yet</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function DetailRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Ionicons name={icon} size={14} color="#78909C" style={{ marginRight: 6 }} />
      <Text style={s.detailLabel}>{label}:</Text>
      <Text style={s.detailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F8FC' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16, paddingBottom: 40 },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 14, color: '#90A4AE', fontWeight: '600' },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E8EEF5',
    shadowColor: '#0A2540',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 1,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  typeIconWrap: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  orgName: { fontSize: 17, fontWeight: '800', color: '#0D47A1', marginBottom: 6 },
  typeTag: { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  typeTagText: { fontSize: 11, fontWeight: '700' },
  detailsGrid: { gap: 6, marginBottom: 12, paddingLeft: 2 },
  detailRow: { flexDirection: 'row', alignItems: 'center' },
  detailLabel: { fontSize: 12, color: '#78909C', marginRight: 4 },
  detailValue: { fontSize: 12, color: '#37474F', fontWeight: '600', flexShrink: 1 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statBox: {
    flex: 1,
    backgroundColor: '#F5F8FC',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8EEF5',
  },
  statValue: { fontSize: 20, fontWeight: '800', color: '#0D47A1' },
  statLabel: { fontSize: 11, color: '#78909C', marginTop: 2 },
  roleChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  roleChip: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  roleChipText: { fontSize: 11, fontWeight: '700' },
  viewMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F4F8',
  },
  viewMoreText: { fontSize: 12, color: '#1565C0', fontWeight: '700' },
});
