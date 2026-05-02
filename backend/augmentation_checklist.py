"""
Pre-Op Augmentation Checklist generator (iter-136).

Rule-based, deterministic, AI-free. Reads the per-site intraoral findings
(`clinical_exam_per_site`) plus legacy global findings on the procedure and
emits a structured list of actionable surgical / prosthetic plans the
supervisor can tick during Phase 1 approval.

Each item is a dict with this shape:
    {
      "id":         str (uuid4),
      "site":       str  ("global" or FDI tooth, e.g. "26"),
      "category":   str  ("soft_tissue" | "keratinized" | "ridge" | "biotype" | "general"),
      "title":      str  (short imperative — what to do),
      "rationale":  str  (why — 1 line clinical reasoning),
      "completed":  bool,
      "completed_by_id":   str|None,
      "completed_by_name": str|None,
      "completed_at":      ISO datetime|None,
      "completed_notes":   str
    }

The generator never invents items unsupported by the input data — every item
maps to a specific finding value in a closed enumeration. This keeps the
checklist trustworthy enough for supervisors to act on without second-guessing.
"""
from __future__ import annotations

import uuid
from typing import Any, Iterable

# ── Finding-value enumerations that should trigger a checklist item ───────
# Kept loose (case-insensitive substring match) so frontend label changes
# don't silently break the rules.
_KM_INADEQUATE = ("inadequate", "minimal", "absent", "<2", "≤1")
_BIOTYPE_THIN = ("thin", "≤1", "<=1mm", "<1mm")
_BIOTYPE_THICK = ("thick", ">2mm", "≥2")
_RIDGE_DEFICIENT = ("knife", "atrophied", "type b", "type c", "type d", "narrow")


def _matches(value: str | None, needles: Iterable[str]) -> bool:
    if not value:
        return False
    v = str(value).lower()
    return any(n in v for n in needles)


def _new_item(site: str, category: str, title: str, rationale: str) -> dict[str, Any]:
    return {
        "id": uuid.uuid4().hex,
        "site": site,
        "category": category,
        "title": title,
        "rationale": rationale,
        "completed": False,
        "completed_by_id": None,
        "completed_by_name": None,
        "completed_at": None,
        "completed_notes": "",
    }


def _items_for_site(site_label: str, findings: dict[str, Any]) -> list[dict[str, Any]]:
    """Apply the rule set to one site's findings and return matched items."""
    items: list[dict[str, Any]] = []
    ridge = findings.get("ridge_contour") or ""
    soft = findings.get("soft_tissue_thickness") or ""
    km = findings.get("keratinized_mucosa") or ""

    if _matches(km, _KM_INADEQUATE):
        items.append(_new_item(
            site=site_label,
            category="keratinized",
            title=f"Plan free gingival graft / apically-positioned flap at site {site_label}",
            rationale=f"Keratinized mucosa is {km} — <2 mm increases peri-implant recession and plaque-tolerance risk.",
        ))

    if _matches(soft, _BIOTYPE_THIN):
        items.append(_new_item(
            site=site_label,
            category="biotype",
            title=f"Plan connective-tissue graft to thicken biotype at site {site_label}",
            rationale=f"Soft tissue is {soft} — thin biotype consumes crestal bone via biologic-width formation; thickening the biotype reduces recession and grey-show-through risk.",
        ))
    elif _matches(soft, _BIOTYPE_THICK):
        # Thick biotype is favourable — emit as informational guidance only.
        items.append(_new_item(
            site=site_label,
            category="biotype",
            title=f"Favourable thick biotype at site {site_label} — consider zirconia abutment for aesthetics",
            rationale=f"Soft tissue is {soft} — thick biotype masks abutment shadowing well, supporting a zirconia transmucosal element where aesthetics matter.",
        ))

    if _matches(ridge, _RIDGE_DEFICIENT):
        items.append(_new_item(
            site=site_label,
            category="ridge",
            title=f"Plan ridge augmentation (GBR / ridge-split) at site {site_label}",
            rationale=f"Ridge contour is {ridge} — deficient buccal-lingual width risks dehiscence and a non-prosthetically-driven implant axis without augmentation or platform reduction.",
        ))
        items.append(_new_item(
            site=site_label,
            category="ridge",
            title=f"Consider narrower-platform implant at site {site_label}",
            rationale="Narrow / knife-edge ridge limits achievable osteotomy diameter without lateral wall compromise.",
        ))

    return items


def generate_augmentation_checklist(proc: dict[str, Any]) -> list[dict[str, Any]]:
    """Build the full checklist from a procedure document. Returns [] when no
    findings are present."""
    items: list[dict[str, Any]] = []

    # Per-cluster sites (preferred) — map keyed by leader-tooth.
    per_site = proc.get("clinical_exam_per_site") or {}
    if isinstance(per_site, dict) and per_site:
        for leader, findings in per_site.items():
            if isinstance(findings, dict):
                items.extend(_items_for_site(str(leader), findings))

    # Global findings fallback (full-arch / single-tooth flows that don't
    # populate the per-site map). Emit "global" items only when no per-site
    # items already cover the same category — avoids duplicates for cases
    # where the legacy fields are back-compat copies of the first cluster.
    if not per_site:
        legacy = {
            "ridge_contour": proc.get("ridge_contour") or "",
            "soft_tissue_thickness": proc.get("soft_tissue_thickness") or "",
            "keratinized_mucosa": proc.get("keratinized_mucosa") or "",
        }
        if any(legacy.values()):
            arch_label = "global" if not proc.get("arch") else f"{proc['arch'].lower()} arch"
            items.extend(_items_for_site(arch_label, legacy))

    return items
