export const CHECKLIST_DATA = {
  pre_surgical: {
    title: 'Phase 1: Pre-Surgical Protocol',
    items: [
      { id: 'case_selection', label: 'Case Selection Approved' },
      { id: 'academic_readiness', label: 'Approved Academic Readiness with Presentation', hasUpload: true, uploadTypes: 'PPT, PDF' },
      { id: 'hematological', label: 'Hematological Investigations Completed' },
      { id: 'radiographic', label: 'Radiographic Investigations and Evaluation Done' },
      { id: 'treatment_plan', label: 'Approved Surgical Treatment Plan' },
      { id: 'oral_prophylaxis', label: 'Oral Prophylaxis Done' },
      { id: 'instruments', label: 'Availability of the Instruments and Equipment' },
      { id: 'medical_assessment', label: 'Medical Assessment Done' },
      { id: 'realguide', label: 'RealGuide Planning and Report Generated' },
      { id: 'pre_op_medication', label: 'Pre-operative Medication Prescription Completed' },
      { id: 'payment', label: 'Full Payment Done' },
    ],
  },
  surgical: {
    title: 'Phase 2: Surgical Protocol',
    items: [
      { id: 'consent_form', label: 'Signed Patient consent form (LA and Surgical)' },
      { id: 'vitals_checked', label: 'Patient vitals checked' },
      { id: 'drilling_protocol', label: 'Drilling Protocol Available' },
      { id: 'implant_kit', label: 'Implant Kit and Physiodispenser with irrigation Ready' },
      { id: 'drapes_gowns', label: 'Clean Autoclaved Drapes and Gowns' },
      { id: 'instruments_equipment', label: 'Clean Autoclaved Instruments and Equipment' },
      { id: 'asepsis', label: 'Asepsis, Fumigation, and Cleanliness of the Operatory' },
    ],
  },
  second_stage: {
    title: 'Phase 3: Second Stage Surgical Protocol',
    items: [
      { id: 'components_available', label: 'All Components Available (Second stage and Prosthetic)' },
      { id: 'implant_site_exam', label: 'Implant site examination done' },
      { id: 'radiograph_made', label: 'Radiograph Made' },
      { id: 'isq_checked', label: 'Implant ISQ value checked', hasTextInput: true, textLabel: 'ISQ Value (optional)' },
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
  'Partial Extraction Therapy',
  'Implant Placement with Guided Bone Regeneration',
  'Guided Surgery',
  'All on 4',
  'All on 6',
  'All on X',
];

// Group A: Shows Edentulous Site in clinical exam
export const CLINICAL_EXAM_GROUP = new Set([
  'Single Conventional Implant',
  'Multiple Conventional Implants',
  'Implant Placement with Guided Bone Regeneration',
  'Guided Surgery',
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
export const OPPOSING_DENTITION_OPTIONS = ['Natural', 'Absent'];

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

export function getProstheticOptions(procedureType: string, loadingTypes: string[]): string[] {
  const options: string[] = [];

  // Single Conventional Implant → Crown options
  if (procedureType === 'Single Conventional Implant') {
    options.push(...SINGLE_CROWN_OPTIONS);
  }

  // Multiple, Immediate, PET, GBR → Bridge options
  if (MULTIPLE_GROUP.has(procedureType)) {
    for (const o of BRIDGE_OPTIONS) {
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
