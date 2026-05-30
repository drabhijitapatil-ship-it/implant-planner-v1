"""
Full-Arch Atrophy Classification — clinical decision rules for completely
edentulous arches under Full-Arch implant rehabilitation.

Encoded thresholds and treatment options derived from a peer-reviewed
classification system used in the institutional clinical guideline set.

NOTE: This module intentionally contains no source attribution. The output
is treated as institutional clinical guidance.

Inputs (all in millimetres):
    arch:              "maxilla" | "mandible"
    anterior_height:   bone height in the anterior region
    posterior_height:  bone height in the posterior region
    anterior_width:    crestal bone width in the anterior region
    posterior_width:   crestal bone width in the posterior region

Output: a dict containing class label, severity descriptors, therapeutic
options (A/B/C), loading recommendation and augmentation triggers.
"""
from typing import Optional, Dict, Any, List


# ── Threshold definitions ────────────────────────────────────────────
# Anterior region (both jaws)
ANT_SIMPLE_MIN = 16          # CCI / CCII baseline
ANT_MODERATE_MIN = 12        # CCIII lower bound
ANT_ADVANCED_MIN = 8         # CCIV lower bound
# Posterior region (both jaws)
POST_SIMPLE_MIN = 12         # CCI baseline
POST_MODERATE_MIN = 8        # CCII lower bound
POST_ADVANCED_MIN = 4        # CCIII lower bound
# Width
WIDTH_SUFFICIENT = 6         # < 6 mm is treated as severe regardless of height


def _classify_region(height: float, width: float, region: str) -> str:
    """Return one of: 'simple', 'moderate', 'advanced', 'severe' for a region."""
    if width is not None and width < WIDTH_SUFFICIENT:
        return "severe"
    if region == "anterior":
        if height >= ANT_SIMPLE_MIN:
            return "simple"
        if height >= ANT_MODERATE_MIN:
            return "moderate"
        if height >= ANT_ADVANCED_MIN:
            return "advanced"
        return "severe"
    # posterior
    if height >= POST_SIMPLE_MIN:
        return "simple"
    if height >= POST_MODERATE_MIN:
        return "moderate"
    if height >= POST_ADVANCED_MIN:
        return "advanced"
    return "severe"


_CLASS_RANK = {"simple": 1, "moderate": 2, "advanced": 3, "severe": 4}


def _resolve_class(ant_sev: str, post_sev: str) -> str:
    """Combine anterior + posterior severity into the 5-class label.
       CCI: ant simple + post simple
       CCII: ant simple + post moderate
       CCIII: ant moderate + post advanced (or worse posterior with simple/moderate anterior)
       CCIV: ant advanced + post severe
       CCV: ant severe (anterior is the bottleneck)
    """
    if ant_sev == "severe":
        return "CCV"
    if post_sev == "severe":
        # CCIV when anterior is at most advanced; if anterior is also severe handled above
        if ant_sev in ("simple", "moderate"):
            return "CCIV"
        return "CCIV"  # ant advanced + post severe
    if ant_sev == "advanced":
        return "CCIV" if post_sev in ("advanced", "severe") else "CCIII"
    if ant_sev == "moderate":
        return "CCIII"
    # ant simple
    if post_sev == "simple":
        return "CCI"
    return "CCII"  # ant simple + post moderate (or post advanced rare)


# ── Treatment options encoded per (arch, class) ────────────────────────
_OPTIONS: Dict[str, Dict[str, List[Dict[str, Any]]]] = {
    "maxilla": {
        "CCI": [
            {"label": "A", "implant_count": 6, "kind": "fixed",
             "placement": "Four anterior (lateral incisors–first premolars, within the anterior sinus walls); two posterior (first molar position).",
             "tilt": "All straight, equidistant."},
            {"label": "B", "implant_count": 4, "kind": "fixed",
             "placement": "Two anterior (canine position); two posterior (first molar position).",
             "tilt": "All straight, equidistant."},
            {"label": "C", "implant_count": 4, "kind": "overdenture",
             "placement": "Anterior region (lateral incisor + first premolar positions).",
             "tilt": "Non-splinted."},
        ],
        "CCII": [
            {"label": "A", "implant_count": 6, "kind": "fixed",
             "placement": "Four anterior (lateral incisor–first premolar; constrained by anterior sinus wall); two shorter posterior (first molar).",
             "tilt": "All straight, equidistant."},
            {"label": "B", "implant_count": 4, "kind": "fixed",
             "placement": "Anterior (lateral incisor–first premolar). Posterior tilted ~17° following the anterior maxillary sinus wall (entry first molar, apex second premolar).",
             "tilt": "Posterior tilted 17°."},
            {"label": "C", "implant_count": 4, "kind": "overdenture",
             "placement": "Anterior (lateral incisor + first premolar).",
             "tilt": "Non-splinted."},
        ],
        "CCIII": [
            {"label": "A", "implant_count": 6, "kind": "fixed",
             "placement": "Two straight anterior (lateral incisors); two distally tilted in premolar position; two short posterior implants (4–8 mm) in molar position.",
             "tilt": "Mixed: anterior straight + premolar tilted + short posterior."},
            {"label": "B", "implant_count": 4, "kind": "fixed",
             "placement": "Anterior region constrained by sinus wall. Posterior implants tilted 17–30° along sinus wall, emerging at second premolar; 14-mm cantilever may reach first molar.",
             "tilt": "Posterior tilted 17–30°."},
            {"label": "C", "implant_count": 4, "kind": "overdenture",
             "placement": "Central incisors and canine positions.",
             "tilt": "Non-splinted."},
        ],
        "CCIV": [
            {"label": "A", "implant_count": 6, "kind": "fixed",
             "placement": "Four anterior (two straight lateral incisors; others tilted 17–30° contouring sinus wall, entry first premolar). Two posterior placed simultaneously with bilateral sinus elevation.",
             "tilt": "Anterior partially tilted; posterior straight after sinus lift.",
             "augmentation": "Bilateral sinus elevation required for posterior implants."},
            {"label": "B", "implant_count": 6, "kind": "fixed",
             "placement": "Anterior as in Option A. Posterior: two pterygoid/tuberosity implants tilted ~70° (15–20 mm) anchored in pterygoid process.",
             "tilt": "Pterygoid tilted ~70°."},
            {"label": "C", "implant_count": 4, "kind": "overdenture",
             "placement": "Premaxilla only, supporting an overdenture.",
             "tilt": "Non-splinted."},
        ],
        "CCV": [
            {"label": "A", "implant_count": 6, "kind": "fixed",
             "placement": "Six or more straight implants in canine, first premolar, and first molar positions, simultaneously or after sinus lift + horizontal regeneration.",
             "tilt": "All straight after augmentation.",
             "augmentation": "Sinus lift + horizontal augmentation typically required."},
            {"label": "B", "implant_count": 4, "kind": "fixed",
             "placement": "Four short straight implants (4 or 6 mm) in lateral-incisor + first-premolar positions, plus two zygomatic implants (>=30 mm) tilted forward into zygomatic bone. (Alt.: four zygomatic if anterior implants are not stable.)",
             "tilt": "Anterior straight short + zygomatic forward-tilted."},
            {"label": "C", "implant_count": 4, "kind": "overdenture",
             "placement": "Short implants or post-augmentation, supporting an overdenture.",
             "tilt": "—",
             "augmentation": "Augmentation often required."},
        ],
    },
    "mandible": {
        "CCI": [
            {"label": "A", "implant_count": 6, "kind": "fixed",
             "placement": "Two anterior (lateral incisors); two distal (anterior to mental foramen, safe distance from mental nerve); two posterior (first or second molar depending on the opposing arch).",
             "tilt": "All straight."},
            {"label": "B", "implant_count": 4, "kind": "fixed",
             "placement": "Two anterior (anterior to mental foramen, canine position); two posterior (first molar position).",
             "tilt": "All straight."},
            {"label": "C", "implant_count": 2, "kind": "overdenture",
             "placement": "Anterior region (lateral incisor position). 2–4 implants accepted.",
             "tilt": "Non-splinted."},
        ],
        "CCII": [
            {"label": "A", "implant_count": 6, "kind": "fixed",
             "placement": "Four axial anterior implants (as CCI anterior) plus two short implants in the posterior region (first molar).",
             "tilt": "All straight; posterior shorter."},
            {"label": "B", "implant_count": 4, "kind": "fixed",
             "placement": "Two straight anterior (lateral incisors); two posterior tilted 17–30° (entry slightly posterior to mental foramen — coinciding with foramen if loop is 5.7 mm). 10–14 mm distal cantilever acceptable.",
             "tilt": "Posterior tilted 17–30°."},
            {"label": "C", "implant_count": 2, "kind": "overdenture",
             "placement": "Anterior region.",
             "tilt": "Non-splinted."},
        ],
        "CCIII": [
            {"label": "A", "implant_count": 6, "kind": "fixed",
             "placement": "Four anterior implants per CCII Option B + two short posterior implants in first-molar position.",
             "tilt": "Mixed."},
            {"label": "B", "implant_count": 4, "kind": "fixed",
             "placement": "Two straight anterior + two posterior tilted; distal entry aligned with first premolar due to reduced posterior height. Distal cantilever acceptable.",
             "tilt": "Posterior tilted."},
            {"label": "C", "implant_count": 2, "kind": "overdenture",
             "placement": "Anterior region.",
             "tilt": "Non-splinted."},
        ],
        "CCIV": [
            {"label": "A", "implant_count": 4, "kind": "fixed",
             "placement": "Four equidistant straight implants in the anterior region (lateral incisors; tilted 17° with entry at or slightly posterior to mental foramen).",
             "tilt": "Slight 17° tilt."},
            {"label": "B", "implant_count": 6, "kind": "fixed",
             "placement": "Four implants between mental foramina (as Option A) plus posterior implants 6–8 mm at first molar after vertical bone grafting.",
             "tilt": "Anterior straight; posterior straight after graft.",
             "augmentation": "Vertical bone grafting in the posterior region."},
            {"label": "C", "implant_count": 2, "kind": "overdenture",
             "placement": "Anterior region.",
             "tilt": "Non-splinted."},
        ],
        "CCV": [
            {"label": "A", "implant_count": 4, "kind": "fixed",
             "placement": "Four short (4 or 6 mm) straight implants equidistant in the anterior region: two lateral incisors + two first premolars (safe distance from mental foramen).",
             "tilt": "All straight short."},
            {"label": "B", "implant_count": 4, "kind": "fixed",
             "placement": "Four or six axial implants (CCII Option A or B positions) after invasive extraoral autogenous bone graft (hip/rib/calvarium).",
             "tilt": "All straight after major graft.",
             "augmentation": "Extraoral autogenous bone graft (high-risk procedure)."},
            {"label": "C", "implant_count": 2, "kind": "overdenture",
             "placement": "Anterior region; short implants.",
             "tilt": "Non-splinted."},
        ],
    },
}


_AUGMENTATION_NOTES: Dict[str, str] = {
    "CCI": "No augmentation required.",
    "CCII": "Augmentation generally not required; tilted posterior implants resolve sinus/nerve constraints.",
    "CCIII": "Posterior augmentation may be considered as an alternative to short or tilted implants.",
    "CCIV": "Sinus elevation (maxilla) or vertical bone grafting (mandible) typically required for posterior implants; pterygoid/tilted alternatives reduce graft need.",
    "CCV": "Major augmentation (sinus lift + horizontal regeneration in maxilla; extraoral autogenous graft in mandible) OR zygomatic implants (maxilla) / four short implants (mandible) as graftless alternatives.",
}


def classify_full_arch(
    arch: str,
    anterior_height: Optional[float],
    posterior_height: Optional[float],
    anterior_width: Optional[float] = None,
    posterior_width: Optional[float] = None,
) -> Dict[str, Any]:
    """Classify a full-arch atrophy case and return therapeutic options.

    Returns a dict; if required inputs are missing, returns
    `{"ok": False, "error": "..."}` for safe fallback.
    """
    arch = (arch or "").lower().strip()
    if arch not in ("maxilla", "mandible"):
        return {"ok": False, "error": "arch must be 'maxilla' or 'mandible'"}
    if anterior_height is None or posterior_height is None:
        return {"ok": False, "error": "anterior_height and posterior_height are required"}

    ant_sev = _classify_region(float(anterior_height), float(anterior_width) if anterior_width is not None else 99, "anterior")
    post_sev = _classify_region(float(posterior_height), float(posterior_width) if posterior_width is not None else 99, "posterior")
    cls = _resolve_class(ant_sev, post_sev)

    options = _OPTIONS[arch][cls]

    # Loading rule
    if cls == "CCV":
        loading = "Conventional (delayed) loading preferred. Immediate loading may be considered for the zygomatic-anchored maxillary option if anterior implants achieve primary stability >30 N·cm."
    elif arch == "maxilla":
        loading = "Immediate loading is acceptable when primary stability >30 N·cm is achieved on every implant. Default to delayed loading if any risk factor is present (smoking, uncontrolled diabetes, bruxism, periodontal disease, severe atrophy)."
    else:
        loading = "Immediate loading is acceptable when primary stability >30 N·cm is achieved on every implant; otherwise use delayed loading."

    severity_label = {
        "CCI": "Simple — minimal atrophy",
        "CCII": "Moderate posterior atrophy",
        "CCIII": "Advanced posterior atrophy",
        "CCIV": "Severe posterior atrophy",
        "CCV": "Severe global atrophy (anterior + posterior)",
    }[cls]

    return {
        "ok": True,
        "arch": arch,
        "class": cls,
        "severity_label": severity_label,
        "anterior_severity": ant_sev,
        "posterior_severity": post_sev,
        "inputs": {
            "anterior_height_mm": anterior_height,
            "posterior_height_mm": posterior_height,
            "anterior_width_mm": anterior_width,
            "posterior_width_mm": posterior_width,
        },
        "treatment_options": options,
        "loading_recommendation": loading,
        "augmentation_note": _AUGMENTATION_NOTES[cls],
    }


def render_for_ai_context(assessment: Dict[str, Any]) -> str:
    """Render a per-arch assessment dict as a compact context block for the
    AI prompt (no source attribution, plain prose)."""
    if not assessment or not assessment.get("ok"):
        return ""
    lines = [
        f"Atrophy class for the {assessment['arch']}: {assessment['class']} ({assessment['severity_label']}).",
        f"Anterior region: {assessment['anterior_severity']}; posterior region: {assessment['posterior_severity']}.",
        "Recommended therapeutic options:",
    ]
    for opt in assessment["treatment_options"]:
        line = f"  • Option {opt['label']}: {opt['implant_count']} implants ({opt['kind']}) — {opt['placement']}"
        if opt.get("tilt") and opt["tilt"] != "—":
            line += f" Tilt: {opt['tilt']}"
        if opt.get("augmentation"):
            line += f" Augmentation: {opt['augmentation']}"
        lines.append(line)
    lines.append(f"Loading: {assessment['loading_recommendation']}")
    lines.append(f"Augmentation guidance: {assessment['augmentation_note']}")
    return "\n".join(lines)
