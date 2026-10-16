/**
 * Research Module — in-app User Guide content (v1, adapted to what is built).
 * Single source of truth: the PDF export is rendered from this same structure.
 */
export type Block =
  | { type: 'p'; text: string }
  | { type: 'steps'; items: string[] }
  | { type: 'bullets'; items: string[] }
  | { type: 'table'; columns: string[]; rows: string[][] }
  | { type: 'tip'; text: string }
  | { type: 'later'; text: string };

export type GuideSection = { id: string; title: string; icon: string; blocks: Block[] };

export const GUIDE_VERSION = 'v1.1 · June 2026';

export const RESEARCH_GUIDE: GuideSection[] = [
  {
    id: 'before', title: 'Before you start', icon: 'flag-outline',
    blocks: [
      { type: 'p', text: 'The Research Module turns the implant cases you already record in Implanr into a structured study: define the question once and the data collects itself as you treat patients. The running example is "CBL — Immediate Implants, Maxillary Anterior" (code CBL-IMM-MXA), which measures crestal bone loss around immediately placed implants at FDI 13–23.' },
      { type: 'bullets', items: ['Research is available to every role except Nurse. Open it from the menu grid (the tile before Archived).', 'You see only the cases you already have clinical access to. A study never widens that access.', 'Keep ready: IEC approval letter and number, the consent form version, and for an RCT the CTRI number.'] },
      { type: 'tip', text: 'One idea to hold on to: a study does not copy the case record — it reads from it. Site, implant size, torque, ISQ, dates and recall findings flow in automatically. You only enter what the case does not hold, such as bone levels measured on a radiograph.' },
      { type: 'table', columns: ['Term', 'Meaning in the app'], rows: [
        ['Study', 'One research question with its team, protocol and enrolled cases'],
        ['Protocol', 'The study rules: Eligibility, Variables and Schedule'],
        ['Variable', 'One data item, e.g. insertion torque or mesial bone level'],
        ['Timepoint', 'A scheduled collection point, e.g. 12 months after loading, with an allowed window'],
        ['Visit (form)', 'One timepoint for one enrolled implant — the screen where that visit\'s data is entered'],
        ['Enrolment', 'One implant / site / patient added to the study'],
        ['Subject code', 'The study pseudonym, e.g. CBL-IMM-MXA-P001-I01 (patient 1, implant 1). Exports use this, never the name'] ] },
      { type: 'table', columns: ['Role in a study', 'Who', 'Main tasks'], rows: [
        ['Principal investigator (PI)', 'The user who creates the study', 'Builds the protocol, enrols, enters data, locks, exports'],
        ['Guide', 'Supervisor or Implant In-charge', 'Reviews and approves student protocols, raises queries, exports'],
        ['Co-investigator / Data collector', 'Colleagues, other PGs', 'Screen, enrol and enter visit data'],
        ['Statistician', 'Research cell', 'Raises queries, exports de-identified data'],
        ['Administrator / Implant In-charge', 'Faculty', 'See every study'] ] },
      { type: 'later', text: 'Examiner and Monitor roles, member invitations and an institution add-on switch come in a later version.' },
    ],
  },
  {
    id: 'step1', title: 'Step 1 — Start a new study', icon: 'add-circle-outline',
    blocks: [
      { type: 'p', text: 'Go to Research → New study. Everything you create is a Draft until you activate it, so you can stop and return from the Research home at any time.' },
      { type: 'table', columns: ['Start from', 'Use it when', 'What you get'], rows: [
        ['Template', 'Your question matches a ready design (CBL immediate implants, ISQ stability, PES/WES aesthetics)', 'Eligibility, Variables and Schedule pre-filled; edit anything'],
        ['Clone (Protocol tab → Clone into a new study)', 'Repeating or extending an earlier study', 'A copy of that protocol with no cases or data'],
        ['Blank study', 'Your design is new', 'Empty protocol'] ] },
      { type: 'steps', items: [
        'Study code — 3–20 capitals, digits or hyphens, unique, e.g. CBL-IMM-MXA. It prefixes every subject code.',
        'Title and Research question — one sentence, e.g. "What is the mean crestal bone loss at 12 months around immediately placed implants in the maxillary anterior region?"',
        'Study design — tap ⓘ beside any design for a primer (definition, when to use, strengths, limitations, level of evidence, reporting guideline, references).',
        'Unit(s) of analysis — select Patient / Implant / Site and add custom units. The ★ first choice drives subject coding and feasibility counts.',
        'Target sample size (n) and the Dissertation switch, then Create study.'] },
      { type: 'tip', text: 'Write the research question first and test every later choice against it. A variable that does not serve the question adds data-entry time and nothing else.' },
      { type: 'later', text: 'Sample-size calculator, department field and planned dates on the first screen come later (planned dates are under Ethics & consent today).' },
    ],
  },
  {
    id: 'step2', title: 'Step 2 — Protocol: Eligibility', icon: 'funnel-outline',
    blocks: [
      { type: 'p', text: 'Study → Protocol tab → Eligibility → Edit. Write criteria as rules the app can check against the case record wherever possible, and as checklist items only for what the record cannot show.' },
      { type: 'steps', items: [
        'Tap + Include rule or + Exclude rule.',
        'Tap the field box to pick a case field from the Case Field Registry (grouped by phase: age, medical history, HbA1c, cigarettes/day, bisphosphonates, procedure type, implant site/system/size/torque, bone type, socket type, site preparation technique, baseline probing depths, survival…).',
        'Choose the operator (=, ≠, in list, >, ≥, <, ≤, between, is recorded, is not recorded, contains) and the value.',
        'Add more conditions inside the rule and set Match ALL (AND) or ANY (OR).',
        'Tap + Checklist item for clinical judgements, e.g. "Patient willing to attend recall up to 24 months".',
        'Tap Save. The Feasibility card at the top re-runs your rules on your existing cases: Eligible · Needs review · Excluded · Enrolled.'] },
      { type: 'table', columns: ['Kind', 'CBL example', 'Type'], rows: [
        ['Include', 'Implant site in 13, 12, 11, 21, 22, 23 AND Procedure type = Immediate Implant AND Age ≥ 18', 'Rule'],
        ['Include', 'Insertion torque ≥ 35 Ncm', 'Rule'],
        ['Include', 'Extraction socket type in Type I, Type II', 'Rule'],
        ['Include', 'Patient willing to attend recall up to 24 months', 'Checklist'],
        ['Exclude', 'Cigarettes/day > 10 OR HbA1c > 7 OR Bisphosphonate history Oral/IV OR Head & neck radiation = Yes', 'Rule'],
        ['Exclude', 'Active periodontitis at the site', 'Checklist'] ] },
      { type: 'p', text: 'How missing data is read: if a field a rule needs is blank, that rule shows Unknown — not Fail. The case is listed under Needs review and is never silently excluded. Fill the field in the case record, or the PI can override at enrolment with a written reason.' },
    ],
  },
  {
    id: 'step3', title: 'Step 3 — Protocol: Variables', icon: 'list-outline',
    blocks: [
      { type: 'p', text: 'Study → Protocol → Variables → Edit. For each variable choose where it comes from (source) and what it belongs to (level).' },
      { type: 'table', columns: ['Source', 'Where the value comes from', 'Example'], rows: [
        ['Linked (from case)', 'Read live from the case record; nobody types it twice. Read-only in the study — correct it in the case.', 'Insertion torque, ISQ, implant length, socket type'],
        ['Study-specific', 'Entered on the visit form', 'Mesial bone level (mm), buccal plate thickness, PES'],
        ['Derived', 'Computed by the app from a formula', 'CBL = v(\'bl_mesial\') − v(\'bl_mesial\',\'baseline\')'] ] },
      { type: 'bullets', items: [
        'Level: Patient (asked once per patient, shared across that patient\'s implants), Implant (one value per implant) or Site (one per measured site).',
        'Data types: whole number, decimal (unit, min, max, decimals), text, single / multiple choice (options, optional code=label), yes/no, date, score/scale.',
        'Required blocks "Mark visit complete" unless a value is entered or the item is marked Not done with a reason.',
        'Soft warning: flag unusual-but-possible values (e.g. CBL > 1.5 mm in year 1) — the collector must confirm before completing.',
        'Method note: how the item is measured. It appears on the form, in the data dictionary and in the synopsis methods.',
        'Formulas: v(\'key\'), v(\'key\',\'timepoint\'), mean(), abs(), round(x,n), if(cond,a,b), days_between(). A missing input gives a blank result, never 0.',
        'Keys (export column names) are locked once the study is active; you can add variables but not remove or rename them.'] },
      { type: 'later', text: 'Patient-reported questionnaires, Show-if conditional fields, repeating groups and a formula Test button are planned for a later version.' },
    ],
  },
  {
    id: 'step4', title: 'Step 4 — Protocol: Schedule', icon: 'calendar-outline',
    blocks: [
      { type: 'p', text: 'Study → Protocol → Schedule → Edit. The schedule says when each variable is collected; from it the app creates every visit form and its due date.' },
      { type: 'steps', items: [
        'Tap + Timepoint and name it (e.g. 12 months).',
        'Anchor event — enrolment date, implant placement, second stage (Phase 3), prosthesis delivery / loading, or a date variable. The anchor is read from the case, so the schedule moves if that date changes.',
        'Offset in days (12 months = 365) and the window before / after (e.g. 30 / 30).',
        'Mark exactly one timepoint as Baseline — derived changes such as CBL are measured from it.',
        'Tick the variables collected at this timepoint and tap Done.'] },
      { type: 'table', columns: ['Timepoint', 'Anchor + offset', 'Window'], rows: [
        ['Baseline (placement)', 'Placement + 0 d', '0 / +7'], ['Loading', 'Prosthesis delivery + 0 d', '0 / +14'], ['6 months', 'Prosthesis delivery + 182 d', '±15'], ['12 months', 'Prosthesis delivery + 365 d', '±30'], ['24 months', 'Prosthesis delivery + 730 d', '±60'] ] },
      { type: 'p', text: 'Example: loaded on 10 Jan 2027 → the 12-month visit is due 10 Jan 2028 with a window 11 Dec 2027 – 9 Feb 2028. It shows as Due now when the window opens, Overdue after it closes, and Missed when well past it.' },
      { type: 'later', text: 'Arms & randomisation for RCTs come in a later version.' },
    ],
  },
  {
    id: 'step5', title: 'Step 5 — Team', icon: 'people-outline',
    blocks: [
      { type: 'p', text: 'Study → Team tab → Edit → Add member. Search by name, then set the study role: Guide (Supervisors and Implant In-charges only), Co-investigator, Data collector or Statistician. Nurses cannot be added.' },
      { type: 'bullets', items: ['Student-created studies must name a Guide before the protocol can be submitted for approval. For studies created by Admin, Implant In-charge or Supervisor the Guide is optional and no approval step applies.', 'Add the Statistician early so they can check variables and sample size.', 'Membership never widens clinical access: a collector sees patient names only for cases they could already open; otherwise only the subject code.'] },
      { type: 'table', columns: ['Who', 'Can see', 'Can do'], rows: [
        ['PI', 'Own study', 'Everything: protocol, team, ethics, activate, enrol, data, lock, amendments, exports'],
        ['Guide', 'Studies they are guide of', 'Edit protocol & ethics while in draft; approve / request changes; queries; exports; read data'],
        ['Co-investigator / Data collector', 'Studies they are on', 'Screen & enrol cases, enter visit data, upload & measure radiographs, raise queries'],
        ['Statistician', 'Studies they are on', 'Read data, queries, exports'],
        ['Admin / Implant In-charge (not on team)', 'All studies — view only', 'Nothing until the PI adds them as guide or co-investigator'],
        ['Anyone else', 'Only studies they are PI or member of', '—'] ] },
      { type: 'p', text: 'Cases treated by other clinicians (department-wide recruitment): under Ethics & consent the PI sets Recruitment scope = Department-wide and ticks that multi-operator recruitment is declared to the IEC (an activation-checklist item). Screening then lists every eligible implant in the department without patient identity ("Treated by Dr X · Dr Y"). Tap Request inclusion: the treating student and supervisor get an alert, confirm the patient\'s research consent and the clinical checklist, and the case is enrolled automatically. They become case collaborators — they can enter visit data and radiographs for that case only (it appears on their Research home as "My cases only"). Treating clinicians can also offer a case from the case screen (Research card → Offer case); the PI accepts or declines. Everyone follows the same request flow, including the Implant In-charge.' },
      { type: 'p', text: 'Audit trail: Overview → Audit trail lists every change made by every user — protocol and detail edits with before→after values, team changes, approvals, enrolments, visit-form values, radiographs, queries and exports — newest first, filterable, with a CSV download for IEC / dissertation records.' },
    ],
  },
  {
    id: 'step6', title: 'Step 6 — Ethics & consent, guide approval, activate', icon: 'shield-checkmark-outline',
    blocks: [
      { type: 'p', text: 'Study → Overview → Ethics & consent.' },
      { type: 'table', columns: ['Field', 'What to enter', 'Required'], rows: [
        ['IEC reference number & approval date', 'As on the letter', 'Always'],
        ['IEC approval letter', 'Upload PDF / JPG / PNG — visible to PI and guide only', 'Recommended'],
        ['CTRI number', 'e.g. CTRI/2026/11/0XXXXX', 'RCTs'],
        ['Consent form version', 'e.g. v1.0 (English / Marathi / Hindi)', 'Always'],
        ['Planned start / end, notes', '—', 'Optional'] ] },
      { type: 'steps', items: [
        'Guide approval (student-created studies): once every other item in the Activation checklist is green, tap Submit to guide for approval. The guide gets an alert and sees the study under "awaiting your approval" on the Research home; opening it → Protocol tab shows the purple Guide approval box with Approve protocol / Request changes (with comments). A PI edit afterwards resets the approval; the guide may edit the draft protocol themselves without resetting it. Studies created by Admin, Supervisor or Implant In-charge are approved automatically.',
        'Activate study — the checklist must be fully green: research question, ≥1 inclusion rule, ≥1 variable, exactly one baseline, PI and unit set, IEC reference & date, consent version, CTRI for RCTs, guide approval where needed.',
        'After activation the protocol keys are locked: you may add variables / timepoints but not remove or rename them. Version 1.0 of the protocol is recorded at activation.'] },
      { type: 'later', text: 'Form preview before activation and consent-form upload are planned.' },
    ],
  },
  {
    id: 'cases', title: 'Adding cases to a study', icon: 'person-add-outline',
    blocks: [
      { type: 'p', text: 'Two routes end at the same Enrol sheet.' },
      { type: 'bullets', items: [
        'Screen & enrol (Study → Overview or Cases tab): the app runs your rules over the cases you can access, one row per implant / site, each rule marked ✓ pass, ✗ fail or ? unknown. Filter Eligible / Review / Excluded, search by patient name, and Exclude with a reason where needed.',
        'From the case: the Research card on a case detail screen lists active studies the case is eligible for ("Add to study") and studies it is already in, with visits due.'] },
      { type: 'steps', items: [
        'Review the rule results. Only Eligible sites enrol directly; Needs review / Excluded can be enrolled by the PI with an override reason.',
        'Tick every clinical checklist item.',
        'Record consent: paper form signed or e-consent, language, and confirm the patient signed the current consent version.',
        'Confirm enrolment — the app assigns the subject code (P001-I01, a second implant of the same patient becomes P001-I02) and creates every visit form with its due date.'] },
      { type: 'p', text: 'One implant can be in several studies; the Research card lists them all and you are warned at enrolment so radiograph timing can be coordinated.' },
      { type: 'later', text: 'Automatic "eligible — enrol?" banners after saving a phase and photo capture of the signed form come later.' },
    ],
  },
  {
    id: 'visits', title: 'Working on the study — visits', icon: 'create-outline',
    blocks: [
      { type: 'table', columns: ['Status', 'Meaning', 'What to do'], rows: [
        ['Not due', 'Window not open yet', 'Nothing'], ['Due now', 'In window', 'Book and complete the visit'],
        ['Overdue', 'Window closed, not done', 'Do it soon; the visit date will be flagged as a deviation'],
        ['Missed', 'Long past the window', 'Mark items Not done with a reason'],
        ['Completed', 'Saved and complete', 'Editable with a reason'], ['Locked', 'Frozen by the PI', 'PI can unlock with a reason'] ] },
      { type: 'p', text: 'Find due visits on the Research home (forms due strip), the study Cases tab, or the Research card on the case.' },
      { type: 'p', text: 'Visit reminders: data collectors receive an alert (Alerts tab) when a window is about to open — 3 days before by default — and again while it is open; the PI is alerted when a form goes overdue, repeated weekly until done. The PI tunes or switches this off under Overview → Visit reminders. Tap an alert to jump straight to the visit form.' },
      { type: 'steps', items: [
        'Open the enrolment and pick the timepoint chip.',
        'Linked fields are shown read-only under "From the clinical record" — tap Case to correct them in the case.',
        'Fill the study measurements. Patient-level items are stored once per patient.',
        'Cannot collect a required item? Switch Not done and give a reason — never leave it blank or enter 0.',
        'Enter the Visit date; outside the window you must give a deviation reason.',
        'Save draft, Mark visit complete, or (PI) Complete & lock. Derived values are computed on save.'] },
      { type: 'p', text: 'Validation: impossible values (outside min/max, a future date) are blocked; unusual ones (soft warnings) ask you to confirm.' },
    ],
  },
  {
    id: 'radiographs', title: 'Radiographs and bone-level measurement', icon: 'scan-outline',
    blocks: [
      { type: 'steps', items: [
        'On a visit with mm variables tap Upload radiograph & measure bone levels. Upload either the DICOM (.dcm) exported from your sensor software or a JPG/PNG photo of the standardised IOPA.',
        'DICOM: the pixel spacing is read from the file header and the image is calibrated automatically — grade A. Go straight to 2 · Measure.',
        'Photo/JPG (or a DICOM without a spacing tag): 1 · Calibrate — tap the implant shoulder, then the apex; the implant length from the case is pre-filled (edit if needed). The image is graded B.',
        '2 · Measure: pick a variable (e.g. Bone level mesial), tap the implant shoulder then the first bone-to-implant contact. The distance appears in mm.',
        'Tick "bone is coronal to the shoulder" to record a negative value (sub-crestal placement).',
        'Save — values are written into the form and CBL is derived from baseline automatically.'] },
      { type: 'p', text: 'An uncalibrated image cannot be measured (BR-22). Positive bone level = bone apical to the shoulder. Image grades: A = DICOM with pixel spacing, B = manually calibrated, C = uncalibrated.' },
      { type: 'p', text: 'Blinded measurement: Overview → Blinded measurement lists every radiograph of the study in an order shuffled uniquely for you, labelled only "Image 01, 02 …" — no patient, subject code or timepoint. Measure each pending image and save; those measurements are tagged "blinded" in the audit trail. Use it when a second examiner measures, or to re-measure for intra-examiner reliability.' },
      { type: 'tip', text: 'Exporting DICOM: most intra-oral sensor suites (Carestream, Dentsply Sirona Sidexis, Planmeca Romexis, Vatech) have "Export → DICOM". Keep the original; a photographed monitor is never grade A.' },
    ],
  },
  {
    id: 'queries', title: 'Data queries', icon: 'flag-outline',
    blocks: [
      { type: 'p', text: 'A query is a question attached to one value. PI, guide and statistician clean the data without editing it themselves.' },
      { type: 'steps', items: [
        'Raise: on a visit, tap the orange flag beside the value, write the question and tap Raise query. Collectors are notified and the field shows "query open".',
        'Answer: open the thread (on the form or Study → Data queries), correct the value with a reason or reply why it is right, then tap Answer (resolved).',
        'Close: the raiser or PI taps Close; PI/guide/statistician can Reopen.'] },
      { type: 'tip', text: 'Close all open queries before the final data lock.' },
    ],
  },
  {
    id: 'results', title: 'Results & export', icon: 'stats-chart-outline',
    blocks: [
      { type: 'bullets', items: [
        'Recruitment flow: screen-excluded → enrolled → in follow-up → completed, plus withdrawn / lost / excluded counts.',
        'Follow-up compliance per timepoint with deviations.',
        'Variable summaries: n, mean ± SD (95% CI), median [IQR], range, or counts and %, per timepoint; Group by any categorical variable.',
        'Clustered-data warning when patients contribute several implants — use mixed models / GEE.',
        'Exports (PI, guide, statistician): Wide CSV (one row per implant, columns variable__timepoint), Long CSV, Data dictionary, Methods paragraph. De-identified by default: subject codes only, dates as days from anchor, locked forms use their snapshot. Every export is audit-logged.'] },
      { type: 'later', text: 'Excel / SPSS (.sav), relational zip exports, participant-flow diagram image, identified exports and formal statistical tests come later.' },
    ],
  },
  {
    id: 'synopsis', title: 'Synopsis / dissertation', icon: 'school-outline',
    blocks: [
      { type: 'steps', items: [
        'Study → Overview → Synopsis / dissertation.',
        'Fill the title page (university, college, department, degree, year, candidate, guide, co-guide).',
        'Generated from the protocol: title, investigators, research question, design, unit, target n, schedule, linked baseline variables, study variables with methods, inclusion/exclusion criteria, IEC & consent, recruitment status, Annexure A case record form.',
        'Write the free-text sections: Introduction, Review of literature, Aims & objectives, extra Materials & methods, Sample size, Statistical analysis, Ethics, References.',
        'Save text, then Download DOCX or PDF.'] },
      { type: 'later', text: 'Admin-managed university templates, Table 1 and flow figure from locked data are planned.' },
    ],
  },
  {
    id: 'closing', title: 'Changing, pausing and closing a study', icon: 'git-branch-outline',
    blocks: [
      { type: 'table', columns: ['Situation', 'What to record', 'Effect'], rows: [
        ['Withdraws consent, data may be kept', 'Withdraw — future only', 'No new visits; data stays in analysis'],
        ['Withdraws, wants data removed', 'Withdraw — all data', 'Excluded from every export'],
        ['Cannot be contacted', 'Lost to follow-up + reason', 'Remaining visits not expected'],
        ['Found ineligible after enrolment', 'Excluded post-enrolment + reason', 'Counted in the flow'],
        ['Implant fails', 'Record in the case', 'Later imaging items Not done — "implant failed"'] ] },
      { type: 'table', columns: ['Status', 'Meaning', 'Set by'], rows: [
        ['Draft', 'Being built', 'Automatic'], ['Active', 'Enrolling and collecting', 'PI at activation'], ['Recruitment closed', 'No new cases; follow-up continues', 'PI'],
        ['Follow-up complete', 'All visits done', 'PI'], ['Data locked', 'Final dataset frozen', 'PI'], ['Archived', 'Read-only', 'PI'] ] },
      { type: 'p', text: 'Final data lock: close open queries, resolve or justify missing visits, then Lock dataset (Overview → Study status). Export the final dataset — that export is the one your paper should cite.' },
      { type: 'steps', items: [
        'Protocol amendments: after activation, edit Eligibility, Variables or Schedule as usual (additions only). The Protocol tab shows "Protocol v1.0 · n unpublished changes".',
        'Open Overview → Protocol amendments. The unpublished changes are listed automatically (e.g. "Timepoint added: 24 months").',
        'Enter a one-line summary, the rationale, and optionally the IEC amendment reference, then Publish amendment v1.1. Every team member is notified.',
        'Each enrolment and visit form keeps the protocol version it was collected under (a protocol_version column in exports); earlier versions are preserved in full in the version history.'] },
    ],
  },
  {
    id: 'faq', title: 'Troubleshooting and quick answers', icon: 'help-circle-outline',
    blocks: [
      { type: 'table', columns: ['Problem or question', 'Answer'], rows: [
        ['I can\'t see Research in the menu', 'Research is hidden for the Nurse role. Other roles find it in the menu grid before Archived.'],
        ['Activate is greyed out', 'Open the Activation checklist — usually IEC details, consent version or guide approval is missing.'],
        ['A case isn\'t listed as eligible', 'Screen & enrol shows each rule; an Unknown result means a case field is blank (e.g. torque, socket type). Fill it in the case.'],
        ['A linked value is wrong', 'Correct it in the case; the study updates. On a locked form you see "source changed after lock" and the PI decides whether to unlock.'],
        ['Two eligible implants in one patient', 'Enrol each site; they share P00n and patient-level fields are entered once.'],
        ['Visit happened outside the window', 'Enter the real date with a deviation reason. Do not change the date.'],
        ['I can\'t measure on my radiograph', 'Calibrate first — tap shoulder and apex and confirm the implant length.'],
        ['Derived CBL is blank', 'Baseline or current bone level is missing; derived values never treat missing as 0.'],
        ['Mistake on a completed visit', 'Edit it and give a reason. If locked, ask the PI to unlock.'],
        ['Giving my statistician the data', 'Add them as Statistician; they export de-identified CSVs themselves.'] ] },
    ],
  },
];
