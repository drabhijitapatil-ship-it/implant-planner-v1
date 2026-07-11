/**
 * iter-342 Phase B — Implant Lifecycle Timeline
 *
 * Renders the per-tooth-position event history of every implant:
 * Placed (R0) -> Failed -> Replaced (R1) -> Failed -> Replaced (R2) -> Healed -> Loaded.
 *
 * Consumed by /procedures/[id].tsx. Auto-hidden when no survival review
 * has been submitted (nothing new to show beyond the standard timeline).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

type LifecycleEvent = {
  kind: 'placed' | 'failed' | 'replaced' | 'healed' | 'loaded';
  revision_number: number;
  label: string;
  date?: string | null;
  system?: string;
  diameter?: number;
  length?: number;
  isq?: number | null;
  insertion_torque_ncm?: number | null;
  healing_protocol?: string | null;
  lot_number?: string | null;
  reason?: string | null;
};

type Position = {
  implant_idx: number;
  tooth: string | number;
  current_status: string;
  current_revision: number;
  events: LifecycleEvent[];
};

const KIND_META: Record<LifecycleEvent['kind'], { icon: any; color: string; bg: string }> = {
  placed:   { icon: 'flag',              color: '#1565C0', bg: '#E3F2FD' },
  failed:   { icon: 'alert-circle',      color: '#C62828', bg: '#FFEBEE' },
  replaced: { icon: 'refresh-circle',    color: '#EF6C00', bg: '#FFF3E0' },
  healed:   { icon: 'medkit',            color: '#2E7D32', bg: '#E8F5E9' },
  loaded:   { icon: 'checkmark-done-circle', color: '#00695C', bg: '#E0F2F1' },
};

function fmtDate(d?: string | null) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d).slice(0, 10);
    return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
  } catch {
    return String(d).slice(0, 10);
  }
}

function statusPillStyle(status: string) {
  switch (status) {
    case 'Active':   return { bg: '#E8F5E9', color: '#2E7D32', label: 'Active' };
    case 'Failed':   return { bg: '#FFEBEE', color: '#C62828', label: 'Failed' };
    case 'Replaced': return { bg: '#FFF3E0', color: '#EF6C00', label: 'Replaced' };
    default:         return { bg: '#ECEFF1', color: '#546E7A', label: status };
  }
}

export function ImplantLifecycleTimeline({ procedureId }: { procedureId: string }) {
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<Position[]>([]);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.get(`/procedures/${procedureId}/implant-lifecycle`);
        if (!alive) return;
        setPositions(res.data?.positions || []);
        setReviewSubmitted(!!res.data?.review_submitted);
      } catch {
        // Silent fail — the section auto-hides
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [procedureId]);

  if (loading) return <ActivityIndicator size="small" color="#1565C0" style={{ marginTop: 12 }} />;
  if (!reviewSubmitted || positions.length === 0) return null;
  // Hide if every position is still Active with only a Placed event (nothing more to show than the standard timeline)
  const hasRevisions = positions.some(p => p.events.some(e => e.kind !== 'placed' && e.kind !== 'healed' && e.kind !== 'loaded'));
  if (!hasRevisions) return null;

  return (
    <View style={styles.container} data-testid="implant-lifecycle-timeline" testID="implant-lifecycle-timeline">
      <View style={styles.header}>
        <Ionicons name="git-network-outline" size={18} color="#0D47A1" />
        <Text style={styles.title}>Implant Lifecycle</Text>
      </View>
      <Text style={styles.subtitle}>Full revision history for each tooth position</Text>

      {positions.map(pos => {
        const pill = statusPillStyle(pos.current_status);
        return (
          <View key={pos.implant_idx} style={styles.positionCard} data-testid={`lifecycle-position-${pos.tooth}`} testID={`lifecycle-position-${pos.tooth}`}>
            <View style={styles.positionHeader}>
              <View style={styles.toothBadge}>
                <Text style={styles.toothBadgeText}>{pos.tooth}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.positionTitle}>Tooth {pos.tooth}</Text>
                {pos.current_revision > 0 && (
                  <Text style={styles.positionSub}>Current revision · R{pos.current_revision}</Text>
                )}
              </View>
              <View style={[styles.statusPill, { backgroundColor: pill.bg }]}>
                <Text style={[styles.statusPillText, { color: pill.color }]}>{pill.label}</Text>
              </View>
            </View>

            <View style={styles.eventList}>
              {pos.events.map((ev, idx) => {
                const meta = KIND_META[ev.kind];
                const isLast = idx === pos.events.length - 1;
                return (
                  <View key={idx} style={styles.eventRow} data-testid={`lifecycle-event-${pos.tooth}-${idx}`} testID={`lifecycle-event-${pos.tooth}-${idx}`}>
                    <View style={styles.eventGutter}>
                      <View style={[styles.eventDot, { backgroundColor: meta.bg, borderColor: meta.color }]}>
                        <Ionicons name={meta.icon} size={12} color={meta.color} />
                      </View>
                      {!isLast && <View style={styles.eventLine} />}
                    </View>
                    <View style={styles.eventBody}>
                      <Text style={[styles.eventLabel, { color: meta.color }]}>{ev.label}</Text>
                      <Text style={styles.eventDate}>{fmtDate(ev.date)}</Text>
                      {ev.kind === 'replaced' && (
                        <View style={styles.eventMeta}>
                          {ev.insertion_torque_ncm != null && <Text style={styles.metaChip}>Torque: {ev.insertion_torque_ncm} Ncm</Text>}
                          {ev.isq != null && <Text style={styles.metaChip}>ISQ: {ev.isq}</Text>}
                          {ev.healing_protocol && <Text style={styles.metaChip}>{ev.healing_protocol}</Text>}
                          {ev.lot_number && <Text style={styles.metaChip}>Lot {ev.lot_number}</Text>}
                        </View>
                      )}
                      {ev.kind === 'failed' && ev.reason && (
                        <Text style={styles.eventReason}>Reason: {ev.reason}</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginTop: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E0E6EF' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '800', color: '#0D47A1' },
  subtitle: { fontSize: 12, color: '#546E7A', marginTop: 4, marginBottom: 12 },
  positionCard: { borderWidth: 1, borderColor: '#E0E6EF', borderRadius: 10, padding: 12, marginTop: 10, backgroundColor: '#FAFBFD' },
  positionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  toothBadge: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#1565C0', alignItems: 'center', justifyContent: 'center' },
  toothBadgeText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  positionTitle: { fontSize: 14, fontWeight: '800', color: '#1A237E' },
  positionSub: { fontSize: 11, color: '#546E7A', marginTop: 2 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusPillText: { fontSize: 11, fontWeight: '800' },
  eventList: { marginTop: 4 },
  eventRow: { flexDirection: 'row', gap: 10 },
  eventGutter: { alignItems: 'center', width: 22 },
  eventDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  eventLine: { width: 2, flex: 1, backgroundColor: '#CFD8DC', marginTop: 2, marginBottom: 2 },
  eventBody: { flex: 1, paddingBottom: 12 },
  eventLabel: { fontSize: 13, fontWeight: '700' },
  eventDate: { fontSize: 11, color: '#546E7A', marginTop: 2 },
  eventReason: { fontSize: 11, color: '#546E7A', marginTop: 4, fontStyle: 'italic' },
  eventMeta: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  metaChip: { fontSize: 10, color: '#37474F', backgroundColor: '#ECEFF1', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, fontWeight: '600' },
});

export default ImplantLifecycleTimeline;
