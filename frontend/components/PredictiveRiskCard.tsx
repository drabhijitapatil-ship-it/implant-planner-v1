/**
 * iter-364 — Predictive Risk Card
 *
 * Small Phase-1 nudge card that fetches institutional historical survival
 * for cases matching the current profile (procedure_type + bone_type +
 * tooth region) and renders a gentle "Cases like yours had X% success"
 * message. Never surfaces individual case identifiers.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

type Props = {
  procedureType: string | undefined | null;
  boneType?: string | null;
  toothRegion?: 'anterior_max' | 'posterior_max' | 'anterior_mand' | 'posterior_mand' | null;
};

export default function PredictiveRiskCard({ procedureType, boneType, toothRegion }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!procedureType) { setData(null); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await api.post('/analytics/predictive-risk', {
          procedure_type: procedureType,
          bone_type: boneType || null,
          tooth_region: toothRegion || null,
        });
        if (!cancelled) setData(r.data);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [procedureType, boneType, toothRegion]);

  if (!procedureType) return null;
  if (loading) {
    return (
      <View style={s.card} testID="risk-card-loading">
        <ActivityIndicator size="small" color="#1565C0" />
      </View>
    );
  }
  if (!data) return null;

  const surv = data.combined_match?.survival ?? data.bone_match?.survival ?? data.region_match?.survival ?? data.base?.survival;
  const n = data.combined_match?.n || data.bone_match?.n || data.region_match?.n || data.base?.n || 0;
  const tone = surv === null || surv === undefined
    ? { bg: '#ECEFF1', border: '#CFD8DC', ic: '#546E7A', text: '#37474F' }
    : surv >= 92 ? { bg: '#E8F5E9', border: '#A5D6A7', ic: '#2E7D32', text: '#1B5E20' }
    : surv >= 80 ? { bg: '#FFF8E1', border: '#FFE082', ic: '#EF6C00', text: '#E65100' }
    : { bg: '#FFEBEE', border: '#F8C9C2', ic: '#C62828', text: '#B71C1C' };

  return (
    <View style={[s.card, { backgroundColor: tone.bg, borderColor: tone.border }]} testID="predictive-risk-card">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="analytics-outline" size={18} color={tone.ic} />
        <Text style={[s.title, { color: tone.text }]}>Historical Outcome Nudge</Text>
      </View>
      <Text style={[s.body, { color: tone.text }]} testID="predictive-risk-nudge">{data.nudge}</Text>
      {surv !== null && surv !== undefined && (
        <View style={s.chipRow}>
          {data.base?.survival !== null && data.base?.n > 0 && (
            <Chip label={`Base ${data.base.survival}% (n=${data.base.n})`} color={tone.ic} />
          )}
          {data.bone_match?.survival !== null && data.bone_match?.n > 0 && (
            <Chip label={`Same bone ${data.bone_match.survival}% (n=${data.bone_match.n})`} color={tone.ic} />
          )}
          {data.region_match?.survival !== null && data.region_match?.n > 0 && (
            <Chip label={`Same region ${data.region_match.survival}% (n=${data.region_match.n})`} color={tone.ic} />
          )}
        </View>
      )}
      {n < 5 && (
        <Text style={s.footnote}>
          Nudge is aggregated across the institution — no individual patients are exposed.
        </Text>
      )}
    </View>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <View style={[s.chip, { borderColor: color }]}>
      <Text style={[s.chipTxt, { color }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: 16, marginTop: 10, marginBottom: 4,
    padding: 12, borderRadius: 12, borderWidth: 1.5,
  },
  title: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  body: { fontSize: 12, marginTop: 6, lineHeight: 17, fontWeight: '500' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.6)' },
  chipTxt: { fontSize: 10, fontWeight: '700' },
  footnote: { fontSize: 10, color: '#78909C', marginTop: 8, fontStyle: 'italic' },
});
