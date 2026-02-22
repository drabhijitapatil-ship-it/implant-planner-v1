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
    ],
    additionalFields: [
      { id: 'implant_specs', label: 'Number of Implant with specifications (company, length, diameter etc.)' },
      { id: 'bone_graft', label: 'Bone graft/Membrane or other specifications (if applicable)' },
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
  second_stage: {
    title: 'III. Second Stage Surgical Protocols',
    items: [
      { id: 'faculty_approval', label: 'Approval by supervising faculty' },
      { id: 'sterilization', label: 'Cleanliness and sterilization of Implant room and instruments' },
      { id: 'components_available', label: 'All components available (second stage and prosthetic)' },
      { id: 'patient_consent', label: 'Patient consent' },
    ],
  },
  prosthetic_phase: {
    title: 'IV. Prosthetic Phase Protocols',
    items: [
      { id: 'faculty_approval', label: 'Approval from supervising faculty' },
      { id: 'prosthetic_components', label: 'All prosthetic components available' },
      { id: 'payment_confirmation', label: 'Confirmation of complete payment' },
      { id: 'cleaned_instruments', label: 'Cleaned and autoclaved instruments' },
      { id: 'impressions_approved', label: 'Impressions approved by supervising faculty' },
      { id: 'impression_lab', label: 'Impression sent to the laboratory' },
      { id: 'trials', label: 'Jig trial/Coping trial/bake trial' },
      { id: 'final_cementation', label: 'Approved Final cementation/screwing of the prosthesis' },
    ],
  },
};

export const STATUS_COLORS = {
  pending_instructor: '#FFA500',
  pending_implant_incharge: '#FFD700',
  approved: '#4CAF50',
  rejected: '#F44336',
};

export const STATUS_LABELS = {
  pending_instructor: 'Pending Instructor Approval',
  pending_implant_incharge: 'Pending Implant Incharge Approval',
  approved: 'Approved',
  rejected: 'Rejected',
};
