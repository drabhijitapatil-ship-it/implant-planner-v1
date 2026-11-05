// Super Admin → Issue Reports: problems users sent from "Report an Issue",
// with their screenshots. Screenshot files are served only to the reporter
// and super admins (backend serve_upload).
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, RefreshControl, Alert, Image, Modal, TextInput } from 'react-native';
import ScrollView from '@/components/KeyboardAwareScrollView';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import api, { getAuthFileUrl } from '../../utils/api';
import CenteredHeader from '../../components/CenteredHeader';
import { formatISTDate, formatISTTime } from '../../utils/istTime';

const STATUSES = ['new', 'in_progress', 'resolved', 'closed'] as const;
const STATUS_META: Record<string, { label: string; fg: string; bg: string }> = {
  new: { label: 'New', fg: '#1565C0', bg: '#E3F2FD' },
  in_progress: { label: 'In progress', fg: '#EF6C00', bg: '#FFF3E0' },
  resolved: { label: 'Resolved', fg: '#2E7D32', bg: '#E8F5E9' },
  closed: { label: 'Closed', fg: '#546E7A', bg: '#ECEFF1' },
};
const CATEGORY_LABEL: Record<string, string> = {
  not_working: 'Something isn’t working',
  wrong_data: 'Wrong or missing data',
  slow_or_crash: 'Slow / app closes',
  suggestion: 'Suggestion',
  other: 'Other',
};

function Shot({ filename, onOpen }: { filename: string; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { getAuthFileUrl(filename).then(setUrl).catch(() => setUrl(null)); }, [filename]);
  return (
    <TouchableOpacity style={s.shot} onPress={() => url && onOpen(url)} disabled={!url}>
      {url ? <Image source={{ uri: url }} style={s.shotImg} /> : <ActivityIndicator color="#1565C0" />}
    </TouchableOpacity>
  );
}

export default function IssueReportsScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>('new');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<any | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async (f: string) => {
    try {
      const { data } = await api.get('/admin/issues', { params: f === 'all' ? {} : { status: f } });
      setItems(data || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(filter); }, [filter, load]));

  const update = async (id: string, body: { status?: string; admin_note?: string }) => {
    try {
      await api.patch(`/admin/issues/${id}`, body);
      setItems((prev) => {
        const next = prev.map((r) => (r.id === id ? { ...r, ...body } : r));
        return body.status && filter !== 'all' ? next.filter((r) => r.id !== id) : next;
      });
    } catch (e: any) {
      Alert.alert('Could not update', e?.response?.data?.detail || 'Please try again');
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <CenteredHeader title="Issue Reports" subtitle="Problems reported by users" fallback="/super-admin-dashboard" />
      <View style={s.filters}>
        {(['all', ...STATUSES] as string[]).map((f) => (
          <TouchableOpacity key={f} style={[s.filter, filter === f && s.filterActive]} onPress={() => { setLoading(true); setFilter(f); }}>
            <Text style={[s.filterText, filter === f && { color: '#FFF' }]}>{f === 'all' ? 'All' : STATUS_META[f].label}</Text>
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
          {items.length === 0 && <Text style={s.empty}>No {filter === 'all' ? '' : STATUS_META[filter].label.toLowerCase() + ' '}reports.</Text>}
          {items.map((r) => {
            const st = STATUS_META[r.status] || STATUS_META.new;
            return (
              <View key={r.id} style={s.card} testID={`issue-report-${r.id}`}>
                <View style={s.cardTop}>
                  <Text style={s.category}>{CATEGORY_LABEL[r.category] || 'Other'}</Text>
                  <View style={[s.pill, { backgroundColor: st.bg }]}><Text style={[s.pillText, { color: st.fg }]}>{st.label}</Text></View>
                </View>
                <Text style={s.desc}>{r.description}</Text>
                {Array.isArray(r.attachments) && r.attachments.length > 0 && (
                  <View style={s.shots}>
                    {r.attachments.map((f: string) => <Shot key={f} filename={f} onOpen={setViewer} />)}
                  </View>
                )}
                <Text style={s.person}>
                  {r.user_name || 'User'} · {r.user_role}{r.org_name ? ` · ${r.org_name}` : ''}
                </Text>
                <Text style={s.meta}>
                  {[r.app_version, r.platform, r.device, r.screen && `screen ${r.screen}`].filter(Boolean).join(' · ')}
                </Text>
                <Text style={s.when}>{formatISTDate(r.created_at)}, {formatISTTime(r.created_at)} IST</Text>
                {!!r.admin_note && <Text style={s.note}>Note to user: {r.admin_note}</Text>}
                <View style={s.actions}>
                  {!!r.user_email && (
                    <TouchableOpacity style={s.action} onPress={() => Linking.openURL(`mailto:${r.user_email}?subject=${encodeURIComponent('Your Implanr issue report')}`)}>
                      <Ionicons name="mail-outline" size={16} color="#1565C0" /><Text style={s.actionText} numberOfLines={1}>{r.user_email}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={s.action} onPress={() => { setNoteFor(r); setNote(r.admin_note || ''); }}>
                    <Ionicons name="create-outline" size={16} color="#1565C0" /><Text style={s.actionText}>{r.admin_note ? 'Edit note' : 'Add note'}</Text>
                  </TouchableOpacity>
                </View>
                <View style={s.statusRow}>
                  {STATUSES.filter((x) => x !== r.status).map((x) => (
                    <TouchableOpacity key={x} style={s.statusBtn} onPress={() => update(r.id, { status: x })}>
                      <Text style={s.statusBtnText}>Mark {STATUS_META[x].label.toLowerCase()}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <TouchableOpacity style={s.viewer} activeOpacity={1} onPress={() => setViewer(null)}>
          {!!viewer && <Image source={{ uri: viewer }} style={s.viewerImg} resizeMode="contain" />}
          <Text style={s.viewerHint}>Tap to close</Text>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!noteFor} transparent animationType="slide" onRequestClose={() => setNoteFor(null)}>
        <View style={s.noteWrap}>
          <View style={s.noteSheet}>
            <Text style={s.noteTitle}>Note to the user</Text>
            <Text style={s.noteSub}>Shown to the reporter under "Your reports".</Text>
            <TextInput style={s.noteInput} value={note} onChangeText={setNote} multiline maxLength={2000}
              placeholder="e.g. Fixed in the latest update — please restart the app." placeholderTextColor="#90A4AE" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[s.noteBtn, { backgroundColor: '#ECEFF1' }]} onPress={() => setNoteFor(null)}>
                <Text style={[s.noteBtnText, { color: '#37474F' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.noteBtn} onPress={() => { update(noteFor.id, { admin_note: note }); setNoteFor(null); }}>
                <Text style={s.noteBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  category: { flex: 1, fontSize: 15, fontWeight: '700', color: '#0D2B4E' },
  pill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 11, fontWeight: '700' },
  desc: { fontSize: 14, color: '#263238', marginTop: 8, lineHeight: 20 },
  shots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  shot: { width: 72, height: 110, borderRadius: 8, overflow: 'hidden', backgroundColor: '#ECEFF1', alignItems: 'center', justifyContent: 'center' },
  shotImg: { width: '100%', height: '100%' },
  person: { fontSize: 13, color: '#37474F', marginTop: 10, fontWeight: '600' },
  meta: { fontSize: 11, color: '#78909C', marginTop: 3 },
  when: { fontSize: 11, color: '#90A4AE', marginTop: 3 },
  note: { fontSize: 12, color: '#2E7D32', marginTop: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#E3F2FD', maxWidth: '100%' },
  actionText: { fontSize: 12, fontWeight: '600', color: '#1565C0', flexShrink: 1 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  statusBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#CFD8DC' },
  statusBtnText: { fontSize: 11, color: '#455A64', fontWeight: '600' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImg: { width: '92%', height: '82%' },
  viewerHint: { color: '#B0BEC5', fontSize: 12, marginTop: 10 },
  noteWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  noteSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18, paddingBottom: 32 },
  noteTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  noteSub: { fontSize: 12, color: '#78909C', marginTop: 2, marginBottom: 10 },
  noteInput: { minHeight: 100, borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10, padding: 10, fontSize: 14, color: '#1A1A1A', marginBottom: 12, textAlignVertical: 'top' },
  noteBtn: { flex: 1, backgroundColor: '#1565C0', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  noteBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});
