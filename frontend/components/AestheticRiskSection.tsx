import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import RiskPill from './RiskPill';
import {
  ERA_FACTORS, ERA_SELECTABLE_FACTORS, EraFactor, EraValues, computeEra, eraValue, riskFor, RISK_COLORS,
} from '../utils/aestheticRisk';

interface Props {
  values: EraValues;
  anterior: boolean;                       // ≥1 of FDI 11–13 / 21–23 selected
  onChange: (key: string, value: string, topLevel: boolean) => void;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function FactorDropdown({ factor, value, onChange, required }: { factor: EraFactor; value: string; onChange: (v: string) => void; required: boolean }) {
  const [open, setOpen] = useState(false);
  const risk = riskFor(factor.key, value);
  const tid = `era-${slug(factor.key)}`;
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{factor.label}{required && <Text style={{ color: '#DC3545' }}> *</Text>}</Text>
        <RiskPill level={risk} testID={`${tid}-pill`} />
      </View>
      <TouchableOpacity style={styles.dropdown} onPress={() => setOpen(!open)} testID={tid} data-testid={tid}>
        <Text style={[styles.dropdownText, !value && { color: '#999' }]}>{value || `Select ${factor.label}`}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
      </TouchableOpacity>
      {open && (
        <ScrollView style={styles.list} nestedScrollEnabled>
          {factor.options.map(opt => {
            const c = RISK_COLORS[opt.risk];
            return (
              <TouchableOpacity key={opt.value} style={[styles.item, value === opt.value && styles.itemActive]}
                onPress={() => { onChange(opt.value); setOpen(false); }}
                testID={`${tid}-option-${slug(opt.value)}`} data-testid={`${tid}-option-${slug(opt.value)}`}>
                <Text style={[styles.itemText, value === opt.value && styles.itemTextActive]}>{opt.value}</Text>
                <View style={[styles.miniDot, { backgroundColor: c.fg }]} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

export default function AestheticRiskSection({ values, anterior, onChange }: Props) {
  const factors = anterior ? ERA_FACTORS : ERA_FACTORS.filter(f => f.topLevel);
  const summary = computeEra(values);
  const spanValue = eraValue(values, 'edentulous_span');
  const spanRisk = riskFor('edentulous_span', spanValue);

  return (
    <View testID="aesthetic-risk-section" data-testid="aesthetic-risk-section">
      <Text style={styles.title}>Aesthetic Risk Assessment</Text>
      {anterior && (
        <View style={styles.hint} testID="era-anterior-hint" data-testid="era-anterior-hint">
          <Ionicons name="sparkles" size={14} color="#AD1457" />
          <Text style={styles.hintText}>Anterior maxilla selected — complete all factors. Each factor is graded Low / Medium / High; the overall risk follows the highest grade.</Text>
        </View>
      )}
      {factors.map(f => {
        if (f.derived) {
          return (
            <View key={f.key} style={styles.field} testID="era-edentulous-span" data-testid="era-edentulous-span">
              <View style={styles.labelRow}>
                <Text style={styles.label}>{f.label}</Text>
                <RiskPill level={spanRisk} testID="era-edentulous-span-pill" />
              </View>
              <View style={[styles.dropdown, styles.readonly]}>
                <Text style={[styles.dropdownText, !spanValue && { color: '#999' }]}>{spanValue || 'Derived from the FDI chart'}</Text>
                <Ionicons name="lock-closed-outline" size={16} color="#90A4AE" />
              </View>
              <Text style={styles.derivedNote}>Auto-calculated from the missing teeth marked on the FDI chart.</Text>
            </View>
          );
        }
        return (
          <FactorDropdown key={f.key} factor={f} value={eraValue(values, f.key)} required={anterior}
            onChange={v => onChange(f.key, v, !!f.topLevel)} />
        );
      })}

      {anterior && (
        <View style={[styles.overall, summary.overall && { borderColor: RISK_COLORS[summary.overall].border, backgroundColor: RISK_COLORS[summary.overall].bg }]}
          testID="era-overall" data-testid="era-overall">
          <View style={{ flex: 1 }}>
            <Text style={styles.overallTitle}>Overall Aesthetic Risk</Text>
            <Text style={styles.overallMeta} testID="era-overall-meta" data-testid="era-overall-meta">
              {summary.assessed}/{summary.total} factors assessed · {summary.counts.High} high · {summary.counts.Medium} medium · {summary.counts.Low} low
            </Text>
          </View>
          {summary.overall
            ? <RiskPill level={summary.overall} large testID="era-overall-pill" />
            : <Text style={styles.pending}>Pending</Text>}
        </View>
      )}
      {anterior && ERA_SELECTABLE_FACTORS.some(f => !eraValue(values, f.key)) && (
        <Text style={styles.incomplete} testID="era-incomplete" data-testid="era-incomplete">
          Incomplete — {ERA_SELECTABLE_FACTORS.filter(f => !eraValue(values, f.key)).length} factor(s) still to grade.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 14, fontWeight: '700', color: '#1565C0', marginTop: 14, marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1.5, borderBottomColor: '#E3F2FD' },
  hint: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#FCE4EC', borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#F8BBD0' },
  hintText: { flex: 1, fontSize: 12, color: '#880E4F', lineHeight: 17 },
  field: { marginBottom: 14 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  label: { flex: 1, fontSize: 13, fontWeight: '600', color: '#1565C0', letterSpacing: 0.2 },
  dropdown: { borderWidth: 1.5, borderColor: '#D0DCE8', borderRadius: 10, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC' },
  readonly: { backgroundColor: '#F1F3F5', borderStyle: 'dashed' },
  dropdownText: { fontSize: 14, color: '#1A1A2E', flex: 1 },
  list: { maxHeight: 220, borderWidth: 1, borderColor: '#DDD', borderRadius: 10, marginTop: 4, backgroundColor: '#FFF' },
  item: { paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemActive: { backgroundColor: '#E3F2FD' },
  itemText: { fontSize: 14, color: '#333', flex: 1 },
  itemTextActive: { color: '#1A73E8', fontWeight: '600' },
  miniDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 8 },
  derivedNote: { fontSize: 11, color: '#78909C', marginTop: 4 },
  overall: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: '#D0DCE8', borderRadius: 14, padding: 14, marginTop: 4, backgroundColor: '#F8FAFC' },
  overallTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A2E' },
  overallMeta: { fontSize: 12, color: '#546E7A', marginTop: 3 },
  pending: { fontSize: 13, fontWeight: '600', color: '#90A4AE' },
  incomplete: { fontSize: 12, color: '#C62828', marginTop: 8, fontWeight: '600' },
});
