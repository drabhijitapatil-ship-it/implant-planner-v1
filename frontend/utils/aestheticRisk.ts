// Esthetic Risk Assessment (ERA) — shared definitions for Phase 1 form,
// Case Details, and the client PDF. Mirrors backend/aesthetic_risk.py.
//
// Model (procedure.aesthetic_risk):
//   { smile_type, patient_expectations,                       ← patient-level
//     sites: { <leaderFDI>: { positions, adjacent_teeth_right, adjacent_teeth_left,
//                             infection_at_site, ridge_condition, bone_level_adjacent,
//                             span_mm, edentulous_span, overall_risk } },
//     overall_risk, assessed_count, anterior_maxilla }
//   smile_line / gingival_biotype stay top-level on the procedure.
// Legacy (iter-438) documents stored the site factors flat on aesthetic_risk —
// they are read as a single site.
import { findMissingRuns, clusterLeader } from './implantValidation';

export type RiskLevel = 'Low' | 'Medium' | 'High';

export const ANTERIOR_MAXILLA_TEETH = ['11', '12', '13', '21', '22', '23'];

export const isAnteriorMaxillaCase = (missingTeeth: string[] | undefined | null) =>
  (missingTeeth || []).some(t => ANTERIOR_MAXILLA_TEETH.includes(String(t)));

export interface EraOption { value: string; risk: RiskLevel }
export interface EraFactor {
  key: string;
  label: string;
  scope: 'patient' | 'site';
  topLevel?: boolean;   // smile_line / gingival_biotype live on the procedure root
  derived?: boolean;    // computed (span) — not user-selectable
  options: EraOption[];
}

export const GINGIVAL_BIOTYPE_ERA_OPTIONS = ['Thick, Low scalloped', 'Medium, Medium Scalloped', 'Thin, High scalloped'];

const ADJ = [{ value: 'Non-restored', risk: 'Low' }, { value: 'Restored', risk: 'High' }, { value: 'Root canal treated', risk: 'High' }] as EraOption[];

export const ERA_FACTORS: EraFactor[] = [
  { key: 'smile_line', label: 'Smile Line', scope: 'patient', topLevel: true, options: [
    { value: 'Low', risk: 'Low' }, { value: 'Medium', risk: 'Medium' }, { value: 'High', risk: 'High' } ] },
  { key: 'smile_type', label: 'Smile Type', scope: 'patient', options: [
    { value: 'Toothy', risk: 'Low' }, { value: 'Mixed', risk: 'Medium' }, { value: 'Gummy', risk: 'High' } ] },
  { key: 'gingival_biotype', label: 'Gingival Biotype', scope: 'patient', topLevel: true, options: [
    { value: 'Thick, Low scalloped', risk: 'Low' }, { value: 'Medium, Medium Scalloped', risk: 'Medium' }, { value: 'Thin, High scalloped', risk: 'High' } ] },
  { key: 'patient_expectations', label: 'Patient Esthetic Expectations', scope: 'patient', options: [
    { value: 'Realistic esthetic demands', risk: 'Low' }, { value: 'High esthetic demands', risk: 'High' } ] },
  { key: 'adjacent_teeth_right', label: 'Status of Adjacent Teeth — Right', scope: 'site', options: ADJ },
  { key: 'adjacent_teeth_left', label: 'Status of Adjacent Teeth — Left', scope: 'site', options: ADJ },
  { key: 'infection_at_site', label: 'Present Infection at Implant Site', scope: 'site', options: [
    { value: 'Absent', risk: 'Low' }, { value: 'Chronic', risk: 'Medium' }, { value: 'Acute', risk: 'High' } ] },
  { key: 'ridge_condition', label: 'Alveolar Ridge Condition', scope: 'site', options: [
    { value: 'No hard tissue defect', risk: 'Low' }, { value: 'Horizontal bone defect', risk: 'Medium' },
    { value: 'Vertical bone defect', risk: 'High' }, { value: 'Horizontal and Vertical bone defect', risk: 'High' } ] },
  { key: 'bone_level_adjacent', label: 'Bone Level at Adjacent Teeth', scope: 'site', options: [
    { value: '≤ 5 mm to contact point', risk: 'Low' }, { value: '5.5 – 6.5 mm to contact point', risk: 'Medium' }, { value: '≥ 7 mm to contact point', risk: 'High' } ] },
  { key: 'edentulous_span', label: 'Width of Edentulous Span', scope: 'site', derived: true, options: [
    { value: 'Single tooth ≥ 7 mm', risk: 'Low' }, { value: 'Single tooth < 7 mm', risk: 'Medium' }, { value: 'Two or more teeth', risk: 'High' } ] },
];

export const ERA_PATIENT_FACTORS = ERA_FACTORS.filter(f => f.scope === 'patient');
export const ERA_SITE_FACTORS = ERA_FACTORS.filter(f => f.scope === 'site');
export const ERA_SITE_SELECTABLE = ERA_SITE_FACTORS.filter(f => !f.derived);
export const ERA_SELECTABLE_FACTORS = ERA_FACTORS.filter(f => !f.derived);

const LEGACY_BIOTYPE: Record<string, string> = { Thin: 'Thin, High scalloped', Thick: 'Thick, Low scalloped' };
export const normalizeGingivalBiotype = (v: string | undefined | null) => (v ? (LEGACY_BIOTYPE[v] || v) : '');

const LEGACY_SPAN: Record<string, RiskLevel> = { 'Single tooth': 'Low', 'Two or more teeth': 'High' }; // iter-438 tooth-count grading

export function riskFor(key: string, value: string | undefined | null): RiskLevel | null {
  if (!value) return null;
  const f = ERA_FACTORS.find(x => x.key === key);
  const v = key === 'gingival_biotype' ? normalizeGingivalBiotype(value) : value;
  return f?.options.find(o => o.value === v)?.risk ?? (key === 'edentulous_span' ? LEGACY_SPAN[v] ?? null : null);
}

// ─── Anterior edentulous areas ──────────────────────────────────────────────
export interface EraArea { leader: string; positions: string[]; label: string }

/** One area per contiguous missing run that touches the anterior maxilla. */
export function anteriorAreas(missingTeeth: string[] | undefined | null): EraArea[] {
  const teeth = (missingTeeth || []).map(String);
  const out: EraArea[] = [];
  for (const run of findMissingRuns(teeth)) {
    if (!run.positions.some(p => ANTERIOR_MAXILLA_TEETH.includes(p))) continue;
    const leader = clusterLeader(run.positions) || run.positions[0];
    out.push({ leader, positions: run.positions, label: run.positions.length > 1 ? `FDI ${run.positions.join('–')}` : `FDI ${run.positions[0]}` });
  }
  return out;
}

export interface EraValues {
  smile_line?: string; gingival_biotype?: string;
  aesthetic_risk?: Record<string, any>;
  missing_teeth?: string[];
  edentulous_site_measurements?: Record<string, { oc?: string; md?: string }>;
  mesiodistal_space?: string;
  implant_procedure_type?: string;
}

const parseMm = (v: any): number | null => {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Mesiodistal space (mm) recorded for an area in Clinical Examination. */
export function spanMmFor(src: EraValues, area: EraArea): number | null {
  const meas = src.edentulous_site_measurements || {};
  const fromCluster = parseMm(meas[area.leader]?.md) ?? parseMm(area.positions.map(p => meas[p]?.md).find(Boolean));
  if (fromCluster != null) return fromCluster;
  const missing = (src.missing_teeth || []).length;
  const singleFlow = missing < 2 || src.implant_procedure_type === 'Single Conventional Implant' || anteriorAreas(src.missing_teeth).length === 1;
  if (singleFlow) return parseMm(src.mesiodistal_space) ?? parseMm(src.aesthetic_risk?.sites?.[area.leader]?.span_mm);
  return parseMm(src.aesthetic_risk?.sites?.[area.leader]?.span_mm);
}

export function spanValueFor(area: EraArea, mm: number | null): string {
  if (area.positions.length >= 2) return 'Two or more teeth';
  if (mm == null) return '';
  return mm >= 7 ? 'Single tooth ≥ 7 mm' : 'Single tooth < 7 mm';
}

export const fmtSpan = (value: string, mm: number | null) => (value ? `${value}${mm != null ? ` · ${mm} mm` : ''}` : '');

/** Read a factor value; `leader` selects the site for site-scoped factors. */
export function eraValue(src: EraValues, key: string, leader?: string): string {
  if (key === 'smile_line') return src.smile_line || '';
  if (key === 'gingival_biotype') return normalizeGingivalBiotype(src.gingival_biotype);
  const era = src.aesthetic_risk || {};
  const f = ERA_FACTORS.find(x => x.key === key);
  if (f?.scope === 'site') {
    const sites = era.sites;
    if (sites && typeof sites === 'object') return (leader && sites[leader]?.[key]) || '';
    return era[key] || ''; // legacy flat document → single site
  }
  return era[key] || '';
}

export interface EraRow { key: string; label: string; value: string; risk: RiskLevel | null; leader?: string }
export interface EraSiteSummary {
  leader: string; positions: string[]; label: string; spanMm: number | null;
  rows: EraRow[];           // site-scoped rows only
  overall: RiskLevel | null; assessed: number; total: number; counts: Record<RiskLevel, number>;
}
export interface EraSummary {
  overall: RiskLevel | null;
  assessed: number;
  total: number;
  complete: boolean;
  counts: Record<RiskLevel, number>;
  patientRows: EraRow[];
  sites: EraSiteSummary[];
  rows: EraRow[];           // patientRows + every site row (analytics / PDF)
}

const grade = (counts: Record<RiskLevel, number>): RiskLevel | null => {
  const n = counts.Low + counts.Medium + counts.High;
  return n === 0 ? null : counts.High > 0 ? 'High' : counts.Medium > 0 ? 'Medium' : 'Low';
};

/** ITI-style: any High → High; else any Medium → Medium; else Low. Per-site grades include the patient-level factors. */
export function computeEra(src: EraValues): EraSummary {
  const patientRows: EraRow[] = ERA_PATIENT_FACTORS.map(f => {
    const value = eraValue(src, f.key);
    return { key: f.key, label: f.label, value, risk: riskFor(f.key, value) };
  });
  const pCounts: Record<RiskLevel, number> = { Low: 0, Medium: 0, High: 0 };
  for (const r of patientRows) if (r.risk) pCounts[r.risk] += 1;

  const areas = anteriorAreas(src.missing_teeth);
  const sites: EraSiteSummary[] = areas.map(area => {
    const spanMm = spanMmFor(src, area);
    const rows: EraRow[] = ERA_SITE_FACTORS.map(f => {
      let value = f.derived ? spanValueFor(area, spanMm) : eraValue(src, f.key, area.leader);
      if (f.derived && !value) {
        // legacy iter-438 value (no mm captured) → keep its old tooth-count grade
        const era = src.aesthetic_risk || {};
        const legacy = era.sites && typeof era.sites === 'object' ? era.sites[area.leader]?.edentulous_span : era.edentulous_span;
        value = legacy && LEGACY_SPAN[legacy] ? legacy : '';
      }
      return { key: f.key, label: f.label, value: f.derived ? fmtSpan(value, spanMm) : value, risk: riskFor(f.key, value), leader: area.leader };
    });
    const counts: Record<RiskLevel, number> = { ...pCounts };
    for (const r of rows) if (r.risk) counts[r.risk] += 1;
    const assessed = counts.Low + counts.Medium + counts.High;
    return { ...area, spanMm, rows, overall: grade(counts), assessed, total: ERA_PATIENT_FACTORS.length + ERA_SITE_FACTORS.length, counts };
  });

  const counts: Record<RiskLevel, number> = { ...pCounts };
  for (const s of sites) for (const r of s.rows) if (r.risk) counts[r.risk] += 1;
  const assessed = counts.Low + counts.Medium + counts.High;
  const total = ERA_PATIENT_FACTORS.length + ERA_SITE_FACTORS.length * sites.length;
  return {
    overall: grade(counts), assessed, total, complete: total > 0 && assessed >= total, counts,
    patientRows, sites, rows: [...patientRows, ...sites.flatMap(s => s.rows)],
  };
}

export const RISK_COLORS: Record<RiskLevel, { bg: string; fg: string; border: string }> = {
  Low: { bg: '#E8F5E9', fg: '#1B5E20', border: '#A5D6A7' },
  Medium: { bg: '#FFF3E0', fg: '#E65100', border: '#FFCC80' },
  High: { bg: '#FFEBEE', fg: '#B71C1C', border: '#EF9A9A' },
};

// ─── Clinical guidance (shown under a completed Medium / High grade) ────────
export const ERA_GENERAL_HIGH_TIPS = [
  'Plan soft-tissue augmentation (connective-tissue graft) at placement or at second stage to thicken the buccal tissue.',
  'Use a screw-retained customised provisional to shape the emergence profile and papillae before the final impression.',
  'Place the implant slightly palatal and 3–4 mm apical to the planned gingival zenith; avoid buccal positioning.',
  'Set expectations early — document the risk grade in the consent and consider a digital smile mock-up.',
];

export const ERA_FACTOR_TIPS: Record<string, Partial<Record<RiskLevel, string>>> = {
  smile_line: { High: 'High smile line exposes the gingival margin — a provisional-driven soft-tissue contouring phase is strongly advised.' },
  smile_type: { High: 'Gummy smile — condition the tissue with a provisional and assess adjacent teeth for esthetic crown lengthening.', Medium: 'Mixed smile — verify the gingival zenith and papilla heights during provisionalisation.' },
  gingival_biotype: { High: 'Thin, high-scalloped biotype — high recession risk; connective-tissue graft and palatal implant position recommended.', Medium: 'Medium biotype — consider a CTG if the buccal plate is < 2 mm thick.' },
  adjacent_teeth_right: { High: 'Restored / RCT adjacent tooth (right) — confirm margin integrity and periapical status; reassess abutment prognosis.' },
  adjacent_teeth_left: { High: 'Restored / RCT adjacent tooth (left) — confirm margin integrity and periapical status; reassess abutment prognosis.' },
  infection_at_site: { High: 'Acute infection — defer placement, debride and resolve infection; plan early/delayed placement (Type 2 / 3).', Medium: 'Chronic infection — thorough debridement of the socket; consider early placement after soft-tissue healing.' },
  ridge_condition: { High: 'Vertical (± horizontal) defect — staged vertical augmentation / GBR before placement; pink ceramics as fallback.', Medium: 'Horizontal defect — simultaneous contour augmentation (GBR) at placement.' },
  bone_level_adjacent: { High: 'Bone-to-contact ≥ 7 mm — papilla fill unlikely; consider orthodontic extrusion, longer contact area or pink ceramics.', Medium: 'Bone-to-contact 5.5–6.5 mm — partial papilla fill expected; plan the contact point accordingly.' },
  edentulous_span: { High: 'Two or more adjacent teeth in the esthetic zone — inter-implant papilla is unpredictable; consider implant + pontic / cantilever design.', Medium: 'Narrow single-tooth gap (< 7 mm) — consider a narrow-diameter implant and orthodontic space management; tight papilla control.' },
  patient_expectations: { High: 'High esthetic demands — extended consent discussion, diagnostic wax-up / mock-up and photographic documentation.' },
};

/** Guidance for one area (patient rows + that area's rows). Returns null unless the grade is complete and Medium/High. */
export function eraGuidance(rows: EraRow[], overall: RiskLevel | null, complete: boolean): { title: string; tips: string[] } | null {
  if (!complete || !overall || overall === 'Low') return null;
  const tips: string[] = [];
  for (const r of rows) {
    if (!r.risk || r.risk === 'Low') continue;
    const t = ERA_FACTOR_TIPS[r.key]?.[r.risk];
    if (t && !tips.includes(t)) tips.push(t);
  }
  if (overall === 'High') tips.push(...ERA_GENERAL_HIGH_TIPS);
  return {
    title: overall === 'High' ? 'High aesthetic risk — clinical guidance' : 'Medium aesthetic risk — points to watch',
    tips: tips.slice(0, overall === 'High' ? 8 : 4),
  };
}
