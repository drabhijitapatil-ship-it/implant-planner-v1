/**
 * Role-specific onboarding carousel. Shown once on first login (gated by the
 * backend `workflow_seen_at` timestamp). Simple index-based rendering so we
 * don't fight with FlatList + horizontal paging on web.
 *
 * Flow:  Onboarding slides  →  /help-workflow  →  /(tabs)/dashboard
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';

type Slide = { icon: keyof typeof Ionicons.glyphMap; title: string; body: string };

const SLIDES_BY_ROLE: Record<string, Slide[]> = {
  student: [
    { icon: 'calendar-outline',   title: 'Schedule a case', body: 'Add patient details, pick the implant system, and attach CBCT / OPG images.' },
    { icon: 'people-outline',     title: 'Get it approved', body: 'Your Supervisor approves first, then the Implant In-Charge gives the final green light.' },
    { icon: 'clipboard-outline',  title: 'Pre-surgery prep', body: 'Print the consent form, mark instruments autoclaved, and export the Drilling Protocol PDF.' },
    { icon: 'checkmark-done-circle-outline', title: 'Log all 4 phases', body: 'Surgical → Second-stage → Prosthetic → Delivery. Finish strong and archive the case.' },
  ],
  supervisor: [
    { icon: 'checkmark-circle-outline', title: 'Review & approve', body: 'You\'re the first approval gate for every student case you\'re assigned to.' },
    { icon: 'calendar-outline',         title: 'Schedule your own cases', body: 'Book and manage your own patient workflow — same 4-phase flow as students.' },
    { icon: 'hourglass-outline',        title: 'Track progress', body: 'A passive indicator on each case shows you who\'s blocking the next phase.' },
  ],
  implant_incharge: [
    { icon: 'shield-checkmark-outline', title: 'The final approval', body: 'After the Supervisor approves, you give the final green light for each phase.' },
    { icon: 'eye-outline',              title: 'See every case', body: 'Your dashboard shows every active case across all supervisors and students.' },
    { icon: 'calendar-outline',         title: 'Schedule your own', body: 'Your own scheduled cases self-approve — no extra gates.' },
    { icon: 'settings-outline',         title: 'Admin override', body: 'Edit any field, reassign staff, or archive stuck cases whenever needed.' },
  ],
  nurse: [
    { icon: 'today-outline',    title: 'Scheduled cases at a glance', body: 'Your calendar shows today\'s and the next 7 days\' surgeries.' },
    { icon: 'clipboard-outline', title: 'Pre-surgery prep', body: 'Upload signed consent forms and mark instruments autoclaved — your stamp prints on the Drilling Protocol.' },
    { icon: 'notifications-outline', title: '24 h surgery reminders', body: 'Get a push notification the day before each case if anything\'s still pending.' },
  ],
  administrator: [
    { icon: 'shield-checkmark-outline', title: 'Full access', body: 'You have In-Charge-level approval rights across all cases.' },
    { icon: 'eye-outline',              title: 'See every case', body: 'Nothing is hidden from you — across all supervisors, students, and nurses.' },
    { icon: 'settings-outline',         title: 'Override any field', body: 'Edit, reassign, or archive cases as needed.' },
  ],
};

export default function OnboardingScreen() {
  const { user, refreshUser, ackWorkflow } = useAuth();
  const [idx, setIdx] = useState(0);

  const slides = useMemo(() => {
    const role = (user?.role || 'student').toLowerCase();
    return SLIDES_BY_ROLE[role] || SLIDES_BY_ROLE.student;
  }, [user?.role]);

  const slide = slides[idx];
  const isLast = idx === slides.length - 1;

  const goNext = () => {
    if (!isLast) {
      setIdx((i) => i + 1);
    } else {
      // Forward to the workflow chart — it owns the ack so Skip-through still
      // gets both screens shown.
      router.replace('/help-workflow');
    }
  };

  const goBack = () => setIdx((i) => Math.max(0, i - 1));

  const skip = async () => {
    // Skip both onboarding AND workflow — ack immediately.
    try { await ackWorkflow(); } catch {}
    await refreshUser();
    router.replace('/(tabs)/dashboard');
  };

  return (
    <SafeAreaView style={styles.safe} testID="onboarding-screen">
      <View style={styles.topBar}>
        <Text style={styles.step}>{idx + 1} / {slides.length}</Text>
        <TouchableOpacity onPress={skip} testID="onboarding-skip-btn">
          <Text style={styles.skip}>Skip</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.slide} testID={`onboarding-slide-${idx}`}>
        <View style={styles.iconWrap}>
          <Ionicons name={slide.icon} size={72} color="#1565C0" />
        </View>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.body}>{slide.body}</Text>
      </View>

      <View style={styles.dots}>
        {slides.map((_, i) => (
          <View key={i} style={[styles.dot, i === idx && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.secondary, idx === 0 && styles.invisible]}
          disabled={idx === 0}
          onPress={goBack}
          testID="onboarding-back-btn"
        >
          <Ionicons name="chevron-back" size={18} color="#546E7A" />
          <Text style={styles.secondaryText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primary} onPress={goNext} testID="onboarding-next-btn">
          <Text style={styles.primaryText}>{isLast ? 'See the full workflow' : 'Next'}</Text>
          <Ionicons name="chevron-forward" size={18} color="#FFF" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FA' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  step: { fontSize: 13, color: '#78909C', fontWeight: '600' },
  skip: { fontSize: 14, color: '#1565C0', fontWeight: '700' },
  slide: { flex: 1, paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center' },
  iconWrap: {
    width: 132, height: 132, borderRadius: 66, backgroundColor: '#E3F2FD',
    alignItems: 'center', justifyContent: 'center', marginBottom: 36,
  },
  title: { fontSize: 24, fontWeight: '800', color: '#0D47A1', textAlign: 'center', marginBottom: 16 },
  body: { fontSize: 15, color: '#455A64', textAlign: 'center', lineHeight: 22, maxWidth: 420 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#CFD8DC' },
  dotActive: { backgroundColor: '#1565C0', width: 22 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
  secondary: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 12, paddingHorizontal: 18 },
  secondaryText: { fontSize: 14, color: '#546E7A', fontWeight: '600' },
  invisible: { opacity: 0 },
  primary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#1565C0', paddingVertical: 14, borderRadius: 12,
  },
  primaryText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
