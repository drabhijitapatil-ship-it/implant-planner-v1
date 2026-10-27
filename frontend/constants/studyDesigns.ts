/**
 * Curated study-design primer for the Research Module (offline, reviewed text).
 * Levels of evidence: OCEBM Levels of Evidence Working Group, 2011. Reporting: EQUATOR Network guidelines.
 */
export type StudyDesignInfo = {
  key: string; label: string; definition: string; whenToUse: string; strengths: string[]; limitations: string[];
  evidenceLevel: string; reporting: string; implantExample: string; references: string[];
};

export const STUDY_DESIGNS: StudyDesignInfo[] = [
  {
    key: 'prospective_cohort', label: 'Prospective cohort',
    definition: 'Participants are identified at a defined starting point (e.g. implant placement) and followed forward in time; exposures are recorded before outcomes occur.',
    whenToUse: 'Measuring incidence or change over time — crestal bone loss, ISQ change, survival, peri-implant disease — when randomisation is unethical or impractical (e.g. smokers vs non-smokers).',
    strengths: ['Temporal sequence is clear (exposure precedes outcome)', 'Standardised, pre-planned measurements at protocol timepoints', 'Can study several outcomes of one exposure', 'Incidence and relative risk can be calculated'],
    limitations: ['Confounding — groups differ in more than the exposure', 'Loss to follow-up biases results (aim for < 20%)', 'Long and resource-intensive for late outcomes', 'Needs a large sample for rare events (implant failure)'],
    evidenceLevel: 'OCEBM 2011 Level 2 (inception cohort) for prognosis; Level 3 for treatment benefit',
    reporting: 'STROBE (cohort checklist)',
    implantExample: '30 immediate implants in the anterior maxilla followed at loading, 6, 12 and 24 months for mesial/distal crestal bone loss on standardised IOPAs.',
    references: ['Vandenbroucke JP et al. STROBE explanation and elaboration. PLoS Med 2007;4:e297.', 'Grimes DA, Schulz KF. Cohort studies: marching towards outcomes. Lancet 2002;359:341-5.', 'OCEBM Levels of Evidence Working Group. The Oxford 2011 Levels of Evidence.'],
  },
  {
    key: 'retrospective_cohort', label: 'Retrospective cohort',
    definition: 'Both the exposure and the outcome have already occurred when the study starts; data are taken from existing records (here, the Implanr clinical record).',
    whenToUse: 'Quick answers from already-treated cases — survival by implant system, complications by bone type, outcomes of a department over several years.',
    strengths: ['Fast and inexpensive — data already exist', 'Long follow-up available immediately', 'Useful for rare outcomes and for generating hypotheses'],
    limitations: ['Missing or non-standardised measurements (no protocol at the time)', 'Selection and recall bias; incomplete follow-up records', 'Radiographs rarely standardised — measurement error', 'Cannot control confounders that were never recorded'],
    evidenceLevel: 'OCEBM 2011 Level 3 (non-randomised cohort) — downgraded for data quality',
    reporting: 'STROBE (cohort checklist); RECORD extension for routinely collected data',
    implantExample: 'All conventional implants placed 2019–2024 pulled from the record; survival and peri-implantitis at last follow-up compared between D2/D3 and D4 bone.',
    references: ['Benchimol EI et al. The RECORD statement. PLoS Med 2015;12:e1001885.', 'Euser AM et al. Cohort studies: prospective versus retrospective. Nephron Clin Pract 2009;113:c214-7.'],
  },
  {
    key: 'rct', label: 'Randomised controlled trial',
    definition: 'Participants (or implant sites) are randomly allocated to two or more interventions and outcomes are compared; allocation concealment and blinding of outcome assessors minimise bias.',
    whenToUse: 'Comparing interventions head-to-head — platform-switched vs matched abutments, immediate vs delayed loading, xenograft vs no graft in the jump gap.',
    strengths: ['Randomisation balances known and unknown confounders', 'Strongest design for causal inference about treatment effect', 'Pre-registered protocol and sample-size calculation'],
    limitations: ['Ethics committee and CTRI registration mandatory (India) before first enrolment', 'Expensive; strict eligibility limits generalisability', 'Blinding of surgeon usually impossible — blind the examiner instead', 'Clustering when several implants per patient — randomise per patient or use split-mouth'],
    evidenceLevel: 'OCEBM 2011 Level 2 (single RCT); Level 1 when systematic review of RCTs',
    reporting: 'CONSORT 2010 (+ CONSORT 2025 update); register on CTRI',
    implantExample: '60 patients randomised 1:1 to immediate vs early loading of single posterior implants; primary outcome marginal bone level change at 12 months, examiner blinded.',
    references: ['Schulz KF, Altman DG, Moher D. CONSORT 2010 statement. BMJ 2010;340:c332.', 'Hopewell S et al. CONSORT 2025 statement. BMJ 2025;389:e081123.', 'Esposito M et al. Interventions for replacing missing teeth: different times for loading dental implants. Cochrane Database Syst Rev 2013;CD003878.'],
  },
  {
    key: 'case_series', label: 'Case series',
    definition: 'A descriptive report of outcomes in a group of consecutively treated patients receiving the same intervention, without a comparison group.',
    whenToUse: 'New or uncommon techniques — zygomatic implants, pterygoid anchorage, custom root-analogue implants — to describe feasibility, complications and early outcomes.',
    strengths: ['Simple, fast, inexpensive', 'Describes real-world feasibility and complication profile', 'Generates hypotheses for cohort or RCT designs'],
    limitations: ['No control group — cannot infer effectiveness or causation', 'Selection bias (consecutive enrolment and clear criteria essential)', 'Often small samples and short follow-up'],
    evidenceLevel: 'OCEBM 2011 Level 4',
    reporting: 'CARE guidelines (case reports) / PROCESS for surgical case series',
    implantExample: 'Twelve consecutive patients treated with zygomatic implants for the severely atrophic maxilla; prosthetic success, sinus complications and OHIP-14 at 12 months.',
    references: ['Gagnier JJ et al. The CARE guidelines. BMJ Case Rep 2013;2013:bcr2013201554.', 'Agha RA et al. The PROCESS 2020 guideline. Int J Surg 2020;84:231-5.', 'Dekkers OM et al. Distinguishing case series from cohort studies. Ann Intern Med 2012;156:37-40.'],
  },
  {
    key: 'split_mouth', label: 'Split-mouth',
    definition: 'Each patient receives both interventions, one in each side (or quadrant) of the mouth; the patient acts as their own control, removing between-patient variability.',
    whenToUse: 'Bilateral, symmetrical sites — bilateral sinus lifts with two graft materials, bilateral posterior implants with two surface types — where carry-across effects are unlikely.',
    strengths: ['Removes inter-patient confounding (age, diabetes, smoking, bone quality)', 'Needs far fewer patients than a parallel RCT', 'Allocation of side can still be randomised'],
    limitations: ['Carry-across effect (one treatment influencing the other side)', 'Requires bilateral, comparable sites — limits eligibility', 'Analysis must be paired (paired t / Wilcoxon / mixed models)', 'Systemic interventions (antibiotics, medications) cannot be tested'],
    evidenceLevel: 'OCEBM 2011 Level 2 when randomised (within-patient RCT)',
    reporting: 'CONSORT 2010 with within-person extension (Pandis 2017)',
    implantExample: 'Twenty patients with bilateral mandibular posterior edentulism; SLA vs SLActive implants assigned randomly to sides, ISQ at placement, 6 and 12 weeks.',
    references: ['Pandis N et al. CONSORT 2010 statement: extension checklist for reporting within person randomised trials. BMJ 2017;357:j2835.', 'Lesaffre E et al. The design and analysis of split-mouth studies. Stat Med 2009;28:3470-82.'],
  },
  {
    key: 'cross_sectional', label: 'Cross-sectional',
    definition: 'Exposure and outcome are measured at a single point in time in a defined population — a "snapshot" (prevalence study).',
    whenToUse: 'Prevalence of peri-implant mucositis/peri-implantitis in recalled patients, patient-reported satisfaction, association between keratinised mucosa width and bleeding on probing.',
    strengths: ['Quick, inexpensive, no follow-up needed', 'Gives prevalence and associations across many variables', 'Good for planning services and sample sizes for later studies'],
    limitations: ['No temporal sequence — cannot distinguish cause from effect', 'Prevalence–incidence (Neyman) bias: failed implants are missing', 'Associations only; confounding uncontrolled'],
    evidenceLevel: 'OCEBM 2011 Level 4 for prognosis; Level 3–4 for prevalence (depends on sampling)',
    reporting: 'STROBE (cross-sectional checklist)',
    implantExample: 'All patients ≥ 3 years after loading seen in a 6-month recall window; prevalence of peri-implantitis (2017 World Workshop case definition) and association with KM width < 2 mm.',
    references: ['Berglundh T et al. Peri-implant diseases and conditions: consensus report of workgroup 4, 2017 World Workshop. J Clin Periodontol 2018;45(S20):S286-91.', 'von Elm E et al. The STROBE statement. Lancet 2007;370:1453-7.'],
  },
];

export const STUDY_DESIGN_MAP: Record<string, StudyDesignInfo> = Object.fromEntries(STUDY_DESIGNS.map(d => [d.key, d]));
