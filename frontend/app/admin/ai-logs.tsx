// Super Admin → AI Logs: every AI request made in the app (who, which
// feature, model, speed, tokens, success or error). Metadata only — prompts
// and answers are never stored because they can describe patients.
import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import ScrollView from '@/components/KeyboardAwareScrollView';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import api from '../../utils/api';
import CenteredHeader from '../../components/CenteredHeader';
import { formatISTDate, formatISTTime } from '../../utils/istTime';

const RANGES = [7, 30, 90] as const;
const PAGE = 50;

const fmtNum = (n?: number | null) => (n == null ? '—' : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const fmtMs = (ms?: number | null) => (ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);

function Tile({ label, value, sub, icon, color }: { label: string; value: string; sub?: string; icon: any; color: string }) {
  return (
    <View style={s.tile}>
      <View style={[s.tileIcon, { backgroundColor: color + '18' }]}><Ionicons name={icon} size={17} color={color} /></View>
      <Text style={s.tileValue}>{value}</Text>
      <Text style={s.tileLabel}>{label}</Text>
      {!!sub && <Text style={s.tileSub}>{sub}</Text>}
    </View>
  );
}

function Bars({ data, color, onPick, picked }: { data: Record<string, number>; color: string; onPick?: (k: string) => void; picked?: string | null }) {
  const entries = Object.entries(data || {});
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (!entries.length) return <Text style={s.empty}>No AI calls yet</Text>;
  return (
    <View style={{ gap: 8 }}>
      {entries.map(([k, v]) => (
        <TouchableOpacity key={k} disabled={!onPick} onPress={() => onPick?.(k)} activeOpacity={0.7}>
          <View style={s.barHead}>
            <Text style={[s.barLabel, picked === k && { color: '#1565C0', fontWeight: '700' }]} numberOfLines={1}>{k}</Text>
            <Text style={s.barValue}>{v}</Text>
          </View>
          <View style={s.barTrack}><View style={[s.barFill, { width: `${(v / max) * 100}%`, backgroundColor: color }]} /></View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function AiLogsScreen() {
  const [days, setDays] = useState<number>(30);
  const [summary, setSummary] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [feature, setFeature] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const params = useCallback((skip: number) => ({
    skip, limit: PAGE, ...(onlyFailed ? { status: 'failed' } : {}), ...(feature ? { feature } : {}),
  }), [onlyFailed, feature]);

  const load = useCallback(async () => {
    try {
      const [sumRes, logRes] = await Promise.all([
        api.get('/admin/ai-logs/summary', { params: { days } }),
        api.get('/admin/ai-logs', { params: params(0) }),
      ]);
      setSummary(sumRes.data);
      setLogs(logRes.data?.logs || []);
      setTotal(logRes.data?.total || 0);
    } catch {
      // keep whatever is on screen
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days, params]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadMore = async () => {
    if (loadingMore || logs.length >= total) return;
    setLoadingMore(true);
    try {
      const r = await api.get('/admin/ai-logs', { params: params(logs.length) });
      setLogs((prev) => [...prev, ...(r.data?.logs || [])]);
    } catch {} finally { setLoadingMore(false); }
  };

  const daily: { date: string; count: number }[] = summary?.daily || [];
  const peak = Math.max(1, ...daily.map((d) => d.count));

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <CenteredHeader title="AI Logs" subtitle="Every AI request across Implanr" fallback="/super-admin-dashboard" />
      <View style={s.filters}>
        {RANGES.map((d) => (
          <TouchableOpacity key={d} style={[s.chip, days === d && s.chipActive]} onPress={() => { setLoading(true); setDays(d); }}>
            <Text style={[s.chipText, days === d && { color: '#FFF' }]}>Last {d} days</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color="#1565C0" /> : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {summary && (
            <>
              <View style={s.tiles}>
                <Tile label="AI requests" value={fmtNum(summary.calls)} icon="sparkles-outline" color="#7C3AED" />
                <Tile label="Success rate" value={summary.success_rate == null ? '—' : `${summary.success_rate}%`} sub={summary.failed ? `${summary.failed} failed` : undefined} icon="checkmark-done-outline" color="#16A34A" />
                <Tile label="Avg. response time" value={fmtMs(summary.avg_ms)} sub={summary.p95_ms ? `95% under ${fmtMs(summary.p95_ms)}` : undefined} icon="timer-outline" color="#0891B2" />
                <Tile label="Tokens used" value={fmtNum((summary.input_tokens || 0) + (summary.output_tokens || 0))} sub={`${fmtNum(summary.input_tokens)} in · ${fmtNum(summary.output_tokens)} out`} icon="analytics-outline" color="#EA580C" />
              </View>

              <View style={s.card}>
                <Text style={s.cardTitle}>Requests per day</Text>
                <View style={s.trend}>
                  {daily.map((d) => (
                    <View key={d.date} style={s.trendCol}>
                      <View style={[s.trendBar, { height: `${Math.max(3, (d.count / peak) * 100)}%`, opacity: d.count ? 1 : 0.25 }]} />
                    </View>
                  ))}
                </View>
                <Text style={s.axis}>Peak {peak}/day</Text>
              </View>

              <View style={s.card}>
                <Text style={s.cardTitle}>By feature {feature ? '· tap again to clear' : '· tap to filter the list'}</Text>
                <Bars data={summary.by_feature} color="#7C3AED" picked={feature} onPick={(k) => { setLoading(true); setFeature(feature === k ? null : k); }} />
              </View>

              <View style={s.card}>
                <Text style={s.cardTitle}>Most AI use · institutions</Text>
                {(summary.top_organizations || []).length === 0 && <Text style={s.empty}>No data yet</Text>}
                {(summary.top_organizations || []).map((o: any) => (
                  <View key={o.id} style={s.listRow}>
                    <Text style={s.listName} numberOfLines={1}>{o.name}</Text>
                    <Text style={s.listValue}>{o.calls}</Text>
                  </View>
                ))}
                <Text style={[s.cardTitle, { marginTop: 14 }]}>Most AI use · users</Text>
                {(summary.top_users || []).map((u: any) => (
                  <View key={u.id} style={s.listRow}>
                    <Text style={s.listName} numberOfLines={1}>{u.name || 'User'} <Text style={s.listMeta}>· {u.role}</Text></Text>
                    <Text style={s.listValue}>{u.calls}</Text>
                  </View>
                ))}
              </View>

              <View style={s.card}>
                <Text style={s.cardTitle}>Models</Text>
                <Bars data={summary.by_model} color="#0EA5E9" />
              </View>
            </>
          )}

          <View style={s.listHead}>
            <Text style={s.cardTitle}>Recent requests {feature ? `· ${feature}` : ''} ({total})</Text>
            <TouchableOpacity style={[s.chip, onlyFailed && s.chipFailed]} onPress={() => { setLoading(true); setOnlyFailed(!onlyFailed); }}>
              <Text style={[s.chipText, onlyFailed && { color: '#FFF' }]}>Failed only</Text>
            </TouchableOpacity>
          </View>
          {logs.length === 0 && <Text style={s.empty}>No AI requests{onlyFailed ? ' failed' : ''} in this view.</Text>}
          {logs.map((l) => (
            <View key={l.id} style={[s.logRow, !l.ok && s.logRowFailed]}>
              <View style={s.logTop}>
                <Ionicons name={l.ok ? 'checkmark-circle' : 'alert-circle'} size={16} color={l.ok ? '#16A34A' : '#DC2626'} />
                <Text style={s.logFeature} numberOfLines={1}>{l.feature || 'Other'}</Text>
                <Text style={s.logTime}>{formatISTDate(l.at)}, {formatISTTime(l.at)}</Text>
              </View>
              <Text style={s.logMeta} numberOfLines={1}>
                {l.user_name || 'Unknown user'}{l.user_role ? ` · ${l.user_role}` : ''}{l.org_name ? ` · ${l.org_name}` : ''}
              </Text>
              <Text style={s.logMeta}>
                {[l.model, fmtMs(l.duration_ms), (l.input_tokens != null || l.output_tokens != null) && `${fmtNum(l.input_tokens)} → ${fmtNum(l.output_tokens)} tokens`, l.images ? `${l.images} image${l.images === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}
              </Text>
              {!!l.error && <Text style={s.logError} numberOfLines={3}>{l.error}</Text>}
            </View>
          ))}
          {logs.length < total && (
            <TouchableOpacity style={s.more} onPress={loadMore} disabled={loadingMore}>
              {loadingMore ? <ActivityIndicator color="#1565C0" /> : <Text style={s.moreText}>Load more</Text>}
            </TouchableOpacity>
          )}
          <Text style={s.privacy}>Only usage details are logged. The questions sent to AI and its answers are never stored.</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingTop: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#CFD8DC' },
  chipActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  chipFailed: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#37474F' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  tile: { flexBasis: '47%', flexGrow: 1, backgroundColor: '#FFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E3E8EE' },
  tileIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  tileValue: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  tileLabel: { fontSize: 12, color: '#475569', fontWeight: '600', marginTop: 2 },
  tileSub: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  card: { backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: '#E3E8EE', padding: 14, marginBottom: 14 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 10 },
  empty: { fontSize: 13, color: '#94A3B8' },
  trend: { height: 80, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  trendCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  trendBar: { width: '100%', backgroundColor: '#7C3AED', borderRadius: 2 },
  axis: { fontSize: 10, color: '#94A3B8', marginTop: 4, textAlign: 'right' },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  barLabel: { flex: 1, fontSize: 13, color: '#334155', marginRight: 8 },
  barValue: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: '#EEF2F6', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  listName: { flex: 1, fontSize: 13, color: '#1E293B', marginRight: 8 },
  listMeta: { fontSize: 12, color: '#94A3B8' },
  listValue: { fontSize: 13, fontWeight: '700', color: '#7C3AED' },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  logRow: { backgroundColor: '#FFF', borderRadius: 10, borderWidth: 1, borderColor: '#E3E8EE', padding: 12, marginBottom: 8 },
  logRowFailed: { borderColor: '#FECACA', backgroundColor: '#FFF7F7' },
  logTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logFeature: { flex: 1, fontSize: 14, fontWeight: '700', color: '#0F172A' },
  logTime: { fontSize: 11, color: '#94A3B8' },
  logMeta: { fontSize: 12, color: '#64748B', marginTop: 3 },
  logError: { fontSize: 12, color: '#B91C1C', marginTop: 4 },
  more: { alignItems: 'center', paddingVertical: 12 },
  moreText: { fontSize: 14, fontWeight: '700', color: '#1565C0' },
  privacy: { fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 12 },
});
