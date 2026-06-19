"""Central evidence-citation registry. Every rule MUST cite from here.

Keys are stable IDs; values carry: title, authors/source, year,
type (consensus / textbook / SR-MA / cohort / IFU) and a 1-line
take-away. Front-end renders the take-away inline beside the warning.
"""
from typing import Dict, TypedDict


class Citation(TypedDict):
    title: str
    source: str
    year: int
    type: str  # "consensus" | "textbook" | "SR-MA" | "RCT" | "cohort" | "IFU"
    takeaway: str


CITATIONS: Dict[str, Citation] = {
    "ITI_2023_GROUP3_LOADING": {
        "title": "ITI Consensus Statements & Clinical Recommendations — Group 3: Loading Protocols",
        "source": "ITI Consensus Conference 2023 (Madrid) — Clin Oral Implants Res. 2024 May",
        "year": 2024,
        "type": "consensus",
        "takeaway": (
            "Immediate loading is acceptable only when primary stability (ISQ ≥ 70 or "
            "insertion torque ≥ 35 Ncm) is achieved and risk modifiers are controlled."
        ),
    },
    "SENNERBY_MEREDITH_ISQ_2008": {
        "title": "Implant stability measurements using resonance frequency analysis",
        "source": "Sennerby L, Meredith N. Periodontology 2000, 2008",
        "year": 2008,
        "type": "review",
        "takeaway": "ISQ < 60 indicates poor primary stability; ≥ 70 supports immediate loading.",
    },
    "BUSER_GBR_2009": {
        "title": "Guided bone regeneration with simultaneous implant placement — 10-year results",
        "source": "Buser D et al. Clin Oral Implants Res. 2009",
        "year": 2009,
        "type": "cohort",
        "takeaway": (
            "Simultaneous GBR is predictable when ≥ 1 mm peri-implant labial bone wall "
            "remains; otherwise stage augmentation first."
        ),
    },
    "ITI_2023_GROUP4_FULLARCH": {
        "title": "ITI Consensus — Group 4: Implant-supported full-arch reconstructions",
        "source": "ITI Consensus Conference 2023 (Madrid) — Clin Oral Implants Res. 2024 May",
        "year": 2024,
        "type": "consensus",
        "takeaway": (
            "Multi-unit straight abutments correct up to ~17°; divergences ≥ 18° require "
            "angulated multi-unit abutments (Type A/B) for passive prosthesis fit."
        ),
    },
    "MISCH_2020_ANGULATION": {
        "title": "Contemporary Implant Dentistry (4th ed.)",
        "source": "Misch CE / Resnik R. Elsevier, 2020 — Ch. on multi-unit abutments",
        "year": 2020,
        "type": "textbook",
        "takeaway": (
            "For full-arch frameworks, inter-implant axis divergence > 30° is a "
            "biomechanical contraindication for passive fit even with angulated abutments."
        ),
    },
    "NAUJOKAT_DIABETES_SR_2016": {
        "title": "Dental implants and diabetes mellitus — a systematic review",
        "source": "Naujokat H, Kunzendorf B, Wiltfang J. Int J Implant Dent. 2016",
        "year": 2016,
        "type": "SR-MA",
        "takeaway": (
            "HbA1c > 8 % is associated with significantly higher early implant failure "
            "and delayed osseointegration; HbA1c ≤ 7 % shows outcomes comparable to non-diabetics."
        ),
    },
    "JIANG_SMOKING_SR_2022": {
        "title": "Smoking and implant failure — systematic review & meta-analysis",
        "source": "Jiang X et al. J Dent. 2022",
        "year": 2022,
        "type": "SR-MA",
        "takeaway": (
            "Smokers show ~2× implant failure risk vs non-smokers; risk is additive with "
            "diabetes and immediate loading."
        ),
    },
}
