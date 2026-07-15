/**
 * iter-363 — Procedure-Type Analytics (Phase Analytics-1)
 *
 * Role-scoped analytics dashboard answering:
 *   • Volume — cases per procedure type (Single Conventional, Multiple, Sinus
 *     Lift, Immediate, All-on-4/6/X, …)
 *   • Success — completed vs terminated per procedure type
 *   • Time — mean lifecycle days per procedure type
 *   • Clinical numerics — average torque (Ncm) and ISQ per procedure type
 *   • Prosthesis mix — which prosthesis was delivered for which procedure type
 *   • Trend — monthly / yearly volume over time
 *   • De-identified CSV export
 *
 * Scope by role:
 *   • student → own cases only + anonymised cohort medians
 *   • supervisor → cases they oversee
 *   • implant_incharge / administrator → institution-wide (optional student filter)
 *   • nurse → blocked
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, Alert, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api, { getToken } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

type KPIs = {
  total_cases: number; completed: number; terminated: number;
  rejected: number; in_progress: number; draft: number;
  success_rate: number | null;
  mean_lifecycle_days: number | null;
  median_lifecycle_days: number | null;
};
type ByType = {
  procedure_type: string; total: number;
  completed: number; in_progress: number; rejected: number; terminated: number; draft: number;
  success_rate: number | null;
  mean_days: number | null;
  avg_torque_ncm: number | null;
  avg_isq: number | null;
};
type ProsthesisMix = {
  procedure_type: string;
  prostheses: { label: string; count: number }[];
};
type TrendRow = { period: string; total: number; completed: number; terminated: number };
type Cohort = { student_count: number; success_rate_median: number | null; lifecycle_days_median: number | null };

type AnalyticsPayload = {
  scope: { role: string; own_only: boolean; student_id_filter: string | null };
  filters: { from_date: string | null; to_date: string | null; procedure_types: string[] | null; granularity: 'monthly' | 'yearly' };
  kpis: KPIs;
  by_procedure_type: ByType[];
  prosthesis_mix: ProsthesisMix[];
  trend: TrendRow[];
  cohort?: Cohort;
};

const FMT = (v: number | null | undefined, suffix = '') =>
  v === null || v === undefined ? '—' : `${v}${suffix}`;

export default function ProcedureOverviewScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const canAccess = user?.role === 'student' || user?.role === 'supervisor'
    || user?.role === 'implant_incharge' || user?.role === 'administrator';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [granularity, setGranularity] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [typeFilterOpen, setTypeFilterOpen] = useState(false);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = { granularity };
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      if (selectedTypes.length > 0) params.procedure_type = selectedTypes.join(',');
      const res = await api.get('/analytics/procedure-overview', { params });
      setData(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, granularity, selectedTypes]);

  useEffect(() => {
    if (!authLoading && canAccess) fetchAnalytics();
  }, [authLoading, canAccess, fetchAnalytics]);

  const allTypes = useMemo(() => {
    // Union of currently returned procedure types + any staples so the picker
    // still shows the expected list even if no cases of a given type exist yet.
    const staples = [
      'Single Conventional Implant', 'Multiple Conventional Implants',
      'Immediate Implant', 'Sinus Lift', 'All on 4', 'All on 6', 'All on X',
      'Implant Placement with Guided Bone Regeneration', 'Existing Implant',
    ];
    const fromData = (data?.by_procedure_type || []).map(r => r.procedure_type);
    return Array.from(new Set([...staples, ...fromData])).sort();
  }, [data]);

  const handleExport = async () => {
    try {
      const params: any = { granularity };
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      if (selectedTypes.length > 0) params.procedure_type = selectedTypes.join(',');
      const qs = new URLSearchParams(params).toString();
      const baseUrl = api.defaults.baseURL || '';
      const token = await getToken();
      const url = `${baseUrl}/analytics/procedure-overview/export.csv?${qs}&token=${token || ''}`;
      // Fetch as blob so we can rename the file on Web; on native, deep-link opens.
      if (Platform.OS === 'web') {
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!resp.ok) throw new Error('Export failed');
        const blob = await resp.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `procedure-overview-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
      } else {
        // React Native — deep-link opens in browser / native download provider
        Linking.openURL(url);
      }
    } catch (e: any) {
      Alert.alert('Export failed', e?.message || 'Could not export CSV');
    }
  };

  if (authLoading) {
    return <SafeAreaView style={s.center}><ActivityIndicator size="large" color="#1E88E5" /></SafeAreaView>;
  }
  if (!canAccess) {
    return (
      <SafeAreaView style={s.center}>
        <Ionicons name="lock-closed" size={44} color="#B0BEC5" />
        <Text style={{ marginTop: 12, color: '#546E7A' }}>Analytics is not available for your role.</Text>
      </SafeAreaView>
    );
  }

  const roleLabel = (user?.role || '').replace(/_/g, ' ');
  const scopeLabel =
    user?.role === 'student' ? 'Your cases only · anonymised cohort medians'
    : user?.role === 'supervisor' ? 'Cases you oversee'
    : 'Institution-wide';

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.headerIcon}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          testID="analytics-back"
          /* @ts-ignore */ data-testid="analytics-back"
        >
          <Ionicons name="chevron-back" size={22} color="#1A2332" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} data-testid="analytics-title">Procedure Analytics</Text>
          <Text style={s.headerSub}>{scopeLabel} · <Text style={{ textTransform: 'capitalize' }}>{roleLabel}</Text></Text>
        </View>
        <TouchableOpacity
          onPress={handleExport}
          style={s.exportBtn}
          testID="analytics-export"
          /* @ts-ignore */ data-testid="analytics-export"
        >
          <Ionicons name="download-outline" size={16} color="#1E88E5" />
          <Text style={s.exportBtnTxt}>CSV</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Filters */}
        <View style={s.filterCard} testID="analytics-filters">
          <View style={s.filterRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={s.filterLabel}>From</Text>
              <TextInput
                value={fromDate}
                onChangeText={setFromDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#B0BEC5"
                style={s.filterInput}
                testID="analytics-from-date"
                /* @ts-ignore */ data-testid="analytics-from-date"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={s.filterLabel}>To</Text>
              <TextInput
                value={toDate}
                onChangeText={setToDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#B0BEC5"
                style={s.filterInput}
                testID="analytics-to-date"
                /* @ts-ignore */ data-testid="analytics-to-date"
              />
            </View>
          </View>

          <View style={[s.filterRow, { marginTop: 8 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.filterLabel}>Granularity</Text>
              <View style={s.pillRow}>
                {(['monthly', 'yearly'] as const).map(g => (
                  <TouchableOpacity
                    key={g}
                    onPress={() => setGranularity(g)}
                    style={[s.pill, granularity === g && s.pillActive]}
                    testID={`analytics-granularity-${g}`}
                    /* @ts-ignore */ data-testid={`analytics-granularity-${g}`}
                  >
                    <Text style={[s.pillTxt, granularity === g && s.pillTxtActive]}>
                      {g === 'monthly' ? 'Monthly' : 'Yearly'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <View style={{ marginTop: 10 }}>
            <TouchableOpacity
              style={s.typeFilterHeader}
              onPress={() => setTypeFilterOpen(v => !v)}
              testID="analytics-type-toggle"
              /* @ts-ignore */ data-testid="analytics-type-toggle"
            >
              <Text style={s.filterLabel}>
                Procedure Types {selectedTypes.length > 0 ? `(${selectedTypes.length})` : '· All'}
              </Text>
              <Ionicons name={typeFilterOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#546E7A" />
            </TouchableOpacity>
            {typeFilterOpen && (
              <View style={s.typeChipsWrap}>
                {allTypes.map(t => {
                  const active = selectedTypes.includes(t);
                  return (
                    <TouchableOpacity
                      key={t}
                      onPress={() => {
                        setSelectedTypes(prev =>
                          prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
                        );
                      }}
                      style={[s.typeChip, active && s.typeChipActive]}
                      testID={`analytics-type-${t.replace(/\s+/g, '-').toLowerCase()}`}
                    >
                      <Text style={[s.typeChipTxt, active && s.typeChipTxtActive]}>{t}</Text>
                    </TouchableOpacity>
                  );
                })}
                {selectedTypes.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSelectedTypes([])}
                    style={[s.typeChip, s.clearChip]}
                    testID="analytics-type-clear"
                  >
                    <Text style={[s.typeChipTxt, { color: '#B71C1C' }]}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          <TouchableOpacity
            style={s.applyBtn}
            onPress={fetchAnalytics}
            testID="analytics-apply"
            /* @ts-ignore */ data-testid="analytics-apply"
          >
            <Ionicons name="funnel-outline" size={14} color="#FFF" />
            <Text style={s.applyBtnTxt}>Apply Filters</Text>
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={{ paddingVertical: 40, alignItems: 'center' }} testID="analytics-loading">
            <ActivityIndicator size="large" color="#1E88E5" />
          </View>
        )}
        {error && (
          <View style={s.errorCard} testID="analytics-error">
            <Ionicons name="alert-circle" size={20} color="#C62828" />
            <Text style={{ color: '#C62828', marginLeft: 8, flex: 1 }}>{error}</Text>
          </View>
        )}

        {!loading && !error && data && (
          <>
            {/* KPI Cards */}
            <View style={s.kpiGrid} testID="analytics-kpi-grid">
              <KpiCard label="Total Cases" value={String(data.kpis.total_cases)} accent="#1565C0" testID="kpi-total" />
              <KpiCard label="Completed" value={String(data.kpis.completed)} accent="#2E7D32" testID="kpi-completed" />
              <KpiCard label="Terminated" value={String(data.kpis.terminated)} accent="#C62828" testID="kpi-terminated" />
              <KpiCard label="In Progress" value={String(data.kpis.in_progress)} accent="#EF6C00" testID="kpi-in-progress" />
              <KpiCard label="Success Rate" value={FMT(data.kpis.success_rate, '%')} accent="#00695C" testID="kpi-success-rate" />
              <KpiCard label="Median Days" value={FMT(data.kpis.median_lifecycle_days, ' d')} accent="#6A1B9A" testID="kpi-median-days" />
            </View>

            {/* Cohort compare (student only) */}
            {data.cohort && (
              <View style={s.cohortCard} testID="analytics-cohort">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Ionicons name="people-outline" size={16} color="#0277BD" />
                  <Text style={s.cohortHeader}>
                    Anonymised cohort ({data.cohort.student_count} students)
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  <CohortStat
                    label="Your success"
                    you={FMT(data.kpis.success_rate, '%')}
                    peer={FMT(data.cohort.success_rate_median, '%')}
                    positiveIfHigher
                    youValue={data.kpis.success_rate}
                    peerValue={data.cohort.success_rate_median}
                  />
                  <CohortStat
                    label="Your median days"
                    you={FMT(data.kpis.median_lifecycle_days, ' d')}
                    peer={FMT(data.cohort.lifecycle_days_median, ' d')}
                    positiveIfHigher={false}
                    youValue={data.kpis.median_lifecycle_days}
                    peerValue={data.cohort.lifecycle_days_median}
                  />
                </View>
              </View>
            )}

            {/* By Procedure Type table */}
            <SectionHeader icon="bar-chart-outline" title="By Procedure Type" />
            {data.by_procedure_type.length === 0 ? (
              <EmptyRow />
            ) : (
              <View style={s.tableCard} testID="analytics-by-type-table">
                <View style={[s.tRow, s.tHeaderRow]}>
                  <Text style={[s.tCell, s.tCellType, s.tHeaderTxt]}>Type</Text>
                  <Text style={[s.tCell, s.tCellNum, s.tHeaderTxt]}>Total</Text>
                  <Text style={[s.tCell, s.tCellNum, s.tHeaderTxt]}>✓</Text>
                  <Text style={[s.tCell, s.tCellNum, s.tHeaderTxt]}>✕</Text>
                  <Text style={[s.tCell, s.tCellNum, s.tHeaderTxt]}>Success</Text>
                  <Text style={[s.tCell, s.tCellNum, s.tHeaderTxt]}>Days</Text>
                </View>
                {data.by_procedure_type.map((r, idx) => (
                  <View key={r.procedure_type} style={[s.tRow, idx % 2 === 1 && { backgroundColor: '#FAFCFF' }]}>
                    <Text style={[s.tCell, s.tCellType]} numberOfLines={2}>{r.procedure_type}</Text>
                    <Text style={[s.tCell, s.tCellNum]}>{r.total}</Text>
                    <Text style={[s.tCell, s.tCellNum, { color: '#2E7D32', fontWeight: '700' }]}>{r.completed}</Text>
                    <Text style={[s.tCell, s.tCellNum, { color: '#C62828', fontWeight: '700' }]}>{r.terminated}</Text>
                    <Text style={[s.tCell, s.tCellNum]}>{FMT(r.success_rate, '%')}</Text>
                    <Text style={[s.tCell, s.tCellNum]}>{FMT(r.mean_days)}</Text>
                  </View>
                ))}
              </View>
            )}
            {data.by_procedure_type.some(r => r.avg_torque_ncm !== null || r.avg_isq !== null) && (
              <View style={s.clinicalCard} testID="analytics-clinical-metrics">
                <Text style={s.clinicalHeader}>Clinical metrics · avg per type</Text>
                {data.by_procedure_type
                  .filter(r => r.avg_torque_ncm !== null || r.avg_isq !== null)
                  .map(r => (
                    <View key={r.procedure_type} style={s.clinicalRow}>
                      <Text style={s.clinicalType} numberOfLines={1}>{r.procedure_type}</Text>
                      <View style={s.clinicalMetrics}>
                        {r.avg_torque_ncm !== null && (
                          <Text style={s.clinicalMetric}>
                            <Text style={{ color: '#78909C' }}>Torque </Text>
                            <Text style={{ fontWeight: '700', color: '#E65100' }}>{r.avg_torque_ncm} Ncm</Text>
                          </Text>
                        )}
                        {r.avg_isq !== null && (
                          <Text style={s.clinicalMetric}>
                            <Text style={{ color: '#78909C' }}>ISQ </Text>
                            <Text style={{ fontWeight: '700', color: '#0D47A1' }}>{r.avg_isq}</Text>
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
              </View>
            )}

            {/* Prosthesis Mix */}
            <SectionHeader icon="pie-chart-outline" title="Prosthesis Mix" />
            {data.prosthesis_mix.length === 0 ? (
              <EmptyRow />
            ) : (
              <View style={s.mixWrap} testID="analytics-prosthesis-mix">
                {data.prosthesis_mix.map(pm => {
                  const total = pm.prostheses.reduce((sum, p) => sum + p.count, 0) || 1;
                  return (
                    <View key={pm.procedure_type} style={s.mixRow}>
                      <Text style={s.mixType} numberOfLines={1}>{pm.procedure_type}</Text>
                      <View style={s.mixBar}>
                        {pm.prostheses.map((p, idx) => {
                          const w = (p.count / total) * 100;
                          const colors = ['#1E88E5', '#43A047', '#FB8C00', '#8E24AA', '#00838F', '#6D4C41'];
                          return (
                            <View
                              key={p.label}
                              style={{
                                width: `${w}%`,
                                backgroundColor: colors[idx % colors.length],
                                height: 22, justifyContent: 'center', alignItems: 'center',
                              }}
                            >
                              {w > 14 && <Text style={s.mixSegTxt}>{p.count}</Text>}
                            </View>
                          );
                        })}
                      </View>
                      <View style={s.mixLegend}>
                        {pm.prostheses.slice(0, 3).map((p, idx) => {
                          const colors = ['#1E88E5', '#43A047', '#FB8C00', '#8E24AA', '#00838F', '#6D4C41'];
                          return (
                            <View key={p.label} style={s.mixLegendItem}>
                              <View style={[s.mixLegendDot, { backgroundColor: colors[idx % colors.length] }]} />
                              <Text style={s.mixLegendTxt} numberOfLines={1}>
                                {p.label} · {p.count}
                              </Text>
                            </View>
                          );
                        })}
                        {pm.prostheses.length > 3 && (
                          <Text style={[s.mixLegendTxt, { color: '#78909C', fontStyle: 'italic' }]}>
                            +{pm.prostheses.length - 3} more
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Trend */}
            <SectionHeader icon="trending-up-outline" title={`Trend (${granularity})`} />
            {data.trend.length === 0 ? (
              <EmptyRow />
            ) : (
              <View style={s.trendCard} testID="analytics-trend">
                <View style={s.trendHeader}>
                  <Text style={s.trendCol}>Period</Text>
                  <Text style={s.trendCol}>Total</Text>
                  <Text style={s.trendCol}>Done</Text>
                  <Text style={s.trendCol}>Term.</Text>
                </View>
                {data.trend.map(r => (
                  <View key={r.period} style={s.trendRow}>
                    <Text style={s.trendCol}>{r.period}</Text>
                    <Text style={s.trendCol}>{r.total}</Text>
                    <Text style={[s.trendCol, { color: '#2E7D32', fontWeight: '700' }]}>{r.completed}</Text>
                    <Text style={[s.trendCol, { color: '#C62828', fontWeight: '700' }]}>{r.terminated}</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={s.footerNote} data-testid="analytics-footer-note">
              Exports are de-identified (no patient names, DoB, or contact info). Every view and export is logged for HIPAA compliance.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ─────────────────────────────────────────

function KpiCard({ label, value, accent, testID }: { label: string; value: string; accent: string; testID?: string }) {
  return (
    <View
      style={[s.kpi, { borderTopColor: accent }]}
      testID={testID}
      /* @ts-ignore */ data-testid={testID}
    >
      <Text style={[s.kpiVal, { color: accent }]}>{value}</Text>
      <Text style={s.kpiLbl}>{label}</Text>
    </View>
  );
}

function CohortStat({
  label, you, peer, positiveIfHigher, youValue, peerValue,
}: {
  label: string; you: string; peer: string; positiveIfHigher: boolean;
  youValue: number | null; peerValue: number | null;
}) {
  let delta: string = '';
  let color = '#78909C';
  if (youValue !== null && peerValue !== null) {
    const diff = youValue - peerValue;
    const better = positiveIfHigher ? diff > 0 : diff < 0;
    const worse = positiveIfHigher ? diff < 0 : diff > 0;
    if (Math.abs(diff) < 0.05) { delta = 'on par'; color = '#78909C'; }
    else if (better) { delta = `▲ better`; color = '#2E7D32'; }
    else if (worse)  { delta = `▼ below`; color = '#C62828'; }
  }
  return (
    <View style={s.cohortStat}>
      <Text style={s.cohortLbl}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <Text style={s.cohortYou}>{you}</Text>
        <Text style={s.cohortVs}>vs</Text>
        <Text style={s.cohortPeer}>{peer}</Text>
      </View>
      {delta ? <Text style={[s.cohortDelta, { color }]}>{delta}</Text> : null}
    </View>
  );
}

function SectionHeader({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  return (
    <View style={s.sectionHeader}>
      <Ionicons name={icon} size={16} color="#1565C0" />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function EmptyRow() {
  return (
    <View style={s.emptyRow}>
      <Text style={{ color: '#B0BEC5', fontStyle: 'italic' }}>No data for the current filters.</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FB' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1, borderBottomColor: '#E1E7EF',
  },
  headerIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F4F8', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#1A2332', letterSpacing: 0.2 },
  headerSub: { fontSize: 11, color: '#78909C', marginTop: 2 },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: '#1E88E5',
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 999,
  },
  exportBtnTxt: { color: '#1E88E5', fontWeight: '700', fontSize: 12 },

  filterCard: {
    marginHorizontal: 14, marginTop: 14,
    backgroundColor: '#FFF',
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#E1E7EF',
  },
  filterRow: { flexDirection: 'row' },
  filterLabel: { fontSize: 11, fontWeight: '700', color: '#546E7A', letterSpacing: 0.4, marginBottom: 4, textTransform: 'uppercase' },
  filterInput: {
    borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, color: '#1A2332', backgroundColor: '#FAFCFF',
  },
  pillRow: { flexDirection: 'row', gap: 8 },
  pill: { flex: 1, paddingVertical: 10, borderRadius: 999, borderWidth: 1.5, borderColor: '#CFD8DC', alignItems: 'center', backgroundColor: '#FAFCFF' },
  pillActive: { borderColor: '#1E88E5', backgroundColor: '#E3F2FD' },
  pillTxt: { fontSize: 12, fontWeight: '700', color: '#546E7A' },
  pillTxtActive: { color: '#1565C0' },
  typeFilterHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 4,
  },
  typeChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  typeChip: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1, borderColor: '#CFD8DC', backgroundColor: '#FAFCFF',
  },
  typeChipActive: { borderColor: '#1E88E5', backgroundColor: '#E3F2FD' },
  typeChipTxt: { fontSize: 11, color: '#546E7A', fontWeight: '600' },
  typeChipTxtActive: { color: '#1565C0', fontWeight: '700' },
  clearChip: { borderColor: '#F8C9C2', backgroundColor: '#FFEBEE' },
  applyBtn: {
    marginTop: 12, flexDirection: 'row', gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 9,
    backgroundColor: '#1E88E5', borderRadius: 999,
    alignItems: 'center',
  },
  applyBtnTxt: { color: '#FFF', fontWeight: '700', fontSize: 12, letterSpacing: 0.3 },

  errorCard: {
    marginHorizontal: 14, marginTop: 12,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFEBEE',
    borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#F8C9C2',
  },

  kpiGrid: {
    marginTop: 14, marginHorizontal: 14,
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  kpi: {
    flexGrow: 1, flexBasis: '30%',
    backgroundColor: '#FFF',
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#E1E7EF',
    borderTopWidth: 3,
    alignItems: 'flex-start',
  },
  kpiVal: { fontSize: 20, fontWeight: '800', letterSpacing: 0.2 },
  kpiLbl: { fontSize: 11, color: '#78909C', marginTop: 2, letterSpacing: 0.3 },

  cohortCard: {
    marginTop: 14, marginHorizontal: 14,
    backgroundColor: '#E1F5FE',
    borderRadius: 14, padding: 14,
    borderWidth: 1.5, borderColor: '#B3E5FC',
  },
  cohortHeader: { fontSize: 12, fontWeight: '800', color: '#01579B', letterSpacing: 0.3 },
  cohortStat: { flexGrow: 1, flexBasis: '46%', backgroundColor: '#FFF', borderRadius: 10, padding: 10 },
  cohortLbl: { fontSize: 10, color: '#546E7A', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 },
  cohortYou: { fontSize: 16, fontWeight: '800', color: '#01579B' },
  cohortVs: { fontSize: 10, color: '#90A4AE' },
  cohortPeer: { fontSize: 13, fontWeight: '700', color: '#78909C' },
  cohortDelta: { marginTop: 2, fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

  sectionHeader: {
    marginTop: 20, marginHorizontal: 14, marginBottom: 6,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#1A2332', letterSpacing: 0.4, textTransform: 'uppercase' },

  emptyRow: {
    marginHorizontal: 14, backgroundColor: '#FFF',
    borderRadius: 10, padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: '#E1E7EF',
  },

  tableCard: {
    marginHorizontal: 14, backgroundColor: '#FFF',
    borderRadius: 12, borderWidth: 1, borderColor: '#E1E7EF', overflow: 'hidden',
  },
  tRow: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F0F4F8' },
  tHeaderRow: { backgroundColor: '#F5F7FB' },
  tHeaderTxt: { fontSize: 10, fontWeight: '800', color: '#546E7A', letterSpacing: 0.4, textTransform: 'uppercase' },
  tCell: { fontSize: 12, color: '#1A2332' },
  tCellType: { flex: 2.2, paddingRight: 4 },
  tCellNum: { flex: 1, textAlign: 'right' },

  clinicalCard: {
    marginHorizontal: 14, marginTop: 10,
    backgroundColor: '#FFF8E1',
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#FFE082',
  },
  clinicalHeader: { fontSize: 11, fontWeight: '800', color: '#E65100', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 },
  clinicalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#FFECB3' },
  clinicalType: { fontSize: 12, color: '#5D4037', flex: 1, marginRight: 8, fontWeight: '600' },
  clinicalMetrics: { flexDirection: 'row', gap: 12 },
  clinicalMetric: { fontSize: 12 },

  mixWrap: { marginHorizontal: 14 },
  mixRow: {
    backgroundColor: '#FFF',
    borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#E1E7EF',
  },
  mixType: { fontSize: 12, fontWeight: '700', color: '#1A2332', marginBottom: 6 },
  mixBar: { flexDirection: 'row', height: 22, borderRadius: 6, overflow: 'hidden', backgroundColor: '#ECEFF1' },
  mixSegTxt: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  mixLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  mixLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mixLegendDot: { width: 8, height: 8, borderRadius: 4 },
  mixLegendTxt: { fontSize: 11, color: '#546E7A' },

  trendCard: {
    marginHorizontal: 14,
    backgroundColor: '#FFF',
    borderRadius: 12, borderWidth: 1, borderColor: '#E1E7EF', overflow: 'hidden',
  },
  trendHeader: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#F5F7FB' },
  trendRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#F0F4F8' },
  trendCol: { flex: 1, fontSize: 12, color: '#1A2332', fontWeight: '600', textAlign: 'center' },

  footerNote: {
    marginTop: 16, marginHorizontal: 14,
    fontSize: 10, color: '#90A4AE',
    fontStyle: 'italic', textAlign: 'center', lineHeight: 15,
  },
});
