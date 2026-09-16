/**
 * orisCalculator.ts — iter-Jun-2026 (v10, Chunk 3)
 *
 * Aparicio ORIS Success Code (0..4) computation extracted from the retired
 * ZygomaExtendedWorkflow so it can be reused inside the unified
 * ZygomaAdvancedClinicalSection component.
 *
 * Reference: Aparicio C. et al. — zygomatic implant success criteria.
 * The code is scored across four independent dimensions and combined into
 * a single 0..4 value (higher = more successful).
 *
 *  D1: OFFENSE (soft tissue) — sinus disease / oro-antral communication
 *  D2: REHABILITATION (prosthetic) — screw retention + passive fit
 *  D3: INFECTION / bone response — no radiographic peri-implant lesion
 *  D4: STABILITY — insertion torque + immediate loading protocol
 *
 * Each dimension contributes 1 point when its criteria are met. Result is
 * clamped to [0..4]. Missing inputs count as `false` (i.e. not meeting the
 * criteria).
 */

export interface OrisInputs {
  // D1 — Offense
  no_sinus_disease?: boolean;
  no_oro_antral_communication?: boolean;
  // D2 — Rehabilitation
  screw_retained_confirmed?: boolean;
  passive_fit_verified?: boolean;
  // D3 — Infection / bone
  no_radiographic_peri_implant_lesion?: boolean;
  // D4 — Stability
  insertion_torque_min_ncm?: number;      // e.g. min across zygoma implants
  immediate_loading_day0_completed?: boolean;
}

export interface OrisResult {
  code: 0 | 1 | 2 | 3 | 4;
  breakdown: {
    d1_offense: boolean;
    d2_rehabilitation: boolean;
    d3_infection: boolean;
    d4_stability: boolean;
  };
  label: string;
}

const LABELS = ['Unsuccessful', 'Poor', 'Fair', 'Good', 'Optimum success'];

export function calculateOris(i: OrisInputs = {}): OrisResult {
  const d1 = !!i.no_sinus_disease && !!i.no_oro_antral_communication;
  const d2 = !!i.screw_retained_confirmed && !!i.passive_fit_verified;
  const d3 = !!i.no_radiographic_peri_implant_lesion;
  const d4 = (typeof i.insertion_torque_min_ncm === 'number' && i.insertion_torque_min_ncm >= 35)
    && !!i.immediate_loading_day0_completed;
  const code = ((d1 ? 1 : 0) + (d2 ? 1 : 0) + (d3 ? 1 : 0) + (d4 ? 1 : 0)) as 0|1|2|3|4;
  return {
    code,
    breakdown: { d1_offense: d1, d2_rehabilitation: d2, d3_infection: d3, d4_stability: d4 },
    label: LABELS[code],
  };
}
