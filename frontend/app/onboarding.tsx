/**
 * First-login onboarding carousel (v2). Six elegant slides — role-aware Welcome
 * and Recap, universal Phases / Approval / Smart Tools / Forum-Chat in between.
 * Re-fires for existing users when ONBOARDING_VERSION bumps.
 *
 * Flow:  /onboarding  →  /help-workflow  →  /(tabs)/dashboard
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, AccessibilityInfo,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, withSequence,
} from 'react-native-reanimated';
import { useAuth } from '../contexts/AuthContext';
import {
  ONBOARDING_VERSION, heroFor, recapFor, activeGateFor, phaseFooterFor,
} from '../components/onboarding/content/onboardingContent';
import AnimatedTimeline from '../components/onboarding/primitives/AnimatedTimeline';
import ApprovalGateDiagram from '../components/onboarding/primitives/ApprovalGateDiagram';
import FeatureCard from '../components/onboarding/primitives/FeatureCard';
import PdfWithQrMock from '../components/onboarding/primitives/PdfWithQrMock';
import TypingBubble from '../components/onboarding/primitives/TypingBubble';

const SLIDES = 6;

export default function OnboardingScreen() {
  const { user, refreshUser, ackWorkflow } = useAuth();
  const [idx, setIdx] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  const role = (user?.role || 'student').toLowerCase();
  const firstName = useMemo(() => (user?.name || '').split(' ')[0] || '', [user?.name]);
  const hero = heroFor(role);
  const recap = recapFor(role);
  const activeGate = activeGateFor(role);

  const isLast = idx === SLIDES - 1;
  const goNext = () => (isLast ? router.replace('/help-workflow') : setIdx(i => i + 1));
  const goBack = () => setIdx(i => Math.max(0, i - 1));
  const skip = async () => {
    try { await ackWorkflow(ONBOARDING_VERSION); } catch {}
    await refreshUser();
    router.replace('/(tabs)/dashboard');
  };

  return (
    <SafeAreaView style={styles.safe} testID="onboarding-screen">
      <View style={styles.topBar}>
        <Text style={styles.step}>{idx + 1} / {SLIDES}</Text>
        <TouchableOpacity onPress={skip} testID="onboarding-skip-btn">
          <Text style={styles.skip}>Skip</Text>
        </TouchableOpacity>
      </View>

      <SlideContainer key={idx} reduceMotion={reduceMotion} testID={`onboarding-slide-${idx}`}>
        {idx === 0 && <SlideWelcome firstName={firstName} hero={hero} />}
        {idx === 1 && <SlidePhases footer={phaseFooterFor(role)} />}
        {idx === 2 && <SlideApproval activeGate={activeGate} />}
        {idx === 3 && <SlideDatabase />}
        {idx === 4 && <SlideAIAndPDF />}
        {idx === 5 && <SlideForumChatRecap recap={recap} chipLabel={hero.chipLabel} />}
      </SlideContainer>

      <View style={styles.dots}>
        {Array.from({ length: SLIDES }).map((_, i) => (
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

/** Cross-fade + scale-up shell for each slide. Skip animations under reduce-motion. */
function SlideContainer({
  children, reduceMotion, testID,
}: { children: React.ReactNode; reduceMotion: boolean; testID: string }) {
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const scale = useSharedValue(reduceMotion ? 1 : 0.97);
  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: 260 }));
    scale.value = withSequence(withTiming(0.97, { duration: 0 }), withDelay(40, withTiming(1, { duration: 280 })));
  }, [reduceMotion]);
  const a = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[styles.slide, a]} testID={testID}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </Animated.View>
  );
}

// ── Slide 1 — Welcome ────────────────────────────────────────────────────────
function SlideWelcome({ firstName, hero }: { firstName: string; hero: ReturnType<typeof heroFor> }) {
  return (
    <View style={styles.welcomeWrap}>
      <View style={styles.heroLogo}>
        <Ionicons name="medkit" size={56} color="#FFF" />
      </View>
      <View style={styles.roleChip}>
        <Ionicons name="ribbon" size={11} color="#0D47A1" />
        <Text style={styles.roleChipText}>{hero.chipLabel}</Text>
      </View>
      <Text style={styles.welcomeH1}>
        {hero.greeting}{firstName ? `, ${firstName}` : ''}.
      </Text>
      <Text style={styles.welcomeBody}>{hero.subhead}</Text>
      <Text style={styles.welcomeHint}>Six quick slides walk you through what you can do here.</Text>
    </View>
  );
}

// ── Slide 2 — Phases timeline ────────────────────────────────────────────────
function SlidePhases({ footer }: { footer: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.h1}>The 4-phase case lifecycle</Text>
      <Text style={styles.body}>Every implant case follows the same path.</Text>
      <AnimatedTimeline />
      <View style={styles.footerNote}>
        <Ionicons name="person-circle-outline" size={14} color="#1565C0" />
        <Text style={styles.footerNoteText}>{footer}</Text>
      </View>
    </View>
  );
}

// ── Slide 3 — Approval system ────────────────────────────────────────────────
function SlideApproval({ activeGate }: { activeGate: 'student' | 'supervisor' | 'incharge' }) {
  return (
    <View style={styles.center}>
      <Text style={styles.h1}>Two approvals at every gate</Text>
      <Text style={styles.body}>
        A phase only unlocks after both the Supervisor and the Implant In-Charge approve.
      </Text>
      <ApprovalGateDiagram active={activeGate} />
      <View style={styles.subList}>
        <SubItem icon="time-outline" text="Status indicator on every case shows who's blocking." />
        <SubItem icon="document-text-outline" text="Reviewers can leave comments on rejection." />
      </View>
    </View>
  );
}

// ── Slide 4 — Implant Database + Smart Selection ─────────────────────────────
function SlideDatabase() {
  return (
    <View style={styles.center}>
      <Text style={styles.h1}>Implant Database & Smart Selection</Text>
      <Text style={styles.body}>30+ systems with components, datasheets, and clinical guidance.</Text>
      <View style={styles.twoCol}>
        <FeatureCard
          icon="cube-outline"
          title="Implant Database"
          tint="#1565C0"
          testID="slide-feature-database"
          bullets={[
            '30+ implant systems indexed',
            'Side-by-side component comparison',
            'Manufacturer datasheets attached as PDFs',
            'AI extracts text from datasheets for context',
          ]}
        />
        <FeatureCard
          icon="bulb-outline"
          title="Smart Selection"
          tint="#2E7D32"
          testID="slide-feature-selection"
          bullets={[
            '"Suggest Me" recommends a system from your case',
            '"Let Me Choose" with biological-safety chips',
            'Automatic bridge / cantilever detection',
            'Bone width and height safety validation',
          ]}
        />
      </View>
    </View>
  );
}

// ── Slide 5 — Drilling Protocol PDF + AI summaries ───────────────────────────
function SlideAIAndPDF() {
  return (
    <View style={styles.center}>
      <Text style={styles.h1}>Drilling Protocol PDF & Implanr AI</Text>
      <Text style={styles.body}>
        Drilling Protocol PDF includes embedded CBCT QR for chair-side reference. Implanr AI
        summarises any phase and answers questions in clinical language.
      </Text>
      <PdfWithQrMock />
      <View style={{ marginTop: 18, width: '100%' }}>
        <TypingBubble />
      </View>
    </View>
  );
}

// ── Slide 6 — Forum + Chat + role-specific recap ─────────────────────────────
function SlideForumChatRecap({ recap, chipLabel }: { recap: string[]; chipLabel: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.h1}>Stay connected — Forum & Chat</Text>
      <Text style={styles.body}>
        Discuss complex cases anonymously with peers; coordinate the surgical team in real time.
      </Text>
      <View style={styles.twoCol}>
        <FeatureCard
          icon="chatbubbles-outline"
          title="Discussion Forum"
          tint="#8E24AA"
          bullets={[
            'Post anonymised cases for peer input',
            'Threaded replies and case-specific tags',
            'Bookmark posts to revisit later',
          ]}
        />
        <FeatureCard
          icon="people-circle-outline"
          title="Group Chat"
          tint="#00838F"
          bullets={[
            'Direct chats and group conversations',
            'Share images, PDFs, and case links',
            'Read receipts and typing indicators',
          ]}
        />
      </View>
      <View style={styles.recapWrap}>
        <View style={[styles.roleChip, { marginBottom: 8 }]}>
          <Ionicons name="ribbon" size={11} color="#0D47A1" />
          <Text style={styles.roleChipText}>Your routine, {chipLabel}</Text>
        </View>
        {recap.map((line, i) => <RecapItem key={i} text={line} />)}
      </View>
    </View>
  );
}

function SubItem({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.subItem}>
      <Ionicons name={icon} size={14} color="#546E7A" />
      <Text style={styles.subItemText}>{text}</Text>
    </View>
  );
}

function RecapItem({ text }: { text: string }) {
  const opacity = useSharedValue(0);
  const tx = useSharedValue(8);
  useEffect(() => {
    opacity.value = withDelay(150, withTiming(1, { duration: 260 }));
    tx.value = withDelay(150, withTiming(0, { duration: 260 }));
  }, []);
  const a = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: tx.value }] }));
  return (
    <Animated.View style={[styles.recapRow, a]}>
      <Ionicons name="checkmark-circle" size={16} color="#2E7D32" />
      <Text style={styles.recapText}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FA' },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  step: { fontSize: 13, color: '#78909C', fontWeight: '700' },
  skip: { fontSize: 14, color: '#1565C0', fontWeight: '700' },
  slide: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingBottom: 16, alignItems: 'center', flexGrow: 1, justifyContent: 'center' },
  center: { width: '100%', maxWidth: 600, alignItems: 'center' },

  // Welcome
  welcomeWrap: { alignItems: 'center', paddingTop: 14 },
  heroLogo: {
    width: 110, height: 110, borderRadius: 28,
    backgroundColor: '#0D47A1',
    alignItems: 'center', justifyContent: 'center',
    boxShadow: '0px 18px 36px rgba(13, 71, 161, 0.30)',
    marginBottom: 22,
  } as any,
  roleChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 5, paddingHorizontal: 12,
    backgroundColor: '#E3F2FD', borderRadius: 999,
    marginBottom: 18,
  },
  roleChipText: { fontSize: 11, fontWeight: '800', color: '#0D47A1', letterSpacing: 0.4 },
  welcomeH1: { fontSize: 28, fontWeight: '800', color: '#0D47A1', letterSpacing: -0.4, marginBottom: 12, textAlign: 'center' },
  welcomeBody: { fontSize: 15, color: '#37474F', lineHeight: 22, textAlign: 'center', maxWidth: 460, marginBottom: 14 },
  welcomeHint: { fontSize: 12, color: '#78909C', textAlign: 'center' },

  // Generic
  h1: { fontSize: 22, fontWeight: '800', color: '#0D47A1', marginTop: 6, textAlign: 'center', letterSpacing: -0.3 },
  body: { fontSize: 14, color: '#455A64', lineHeight: 20, textAlign: 'center', marginTop: 8, marginBottom: 18, maxWidth: 480 },

  footerNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#E3F2FD', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 999, marginTop: 18, maxWidth: '100%',
  },
  footerNoteText: { fontSize: 12, color: '#0D47A1', fontWeight: '600' },

  subList: { width: '100%', maxWidth: 480, marginTop: 14, gap: 8 },
  subItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  subItemText: { fontSize: 13, color: '#455A64', flex: 1 },

  twoCol: { flexDirection: 'row', gap: 12, width: '100%', maxWidth: 540, marginTop: 6 },

  recapWrap: {
    width: '100%', maxWidth: 480, marginTop: 22,
    backgroundColor: '#FFF', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#ECEFF1',
  },
  recapRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  recapText: { fontSize: 13, color: '#263238', flex: 1, lineHeight: 18 },

  // Footer
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 14 },
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
