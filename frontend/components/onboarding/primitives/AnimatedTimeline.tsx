/**
 * Horizontal 5-node timeline animating in with a left→right stagger.
 * Used on slide 2 (4-phase lifecycle).
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withDelay, withTiming, withSequence,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

type Node = { icon: keyof typeof Ionicons.glyphMap; label: string; tint: string };

const NODES: Node[] = [
  { icon: 'people-outline',          label: 'Phase 1\nDiagnosis',     tint: '#1565C0' },
  { icon: 'medkit-outline',          label: 'Phase 2\nSurgery',       tint: '#2E7D32' },
  { icon: 'bandage-outline',         label: 'Phase 3\nHealing',       tint: '#EF6C00' },
  { icon: 'construct-outline',       label: 'Phase 4\nProsthesis',    tint: '#8E24AA' },
  { icon: 'ribbon-outline',          label: 'Done\nArchive',          tint: '#00838F' },
];

export default function AnimatedTimeline() {
  const lineProgress = useSharedValue(0);
  const nodeOps = NODES.map(() => useSharedValue(0));

  useEffect(() => {
    lineProgress.value = withDelay(150, withTiming(1, { duration: 700 }));
    NODES.forEach((_, i) => {
      nodeOps[i].value = withDelay(
        220 + i * 90,
        withSequence(
          withTiming(0, { duration: 0 }),
          withSpring(1, { damping: 12, stiffness: 140 }),
        ),
      );
    });
  }, []);

  const lineStyle = useAnimatedStyle(() => ({
    width: `${lineProgress.value * 100}%`,
  }));

  return (
    <View style={styles.wrap} testID="onboarding-timeline">
      <View style={styles.lineTrack}>
        <Animated.View style={[styles.lineFill, lineStyle]} />
      </View>
      <View style={styles.row}>
        {NODES.map((n, i) => {
          const animStyle = useAnimatedStyle(() => ({
            opacity: nodeOps[i].value,
            transform: [{ scale: 0.6 + nodeOps[i].value * 0.4 }],
          }));
          return (
            <Animated.View key={n.label} style={[styles.node, animStyle]}>
              <View style={[styles.iconCircle, { backgroundColor: `${n.tint}1A`, borderColor: n.tint }]}>
                <Ionicons name={n.icon} size={22} color={n.tint} />
              </View>
              <Text style={styles.label}>{n.label}</Text>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 540, alignSelf: 'center', paddingVertical: 18 },
  lineTrack: {
    position: 'absolute', top: 38, left: 32, right: 32, height: 2,
    backgroundColor: '#E0E6EB', borderRadius: 1,
  },
  lineFill: { height: 2, backgroundColor: '#1565C0', borderRadius: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  node: { alignItems: 'center', flex: 1 },
  iconCircle: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, marginBottom: 8,
    backgroundColor: '#FFF',
  },
  label: { fontSize: 11, color: '#37474F', textAlign: 'center', lineHeight: 14, fontWeight: '600' },
});
