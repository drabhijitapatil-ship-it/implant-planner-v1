/**
 * PhaseHeader — the crisp "big title next to back arrow + subtitle" header
 * pattern used across Phase 1-4 submission screens. Single source of truth so
 * all four phases stay visually consistent and titles render in full without
 * truncation (wraps to a second line on narrow devices).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import BackButton from './BackButton';

export function PhaseHeader({
  title,
  subtitle,
  onBack,
  testID,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  testID?: string;
}) {
  return (
    <View style={styles.headerBar} testID={testID}>
      <BackButton onPress={onBack} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#FFF',
  },
  backBtn: { padding: 6 },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0D47A1',
    marginLeft: 12,
    lineHeight: 22,
  },
  subtitle: {
    fontSize: 13,
    color: '#1565C0',
    fontWeight: '700',
    marginLeft: 12,
    marginTop: 2,
    letterSpacing: 0.3,
  },
});
