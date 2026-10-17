// iter-453: ASA Physical Status Classification (American Society of
// Anesthesiologists). Stored as `medical_assessment.asa_class` = 'I'…'VI'.
// Definitions/examples follow the ASA system; "Implant relevance" and the
// decision rules are implant-planning guidance supplied by the department.

export type AsaClass = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI';

export type AsaDecision = 'Proceed' | 'Conditional' | 'Defer' | 'Not applicable';

export interface AsaClassInfo {
  cls: AsaClass;
  definition: string;
  examples: string;
  implantRelevance: string;
  decision: AsaDecision;
  requiredAction: string;
  color: string;      // chip / icon accent
  bg: string;         // chip background
}

export const ASA_CLASSES: AsaClassInfo[] = [
  {
    cls: 'I',
    definition: 'A normal, healthy patient',
    examples: 'Healthy non-smoker, little or no alcohol use',
    implantRelevance: 'Routine outpatient implant surgery',
    decision: 'Proceed',
    requiredAction: 'None beyond standard history',
    color: '#2E7D32', bg: '#E8F5E9',
  },
  {
    cls: 'II',
    definition: 'Mild systemic disease without substantive functional limitation',
    examples: 'Current smoker, social drinker, pregnancy, obesity (BMI 30–40), well-controlled diabetes or hypertension, mild lung disease',
    implantRelevance: 'Routine surgery with minor modifications',
    decision: 'Proceed',
    requiredAction: 'Note the condition; apply minor protocol modifications',
    color: '#558B2F', bg: '#F1F8E9',
  },
  {
    cls: 'III',
    definition: 'Severe systemic disease with substantive functional limitation',
    examples: 'Poorly controlled diabetes or hypertension, COPD, morbid obesity (BMI ≥ 40), active hepatitis, alcohol dependence, pacemaker, moderately reduced ejection fraction, ESRD on regular dialysis, MI/CVA/TIA/coronary stent more than 3 months ago',
    implantRelevance: 'Liaise with the physician, use a stress-reduction protocol, keep sessions short, monitor; consider sedation or a hospital setting',
    decision: 'Conditional',
    requiredAction: 'Physician clearance and an individual risk assessment before scheduling',
    color: '#EF6C00', bg: '#FFF3E0',
  },
  {
    cls: 'IV',
    definition: 'Severe systemic disease that is a constant threat to life',
    examples: 'MI/CVA/TIA/coronary stent within the last 3 months, ongoing cardiac ischaemia or severe valve dysfunction, severely reduced ejection fraction, sepsis, DIC, ESRD not on regular dialysis',
    implantRelevance: 'Defer elective implant surgery; emergency dental care only, in a hospital setting',
    decision: 'Defer',
    requiredAction: 'Do not schedule; refer for medical stabilisation and reassess',
    color: '#C62828', bg: '#FFEBEE',
  },
  {
    cls: 'V',
    definition: 'A moribund patient not expected to survive without the operation',
    examples: 'Ruptured abdominal or thoracic aneurysm, massive trauma, intracranial bleed with mass effect',
    implantRelevance: 'Not a candidate for elective dental care',
    decision: 'Not applicable',
    requiredAction: 'Exclude from elective care',
    color: '#6A1B9A', bg: '#F3E5F5',
  },
  {
    cls: 'VI',
    definition: 'A declared brain-dead patient whose organs are being removed for donation',
    examples: '—',
    implantRelevance: '—',
    decision: 'Not applicable',
    requiredAction: 'Exclude from elective care',
    color: '#455A64', bg: '#ECEFF1',
  },
];

export const ASA_CLASS_VALUES: AsaClass[] = ASA_CLASSES.map(c => c.cls);

export const getAsaInfo = (cls?: string | null): AsaClassInfo | undefined =>
  ASA_CLASSES.find(c => c.cls === cls);

/** Short display string, e.g. "ASA III — Conditional". */
export const asaDisplay = (cls?: string | null): string => {
  const info = getAsaInfo(cls);
  return info ? `ASA ${info.cls} — ${info.decision}` : (cls ? `ASA ${cls}` : '');
};

export const ASA_OVERVIEW =
  "The ASA classification grades a patient's overall systemic health before anaesthesia or surgery. It describes the patient, not the procedure.";

export const ASA_E_MODIFIER =
  'Append E to any class when the procedure is an emergency, meaning delay would significantly increase the threat to life or body part (for example, III-E). Elective implant surgery is never an emergency, so E should not appear on an implant placement record.';

export const ASA_DECISION_RULES: { cls: string; surgery: string; action: string }[] = [
  { cls: 'I', surgery: 'Proceed', action: 'None beyond standard history' },
  { cls: 'II', surgery: 'Proceed', action: 'Note the condition; apply minor protocol modifications' },
  { cls: 'III', surgery: 'Conditional', action: 'Physician clearance and an individual risk assessment before scheduling' },
  { cls: 'IV', surgery: 'Defer', action: 'Do not schedule; refer for medical stabilisation and reassess' },
  { cls: 'V, VI', surgery: 'Not applicable', action: 'Exclude from elective care' },
];
