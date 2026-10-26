"""
Dental-college licensing — rate card + quote maths.

Source: "Implanr Subscription Plans.xlsx" (Dental College Plans / College
Inputs / College Quote Internal sheets, Oct 2026). One licence per implant
department, Centralised Implant Clinic or Unit, sized by the PG students on
its roll across all three years. Every tier has every feature; tiers differ
only in size. Prices are per year, in rupees, excluding 18% GST.

Kept free of FastAPI/DB so the maths can be unit-tested against the
spreadsheet's worked example.
"""
from typing import Any, Dict, List, Optional

LICENCE_TIERS: List[Dict[str, Any]] = [
    {"key": "essential_9", "name": "Essential 9", "seats_per_year": 3, "pg_from": 1, "pg_to": 9,
     "supervisors": 3, "implant_incharges": 1, "admins": 1, "price": 50000},
    {"key": "standard_12", "name": "Standard 12", "seats_per_year": 4, "pg_from": 10, "pg_to": 12,
     "supervisors": 4, "implant_incharges": 2, "admins": 1, "price": 60000},
    {"key": "advanced_18", "name": "Advanced 18", "seats_per_year": 6, "pg_from": 13, "pg_to": 18,
     "supervisors": 5, "implant_incharges": 3, "admins": 2, "price": 80000},
    {"key": "premier_24", "name": "Premier 24", "seats_per_year": 8, "pg_from": 19, "pg_to": 24,
     "supervisors": 6, "implant_incharges": 4, "admins": 2, "price": 100000},
]
TIERS_BY_KEY = {t["key"]: t for t in LICENCE_TIERS}

RATES = {
    "extra_supervisor": 3000,
    "extra_incharge": 4000,
    "extra_admin": 5000,
    "extra_pg_student": 4000,       # only above 24 PGs on one Premier 24 licence
    "fellow": 6000,
    "research_module": 40000,
    "setup_fee": 25000,             # one-time, waived on 3-year contracts
    "extra_storage_per_100gb": 2500,
    "fair_use_gb_per_licence": 250,
    "free_management_viewers": 3,
    "volume_discount_2": 0.10,
    "volume_discount_3plus": 0.15,
    "university_group_discount": 0.15,
    "founding_discount": 0.25,
    "government_discount": 0.20,
    "three_year_discount": 0.10,
    "max_commercial_discount": 0.30,
    "annual_increase": 0.07,
    "gst": 0.18,
}

# Interns who place implants (observing / assisting is free).
INTERN_TIERS = [(20, 15000), (40, 28000), (60, 40000), (80, 50000), (100, 60000)]
INTERN_ABOVE_100_EACH = 600


def tier_for_students(pg_students: int) -> Dict[str, Any]:
    """Smallest tier that fits; above 24 stays on Premier 24 (+ extra PGs)."""
    for t in LICENCE_TIERS:
        if pg_students <= t["pg_to"]:
            return t
    return LICENCE_TIERS[-1]


def intern_programme(interns: int) -> Dict[str, Any]:
    if interns <= 0:
        return {"tier": None, "price": 0}
    for cap, price in INTERN_TIERS:
        if interns <= cap:
            return {"tier": f"Interns {cap}", "price": price}
    return {"tier": "Interns 100+", "price": INTERN_TIERS[-1][1] + (interns - 100) * INTERN_ABOVE_100_EACH}


def compute_quote(
    licences: List[Dict[str, Any]],
    *,
    supervisors_needed: int = 0,
    incharges_needed: int = 0,
    admins_needed: int = 0,
    fellows: int = 0,
    interns: int = 0,
    research_module: bool = False,
    founding: bool = False,
    government: bool = False,
    university_group: bool = False,
    term_years: int = 1,
    negotiated_discount: float = 0.0,
    new_customer: bool = True,
) -> Dict[str, Any]:
    """Mirror of the 'College Quote Internal' sheet.

    `licences`: [{"label": "Prosthodontics", "pg_students": 12, "tier_key": optional,
                  "department_id": optional}]. The tier is picked from the PG
    count unless `tier_key` is given (a college may choose a bigger tier)."""
    lines = []
    for lic in licences:
        pg = max(0, int(lic.get("pg_students") or 0))
        tier = TIERS_BY_KEY.get(lic.get("tier_key") or "") or tier_for_students(pg)
        if pg > tier["pg_to"] and tier["key"] != "premier_24":
            tier = tier_for_students(pg)  # chosen tier too small for the roll
        extra_pg = max(0, pg - 24) if tier["key"] == "premier_24" else 0
        lines.append({
            "label": (lic.get("label") or "").strip() or "Licence",
            "department_id": lic.get("department_id"),
            "pg_students": pg,
            "tier_key": tier["key"], "tier_name": tier["name"],
            "list_price": tier["price"],
            "extra_pg_students": extra_pg,
            "extra_pg_charge": extra_pg * RATES["extra_pg_student"],
            "supervisors_included": tier["supervisors"],
            "incharges_included": tier["implant_incharges"],
            "admins_included": tier["admins"],
            "pg_capacity": max(pg, tier["pg_to"]),
        })
    n = len(lines)
    licence_list = sum(l["list_price"] + l["extra_pg_charge"] for l in lines)

    volume = RATES["volume_discount_3plus"] if n >= 3 else RATES["volume_discount_2"] if n == 2 else 0.0
    if university_group:
        volume = max(volume, RATES["university_group_discount"])
    licence_after = licence_list * (1 - volume)

    inc = {k: sum(l[f"{k}_included"] for l in lines) for k in ("supervisors", "incharges", "admins")}
    extra = {
        "supervisors": max(0, supervisors_needed - inc["supervisors"]),
        "incharges": max(0, incharges_needed - inc["incharges"]),
        "admins": max(0, admins_needed - inc["admins"]),
    }
    extra_users = (extra["supervisors"] * RATES["extra_supervisor"]
                   + extra["incharges"] * RATES["extra_incharge"]
                   + extra["admins"] * RATES["extra_admin"])

    ip = intern_programme(interns)
    fellows_charge = max(0, fellows) * RATES["fellow"]
    research = RATES["research_module"] if research_module else 0
    subtotal = licence_after + extra_users + ip["price"] + fellows_charge + research

    parts = []
    if founding:
        parts.append(("Founding institution", RATES["founding_discount"]))
    if government:
        parts.append(("Government college", RATES["government_discount"]))
    if term_years == 3:
        parts.append(("3-year prepaid", RATES["three_year_discount"]))
    if negotiated_discount:
        parts.append(("Negotiated", float(negotiated_discount)))
    commercial = min(RATES["max_commercial_discount"], sum(p for _, p in parts))
    commercial_amount = subtotal * commercial
    net_annual = subtotal - commercial_amount

    setup = RATES["setup_fee"] if (new_customer and term_years != 3) else 0
    years_billed = 3 if term_years == 3 else 1
    invoice_ex_gst = net_annual * years_billed + setup
    gst = invoice_ex_gst * RATES["gst"]
    total_pg = sum(l["pg_students"] for l in lines)
    renewal = net_annual if (founding or term_years == 3) else net_annual * (1 + RATES["annual_increase"])

    return {
        "licences": lines,
        "licence_count": n,
        "total_pg_students": total_pg,
        "licence_list": round(licence_list, 2),
        "volume_discount": volume,
        "licence_after_volume": round(licence_after, 2),
        "included": inc,
        "extra_users": extra,
        "extra_users_charge": round(extra_users, 2),
        "intern_programme": {"interns": interns, **ip},
        "fellows": fellows, "fellows_charge": fellows_charge,
        "research_module": bool(research_module), "research_charge": research,
        "annual_subtotal": round(subtotal, 2),
        "commercial_discount": commercial,
        "commercial_discount_parts": [p for p, _ in parts],
        "commercial_discount_amount": round(commercial_amount, 2),
        "net_annual_fee": round(net_annual, 2),
        "setup_fee": setup,
        "term_years": term_years,
        "invoice_ex_gst": round(invoice_ex_gst, 2),
        "gst": round(gst, 2),
        "invoice_incl_gst": round(invoice_ex_gst + gst, 2),
        "renewal_fee_next_year": round(renewal, 2),
        "licence_cost_per_pg": round(licence_after * (1 - commercial) / total_pg, 2) if total_pg else None,
    }


def derive_caps(quote: Dict[str, Any], *, supervisors_needed: int, incharges_needed: int,
                admins_needed: int, fellows: int, interns: int) -> Dict[str, Any]:
    """Pooled seat limits the server enforces for a licensed college.

    Students = PG capacity of every licence (+ extra PGs) + fellows + interns
    on the Intern Programme (fellows and interns use the student role).
    Staff = included allowance, or the higher number the college paid for."""
    lines = quote["licences"]
    pg_capacity = sum(l["pg_capacity"] for l in lines)
    inc = quote["included"]
    role_caps = {
        "student": pg_capacity + max(0, fellows) + max(0, interns),
        "supervisor": max(inc["supervisors"], supervisors_needed),
        "implant_incharge": max(inc["incharges"], incharges_needed),
        "administrator": max(inc["admins"], admins_needed),
    }
    return {
        "role_caps": role_caps,
        "max_students": role_caps["student"],
        "max_department": max(1, len(lines)),
        # In-charges are pooled across the college; the per-department check
        # must never be stricter than the pool.
        "max_implant_incharges": role_caps["implant_incharge"],
        "max_users": None,  # governed by role_caps instead
    }
