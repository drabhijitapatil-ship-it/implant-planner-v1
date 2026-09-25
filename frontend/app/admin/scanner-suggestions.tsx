import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, TextInput, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import api from '../../utils/api';

/**
 * iter-Jun-2026: Implant In-Charge / Administrator review of "Other" intraoral
 * scanners typed by operators in Phase 4 Step 1. Approve (optionally correcting
 * spelling) → becomes a verified dropdown option for everyone. Reject → hidden.
 */
export default function ScannerSuggestionsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [edits, setEdits] = useState<Record<string, { company: string; model: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/intraoral-scanners/pending');
      setItems(Array.isArray(r.data) ? r.data : []);
    } catch (e: any) {
      Alert.alert('Could not load', e?.response?.data?.detail || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const act = async (id: string, action: 'approve' | 'reject') => {
    setBusy(id);
    try {
      const e = edits[id];
      await api.post(`/intraoral-scanners/${id}/${action}`, action === 'approve' ? { company: e?.company, model: e?.model } : {});
      await load();
    } catch (err: any) {
      Alert.alert('Action failed', err?.response?.data?.detail || 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const pending = items.filter((i) => i.status === 'pending');
  const rejected = items.filter((i) => i.status === 'rejected');

  const Row = ({ it }: { it: any }) => {
    const e = edits[it.id] || { company: it.company, model: it.model };
    const isPending = it.status === 'pending';
    return (
      <View style={s.card} testID={`scanner-suggestion-${it.id}`}>
        <View style={s.rowTop}>
          <Ionicons name="scan-outline" size={18} color={isPending ? '#E65100' : '#9E9E9E'} />
          <Text style={s.meta}>
            Suggested by {it.suggested_by_name || 'operator'} · used {it.uses || 1}×
          </Text>
          <View style={[s.pill, !isPending && { backgroundColor: '#EEE' }]}>
            <Text style={[s.pillTxt, !isPending && { color: '#757575' }]}>{isPending ? 'Pending' : 'Rejected'}</Text>
          </View>
        </View>
        <Text style={s.lbl}>Company</Text>
        <TextInput
          style={s.input}
          value={e.company}
          onChangeText={(t) => setEdits((p) => ({ ...p, [it.id]: { ...e, company: t } }))}
          testID={`scanner-suggestion-company-${it.id}`}
        />
        <Text style={s.lbl}>Model</Text>
        <TextInput
          style={s.input}
          value={e.model}
          onChangeText={(t) => setEdits((p) => ({ ...p, [it.id]: { ...e, model: t } }))}
          testID={`scanner-suggestion-model-${it.id}`}
        />
        <View style={s.actions}>
          {isPending ? (
            <TouchableOpacity style={[s.btn, s.btnReject]} disabled={busy === it.id} onPress={() => act(it.id, 'reject')} testID={`scanner-reject-${it.id}`}>
              <Ionicons name="close" size={16} color="#C62828" />
              <Text style={[s.btnTxt, { color: '#C62828' }]}>Reject</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={[s.btn, s.btnApprove]} disabled={busy === it.id} onPress={() => act(it.id, 'approve')} testID={`scanner-approve-${it.id}`}>
            {busy === it.id ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="checkmark" size={16} color="#FFF" />}
            <Text style={[s.btnTxt, { color: '#FFF' }]}>{isPending ? 'Approve & add to list' : 'Approve anyway'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} testID="scanner-suggestions-back">
          <Ionicons name="arrow-back" size={22} color="#1A1A1A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Scanner suggestions</Text>
          <Text style={s.subtitle}>New intraoral scanners entered under "Other"</Text>
        </View>
      </View>
      {loading ? (
        <View style={s.center}><ActivityIndicator color="#1565C0" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
          <Text style={s.section}>Pending ({pending.length})</Text>
          {pending.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="checkmark-done-circle-outline" size={40} color="#A5D6A7" />
              <Text style={s.emptyTxt}>No pending scanner suggestions</Text>
            </View>
          ) : pending.map((it) => <Row key={it.id} it={it} />)}
          {rejected.length > 0 ? (
            <>
              <Text style={[s.section, { marginTop: 20 }]}>Rejected ({rejected.length})</Text>
              {rejected.map((it) => <Row key={it.id} it={it} />)}
            </>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F5F7' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  subtitle: { fontSize: 12, color: '#777', marginTop: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  section: { fontSize: 13, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#ECEFF1' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  meta: { flex: 1, fontSize: 12, color: '#777' },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: '#FFF3E0' },
  pillTxt: { fontSize: 11, fontWeight: '700', color: '#E65100' },
  lbl: { fontSize: 11, fontWeight: '600', color: '#78909C', marginTop: 6, marginBottom: 4 },
  input: { minHeight: 42, borderWidth: 1, borderColor: '#D0DCE8', borderRadius: 8, paddingHorizontal: 10, fontSize: 14, color: '#222', backgroundColor: '#FAFAFA' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12, justifyContent: 'flex-end' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 40, borderRadius: 10 },
  btnReject: { backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#FFCDD2' },
  btnApprove: { backgroundColor: '#2E7D32' },
  btnTxt: { fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', padding: 32, gap: 8, backgroundColor: '#FFF', borderRadius: 12 },
  emptyTxt: { color: '#777', fontSize: 14 },
});
