"""iter-Jun-2026 — Esthetic Risk Assessment (ERA) backend suite.

1. Pure-module checks (aesthetic_risk.py): span derivation, legacy biotype
   mapping, ITI-style overall (any High → High, else Medium, else Low).
2. POST /api/procedures (Single Conventional Implant, FDI 11) with the 7 ERA
   factors → stored aesthetic_risk is whitelisted, span derived, overall stamped.
3. Legacy 'Thin' biotype still resolves to High risk via compute_era.
4. PATCH /edit-fields on aesthetic_risk.smile_type re-stamps overall_risk.
5. Case-report PDF contains "Overall Aesthetic Risk".
"""
from __future__ import annotations
import io
import os
import sys
import uuid
import pytest
import requests
from datetime import datetime, timedelta

try:
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
except Exception:
    pass

sys.path.insert(0, "/app/backend")
import aesthetic_risk as era  # noqa: E402

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://dental-implant-hub-14.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}
ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}
SUPERVISOR = {"identifier": "Paresh.gandhi", "password": "Supervisor@123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    u = j.get("user") or {}
    return {"id": u.get("id") or u.get("_id"), "name": u.get("name"),
            "headers": {"Authorization": f"Bearer {j['access_token']}", "Content-Type": "application/json"}}


@pytest.fixture(scope="module")
def ctx():
    return {"student": _login(STUDENT), "admin": _login(ADMIN), "supervisor": _login(SUPERVISOR)}


_slots = iter([(d, t) for d in range(4, 40) for t in ["09:00", "10:00", "11:00", "13:00", "15:00", "16:00", "17:00"]])


def _slot():
    while True:
        d, t = next(_slots)
        day = datetime.now() + timedelta(days=d)
        if day.weekday() < 5:
            return day.strftime("%Y-%m-%d"), t


ERA_PAYLOAD = {
    "smile_type": "Gummy",
    "adjacent_teeth_right": "Non-restored",
    "adjacent_teeth_left": "Restored",
    "infection_at_site": "Absent",
    "ridge_condition": "Horizontal bone defect",
    "bone_level_adjacent": "≤ 5 mm to contact point",
    "patient_expectations": "Realistic esthetic demands",
    "junk_key": "should be dropped",
    "edentulous_span": "Two or more teeth",  # client value ignored — derived server-side
}


def _create(ctx, missing, **extra):
    s, sup, adm = ctx["student"], ctx["supervisor"], ctx["admin"]
    for _ in range(8):
        d, t = _slot()
        payload = {
            "student_name": s["name"], "patient_name": "ERA Test Patient",
            "registration_number": f"ERA-{uuid.uuid4().hex[:6]}",
            "supervisor_id": sup["id"], "supervisor_name": sup["name"],
            "implant_incharge_id": adm["id"], "implant_incharge_name": adm["name"],
            "implant_site": "Upper Arch", "receipt_number": f"ERA-R-{uuid.uuid4().hex[:5]}", "amount_paid": 5000.0,
            "procedure_date": d, "procedure_time": t,
            "implant_procedure_type": "Single Conventional Implant", "loading_type": ["Delayed Loading"],
            "missing_teeth": missing, "smile_line": "High", "gingival_biotype": "Thin, High scalloped",
            "periodontal_status": "Good",
        }
        payload.update(extra)
        r = requests.post(f"{API}/procedures", json=payload, headers=s["headers"], timeout=25)
        if r.status_code != 409:
            return r
    return r


# ---------------------------------------------------------------- module --

def test_span_derivation():
    assert era.derive_edentulous_span(["11"]) == "Single tooth"
    assert era.derive_edentulous_span(["11", "21"]) == "Two or more teeth"     # contiguous across midline
    assert era.derive_edentulous_span(["12", "14"]) == "Single tooth"          # non-adjacent gaps
    assert era.derive_edentulous_span(["13", "14"]) == "Two or more teeth"     # run touches anterior
    assert era.derive_edentulous_span(["16", "36"]) == ""                      # posterior only → n/a
    assert era.is_anterior_maxilla_case(["23"]) and not era.is_anterior_maxilla_case(["33"])


def test_overall_iti_style_and_legacy_biotype():
    low = {"smile_line": "Low", "gingival_biotype": "Thick", "missing_teeth": ["11"],
           "aesthetic_risk": {"smile_type": "Toothy", "adjacent_teeth_right": "Non-restored", "adjacent_teeth_left": "Non-restored",
                              "infection_at_site": "Absent", "ridge_condition": "No hard tissue defect",
                              "bone_level_adjacent": "≤ 5 mm to contact point", "patient_expectations": "Realistic esthetic demands"}}
    s = era.compute_era(low)
    assert s["overall"] == "Low" and s["assessed"] == 10 and s["total"] == 10
    assert era.normalize_gingival_biotype("Thick") == "Thick, Low scalloped"
    med = dict(low, aesthetic_risk=dict(low["aesthetic_risk"], infection_at_site="Chronic"))
    assert era.compute_era(med)["overall"] == "Medium"
    high = dict(med, gingival_biotype="Thin")  # legacy value → High
    assert era.compute_era(high)["overall"] == "High"
    assert era.compute_era({"missing_teeth": ["16"]})["overall"] is None


# ------------------------------------------------------------------- API --

@pytest.fixture(scope="module")
def created(ctx):
    r = _create(ctx, ["11", "21"], aesthetic_risk=ERA_PAYLOAD)
    assert r.status_code in (200, 201), r.text
    pid = r.json().get("id") or r.json().get("_id")
    assert pid
    return pid


def test_create_stores_sanitised_era(ctx, created):
    r = requests.get(f"{API}/procedures/{created}", headers=ctx["student"]["headers"], timeout=20)
    assert r.status_code == 200
    ar = r.json()["aesthetic_risk"]
    assert "junk_key" not in ar
    assert ar["smile_type"] == "Gummy" and ar["ridge_condition"] == "Horizontal bone defect"
    assert ar["edentulous_span"] == "Two or more teeth"
    assert ar["overall_risk"] == "High" and ar["anterior_maxilla"] is True
    assert ar["assessed_count"] == 10


def test_edit_fields_restamps_overall(ctx, created):
    # Make every factor Low except adjacent_left (High) → still High; then fix → Medium (ridge Horizontal) …
    fields = {"smile_line": "Low", "gingival_biotype": "Thick, Low scalloped",
              "aesthetic_risk": {"smile_type": "Toothy", "adjacent_teeth_right": "Non-restored", "adjacent_teeth_left": "Non-restored",
                                 "infection_at_site": "Absent", "ridge_condition": "Horizontal bone defect",
                                 "bone_level_adjacent": "≤ 5 mm to contact point", "patient_expectations": "Realistic esthetic demands"},
              "missing_teeth": ["11"]}
    r = requests.patch(f"{API}/procedures/{created}/edit-fields", json={"fields": fields}, headers=ctx["admin"]["headers"], timeout=20)
    assert r.status_code == 200, r.text
    ar = r.json()["aesthetic_risk"]
    assert ar["overall_risk"] == "Medium"
    assert ar["edentulous_span"] == "Single tooth"


def test_pdf_contains_overall(ctx, created):
    r = requests.post(f"{API}/procedures/{created}/case-report", headers=ctx["admin"]["headers"], timeout=60)
    assert r.status_code == 200, r.text[:200]
    try:
        from pypdf import PdfReader
        text = "".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(r.content)).pages)
        assert "Overall Aesthetic Risk" in text and "Smile Type" in text
    except ImportError:
        assert r.content[:4] == b"%PDF"


def test_posterior_case_has_no_span_and_no_anterior_flag(ctx):
    r = _create(ctx, ["16"], aesthetic_risk={"smile_type": "Mixed"})
    assert r.status_code in (200, 201), r.text
    pid = r.json().get("id") or r.json().get("_id")
    doc = requests.get(f"{API}/procedures/{pid}", headers=ctx["student"]["headers"], timeout=20).json()
    ar = doc["aesthetic_risk"]
    assert "edentulous_span" not in ar and ar["anterior_maxilla"] is False
    assert ar["overall_risk"] == "High"  # smile_line High + Thin biotype
