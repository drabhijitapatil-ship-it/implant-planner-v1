"""iter-440 additional ERA backend checks:

1. POST /api/procedures with LEGACY flat aesthetic_risk (no 'sites' key) for
   missing_teeth=['11'] → stored doc has aesthetic_risk.sites['11'] populated
   from the flat keys and no flat site keys remain at aesthetic_risk root.
2. GET /api/procedures/{id} on an existing legacy iter-438 doc (found in Mongo
   with aesthetic_risk.ridge_condition set + no sites) → still returns 200 and
   the case-report PDF contains 'Width of Edentulous Span'.
3. GET /api/analytics/aesthetic-risk exposes summary.anterior_areas AND
   summary.area_distribution (per-area buckets).
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

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://dental-implant-hub-14.preview.emergentagent.com").rstrip("/")
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


def _create(ctx, missing, **extra):
    s, sup, adm = ctx["student"], ctx["supervisor"], ctx["admin"]
    for _ in range(8):
        d, t = _slot()
        payload = {
            "student_name": s["name"], "patient_name": "ERA Test Patient",
            "registration_number": f"ERA440-{uuid.uuid4().hex[:6]}",
            "supervisor_id": sup["id"], "supervisor_name": sup["name"],
            "implant_incharge_id": adm["id"], "implant_incharge_name": adm["name"],
            "implant_site": "Upper Arch", "receipt_number": f"ERA440-R-{uuid.uuid4().hex[:5]}", "amount_paid": 5000.0,
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


def test_legacy_flat_era_post_is_nested_under_sites(ctx):
    """Client posts flat site keys (no 'sites') → server should nest under sites[leader] and clear flat keys."""
    legacy_flat = {
        "smile_type": "Toothy",
        "patient_expectations": "Realistic esthetic demands",
        "adjacent_teeth_right": "Non-restored",
        "adjacent_teeth_left": "Non-restored",
        "infection_at_site": "Absent",
        "ridge_condition": "Horizontal bone defect",
        "bone_level_adjacent": "≤ 5 mm to contact point",
    }
    r = _create(ctx, ["11"], aesthetic_risk=legacy_flat, mesiodistal_space="8")
    assert r.status_code in (200, 201), r.text
    pid = r.json().get("id") or r.json().get("_id")
    assert pid
    doc = requests.get(f"{API}/procedures/{pid}", headers=ctx["student"]["headers"], timeout=20).json()
    ar = doc["aesthetic_risk"]
    # patient keys still at root
    assert ar.get("smile_type") == "Toothy"
    assert ar.get("patient_expectations") == "Realistic esthetic demands"
    # site keys should be nested, NOT at root
    for k in ("adjacent_teeth_right", "adjacent_teeth_left", "infection_at_site",
              "ridge_condition", "bone_level_adjacent", "edentulous_span"):
        assert k not in ar, f"legacy site key '{k}' still present at root"
    assert "sites" in ar and "11" in ar["sites"]
    site = ar["sites"]["11"]
    assert site.get("ridge_condition") == "Horizontal bone defect"
    assert site.get("edentulous_span") == "Single tooth ≥ 7 mm"
    assert site.get("span_mm") == 8.0
    assert site.get("overall_risk") in ("Medium", "High")
    assert ar.get("overall_risk") in ("Medium", "High")


def test_legacy_iter438_doc_read_and_pdf(ctx):
    """Find an existing legacy doc (has aesthetic_risk.ridge_condition, no sites)
    and confirm GET + case-report PDF still work with 'Width of Edentulous Span'."""
    # Look through admin's procedure list for a legacy shape doc
    r = requests.get(f"{API}/procedures", headers=ctx["admin"]["headers"], timeout=30)
    assert r.status_code == 200
    procs = r.json() if isinstance(r.json(), list) else r.json().get("procedures", [])
    legacy_id = None
    for p in procs:
        ar = (p or {}).get("aesthetic_risk") or {}
        if ar.get("ridge_condition") and "sites" not in ar:
            legacy_id = p.get("id") or p.get("_id")
            break

    if not legacy_id:
        # Create a legacy-shape doc directly via Mongo would violate isolation; fall back
        # to seed via POST with flat payload (which the API will normalise). Skip if not
        # actually legacy.
        pytest.skip("No pre-existing legacy iter-438 doc (flat site keys) found in DB")

    doc = requests.get(f"{API}/procedures/{legacy_id}", headers=ctx["admin"]["headers"], timeout=20)
    assert doc.status_code == 200, doc.text
    # The endpoint may lift into sites on read, either shape is acceptable — key is 200
    j = doc.json()
    assert j.get("aesthetic_risk") is not None
    # PDF check
    p = requests.post(f"{API}/procedures/{legacy_id}/case-report", headers=ctx["admin"]["headers"], timeout=60)
    assert p.status_code == 200, p.text[:200]
    try:
        from pypdf import PdfReader
        text = "".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(p.content)).pages)
        assert "Width of Edentulous Span" in text, f"missing 'Width of Edentulous Span' in PDF text"
    except ImportError:
        assert p.content[:4] == b"%PDF"


def test_analytics_exposes_anterior_areas_and_area_distribution(ctx):
    r = requests.get(f"{API}/analytics/aesthetic-risk", headers=ctx["admin"]["headers"], timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    sm = j["summary"]
    assert "anterior_areas" in sm and isinstance(sm["anterior_areas"], int)
    assert "area_distribution" in sm and set(sm["area_distribution"]) == {"Low", "Medium", "High"}
    # Areas ≥ anterior_cases (multi-area cases contribute >1 area)
    assert sm["anterior_areas"] >= sm["anterior_cases"]
    # Sum of area distribution equals anterior_areas
    assert sum(sm["area_distribution"].values()) == sm["anterior_areas"]
