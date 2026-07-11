/**
 * iter-344 — Immediate Loading Prosthesis option resolver.
 *
 * Given a case's Phase-1 implant_procedure_type and the count of implants
 * planned in that case, return the list of prosthesis options the student
 * may choose from on the Implant Survival Review when the revision's
 * "Type of Procedure" is set to Immediate Loading.
 *
 * Rules (per user spec):
 *   - All-on-4 / All-on-6 / All-on-X → no immediate loading options exposed
 *     (the caller should hide the Immediate Loading choice entirely).
 *   - Single Conventional Implant → single-tooth options.
 *   - Multiple Conventional Implants → multi-tooth options (includes bridges).
 *   - Any other procedure type → decide by tooth count:
 *       n <= 1  → single-tooth options
 *       n > 1   → multi-tooth options
 */

export const SINGLE_TOOTH_OPTIONS = [
  'PMMA Crown with Temporary Abutment',
  'PMMA Crown with Ti-Base',
  'PMMA',
  'Other',
] as const;

export const MULTI_TOOTH_OPTIONS = [
  'PMMA Crown with Temporary Abutment',
  'PMMA Crown with Ti-Base',
  'PMMA',
  'PMMA Bridge with Temporary Abutment',
  'PMMA Bridge with Ti-Base',
  'Other',
] as const;

const FULL_ARCH_TYPES = new Set([
  'All on 4',
  'All on 6',
  'All on X',
  'All-on-4',
  'All-on-6',
  'All-on-X',
]);

export function isFullArchProcedure(procedureType?: string | null): boolean {
  return !!procedureType && FULL_ARCH_TYPES.has(procedureType);
}

export function getImmediateLoadingOptions(
  procedureType: string | null | undefined,
  toothCount: number | null | undefined,
): string[] {
  if (isFullArchProcedure(procedureType)) return [];
  if (procedureType === 'Single Conventional Implant') return [...SINGLE_TOOTH_OPTIONS];
  if (procedureType === 'Multiple Conventional Implants') return [...MULTI_TOOTH_OPTIONS];
  // Fallback for any other named procedure type — decide by tooth count.
  const n = toothCount || 0;
  return n > 1 ? [...MULTI_TOOTH_OPTIONS] : [...SINGLE_TOOTH_OPTIONS];
}
