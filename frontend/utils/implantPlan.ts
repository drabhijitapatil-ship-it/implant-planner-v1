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
