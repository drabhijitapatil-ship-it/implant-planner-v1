import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import api from '../../utils/api';
import CenteredHeader from '../../components/CenteredHeader';

const TYPE_LABELS: Record<string, string> = {
  cover_screw: 'Cover Screw',
  healing_abutment: 'Healing Abutment',
  gingiva_former: 'Gingiva Former',
  temporary_cylinder: 'Temporary Cylinder',
  final_abutment: 'Final Abutment',
  multi_unit_abutment: 'Multi-Unit Abutment',
  ti_base: 'Ti-Base',
  scanbody: 'Scanbody',
  impression_coping: 'Impression Coping',
  analog: 'Lab Analog',
  overdenture_attachment: 'Overdenture Attachment',
  overdenture: 'Overdenture',
  locator: 'Locator',
  bar_attachment: 'Bar Attachment',
  prosthetic_screw: 'Prosthetic Screw',
  esthetic_abutment: 'Esthetic Abutment',
  castable_abutment: 'Castable Abutment',
  coping: 'Coping',
};

type CompType = { type: string; count: number };
type Component = {
  type: string; subtype?: string; platforms?: string[];
  // iter-298: real data shape uses SINGULAR keys for diameter/angulation/
  // platform (and array for gingival heights). The earlier plural-only
  // fields are kept for backward compatibility with the rare older row.
  platform?: string;
  diameter_mm?: number;
  diameters_mm?: number[];
  gingival_heights_mm?: number[];
  heights_mm?: number[];
  abutment_height_mm?: number;
  angulation_deg?: number;
  angulations_deg?: number[];
  material?: string[]; retention?: string[]; torque_ncm?: number | string;
  indication?: string; catalog_code?: string;
};
type SystemRow = {
  key: string; brand: string; name: string;
  connection?: string; components: Component[];
};

const fmt = (arr?: (number | string)[]) =>
  arr && arr.length ? arr.join(', ') : '—';

const titleCase = (s: string) =>
  String(s || '')
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(w => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');

const prettyArr = (arr?: string[]) =>
  arr && arr.length ? arr.map(titleCase).join(', ') : '—';

// iter-298: At-a-glance bucket summariser. For the currently-selected
// component type, walk every brand/system and count which diameters, GH
// heights, and angulations appear — counting each brand only ONCE per
// value (so "8 brands offer Ø3.5") regardless of how many SKUs each brand
// has at that size. Returns the top values sorted by brand-coverage, then
// alphabetically. Pure client-side: no backend round-trip.
type AtAGlanceBuckets = {
  diameters: { key: string; count: number }[];
  ghHeights: { key: string; count: number }[];
  angulations: { key: string; count: number }[];
  platforms: { key: string; count: number }[];
};

const computeAtAGlance = (rows: SystemRow[]): AtAGlanceBuckets => {
  // brand-level uniqueness — Set of brands per value
  const diam = new Map<number, Set<string>>();
  const gh = new Map<number, Set<string>>();
  const ang = new Map<number, Set<string>>();
  const plat = new Map<string, Set<string>>();
  for (const sys of rows) {
    const b = sys.brand;
    for (const c of sys.components) {
      // Diameters — accept SINGULAR (diameter_mm) and plural (diameters_mm[])
      const dList: number[] = [];
      if (typeof c.diameter_mm === 'number') dList.push(c.diameter_mm);
      if (Array.isArray(c.diameters_mm)) dList.push(...c.diameters_mm);
      for (const d of dList) {
        if (!diam.has(d)) diam.set(d, new Set());
        diam.get(d)!.add(b);
      }
      // GH heights
      if (Array.isArray(c.gingival_heights_mm)) {
        for (const h of c.gingival_heights_mm) {
          if (!gh.has(h)) gh.set(h, new Set());
          gh.get(h)!.add(b);
        }
      }
      // Angulations
      const aList: number[] = [];
      if (typeof c.angulation_deg === 'number') aList.push(c.angulation_deg);
      if (Array.isArray(c.angulations_deg)) aList.push(...c.angulations_deg);
      for (const a of aList) {
        if (!ang.has(a)) ang.set(a, new Set());
        ang.get(a)!.add(b);
      }
      // Platforms
      const pList: string[] = [];
      if (typeof c.platform === 'string' && c.platform) pList.push(c.platform);
      if (Array.isArray(c.platforms)) pList.push(...c.platforms);
      for (const p of pList) {
        if (!plat.has(p)) plat.set(p, new Set());
        plat.get(p)!.add(b);
      }
    }
  }
  const toEntries = <K extends number | string>(m: Map<K, Set<string>>, fmtKey: (k: K) => string) =>
    Array.from(m.entries())
      .map(([k, set]) => ({ key: fmtKey(k), count: set.size, sortKey: k }))
      .sort((a, b) => b.count - a.count || (a.sortKey > b.sortKey ? 1 : -1))
      .slice(0, 8)
      .map(({ key, count }) => ({ key, count }));
  return {
    diameters:   toEntries(diam, (k) => `Ø ${k} mm`),
    ghHeights:   toEntries(gh,   (k) => `GH ${k} mm`),
    angulations: toEntries(ang,  (k) => `${k}°`),
    platforms:   toEntries(plat, (k) => String(k)),
  };
};

export default function ImplantCompare() {
  const [types, setTypes] = useState<CompType[]>([]);
  const [picked, setPicked] = useState<string>('healing_abutment');
  const [rows, setRows] = useState<SystemRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/implant-catalog/component-types');
        setTypes(r.data?.types || []);
      } catch (e) { /* noop */ }
    })();
  }, []);

  const load = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const r = await api.get(`/implant-catalog/compare?component_type=${encodeURIComponent(t)}`);
      setRows(r.data?.systems || []);
    } catch (e) { setRows([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(picked); }, [picked, load]);

  // iter-298: derive the at-a-glance summary from currently-loaded rows.
  const summary = React.useMemo(() => computeAtAGlance(rows), [rows]);
  const hasSummary = summary.diameters.length + summary.ghHeights.length +
                     summary.angulations.length + summary.platforms.length > 0;

  // iter-299: pill-filter state — tap an at-a-glance pill to narrow the
  // comparison table to only systems whose components match the selected
  // value. Tap the same pill again (or another pill in the same dimension)
  // to clear / change the filter. Reset on chip change.
  const [filter, setFilter] = useState<{ kind: 'diameter' | 'gh' | 'angulation' | 'platform'; value: number | string } | null>(null);
  useEffect(() => { setFilter(null); }, [picked]);
  const togglePillFilter = useCallback((kind: 'diameter' | 'gh' | 'angulation' | 'platform', value: number | string) => {
    setFilter(prev => (prev && prev.kind === kind && prev.value === value) ? null : { kind, value });
  }, []);
  const componentMatchesFilter = useCallback((c: Component) => {
    if (!filter) return true;
    if (filter.kind === 'diameter') {
      const dList: number[] = [];
      if (typeof c.diameter_mm === 'number') dList.push(c.diameter_mm);
      if (Array.isArray(c.diameters_mm)) dList.push(...c.diameters_mm);
      return dList.includes(filter.value as number);
    }
    if (filter.kind === 'gh') {
      return Array.isArray(c.gingival_heights_mm) && c.gingival_heights_mm.includes(filter.value as number);
    }
    if (filter.kind === 'angulation') {
      const aList: number[] = [];
      if (typeof c.angulation_deg === 'number') aList.push(c.angulation_deg);
      if (Array.isArray(c.angulations_deg)) aList.push(...c.angulations_deg);
      return aList.includes(filter.value as number);
    }
    if (filter.kind === 'platform') {
      const pList: string[] = [];
      if (typeof c.platform === 'string' && c.platform) pList.push(c.platform);
      if (Array.isArray(c.platforms)) pList.push(...c.platforms);
      return pList.includes(filter.value as string);
    }
    return true;
  }, [filter]);
  const filteredRows: SystemRow[] = React.useMemo(() => {
    if (!filter) return rows;
    const out: SystemRow[] = [];
    for (const sys of rows) {
      const keep = sys.components.filter(componentMatchesFilter);
      if (keep.length > 0) out.push({ ...sys, components: keep });
    }
    return out;
  }, [rows, filter, componentMatchesFilter]);

  return (
    <SafeAreaView style={s.safe}>
      <CenteredHeader
        title="Implant Systems Comparison"
        subtitle="Compare components across different Implant Systems"
        fallback="/admin/implant-catalog"
      />

      {/* Component-type chips */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={s.chipBar} contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingVertical: 8 }}
      >
        {types.map(t => (
          <TouchableOpacity
            key={t.type}
            onPress={() => setPicked(t.type)}
            testID={`compare-chip-${t.type}`}
            data-testid={`compare-chip-${t.type}`}
            style={[s.chip, picked === t.type && s.chipActive]}
          >
            <Text style={[s.chipText, picked === t.type && s.chipTextActive]}>
              {TYPE_LABELS[t.type] || t.type}
            </Text>
            <Text style={[s.chipCount, picked === t.type && s.chipCountActive]}> {t.count}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* iter-298: At-a-glance summary — pure client-side aggregation of the
          most common diameters / GH heights / angulations / platforms across
          all brands offering this component type. Brand-count uniqueness
          (one brand counted once per value) so the chip "Ø3.5 (8 brands)"
          means 8 different brands offer Ø3.5, regardless of SKU count. */}
      {!loading && hasSummary ? (
        <View style={s.summaryCard} testID="compare-at-a-glance">
          <View style={s.summaryHeader}>
            <Ionicons name="stats-chart-outline" size={16} color="#0277BD" />
            <Text style={s.summaryTitle}>At-a-glance — most common across {rows.length} system{rows.length > 1 ? 's' : ''}</Text>
          </View>
          {summary.diameters.length > 0 ? (
            <SummaryRow label="Diameters" entries={summary.diameters} />
          ) : null}
          {summary.ghHeights.length > 0 ? (
            <SummaryRow label="Gingival heights" entries={summary.ghHeights} />
          ) : null}
          {summary.angulations.length > 0 ? (
            <SummaryRow label="Angulations" entries={summary.angulations} />
          ) : null}
          {summary.platforms.length > 0 ? (
            <SummaryRow label="Platforms" entries={summary.platforms} />
          ) : null}
        </View>
      ) : null}

      {loading ? (
        <View style={s.center}><ActivityIndicator color="#0277BD" /></View>
      ) : rows.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="information-circle-outline" size={36} color="#90A4AE" />
          <Text style={s.emptyText}>No systems with this component on file.</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 32 }}>
          {rows.map(r => (
            <View key={r.key} style={s.card} testID={`compare-card-${r.key}`}>
              <View style={s.cardHeader}>
                <Text style={s.brand}>{r.brand}</Text>
                <Text style={s.name}> · {r.name}</Text>
                {r.connection ? (
                  <Text style={s.conn}>  {r.connection}</Text>
                ) : null}
              </View>

              {r.components.map((c, i) => (
                <View key={i} style={s.compRow}>
                  <Text style={s.compTitle}>
                    {c.subtype ? titleCase(c.subtype) : (TYPE_LABELS[c.type] || titleCase(c.type))}
                  </Text>
                  <View style={s.specGrid}>
                    {(c.platform || (c.platforms?.length || 0) > 0) ? (
                      <Spec label="Platform" value={c.platform || fmt(c.platforms)} />
                    ) : null}
                    {(typeof c.diameter_mm === 'number' || (c.diameters_mm?.length || 0) > 0) ? (
                      <Spec label="Diameter (mm)" value={typeof c.diameter_mm === 'number' ? String(c.diameter_mm) : fmt(c.diameters_mm)} />
                    ) : null}
                    {c.gingival_heights_mm?.length ? (
                      <Spec label="GH (mm)" value={fmt(c.gingival_heights_mm)} />
                    ) : null}
                    {typeof c.abutment_height_mm === 'number' ? (
                      <Spec label="Height (mm)" value={String(c.abutment_height_mm)} />
                    ) : c.heights_mm?.length ? (
                      <Spec label="Height (mm)" value={fmt(c.heights_mm)} />
                    ) : null}
                    {(typeof c.angulation_deg === 'number' || (c.angulations_deg?.length || 0) > 0) ? (
                      <Spec label="Angulation (°)" value={typeof c.angulation_deg === 'number' ? String(c.angulation_deg) : fmt(c.angulations_deg)} />
                    ) : null}
                    {c.material?.length ? (
                      <Spec label="Material" value={prettyArr(c.material)} />
                    ) : null}
                    {c.retention?.length ? (
                      <Spec label="Retention" value={prettyArr(c.retention)} />
                    ) : null}
                    {c.torque_ncm ? (
                      <Spec label="Torque (Ncm)" value={String(c.torque_ncm)} />
                    ) : null}
                    {c.catalog_code ? (
                      <Spec label="Ref #" value={String(c.catalog_code)} />
                    ) : null}
                  </View>
                  {c.indication ? (
                    <Text style={s.ind}>{c.indication}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const Spec = ({ label, value }: { label: string; value: string }) => (
  <View style={s.specCell}>
    <Text style={s.specLabel}>{label}</Text>
    <Text style={s.specValue}>{value}</Text>
  </View>
);

// iter-298: At-a-glance row — label + horizontally-scrollable pills,
// each pill showing the value (e.g. "Ø 3.5 mm") and a brand-coverage badge.
const SummaryRow = ({ label, entries }: { label: string; entries: { key: string; count: number }[] }) => (
  <View style={s.summaryRow}>
    <Text style={s.summaryRowLabel}>{label}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
      {entries.map((e) => (
        <View key={e.key} style={s.summaryPill}>
          <Text style={s.summaryPillText}>{e.key}</Text>
          <View style={s.summaryPillBadge}><Text style={s.summaryPillBadgeText}>{e.count}</Text></View>
        </View>
      ))}
    </ScrollView>
  </View>
);

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F8FA' },
  headerBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0E2A47' },
  headerSub: { fontSize: 12, color: '#607D8B', marginTop: 2 },
  chipBar: { backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#ECEFF1', maxHeight: 52 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#ECEFF1', borderWidth: 1, borderColor: '#CFD8DC' },
  chipActive: { backgroundColor: '#0277BD', borderColor: '#0277BD' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#37474F' },
  chipTextActive: { color: '#FFF' },
  chipCount: { fontSize: 11, color: '#90A4AE', marginLeft: 4 },
  chipCountActive: { color: '#E1F5FE' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { marginTop: 8, color: '#607D8B', fontSize: 14 },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#ECEFF1' },
  cardHeader: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap' },
  brand: { fontSize: 15, fontWeight: '800', color: '#0E2A47' },
  name: { fontSize: 14, fontWeight: '600', color: '#37474F' },
  conn: { fontSize: 11, color: '#607D8B' },
  compRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#ECEFF1' },
  compTitle: { fontSize: 13, fontWeight: '700', color: '#0277BD', marginBottom: 6 },
  specGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  specCell: { minWidth: 140, backgroundColor: '#F5F8FA', paddingVertical: 5, paddingHorizontal: 8, borderRadius: 6 },
  specLabel: { fontSize: 10, color: '#607D8B', textTransform: 'uppercase', letterSpacing: 0.4 },
  specValue: { fontSize: 13, color: '#0E2A47', fontWeight: '600', marginTop: 2 },
  ind: { fontSize: 12, color: '#546E7A', marginTop: 6, fontStyle: 'italic' },
  // iter-298 — At-a-glance summary
  summaryCard: { backgroundColor: '#FFF', marginHorizontal: 12, marginTop: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#B3E5FC' },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  summaryTitle: { fontSize: 12, fontWeight: '700', color: '#0277BD', marginLeft: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  summaryRowLabel: { minWidth: 110, fontSize: 11, fontWeight: '600', color: '#546E7A', textTransform: 'uppercase', letterSpacing: 0.4 },
  summaryPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E1F5FE', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, borderWidth: 1, borderColor: '#B3E5FC' },
  summaryPillText: { fontSize: 12, fontWeight: '600', color: '#01579B' },
  summaryPillBadge: { backgroundColor: '#0277BD', marginLeft: 6, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, minWidth: 18, alignItems: 'center' },
  summaryPillBadgeText: { fontSize: 10, fontWeight: '700', color: '#FFF' },
});
