import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, ScrollView, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { router } from 'expo-router';
import BackButton from '../../components/BackButton';

/**
 * iter-142: Implant System Catalog browser — read for everyone, edit for
 * Administrator + Implant In-Charge. Click a system to view its components,
 * SKUs, angulations, retention modes, and notes. Ask Implanr AI any question
 * scoped to the selected system from the bottom panel.
 */

type Component = {
  type: string;
  subtype?: string;
  gingival_heights_mm?: number[];
  angulations_deg?: number[];
  retention?: string[];
  material?: string[];
  indication?: string;
  notes?: string;
  cad_cam?: boolean;
  driver?: string;
};

type CatalogRecord = {
  key: string;
  brand: string;
  name: string;
  is_stub?: boolean;
  connection?: { type?: string; subtype?: string; indexing?: string[] };
  platform_switching?: boolean;
  features?: string[];
  implant?: { diameters_mm?: number[]; lengths_mm?: number[]; bone_types?: string[]; healing_modes?: string[] };
  components?: Component[];
  compatibility_notes?: string;
  updated_at?: string;
  updated_by?: string;
};

export default function ImplantCatalogAdmin() {
  const { user } = useAuth();
  const canEdit = user?.role === 'administrator' || user?.role === 'implant_incharge';

  const [systems, setSystems] = useState<CatalogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'populated' | 'pending'>('all');
  const [selected, setSelected] = useState<CatalogRecord | null>(null);

  // Ask Implanr AI panel
  const [question, setQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/implant-catalog');
      setSystems(res.data?.systems || []);
    } catch (e: any) {
      Alert.alert('Failed to load catalog', e?.response?.data?.detail || String(e?.message || e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = systems;
    if (filter === 'populated') list = list.filter(s => !s.is_stub);
    else if (filter === 'pending') list = list.filter(s => s.is_stub);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s => s.brand.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
    }
    return list;
  }, [systems, search, filter]);

  const ask = useCallback(async () => {
    if (!question.trim()) return;
    setAiLoading(true); setAiAnswer(null);
    try {
      const res = await api.post('/ai/ask-implanr', {
        question: question.trim(),
        system_key: selected?.key || undefined,
      });
      setAiAnswer(res.data?.answer || 'No answer.');
    } catch (e: any) {
      setAiAnswer(`Error: ${e?.response?.data?.detail || e?.message || 'request failed'}`);
    } finally {
      setAiLoading(false);
    }
  }, [question, selected]);

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}><ActivityIndicator size="large" color="#0277BD" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.headerBar}>
        <BackButton />
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Implant Catalog</Text>
          <Text style={s.headerSub}>Implanr AI knowledge base · {systems.length} systems</Text>
        </View>
      </View>

      <View style={s.body}>
        {/* Left: List */}
        <View style={s.listPane}>
          <View style={s.searchRow}>
            <Ionicons name="search" size={16} color="#888" />
            <TextInput
              style={s.searchInput}
              placeholder="Search brand or system..."
              value={search}
              onChangeText={setSearch}
              placeholderTextColor="#aaa"
              data-testid="catalog-search"
            />
          </View>
          <View style={s.filterRow}>
            {(['all', 'populated', 'pending'] as const).map(f => (
              <TouchableOpacity
                key={f}
                style={[s.filterChip, filter === f && s.filterChipActive]}
                onPress={() => setFilter(f)}
                data-testid={`catalog-filter-${f}`}
              >
                <Text style={[s.filterChipText, filter === f && s.filterChipTextActive]}>
                  {f === 'all' ? 'All' : f === 'populated' ? 'With data' : 'Pending'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.key}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[s.systemRow, selected?.key === item.key && s.systemRowActive]}
                onPress={() => { setSelected(item); setAiAnswer(null); }}
                data-testid={`catalog-row-${item.key}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.systemBrand}>{item.brand}</Text>
                  <Text style={s.systemName}>{item.name}</Text>
                </View>
                {item.is_stub ? (
                  <View style={s.pendingBadge}><Text style={s.pendingBadgeText}>Pending</Text></View>
                ) : (
                  <View style={s.dataBadge}>
                    <Text style={s.dataBadgeText}>{item.components?.length || 0} comp</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={s.emptyText}>No systems match.</Text>}
          />
        </View>

        {/* Right: Detail */}
        <View style={s.detailPane}>
          {!selected ? (
            <View style={s.center}>
              <Ionicons name="library-outline" size={48} color="#B3E5FC" />
              <Text style={s.emptyHint}>Select an implant system to view its components.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <Text style={s.detailBrand}>{selected.brand}</Text>
              <Text style={s.detailName}>{selected.name}</Text>

              {selected.is_stub && (
                <View style={s.pendingBanner}>
                  <Ionicons name="alert-circle" size={18} color="#E65100" />
                  <Text style={s.pendingBannerText}>
                    Catalog data not yet entered. {canEdit ? 'Use the API or admin tooling to add components.' : 'An administrator can add components.'}
                  </Text>
                </View>
              )}

              {!!selected.connection && (
                <Section title="Connection">
                  <Row label="Type" value={selected.connection.type || '—'} />
                  {!!selected.connection.subtype && <Row label="Subtype" value={selected.connection.subtype} />}
                  {!!selected.connection.indexing?.length && <Row label="Indexing" value={selected.connection.indexing.join(', ')} />}
                  {selected.platform_switching != null && <Row label="Platform Switching" value={selected.platform_switching ? 'Yes' : 'No'} />}
                </Section>
              )}

              {!!selected.implant && (selected.implant.diameters_mm?.length || selected.implant.lengths_mm?.length || selected.implant.bone_types?.length) ? (
                <Section title="Implant">
                  {!!selected.implant.diameters_mm?.length && <Row label="Diameters (mm)" value={selected.implant.diameters_mm.join(', ')} />}
                  {!!selected.implant.lengths_mm?.length && <Row label="Lengths (mm)" value={selected.implant.lengths_mm.join(', ')} />}
                  {!!selected.implant.bone_types?.length && <Row label="Bone Types" value={selected.implant.bone_types.join(', ')} />}
                  {!!selected.implant.healing_modes?.length && <Row label="Healing Modes" value={selected.implant.healing_modes.join(', ')} />}
                </Section>
              ) : null}

              {!!selected.features?.length && (
                <Section title="Features">
                  {selected.features.map((f, i) => (
                    <View key={i} style={s.bullet}>
                      <Text style={s.bulletDot}>•</Text>
                      <Text style={s.bulletText}>{f}</Text>
                    </View>
                  ))}
                </Section>
              )}

              {!!selected.components?.length && (
                <Section title={`Components (${selected.components.length})`}>
                  {selected.components.map((c, i) => <ComponentCard key={i} c={c} />)}
                </Section>
              )}

              {!!selected.compatibility_notes && (
                <Section title="Compatibility Notes">
                  <Text style={s.notesText}>{selected.compatibility_notes}</Text>
                </Section>
              )}

              {/* Ask Implanr AI panel */}
              <View style={s.aiPanel}>
                <View style={s.aiHeader}>
                  <Ionicons name="sparkles" size={18} color="#0277BD" />
                  <Text style={s.aiTitle}>Ask Implanr AI · scoped to {selected.brand} {selected.name}</Text>
                </View>
                <TextInput
                  style={s.aiInput}
                  placeholder="e.g. What angulations are available? Do we have a multi-unit abutment?"
                  value={question}
                  onChangeText={setQuestion}
                  multiline
                  placeholderTextColor="#aaa"
                  data-testid="implanr-ai-question"
                />
                <TouchableOpacity
                  style={[s.aiButton, (!question.trim() || aiLoading) && { opacity: 0.5 }]}
                  onPress={ask}
                  disabled={!question.trim() || aiLoading}
                  data-testid="implanr-ai-ask"
                >
                  {aiLoading
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <><Ionicons name="send" size={14} color="#FFF" /><Text style={s.aiButtonText}>Ask</Text></>}
                </TouchableOpacity>
                {aiAnswer && (
                  <View style={s.aiAnswerBox} data-testid="implanr-ai-answer">
                    <Text style={s.aiAnswerText}>{aiAnswer}</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={s.section}>
    <Text style={s.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={s.row}>
    <Text style={s.rowLabel}>{label}</Text>
    <Text style={s.rowValue}>{value}</Text>
  </View>
);

const ComponentCard: React.FC<{ c: Component }> = ({ c }) => {
  const title = c.subtype ? `${c.type} / ${c.subtype}` : c.type;
  return (
    <View style={s.compCard}>
      <Text style={s.compTitle}>{title.replace(/_/g, ' ')}</Text>
      {!!c.gingival_heights_mm?.length && <Row label="Gingival Heights" value={`${c.gingival_heights_mm.join(', ')} mm`} />}
      {!!c.angulations_deg?.length && <Row label="Angulations" value={`${c.angulations_deg.join(', ')}°`} />}
      {!!c.retention?.length && <Row label="Retention" value={c.retention.join(' / ')} />}
      {!!c.material?.length && <Row label="Material" value={c.material.join(' / ')} />}
      {!!c.indication && <Row label="Indication" value={c.indication} />}
      {!!c.driver && <Row label="Driver" value={c.driver} />}
      {c.cad_cam && <Row label="CAD/CAM" value="Yes" />}
      {!!c.notes && <Text style={s.compNotes}>{c.notes}</Text>}
    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  headerBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#01579B' },
  headerSub: { fontSize: 12, color: '#607D8B', marginTop: 2 },
  body: { flex: 1, flexDirection: 'row' },
  listPane: { width: 320, borderRightWidth: 1, borderRightColor: '#ECEFF1', backgroundColor: '#FFF' },
  detailPane: { flex: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  searchInput: { flex: 1, fontSize: 14, color: '#01579B', paddingVertical: 4 },
  filterRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#B3E5FC', backgroundColor: '#FFF' },
  filterChipActive: { backgroundColor: '#0277BD', borderColor: '#0277BD' },
  filterChipText: { fontSize: 12, color: '#0277BD', fontWeight: '600' },
  filterChipTextActive: { color: '#FFF' },
  systemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F4F8' },
  systemRowActive: { backgroundColor: '#E1F5FE' },
  systemBrand: { fontSize: 11, fontWeight: '600', color: '#607D8B', textTransform: 'uppercase', letterSpacing: 0.4 },
  systemName: { fontSize: 14, fontWeight: '700', color: '#01579B', marginTop: 1 },
  pendingBadge: { backgroundColor: '#FFF3E0', borderColor: '#FFB74D', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pendingBadgeText: { fontSize: 10, color: '#E65100', fontWeight: '700' },
  dataBadge: { backgroundColor: '#E8F5E9', borderColor: '#81C784', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  dataBadgeText: { fontSize: 10, color: '#1B5E20', fontWeight: '700' },
  emptyText: { color: '#90A4AE', textAlign: 'center', padding: 24, fontSize: 13 },
  emptyHint: { fontSize: 14, color: '#90A4AE', marginTop: 12, textAlign: 'center' },
  detailBrand: { fontSize: 12, fontWeight: '700', color: '#607D8B', textTransform: 'uppercase', letterSpacing: 0.4 },
  detailName: { fontSize: 24, fontWeight: '700', color: '#01579B', marginTop: 4, marginBottom: 16 },
  pendingBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF3E0', borderColor: '#FFB74D', borderWidth: 1, padding: 12, borderRadius: 10, marginBottom: 16 },
  pendingBannerText: { flex: 1, fontSize: 13, color: '#E65100' },
  section: { marginBottom: 18, backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#ECEFF1', padding: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#01579B', marginBottom: 10, letterSpacing: 0.3 },
  row: { flexDirection: 'row', paddingVertical: 4 },
  rowLabel: { width: 140, fontSize: 13, color: '#607D8B', fontWeight: '600' },
  rowValue: { flex: 1, fontSize: 13, color: '#263238' },
  bullet: { flexDirection: 'row', gap: 8, paddingVertical: 3 },
  bulletDot: { color: '#0277BD', fontWeight: '700' },
  bulletText: { flex: 1, fontSize: 13, color: '#263238', lineHeight: 19 },
  compCard: { backgroundColor: '#F5FBFF', borderColor: '#B3E5FC', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 10 },
  compTitle: { fontSize: 13, fontWeight: '700', color: '#01579B', marginBottom: 6, textTransform: 'capitalize' },
  compNotes: { fontSize: 12, color: '#546E7A', fontStyle: 'italic', marginTop: 6 },
  notesText: { fontSize: 13, color: '#263238', lineHeight: 19 },
  // Ask Implanr AI panel
  aiPanel: { backgroundColor: '#E1F5FE', borderColor: '#0277BD', borderWidth: 1.5, borderRadius: 14, padding: 14, marginTop: 8 },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  aiTitle: { fontSize: 13, fontWeight: '700', color: '#0277BD' },
  aiInput: { backgroundColor: '#FFF', borderColor: '#81D4FA', borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 13, minHeight: 70, color: '#01579B' },
  aiButton: { marginTop: 8, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0277BD', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
  aiButtonText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  aiAnswerBox: { marginTop: 12, backgroundColor: '#FFF', borderColor: '#B3E5FC', borderWidth: 1, borderRadius: 10, padding: 12 },
  aiAnswerText: { fontSize: 13, color: '#263238', lineHeight: 20 },
});
