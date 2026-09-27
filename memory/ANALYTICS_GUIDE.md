# Implanr — Analytics & Advanced Analytics Guide

Implanr records every case through five clinical phases (Phase 1 planning → Phase 2 surgery → Phase 3 healing → Phase 4 prosthetics → Phase 5 follow-up). Every analytics view is computed live from those structured fields — nothing is entered separately for analytics. Students see their own cases, supervisors see cases they supervise, and the Implant In-Charge / administrator sees the whole institution. All date filters apply to the Phase 1 procedure date. Identifiers in Research Export are one-way hashed so the data can be analysed without patient-identifying information.

## Research question → where to look

| Question | Tab(s) |
|---|---|
| What is our implant survival at 1 / 3 / 5 years? | Kaplan-Meier · Benchmarks |
| Does primary stability predict early failure? | Torque × ISQ · Failure Analysis |
| Which bone type / procedure combinations are risky? | Bone Heatmap · Cross-tab |
| Are trainees improving, and are they seeing complex cases? | Learning Curve · Case-Mix Index |
| What causes most of our failures? | Complications · Failure Analysis |
| How healthy are peri-implant tissues over time? | Follow-up |
| How often is the surgical plan changed intra-operatively? | Plan Adherence |
| Which graft material / protocol works best? | Augmentation |
| How fast are we moving to digital impressions? | Impressions & Scanners |
| Does the esthetic risk grade predict outcomes? | Aesthetic Risk · Follow-up |
| I need the raw data for statistics. | Research Export |

## 1. Procedure Analytics (overview)

**What data is collected** — Case status (draft → completed / treatment ended), implant procedure type (Phase 1), final prosthesis type (Phase 4), Phase 1 date and completion date.

**How to read it** — The KPI strip shows total, completed, terminated and in-progress cases. Success rate = completed ÷ (completed + terminated), i.e. cases still in progress are excluded from the denominator. Median lifecycle days is the median of Phase 1 date → completion date across completed cases; a median is used because a few very long cases would distort a mean. "By Procedure Type" ranks procedure volume — tap ▸ to drill into the type-specific breakdown. Prosthesis Mix is the share of final prosthesis designs among Phase 4 cases, and the Trend chart shows case starts per month / quarter / year.

**Using it for research** — Use it for a departmental annual report (volume, case-mix, throughput) and as the sampling frame for any study: check that enough cases of the procedure type you want to study have reached completion before designing the analysis. The "Your success / Your median days" cards give a personal benchmark against the institutional value.

**Interpretation cautions**
- Success rate only counts cases with a terminal status — young cohorts look artificially good or bad.
- Median lifecycle days depends on patient attendance, not only clinical performance.
- Students see only their own cases; the institutional figures are visible to faculty roles.

## 2. Kaplan-Meier Survival Curve

**What data is collected** — One row per implant: Phase 2 placement date, Phase 5 survival-review status (Active / Failed / Replaced) and failure date. Active implants are right-censored at the date of their last review or today.

**How to read it** — The solid step line is the Kaplan-Meier estimate of the probability that an implant is still in function at a given time after placement. Each downward step is a failure; censored implants (still active, or lost to follow-up) leave the risk set without causing a step. Dashed lines are the Greenwood 95% confidence band — the wider the band, the fewer implants remain at risk at that time point. A steep early drop indicates early (osseointegration / infection) losses; a gradual late decline suggests biomechanical or peri-implantitis losses.

**Using it for research** — This is the standard descriptive statistic for implant survival papers. Report survival at fixed landmarks (1, 3, 5 years) with the confidence interval and the number at risk. Compare procedure types or bone types by filtering and reading the curves side-by-side; a formal log-rank test can be run on the Research Export file.

**Interpretation cautions**
- Curves become unreliable once fewer than ~10 implants remain at risk — read the CI width, not the point estimate.
- Survival ≠ success: an implant can be "Active" with bone loss or prosthetic complications.
- Only implants that have had a Phase 5 review contribute failure events; unreviewed implants are censored, which biases survival upward.

## 3. Torque × ISQ scatter

**What data is collected** — Insertion torque (Ncm) entered per implant at Phase 2, ISQ (resonance-frequency analysis) entered at Phase 3, and the implant's current survival status.

**How to read it** — Each dot is one implant plotted by insertion torque (x) and ISQ (y). Green dots are active implants, red dots failed or replaced. The top-right cluster (typically ≥ 35 Ncm and ISQ ≥ 65–70) is the primary-stability "sweet spot"; dots in the lower-left indicate low primary stability. Red dots inside the sweet spot suggest a failure cause other than stability (infection, overload, systemic factors).

**Using it for research** — Use it to explore whether primary stability predicts early failure in your population, to choose loading protocols (immediate loading is usually reserved for the sweet spot) and to correlate torque with ISQ (expected r ≈ 0.4–0.6). Export the rows to fit a logistic regression of failure on torque, ISQ, bone type and region.

**Interpretation cautions**
- Torque readings depend on the motor / hand-ratchet used and on drilling protocol; ISQ depends on the SmartPeg and measurement direction.
- Only implants with both values plotted — missing data are excluded.
- Association is not causation: surgeons may under-torque in soft bone deliberately.

## 4. Bone Density Heatmap

**What data is collected** — Bone density class (Misch / Lekholm-Zarb D1–D4) recorded per implant at Phase 2, procedure type from Phase 1 and survival status from Phase 5.

**How to read it** — Rows are bone density classes, columns are procedure types. Each cell shows the implant survival % with the number of implants underneath; colour runs from green (high survival) to red (low). Grey cells have no data. Look for a gradient — survival usually falls from D1/D2 to D4 — and for outlier cells (e.g. a low value in a normally safe combination).

**Using it for research** — Identifies high-risk combinations (e.g. D4 bone + immediate loading) for protocol review and generates hypotheses for a case-control study. Report cells only when n ≥ 10.

**Interpretation cautions**
- Bone class is a subjective tactile / radiographic judgement made by the operator.
- Small cells (n < 5) swing between 0 % and 100 % with a single event.

## 5. Cross-tab (pivot)

**What data is collected** — Any two of: procedure type, bone type, region, implant system, survival status, supervisor and student cohort — from the same per-implant data set as the other tabs.

**How to read it** — Pick a row dimension and a column dimension; each cell is the implant count (and %, where shown) for that combination. Row and column totals frame the marginal distributions. Use it as an interactive contingency table.

**Using it for research** — This is your chi-square / Fisher table builder — for example implant system × failure status, or region × bone type. Copy the counts into a statistics package for the test and effect size (odds ratio / relative risk).

**Interpretation cautions**
- Cells with expected counts below 5 need Fisher's exact test rather than chi-square.
- Pivoting many combinations invites multiple-comparison problems — pre-register the question.

## 6. Learning Curve

**What data is collected** — Each student's cases in chronological order with their terminal outcome (completed vs terminated).

**How to read it** — The line is the running (cumulative) success rate as the student accumulates cases; the x-axis is case number, not calendar time. Early points are volatile (1 of 2 cases = 50 %); the curve should stabilise and trend upward. A plateau shows the level a trainee has reached; a late dip flags a cluster of problems worth reviewing.

**Using it for research** — A classic competency-assessment tool for postgraduate training: compare curves between cohorts, estimate the number of cases needed to reach a target success rate (CUSUM-style analysis can be run on the export), or evaluate a curriculum change by comparing before/after cohorts.

**Interpretation cautions**
- Case difficulty is not adjusted — combine with the Case-Mix Index.
- Faculty see all students; students see only themselves.
- Curves with fewer than ~10 cases mostly reflect noise.

## 7. Case-Mix Index (CMI) *(faculty only)*

**What data is collected** — Procedure type of every case per student / supervisor, weighted by complexity.

**How to read it** — Each case is assigned a complexity weight — Zygomatic 5.0 · All-on-X 4.0 · All-on-4/6 3.5–3.8 · Implant Overdenture 3.0 · Sinus lift / GBR 2.5 · Immediate 2.0 · Multiple conventional 1.5 · Single conventional 1.0. CMI = total weighted volume ÷ number of cases. A CMI near 1 means mostly simple cases; higher values mean more complex work per case.

**Using it for research** — Adjusts raw success rates for complexity when comparing trainees or supervisors, and documents progressive exposure to complex procedures for accreditation reports. Combine with the Learning Curve to interpret a lower success rate in a high-CMI trainee.

**Interpretation cautions**
- Weights are institutional conventions, not validated risk scores.
- CMI says nothing about outcome quality on its own.

## 8. Complications (Pareto)

**What data is collected** — Failure / replacement reasons recorded in Phase 5 survival reviews and treatment-ended reasons from Phase 1–4.

**How to read it** — Bars rank the reasons by frequency; the line is the cumulative percentage. The point where the cumulative line crosses 80 % identifies the "vital few" causes (the Pareto 80/20 principle) that account for most events. The per-procedure-type breakdown shows whether reasons differ by procedure.

**Using it for research** — Directs quality-improvement effort: the top two or three reasons are where a protocol change will have the largest effect. Re-run after an intervention to see whether the ranking changes — a before/after audit.

**Interpretation cautions**
- Reasons are free-text-derived categories; "Unknown" indicates incomplete documentation rather than a clinical cause.
- One implant can have only one primary reason recorded.

## 9. Failure Analysis

**What data is collected** — Failure dates relative to Phase 2 placement, replacement status, FDI tooth position of failed implants, and Phase 3 ISQ per anatomical region.

**How to read it** — Failure timing splits events into early (before prosthetic loading) and late (after loading) — early losses point to osseointegration or infection, late losses to biomechanical or peri-implantitis causes. The replacement panel shows how many failed implants were replaced and whether the replacements survive. The tooth map scales circle size and intensity with the number of failures at each FDI position. ISQ by region gives the median and interquartile range per anatomical region.

**Using it for research** — Supports the classification of failures in outcome papers (early vs late), site-specific risk studies (e.g. posterior maxilla) and the evaluation of re-implantation success. Region-specific ISQ medians serve as local reference values for loading decisions.

**Interpretation cautions**
- Timing depends on accurate dates in Phase 2 and Phase 5.
- Tooth-map counts are absolute; normalise by the number of implants placed at that position (Cross-tab) before comparing sites.

## 10. Follow-up

**What data is collected** — Phase 5 recall appointments: dates, per-implant survival status at each recall, 4-site probing depths versus the Phase 4 Step 2 baseline, and the last-visit date of completed cases.

**How to read it** — Recall discipline shows the share of completed cases with a follow-up in each interval. Period survival gives the % of reviewed implants surviving at 3, 6, 12 … months after prosthesis delivery. Probing-depth change plots the mean change (mm) over the four sites versus baseline — a rising line signals soft-tissue deterioration. "Overdue" lists completed cases with no visit in the last 6 months.

**Using it for research** — Peri-implant health outcomes (probing depth change, bleeding) are the basis for peri-implantitis incidence studies; recall discipline is itself a quality indicator. Use the overdue list operationally to reduce loss to follow-up, which directly improves the validity of the survival analyses.

**Interpretation cautions**
- Probing depth is examiner-dependent — calibrate examiners for research use.
- Survival per period counts only implants actually reviewed in that period.

## 11. Plan Adherence

**What data is collected** — Phase 1 surgical plan (implant system, dimensions, drilling protocol, guided vs freehand) compared with the Phase 2 intra-operative record.

**How to read it** — The headline % is how often the executed protocol matched the plan. The per-student list is sorted lowest first as a teaching KPI. The deviation breakdown shows which element (diameter, length, system, approach) is changed most often, and the latest-deviations list gives the individual cases.

**Using it for research** — Intra-operative plan changes are a surrogate for planning accuracy and for the value of guided surgery. Compare adherence between guided and freehand cases, or before/after a planning-software change.

**Interpretation cautions**
- A deviation can be clinically correct (adapting to bone found at surgery) — read the reason before judging.
- Only cases that reached Phase 2 are counted.

## 12. Augmentation

**What data is collected** — Pre-Implant Augmentation cases (staged, Phase 1 Steps 1–3) and simultaneous bone / soft-tissue augmentation recorded during Phase 2: procedure, graft material, healing period, smoking and diabetes status, Step 3 outcome (success, bone gain, complications).

**How to read it** — Staged vs simultaneous shows the workflow mix. The procedure and material panels give success rate and mean bone gain per grafting procedure and per material family (autogenous / allograft / xenograft / alloplast). The risk-factor panel splits success by smoking and diabetes; the healing-time panel tests whether longer healing improves success; the survival panel links Phase 5 implant survival to the augmentation route.

**Using it for research** — Grafting outcome studies (success and complication rates by material), risk-factor analyses and healing-protocol comparisons. Outcomes come only from staged Step 3 reviews — simultaneous augmentation contributes usage counts.

**Interpretation cautions**
- Bone gain is measured on CBCT by the operator; specify the measurement protocol in any publication.
- Confounding by indication: sicker sites get bigger grafts.

## 13. Impressions & Scanners

**What data is collected** — Phase 4 Step 1 impression record: modality (conventional vs intraoral scan), impression technique and material, intraoral scanner company / model, scan-body material and type, scan level.

**How to read it** — The modality split and monthly trend show the transition to digital workflows. Scanner Pareto bars rank the devices used; material and technique panels describe the conventional workflow; the digital-detail panel shows scan-body and scan-level choices; the last panel splits modality by procedure type.

**Using it for research** — Technology-adoption studies and, combined with Plan Adherence / Failure Analysis on the export, comparisons of prosthetic complication rates between digital and conventional workflows.

**Interpretation cautions**
- Scanner entries typed as "Other" are normalised only after In-Charge review — recent months may under-count a device.
- Modality is recorded per case, not per implant.

## 14. Aesthetic Risk

**What data is collected** — Phase 1 Esthetic Risk Assessment for anterior-maxilla cases (FDI 11–13 / 21–23): four patient-level factors (smile line, smile type, gingival biotype, patient expectations) and six site-level factors per edentulous area (adjacent teeth right/left, infection, ridge condition, bone level at adjacent teeth, width of edentulous span derived from the mesiodistal space).

**How to read it** — Each factor is graded Low / Medium / High; an area's overall grade is the highest factor grade and the case grade is the highest area. The distribution buckets and monthly trend describe the risk profile of the anterior cases treated. "Outcomes by overall grade" gives implant survival and early terminations per grade. Each factor card shows the option mix (sorted by share of High grades) and survival by grade for that factor.

**Using it for research** — Validates the risk assessment against outcomes (does High risk predict failure or early termination?), identifies the factors that drive risk in your population and supports case-selection rules for trainees. Pair with the Phase 5 soft-tissue data for esthetic-outcome studies.

**Interpretation cautions**
- Grades are clinician judgements recorded before surgery; keep the grading criteria consistent across operators.
- Site factors are counted per area, so multi-area cases contribute more than once to the factor panels.
- The overall grade follows the single worst factor — two cases with the same grade can have very different profiles.

## 15. Benchmarks

**What data is collected** — Your per-procedure-type implant survival (from Phase 5 reviews) compared with published 5-year survival ranges.

**How to read it** — Each row shows your n, number failed and survival %, next to the literature range and its citation. The verdict badge reads ▲ above the range, = on par, ▼ below.

**Using it for research** — A quick external validity check before writing up results, and a talking point for morbidity meetings. Cite the listed source when quoting the range.

**Interpretation cautions**
- Your follow-up time is usually shorter than the 5-year literature figure — an "above" verdict may only reflect immaturity of the cohort.
- Literature ranges come from populations and protocols that may differ from yours.

## 16. Research Export

**What data is collected** — One row per implant with the fields listed in the data dictionary below, plus the dictionary itself, generated for the current date filter and your role scope.

**How to read it** — The bundle is JSON: "rows" holds the per-implant records and "data_dictionary" describes every field, type and unit. Case, student and supervisor identifiers are SHA-256 hashes — stable within one export so rows can be grouped, but not reversible to a person.

**Using it for research** — Load the rows into R, Python, SPSS or Excel for survival analysis (Kaplan-Meier, Cox regression), logistic regression of failure predictors, or agreement studies. Because identifiers are hashed and no patient fields are included, the file is suitable for ethics-approved retrospective research; check your institution's policy before sharing outside.

**Interpretation cautions**
- Hashes differ between exports — merge only within the same export file.
- Fields left blank in the clinical record appear as null; document how missing data are handled.
- Every export is written to the access log.

## Appendix — Research Export data dictionary

| Field | Type | Description |
|---|---|---|
| `case_id` | string | SHA-256 (12-char) hash of the internal case id — stable within an export, not reversible. |
| `implant_seq` | int | 1-based sequence of the implant within the case. |
| `student_hash` | string | Hashed student identifier for cohort analysis without PII. |
| `supervisor_hash` | string | Hashed supervisor identifier. |
| `procedure_type` | string | Clinical procedure classification (e.g. Single Conventional Implant, All on 4). |
| `procedure_date` | date | Phase 1 planning date (YYYY-MM-DD). |
| `phase2_date` | date | Phase 2 surgical placement date. |
| `tooth` | string | FDI tooth number. |
| `region` | string | anterior_max / posterior_max / anterior_mand / posterior_mand / unknown. |
| `system` | string | Implant system / brand. |
| `diameter_mm` | float | Implant diameter in mm. |
| `length_mm` | float | Implant length in mm. |
| `insertion_torque_ncm` | float | Insertion torque in Ncm (Phase 2). |
| `isq` | float | ISQ resonance value at Phase 3. |
| `bone_type` | string | Misch / Lekholm-Zarb bone density (D1–D4) or Unknown. |
| `status` | string | Active / Failed / Replaced from the Phase 5 survival review. |
| `failure_reason` | string | Reason recorded on failure / replacement. |
| `failure_date` | date | Date of the failure event. |
