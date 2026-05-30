/**
 * Attachment Cuff-Height Catalogue (iter-138).
 *
 * Maps each Phase-1 "Type of Attachment" value to the manufacturer's
 * ex-catalogue tissue-cuff-height variants (in mm). Used by the Phase 2
 * Healing-Abutment-Placed flow to auto-surface the right dropdown options per
 * implant instead of free-form text entry.
 *
 * Values are sourced from the manufacturers' published product ranges. Keep
 * the list conservative — only ship heights that are actually stocked, so the
 * student can't pick a non-existent SKU. For brands where the student orders
 * a custom-milled element (Bar Attachment / Locator Bar) or picks "Other", we
 * intentionally do NOT provide a catalogue and the UI falls back to the
 * legacy free-text numeric input.
 */

// Keys match the strings saved by new-procedure.tsx. "Other" + bar-type
// entries omit their key entirely so callers default to free-text entry.
export const ATTACHMENT_CUFF_CATALOGUE: Record<string, string[]> = {
  // Zest Dental Solutions — Locator (classic) ships 1 through 5 mm in 1 mm
  // steps on the standard implant platform.
  'Locator - Zest Dental Solutions': ['1', '2', '3', '4', '5'],

  // Locator R-Tx — same vendor, but R-Tx platform ships one extra 6 mm tall
  // abutment for deep-vestibule implants.
  'Locator R-Tx - Zest Dental Solutions': ['1', '2', '3', '4', '5', '6'],

  // OT Equator (Rhein 83) — sub-millimetre 0.5 mm base plus 1-7 mm variants.
  'Rheine 83 - OT Equator': ['0.5', '1', '2', '3', '4', '5', '6', '7'],

  // Straumann Novaloc — ships 0.5 mm, 1.5 mm, 2.5 mm, 3.5 mm, 4.5 mm, 5.5 mm.
  'Novaloc - Straumann': ['0.5', '1.5', '2.5', '3.5', '4.5', '5.5'],

  // Bredent TiSi Snap — 0.5 / 1 / 2 / 3 / 4 / 5 mm GH.
  'TiSi Snap - Bredent': ['0.5', '1', '2', '3', '4', '5'],

  // Generic Stud-and-Ball attachment — 1 mm through 4 mm in 1 mm steps.
  'Stud and Ball Attachment': ['1', '2', '3', '4'],
};

/**
 * Returns the catalogue array for the given Phase 1 attachment value, or null
 * if the attachment has no catalogue (bar-type / Other / empty).
 *
 * Handles the "Other: <custom>" wrapper used by the save payload by
 * stripping the prefix before lookup — custom attachments never have a
 * catalogue so this returns null for them.
 */
export function getCuffHeightsFor(attachmentValue?: string | null): string[] | null {
  if (!attachmentValue) return null;
  if (attachmentValue.startsWith('Other:')) return null;
  return ATTACHMENT_CUFF_CATALOGUE[attachmentValue] ?? null;
}
