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
          paddingBottom: 6,
          paddingTop: 4,
          height: 58,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
        },
        tabBarIconStyle: {
          marginBottom: -2,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="new-procedure"
        options={{
          title: 'New Case',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle" size={22} color={color} />
          ),
          href: isNurse ? null : '/new-procedure',
        }}
      />
      <Tabs.Screen
        name="procedures"
        options={{
          title: isNurse ? 'Cases' : 'My Cases',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="folder-open" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="user-management"
        options={{
          title: 'Users',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={22} color={color} />
          ),
          href: isAdmin ? '/user-management' : null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'My Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle" size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
