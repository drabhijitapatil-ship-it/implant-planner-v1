export const CHECKLIST_DATA = {
  pre_surgical: {
    title: 'I. Pre-surgical Protocols',
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
    title: 'II. Surgical Protocols',
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
};

// Time slots available for procedures
export const PROCEDURE_TIME_SLOTS = [
  { value: '10:00', label: '10:00 AM' },
  { value: '14:00', label: '2:00 PM' },
];

export const STATUS_COLORS = {
  pending_phase1: '#FFA500',
  phase1_approved: '#4CAF50',
  pending_phase2: '#FFD700',
  phase2_approved: '#4CAF50',
  approved: '#4CAF50',
  rejected: '#F44336',
};

export const STATUS_LABELS = {
  pending_phase1: 'Phase 1: Pending Approval',
  phase1_approved: 'Phase 1: Approved - Ready for Phase 2',
  pending_phase2: 'Phase 2: Pending Approval',
  phase2_approved: 'Stage 1 Implant Placement Done Successfully',
  approved: 'Approved',
  rejected: 'Rejected',
};

export const USER_ROLES = {
  student: 'Student',
  instructor: 'Instructor',
  implant_incharge: 'Implant Incharge',
  administrator: 'Administrator',
  nurse: 'Nurse',
};

export const ROLE_OPTIONS = [
  { value: 'student', label: 'Postgraduate Student' },
  { value: 'instructor', label: 'Instructor (Supervisor)' },
  { value: 'implant_incharge', label: 'Implant Incharge' },
  { value: 'administrator', label: 'Administrator' },
  { value: 'nurse', label: 'Nurse (Read-only)' },
];
