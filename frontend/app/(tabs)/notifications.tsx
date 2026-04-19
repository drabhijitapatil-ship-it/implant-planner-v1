import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';

export default function NotificationsScreen() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      const response = await api.get('/notifications');
      setNotifications(response.data);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadNotifications();
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await api.put(`/notifications/${notificationId}/read`);
      setNotifications((prev) =>
        prev.map((notif: any) =>
          notif.id === notificationId ? { ...notif, read: true } : notif
        )
      );
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleNotificationPress = async (notification: any) => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }
    router.push(`/procedures/${notification.procedure_id}`);
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'approval_request':
        return 'time';
      case 'approved':
        return 'checkmark-circle';
      case 'rejected':
        return 'close-circle';
      default:
        return 'information-circle';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'approval_request':
        return '#FFA500';
      case 'approved':
        return '#4CAF50';
      case 'rejected':
        return '#F44336';
      default:
        return '#007AFF';
    }
  };

  const renderNotification = ({ item }: any) => {
    const isIncharge = user?.role === 'implant_incharge';
    const isOpen = menuOpenId === item.id;
    return (
      <TouchableOpacity
        style={[styles.notificationCard, !item.read && styles.unreadCard]}
        onPress={() => { setMenuOpenId(null); handleNotificationPress(item); }}
      >
        <View style={[styles.iconContainer, { backgroundColor: getNotificationColor(item.type) }]}>
          <Ionicons name={getNotificationIcon(item.type)} size={24} color="#FFF" />
        </View>
        <View style={styles.notificationContent}>
          <Text style={styles.notificationMessage}>{item.message}</Text>
          {item.procedure_details && (
            <Text style={styles.procedureInfo}>
              {item.procedure_details.patient_name} •{' '}
              {format(new Date(item.procedure_details.procedure_date), 'MMM dd, yyyy')}
            </Text>
          )}
          <Text style={styles.timestamp}>
            {format(new Date(item.created_at), 'MMM dd, yyyy HH:mm')}
          </Text>
        </View>
        {!item.read && <View style={styles.unreadDot} />}
        {isIncharge && item.procedure_id && item.procedure_details?.status !== 'completed' && (
          <View style={{ position: 'relative' }}>
            <TouchableOpacity onPress={(e) => { e.stopPropagation(); setMenuOpenId(isOpen ? null : item.id); }} style={{ padding: 4 }} data-testid={`alert-menu-${item.id}`}>
              <Ionicons name="ellipsis-vertical" size={18} color="#666" />
            </TouchableOpacity>
            {isOpen && (
              <View style={styles.alertPopup} data-testid={`alert-popup-${item.id}`}>
                <TouchableOpacity style={styles.alertPopupItem} onPress={(e) => { e.stopPropagation(); setMenuOpenId(null); router.push(`/procedures/${item.procedure_id}?edit=true`); }}>
                  <Ionicons name="create-outline" size={16} color="#1565C0" />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#1565C0' }}>Edit Phase</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const filteredNotifications = searchQuery.trim()
    ? notifications.filter((n: any) => {
        const q = searchQuery.toLowerCase();
        return (
          (n.message || '').toLowerCase().includes(q) ||
          (n.procedure_details?.patient_name || '').toLowerCase().includes(q)
        );
      })
    : notifications;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>

      {/* Search bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', margin: 12, marginBottom: 4, borderRadius: 12, borderWidth: 1, borderColor: '#E0E7EE', paddingHorizontal: 10 }}>
        <Ionicons name="search" size={18} color="#999" />
        <TextInput
          style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, fontSize: 14 }}
          placeholder="Search alerts by patient name..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
          data-testid="alerts-search-input"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {filteredNotifications.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="notifications-outline" size={64} color="#CCC" />
          <Text style={styles.emptyText}>No notifications yet</Text>
        </View>
      ) : (
        <FlatList
          data={filteredNotifications}
          renderItem={renderNotification}
          keyExtractor={(item: any) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    gap: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
  },
  listContainer: {
    padding: 16,
  },
  notificationCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  unreadCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#1A1A1A',
    marginBottom: 4,
  },
  procedureInfo: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  timestamp: {
    fontSize: 11,
    color: '#999',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007AFF',
    marginLeft: 8,
  },
  alertPopup: {
    position: 'absolute',
    top: 28,
    right: 0,
    backgroundColor: '#FFF',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#1565C0',
    paddingVertical: 4,
    minWidth: 130,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 100,
  },
  alertPopupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
