/**
 * Implant-system specific Indications & Features.
 *
 * Sourced verbatim from the institution's "Implant Specific Indications" Word
 * doc (Feb 2026). Keys are normalised against the dropdown's `${brand} – ${system}`
 * label using `keyOf()` so spacing / hyphen variants resolve to the same entry.
 *
 * IMPORTANT: per product spec, this is shown ONLY in the "Let Me Choose" flow
 * AFTER the user selects an implant from the dropdown. The dropdown's existing
 * short `indication` string is NOT replaced — that remains as the picker hint.
 */

export type ImplantSystemDetail = {
  /** Long-form indication paragraph, line breaks preserved. */
  indications: string;
  /** Long-form features paragraph; empty string when the doc didn't include one. */
  features: string;
};

export const IMPLANT_SYSTEM_DETAILS: Record<string, ImplantSystemDetail> = {
  'neodent drive gm acqua': {
    indications: 'D3 and D4 bone types. Immediate implant placement.',
    features:
      'Grand Morse Connection. SLA surface treatment. Tapered body, square threads. Reverse cutting chambers. Double thread. Hydrophilic surface. Aggressive design for soft bone.',
  },
  'neodent drive gm neoporous': {
    indications: 'D3 and D4 bone types. Immediate implant placement.',
    features:
      'Grand Morse Connection. Acid-etched surface. Tapered body, square threads, reverse cutting chambers, double thread. Acqua hydrophilic surface. Aggressive design for soft bone.',
  },
  'neodent helix gm acqua': {
    indications: 'D1, D2, D3, and D4 bone types. Immediate implant placement.',
    features:
      'Grand Morse Connection. SLA surface treatment. Full dual tapered implant. Hybrid contour with a cylindrical coronal part and conical on apical area. Active apex including a soft, rounded, small tip and helicoidal flutes. Dynamic progressive thread design — compressing trapezoidal threads in the coronal area to self-tapping V-shaped threads in the apical part. Double-threaded implant.',
  },
  'neodent helix gm neoporous': {
    indications: 'D1, D2, D3, and D4 bone types. Immediate implant placement.',
    features:
      'Grand Morse Connection. Acid-etched surface. Full dual tapered implant. Hybrid contour with a cylindrical coronal part and conical on the apical area. Active apex including a soft, rounded, small tip and helicoidal flutes. Dynamic progressive thread design — compressing trapezoidal threads in the coronal area to self-tapping V-shaped threads in the apical part. Double-threaded implant.',
  },
  'neodent titamax gm acqua': {
    indications: 'D1 and D2 bone types. Implant Placement with Guided Bone Regeneration.',
    features:
      'SLA surface treatment. Grand Morse Connection. Cylindrical implant (parallel walls). V-shape threads, double-threaded implant, self-tapping apex.',
  },
  'neodent titamax gm neoporous': {
    indications: 'D1 and D2 bone types. Implant Placement with Guided Bone Regeneration areas.',
    features:
      'Acid-etched surface. Grand Morse Connection. Cylindrical implant (parallel walls). V-shape threads, double-threaded implant, self-tapping apex.',
  },
  'nobel biocare nobelactive np': {
    indications:
      'Conventional and immediate implant placement in 11, 12, 21, 22, 31, 32, 41, 42. Narrow edentulous ridges. Reduced mesiodistal spaces. Sites requiring minimal osteotomy expansion. Soft bone requiring enhanced primary stability.',
    features:
      'Tapered Bone-Compacting Macrodesign produces lateral bone compression during insertion, improving insertion torque in softer bone. Progressive Thread Design — increasing thread depth toward the apex enhances apical anchorage. Apical Cutting Chambers facilitate self-drilling behaviour and allow directional correction during placement. Narrow Platform Prosthetic Interface optimised for reduced mesiodistal prosthetic space and narrow emergence profiles. Internal Conical Connection improves joint stability, minimises micromovement, and supports crestal bone preservation. TiUnite Surface — a moderately rough anodised surface promoting rapid osseointegration.',
  },
  'nobel biocare nobel active rp': {
    indications:
      'D3, D4 bone types. Immediate implant placement for 11, 12, 13, 14, 21, 22, 23, 24.',
    features:
      'Universal diameter platform suitable for most single-tooth and short-span restorations. Enhanced load distribution — greater diameter improves stress transfer to crestal cortical bone. Broad prosthetic compatibility supports crowns, bridges, ASC restorations, Multi-unit prosthetics, and digital workflows.',
  },
  'nobel biocare nobelactive wp': {
    indications:
      'Conventional and immediate implant placement in 16, 17, 26, 27, 36, 37, 46, 47. Wide ridges. Bruxism / high occlusal force cases. Short implant with increased diameter strategy.',
    features:
      'Wide-Diameter Platform. Increases implant-bone contact area and improves load dissipation. High Insertion Stability in posterior sites. Ideal for fresh molar sockets and poor-density posterior maxillary bone. Improved Emergence for molar restorations supports wider cervical contours for posterior prosthetics. Greater resistance to bending forces — useful under high occlusal loading.',
  },
  'nobel biocare nobel parallel np': {
    indications:
      'D1, D2, D3, D4 bone types. 12, 22, 31, 32, 41, 42 regions. Narrow ridge. Delayed loading.',
    features:
      'Parallel-Walled body promotes even stress distribution along the implant length. Tapered apex facilitates insertion and apical engagement. Full-Length threading enhances surface area and primary stability. Narrow prosthetic platform — ideal for smaller crowns and reduced spaces. Straightforward drilling protocol — efficient and user-friendly surgical sequence.',
  },
  'nobel biocare nobelparallel rp': {
    indications:
      'D1, D2, D3, D4 bone types. Single Unit. Multi-unit Bridge Restorations. Full arch rehabilitations — All on 4, All on 6, All on X.',
    features:
      'Universal standard diameter — most versatile implant within the NobelParallel group. Excellent mechanical stability — Conical connection with hexagonal interlock resists screw loosening and rotational forces. Simplified restorative workflow — compatible with ASC abutments, CAD/CAM, Multi-unit systems, and guided surgery. Balanced macrogeometry — predictable insertion without excessive bone compression.',
  },
  'nobel biocare nobelparallel wp': {
    indications: 'Indicated for 36, 37, 46, 47, wide ridges, three-unit bridge.',
    features:
      'Wide platform posterior design optimised for molar replacement. Increased functional surface area — favourable for load-bearing zones. Improved Prosthetic emergence profile supports natural molar crown contours. Strong connection mechanics — high resistance in posterior functional zones.',
  },
  'biohorizons tapered pro': {
    indications:
      'Single-tooth replacement. Fixed bridges. Full-arch rehabilitation — All on 4, All on 6, All on X. Immediate implant placement. Immediate loading. Delayed placement.',
    features:
      'Anatomically tapered body for progressive bone condensation and high insertion torque. Deep buttress threads for superior primary stability and compressive load transfer. Self-tapping cutting flutes for controlled advancement in challenging sites. Laser-Lok® collar promoting connective tissue attachment and crestal bone preservation. Platform-switched reduced collar minimising cortical stress. Conical internal hex connection with a stable biological seal. Compatible with guided and freehand workflows.',
  },
  'biohorizons tapered pro conical rbt': {
    indications:
      'D1, D2, D3, D4 bone types. Single tooth replacement. Multi-unit bridge. Immediate implant placement. All on 4, All on 6, All on X.',
    features:
      '7.5° deep conical connection — high positional stability, reduced micromovement, better force distribution. 6-cam indexing — multiple abutment positions, easy implant insertion. Tapered body design — bone condensation and high primary stability. Aggressive deep buttress threads — stronger mechanical retention, ideal for immediate protocols. Self-tapping apical flutes — controlled insertion and easier placement. Laser-Lok collar — connective tissue attachment and crestal bone preservation. Platform switching — reduces marginal bone loss and improves soft tissue esthetics. Single prosthetic platform — simplified full-arch workflow and inventory management.',
  },
  'biohorizons tapered short conical rbt': {
    indications:
      'Compromised bone height of 9, 9.5, or 10 mm. Single conventional implant placement. Multi-unit bridge.',
    features:
      'Short implant design (6.0 mm / 7.5 mm) developed for reduced vertical bone availability. Tapered body geometry enhances insertion torque and primary stability in limited bone volume. Aggressive thread profile improves bone engagement and mechanical retention in compromised sites. Deep internal conical connection reduces micromovement and improves abutment stability. Platform-switching configuration supports preservation of crestal bone and peri-implant soft tissue architecture. Laser-Lok® collar with RBT body surface promotes connective tissue attachment and predictable osseointegration. Reduced / conventional drilling protocols allow bone-density-specific osteotomy preparation. Freehand and guided surgery compatibility improves surgical versatility.',
  },
  'biohorizons tapered im': {
    indications:
      'Immediate molar implant placement in 16, 17, 26, 27, 36, 37, 46, 47 regions. Wide posterior ridges. High occlusal load posterior zones.',
    features:
      'Large-diameter implant design for fresh molar extraction sockets. Aggressive buttress threads for rapid socket engagement and primary stability. Narrow collar helps maintain the insertion path during seating. Platform-switching to a 5.7 mm restorative platform. Laser-Lok surface for crestal bone retention.',
  },
  'biohorizons tapered short': {
    indications: 'Indicated for 8, 9, 10 mm bone height in 16, 17, 26, 27, 36, 37, 46, 47 regions.',
    features:
      'Short length design (6.0 / 7.5 mm) for reduced vertical bone availability. Tapered body + aggressive thread profile for stability in limited bone. Platform-switched Laser-Lok collar for bone preservation. Compatible with a fully guided surgery workflow. May reduce the need for vertical grafting or sinus augmentation.',
  },
  'biohorizons narrow diameter': {
    indications: 'Indicated for 12, 22, 31, 32, 33, 41, 42, 43 with narrow spaces.',
    features:
      'Reduced diameter implant for limited mesiodistal or ridge width cases. Tapered body with buttress threads for enhanced stability despite narrow diameter. Laser-Lok surface for long-term tissue stability.',
  },
  'conelog progressive line': {
    indications:
      'Single-tooth replacement. Fixed bridges. Full-arch rehabilitation — All on 4, All on 6, All on X. Immediate implant placement. Immediate loading. Delayed placement. Limited bone height.',
    features:
      'Deep internal conical connection — reduced micromovement, high positional stability, precise fit. Integrated platform switching — supports crestal bone preservation. Bone-level design — suitable for crestal/subcrestal placement and esthetic tissue shaping. Tapered body — improved primary stability and bone condensation. Buttress + coronal anchoring threads — enhanced cortical fixation and load distribution. Promote® / Promote® Plus surface — predictable and rapid osseointegration. Designed for immediate protocols — high insertion stability for immediate restoration/loading. 3.3 mm narrow implant option — for reduced spaces and narrow ridges. 7 mm short implant option — for limited vertical bone height. Flexible surgical protocol — soft bone, standard, and dense bone drilling options. Digital workflow compatible — guided surgery and CAD/CAM prosthetics.',
  },
  'bredent mini 2 sky': {
    indications: 'Narrow ridge — 3 mm, 3.5 mm, 4 mm of bone width in 31, 32, 41, 42 regions.',
    features:
      'Reduced diameter implant for narrow ridges and limited mesiodistal spaces. 5° rotation-locked conical implant–abutment connection reduces screw loosening. Three-stage functional design: cortical relief, central stabilisation, apical guidance tip. Hydrophilic ocs® surface for predictable bone healing. Suitable for prosthesis fixation systems (O-ring / retention attachments).',
  },
  'bredent copa sky': {
    indications:
      'Indicated in 35, 36, 37, 45, 46, 47 regions with 6, 7, or 8 mm of bone height (compromised bone height).',
    features:
      'Short, wide-body implant designed for wide ridges with reduced vertical bone height. Tissue-level restorative concept minimising subcrestal manipulation. Two prosthetic shoulder options (F05 / F15) based on gingival thickness. May reduce the need for sinus lift or vertical augmentation. Optimised load distribution in posterior regions.',
  },
  'bredent narrow sky': {
    indications: 'Narrow ridges with 4 mm, 4.5 mm, 5 mm bone width in 12, 22, 31, 32, 41, 42 regions.',
    features:
      'Reduced diameter implant preserving buccolingual bone volume. Compatible with SKY prosthetic platform. Thread design optimised for atraumatic placement and primary stability. Suitable for minimally invasive treatment in narrow spaces.',
  },
  'bredent blue sky': {
    indications:
      'Conventional implant placement. Immediate implant placement. Single crowns, bridges, and full-arch prostheses. Soft to medium density bone.',
    features:
      'Root-form implant with tapered macrodesign for enhanced primary stability. Aggressive thread geometry suitable for immediate loading protocols. Osseo Connect Surface (ocs®) with hydrophilic microstructured topography for accelerated osseointegration. Internal conical connection for stable prosthetic fit and reduced micromovement. Broad prosthetic compatibility for single, partial, and full-arch rehabilitation.',
  },
  'bredent sky classic': {
    indications: 'D1, D2 bone types. Conventional single implant placement. Multi-unit bridges.',
    features:
      'Cylindrical parallel-wall implant design for controlled insertion in dense bone. Proven conventional implant geometry with broad clinical versatility. Shared prosthetic ecosystem with BlueSky platform. Reliable load transfer in healed mature bone sites.',
  },
  'b&b dental ev line': {
    indications:
      'D3 and D4 bone. Immediate implants with immediate loading. Sites requiring bone condensation and high primary stability.',
    features:
      'Aggressive self-tapping double-thread design. High insertion torque with osteocondensation effect. Penetrating apical tip for secure anchorage. Reverse taper collar with annular microsplines for crestal bone preservation. Morse taper + internal hex connection for bacterial seal and prosthetic stability.',
  },
  'b&b dental 3p': {
    indications: 'D1 and D2 bone types.',
    features:
      'Triple-thread spiral with 60° bevelled profile. Rounded "bone-friendly" apex reduces sinus membrane perforation risk. Increased bone-to-implant contact surface. Collar micro-threading reduces crestal stress. Morse taper + internal hex precision connection.',
  },
  'b&b dental 3p long': {
    indications: 'Indicated for Pterygoid Implant.',
    features: '',
  },
  'b&b dental wide line': {
    indications:
      'Indicated for immediate extraction in 16, 17, 26, 27, 36, 37, 46, 47. Indicated when adequate bone width (8 mm, 9 mm, 10 mm) is available with limited bone height.',
    features:
      'Wide diameter body (5.5–6.0 mm) for socket adaptation. Parallel-taper macrodesign for immediate post-extraction fit. Triple-thread spiral enhances osseointegration. Bone-friendly rounded apex. Reverse taper collar improves soft tissue support and crestal bone maintenance.',
  },
  'b&b dental dura-vit slim': {
    indications:
      'Indicated for narrow ridge — 4 mm, 4.5 mm, 5 mm bone width. Indicated for 31, 32, 33, 41, 42, 43 regions.',
    features:
      'Reduced diameter implants (Ø3.0 / Ø3.4 mm). Conical-hex connection with increased implant-abutment contact area. High prosthetic stability despite narrow diameter. Self-tapping double-thread or triple-thread options based on diameter. Dedicated intuitive surgical and prosthetic protocol.',
  },
};

/** Normalise `${brand} – ${system}` so spacing / hyphen / case variants resolve. */
export function keyOf(brand?: string, system?: string): string {
  const raw = `${brand || ''} ${system || ''}`.toLowerCase();
  return raw
    .replace(/[\u2013\u2014]/g, '-') // en/em-dash → hyphen
    .replace(/[^a-z0-9& ]+/g, ' ')   // strip dots, commas, slashes, parens
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Look up indications + features for a system. Returns null if no match,
 * so the UI can simply not render the card. Lookup is fuzzy on key prefix
 * to tolerate small naming drift between the dropdown label and the doc.
 */
export function getImplantDetails(brand?: string, system?: string): ImplantSystemDetail | null {
  if (!brand && !system) return null;
  const key = keyOf(brand, system);
  if (IMPLANT_SYSTEM_DETAILS[key]) return IMPLANT_SYSTEM_DETAILS[key];
  // Fuzzy: try prefix match against known keys (handles e.g. "neodent helix gm acqua 4.0 x 11.5").
  for (const k of Object.keys(IMPLANT_SYSTEM_DETAILS)) {
    if (key.startsWith(k) || k.startsWith(key)) return IMPLANT_SYSTEM_DETAILS[k];
  }
  return null;
}
