export const CHECKLIST_DATA = {
  pre_surgical: {
    title: 'Phase 1: Pre-Surgical Protocol',
    items: [
      { id: 'case_selection', label: 'Case Selection Approved' },
      { id: 'academic_readiness', label: 'Academic Readiness (with presentation)', hasUpload: true, uploadTypes: 'PPT, PDF' },
      { id: 'hematological', label: 'Hematological Investigations Completed', hasUpload: true, uploadTypes: 'PDF' },
      { id: 'radiographic', label: 'Radiographic Investigations and Evaluation Done', hasUpload: true, uploadTypes: 'PDF' },
      { id: 'treatment_plan', label: 'Approved Surgical Treatment Plan' },
      { id: 'oral_prophylaxis', label: 'Oral Prophylaxis Done' },
      { id: 'instruments', label: 'Availability of the Instruments and Equipment' },
      { id: 'medical_assessment', label: 'Medical assessment done' },
      { id: 'realguide', label: 'RealGuide Planning and Report' },
      { id: 'payment', label: 'Full payment done' },
    ],
  },
  surgical: {
    title: 'Phase 2: Surgical Protocol',
    items: [
      { id: 'consent_form', label: 'Signed Patient consent form (LA and Surgical)' },
      { id: 'drilling_protocol', label: 'Drilling Protocol Displayed' },
      { id: 'drapes_gowns', label: 'Clean Autoclaved Drapes and Gowns' },
      { id: 'instruments_equipment', label: 'Clean Autoclaved Instruments and Equipment' },
      { id: 'asepsis', label: 'Asepsis and Fumigation, Cleanliness of the Operatory' },
      { id: 'register_entry', label: 'Entry into the Implant Register with a Sticker' },
      { id: 'post_op_instructions', label: 'Post-operative Instructions and Medication Prescription' },
      { id: 'post_cleaning', label: 'Post-operative cleaning of implant room, instruments, and equipment' },
    ],
    additionalFields: [
      { id: 'student_notes', label: 'Post-Surgical Notes by Student' },
      { id: 'faculty_remark', label: 'Remarks by Faculty' },
    ],
  },
  second_stage: {
    title: 'Phase 3: Second Stage Surgical Protocol',
    items: [
      { id: 'faculty_approval', label: 'Approval by the Supervising Faculty' },
      { id: 'components_available', label: 'All Components Available (second stage and prosthetic)' },
      { id: 'healing_cap', label: 'Healing Cap Placed' },
      { id: 'scan_impressions', label: 'Scan/Impressions Made' },
      { id: 'temporary_prosthesis', label: 'Temporary Prosthesis Delivered' },
      { id: 'patient_consent', label: 'Patient consent' },
    ],
    additionalFields: [
      { id: 'student_clinical_assessment', label: 'Student Clinical Assessment' },
      { id: 'faculty_remark', label: 'Faculty Remark' },
    ],
  },
  prosthetic_phase: {
    title: 'Phase 4: Prosthetic Protocol',
    items: [
      { id: 'payment_complete', label: 'Complete Payment Done' },
      { id: 'prosthetic_components', label: 'All Prosthetic Components are Available' },
      { id: 'prosthetic_plan_approved', label: 'Final Prosthetic Plan Evaluated and Approved' },
      { id: 'sterile_instruments', label: 'Cleaned and Autoclaved Instruments' },
      { id: 'intraoral_scans', label: 'Intra-Oral Scans Made and Approved' },
      { id: 'impressions', label: 'Impressions Made and Approved' },
      { id: 'jig_trial', label: "Jig Trial Done - Sheffield's Test and Radiographic Assessment" },
      { id: 'occlusion_evaluated', label: 'Occlusion Evaluation Done' },
      { id: 'final_cementation', label: 'Final Cementation/Screwing of the Prosthesis' },
    ],
    additionalFields: [
      { id: 'student_remark', label: 'Student Remark' },
      { id: 'faculty_remark', label: 'Faculty Remark' },
      { id: 'incharge_remark', label: 'Implant Incharge Remark' },
    ],
  },
};

// Time slots available for procedures
// Monday-Friday: 10:00 AM, 2:00 PM
// Saturday: 9:30 AM only (updated as per spec)
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
  'Implant Placement with GBR',
  'Guided Surgery',
  'All on 4',
  'All on 6',
  'All on X',
];

// ─── Loading Type Options ─────────────────────────────
export const LOADING_TYPES = [
  'Immediate Loading',
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
];

const IMMEDIATE_LOADING_OPTIONS = [
  'PMMA Crown with Temporary Abutment',
  'PMMA Crown with Ti-Base',
  'Full Arch Temporary Prosthesis with Multiunit and Temporary Cylinders',
  'Temporary PMMA CAD Prosthesis with Multiunit and Temporary Cylinders',
  'Temporary PMMA CAD Prosthesis on Ti-Base',
];

const FULL_ARCH_OPTIONS = [
  'Full Arch Co-Cr Framework Removable Denture',
  'Full Arch Porcelain Fused to Metal Prosthesis',
  'Full Arch Co-Cr Framework Zirconia Prosthesis',
  'Full Arch Titanium Framework Zirconia Prosthesis',
  'Full Arch Peek Framework Zirconia Ti Base',
];

const SINGLE_PROCEDURE_TYPES = new Set([
  'Single Conventional Implant',
  'Immediate Implant',
  'Partial Extraction Therapy',
  'Implant Placement with GBR',
]);

const BRIDGE_PROCEDURE_TYPES = new Set([
  'Multiple Conventional Implants',
  'Immediate Implant',
  'Partial Extraction Therapy',
  'Implant Placement with GBR',
]);

const FULL_ARCH_PROCEDURE_TYPES = new Set([
  'All on 4',
  'All on 6',
  'All on X',
]);

export function getProstheticOptions(procedureType: string, loadingTypes: string[]): string[] {
  const options: string[] = [];

  if (SINGLE_PROCEDURE_TYPES.has(procedureType)) {
    options.push(...SINGLE_CROWN_OPTIONS);
  }
  if (BRIDGE_PROCEDURE_TYPES.has(procedureType)) {
    options.push(...BRIDGE_OPTIONS);
  }
  if (FULL_ARCH_PROCEDURE_TYPES.has(procedureType)) {
    options.push(...FULL_ARCH_OPTIONS);
  }
  if (loadingTypes.includes('Immediate Loading')) {
    options.push(...IMMEDIATE_LOADING_OPTIONS);
  }

  // Remove duplicates preserving order
  return [...new Set(options)];
}

export const STATUS_COLORS: Record<string, string> = {
  pending_phase1: '#FFA500',
  phase1_approved: '#4CAF50',
  pending_phase2: '#FFD700',
  phase2_approved: '#2196F3',
  pending_stage2_surgical: '#FF9800',
  stage2_surgical_approved: '#8BC34A',
  stage2_surgical_rejected: '#F44336',
  pending_stage2_prosthetic: '#FF9800',
  stage2_prosthetic_rejected: '#F44336',
  completed: '#4CAF50',
  approved: '#4CAF50',
  rejected: '#F44336',
};

export const STATUS_LABELS: Record<string, string> = {
  pending_phase1: 'Phase 1: Pending Approval',
  phase1_approved: 'Phase 1: Approved - Ready for Phase 2',
  pending_phase2: 'Phase 2: Pending Approval',
  phase2_approved: 'Phase 2 Approved - Ready for Phase 3',
  pending_stage2_surgical: 'Phase 3: Second Stage Surgical Protocol Pending Approval',
  stage2_surgical_approved: 'Phase 3: Approved - Ready for Phase 4',
  stage2_surgical_rejected: 'Phase 3: Second Stage Surgical Protocol Rejected',
  pending_stage2_prosthetic: 'Phase 4: Prosthetic Protocol Pending Approval',
  stage2_prosthetic_rejected: 'Phase 4: Prosthetic Protocol Rejected',
  completed: 'Treatment Complete',
  approved: 'Approved',
  rejected: 'Rejected',
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
