"""iter-Jun-2026 ERA — additional regression checks requested by main agent.

1. GET /api/procedures/{id} for a case with legacy gingival_biotype "Thin"
   loads without 500 (compute_era must handle legacy value → normalize to
   "Thin, High scalloped").
2. POST /api/procedures/{id}/case-report generates a PDF (no crash) for a
   posterior-only case that carries no ERA nested data (section is omitted).
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


_slots = iter([(d, t) for d in range(4, 50) for t in ["09:00", "10:30", "11:30", "13:00", "14:30", "15:30", "16:30"]])


def _slot():
    while True:
        d, t = next(_slots)
        day = datetime.now() + timedelta(days=d)
        if day.weekday() < 5:
            return day.strftime("%Y-%m-%d"), t


def _base_payload(ctx, missing):
    s, sup, adm = ctx["student"], ctx["supervisor"], ctx["admin"]
    d, t = _slot()
    return {
        "student_name": s["name"], "patient_name": "ERA Regression Patient",
        "registration_number": f"ERA-REG-{uuid.uuid4().hex[:6]}",
        "supervisor_id": sup["id"], "supervisor_name": sup["name"],
        "implant_incharge_id": adm["id"], "implant_incharge_name": adm["name"],
        "implant_site": "Upper Arch", "receipt_number": f"ERA-R-{uuid.uuid4().hex[:5]}", "amount_paid": 5000.0,
        "procedure_date": d, "procedure_time": t,
        "implant_procedure_type": "Single Conventional Implant", "loading_type": ["Delayed Loading"],
        "missing_teeth": missing, "periodontal_status": "Good",
    }


def _create(ctx, missing, **extra):
    s = ctx["student"]
    for _ in range(8):
        payload = _base_payload(ctx, missing)
        payload.update(extra)
        r = requests.post(f"{API}/procedures", json=payload, headers=s["headers"], timeout=25)
        if r.status_code != 409:
            return r
    return r


def test_legacy_thin_biotype_get_ok(ctx):
    """Create case with legacy 'Thin' biotype and confirm GET returns 200
    with computable ERA (compute_era normalises 'Thin' → 'Thin, High scalloped')."""
    r = _create(ctx, ["11"], smile_line="High", gingival_biotype="Thin")
    assert r.status_code in (200, 201), r.text
    pid = r.json().get("id") or r.json().get("_id")

    g = requests.get(f"{API}/procedures/{pid}", headers=ctx["student"]["headers"], timeout=20)
    assert g.status_code == 200, g.text
    doc = g.json()
    # Legacy value must be preserved on the doc; normalisation happens at compute time.
    assert doc.get("gingival_biotype") in ("Thin", "Thin, High scalloped")
    # And ERA stamped overall must be High (Smile Line High + Thin biotype = High).
    ar = doc.get("aesthetic_risk") or {}
    assert ar.get("overall_risk") == "High", ar

    # Also confirm compute_era can handle it purely.
    import aesthetic_risk as era
    summary = era.compute_era(doc)
    assert summary["overall"] == "High"


def test_posterior_only_pdf_generates_without_era(ctx):
    """Posterior tooth 16 only, no ERA payload. PDF must generate (no crash)."""
    r = _create(ctx, ["16"], smile_line="", gingival_biotype="")
    assert r.status_code in (200, 201), r.text
    pid = r.json().get("id") or r.json().get("_id")

    pdf = requests.post(f"{API}/procedures/{pid}/case-report", headers=ctx["admin"]["headers"], timeout=60)
    assert pdf.status_code == 200, pdf.text[:400]
    assert pdf.content[:4] == b"%PDF"

    # Section must be omitted (no ERA rows / no "Overall Aesthetic Risk").
    try:
        from pypdf import PdfReader
        text = "".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(pdf.content)).pages)
        assert "Overall Aesthetic Risk" not in text
    except ImportError:
        pass
