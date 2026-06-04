/**
 * Per-brand implant color codes (iter-285, Feb 2026).
 *
 * Source: published color conventions from each manufacturer catalogue.
 * Used as a visual scanning aid on implant-system cards & dropdowns —
 * never as a clinical safety signal. Always falls back to a neutral
 * slate stripe when no color is configured.
 *
 * Convention:
 *   • Diameter-based brands (Adin Touareg/Swell, Straumann BLX) → resolve
 *     by Ø value.
 *   • Platform-based brands (Adin CloseFit, Straumann BLX RB/WB) → resolve
 *     by platform substring in the system name.
 *   • Brands without a published color code → branded default (a single
 *     tint that distinguishes the manufacturer in the list).
 */

export type ImplantColor = { fill: string; label: string };

const NEUTRAL: ImplantColor = { fill: '#90A4AE', label: 'Neutral' };

// ── Adin diameter color bands (Touareg / Swell catalogue) ───────────────
const ADIN_DIAMETER_BAND: Record<string, ImplantColor> = {
  '3.5':  { fill: '#FBC02D', label: 'Yellow' },
  '3.75': { fill: '#FB8C00', label: 'Orange' },
  '4.2':  { fill: '#43A047', label: 'Green' },
  '5.0':  { fill: '#1E88E5', label: 'Blue' },
  '6.0':  { fill: '#8E24AA', label: 'Purple' },
};

// ── Adin CloseFit platform color codes ──────────────────────────────────
const ADIN_CLOSEFIT_PLATFORM: Record<string, ImplantColor> = {
  UNP: { fill: '#CFD8DC', label: 'Silver — Ultra-Narrow' },
  NP:  { fill: '#FBC02D', label: 'Yellow — Narrow' },
  RP:  { fill: '#EC407A', label: 'Pink — Regular' },
  WP:  { fill: '#1E88E5', label: 'Blue — Wide' },
};

// ── Straumann BLX platform color codes (RB vs WB) ───────────────────────
const STRAUMANN_BLX_PLATFORM: Record<string, ImplantColor> = {
  RB: { fill: '#FBC02D', label: 'Yellow — Regular Base' },
  WB: { fill: '#1E88E5', label: 'Blue — Wide Base' },
};

// ── Brand defaults (no published color code yet) ────────────────────────
const BRAND_DEFAULT: Record<string, ImplantColor> = {
  Adin:                { fill: '#26A69A', label: 'Adin' },
  Straumann:           { fill: '#E53935', label: 'Straumann' },
  Neodent:             { fill: '#43A047', label: 'Neodent' },
  'Alpha Bio':         { fill: '#7E57C2', label: 'Alpha-Bio' },
  BioHorizons:         { fill: '#039BE5', label: 'BioHorizons' },
  'Dentsply Sirona':   { fill: '#5E35B1', label: 'Dentsply Sirona' },
  Cowellmedi:          { fill: '#00897B', label: 'Cowellmedi' },
  Bredent:             { fill: '#F4511E', label: 'Bredent' },
  Osstem:              { fill: '#1976D2', label: 'Osstem' },
  MIS:                 { fill: '#6D4C41', label: 'MIS' },
  'B&B Dental':        { fill: '#8D6E63', label: 'B&B Dental' },
};

/**
 * Resolve the color band for a given implant.
 *
 * The lookup goes: platform-based override → diameter band → brand default
 * → neutral fallback. `diameter` is optional — pass undefined for cards
 * that aggregate multiple sizes (we then resolve via platform / brand).
 */
export function getImplantColor(
  brand: string,
  system: string,
  diameter?: number | null,
): ImplantColor {
  const brandKey = (brand || '').trim();
  const sysLower = (system || '').toLowerCase();

  // 1) Adin CloseFit — platform substring in the system name.
  if (brandKey === 'Adin' && sysLower.includes('closefit')) {
    if (sysLower.startsWith('unp')) return ADIN_CLOSEFIT_PLATFORM.UNP;
    if (sysLower.startsWith('np '))  return ADIN_CLOSEFIT_PLATFORM.NP;
    if (sysLower.startsWith('rp '))  return ADIN_CLOSEFIT_PLATFORM.RP;
    if (sysLower.startsWith('wp '))  return ADIN_CLOSEFIT_PLATFORM.WP;
  }

  // 2) Straumann BLX — RB / WB suffix in the system name.
  if (brandKey === 'Straumann' && sysLower.includes('blx')) {
    if (sysLower.includes('rb platform')) return STRAUMANN_BLX_PLATFORM.RB;
    if (sysLower.includes('wb platform')) return STRAUMANN_BLX_PLATFORM.WB;
  }

  // 3) Adin diameter bands (Touareg-OS / Touareg-S / Swell / One).
  if (brandKey === 'Adin' && diameter != null) {
    // Normalise: 5 → "5.0", 4.2 → "4.2". This avoids the JS quirk where
    // (5.0).toString() returns "5" and would miss the catalog key.
    const fixed = Number.isInteger(diameter) ? `${diameter}.0` : diameter.toString();
    if (ADIN_DIAMETER_BAND[fixed]) return ADIN_DIAMETER_BAND[fixed];
    if (ADIN_DIAMETER_BAND[diameter.toString()]) return ADIN_DIAMETER_BAND[diameter.toString()];
    // 3.3 maps to closest band (Swell ultra-narrow → yellow shade).
    if (diameter <= 3.4)  return { fill: '#FFEE58', label: 'Pale Yellow' };
    if (diameter >= 5.5)  return { fill: '#8E24AA', label: 'Purple' };
  }

  // 4) Brand default.
  if (BRAND_DEFAULT[brandKey]) return BRAND_DEFAULT[brandKey];

  return NEUTRAL;
}
