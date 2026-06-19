"""
Clinical rules v1 — five highest-value cross-phase reasoners.
Every rule cites from `_citations.py`. Add new rules below, each as
its own pure function decorated with @register_rule.

The procedure dict shape mirrors the MongoDB document on `procedures`:
  procedure["loading_type"]                — list[str]
  procedure["implant_procedure_type"]      — str
  procedure["medical_history"]             — { hba1c, smoker, … }
  procedure["implant_plans"]               — [ { position, diameter, length,
                                                bone_width_mm, bone_height_mm,
                                                axial_angulation_deg, isq, … } ]
  procedure["bone_graft"]                  — { planned, type, … }
"""
from typing import Optional
from ._base import RuleHit, Severity, register_rule

_FULL_ARCH = {"All on 4", "All on 6", "All on X"}


def _num(v, default=None):
    """Coerce DB values (often strings) to float; return default on fail."""
    try:
        if v in (None, ""):
            return default
        return float(v)
    except (TypeError, ValueError):
        return default


# ─────────────────────────────────────────────────────────────────────
# Rule 1 — Immediate-Loading guard (ITI 2023 Group 3)
# ─────────────────────────────────────────────────────────────────────
@register_rule
def rule_immediate_loading_without_primary_stability(proc: dict) -> Optional[RuleHit]:
    loading = proc.get("loading_type") or []
    if "Immediate Loading" not in loading:
        return None
    plans = proc.get("implant_plans") or []
    low_isq, low_torque = [], []
    for p in plans:
        isq = _num(p.get("isq"))
        torque = _num(p.get("insertion_torque_ncm"))
        if isq is not None and isq < 70:
            low_isq.append({"position": p.get("position"), "isq": isq})
        if torque is not None and torque < 35:
            low_torque.append({"position": p.get("position"), "torque": torque})
    if not low_isq and not low_torque:
        return None
    return RuleHit(
        rule_id="immediate_loading_stability",
        severity=Severity.HARD_BLOCK if low_isq else Severity.WARNING,
        title="Immediate loading proposed without confirmed primary stability",
        message=(
            "Phase 1 selected Immediate Loading, but Phase 2 records "
            f"{len(low_isq)} implant(s) with ISQ < 70 and {len(low_torque)} with "
            "insertion torque < 35 Ncm. Per ITI 2023 Group 3, immediate loading "
            "requires ISQ ≥ 70 OR insertion torque ≥ 35 Ncm. Consider switching "
            "to early/delayed loading for the affected sites."
        ),
        citation_id="ITI_2023_GROUP3_LOADING",
        phase="cross",
        context={"low_isq": low_isq, "low_torque": low_torque},
    )


# ─────────────────────────────────────────────────────────────────────
# Rule 2 — Diabetic risk-stack (Naujokat 2016 SR + Jiang 2022 SR-MA)
# ─────────────────────────────────────────────────────────────────────
@register_rule
def rule_diabetic_stack(proc: dict) -> Optional[RuleHit]:
    mh = proc.get("medical_history") or {}
    hba1c = _num(mh.get("hba1c"))
    smoker = bool(mh.get("smoker") or mh.get("tobacco_use"))
    loading = proc.get("loading_type") or []
    if hba1c is None or hba1c <= 7:
        return None
    additive = []
    if smoker:
        additive.append("active smoking")
    if "Immediate Loading" in loading:
        additive.append("immediate-loading protocol")
    severity = Severity.HARD_BLOCK if hba1c > 9 else Severity.WARNING
    return RuleHit(
        rule_id="diabetic_stack",
        severity=severity,
        title=f"Glycaemic control above threshold (HbA1c {hba1c:.1f} %)",
        message=(
            f"HbA1c {hba1c:.1f} % exceeds the 7 % threshold for predictable "
            f"osseointegration"
            + (f"; additionally compounded by {', '.join(additive)}" if additive else "")
            + ". Naujokat (2016) and Jiang (2022) report ≈ 2× elevated early-failure "
              "risk; consider deferring placement until HbA1c ≤ 7 % or adopting a "
              "delayed-loading protocol with antibiotic prophylaxis."
        ),
        citation_id=(
            "JIANG_SMOKING_SR_2022" if smoker else "NAUJOKAT_DIABETES_SR_2016"
        ),
        phase="phase1",
        context={"hba1c": hba1c, "smoker": smoker, "loading_type": loading},
    )


# ─────────────────────────────────────────────────────────────────────
# Rule 3 — Simultaneous GBR predictability (Buser 2009)
# ─────────────────────────────────────────────────────────────────────
@register_rule
def rule_gbr_labial_wall(proc: dict) -> Optional[RuleHit]:
    proc_type = proc.get("implant_procedure_type") or ""
    if proc_type != "Implant Placement with Guided Bone Regeneration":
        return None
    insufficient = []
    for p in proc.get("implant_plans") or []:
        labial = _num(p.get("labial_bone_thickness_mm"))
        if labial is not None and labial < 1.0:
            insufficient.append({
                "position": p.get("position"), "labial_mm": labial,
            })
    if not insufficient:
        return None
    return RuleHit(
        rule_id="gbr_labial_wall",
        severity=Severity.WARNING,
        title="Simultaneous GBR predictability concern",
        message=(
            f"{len(insufficient)} site(s) carry < 1 mm residual labial bone — "
            "Buser et al. (2009, 10-yr cohort) report simultaneous GBR is only "
            "predictable when ≥ 1 mm labial wall remains. Consider staged "
            "augmentation (GBR first, implant placement 4–6 months later)."
        ),
        citation_id="BUSER_GBR_2009",
        phase="cross",
        context={"sites": insufficient},
    )


# ─────────────────────────────────────────────────────────────────────
# Rule 4 — Full-arch axial divergence (ITI 2023 Group 4 + Misch 2020)
# ─────────────────────────────────────────────────────────────────────
@register_rule
def rule_full_arch_angulation(proc: dict) -> Optional[RuleHit]:
    if proc.get("implant_procedure_type") not in _FULL_ARCH:
        return None
    plans = proc.get("implant_plans") or []
    angs = [(_num(p.get("axial_angulation_deg")), p.get("position")) for p in plans]
    angs = [(a, pos) for a, pos in angs if a is not None]
    if len(angs) < 2:
        return None
    a_values = [a for a, _ in angs]
    max_div = max(a_values) - min(a_values)
    if max_div < 18:
        return None
    severity = Severity.HARD_BLOCK if max_div > 30 else Severity.WARNING
    cite = "MISCH_2020_ANGULATION" if max_div > 30 else "ITI_2023_GROUP4_FULLARCH"
    return RuleHit(
        rule_id="full_arch_angulation",
        severity=severity,
        title=f"Inter-implant axial divergence {max_div:.0f}° in full-arch case",
        message=(
            f"Maximum inter-implant axial divergence is {max_div:.0f}°. "
            + (
                "Per ITI 2023 Group 4, straight multi-unit abutments correct only "
                "up to ~17°; ≥ 18° requires angulated multi-unit abutments "
                "(Type A 17° or Type B 30°)."
                if max_div <= 30
                else "Misch (2020) flags > 30° divergence as a biomechanical "
                     "contraindication for passive full-arch fit — re-plan implant "
                     "positions or stage with tilted-implant protocol."
            )
        ),
        citation_id=cite,
        phase="phase1",
        context={"divergence_deg": max_div, "implants": angs},
    )


# ─────────────────────────────────────────────────────────────────────
# Rule 5 — ISQ + Immediate-loading thresholding (Sennerby & Meredith 2008)
# ─────────────────────────────────────────────────────────────────────
@register_rule
def rule_isq_low_primary_stability(proc: dict) -> Optional[RuleHit]:
    plans = proc.get("implant_plans") or []
    flagged = []
    for p in plans:
        isq = _num(p.get("isq"))
        if isq is not None and isq < 60:
            flagged.append({"position": p.get("position"), "isq": isq})
    if not flagged:
        return None
    return RuleHit(
        rule_id="isq_low_primary_stability",
        severity=Severity.WARNING,
        title="Primary stability below safe threshold on one or more implants",
        message=(
            f"{len(flagged)} implant(s) recorded ISQ < 60. "
            "Sennerby & Meredith (2008) consider this range indicative of poor "
            "primary stability — recommend delayed loading and tighter "
            "post-op follow-up (ISQ recheck at 4 and 8 weeks)."
        ),
        citation_id="SENNERBY_MEREDITH_ISQ_2008",
        phase="phase2",
        context={"implants": flagged},
    )
