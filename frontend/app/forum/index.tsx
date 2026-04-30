import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, TextInput, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';

interface Thread {
  id: string;
  procedure_id: string;
  patient_name_display: string;
  student_name?: string;
  supervisor_name?: string;
  implant_procedure_type?: string;
  case_status?: string;
  status: 'open' | 'closed' | 'removed';
  reply_count: number;
  last_activity_at?: string;
  tags: string[];
  bookmarked?: boolean;
  anonymous: boolean;
  shared_by_display?: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Phase 1 — Submitted',
  phase1_approved: 'Phase 1 — Approved',
  phase2_ready: 'Phase 2 — In Progress',
  phase2_submitted: 'Phase 2 — Submitted',
  phase2_approved: 'Phase 2 — Approved',
  phase3_ready: 'Phase 3 — In Progress',
  phase3_submitted: 'Phase 3 — Submitted',
  phase3_approved: 'Phase 3 — Approved',
  phase4_ready: 'Phase 4 — In Progress',
  phase4_submitted: 'Phase 4 — Submitted',
  completed: 'Completed',
};

function fmtRel(iso?: string): string {
  if (!iso) return '';
  const now = Date.now();
  const then = new Date(iso).getTime();
  const delta = Math.max(0, now - then) / 1000;
  if (delta < 60) return 'just now';
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  if (delta < 86400 * 7) return `${Math.floor(delta / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ForumListScreen() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'closed' | 'mine' | 'bookmarked'>('all');
  const [tag, setTag] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isNurse = user?.role === 'nurse';

  const fetchThreads = useCallback(async () => {
    try {
      const params: any = {};
      if (filter === 'open') params.status = 'open';
      else if (filter === 'closed') params.status = 'closed';
      else if (filter === 'mine') params.mine_only = true;
      else if (filter === 'bookmarked') params.bookmarked = true;
      if (query.trim()) params.q = query.trim();
      if (tag) params.tag = tag;
      const res = await api.get('/forum/threads', { params });
      setThreads(res.data?.items || []);
      setError(null);
    } catch (e: any) {
      if (e?.response?.status === 403) {
        setError('Discussion Forum is not available for your role.');
      } else {
        setError(e?.response?.data?.detail || 'Failed to load discussion forum.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, query, tag]);

  useEffect(() => {
    if (isNurse) return;
    fetchThreads();
    // Stamp last-seen-at timestamp to clear the hamburger red dot.
    api.post('/forum/mark-seen').catch(() => {});
  }, [fetchThreads, isNurse]);

  useFocusEffect(useCallback(() => { if (!isNurse) fetchThreads(); }, [fetchThreads, isNurse]));

  const uniqueTags = Array.from(new Set(threads.flatMap(t => t.tags || []))).sort();

  if (isNurse) {
    return (
      <SafeAreaView style={s.empty}>
        <Ionicons name="lock-closed" size={48} color="#B0BEC5" />
        <Text style={s.emptyText}>Discussion Forum is not available for nurses.</Text>
        <TouchableOpacity style={s.backBtn} onPress={() => router.replace('/dashboard')}>
          <Text style={s.backTxt}>Back to Dashboard</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const renderCard = ({ item }: { item: Thread }) => {
    const caseStage = STATUS_LABELS[item.case_status || ''] || item.case_status || 'In Progress';
    const statusBadge = item.status === 'closed' ? { bg: '#FFF3E0', fg: '#E65100', icon: 'lock-closed' as const, label: 'Closed' }
      : item.status === 'removed' ? { bg: '#FFEBEE', fg: '#B71C1C', icon: 'trash' as const, label: 'Removed' }
      : null;
    return (
      <TouchableOpacity
        style={s.card}
        onPress={() => router.push(`/forum/${item.id}` as any)}
        activeOpacity={0.75}
        data-testid={`forum-thread-${item.id}`}
      >
        <View style={s.cardHeader}>
          <Text style={s.patient} numberOfLines={1}>{item.patient_name_display || 'Patient'}</Text>
          {statusBadge && (
            <View style={[s.statusBadge, { backgroundColor: statusBadge.bg }]}>
              <Ionicons name={statusBadge.icon} size={11} color={statusBadge.fg} />
              <Text style={[s.statusBadgeTxt, { color: statusBadge.fg }]}>{statusBadge.label}</Text>
            </View>
          )}
        </View>
        {item.implant_procedure_type && (
          <Text style={s.procType} numberOfLines={1}>{item.implant_procedure_type}</Text>
        )}
        <View style={s.metaRow}>
          {item.student_name && <Text style={s.meta}>Student: <Text style={s.metaVal}>{item.student_name}</Text></Text>}
          {item.supervisor_name && <Text style={s.meta}>  •  Supervisor: <Text style={s.metaVal}>{item.supervisor_name}</Text></Text>}
        </View>
        <View style={s.stageRow}>
          <View style={s.stageBadge}>
            <Ionicons name="git-branch" size={11} color="#1565C0" />
            <Text style={s.stageTxt}>{caseStage}</Text>
          </View>
          {item.anonymous && (
            <View style={[s.stageBadge, { backgroundColor: '#ECEFF1' }]}>
              <Ionicons name="eye-off" size={11} color="#546E7A" />
              <Text style={[s.stageTxt, { color: '#546E7A' }]}>Anonymous</Text>
            </View>
          )}
          {item.bookmarked && <Ionicons name="bookmark" size={14} color="#F9A825" />}
        </View>
        {(item.tags || []).length > 0 && (
          <View style={s.tagsRow}>
            {item.tags.slice(0, 4).map(t => (
              <View key={t} style={s.tag}><Text style={s.tagTxt}>{t}</Text></View>
            ))}
          </View>
        )}
        <View style={s.footerRow}>
          <View style={s.footerItem}>
            <Ionicons name="chatbubble-outline" size={13} color="#78909C" />
            <Text style={s.footerTxt}>{item.reply_count} {item.reply_count === 1 ? 'reply' : 'replies'}</Text>
          </View>
          <Text style={s.footerTxt}>{fmtRel(item.last_activity_at)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} data-testid="forum-back-btn">
          <Ionicons name="arrow-back" size={24} color="#37474F" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Discussion Forum</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={s.searchBar}>
        <Ionicons name="search" size={18} color="#90A4AE" />
        <TextInput
          style={s.searchInput}
          placeholder="Search patient, student, procedure..."
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          onSubmitEditing={fetchThreads}
          data-testid="forum-search-input"
        />
        {!!query && (
          <TouchableOpacity onPress={() => { setQuery(''); }}>
            <Ionicons name="close-circle" size={18} color="#90A4AE" />
          </TouchableOpacity>
        )}
      </View>

      <View style={s.filters}>
        {([['all', 'All'], ['open', 'Open'], ['closed', 'Closed'], ['mine', 'Mine'], ['bookmarked', 'Bookmarked']] as const).map(([k, l]) => (
          <TouchableOpacity
            key={k}
            style={[s.filterChip, filter === k && s.filterChipActive]}
            onPress={() => setFilter(k as any)}
            data-testid={`forum-filter-${k}`}
          >
            <Text style={[s.filterChipTxt, filter === k && s.filterChipTxtActive]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {uniqueTags.length > 0 && (
        <View style={s.tagsFilter}>
          <TouchableOpacity onPress={() => setTag(null)} style={[s.tagFilter, !tag && s.tagFilterActive]}>
            <Text style={[s.tagFilterTxt, !tag && s.tagFilterTxtActive]}>All tags</Text>
          </TouchableOpacity>
          {uniqueTags.slice(0, 8).map(t => (
            <TouchableOpacity key={t} onPress={() => setTag(tag === t ? null : t)} style={[s.tagFilter, tag === t && s.tagFilterActive]}>
              <Text style={[s.tagFilterTxt, tag === t && s.tagFilterTxtActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#1565C0" style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={s.empty}>
          <Ionicons name="warning-outline" size={40} color="#D32F2F" />
          <Text style={s.errorTxt}>{error}</Text>
        </View>
      ) : threads.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="chatbubbles-outline" size={48} color="#B0BEC5" />
          <Text style={s.emptyText}>No discussions yet.</Text>
          <Text style={s.emptySub}>Share a case from My Cases (three-dot menu) to start a discussion.</Text>
        </View>
      ) : (
        <FlatList
          data={threads}
          renderItem={renderCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchThreads(); }} />}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#37474F' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, backgroundColor: '#FFF', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E0E0E0' },
  searchInput: { flex: 1, fontSize: 14, color: '#37474F', outlineWidth: 0 as any },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginBottom: 8, flexWrap: 'wrap' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: '#CFD8DC', backgroundColor: '#FFF' },
  filterChipActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  filterChipTxt: { fontSize: 12, color: '#546E7A', fontWeight: '600' },
  filterChipTxtActive: { color: '#FFF' },
  tagsFilter: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, marginBottom: 8, flexWrap: 'wrap' },
  tagFilter: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#ECEFF1' },
  tagFilterActive: { backgroundColor: '#B3E5FC' },
  tagFilterTxt: { fontSize: 11, color: '#78909C' },
  tagFilterTxtActive: { color: '#01579B', fontWeight: '700' },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#ECEFF1' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  patient: { flex: 1, fontSize: 16, fontWeight: '700', color: '#37474F' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusBadgeTxt: { fontSize: 10, fontWeight: '700' },
  procType: { fontSize: 13, color: '#1565C0', fontWeight: '600', marginBottom: 6 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  meta: { fontSize: 12, color: '#78909C' },
  metaVal: { color: '#37474F', fontWeight: '600' },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' },
  stageBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E3F2FD', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  stageTxt: { fontSize: 11, color: '#1565C0', fontWeight: '600' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 },
  tag: { backgroundColor: '#F5F5F5', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  tagTxt: { fontSize: 10, color: '#78909C' },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTopWidth: 1, borderTopColor: '#F5F5F5' },
  footerItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerTxt: { fontSize: 11, color: '#90A4AE' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { fontSize: 15, color: '#546E7A', marginTop: 12, fontWeight: '600', textAlign: 'center' },
  emptySub: { fontSize: 13, color: '#90A4AE', marginTop: 6, textAlign: 'center' },
  errorTxt: { fontSize: 14, color: '#C62828', marginTop: 10, textAlign: 'center' },
  backBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: '#1565C0' },
  backTxt: { fontSize: 14, fontWeight: '600', color: '#FFF' },
});
