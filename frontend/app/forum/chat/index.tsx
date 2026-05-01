import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../../../contexts/AuthContext';
import api from '../../../utils/api';

interface Group {
  id: string; kind: string; name: string; type: string; photo_url?: string;
  members: string[]; last_message_preview?: string; last_message_at?: string; locked?: boolean;
}

function fmtRel(iso?: string): string {
  if (!iso) return '';
  const d = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d/60)}m ago`;
  if (d < 86400) return `${Math.floor(d/3600)}h ago`;
  if (d < 86400 * 7) return `${Math.floor(d/86400)}d ago`;
  if (d < 86400 * 365) return `${Math.floor(d/86400/30)}mo ago`;
  return 'last year';
}

export default function ChatListScreen() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/chat/groups', { params: q ? { q } : {} });
      setGroups(res.data?.items || []);
    } finally { setLoading(false); setRefreshing(false); }
  }, [q]);

  useFocusEffect(useCallback(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]));

  if (user?.role === 'nurse') {
    return <SafeAreaView style={s.screen}><View style={s.empty}><Ionicons name="lock-closed" size={48} color="#B0BEC5" /><Text style={s.emptyTxt}>Chat is not available for nurses.</Text></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{top:12,bottom:12,left:12,right:12}}>
          <Ionicons name="arrow-back" size={24} color="#37474F" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Discussion Forum</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={s.segmentRow}>
        <View style={s.segment}>
          <TouchableOpacity style={s.segmentBtn} onPress={() => router.replace('/forum' as any)}>
            <Ionicons name="chatbubbles-outline" size={14} color="#1565C0" />
            <Text style={s.segmentTxt}>Forum</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.segmentBtn, s.segmentBtnActive]} disabled>
            <Ionicons name="chatbox-ellipses" size={14} color="#FFF" />
            <Text style={s.segmentTxtActive}>Chat</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={s.searchBar}>
        <Ionicons name="search" size={18} color="#90A4AE" />
        <TextInput style={s.searchInput} placeholder="Search groups..." value={q} onChangeText={setQ} returnKeyType="search" onSubmitEditing={load} />
      </View>
      <TouchableOpacity style={s.newGroupBtn} onPress={() => router.push('/forum/chat/create' as any)} data-testid="new-group-btn">
        <View style={s.newGroupIcon}><Ionicons name="people" size={20} color="#FFF" /></View>
        <Text style={s.newGroupTxt}>Start New Group Chat</Text>
        <Ionicons name="add" size={22} color="#FFF" />
      </TouchableOpacity>
      {loading ? <ActivityIndicator size="large" color="#1565C0" style={{ marginTop: 30 }} /> : (
        <FlatList
          data={groups}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.row} onPress={() => router.push(`/forum/chat/${item.id}` as any)} data-testid={`chat-group-${item.id}`}>
              <View style={s.avatar}>
                {item.kind === 'all_staff' ? <Ionicons name="business" size={22} color="#FFF" /> : item.kind === 'dm' ? <Ionicons name="person" size={22} color="#FFF" /> : <Ionicons name="people" size={22} color="#FFF" />}
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.rowTop}>
                  <Text style={s.rowName} numberOfLines={1}>{item.name}</Text>
                  {item.type === 'private' && item.kind !== 'dm' && <Ionicons name="lock-closed" size={11} color="#78909C" />}
                  {item.locked && <Ionicons name="shield-checkmark" size={11} color="#2E7D32" />}
                </View>
                <Text style={s.rowPreview} numberOfLines={1}>{item.last_message_preview || 'No messages yet — say hi 👋'}</Text>
              </View>
              <Text style={s.rowTime}>{fmtRel(item.last_message_at)}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<View style={s.empty}><Ionicons name="chatbox-ellipses-outline" size={48} color="#B0BEC5" /><Text style={s.emptyTxt}>No groups yet.</Text><Text style={s.emptySub}>Tap "Start New Group Chat" to begin.</Text></View>}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#37474F' },
  segmentRow: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, alignItems: 'center', backgroundColor: '#F5F7FA' },
  segment: { flexDirection: 'row', backgroundColor: '#ECEFF1', borderRadius: 22, padding: 3, gap: 2 },
  segmentBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 22, paddingVertical: 7, borderRadius: 18 },
  segmentBtnActive: { backgroundColor: '#1565C0' },
  segmentTxt: { fontSize: 13, fontWeight: '700', color: '#1565C0' },
  segmentTxtActive: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, backgroundColor: '#FFF', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E0E0E0' },
  searchInput: { flex: 1, fontSize: 14, color: '#37474F', outlineWidth: 0 as any },
  newGroupBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 12, marginBottom: 8, backgroundColor: '#1565C0', borderRadius: 12, padding: 14 },
  newGroupIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  newGroupTxt: { flex: 1, fontSize: 15, fontWeight: '700', color: '#FFF' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF', padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#ECEFF1' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1565C0', alignItems: 'center', justifyContent: 'center' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowName: { fontSize: 15, fontWeight: '700', color: '#37474F', flexShrink: 1 },
  rowPreview: { fontSize: 13, color: '#78909C', marginTop: 2 },
  rowTime: { fontSize: 11, color: '#90A4AE' },
  empty: { alignItems: 'center', padding: 40 },
  emptyTxt: { fontSize: 15, color: '#546E7A', marginTop: 12, fontWeight: '600' },
  emptySub: { fontSize: 13, color: '#90A4AE', marginTop: 6 },
});
