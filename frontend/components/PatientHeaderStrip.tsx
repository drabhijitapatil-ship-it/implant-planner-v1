/**
 * PatientHeaderStrip — compact, always-visible patient summary at the top of
 * the case screen (outside the phase accordions, so collapsing phases never
 * hides it). Mirrors the My Cases patient card: name, age/sex, registration
 * number, and the Aesthetic Risk / Medical Risk pills.
 *
 * Pills are shortcuts: tapping one calls back so the screen can open Phase 1
 * and scroll to the Esthetic Risk Assessment / Medical Assessment section.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import RiskLabelPill from './RiskLabelPill';
import { caseRiskLevels } from './CaseRiskPills';

type Props = {
  procedure: any;
  onAestheticPress?: () => void;
  onMedicalPress?: () => void;
};

export default function PatientHeaderStrip({ procedure, onAestheticPress, onMedicalPress }: Props) {
  if (!procedure) return null;
  const { eraLevel, med } = caseRiskLevels(procedure);
  const ageSex = [procedure.age, procedure.sex ? String(procedure.sex).charAt(0).toUpperCase() : '']
    .filter(Boolean)
    .join(' ');
  const meta = [ageSex, procedure.registration_number ? `Reg #${procedure.registration_number}` : '']
    .filter(Boolean)
    .join('  ·  ');

  return (
    <View style={st.strip} testID="patient-header-strip">
      <View style={st.row}>
        <View style={st.avatar}>
          <Ionicons name="person" size={16} color="#1565C0" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.name} numberOfLines={1} testID="patient-header-name">
            {procedure.patient_name || 'Patient'}
          </Text>
          {!!meta && <Text style={st.meta} numberOfLines={1}>{meta}</Text>}
        </View>
      </View>
      {(eraLevel || med) && (
        <View style={st.pills}>
          {eraLevel && (
            <TouchableOpacity
              onPress={onAestheticPress}
              disabled={!onAestheticPress}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Aesthetic risk ${eraLevel}. Open Esthetic Risk Assessment`}
              testID="patient-header-aesthetic-pill"
            >
              <RiskLabelPill label="Aesthetic Risk Assessment" level={eraLevel} compact />
            </TouchableOpacity>
          )}
          {med && (
            <TouchableOpacity
              onPress={onMedicalPress}
              disabled={!onMedicalPress}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Medical risk ${med.text}. Open Medical Assessment`}
              testID="patient-header-medical-pill"
            >
              <RiskLabelPill label="Medical Risk" level={med.level} riskText={med.text} compact />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  strip: {
    backgroundColor: '#FFF', marginHorizontal: 12, marginTop: 10, marginBottom: 4,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14,
    borderWidth: 1, borderColor: '#E2E8F0', borderLeftWidth: 4, borderLeftColor: '#1565C0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#E3F2FD', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  meta: { fontSize: 12, color: '#64748B', marginTop: 1 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
});
