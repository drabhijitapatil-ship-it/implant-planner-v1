import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import api from '../utils/api';

type Props = {
  arch: 'maxilla' | 'mandible';
  anterior_height: string;
  posterior_height: string;
  anterior_width: string;
  posterior_width: string;
};

type ClassResult = {
  ok: boolean;
  class?: string;
  severity_label?: string;
  treatment_options?: Array<{ label: string; implant_count: number; kind: string; placement: string; tilt?: string; augmentation?: string }>;
  loading_recommendation?: string;
  augmentation_note?: string;
  error?: string;
};

const COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  CCI:   { bg: '#E8F5E9', fg: '#1B5E20', border: '#43A047' },
  CCII:  { bg: '#E3F2FD', fg: '#0D47A1', border: '#1E88E5' },
  CCIII: { bg: '#FFF8E1', fg: '#E65100', border: '#FB8C00' },
  CCIV:  { bg: '#FFEBEE', fg: '#B71C1C', border: '#E53935' },
  CCV:   { bg: '#FCE4EC', fg: '#880E4F', border: '#C2185B' },
};

export const AtrophyClassificationChip: React.FC<Props> = (p) => {
  const [result, setResult] = useState<ClassResult | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<any>(null);

  const ah = parseFloat(p.anterior_height);
  const ph = parseFloat(p.posterior_height);
  const aw = p.anterior_width ? parseFloat(p.anterior_width) : null;
  const pw = p.posterior_width ? parseFloat(p.posterior_width) : null;
  const ready = Number.isFinite(ah) && Number.isFinite(ph);

  useEffect(() => {
    if (!ready) { setResult(null); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.post('/full-arch-classify', {
          arch: p.arch,
          anterior_height: ah,
          posterior_height: ph,
          anterior_width: aw,
          posterior_width: pw,
        });
        setResult(res.data);
      } catch {
        setResult({ ok: false, error: 'classify failed' });
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [p.arch, p.anterior_height, p.posterior_height, p.anterior_width, p.posterior_width]);

  if (!ready) return null;
  if (loading) return (
    <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <ActivityIndicator size="small" color="#1565C0" />
      <Text style={{ fontSize: 12, color: '#5C6BC0' }}>Classifying…</Text>
    </View>
  );
  if (!result?.ok || !result.class) return null;

  const palette = COLORS[result.class] || COLORS.CCI;

  return (
    <View style={{ marginTop: 12 }} testID={`atrophy-result-${p.arch}`}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <View style={{ backgroundColor: palette.bg, borderColor: palette.border, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: palette.fg }}>{result.severity_label}</Text>
        </View>
      </View>
      {result.treatment_options && result.treatment_options.length > 0 && (
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 8, padding: 10, borderLeftWidth: 3, borderLeftColor: palette.border }}>
          {result.treatment_options.map((opt, i) => (
            <View key={i} style={{ marginBottom: i === result.treatment_options!.length - 1 ? 0 : 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: palette.fg }}>
                Treatment Option {i + 1}: {opt.implant_count} implants ({opt.kind})
              </Text>
              <Text style={{ fontSize: 11, color: '#37474F', marginTop: 2 }}>{opt.placement}</Text>
              {opt.tilt && opt.tilt !== '—' && (
                <Text style={{ fontSize: 10, color: '#5C6BC0', marginTop: 2, fontStyle: 'italic' }}>Tilt: {opt.tilt}</Text>
              )}
              {opt.augmentation && (
                <Text style={{ fontSize: 10, color: '#C62828', marginTop: 2, fontStyle: 'italic' }}>Augmentation: {opt.augmentation}</Text>
              )}
            </View>
          ))}
          {result.loading_recommendation && (
            <Text style={{ fontSize: 10, color: '#455A64', marginTop: 8, fontStyle: 'italic' }}>
              Loading: {result.loading_recommendation}
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

export default AtrophyClassificationChip;
