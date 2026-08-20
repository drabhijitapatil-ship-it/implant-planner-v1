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

const configAllowsType = (config: string, type: 'zygoma' | 'pterygoid'): boolean => {
  // iter-Jun-2026 (v7): Conventional implants in mixed cases are handled by
  // the parent CaseImplantPlanning FDI-chart flow (matches the Single/Multiple
  // Conventional experience). This component now only manages zygoma + pterygoid.
  const c = (config || '').toLowerCase();
  if (type === 'zygoma') return c.includes('zygoma');
  if (type === 'pterygoid') return c.includes('pterygoid');
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
      {/* Config line — wraps to multiple lines on small screens so it never clips. */}
      <View style={st.subRow}>
        <Text style={st.subLabel}>Configuration:</Text>
        <Text style={st.subValue}>{configuration || 'not set'}</Text>
      </View>

      {/* Implant list — iter-Jun-2026 (v8): redesigned to visually match
          the Conventional implant card (badge + title + status/type pills +
          Edit/Delete actions). */}
      {(value || []).map((row, idx) => {
        const isEmpty = !row.system;
        const typeColor = row.implant_type === 'zygoma'
          ? { bg: '#FFF3E0', border: '#FB8C00', fg: '#E65100', badgeBg: '#FFE0B2', badgeFg: '#E65100' }
          : row.implant_type === 'pterygoid'
            ? { bg: '#E3F2FD', border: '#1E88E5', fg: '#1565C0', badgeBg: '#BBDEFB', badgeFg: '#0D47A1' }
            : { bg: '#FFFDE7', border: '#FBC02D', fg: '#F57F17', badgeBg: '#FFF9C4', badgeFg: '#F57F17' };
        const sideLetter = (row.side || '').charAt(0).toUpperCase() || '?';
        const rowNum = (() => {
          // Count same type+side in earlier rows to derive "#1/#2" numeric
          let n = 0;
          for (let i = 0; i <= idx; i++) {
            if ((value[i]?.implant_type || 'conv') === row.implant_type && value[i]?.side === row.side) n++;
          }
          return n;
        })();
        const titleLabel = row.implant_type === 'zygoma'
          ? `Zygoma ${row.side || 'TBD'}`
          : row.implant_type === 'pterygoid'
            ? `Pterygoid ${row.side || 'TBD'}`
            : row.tooth_position ? `FDI ${row.tooth_position}` : `Implant #${idx + 1}`;
        return (
          <View key={idx} style={[cardSt.card, isEmpty && cardSt.cardEmpty]} testID={`zyg-implant-row-${idx}`}>
            <View style={cardSt.header}>
              {/* Badge — orange/blue side-badge with initial+row number */}
              <View style={[cardSt.badge, { backgroundColor: typeColor.badgeBg }]}>
                <Text style={[cardSt.badgeText, { color: typeColor.badgeFg }]}>{sideLetter}{rowNum > 0 ? rowNum : ''}</Text>
              </View>
              <View style={cardSt.info}>
                <View style={cardSt.titleRow}>
                  <Text style={cardSt.title} numberOfLines={2}>{titleLabel}</Text>
                  {/* Active/Inactive chip — Zygoma cases default to Active. */}
                  <View style={[cardSt.statusChip, cardSt.statusChipActive]} testID={`zyg-status-${idx}`}>
                    <Text style={cardSt.statusChipText}>Active</Text>
                  </View>
                  {/* Type pill (orange/blue/yellow) */}
                  <View style={[cardSt.typePill, { backgroundColor: typeColor.bg, borderColor: typeColor.border }]}>
                    <Text style={[cardSt.typePillText, { color: typeColor.fg }]}>
                      {(row.implant_type || 'CONV').toUpperCase()}
                    </Text>
                  </View>
                </View>
                {isEmpty ? (
                  <Text style={cardSt.emptyHint}>Tap Edit to configure (side, brand, diameter, length)</Text>
                ) : (
                  <Text style={cardSt.specs}>{row.brand} · {row.system}</Text>
                )}
                {!isEmpty && (
                  <Text style={cardSt.specsDetail}>D: {row.diameter}mm | L: {row.length}mm</Text>
                )}
              </View>
            </View>
            {!readOnly ? (
              <View style={cardSt.actions}>
                <TouchableOpacity style={cardSt.editBtn} onPress={() => openEdit(idx)} testID={`zyg-edit-implant-${idx}`}>
                  <Ionicons name="pencil" size={16} color="#1E88E5" />
                  <Text style={cardSt.editBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={cardSt.deleteBtn} onPress={() => removeRow(idx)} testID={`zyg-delete-implant-${idx}`}>
                  <Ionicons name="trash-outline" size={16} color="#F44336" />
                  <Text style={cardSt.deleteBtnText}>Remove</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        );
      })}

      {!readOnly ? (
        <View style={st.addBtnRow}>
          <TouchableOpacity style={st.addBtnCompact} onPress={openAdd} testID="zyg-add-implant-btn" accessibilityLabel="Add Zygoma or Pterygoid implant">
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
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
                  {(['zygoma', 'pterygoid'] as const).filter(t => configAllowsType(configuration, t)).map(t => (
                    <TouchableOpacity key={t} style={st.typeCard} onPress={() => setPendingType(t)} testID={`zyg-type-${t}`}>
                      <Ionicons name={t === 'zygoma' ? 'body-outline' : 'triangle-outline'} size={22} color="#5E35B1" />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={st.typeCardTitle}>Select {t.charAt(0).toUpperCase() + t.slice(1)} Implant</Text>
                        <Text style={st.typeCardSub}>
                          {t === 'zygoma' && 'Refirm Z-Series · 30-60 mm (Maxilla only)'}
                          {t === 'pterygoid' && 'Refirm P-Series · 18-25 mm  |  B&B 3P Long · 18-24 mm'}
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

                  {/* Side for Zygoma/Pterygoid — always required now that conventional is handled by parent */}
                  <Text style={st.sectionLabel}>Side</Text>
                  <View style={st.chipRow}>
                    {YES_NO_SIDE.map(s => (
                      <TouchableOpacity key={s} onPress={() => setDraft({ ...draft, side: s as any })}
                        style={[st.chip, draft.side === s && st.chipOn]} testID={`zyg-side-${s}`}>
                        <Text style={[st.chipText, draft.side === s && st.chipTextOn]}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

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
  wrap: { marginTop: 6, width: '100%', maxWidth: 420, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 14, fontWeight: '700', color: '#5E35B1', marginLeft: 6 },
  // iter-Jun-2026 (v7): Configuration line wraps to multiple lines to avoid
  // overflow on small phones (e.g. "Zygoma, pterygoid + conventional").
  subRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 12, paddingHorizontal: 4 },
  subLabel: { fontSize: 12, color: '#546E7A', marginRight: 4 },
  subValue: { fontSize: 12, color: '#37474F', fontWeight: '700', flexShrink: 1 },
  // Legacy `sub` kept in case referenced elsewhere.
  sub: { fontSize: 12, color: '#546E7A', marginBottom: 10, flexWrap: 'wrap' },
  card: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#ECEFF1', padding: 10, marginBottom: 8, alignSelf: 'center', width: '100%', maxWidth: 380 },
  cardEmpty: { borderStyle: 'dashed', backgroundColor: '#F5F7FA' },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  pillText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#37474F' },
  cardBody: { fontSize: 12, color: '#546E7A', marginTop: 2 },
  emptyHint: { fontSize: 11, color: '#78909C', fontStyle: 'italic', marginTop: 2 },
  // iter-Jun-2026 (v7): compact centered "+" bubble instead of the wide purple bar.
  addBtnRow: { alignItems: 'center', marginTop: 8, marginBottom: 4 },
  addBtnCompact: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#5E35B1', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowOffset: { width: 0, height: 2 }, shadowRadius: 3, elevation: 3 },
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

// iter-Jun-2026 (v8): Card styling designed to visually match the standard
// Conventional implant card (Edit/Delete/Active-Inactive pills, side-badge,
// specs, colored type pill).
const cardSt = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 10, borderWidth: 1, borderColor: '#ECEFF1', padding: 14, marginBottom: 8, alignSelf: 'center', width: '100%', maxWidth: 380 },
  cardEmpty: { borderStyle: 'dashed', backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 13, fontWeight: '800' },
  info: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  title: { fontSize: 14, fontWeight: '600', color: '#333' },
  statusChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  statusChipActive: { backgroundColor: '#2E7D32' },
  statusChipText: { fontSize: 10, color: '#FFF', fontWeight: '700' },
  typePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  typePillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  specs: { fontSize: 12, color: '#546E7A', marginTop: 3 },
  specsDetail: { fontSize: 12, color: '#888', marginTop: 1 },
  emptyHint: { fontSize: 11, color: '#78909C', fontStyle: 'italic', marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 10, paddingLeft: 48 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editBtnText: { fontSize: 12, color: '#1E88E5', fontWeight: '600' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deleteBtnText: { fontSize: 12, color: '#F44336', fontWeight: '600' },
});

export default ZygomaImplantSelection;
