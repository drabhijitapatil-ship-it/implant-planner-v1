import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import api from '../../utils/api';
import BackButton from '../../components/BackButton';

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
  diameters_mm?: number[]; gingival_heights_mm?: number[];
  heights_mm?: number[]; angulations_deg?: number[];
  material?: string[]; retention?: string[]; torque_ncm?: number | string;
  indication?: string;
};
type SystemRow = {
  key: string; brand: string; name: string;
  connection?: string; components: Component[];
};

const fmt = (arr?: (number | string)[]) =>
  arr && arr.length ? arr.join(', ') : '—';

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

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.headerBar}>
        <BackButton fallback="/admin/implant-catalog" />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={s.headerTitle}>Brand Comparison</Text>
          <Text style={s.headerSub}>Side-by-side specs across {rows.length} systems</Text>
        </View>
      </View>

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
                    {c.subtype || (TYPE_LABELS[c.type] || c.type)}
                  </Text>
                  <View style={s.specGrid}>
                    {c.platforms?.length ? (
                      <Spec label="Platforms" value={fmt(c.platforms)} />
                    ) : null}
                    {c.diameters_mm?.length ? (
                      <Spec label="Diameter (mm)" value={fmt(c.diameters_mm)} />
                    ) : null}
                    {c.gingival_heights_mm?.length ? (
                      <Spec label="GH (mm)" value={fmt(c.gingival_heights_mm)} />
                    ) : null}
                    {c.heights_mm?.length ? (
                      <Spec label="Height (mm)" value={fmt(c.heights_mm)} />
                    ) : null}
                    {c.angulations_deg?.length ? (
                      <Spec label="Angulation (°)" value={fmt(c.angulations_deg)} />
                    ) : null}
                    {c.material?.length ? (
                      <Spec label="Material" value={fmt(c.material)} />
                    ) : null}
                    {c.retention?.length ? (
                      <Spec label="Retention" value={fmt(c.retention)} />
                    ) : null}
                    {c.torque_ncm ? (
                      <Spec label="Torque (Ncm)" value={String(c.torque_ncm)} />
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
});
