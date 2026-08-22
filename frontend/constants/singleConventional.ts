/**
 * iter-Feb-2026 — Single Conventional Implant catalogue.
 *
 * Adds three new clinical option sets used *only* when the case
 * `implant_procedure_type === 'Single Conventional Implant'`:
 *
 *   1. Type of Provisional  (Phase 1 + Phase 2 Step 2 immediate-loading)
 *   2. Abutment Type        (Phase 1 Prosthetic Plan + Phase 4 Step 1 Final Plan)
 *   3. Type of Retention    (Phase 1 Prosthetic Plan + Phase 4 Step 1 Final Plan)
 *   4. Crown Material       (Phase 1 Prosthetic Plan + Phase 4 Step 1 Final Plan)
 *
 * Each option carries a short clinical description that the UI shows
 * as sub-text under the option label in the dropdown and preserves in
 * the PDF export.
 */

export type OptionDesc = { label: string; description: string };
export type GroupedOptions = { group: string; options: OptionDesc[] }[];

// ─── Type of Provisional ─────────────────────────────────────────────
export const PROVISIONAL_GROUPED_OPTIONS: GroupedOptions = [
  {
    group: 'Provisional — Site Management, Implant Unloaded',
    options: [
      {
        label: 'Stock healing abutment',
        description:
          'Prefabricated cylindrical titanium or PEEK transmucosal component, no coronal contour, no restoration.',
      },
      {
        label: 'Anatomic/custom healing abutment',
        description:
          "A healing abutment reproducing the extracted tooth's cervical cross-section — milled PEEK or titanium, chairside composite over a temporary cylinder, or the patient's own extracted crown sectioned and used as a socket sealer.",
      },
      {
        label: 'Partial extraction therapy adjuncts',
        description:
          'Socket shield (buccal root fragment retained), root-submergence, free gingival graft plug or collagen plug plus membrane. Not prostheses, but they occupy the provisional slot and dictate what the provisional can do.',
      },
    ],
  },
  {
    group: 'Provisional — Implant-Supported',
    options: [
      {
        label: 'Screw-retained provisional',
        description:
          'Screw-retained provisional crown delivered at surgery or within 48 hours, built chairside on a titanium or PEEK temporary cylinder with PMMA or bis-acryl.',
      },
      {
        label: 'Cement-retained provisional',
        description:
          'Provisional crown cemented onto a temporary abutment. Built chairside on a titanium or PEEK temporary cylinder with PMMA or bis-acryl.',
      },
      {
        label: 'PMMA crown with Ti-Base',
        description: 'Provisional PMMA crown on Ti-Base temporary abutment.',
      },
      {
        label: 'CAD/CAM milled PMMA provisional',
        description:
          'Provisional milled from a homogeneous industrially polymerised PMMA disc rather than mixed chairside.',
      },
      {
        label: '3D-printed resin provisional',
        description: 'Additively manufactured provisional from the digital plan.',
      },
      {
        label: 'Emergence-profile conditioning provisional',
        description: 'A provisional designed and serially modified to shape the peri-implant tissue.',
      },
    ],
  },
  {
    group: 'Provisional — Removable',
    options: [
      {
        label: 'Vacuum-formed retainer with pontic (Essix)',
        description: 'Thermoformed clear shell carrying a denture-tooth or composite pontic.',
      },
      {
        label: 'Interim acrylic removable partial',
        description: 'Acrylic partial denture with wrought clasps or a gingival extension.',
      },
      {
        label: 'Cast-metal interim RPD',
        description: 'Cobalt-chromium framework interim partial with proper tooth support.',
      },
    ],
  },
  {
    group: 'Provisional — Fixed, Tooth-Supported (Implant Unloaded)',
    options: [
      {
        label: 'Resin-bonded (Maryland) provisional',
        description: 'Fiber-reinforced composite or metal-wing pontic bonded to the adjacent enamel.',
      },
      {
        label: 'Natural-tooth pontic, fiber-bonded',
        description:
          "The patient's own extracted crown, sectioned and bonded with fiber ribbon to the adjacent teeth.",
      },
      {
        label: 'Conventional provisional FPD on adjacent teeth',
        description: 'Full-coverage provisional bridge over prepared abutment teeth.',
      },
    ],
  },
];

// ─── Abutment Type ───────────────────────────────────────────────────
export const SC_ABUTMENT_TYPE_OPTIONS: OptionDesc[] = [
  {
    label: 'Stock / prefabricated titanium abutment',
    description: 'Machined straight or angled abutment from the implant manufacturer.',
  },
  {
    label: 'UCLA cast-to abutment',
    description: 'Plastic or gold-alloy castable cylinder waxed and cast to a fully custom form.',
  },
  {
    label: 'CAD/CAM custom titanium abutment',
    description: 'Milled abutment reproducing the conditioned emergence profile with a controlled margin.',
  },
  {
    label: 'Hybrid abutment (Ti-base + CAD/CAM zirconia)',
    description:
      'Zirconia superstructure resin-bonded extraorally onto a titanium base that carries the implant connection.',
  },
  {
    label: 'One-piece full-zirconia abutment',
    description: 'Zirconia abutment engaging the implant connection directly.',
  },
  {
    label: 'Titanium-nitride (gold-anodised) abutment',
    description: 'Gold-coloured surface-treated titanium abutment.',
  },
  {
    label: 'Angulated screw channel (ASC) abutment',
    description:
      'Abutment and matching driver system allowing the screw access to be redirected up to roughly 25–30° from the implant axis.',
  },
  {
    label: 'Multi-unit abutment (single-unit use)',
    description: 'Transmucosal abutment moving the prosthetic connection supracrestally.',
  },
  {
    label: 'One-abutment–one-time protocol',
    description:
      'The definitive abutment is placed at surgery and never removed thereafter; only the crown is changed.',
  },
];

// ─── Type of Retention ───────────────────────────────────────────────
export const SC_RETENTION_TYPE_OPTIONS: OptionDesc[] = [
  {
    label: 'Screw-retained crown',
    description: 'Crown screwed directly to the implant or to an abutment; no cement.',
  },
  {
    label: 'Cement-retained crown',
    description: 'Conventional crown cemented onto a custom or stock abutment.',
  },
  {
    label: 'Screwmentable — Cement-retained, screw-retrievable',
    description:
      'The crown is cemented extraorally onto its abutment on a lab replica, and the assembled unit is screwed in as one piece.',
  },
];

// ─── Crown Material ──────────────────────────────────────────────────
export const SC_CROWN_MATERIAL_OPTIONS: OptionDesc[] = [
  {
    label: 'Metal',
    description: 'Ni-Cr or Co-Cr full metal contoured crown.',
  },
  {
    label: 'Metal-ceramic (PFM)',
    description:
      'Feldspathic porcelain layered on a noble-alloy or CoCr coping, or cast to a UCLA for a one-piece screw-retained crown.',
  },
  {
    label: 'Monolithic zirconia',
    description: 'Full-contour high-strength tetragonal zirconia, stained and glazed.',
  },
  {
    label: 'Multilayer zirconia',
    description: 'Higher-yttria, more cubic-phase translucent zirconia in pre-shaded gradient discs.',
  },
  {
    label: 'Micro-layered cutback zirconia',
    description: 'Facial-only porcelain veneering over a full-contour zirconia core.',
  },
  {
    label: 'Layered cutback zirconia',
    description: 'Full porcelain veneering over a zirconia coping.',
  },
  {
    label: 'Lithium disilicate on Ti-base',
    description: 'Pressed or milled lithium disilicate crown adhesively bonded to a titanium base.',
  },
  {
    label: 'Zirconia-reinforced lithium silicate (ZLS)',
    description: 'Glass-ceramic with dispersed zirconia reinforcement.',
  },
  {
    label: 'Resin nanoceramic / hybrid ceramic',
    description: 'Polymer-infiltrated ceramic network or nanoceramic resin block.',
  },
  {
    label: 'Full-cast gold',
    description: 'Full-contour cast noble-alloy crown.',
  },
  {
    label: 'Milled titanium ceramic layered',
    description: 'Full-contour milled titanium crown, with a facial ceramic veneer.',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Returns true when the case is a *pure* Single Conventional Implant (i.e.
 * not a mixed Zygoma/Pterygoid case that happens to include a single
 * conventional site). The new Single-Conventional prosthesis workflow is
 * scoped to these cases only.
 */
export function isPureSingleConventional(
  procedureType: string | null | undefined,
  hasAdvancedImplants: boolean = false,
): boolean {
  if (procedureType !== 'Single Conventional Implant') return false;
  if (hasAdvancedImplants) return false; // e.g. any Zygoma/Pterygoid components
  return true;
}

/**
 * Flat list of provisional labels — useful when validating whether a
 * stored value is still a member of the catalogue.
 */
export function getAllProvisionalLabels(): string[] {
  return PROVISIONAL_GROUPED_OPTIONS.flatMap(g => g.options.map(o => o.label));
}

/** Look up the clinical description for a given provisional label. */
export function getProvisionalDescription(label: string | null | undefined): string {
  if (!label) return '';
  for (const g of PROVISIONAL_GROUPED_OPTIONS) {
    const hit = g.options.find(o => o.label === label);
    if (hit) return hit.description;
  }
  return '';
}

/** Look up the clinical description for any of the SC option catalogues. */
export function getDescriptionFrom(
  list: OptionDesc[],
  label: string | null | undefined,
): string {
  if (!label) return '';
  const hit = list.find(o => o.label === label);
  return hit ? hit.description : '';
}
