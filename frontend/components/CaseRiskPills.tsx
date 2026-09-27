import React from 'react';
import { View, StyleSheet } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import RiskLabelPill from './RiskLabelPill';
import { computeEra, isAnteriorMaxillaCase, RiskLevel, RISK_COLORS } from '../utils/aestheticRisk';

// Medical Assessment risk (constants/checklist.ts) → pill colour + display text.
// Only medically-compromised patients (Moderate / High) surface a pill.
const MED_MAP: Record<string, { level: RiskLevel; text: string }> = {
  'Moderate Risk': { level: 'Medium', text: 'Moderate Risk' },
  'High Risk': { level: 'High', text: 'High Risk' },
};

const SEVERITY: Record<RiskLevel, number> = { Low: 0, Medium: 1, High: 2 };

/**
 * At-a-glance risk pills for a procedure — the maxillary-anterior Aesthetic
 * Risk grade (highest across all edentulous areas) and, when the patient is
 * medically compromised, the Medical Risk grade.
 *   • variant="card"   → compact pills for the My Cases list card
 *   • variant="banner" → prominent tinted banner for the case detail top
 * Renders nothing when neither risk applies.
 */
export default function CaseRiskPills({
  procedure, variant = 'card', prefix = 'case',
}: { procedure: any; variant?: 'card' | 'banner'; prefix?: string }) {
  const era = computeEra(procedure);
  const eraLevel: RiskLevel | null = isAnteriorMaxillaCase(procedure.missing_teeth) ? era.overall : null;
  const med = MED_MAP[String(procedure.medical_risk_level || '')] || null;
  if (!eraLevel && !med) return null;

  const compact = variant === 'card';
  const pills = (
    <View style={styles.row}>
      {eraLevel && (
        <RiskLabelPill label="Aesthetic Risk Assessment" level={eraLevel} compact={compact}
          testID={`${prefix}-aesthetic-risk-pill`} />
      )}
      {med && (
        <RiskLabelPill label="Medical Risk" level={med.level} riskText={med.text} compact={compact}
          testID={`${prefix}-medical-risk-pill`} />
      )}
    </View>
  );

  if (variant === 'banner') {
    const levels = [eraLevel, med?.level].filter(Boolean) as RiskLevel[];
    const worst = levels.sort((a, b) => SEVERITY[b] - SEVERITY[a])[0];
    const c = RISK_COLORS[worst];
    return (
      <View style={[styles.banner, { backgroundColor: c.bg, borderColor: c.border }]}
        testID={`${prefix}-risk-banner`} data-testid={`${prefix}-risk-banner`}>
        <Ionicons name="alert-circle" size={20} color={c.fg} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>{pills}</View>
      </View>
    );
  }
  return <View style={styles.cardWrap}>{pills}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cardWrap: { marginTop: 6, marginBottom: 4 },
  banner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    marginHorizontal: 16, marginTop: 12, padding: 12,
    borderRadius: 12, borderWidth: 1.5,
  },
});
