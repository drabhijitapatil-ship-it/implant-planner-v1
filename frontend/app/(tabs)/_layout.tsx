import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { usePushNotifications } from '../../utils/usePushNotifications';

export default function TabsLayout() {
  const { user, token } = useAuth();
  usePushNotifications(token);

  const role = user?.role;
  const isAdmin = role === 'administrator' || role === 'implant_incharge';
  const isNurse = role === 'nurse';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#1E88E5',
        tabBarInactiveTintColor: '#8E8E93',
        headerShown: true,
        tabBarStyle: {
          backgroundColor: '#FFF',
          borderTopWidth: 1,
          borderTopColor: '#E5E5EA',
          paddingBottom: 2,
          paddingTop: 6,
          paddingHorizontal: 12,
          height: 62,
        },
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
        tabBarItemStyle: {
          paddingVertical: 0,
          minWidth: 0,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <Ionicons name="home" size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="new-procedure"
        options={{
          title: 'New Case',
          tabBarIcon: ({ color }) => (
            <Ionicons name="add-circle" size={26} color={color} />
          ),
          href: isNurse ? null : '/new-procedure',
        }}
      />
      <Tabs.Screen
        name="procedures"
        options={{
          title: isNurse ? 'Cases' : 'My Cases',
          tabBarIcon: ({ color }) => (
            <Ionicons name="folder-open" size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color }) => (
            <Ionicons name="notifications" size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="user-management"
        options={{
          title: 'Users',
          tabBarIcon: ({ color }) => (
            <Ionicons name="people" size={26} color={color} />
          ),
          href: isAdmin ? '/user-management' : null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => (
            <Ionicons name="person-circle" size={26} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
