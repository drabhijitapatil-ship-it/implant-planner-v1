"""iter-369 — Global D drilling protocols.

Contains the exact drill sequences per (system, diameter, bone_density)
lifted from the manufacturer's Ultimate Surgical Kit protocols for the
three Global D systems now shipped with the app:
  • In-Kone Universal (Ø3.5 / 4.0 / 4.5 / 5.0)
  • 3.0 Implant       (Ø3.0 only)
  • twinkone 4        (Ø4.0 / 4.5 – ultra-short 4 mm)

Bone density mapping (Global D manufacturer terms → Misch/Lekholm-Zarb):
    High   → D1
    Medium → D2
    Low    → D3 & D4

Exposes `generate_global_d_protocol(system, diameter, length, bone)` which
returns the standardised step list consumed by /api/implants/drilling-protocol.
"""
from typing import List, Dict, Any


# Drill reference codes (from Global D's DKITULTI-INK and DKITTWK4 catalogs).
# Kept as short/long pairs where relevant; the app uses the short form.
_INKONE_CODES = {
    2.0: "DFCL-INIT",     # Marking drill
    2.4: "DFU1.5-2.4C",   # Pilot drill
    2.7: "DFKU2.7C", 2.9: "DFKU2.9C",
    3.2: "DFKU3.2C", 3.4: "DFKU3.4C",
    3.7: "DFKU3.7C", 3.9: "DFKU3.9C",
    4.2: "DFKU4.2C", 4.4: "DFKU4.4C",
    4.7: "DFKU4.7C", 4.9: "DFKU4.9C",
}

_TWK4_CODES = {
    2.0: "DFTW20L48", 2.5: "DFTW25L48",
    3.0: "DFTW30L48", 3.5: "DFTW35L48", 4.0: "DFTW40L48",
}


# ── In-Kone Universal + 3.0 Implant drill sequences ──
# Values are ordered lists of drill diameters (2.0 = marking, 2.4 = pilot;
# subsequent = intermediate). "CBP" means Optional Crestal Bone Profiler
# and is only inserted for D1 (dense bone).
_INKONE_SEQ = {
    3.5: {"D1": [2.0, 2.4, 2.7, 2.9, 3.2],
          "D2": [2.0, 2.4, 2.7, 2.9],
          "D3": [2.0, 2.4, 2.7],
          "D4": [2.0, 2.4, 2.7]},
    4.0: {"D1": [2.0, 2.4, 2.7, 2.9, 3.2, 3.4],
          "D2": [2.0, 2.4, 2.7, 2.9, 3.2],
          "D3": [2.0, 2.4, 2.7, 2.9],
          "D4": [2.0, 2.4, 2.7, 2.9]},
    4.5: {"D1": [2.0, 2.4, 2.7, 2.9, 3.2, 3.4, 3.7],
          "D2": [2.0, 2.4, 2.7, 2.9, 3.2, 3.4],
          "D3": [2.0, 2.4, 2.7, 2.9, 3.2],
          "D4": [2.0, 2.4, 2.7, 2.9, 3.2]},
    5.0: {"D1": [2.0, 2.4, 2.7, 2.9, 3.4, 3.9, 4.4, 4.9],
          "D2": [2.0, 2.4, 2.7, 2.9, 3.4, 3.9, 4.4],
          "D3": [2.0, 2.4, 2.7, 2.9, 3.4, 3.9],
          "D4": [2.0, 2.4, 2.7, 2.9, 3.4, 3.9]},
}

_3I_SEQ = {
    3.0: {"D1": [2.4, 2.7, 2.9],
          "D2": [2.4, 2.7],
          "D3": [2.4],
          "D4": [2.4]},
}

# twinkone 4 (ultra-short, length always 4 mm; drills have integrated 4.8 mm
# working length + depth stops)
_TWK4_SEQ = {
    4.0: {"D1": [2.0, 2.5, 3.0],
          "D2": [2.0, 2.5, 3.0],
          "D3": [2.0, 2.5],
          "D4": [2.0, 2.5]},
    4.5: {"D1": [2.0, 2.5, 3.0, 3.5],
          "D2": [2.0, 2.5, 3.0, 3.5],
          "D3": [2.0, 2.5, 3.0],
          "D4": [2.0, 2.5, 3.0]},
}


def _label(system: str, d: float, is_first: bool) -> str:
    if system == "In-Kone Universal":
        if d == 2.0: return "Marking Drill"
        if d == 2.4: return "Pilot Drill"
        return "Intermediate Drill"
    if system == "3.0 Implant":
        return "Pilot Drill" if is_first else "Intermediate Drill"
    # twinkone 4
    return "Pilot Drill" if is_first else "Drill"


def _rpm(system: str, d: float) -> str:
    if system == "In-Kone Universal":
        if d in (2.0, 2.4): return "1200"
        return "600-800"
    if system == "3.0 Implant":
        return "1200" if d == 2.4 else "600-800"
    # twinkone 4
    return "1200" if d == 2.0 else "600-800"


def _code(system: str, d: float) -> str:
    if system == "In-Kone Universal" or system == "3.0 Implant":
        return _INKONE_CODES.get(d, "—")
    return _TWK4_CODES.get(d, "—")


def generate_global_d_protocol(system: str, diameter: float, length: float, bone: str) -> List[Dict[str, Any]]:
    """Return the ordered drill-step list for the requested (system, Ø, L, bone).
    Falls back to D3 mapping when bone is unknown/empty."""
    bone = bone if bone in ("D1", "D2", "D3", "D4") else "D3"
    if system == "In-Kone Universal":
        seq_map = _INKONE_SEQ
        note_prefix = "Global D In-Kone Universal"
    elif system == "3.0 Implant":
        seq_map = _3I_SEQ
        note_prefix = "Global D 3.0 Implant"
    elif system == "twinkone 4":
        seq_map = _TWK4_SEQ
        note_prefix = "Global D twinkone 4"
    else:
        return []

    diam_key = round(float(diameter), 1)
    if diam_key not in seq_map:
        return []
    ladder = seq_map[diam_key].get(bone, [])
    if not ladder:
        return []

    # Depth = implant length + 0.5 mm (except twinkone 4 which is fixed 4.8 mm
    # working length via depth-stop drills).
    if system == "twinkone 4":
        depth_str = "4.8"
    else:
        depth = float(length) + 0.5
        depth_str = f"{depth:.1f}" if depth != int(depth) else str(int(depth))

    steps: List[Dict[str, Any]] = []
    step_num = 1
    for i, d in enumerate(ladder):
        steps.append({
            "step": step_num,
            "drill_type": _label(system, d, i == 0),
            "code": _code(system, d),
            "diameter": d,
            "depth": depth_str,
            "rpm": _rpm(system, d),
            "irrigation": True,
            "note": (
                "Depth-stop drill · working length 4.8 mm"
                if system == "twinkone 4"
                else None
            ),
        })
        step_num += 1

    # Optional Crestal Bone Profiler for D1 dense bone (In-Kone + 3.0 Implant)
    if bone == "D1" and system in ("In-Kone Universal", "3.0 Implant"):
        cbp_d = 3.4 if system == "3.0 Implant" else max(ladder)
        cbp_code = "DFRCTZ3.4" if system == "3.0 Implant" else "—"
        steps.append({
            "step": step_num,
            "drill_type": "Crestal Bone Profiler (Optional)",
            "code": cbp_code,
            "diameter": cbp_d,
            "depth": depth_str,
            "rpm": "600-800",
            "irrigation": True,
            "note": "Optional in D1 dense bone — countersinks the crestal cortex",
        })
        step_num += 1

    # Implant placement
    steps.append({
        "step": step_num,
        "drill_type": "Implant Placement",
        "code": "—",
        "diameter": float(diameter),
        "depth": str(length),
        "rpm": "25-35",
        "irrigation": False,
        "note": f"{note_prefix} Ø{diameter}mm × L{length}mm",
    })
    return steps
