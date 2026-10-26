// iter-453: ASA Classification subsection (Phase 1 → Medical Assessment).
// Mandatory single-select I–VI with a header ⓘ (overview + E modifier +
// decision rules) and a per-class ⓘ (definition, examples, implant
// relevance, decision rule). Shows a colour-coded guidance chip once chosen.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ASA_CLASSES, ASA_OVERVIEW, ASA_E_MODIFIER, ASA_DECISION_RULES, getAsaInfo, AsaClassInfo,
} from '../constants/asa';

interface Props {
  value: string;
  onChange: (cls: string) => void;
  testidSuffix: string;
}

type Sheet = { kind: 'overview' } | { kind: 'class'; info: AsaClassInfo } | null;

export default function AsaClassificationSection({ value, onChange, testidSuffix }: Props) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const selected = getAsaInfo(value);

  return (
    <View style={styles.wrap} testID={`asa-section-${testidSuffix}`} data-testid={`asa-section-${testidSuffix}`}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>ASA Classification <Text style={styles.req}>*</Text></Text>
        <TouchableOpacity
          onPress={() => setSheet({ kind: 'overview' })}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="About the ASA classification"
          testID={`asa-info-${testidSuffix}`} data-testid={`asa-info-${testidSuffix}`}
        >
          <Ionicons name="information-circle-outline" size={20} color="#1565C0" />
        </TouchableOpacity>
      </View>
      <Text style={styles.sub}>Physical status of the patient (American Society of Anesthesiologists)</Text>

      <TouchableOpacity
        style={[styles.trigger, open && styles.triggerOpen, !value && styles.triggerEmpty]}
        onPress={() => setOpen(o => !o)}
        accessibilityRole="button"
        testID={`asa-dropdown-${testidSuffix}`} data-testid={`asa-dropdown-${testidSuffix}`}
      >
        <Text style={[styles.triggerText, !value && styles.placeholder]}>
          {selected ? `ASA ${selected.cls} — ${selected.definition}` : 'Select ASA Class'}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#546E7A" />
      </TouchableOpacity>

      {open && (
        <View style={styles.list} testID={`asa-options-${testidSuffix}`} data-testid={`asa-options-${testidSuffix}`}>
          {ASA_CLASSES.map(c => {
            const active = c.cls === value;
            return (
              <View key={c.cls} style={[styles.optionRow, active && { backgroundColor: c.bg }]}>
                <TouchableOpacity
                  style={styles.optionMain}
                  onPress={() => { onChange(c.cls); setOpen(false); }}
                  accessibilityRole="button"
                  testID={`asa-option-${c.cls}-${testidSuffix}`} data-testid={`asa-option-${c.cls}-${testidSuffix}`}
                >
                  <View style={[styles.clsPill, { borderColor: c.color, backgroundColor: active ? c.color : '#FFFFFF' }]}>
                    <Text style={[styles.clsPillText, { color: active ? '#FFFFFF' : c.color }]}>{c.cls}</Text>
                  </View>
                  <Text style={[styles.optionText, active && { color: c.color, fontWeight: '700' }]} numberOfLines={2}>
                    {c.definition}
                  </Text>
                  {active && <Ionicons name="checkmark" size={18} color={c.color} />}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setSheet({ kind: 'class', info: c })}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.optionInfo}
                  accessibilityRole="button"
                  accessibilityLabel={`About ASA class ${c.cls}`}
                  testID={`asa-option-info-${c.cls}-${testidSuffix}`} data-testid={`asa-option-info-${c.cls}-${testidSuffix}`}
                >
                  <Ionicons name="information-circle-outline" size={20} color="#1565C0" />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      {selected && (
        <View style={[styles.chip, { backgroundColor: selected.bg, borderColor: selected.color }]}
          testID={`asa-chip-${testidSuffix}`} data-testid={`asa-chip-${testidSuffix}`}>
          <Ionicons
            name={selected.decision === 'Proceed' ? 'checkmark-circle' : selected.decision === 'Conditional' ? 'alert-circle' : 'close-circle'}
            size={18} color={selected.color} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.chipTitle, { color: selected.color }]}>
              ASA {selected.cls} · {selected.decision === 'Proceed' ? 'Proceed with elective implant surgery'
                : selected.decision === 'Conditional' ? 'Conditional — physician clearance required'
                : selected.decision === 'Defer' ? 'Defer elective implant surgery'
                : 'Not a candidate for elective implant care'}
            </Text>
            <Text style={styles.chipBody}>{selected.requiredAction}</Text>
          </View>
        </View>
      )}

      {/* ─── Info sheets ─── */}
      <Modal visible={!!sheet} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <TouchableOpacity activeOpacity={1} style={styles.backdrop} onPress={() => setSheet(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => { /* swallow */ }}
            testID={`asa-sheet-${testidSuffix}`} data-testid={`asa-sheet-${testidSuffix}`}>
            <View style={styles.sheetHandle} />
            <ScrollView showsVerticalScrollIndicator style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
              {sheet?.kind === 'overview' && (
                <>
                  <View style={styles.sheetTitleRow}>
                    <Ionicons name="information-circle" size={22} color="#1565C0" />
                    <Text style={styles.sheetTitle}>ASA Classification</Text>
                  </View>
                  <Text style={styles.body}>{ASA_OVERVIEW}</Text>
                  <Text style={styles.h2}>“E” modifier</Text>
                  <Text style={styles.body}>{ASA_E_MODIFIER}</Text>
                  <Text style={styles.h2}>Decision rules for implant planning</Text>
                  <View style={styles.table}>
                    <View style={[styles.tr, styles.th]}>
                      <Text style={[styles.tdCls, styles.thText]}>ASA class</Text>
                      <Text style={[styles.tdSurg, styles.thText]}>Elective implant surgery</Text>
                      <Text style={[styles.tdAct, styles.thText]}>Required action</Text>
                    </View>
                    {ASA_DECISION_RULES.map((r, i) => {
                      const info = getAsaInfo(r.cls.split(',')[0].trim());
                      return (
                        <View key={r.cls} style={[styles.tr, i % 2 === 1 && styles.trAlt]}>
                          <Text style={[styles.tdCls, { color: info?.color || '#263238', fontWeight: '700' }]}>{r.cls}</Text>
                          <Text style={[styles.tdSurg, { color: info?.color || '#263238', fontWeight: '600' }]}>{r.surgery}</Text>
                          <Text style={styles.tdAct}>{r.action}</Text>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}
              {sheet?.kind === 'class' && (
                <>
                  <View style={styles.sheetTitleRow}>
                    <View style={[styles.clsPill, { borderColor: sheet.info.color, backgroundColor: sheet.info.color }]}>
                      <Text style={[styles.clsPillText, { color: '#FFFFFF' }]}>{sheet.info.cls}</Text>
                    </View>
                    <Text style={styles.sheetTitle}>ASA {sheet.info.cls}</Text>
                  </View>
                  <Text style={styles.h3}>Definition</Text>
                  <Text style={styles.body}>{sheet.info.definition}</Text>
                  <Text style={styles.h3}>Adult examples</Text>
                  <Text style={styles.body}>{sheet.info.examples}</Text>
                  <Text style={styles.h3}>Implant relevance</Text>
                  <Text style={styles.body}>{sheet.info.implantRelevance}</Text>
                  <Text style={styles.h3}>Decision rule for elective implant surgery</Text>
                  <View style={[styles.chip, { backgroundColor: sheet.info.bg, borderColor: sheet.info.color, marginTop: 4 }]}>
                    <Text style={[styles.chipTitle, { color: sheet.info.color }]}>{sheet.info.decision}</Text>
                    <Text style={[styles.chipBody, { flex: 1 }]}>{sheet.info.requiredAction}</Text>
                  </View>
                </>
              )}
            </ScrollView>
            <TouchableOpacity onPress={() => setSheet(null)} style={styles.closeBtn}
              testID={`asa-sheet-close-${testidSuffix}`} data-testid={`asa-sheet-close-${testidSuffix}`}>
              <Text style={styles.closeText}>Got it</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#CFD8DC' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { fontSize: 14, fontWeight: '700', color: '#1E3A5F' },
  req: { color: '#C62828' },
  sub: { fontSize: 12, color: '#78909C', marginTop: 2, marginBottom: 10 },
  trigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#B0BEC5', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: '#FFFFFF', minHeight: 48,
  },
  triggerOpen: { borderColor: '#1565C0' },
  triggerEmpty: { borderColor: '#EF9A9A', backgroundColor: '#FFFBFB' },
  triggerText: { flex: 1, fontSize: 14, color: '#263238', marginRight: 8 },
  placeholder: { color: '#90A4AE' },
  list: { marginTop: 6, borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  optionRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  optionMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingLeft: 12, paddingRight: 6, minHeight: 48 },
  optionInfo: { paddingHorizontal: 12, paddingVertical: 12, minHeight: 48, justifyContent: 'center' },
  optionText: { flex: 1, fontSize: 13, color: '#37474F', lineHeight: 18 },
  clsPill: { minWidth: 36, paddingHorizontal: 8, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  clsPillText: { fontSize: 13, fontWeight: '800' },
  chip: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 10, borderWidth: 1, borderRadius: 10, padding: 12 },
  chipTitle: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  chipBody: { fontSize: 12, color: '#455A64', marginTop: 2, lineHeight: 17 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 28, maxHeight: '94%' },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#CFD8DC', marginBottom: 14 },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#0D47A1' },
  h2: { fontSize: 15, fontWeight: '700', color: '#1E3A5F', marginTop: 16, marginBottom: 6 },
  h3: { fontSize: 13, fontWeight: '700', color: '#546E7A', marginTop: 12, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  body: { fontSize: 14, color: '#37474F', lineHeight: 21 },
  table: { borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10, overflow: 'hidden', marginTop: 4 },
  tr: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 8, gap: 6 },
  trAlt: { backgroundColor: '#FAFBFD' },
  th: { backgroundColor: '#E3F2FD' },
  thText: { fontWeight: '700', color: '#0D47A1' },
  tdCls: { width: 52, fontSize: 12, color: '#263238' },
  tdSurg: { width: 92, fontSize: 12, color: '#263238' },
  tdAct: { flex: 1, fontSize: 12, color: '#37474F', lineHeight: 16 },
  closeBtn: { marginTop: 16, alignSelf: 'flex-end', paddingHorizontal: 18, paddingVertical: 10, backgroundColor: '#1565C0', borderRadius: 8, minHeight: 44, justifyContent: 'center' },
  closeText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
