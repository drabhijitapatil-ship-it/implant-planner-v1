// Esthetic Risk Assessment (ERA) — shared definitions for Phase 1 form,
// Case Details, and the client PDF. Mirrors backend/aesthetic_risk.py.
import { findMissingRuns } from './implantValidation';

export type RiskLevel = 'Low' | 'Medium' | 'High';

export const ANTERIOR_MAXILLA_TEETH = ['11', '12', '13', '21', '22', '23'];

export const isAnteriorMaxillaCase = (missingTeeth: string[] | undefined | null) =>
  (missingTeeth || []).some(t => ANTERIOR_MAXILLA_TEETH.includes(String(t)));

export interface EraOption { value: string; risk: RiskLevel }
export interface EraFactor {
  key: string;          // key inside procedure.aesthetic_risk (or top-level for legacy 2 fields)
  label: string;
  topLevel?: boolean;   // smile_line / gingival_biotype live on the procedure root
  derived?: boolean;    // computed from another section (not user-selectable)
  options: EraOption[];
}

export const GINGIVAL_BIOTYPE_ERA_OPTIONS = ['Thick, Low scalloped', 'Medium, Medium Scalloped', 'Thin, High scalloped'];

export const ERA_FACTORS: EraFactor[] = [
  { key: 'smile_line', label: 'Smile Line', topLevel: true, options: [
    { value: 'Low', risk: 'Low' }, { value: 'Medium', risk: 'Medium' }, { value: 'High', risk: 'High' } ] },
  { key: 'smile_type', label: 'Smile Type', options: [
    { value: 'Toothy', risk: 'Low' }, { value: 'Mixed', risk: 'Medium' }, { value: 'Gummy', risk: 'High' } ] },
  { key: 'gingival_biotype', label: 'Gingival Biotype', topLevel: true, options: [
    { value: 'Thick, Low scalloped', risk: 'Low' }, { value: 'Medium, Medium Scalloped', risk: 'Medium' }, { value: 'Thin, High scalloped', risk: 'High' } ] },
  { key: 'adjacent_teeth_right', label: 'Status of Adjacent Teeth — Right', options: [
    { value: 'Non-restored', risk: 'Low' }, { value: 'Restored', risk: 'High' }, { value: 'Root canal treated', risk: 'High' } ] },
  { key: 'adjacent_teeth_left', label: 'Status of Adjacent Teeth — Left', options: [
    { value: 'Non-restored', risk: 'Low' }, { value: 'Restored', risk: 'High' }, { value: 'Root canal treated', risk: 'High' } ] },
  { key: 'infection_at_site', label: 'Present Infection at Implant Site', options: [
    { value: 'Absent', risk: 'Low' }, { value: 'Chronic', risk: 'Medium' }, { value: 'Acute', risk: 'High' } ] },
  { key: 'ridge_condition', label: 'Alveolar Ridge Condition', options: [
    { value: 'No hard tissue defect', risk: 'Low' }, { value: 'Horizontal bone defect', risk: 'Medium' },
    { value: 'Vertical bone defect', risk: 'High' }, { value: 'Horizontal and Vertical bone defect', risk: 'High' } ] },
  { key: 'bone_level_adjacent', label: 'Bone Level at Adjacent Teeth', options: [
    { value: '≤ 5 mm to contact point', risk: 'Low' }, { value: '5.5 – 6.5 mm to contact point', risk: 'Medium' }, { value: '≥ 7 mm to contact point', risk: 'High' } ] },
  { key: 'edentulous_span', label: 'Width of Edentulous Span', derived: true, options: [
    { value: 'Single tooth', risk: 'Low' }, { value: 'Two or more teeth', risk: 'High' } ] },
  { key: 'patient_expectations', label: 'Patient Esthetic Expectations', options: [
    { value: 'Realistic esthetic demands', risk: 'Low' }, { value: 'High esthetic demands', risk: 'High' } ] },
];

export const ERA_SELECTABLE_FACTORS = ERA_FACTORS.filter(f => !f.derived);

const LEGACY_BIOTYPE: Record<string, string> = { Thin: 'Thin, High scalloped', Thick: 'Thick, Low scalloped' };
export const normalizeGingivalBiotype = (v: string | undefined | null) => (v ? (LEGACY_BIOTYPE[v] || v) : '');

export function riskFor(key: string, value: string | undefined | null): RiskLevel | null {
  if (!value) return null;
  const f = ERA_FACTORS.find(x => x.key === key);
  const v = key === 'gingival_biotype' ? normalizeGingivalBiotype(value) : value;
  return f?.options.find(o => o.value === v)?.risk ?? null;
}

/** Width of the edentulous span touching the anterior maxilla (largest run). */
export function deriveEdentulousSpan(missingTeeth: string[] | undefined | null): string {
  const teeth = (missingTeeth || []).map(String);
  if (!isAnteriorMaxillaCase(teeth)) return '';
  let longest = 0;
  for (const run of findMissingRuns(teeth)) {
    if (run.positions.some(p => ANTERIOR_MAXILLA_TEETH.includes(p))) longest = Math.max(longest, run.positions.length);
  }
  return longest >= 2 ? 'Two or more teeth' : 'Single tooth';
}

export interface EraValues { smile_line?: string; gingival_biotype?: string; aesthetic_risk?: Record<string, any>; missing_teeth?: string[] }

export function eraValue(src: EraValues, key: string): string {
  if (key === 'smile_line') return src.smile_line || '';
  if (key === 'gingival_biotype') return normalizeGingivalBiotype(src.gingival_biotype);
  if (key === 'edentulous_span') return deriveEdentulousSpan(src.missing_teeth) || src.aesthetic_risk?.edentulous_span || '';
  return src.aesthetic_risk?.[key] || '';
}

export interface EraSummary {
  overall: RiskLevel | null;
  assessed: number;
  total: number;
  counts: Record<RiskLevel, number>;
  rows: Array<{ key: string; label: string; value: string; risk: RiskLevel | null }>;
}

/** ITI-style: any High → High; else any Medium → Medium; else Low (needs ≥1 assessed). */
export function computeEra(src: EraValues): EraSummary {
  const counts: Record<RiskLevel, number> = { Low: 0, Medium: 0, High: 0 };
  const rows = ERA_FACTORS.map(f => {
    const value = eraValue(src, f.key);
    const risk = riskFor(f.key, value);
    if (risk) counts[risk] += 1;
    return { key: f.key, label: f.label, value, risk };
  });
  const assessed = counts.Low + counts.Medium + counts.High;
  const overall: RiskLevel | null = assessed === 0 ? null : counts.High > 0 ? 'High' : counts.Medium > 0 ? 'Medium' : 'Low';
  return { overall, assessed, total: ERA_FACTORS.length, counts, rows };
}

export const RISK_COLORS: Record<RiskLevel, { bg: string; fg: string; border: string }> = {
  Low: { bg: '#E8F5E9', fg: '#1B5E20', border: '#A5D6A7' },
  Medium: { bg: '#FFF3E0', fg: '#E65100', border: '#FFCC80' },
  High: { bg: '#FFEBEE', fg: '#B71C1C', border: '#EF9A9A' },
};
