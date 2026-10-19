// iter-455: Phase 1 Clinical Diagnosis card. Shows the Atlas-derived findings
// (grouped, colour-coded) and the fully editable narrative. Used in Phase 1
// Step 2 (above "Submit for Approval") and in Case Details.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Alert, StyleSheet, Platform } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import api from '../utils/api';

export interface DxFinding {
  code: string; section: string; label: string; value: string;
  band: 'favourable' | 'modify' | 'high'; implication: string; site?: string;
}
export interface Phase1Diagnosis {
  text: string; generated_text?: string; findings: DxFinding[]; not_assessed: string[];
  verdict: 'Proceed' | 'Modify plan' | 'Defer' | 'Incomplete'; counts?: Record<string, number>;
  modality_label?: string; generated_at?: string; edited_at?: string | null; edited_by_name?: string | null; version?: number;
}

const BAND = {
  favourable: { color: '#2E7D32', bg: '#E8F5E9', label: 'Favourable' },
  modify: { color: '#EF6C00', bg: '#FFF3E0', label: 'Modify plan' },
  high: { color: '#C62828', bg: '#FFEBEE', label: 'High risk' },
};
const VERDICT = {
  Proceed: { color: '#2E7D32', bg: '#E8F5E9', icon: 'checkmark-circle' as const },
  'Modify plan': { color: '#EF6C00', bg: '#FFF3E0', icon: 'alert-circle' as const },
  Defer: { color: '#C62828', bg: '#FFEBEE', icon: 'close-circle' as const },
  Incomplete: { color: '#546E7A', bg: '#ECEFF1', icon: 'help-circle' as const },
};

interface Props {
  procedureId: string;
  initial?: Phase1Diagnosis | null;
  autoGenerate?: boolean;          // generate on mount when nothing stored yet
  readOnly?: boolean;
  compact?: boolean;               // case-details variant (collapsed findings)
  onChange?: (dx: Phase1Diagnosis) => void;
}

export default function ClinicalDiagnosisCard({ procedureId, initial, autoGenerate = true, readOnly = false, compact = false, onChange }: Props) {
  const [dx, setDx] = useState<Phase1Diagnosis | null>(initial || null);
  const [text, setText] = useState(initial?.text || '');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showFindings, setShowFindings] = useState(!compact);
  const [editing, setEditing] = useState(false);
  const dirty = useRef(false);

  const apply = useCallback((d: Phase1Diagnosis) => {
    setDx(d); setText(d.text || ''); dirty.current = false; onChange?.(d);
  }, [onChange]);

  const generate = useCallback(async (force: boolean) => {
    setLoading(true);
    try {
      const res = await api.post(`/procedures/${procedureId}/diagnosis/generate${force ? '?force=true' : ''}`);
      apply(res.data);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.detail || 'Could not generate diagnosis');
    } finally { setLoading(false); }
  }, [procedureId, apply]);

  useEffect(() => {
    if (initial?.text) {
      apply(initial);
      // Refresh the structured findings against current case data while
      // keeping the clinician's edited narrative (backend preserves text).
      if (!readOnly && autoGenerate) generate(false);
      return;
    }
    if (autoGenerate && procedureId) generate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [procedureId]);

  const save = async () => {
    if (!text.trim()) { Alert.alert('Diagnosis required', 'The diagnosis text cannot be empty.'); return; }
    setSaving(true);
    try {
      const res = await api.put(`/procedures/${procedureId}/diagnosis`, { text: text.trim() });
      apply(res.data); setEditing(false);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.detail || 'Could not save diagnosis');
    } finally { setSaving(false); }
  };

  const regenerate = () => {
    const doIt = () => generate(true);
    if (dx?.edited_at || dirty.current) {
      const msg = 'This will replace your edited text with a fresh diagnosis generated from the current case data.';
      if (Platform.OS === 'web') {
        // RN-web Alert buttons are no-ops; use the native confirm dialog.
        // eslint-disable-next-line no-alert
        if ((globalThis as any).confirm?.(msg)) doIt();
        return;
      }
      Alert.alert('Regenerate diagnosis?', msg, [
        { text: 'Cancel', style: 'cancel' }, { text: 'Replace', style: 'destructive', onPress: doIt },
      ]);
    } else doIt();
  };

  const v = dx ? VERDICT[dx.verdict] || VERDICT.Incomplete : VERDICT.Incomplete;
  const sections = dx ? Array.from(new Set(dx.findings.map(f => f.section))) : [];

  return (
    <View style={styles.card} testID="clinical-diagnosis-card" data-testid="clinical-diagnosis-card">
      <View style={styles.header}>
        <Ionicons name="medkit" size={20} color="#1565C0" />
        <Text style={styles.title}>Clinical Diagnosis</Text>
        {!readOnly && (
          <TouchableOpacity onPress={regenerate} disabled={loading} style={styles.iconBtn} accessibilityRole="button"
            testID="dx-regenerate-btn" data-testid="dx-regenerate-btn">
            {loading ? <ActivityIndicator size="small" color="#1565C0" /> : <Ionicons name="refresh" size={18} color="#1565C0" />}
            <Text style={styles.iconBtnText}>{dx ? 'Regenerate' : 'Generate'}</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.sub}>Generated from the Phase 1 record against the department&apos;s diagnostic criteria. Review and edit before submission.</Text>

      {!dx && loading && <ActivityIndicator style={{ marginVertical: 16 }} color="#1565C0" />}

      {dx && (
        <>
          <View style={[styles.verdict, { backgroundColor: v.bg, borderColor: v.color }]} testID="dx-verdict" data-testid="dx-verdict">
            <Ionicons name={v.icon} size={20} color={v.color} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.verdictTitle, { color: v.color }]}>Overall: {dx.verdict}</Text>
              {!!dx.modality_label && <Text style={styles.verdictSub}>{dx.modality_label}</Text>}
            </View>
            {!!dx.counts && (
              <View style={styles.countRow}>
                {(['high', 'modify', 'favourable'] as const).map(b => (
                  <View key={b} style={[styles.countPill, { backgroundColor: BAND[b].bg }]}>
                    <Text style={[styles.countText, { color: BAND[b].color }]}>{dx.counts?.[b] ?? 0}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <TouchableOpacity onPress={() => setShowFindings(s => !s)} style={styles.toggle} accessibilityRole="button"
            testID="dx-toggle-findings" data-testid="dx-toggle-findings">
            <Text style={styles.toggleText}>{showFindings ? 'Hide' : 'Show'} findings ({dx.findings.length})</Text>
            <Ionicons name={showFindings ? 'chevron-up' : 'chevron-down'} size={16} color="#1565C0" />
          </TouchableOpacity>

          {showFindings && sections.map(sec => (
            <View key={sec} style={styles.section}>
              <Text style={styles.sectionTitle}>{sec}</Text>
              <View style={styles.chipWrap}>
                {dx.findings.filter(f => f.section === sec).map((f, i) => {
                  const b = BAND[f.band];
                  return (
                    <TouchableOpacity key={`${f.code}-${f.site || ''}-${i}`} style={[styles.chip, { backgroundColor: b.bg, borderColor: b.color }]}
                      onPress={() => Alert.alert(`${f.site ? `Tooth ${f.site} · ` : ''}${f.label}`, `${f.value}\n\n${b.label}: ${f.implication}`)}
                      accessibilityRole="button" testID={`dx-chip-${f.code}`} data-testid={`dx-chip-${f.code}`}>
                      <View style={[styles.dot, { backgroundColor: b.color }]} />
                      <Text style={[styles.chipText, { color: b.color }]} numberOfLines={1}>
                        {f.site ? `${f.site} · ` : ''}{f.label}: {f.value}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
          {showFindings && dx.not_assessed?.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Not assessed in Phase 1</Text>
              <Text style={styles.gapText}>{dx.not_assessed.join(' · ')}</Text>
            </View>
          )}

          <View style={styles.textHeader}>
            <Text style={styles.sectionTitle}>Diagnosis narrative {readOnly ? '' : '(editable)'}</Text>
            {!!dx.edited_at && <Text style={styles.editedTag}>Edited{dx.edited_by_name ? ` by ${dx.edited_by_name}` : ''}</Text>}
          </View>
          {readOnly || (compact && !editing) ? (
            <Text style={styles.readText} testID="dx-text-readonly" data-testid="dx-text-readonly">{text}</Text>
          ) : (
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={t => { setText(t); dirty.current = true; }}
              multiline
              textAlignVertical="top"
              placeholder="Diagnosis text"
              testID="dx-text-input" data-testid="dx-text-input"
            />
          )}
          {!readOnly && (
            <View style={styles.actions}>
              {compact && !editing ? (
                <TouchableOpacity onPress={() => setEditing(true)} style={styles.secondaryBtn} testID="dx-edit-btn" data-testid="dx-edit-btn">
                  <Ionicons name="pencil" size={14} color="#1565C0" /><Text style={styles.secondaryText}>Edit</Text>
                </TouchableOpacity>
              ) : (
                <>
                  {compact && (
                    <TouchableOpacity onPress={() => { setEditing(false); setText(dx.text); dirty.current = false; }} style={styles.secondaryBtn}>
                      <Text style={styles.secondaryText}>Cancel</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={save} disabled={saving} style={styles.primaryBtn} testID="dx-save-btn" data-testid="dx-save-btn">
                    {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="save" size={14} color="#FFF" />}
                    <Text style={styles.primaryText}>Save diagnosis</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderColor: '#E3EAF2', ...Platform.select({ web: { boxShadow: '0 1px 3px rgba(0,0,0,0.06)' } as any, default: { elevation: 1 } }) },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: '#1E3A5F' },
  iconBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: '#E3F2FD', minHeight: 36 },
  iconBtnText: { fontSize: 12, fontWeight: '700', color: '#1565C0' },
  sub: { fontSize: 12, color: '#78909C', marginTop: 4, marginBottom: 12, lineHeight: 17 },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, padding: 12 },
  verdictTitle: { fontSize: 14, fontWeight: '800' },
  verdictSub: { fontSize: 12, color: '#546E7A', marginTop: 2 },
  countRow: { flexDirection: 'row', gap: 4 },
  countPill: { minWidth: 26, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countText: { fontSize: 12, fontWeight: '800' },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, minHeight: 44 },
  toggleText: { fontSize: 13, fontWeight: '600', color: '#1565C0' },
  section: { marginBottom: 10 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#546E7A', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '100%' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  gapText: { fontSize: 12, color: '#78909C', lineHeight: 17 },
  textHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  editedTag: { fontSize: 11, color: '#EF6C00', fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#B0BEC5', borderRadius: 10, padding: 12, minHeight: 220, fontSize: 13, lineHeight: 19, color: '#263238', backgroundColor: '#FAFBFD' },
  readText: { fontSize: 13, lineHeight: 19, color: '#263238', backgroundColor: '#FAFBFD', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#ECEFF1' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1565C0', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, minHeight: 44 },
  primaryText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E3F2FD', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, minHeight: 44 },
  secondaryText: { color: '#1565C0', fontSize: 13, fontWeight: '700' },
});
