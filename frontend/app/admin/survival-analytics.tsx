/**
 * iter-342 Phase C — Implant Survival Analytics Dashboard
 *
 * Full analytics dashboard for Administrator + Implant In-Charge.
 * Widgets:
 *   - Summary counters (Placed / Active / Failed / Replacement Success%)
 *   - Filters (date range, system, tooth bucket)
 *   - Bar charts (by system, by tooth bucket, failure reasons)
 *   - Monthly time-series (placed vs failed vs survival%)
 *   - CSV export
 *
 * Role gate: administrator + implant_incharge only (403 otherwise).
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api, { getToken } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

type Counters = {
  placed: number; active: number; failed: number;
  replaced_success: number; replaced_refailed: number;
};
type Rates = { survival_rate: number; replacement_success_rate: number };
type SystemRow = { system: string; placed: number; active: number; failed: number; replaced: number; survival_rate: number };
type ToothRow = { bucket: string; placed: number; active: number; failed: number; replaced: number; survival_rate: number };
type ReasonRow = { reason: string; count: number };
type MonthRow = { month: string; placed: number; failed: number; survival_rate: number | null };

const TOOTH_BUCKET_LABEL: Record<string, string> = {
  anterior_max: 'Anterior maxilla',
  posterior_max: 'Posterior maxilla',
  anterior_mand: 'Anterior mandible',
  posterior_mand: 'Posterior mandible',
  unknown: 'Unknown',
};

export default function SurvivalAnalyticsScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const canAccess = user?.role === 'implant_incharge' || user?.role === 'administrator';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [counters, setCounters] = useState<Counters | null>(null);
  const [rates, setRates] = useState<Rates | null>(null);
  const [bySystem, setBySystem] = useState<SystemRow[]>([]);
  const [byTooth, setByTooth] = useState<ToothRow[]>([]);
  const [reasons, setReasons] = useState<ReasonRow[]>([]);
  const [timeSeries, setTimeSeries] = useState<MonthRow[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [systemFilter, setSystemFilter] = useState('');
  const [toothBucket, setToothBucket] = useState('');

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const params: any = {};
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      if (systemFilter) params.system = systemFilter;
      if (toothBucket) params.tooth_bucket = toothBucket;
      const res = await api.get('/analytics/survival', { params });
      setCounters(res.data?.counters || null);
      setRates(res.data?.rates || null);
      setBySystem(res.data?.by_system || []);
      setByTooth(res.data?.by_tooth || []);
      setReasons(res.data?.failure_reasons || []);
      setTimeSeries(res.data?.time_series || []);
    } catch (e: any) {
      Alert.alert('Failed to load analytics', e?.response?.data?.detail || 'Please try again');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fromDate, toDate, systemFilter, toothBucket]);

  useEffect(() => { if (canAccess) load(); else if (!authLoading) setLoading(false); }, [canAccess, authLoading, load]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from_date', fromDate);
      if (toDate) params.set('to_date', toDate);
      if (systemFilter) params.set('system', systemFilter);
      if (toothBucket) params.set('tooth_bucket', toothBucket);
      const url = `${(api.defaults.baseURL || '').replace(/\/$/, '')}/analytics/survival/export.csv?${params.toString()}`;
      const token = await getToken('access_token');
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        Alert.alert('Export failed', `Server returned ${res.status}`);
        return;
      }
      const blob = await res.blob();
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        const objUrl = URL.createObjectURL(blob);
        a.href = objUrl;
        a.download = `implanr-survival-analytics.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objUrl);
      } else {
        Alert.alert('Downloaded', 'CSV export completed.');
      }
    } catch (e: any) {
      Alert.alert('Export failed', String(e?.message || e));
    } finally {
      setExporting(false);
    }
  };

  if (authLoading) {
    return <SafeAreaView style={s.c}><ActivityIndicator size="large" color="#1565C0" style={{ marginTop: 80 }} /></SafeAreaView>;
  }

  if (!canAccess) {
    return (
      <SafeAreaView style={s.c}>
        <View style={s.blockedCard}>
          <Ionicons name="lock-closed-outline" size={36} color="#C62828" />
          <Text style={s.blockedTitle}>Access denied</Text>
          <Text style={s.blockedBody}>Only Administrator and Implant In-Charge accounts can view survival analytics.</Text>
          <TouchableOpacity style={s.blockedBtn} onPress={() => router.back()}><Text style={s.blockedBtnT}>Go back</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return <SafeAreaView style={s.c}><ActivityIndicator size="large" color="#1565C0" style={{ marginTop: 80 }} /></SafeAreaView>;
  }

  const maxSystemPlaced = Math.max(1, ...bySystem.map(x => x.placed));
  const maxToothPlaced = Math.max(1, ...byTooth.map(x => x.placed));
  const maxReason = Math.max(1, ...reasons.map(x => x.count));
  const maxMonthPlaced = Math.max(1, ...timeSeries.map(x => x.placed));

  return (
    <SafeAreaView style={s.c} edges={['top', 'bottom']}>
      <View style={s.h}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }} data-testid="analytics-back" testID="analytics-back">
          <Ionicons name="arrow-back" size={22} color="#1565C0" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={s.title}>Implant Survival Analytics</Text>
          <Text style={s.sub}>Institutional outcomes across all cases</Text>
        </View>
        <TouchableOpacity style={s.exportBtn} onPress={handleExportCsv} disabled={exporting} data-testid="analytics-export-csv" testID="analytics-export-csv">
          {exporting ? <ActivityIndicator color="#FFF" size="small" /> : <><Ionicons name="download-outline" size={16} color="#FFF" /><Text style={s.exportBtnT}>CSV</Text></>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Filters */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>Filters</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TextInput style={[s.input, { flex: 1 }]} placeholder="From (YYYY-MM-DD)" value={fromDate} onChangeText={setFromDate} data-testid="filter-from-date" testID="filter-from-date" />
            <TextInput style={[s.input, { flex: 1 }]} placeholder="To (YYYY-MM-DD)" value={toDate} onChangeText={setToDate} data-testid="filter-to-date" testID="filter-to-date" />
          </View>
          <TextInput style={s.input} placeholder="System (e.g. Straumann BLT)" value={systemFilter} onChangeText={setSystemFilter} data-testid="filter-system" testID="filter-system" />
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {['', 'anterior_max', 'posterior_max', 'anterior_mand', 'posterior_mand'].map(b => (
              <TouchableOpacity key={b || 'all'} style={[s.chip, toothBucket === b && s.chipOn]} onPress={() => setToothBucket(b)} data-testid={`filter-tooth-${b || 'all'}`} testID={`filter-tooth-${b || 'all'}`}>
                <Text style={[s.chipT, toothBucket === b && s.chipTOn]}>{b ? TOOTH_BUCKET_LABEL[b] : 'All positions'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={s.applyBtn} onPress={load} disabled={refreshing} data-testid="filter-apply" testID="filter-apply">
            {refreshing ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="funnel-outline" size={16} color="#FFF" /><Text style={s.applyBtnT}>Apply filters</Text></>}
          </TouchableOpacity>
        </View>

        {/* Summary counters */}
        <View style={s.grid}>
          <CounterCard label="Implants Placed" value={counters?.placed ?? 0} color="#1565C0" testid="metric-placed" />
          <CounterCard label="Active" value={counters?.active ?? 0} color="#2E7D32" testid="metric-active" />
          <CounterCard label="Failed" value={counters?.failed ?? 0} color="#C62828" testid="metric-failed" />
          <CounterCard label="Survival Rate" value={`${rates?.survival_rate ?? 0}%`} color="#0D47A1" testid="metric-survival" />
        </View>
        <View style={s.grid}>
          <CounterCard label="Replacements Successful" value={counters?.replaced_success ?? 0} color="#EF6C00" testid="metric-repl-success" />
          <CounterCard label="Replacements Re-failed" value={counters?.replaced_refailed ?? 0} color="#B71C1C" testid="metric-repl-refail" />
          <CounterCard label="Replacement Success %" value={`${rates?.replacement_success_rate ?? 0}%`} color="#00695C" testid="metric-repl-rate" wide />
        </View>

        {/* By System */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>Survival by System</Text>
          {bySystem.length === 0 ? <EmptyRow /> : bySystem.map(row => (
            <BarRow key={row.system} label={row.system} value={row.placed} max={maxSystemPlaced}
              tag={`${row.survival_rate}%`} tagColor={row.survival_rate >= 95 ? '#2E7D32' : row.survival_rate >= 85 ? '#EF6C00' : '#C62828'}
              subtitle={`${row.active} active · ${row.failed} failed · ${row.replaced} replaced`}
              testid={`row-system-${row.system.replace(/\s+/g,'-')}`} />
          ))}
        </View>

        {/* By Tooth Bucket */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>Survival by Tooth Position</Text>
          {byTooth.length === 0 ? <EmptyRow /> : byTooth.map(row => (
            <BarRow key={row.bucket} label={TOOTH_BUCKET_LABEL[row.bucket] || row.bucket} value={row.placed} max={maxToothPlaced}
              tag={`${row.survival_rate}%`} tagColor={row.survival_rate >= 95 ? '#2E7D32' : row.survival_rate >= 85 ? '#EF6C00' : '#C62828'}
              subtitle={`${row.active} active · ${row.failed} failed · ${row.replaced} replaced`}
              testid={`row-tooth-${row.bucket}`} />
          ))}
        </View>

        {/* Failure Reasons */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>Failure Reasons</Text>
          {reasons.filter(r => r.count > 0).length === 0 ? <EmptyRow message="No failures recorded in this range." /> : reasons.filter(r => r.count > 0).map(r => (
            <BarRow key={r.reason} label={r.reason} value={r.count} max={maxReason} tagColor="#C62828"
              testid={`row-reason-${r.reason.replace(/\s+/g,'-')}`} />
          ))}
        </View>

        {/* Monthly Time Series */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>Monthly Trend</Text>
          <Text style={s.sectionSub}>Placed vs Failed per month · Survival rate overlay</Text>
          {timeSeries.length === 0 ? <EmptyRow /> : (
            <View style={{ marginTop: 12 }}>
              {timeSeries.map(m => (
                <View key={m.month} style={s.monthRow} data-testid={`row-month-${m.month}`} testID={`row-month-${m.month}`}>
                  <Text style={s.monthLabel}>{m.month}</Text>
                  <View style={s.monthBars}>
                    <View style={[s.monthBar, { width: `${(m.placed / maxMonthPlaced) * 60}%`, backgroundColor: '#1565C0' }]} />
                    <View style={[s.monthBar, { width: `${(m.failed / maxMonthPlaced) * 60}%`, backgroundColor: '#C62828', marginTop: 4 }]} />
                  </View>
                  <View style={{ minWidth: 90, alignItems: 'flex-end' }}>
                    <Text style={s.monthValueBlue}>P: {m.placed}</Text>
                    <Text style={s.monthValueRed}>F: {m.failed}</Text>
                    <Text style={s.monthValueGreen}>{m.survival_rate != null ? `${m.survival_rate}%` : '—'}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function CounterCard({ label, value, color, testid, wide }: { label: string; value: string | number; color: string; testid: string; wide?: boolean }) {
  return (
    <View style={[s.counter, wide && { flex: 1 }]} data-testid={testid} testID={testid}>
      <Text style={[s.counterValue, { color }]}>{value}</Text>
      <Text style={s.counterLabel}>{label}</Text>
    </View>
  );
}

function BarRow({ label, value, max, tag, tagColor, subtitle, testid }: {
  label: string; value: number; max: number; tag?: string; tagColor?: string; subtitle?: string; testid?: string;
}) {
  const pct = Math.max(4, (value / max) * 100);
  return (
    <View style={s.barRow} data-testid={testid} testID={testid}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={s.barLabel} numberOfLines={1}>{label}</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline' }}>
          <Text style={s.barValue}>{value}</Text>
          {tag && <Text style={[s.barTag, tagColor ? { color: tagColor } : null]}>{tag}</Text>}
        </View>
      </View>
      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${pct}%`, backgroundColor: tagColor || '#1565C0' }]} />
      </View>
      {subtitle && <Text style={s.barSub}>{subtitle}</Text>}
    </View>
  );
}

function EmptyRow({ message }: { message?: string }) {
  return <Text style={s.emptyText}>{message || 'No data available yet.'}</Text>;
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: '#F5F7FA' },
  h: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E0E6EF' },
  title: { fontSize: 16, fontWeight: '800', color: '#1A237E' },
  sub: { fontSize: 12, color: '#546E7A', marginTop: 2 },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E0E6EF' },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#0D47A1' },
  sectionSub: { fontSize: 11, color: '#546E7A', marginTop: 3 },
  input: { borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 13, color: '#1e2a44', backgroundColor: '#FFF', marginTop: 8 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#CFD8DC', backgroundColor: '#FAFAFA' },
  chipOn: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  chipT: { fontSize: 12, color: '#37474F', fontWeight: '600' },
  chipTOn: { color: '#FFF' },
  applyBtn: { marginTop: 10, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1565C0', paddingVertical: 10, borderRadius: 8 },
  applyBtnT: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  exportBtn: { flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: '#2E7D32', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  exportBtnT: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  grid: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  counter: { flex: 1, backgroundColor: '#FFF', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#E0E6EF', alignItems: 'flex-start' },
  counterValue: { fontSize: 22, fontWeight: '900' },
  counterLabel: { fontSize: 10, color: '#546E7A', marginTop: 3, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  barRow: { marginTop: 12 },
  barLabel: { fontSize: 13, fontWeight: '700', color: '#1A237E', flex: 1 },
  barValue: { fontSize: 13, fontWeight: '800', color: '#1A237E' },
  barTag: { fontSize: 12, fontWeight: '800', marginLeft: 4 },
  barSub: { fontSize: 11, color: '#546E7A', marginTop: 3 },
  barTrack: { marginTop: 6, height: 8, backgroundColor: '#ECEFF1', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  emptyText: { fontSize: 12, color: '#78909C', marginTop: 12, fontStyle: 'italic' },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  monthLabel: { fontSize: 12, fontWeight: '700', color: '#1A237E', width: 70 },
  monthBars: { flex: 1 },
  monthBar: { height: 8, borderRadius: 4 },
  monthValueBlue: { fontSize: 11, fontWeight: '700', color: '#1565C0' },
  monthValueRed: { fontSize: 11, fontWeight: '700', color: '#C62828' },
  monthValueGreen: { fontSize: 11, fontWeight: '800', color: '#2E7D32' },
  blockedCard: { margin: 24, padding: 24, backgroundColor: '#FFF', borderRadius: 12, alignItems: 'center' },
  blockedTitle: { fontSize: 16, fontWeight: '800', color: '#C62828', marginTop: 12 },
  blockedBody: { fontSize: 13, color: '#546E7A', textAlign: 'center', marginTop: 8 },
  blockedBtn: { marginTop: 16, backgroundColor: '#1565C0', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  blockedBtnT: { color: '#FFF', fontWeight: '800' },
});
