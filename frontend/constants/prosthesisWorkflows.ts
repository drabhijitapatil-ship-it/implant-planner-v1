/**
 * iter-Feb-2026-B — Multiple / Full-Arch / Zygoma prosthesis workflow catalogs.
 *
 * Three procedure-type groups drive different provisional + prosthetic-plan
 * catalogues at Phase 1, Phase 2 Step 2, and Phase 4 Step 1. Precedence:
 *
 *   Group C  (Zygoma-specific)  ▶  most-specific, highest priority
 *      • Quad Zygoma
 *      • Zygoma and Pterygoid Implants
 *      • Zygoma and Conventional Implants
 *      • Zygoma, Pterygoid and Conventional Implants
 *
 *   Group B  (Full-Arch)
 *      • All on 4 · All on 6 · All on X
 *
 *   Group A  (Multi-implant 4-part plan)
 *      • Multiple Conventional Implants
 *      • Pterygoid and Conventional Implants   ← explicit user override
 *
 * "Other" is available on every dropdown; when picked the parent form
 * shows a free-text input directly below the dropdown, wired to a
 * sibling `_other` field.
 */

import type { OptionDesc, GroupedOptions } from './singleConventional';

export const OTHER_OPTION: OptionDesc = {
  label: 'Other',
  description: 'Free text — specify a plan not listed above.',
};

// ══════════════════════════════════════════════════════════════════════
// GROUP A — Multiple Conventional / Pterygoid+Conventional
// ══════════════════════════════════════════════════════════════════════

export const GROUP_A_PROVISIONAL_OPTIONS: GroupedOptions = [
  {
    group: 'Provisional — Implant-Supported',
    options: [
      { label: 'Splinted screw-retained provisional FPD', description: 'Multi-unit provisional bridge in PMMA on temporary cylinders.' },
      { label: 'Splinted cement-retained provisional FPD', description: 'Multi-unit provisional bridge in PMMA on temporary cylinders.' },
      { label: 'Non-splinted screw-retained provisional FPD', description: 'Individual multiple provisional crowns in PMMA on temporary cylinders.' },
      { label: 'Non-splinted cement-retained provisional FPD', description: 'Individual multiple provisional crowns in PMMA on temporary cylinders.' },
      { label: 'Long-term milled PMMA provisional bridge', description: 'Milled multi-unit provisional intended for 6–12 months.' },
      { label: 'Long-term milled PMMA provisional crowns', description: 'Milled multi-unit provisional intended for 6–12 months.' },
      { label: 'PMMA Crowns with Ti-Base', description: 'Provisional PMMA crowns on Ti-Base temporary abutment.' },
      OTHER_OPTION,
    ],
  },
  {
    group: 'Provisional — Removable',
    options: [
      { label: 'Vacuum-formed retainer with pontic (Essix)', description: 'Thermoformed clear shell carrying a denture-tooth or composite pontic.' },
      { label: 'Interim acrylic removable partial', description: 'Acrylic partial denture with wrought clasps or a gingival extension.' },
      { label: 'Cast-metal interim RPD', description: 'Cobalt-chromium framework interim partial with proper tooth support.' },
      OTHER_OPTION,
    ],
  },
];

export const GROUP_A_PROSTHESIS_TYPE_OPTIONS: OptionDesc[] = [
  { label: 'Individual non-splinted crowns', description: 'Each implant restored separately.' },
  { label: 'Splinted FPD, screw-retained on multi-unit abutments', description: 'Multi-unit bridge at abutment level, correcting divergence with 17°/30° MUAs.' },
  { label: 'Splinted FPD, cement-retained on custom abutments', description: 'Conventional bridge cemented over CAD/CAM abutments.' },
  { label: 'Segmented screwmentable bridge', description: 'Bridge cemented extraorally to its abutments and delivered as a screw-retained unit; long spans divided into segments.' },
  { label: 'Malo prosthesis with Multiunit Abutment', description: 'Milled metal framework with individually bonded ceramic crowns.' },
  { label: 'Implant FPD with a cantilever pontic', description: 'A bridge extended by one unit beyond the terminal implant.' },
  { label: 'Tooth-to-implant connected FPD', description: 'A fixed bridge connecting a natural abutment to an implant.' },
  OTHER_OPTION,
];

export const GROUP_A_ABUTMENT_TYPE_OPTIONS: OptionDesc[] = [
  { label: 'Stock / prefabricated titanium abutment', description: 'Machined straight or angled abutment from the implant manufacturer.' },
  { label: 'UCLA cast-to abutment', description: 'Plastic or gold-alloy castable cylinder waxed and cast to a fully custom form.' },
  { label: 'CAD/CAM custom titanium abutment', description: 'Milled abutment reproducing the conditioned emergence profile with a controlled margin.' },
  { label: 'Hybrid abutment (Ti-base + CAD/CAM zirconia)', description: 'Zirconia superstructure resin-bonded extraorally onto a titanium base that carries the implant connection.' },
  { label: 'One-piece full-zirconia abutment', description: 'Zirconia abutment engaging the implant connection directly.' },
  { label: 'Titanium-nitride (gold-anodised) abutment', description: 'Gold-coloured surface-treated titanium abutment.' },
  { label: 'Angulated screw channel (ASC) abutment', description: 'Abutment and matching driver system allowing the screw access to be redirected up to roughly 25–30° from the implant axis.' },
  { label: 'Multi-unit abutment (multi-unit use)', description: 'Transmucosal abutment moving the prosthetic connection supracrestally.' },
  { label: 'One-abutment–one-time protocol', description: 'The definitive abutment is placed at surgery and never removed thereafter; only the crown is changed.' },
  OTHER_OPTION,
];

export const GROUP_A_RETENTION_OPTIONS: OptionDesc[] = [
  { label: 'Screw-retained crown', description: 'Crown/Bridge screwed directly to the implant or to an abutment.' },
  { label: 'Cement-retained crown', description: 'Crown/Bridge cemented onto a custom or stock abutment.' },
  { label: 'Screwmentable — Cement-retained, screw-retrievable', description: 'Crown/Bridge is cemented extraorally onto its abutment on a lab replica, and the assembled unit is screwed in as one piece.' },
  OTHER_OPTION,
];

export const GROUP_A_CROWN_MATERIAL_OPTIONS: OptionDesc[] = [
  { label: 'Metal', description: 'Ni-Cr or Co-Cr full metal contoured crown.' },
  { label: 'Metal-ceramic (PFM)', description: 'Feldspathic porcelain layered on a noble-alloy or CoCr coping, or cast to a UCLA for a one-piece screw-retained crown.' },
  { label: 'Monolithic zirconia', description: 'Full-contour high-strength tetragonal zirconia, stained and glazed.' },
  { label: 'Multilayer zirconia', description: 'Higher-yttria, more cubic-phase translucent zirconia in pre-shaded gradient discs.' },
  { label: 'Micro-layered cutback zirconia', description: 'Facial-only porcelain veneering over a full-contour zirconia core.' },
  { label: 'Layered cutback zirconia', description: 'Full porcelain veneering over a zirconia coping.' },
  { label: 'Zirconia-reinforced lithium silicate (ZLS)', description: 'Glass-ceramic with dispersed zirconia reinforcement.' },
  { label: 'Resin nanoceramic / hybrid ceramic', description: 'Polymer-infiltrated ceramic network or nanoceramic resin block.' },
  { label: 'Full-cast gold', description: 'Full-contour cast noble-alloy crown.' },
  { label: 'Milled titanium ceramic layered', description: 'Full-contour milled titanium crown, with a facial ceramic veneer.' },
  OTHER_OPTION,
];

// ══════════════════════════════════════════════════════════════════════
// GROUP B — All-on-4 / 6 / X (full arch)
// ══════════════════════════════════════════════════════════════════════

export const GROUP_B_PROVISIONAL_OPTIONS: GroupedOptions = [
  {
    group: 'Provisional — Full-Arch Fixed',
    options: [
      { label: 'Chairside denture conversion', description: 'The existing or a newly made complete denture is relieved, picked up over temporary cylinders with autopolymerising acrylic, the flanges are removed and it is converted into a screw-retained fixed interim on the day of surgery.' },
      { label: 'Metal / fiber-reinforced converted provisional', description: 'A titanium bar, cast CoCr framework, orthodontic wire or fiber ribbon embedded in the provisional before or during pickup.' },
      { label: 'Pre-milled CAD/CAM PMMA immediate provisional', description: 'Planned from CBCT, intraoral and facial scans plus a digital denture set-up, milled ahead of surgery for a fully guided placement, or milled same-day from intraoperative photogrammetry.' },
      { label: '3D-printed immediate provisional', description: 'Printed interim full-arch, often reinforced with a printed or milled substructure.' },
      { label: 'Long-term provisional (Diagnostic prosthesis)', description: 'A provisional worn for 3–12 months and used to settle every variable the definitive must reproduce.' },
      { label: 'Interim complete denture during submerged healing', description: 'Soft-relined complete denture, grossly relieved over the implants, where immediate loading was not achievable.' },
      OTHER_OPTION,
    ],
  },
  {
    group: 'Provisional — Full-Arch Removable',
    options: [
      { label: 'Existing denture, soft-relined', description: "The patient's current denture relieved over the healing abutments and soft-lined during osseointegration." },
      { label: 'Direct (chairside) attachment pick-up', description: 'Attachment housings picked up intraorally in autopolymerising acrylic, with a rubber dam or block-out spacer isolating undercuts.' },
      { label: 'Indirect (laboratory) attachment pick-up', description: 'Housings incorporated in the laboratory from a pick-up impression.' },
      { label: 'Interim overdenture on healing abutments', description: 'A relieved interim denture worn during the unloaded period, with attachments added later.' },
      OTHER_OPTION,
    ],
  },
];

export const GROUP_B_PROSTHETIC_PLAN_OPTIONS: GroupedOptions = [
  {
    group: 'Definitive — Fixed Full-Arch',
    options: [
      { label: 'Metal-acrylic hybrid ("Toronto" / fixed-detachable, FP-3)', description: 'Cast CoCr or milled titanium bar carrying acrylic denture teeth in pink acrylic.' },
      { label: 'Milled titanium bar + individually bonded ceramic crowns', description: 'A milled Ti substructure with separate zirconia or lithium disilicate crowns bonded to it, and pink ceramic or composite gingiva.' },
      { label: 'Monolithic zirconia full-arch (full-contour)', description: 'A single milled multilayer zirconia prosthesis, stained and glazed, with pink porcelain or pink zirconia gingiva.' },
      { label: 'Zirconia with micro-layered facial veneering', description: 'Full-contour zirconia with facial-only ceramic layering.' },
      { label: 'Zirconia superstructure on a milled titanium substructure', description: 'A milled Ti bar seats on the multi-unit abutments; the zirconia is bonded onto it.' },
      { label: 'Metal-ceramic full-arch', description: 'Porcelain layered onto a cast or milled full-arch framework.' },
      { label: 'PEEK/BioHPP framework with composite veneering', description: 'High-performance polymer framework (elastic modulus ≈ 4 GPa) veneered with composite.' },
      { label: 'Fiber-reinforced / carbon-fiber framework', description: 'Glass- or carbon-fiber-reinforced composite framework (e.g. Trinia-type) with composite or acrylic teeth.' },
      { label: 'Monobloc composite/nanoceramic disc on a metal bar', description: 'A single disc milled to teeth and gingiva as one body (Ivotion-type), bonded onto a titanium or CoCr bar.' },
      { label: 'Milled PMMA as a definitive-transitional prosthesis', description: 'A milled PMMA arch for 1–3 years as the working prosthesis.' },
    ],
  },
  {
    group: 'Definitive — RP-5 · Implant-retained & tissue-supported',
    options: [
      { label: 'Locator / Locator R-Tx stud attachment', description: 'Low-profile resilient stud attachment with colour-coded replaceable nylon inserts.' },
      { label: 'Ball / O-ring attachment', description: 'Spherical abutment engaged by a metal housing or rubber O-ring.' },
      { label: 'Magnetic attachment', description: 'Keeper on the abutment, magnet in the denture.' },
      { label: 'Equator / Novaloc / ERA low-profile studs', description: 'Alternative low-profile stud systems.' },
      { label: 'Overdenture base with cast metal reinforcement', description: 'A CoCr framework embedded in the denture base.' },
    ],
  },
  {
    group: 'Definitive — RP-4 · Fully implant-supported',
    options: [
      { label: 'Hader bar with clips', description: 'Round-section bar between implants with retentive plastic or metal clips in the denture.' },
      { label: 'Dolder bar', description: 'Egg-shaped or U-shaped bar with a matching sleeve.' },
      { label: 'CAD/CAM milled titanium bar, parallel-walled', description: 'A rigid milled bar whose parallel walls provide friction retention, usually supplemented by attachments.' },
      { label: 'Telescopic / conical double-crown overdenture', description: 'Primary titanium or gold copings on the abutments, secondary electroformed gold or milled framework within the denture; retention by friction.' },
      { label: 'Marburg double crown / resilience telescope', description: 'A double-crown design with a deliberate gap in the fitting surface allowing slight resilience under load.' },
      { label: 'Fixed-removable hybrid ("wrap-around")', description: 'A screw-retained bar carrying a superstructure that only the clinician removes.' },
      OTHER_OPTION,
    ],
  },
];

// ══════════════════════════════════════════════════════════════════════
// GROUP C — Zygoma/Pterygoid-specific
// ══════════════════════════════════════════════════════════════════════

export const GROUP_C_PROVISIONAL_OPTIONS: GroupedOptions = [
  {
    group: 'Provisional — Zygomatic & Pterygoid',
    options: [
      { label: 'Immediate metal-reinforced screw-retained acrylic interim', description: 'A converted or purpose-made acrylic fixed provisional with an embedded titanium bar, CoCr framework or fiber reinforcement, delivered within 24–72 hours.' },
      { label: 'Photogrammetry-captured, same-day milled PMMA provisional', description: 'Implant positions captured intraoperatively with photogrammetry (PIC, iCam-type), milled on site and delivered the same day.' },
      { label: 'Reinforced denture conversion', description: "The patient's existing denture reinforced and converted over multi-unit temporary cylinders." },
      { label: 'Delayed interim removable denture', description: 'A grossly relieved, soft-relined complete denture where primary stability was inadequate for immediate loading.' },
      { label: 'Long-term provisional', description: 'The negotiating instrument: the prosthesis in which palatal bulk, phonetics, lip support, occlusal plane and hygiene access are all settled before anything definitive is milled.' },
      OTHER_OPTION,
    ],
  },
];

export const GROUP_C_PROSTHETIC_PLAN_OPTIONS: OptionDesc[] = [
  { label: 'Milled titanium bar + acrylic or composite teeth (FP-3)', description: 'A milled Ti substructure carrying acrylic or composite teeth in pink acrylic.' },
  { label: 'Milled titanium bar + individually bonded ceramic crowns', description: 'Milled Ti bar with separately bonded zirconia or lithium disilicate crowns and pink ceramic or composite gingiva.' },
  { label: 'Monolithic zirconia full-arch', description: 'A single milled zirconia arch on the multi-unit abutments.' },
  { label: 'Zirconia bonded onto a milled titanium substructure', description: 'The compromise design: a Ti bar takes the flexural load and corrects fit; zirconia provides only the occlusal and esthetic surface.' },
  { label: 'Fixed-removable hybrid on a milled bar', description: 'A screw-retained milled bar with a clinician- or patient-removable superstructure.' },
  { label: 'Obturator prosthesis on zygomatic anchorage', description: 'Post-maxillectomy: a hollow-bulb obturator retained by bar-and-clip, stud attachments or magnets on zygomatic implants, sometimes combined with a fixed dentate segment.' },
  OTHER_OPTION,
];

// ══════════════════════════════════════════════════════════════════════
// Precedence resolver
// ══════════════════════════════════════════════════════════════════════

export type WorkflowGroup = 'A' | 'B' | 'C' | null;

/**
 * Determine which prosthesis workflow group a procedure type belongs to.
 * Precedence: C > B > A > null. Group A explicitly includes
 * "Pterygoid and Conventional Implants" per user override.
 */
export function getWorkflowGroup(procType: string | null | undefined): WorkflowGroup {
  if (!procType) return null;

  // Group C — Zygoma-specific (most specific)
  const groupC = new Set([
    'Quad Zygoma Implants',
    'Zygoma and Pterygoid Implants',
    'Zygoma and Conventional Implants',
    'Zygoma, Pterygoid and Conventional Implants',
  ]);
  if (groupC.has(procType)) return 'C';

  // Group B — All-on-X full arch
  if (procType === 'All on 4' || procType === 'All on 6' || procType === 'All on X') return 'B';

  // Group A — Multiple Conventional / Pterygoid+Conventional (user override)
  if (procType === 'Multiple Conventional Implants'
      || procType === 'Pterygoid and Conventional Implants') return 'A';

  return null;
}

/** Convenience booleans. */
export const isGroupA = (t?: string | null) => getWorkflowGroup(t) === 'A';
export const isGroupB = (t?: string | null) => getWorkflowGroup(t) === 'B';
export const isGroupC = (t?: string | null) => getWorkflowGroup(t) === 'C';

/** Provisional options for a given procedure type — null when not applicable. */
export function getProvisionalOptionsForProcType(procType: string): GroupedOptions | null {
  const g = getWorkflowGroup(procType);
  if (g === 'A') return GROUP_A_PROVISIONAL_OPTIONS;
  if (g === 'B') return GROUP_B_PROVISIONAL_OPTIONS;
  if (g === 'C') return GROUP_C_PROVISIONAL_OPTIONS;
  return null;
}
