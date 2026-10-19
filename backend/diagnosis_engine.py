"""iter-455: Phase 1 Clinical Diagnosis engine.

Deterministic, rule-based. The Implant Diagnosis Atlas (department resource)
is encoded here as a rules database: each parameter has lo / mod / hi bands
with a plain-language implication. The engine maps those parameters onto the
data actually captured in Phase 1 for the chosen treatment modality and
composes a structured, editable narrative diagnosis.

Output language deliberately contains NO literature citations, author names
or SAC/ERA labels — those stay in this module as comments only.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

LO, MOD, HI = "favourable", "modify", "high"
BAND_LABEL = {LO: "Favourable", MOD: "Modify plan", HI: "High risk / defer"}
BAND_RANK = {LO: 0, MOD: 1, HI: 2}

ANTERIOR_MAXILLA = {"11", "12", "13", "21", "22", "23"}
POSTERIOR_MAXILLA = {"14", "15", "16", "17", "18", "24", "25", "26", "27", "28"}
POSTERIOR_MANDIBLE = {"34", "35", "36", "37", "38", "44", "45", "46", "47", "48"}

ZYGOMA_TYPES = {
    "Quad Zygoma Implants", "Zygoma and Pterygoid Implants", "Pterygoid and Conventional Implants",
    "Zygoma and Conventional Implants", "Zygoma, Pterygoid and Conventional Implants",
}
FULL_ARCH_FIXED = {"All on 4", "All on 6", "All on X"}


# ─── helpers ────────────────────────────────────────────────────────────
def _num(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        s = str(v).strip().replace("mm", "").replace("%", "").strip()
        return float(s) if s else None
    except (TypeError, ValueError):
        return None


def _s(v: Any) -> str:
    return "" if v is None else str(v).strip()


def _f(code: str, section: str, label: str, value: str, band: str, implication: str, site: Optional[str] = None) -> Dict[str, Any]:
    d = {"code": code, "section": section, "label": label, "value": value, "band": band, "implication": implication}
    if site:
        d["site"] = site
    return d


def modality(proc: Dict[str, Any]) -> str:
    t = _s(proc.get("implant_procedure_type"))
    if t == "Existing Implant":
        return "existing"
    if t in ZYGOMA_TYPES:
        return "zygoma"
    if t in FULL_ARCH_FIXED:
        return "full_arch_fixed"
    if t == "Implant Overdenture":
        return "overdenture"
    if t == "Sinus Lift":
        return "sinus"
    if t in ("Immediate Implant", "Partial Extraction Therapy"):
        return "immediate"
    if t == "Implant Placement with Guided Bone Regeneration":
        return "gbr"
    if t == "Multiple Conventional Implants":
        return "multiple"
    return "single"


MODALITY_LABEL = {
    "existing": "Existing implant (maintenance / re-treatment)",
    "zygoma": "Graftless rehabilitation of the atrophic maxilla (zygomatic / pterygoid anchorage)",
    "full_arch_fixed": "Full-arch fixed implant rehabilitation",
    "overdenture": "Implant overdenture",
    "sinus": "Posterior maxilla with sinus floor elevation",
    "immediate": "Immediate / post-extraction implant placement",
    "gbr": "Implant placement with guided bone regeneration",
    "multiple": "Multiple implants — partially edentulous span",
    "single": "Single-tooth implant",
}


# ─── Tier 01 · patient-level risk ───────────────────────────────────────
def patient_findings(proc: Dict[str, Any]) -> List[Dict[str, Any]]:
    S = "Patient-level risk"
    ma: Dict[str, Any] = proc.get("medical_assessment") or {}
    out: List[Dict[str, Any]] = []

    # P-ASA
    asa = _s(ma.get("asa_class"))
    if asa in ("I", "II"):
        out.append(_f("P-ASA", S, "Physical status", f"ASA {asa}", LO, "Routine outpatient implant surgery."))
    elif asa == "III":
        out.append(_f("P-ASA", S, "Physical status", "ASA III", MOD,
                      "Physician liaison, stress-reduction protocol, shorter sessions and intra-operative monitoring; written clearance before scheduling."))
    elif asa in ("IV", "V", "VI"):
        out.append(_f("P-ASA", S, "Physical status", f"ASA {asa}", HI,
                      "Elective implant surgery deferred until the systemic condition is stabilised; refer for medical management and reassess."))

    # P-DM — control matters more than diagnosis
    dm = _s(ma.get("diabetes"))
    hba1c = _num(ma.get("hba1c"))
    if hba1c is not None:
        val = f"HbA1c {hba1c:g} %"
        if hba1c <= 7:
            out.append(_f("P-DM", S, "Glycaemic control", val, LO, "Treat as non-diabetic; standard healing times."))
        elif hba1c <= 8:
            out.append(_f("P-DM", S, "Glycaemic control", val, MOD,
                          "Proceed with caution: extended healing before loading, conservative immediate-loading decisions, closer peri-implant recall."))
        else:
            out.append(_f("P-DM", S, "Glycaemic control", val, HI,
                          "Defer elective placement; coordinate glycaemic control with the physician and repeat HbA1c before re-scheduling."))
    elif dm == "Uncontrolled":
        out.append(_f("P-DM", S, "Diabetes", "Uncontrolled", HI,
                      "Defer elective placement until glycaemic control is achieved; obtain HbA1c."))
    elif dm == "Controlled":
        out.append(_f("P-DM", S, "Diabetes", "Controlled", LO,
                      "Not a contraindication; record HbA1c within 3 months of surgery and keep peri-implant recall closer."))

    # P-SMK
    smk = _s(ma.get("smoking"))
    cpd = _num(ma.get("cigarettes_per_day"))
    if smk and smk != "No":
        heavy = smk.startswith("Heavy") or (cpd is not None and cpd >= 10)
        val = smk + (f" · {cpd:g}/day" if cpd is not None else "")
        if heavy:
            out.append(_f("P-SMK", S, "Tobacco use", val, HI,
                          "Reduced healing and higher marginal bone loss; cessation before any augmentation, staged rather than simultaneous grafting, cautious immediate loading."))
        else:
            out.append(_f("P-SMK", S, "Tobacco use", val, MOD,
                          "Cessation counselling; avoid augmentation-heavy plans where possible; closer recall."))
    elif smk == "No":
        out.append(_f("P-SMK", S, "Tobacco use", "Non-smoker", LO, "Standard protocol."))

    # P-ACG
    inr = _num(ma.get("inr"))
    acg = _s(ma.get("anticoagulant"))
    if inr is not None and inr > 3.5:
        out.append(_f("P-ACG", S, "Anticoagulation", f"INR {inr:g}", HI,
                      "INR above the safe surgical range — physician liaison before any surgery; do not stop anticoagulants without the physician."))
    elif acg == "Yes" or (inr is not None and inr > 1.5):
        val = "On anticoagulant / antiplatelet therapy" + (f" · INR {inr:g}" if inr is not None else "")
        out.append(_f("P-ACG", S, "Anticoagulation", val, MOD,
                      "Continue therapy; INR within 24–72 h of surgery (target ≤ 3.5); local haemostasis with sutures and haemostatic agents; limit the extent of surgery per session."))

    # P-ARD — antiresorptives
    bp = _s(ma.get("bisphosphonate"))
    osteo = _s(ma.get("osteoporosis"))
    if bp == "IV":
        out.append(_f("P-ARD", S, "Antiresorptive therapy", "Intravenous bisphosphonate", HI,
                      "High risk of medication-related osteonecrosis; elective implants generally contraindicated — multidisciplinary decision only."))
    elif bp == "Oral" or osteo == "Yes":
        out.append(_f("P-ARD", S, "Antiresorptive therapy", "Oral bisphosphonate / osteoporosis medication", MOD,
                      "Document agent, indication and duration; physician discussion (any drug holiday is the physician's decision); informed consent for osteonecrosis risk; atraumatic surgery."))

    # P-RT
    if _s(ma.get("radiation")) == "Yes":
        out.append(_f("P-RT", S, "Head-and-neck radiotherapy", "Yes", HI,
                      "Osteoradionecrosis risk: obtain the dose delivered to the planned site, wait ≥ 6–12 months after therapy, atraumatic technique and extended healing; multidisciplinary decision."))

    # Haematology
    hb = _num(ma.get("hb"))
    if hb is not None and hb < 10:
        out.append(_f("P-HEM", S, "Haemoglobin", f"{hb:g} g/dL", MOD,
                      "Anaemia — physician review and correction before elective surgery; expect slower healing."))
    tlc = _num(ma.get("tlc"))
    if tlc is not None and (tlc < 4000 or tlc > 11000):
        out.append(_f("P-HEM", S, "Total leucocyte count", f"{tlc:g} /µL", MOD,
                      "Abnormal leucocyte count — rule out active infection or haematological disease before surgery."))
    pt = _num(ma.get("prothrombin_time"))
    if pt is not None and pt > 16:
        out.append(_f("P-HEM", S, "Prothrombin time", f"{pt:g} s", MOD,
                      "Prolonged clotting — physician review; plan local haemostatic measures."))

    # P-GRO — growth
    age = _num(proc.get("age"))
    if age is not None and age < 18:
        out.append(_f("P-GRO", S, "Skeletal growth", f"Age {age:g}", HI,
                      "Growth not complete — an implant will end up in infraposition; defer and maintain space with a resin-bonded or orthodontic retainer."))

    # P-PER — periodontal status
    perio = _s(proc.get("periodontal_status"))
    if perio == "Good":
        out.append(_f("P-PER", S, "Periodontal status", "Good", LO, "Proceed; routine supportive care."))
    elif perio == "Fair":
        out.append(_f("P-PER", S, "Periodontal status", "Fair", MOD,
                      "Complete periodontal therapy to stable pockets ≤ 4 mm without bleeding; 3-month supportive recall after implants."))
    elif perio == "Poor":
        out.append(_f("P-PER", S, "Periodontal status", "Poor", HI,
                      "History of periodontitis is a risk indicator for peri-implant disease; complete active periodontal therapy and re-evaluate before any implant."))

    # P-BRX — parafunction
    pf = _s(proc.get("parafunction_habit"))
    if pf == "Present":
        out.append(_f("P-BRX", S, "Parafunction / bruxism", "Present", MOD,
                      "Design for technical load: monolithic materials, avoid cantilevers, splint units, consider more or wider implants, mandatory night guard; staged loading."))
    elif pf == "Absent":
        out.append(_f("P-BRX", S, "Parafunction / bruxism", "Absent", LO, "Standard design."))

    # P-EXP — expectations (ERA patient factor)
    era = proc.get("aesthetic_risk") or {}
    exp = _s(era.get("patient_expectations"))
    if exp.startswith("High"):
        out.append(_f("P-EXP", S, "Esthetic expectation", "High", MOD,
                      "Document expectations; show a mock-up or digital simulation before consent; the combination with a thin phenotype and high smile line is the highest-risk esthetic scenario."))

    # Zygoma-specific medical flags captured in the Z/P form
    zp = ((proc.get("zygoma_pterygoid_data") or {}).get("phase1") or {})
    zma = zp.get("medical_assessment") or {}
    if _s(zma.get("immunosuppression")) == "Yes":
        out.append(_f("P-IMM", S, "Immunosuppression", "Yes", MOD,
                      "Physician liaison; steroid cover where indicated; conservative loading; defer if disease is active or uncontrolled."))
    if _s(zma.get("psychological_suitability")) == "No":
        out.append(_f("P-EXP", S, "Psychological readiness", "Concern", MOD,
                      "Reassess readiness for staged treatment and interim prostheses before consent."))
    return out


# ─── Tier 02 · site findings (per tooth) ────────────────────────────────
def site_findings(proc: Dict[str, Any], mod: str) -> List[Dict[str, Any]]:
    S = "Site diagnosis"
    out: List[Dict[str, Any]] = []
    if mod in ("existing", "zygoma", "full_arch_fixed", "overdenture"):
        return out

    teeth = [str(t) for t in (proc.get("missing_teeth") or []) if t]
    meas: Dict[str, Dict[str, Any]] = proc.get("edentulous_site_measurements") or {}
    sockets: Dict[str, str] = proc.get("socket_types") or {}
    era = proc.get("aesthetic_risk") or {}
    era_sites = era.get("sites") if isinstance(era.get("sites"), dict) else {}

    # Case-level fallbacks (legacy single-site fields)
    md_default = _num(proc.get("mesiodistal_space"))
    oc_default = _num(proc.get("occlusocervical_height"))

    for tooth in teeth or []:
        m = meas.get(tooth) or {}
        md = _num(m.get("md"))
        oc = _num(m.get("oc"))
        if md is None and len(teeth) == 1:
            md = md_default
        if oc is None and len(teeth) == 1:
            oc = oc_default

        # S-MD
        if md is not None:
            if md >= 7:
                out.append(_f("S-MD", S, "Mesiodistal space", f"{md:g} mm", LO, "Regular-diameter implant with ≥ 1.5 mm to each adjacent root.", tooth))
            elif md >= 5.5:
                out.append(_f("S-MD", S, "Mesiodistal space", f"{md:g} mm", MOD, "Narrow implant (3.0–3.5 mm) or reduced-diameter platform; confirm inter-radicular space at the apical level on CBCT.", tooth))
            else:
                out.append(_f("S-MD", S, "Mesiodistal space", f"{md:g} mm", HI, "Insufficient for an implant: orthodontic space opening, or a resin-bonded / cantilever bridge instead.", tooth))
        # S-IOS
        if oc is not None:
            if oc >= 7:
                out.append(_f("S-IOS", S, "Interocclusal (restorative) space", f"{oc:g} mm", LO, "Any restorative design possible, including cement-retained on a custom abutment.", tooth))
            elif oc >= 5:
                out.append(_f("S-IOS", S, "Interocclusal (restorative) space", f"{oc:g} mm", MOD, "Screw-retained restoration directly on the implant or on a low Ti-base; monolithic material.", tooth))
            else:
                out.append(_f("S-IOS", S, "Interocclusal (restorative) space", f"{oc:g} mm", HI, "Create space first: reduce or intrude the opposing tooth, or correct the supra-erupted antagonist.", tooth))
        # S-SOCK (immediate cases)
        sock = _s(sockets.get(tooth))
        if sock:
            if sock.startswith("Type I") and not sock.startswith("Type II"):
                out.append(_f("S-SOCK", S, "Extraction socket", sock, LO, "Soft tissue and buccal plate at normal level — candidate for immediate placement with a palatal position and gap graft.", tooth))
            elif sock.startswith("Type II"):
                out.append(_f("S-SOCK", S, "Extraction socket", sock, MOD, "Buccal plate partly missing: immediate placement only with a buccal graft / shell technique in experienced hands, otherwise early (staged) placement.", tooth))
            elif sock.startswith("Type III"):
                out.append(_f("S-SOCK", S, "Extraction socket", sock, HI, "Soft tissue and buccal plate both reduced: ridge augmentation first, delayed placement.", tooth))

        # ERA site factors stored per leader tooth
        es = era_sites.get(tooth) or {}
        inf = _s(es.get("infection_at_site") or (era.get("infection_at_site") if not era_sites else ""))
        if inf == "Chronic":
            out.append(_f("S-INF", S, "Infection at site", "Chronic", MOD, "Thorough debridement; immediate placement acceptable only in experienced hands, otherwise early placement after resolution.", tooth))
        elif inf == "Acute":
            out.append(_f("S-INF", S, "Infection at site", "Acute / purulent", HI, "Resolve infection first; place after soft-tissue healing (4–8 weeks) or partial bone fill.", tooth))
        bl = _s(es.get("bone_level_adjacent") or (era.get("bone_level_adjacent") if not era_sites else ""))
        if bl.startswith("≤ 5"):
            out.append(_f("S-PAP", S, "Bone crest to contact point", bl, LO, "Papilla predictably present.", tooth))
        elif bl.startswith("5.5"):
            out.append(_f("S-PAP", S, "Bone crest to contact point", bl, MOD, "Papilla fill uncertain (~50 %); warn the patient; plan a longer contact point.", tooth))
        elif bl.startswith("≥ 7"):
            out.append(_f("S-PAP", S, "Bone crest to contact point", bl, HI, "Papilla unlikely: plan a longer contact, pink ceramic, or vertical augmentation; counsel on black-triangle risk.", tooth))
        rc = _s(es.get("ridge_condition") or (era.get("ridge_condition") if not era_sites else ""))
        if rc == "Horizontal bone defect":
            out.append(_f("M-RDG", S, "Ridge defect", "Horizontal", MOD, "Contained horizontal defect: simultaneous guided bone regeneration with placement; non-contained knife-edge ridge needs staged augmentation.", tooth))
        elif rc in ("Vertical bone defect", "Horizontal and Vertical bone defect"):
            out.append(_f("M-RDG", S, "Ridge defect", rc.replace(" bone defect", ""), HI, "Staged vertical / three-dimensional augmentation, or accept a longer crown with pink ceramic.", tooth))
        elif rc == "No hard tissue defect":
            out.append(_f("M-RDG", S, "Ridge defect", "None", LO, "Adequate ridge for prosthetically driven placement.", tooth))
        adj_r, adj_l = _s(es.get("adjacent_teeth_right")), _s(es.get("adjacent_teeth_left"))
        if adj_r in ("Restored", "Root canal treated") or adj_l in ("Restored", "Root canal treated"):
            out.append(_f("P-ENDO", S, "Adjacent teeth", ", ".join(x for x in {adj_r, adj_l} if x and x != "Non-restored"), MOD,
                          "Confirm periapical health of restored / root-treated neighbours (retrograde peri-implantitis source); match restorative shade and form.", tooth))

    # Case-level soft-tissue parameters
    stt = _s(proc.get("soft_tissue_thickness"))
    if stt == "Thin":
        out.append(_f("S-STH", S, "Soft-tissue thickness", "Thin", HI, "Expect ~1 mm crestal remodelling: thicken the tissue (connective-tissue graft or collagen matrix) or place slightly subcrestal with platform switching."))
    elif stt == "Thick":
        out.append(_f("S-STH", S, "Soft-tissue thickness", "Thick", LO, "Crestal bone expected to remain stable with platform-level placement."))
    km = _s(proc.get("keratinized_mucosa"))
    if km == "Absent":
        out.append(_f("S-KM", S, "Keratinised mucosa", "Absent / < 2 mm", HI, "More plaque, brushing discomfort and recession: plan a free gingival graft or apically positioned flap."))
    elif km == "Present":
        out.append(_f("S-KM", S, "Keratinised mucosa", "Present", LO, "Adequate band of keratinised tissue at the planned emergence."))

    anterior = any(t in ANTERIOR_MAXILLA for t in teeth)
    gb = _s(proc.get("gingival_biotype"))
    if gb:
        if gb.startswith("Thin"):
            out.append(_f("S-PHN", S, "Gingival phenotype", gb, HI, "Recession risk: connective-tissue graft at or before placement, palatal implant position, zirconia or TiN abutment, concave subcritical contour."))
        elif gb.startswith("Medium"):
            out.append(_f("S-PHN", S, "Gingival phenotype", gb, MOD, "Consider soft-tissue augmentation in the esthetic zone; palatal positioning."))
        else:
            out.append(_f("S-PHN", S, "Gingival phenotype", gb, LO, "Lower recession risk; standard abutment materials."))
    sl = _s(proc.get("smile_line"))
    if sl and anterior:
        if sl == "High":
            out.append(_f("S-SML", S, "Smile line", "High", HI, "Full crown plus gingiva on display — every soft-tissue error will be visible; plan soft-tissue augmentation and a provisional phase to shape the emergence."))
        elif sl == "Medium":
            out.append(_f("S-SML", S, "Smile line", "Medium", MOD, "Papillae visible at full smile; manage contact-point position and emergence profile."))
        else:
            out.append(_f("S-SML", S, "Smile line", "Low", LO, "Gingival margin hidden at full smile; esthetic risk reduced."))
    if anterior and sl == "High" and gb.startswith("Thin") and _s((proc.get("aesthetic_risk") or {}).get("patient_expectations")).startswith("High"):
        out.append(_f("S-ERA", S, "Esthetic risk combination", "High demand + thin phenotype + high smile line", HI,
                      "Highest-risk anterior scenario: staged soft- and hard-tissue augmentation, long provisional phase, expert-level surgery; discuss limitations before consent."))
    return out


# ─── Tier 03/04 · prosthetic and occlusal ───────────────────────────────
def prosthetic_findings(proc: Dict[str, Any], mod: str) -> List[Dict[str, Any]]:
    S = "Prosthetic & occlusal"
    out: List[Dict[str, Any]] = []
    if mod == "existing":
        return out

    opp = _s(proc.get("opposing_dentition"))
    if opp == "Implant Prosthesis":
        out.append(_f("M-OPP", S, "Opposing dentition", "Implant-supported", MOD,
                      "No periodontal proprioception on either side: highest occlusal forces and technical-complication rate — implant-protective occlusion, robust materials, splinted units."))
    elif opp == "Natural":
        out.append(_f("M-OPP", S, "Opposing dentition", "Natural teeth", LO, "Protective proprioception present; standard implant-protective occlusion."))
    elif opp == "Absent":
        out.append(_f("M-OPP", S, "Opposing dentition", "Absent", MOD, "Plan the opposing arch together with this one; a removable antagonist is unstable against a fixed implant restoration."))

    oa = _s(proc.get("opposing_arch"))
    if oa == "Fixed Implant Prosthesis":
        out.append(_f("F-OPP", S, "Opposing arch", oa, MOD, "Implant arch opposing implant arch raises forces on both: prefer ≥ 6 implants in the maxilla, metal-reinforced or monolithic designs, night guard."))
    elif oa in ("Removable Prosthesis", "Edentulous"):
        out.append(_f("F-OPP", S, "Opposing arch", oa, MOD, "A complete denture opposing a fixed implant arch is unstable and resorbs the opposing ridge; plan both arches together and set the occlusal scheme accordingly."))
    elif oa:
        out.append(_f("F-OPP", S, "Opposing arch", oa, LO, "Favourable force pairing."))

    sch = _s(proc.get("occlusal_scheme"))
    pf = _s(proc.get("parafunction_habit"))
    if sch == "Group Function" and pf == "Present":
        out.append(_f("M-OCC", S, "Occlusal scheme", "Group function with parafunction", MOD, "Excursive load will fall on implants: keep posterior implants out of excursive contact, light centric contacts, shallow cusps."))
    elif sch:
        out.append(_f("M-OCC", S, "Occlusal scheme", sch, LO, "Maintain natural anterior / canine guidance; implant-protective occlusion with light centric contact."))

    vd = _s(proc.get("vertical_dimension"))
    if vd == "Compromised":
        out.append(_f("F-VDO", S, "Vertical dimension", "Compromised", MOD, "Re-establish the vertical dimension in the diagnostic set-up and verify it with a long-term provisional before the definitive prosthesis."))
    elif vd == "Sufficient":
        out.append(_f("F-VDO", S, "Vertical dimension", "Sufficient", LO, "Restorative space adequate at the existing vertical dimension."))

    # Restorative space (full-arch / overdenture) — mm
    rs = _num(proc.get("available_interarch_space")) or _num(proc.get("vertical_dimension_mm"))
    if rs is not None:
        if mod == "overdenture":
            if rs >= 13:
                out.append(_f("O-ATT", S, "Restorative space", f"{rs:g} mm", LO, "Bar-retained or stud-retained overdenture both possible."))
            elif rs >= 10:
                out.append(_f("O-ATT", S, "Restorative space", f"{rs:g} mm", MOD, "Stud attachments only; a bar will not fit."))
            else:
                out.append(_f("O-ATT", S, "Restorative space", f"{rs:g} mm", HI, "Low-profile studs only, or acrylic too thin over the housings (fracture site) — consider alveolar reduction."))
        elif mod in ("full_arch_fixed", "zygoma"):
            if rs >= 15:
                out.append(_f("F-RS", S, "Restorative space", f"{rs:g} mm", LO, "Any design possible, including a metal-acrylic hybrid."))
            elif rs >= 12:
                out.append(_f("F-RS", S, "Restorative space", f"{rs:g} mm", MOD, "Monolithic zirconia or titanium bar with bonded crowns; hybrid acrylic will be too thin."))
            else:
                out.append(_f("F-RS", S, "Restorative space", f"{rs:g} mm", HI, "Insufficient for a full-arch prosthesis: segmented crowns, or planned alveolar reduction to create space before implant placement."))
        else:
            if rs >= 7:
                out.append(_f("S-IOS", S, "Interocclusal space", f"{rs:g} mm", LO, "Adequate for any restorative design."))
            elif rs >= 5:
                out.append(_f("S-IOS", S, "Interocclusal space", f"{rs:g} mm", MOD, "Screw-retained monolithic restoration."))
            else:
                out.append(_f("S-IOS", S, "Interocclusal space", f"{rs:g} mm", HI, "Create restorative space before placement."))

    tmj = _s(proc.get("tmj"))
    if tmj == "Deviation Present":
        out.append(_f("F-TMJ", S, "Temporomandibular joint", "Deviation present", MOD, "Stabilise joint function and confirm a reproducible jaw relation before fixing the vertical dimension and occlusal scheme."))

    # Span / number
    teeth = [str(t) for t in (proc.get("missing_teeth") or []) if t]
    n = _num(proc.get("num_implants"))
    if mod == "multiple" and len(teeth) >= 3 and n is not None and n >= len(teeth):
        out.append(_f("M-NUM", S, "Implant number for the span", f"{int(n)} implants for {len(teeth)} teeth", MOD,
                      "One implant per tooth is not required: pontics between implants behave better than adjacent implants; keep ≥ 3 mm between platforms to preserve the inter-implant crest."))
    if mod == "multiple" and any(t in ANTERIOR_MAXILLA for t in teeth) and len([t for t in teeth if t in ANTERIOR_MAXILLA]) >= 2:
        out.append(_f("M-IPP", S, "Adjacent anterior implants", f"{len([t for t in teeth if t in ANTERIOR_MAXILLA])} anterior sites", MOD,
                      "Papilla between two implants is short (~3 mm): prefer implant + ovate pontic over adjacent implants except at the central incisors; inform the patient."))
    return out


# ─── Tier 02/04/05/06 · modality-specific ───────────────────────────────
def modality_findings(proc: Dict[str, Any], mod: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    teeth = [str(t) for t in (proc.get("missing_teeth") or []) if t]

    if mod == "sinus":
        S = "Sinus floor elevation"
        slt = _s(proc.get("sinus_lift_type"))
        if slt.startswith("Direct"):
            out.append(_f("S-RBH", S, "Sinus approach", "Lateral window (direct)", MOD,
                          "Indicates residual bone height below ~5 mm: lateral-window augmentation; staged placement when primary stability cannot be achieved; confirm membrane thickness and ostium patency on CBCT."))
        elif slt.startswith("Indirect"):
            out.append(_f("S-RBH", S, "Sinus approach", "Transcrestal (indirect)", MOD,
                          "Indicates residual bone height ~5–8 mm: transcrestal elevation with simultaneous placement or a short implant; avoid membrane perforation."))
        out.append(_f("S-SIN", S, "Sinus health", "To be confirmed on CBCT", MOD,
                      "Membrane thickening ≥ 5 mm, ostium obstruction or a fluid level require ENT assessment before any sinus surgery; odontogenic sinusitis from an adjacent tooth must be removed first."))

    if mod == "immediate":
        S = "Immediate placement"
        out.append(_f("S-APX", S, "Primary stability", "Requires ≥ 3–5 mm of apical / palatal bone", MOD,
                      "Confirm apical and palatal bone on CBCT; aim for insertion torque ≥ 30–35 Ncm if an immediate provisional is planned, otherwise use a healing abutment and delayed loading."))
        out.append(_f("S-BBT", S, "Buccal plate", "To be confirmed on CBCT", MOD,
                      "Buccal plate ≤ 1 mm resorbs after extraction: palatal implant position, gap graft (≥ 2 mm gap) and often a connective-tissue graft in the esthetic zone."))

    if mod == "gbr":
        S = "Guided bone regeneration"
        out.append(_f("M-RDG", S, "Augmentation strategy", "Simultaneous vs staged", MOD,
                      "A contained horizontal defect can be grafted with placement; a knife-edge ridge or vertical deficit needs staged augmentation and 4–9 months of graft healing before implants."))

    if mod == "single" and teeth:
        S = "Posterior anatomy"
        if any(t in POSTERIOR_MANDIBLE for t in teeth):
            out.append(_f("S-IAN", S, "Inferior alveolar canal", "Clearance to be confirmed on CBCT", MOD,
                          "Keep ≥ 2 mm from the canal (allow for drill overshoot and guide error); a lingual concavity risks perforation and floor-of-mouth bleeding."))
        if any(t in POSTERIOR_MAXILLA for t in teeth):
            out.append(_f("S-RBH", S, "Residual bone below the sinus", "Height to be confirmed on CBCT", MOD,
                          "≥ 8–10 mm standard length; 5–8 mm short implant or transcrestal elevation; < 5 mm lateral-window augmentation."))

    if mod in ("full_arch_fixed", "overdenture"):
        S = "Full-arch assessment"
        ac = _s(proc.get("arch_condition"))
        if ac == "Resorbed":
            out.append(_f("F-RRF", S, "Residual ridge", "Resorbed", HI,
                          "Flat or depressed ridge: tilted, zygomatic or pterygoid strategies, or augmentation; verify the mental foramen / anterior loop and achievable antero-posterior spread."))
        elif ac == "Low Well Formed":
            out.append(_f("F-RRF", S, "Residual ridge", "Low, well formed", MOD, "Reduced height: shorter implants, tilted distal implants, or alveoloplasty for a knife-edge crest."))
        elif ac:
            out.append(_f("F-RRF", S, "Residual ridge", ac, LO, "Adequate height and width for axial implants."))
        rc = _s(proc.get("ridge_contour"))
        if rc == "Low Contoured":
            out.append(_f("F-RRF", S, "Ridge contour", "Low", MOD, "Expect a longer prosthetic flange / pink zone; check lip support and transition-line concealment at full smile."))
        if mod == "full_arch_fixed":
            out.append(_f("F-TRL", S, "Transition line", "To be confirmed at full smile", MOD,
                          "The prosthesis–mucosa junction must be hidden above the lip at full smile; decide any alveolar reduction before surgery and transfer it with a guide."))
            out.append(_f("F-APS", S, "Antero-posterior spread", "To be measured on the plan", MOD,
                          "≥ 10 mm spread allows a cantilever of ~1.5× (mandible) / ~1× (maxilla); a square arch needs extra posterior or pterygoid implants."))
            arch = _s(proc.get("arch"))
            n = _num(proc.get("num_implants"))
            if arch == "Maxillary" and n is not None and n <= 4 and (_s(proc.get("parafunction_habit")) == "Present" or _s(proc.get("opposing_arch")) == "Fixed Implant Prosthesis"):
                out.append(_f("F-NUM", S, "Implant number — maxilla", f"{int(n)} implants", MOD,
                              "Prefer ≥ 6 implants in the maxilla with parafunction or an opposing implant arch; low-density bone also favours more fixtures."))
        if mod == "overdenture":
            od = _s(proc.get("overdenture_type"))
            arch = _s(proc.get("arch"))
            if arch == "Maxillary":
                out.append(_f("O-MAX", S, "Maxillary overdenture support", od or "Overdenture", MOD,
                              "≥ 4 implants, splinted or well distributed, for palate-free retention; two implants are not recommended in the maxilla; reinforce the base with a metal framework if opposing natural teeth."))
            elif arch == "Mandibular":
                out.append(_f("O-MAN", S, "Mandibular overdenture", od or "Overdenture", LO,
                              "Two implants at or just distal to the canine positions, parallel to each other and to the path of insertion; check the lingual concavity."))
            if _s(proc.get("opposing_arch")) == "Natural Dentition" and arch == "Maxillary":
                out.append(_f("O-CMB", S, "Combination pattern", "Maxillary denture vs natural lower anteriors", MOD,
                              "Anterior maxillary resorption and flabby ridge pattern: implant support in the anterior maxilla, plane correction and tissue management before the definitive prosthesis."))

    if mod == "zygoma":
        S = "Atrophic maxilla — zygomatic / pterygoid"
        zp = ((proc.get("zygoma_pterygoid_data") or {}).get("phase1") or {})
        ps = zp.get("pre_surgical") or {}
        opening = _num(ps.get("interincisal_opening_mm"))
        if opening is not None:
            if opening < 30:
                out.append(_f("Z-MO", S, "Mouth opening", f"{opening:g} mm", HI, "Access for the long drills and oblique path is doubtful; reassess feasibility and anaesthesia (nasal intubation)."))
            elif opening < 35:
                out.append(_f("Z-MO", S, "Mouth opening", f"{opening:g} mm", MOD, "Limited opening — general anaesthesia with nasal intubation usually required; verify posterior access."))
            else:
                out.append(_f("Z-MO", S, "Mouth opening", f"{opening:g} mm", LO, "Adequate surgical access."))
        if _s(ps.get("sinus_health")) == "No":
            out.append(_f("Z-SIN", S, "Rhino-sinus status", "Pathology present", HI, "ENT treatment before surgery; active sinusitis or ostium obstruction is a contraindication until resolved."))
        elif _s(ps.get("sinus_health")) == "Yes":
            out.append(_f("Z-SIN", S, "Rhino-sinus status", "Clear", LO, "Proceed; document the baseline for post-operative comparison."))
        omc = ps.get("omc_patent") or {}
        for side in ("right", "left"):
            if _s(omc.get(side)) == "No":
                out.append(_f("Z-SIN", S, f"Ostiomeatal complex — {side}", "Not patent", HI, "Obstructed drainage compromises the implant path; ENT consultation before surgery."))
        rrf = _s((zp.get("intraoral") or {}).get("residual_ridge_form"))
        if rrf in ("Class V", "Class VI"):
            out.append(_f("F-RRF", S, "Residual ridge form", rrf, HI, "Flat or depressed maxilla: graftless zygomatic / pterygoid anchorage is the indicated strategy; conventional axial implants are not feasible without major augmentation."))
        elif rrf == "Class IV":
            out.append(_f("F-RRF", S, "Residual ridge form", rrf, MOD, "Knife-edge ridge: alveoloplasty or narrow / tilted implants; zygomatic anchorage only where posterior zones are absent."))
        elif rrf:
            out.append(_f("F-RRF", S, "Residual ridge form", rrf, LO, "Ridge volume adequate; confirm the indication for zygomatic anchorage."))
        zaga = zp.get("zaga") or {}
        for side in ("right", "left"):
            z = _s(zaga.get(side))
            if z in ("ZAGA 3", "ZAGA 4"):
                out.append(_f("Z-ZAGA", S, f"Buttress–crest anatomy — {side}", z, MOD, "Extramaxillary path with little bone around the head: plan soft-tissue coverage (e.g. buccal fat pad) and crestal emergence to avoid dehiscence and oro-sinus communication."))
            elif z:
                out.append(_f("Z-ZAGA", S, f"Buttress–crest anatomy — {side}", z, LO, "Intrasinus / trans-wall path with the head on the crest."))
        bz = zp.get("bedrossian_zones") or {}
        def _has(k: str, side: str) -> bool:
            return (_num((bz.get(k) or {}).get(side)) or 0) > 0
        for side in ("right", "left"):
            z1, z2, z3 = _has("zone1_premaxilla_mm", side), _has("zone1_premolar_mm", side), _has("zone1_molar_mm", side)
            if any((z1, z2, z3)) or bz:
                if z1 and z2 and z3:
                    out.append(_f("Z-BED", S, f"Bone by zone — {side}", "Premaxilla, premolar and molar zones", LO, "Conventional axial implants possible on this side."))
                elif z1 and z2:
                    out.append(_f("Z-BED", S, f"Bone by zone — {side}", "Premaxilla + premolar", LO, "Anterior axial plus tilted posterior implant on this side."))
                elif z1:
                    out.append(_f("Z-BED", S, f"Bone by zone — {side}", "Premaxilla only", MOD, "Anterior conventional implants plus one zygomatic implant on this side."))
                elif bz:
                    out.append(_f("Z-BED", S, f"Bone by zone — {side}", "No usable zone", HI, "Two zygomatic implants (quad) or zygomatic + pterygoid anchorage on this side."))
        lip = _s((zp.get("extraoral") or {}).get("lip_support"))
        if lip.startswith("Deficient"):
            out.append(_f("F-LIP", S, "Lip support", "Deficient — flange required", MOD, "Lip support comes from the flange: fixed design needs a buccal pink contour with designed-in cleanability, otherwise a removable flange."))
        elif lip == "Adequate":
            out.append(_f("F-LIP", S, "Lip support", "Adequate without flange", LO, "Fixed prosthesis without a flange is possible."))
        zr = zp.get("zygomatic_region") or {}
        for side in ("right", "left"):
            orb = _num((zr.get("orbital_floor_distance_mm") or {}).get(side))
            if orb is not None and orb < 5:
                out.append(_f("Z-ORB", S, f"Orbital floor clearance — {side}", f"{orb:g} mm", HI, "Trajectory close to the orbital floor: re-plan the exit point on CBCT and confirm intra-operatively."))
            memb = _num((zr.get("sinus_membrane_thickening_mm") or {}).get(side))
            if memb is not None and memb >= 5:
                out.append(_f("Z-SIN", S, f"Sinus membrane — {side}", f"{memb:g} mm thickening", MOD, "Opacity with a patent ostium may proceed; obstruction or active sinusitis needs ENT clearance first."))
        dc = zp.get("design_checks") or {}
        failed = [k.replace("_", " ") for k, v in dc.items() if _s(v) == "No"]
        if failed:
            out.append(_f("Z-DSN", S, "Design checks", ", ".join(failed), MOD, "Resolve the failed design checks (apex distance, prosthetic envelope, antero-posterior spread, cantilever) in the virtual plan before surgery."))
    return out


# ─── not-assessed list ──────────────────────────────────────────────────
def not_assessed(proc: Dict[str, Any], mod: str) -> List[str]:
    gaps: List[str] = []
    ma = proc.get("medical_assessment") or {}
    if not _s(ma.get("asa_class")):
        gaps.append("ASA physical status")
    if _s(ma.get("diabetes")) in ("Controlled", "Uncontrolled") and _num(ma.get("hba1c")) is None:
        gaps.append("HbA1c (glycaemic control)")
    if mod == "existing":
        return gaps
    gaps += ["Plaque and bleeding scores", "Periodontitis stage / grade", "Bruxism grade (possible / probable / definite)"]
    teeth = [str(t) for t in (proc.get("missing_teeth") or []) if t]
    meas = proc.get("edentulous_site_measurements") or {}
    if mod in ("single", "multiple", "immediate", "gbr", "sinus"):
        if any(_num((meas.get(t) or {}).get("md")) is None for t in teeth) and _num(proc.get("mesiodistal_space")) is None:
            gaps.append("Mesiodistal space (mm) at every site")
        if any(t in POSTERIOR_MANDIBLE for t in teeth):
            gaps.append("Clearance to the inferior alveolar canal (mm)")
        if any(t in POSTERIOR_MAXILLA for t in teeth):
            gaps.append("Residual bone height below the sinus (mm)")
        if any(t in ANTERIOR_MAXILLA for t in teeth):
            gaps += ["Buccal plate thickness (mm)", "Sagittal root position"]
        if mod == "multiple":
            gaps.append("Inter-implant distance (mm)")
        if not _s(proc.get("soft_tissue_thickness")):
            gaps.append("Supracrestal soft-tissue thickness")
        if not _s(proc.get("keratinized_mucosa")):
            gaps.append("Keratinised mucosa width")
    if mod in ("full_arch_fixed", "overdenture", "zygoma"):
        if _num(proc.get("available_interarch_space")) is None and _num(proc.get("vertical_dimension_mm")) is None:
            gaps.append("Restorative space crest-to-opposing plane (mm)")
        gaps += ["Antero-posterior spread (mm)", "Hygiene capability / dexterity"]
        if mod != "zygoma":
            gaps += ["Lip support (flange test)", "Transition-line visibility at full smile"]
    return gaps


# ─── verdict + narrative ────────────────────────────────────────────────
def verdict_for(findings: List[Dict[str, Any]]) -> str:
    if not findings:
        return "Incomplete"
    bands = [f["band"] for f in findings]
    if HI in bands:
        # Patient-level HI → Defer; site/prosthetic HI → Modify plan (staged / augmentation)
        if any(f["band"] == HI and f["section"] == "Patient-level risk" for f in findings):
            return "Defer"
        return "Modify plan"
    if MOD in bands:
        return "Modify plan"
    return "Proceed"


VERDICT_TEXT = {
    "Proceed": "The case is suitable for elective implant treatment as planned with standard protocols.",
    "Modify plan": "The case is suitable for implant treatment provided the plan is modified as outlined above (staging, augmentation, design or protocol changes).",
    "Defer": "Elective implant surgery should be deferred until the patient-level risks above are addressed and the patient is re-assessed.",
    "Incomplete": "Insufficient Phase 1 data to grade the case — complete the medical assessment and clinical examination, then regenerate.",
}


def _fmt_site(f: Dict[str, Any]) -> str:
    return f"tooth {f['site']}: " if f.get("site") else ""


def compose_text(proc: Dict[str, Any], mod: str, findings: List[Dict[str, Any]], gaps: List[str], verdict: str) -> str:
    teeth = [str(t) for t in (proc.get("missing_teeth") or []) if t]
    arch = _s(proc.get("arch"))
    hdr = [f"CLINICAL DIAGNOSIS — PHASE 1"]
    who = ", ".join(x for x in [_s(proc.get("patient_name")), f"{_s(proc.get('age'))} y" if _s(proc.get("age")) else "", _s(proc.get("sex"))] if x)
    if who:
        hdr.append(who)
    plan = _s(proc.get("implant_procedure_type"))
    line = f"Treatment modality: {MODALITY_LABEL.get(mod, plan)} ({plan})" if plan else ""
    if arch:
        line += f", {arch.lower()} arch"
    if teeth and mod not in ("full_arch_fixed", "overdenture", "zygoma"):
        line += f"; site(s): {', '.join(teeth)}"
    if line:
        hdr.append(line + ".")
    cc = _s(proc.get("chief_complaint"))
    if cc:
        hdr.append(f"Presenting complaint: {cc}")

    sections: List[str] = []
    order = ["Patient-level risk", "Site diagnosis", "Prosthetic & occlusal"]
    extra = [s for s in dict.fromkeys(f["section"] for f in findings) if s not in order]
    for sec in order + extra:
        fs = [f for f in findings if f["section"] == sec]
        if not fs:
            continue
        hi = [f for f in fs if f["band"] == HI]
        md = [f for f in fs if f["band"] == MOD]
        lo = [f for f in fs if f["band"] == LO]
        lines = [f"{sec.upper()}"]
        for f in hi + md:
            tag = "High risk" if f["band"] == HI else "Modify plan"
            lines.append(f"• {_fmt_site(f)}{f['label']} — {f['value']} [{tag}]. {f['implication']}")
        if lo:
            fav = "; ".join(f"{_fmt_site(f)}{f['label'].lower()} {f['value'].lower()}" for f in lo)
            lines.append(f"• Favourable: {fav}.")
        sections.append("\n".join(lines))

    if not findings:
        sections.append("No risk parameters recorded in Phase 1 — complete the clinical examination and medical assessment to generate findings.")

    summary = [f"OVERALL ASSESSMENT: {verdict.upper()}", VERDICT_TEXT[verdict]]
    actions = [f"{_fmt_site(f)}{f['implication'].split('.')[0].split(';')[0]}" for f in findings if f["band"] in (HI, MOD)]
    if actions:
        seen: List[str] = []
        for a in actions:
            if a not in seen:
                seen.append(a)
        summary.append("Key actions before surgery: " + "; ".join(seen[:8]) + ".")

    tail = []
    if gaps:
        tail.append("NOT ASSESSED IN PHASE 1 (record if relevant): " + "; ".join(gaps) + ".")

    return "\n\n".join(["\n".join(hdr)] + sections + ["\n".join(summary)] + tail)


def generate(proc: Dict[str, Any]) -> Dict[str, Any]:
    mod = modality(proc)
    findings = patient_findings(proc)
    if mod != "existing":
        findings += site_findings(proc, mod) + prosthetic_findings(proc, mod) + modality_findings(proc, mod)
    gaps = not_assessed(proc, mod)
    verdict = verdict_for(findings)
    text = compose_text(proc, mod, findings, gaps, verdict)
    counts = {LO: 0, MOD: 0, HI: 0}
    for f in findings:
        counts[f["band"]] += 1
    return {
        "modality": mod,
        "modality_label": MODALITY_LABEL.get(mod, mod),
        "findings": findings,
        "not_assessed": gaps,
        "verdict": verdict,
        "counts": counts,
        "generated_text": text,
        "text": text,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "version": 1,
    }
