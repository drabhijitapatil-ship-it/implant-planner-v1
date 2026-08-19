/**
 * ZygomaImplantSelection.tsx — iter-Feb-2026 (v6)
 * ------------------------------------------------------------------------
 * Zygoma/Pterygoid-aware implant selection UI that replaces the standard
 * FDI-chart-driven picker inside `CaseImplantPlanning` when the case type
 * is one of the 5 Zygoma/Pterygoid procedure types.
 *
 * Key differences from the standard picker:
 *  - No global FDI chart for Zygoma/Pterygoid implants (they don't
 *    replace teeth; they anchor into zygomatic/pterygoid bone).
 *  - The "Add Implant" modal shows 1-3 large tappable cards based on the
 *    Phase 1 `zygoma_pterygoid_configuration` (Quad Zygoma → 1 card;
 *    Zygoma+Pterygoid → 2; Zygoma+Pterygoid+Conv → 3).
 *  - Zygoma/Pterygoid implants require a Side chip (Right / Left).
 *  - Conventional implants (in mixed cases) surface a full FDI chart with
 *    the Phase 1 `conventional_implant_locations` pre-highlighted.
 *  - Quad Zygoma auto-generates 4 empty rows (R#1, R#2, L#1, L#2).
 *
 * Persisted shape (per implant row on the case's `implant_plans`):
 *   { implant_type: 'zygoma'|'pterygoid'|'conventional',
 *     side?: 'Right'|'Left',           // required for zygoma/pterygoid
 *     tooth_position?: string,          // required for conventional (FDI)
 *     brand, system, diameter, length,
 *     row_label?: 'Right #1' | ... }
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, TextInput, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const YES_NO_SIDE = ['Right', 'Left'];

export type ZygImplantRow = {
  implant_type: 'zygoma' | 'pterygoid' | 'conventional';
  side?: 'Right' | 'Left' | '';
  tooth_position?: string;
  brand?: string;
  system?: string;
  diameter?: number | string;
  length?: number | string;
  row_label?: string;
};

type SystemEntry = { brand: string; system: string; diameters: number[]; lengths: number[]; implant_type?: string };

type Props = {
  procedureType: string;
  configuration: string; // Phase 1 zygoma_pterygoid_configuration
  conventionalLocations: string[]; // Phase 1 conventional_implant_locations (FDI codes)
  systems: SystemEntry[]; // fetched via /implant-library/systems?implant_type=all
  value: ZygImplantRow[];
  onChange: (rows: ZygImplantRow[]) => void;
  readOnly?: boolean;
};

const configAllowsType = (config: string, type: 'zygoma' | 'pterygoid' | 'conventional'): boolean => {
  const c = (config || '').toLowerCase();
  if (type === 'zygoma') return c.includes('zygoma');
  if (type === 'pterygoid') return c.includes('pterygoid');
  if (type === 'conventional') return c.includes('conventional');
  return false;
};

const ZygomaImplantSelection: React.FC<Props> = ({ procedureType, configuration, conventionalLocations, systems, value, onChange, readOnly }) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [pendingType, setPendingType] = useState<'zygoma' | 'pterygoid' | 'conventional' | null>(null);
  const [draft, setDraft] = useState<ZygImplantRow>({} as any);

  // Quad Zygoma pre-populates 4 rows on first mount if the list is empty.
  useEffect(() => {
    if (readOnly) return;
    if (procedureType === 'Quad Zygoma Implants' && (!value || value.length === 0)) {
      onChange([
        { implant_type: 'zygoma', side: 'Right', row_label: 'Right #1' },
        { implant_type: 'zygoma', side: 'Right', row_label: 'Right #2' },
        { implant_type: 'zygoma', side: 'Left', row_label: 'Left #1' },
        { implant_type: 'zygoma', side: 'Left', row_label: 'Left #2' },
      ]);
    }
  }, [procedureType]);

  const openAdd = () => {
    setEditIdx(null); setPendingType(null); setDraft({} as any); setPickerOpen(true);
  };
  const openEdit = (idx: number) => {
    const row = value[idx] || {};
    setEditIdx(idx); setPendingType(row.implant_type || null); setDraft({ ...row }); setPickerOpen(true);
  };
  const removeRow = (idx: number) => {
    Alert.alert('Remove implant?', 'This will remove the row.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => onChange(value.filter((_, i) => i !== idx)) },
    ]);
  };

  const commit = () => {
    if (!pendingType) { Alert.alert('Pick a type'); return; }
    if (pendingType !== 'conventional' && !draft.side) { Alert.alert('Pick a side'); return; }
    if (pendingType === 'conventional' && !draft.tooth_position) { Alert.alert('Pick a tooth position'); return; }
    if (!draft.system || !draft.diameter || !draft.length) { Alert.alert('Complete System / Diameter / Length'); return; }
    const row: ZygImplantRow = { implant_type: pendingType, ...draft };
    if (editIdx !== null) {
      const next = [...value]; next[editIdx] = row; onChange(next);
    } else {
      onChange([...(value || []), row]);
    }
    setPickerOpen(false);
  };

  // System filter based on type
  const availableSystems = useMemo(() => {
    if (!pendingType) return [];
    return systems.filter(s => (s.implant_type || 'conventional') === pendingType);
  }, [pendingType, systems]);

  const selSystem = availableSystems.find(s => s.system === draft.system);

  return (
    <View style={st.wrap}>
      <Text style={st.sub}>Configuration: <Text style={{ fontWeight: '700' }}>{configuration || 'not set'}</Text></Text>

      {/* Implant list */}
      {(value || []).map((row, idx) => {
        const isEmpty = !row.system;
        return (
          <TouchableOpacity key={idx} style={[st.card, isEmpty && st.cardEmpty]} onPress={() => !readOnly && openEdit(idx)} testID={`zyg-implant-row-${idx}`}>
            <View style={st.cardRow}>
              <View style={[st.pill, { backgroundColor: row.implant_type === 'zygoma' ? '#C2185B' : row.implant_type === 'pterygoid' ? '#EF6C00' : '#00897B' }]}>
                <Text style={st.pillText}>{(row.implant_type || 'conv').toUpperCase().slice(0, 4)}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={st.cardTitle}>
                  {row.row_label || (row.side ? `${row.side} ${row.implant_type}` : row.tooth_position ? `FDI ${row.tooth_position}` : `Implant #${idx + 1}`)}
                </Text>
                {isEmpty ? (
                  <Text style={st.emptyHint}>Tap to configure (side, brand, diameter, length)</Text>
                ) : (
                  <Text style={st.cardBody}>{row.brand} · {row.system} · Ø{row.diameter} × L{row.length} mm</Text>
                )}
              </View>
              {!readOnly ? (
                <TouchableOpacity onPress={() => removeRow(idx)}>
                  <Ionicons name="close-circle" size={22} color="#C62828" />
                </TouchableOpacity>
              ) : null}
            </View>
          </TouchableOpacity>
        );
      })}

      {!readOnly ? (
        <TouchableOpacity style={st.addBtn} onPress={openAdd} testID="zyg-add-implant-btn">
          <Ionicons name="add-circle" size={20} color="#fff" />
          <Text style={st.addBtnText}>Add Implant</Text>
        </TouchableOpacity>
      ) : null}

      {/* Add / Edit modal */}
      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View style={st.mBackdrop}>
          <View style={st.mCard}>
            <View style={st.mHeader}>
              <Text style={st.mTitle}>{editIdx !== null ? 'Edit Implant' : 'Add Implant'}</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}><Ionicons name="close" size={24} color="#455A64" /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 12 }}>
              {/* Type selection cards */}
              {!pendingType ? (
                <>
                  <Text style={st.sectionLabel}>Select Implant Type</Text>
                  {(['zygoma', 'pterygoid', 'conventional'] as const).filter(t => configAllowsType(configuration, t)).map(t => (
                    <TouchableOpacity key={t} style={st.typeCard} onPress={() => setPendingType(t)} testID={`zyg-type-${t}`}>
                      <Ionicons name={t === 'zygoma' ? 'body-outline' : t === 'pterygoid' ? 'triangle-outline' : 'ellipse-outline'} size={22} color="#5E35B1" />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={st.typeCardTitle}>Select {t.charAt(0).toUpperCase() + t.slice(1)} Implant</Text>
                        <Text style={st.typeCardSub}>
                          {t === 'zygoma' && 'Refirm Z-Series · 30-60 mm'}
                          {t === 'pterygoid' && 'Refirm P-Series · 18-25 mm  |  B&B 3P Long · 18-24 mm'}
                          {t === 'conventional' && `${conventionalLocations.length} site${conventionalLocations.length !== 1 ? 's' : ''} pre-selected in Phase 1`}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={22} color="#78909C" />
                    </TouchableOpacity>
                  ))}
                </>
              ) : (
                <>
                  <View style={st.mTypeBadge}>
                    <Text style={st.mTypeBadgeText}>{pendingType.toUpperCase()}</Text>
                    <TouchableOpacity onPress={() => setPendingType(null)}><Text style={st.changeLink}>Change</Text></TouchableOpacity>
                  </View>

                  {/* Side for Zygoma/Pterygoid */}
                  {pendingType !== 'conventional' ? (
                    <>
                      <Text style={st.sectionLabel}>Side</Text>
                      <View style={st.chipRow}>
                        {YES_NO_SIDE.map(s => (
                          <TouchableOpacity key={s} onPress={() => setDraft({ ...draft, side: s as any })}
                            style={[st.chip, draft.side === s && st.chipOn]} testID={`zyg-side-${s}`}>
                            <Text style={[st.chipText, draft.side === s && st.chipTextOn]}>{s}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  ) : null}

                  {/* Conventional tooth position */}
                  {pendingType === 'conventional' ? (
                    <>
                      <Text style={st.sectionLabel}>Tooth Position (FDI)</Text>
                      {conventionalLocations.length ? (
                        <>
                          <Text style={st.helper}>Phase 1 pre-selected sites:</Text>
                          <View style={st.chipRow}>
                            {conventionalLocations.map(fdi => (
                              <TouchableOpacity key={fdi} onPress={() => setDraft({ ...draft, tooth_position: fdi })}
                                style={[st.chip, draft.tooth_position === fdi && st.chipOn]}>
                                <Text style={[st.chipText, draft.tooth_position === fdi && st.chipTextOn]}>{fdi}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </>
                      ) : null}
                      <Text style={st.helper}>Or enter any FDI code:</Text>
                      <TextInput style={st.input} value={draft.tooth_position || ''} placeholder="e.g., 15" placeholderTextColor="#B0BEC5"
                        onChangeText={v => setDraft({ ...draft, tooth_position: v })} />
                    </>
                  ) : null}

                  {/* System */}
                  <Text style={st.sectionLabel}>Implant System</Text>
                  <View style={st.chipRow}>
                    {availableSystems.map(s => (
                      <TouchableOpacity key={`${s.brand}|${s.system}`} onPress={() => setDraft({ ...draft, brand: s.brand, system: s.system, diameter: undefined, length: undefined })}
                        style={[st.chip, draft.system === s.system && st.chipOn]}>
                        <Text style={[st.chipText, draft.system === s.system && st.chipTextOn]}>{s.brand} · {s.system}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Diameter */}
                  {selSystem ? (
                    <>
                      <Text style={st.sectionLabel}>Diameter (mm)</Text>
                      <View style={st.chipRow}>
                        {selSystem.diameters.map(d => (
                          <TouchableOpacity key={d} onPress={() => setDraft({ ...draft, diameter: d })}
                            style={[st.chip, draft.diameter === d && st.chipOn]}>
                            <Text style={[st.chipText, draft.diameter === d && st.chipTextOn]}>Ø {d}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <Text style={st.sectionLabel}>Length (mm)</Text>
                      <View style={st.chipRow}>
                        {selSystem.lengths.map(l => (
                          <TouchableOpacity key={l} onPress={() => setDraft({ ...draft, length: l })}
                            style={[st.chip, draft.length === l && st.chipOn]}>
                            <Text style={[st.chipText, draft.length === l && st.chipTextOn]}>L {l}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  ) : null}

                  <TouchableOpacity style={st.saveBtn} onPress={commit} testID="zyg-modal-save">
                    <Text style={st.saveBtnText}>{editIdx !== null ? 'Update Implant' : 'Add Implant'}</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const st = StyleSheet.create({
  wrap: { marginTop: 6 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 14, fontWeight: '700', color: '#5E35B1', marginLeft: 6 },
  sub: { fontSize: 12, color: '#546E7A', marginBottom: 10 },
  card: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#ECEFF1', padding: 10, marginBottom: 8 },
  cardEmpty: { borderStyle: 'dashed', backgroundColor: '#F5F7FA' },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  pillText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#37474F' },
  cardBody: { fontSize: 12, color: '#546E7A', marginTop: 2 },
  emptyHint: { fontSize: 11, color: '#78909C', fontStyle: 'italic', marginTop: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#5E35B1', paddingVertical: 12, borderRadius: 8, marginTop: 6 },
  addBtnText: { color: '#fff', fontWeight: '700', marginLeft: 6 },
  mBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 8 },
  mCard: { width: '100%', maxWidth: 420, maxHeight: '92%', backgroundColor: '#fff', borderRadius: 12 },
  mHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  mTitle: { fontSize: 15, fontWeight: '700', color: '#37474F' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#455A64', marginTop: 12, marginBottom: 6 },
  typeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F7FA', padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#E0E4E8' },
  typeCardTitle: { fontSize: 14, fontWeight: '700', color: '#37474F' },
  typeCardSub: { fontSize: 11, color: '#78909C', marginTop: 2 },
  mTypeBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#EDE7F6', padding: 8, borderRadius: 6 },
  mTypeBadgeText: { fontSize: 12, fontWeight: '700', color: '#4527A0' },
  changeLink: { fontSize: 12, color: '#5E35B1', fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 as any },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: '#CFD8DC', backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#5E35B1', borderColor: '#5E35B1' },
  chipText: { fontSize: 12, color: '#455A64' },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  helper: { fontSize: 11, color: '#78909C', fontStyle: 'italic', marginTop: 4 },
  input: { backgroundColor: '#F5F7FA', borderRadius: 8, borderWidth: 1, borderColor: '#CFD8DC', paddingHorizontal: 10, paddingVertical: Platform.OS === 'ios' ? 10 : 6, fontSize: 14, color: '#263238' },
  saveBtn: { backgroundColor: '#5E35B1', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

export default ZygomaImplantSelection;
