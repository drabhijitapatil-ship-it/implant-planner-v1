import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import CenteredHeader from '../components/CenteredHeader';

/**
 * Cross-department case referral inbox/outbox. Implant In-Charge /
 * Administrator only — mirrors backend REFERRAL_ROLES.
 */

type Referral = {
  id: string;
  case_id: string;
  from_department_id: string | null;
  to_department_id: string;
  to_department_name: string;
  permission: 'read' | 'edit';
  notes?: string;
  status: 'pending' | 'active' | 'declined' | 'returned';
  requested_by_name: string;
  requested_at: string;
  patient_name?: string;
  implant_procedure_type?: string;
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#FFF3E0', text: '#E65100' },
  active: { bg: '#E8F5E9', text: '#2E7D32' },
  declined: { bg: '#FFEBEE', text: '#C62828' },
  returned: { bg: '#ECEFF1', text: '#546E7A' },
};

export default function ReferralsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [incoming, setIncoming] = useState<Referral[]>([]);
  const [outgoing, setOutgoing] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const canView = user?.role === 'implant_incharge' || user?.role === 'administrator';

  const load = useCallback(async () => {
    try {
      const [inRes, outRes] = await Promise.all([
        api.get('/referrals/incoming'),
        api.get('/referrals/outgoing'),
      ]);
      setIncoming(inRes.data?.referrals || []);
      setOutgoing(outRes.data?.referrals || []);
    } catch (error) {
      console.error('Failed to load referrals:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (canView) load();
    else setLoading(false);
  }, [canView, load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const act = async (endpoint: string, id: string, confirmMsg?: string, body?: any) => {
    const run = async () => {
      setActingId(id);
      try {
        await api.post(`/referrals/${id}/${endpoint}`, body || {});
        load();
      } catch (error: any) {
        Alert.alert('Error', error.response?.data?.detail || `Failed to ${endpoint} referral`);
      } finally {
        setActingId(null);
      }
    };
    if (confirmMsg) {
      Alert.alert('Confirm', confirmMsg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: run },
      ]);
    } else {
      run();
    }
  };

  if (!canView) {
    return (
      <SafeAreaView style={styles.container}>
        <CenteredHeader title="Referrals" fallback="/(tabs)/dashboard" />
        <View style={styles.accessDenied}>
          <Ionicons name="lock-closed" size={48} color="#CCC" />
          <Text style={styles.accessDeniedText}>Access Restricted</Text>
          <Text style={styles.accessDeniedSubtext}>
            Only Implant In-Charge / Administrator can view referrals
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const list = tab === 'incoming' ? incoming : outgoing;

  const renderCard = ({ item }: { item: Referral }) => {
    const colors = STATUS_COLORS[item.status] || STATUS_COLORS.pending;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/procedures/${item.case_id}` as any)}
        data-testid={`referral-card-${item.id}`}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardPatient} numberOfLines={1}>
            {item.patient_name || 'Case ' + item.case_id.slice(-6)}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
            <Text style={[styles.statusBadgeText, { color: colors.text }]}>
              {item.status.toUpperCase()}
            </Text>
          </View>
        </View>
        <Text style={styles.cardMeta}>{item.implant_procedure_type || ''}</Text>
        <View style={styles.cardRow}>
          <Ionicons name="business-outline" size={13} color="#64748B" />
          <Text style={styles.cardMetaSmall}>
            {tab === 'incoming' ? `From: requested by ${item.requested_by_name}` : `To: ${item.to_department_name}`}
          </Text>
        </View>
        <View style={styles.cardRow}>
          <Ionicons name={item.permission === 'edit' ? 'create-outline' : 'eye-outline'} size={13} color="#64748B" />
          <Text style={styles.cardMetaSmall}>
            {item.permission === 'edit' ? 'Collaborate' : 'Read Only'}
          </Text>
        </View>
        {!!item.notes && <Text style={styles.cardNotes} numberOfLines={2}>"{item.notes}"</Text>}

        {tab === 'incoming' && item.status === 'pending' && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.acceptBtn]}
              onPress={() => act('accept', item.id)}
              disabled={actingId === item.id}
              data-testid={`accept-referral-${item.id}`}
            >
              {actingId === item.id ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.actionBtnText}>Accept</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.declineBtn]}
              onPress={() => act('decline', item.id)}
              disabled={actingId === item.id}
              data-testid={`decline-referral-${item.id}`}
            >
              <Text style={[styles.actionBtnText, { color: '#C62828' }]}>Decline</Text>
            </TouchableOpacity>
          </View>
        )}
        {tab === 'incoming' && item.status === 'active' && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.returnBtn]}
              onPress={() => act('return', item.id, 'Mark treatment complete and return this case to its originating department?')}
              disabled={actingId === item.id}
              data-testid={`return-referral-${item.id}`}
            >
              {actingId === item.id ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.actionBtnText}>Complete &amp; Return</Text>}
            </TouchableOpacity>
          </View>
        )}
        {tab === 'outgoing' && item.status === 'pending' && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.declineBtn]}
              onPress={() => act('cancel', item.id, 'Withdraw this referral request?')}
              disabled={actingId === item.id}
              data-testid={`cancel-referral-${item.id}`}
            >
              <Text style={[styles.actionBtnText, { color: '#C62828' }]}>Cancel Request</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <CenteredHeader title="Referrals" fallback="/(tabs)/dashboard" />

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'incoming' && styles.tabBtnActive]}
          onPress={() => setTab('incoming')}
          data-testid="referrals-tab-incoming"
        >
          <Text style={[styles.tabBtnText, tab === 'incoming' && styles.tabBtnTextActive]}>
            Incoming ({incoming.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'outgoing' && styles.tabBtnActive]}
          onPress={() => setTab('outgoing')}
          data-testid="referrals-tab-outgoing"
        >
          <Text style={[styles.tabBtnText, tab === 'outgoing' && styles.tabBtnTextActive]}>
            Outgoing ({outgoing.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1A73E8" />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={renderCard}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="git-branch-outline" size={48} color="#CCC" />
              <Text style={styles.emptyText}>
                No {tab} referrals
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  accessDenied: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  accessDeniedText: { fontSize: 20, fontWeight: '700', color: '#333' },
  accessDeniedSubtext: { fontSize: 14, color: '#888', textAlign: 'center' },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: '#F1F5F9' },
  tabBtnActive: { backgroundColor: '#1A73E8' },
  tabBtnText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  tabBtnTextActive: { color: '#FFF' },
  listContent: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardPatient: { fontSize: 15, fontWeight: '700', color: '#1A202C', flex: 1, marginRight: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  cardMeta: { fontSize: 13, color: '#546E7A', marginBottom: 6 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  cardMetaSmall: { fontSize: 12, color: '#64748B' },
  cardNotes: { fontSize: 12, color: '#94A3B8', fontStyle: 'italic', marginTop: 6 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  acceptBtn: { backgroundColor: '#1A73E8' },
  declineBtn: { backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#FFCDD2' },
  returnBtn: { backgroundColor: '#2E7D32' },
  actionBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, gap: 8 },
  emptyText: { fontSize: 14, color: '#94A3B8' },
});
