import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, TextInput, Alert, Modal, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import BackButton from '../../components/BackButton';
import { router } from 'expo-router';

/**
 * iter-146: Implant Catalog browser — stacked vertical layout with cascading
 * dropdowns. Designed for narrow / mobile / tablet widths where the previous
 * two-pane split squeezed the detail card.
 *
 * Flow:
 *   [Brand dropdown] → [Family dropdown — only if family > 1 variant]
 *                    → [Variant dropdown — only if multi-variant family]
 *   ── Full-width detail card below ──
 *   ── Ask Implanr AI panel (scoped to selection) ──
 *   ── Collapsible system grid (visual browse fallback for non-technical staff) ──
 *
 * Stub (Pending) systems are excluded from the dropdowns + grid per user choice;
 * editable via API for now.
 */

type Component = {
  type: string; subtype?: string;
  gingival_heights_mm?: number[]; angulations_deg?: number[];
  retention?: string[]; material?: string[];
  indication?: string; notes?: string; cad_cam?: boolean; driver?: string;
};

type CatalogRecord = {
  key: string; brand: string; name: string; is_stub?: boolean;
  connection?: { type?: string; subtype?: string; indexing?: string[] };
  platform_switching?: boolean;
  features?: string[];
  implant?: { diameters_mm?: number[]; lengths_mm?: number[]; bone_types?: string[]; healing_modes?: string[]; surface_options?: string[] };
  components?: Component[];
  compatibility_notes?: string;
};

// Family-root regex (same as iter-145).
const familyRoot = (name: string): string => {
  let n = name.trim();
  n = n.replace(/\s+(NP|RP|WP)$/i, '');
  n = n.replace(/\s+(Acqua|NeoPoros|Neoporous|Hydrophilic)$/i, '');
  n = n.replace(/\s*\((Acqua|NeoPoros|Neoporous)\)$/i, '');
  n = n.replace(/\s+Long$/i, '');
  n = n.replace(/\s+Line$/i, '');
  return n.trim() || name;
};

// Compact variant label after stripping the family prefix.
const variantLabel = (familyName: string, fullName: string): string => {
  let v = fullName.replace(familyName, '').trim();
  if (!v) v = fullName;
  v = v.replace(/^[\s\-—]*\(?|\)?$/g, '').trim();
  return v;
};

export default function ImplantCatalogAdmin() {
  const { user } = useAuth();
  const _canEdit = user?.role === 'administrator' || user?.role === 'implant_incharge';
  const canEdit = _canEdit;

  const [systems, setSystems] = useState<CatalogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [selectedFamily, setSelectedFamily] = useState<string>('');
  const [selectedKey, setSelectedKey] = useState<string>('');

  const [pickerKind, setPickerKind] = useState<null | 'brand' | 'family' | 'variant'>(null);

  const [gridOpen, setGridOpen] = useState(false);

  const [question, setQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/implant-catalog');
      const all: CatalogRecord[] = res.data?.systems || [];
      setSystems(all.filter(s => !s.is_stub));  // dropdown excludes stubs per user choice
    } catch (e: any) {
      Alert.alert('Failed to load catalog', e?.response?.data?.detail || String(e?.message || e));
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  // iter-158: Guard against firing the fetch before AuthContext has restored
  // the session — otherwise the request goes out without a Bearer token and
  // hits /api/implant-catalog with a 403 (FastAPI's HTTPBearer default), which
  // pollutes the server logs and briefly flashes an error Alert on cold start.
  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  // Derived: brand list, family list (per brand), variants (per brand+family).
  const brands = useMemo(() => {
    const set = new Set(systems.map(s => s.brand));
    return Array.from(set).sort();
  }, [systems]);

  const familiesForBrand = useMemo(() => {
    if (!selectedBrand) return [];
    const fams = new Map<string, CatalogRecord[]>();
    for (const s of systems) {
      if (s.brand !== selectedBrand) continue;
      const fkey = familyRoot(s.name);
      if (!fams.has(fkey)) fams.set(fkey, []);
      fams.get(fkey)!.push(s);
    }
    return Array.from(fams.entries()).map(([family, variants]) => ({ family, variants }))
      .sort((a, b) => a.family.localeCompare(b.family));
  }, [systems, selectedBrand]);

  const variantsForFamily = useMemo(() => {
    const f = familiesForBrand.find(f => f.family === selectedFamily);
    return f?.variants || [];
  }, [familiesForBrand, selectedFamily]);

  // When brand changes, auto-select the first family. If the family has only
  // one variant, auto-pick that variant. Otherwise wait for user selection.
  useEffect(() => {
    if (!selectedBrand) {
      setSelectedFamily(''); setSelectedKey(''); return;
    }
    const first = familiesForBrand[0];
    if (!first) {
      setSelectedFamily(''); setSelectedKey(''); return;
    }
    setSelectedFamily(first.family);
    if (first.variants.length === 1) {
      setSelectedKey(first.variants[0].key);
    } else {
      setSelectedKey('');
    }
    setAiAnswer(null);
  }, [selectedBrand, familiesForBrand]);

  // When family changes (within same brand), auto-pick if single variant.
  useEffect(() => {
    if (!selectedFamily) { setSelectedKey(''); return; }
    if (variantsForFamily.length === 1) {
      setSelectedKey(variantsForFamily[0].key);
    } else if (variantsForFamily.length > 1) {
      // Don't auto-pick; let the user choose so they see all variants.
      setSelectedKey('');
    }
    setAiAnswer(null);
  }, [selectedFamily, variantsForFamily]);

  const selected = useMemo(
    () => systems.find(s => s.key === selectedKey) || null,
    [systems, selectedKey]
  );

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
    } finally { setAiLoading(false); }
  }, [question, selected]);

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}><ActivityIndicator size="large" color="#0277BD" /></View>
      </SafeAreaView>
    );
  }

  // Picker option list (brand / family / variant).
  let pickerItems: { value: string; label: string; sub?: string }[] = [];
  let pickerTitle = '';
  if (pickerKind === 'brand') {
    pickerTitle = 'Select Brand';
    pickerItems = brands.map(b => {
      const count = systems.filter(s => s.brand === b).length;
      return { value: b, label: b, sub: `${count} system${count === 1 ? '' : 's'}` };
    });
  } else if (pickerKind === 'family') {
    pickerTitle = `Select Family — ${selectedBrand}`;
    pickerItems = familiesForBrand.map(f => ({
      value: f.family, label: f.family,
      sub: f.variants.length > 1 ? `${f.variants.length} variants` : undefined,
    }));
  } else if (pickerKind === 'variant') {
    pickerTitle = `Select Variant — ${selectedBrand} ${selectedFamily}`;
    pickerItems = variantsForFamily.map(v => ({
      value: v.key, label: variantLabel(selectedFamily, v.name) || v.name,
      sub: `${v.components?.length || 0} components`,
    }));
  }

  const showFamilyDropdown = !!selectedBrand && familiesForBrand.length > 0;
  const showVariantDropdown = !!selectedFamily && variantsForFamily.length > 1;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.headerBar}>
        <View style={s.headerTopRow}>
          <BackButton />
          <View style={s.headerTitleBlock}>
            <Text style={s.headerTitle}>Implant Database</Text>
            <Text style={s.headerSub}>Implanr AI Knowledge Base</Text>
          </View>
          {/* Invisible spacer balances the 44 px back button so the title
              block stays centered on the screen. */}
          <View style={{ width: 44, height: 44 }} />
        </View>

        <View style={s.tabRow}>
          <TouchableOpacity
            style={s.tabAskAi}
            onPress={() => router.push('/ask-implanr')}
            testID="catalog-open-ask-ai"
            data-testid="catalog-open-ask-ai"
          >
            <Ionicons name="sparkles" size={16} color="#0277BD" />
            <Text style={s.tabAskAiText}>Ask Implanr AI</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.tabCompare}
            onPress={() => router.push('/admin/implant-compare')}
            testID="catalog-open-compare"
            data-testid="catalog-open-compare"
          >
            <Ionicons name="git-compare-outline" size={16} color="#00695C" />
            <Text style={s.tabCompareText}>Compare Across Implant Systems</Text>
          </TouchableOpacity>
        </View>
        {canEdit && (
          <TouchableOpacity
            style={s.addNewBtn}
            onPress={() => router.push('/admin/implant-catalog-edit')}
            testID="catalog-add-new"
            data-testid="catalog-add-new"
          >
            <Ionicons name="add-circle" size={16} color="#FFF" />
            <Text style={s.addNewBtnText}>Add Implant System</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* ── Cascading dropdowns ── */}
        <View style={s.dropdownGroup}>
          <Text style={s.dropdownLabel}>Implant Company</Text>
          <TouchableOpacity
            style={s.dropdown}
            onPress={() => setPickerKind('brand')}
            data-testid="catalog-brand-dropdown"
          >
            <Text style={[s.dropdownValue, !selectedBrand && s.dropdownPlaceholder]}>
              {selectedBrand || 'Select a brand'}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#0277BD" />
          </TouchableOpacity>
        </View>

        {showFamilyDropdown && (
          <View style={s.dropdownGroup}>
            <Text style={s.dropdownLabel}>Implant System</Text>
            <TouchableOpacity
              style={s.dropdown}
              onPress={() => setPickerKind('family')}
              data-testid="catalog-family-dropdown"
            >
              <Text style={[s.dropdownValue, !selectedFamily && s.dropdownPlaceholder]}>
                {selectedFamily || 'Select an implant system'}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#0277BD" />
            </TouchableOpacity>
          </View>
        )}

        {showVariantDropdown && (
          <View style={s.dropdownGroup}>
            <Text style={s.dropdownLabel}>Variant</Text>
            <TouchableOpacity
              style={s.dropdown}
              onPress={() => setPickerKind('variant')}
              data-testid="catalog-variant-dropdown"
            >
              <Text style={[s.dropdownValue, !selectedKey && s.dropdownPlaceholder]}>
                {selectedKey
                  ? (variantLabel(selectedFamily, selected?.name || '') || selected?.name)
                  : 'Select a variant'}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#0277BD" />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Detail card (full width) ── */}
        {selected ? (
          <View style={s.detailCard} data-testid="catalog-detail-card">
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={s.detailBrand}>{selected.brand}</Text>
                <Text style={s.detailName}>{selected.name}</Text>
              </View>
              {canEdit && (
                <TouchableOpacity
                  style={s.editBtn}
                  onPress={() => router.push({ pathname: '/admin/implant-catalog-edit', params: { key: selected.key } })}
                  data-testid="catalog-edit-btn"
                >
                  <Ionicons name="create-outline" size={16} color="#0277BD" />
                  <Text style={s.editBtnText}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>

            {!!selected.connection && (
              <SectionBlock title="Connection">
                <DetailRow label="Type" value={selected.connection.type || '—'} />
                {!!selected.connection.subtype && <DetailRow label="Subtype" value={selected.connection.subtype} />}
                {!!selected.connection.indexing?.length && <DetailRow label="Indexing" value={selected.connection.indexing.join(', ')} />}
                {selected.platform_switching != null && <DetailRow label="Platform Switching" value={selected.platform_switching ? 'Yes' : 'No'} />}
              </SectionBlock>
            )}

            {!!selected.implant && (selected.implant.diameters_mm?.length || selected.implant.lengths_mm?.length || selected.implant.bone_types?.length) && (
              <SectionBlock title="Implant">
                {!!selected.implant.diameters_mm?.length && <DetailRow label="Diameters (mm)" value={selected.implant.diameters_mm.join(', ')} />}
                {!!selected.implant.lengths_mm?.length && <DetailRow label="Lengths (mm)" value={selected.implant.lengths_mm.join(', ')} />}
                {!!selected.implant.bone_types?.length && <DetailRow label="Bone Types" value={selected.implant.bone_types.join(', ')} />}
                {!!selected.implant.healing_modes?.length && <DetailRow label="Healing Modes" value={selected.implant.healing_modes.join(', ')} />}
                {!!selected.implant.surface_options?.length && <DetailRow label="Surface Options" value={selected.implant.surface_options.join(', ')} />}
              </SectionBlock>
            )}

            {!!selected.features?.length && (
              <SectionBlock title="Features">
                {selected.features.map((f, i) => (
                  <View key={i} style={s.bullet}>
                    <Text style={s.bulletDot}>•</Text>
                    <Text style={s.bulletText}>{f}</Text>
                  </View>
                ))}
              </SectionBlock>
            )}

            {!!selected.components?.length && (
              <SectionBlock title={`Components (${selected.components.length})`}>
                {selected.components.map((c, i) => <ComponentCard key={i} c={c} />)}
              </SectionBlock>
            )}

            {!!selected.compatibility_notes && (
              <SectionBlock title="Compatibility Notes">
                <Text style={s.notesText}>{selected.compatibility_notes}</Text>
              </SectionBlock>
            )}

            {/* Ask Implanr AI panel */}
            <View style={s.aiPanel}>
              <View style={s.aiHeader}>
                <Ionicons name="sparkles" size={18} color="#0277BD" />
                <Text style={s.aiTitle}>Ask Implanr AI · {selected.brand} {selected.name}</Text>
              </View>
              <TextInput
                style={s.aiInput}
                placeholder='e.g. "What angulations are available?" or "Do we have a multi-unit abutment?"'
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
          </View>
        ) : (
          <View style={s.placeholderCard}>
            <Ionicons name="library-outline" size={36} color="#B3E5FC" />
            <Text style={s.placeholderText}>
              {!selectedBrand
                ? 'Select an implant company above to begin.'
                : showVariantDropdown
                  ? 'Select a variant to load its full data.'
                  : 'Loading…'}
            </Text>
          </View>
        )}

        {/* ── Collapsible visual grid (browse fallback) ── */}
        <TouchableOpacity
          style={s.gridToggle}
          onPress={() => setGridOpen(o => !o)}
          data-testid="catalog-grid-toggle"
        >
          <Ionicons name={gridOpen ? 'chevron-down-circle' : 'chevron-forward-circle'} size={18} color="#0277BD" />
          <Text style={s.gridToggleText}>
            {gridOpen ? 'Hide system grid' : `Browse all ${systems.length} systems visually`}
          </Text>
        </TouchableOpacity>

        {gridOpen && (
          <View style={s.gridWrap}>
            {systems.map(sys => {
              const active = selectedKey === sys.key;
              return (
                <TouchableOpacity
                  key={sys.key}
                  style={[s.gridCard, active && s.gridCardActive]}
                  onPress={() => {
                    setSelectedBrand(sys.brand);
                    setSelectedFamily(familyRoot(sys.name));
                    setSelectedKey(sys.key);
                    setAiAnswer(null);
                  }}
                  data-testid={`catalog-grid-${sys.key}`}
                >
                  <Text style={[s.gridCardBrand, active && { color: '#FFF' }]}>{sys.brand}</Text>
                  <Text style={[s.gridCardName, active && { color: '#FFF' }]} numberOfLines={2}>{sys.name}</Text>
                  <Text style={[s.gridCardCount, active && { color: '#E1F5FE' }]}>{sys.components?.length || 0} components</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Picker modal ── */}
      <Modal
        visible={pickerKind !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerKind(null)}
      >
        <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setPickerKind(null)}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{pickerTitle}</Text>
              <TouchableOpacity onPress={() => setPickerKind(null)} data-testid="catalog-picker-close">
                <Ionicons name="close" size={22} color="#607D8B" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={pickerItems}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => {
                const active =
                  (pickerKind === 'brand' && item.value === selectedBrand) ||
                  (pickerKind === 'family' && item.value === selectedFamily) ||
                  (pickerKind === 'variant' && item.value === selectedKey);
                return (
                  <TouchableOpacity
                    style={[s.pickerRow, active && s.pickerRowActive]}
                    onPress={() => {
                      if (pickerKind === 'brand') setSelectedBrand(item.value);
                      else if (pickerKind === 'family') setSelectedFamily(item.value);
                      else if (pickerKind === 'variant') setSelectedKey(item.value);
                      setPickerKind(null);
                      setAiAnswer(null);
                    }}
                    data-testid={`catalog-picker-${pickerKind}-${item.value}`}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[s.pickerLabel, active && s.pickerLabelActive]}>{item.label}</Text>
                      {!!item.sub && <Text style={[s.pickerSub, active && s.pickerSubActive]}>{item.sub}</Text>}
                    </View>
                    {active && <Ionicons name="checkmark-circle" size={20} color="#0277BD" />}
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={s.pickerSep} />}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────
const SectionBlock: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={s.section}>
    <Text style={s.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={s.row}>
    <Text style={s.rowLabel}>{label}</Text>
    <Text style={s.rowValue}>{value}</Text>
  </View>
);

const titleCase = (s: string) =>
  String(s || '')
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(w => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');

const prettyList = (arr?: string[], sep: string = ' / ') =>
  (arr || []).map(titleCase).join(sep);

const ComponentCard: React.FC<{ c: Component }> = ({ c }) => {
  const type = titleCase(c.type);
  const subtype = c.subtype ? titleCase(c.subtype) : '';
  const title = subtype ? `${type} / ${subtype}` : type;
  return (
    <View style={s.compCard}>
      <Text style={s.compTitle}>{title}</Text>
      {!!c.gingival_heights_mm?.length && <DetailRow label="Gingival Heights" value={`${c.gingival_heights_mm.join(', ')} mm`} />}
      {!!c.angulations_deg?.length && <DetailRow label="Angulations" value={`${c.angulations_deg.join(', ')}°`} />}
      {!!c.retention?.length && <DetailRow label="Retention" value={prettyList(c.retention)} />}
      {!!c.material?.length && <DetailRow label="Material" value={prettyList(c.material)} />}
      {!!c.indication && <DetailRow label="Indication" value={c.indication} />}
      {!!c.driver && <DetailRow label="Driver" value={c.driver} />}
      {c.cad_cam && <DetailRow label="CAD/CAM" value="Yes" />}
      {!!c.notes && <Text style={s.compNotes}>{c.notes}</Text>}
    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  headerBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  headerTitleBlock: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#01579B', lineHeight: 24, textAlign: 'center' },
  headerSub: { fontSize: 12, color: '#607D8B', marginTop: 1, lineHeight: 14, textAlign: 'center' },
  tabRow: { flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  tabAskAi: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, borderWidth: 1.5, borderColor: '#0277BD', backgroundColor: '#E1F5FE', flex: 1, minWidth: 140, maxWidth: 240 },
  tabAskAiText: { color: '#0277BD', fontSize: 14, fontWeight: '700' },
  tabCompare: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, borderWidth: 1.5, borderColor: '#00695C', backgroundColor: '#E0F2F1', flex: 2, minWidth: 220, maxWidth: 360 },
  tabCompareText: { color: '#00695C', fontSize: 14, fontWeight: '700' },
  addNewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#0277BD', paddingHorizontal: 22, paddingVertical: 10, borderRadius: 999, marginTop: 10, alignSelf: 'flex-start' },
  addNewBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  askAiBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5, borderColor: '#0277BD', backgroundColor: '#E1F5FE' },
  askAiBtnText: { color: '#0277BD', fontSize: 12, fontWeight: '700' },
  // Dropdowns
  dropdownGroup: { marginBottom: 12 },
  dropdownLabel: { fontSize: 12, fontWeight: '700', color: '#0277BD', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  dropdown: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1.5, borderColor: '#B3E5FC', paddingHorizontal: 14, paddingVertical: 12 },
  dropdownValue: { fontSize: 15, fontWeight: '600', color: '#01579B', flex: 1 },
  dropdownPlaceholder: { color: '#90A4AE', fontWeight: '500' },
  // Detail card
  detailCard: { backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: '#ECEFF1', padding: 16, marginTop: 8, marginBottom: 12 },
  detailBrand: { fontSize: 12, fontWeight: '700', color: '#607D8B', textTransform: 'uppercase', letterSpacing: 0.5 },
  detailName: { fontSize: 22, fontWeight: '700', color: '#01579B', marginTop: 4, marginBottom: 12 },
  placeholderCard: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: '#ECEFF1', padding: 32, marginTop: 8, marginBottom: 12 },
  placeholderText: { fontSize: 14, color: '#90A4AE', marginTop: 12, textAlign: 'center' },
  // Sections + rows
  section: { marginBottom: 14, backgroundColor: '#FAFCFE', borderRadius: 10, borderWidth: 1, borderColor: '#ECEFF1', padding: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#01579B', marginBottom: 8, letterSpacing: 0.3 },
  row: { flexDirection: 'row', paddingVertical: 4, flexWrap: 'wrap' },
  rowLabel: { width: 140, fontSize: 13, color: '#607D8B', fontWeight: '600' },
  rowValue: { flex: 1, minWidth: 180, fontSize: 13, color: '#263238' },
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
  aiTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: '#0277BD' },
  aiInput: { backgroundColor: '#FFF', borderColor: '#81D4FA', borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 13, minHeight: 70, color: '#01579B' },
  aiButton: { marginTop: 8, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0277BD', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
  aiButtonText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  aiAnswerBox: { marginTop: 12, backgroundColor: '#FFF', borderColor: '#B3E5FC', borderWidth: 1, borderRadius: 10, padding: 12 },
  aiAnswerText: { fontSize: 13, color: '#263238', lineHeight: 20 },
  // Grid
  gridToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  gridToggleText: { fontSize: 13, fontWeight: '700', color: '#0277BD' },
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridCard: { width: '48%', backgroundColor: '#FFF', borderColor: '#B3E5FC', borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 90, justifyContent: 'space-between' },
  gridCardActive: { backgroundColor: '#0277BD', borderColor: '#0277BD' },
  gridCardBrand: { fontSize: 10, fontWeight: '700', color: '#607D8B', textTransform: 'uppercase', letterSpacing: 0.4 },
  gridCardName: { fontSize: 13, fontWeight: '700', color: '#01579B', marginTop: 2 },
  gridCardCount: { fontSize: 11, color: '#0277BD', fontWeight: '600', marginTop: 6 },
  // Picker modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%', paddingBottom: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#01579B' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  pickerRowActive: { backgroundColor: '#E1F5FE' },
  pickerLabel: { fontSize: 15, fontWeight: '600', color: '#263238' },
  pickerLabelActive: { color: '#0277BD', fontWeight: '700' },
  pickerSub: { fontSize: 12, color: '#90A4AE', marginTop: 2 },
  pickerSubActive: { color: '#0277BD' },
  pickerSep: { height: 1, backgroundColor: '#F0F4F8' },
});
