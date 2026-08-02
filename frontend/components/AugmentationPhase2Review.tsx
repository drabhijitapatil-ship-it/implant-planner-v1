/**
 * iter-393 — "Review Pre-Implant Bone Graft Augmentation" summary card shown
 * when Phase 2 opens on a case whose augmentation Step 3 Review was approved.
 *
 * iter-393 Fix #3 (port): this card is now paired with an enforced gate in
 * procedures/[id].tsx — hasApprovedAugmentationGate() suppresses the
 * standalone "PHASE 1 APPROVED" Phase 2 entry point and renders the
 * equivalent CTA attached immediately below this card instead, so the
 * summary can no longer be scrolled past on the way into Phase 2.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const Row = ({ label, value }: { label: string; value?: string }) => {
  if (!value) return null;
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
};

export default function AugmentationPhase2Review({ procedure }: { procedure: any }) {
  const [open, setOpen] = useState(true);
  const inPhase2 = ['phase1_approved', 'pending_phase2'].includes(procedure?.status);
  const rounds: any[] = procedure?.augmentations || [];
  const reviewed = rounds.filter(r => r.status === 'step3_approved' && r.step3);
  if (!inPhase2 || reviewed.length === 0) return null;
  const rnd = reviewed[reviewed.length - 1];
  const s1 = rnd.step1 || {};
  const s2 = rnd.step2 || {};
  const s3 = rnd.step3 || {};
  const seg = (before: any, after: any) => {
    const b = parseFloat(before); const a = parseFloat(after);
    const delta = (!isNaN(b) && !isNaN(a)) ? ` (${a - b >= 0 ? '+' : ''}${Math.round((a - b) * 100) / 100} mm)` : '';
    return `${before || '—'} → ${after || '—'} mm${delta}`;
  };
  const boneGain = (s1.bone_width_before || s3.bone_width_after)
    ? `Horizontal ${seg(s1.bone_width_before, s3.bone_width_after)} · Vertical ${seg(s1.bone_height_before, s3.bone_height_after)}`
    : undefined;

  return (
    <View style={s.section} testID="aug-phase2-review-card">
      <TouchableOpacity style={s.header} onPress={() => setOpen(!open)} testID="aug-phase2-review-toggle">
        <Ionicons name="bandage" size={20} color="#5D4037" />
        <Text style={s.title}>Review Pre-Implant Bone Graft Augmentation</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#78909C" />
      </TouchableOpacity>
      {open && (
        <View style={{ marginTop: 6 }}>
          <Row label="Bone graft performed" value={`Yes — Round ${rnd.round}`} />
          <Row label="Date" value={rnd.scheduled_date || undefined} />
          <Row label="Technique" value={(s2.procedures_performed || []).join(', ') || undefined} />
          <Row label="Healing period" value={s2.healing_protocol === 'Custom' ? s2.healing_custom_text : s2.healing_protocol} />
          <Row label="Bone gain" value={boneGain} />
          <Row label="Complications" value={(s3.complications || []).join(', ') || undefined} />
          <Row label="CBCT available" value={(s3.cbct_files || []).length > 0 ? `Yes (${s3.cbct_files.length})` : 'No'} />
          <Row label="Outcome" value={s3.outcome} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  section: { backgroundColor: '#FFF8F5', marginHorizontal: 16, marginBottom: 16, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#EFD9CE' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '700', color: '#4E342E', flex: 1 },
  row: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#F3E9E3', gap: 10 },
  rowLabel: { fontSize: 12, color: '#8D6E63', flex: 1 },
  rowValue: { fontSize: 12, color: '#3E2723', fontWeight: '600', flex: 1.4, textAlign: 'right' },
});
