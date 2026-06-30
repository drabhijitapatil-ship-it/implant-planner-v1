/**
 * Horizontal 5-node timeline. Pulsing double-chevrons fill the gap between
 * each pair of icons (Phase 1 → Phase 2 → … → Done) so the eye perceives
 * forward motion without any line cutting through the icons.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import PulsingDoubleArrow from './PulsingDoubleArrow';

type Node = { icon: keyof typeof Ionicons.glyphMap; label: string; tint: string };

const NODES: Node[] = [
  { icon: 'people-outline',    label: 'Phase 1\nDiagnosis',  tint: '#1565C0' },
  { icon: 'medkit-outline',    label: 'Phase 2\nSurgery',    tint: '#2E7D32' },
  { icon: 'bandage-outline',   label: 'Phase 3\nHealing',    tint: '#EF6C00' },
  { icon: 'construct-outline', label: 'Phase 4\nProsthesis', tint: '#8E24AA' },
  { icon: 'ribbon-outline',    label: 'Done\nArchive',       tint: '#00838F' },
];

export default function AnimatedTimeline() {
  const nodeOps = NODES.map(() => useSharedValue(0));

  useEffect(() => {
    NODES.forEach((_, i) => {
      nodeOps[i].value = withDelay(
        180 + i * 90,
        withSequence(
          withTiming(0, { duration: 0 }),
          withSpring(1, { damping: 12, stiffness: 140 }),
        ),
      );
    });
  }, []);

  return (
    <View style={styles.wrap} testID="onboarding-timeline">
      <View style={styles.row}>
        {NODES.map((n, i) => {
          const animStyle = useAnimatedStyle(() => ({
            opacity: nodeOps[i].value,
            transform: [{ scale: 0.6 + nodeOps[i].value * 0.4 }],
          }));
          return (
            <React.Fragment key={n.label}>
              <Animated.View style={[styles.node, animStyle]}>
                <View style={[styles.iconCircle, { backgroundColor: `${n.tint}1A`, borderColor: n.tint }]}>
                  <Ionicons name={n.icon} size={22} color={n.tint} />
                </View>
                <Text style={styles.label}>{n.label}</Text>
              </Animated.View>
              {i < NODES.length - 1 && (
                <PulsingDoubleArrow
                  color="#90A4AE"
                  size={14}
                  delayMs={500 + i * 180}
                  style={styles.arrowGap}
                />
              )}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 540, alignSelf: 'center', paddingVertical: 18 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 4,
  },
  node: { alignItems: 'center', width: 64 },
  iconCircle: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, marginBottom: 8, backgroundColor: '#FFF',
  },
  label: { fontSize: 11, color: '#37474F', textAlign: 'center', lineHeight: 14, fontWeight: '600' },
  arrowGap: {
    flex: 1,
    justifyContent: 'center',
    height: 52,            // match iconCircle height for clean vertical alignment
    paddingHorizontal: 2,
  },
});
