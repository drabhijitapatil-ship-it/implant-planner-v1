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
      /** Rule 2 — hard block. Selection cannot proceed. */
      kind: 'length_block';
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
};

/**
 * Returns the FIRST blocking verdict (length_block > width_warning > ok).
 * Length is checked first because it's a hard block — the student needs to
 * see it before they can address a softer width warning.
 */
export function evaluateImplantSafety(args: SafetyArgs): SafetyVerdict {
  const { toothPosition, boneWidthMm, boneHeightMm, implantDiameterMm, implantLengthMm } = args;

  // Rule 2 — posterior length
  if (isPosteriorTooth(toothPosition) && boneHeightMm != null && implantLengthMm != null) {
    const shortBy = boneHeightMm - implantLengthMm;
    if (shortBy < 1.5) {
      const isMax = isMaxillaryPosterior(toothPosition);
      const structure = isMax ? 'maxillary sinus floor' : 'inferior alveolar nerve';
      return {
        kind: 'length_block',
        message: `Choose an implant at least 1.5–2 mm shorter than the entered bone length to protect the ${structure}.`,
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
  ctx: { toothPosition?: string | null; boneWidthMm?: number | null; boneHeightMm?: number | null },
): Array<T & { _safety: SafetyVerdict }> {
  return implants.map(imp => ({
    ...imp,
    _safety: evaluateImplantSafety({
      toothPosition: ctx.toothPosition,
      boneWidthMm: ctx.boneWidthMm,
      boneHeightMm: ctx.boneHeightMm,
      implantDiameterMm: imp.diameter,
      implantLengthMm: imp.length,
    }),
  }));
}

/**
 * Short reason chip text for the "Suggest Me" greyed-out card.
 */
export function shortSafetyChip(v: SafetyVerdict): string | null {
  if (v.kind === 'length_block') return 'Too long — vital structure at risk';
  if (v.kind === 'width_warning') return `Tight bone — ${v.marginMm.toFixed(1)} mm margin`;
  return null;
}
