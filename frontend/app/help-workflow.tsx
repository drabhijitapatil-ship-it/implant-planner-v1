/**
 * Help & Workflow screen. Shown after onboarding slides on first login, and
 * accessible anytime from Profile → "How it works". Renders a role-specific
 * vertical flowchart of the full case lifecycle.
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';

type Step = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  bullets: string[];
  tone: 'pre' | 'phase1' | 'phase2' | 'phase3' | 'phase4' | 'done' | 'reviewer';
};

const TONE_COLORS: Record<Step['tone'], { bg: string; stripe: string; fg: string }> = {
  pre:      { bg: '#ECEFF1', stripe: '#78909C', fg: '#37474F' },
  phase1:   { bg: '#E3F2FD', stripe: '#1565C0', fg: '#0D47A1' },
  phase2:   { bg: '#E8F5E9', stripe: '#2E7D32', fg: '#1B5E20' },
  phase3:   { bg: '#FFF3E0', stripe: '#EF6C00', fg: '#E65100' },
  phase4:   { bg: '#F3E5F5', stripe: '#8E24AA', fg: '#6A1B9A' },
  done:     { bg: '#E0F7FA', stripe: '#00838F', fg: '#006064' },
  reviewer: { bg: '#FFFDE7', stripe: '#F9A825', fg: '#795548' },
};

const WORKFLOW: Record<string, { intro: string; steps: Step[] }> = {
  student: {
    intro: 'You own your cases end to end. Each phase needs two approvals before the next one unlocks.',
    steps: [
      { icon: 'calendar-outline',   tone: 'pre',    title: 'Schedule a case', bullets: ['Enter patient info, medical history, implant plan', 'Upload CBCT / OPG / clinical photos', 'Assign a Supervisor & Implant In-Charge'] },
      { icon: 'people-outline',     tone: 'phase1', title: 'Phase 1 — Pre-surgical', bullets: ['Supervisor approves (1st gate)', 'Implant In-Charge approves (final gate)', 'Status → Phase 1 Approved'] },
      { icon: 'clipboard-outline',  tone: 'pre',    title: 'Pre-surgery prep', bullets: ['Print consent template → get patient signature → upload signed form', 'Nurse marks instruments autoclaved', 'Export Drilling Protocol PDF with QR to CBCT'] },
      { icon: 'medkit-outline',     tone: 'phase2', title: 'Phase 2 — Surgical', bullets: ['Day-of checklist: torque values, cover-screw vs healing abutment', 'Intra-op OPG + surgical photos', 'Submit for approval'] },
      { icon: 'bandage-outline',    tone: 'phase3', title: 'Phase 3 — Second-stage surgical', bullets: ['After healing period', 'Uncover implant, place healing abutment', 'Submit for approval'] },
      { icon: 'construct-outline',  tone: 'phase4', title: 'Phase 4 — Prosthetic', bullets: ['Step 1: Impression + articulator mounting', 'Step 2: Trial, occlusion, final delivery', 'Submit for final approval'] },
      { icon: 'ribbon-outline',     tone: 'done',   title: 'Complete', bullets: ['Generate case-report PDF', 'Ask Implanr AI for a case summary', 'Archive'] },
    ],
  },
  supervisor: {
    intro: 'You\'re the first approval gate for your students\' cases — and you can schedule your own cases too.',
    steps: [
      { icon: 'eye-outline',                tone: 'reviewer', title: 'Review student submissions', bullets: ['See only cases where you\'re the assigned supervisor', 'Approve or reject each phase with a comment', 'Implant In-Charge is the final gate after you'] },
      { icon: 'hourglass-outline',          tone: 'reviewer', title: 'Track who\'s blocking', bullets: ['Each case shows "Awaiting student to start Phase N"', 'View uploaded consent forms in read-only mode'] },
      { icon: 'calendar-outline',           tone: 'pre',      title: 'Schedule your own cases', bullets: ['Same 4-phase lifecycle as students', 'Supervisor gate skipped — only In-Charge approves'] },
      { icon: 'checkmark-done-circle-outline', tone: 'done',  title: 'Complete', bullets: ['Your cases follow the same Phase 1 → 4 → Complete path', 'Export reports, ask Implanr AI, archive'] },
    ],
  },
  implant_incharge: {
    intro: 'You\'re the final approval authority. Every phase on every case crosses your desk.',
    steps: [
      { icon: 'shield-checkmark-outline', tone: 'reviewer', title: 'Final approval gate', bullets: ['After Supervisor approves, you give the green light', 'Every phase, every case — no exceptions'] },
      { icon: 'eye-outline',              tone: 'reviewer', title: 'See everything', bullets: ['No case is hidden from you', 'View uploaded consent forms across all cases'] },
      { icon: 'calendar-outline',         tone: 'pre',      title: 'Schedule your own', bullets: ['Your cases self-approve through all phases', 'No supervisor gate'] },
      { icon: 'settings-outline',         tone: 'phase4',   title: 'Admin override', bullets: ['Edit any field on any case', 'Reassign supervisor / student', 'Archive stuck cases'] },
      { icon: 'ribbon-outline',           tone: 'done',     title: 'Complete', bullets: ['Same 4-phase lifecycle', 'Full audit trail on every case'] },
    ],
  },
  nurse: {
    intro: 'You make sure every case is surgery-ready. Phase 1 only — you don\'t approve or enter Phase 2+ data.',
    steps: [
      { icon: 'today-outline',    tone: 'pre',    title: 'Scheduled cases at a glance', bullets: ['Calendar view of today and the next 7 days', 'See consent-upload and autoclave status on each case'] },
      { icon: 'document-text-outline', tone: 'phase1', title: 'Upload signed consent', bullets: ['Print the pre-filled consent template', 'Upload the signed scan or photo', 'Replace with a newer version anytime'] },
      { icon: 'shield-checkmark-outline', tone: 'phase2', title: 'Mark instruments autoclaved', bullets: ['Your name + timestamp get stamped onto the Drilling Protocol PDF', 'Gives the surgical team full traceability'] },
      { icon: 'notifications-outline', tone: 'reviewer', title: '24 h pre-surgery reminders', bullets: ['Push notification the day before surgery', 'Alerts you if consent is still pending or instruments aren\'t autoclaved yet'] },
    ],
  },
  administrator: {
    intro: 'Full In-Charge access. Use it carefully.',
    steps: [
      { icon: 'shield-checkmark-outline', tone: 'reviewer', title: 'Final approval gate', bullets: ['Same authority as Implant In-Charge', 'Final gate on every phase'] },
      { icon: 'eye-outline',              tone: 'reviewer', title: 'See everything', bullets: ['All cases, all supervisors, all students', 'All uploaded consent forms'] },
      { icon: 'settings-outline',         tone: 'phase4',   title: 'Admin override', bullets: ['Edit any field', 'Reassign staff', 'Archive'] },
    ],
  },
};

const LEGEND_STATUSES: { code: string; label: string }[] = [
  { code: 'pending_phase1',                   label: 'Draft submitted, awaiting approvals' },
  { code: 'phase1_approved',                  label: 'Cleared for surgery — consent + autoclave pending' },
  { code: 'phase2_approved',                  label: 'Implant placed, healing period' },
  { code: 'stage2_surgical_approved',         label: 'Uncovered, healing abutment in' },
  { code: 'stage2_prosthetic_step1_approved', label: 'Impression complete' },
  { code: 'completed',                        label: 'Crown delivered, case archived' },
];

export default function HelpWorkflowScreen() {
  const { user, refreshUser, ackWorkflow } = useAuth();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isFirstRun = mode !== 'review'; // when opened from Profile, mode=review → no ack, no dashboard redirect
  const [busy, setBusy] = useState(false);

  const content = useMemo(() => {
    const role = (user?.role || 'student').toLowerCase();
    return WORKFLOW[role] || WORKFLOW.student;
  }, [user?.role]);

  const gotIt = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await ackWorkflow();
      await refreshUser();
    } catch {
      // Even if ack fails, don't trap the user — move on.
    } finally {
      router.replace('/(tabs)/dashboard');
    }
  };

  const close = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe} testID="help-workflow-screen">
      <View style={styles.header}>
        {!isFirstRun && (
          <TouchableOpacity onPress={close} style={styles.backBtn} testID="workflow-close-btn">
            <Ionicons name="arrow-back" size={22} color="#0D47A1" />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>How it works</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.greeting} testID="workflow-greeting">
          {isFirstRun ? `Welcome, ${user?.name || ''}` : 'Your workflow'}
        </Text>
        <Text style={styles.roleTag}>
          Role: <Text style={styles.roleTagStrong}>{(user?.role || '').replace('_', ' ')}</Text>
        </Text>
        <Text style={styles.intro}>{content.intro}</Text>

        {content.steps.map((step, i) => {
          const c = TONE_COLORS[step.tone];
          return (
            <View key={i}>
              <View style={[styles.stepCard, { backgroundColor: c.bg, borderLeftColor: c.stripe }]} testID={`workflow-step-${i}`}>
                <View style={styles.stepHeader}>
                  <Ionicons name={step.icon} size={22} color={c.stripe} />
                  <Text style={[styles.stepTitle, { color: c.fg }]}>{step.title}</Text>
                </View>
                {step.bullets.map((b, j) => (
                  <View key={j} style={styles.bulletRow}>
                    <Text style={[styles.bulletDot, { color: c.stripe }]}>•</Text>
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))}
              </View>
              {i < content.steps.length - 1 && (
                <View style={styles.arrowCol}>
                  <Ionicons name="chevron-down" size={18} color="#CFD8DC" />
                </View>
              )}
            </View>
          );
        })}

        <Text style={styles.sectionTitle}>Status legend</Text>
        <View style={styles.legend}>
          {LEGEND_STATUSES.map((l) => (
            <View key={l.code} style={styles.legendRow}>
              <Text style={styles.legendCode}>{l.code}</Text>
              <Text style={styles.legendText}>{l.label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer}>You can reopen this anytime from Profile → How it works.</Text>
      </ScrollView>

      {isFirstRun && (
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.primary} onPress={gotIt} disabled={busy} testID="workflow-gotit-btn">
            {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryText}>Got it — take me to my dashboard</Text>}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FA' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#ECEFF1', backgroundColor: '#FFF',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#0D47A1' },
  scroll: { padding: 20, paddingBottom: 40 },
  greeting: { fontSize: 22, fontWeight: '800', color: '#0D47A1' },
  roleTag: { marginTop: 4, fontSize: 12, color: '#78909C' },
  roleTagStrong: { fontWeight: '800', color: '#37474F', textTransform: 'capitalize' },
  intro: { marginTop: 14, marginBottom: 18, fontSize: 14, color: '#455A64', lineHeight: 20 },
  stepCard: { borderRadius: 12, padding: 14, borderLeftWidth: 4 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  stepTitle: { fontSize: 15, fontWeight: '800', flexShrink: 1 },
  bulletRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
  bulletDot: { fontSize: 14, fontWeight: '800', lineHeight: 20 },
  bulletText: { flex: 1, fontSize: 13, color: '#37474F', lineHeight: 19 },
  arrowCol: { alignItems: 'center', paddingVertical: 6 },
  sectionTitle: { marginTop: 26, marginBottom: 10, fontSize: 14, fontWeight: '800', color: '#0D47A1' },
  legend: { backgroundColor: '#FFF', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#ECEFF1' },
  legendRow: { flexDirection: 'row', gap: 8, paddingVertical: 4, alignItems: 'flex-start' },
  legendCode: { width: 140, fontSize: 11, fontWeight: '700', color: '#1565C0', fontFamily: 'monospace' },
  legendText: { flex: 1, fontSize: 12, color: '#455A64', lineHeight: 17 },
  footer: { marginTop: 20, fontSize: 11, color: '#90A4AE', textAlign: 'center', fontStyle: 'italic' },
  bottomBar: { padding: 14, borderTopWidth: 1, borderTopColor: '#ECEFF1', backgroundColor: '#FFF' },
  primary: { backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
