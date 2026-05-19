import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, useRouter, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  StyleSheet,
  Platform,
  Image,
  Alert,
  Animated as RNAnimated,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { usePushNotifications } from '../../utils/usePushNotifications';
import ImplantIcon from '../../components/ImplantIcon';
import api from '../../utils/api';

// ── Tile-Grid Menu ──────────────────────────────────────────
// Tactile-feedback helper: silent on web (Haptics is a no-op), light tap on
// iOS/Android. We swallow errors because some devices (older Androids,
// reduced-motion accessibility setting) reject the call.
const tapLight = () => {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};
const tapMedium = () => {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
};

// Replaces the legacy side-drawer hamburger. Triggered by the 4-tile grid
// icon in the header — opens a top-half popover with a 2-column grid of
// pastel-blue tiles (one per menu destination), the user identity in the
// top-left, and a dedicated red logout pill at the bottom for clarity.
function DrawerMenu({
  visible,
  onClose,
  isAdmin,
  isNurse,
  userName,
  userRole,
  profilePhoto,
  onNavigate,
  onLogout,
  hasUnseenWhatsNew,
  hasUnreadForum,
}: {
  visible: boolean;
  onClose: () => void;
  isAdmin: boolean;
  isNurse: boolean;
  userName: string;
  userRole: string;
  profilePhoto: string | null;
  onNavigate: (route: string) => void;
  onLogout: () => void;
  hasUnseenWhatsNew: boolean;
  hasUnreadForum: boolean;
}) {
  const insets = useSafeAreaInsets();
  const forumAllowed = !!userRole && !isNurse;

  // When the popover opens AND the user has unread badges, fire a soft
  // "success" notification haptic (~80 ms after the open-tick from the header
  // tap) — feels like a gentle nudge toward the red-dotted tile without any
  // extra visual UI.
  useEffect(() => {
    if (!visible) return;
    if (!(hasUnseenWhatsNew || hasUnreadForum)) return;
    if (Platform.OS === 'web') return;
    const timer = setTimeout(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }, 220);
    return () => clearTimeout(timer);
  }, [visible, hasUnseenWhatsNew, hasUnreadForum]);

  // Each tile carries its own pastel-blue tint plus a slightly deeper accent
  // for the icon chip — keeps the grid colourful without leaving the brand
  // palette. Order is tuned so the most-used items land in the first row.
  type TileItem = {
    key: string;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    route: string;
    bg: string;       // tile background (lightest)
    chip: string;     // icon-chip background (mid)
    iconColor: string; // icon stroke color (deepest)
    badge?: boolean;
  };
  const allItems: TileItem[] = [
    ...(isAdmin
      ? [{
          key: 'users', icon: 'people' as const, label: 'Users', route: '/user-management',
          bg: '#E3F2FD', chip: '#BBDEFB', iconColor: '#1565C0',
        }]
      : []),
    {
      key: 'profile', icon: 'person-circle' as const, label: 'My Profile', route: '/profile',
      bg: '#E0F7FA', chip: '#B2EBF2', iconColor: '#00838F',
    },
    ...(isNurse
      ? []
      : [{
          key: 'archived', icon: 'archive' as const, label: 'Archived', route: '/archived',
          bg: '#E8EAF6', chip: '#C5CAE9', iconColor: '#3949AB',
        }]),
    ...(forumAllowed
      ? [{
          key: 'forum', icon: 'chatbubbles' as const, label: 'Forum', route: '/forum',
          bg: '#E1F5FE', chip: '#B3E5FC', iconColor: '#0277BD', badge: hasUnreadForum,
        }]
      : []),
    // 4th tile for Supervisors & Students — balances the 4-up grid (admins
    // already have 4 tiles via the Users entry; nurses get a single-tile
    // menu). The What's-New unseen-badge is attached here instead of the
    // Profile tile so the indicator lives on a semantically correct surface.
    ...(!isAdmin && !isNurse
      ? [{
          key: 'whatsnew', icon: 'sparkles' as const, label: "What's New", route: '/whatsnew?mode=history',
          bg: '#FFF3E0', chip: '#FFE0B2', iconColor: '#EF6C00', badge: hasUnseenWhatsNew,
        }]
      : []),
    // iter-149: Implant Database tile — visible to ALL roles (read-only for
    // students / supervisors / nurses; edit-enabled for implant_incharge +
    // administrator at the catalog screen level via canEdit gate). Amber
    // palette per user choice — distinct from the peach What's-New tile.
    {
      key: 'implant-database', icon: 'library' as const, label: 'Implant Database', route: '/admin/implant-catalog',
      bg: '#FFF8E1', chip: '#FFE082', iconColor: '#E65100',
    },
  ];

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={t.overlay} onPress={onClose} testID="tile-menu-overlay">
        <Pressable
          style={[t.sheet, { paddingTop: insets.top + 14 }]}
          onPress={(e) => e.stopPropagation()}
          testID="tile-menu-sheet"
          // @ts-ignore
          data-testid="tile-menu-sheet"
        >
          {/* Top row — user identity (left) + close (right). Drops in
              gracefully from the top so the eye lands on the user before the
              tiles cascade. */}
          <Animated.View
            entering={FadeInDown.duration(220)}
            style={t.identityRow}
          >
            <View style={t.identityLeft}>
              {profilePhoto ? (
                <Image source={{ uri: profilePhoto }} style={t.avatarImage} />
              ) : (
                <View style={t.avatar}>
                  <Ionicons name="person" size={22} color="#FFF" />
                </View>
              )}
              <View style={{ marginLeft: 10, flexShrink: 1 }}>
                <Text style={t.userName} numberOfLines={1}>{userName}</Text>
                <Text style={t.userRole} numberOfLines={1}>{userRole}</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={t.closeBtn}
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              testID="tile-menu-close"
              // @ts-ignore
              data-testid="tile-menu-close"
            >
              <Ionicons name="close" size={22} color="#546E7A" />
            </TouchableOpacity>
          </Animated.View>

          <View style={t.divider} />

          {/* Tile grid — 2 per row, equal width via flexBasis. Tiles fade
              in with a soft 6-px slide-up (no stagger, no zoom) — reads as
              "information being placed" rather than a playful bounce. */}
          <View style={t.grid}>
            {allItems.map((item) => (
              <Animated.View
                key={item.key}
                entering={FadeIn.duration(220).withInitialValues({
                  opacity: 0,
                  transform: [{ translateY: 6 }],
                })}
                style={{ flexBasis: '48%', flexGrow: 0, aspectRatio: 1.3 }}
              >
                <TouchableOpacity
                  style={[t.tile, { backgroundColor: item.bg }]}
                  onPress={() => { tapLight(); onClose(); onNavigate(item.route); }}
                  activeOpacity={0.75}
                  testID={`tile-${item.key}`}
                  accessibilityLabel={`tile-${item.key}`}
                  // @ts-ignore
                  data-testid={`tile-${item.key}`}
                >
                  <View style={[t.tileChip, { backgroundColor: item.chip }]}>
                    <Ionicons name={item.icon} size={26} color={item.iconColor} />
                    {item.badge && <View style={t.tileBadge} />}
                  </View>
                  <Text style={t.tileLabel}>{item.label}</Text>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>

          {/* Logout — separate visual section; same soft reveal as tiles so
              the whole sheet lands with one coherent motion. */}
          <Animated.View
            entering={FadeIn.duration(220).withInitialValues({
              opacity: 0,
              transform: [{ translateY: 6 }],
            })}
            style={t.logoutWrap}
          >
            <TouchableOpacity
              style={t.logoutPill}
              onPress={() => { tapMedium(); onClose(); onLogout(); }}
              activeOpacity={0.8}
              testID="tile-menu-logout"
              accessibilityLabel="tile-menu-logout"
              // @ts-ignore
              data-testid="tile-menu-logout"
            >
              <Ionicons name="log-out-outline" size={18} color="#C62828" />
              <Text style={t.logoutTxt}>Logout</Text>
            </TouchableOpacity>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const t = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 25, 40, 0.45)',
  },
  sheet: {
    backgroundColor: '#FAFCFF',
    paddingHorizontal: 18,
    paddingBottom: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 14,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  identityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#1E88E5',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImage: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, borderColor: '#1E88E5',
  },
  userName: { fontSize: 15, fontWeight: '700', color: '#1A2332' },
  userRole: { fontSize: 12, color: '#78909C', marginTop: 2, textTransform: 'capitalize' },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F0F4F8',
    alignItems: 'center', justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#ECEFF1',
    marginVertical: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  tile: {
    // Sizing handled by the surrounding Animated.View wrapper (flexBasis 48%
    // + aspectRatio 1.3). The TouchableOpacity stretches to fill that box.
    width: '100%',
    height: '100%',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 14,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  tileChip: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  tileBadge: {
    position: 'absolute',
    top: 4, right: 4,
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: '#E53935',
    borderWidth: 1.5, borderColor: '#FFF',
  },
  tileLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A2332',
    letterSpacing: 0.2,
  },
  logoutWrap: {
    marginTop: 18,
    alignItems: 'center',
  },
  logoutPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FDECEA',
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#F8C9C2',
  },
  logoutTxt: {
    fontSize: 14,
    fontWeight: '700',
    color: '#C62828',
    letterSpacing: 0.3,
  },
});

const d = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', flexDirection: 'row' },
  drawer: { width: '75%', maxWidth: 300, backgroundColor: '#FFF', paddingHorizontal: 20, paddingBottom: 30 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#1E88E5', justifyContent: 'center', alignItems: 'center' },
  avatarImage: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: '#1E88E5' },
  headerInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: '700', color: '#263238' },
  userRole: { fontSize: 12, color: '#78909C', marginTop: 2, textTransform: 'capitalize' },
  divider: { height: 1, backgroundColor: '#ECEFF1', marginVertical: 12 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 4 },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: '#37474F' },
  appName: { fontSize: 11, color: '#B0BEC5', textAlign: 'center' },
});

// ── Tab Layout ─────────────────────────────────────────────
export default function TabsLayout() {
  const { user, logout } = useAuth();
  const router = useRouter();
  usePushNotifications();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  // Red-dot indicator on the hamburger + "My Profile" row when the user has
  // unseen changelog entries. Cleared when they ack (/whatsnew GET returns 0).
  const [hasUnseenWhatsNew, setHasUnseenWhatsNew] = useState(false);
  // Red-dot indicator for Discussion Forum activity since user's last visit.
  const [hasUnreadForum, setHasUnreadForum] = useState(false);

  const role = user?.role;
  const isAdmin = role === 'administrator' || role === 'implant_incharge';
  const isNurse = role === 'nurse';

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.get('/notifications/unread-count');
      setUnreadCount(res.data.count || 0);
    } catch {}
  }, []);

  const fetchWhatsNewIndicator = useCallback(async () => {
    try {
      const res = await api.get('/whatsnew');
      setHasUnseenWhatsNew((res.data?.entries || []).length > 0);
    } catch {
      setHasUnseenWhatsNew(false);
    }
  }, []);

  const fetchForumUnread = useCallback(async () => {
    if (isNurse) { setHasUnreadForum(false); return; }
    try {
      const res = await api.get('/forum/unread-summary');
      setHasUnreadForum(!!res.data?.has_unread);
    } catch {
      setHasUnreadForum(false);
    }
  }, [isNurse]);

  useEffect(() => {
    fetchUnreadCount();
    fetchWhatsNewIndicator();
    fetchForumUnread();
    const interval = setInterval(() => { fetchUnreadCount(); fetchForumUnread(); }, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount, fetchWhatsNewIndicator, fetchForumUnread]);

  // Re-check on drawer open (catches the case where user opens What's new from
  // Profile, taps "Got it" elsewhere, then returns).
  useEffect(() => {
    if (drawerOpen) { fetchWhatsNewIndicator(); fetchForumUnread(); }
  }, [drawerOpen, fetchWhatsNewIndicator, fetchForumUnread]);

  const roleName = (role || '').replace(/_/g, ' ');

  const handleNavigate = (route: string) => {
    setTimeout(() => router.push(route as any), 100);
  };

  const handleLogout = () => {
    logout();
  };

  // Header menu button (hamburger) — red dot appears when there are unseen
  // What's-new entries (cleared on ack via GET /whatsnew returning empty).
  const HeaderLeft = () => (
    <TouchableOpacity
      onPress={() => { tapLight(); setDrawerOpen(true); }}
      style={{ marginLeft: 14 }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      testID="hamburger-btn"
      accessibilityLabel="hamburger-btn"
      // @ts-ignore - RNW passes through
      data-testid="hamburger-btn"
    >
      <View>
        <Ionicons name="grid" size={24} color="#1565C0" />
        {(hasUnseenWhatsNew || hasUnreadForum) && (
          <View style={badgeStyles.reddot} data-testid="profile-whatsnew-reddot" />
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <>
      <DrawerMenu
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        isAdmin={isAdmin}
        isNurse={isNurse}
        userName={user?.name || user?.username || ''}
        userRole={roleName}
        profilePhoto={user?.profile_photo || null}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        hasUnseenWhatsNew={hasUnseenWhatsNew}
        hasUnreadForum={hasUnreadForum}
      />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#1E88E5',
          tabBarInactiveTintColor: '#8E8E93',
          headerShown: true,
          headerLeft: () => <HeaderLeft />,
          // iter-247: Apple Liquid Glass on the bottom tab bar.
          // BlurView renders the iOS UIBlurEffect underneath the tabs
          // (true Liquid Glass on iOS 26+, high-quality blur on
          // iOS 17-25 and Android; CSS backdrop-filter fallback on web).
          // We make the bar transparent + absolutely positioned so the
          // content underneath shows through the glass.
          tabBarBackground: () => (
            <BlurView
              intensity={80}
              tint="light"
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, glassStyles.glassFill]}
            />
          ),
          tabBarStyle: {
            // iter-247: Apple Liquid Glass — transparent so the BlurView
            // background shows through. We keep the bar in-flow (not
            // position:'absolute') so existing scroll content keeps its
            // natural bottom padding and nothing hides behind the glass.
            // iter-251: reverted padding to the original 4/8 split because
            // the wider paddingBottom (14) introduced in iter-246 was
            // squeezing the icon area enough to clip the bottom half of
            // smaller Ionicons (size 24) while leaving the larger
            // ImplantIcon (size 28) visible — that's the symptom the user
            // reported.
            backgroundColor: 'transparent',
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: 'rgba(120, 144, 156, 0.20)',
            elevation: 0,
            paddingBottom: 4,
            paddingTop: 8,
            height: 70,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
            marginTop: 2,
          },
          tabBarIconStyle: {
            marginBottom: 0,
          },
          tabBarItemStyle: {
            paddingVertical: 0,
          },
        }}
      >
        <Tabs.Screen
          name="dashboard"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused }) => (
              <FocusedPill focused={focused}>
                <Ionicons name="home-outline" size={24} color={color} />
              </FocusedPill>
            ),
          }}
        />
        <Tabs.Screen
          name="new-procedure"
          options={{
            title: 'New Case',
            tabBarIcon: ({ color, focused }) => (
              <FocusedPill focused={focused}>
                <Ionicons name="document-text-outline" size={24} color={color} />
              </FocusedPill>
            ),
            href: isNurse ? null : '/new-procedure',
          }}
        />
        <Tabs.Screen
          name="implant-selection"
          options={{
            title: 'Implant',
            tabBarIcon: ({ color, focused }) => (
              <FocusedPill focused={focused}>
                <ImplantIcon size={28} color={color} />
              </FocusedPill>
            ),
            href: isNurse ? null : '/implant-selection',
          }}
        />
        <Tabs.Screen
          name="procedures"
          options={{
            title: isNurse ? 'Cases' : 'My Cases',
            tabBarIcon: ({ color, focused }) => (
              <FocusedPill focused={focused}>
                <Ionicons name="folder-open-outline" size={24} color={color} />
              </FocusedPill>
            ),
          }}
        />
        <Tabs.Screen
          name="notifications"
          options={{
            title: 'Alerts',
            tabBarIcon: ({ color, focused }) => (
              <FocusedPill focused={focused}>
                <View>
                  <Ionicons name="notifications-outline" size={24} color={color} />
                  {unreadCount > 0 && (
                    <View style={badgeStyles.badge} data-testid="alerts-badge">
                      <Text style={badgeStyles.badgeText}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </Text>
                    </View>
                  )}
                </View>
              </FocusedPill>
            ),
          }}
          listeners={{
            tabPress: () => { setTimeout(fetchUnreadCount, 1000); },
          }}
        />
        {/* Hidden from bottom bar — accessible via side drawer */}
        <Tabs.Screen
          name="user-management"
          options={{
            title: 'Users',
            href: null,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'My Profile',
            href: null,
          }}
        />
        <Tabs.Screen
          name="archived"
          options={{
            title: 'Archived Cases',
            href: null,
          }}
        />
      </Tabs>
    </>
  );
}

// iter-248: Active-tab pill — wraps any icon in a soft blue rounded
// pill when the tab is focused. Kept intentionally simple (no absolute
// fill, no transform) so it never affects sibling tab layout. The pill
// background appears/disappears on the focused state; sibling icons are
// unaffected because each pill lives entirely inside its own tab slot.
function FocusedPill({ focused, children }: { focused: boolean; children: React.ReactNode }) {
  return (
    <View style={[pillStyles.wrap, focused && pillStyles.wrapFocused]}>
      {children}
    </View>
  );
}

const pillStyles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingVertical: 2,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrapFocused: {
    backgroundColor: 'rgba(30, 136, 229, 0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(30, 136, 229, 0.32)',
  },
});

const badgeStyles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#F44336',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  badgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  reddot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E53935',
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  reddotInline: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E53935',
    marginLeft: 6,
  },
});

// iter-247: Liquid Glass styling for the bottom tab bar.
// On iOS BlurView already produces the native UIBlurEffect (Apple's
// Liquid Glass material on iOS 26+). On Android, expo-blur uses a
// native blur view. On web, we layer a CSS `backdrop-filter` fallback
// + a soft white tint so the bar still looks like frosted glass even
// when the browser supports backdrop-filter.
const glassStyles = StyleSheet.create({
  glassFill: Platform.select({
    web: {
      // @ts-ignore — RN-Web passes these straight through to CSS.
      backdropFilter: 'blur(22px) saturate(180%)',
      // @ts-ignore
      WebkitBackdropFilter: 'blur(22px) saturate(180%)',
      backgroundColor: 'rgba(255, 255, 255, 0.55)',
    },
    default: {
      backgroundColor: 'rgba(255, 255, 255, 0.18)',
    },
  }) as any,
});
