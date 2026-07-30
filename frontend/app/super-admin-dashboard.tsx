import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import LogoutConfirmModal from '../components/LogoutConfirmModal';

type PlatformSummary = {
  organizations: { total: number; colleges: number; clinics: number; other: number };
  users: { total: number; by_role: Record<string, number> };
  cases: { total: number; completed: number };
};

type NavCard = {
  key: string;
  label: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  color: string;
  bg: string;
  badge?: string;
};

const NAV_CARDS: NavCard[] = [
  {
    key: 'organizations',
    label: 'Organizations',
    sub: 'Manage colleges, clinics & workspace tenants',
    icon: 'business-outline',
    route: '/admin/organizations',
    color: '#4F46E5',
    bg: '#EEF2FF',
  },
  {
    key: 'implant-catalog',
    label: 'Implant Database',
    sub: 'Systems, components & connection catalog',
    icon: 'library-outline',
    route: '/admin/implant-catalog',
    color: '#EA580C',
    bg: '#FFF7ED',
  },
  {
    key: 'implant-library',
    label: 'Implant Size Library',
    sub: 'Add or remove sizes live with zero downtime',
    icon: 'options-outline',
    route: '/admin/implant-library',
    color: '#0284C7',
    bg: '#F0F9FF',
  },
  {
    key: 'subscription-plans',
    label: 'Subscription Plans',
    sub: 'Pricing tiers, seat caps & launch offers',
    icon: 'card-outline',
    route: '/admin/subscription-plans',
    color: '#0D9488',
    bg: '#F0FDF4',
  },
];

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function SuperAdminDashboard() {
  const { user, logout } = useAuth();
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const { width } = useWindowDimensions();

  const isTablet = width >= 768;

  const load = useCallback(async () => {
    try {
      const res = await api.get('/platform/summary');
      setSummary(res.data || null);
    } catch {
      // stats are best-effort — nav cards remain fully functional
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      load();
    }, [user, load]),
  );

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      {/* Top App Branding Bar */}
      <View style={s.headerBar}>
        <View style={s.headerLeft}>
          <Text style={s.brandTitle}>Implanr</Text>
          <View style={s.adminPill}>
            <Ionicons name="shield-checkmark" size={12} color="#B8860B" />
            <Text style={s.adminPillText}>SUPER ADMIN</Text>
          </View>
        </View>

        <TouchableOpacity
          style={s.logoutIconButton}
          onPress={() => setShowLogoutModal(true)}
          data-testid="super-admin-logout-btn"
          accessibilityLabel="Sign Out"
        >
          <Ionicons name="log-out-outline" size={20} color="#DC2626" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, isTablet && s.scrollTablet]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor="#1565C0"
          />
        }
      >
        {/* User Hero Banner */}
        <View style={s.heroCard} data-testid="super-admin-profile-card">
          <View style={s.heroAvatar}>
            <Text style={s.heroAvatarText}>{getInitials(user?.name || 'SA')}</Text>
          </View>

          <View style={s.heroDetails}>
            <Text style={s.heroSubtitle}>Platform Administrator</Text>
            <Text style={s.heroName}>{user?.name || 'Super Admin'}</Text>
            <Text style={s.heroEmail}>{user?.email}</Text>
          </View>

          <View style={s.statusBadge}>
            <View style={s.statusDot} />
            <Text style={s.statusText}>System Live</Text>
          </View>
        </View>

        {/* Platform Overview Stats */}
        <View style={s.sectionHeaderRow}>
          <View style={s.sectionHeaderLeft}>
            <Ionicons name="stats-chart" size={18} color="#1565C0" />
            <Text style={s.sectionTitle}>Platform Overview</Text>
          </View>
          {loading && <ActivityIndicator size="small" color="#1565C0" />}
        </View>

        <View style={s.statsGrid} data-testid="super-admin-stats">
          <StatTile
            label="Colleges"
            value={summary?.organizations?.colleges ?? 0}
            color="#4F46E5"
            bg="#EEF2FF"
            icon="school-outline"
          />
          <StatTile
            label="Clinics"
            value={summary?.organizations?.clinics ?? 0}
            color="#059669"
            bg="#ECFDF5"
            icon="medkit-outline"
          />
          <StatTile
            label="Total Users"
            value={summary?.users?.total ?? 0}
            color="#0284C7"
            bg="#F0F9FF"
            icon="people-outline"
          />
          <StatTile
            label="Total Cases"
            value={summary?.cases?.total ?? 0}
            subValue={summary?.cases?.completed ? `${summary.cases.completed} done` : undefined}
            color="#D97706"
            bg="#FFFBEB"
            icon="folder-open-outline"
          />
        </View>

        {/* Management Controls */}
        <View style={s.sectionHeaderRow}>
          <View style={s.sectionHeaderLeft}>
            <Ionicons name="apps" size={18} color="#1565C0" />
            <Text style={s.sectionTitle}>Management Controls</Text>
          </View>
        </View>

        <View style={[s.cardsGrid, isTablet && s.cardsGridTablet]}>
          {NAV_CARDS.map((c) => (
            <TouchableOpacity
              key={c.key}
              style={[s.navCard, isTablet && s.navCardTablet]}
              onPress={() => router.push(c.route as any)}
              data-testid={`super-admin-card-${c.key}`}
              activeOpacity={0.75}
            >
              <View style={s.navCardLeft}>
                <View style={[s.navCardIconWrap, { backgroundColor: c.bg }]}>
                  <Ionicons name={c.icon} size={22} color={c.color} />
                </View>
                <View style={s.navCardTextWrap}>
                  <Text style={s.navCardLabel}>{c.label}</Text>
                  <Text style={s.navCardSub} numberOfLines={2}>
                    {c.sub}
                  </Text>
                </View>
              </View>

              <View style={s.chevronCircle}>
                <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Footer info */}
        <View style={s.footer}>
          <Ionicons name="shield-checkmark-outline" size={14} color="#94A3B8" />
          <Text style={s.footerText}>Implanr Platform Engine · Global Multi-Tenant Scope</Text>
        </View>
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

function StatTile({
  label,
  value,
  subValue,
  color,
  bg,
  icon,
}: {
  label: string;
  value: number;
  subValue?: string;
  color: string;
  bg: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={[s.statTile, { backgroundColor: '#FFF', borderColor: '#E2E8F0' }]} data-testid={`super-admin-stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <View style={s.statHeader}>
        <View style={[s.statIconWrap, { backgroundColor: bg }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        {subValue && (
          <View style={s.subValueBadge}>
            <Text style={s.subValueBadgeText}>{subValue}</Text>
          </View>
        )}
      </View>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  headerBar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1565C0',
    letterSpacing: 0.6,
  },
  adminPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF8E1',
    borderColor: '#FFE082',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  adminPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B8860B',
    letterSpacing: 0.5,
  },
  logoutIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  scrollTablet: {
    maxWidth: 900,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 24,
    paddingTop: 24,
  },

  /* Hero profile banner */
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  heroAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#1565C0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  heroAvatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroDetails: {
    flex: 1,
  },
  heroSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  heroEmail: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#22C55E',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },

  /* Section headers */
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 6,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  /* Stats grid */
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statTile: {
    flex: 1,
    minWidth: 150,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subValueBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  subValueBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },

  /* Navigation cards grid */
  cardsGrid: {
    gap: 12,
    marginBottom: 24,
  },
  cardsGridTablet: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  navCardTablet: {
    width: '48.5%',
  },
  navCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 14,
  },
  navCardIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCardTextWrap: {
    flex: 1,
  },
  navCardLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  navCardSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  chevronCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginLeft: 10,
  },

  /* Footer */
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 12,
  },
  footerText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
});
