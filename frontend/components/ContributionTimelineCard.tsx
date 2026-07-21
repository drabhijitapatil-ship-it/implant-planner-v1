// iter-375 — Student Contribution Timeline card.
// Renders a vertical timeline showing which student owned the case during
// which phases (with duration). Reads /api/procedures/{id}/contribution-timeline.
// Designed to be screenshottable for end-of-year academic portfolios.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

type Segment = {
  student_id: string;
  student_name: string;
  from: string;
  to: string | null;
  duration_days: number;
  phases: number[];
  is_current: boolean;
};

type Payload = {
  case_created_at: string;
  current_phase: number;
  transfer_count: number;
  total_days: number;
  segments: Segment[];
};

type HandoffPayload = {
  latest?: { handoff_summary?: string; from_student_name?: string; to_student_name?: string; completed_at?: string };
  history?: any[];
};

const PHASE_COLORS = ['#78909C', '#0D47A1', '#00838F', '#F57C00', '#2E7D32'];

function _fmtDate(iso: string | null): string {
  if (!iso) return 'now';
  try {
    return new Date(iso).toLocaleDateString(undefined,
      { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}

function _phaseChipLabel(phases: number[]): string {
  if (!phases.length) return '—';
  if (phases.length === 1) return `Phase ${phases[0]}`;
  return `Phase ${phases[0]}–${phases[phases.length - 1]}`;
}

export default function ContributionTimelineCard({ procedureId }: { procedureId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [handoff, setHandoff] = useState<HandoffPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.get(`/procedures/${procedureId}/contribution-timeline`);
        if (alive) setData(r.data);
      } catch {
        // 403 or 404 → hide the card entirely
      }
      // Best-effort — the handoff endpoint may 404 for cases without a
      // completed transfer yet; that's fine, we simply won't render the
      // brief.
      try {
        const h = await api.get(`/procedures/${procedureId}/transfer/handoff`);
        if (alive) setHandoff(h.data);
      } catch { /* no brief available */ }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [procedureId]);

  if (loading) {
    return (
      <View style={s.card}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!data || !data.segments?.length) return null;

  // Hide the card entirely on cases that never changed hands — the timeline
  // only adds value once there's been at least one transfer.
  if (data.transfer_count === 0) return null;

  return (
    <View style={s.card} data-testid="contribution-timeline-card">
      <Pressable onPress={() => setCollapsed(c => !c)} style={s.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="people-outline" size={18} color="#0D47A1" />
          <Text style={s.title}>Student Contribution Timeline</Text>
        </View>
        <View style={s.headerMeta}>
          <Text style={s.metaTxt}>{data.transfer_count} transfer{data.transfer_count === 1 ? '' : 's'} · {data.total_days}d</Text>
          <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={16} color="#546E7A" />
        </View>
      </Pressable>

      {!collapsed && (
        <View style={s.timeline}>
          {handoff?.latest?.handoff_summary ? (
            <View style={s.handoffBox} data-testid="handoff-brief">
              <View style={s.handoffHeader}>
                <Ionicons name="sparkles-outline" size={14} color="#0D47A1" />
                <Text style={s.handoffTitle}>Handoff Brief</Text>
                <Text style={s.handoffMeta}>
                  {handoff.latest.from_student_name} → {handoff.latest.to_student_name}
                </Text>
              </View>
              <Text style={s.handoffBody}>{handoff.latest.handoff_summary}</Text>
              <Text style={s.handoffFine}>De-identified — age & sex only. No patient name / DOB / address shared with the AI.</Text>
            </View>
          ) : null}
          {data.segments.map((seg, idx) => {
            const isLast = idx === data.segments.length - 1;
            const dotColor = PHASE_COLORS[Math.min(idx, PHASE_COLORS.length - 1)];
            return (
              <View key={idx} style={s.segRow} data-testid={`timeline-segment-${idx}`}>
                <View style={s.railCol}>
                  <View style={[s.dot, { backgroundColor: dotColor }]} />
                  {!isLast && <View style={s.rail} />}
                </View>
                <View style={s.segBody}>
                  <View style={s.segHeader}>
                    <Text style={s.studentName}>{seg.student_name}</Text>
                    {seg.is_current && <View style={s.currentPill}><Text style={s.currentPillTxt}>Current</Text></View>}
                  </View>
                  <Text style={s.segMeta}>
                    {_fmtDate(seg.from)} → {_fmtDate(seg.to)}  ·  {seg.duration_days}d
                  </Text>
                  <View style={s.chipRow}>
                    <View style={[s.chip, { borderColor: dotColor }]}>
                      <Text style={[s.chipTxt, { color: dotColor }]}>{_phaseChipLabel(seg.phases)}</Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginVertical: 8,
    borderWidth: 1, borderColor: '#E3F2FD',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '800', color: '#0D47A1' },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaTxt: { fontSize: 11, color: '#546E7A' },
  timeline: { marginTop: 12, gap: 2 },
  segRow: { flexDirection: 'row', gap: 10 },
  railCol: { width: 14, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  rail: { flex: 1, width: 2, backgroundColor: '#CFD8DC', marginTop: 2 },
  segBody: { flex: 1, paddingBottom: 12 },
  segHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  studentName: { fontSize: 13, fontWeight: '700', color: '#0D47A1' },
  currentPill: {
    backgroundColor: '#E8F5E9', borderColor: '#2E7D32', borderWidth: 1,
    borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1,
  },
  currentPillTxt: { fontSize: 10, color: '#2E7D32', fontWeight: '700' },
  segMeta: { fontSize: 11, color: '#546E7A', marginBottom: 6 },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: {
    borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
  },
  chipTxt: { fontSize: 11, fontWeight: '700' },
  handoffBox: {
    backgroundColor: '#F5F9FF', borderRadius: 10, padding: 10, marginBottom: 10,
    borderWidth: 1, borderColor: '#BBDEFB',
  },
  handoffHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' },
  handoffTitle: { fontSize: 13, fontWeight: '800', color: '#0D47A1', flexGrow: 1 },
  handoffMeta: { fontSize: 11, color: '#546E7A' },
  handoffBody: { fontSize: 13, color: '#263238', lineHeight: 19 },
  handoffFine: { fontSize: 10, color: '#78909C', fontStyle: 'italic', marginTop: 6 },
});
