/**
 * Subtle, slowly-pulsing double-chevron used as a visual connector between
 * timeline nodes (Slide 2) and approval-gate tiles (Slide 3). Two chevrons
 * stagger their pulse so the eye perceives forward motion without any flashy
 * scrolling animation. Respects reduce-motion (kept at full opacity then).
 */
import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withDelay,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

export default function PulsingDoubleArrow({
  color = '#90A4AE',
  size = 16,
  style,
  delayMs = 0,
  testID,
}: {
  color?: string;
  size?: number;
  style?: ViewStyle;
  delayMs?: number;
  testID?: string;
}) {
  const a = useSharedValue(0.25);
  const b = useSharedValue(0.25);

  useEffect(() => {
    a.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(0.95, { duration: 700 }),
          withTiming(0.25, { duration: 700 }),
        ),
        -1,
        false,
      ),
    );
    b.value = withDelay(
      delayMs + 220,
      withRepeat(
        withSequence(
          withTiming(0.95, { duration: 700 }),
          withTiming(0.25, { duration: 700 }),
        ),
        -1,
        false,
      ),
    );
  }, [delayMs]);

  const aStyle = useAnimatedStyle(() => ({ opacity: a.value }));
  const bStyle = useAnimatedStyle(() => ({ opacity: b.value }));

  return (
    <View style={[styles.row, style]} testID={testID}>
      <Animated.View style={aStyle}>
        <Ionicons name="chevron-forward" size={size} color={color} />
      </Animated.View>
      <Animated.View style={[bStyle, styles.second]}>
        <Ionicons name="chevron-forward" size={size} color={color} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  second: { marginLeft: -6 },
});
