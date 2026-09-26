"""Esthetic Risk Assessment (ERA) — server-side mirror of frontend/utils/aestheticRisk.ts.

Used to (a) recompute/stamp the overall risk on create, (b) render the case
PDF block and (c) feed the AI case context.
"""
from typing import Any, Dict, List, Optional

ANTERIOR_MAXILLA_TEETH = {"11", "12", "13", "21", "22", "23"}

_MAX_SEQ = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"]
_MAN_SEQ = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"]

LEGACY_BIOTYPE = {"Thin": "Thin, High scalloped", "Thick": "Thick, Low scalloped"}

# (key, label, top_level, derived, {option: risk})
ERA_FACTORS: List[Dict[str, Any]] = [
    {"key": "smile_line", "label": "Smile Line", "top": True,
     "opts": {"Low": "Low", "Medium": "Medium", "High": "High"}},
    {"key": "smile_type", "label": "Smile Type",
     "opts": {"Toothy": "Low", "Mixed": "Medium", "Gummy": "High"}},
    {"key": "gingival_biotype", "label": "Gingival Biotype", "top": True,
     "opts": {"Thick, Low scalloped": "Low", "Medium, Medium Scalloped": "Medium", "Thin, High scalloped": "High"}},
    {"key": "adjacent_teeth_right", "label": "Status of Adjacent Teeth — Right",
     "opts": {"Non-restored": "Low", "Restored": "High", "Root canal treated": "High"}},
    {"key": "adjacent_teeth_left", "label": "Status of Adjacent Teeth — Left",
     "opts": {"Non-restored": "Low", "Restored": "High", "Root canal treated": "High"}},
    {"key": "infection_at_site", "label": "Present Infection at Implant Site",
     "opts": {"Absent": "Low", "Chronic": "Medium", "Acute": "High"}},
    {"key": "ridge_condition", "label": "Alveolar Ridge Condition",
     "opts": {"No hard tissue defect": "Low", "Horizontal bone defect": "Medium",
              "Vertical bone defect": "High", "Horizontal and Vertical bone defect": "High"}},
    {"key": "bone_level_adjacent", "label": "Bone Level at Adjacent Teeth",
     "opts": {"≤ 5 mm to contact point": "Low", "5.5 – 6.5 mm to contact point": "Medium", "≥ 7 mm to contact point": "High"}},
    {"key": "edentulous_span", "label": "Width of Edentulous Span", "derived": True,
     "opts": {"Single tooth": "Low", "Two or more teeth": "High"}},
    {"key": "patient_expectations", "label": "Patient Esthetic Expectations",
     "opts": {"Realistic esthetic demands": "Low", "High esthetic demands": "High"}},
]

ERA_SELECTABLE_KEYS = [f["key"] for f in ERA_FACTORS if not f.get("derived")]
ERA_NESTED_KEYS = [f["key"] for f in ERA_FACTORS if not f.get("top")]


def is_anterior_maxilla_case(missing_teeth: Optional[List[str]]) -> bool:
    return any(str(t) in ANTERIOR_MAXILLA_TEETH for t in (missing_teeth or []))


def normalize_gingival_biotype(v: Optional[str]) -> str:
    if not v:
        return ""
    return LEGACY_BIOTYPE.get(v, v)


def derive_edentulous_span(missing_teeth: Optional[List[str]]) -> str:
    teeth = [str(t) for t in (missing_teeth or [])]
    if not is_anterior_maxilla_case(teeth):
        return ""
    longest = 0
    for seq in (_MAX_SEQ, _MAN_SEQ):
        present = sorted([t for t in teeth if t in seq], key=seq.index)
        run: List[str] = []
        for t in present:
            if run and seq.index(t) == seq.index(run[-1]) + 1:
                run.append(t)
            else:
                if run and any(p in ANTERIOR_MAXILLA_TEETH for p in run):
                    longest = max(longest, len(run))
                run = [t]
        if run and any(p in ANTERIOR_MAXILLA_TEETH for p in run):
            longest = max(longest, len(run))
    return "Two or more teeth" if longest >= 2 else "Single tooth"


def _value(proc: Dict[str, Any], key: str) -> str:
    era = proc.get("aesthetic_risk") or {}
    if key == "smile_line":
        return proc.get("smile_line") or ""
    if key == "gingival_biotype":
        return normalize_gingival_biotype(proc.get("gingival_biotype"))
    if key == "edentulous_span":
        return derive_edentulous_span(proc.get("missing_teeth")) or era.get("edentulous_span") or ""
    return era.get(key) or ""


def compute_era(proc: Dict[str, Any]) -> Dict[str, Any]:
    """Return {overall, assessed, total, counts, rows:[{key,label,value,risk}]}.

    ITI-style: any High → High; else any Medium → Medium; else Low."""
    counts = {"Low": 0, "Medium": 0, "High": 0}
    rows = []
    for f in ERA_FACTORS:
        val = _value(proc, f["key"])
        risk = f["opts"].get(val) if val else None
        if risk:
            counts[risk] += 1
        rows.append({"key": f["key"], "label": f["label"], "value": val, "risk": risk})
    assessed = sum(counts.values())
    overall = None
    if assessed:
        overall = "High" if counts["High"] else ("Medium" if counts["Medium"] else "Low")
    return {"overall": overall, "assessed": assessed, "total": len(ERA_FACTORS), "counts": counts, "rows": rows}


def sanitize_aesthetic_risk(raw: Any, missing_teeth: Optional[List[str]]) -> Optional[Dict[str, Any]]:
    """Whitelist nested ERA keys, derive the span and stamp the overall risk."""
    if not isinstance(raw, dict):
        raw = {}
    out: Dict[str, Any] = {}
    for k in ERA_NESTED_KEYS:
        v = raw.get(k)
        if isinstance(v, str) and v.strip():
            out[k] = v.strip()[:80]
    span = derive_edentulous_span(missing_teeth)
    if span:
        out["edentulous_span"] = span
    return out or None


def stamp_overall(proc: Dict[str, Any]) -> None:
    """Mutates proc: sets aesthetic_risk.overall_risk / assessed_count when any ERA data exists."""
    summary = compute_era(proc)
    era = proc.get("aesthetic_risk") or {}
    if summary["assessed"] == 0 and not era:
        return
    era["overall_risk"] = summary["overall"] or ""
    era["assessed_count"] = summary["assessed"]
    era["anterior_maxilla"] = is_anterior_maxilla_case(proc.get("missing_teeth"))
    span = derive_edentulous_span(proc.get("missing_teeth"))
    if span:
        era["edentulous_span"] = span
    else:
        era.pop("edentulous_span", None)
    proc["aesthetic_risk"] = era


def era_text_lines(proc: Dict[str, Any]) -> List[str]:
    """Plain-text lines for the AI case context."""
    summary = compute_era(proc)
    if summary["assessed"] == 0:
        return []
    lines = ["Aesthetic Risk Assessment:"]
    for r in summary["rows"]:
        if r["value"]:
            lines.append(f"  - {r['label']}: {r['value']} ({r['risk']} risk)")
    lines.append(f"  Overall aesthetic risk: {summary['overall']} ({summary['assessed']}/{summary['total']} factors assessed)")
    return lines
