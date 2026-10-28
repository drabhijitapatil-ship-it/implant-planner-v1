// Prescription (Rx) — shared options, standard template, and the client-side
// allergy / interaction cross-check. Mirrors backend/prescription.py.

export type Drug = {
  name: string;
  strength: string;
  form: string;
  dosage: string;
  frequency: string;
  duration: string;
  timing: string;
  notes: string;
};

export const DRUG_FORMS = ['Tablet', 'Capsule', 'Syrup', 'Mouthwash', 'Gel', 'Injection', 'Ointment', 'Other'];

export const FREQUENCY_OPTIONS = [
  '1-0-1 (BD)', '1-1-1 (TDS)', '1-0-0 (OD morning)', '0-0-1 (OD night)',
  '1-1-1-1 (QID)', '0-1-1', 'SOS', 'STAT',
];

export const TIMING_OPTIONS = ['After food', 'Before food', 'With food', 'Empty stomach'];

export const MAX_DRUGS = 20;

export const emptyDrug = (): Drug => ({
  name: '', strength: '', form: 'Tablet', dosage: '', frequency: '', duration: '', timing: 'After food', notes: '',
});

// One-tap standard post-implant prescription — fully editable afterwards.
export const STANDARD_TEMPLATE: Drug[] = [
  { name: 'Amoxicillin + Clavulanic Acid (Augmentin)', strength: '625 mg', form: 'Tablet', dosage: '1 tab', frequency: '1-0-1 (BD)', duration: '5 days', timing: 'After food', notes: 'Antibiotic — complete the full course' },
  { name: 'Ibuprofen', strength: '400 mg', form: 'Tablet', dosage: '1 tab', frequency: '1-1-1 (TDS)', duration: '3 days', timing: 'After food', notes: 'Analgesic / anti-inflammatory' },
  { name: 'Paracetamol', strength: '500 mg', form: 'Tablet', dosage: '1 tab', frequency: 'SOS', duration: 'As needed', timing: 'After food', notes: 'For pain if Ibuprofen insufficient' },
  { name: 'Chlorhexidine Gluconate 0.2% Mouthwash', strength: '0.2%', form: 'Mouthwash', dosage: '10 ml rinse', frequency: '0-1-1', duration: '7 days', timing: 'After brushing', notes: 'Start 24 h post-op; do not eat/rinse for 30 min after use' },
];

// One-tap standard pre-operative prescription (Phase 1) — editable afterwards.
// Single-dose prophylaxis 1 h before placement + pre-surgical antiseptic rinse.
export const PREOP_TEMPLATE: Drug[] = [
  { name: 'Amoxicillin', strength: '2 g', form: 'Capsule', dosage: '4 caps (500 mg each)', frequency: 'STAT', duration: 'Single dose', timing: 'After food', notes: '1 hour before surgery — prophylaxis. Penicillin allergy: use an alternative' },
  { name: 'Chlorhexidine Gluconate 0.2% Mouthwash', strength: '0.2%', form: 'Mouthwash', dosage: '10 ml rinse', frequency: 'STAT', duration: 'Once', timing: 'Empty stomach', notes: 'Rinse for 1 minute just before surgery' },
];

export const PREOP_DEFAULT_ADVICE =
  'Take the medications exactly as prescribed before the surgery. Have a light meal unless told otherwise. ' +
  'Continue your regular medicines unless your clinician has advised a change. ' +
  'Inform the team of any allergy, fever or new medication.';

export const DEFAULT_ADVICE =
  'Apply cold compresses for the first 24 hours. Soft diet for 2-3 days. ' +
  'Avoid spitting, vigorous rinsing and smoking. Maintain oral hygiene. ' +
  'Report any excessive bleeding, swelling or fever.';

const PENICILLIN = ['penicillin', 'amoxicillin', 'augmentin', 'amoxiclav', 'ampicillin', 'clavulan'];
const NSAIDS = ['ibuprofen', 'diclofenac', 'aceclofenac', 'ketorolac', 'naproxen', 'aspirin', 'nsaid'];

const hit = (text: string, keys: string[]) => keys.some(k => text.includes(k));

/**
 * Returns clinical warning strings for the current drug list given the
 * recorded patient allergies (free text) and structured medical assessment.
 */
export function prescriptionWarnings(
  drugs: Drug[],
  allergies: string,
  medicalAssessment: Record<string, string> | undefined,
): string[] {
  const out: string[] = [];
  const allergyText = (allergies || '').toLowerCase();
  const anticoag = (medicalAssessment || {}).anticoagulant === 'Yes';

  for (const d of drugs || []) {
    const name = (d.name || '').toLowerCase();
    if (!name) continue;
    // Allergy cross-check: does a recorded allergy token appear in the drug?
    const allergyTokens = allergyText.split(/[\s,;/]+/).filter(t => t.length >= 4);
    const direct = allergyTokens.some(t => name.includes(t));
    const penicillinClash = hit(allergyText, PENICILLIN) && hit(name, PENICILLIN);
    const nsaidAllergyClash = hit(allergyText, NSAIDS) && hit(name, NSAIDS);
    if (direct || penicillinClash || nsaidAllergyClash) {
      out.push(`⚠️ "${d.name}" may conflict with a recorded allergy${penicillinClash ? ' (penicillin group — consider Clindamycin or Azithromycin)' : ''}.`);
    }
    // NSAID + anticoagulant bleeding risk (from Medical Assessment).
    if (anticoag && hit(name, NSAIDS)) {
      out.push(`⚠️ "${d.name}" is an NSAID and the patient is on anticoagulant therapy — bleeding risk; prefer Paracetamol and coordinate with the physician.`);
    }
  }
  return Array.from(new Set(out));
}
