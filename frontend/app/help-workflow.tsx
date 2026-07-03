/**
 * Help & Workflow screen. Shown after onboarding slides on first login, and
 * accessible anytime from Profile → "How it works". Renders a role-specific
 * vertical flowchart of the full case lifecycle.
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import {
  ONBOARDING_VERSION, activeGateFor,
} from '../components/onboarding/content/onboardingContent';
import ApprovalGateDiagram from '../components/onboarding/primitives/ApprovalGateDiagram';
import FeatureCard from '../components/onboarding/primitives/FeatureCard';

type Step = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  bullets: string[];
  tone: 'pre' | 'phase1' | 'phase2' | 'phase3' | 'phase4' | 'done' | 'reviewer';
};

const TONE_COLORS: Record<Step['tone'], { bg: string; stripe: string; fg: string }> = {
  pre:      { bg: '#F1F5F9', stripe: '#64748B', fg: '#0F172A' },
  phase1:   { bg: '#EFF6FF', stripe: '#3B82F6', fg: '#1E3A8A' },
  phase2:   { bg: '#ECFDF5', stripe: '#10B981', fg: '#064E3B' },
  phase3:   { bg: '#FFFBEB', stripe: '#F59E0B', fg: '#78350F' },
  phase4:   { bg: '#FAF5FF', stripe: '#A855F7', fg: '#581C87' },
  done:     { bg: '#ECFEFF', stripe: '#06B6D4', fg: '#083344' },
  reviewer: { bg: '#FEFCE8', stripe: '#EAB308', fg: '#713F12' },
};

const WORKFLOW: Record<string, { intro: string; steps: Step[] }> = {
  student: {
    intro: 'You own your cases end to end. Each phase needs two approvals before the next one unlocks.',
    steps: [
      { icon: 'calendar-outline',   tone: 'pre',    title: 'Schedule a case', bullets: ['Enter patient info, medical history, implant plan', 'Upload CBCT / OPG / clinical photos', 'Assign a Supervisor & Implant In-Charge'] },
      { icon: 'people-outline',     tone: 'phase1', title: 'Phase 1 — Diagnosis and Treatment Planning', bullets: ['Supervisor approves (1st gate)', 'Implant In-Charge approves (final gate)', 'Status → Phase 1 Approved'] },
      { icon: 'clipboard-outline',  tone: 'pre',    title: 'Pre-surgery prep', bullets: ['Print consent template → get patient signature → upload signed form', 'Nurse marks instruments autoclaved', 'Export Drilling Protocol PDF with QR to CBCT'] },
      { icon: 'medkit-outline',     tone: 'phase2', title: 'Phase 2 — Implant Surgery', bullets: ['Day-of checklist: torque values, cover-screw vs healing abutment', 'Intra-op OPG + surgical photos', 'Submit for approval'] },
      { icon: 'bandage-outline',    tone: 'phase3', title: 'Phase 3 — Healing and Second Stage Surgery', bullets: ['After healing period', 'Uncover implant, place healing abutment', 'Submit for approval'] },
      { icon: 'construct-outline',  tone: 'phase4', title: 'Phase 4 — Prosthetic Rehabilitation', bullets: ['Step 1 — Prosthetic Planning: impression + articulator mounting', 'Step 2 — Final Restoration: trial, occlusion, delivery', 'Submit for final approval'] },
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
  const isFirstRun = mode !== 'review';
  const [busy, setBusy] = useState(false);

  const content = useMemo(() => {
    const role = (user?.role || 'student').toLowerCase();
    return WORKFLOW[role] || WORKFLOW.student;
  }, [user?.role]);

  const gotIt = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await ackWorkflow(ONBOARDING_VERSION);
      await refreshUser();
    } catch {
      // Even if ack fails, don't trap the user — move on.
    }
    router.replace('/(tabs)/dashboard');
  };

  const replayOnboarding = () => router.push('/onboarding');

  const close = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe} testID="help-workflow-screen" edges={['top', 'bottom']}>
      {/* Header Row */}
      <View style={styles.header}>
        {!isFirstRun ? (
          <TouchableOpacity style={styles.backBtn} onPress={close} testID="workflow-close-btn">
            <Ionicons name="arrow-back" size={24} color="#0F172A" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
        <Text style={styles.headerTitle}>How it works</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.greeting} testID="workflow-greeting">
          {isFirstRun ? `Welcome, ${user?.name || ''}` : 'Your workflow'}
        </Text>
        
        {/* Role Tag Badge */}
        <View style={styles.roleTagContainer}>
          <Text style={styles.roleTagLabel}>ROLE</Text>
          <View style={styles.roleTagValueBadge}>
            <Text style={styles.roleTagStrong}>{(user?.role || '').replace('_', ' ')}</Text>
          </View>
        </View>

        <Text style={styles.intro}>{content.intro}</Text>

        {/* Steps flowchart */}
        {content.steps.map((step, i) => {
          const c = TONE_COLORS[step.tone];
          return (
            <View key={i}>
              <View style={[styles.stepCard, { backgroundColor: c.bg, borderLeftColor: c.stripe }]} testID={`workflow-step-${i}`}>
                <View style={styles.stepHeader}>
                  <Ionicons name={step.icon as any} size={20} color={c.stripe} />
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
                  <Ionicons name="chevron-down" size={18} color="#94A3B8" />
                </View>
              )}
            </View>
          );
        })}

        <Text style={styles.sectionTitle}>Status Legend</Text>
        <View style={styles.legend}>
          {LEGEND_STATUSES.map((l) => (
            <View key={l.code} style={styles.legendRow}>
              <View style={styles.legendCodeBadge}>
                <Text style={styles.legendCode}>{l.code}</Text>
              </View>
              <Text style={styles.legendText}>{l.label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Approval Gates at a Glance</Text>
        <View style={styles.gatesCard} testID="help-approval-gates">
          <ApprovalGateDiagram active={activeGateFor(user?.role || '')} />
          <Text style={styles.gatesNote}>
            {(user?.role || '').toLowerCase() === 'nurse'
              ? 'Your prep work (consent uploads, autoclave stamps) happens before Phase 2 — you do not vote at any approval gate.'
              : 'A phase only unlocks after both the Supervisor and the Implant In-Charge approve.'}
          </Text>
        </View>

        {(user?.role || '').toLowerCase() !== 'nurse' && (
          <>
            <Text style={styles.sectionTitle}>Smart Tools You'll Use Every Day</Text>
            <View style={styles.toolsGrid} testID="help-smart-tools">
              <View style={styles.toolsRow}>
                <FeatureCard
                  icon="cube-outline" tint="#1D4ED8"
                  title="Implant Database"
                  bullets={['30+ implant systems', 'Component comparison', 'Manufacturer datasheets attached']}
                />
                <FeatureCard
                  icon="bulb-outline" tint="#059669"
                  title="Smart Selection"
                  bullets={['Suggest Me & Let Me Choose', 'Bone-width / height safety chips', 'Bridge & cantilever auto-detect']}
                />
              </View>
              <View style={styles.toolsRow}>
                <FeatureCard
                  icon="document-text-outline" tint="#D97706"
                  title="Drilling Protocol PDF"
                  bullets={['Auto-generated per case', 'Embedded CBCT QR for chair-side', 'Nurse autoclave stamps']}
                />
                <FeatureCard
                  icon="sparkles-outline" tint="#0369A1"
                  title="Implanr AI"
                  bullets={['Phase summaries on demand', '"Ask Implanr" assistant', 'Explain Recommendation context']}
                />
              </View>
              <View style={styles.toolsRow}>
                <FeatureCard
                  icon="chatbubbles-outline" tint="#7C3AED"
                  title="Discussion Forum"
                  bullets={['Anonymised case posts', 'Threaded peer replies', 'Bookmarkable threads']}
                />
                <FeatureCard
                  icon="people-circle-outline" tint="#0891B2"
                  title="Group Chat"
                  bullets={['Direct & group conversations', 'Share images, PDFs, case links', 'Read receipts']}
                />
              </View>
              <View style={styles.toolsRow}>
                <FeatureCard
                  icon="shield-checkmark-outline" tint="#475569"
                  title="HIPAA Safeguards"
                  bullets={['15-min auto-logout on inactivity', 'Screen-capture blocking on Android', 'Append-only audit log']}
                />
                <View style={{ flex: 1 }} />
              </View>
            </View>
          </>
        )}

        <TouchableOpacity onPress={replayOnboarding} style={styles.replayBtn} testID="help-replay-onboarding">
          <Ionicons name="play-circle-outline" size={18} color="#0B1930" />
          <Text style={styles.replayText}>Replay the welcome tour</Text>
        </TouchableOpacity>

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
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: { 
    padding: 4,
  },
  headerTitle: { 
    fontSize: 18, 
    fontWeight: '700', 
    color: '#0F172A',
  },
  scroll: { padding: 16, paddingBottom: 32 },
  greeting: { 
    fontSize: 22, 
    fontWeight: '700', 
    color: '#0F172A',
  },
  roleTagContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  roleTagLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  roleTagValueBadge: {
    backgroundColor: '#EFF6FF',
    borderColor: '#DBEAFE',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  roleTagStrong: { 
    fontWeight: '600', 
    color: '#1E3A8A', 
    textTransform: 'uppercase',
    fontSize: 11,
  },
  intro: { 
    marginTop: 14, 
    marginBottom: 20, 
    fontSize: 14, 
    color: '#475569', 
    lineHeight: 21,
  },
  stepCard: { 
    borderRadius: 16, 
    padding: 16, 
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  stepHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8, 
    marginBottom: 8,
  },
  stepTitle: { 
    fontSize: 15, 
    fontWeight: '700', 
    flexShrink: 1,
  },
  bulletRow: { 
    flexDirection: 'row', 
    gap: 6, 
    marginTop: 4,
  },
  bulletDot: { 
    fontSize: 14, 
    fontWeight: '700', 
    lineHeight: 20,
  },
  bulletText: { 
    flex: 1, 
    fontSize: 13, 
    color: '#334155', 
    lineHeight: 19,
  },
  arrowCol: { 
    alignItems: 'center', 
    paddingVertical: 8,
  },
  sectionTitle: { 
    marginTop: 28, 
    marginBottom: 12, 
    fontSize: 13, 
    fontWeight: '700', 
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  legend: { 
    backgroundColor: '#FFF', 
    borderRadius: 16, 
    padding: 16, 
    borderWidth: 1, 
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
    gap: 6,
  },
  legendRow: { 
    flexDirection: 'row', 
    gap: 12, 
    paddingVertical: 6, 
    alignItems: 'center',
  },
  legendCodeBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  legendCode: { 
    fontSize: 11, 
    fontWeight: '600', 
    color: '#334155', 
    fontFamily: 'monospace',
  },
  legendText: { 
    flex: 1, 
    fontSize: 13, 
    color: '#475569', 
    lineHeight: 18,
  },
  footer: { 
    marginTop: 24, 
    fontSize: 12, 
    color: '#94A3B8', 
    textAlign: 'center', 
    fontStyle: 'italic',
    paddingHorizontal: 24,
  },
  bottomBar: { 
    padding: 16, 
    borderTopWidth: 1, 
    borderTopColor: '#E2E8F0', 
    backgroundColor: '#FFF' 
  },
  primary: { 
    backgroundColor: '#0B1930', 
    borderRadius: 12, 
    paddingVertical: 14, 
    alignItems: 'center' 
  },
  primaryText: { 
    color: '#FFF', 
    fontSize: 15, 
    fontWeight: '600' 
  },
  gatesCard: {
    backgroundColor: '#FFF', 
    borderRadius: 16, 
    padding: 16,
    borderWidth: 1, 
    borderColor: '#E2E8F0', 
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  gatesNote: {
    fontSize: 12, 
    color: '#64748B', 
    textAlign: 'center', 
    marginTop: 10,
    lineHeight: 18, 
    maxWidth: 360,
  },
  toolsGrid: { gap: 10 },
  toolsRow: { flexDirection: 'row', gap: 10 },
  replayBtn: {
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 8,
    paddingVertical: 14, 
    marginTop: 20,
    backgroundColor: '#FFF', 
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  replayText: { 
    color: '#0B1930', 
    fontSize: 14, 
    fontWeight: '600' 
  },
});
