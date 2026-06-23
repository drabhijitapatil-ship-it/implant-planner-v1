import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

type Props = {
  arch: 'maxilla' | 'mandible';
  anterior_height: string;
  posterior_height: string;
  anterior_width: string;
  posterior_width: string;
  opposing_arch?: string;
  smoking?: string;
  hba1c?: string;
};

type Option = {
  headline: string;
  implant_count: number;
  kind: string;
  description: string;
  description_short?: string;
};
type ClassResult = {
  ok: boolean;
  class?: string;
  anterior_definition?: string;
  posterior_definition?: string;
  anterior_severity?: string;
  posterior_severity?: string;
  treatment_options?: Option[];
  decision_aid?: string[];
  recommended_option_index?: number | null;
  recommendation_reason?: string | null;
  loading_recommendation?: string;
  augmentation_note?: string;
  source_reference?: string;
  error?: string;
};

const COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  CCI:   { bg: '#E8F5E9', fg: '#1B5E20', border: '#43A047' },
  CCII:  { bg: '#E3F2FD', fg: '#0D47A1', border: '#1E88E5' },
  CCIII: { bg: '#FFF8E1', fg: '#E65100', border: '#FB8C00' },
  CCIV:  { bg: '#FFEBEE', fg: '#B71C1C', border: '#E53935' },
  CCV:   { bg: '#FCE4EC', fg: '#880E4F', border: '#C2185B' },
};

const BAND_COLORS: Record<string, { active: string; dim: string; activeFg: string; dimFg: string }> = {
  simple:   { active: '#2E7D32', dim: '#C8E6C9', activeFg: '#FFFFFF', dimFg: '#2E7D32' },
  moderate: { active: '#F9A825', dim: '#FFF9C4', activeFg: '#FFFFFF', dimFg: '#827717' },
  advanced: { active: '#E65100', dim: '#FFE0B2', activeFg: '#FFFFFF', dimFg: '#BF360C' },
  severe:   { active: '#C62828', dim: '#FFCDD2', activeFg: '#FFFFFF', dimFg: '#B71C1C' },
};

const ANT_BANDS = [
  { label: 'AVAILABLE', range: '>16 mm',           sev: 'simple'   },
  { label: 'MODERATE',  range: '12-16 mm',          sev: 'moderate' },
  { label: 'ADVANCED',  range: '8-12 mm',           sev: 'advanced' },
  { label: 'SEVERE',    range: '<8 or width <6 mm', sev: 'severe'   },
];

const POST_BANDS = [
  { label: 'AVAILABLE', range: '>12 mm',            sev: 'simple'   },
  { label: 'MODERATE',  range: '8-12 mm',           sev: 'moderate' },
  { label: 'ADVANCED',  range: '4-8 mm',            sev: 'advanced' },
  { label: 'SEVERE',    range: '<4 or width <6 mm', sev: 'severe'   },
];

const SeverityBands: React.FC<{
  definition: string;
  bands: typeof ANT_BANDS;
  severity: string;
  value: number | null;
  defColor: string;
}> = ({ definition, bands, severity, value, defColor }) => (
  <View style={{ marginBottom: 10 }}>
    <Text style={{ fontSize: 12, fontWeight: '600', color: defColor, marginBottom: 6 }}>
      {definition}
    </Text>
    {bands.map((b) => {
      const isActive = b.sev === severity;
      const c = BAND_COLORS[b.sev];
      return (
        <View
          key={b.sev}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isActive ? c.active : c.dim,
            borderRadius: 4,
            paddingVertical: 5,
            paddingHorizontal: 10,
            marginBottom: 2,
            opacity: isActive ? 1 : 0.6,
          }}
        >
          <Text style={{
            fontSize: 11,
            fontWeight: isActive ? '800' : '600',
            color: isActive ? c.activeFg : c.dimFg,
            flex: 1,
          }}>
            {b.label}
          </Text>
          <Text style={{
            fontSize: 11,
            color: isActive ? c.activeFg : c.dimFg,
          }}>
            {b.range}
          </Text>
          {isActive && value !== null ? (
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: c.active }}>← {value} mm</Text>
            </View>
          ) : null}
        </View>
      );
    })}
  </View>
);

export const AtrophyClassificationChip: React.FC<Props> = (p) => {
  const [result, setResult] = useState<ClassResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
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
          opposing_arch: p.opposing_arch || null,
          smoking: p.smoking || null,
          hba1c: p.hba1c ? parseFloat(p.hba1c) : null,
        });
        setResult(res.data);
      } catch {
        setResult({ ok: false, error: 'classify failed' });
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [p.arch, p.anterior_height, p.posterior_height, p.anterior_width, p.posterior_width, p.opposing_arch, p.smoking, p.hba1c]);

  if (!ready) return null;
  if (loading) return (
    <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <ActivityIndicator size="small" color="#1565C0" />
      <Text style={{ fontSize: 12, color: '#5C6BC0' }}>Analysing atrophy assessment…</Text>
    </View>
  );
  if (!result?.ok || !result.class) return null;

  const palette = COLORS[result.class] || COLORS.CCI;

  return (
    <View style={{ marginTop: 12 }} testID={`atrophy-result-${p.arch}`} data-testid={`atrophy-result-${p.arch}`}>
      {/* ── Severity band visualiser ── */}
      <View style={{ backgroundColor: '#FAFCFF', borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#E3EAF5' }}>
        {result.anterior_definition ? (
          <SeverityBands
            definition={result.anterior_definition}
            bands={ANT_BANDS}
            severity={result.anterior_severity || ''}
            value={Number.isFinite(ah) ? ah : null}
            defColor={palette.fg}
          />
        ) : null}
        {result.posterior_definition ? (
          <SeverityBands
            definition={result.posterior_definition}
            bands={POST_BANDS}
            severity={result.posterior_severity || ''}
            value={Number.isFinite(ph) ? ph : null}
            defColor={palette.fg}
          />
        ) : null}
      </View>

      {/* ── Decision aid ── */}
      {result.decision_aid && result.decision_aid.length > 0 ? (
        <View style={{ backgroundColor: '#F1F8E9', borderColor: '#7CB342', borderLeftWidth: 3, borderRadius: 8, padding: 10, marginBottom: 8 }} data-testid={`atrophy-decision-aid-${p.arch}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Ionicons name="bulb-outline" size={14} color="#33691E" />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#33691E' }}>How to choose between these options</Text>
          </View>
          {result.decision_aid.map((line, i) => {
            const isRec = result.recommended_option_index === i;
            return (
              <Text
                key={i}
                style={{
                  fontSize: 12,
                  color: '#33691E',
                  lineHeight: 17,
                  marginBottom: i === result.decision_aid!.length - 1 ? 0 : 4,
                  fontWeight: isRec ? '800' : '400',
                }}
                data-testid={`atrophy-decision-bullet-${p.arch}-${i}${isRec ? '-recommended' : ''}`}
              >
                {isRec ? '✓ ' : '• '}{line}
              </Text>
            );
          })}
        </View>
      ) : null}

      {/* ── Treatment options ── */}
      {result.treatment_options && result.treatment_options.length > 0 && (
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 8, padding: 10, borderLeftWidth: 3, borderLeftColor: palette.border }}>
          {result.treatment_options.map((opt, i) => {
            const isOpen = !!expanded[i];
            const shortTxt = opt.description_short || opt.description;
            const hasMore = !!opt.description_short && opt.description_short !== opt.description;
            const isRec = result.recommended_option_index === i;
            return (
              <View
                key={i}
                style={{
                  marginBottom: i === result.treatment_options!.length - 1 ? 0 : 10,
                  paddingTop: i === 0 ? 0 : 10,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: '#E1E7F0',
                  ...(isRec ? {
                    backgroundColor: '#F1F8E9',
                    borderLeftWidth: 3,
                    borderLeftColor: '#33691E',
                    borderRadius: 6,
                    paddingLeft: 8,
                    paddingRight: 8,
                    paddingTop: 8,
                    paddingBottom: 8,
                    marginLeft: -8,
                  } : {}),
                }}
                testID={`atrophy-option-${p.arch}-${i}${isRec ? '-recommended' : ''}`}
                data-testid={`atrophy-option-${p.arch}-${i}${isRec ? '-recommended' : ''}`}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: palette.fg }}>
                    {opt.headline}
                  </Text>
                  {isRec ? (
                    <View style={{ backgroundColor: '#33691E', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
                      <Text style={{ fontSize: 10, color: '#FFFFFF', fontWeight: '800' }}>RECOMMENDED FOR THIS PATIENT</Text>
                    </View>
                  ) : null}
                </View>
                {isRec && result.recommendation_reason ? (
                  <Text style={{ fontSize: 11, color: '#33691E', marginTop: 4, fontStyle: 'italic' }} data-testid={`atrophy-recommendation-reason-${p.arch}`}>
                    Why: {result.recommendation_reason}
                  </Text>
                ) : null}
                <Text style={{ fontSize: 12, color: '#37474F', marginTop: 4, lineHeight: 17 }}>
                  {isOpen ? opt.description : shortTxt}
                </Text>
                {hasMore ? (
                  <TouchableOpacity
                    onPress={() => setExpanded(prev => ({ ...prev, [i]: !prev[i] }))}
                    style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    testID={`atrophy-option-toggle-${p.arch}-${i}`}
                    data-testid={`atrophy-option-toggle-${p.arch}-${i}`}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text style={{ fontSize: 11, color: palette.fg, fontWeight: '600' }}>
                      {isOpen ? 'Show less' : 'Read full description'}
                    </Text>
                    <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={12} color={palette.fg} />
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })}
          {result.loading_recommendation ? (
            <Text style={{ fontSize: 11, color: '#455A64', marginTop: 10, fontStyle: 'italic' }}>
              Loading: {result.loading_recommendation}
            </Text>
          ) : null}
          {result.augmentation_note ? (
            <Text style={{ fontSize: 11, color: '#455A64', marginTop: 4, fontStyle: 'italic' }}>
              Augmentation guidance: {result.augmentation_note}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
};

export default AtrophyClassificationChip;
