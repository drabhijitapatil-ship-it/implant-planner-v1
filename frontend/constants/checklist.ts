export const CHECKLIST_DATA = {
  pre_surgical: {
    title: 'Phase 1: Pre-Surgical Protocol',
    items: [
      { id: 'case_selection', label: 'Case Selection Approved',
        tooltip: 'The case has been screened and accepted by the faculty for implant therapy. Inclusion criteria met: adequate residual bone (CBCT-verified), favourable interarch space, controlled systemic disease, patient compliance, and realistic prosthetic expectations. Documented in the case selection form.' },
      { id: 'academic_readiness', label: 'Approved Academic Readiness with Presentation', hasUpload: true, uploadTypes: 'PPT, PDF',
        tooltip: 'PG student has presented the case (history, diagnosis, treatment plan options, prosthetic plan, surgical plan, risk assessment) before the implant-planning committee or assigned faculty. Presentation PPT/PDF uploaded.' },
      { id: 'hematological', label: 'Hematological Investigations Completed',
        tooltip: 'Standard pre-surgical panel done within the last 30 days: CBC, PT/INR, BT/CT, RBS/FBS, HbA1c (diabetics), HIV/HBsAg/HCV, S. creatinine. Add ECG + cardiology clearance for cardiac history, BP > 140/90, or age > 60. All reports filed.' },
      { id: 'radiographic', label: 'Radiographic Investigations and Evaluation Done',
        tooltip: 'At minimum: IOPA at the implant site + OPG. CBCT mandatory for posterior maxilla (sinus proximity), posterior mandible (IAN canal), and full-arch cases. Bone height, width, density (HU), and adjacent vital structure distances measured and documented.' },
      { id: 'treatment_plan', label: 'Approved Surgical Treatment Plan',
        tooltip: 'Final surgical plan signed off by the supervisor + implant in-charge. Includes: implant brand/system, implant position(s) using FDI notation, diameter, length, flap design, drilling protocol, augmentation needs (GBR / sinus lift), and immediate vs delayed placement decision.' },
      { id: 'oral_prophylaxis', label: 'Oral Prophylaxis Done',
        tooltip: 'Scaling and root planing completed at least 7-14 days before surgery. Plaque index < 20%, BoP < 20%, no active periodontitis at adjacent teeth. Oral hygiene reinforcement done.' },
      { id: 'instruments', label: 'Availability of the Instruments and Equipment',
        tooltip: 'Sterile surgical kit verified: implant motor + handpiece, drill sequence for the chosen system, surgical kit (mucoperiosteal elevators, retractors, suction), implant inventory of correct size, healing abutments, sutures, irrigation saline, drape & gown. Backup implant size available.' },
      { id: 'medical_assessment', label: 'Medical Assessment Done',
        tooltip: 'Updated medical history + ASA classification recorded. Comorbidities flagged (uncontrolled diabetes, bisphosphonate therapy, immunosuppression, bleeding disorders, radiation therapy). Anaesthesia plan finalised. Physician clearance obtained where indicated.' },
      { id: 'realguide', label: 'Virtual Implant Planning Done (Exoplan, CoDiagnostiX, RealGuide etc.)',
        tooltip: 'CBCT DICOM imported into planning software; implant position virtually placed; bone width + height + distance to vital structures verified; surgical guide designed (if guided surgery). Planning report PDF generated and uploaded.' },
      { id: 'pre_op_medication', label: 'Pre-operative Medication Prescription Completed',
        tooltip: 'Prophylactic antibiotic. NSAID + antiseptic mouthwash prescribed. Sedation if required. Allergies & contraindications cross-checked.' },
      { id: 'payment', label: 'Full Payment Done',
        tooltip: 'Receipt issued and amount entered in the Payment Details section above. Patient / guardian briefed on package inclusions / exclusions.' },
    ],
  },
  surgical: {
    title: 'Phase 2: Surgical Protocol',
    // ── Pre-Surgical Checklist (iter-189) ──────────────────────
    // Sectioned items with `mandatory` flag. Items without the flag
    // are optional — the user ticks only what applies to the case.
    // The Pre-Op endpoint (POST /procedures/{id}/phase2-preop) requires
    // every `mandatory: true` row to be checked before stamping
    // `phase2_preop_completed_at`. The Surgical Procedure block remains
    // soft-locked until that stamp exists.
    sections: [
      {
        title: 'Patient readiness',
        items: [
          { id: 'patient_id_consent_verified', label: 'Patient identity & consent re-verified (name + DOB)', mandatory: true,
            tooltip: 'Confirm patient identity using two identifiers (full name + DOB) before the timeout. Re-read the signed informed consent — site, implant brand, sedation plan, augmentation, post-op risks must match what is scheduled today.' },
          { id: 'allergies_meds_reviewed', label: 'Allergies & current medications reviewed',
            tooltip: 'Re-confirm drug allergies (penicillin, latex, local anaesthetic agents). Review current medications — anticoagulants, antiplatelets, bisphosphonates, immunosuppressants. Hold or bridge as per physician advice.' },
          { id: 'vitals_ok', label: 'Vitals OK (BP, pulse; blood glucose if diabetic)', mandatory: true,
            tooltip: 'Acceptable ranges: BP < 160/100, pulse 60-100, SpO₂ ≥ 95%. For diabetics: blood glucose 80-180 mg/dL (HbA1c ideally ≤ 7%). Defer surgery if outside range and consult physician.' },
          { id: 'preop_antibiotic', label: 'Pre-op antibiotic given (if indicated)',
            tooltip: 'Prophylactic antibiotic given as per institutional SOP. Indicated for routine implant placement, augmentation, immunocompromised patients, or per institutional SOP. Document drug, dose, time.' },
          { id: 'preop_chx_rinse', label: 'Pre-op chlorhexidine rinse done (1 min)', mandatory: true,
            tooltip: 'Chlorhexidine rinse for 60 seconds immediately before surgery. Reduces oral bacterial load substantially. Avoid eating / drinking after rinse and before draping.' },
        ],
      },
      {
        title: 'Imaging and planning',
        items: [
          { id: 'imaging_chairside', label: 'Latest CBCT / OPG / IOPA available chairside', mandatory: true,
            tooltip: 'Current radiographs (CBCT for posterior / full-arch, OPG / IOPA at minimum) loaded on the operatory screen. Confirm bone width, height, distance to IAN canal / sinus floor / adjacent roots before incision.' },
          { id: 'surgical_guide_fit', label: 'Surgical guide present (if guided) — fit verified on cast/intraoral',
            tooltip: 'For guided surgery: try-in the surgical guide on the cast and intraorally before drilling. Verify stable seating, no rocking, sleeves visible, and adequate mouth opening. Sterilise per manufacturer protocol.' },
          { id: 'drilling_sequence_ready', label: 'Drilling sequence printed and displayed', mandatory: true,
            tooltip: 'Manufacturer-specific drill sequence (pilot → twist → tap → countersink) printed and visible at chairside. Confirm drill speeds and irrigation rate. Diameter and length escalation must match the planned implant.' },
        ],
      },
      {
        title: 'Inventory verification',
        items: [
          { id: 'implant_verified', label: 'Implant — brand, system, diameter, length verified', mandatory: true,
            tooltip: 'Read-back protocol: surgeon and nurse both verify the implant label — brand, system, diameter, length, lot number, expiry — before opening the sterile package. Backup size (one wider, one longer) must also be available.' },
          { id: 'healing_abutment_available', label: 'Healing abutment available',
            tooltip: 'Compatible healing abutment with appropriate cuff height (3-5 mm typical) ready. Confirm platform match (e.g. RP / WP) and connection type (internal hex / conical).' },
          { id: 'multiunit_abutments_available', label: 'Multiunit abutments available',
            tooltip: 'For full-arch / immediate-load cases: multiunit abutments of planned angulation (0°, 17°, 30°) and cuff height available. Verify torque values from manufacturer (typically 15-30 Ncm).' },
          { id: 'drilling_kit_sterile', label: 'Implant Specific Drilling kit complete & sterile (expiry checked)', mandatory: true,
            tooltip: 'Verify drilling kit is autoclaved, indicator strip changed, expiry date valid. Confirm all drills (pilot, twist, profile, countersink, tap) and ratchet/driver components are present and undamaged.' },
          { id: 'physiodispenser_ready', label: 'Physiodispenser ready and working', mandatory: true,
            tooltip: 'Implant motor calibrated. Drill speeds set (typically 800-1500 rpm pilot, 50 rpm for tapping). Torque limit set as per surgical plan. Foot pedal tested. Backup motor accessible.' },
          { id: 'instruments_autoclaved', label: 'Instruments autoclaved and ready', mandatory: true,
            tooltip: 'Surgical kit (mucoperiosteal elevators, retractors, periotome, periosteal elevator, suction tip, needle holder, scissors) all autoclaved and laid out on the sterile tray.' },
          { id: 'bone_graft_membrane', label: 'Bone graft / membrane (if planned) — type, lot, expiry',
            tooltip: 'For augmentation cases: confirm graft material (autograft / allograft / xenograft / alloplast), membrane type (resorbable / non-resorbable), lot number, and expiry. Hydration / mixing per manufacturer.' },
          { id: 'sutures_ready', label: 'Sutures (type, size) ready',
            tooltip: 'Standard implant suturing: 4-0 or 5-0 non-resorbable for primary closure; resorbable suture material where indicated. Cutting needle for keratinised tissue, reverse cutting for thin mucosa.' },
          { id: 'saline_irrigation', label: 'Saline irrigation available & connected', mandatory: true,
            tooltip: 'Sterile 0.9% saline (chilled to 4°C ideally) connected to the physiodispenser. Irrigation rate ≥ 50 ml/min during drilling. Prevents thermal necrosis (keep bone temp < 47°C for 1 min).' },
        ],
      },
      {
        title: 'Operatory and team',
        items: [
          { id: 'aseptic_field_draped', label: 'Aseptic field draped', mandatory: true,
            tooltip: 'Sterile drapes covering patient, headrest, instrument tables. Surgical team in scrub attire (gown, gloves, mask, cap, eye protection). Clear delineation between sterile and non-sterile zones.' },
          { id: 'suction_tested', label: 'Suction tested', mandatory: true,
            tooltip: 'High-volume and surgical suction both tested. Suction tip changed to sterile. Backup suction available. Saliva ejector in place if patient comfortable.' },
          { id: 'team_briefed', label: 'Assistant & team briefed on case', mandatory: true,
            tooltip: 'WHO-style surgical safety briefing: case overview, implant plan, anticipated difficulties, augmentation needs, escalation plan, allergies, and emergency protocol. Everyone confirms understanding.' },
          { id: 'emergency_drugs', label: 'Emergency drugs available',
            tooltip: 'Crash cart accessible: adrenaline 1:1000, atropine, hydrocortisone, salbutamol inhaler, glucose, glyceryl trinitrate, antihistamine. Oxygen cylinder + AED tested. Emergency contact numbers posted.' },
        ],
      },
    ],
    // Flat list kept for any legacy code path that iterates items[]
    items: [],
  },
  second_stage: {
    title: 'Phase 3: Second Stage Surgical Protocol',
    items: [
      { id: 'components_available', label: 'All Components Available (Second stage and Prosthetic)' },
      { id: 'implant_site_exam', label: 'Implant site examination done' },
      { id: 'radiograph_made', label: 'Radiograph Made' },
      { id: 'isq_checked', label: 'Implant ISQ value checked', hasTextInput: true, textLabel: 'ISQ Value' },
      { id: 'healing_abutment', label: 'Healing Abutment Placed', hasTextInput: true, textLabel: 'Cuff height (mm)' },
      { id: 'prosthetic_plan_eval', label: 'Prosthetic Plan Evaluated and Finalized' },
    ],
  },
  prosthetic_phase: {
    title: 'Phase 4: Prosthetic Protocol',
    step1: {
      title: 'Step 1: Final Prosthesis and Impressions',
      items: [
        { id: 'payment_complete', label: 'Complete Payment Done' },
        { id: 'prosthetic_components', label: 'All Prosthetic Components are Available' },
      ],
      impressionOptions: [
        { id: 'intraoral_scans', label: 'Intra-Oral Scans Made' },
        { id: 'conventional_impressions', label: 'Conventional Impressions Made' },
      ],
    },
    step2: {
      title: 'Step 2: Trial and Prosthesis Delivery',
      items: [
        { id: 'jig_trial_sheffield', label: "Jig Trial Done - Sheffield's Test" },
        { id: 'jig_trial_radiographic', label: 'Jig Trial Done - Radiographic Assessment' },
        { id: 'prosthesis_trial', label: 'Prosthesis Trial Done' },
        { id: 'occlusion_eval', label: 'Occlusion Evaluation Done' },
        { id: 'final_placement', label: 'Final Placement of Prosthesis Done' },
      ],
    },
  },
};

// Time slots available for procedures
export const PROCEDURE_TIME_SLOTS = [
  { value: '10:00', label: '10:00 AM', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] },
  { value: '14:00', label: '2:00 PM', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
];

// ─── Procedure Type Options ───────────────────────────
export const PROCEDURE_TYPES = [
  'Single Conventional Implant',
  'Multiple Conventional Implants',
  'Immediate Implant',
  // iter-329: per user feedback, Sinus Lift sits between Immediate
  // Implant and Partial Extraction Therapy in the picker — places
  // grafting-heavy adjunctive procedures together in the list.
  'Sinus Lift',
  'Partial Extraction Therapy',
  'Implant Placement with Guided Bone Regeneration',
  'Guided Surgery',
  'All on 4',
  'All on 6',
  'All on X',
  // iter-213: "Existing Implant" branch — patient already has implants
  // placed (elsewhere / earlier) and needs prosthetic continuation.
  // The form swaps the surgical sections for an existing-implant
  // wizard (FDI inventory, brand/system auto-fill, present prosthetic
  // component, prosthetic history, radiographs, phase-routing).
  'Existing Implant',
];

// iter-328: FDI codes where Sinus Lift is clinically appropriate
// (maxillary posterior only). The procedure adds bone via the
// maxillary sinus floor — irrelevant for the mandible or maxillary
// anterior. Mark-on-FDI charting blocks progression when any tooth
// outside this set is selected together with Sinus Lift.
export const SINUS_LIFT_VALID_TEETH = new Set<string>([
  '14', '15', '16', '17', '24', '25', '26', '27',
]);

/** Returns the offending FDI codes, or [] if every marked tooth is sinus-lift-appropriate. */
export function getInvalidSinusLiftTeeth(teeth: string[] | undefined | null): string[] {
  if (!teeth || teeth.length === 0) return [];
  return teeth.filter(t => !SINUS_LIFT_VALID_TEETH.has(String(t)));
}

// Group A: Shows Edentulous Site in clinical exam
export const CLINICAL_EXAM_GROUP = new Set([
  'Single Conventional Implant',
  'Multiple Conventional Implants',
  'Implant Placement with Guided Bone Regeneration',
  'Guided Surgery',
  'Immediate Implant',
  'Partial Extraction Therapy',
  // iter-330: Sinus Lift is a non-full-arch grafting procedure that
  // ALSO requires the standard Edentulous Site clinical exam (oc/md
  // span + ridge contour) — same as Immediate / PET / GBR. Omitting
  // it caused the Step 1 "Continue" button to deadlock because the
  // validator demanded clinical-exam fields whose UI never rendered.
  'Sinus Lift',
]);

// Procedure type groupings for conditional UI
export const SINGLE_GROUP = new Set([
  'Single Conventional Implant',
]);

export const MULTIPLE_GROUP = new Set([
  'Multiple Conventional Implants',
  'Immediate Implant',
  'Partial Extraction Therapy',
  'Implant Placement with Guided Bone Regeneration',
  // Guided Surgery is a non-full-arch procedure typically used for multi-
  // implant cases. It qualifies for the same Bridge / Overdenture-with-
  // Attachment prosthetic plans, so we fold it into the Multiple group here
  // (iter-137). Single-tooth guided surgery remains uncommon in this program.
  'Guided Surgery',
]);

export const FULL_ARCH_GROUP = new Set([
  'All on 4',
  'All on 6',
  'All on X',
]);

// All non-full-arch procedures (for Occlusal Analysis + Aesthetic Risk)
export const NON_FULL_ARCH_TYPES = new Set([
  'Single Conventional Implant',
  'Multiple Conventional Implants',
  'Immediate Implant',
  'Partial Extraction Therapy',
  'Implant Placement with Guided Bone Regeneration',
  'Guided Surgery',
  // iter-330: Sinus Lift is also a non-full-arch procedure — it lifts
  // the sinus floor for a localised group of maxillary posterior teeth,
  // never the entire arch. Keeping this consistent ensures Occlusal
  // Analysis + Aesthetic Risk sections behave identically.
  'Sinus Lift',
]);

// ─── Clinical Examination Dropdowns ───────────────────
export const EDENTULOUS_SITE_OPTIONS = [
  'Sufficient Occlusocervical Space',
  'Sufficient Mesiodistal Space',
  'Insufficient Occlusocervical Space',
  'Insufficient Mesiodistal Space',
];

export const ARCH_CONDITION_OPTIONS = [
  'High Well Formed',
  'Medium Well Formed',
  'Low Well Formed',
  'Resorbed',
];

export const RIDGE_CONTOUR_OPTIONS = [
  'Well Contoured',
  'Medium Contoured',
  'Low Contoured',
];

export const SOFT_TISSUE_OPTIONS = ['Thick', 'Thin'];
export const KERATINIZED_MUCOSA_OPTIONS = ['Present', 'Absent'];

// Occlusal Analysis (for non-full-arch types)
export const OCCLUSAL_SCHEME_OPTIONS = ['Canine Guided', 'Group Function', 'Mutually Protected'];
export const PARAFUNCTION_HABIT_OPTIONS = ['Present', 'Absent'];
export const VERTICAL_DIMENSION_OPTIONS = ['Sufficient', 'Compromised'];
export const OPPOSING_DENTITION_OPTIONS = ['Natural', 'Absent', 'Implant Prosthesis'];

// Occlusal Analysis (for full-arch types)
export const TMJ_OPTIONS = ['Normal', 'Deviation Present'];

// Aesthetic Risk Assessment (for non-full-arch types)
export const SMILE_LINE_OPTIONS = ['Low', 'Medium', 'High'];
export const GINGIVAL_BIOTYPE_OPTIONS = ['Thin', 'Thick'];

// ─── Medical Assessment Risk Factors ──────────────────
export const MEDICAL_RISK_FACTORS = [
  { id: 'diabetes', label: 'Diabetes', options: ['No', 'Controlled', 'Uncontrolled'] },
  { id: 'smoking', label: 'Smoking Status', options: ['No', 'Light (<10/day)', 'Heavy (>10/day)'] },
  { id: 'anticoagulant', label: 'Anticoagulant Therapy', options: ['No', 'Yes'] },
  { id: 'osteoporosis', label: 'Osteoporosis Medication (Bisphosphonates)', options: ['No', 'Yes'] },
  { id: 'radiation', label: 'Radiation Therapy (Head & Neck)', options: ['No', 'Yes'] },
];

export function calculateMedicalRisk(factors: Record<string, string>): { level: string; color: string; score: number; warnings: string[] } {
  if (!factors || Object.keys(factors).length === 0) {
    return { level: 'Low Risk', color: '#4CAF50', score: 1, warnings: [] };
  }

  const warnings: string[] = [];

  // Per-factor scoring
  const scores: Record<string, number> = {};
  // Diabetes: No=1, Controlled=2, Uncontrolled=3
  const diabetes = factors.diabetes || 'No';
  if (diabetes === 'Uncontrolled') { scores.diabetes = 3; warnings.push('Uncontrolled diabetes - delay implant until glycemic control achieved'); }
  else if (diabetes === 'Controlled') { scores.diabetes = 2; }
  else { scores.diabetes = 1; }

  // Smoking: No=1, Light=2, Heavy=3
  const smoking = factors.smoking || 'No';
  if (smoking.startsWith('Heavy')) { scores.smoking = 3; warnings.push('Heavy smoking - smoking cessation protocol required'); }
  else if (smoking.startsWith('Light')) { scores.smoking = 2; }
  else { scores.smoking = 1; }

  // Anticoagulant: No=1, Yes=2
  scores.anticoagulant = factors.anticoagulant === 'Yes' ? 2 : 1;
  if (factors.anticoagulant === 'Yes') warnings.push('Coordinate with physician for anticoagulant management');

  // Osteoporosis: No=1, Yes=3 (MRONJ risk)
  scores.osteoporosis = factors.osteoporosis === 'Yes' ? 3 : 1;
  if (factors.osteoporosis === 'Yes') warnings.push('MRONJ risk - evaluate bisphosphonate therapy duration');

  // Radiation: No=1, Yes=3 (Osteoradionecrosis risk)
  scores.radiation = factors.radiation === 'Yes' ? 3 : 1;
  if (factors.radiation === 'Yes') warnings.push('Osteoradionecrosis risk - assess radiation dose and field');

  // HbA1c numeric override (iter-315): crosses 9% → force High Risk
  // regardless of categorical diabetes selection. Mirrors the hard-block
  // threshold used by the deterministic clinical-rule engine
  // (`clinical_rules/rules.py::diabetic_stack`, ITI 2023 Group 3 consensus).
  const hba1cRaw = factors.hba1c;
  if (hba1cRaw !== undefined && hba1cRaw !== null && String(hba1cRaw).trim() !== '') {
    const hba1cNum = parseFloat(String(hba1cRaw));
    if (!isNaN(hba1cNum) && hba1cNum >= 9) {
      scores.hba1c = 3;
      warnings.push(`HbA1c ${hba1cNum.toFixed(1)}% — uncontrolled glycaemia (≥9%); defer surgery and refer for medical optimisation (ITI 2023)`);
    } else if (!isNaN(hba1cNum) && hba1cNum > 7) {
      scores.hba1c = 2;
      warnings.push(`HbA1c ${hba1cNum.toFixed(1)}% — above predictable-osseointegration threshold (>7%); proceed with caution`);
    }
  }

  // Override: force HIGH if any factor is 3
  const hasHighRiskFactor = Object.values(scores).some(s => s === 3);
  if (hasHighRiskFactor) {
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    return { level: 'High Risk', color: '#DC3545', score: totalScore, warnings };
  }

  // Count elevated factors (score > 1)
  const elevatedCount = Object.values(scores).filter(s => s > 1).length;
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

  if (elevatedCount === 0) return { level: 'Low Risk', color: '#4CAF50', score: totalScore, warnings };
  if (elevatedCount === 1) return { level: 'Moderate Risk', color: '#FF9800', score: totalScore, warnings };
  return { level: 'High Risk', color: '#DC3545', score: totalScore, warnings };
}

// ─── Loading Type Options ─────────────────────────────
export const LOADING_TYPES = [
  'Immediate Loading',
  'Early Loading',
  'Delayed Loading',
];

// ─── Prosthetic Plan Conditional Logic ────────────────
const SINGLE_CROWN_OPTIONS = [
  'Cement Retained Crown - Metal',
  'Cement Retained Crown - Porcelain Fused to Metal',
  'Cement Retained Crown - Zirconia',
  'Cement Retained Crown - Lithium Disilicate',
  'Screw Retained Crown - Metal',
  'Screw Retained Crown - Porcelain Fused to Metal',
  'Screw Retained Crown - Zirconia',
  'Screw Retained Crown - Lithium Disilicate',
  'Zirconia Abutment Ti Base',
  'Custom Abutment',
];

const BRIDGE_OPTIONS = [
  'Cement Retained Bridge - Metal',
  'Cement Retained Bridge - Porcelain Fused to Metal',
  'Cement Retained Bridge - Zirconia',
  'Cement Retained Bridge - Lithium Disilicate',
  'Screw Retained Bridge - Metal',
  'Screw Retained Bridge - Porcelain Fused to Metal',
  'Screw Retained Bridge - Zirconia',
  'Screw Retained Bridge - Lithium Disilicate',
  'Overdenture with Attachment',
  'Malo Prosthesis with MUA',
  'Zirconia Abutment Ti Base',
  'Custom Abutments',
];

const IMMEDIATE_LOADING_OPTIONS = [
  'PMMA Crown with Temporary Abutment',
  'PMMA Crown with Ti-Base',
  'Full Arch Temporary Prosthesis with Multiunit Abutments and Temporary Cylinders',
  'Temporary PMMA CAD Prosthesis with Multiunit Abutments and Temporary Cylinders',
  'Temporary PMMA CAD Prosthesis on Ti-Base',
];

const FULL_ARCH_OPTIONS = [
  'Full Arch - Co-Cr Framework - Porcelain Fused to Metal Prosthesis',
  'Full Arch - Co-Cr Framework - Zirconia Prosthesis',
  'Full Arch - Titanium Framework - Zirconia Prosthesis',
  'Full Arch - Peek and Zirconia Ti Base',
];

// iter-307: Multi-Single-Crown options used by `Multiple Conventional
// Implants` AND by the 4 non-conventional procedure types when the
// clinician picks "Multiple Implants" in the new sub-question
// (Immediate / PET / GBR / Guided Surgery).
// Lithium Disilicate variants (iter-307) added per user request — they
// apply uniformly to every multi-implant scenario.
export const MULTIPLE_SINGLE_CROWN_OPTIONS = [
  'Screw Retained Multiple Single Crowns - Zirconia',
  'Screw Retained Multiple Single Crowns - Metal',
  'Screw Retained Multiple Single Crowns - Porcelain Fused to Metal',
  'Screw Retained Multiple Single Crowns - Lithium Disilicate',
  'Cement Retained Multiple Single Crowns - Zirconia',
  'Cement Retained Multiple Single Crowns - Metal',
  'Cement Retained Multiple Single Crowns - Porcelain Fused to Metal',
  'Cement Retained Multiple Single Crowns - Lithium Disilicate',
];

// iter-307: the 4 procedure types that now carry the per-case
// "Number of Implants" sub-question. When this sub-question is
// answered, the prosthetic-plan dropdown re-uses the Single-Conventional
// or Multiple-Conventional option set verbatim.
export const PROCEDURES_WITH_NUM_IMPLANTS_QUESTION = new Set<string>([
  'Immediate Implant',
  'Partial Extraction Therapy',
  'Implant Placement with Guided Bone Regeneration',
  'Guided Surgery',
  // iter-328: Sinus Lift cascades a Number-of-Implant sub-question
  // identical in shape to the four procedures above (the answer
  // drives Prosthetic Plan re-derivation).
  'Sinus Lift',
]);

export function getProstheticOptions(
  procedureType: string,
  loadingTypes: string[],
  numImplants: string = '',
): string[] {
  const options: string[] = [];

  // iter-307: For the 4 affected procedure types, the option set is
  // driven entirely by the Number-of-Implants sub-question. Gate the
  // dropdown until the sub-question is answered.
  if (PROCEDURES_WITH_NUM_IMPLANTS_QUESTION.has(procedureType)) {
    if (numImplants === 'Single Implant') {
      options.push(...SINGLE_CROWN_OPTIONS);
    } else if (numImplants === 'Multiple Implants') {
      for (const o of BRIDGE_OPTIONS) {
        if (!options.includes(o)) options.push(o);
      }
      for (const o of MULTIPLE_SINGLE_CROWN_OPTIONS) {
        if (!options.includes(o)) options.push(o);
      }
    }
    // Loading-type extras still apply (Immediate / Delayed loading
    // adds PMMA/temp options) — but only AFTER the sub-question is
    // answered so we don't surface dangling PMMA options.
    if (options.length > 0 && loadingTypes.includes('Immediate Loading')) {
      for (const o of IMMEDIATE_LOADING_OPTIONS) {
        if (!options.includes(o)) options.push(o);
      }
    }
    if (options.length > 0 && !options.includes('Other')) options.push('Other');
    return options;
  }

  // Single Conventional Implant → Crown options
  if (procedureType === 'Single Conventional Implant') {
    options.push(...SINGLE_CROWN_OPTIONS);
  }

  // Multiple → Bridge options
  if (MULTIPLE_GROUP.has(procedureType)) {
    for (const o of BRIDGE_OPTIONS) {
      if (!options.includes(o)) options.push(o);
    }
  }

  // Multiple Conventional Implants → also add Multiple Single Crown options
  if (procedureType === 'Multiple Conventional Implants') {
    for (const o of MULTIPLE_SINGLE_CROWN_OPTIONS) {
      if (!options.includes(o)) options.push(o);
    }
  }

  // Full-Arch → Full arch options
  if (FULL_ARCH_GROUP.has(procedureType)) {
    options.push(...FULL_ARCH_OPTIONS);
  }

  // Immediate or Delayed loading selected → PMMA/temp options
  if (loadingTypes.includes('Immediate Loading')) {
    for (const o of IMMEDIATE_LOADING_OPTIONS) {
      if (!options.includes(o)) options.push(o);
    }
  }

  // Always add "Other" at the end
  if (options.length > 0 && !options.includes('Other')) {
    options.push('Other');
  }

  return options;
}

// ─── Phase 2: Surgical Procedure Options ──────────────
export const FLAP_DESIGN_OPTIONS = [
  'Mid-crestal Incision',
  'Guided Surgery (Tissue Punch)',
  'Papilla Sparing Flap',
  'Two-Sided Flap',
  'Three-Sided (Trapezoidal) Flap',
];

export const DRILLING_TYPE_OPTIONS = [
  'Guided Surgery',
  'Free Hand Sequential Drilling',
  'Combination of Guided and Free Hand Sequential Drilling',
];

export const PROSTHETIC_COMPONENT_OPTIONS = [
  'Cover Screw Placed',
  'Healing Abutment Placed',
  'Immediate Loading Done',
];

// ─── Phase 4: Final Prosthesis Options ────────────────
export const PHASE4_SINGLE_MULTIPLE_OPTIONS = [
  'Cement Retained Crown FP1',
  'Cement Retained Crown FP2',
  'Cement Retained Crown FP3',
  'Screw Retained Crown FP1',
  'Screw Retained Crown FP2',
  'Screw Retained Crown FP3',
  'Cement Retained Bridge FP1',
  'Cement Retained Bridge FP2',
  'Cement Retained Bridge FP3',
  'Screw Retained Bridge FP1',
  'Screw Retained Bridge FP2',
  'Screw Retained Bridge FP3',
  'Overdenture with Attachment RP',
];

export const FP_MATERIAL_OPTIONS = ['Metal', 'Porcelain Fused to Metal', 'Zirconia', 'Lithium Disilicate'];

export const OVERDENTURE_ATTACHMENT_OPTIONS = [
  'Rheine 83 Equator Attachment',
  'Locator Attachment',
  'Sonator Attachment',
  'Other',
];

// ─── Phase 1: Type of Attachment (iter-137) ───────────
// Shown below the Prosthetic Plan dropdown when the plan is
// "Overdenture with Attachment". Brand-specific catalogue distinct from the
// Phase 4 generic OVERDENTURE_ATTACHMENT_OPTIONS above.
export const PHASE1_ATTACHMENT_TYPE_OPTIONS = [
  'Stud and Ball Attachment',
  'Locator - Zest Dental Solutions',
  'Locator R-Tx - Zest Dental Solutions',
  'Rheine 83 - OT Equator',
  'Novaloc - Straumann',
  'TiSi Snap - Bredent',
  'Bar Attachment',
  'Locator Bar',
  'Other',
];

export const PHASE4_FULL_ARCH_OPTIONS = [
  'Full Arch FP3 - Co-Cr Framework - Removable Complete Denture',
  'Full Arch FP3 - Porcelain Fused to Metal Prosthesis',
  'Full Arch FP3 - Co-Cr Framework - Zirconia Prosthesis',
  'Full Arch FP3 - Titanium Framework - Zirconia Prosthesis',
  'Full Arch FP3 - Peek Framework and Zirconia Ti Base',
  'Malo Prosthesis with MUA',
  'Zirconia Abutment Ti Base - Zirconia Prosthesis',
];

export const CUSTOM_ABUTMENT_OPTIONS = [
  'Custom Abutment - Metal',
  'Custom Abutment - Porcelain Fused to Metal',
  'Custom Abutment - Zirconia Prosthesis',
  'Custom Abutment - Lithium Disilicate Prosthesis',
  'Other',
];

// ─── Status Styling ───────────────────────────────────
export const STATUS_COLORS: Record<string, string> = {
  draft: '#78909C',
  pending_phase1: '#FFA500',
  phase1_approved: '#4CAF50',
  pending_phase2: '#FFD700',
  phase2_approved: '#2196F3',
  pending_stage2_surgical: '#FF9800',
  stage2_surgical_approved: '#8BC34A',
  stage2_surgical_rejected: '#F44336',
  pending_stage2_prosthetic: '#9C27B0',
  stage2_prosthetic_step1_approved: '#00BCD4',
  pending_final_delivery: '#FF5722',
  stage2_prosthetic_rejected: '#F44336',
  completed: '#4CAF50',
  approved: '#4CAF50',
  rejected: '#F44336',
  permanently_rejected: '#B71C1C',
};

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_phase1: 'Phase 1: Pending Approval',
  phase1_approved: 'Phase 1: Approved - Ready for Phase 2',
  pending_phase2: 'Phase 2: Pending Approval',
  phase2_approved: 'Phase 2 Approved - Ready for Phase 3',
  pending_stage2_surgical: 'Phase 3: Pending Approval',
  stage2_surgical_approved: 'Phase 3: Approved - Ready for Phase 4',
  stage2_surgical_rejected: 'Phase 3: Rejected',
  pending_stage2_prosthetic: 'Phase 4 Step 1: Pending Approval',
  stage2_prosthetic_step1_approved: 'Phase 4 Step 1: Approved - Ready for Step 2',
  pending_final_delivery: 'Phase 4 Step 2: Pending Approval',
  stage2_prosthetic_rejected: 'Phase 4: Rejected',
  completed: 'Treatment Complete',
  approved: 'Approved',
  rejected: 'Rejected',
  permanently_rejected: 'Permanently Rejected',
};

export const USER_ROLES = {
  student: 'Student',
  supervisor: 'Supervisor',
  implant_incharge: 'Implant Incharge',
  administrator: 'Administrator',
  nurse: 'Nurse',
};

export const ROLE_OPTIONS = [
  { value: 'student', label: 'Postgraduate Student' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'implant_incharge', label: 'Implant Incharge' },
  { value: 'administrator', label: 'Administrator' },
  { value: 'nurse', label: 'Nurse (Read-only)' },
];
