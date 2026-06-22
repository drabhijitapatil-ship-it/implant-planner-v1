"""
Full-Arch Atrophy Classification — clinical decision rules for completely
edentulous arches under Full-Arch implant rehabilitation.

Encoded thresholds and treatment options are direct verbatim text from
**The Carameˆs Classification** of the atrophic maxilla and mandible
(reference cited as "The Carameˆs Classification" in user-facing
surfaces). No paraphrasing — each option carries the full descriptive
paragraph from the source publication.

Inputs (all in millimetres):
    arch:              "maxilla" | "mandible"
    anterior_height:   bone height in the anterior region
    posterior_height:  bone height in the posterior region
    anterior_width:    crestal bone width in the anterior region
    posterior_width:   crestal bone width in the posterior region

Output: a dict containing class label (internal palette key only —
never surfaced to users), the verbatim anterior/posterior definitions,
verbatim treatment options each with a derived headline of the form
"Fixed prosthesis - N implants" / "Removable overdenture", loading
recommendation and augmentation guidance.
"""
from typing import Optional, Dict, Any, List


# ── Threshold definitions (per Carames classification) ──────────────
# Anterior region (both jaws)
ANT_SIMPLE_MIN = 16          # CCI / CCII baseline (height >16 mm)
ANT_MODERATE_MIN = 12        # CCIII lower bound  (12-16 mm)
ANT_ADVANCED_MIN = 8         # CCIV  lower bound  (8-12 mm)
# Posterior region (both jaws)
POST_SIMPLE_MIN = 12         # CCI baseline  (>12 mm)
POST_MODERATE_MIN = 8        # CCII lower bound  (8-12 mm)
POST_ADVANCED_MIN = 4        # CCIII lower bound (4-8 mm)
# Width
WIDTH_SUFFICIENT = 6         # < 6 mm is treated as severe regardless of height


SOURCE_REFERENCE = "The Carames Classification"


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


def _resolve_class(ant_sev: str, post_sev: str) -> str:
    """Combine anterior + posterior severity into the 5-class internal key.
    The key is used only for palette colour selection — it is never
    surfaced to users."""
    if ant_sev == "severe":
        return "CCV"
    if post_sev == "severe":
        if ant_sev in ("simple", "moderate"):
            return "CCIV"
        return "CCIV"
    if ant_sev == "advanced":
        return "CCIV" if post_sev in ("advanced", "severe") else "CCIII"
    if ant_sev == "moderate":
        return "CCIII"
    if post_sev == "simple":
        return "CCI"
    return "CCII"


# ── Verbatim Carames text (anterior + posterior definitions per class) ──
_DEFINITIONS: Dict[str, Dict[str, Dict[str, str]]] = {
    "maxilla": {
        "CCI": {
            "anterior":  "Anterior - Available bone (height >16 mm; width >6 mm)",
            "posterior": "Posterior - Available bone (height >12 mm; width >6 mm)",
        },
        "CCII": {
            "anterior":  "Anterior - available bone: height >16 mm; width >6 mm",
            "posterior": "Posterior - moderate resorption: height >8 mm and <12 mm; width >6 mm",
        },
        "CCIII": {
            "anterior":  "Anterior - moderate resorption: height >12 mm and <16 mm; width >6 mm",
            "posterior": "Posterior - advanced resorption: height >4 mm and <8 mm; width >6 mm",
        },
        "CCIV": {
            "anterior":  "Anterior - advanced resorption: height >8 mm and <12 mm; width >6 mm",
            "posterior": "Posterior - severe resorption: height <4 mm or width <6 mm",
        },
        "CCV": {
            "anterior":  "Anterior - severe resorption: height <8 mm or width <6 mm",
            "posterior": "Posterior - severe resorption: height <4 mm or width <6 mm",
        },
    },
    "mandible": {
        "CCI": {
            "anterior":  "Anterior - Available bone (height >16 mm; width >6 mm)",
            "posterior": "Posterior - Available bone (height >12 mm; width >6 mm)",
        },
        "CCII": {
            "anterior":  "Anterior - Available bone (height >16 mm; width >6 mm)",
            "posterior": "Posterior - Moderate resorption (height >8 mm and <12 mm; width >6 mm)",
        },
        "CCIII": {
            "anterior":  "Anterior - Moderate resorption (height >12 mm and <16 mm; width >6 mm)",
            "posterior": "Posterior - Advanced resorption (height >4 mm and <8 mm; width >6 mm)",
        },
        "CCIV": {
            "anterior":  "Anterior - Advanced resorption (height >8 mm and <12 mm; width >6 mm)",
            "posterior": "Posterior - Severe resorption (height <4 mm or width <6 mm)",
        },
        "CCV": {
            "anterior":  "Anterior - Severe resorption (height <8 mm or width <6 mm)",
            "posterior": "Posterior - Severe resorption (height <4 mm or width <6 mm)",
        },
    },
}


# ── Verbatim Carames treatment options ────────────────────────────────
# Each option carries `description` (the full verbatim paragraph from the
# source) plus structural metadata used purely to derive the option
# headline ("Fixed prosthesis - 6 implants" / "Removable overdenture")
# and to drive the palette colour on the frontend.
_OPTIONS: Dict[str, Dict[str, List[Dict[str, Any]]]] = {
    "maxilla": {
        "CCI": [
            {"implant_count": 6, "kind": "fixed",
             "description": "Placement of six straight equidistant implants. The four anterior implants are placed between the anterior walls of the maxillary sinuses. Their entry points are the lateral incisors and first premolars positions. The two posterior implants are placed in the first molar position. In case of opposing natural dentition with a functional second molar, the posterior implants should be placed in a way that enables function, preferably without a cantilever. A fixed cross-arch prosthesis without a distal cantilever is proposed."},
            {"implant_count": 4, "kind": "fixed",
             "description": "Placement of four equidistant straight implants. The two anterior implants should be placed at the canine position and the two posterior implants at the first molar position. A fixed cross-arch prosthesis without a distal cantilever is proposed."},
            {"implant_count": 4, "kind": "overdenture",
             "description": "Placement of a full-arch removable prosthesis. An overdenture supported by four non-splinted implants is placed in the anterior region of the maxilla in the lateral incisor and first premolar positions."},
        ],
        "CCII": [
            {"implant_count": 6, "kind": "fixed",
             "description": "Placement of six straight equidistant implants. Four implants are placed in the area limited by the anterior wall of the sinus, in the lateral incisor and first premolar positions. Two shorter implants are placed in the posterior region in the first molar position."},
            {"implant_count": 4, "kind": "fixed",
             "description": "Placement of four straight implants in the region limited by the anterior wall of the maxillary sinus, in the lateral incisor and first premolar positions. The posterior implants with the same length are tilted at a 17 degrees angle following the slope of the anterior wall maxillary sinus. The implant's entry point is the first molar position with its apex in the second premolar position."},
            {"implant_count": 4, "kind": "overdenture",
             "description": "Placement of a full-arch removable prosthesis. An overdenture supported by four non-splinted implants is placed in the anterior region of the maxilla in the lateral incisor and first premolar positions."},
        ],
        "CCIII": [
            {"implant_count": 6, "kind": "fixed",
             "description": "Placement of six implants in the maxilla. Two straight implants are placed in the lateral incisors position, two distally tilted implants in the premolar position and two short implants (>4 mm and <8 mm) in the posterior region in the molar position, allowing second molar occlusion without cantilevers."},
            {"implant_count": 4, "kind": "fixed",
             "description": "Placement of four implants in the region limited by the anterior wall of the maxillary sinus. Taking into account the variable slope of the anterior maxillary sinus wall, the distally placed implants should tilt at an angle of 17-30 degrees. These implants usually emerge at the second premolar and are guided by the anterior maxillary sinus wall. An extended 14 mm cantilever reaching a first molar occlusion can be expected in the full-arch rehabilitation."},
            {"implant_count": 4, "kind": "overdenture",
             "description": "Placement of a full-arch overdenture supported by four implants. Since the inter-antral distance is limited, the mesiodistal space between the implants is short. The implants' entry points are in the central incisors and canine positions."},
        ],
        "CCIV": [
            {"implant_count": 6, "kind": "fixed",
             "description": "Placement of six implants. Four implants are placed in the anterior region of the maxilla. The two posterior implants are placed simultaneously with a bilateral sinus elevation procedure. Taking into consideration the reduced anterior bone height, only two anterior implants can be placed straight in the lateral incisors position, whereas the other two if necessary can be tilted (17-30 degrees) to contour a prominent anterior wall of the maxillary sinus, allowing for an implant with a more frequent entry point in the first premolar position."},
            {"implant_count": 6, "kind": "fixed",
             "description": "Placement of six implants with the same protocol as the first option for the anterior region of the maxilla. In the posterior region, two pterygoid or tuberosity implants are placed with an average angulation of 70 degrees to the occlusal plane. These two implants are usually longer (15-20 mm). They pass through the maxillary tuberosity, the pyramidal process of the palatine bone and are fixed in a dense cortical bone of the pterygoid process of the sphenoid bone."},
            {"implant_count": 4, "kind": "overdenture",
             "description": "Although there is less bone availability compared to the overdenture option of the previous class, the rehabilitation scheme is similar, with four implants placed in the premaxilla to support an overdenture."},
        ],
        "CCV": [
            {"implant_count": 6, "kind": "fixed",
             "description": "Placement of six or more straight implants at the same time or after a bilateral sinus lift procedure and horizontal regeneration. These implants are placed straight in the region of the sinus lift graft, usually with entry points corresponding to the canine, first premolar and first molar positions. Due to extensive horizontal bone resorption, a horizontal augmentation procedure complements the surgical rehabilitation scheme."},
            {"implant_count": 4, "kind": "fixed",
             "description": "Placement of four short implants in the anterior region of the maxilla. Two straight implants are placed in the lateral incisors position and two implants adjacent to the maxillary sinus lift wall. In the posterior region of the maxilla, two zygomatic implants are placed tilted forward to obtain implant anchorage and stability in the zygomatic bone by increasing the implant length to >=30 mm. Immediate loading is possible if the anterior implants are stable. When it is not possible to place stable implants in the anterior region, four zygomatic implants can be used. The main advantage of this option is allowing immediate loading without a grafting procedure. This option requires a surgeon who is trained and skillful in this technique and should be considered as the last option in treatment planning due to the possible surgical complications."},
            {"implant_count": 4, "kind": "overdenture",
             "description": "The severe bone resorption of this class requires short implants or augmentation of the premaxilla to stabilize the implants and support an overdenture."},
        ],
    },
    "mandible": {
        "CCI": [
            {"implant_count": 6, "kind": "fixed",
             "description": "Placement of six straight implants. Two anterior implants are placed in the lateral incisors position. Two distal implants are placed in the anterior region following the anatomically driven approach, and their entry point must have a safe anterior distance to the mental nerve and its possible loop. In the posterior region, two implants are placed in the first or second molar position depending on the functional molars of the opposing dentition."},
            {"implant_count": 4, "kind": "fixed",
             "description": "Placement of four implants. Two straight implants are placed anteriorly to the mental foramen, in the canine position, and two straight implants in the posterior region, in the first molar position."},
            {"implant_count": 4, "kind": "overdenture",
             "description": "Use of an overdenture supported by two or four non-splinted implants placed in the anterior region of the mandible, in the same position as described for the fixed six-implant scheme."},
        ],
        "CCII": [
            {"implant_count": 6, "kind": "fixed",
             "description": "Placement of six straight implants. The available anterior bone length enables the placement of four axial implants. Their position and the surgical approach are similar to those of the anterior implants proposed for Mandible Class I (six-implant scheme). The reduced bone height in the first molar position requires the use of short implants in this area."},
            {"implant_count": 4, "kind": "fixed",
             "description": "Placement of four implants in the anterior region. The two most anterior implants are placed vertically in the lateral incisors position. Taking into consideration the posterior bone height availability over the mandibular canal, two tilted implants with entry points slightly posterior to the mental foramina, usually at the second premolar position, can be placed. Since an angulation of 17-30 degrees is used, their trajectory passes forward of the mental nerve loop. In cases with a maximum mental nerve loop length of 5.7 mm, the implant entry point should coincide with the mental foramen. In this rehabilitation scheme, a distal 10-to-14-mm cantilever in the first molar position should be considered."},
            {"implant_count": 4, "kind": "overdenture",
             "description": "Use of an overdenture supported by two or four non-splinted implants placed in the anterior region of the mandible, similar to the removable rehabilitation schemes of the previous class."},
        ],
        "CCIII": [
            {"implant_count": 6, "kind": "fixed",
             "description": "Placement of four implants in the anterior region and two in the posterior region. The implants placed in the anterior region follow the surgical and prosthodontic criteria of the four-implant tilted scheme for Mandible Class II. In addition, two short posterior implants are placed in the first molar position."},
            {"implant_count": 4, "kind": "fixed",
             "description": "Similar to the four-implant tilted scheme of Mandible Class II. Taking into consideration the reduced posterior bone height available, the entry points of the distal implants should be aligned with the first premolar. In this rehabilitation scheme, a distal cantilever should be considered."},
            {"implant_count": 4, "kind": "overdenture",
             "description": "Taking into consideration a reduced implant length, the removable rehabilitation schemes proposed are similar to the overdenture schemes of Mandible Classes I and II."},
        ],
        "CCIV": [
            {"implant_count": 4, "kind": "fixed",
             "description": "Placement of four equidistant implants in the anterior region of the mandible. Two straight implants are placed in the lateral incisors position and the two other implants are placed tilted at a 17 degrees angle with entry points coincident with the mental foramen or slightly posterior to it."},
            {"implant_count": 6, "kind": "fixed",
             "description": "Vertical bone grafting in the posterior region for the placement of two implants in the position of the first molar. The length of the implants should range from 6 to 8 mm. Regarding the interforaminal region of the mandible, the surgical approach is the same as previously described for the four-implant anterior tilted scheme."},
            {"implant_count": 4, "kind": "overdenture",
             "description": "Use of an overdenture supported by two or four non-splinted implants, similar to the previously described removable options for the preceding mandibular classes."},
        ],
        "CCV": [
            {"implant_count": 4, "kind": "fixed",
             "description": "Placement of four short straight implants (4 or 6 mm) equidistant in the anterior region. The two anterior implants are placed in the lateral incisors position and the two remaining in the first premolars position at a safe distance from the mental foramen."},
            {"implant_count": 6, "kind": "fixed",
             "description": "A more invasive surgery to augment the height and width of the mandible. In this option, an extraoral autogenous bone graft is suggested (hip, rib, calvarium). Four or six axial implants are placed in the same positions and with the same lengths as referred in the Mandible Class II axial or tilted scheme."},
            {"implant_count": 4, "kind": "overdenture",
             "description": "Similar to the previously described removable options for the preceding mandibular classes using two or four short implants."},
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


# ── Decision aid: short, class-specific bullets that help a student
# choose between the three verbatim treatment options on this case.
# Each bullet is <= ~110 chars so it fits one line on a phone screen.
_DECISION_AID: Dict[str, Dict[str, List[str]]] = {
    "maxilla": {
        "CCI": [
            "Opposing arch fully dentate with functional second molar → choose the 6-implant fixed scheme to enable second-molar occlusion without cantilever.",
            "Routine cases with adequate budget and good oral hygiene → 4-implant fixed scheme is sufficient and less invasive.",
            "Reduced manual dexterity, lower budget or patient prefers a removable solution → choose the overdenture scheme.",
        ],
        "CCII": [
            "If primary stability >35 Ncm is achievable on every implant → the 6-implant straight scheme allows immediate loading.",
            "If sinus floor proximity makes a straight posterior implant unsafe → choose the 4-implant tilted (All-on-4) scheme.",
            "Patient prefers a removable prosthesis → overdenture scheme; expect ridge resorption to continue under the denture base.",
        ],
        "CCIII": [
            "Want to avoid distal cantilever and have funds/healing time for short posterior implants → choose the 6-implant scheme.",
            "Want a graftless single-stage workflow → 4-implant tilted scheme; accept up to a 14 mm distal cantilever.",
            "Limited inter-antral distance or patient wants a removable solution → overdenture scheme.",
        ],
        "CCIV": [
            "Patient accepts sinus elevation + extended healing → 6-implant straight scheme with bilateral sinus lift gives best long-term outcome.",
            "Wants to avoid sinus grafting and surgeon is trained in pterygoid placement → choose the pterygoid/tuberosity 6-implant scheme.",
            "Patient cannot tolerate fixed full-arch surgery or wants a budget option → premaxilla overdenture scheme.",
        ],
        "CCV": [
            "Patient accepts a long staged graft + healing (>= 6 months) → choose the sinus-lift + horizontal-regeneration scheme.",
            "Wants immediate loading and surgeon is experienced in zygomatic implants → choose the zygomatic-anchored scheme; reserve for cases where grafts have failed or are declined.",
            "Patient prefers the least invasive route → overdenture supported by short or augmented premaxilla implants.",
        ],
    },
    "mandible": {
        "CCI": [
            "Opposing arch has a functional second molar → 6-implant scheme (extends occlusal table to the molar).",
            "Standard interforaminal case with healthy ridge → 4-implant fixed scheme is sufficient and less invasive.",
            "Elderly patient or limited budget → 2-4 implant overdenture scheme.",
        ],
        "CCII": [
            "Strong primary stability achievable on every implant → 6-implant straight scheme; uses short posterior implants.",
            "Want to avoid posterior surgery in the mandibular nerve zone → 4-implant tilted scheme; accept a 10-14 mm distal cantilever.",
            "Patient prefers removable → overdenture scheme (same as previous class).",
        ],
        "CCIII": [
            "Adequate primary stability + acceptance of short posterior implants → 6-implant scheme avoids the cantilever.",
            "Want a graftless single-stage approach → 4-implant tilted scheme; entry at first-premolar, plan for a distal cantilever.",
            "Reduced implant length and removable preference → overdenture scheme.",
        ],
        "CCIV": [
            "Patient declines posterior grafting → 4-implant interforaminal tilted scheme is the default first choice.",
            "Patient accepts vertical bone grafting + extended healing → 6-implant scheme with posterior 6-8 mm implants.",
            "Patient cannot tolerate fixed surgery → overdenture scheme.",
        ],
        "CCV": [
            "Minimal-invasive preference and surgeon comfortable with short implants → 4-implant short straight scheme in the interforaminal region.",
            "Patient accepts an extraoral autogenous graft → 4-6 implant scheme after major augmentation; lengthy multi-stage protocol.",
            "Want the lowest morbidity option → overdenture supported by 2-4 short implants.",
        ],
    },
}


def _description_short(description: str, limit: int = 120) -> str:
    """Return the first sentence (or first `limit` chars) of a verbatim option
    paragraph — for the collapsed UI state. The full text remains available
    via `description` for the expanded state."""
    if not description:
        return ""
    # Take everything up to the first period followed by space (end of sentence)
    idx = description.find(". ")
    if idx == -1 or idx > limit + 40:
        # No early period — hard-truncate at limit and add ellipsis.
        return description if len(description) <= limit else description[:limit].rstrip() + "..."
    return description[: idx + 1]


def _option_headline(kind: str, implant_count: int) -> str:
    """User-facing headline derived from the option's kind + implant count.
    No Roman-numeral or A/B/C labels — purely descriptive."""
    if kind == "overdenture":
        return f"Removable overdenture - {implant_count} implants"
    return f"Fixed prosthesis - {implant_count} implants"


def classify_full_arch(
    arch: str,
    anterior_height: Optional[float],
    posterior_height: Optional[float],
    anterior_width: Optional[float] = None,
    posterior_width: Optional[float] = None,
) -> Dict[str, Any]:
    """Classify a full-arch atrophy case and return the verbatim Caram\u00ea s
    treatment options.  Returns `{ok: False, error: ...}` on missing inputs."""
    arch = (arch or "").lower().strip()
    if arch not in ("maxilla", "mandible"):
        return {"ok": False, "error": "arch must be 'maxilla' or 'mandible'"}
    if anterior_height is None or posterior_height is None:
        return {"ok": False, "error": "anterior_height and posterior_height are required"}

    ant_sev = _classify_region(float(anterior_height), float(anterior_width) if anterior_width is not None else 99, "anterior")
    post_sev = _classify_region(float(posterior_height), float(posterior_width) if posterior_width is not None else 99, "posterior")
    cls = _resolve_class(ant_sev, post_sev)

    raw_options = _OPTIONS[arch][cls]
    options = [
        {
            "headline": _option_headline(opt["kind"], opt["implant_count"]),
            "implant_count": opt["implant_count"],
            "kind": opt["kind"],
            "description": opt["description"],
            "description_short": _description_short(opt["description"]),
        }
        for opt in raw_options
    ]

    # Loading rule
    if cls == "CCV":
        loading = "Conventional (delayed) loading preferred. Immediate loading may be considered for the zygomatic-anchored maxillary option if anterior implants achieve primary stability >30 N\u00b7cm."
    elif arch == "maxilla":
        loading = "Immediate loading is acceptable when primary stability >30 N\u00b7cm is achieved on every implant. Default to delayed loading if any risk factor is present (smoking, uncontrolled diabetes, bruxism, periodontal disease, severe atrophy)."
    else:
        loading = "Immediate loading is acceptable when primary stability >30 N\u00b7cm is achieved on every implant; otherwise use delayed loading."

    definition = _DEFINITIONS[arch][cls]

    return {
        "ok": True,
        "arch": arch,
        # `class` is kept as an internal palette key only — the frontend
        # uses it for colour selection and never displays it.
        "class": cls,
        "anterior_definition": definition["anterior"],
        "posterior_definition": definition["posterior"],
        "anterior_severity": ant_sev,
        "posterior_severity": post_sev,
        "inputs": {
            "anterior_height_mm": anterior_height,
            "posterior_height_mm": posterior_height,
            "anterior_width_mm": anterior_width,
            "posterior_width_mm": posterior_width,
        },
        "treatment_options": options,
        "decision_aid": _DECISION_AID[arch][cls],
        "loading_recommendation": loading,
        "augmentation_note": _AUGMENTATION_NOTES[cls],
        "source_reference": SOURCE_REFERENCE,
    }


def render_for_ai_context(assessment: Dict[str, Any]) -> str:
    """Render a per-arch assessment dict as a context block for the AI
    Explain prompt. No CC-class or A/B/C labels are emitted — the AI
    receives the verbatim Caram\u00ea s definitions + option paragraphs and is
    instructed (separately in the system prompt) to quote them verbatim
    when summarising the recommendation, citing 'The Caram\u00ea s
    Classification' as the reference."""
    if not assessment or not assessment.get("ok"):
        return ""
    lines = [
        f"Atrophy assessment for the {assessment['arch']} (source: {SOURCE_REFERENCE}):",
        f"  {assessment['anterior_definition']}",
        f"  {assessment['posterior_definition']}",
        "Recommended treatment options (verbatim from the source; quote them when recommending):",
    ]
    for opt in assessment["treatment_options"]:
        lines.append(f"  - {opt['headline']}: {opt['description']}")
    lines.append(f"Loading guidance: {assessment['loading_recommendation']}")
    lines.append(f"Augmentation guidance: {assessment['augmentation_note']}")
    return "\n".join(lines)
