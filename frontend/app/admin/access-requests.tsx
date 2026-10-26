import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, RefreshControl, Alert } from 'react-native';
import ScrollView from '@/components/KeyboardAwareScrollView';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import api from '../../utils/api';
import CenteredHeader from '../../components/CenteredHeader';
import { formatISTDate, formatISTTime } from '../../utils/istTime';

// Super-admin inbox for "Request access" submissions (iOS replaces
// self-registration with this form — see utils/storePolicy).

type AccessRequest = {
  id: string;
  name: string;
  email: string;
  phone: string;
  institution_type: 'college' | 'clinic';
  institution_name: string;
  city: string;
  designation?: string | null;
  team_size?: string | null;
  message?: string | null;
  platform?: string | null;
  status: string;
  created_at: string;
};

const STATUSES = ['new', 'contacted', 'quoted', 'onboarded', 'closed'] as const;
const STATUS_COLORS: Record<string, { fg: string; bg: string }> = {
  new: { fg: '#1565C0', bg: '#E3F2FD' },
  contacted: { fg: '#6A1B9A', bg: '#F3E5F5' },
  quoted: { fg: '#EF6C00', bg: '#FFF3E0' },
  onboarded: { fg: '#2E7D32', bg: '#E8F5E9' },
  closed: { fg: '#546E7A', bg: '#ECEFF1' },
};

export default function AccessRequestsScreen() {
  const [items, setItems] = useState<AccessRequest[]>([]);
  const [filter, setFilter] = useState<string>('new');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (f: string) => {
    try {
      const { data } = await api.get('/admin/access-requests', { params: f === 'all' ? {} : { status: f } });
      setItems(data || []);
    } catch (e: any) {
      Alert.alert('Could not load requests', e?.response?.data?.detail || 'Please try again');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(filter); }, [load, filter]));

  const setStatus = async (id: string, status: string) => {
    try {
      await api.patch(`/admin/access-requests/${id}`, { status });
      setItems((prev) => (filter === 'all' ? prev.map((r) => (r.id === id ? { ...r, status } : r)) : prev.filter((r) => r.id !== id)));
    } catch (e: any) {
      Alert.alert('Could not update', e?.response?.data?.detail || 'Please try again');
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <CenteredHeader title="Access Requests" subtitle="Colleges & clinics asking to join" fallback="/super-admin-dashboard" />
      <View style={s.filters}>
        {(['all', ...STATUSES] as string[]).map((f) => (
          <TouchableOpacity key={f} style={[s.filter, filter === f && s.filterActive]} onPress={() => { setLoading(true); setFilter(f); }}>
            <Text style={[s.filterText, filter === f && { color: '#FFF' }]}>{f[0].toUpperCase() + f.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#1565C0" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(filter); }} />}
        >
          {items.length === 0 && <Text style={s.empty}>No {filter === 'all' ? '' : filter + ' '}requests.</Text>}
          {items.map((r) => {
            const c = STATUS_COLORS[r.status] || STATUS_COLORS.closed;
            return (
              <View key={r.id} style={s.card} testID={`access-request-${r.id}`}>
                <View style={s.cardTop}>
                  <Ionicons name={r.institution_type === 'college' ? 'school-outline' : 'medkit-outline'} size={20} color="#1565C0" />
                  <Text style={s.inst} numberOfLines={2}>{r.institution_name}</Text>
                  <View style={[s.pill, { backgroundColor: c.bg }]}><Text style={[s.pillText, { color: c.fg }]}>{r.status}</Text></View>
                </View>
                <Text style={s.meta}>
                  {r.institution_type === 'college' ? 'Dental college' : 'Dental clinic'} · {r.city}{r.team_size ? ` · ${r.team_size}` : ''}
                </Text>
                <Text style={s.person}>{r.name}{r.designation ? `, ${r.designation}` : ''}</Text>
                {!!r.message && <Text style={s.message}>{r.message}</Text>}
                <Text style={s.when}>{formatISTDate(r.created_at)}, {formatISTTime(r.created_at)} IST{r.platform ? ` · via ${r.platform}` : ''}</Text>
                <View style={s.actions}>
                  <TouchableOpacity style={s.action} onPress={() => Linking.openURL(`tel:${r.phone}`)}>
                    <Ionicons name="call-outline" size={16} color="#1565C0" /><Text style={s.actionText}>{r.phone}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.action} onPress={() => Linking.openURL(`mailto:${r.email}`)}>
                    <Ionicons name="mail-outline" size={16} color="#1565C0" /><Text style={s.actionText} numberOfLines={1}>{r.email}</Text>
                  </TouchableOpacity>
                </View>
                <View style={s.statusRow}>
                  {STATUSES.filter((st) => st !== r.status).map((st) => (
                    <TouchableOpacity key={st} style={s.statusBtn} onPress={() => setStatus(r.id, st)}>
                      <Text style={s.statusBtnText}>Mark {st}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingTop: 8 },
  filter: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#CFD8DC' },
  filterActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  filterText: { fontSize: 12, fontWeight: '600', color: '#37474F' },
  empty: { textAlign: 'center', color: '#78909C', marginTop: 40 },
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E3E8EE' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inst: { flex: 1, fontSize: 16, fontWeight: '700', color: '#0D2B4E' },
  pill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  meta: { fontSize: 13, color: '#546E7A', marginTop: 4 },
  person: { fontSize: 14, color: '#263238', marginTop: 6, fontWeight: '600' },
  message: { fontSize: 13, color: '#455A64', marginTop: 6, fontStyle: 'italic' },
  when: { fontSize: 11, color: '#90A4AE', marginTop: 6 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#E3F2FD' },
  actionText: { fontSize: 12, color: '#1565C0', fontWeight: '600', flexShrink: 1 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  statusBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#CFD8DC' },
  statusBtnText: { fontSize: 11, color: '#455A64', fontWeight: '600' },
});
