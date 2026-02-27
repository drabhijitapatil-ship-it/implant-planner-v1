export const CHECKLIST_DATA = {
  pre_surgical: {
    title: 'Phase 1: Pre-Surgical Protocol',
    items: [
      { id: 'case_selection', label: 'Case Selection Approved' },
      { id: 'academic_readiness', label: 'Academic Readiness (with presentation)' },
      { id: 'hematological', label: 'Hematological Investigations' },
      { id: 'radiographic', label: 'Radiographic Investigations' },
      { id: 'instruments', label: 'Availability of the Instruments' },
      { id: 'treatment_plan', label: 'Approved Treatment & Prosthetic Plan' },
      { id: 'payment', label: 'Full payment done' },
      { id: 'medical_assessment', label: 'Medical assessment done' },
      { id: 'realguide', label: 'RealGUIDE Planning and Report' },
      { id: 'oral_prophylaxis', label: 'Oral Prophylaxis done' },
    ],
  },
  surgical: {
    title: 'Phase 2: Surgical Protocol',
    items: [
      { id: 'consent_form', label: 'Signed Patient consent form' },
      { id: 'cbct_report', label: 'Arranged CBCT Report' },
      { id: 'room_cleanliness', label: 'Cleanliness of the Implant Room' },
      { id: 'drapes_gowns', label: 'Clean autoclaved drapes and gowns' },
      { id: 'instruments_equipment', label: 'Clean autoclaved instruments and equipment' },
      { id: 'asepsis', label: 'Asepsis and disinfection of operatory' },
      { id: 'register_entry', label: 'Entry into implant register with sticker' },
      { id: 'post_cleaning', label: 'Post operative cleaning of implant room, instruments and equipment' },
    ],
  },
  second_stage: {
    title: 'Phase 3: Second Stage Surgical Protocol',
    items: [
      { id: 'healing_assessment', label: 'Implant healing assessment (clinical & radiographic)' },
      { id: 'tissue_conditioning', label: 'Tissue conditioning done' },
      { id: 'second_stage_surgery', label: 'Second stage surgery performed' },
      { id: 'healing_abutment', label: 'Healing abutment placed' },
      { id: 'soft_tissue_eval', label: 'Soft tissue evaluation and management' },
      { id: 'patient_hygiene', label: 'Patient oral hygiene instructions given' },
      { id: 'post_op_radiograph', label: 'Post-operative radiograph taken' },
      { id: 'follow_up_scheduled', label: 'Follow-up appointment scheduled' },
    ],
  },
  prosthetic_phase: {
    title: 'Phase 4: Prosthetic Protocol',
    items: [
      { id: 'impression_taken', label: 'Final impression taken' },
      { id: 'bite_registration', label: 'Bite registration completed' },
      { id: 'shade_selection', label: 'Shade selection done' },
      { id: 'try_in', label: 'Try-in verification completed' },
      { id: 'final_prosthesis', label: 'Final prosthesis placed' },
      { id: 'occlusal_adjustment', label: 'Occlusal adjustment done' },
      { id: 'patient_instructions', label: 'Patient care instructions given' },
      { id: 'maintenance_schedule', label: 'Maintenance schedule established' },
    ],
  },
};

// Time slots available for procedures
// Monday-Friday: 10:00 AM, 2:00 PM
// Saturday: 9:30 AM only
export const PROCEDURE_TIME_SLOTS = [
  { value: '10:00', label: '10:00 AM', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
  { value: '14:00', label: '2:00 PM', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
  { value: '09:30', label: '9:30 AM (Saturday)', days: ['Sat'] },
];

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
