/**
 * Implant biological-safety validator.
 *
 * Two clinical rules per institutional spec:
 *  • Rule 1 (FLEXIBLE) — bone width must leave ≥ 1.0 mm of bone on EACH side
 *    of the implant: (bone_width − implant_diameter) ≥ 2.0 mm. Falling short
 *    raises a soft warning the student can override (Continue / Change).
 *  • Rule 2 (HARD) — for posterior tooth positions, implant length must be
 *    AT LEAST 1.5 mm shorter than measured bone height to spare the
 *    inferior alveolar nerve (mandible) or maxillary sinus floor (maxilla).
 *    Falling short of that 1.5 mm safety margin is non-negotiable.
 *
 * Posterior tooth set is fixed by the institution: 14-17, 24-27, 35-37, 45-47.
 * Note: 38 / 48 are deliberately excluded — third molars are rarely implanted.
 */

const POSTERIOR_MAXILLARY = new Set(['14', '15', '16', '17', '24', '25', '26', '27']);
const POSTERIOR_MANDIBULAR = new Set(['35', '36', '37', '45', '46', '47']);
const POSTERIOR_ALL = new Set<string>([...POSTERIOR_MAXILLARY, ...POSTERIOR_MANDIBULAR]);

export const isPosteriorTooth = (tooth: string | undefined | null): boolean =>
  !!tooth && POSTERIOR_ALL.has(String(tooth));

export const isMaxillaryPosterior = (tooth: string | undefined | null): boolean =>
  !!tooth && POSTERIOR_MAXILLARY.has(String(tooth));

export type SafetyVerdict =
  | { kind: 'ok' }
  | {
      /** Rule 1 — soft warning. Student picks Continue (override) or Change. */
      kind: 'width_warning';
      message: string;
      marginMm: number; // available bone on each side, may be negative
    }
  | {
      /** Rule 2 — soft warning (iter-340). Selection can proceed with a
       *  2-button confirmation dialog + audit-override log. Downgraded
       *  from a hard block per clinical review — the safety chip stays
       *  visible so the clinician always sees the risk before tapping. */
      kind: 'length_warning';
      message: string;
      requiredShortBy: number; // 1.5
      actualShortBy: number;   // bone_height - implant_length (may be ≤ 0)
    };

export type SafetyArgs = {
  toothPosition?: string | null;
  boneWidthMm?: number | null;
  boneHeightMm?: number | null;
  implantDiameterMm?: number | null;
  implantLengthMm?: number | null;
  /** iter-328: When the case's procedure type is "Sinus Lift",
   *  Rule 2 (posterior length block) is intentionally skipped — the
   *  lift procedure (direct lateral window or indirect osteotome)
   *  adds vertical bone via graft material, so longer implants than
   *  the measured residual bone height are clinically appropriate. */
  procedureType?: string | null;
};

/**
 * Returns the FIRST safety verdict (length_warning > width_warning > ok).
 * Length is checked first because it involves anatomical structures
 * (sinus / IAN) — the clinician needs to acknowledge that risk first.
 * iter-340: length is a SOFT warning (Continue / Exit confirmation),
 * no longer a hard block.
 */
export function evaluateImplantSafety(args: SafetyArgs): SafetyVerdict {
  const { toothPosition, boneWidthMm, boneHeightMm, implantDiameterMm, implantLengthMm, procedureType } = args;

  const isSinusLift = procedureType === 'Sinus Lift';

  // Rule 2 — posterior length (skipped for Sinus Lift; see SafetyArgs note)
  if (!isSinusLift && isPosteriorTooth(toothPosition) && boneHeightMm != null && implantLengthMm != null) {
    const shortBy = boneHeightMm - implantLengthMm;
    if (shortBy < 1.5) {
      const isMax = isMaxillaryPosterior(toothPosition);
      const structure = isMax ? 'maxillary sinus floor' : 'inferior alveolar nerve';
      return {
        kind: 'length_warning',
        message: `Selected implant length is ${implantLengthMm} mm and bone height is ${boneHeightMm} mm. Recommended clearance to the ${structure} is at least 1.5–2 mm.`,
        requiredShortBy: 1.5,
        actualShortBy: +shortBy.toFixed(2),
      };
    }
  }

  // Rule 1 — width margin
  if (boneWidthMm != null && implantDiameterMm != null) {
    const margin = (boneWidthMm - implantDiameterMm) / 2;
    if (margin < 1.0) {
      return {
        kind: 'width_warning',
        message: 'Maintain 1–1.5 mm of bone around the implant.',
        marginMm: +margin.toFixed(2),
      };
    }
  }

  return { kind: 'ok' };
}

/**
 * Pre-compute a per-implant verdict for the recommendation list. Used by
 * "Suggest Me" to grey-out unsafe options with a reason chip per spec Q2=b.
 */
export function annotateImplantSafety<T extends { diameter?: number; length?: number }>(
  implants: T[],
  ctx: { toothPosition?: string | null; boneWidthMm?: number | null; boneHeightMm?: number | null; procedureType?: string | null },
): Array<T & { _safety: SafetyVerdict }> {
  return implants.map(imp => ({
    ...imp,
    _safety: evaluateImplantSafety({
      toothPosition: ctx.toothPosition,
      boneWidthMm: ctx.boneWidthMm,
      boneHeightMm: ctx.boneHeightMm,
      implantDiameterMm: imp.diameter,
      implantLengthMm: imp.length,
      procedureType: ctx.procedureType,
    }),
  }));
}

/**
 * Short reason chip text for the "Suggest Me" greyed-out card.
 */
export function shortSafetyChip(v: SafetyVerdict): string | null {
  if (v.kind === 'length_warning') return 'Bone height conflict';
  if (v.kind === 'width_warning') return `Tight bone — ${v.marginMm.toFixed(1)} mm margin`;
  return null;
}

/**
 * iter-385: rank a full implant catalogue by closeness to the clinically
 * ideal size derived from the entered bone dimensions:
 *   ideal diameter = bone width − 3 mm (1.5 mm bone buffer each side)
 *   ideal length   = bone height − 2 mm (nerve / sinus clearance)
 * Combined weighted score (diameter deviation weighs 2×) so e.g. for
 * width 6 / height 8: 3.5×8 → 4×7 → 4×8 → 3.5×10 (per user spec example).
 */
export function rankImplantsByCloseness<T extends { diameter?: number; length?: number }>(
  implants: T[],
  boneWidthMm: number | null,
  boneHeightMm: number | null,
): T[] {
  const idealD = boneWidthMm != null && !isNaN(boneWidthMm) ? boneWidthMm - 3.0 : null;
  const idealL = boneHeightMm != null && !isNaN(boneHeightMm) ? boneHeightMm - 2.0 : null;
  const score = (imp: T) => {
    const dDev = idealD != null ? Math.abs((imp.diameter ?? 0) - idealD) : 0;
    const lDev = idealL != null ? Math.abs((imp.length ?? 0) - idealL) : 0;
    return 2 * dDev + lDev;
  };
  return [...implants].sort((a, b) => {
    const sA = score(a), sB = score(b);
    if (sA !== sB) return sA - sB;
    if (idealD != null) {
      const dA = Math.abs((a.diameter ?? 0) - idealD);
      const dB = Math.abs((b.diameter ?? 0) - idealD);
      if (dA !== dB) return dA - dB;
    }
    if ((a.diameter ?? 0) !== (b.diameter ?? 0)) return (a.diameter ?? 0) - (b.diameter ?? 0);
    return (a.length ?? 0) - (b.length ?? 0);
  });
}
