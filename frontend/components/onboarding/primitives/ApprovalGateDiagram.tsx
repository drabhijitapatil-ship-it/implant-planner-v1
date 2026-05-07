/**
 * Three role tiles connected by directional arrows. The active tile (the user's
 * own role) gets a soft pulsing glow ring. Used on slide 3 and reused inside
 * the refreshed help-workflow screen.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withDelay, withTiming, withRepeat, withSequence,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

type Active = 'student' | 'supervisor' | 'incharge';

const TILES: { key: Active; icon: keyof typeof Ionicons.glyphMap; label: string; tint: string }[] = [
  { key: 'student',    icon: 'person-outline',           label: 'Student',          tint: '#1565C0' },
  { key: 'supervisor', icon: 'people-outline',           label: 'Supervisor',       tint: '#EF6C00' },
  { key: 'incharge',   icon: 'shield-checkmark-outline', label: 'Implant\nIn-Charge', tint: '#2E7D32' },
];

export default function ApprovalGateDiagram({ active }: { active: Active }) {
  const arrow1 = useSharedValue(0);
  const arrow2 = useSharedValue(0);
  const glow = useSharedValue(0);

  useEffect(() => {
    arrow1.value = withDelay(200, withTiming(1, { duration: 350 }));
    arrow2.value = withDelay(550, withTiming(1, { duration: 350 }));
    glow.value = withDelay(
      900,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 900 }),
          withTiming(0.4, { duration: 900 }),
        ),
        -1,
        true,
      ),
    );
  }, []);

  const a1Style = useAnimatedStyle(() => ({ opacity: arrow1.value, transform: [{ scaleX: arrow1.value }] }));
  const a2Style = useAnimatedStyle(() => ({ opacity: arrow2.value, transform: [{ scaleX: arrow2.value }] }));

  return (
    <View style={styles.wrap} testID="approval-gate-diagram">
      <View style={styles.row}>
        {TILES.map((t, i) => {
          const isActive = t.key === active;
          const ringStyle = useAnimatedStyle(() => ({
            opacity: isActive ? 0.35 + glow.value * 0.5 : 0,
            transform: [{ scale: 1 + glow.value * 0.08 }],
          }));
          return (
            <View key={t.key} style={styles.tileCol}>
              <View style={styles.tileWrap}>
                <Animated.View style={[styles.glowRing, { borderColor: t.tint }, ringStyle]} />
                <View style={[styles.tile, { borderColor: t.tint }]}>
                  <Ionicons name={t.icon} size={28} color={t.tint} />
                </View>
              </View>
              <Text style={[styles.tileLabel, isActive && { color: t.tint, fontWeight: '800' }]}>{t.label}</Text>
              {isActive && <Text style={styles.youAre}>That's you</Text>}
              {i < TILES.length - 1 && (
                <Animated.View
                  style={[
                    styles.arrow,
                    i === 0 ? a1Style : a2Style,
                    i === 0 ? styles.arrow1pos : styles.arrow2pos,
                  ]}
                />
              )}
            </View>
          );
        })}
      </View>
      <View style={styles.checkLine}>
        <Ionicons name="checkmark-circle" size={18} color="#2E7D32" />
        <Text style={styles.checkText}>Phase approved</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 24, alignItems: 'center', width: '100%' },
  row: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', maxWidth: 480 },
  tileCol: { flex: 1, alignItems: 'center', position: 'relative' },
  tileWrap: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  tile: {
    width: 64, height: 64, borderRadius: 18, borderWidth: 2, backgroundColor: '#FFF',
    alignItems: 'center', justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute', width: 76, height: 76, borderRadius: 22, borderWidth: 3,
  },
  tileLabel: { marginTop: 10, fontSize: 12, color: '#455A64', textAlign: 'center', lineHeight: 15, fontWeight: '600' },
  youAre: { marginTop: 2, fontSize: 10, color: '#1565C0', fontWeight: '700' },
  arrow: {
    position: 'absolute',
    top: 30,
    height: 2,
    backgroundColor: '#90A4AE',
  },
  arrow1pos: { right: -38, width: 76, transformOrigin: 'left center' as any },
  arrow2pos: { right: -38, width: 76, transformOrigin: 'left center' as any },
  checkLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 22 },
  checkText: { fontSize: 13, color: '#1B5E20', fontWeight: '700' },
});
