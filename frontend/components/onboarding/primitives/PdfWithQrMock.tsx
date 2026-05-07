/**
 * Minimal mock-up of a Drilling Protocol PDF page with an animated QR badge
 * that "stamps" onto the corner. Used on slide 5.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withDelay, withSequence, withTiming, withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

export default function PdfWithQrMock() {
  const qrScale = useSharedValue(1.6);
  const qrOpacity = useSharedValue(0);

  useEffect(() => {
    qrOpacity.value = withDelay(450, withTiming(1, { duration: 220 }));
    qrScale.value = withDelay(
      450,
      withSequence(
        withTiming(0.95, { duration: 350 }),
        withSpring(1, { damping: 14, stiffness: 200 }),
      ),
    );
  }, []);

  const qrStyle = useAnimatedStyle(() => ({
    opacity: qrOpacity.value,
    transform: [{ scale: qrScale.value }],
  }));

  return (
    <View style={styles.wrap} testID="pdf-with-qr-mock">
      <View style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.h1}>Drilling Protocol</Text>
            <Text style={styles.h2}>Patient: J. Doe · Tooth #36</Text>
          </View>
          <Ionicons name="document-text" size={22} color="#1565C0" />
        </View>
        <View style={styles.divider} />
        <Row label="Implant System" value="Bredent SKY 4.0 × 11.5" />
        <Row label="Drill Sequence" value="2.0 → 2.8 → 3.3 → 3.8" />
        <Row label="Torque" value="35 N·cm" />
        <Row label="Autoclaved by" value="Nurse Priya · 06:42" />
        <View style={styles.divider} />
        <View style={styles.line} />
        <View style={[styles.line, { width: '70%' }]} />
        <View style={[styles.line, { width: '85%' }]} />

        <Animated.View style={[styles.qrBadge, qrStyle]}>
          <View style={styles.qrInner}>
            {[...Array(5)].map((_, r) => (
              <View key={r} style={styles.qrRow}>
                {[...Array(5)].map((_, c) => (
                  <View
                    key={c}
                    style={[
                      styles.qrCell,
                      (r + c) % 3 === 0 && styles.qrCellOn,
                    ]}
                  />
                ))}
              </View>
            ))}
          </View>
          <Text style={styles.qrLabel}>Scan for CBCT</Text>
        </Animated.View>
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 4 },
  page: {
    width: '100%', maxWidth: 360,
    backgroundColor: '#FFF', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#E0E6EB',
    boxShadow: '0px 12px 24px rgba(13, 71, 161, 0.10)',
    minHeight: 240,
  } as any,
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  h1: { fontSize: 14, fontWeight: '800', color: '#0D47A1' },
  h2: { fontSize: 11, color: '#78909C', marginTop: 1 },
  divider: { height: 1, backgroundColor: '#ECEFF1', marginVertical: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  rowLabel: { fontSize: 11, color: '#546E7A' },
  rowValue: { fontSize: 11, color: '#263238', fontWeight: '600' },
  line: { height: 4, backgroundColor: '#ECEFF1', borderRadius: 2, marginTop: 6 },
  qrBadge: {
    position: 'absolute', right: 12, bottom: 12,
    backgroundColor: '#FFF', borderRadius: 10, padding: 6,
    borderWidth: 2, borderColor: '#0D47A1',
    alignItems: 'center',
  },
  qrInner: { gap: 2 },
  qrRow: { flexDirection: 'row', gap: 2 },
  qrCell: { width: 6, height: 6, backgroundColor: '#FFF' },
  qrCellOn: { backgroundColor: '#0D47A1' },
  qrLabel: { fontSize: 8, color: '#0D47A1', fontWeight: '800', marginTop: 4 },
});
