/**
 * iter-263: CaseSubmissionStatus
 *
 * Horizontal 4-cell strip rendered at the top of the case-detail page.
 * Each cell summarises one phase (1 → 4) with a state icon, label,
 * progress bar, and an elapsed-days badge (admins only).
 *
 * Pure presentation — derives everything from `procedure` + `user` props
 * already loaded by the parent. No API calls, no schema changes.
 *
 * Tap behaviour (per iter-263 spec):
 *   In Progress / Rejected → navigate to that phase's submit form
 *   Done / In Review        → no-op (popover for approval comments tbd)
 *   Locked                  → toast "Locked until previous phase is approved"
 */
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, ToastAndroid, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

type PhaseStatus = {
  state: 'done' | 'review' | 'in_progress' | 'rejected' | 'locked' | 'completed';
  pct: number;          // 0–100
  sectionsLeft: number; // count of unfinished categories for "N sections left"
  elapsedDays?: number; // since this phase's "in-progress" start
};

interface Props {
  procedure: any;
  user: any;
  compact?: boolean; // iter-264: compact list mode — strip-only, no header/hint/elapsed-days
}

const showInfoToast = (msg: string) => {
  if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
  else Alert.alert('', msg);
};

const daysBetween = (from?: string | Date | null, to: Date = new Date()) => {
  if (!from) return undefined;
  const t = typeof from === 'string' ? new Date(from) : from;
  if (isNaN(t.getTime())) return undefined;
  return Math.max(0, Math.floor((to.getTime() - t.getTime()) / 86_400_000));
};

const computePhase1 = (p: any): PhaseStatus => {
  const s = p?.status;
  if (s === 'rejected_phase1') return { state: 'rejected', pct: 0, sectionsLeft: 1 };
  if (s === 'draft') {
    // Sections: patient info, implant plan rows, clinical exam, checklist
    const checks = [
      !!p?.patient_name,
      Array.isArray(p?.implant_plans) && p.implant_plans.length > 0,
      !!p?.implant_site,
      Object.values(p?.checklistItems || {}).some(v => v === true),
    ];
    const done = checks.filter(Boolean).length;
    return { state: 'in_progress', pct: Math.round((done / checks.length) * 100), sectionsLeft: checks.length - done };
  }
  if (s === 'pending_phase1') return { state: 'review', pct: 100, sectionsLeft: 0 };
  // phase1_approved or any later status
  return { state: 'done', pct: 100, sectionsLeft: 0, elapsedDays: daysBetween(p?.created_at, p?.phase1_completed_at ? new Date(p.phase1_completed_at) : undefined) };
};

const computePhase2 = (p: any): PhaseStatus => {
  const s = p?.status;
  const earlier = ['draft', 'pending_phase1', 'rejected_phase1'];
  if (earlier.includes(s)) return { state: 'locked', pct: 0, sectionsLeft: 4 };
  if (s === 'rejected_phase2') return { state: 'rejected', pct: 0, sectionsLeft: 1 };
  if (s === 'pending_phase2') return { state: 'review', pct: 100, sectionsLeft: 0 };
  if (s === 'phase1_approved') {
    const d = p?.phase2_data || {};
    const checks = [
      !!p?.phase2_preop_completed_at,
      !!d.flap_design && !!d.drilling_type && Array.isArray(d.torque_values) && d.torque_values.length > 0,
      Array.isArray(d.iopa_files) && d.iopa_files.length > 0 && d.iopa_files.every((f: any) => f),
      typeof d?.post_op_radiograph === 'boolean' && typeof d?.post_op_instructions === 'boolean' && typeof d?.medications_prescribed === 'boolean',
    ];
    const done = checks.filter(Boolean).length;
    return { state: 'in_progress', pct: Math.round((done / checks.length) * 100), sectionsLeft: checks.length - done, elapsedDays: daysBetween(p?.phase1_completed_at) };
  }
  return { state: 'done', pct: 100, sectionsLeft: 0, elapsedDays: daysBetween(p?.phase1_completed_at, p?.phase2_approved_at ? new Date(p.phase2_approved_at) : undefined) };
};

const computePhase3 = (p: any): PhaseStatus => {
  const s = p?.status;
  const earlier = ['draft', 'pending_phase1', 'phase1_approved', 'pending_phase2', 'rejected_phase1', 'rejected_phase2'];
  if (earlier.includes(s)) return { state: 'locked', pct: 0, sectionsLeft: 2 };
  if (s === 'rejected_stage2_surgical') return { state: 'rejected', pct: 0, sectionsLeft: 1 };
  if (s === 'pending_stage2_surgical') return { state: 'review', pct: 100, sectionsLeft: 0 };
  if (s === 'phase2_approved') {
    const d = p?.phase3_data || p?.stage2_surgical_data || {};
    const checks = [
      Object.values(d?.checklist || {}).some(v => v !== undefined),
      Array.isArray(d?.iopa_files) && d.iopa_files.length > 0 && d.iopa_files.every((f: any) => f),
    ];
    const done = checks.filter(Boolean).length;
    return { state: 'in_progress', pct: Math.round((done / checks.length) * 100), sectionsLeft: checks.length - done, elapsedDays: daysBetween(p?.phase2_approved_at) };
  }
  return { state: 'done', pct: 100, sectionsLeft: 0, elapsedDays: daysBetween(p?.phase2_approved_at, p?.stage2_surgical_approved_at ? new Date(p.stage2_surgical_approved_at) : undefined) };
};

const computePhase4 = (p: any): PhaseStatus => {
  const s = p?.status;
  const earlier = ['draft', 'pending_phase1', 'phase1_approved', 'pending_phase2', 'phase2_approved', 'pending_stage2_surgical', 'rejected_phase1', 'rejected_phase2', 'rejected_stage2_surgical'];
  if (earlier.includes(s)) return { state: 'locked', pct: 0, sectionsLeft: 2 };
  if (s === 'rejected_phase4_step1' || s === 'rejected_phase4_step2') return { state: 'rejected', pct: 0, sectionsLeft: 1 };
  if (s === 'pending_phase4_step1' || s === 'pending_phase4_step2') return { state: 'review', pct: 100, sectionsLeft: 0 };
  if (s === 'completed') return { state: 'completed', pct: 100, sectionsLeft: 0, elapsedDays: daysBetween(p?.created_at, p?.completed_at ? new Date(p.completed_at) : undefined) };
  // stage2_surgical_approved (start of step 1) or phase4_step1_approved (start of step 2)
  const phase = s === 'phase4_step1_approved' ? 'step2' : 'step1';
  if (phase === 'step1') {
    const d = p?.phase4_step1_data || {};
    const checks = [!!d.prosthesis || (Array.isArray(d.per_implant) && d.per_implant.length > 0), !!d.impression_type, !!d.shade_values];
    const done = checks.filter(Boolean).length;
    return { state: 'in_progress', pct: Math.round((done / checks.length) * 50), sectionsLeft: checks.length - done, elapsedDays: daysBetween(p?.stage2_surgical_approved_at) };
  }
  // step 2 → starts at 50% complete (step 1 done)
  const d2 = p?.phase4_step2_data || {};
  const validPhotos = (d2.prosthesis_photos || []).filter((x: any) => x);
  const checks = [
    Object.values(d2.trial_checklist || {}).every(v => v === true),
    !!d2.confirmed,
    p?.is_full_arch ? !!d2.opg_upload : Array.isArray(d2.iopa_uploads) && d2.iopa_uploads.length > 0,
    validPhotos.length >= 2,
  ];
  const done = checks.filter(Boolean).length;
  return { state: 'in_progress', pct: 50 + Math.round((done / checks.length) * 50), sectionsLeft: checks.length - done, elapsedDays: daysBetween(p?.phase4_step1_approved_at) };
};

const STATE_META: Record<PhaseStatus['state'], { icon: string; label: string; bg: string; fill: string; iconColor: string; textColor: string }> = {
  done:        { icon: 'checkmark-circle', label: 'Done',          bg: '#E8F5E9', fill: '#43A047', iconColor: '#2E7D32', textColor: '#1B5E20' },
  review:      { icon: 'paper-plane',      label: 'Awaiting approval', bg: '#E3F2FD', fill: '#1565C0', iconColor: '#1565C0', textColor: '#0D47A1' },
  in_progress: { icon: 'pulse',            label: 'In progress',   bg: '#FFF8E1', fill: '#F9A825', iconColor: '#F57F17', textColor: '#E65100' },
  rejected:    { icon: 'alert-circle',     label: 'Needs rework',  bg: '#FFEBEE', fill: '#E53935', iconColor: '#C62828', textColor: '#B71C1C' },
  locked:      { icon: 'lock-closed',      label: 'Locked',        bg: '#F5F7FA', fill: '#CFD8DC', iconColor: '#90A4AE', textColor: '#90A4AE' },
  completed:   { icon: 'trophy',           label: 'Complete',      bg: '#E8F5E9', fill: '#43A047', iconColor: '#2E7D32', textColor: '#1B5E20' },
};

export default function CaseSubmissionStatus({ procedure, user, compact = false }: Props) {
  const router = useRouter();
  const isAdmin = user?.role === 'administrator' || user?.role === 'admin';
  const isNurse = user?.role === 'nurse';

  const phases = useMemo(() => [computePhase1(procedure), computePhase2(procedure), computePhase3(procedure), computePhase4(procedure)], [procedure]);
  const doneCount = phases.filter(p => p.state === 'done' || p.state === 'completed').length;

  const phaseRoutes: Record<number, string> = {
    1: `/(tabs)/new-procedure?id=${procedure?.id}`,
    2: `/procedures/submit-phase2/${procedure?.id}`,
    3: `/procedures/submit-stage2-surgical/${procedure?.id}`,
    4: procedure?.status === 'phase4_step1_approved'
        ? `/procedures/submit-phase4-step2/${procedure?.id}`
        : `/procedures/submit-stage2-prosthetic/${procedure?.id}`,
  };

  const onCellPress = (idx: number, ps: PhaseStatus) => {
    if (isNurse) return;
    if (compact) {
      // In list cards, tap anywhere navigates to the case detail —
      // the parent <TouchableOpacity> wrapping the card handles that.
      // Do not navigate from a cell here.
      return;
    }
    if (ps.state === 'locked') {
      showInfoToast('Locked until the previous phase is approved');
      return;
    }
    if (ps.state === 'in_progress' || ps.state === 'rejected') {
      router.push(phaseRoutes[idx + 1] as any);
    }
  };

  // Next-up hint
  const nextUp = (() => {
    if (procedure?.status === 'completed') return 'Treatment complete!';
    const inProgressIdx = phases.findIndex(p => p.state === 'in_progress');
    if (inProgressIdx !== -1) {
      const ps = phases[inProgressIdx];
      return `Next up: Phase ${inProgressIdx + 1} — ${ps.sectionsLeft} section${ps.sectionsLeft !== 1 ? 's' : ''} left`;
    }
    const inReviewIdx = phases.findIndex(p => p.state === 'review');
    if (inReviewIdx !== -1) return `Next up: Phase ${inReviewIdx + 1} — awaiting faculty approval`;
    const rejIdx = phases.findIndex(p => p.state === 'rejected');
    if (rejIdx !== -1) return `Phase ${rejIdx + 1} needs rework`;
    return null;
  })();

  return (
    <View style={[s.wrap, compact && s.wrapCompact]} data-testid="case-submission-status">
      {!compact && (
        <View style={s.header}>
          <Text style={s.title}>Treatment Progress</Text>
          <Text style={s.count}>{doneCount} / 4</Text>
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: compact ? 6 : 8, paddingHorizontal: 4 }}>
        {phases.map((ps, idx) => {
          const meta = STATE_META[ps.state];
          const labelText = ps.state === 'in_progress'
            ? `${ps.pct}% • ${ps.sectionsLeft} left`
            : meta.label;
          return (
            <TouchableOpacity
              key={idx}
              activeOpacity={!compact && (ps.state === 'in_progress' || ps.state === 'rejected') ? 0.7 : 0.9}
              onPress={() => onCellPress(idx, ps)}
              style={[s.cell, compact && s.cellCompact, { backgroundColor: meta.bg }]}
              testID={`case-status-phase-${idx + 1}`}
            >
              <View style={s.cellHead}>
                <Text style={[s.phaseLabel, compact && s.phaseLabelCompact, { color: meta.textColor }]}>P{idx + 1}</Text>
                <Ionicons name={meta.icon as any} size={compact ? 14 : 18} color={meta.iconColor} />
              </View>
              <Text style={[s.stateLabel, compact && s.stateLabelCompact, { color: meta.textColor }]} numberOfLines={1}>{labelText}</Text>
              <View style={s.track}>
                <View style={[s.fill, { width: `${ps.pct}%`, backgroundColor: meta.fill }]} />
              </View>
              {!compact && isAdmin && typeof ps.elapsedDays === 'number' && (
                <Text style={s.elapsed}>{ps.elapsedDays}d</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {!compact && nextUp && (
        <Text style={s.nextUp} numberOfLines={2}>{nextUp}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginTop: 12, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E8EDF2' },
  wrapCompact: { marginHorizontal: 0, marginTop: 10, padding: 0, borderWidth: 0, borderRadius: 0, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 14, fontWeight: '700', color: '#0D47A1', letterSpacing: 0.2 },
  count: { fontSize: 13, fontWeight: '700', color: '#1565C0' },
  cell: { minWidth: 132, flex: 1, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  cellCompact: { minWidth: 88, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  cellHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  phaseLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  phaseLabelCompact: { fontSize: 10 },
  stateLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  stateLabelCompact: { fontSize: 10, marginBottom: 4 },
  track: { height: 4, backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  elapsed: { marginTop: 4, fontSize: 10, fontWeight: '700', color: '#607D8B', textAlign: 'right' },
  nextUp: { marginTop: 10, fontSize: 12, fontStyle: 'italic', color: '#546E7A' },
});
