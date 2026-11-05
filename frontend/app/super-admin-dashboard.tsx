import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
  Switch,
  Alert,
} from 'react-native';
import ScrollView from '@/components/KeyboardAwareScrollView';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import LogoutConfirmModal from '../components/LogoutConfirmModal';
import { setScreenshotsAllowedLocally } from '../hooks/useScreenshotPolicy';
import { appVersionLabel } from '../utils/appVersion';
import { formatISTDate } from '../utils/istTime';

// Super Admin home: what needs attention, the key platform numbers, and the
// management areas grouped by purpose. Counts come from /platform/analytics
// (falls back to /platform/summary for the headline numbers).

type Analytics = {
  organizations: { total: number; colleges: number; clinics: number; new_last_30_days: number; trials_ending_7_days: { id: string; name: string; ends_at: string }[] };
  users: { total: number; active_7_days: number; new_last_30_days: number };
  cases: { total: number; completed: number; created_this_month: number };
  inbox: { access_requests_new: number; issue_reports_new: number; upgrade_requests: number };
};

type Row = {
  key: string;
  label: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  color: string;
  badge?: (a: Analytics | null) => number;
};

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: 'Insights',
    rows: [
      { key: 'platform-analytics', label: 'Platform Analytics', sub: 'Usage, activity, plans & trends', icon: 'analytics-outline', route: '/admin/platform-analytics', color: '#0F766E' },
      { key: 'ai-logs', label: 'AI Logs', sub: 'AI requests, speed, tokens & cost', icon: 'sparkles-outline', route: '/admin/ai-logs', color: '#7C3AED' },
    ],
  },
  {
    title: 'Inbox',
    rows: [
      { key: 'access-requests', label: 'Access Requests', sub: 'Colleges & clinics asking to join', icon: 'mail-unread-outline', route: '/admin/access-requests', color: '#1565C0', badge: (a) => a?.inbox.access_requests_new || 0 },
      { key: 'issue-reports', label: 'Issue Reports', sub: 'Problems users reported', icon: 'bug-outline', route: '/admin/issue-reports', color: '#C62828', badge: (a) => a?.inbox.issue_reports_new || 0 },
    ],
  },
  {
    title: 'Institutions',
    rows: [
      { key: 'organizations', label: 'Organizations', sub: 'Colleges, clinics, licences & plans', icon: 'business-outline', route: '/admin/organizations', color: '#4F46E5', badge: (a) => a?.inbox.upgrade_requests || 0 },
      { key: 'subscription-plans', label: 'Subscription Plans', sub: 'Pricing tiers, seat caps & offers', icon: 'card-outline', route: '/admin/subscription-plans', color: '#0D9488' },
    ],
  },
  {
    title: 'Implant data',
    rows: [
      { key: 'implant-database', label: 'Implant Database', sub: 'Systems, components & connections', icon: 'server-outline', route: '/admin/implant-catalog', color: '#0277BD' },
      { key: 'implant-library', label: 'Implant Size Library', sub: 'Add or remove sizes instantly', icon: 'resize-outline', route: '/admin/implant-library', color: '#E65100' },
    ],
  },
];

function greeting() {
  const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function SuperAdminDashboard() {
  const { user, logout } = useAuth();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const load = useCallback(async () => {
    try {
      const res = await api.get('/platform/analytics');
      setData(res.data || null);
    } catch {
      // Older backend without /platform/analytics: headline numbers only.
      try {
        const r = await api.get('/platform/summary');
        const sm = r.data || {};
        setData({
          organizations: { total: sm.organizations?.total || 0, colleges: sm.organizations?.colleges || 0, clinics: sm.organizations?.clinics || 0, new_last_30_days: 0, trials_ending_7_days: [] },
          users: { total: sm.users?.total || 0, active_7_days: 0, new_last_30_days: 0 },
          cases: { total: sm.cases?.total || 0, completed: sm.cases?.completed || 0, created_this_month: 0 },
          inbox: { access_requests_new: 0, issue_reports_new: 0, upgrade_requests: 0 },
        });
      } catch {}
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);
  useFocusEffect(useCallback(() => { if (user) load(); }, [user, load]));

  const o = data?.organizations, u = data?.users, c = data?.cases, inbox = data?.inbox;
  const attention = [
    inbox?.access_requests_new ? { key: 'req', icon: 'mail-unread' as const, color: '#1565C0', text: `${inbox.access_requests_new} access request${inbox.access_requests_new === 1 ? '' : 's'}`, route: '/admin/access-requests' } : null,
    inbox?.issue_reports_new ? { key: 'iss', icon: 'bug' as const, color: '#C62828', text: `${inbox.issue_reports_new} new issue${inbox.issue_reports_new === 1 ? '' : 's'}`, route: '/admin/issue-reports' } : null,
    inbox?.upgrade_requests ? { key: 'upg', icon: 'trending-up' as const, color: '#2E7D32', text: `${inbox.upgrade_requests} upgrade request${inbox.upgrade_requests === 1 ? '' : 's'}`, route: '/admin/organizations' } : null,
    ...(o?.trials_ending_7_days || []).slice(0, 3).map((t) => ({ key: `t-${t.id}`, icon: 'hourglass' as const, color: '#EF6C00', text: `Trial ends ${formatISTDate(t.ends_at)} · ${t.name}`, route: `/admin/organizations/${t.id}` })),
  ].filter(Boolean) as { key: string; icon: any; color: string; text: string; route: string }[];

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={[s.scroll, isTablet && s.scrollTablet]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#1565C0" />}
      >
        {/* Header */}
        <Text style={s.brand}>Implanr</Text>
        <View style={s.header} data-testid="super-admin-profile-card">
          <View style={{ flex: 1 }}>
            <View style={s.badge}>
              <Ionicons name="shield-checkmark" size={11} color="#B8860B" />
              <Text style={s.badgeText}>SUPER ADMIN</Text>
            </View>
            <Text style={s.hello} numberOfLines={1}>{greeting()}, {(user?.name || 'Admin').split(' ')[0]}</Text>
            <Text style={s.helloSub} numberOfLines={1}>{user?.email}</Text>
          </View>
          <TouchableOpacity style={s.logoutBtn} onPress={() => setShowLogoutModal(true)} data-testid="super-admin-logout-btn" accessibilityLabel="Sign Out">
            <Ionicons name="log-out-outline" size={24} color="#DC2626" />
          </TouchableOpacity>
        </View>

        {/* Needs attention */}
        <View style={s.attention}>
          <View style={s.attentionHead}>
            <Ionicons name={attention.length ? 'notifications' : 'checkmark-circle'} size={20} color={attention.length ? '#F57C00' : '#16A34A'} />
            <Text style={s.attentionTitle}>{attention.length ? 'Needs your attention' : 'All caught up'}</Text>
            {loading && <ActivityIndicator size="small" color="#1565C0" style={{ marginLeft: 'auto' }} />}
          </View>
          <View style={s.attentionDivider} />
          {!loading && attention.length === 0 && <Text style={s.attentionNone}>No new requests, issues or expiring trials.</Text>}
          {attention.map((a) => (
            <TouchableOpacity key={a.key} style={s.attentionRow} onPress={() => router.push(a.route as any)} activeOpacity={0.7}>
              <View style={[s.dot, { backgroundColor: a.color + '1A' }]}><Ionicons name={a.icon} size={18} color={a.color} /></View>
              <Text style={s.attentionText} numberOfLines={1}>{a.text}</Text>
              <Ionicons name="chevron-forward" size={18} color="#64748B" />
            </TouchableOpacity>
          ))}
        </View>

        {/* Key numbers */}
        <View style={s.statsGrid} data-testid="super-admin-stats">
          <Stat label="Colleges" value={o?.colleges} sub={o?.new_last_30_days ? `+${o.new_last_30_days} orgs this month` : 'Institutions'} icon="school-outline" color="#4F46E5" onPress={() => router.push('/admin/organizations?type=college' as any)} />
          <Stat label="Clinics" value={o?.clinics} sub="Institutions" icon="medkit-outline" color="#059669" onPress={() => router.push('/admin/organizations?type=clinic' as any)} />
          <Stat label="Users" value={u?.total} sub={u?.active_7_days ? `${u.active_7_days} active this week` : 'All roles'} icon="people-outline" color="#0284C7" onPress={() => router.push('/admin/platform-analytics' as any)} />
          <Stat label="Cases" value={c?.total} sub={c?.created_this_month ? `${c.created_this_month} this month` : c?.completed ? `${c.completed} completed` : 'All institutions'} icon="folder-open-outline" color="#D97706" onPress={() => router.push('/admin/platform-analytics' as any)} />
        </View>

        {/* Management, grouped */}
        <View style={isTablet ? s.groupGridTablet : undefined}>
          {GROUPS.map((g) => (
            <View key={g.title} style={[s.group, isTablet && s.groupTablet]}>
              <Text style={s.groupTitle}>{g.title}</Text>
              <View style={s.groupCard}>
                {g.rows.map((r, i) => {
                  const n = r.badge ? r.badge(data) : 0;
                  return (
                    <TouchableOpacity
                      key={r.key}
                      style={[s.row, i === g.rows.length - 1 && s.rowLast]}
                      onPress={() => router.push(r.route as any)}
                      data-testid={`super-admin-card-${r.key}`}
                      activeOpacity={0.7}
                    >
                      <View style={[s.rowIcon, { backgroundColor: r.color + '17' }]}><Ionicons name={r.icon} size={22} color={r.color} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.rowLabel}>{r.label}</Text>
                        <Text style={s.rowSub} numberOfLines={1}>{r.sub}</Text>
                      </View>
                      {n > 0 && <View style={[s.count, { backgroundColor: r.color }]}><Text style={s.countText}>{n > 99 ? '99+' : n}</Text></View>}
                      <Ionicons name="chevron-forward" size={18} color="#64748B" />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}

          <View style={[s.group, isTablet && s.groupTablet]}>
            <Text style={s.groupTitle}>Settings</Text>
            <View style={s.groupCard}>
              <ScreenshotSettingRow />
            </View>
          </View>
        </View>

        <Text style={s.footer}>Implanr · Version {appVersionLabel()}</Text>
      </ScrollView>

      <LogoutConfirmModal
        visible={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={async () => {
          setShowLogoutModal(false);
          await logout();
          router.replace('/auth/login');
        }}
      />
    </SafeAreaView>
  );
}

function Stat({ label, value, sub, icon, color, onPress }: {
  label: string; value?: number; sub: string; icon: keyof typeof Ionicons.glyphMap; color: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.stat} onPress={onPress} activeOpacity={0.75} data-testid={`super-admin-stat-${label.toLowerCase()}`}>
      {/* Soft coloured curve in the corner */}
      <View pointerEvents="none" style={[s.statWave, { backgroundColor: color + '12' }]} />
      <View style={s.statTop}>
        <View style={[s.statIcon, { backgroundColor: color + '1A' }]}><Ionicons name={icon} size={22} color={color} /></View>
        <View style={s.statArrow}><Ionicons name="arrow-forward" size={14} color="#64748B" /></View>
      </View>
      <Text style={s.statValue}>{value ?? '—'}</Text>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statSub} numberOfLines={1}>{sub}</Text>
    </TouchableOpacity>
  );
}

// Platform-wide "Allow screenshots" default. Off = the app blocks screenshots
// and screen recording for signed-in users (HIPAA guard) in every
// organization whose admin hasn't chosen otherwise; phones pick the change up
// when the app opens or returns to the foreground.
function ScreenshotSettingRow() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.get('/app-config').then((r) => setAllowed(r.data?.platform_screenshots_allowed ?? !!r.data?.screenshots_allowed)).catch(() => setAllowed(null));
  }, []);
  const save = async (v: boolean) => {
    const prev = allowed;
    setAllowed(v);
    setSaving(true);
    try {
      const r = await api.put('/admin/app-config', { screenshots_allowed: v });
      // Super admins have no organization, so the default is what applies to them.
      setScreenshotsAllowedLocally(!!r.data?.screenshots_allowed);
    } catch (e: any) {
      setAllowed(prev);
      Alert.alert('Could not save', e?.response?.data?.detail || 'Please try again');
    } finally {
      setSaving(false);
    }
  };
  return (
    <View style={[s.row, s.rowLast]} data-testid="super-admin-screenshot-setting">
      <View style={[s.rowIcon, { backgroundColor: '#EF6C0017' }]}><Ionicons name="camera-outline" size={22} color="#EF6C00" /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.rowLabel}>Allow screenshots (default)</Text>
        <Text style={s.rowSub} numberOfLines={2}>
          {allowed === null ? 'Loading…' : allowed
            ? 'On — unless an organization blocks them'
            : 'Off — unless an organization allows them'}
        </Text>
      </View>
      {saving ? <ActivityIndicator color="#1565C0" /> : (
        <Switch value={!!allowed} onValueChange={save} disabled={allowed === null} testID="super-admin-screenshot-switch" />
      )}
    </View>
  );
}

const SHADOW = {
  shadowColor: '#1E3A8A',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.07,
  shadowRadius: 14,
  elevation: 3,
} as const;

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F6FB' },
  scroll: { padding: 18, paddingBottom: 40 },
  scrollTablet: { maxWidth: 1000, width: '100%', alignSelf: 'center', paddingHorizontal: 24 },

  brand: { fontSize: 26, fontWeight: '900', color: '#0D47C9', letterSpacing: -0.3, marginBottom: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: '#FFF8E1', borderColor: '#F5C84B', borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 8 },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#A16207', letterSpacing: 0.8 },
  hello: { fontSize: 26, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  helloSub: { fontSize: 14, color: '#64748B', marginTop: 4 },
  logoutBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFF1F1', borderWidth: 1.5, borderColor: '#FBC7C7', alignItems: 'center', justifyContent: 'center' },

  attention: { backgroundColor: '#FFF', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#3B82F6', ...SHADOW },
  attentionHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  attentionTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  attentionDivider: { height: 1, backgroundColor: '#E2E8F0', marginTop: 12 },
  attentionNone: { fontSize: 14, color: '#64748B', marginTop: 10 },
  attentionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, marginTop: 4 },
  dot: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  attentionText: { flex: 1, fontSize: 16, color: '#1E293B', fontWeight: '500' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 6 },
  stat: { flexBasis: '46%', flexGrow: 1, backgroundColor: '#FFF', borderRadius: 20, padding: 16, overflow: 'hidden', ...SHADOW },
  statWave: { position: 'absolute', right: -40, bottom: -70, width: 170, height: 110, borderRadius: 90, transform: [{ rotate: '-18deg' }] },
  statTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  statIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  statArrow: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 34, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  statLabel: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginTop: 2 },
  statSub: { fontSize: 13, color: '#64748B', marginTop: 3 },

  groupGridTablet: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  group: { marginTop: 20 },
  groupTablet: { flexBasis: '48%', flexGrow: 1 },
  groupTitle: { fontSize: 13, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10, marginLeft: 6 },
  groupCard: { backgroundColor: '#FFF', borderRadius: 20, ...SHADOW },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' },
  rowLast: { borderBottomWidth: 0 },
  rowIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  rowSub: { fontSize: 13, color: '#64748B', marginTop: 2 },
  count: { minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  countText: { color: '#FFF', fontSize: 13, fontWeight: '800' },

  footer: { textAlign: 'center', fontSize: 11, color: '#94A3B8', marginTop: 24 },
});
