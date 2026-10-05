"""Esthetic Risk Assessment (ERA) — server-side mirror of frontend/utils/aestheticRisk.ts.

Model (procedure.aesthetic_risk):
  { smile_type, patient_expectations,                          ← patient-level
    sites: { <leaderFDI>: { positions, adjacent_teeth_right, adjacent_teeth_left,
                            infection_at_site, ridge_condition, bone_level_adjacent,
                            span_mm, edentulous_span, overall_risk } },
    overall_risk, assessed_count, anterior_maxilla }
  smile_line / gingival_biotype stay top-level on the procedure.
Legacy (iter-438) docs stored the site factors flat → read as a single site.

Used to (a) sanitise/stamp on create + edit, (b) render the case PDF block,
(c) feed the AI case context and (d) drive /analytics/aesthetic-risk.
"""
from typing import Any, Dict, List, Optional

ANTERIOR_MAXILLA_TEETH = {"11", "12", "13", "21", "22", "23"}

_MAX_SEQ = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"]
_MAN_SEQ = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"]

LEGACY_BIOTYPE = {"Thin": "Thin, High scalloped", "Thick": "Thick, Low scalloped"}
LEGACY_SPAN = {"Single tooth": "Low", "Two or more teeth": "High"}  # iter-438 tooth-count grading

_ADJ = {"Non-restored": "Low", "Restored": "High", "Root canal treated": "High"}

# key, label, scope ('patient'|'site'), top (procedure root), derived, opts {option: risk}
ERA_FACTORS: List[Dict[str, Any]] = [
    {"key": "smile_line", "label": "Smile Line", "scope": "patient", "top": True,
     "opts": {"Low": "Low", "Medium": "Medium", "High": "High"}},
    {"key": "smile_type", "label": "Smile Type", "scope": "patient",
     "opts": {"Toothy": "Low", "Mixed": "Medium", "Gummy": "High"}},
    {"key": "gingival_biotype", "label": "Gingival Biotype", "scope": "patient", "top": True,
     "opts": {"Thick, Low scalloped": "Low", "Medium, Medium Scalloped": "Medium", "Thin, High scalloped": "High"}},
    {"key": "patient_expectations", "label": "Patient Esthetic Expectations", "scope": "patient",
     "opts": {"Realistic esthetic demands": "Low", "High esthetic demands": "High"}},
    {"key": "adjacent_teeth_right", "label": "Status of Adjacent Teeth — Right", "scope": "site", "opts": _ADJ},
    {"key": "adjacent_teeth_left", "label": "Status of Adjacent Teeth — Left", "scope": "site", "opts": _ADJ},
    {"key": "infection_at_site", "label": "Present Infection at Implant Site", "scope": "site",
     "opts": {"Absent": "Low", "Chronic": "Medium", "Acute": "High"}},
    {"key": "ridge_condition", "label": "Alveolar Ridge Condition", "scope": "site",
     "opts": {"No hard tissue defect": "Low", "Horizontal bone defect": "Medium",
              "Vertical bone defect": "High", "Horizontal and Vertical bone defect": "High"}},
    {"key": "bone_level_adjacent", "label": "Bone Level at Adjacent Teeth", "scope": "site",
     "opts": {"≤ 5 mm to contact point": "Low", "5.5 – 6.5 mm to contact point": "Medium", "≥ 7 mm to contact point": "High"}},
    {"key": "edentulous_span", "label": "Width of Edentulous Span", "scope": "site", "derived": True,
     "opts": {"Single tooth ≥ 7 mm": "Low", "Single tooth < 7 mm": "Medium", "Two or more teeth": "High"}},
]

PATIENT_FACTORS = [f for f in ERA_FACTORS if f["scope"] == "patient"]
SITE_FACTORS = [f for f in ERA_FACTORS if f["scope"] == "site"]
PATIENT_NESTED_KEYS = [f["key"] for f in PATIENT_FACTORS if not f.get("top")]
SITE_SELECTABLE_KEYS = [f["key"] for f in SITE_FACTORS if not f.get("derived")]
LEGACY_SITE_KEYS = SITE_SELECTABLE_KEYS  # flat keys on iter-438 docs


def is_anterior_maxilla_case(missing_teeth: Optional[List[str]]) -> bool:
    return any(str(t) in ANTERIOR_MAXILLA_TEETH for t in (missing_teeth or []))


def normalize_gingival_biotype(v: Optional[str]) -> str:
    if not v:
        return ""
    return LEGACY_BIOTYPE.get(v, v)


def _runs(teeth: List[str]) -> List[List[str]]:
    out: List[List[str]] = []
    for seq in (_MAX_SEQ, _MAN_SEQ):
        present = sorted([t for t in teeth if t in seq], key=seq.index)
        run: List[str] = []
        for t in present:
            if run and seq.index(t) == seq.index(run[-1]) + 1:
                run.append(t)
            else:
                if run:
                    out.append(run)
                run = [t]
        if run:
            out.append(run)
    return out


def _cluster_leader(positions: List[str]) -> str:
    """Mirror of frontend clusterLeader — first tooth of the run in FDI sequence order."""
    return positions[0]


def anterior_areas(missing_teeth: Optional[List[str]]) -> List[Dict[str, Any]]:
    teeth = [str(t) for t in (missing_teeth or [])]
    areas = []
    for run in _runs(teeth):
        if not any(p in ANTERIOR_MAXILLA_TEETH for p in run):
            continue
        leader = _cluster_leader(run)
        areas.append({"leader": leader, "positions": run,
                      "label": f"FDI {'–'.join(run)}" if len(run) > 1 else f"FDI {run[0]}"})
    return areas


def _parse_mm(v: Any) -> Optional[float]:
    try:
        n = float(str(v if v is not None else "").replace("mm", "").strip())
        return n if n > 0 else None
    except ValueError:
        return None


def span_mm_for(proc: Dict[str, Any], area: Dict[str, Any]) -> Optional[float]:
    meas = proc.get("edentulous_site_measurements") or {}
    mm = _parse_mm((meas.get(area["leader"]) or {}).get("md"))
    if mm is None:
        for p in area["positions"]:
            mm = _parse_mm((meas.get(p) or {}).get("md"))
            if mm is not None:
                break
    if mm is not None:
        return mm
    sites = (proc.get("aesthetic_risk") or {}).get("sites") or {}
    stored = _parse_mm((sites.get(area["leader"]) or {}).get("span_mm"))
    missing = len(proc.get("missing_teeth") or [])
    single_flow = missing < 2 or proc.get("implant_procedure_type") == "Single Conventional Implant" or len(anterior_areas(proc.get("missing_teeth"))) == 1
    if single_flow:
        return _parse_mm(proc.get("mesiodistal_space")) or stored
    return stored


def span_value_for(area: Dict[str, Any], mm: Optional[float]) -> str:
    if len(area["positions"]) >= 2:
        return "Two or more teeth"
    if mm is None:
        return ""
    return "Single tooth ≥ 7 mm" if mm >= 7 else "Single tooth < 7 mm"


def _fmt_mm(mm: Optional[float]) -> str:
    if mm is None:
        return ""
    return f"{mm:g} mm"


def _value(proc: Dict[str, Any], key: str, leader: Optional[str] = None) -> str:
    era = proc.get("aesthetic_risk") or {}
    if key == "smile_line":
        return proc.get("smile_line") or ""
    if key == "gingival_biotype":
        return normalize_gingival_biotype(proc.get("gingival_biotype"))
    f = next((x for x in ERA_FACTORS if x["key"] == key), None)
    if f and f["scope"] == "site":
        sites = era.get("sites")
        if isinstance(sites, dict):
            return ((sites.get(leader or "") or {}).get(key)) or ""
        return era.get(key) or ""  # legacy flat
    return era.get(key) or ""


def _grade(counts: Dict[str, int]) -> Optional[str]:
    if sum(counts.values()) == 0:
        return None
    return "High" if counts["High"] else ("Medium" if counts["Medium"] else "Low")


def compute_era(proc: Dict[str, Any]) -> Dict[str, Any]:
    """{overall, assessed, total, complete, counts, patient_rows, sites:[...], rows}
    ITI-style: any High → High; else any Medium → Medium; else Low.
    Each site grade includes the patient-level factors; case overall = highest site."""
    p_counts = {"Low": 0, "Medium": 0, "High": 0}
    patient_rows = []
    for f in PATIENT_FACTORS:
        val = _value(proc, f["key"])
        risk = f["opts"].get(val) if val else None
        if risk:
            p_counts[risk] += 1
        patient_rows.append({"key": f["key"], "label": f["label"], "value": val, "risk": risk, "scope": "patient"})

    sites = []
    for area in anterior_areas(proc.get("missing_teeth")):
        mm = span_mm_for(proc, area)
        rows = []
        counts = dict(p_counts)
        for f in SITE_FACTORS:
            if f.get("derived"):
                raw = span_value_for(area, mm)
                if not raw:  # legacy iter-438 value (no mm captured) → keep its old grade
                    era = proc.get("aesthetic_risk") or {}
                    legacy = ((era.get("sites") or {}).get(area["leader"]) or {}).get("edentulous_span") if isinstance(era.get("sites"), dict) else era.get("edentulous_span")
                    raw = legacy if legacy in LEGACY_SPAN else ""
                val = f"{raw} · {_fmt_mm(mm)}" if raw and mm is not None else raw
            else:
                raw = _value(proc, f["key"], area["leader"])
                val = raw
            risk = (f["opts"].get(raw) or LEGACY_SPAN.get(raw)) if raw else None
            if risk:
                counts[risk] += 1
            rows.append({"key": f["key"], "label": f["label"], "value": val, "risk": risk, "scope": "site", "leader": area["leader"]})
        assessed = sum(counts.values())
        total = len(PATIENT_FACTORS) + len(SITE_FACTORS)
        sites.append({**area, "span_mm": mm, "rows": rows, "overall": _grade(counts), "assessed": assessed, "total": total, "counts": counts})

    counts = dict(p_counts)
    for s in sites:
        for r in s["rows"]:
            if r["risk"]:
                counts[r["risk"]] += 1
    assessed = sum(counts.values())
    total = len(PATIENT_FACTORS) + len(SITE_FACTORS) * len(sites)
    return {
        "overall": _grade(counts), "assessed": assessed, "total": total,
        "complete": total > 0 and assessed >= total, "counts": counts,
        "patient_rows": patient_rows, "sites": sites,
        "rows": patient_rows + [r for s in sites for r in s["rows"]],
    }


def sanitize_aesthetic_risk(raw: Any, missing_teeth: Optional[List[str]]) -> Optional[Dict[str, Any]]:
    """Whitelist patient keys + per-site keys (only for current anterior areas)."""
    if not isinstance(raw, dict):
        raw = {}
    out: Dict[str, Any] = {}
    for k in PATIENT_NESTED_KEYS:
        v = raw.get(k)
        if isinstance(v, str) and v.strip():
            out[k] = v.strip()[:80]
    areas = anterior_areas(missing_teeth)
    raw_sites = raw.get("sites") if isinstance(raw.get("sites"), dict) else None
    sites: Dict[str, Any] = {}
    for area in areas:
        src = (raw_sites or {}).get(area["leader"]) if raw_sites is not None else raw  # legacy flat → applies to every area
        src = src if isinstance(src, dict) else {}
        site: Dict[str, Any] = {"positions": area["positions"]}
        for k in SITE_SELECTABLE_KEYS:
            v = src.get(k)
            if isinstance(v, str) and v.strip():
                site[k] = v.strip()[:80]
        sites[area["leader"]] = site
    if sites:
        out["sites"] = sites
    return out or None


def stamp_overall(proc: Dict[str, Any]) -> None:
    """Mutates proc: derives span (mm + grade) per site and stamps overall risk."""
    era = proc.get("aesthetic_risk") or {}
    summary = compute_era(proc)
    if summary["assessed"] == 0 and not era:
        return
    if isinstance(era.get("sites"), dict) or summary["sites"]:
        sites = era.get("sites") if isinstance(era.get("sites"), dict) else {}
        # legacy flat doc → lift into sites once
        if not isinstance(era.get("sites"), dict):
            for s in summary["sites"]:
                sites[s["leader"]] = {k: era[k] for k in LEGACY_SITE_KEYS + ["edentulous_span"] if era.get(k)}
            for k in LEGACY_SITE_KEYS + ["edentulous_span"]:
                era.pop(k, None)
        for s in summary["sites"]:
            site = sites.setdefault(s["leader"], {})
            site["positions"] = s["positions"]
            site["span_mm"] = s["span_mm"]
            new_span = span_value_for(s, s["span_mm"])
            if new_span or not site.get("edentulous_span"):
                site["edentulous_span"] = new_span
            site["overall_risk"] = s["overall"] or ""
        # drop sites that no longer match an anterior area
        valid = {s["leader"] for s in summary["sites"]}
        for k in [k for k in sites if k not in valid]:
            sites.pop(k, None)
        era["sites"] = sites
    era["overall_risk"] = summary["overall"] or ""
    era["assessed_count"] = summary["assessed"]
    era["total_factors"] = summary["total"]
    era["anterior_maxilla"] = is_anterior_maxilla_case(proc.get("missing_teeth"))
    proc["aesthetic_risk"] = era


def era_text_lines(proc: Dict[str, Any]) -> List[str]:
    """Plain-text lines for the AI case context."""
    summary = compute_era(proc)
    if summary["assessed"] == 0:
        return []
    lines = ["Aesthetic Risk Assessment:"]
    for r in summary["patient_rows"]:
        if r["value"]:
            lines.append(f"  - {r['label']}: {r['value']} ({r['risk']} risk)")
    multi = len(summary["sites"]) > 1
    for i, s in enumerate(summary["sites"]):
        if multi:
            lines.append(f"  Area {i + 1} — {s['label']}:")
        for r in s["rows"]:
            if r["value"]:
                lines.append(f"  {'  ' if multi else ''}- {r['label']}: {r['value']} ({r['risk']} risk)")
        if multi and s["overall"]:
            lines.append(f"    Area risk: {s['overall']} ({s['assessed']}/{s['total']})")
    lines.append(f"  Overall aesthetic risk: {summary['overall']} ({summary['assessed']}/{summary['total']} factors assessed)")
    return lines
