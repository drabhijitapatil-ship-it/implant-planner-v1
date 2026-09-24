import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { BACKEND_URL } from '../utils/config';
import { downloadAuthenticated } from '../utils/csvDownload';

type Bucket = 'all' | 'completed' | 'in_progress' | 'rejected';

const BUCKET_LABEL: Record<string, string> = { completed: 'Completed', in_progress: 'In progress', rejected: 'Rejected' };
const BUCKET_COLOR: Record<string, string> = { completed: '#2E7D32', in_progress: '#1565C0', rejected: '#C62828' };

/**
 * iter-Jun-2026: Assistant Logbook — training record of every case the
 * student assisted on. Students open it from Profile → Training Records.
 * Faculty can open `/assistant-logbook?student_id=<id>` to review a trainee.
 */
export default function AssistantLogbookScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { student_id } = useLocalSearchParams<{ student_id?: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bucket, setBucket] = useState<Bucket>('all');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/me/assistant-logbook', { params: student_id ? { student_id } : {} });
      setData(r.data);
    } catch (e: any) {
      Alert.alert('Could not load logbook', e?.response?.data?.detail || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [student_id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const cases: any[] = useMemo(() => {
    const all = data?.cases || [];
    return bucket === 'all' ? all : all.filter((c: any) => c.status_bucket === bucket);
  }, [data, bucket]);

  const viewingOther = !!student_id && student_id !== (user?.id || (user as any)?._id);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const q = student_id ? `?student_id=${encodeURIComponent(student_id)}` : '';
      await downloadAuthenticated(`${BACKEND_URL}/api/me/assistant-logbook/export${q}`, `assistant-logbook-${format(new Date(), 'yyyyMMdd')}.csv`);
    } catch (e: any) {
      Alert.alert('Export failed', e?.message || 'Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} testID="assistant-logbook-back" accessibilityRole="button">
          <Ionicons name="arrow-back" size={22} color="#1A1A1A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Assistant Logbook</Text>
          <Text style={s.subtitle} numberOfLines={1}>
            {viewingOther && data?.student_name ? `Training record · ${data.student_name}` : 'Training record · cases you assisted'}
          </Text>
        </View>
        <TouchableOpacity onPress={exportCsv} disabled={exporting || !data?.total} style={[s.exportBtn, (!data?.total || exporting) && { opacity: 0.4 }]} testID="assistant-logbook-export">
          {exporting ? <ActivityIndicator size="small" color="#1565C0" /> : <Ionicons name="download-outline" size={20} color="#1565C0" />}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color="#5E35B1" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {/* Summary */}
          <View style={s.summaryCard} data-testid="assistant-logbook-summary-card">
            <View style={s.totalWrap}>
              <Text style={s.totalNum} data-testid="assistant-logbook-total">{data?.total ?? 0}</Text>
              <Text style={s.totalLbl}>cases assisted</Text>
            </View>
            <View style={s.splitRow}>
              {(['completed', 'in_progress', 'rejected'] as const).map((k) => (
                <View key={k} style={s.splitItem}>
                  <Text style={[s.splitNum, { color: BUCKET_COLOR[k] }]}>{data?.by_status?.[k] ?? 0}</Text>
                  <Text style={s.splitLbl}>{BUCKET_LABEL[k]}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* By procedure type */}
          {data?.by_procedure_type && Object.keys(data.by_procedure_type).length > 0 ? (
            <View style={s.section}>
              <Text style={s.sectionTitle}>By procedure type</Text>
              {Object.entries(data.by_procedure_type).map(([type, n]: any) => {
                const pct = data.total ? Math.round((n / data.total) * 100) : 0;
                return (
                  <View key={type} style={s.typeRow}>
                    <Text style={s.typeName} numberOfLines={1}>{type}</Text>
                    <View style={s.barTrack}><View style={[s.barFill, { width: `${pct}%` }]} /></View>
                    <Text style={s.typeCount}>{n}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* Filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
            {(['all', 'completed', 'in_progress', 'rejected'] as Bucket[]).map((b) => {
              const active = bucket === b;
              const n = b === 'all' ? data?.total ?? 0 : data?.by_status?.[b] ?? 0;
              return (
                <TouchableOpacity key={b} style={[s.chip, active && s.chipActive]} onPress={() => setBucket(b)} testID={`assistant-logbook-filter-${b}`}>
                  <Text style={[s.chipTxt, active && s.chipTxtActive]}>{b === 'all' ? 'All' : BUCKET_LABEL[b]} ({n})</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Case list */}
          {cases.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="people-outline" size={44} color="#C5CAE9" />
              <Text style={s.emptyTxt}>
                {data?.total ? 'No cases in this category' : 'No assisted cases yet.\nWhen a colleague adds you as an assistant and Phase 1 is approved, the case will appear here.'}
              </Text>
            </View>
          ) : (
            cases.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={s.caseCard}
                onPress={() => router.push(`/procedures/${c.id}`)}
                testID={`assistant-logbook-case-${c.id}`}
                data-testid={`assistant-logbook-case-${c.id}`}
              >
                <View style={s.caseTop}>
                  <Text style={s.patient} numberOfLines={1}>{c.patient_name}</Text>
                  <View style={[s.statusPill, { backgroundColor: `${BUCKET_COLOR[c.status_bucket]}1A` }]}>
                    <Text style={[s.statusTxt, { color: BUCKET_COLOR[c.status_bucket] }]}>{BUCKET_LABEL[c.status_bucket]}</Text>
                  </View>
                </View>
                <Text style={s.meta} numberOfLines={1}>#{c.registration_number} · {c.implant_procedure_type}{c.num_implants ? ` · ${c.num_implants} implant(s)` : ''}</Text>
                <View style={s.metaRow}>
                  <Ionicons name="calendar-outline" size={13} color="#666" />
                  <Text style={s.metaSm}>{c.procedure_date || '—'}{c.procedure_time ? ` · ${c.procedure_time}` : ''}</Text>
                  <Ionicons name="person-outline" size={13} color="#666" style={{ marginLeft: 10 }} />
                  <Text style={s.metaSm} numberOfLines={1}>Operator: {c.operator_name || '—'}</Text>
                </View>
                {c.supervisor_name ? (
                  <View style={s.metaRow}>
                    <Ionicons name="school-outline" size={13} color="#666" />
                    <Text style={s.metaSm} numberOfLines={1}>Supervisor: {c.supervisor_name}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F5F7' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  exportBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  subtitle: { fontSize: 12, color: '#777', marginTop: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  summaryCard: { margin: 16, borderRadius: 16, padding: 18, backgroundColor: '#4527A0' },
  totalWrap: { alignItems: 'center', marginBottom: 12 },
  totalNum: { fontSize: 44, fontWeight: '800', color: '#FFF', lineHeight: 48 },
  totalLbl: { fontSize: 13, color: '#D1C4E9', fontWeight: '600' },
  splitRow: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, paddingVertical: 10 },
  splitItem: { flex: 1, alignItems: 'center' },
  splitNum: { fontSize: 18, fontWeight: '800', color: '#FFF' },
  splitLbl: { fontSize: 11, color: '#EDE7F6', marginTop: 2 },
  section: { backgroundColor: '#FFF', marginHorizontal: 16, borderRadius: 12, padding: 14, marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 10 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  typeName: { width: 130, fontSize: 12, color: '#444' },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#EDE7F6', overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: '#7E57C2', borderRadius: 4 },
  typeCount: { width: 24, textAlign: 'right', fontSize: 12, fontWeight: '700', color: '#333' },
  chipRow: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  chip: { paddingHorizontal: 12, minHeight: 34, justifyContent: 'center', borderRadius: 17, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E0E0E0' },
  chipActive: { backgroundColor: '#5E35B1', borderColor: '#5E35B1' },
  chipTxt: { fontSize: 12, fontWeight: '600', color: '#555' },
  chipTxtActive: { color: '#FFF' },
  caseCard: { backgroundColor: '#FFF', marginHorizontal: 16, marginTop: 8, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#ECEFF1' },
  caseTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  patient: { flex: 1, fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusTxt: { fontSize: 11, fontWeight: '700' },
  meta: { fontSize: 12, color: '#666', marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  metaSm: { fontSize: 12, color: '#666', flexShrink: 1 },
  empty: { alignItems: 'center', padding: 40, gap: 12 },
  emptyTxt: { textAlign: 'center', color: '#777', fontSize: 14, lineHeight: 20 },
});
