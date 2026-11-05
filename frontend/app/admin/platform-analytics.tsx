// Super Admin → Platform Analytics: cross-organization numbers from
// GET /platform/analytics — organizations and plans, users and activity,
// cases and their pipeline, top institutions, and what needs attention.
import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import ScrollView from '@/components/KeyboardAwareScrollView';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import api from '../../utils/api';
import CenteredHeader from '../../components/CenteredHeader';
import { formatISTDate } from '../../utils/istTime';

const ROLE_LABEL: Record<string, string> = {
  student: 'Students', supervisor: 'Supervisors', implant_incharge: 'In-Charges / clinic heads',
  administrator: 'Administrators', nurse: 'Nurses', super_admin: 'Super admins',
};
const STATUS_LABEL: Record<string, string> = {
  trial: 'On trial', active: 'Paid / active', expired: 'Trial expired', cancelled: 'Cancelled', none: 'No plan yet',
};
const PIPELINE_ORDER = ['Draft', 'Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Completed', 'Rejected', 'Cancelled', 'Other'];

function Tile({ label, value, sub, icon, color, onPress }: { label: string; value: string | number; sub?: string; icon: any; color: string; onPress?: () => void }) {
  const body = (
    <>
      <View style={[s.tileIcon, { backgroundColor: color + '18' }]}><Ionicons name={icon} size={18} color={color} /></View>
      <Text style={s.tileValue}>{value}</Text>
      <Text style={s.tileLabel}>{label}</Text>
      {!!sub && <Text style={s.tileSub}>{sub}</Text>}
    </>
  );
  return onPress ? (
    <TouchableOpacity style={s.tile} onPress={onPress} activeOpacity={0.75}>{body}</TouchableOpacity>
  ) : <View style={s.tile}>{body}</View>;
}

function Bars({ data, color, order }: { data: Record<string, number>; color: string; order?: string[] }) {
  const entries = Object.entries(data || {}).sort((a, b) =>
    order ? order.indexOf(a[0]) - order.indexOf(b[0]) : b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (!entries.length) return <Text style={s.empty}>No data yet</Text>;
  return (
    <View style={{ gap: 8 }}>
      {entries.map(([k, v]) => (
        <View key={k}>
          <View style={s.barHead}><Text style={s.barLabel} numberOfLines={1}>{k}</Text><Text style={s.barValue}>{v}</Text></View>
          <View style={s.barTrack}><View style={[s.barFill, { width: `${(v / max) * 100}%`, backgroundColor: color }]} /></View>
        </View>
      ))}
    </View>
  );
}

function Trend({ days }: { days: { date: string; count: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <View>
      <View style={s.trend}>
        {days.map((d) => (
          <View key={d.date} style={s.trendCol}>
            <View style={[s.trendBar, { height: `${Math.max(3, (d.count / max) * 100)}%`, opacity: d.count ? 1 : 0.25 }]} />
          </View>
        ))}
      </View>
      <View style={s.trendAxis}>
        <Text style={s.axisText}>{days[0] ? formatISTDate(days[0].date) : ''}</Text>
        <Text style={s.axisText}>Peak {max}/day</Text>
        <Text style={s.axisText}>Today</Text>
      </View>
    </View>
  );
}

function Section({ title, icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <View style={s.sectionHead}><Ionicons name={icon} size={17} color="#1565C0" /><Text style={s.sectionTitle}>{title}</Text></View>
      {children}
    </View>
  );
}

export default function PlatformAnalyticsScreen() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.get('/platform/analytics');
      setData(r.data);
      setError('');
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not load analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const o = data?.organizations, u = data?.users, c = data?.cases, inbox = data?.inbox;
  const roleData = Object.fromEntries(Object.entries(u?.by_role || {}).map(([k, v]) => [ROLE_LABEL[k] || k, v as number]));
  const statusData = Object.fromEntries(Object.entries(o?.by_subscription_status || {}).map(([k, v]) => [STATUS_LABEL[k] || k, v as number]));
  const completion = c?.total ? Math.round((c.completed / c.total) * 100) : 0;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <CenteredHeader title="Platform Analytics" subtitle="All colleges & clinics" fallback="/super-admin-dashboard" />
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color="#1565C0" /> : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {!!error && <Text style={s.error}>{error}</Text>}
          {data && (
            <>
              {(inbox?.access_requests_new || inbox?.issue_reports_new || inbox?.upgrade_requests || o?.trials_ending_7_days?.length) ? (
                <Section title="Needs attention" icon="notifications-outline">
                  {!!inbox?.access_requests_new && (
                    <TouchableOpacity style={s.alertRow} onPress={() => router.push('/admin/access-requests' as any)}>
                      <Ionicons name="mail-unread-outline" size={18} color="#1565C0" />
                      <Text style={s.alertText}>{inbox.access_requests_new} new access request{inbox.access_requests_new === 1 ? '' : 's'}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                  {!!inbox?.issue_reports_new && (
                    <TouchableOpacity style={s.alertRow} onPress={() => router.push('/admin/issue-reports' as any)}>
                      <Ionicons name="bug-outline" size={18} color="#C62828" />
                      <Text style={s.alertText}>{inbox.issue_reports_new} new issue report{inbox.issue_reports_new === 1 ? '' : 's'}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                  {!!inbox?.upgrade_requests && (
                    <TouchableOpacity style={s.alertRow} onPress={() => router.push('/admin/organizations' as any)}>
                      <Ionicons name="trending-up-outline" size={18} color="#2E7D32" />
                      <Text style={s.alertText}>{inbox.upgrade_requests} plan upgrade request{inbox.upgrade_requests === 1 ? '' : 's'}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                  {(o?.trials_ending_7_days || []).map((t: any) => (
                    <TouchableOpacity key={t.id} style={s.alertRow} onPress={() => router.push(`/admin/organizations/${t.id}` as any)}>
                      <Ionicons name="hourglass-outline" size={18} color="#EF6C00" />
                      <Text style={s.alertText} numberOfLines={1}>Trial ends {formatISTDate(t.ends_at)} · {t.name}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  ))}
                </Section>
              ) : null}

              <Section title="Organizations" icon="business-outline">
                <View style={s.tiles}>
                  <Tile label="Colleges" value={o.colleges} icon="school-outline" color="#4F46E5" onPress={() => router.push('/admin/organizations?type=college' as any)} />
                  <Tile label="Clinics" value={o.clinics} icon="medkit-outline" color="#059669" onPress={() => router.push('/admin/organizations?type=clinic' as any)} />
                  <Tile label="New (30 days)" value={o.new_last_30_days} icon="sparkles-outline" color="#7C3AED" />
                  <Tile label="Inactive 30+ days" value={o.inactive_30_days.length} icon="moon-outline" color="#64748B" />
                </View>
                <Text style={s.sub}>Subscription status</Text>
                <Bars data={statusData} color="#4F46E5" />
                <Text style={s.sub}>Plans</Text>
                <Bars data={o.by_plan} color="#0EA5E9" />
                {Object.keys(o.by_state || {}).length > 0 && (<><Text style={s.sub}>Top states</Text><Bars data={o.by_state} color="#14B8A6" /></>)}
              </Section>

              <Section title="Users" icon="people-outline">
                <View style={s.tiles}>
                  <Tile label="Total users" value={u.total} icon="people-outline" color="#0284C7" />
                  <Tile label="Active (7 days)" value={u.active_7_days} sub={u.total ? `${Math.round((u.active_7_days / u.total) * 100)}% of users` : undefined} icon="pulse-outline" color="#16A34A" />
                  <Tile label="Active (30 days)" value={u.active_30_days} icon="calendar-outline" color="#0891B2" />
                  <Tile label="New (30 days)" value={u.new_last_30_days} sub={u.disabled ? `${u.disabled} disabled` : undefined} icon="person-add-outline" color="#7C3AED" />
                </View>
                <Text style={s.sub}>By role</Text>
                <Bars data={roleData} color="#0284C7" />
              </Section>

              <Section title="Cases" icon="folder-open-outline">
                <View style={s.tiles}>
                  <Tile label="Total cases" value={c.total} sub={`${completion}% completed`} icon="folder-open-outline" color="#D97706" />
                  <Tile label="This month" value={c.created_this_month} icon="today-outline" color="#EA580C" />
                  <Tile label="Implants planned" value={c.implants_planned} icon="construct-outline" color="#9333EA" />
                  <Tile label="Avg. days to complete" value={c.avg_days_to_complete ?? '—'} icon="timer-outline" color="#0F766E" />
                </View>
                <Text style={s.sub}>New cases · last 30 days ({c.created_last_30_days})</Text>
                <Trend days={c.daily_last_30_days || []} />
                <Text style={s.sub}>Where cases are now</Text>
                <Bars data={c.pipeline} color="#D97706" order={PIPELINE_ORDER} />
                <Text style={s.sub}>Most common procedures</Text>
                <Bars data={c.top_procedure_types} color="#9333EA" />
              </Section>

              <Section title="Most active institutions" icon="trophy-outline">
                {(data.top_organizations || []).length === 0 && <Text style={s.empty}>No cases yet</Text>}
                {(data.top_organizations || []).map((t: any, i: number) => (
                  <TouchableOpacity key={t.id} style={s.orgRow} onPress={() => router.push(`/admin/organizations/${t.id}` as any)}>
                    <Text style={s.rank}>{i + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.orgName} numberOfLines={1}>{t.name}</Text>
                      <Text style={s.orgMeta}>
                        {t.org_type === 'clinic' ? 'Clinic' : 'College'} · {t.users} users · {t.cases_last_30_days} cases in 30 days
                        {t.last_active_at ? ` · active ${formatISTDate(t.last_active_at)}` : ''}
                      </Text>
                    </View>
                    <Text style={s.orgCases}>{t.cases}</Text>
                  </TouchableOpacity>
                ))}
              </Section>

              {o.inactive_30_days.length > 0 && (
                <Section title="No activity in 30 days" icon="moon-outline">
                  {o.inactive_30_days.map((t: any) => (
                    <TouchableOpacity key={t.id} style={s.orgRow} onPress={() => router.push(`/admin/organizations/${t.id}` as any)}>
                      <Ionicons name={t.org_type === 'clinic' ? 'medkit-outline' : 'school-outline'} size={18} color="#64748B" />
                      <View style={{ flex: 1 }}>
                        <Text style={s.orgName} numberOfLines={1}>{t.name}</Text>
                        <Text style={s.orgMeta}>{t.last_active_at ? `Last active ${formatISTDate(t.last_active_at)}` : 'No user has signed in yet'}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  ))}
                </Section>
              )}

              <Text style={s.footer}>Updated {formatISTDate(data.generated_at)} · pull down to refresh</Text>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  error: { color: '#C62828', textAlign: 'center', marginVertical: 12 },
  section: { backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: '#E3E8EE', padding: 14, marginBottom: 14 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0D2B4E' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: '47%', flexGrow: 1, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#EEF2F6' },
  tileIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  tileValue: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  tileLabel: { fontSize: 12, color: '#475569', fontWeight: '600', marginTop: 2 },
  tileSub: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  sub: { fontSize: 12, fontWeight: '700', color: '#64748B', marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  empty: { fontSize: 13, color: '#94A3B8' },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  barLabel: { flex: 1, fontSize: 13, color: '#334155', marginRight: 8 },
  barValue: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: '#EEF2F6', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  trend: { height: 90, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  trendCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  trendBar: { width: '100%', backgroundColor: '#EA580C', borderRadius: 2 },
  trendAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  axisText: { fontSize: 10, color: '#94A3B8' },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  alertText: { flex: 1, fontSize: 14, color: '#1E293B' },
  orgRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  rank: { width: 22, fontSize: 14, fontWeight: '800', color: '#94A3B8', textAlign: 'center' },
  orgName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  orgMeta: { fontSize: 11, color: '#64748B', marginTop: 2 },
  orgCases: { fontSize: 16, fontWeight: '800', color: '#D97706' },
  footer: { textAlign: 'center', fontSize: 11, color: '#94A3B8', marginTop: 4 },
});
