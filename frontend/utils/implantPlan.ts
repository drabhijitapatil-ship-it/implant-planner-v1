// Single source of truth for "where does the implant sit?".
//
// Different layers of the codebase have spelled this field differently over
// time — `position` is the canonical key on the live `implant_plans` schema,
// but PDF/AI-summary serializers and older case records also use
// `tooth_number`, `tooth_position`, `toothPosition`, or `tooth`. Reading
// only one of those keys silently produced empty cells (see iter-199).
//
// Always go through this helper when rendering an implant site. If a new
// field name shows up later, fix it here and every surface (lab slip,
// case-report PDF, AI summary, Pre-Op checklist labels, shade labels) is
// updated in lock-step.

export type ImplantPlanLike = {
  position?: string | number | null;
  tooth_number?: string | number | null;
  tooth_position?: string | number | null;
  toothPosition?: string | number | null;
  tooth?: string | number | null;
  // Spec fields (canonical → legacy)
  implant_brand?: string | null;
  brand?: string | null;
  implant_system?: string | null;
  system?: string | null;
  diameter?: string | number | null;
  length?: string | number | null;
  platform?: string | null;
  connection?: string | null;
};

export const getImplantSite = (
  plan: ImplantPlanLike | null | undefined,
  fallback: string = '—',
): string => {
  if (!plan) return fallback;
  const v =
    plan.position ??
    plan.tooth_number ??
    plan.tooth_position ??
    plan.toothPosition ??
    plan.tooth;
  if (v === undefined || v === null || v === '') return fallback;
  return String(v);
};

// iter-201: same canonical→legacy pattern for the rest of the implant
// columns (brand / system / diameter / length / platform). Returns
// already-formatted strings (e.g. `"4.3 mm"`) so renderers can drop them
// directly into a table cell. `fallback` is only used per-field when the
// value is missing, never for the whole tuple.
const _str = (v: unknown, fallback: string): string =>
  v === undefined || v === null || v === '' ? fallback : String(v);

const _mm = (v: unknown, fallback: string): string => {
  if (v === undefined || v === null || v === '') return fallback;
  const s = String(v).trim();
  return s.endsWith('mm') ? s : `${s} mm`;
};

export const getImplantSpec = (
  plan: ImplantPlanLike | null | undefined,
  fallback: string = '—',
) => {
  if (!plan) {
    return { brand: fallback, system: fallback, diameter: fallback, length: fallback, platform: fallback };
  }
  return {
    brand: _str(plan.implant_brand ?? plan.brand, fallback),
    system: _str(plan.implant_system ?? plan.system, fallback),
    diameter: _mm(plan.diameter, fallback),
    length: _mm(plan.length, fallback),
    platform: _str(plan.platform ?? plan.connection, fallback),
  };
};
