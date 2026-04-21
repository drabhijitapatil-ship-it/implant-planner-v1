import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, useRouter } from 'expo-router';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { usePushNotifications } from '../../utils/usePushNotifications';
import ImplantIcon from '../../components/ImplantIcon';
import api from '../../utils/api';

// ── Side Drawer Menu ───────────────────────────────────────
function DrawerMenu({
  visible,
  onClose,
  isAdmin,
  userName,
  userRole,
  profilePhoto,
  onNavigate,
  onLogout,
}: {
  visible: boolean;
  onClose: () => void;
  isAdmin: boolean;
  userName: string;
  userRole: string;
  profilePhoto: string | null;
  onNavigate: (route: string) => void;
  onLogout: () => void;
}) {
  const insets = useSafeAreaInsets();

  const menuItems = [
    ...(isAdmin
      ? [{ key: 'users', icon: 'people-outline' as const, label: 'Users', route: '/user-management' }]
      : []),
    { key: 'profile', icon: 'person-circle-outline' as const, label: 'My Profile', route: '/profile' },
    { key: 'archived', icon: 'archive-outline' as const, label: 'Archived Cases', route: '/archived' },
  ];

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS === 'android'}
    >
      <Pressable style={d.overlay} onPress={onClose}>
        <Pressable
          style={[d.drawer, { paddingTop: insets.top + 16 }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* User Info Header */}
          <View style={d.header}>
            {profilePhoto ? (
              <Image source={{ uri: profilePhoto }} style={d.avatarImage} />
            ) : (
              <View style={d.avatar}>
                <Ionicons name="person" size={28} color="#FFF" />
              </View>
            )}
            <View style={d.headerInfo}>
              <Text style={d.userName}>{userName}</Text>
              <Text style={d.userRole}>{userRole}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={24} color="#90A4AE" />
            </TouchableOpacity>
          </View>

          <View style={d.divider} />

          {/* Menu Items */}
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={d.menuItem}
              onPress={() => {
                onClose();
                onNavigate(item.route);
              }}
              activeOpacity={0.6}
              data-testid={`drawer-${item.key}`}
            >
              <Ionicons name={item.icon} size={22} color="#37474F" />
              <Text style={d.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={18} color="#B0BEC5" />
            </TouchableOpacity>
          ))}

          <View style={d.divider} />

          {/* Logout */}
          <TouchableOpacity
            style={d.menuItem}
            onPress={() => {
              onClose();
              onLogout();
            }}
            activeOpacity={0.6}
            data-testid="drawer-logout"
          >
            <Ionicons name="log-out-outline" size={22} color="#D32F2F" />
            <Text style={[d.menuLabel, { color: '#D32F2F' }]}>Logout</Text>
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          <Text style={d.appName}>My Implant Planner</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const d = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    flexDirection: 'row',
  },
  drawer: {
    width: '75%',
    maxWidth: 300,
    backgroundColor: '#FFF',
    paddingHorizontal: 20,
    paddingBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#1E88E5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: '#1E88E5',
  },
  headerInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: '700', color: '#263238' },
  userRole: { fontSize: 12, color: '#78909C', marginTop: 2, textTransform: 'capitalize' },
  divider: { height: 1, backgroundColor: '#ECEFF1', marginVertical: 12 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
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

  const role = user?.role;
  const isAdmin = role === 'administrator' || role === 'implant_incharge';
  const isNurse = role === 'nurse';

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.get('/notifications/unread-count');
      setUnreadCount(res.data.count || 0);
    } catch {}
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  const roleName = (role || '').replace(/_/g, ' ');

  const handleNavigate = (route: string) => {
    setTimeout(() => router.push(route as any), 100);
  };

  const handleLogout = () => {
    logout();
  };

  // Header menu button (hamburger)
  const HeaderLeft = () => (
    <TouchableOpacity
      onPress={() => setDrawerOpen(true)}
      style={{ marginLeft: 14 }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      data-testid="menu-hamburger"
    >
      <Ionicons name="menu" size={26} color="#263238" />
    </TouchableOpacity>
  );

  return (
    <>
      <DrawerMenu
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        isAdmin={isAdmin}
        userName={user?.name || user?.username || ''}
        userRole={roleName}
        profilePhoto={user?.profile_photo || null}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
      />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#1E88E5',
          tabBarInactiveTintColor: '#8E8E93',
          headerShown: true,
          headerLeft: () => <HeaderLeft />,
          tabBarStyle: {
            backgroundColor: '#FFF',
            borderTopWidth: 1,
            borderTopColor: '#E5E5EA',
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
            tabBarIcon: ({ color }) => (
              <Ionicons name="home-outline" size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="new-procedure"
          options={{
            title: 'New Case',
            tabBarIcon: ({ color }) => (
              <Ionicons name="document-text-outline" size={24} color={color} />
            ),
            href: isNurse ? null : '/new-procedure',
          }}
        />
        <Tabs.Screen
          name="implant-selection"
          options={{
            title: 'Implant',
            tabBarIcon: ({ color }) => (
              <ImplantIcon size={28} color={color} />
            ),
            href: isNurse ? null : '/implant-selection',
          }}
        />
        <Tabs.Screen
          name="procedures"
          options={{
            title: isNurse ? 'Cases' : 'My Cases',
            tabBarIcon: ({ color }) => (
              <Ionicons name="folder-open-outline" size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="notifications"
          options={{
            title: 'Alerts',
            tabBarIcon: ({ color }) => (
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
});
