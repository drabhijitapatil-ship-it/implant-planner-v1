// Super Admin → AI Logs: every AI request made in the app (who, which
// feature, model, speed, tokens, success or error). Metadata only — prompts
// and answers are never stored because they can describe patients.
import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Modal, TextInput, Alert } from 'react-native';
import ScrollView from '@/components/KeyboardAwareScrollView';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import api from '../../utils/api';
import CenteredHeader from '../../components/CenteredHeader';
import { formatISTDate, formatISTTime } from '../../utils/istTime';

const RANGES = [7, 30, 90] as const;
const GROUPS = [
  { key: 'day', label: 'Per day', hint: 'last 30 days' },
  { key: 'week', label: 'Per week', hint: 'last 12 weeks' },
  { key: 'month', label: 'Per month', hint: 'last 12 months' },
] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-11-05" → "5 Nov", week "2026-11-02" → "Week of 2 Nov", "2026-11" → "Nov 2026"
function periodLabel(p: string, group: string) {
  if (group === 'month') return `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
  const d = `${Number(p.slice(8, 10))} ${MONTHS[Number(p.slice(5, 7)) - 1]}`;
  return group === 'week' ? `Week of ${d}` : d;
}
function fmtCost(v: number, currency: string) {
  const sym = currency === 'USD' ? '$' : currency === 'INR' ? '₹' : `${currency} `;
  return `${sym}${v < 1 ? v.toFixed(3) : v.toFixed(2)}`;
}
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
  const [group, setGroup] = useState<'day' | 'week' | 'month'>('day');
  const [usage, setUsage] = useState<any>(null);
  const [pricing, setPricing] = useState<any>(null);
  const [priceOpen, setPriceOpen] = useState(false);
  const [priceDraft, setPriceDraft] = useState<Record<string, { in: string; out: string }>>({});
  const [currency, setCurrency] = useState('USD');
  const [savingPrices, setSavingPrices] = useState(false);

  const params = useCallback((skip: number) => ({
    skip, limit: PAGE, ...(onlyFailed ? { status: 'failed' } : {}), ...(feature ? { feature } : {}),
  }), [onlyFailed, feature]);

  const load = useCallback(async () => {
    try {
      const [sumRes, logRes, useRes, priceRes] = await Promise.all([
        api.get('/admin/ai-logs/summary', { params: { days } }),
        api.get('/admin/ai-logs', { params: params(0) }),
        api.get('/admin/ai-logs/usage', { params: { group } }),
        api.get('/admin/ai-pricing'),
      ]);
      setSummary(sumRes.data);
      setUsage(useRes.data);
      setPricing(priceRes.data);
      setLogs(logRes.data?.logs || []);
      setTotal(logRes.data?.total || 0);
    } catch {
      // keep whatever is on screen
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days, params, group]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadMore = async () => {
    if (loadingMore || logs.length >= total) return;
    setLoadingMore(true);
    try {
      const r = await api.get('/admin/ai-logs', { params: params(logs.length) });
      setLogs((prev) => [...prev, ...(r.data?.logs || [])]);
    } catch {} finally { setLoadingMore(false); }
  };

  const openPrices = () => {
    const models: string[] = Array.from(new Set([...(pricing?.models_seen || []), ...Object.keys(pricing?.models || {})]));
    const draft: Record<string, { in: string; out: string }> = {};
    models.forEach((m) => {
      const p = pricing?.models?.[m];
      draft[m] = { in: p ? String(p.input_per_million) : '', out: p ? String(p.output_per_million) : '' };
    });
    setPriceDraft(draft);
    setCurrency(pricing?.currency || 'USD');
    setPriceOpen(true);
  };
  const savePrices = async () => {
    const models: Record<string, { input_per_million: number; output_per_million: number }> = {};
    for (const [m, v] of Object.entries(priceDraft)) {
      if (v.in.trim() === '' && v.out.trim() === '') continue;
      const i = Number(v.in), o = Number(v.out);
      if (!isFinite(i) || !isFinite(o) || i < 0 || o < 0 || v.in.trim() === '' || v.out.trim() === '') {
        Alert.alert('Check prices', `Enter both prices for ${m} (numbers, per 1 million tokens).`);
        return;
      }
      models[m] = { input_per_million: i, output_per_million: o };
    }
    setSavingPrices(true);
    try {
      await api.put('/admin/ai-pricing', { currency, models });
      setPriceOpen(false);
      load();
    } catch (e: any) {
      Alert.alert('Could not save', e?.response?.data?.detail || 'Please try again');
    } finally {
      setSavingPrices(false);
    }
  };

  const daily: { date: string; count: number }[] = summary?.daily || [];
  const periods: any[] = usage?.periods || [];
  const periodPeak = Math.max(1, ...periods.map((p) => p.calls));
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
                <View style={s.usageHead}>
                  <Text style={[s.cardTitle, { marginBottom: 0, flex: 1 }]}>Usage over time</Text>
                  <TouchableOpacity onPress={openPrices} style={s.priceBtn}>
                    <Ionicons name="pricetag-outline" size={14} color="#1565C0" />
                    <Text style={s.priceBtnText}>AI prices</Text>
                  </TouchableOpacity>
                </View>
                <View style={[s.filters, { paddingHorizontal: 0, paddingTop: 10 }]}>
                  {GROUPS.map((g) => (
                    <TouchableOpacity key={g.key} style={[s.chip, group === g.key && s.chipActive]} onPress={() => { setLoading(true); setGroup(g.key); }}>
                      <Text style={[s.chipText, group === g.key && { color: '#FFF' }]}>{g.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {usage && (
                  <>
                    <Text style={s.usageTotals}>
                      {GROUPS.find((g) => g.key === group)?.hint}: {fmtNum(usage.totals.calls)} requests · {fmtNum(usage.totals.input_tokens + usage.totals.output_tokens)} tokens
                      {usage.priced ? ` · est. ${fmtCost(usage.totals.cost, usage.currency)}` : ''}
                    </Text>
                    <View style={[s.trend, { marginTop: 10 }]}>
                      {periods.map((p) => (
                        <View key={p.period} style={s.trendCol}>
                          <View style={[s.trendBar, { height: `${Math.max(3, (p.calls / periodPeak) * 100)}%`, opacity: p.calls ? 1 : 0.25 }]} />
                        </View>
                      ))}
                    </View>
                    <View style={s.tableHead}>
                      <Text style={[s.th, { flex: 1.4 }]}>{group === 'day' ? 'Day' : group === 'week' ? 'Week' : 'Month'}</Text>
                      <Text style={s.th}>Requests</Text>
                      <Text style={s.th}>Tokens</Text>
                      <Text style={s.th}>{usage.priced ? 'Est. cost' : 'Failed'}</Text>
                    </View>
                    {[...periods].reverse().filter((p) => p.calls || group !== 'day').map((p) => (
                      <View key={p.period} style={s.tr}>
                        <View style={{ flex: 1.4 }}>
                          <Text style={s.tdStrong}>{periodLabel(p.period, group)}</Text>
                          {!!p.top_feature && <Text style={s.tdSub} numberOfLines={1}>Most: {p.top_feature}</Text>}
                        </View>
                        <Text style={s.td}>{p.calls}{p.failed ? <Text style={{ color: '#DC2626' }}> ({p.failed}✕)</Text> : null}</Text>
                        <Text style={s.td}>{fmtNum(p.input_tokens + p.output_tokens)}</Text>
                        <Text style={s.td}>{usage.priced ? fmtCost(p.cost, usage.currency) + (p.unpriced_calls ? '*' : '') : String(p.failed)}</Text>
                      </View>
                    ))}
                    {group === 'day' && periods.every((p) => !p.calls) && <Text style={[s.empty, { marginTop: 8 }]}>No AI requests in the last 30 days.</Text>}
                    {usage.priced
                      ? (periods.some((p) => p.unpriced_calls) && <Text style={s.note}>* Includes requests from a model with no price set — tap "AI prices" to add it.</Text>)
                      : <Text style={s.note}>Tap "AI prices" and enter your provider's price per 1 million tokens to see estimated cost.</Text>}
                  </>
                )}
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

      <Modal visible={priceOpen} transparent animationType="slide" onRequestClose={() => setPriceOpen(false)}>
        <View style={s.sheetWrap}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>AI prices</Text>
            <Text style={s.sheetSub}>Price per 1 million tokens from your AI provider plan. Used only to estimate cost here.</Text>
            <View style={[s.filters, { paddingHorizontal: 0, paddingTop: 4, marginBottom: 10 }]}>
              {['USD', 'INR'].map((c) => (
                <TouchableOpacity key={c} style={[s.chip, currency === c && s.chipActive]} onPress={() => setCurrency(c)}>
                  <Text style={[s.chipText, currency === c && { color: '#FFF' }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <ScrollView style={{ maxHeight: 340 }}>
              {Object.keys(priceDraft).length === 0 && <Text style={s.empty}>No models used yet — prices can be added after the first AI request.</Text>}
              {Object.entries(priceDraft).map(([m, v]) => (
                <View key={m} style={{ marginBottom: 12 }}>
                  <Text style={s.modelName}>{m}</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput style={s.priceInput} value={v.in} keyboardType="decimal-pad" placeholder="Input / 1M" placeholderTextColor="#94A3B8"
                      onChangeText={(t) => setPriceDraft((d) => ({ ...d, [m]: { ...d[m], in: t } }))} />
                    <TextInput style={s.priceInput} value={v.out} keyboardType="decimal-pad" placeholder="Output / 1M" placeholderTextColor="#94A3B8"
                      onChangeText={(t) => setPriceDraft((d) => ({ ...d, [m]: { ...d[m], out: t } }))} />
                  </View>
                </View>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <TouchableOpacity style={[s.sheetBtn, { backgroundColor: '#ECEFF1' }]} onPress={() => setPriceOpen(false)}>
                <Text style={[s.sheetBtnText, { color: '#37474F' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.sheetBtn} onPress={savePrices} disabled={savingPrices}>
                {savingPrices ? <ActivityIndicator color="#FFF" /> : <Text style={s.sheetBtnText}>Save</Text>}
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
  usageHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priceBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#E3F2FD' },
  priceBtnText: { fontSize: 12, fontWeight: '700', color: '#1565C0' },
  usageTotals: { fontSize: 12, color: '#475569', marginTop: 10 },
  tableHead: { flexDirection: 'row', paddingVertical: 8, marginTop: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  th: { flex: 1, fontSize: 11, fontWeight: '700', color: '#64748B', textAlign: 'right' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  td: { flex: 1, fontSize: 13, color: '#0F172A', textAlign: 'right' },
  tdStrong: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  tdSub: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  note: { fontSize: 11, color: '#94A3B8', marginTop: 10 },
  sheetWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18, paddingBottom: 32 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  sheetSub: { fontSize: 12, color: '#64748B', marginTop: 4, marginBottom: 8 },
  modelName: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 6 },
  priceInput: { flex: 1, borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: '#0F172A' },
  sheetBtn: { flex: 1, backgroundColor: '#1565C0', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  sheetBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});
