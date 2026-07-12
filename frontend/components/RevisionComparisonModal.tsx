/**
 * iter-351: RevisionComparisonModal — side-by-side comparison of a historical
 * implant revision (R0 or R1 in the chain) vs. the currently active revision
 * (R{n}). Opened by tapping any inactive tile in Implant Planning. The intent
 * is teaching: students can see WHY the earlier system/size/torque didn't
 * survive and what was tried differently in the current revision.
 *
 * Fields that differ between the two revisions are highlighted with a subtle
 * amber accent so the change is immediately visible.
 */
import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type ComparisonRevision = {
  label: string;                    // "R0", "R1", "R2"
  isActive: boolean;
  tooth: string | number | null;
  brand: string;
  system: string;
  diameter: number | string | null;
  length: number | string | null;
  bone_type?: string | null;
  insertion_torque_ncm?: number | string | null;
  isq?: number | string | null;
  placement_date?: string | null;
  procedure_type?: string | null;
  prosthetic_component?: string | null;
  failure_reason?: string | null;
  failure_date?: string | null;
  lot_number?: string | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  historical: ComparisonRevision | null;
  active: ComparisonRevision | null;
  site: string | number;
};

const fmt = (v: any): string => {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
};

const sameDiameterLength = (a?: ComparisonRevision | null, b?: ComparisonRevision | null): boolean => {
  if (!a || !b) return false;
  return String(a.diameter) === String(b.diameter) && String(a.length) === String(b.length);
};

const sameSystem = (a?: ComparisonRevision | null, b?: ComparisonRevision | null): boolean => {
  if (!a || !b) return false;
  const na = `${a.brand || ''} ${a.system || ''}`.trim().toLowerCase();
  const nb = `${b.brand || ''} ${b.system || ''}`.trim().toLowerCase();
  return na === nb;
};

export default function RevisionComparisonModal({ visible, onClose, historical, active, site }: Props) {
  if (!historical || !active) return null;

  const systemDiffers = !sameSystem(historical, active);
  const sizeDiffers = !sameDiameterLength(historical, active);
  const boneDiffers = String(historical.bone_type || '') !== String(active.bone_type || '');
  const torqueDiffers = String(historical.insertion_torque_ncm ?? '') !== String(active.insertion_torque_ncm ?? '');
  const isqDiffers = String(historical.isq ?? '') !== String(active.isq ?? '');

  const Column = ({ rev, side }: { rev: ComparisonRevision; side: 'left' | 'right' }) => (
    <View style={[styles.col, side === 'left' ? styles.colLeft : styles.colRight]}>
      <View style={[styles.colHeader, side === 'left' ? styles.colHeaderLeft : styles.colHeaderRight]}>
        <View style={[styles.revBadge, rev.isActive ? styles.revBadgeActive : styles.revBadgeInactive]}>
          <Text style={styles.revBadgeText}>{rev.label}</Text>
        </View>
        <Text style={styles.colTitle} numberOfLines={1}>
          {rev.isActive ? 'Current' : 'Historical'}
        </Text>
      </View>

      <Row k="System" v={`${fmt(rev.brand)} — ${fmt(rev.system)}`} highlight={systemDiffers} />
      <Row k="Size" v={`Ø${fmt(rev.diameter)}mm × L${fmt(rev.length)}mm`} highlight={sizeDiffers} />
      <Row k="Tooth (FDI)" v={fmt(rev.tooth)} />
      <Row k="Bone type" v={fmt(rev.bone_type)} highlight={boneDiffers} />
      <Row k="Insertion torque" v={rev.insertion_torque_ncm != null ? `${rev.insertion_torque_ncm} Ncm` : '—'} highlight={torqueDiffers} />
      <Row k="ISQ" v={fmt(rev.isq)} highlight={isqDiffers} />
      <Row k="Procedure type" v={fmt(rev.procedure_type)} />
      <Row k="Prosthetic component" v={fmt(rev.prosthetic_component)} />
      <Row k="Placement date" v={fmt(rev.placement_date)} />
      <Row k="Lot #" v={fmt(rev.lot_number)} />
      {!rev.isActive && (
        <View style={styles.failBox}>
          <Text style={styles.failLabel}>Failed</Text>
          <Text style={styles.failReason} numberOfLines={3}>{fmt(rev.failure_reason)}</Text>
          <Text style={styles.failDate}>{rev.failure_date ? String(rev.failure_date).slice(0, 10) : '—'}</Text>
        </View>
      )}
    </View>
  );

  // iter-351: pull out the differences into a bullet list so users see the
  // exact set of changes without hunting through 10 rows.
  const insights: string[] = [];
  if (systemDiffers) insights.push(`System changed from "${historical.brand} ${historical.system}" → "${active.brand} ${active.system}"`);
  if (sizeDiffers) insights.push(`Size changed from Ø${historical.diameter}×L${historical.length} → Ø${active.diameter}×L${active.length}`);
  if (torqueDiffers && historical.insertion_torque_ncm && active.insertion_torque_ncm) {
    const delta = Number(active.insertion_torque_ncm) - Number(historical.insertion_torque_ncm);
    insights.push(`Insertion torque ${delta >= 0 ? 'increased' : 'decreased'} by ${Math.abs(delta)} Ncm (${historical.insertion_torque_ncm} → ${active.insertion_torque_ncm} Ncm)`);
  }
  if (isqDiffers && historical.isq && active.isq) {
    insights.push(`ISQ ${Number(active.isq) > Number(historical.isq) ? 'improved' : 'dropped'} from ${historical.isq} → ${active.isq}`);
  }
  if (insights.length === 0) insights.push('No material differences on record between these revisions.');

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <View style={styles.siteBadge}><Text style={styles.siteBadgeText}>{site}</Text></View>
              <View>
                <Text style={styles.title}>Revision Comparison</Text>
                <Text style={styles.subtitle}>Site #{site} · {historical.label} vs {active.label}</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              testID="revision-compare-close"
              data-testid="revision-compare-close"
            >
              <Ionicons name="close" size={22} color="#37474F" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: Platform.OS === 'web' ? 560 : undefined }} showsVerticalScrollIndicator={false}>
            <View style={styles.columnsWrap}>
              <Column rev={historical} side="left" />
              <View style={styles.divider} />
              <Column rev={active} side="right" />
            </View>

            <View style={styles.insightsCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Ionicons name="sparkles" size={14} color="#EF6C00" />
                <Text style={styles.insightsTitle}>What changed</Text>
              </View>
              {insights.map((ins, i) => (
                <View key={i} style={styles.insightRow}>
                  <View style={styles.insightDot} />
                  <Text style={styles.insightText}>{ins}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const Row = ({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) => (
  <View style={[styles.row, highlight && styles.rowHighlight]}>
    <Text style={styles.rowKey}>{k}</Text>
    <Text style={[styles.rowVal, highlight && styles.rowValHighlight]} numberOfLines={2}>{v}</Text>
  </View>
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: 12,
  },
  sheet: {
    width: '100%', maxWidth: 720, backgroundColor: '#FFF',
    borderRadius: 16, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 22, elevation: 12,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: '#ECEFF1',
  },
  siteBadge: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#0D47A1',
    alignItems: 'center', justifyContent: 'center',
  },
  siteBadgeText: { color: '#FFF', fontWeight: '900', fontSize: 14, letterSpacing: 0.4 },
  title: { fontSize: 15, fontWeight: '900', color: '#0D47A1', letterSpacing: 0.3 },
  subtitle: { fontSize: 11, color: '#546E7A', marginTop: 1 },

  columnsWrap: { flexDirection: 'row', alignItems: 'stretch', gap: 0 },
  col: { flex: 1, padding: 4 },
  colLeft: {},
  colRight: {},
  colHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 6, marginBottom: 4,
    borderRadius: 8,
  },
  colHeaderLeft: { backgroundColor: '#ECEFF1' },
  colHeaderRight: { backgroundColor: '#E8F5E9' },
  colTitle: { fontSize: 12, fontWeight: '800', color: '#37474F', textTransform: 'uppercase', letterSpacing: 0.5 },
  revBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  revBadgeActive: { backgroundColor: '#2E7D32' },
  revBadgeInactive: { backgroundColor: '#90A4AE' },
  revBadgeText: { color: '#FFF', fontWeight: '800', fontSize: 11, letterSpacing: 0.5 },
  divider: { width: 1, backgroundColor: '#ECEFF1', marginHorizontal: 6 },

  row: {
    paddingHorizontal: 6, paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: '#F5F7FA',
  },
  rowHighlight: {
    backgroundColor: '#FFF8E1',
    borderLeftWidth: 3, borderLeftColor: '#F57C00',
    borderRadius: 4,
  },
  rowKey: { fontSize: 10.5, color: '#78909C', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  rowVal: { fontSize: 12.5, color: '#263238', fontWeight: '600' },
  rowValHighlight: { color: '#E65100', fontWeight: '800' },

  failBox: {
    marginTop: 6, padding: 8, borderRadius: 8,
    backgroundColor: '#FFEBEE', borderLeftWidth: 3, borderLeftColor: '#C62828',
  },
  failLabel: { fontSize: 10, color: '#B71C1C', fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  failReason: { fontSize: 12, color: '#B71C1C', fontWeight: '700', marginTop: 2 },
  failDate: { fontSize: 10, color: '#8E1B1B', fontStyle: 'italic', marginTop: 2 },

  insightsCard: {
    marginTop: 12, padding: 10, borderRadius: 10,
    backgroundColor: '#FFF3E0', borderLeftWidth: 3, borderLeftColor: '#EF6C00',
  },
  insightsTitle: { fontSize: 11, color: '#E65100', fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 3 },
  insightDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF6C00', marginTop: 6 },
  insightText: { flex: 1, fontSize: 12, color: '#3E2723', lineHeight: 17, fontWeight: '600' },
});
