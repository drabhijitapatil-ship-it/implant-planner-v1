"""
Iteration 98 — Backend tests for three specific fixes:

  1. POST /api/drilling-protocols/export-pdf:
     - With a supported brand/system (B&B Dental / 3P) → 200 PDF (≥3 KB, %PDF-1.4).
       Both with and without steps[] in the payload.
     - With an UNSUPPORTED brand/system (Straumann / BLX) + steps[] → 200 PDF,
       rendered from the client-supplied steps.
     - With an UNSUPPORTED brand/system and NO steps[] → 404 (unchanged behaviour).

  2. GET /api/procedures/nurse/scheduled-cases as nurse → each case contains
     `consent_uploaded: bool`.

  3. Regression: iteration-97 patient banner flow + iteration-96 reminder sweep
     still behave correctly.
"""
from __future__ import annotations

import os
import pytest
import httpx
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

API_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("REACT_APP_BACKEND_URL")
    or "http://localhost:8001"
).rstrip("/")
BASE = f"{API_URL}/api"

STUDENT_CREDS = {"email": "Gaurav.pandey", "password": "Student@123"}
INCHARGE_CREDS = {"email": "Abhijit.patil", "password": "Admin@123"}
NURSE_CREDS = {"email": "nurse.1@dental.edu", "password": "Nurse@123"}

SUPPORTED_PAYLOAD = {
    "brand": "B&B Dental",
    "system": "3P",
    "diameter": 4.0,
    "length": 10.0,
    "bone_density": "D3",
    "tooth": "16",
}

UNSUPPORTED_BASE = {
    "brand": "Straumann",
    "system": "BLX",
    "diameter": 4.0,
    "length": 10.0,
    "bone_density": "D3",
    "tooth": "16",
}

CLIENT_STEPS = [
    {"step": 1, "drill": "Round Bur 2.3 mm", "code": "RB23", "depth": "1 mm cortex", "speed": "800 rpm"},
    {"step": 2, "drill": "Pilot 2.2 mm", "code": "P22", "depth": "10 mm", "speed": "800 rpm"},
    {"step": 3, "drill": "Ø3.2 mm Twist Drill", "code": "T32", "depth": "10 mm", "speed": "600 rpm"},
    {"step": 4, "drill": "Ø3.7 mm Profile Drill", "code": "P37", "depth": "10 mm", "speed": "500 rpm"},
    {"step": 5, "drill": "Implant Placement", "code": "IMP", "depth": "10 mm", "speed": "15 rpm"},
]


def _login(client: httpx.Client, creds: dict) -> str:
    r = client.post(f"{BASE}/auth/login", json=creds)
    r.raise_for_status()
    return r.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def student_token():
    with httpx.Client(timeout=20) as c:
        return _login(c, STUDENT_CREDS)


@pytest.fixture(scope="module")
def incharge_token():
    with httpx.Client(timeout=20) as c:
        return _login(c, INCHARGE_CREDS)


@pytest.fixture(scope="module")
def nurse_token():
    with httpx.Client(timeout=20) as c:
        return _login(c, NURSE_CREDS)


# ---------- Drilling PDF ---------------------------------------------------

def test_export_pdf_supported_brand_without_steps(student_token):
    """B&B Dental / 3P without steps[] → uses dict lookup → 200 PDF."""
    with httpx.Client(timeout=60) as c:
        r = c.post(
            f"{BASE}/drilling-protocols/export-pdf",
            json=SUPPORTED_PAYLOAD,
            headers=_auth(student_token),
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
        assert r.headers.get("content-type", "").startswith("application/pdf")
        body = r.content
        assert body[:8] == b"%PDF-1.4", f"bad header: {body[:16]!r}"
        assert len(body) >= 3000, f"pdf too small: {len(body)}"


def test_export_pdf_supported_brand_with_client_steps(student_token):
    """B&B Dental / 3P WITH steps[] — dict path still takes precedence, PDF 200."""
    payload = {**SUPPORTED_PAYLOAD, "steps": CLIENT_STEPS}
    with httpx.Client(timeout=60) as c:
        r = c.post(
            f"{BASE}/drilling-protocols/export-pdf",
            json=payload,
            headers=_auth(student_token),
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
        body = r.content
        assert body[:8] == b"%PDF-1.4"
        assert len(body) >= 3000


def test_export_pdf_unsupported_brand_with_steps_falls_back(student_token):
    """Straumann / BLX NOT in dict but steps[] provided → 200 PDF (fallback render)."""
    payload = {**UNSUPPORTED_BASE, "steps": CLIENT_STEPS}
    with httpx.Client(timeout=60) as c:
        r = c.post(
            f"{BASE}/drilling-protocols/export-pdf",
            json=payload,
            headers=_auth(student_token),
        )
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:300]}"
        assert r.headers.get("content-type", "").startswith("application/pdf")
        body = r.content
        assert body[:8] == b"%PDF-1.4"
        assert len(body) >= 3000, f"pdf too small: {len(body)}"
        # Note: ReportLab compresses content streams so we can't grep plaintext
        # for the title/implant-system. Status 200 + valid header + >3KB proves
        # the fallback render path executed end-to-end without KeyError.


def test_export_pdf_unsupported_brand_without_steps_404(student_token):
    """Straumann / BLX NOT in dict AND no steps[] → 404 (unchanged)."""
    with httpx.Client(timeout=30) as c:
        r = c.post(
            f"{BASE}/drilling-protocols/export-pdf",
            json=UNSUPPORTED_BASE,
            headers=_auth(student_token),
        )
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:300]}"


def test_export_pdf_unsupported_brand_empty_steps_404(student_token):
    """Empty steps[] array counts as no steps → 404."""
    payload = {**UNSUPPORTED_BASE, "steps": []}
    with httpx.Client(timeout=30) as c:
        r = c.post(
            f"{BASE}/drilling-protocols/export-pdf",
            json=payload,
            headers=_auth(student_token),
        )
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:300]}"


def test_export_pdf_missing_required_fields_400(student_token):
    bad = {"brand": "Straumann", "system": "BLX"}  # missing diameter/length/bone
    with httpx.Client(timeout=30) as c:
        r = c.post(
            f"{BASE}/drilling-protocols/export-pdf",
            json=bad,
            headers=_auth(student_token),
        )
        assert r.status_code == 400


def test_export_pdf_requires_auth():
    with httpx.Client(timeout=30) as c:
        r = c.post(f"{BASE}/drilling-protocols/export-pdf", json=SUPPORTED_PAYLOAD)
        assert r.status_code in (401, 403)


# ---------- Nurse scheduled cases `consent_uploaded` -----------------------

def test_nurse_scheduled_cases_includes_consent_uploaded(nurse_token):
    with httpx.Client(timeout=20) as c:
        r = c.get(
            f"{BASE}/procedures/nurse/scheduled-cases",
            headers=_auth(nurse_token),
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
        js = r.json()
        assert "cases" in js and isinstance(js["cases"], list)
        # Endpoint always returns the key, even when the list is empty — but
        # every case item, when present, MUST expose `consent_uploaded: bool`.
        for case in js["cases"]:
            assert "consent_uploaded" in case, f"missing key in {case}"
            assert isinstance(case["consent_uploaded"], bool), (
                f"consent_uploaded must be bool, got {type(case['consent_uploaded']).__name__}: {case}"
            )
            # Also verify the iter-93 autoclave field is still present.
            assert "instruments_autoclaved" in case, f"missing instruments_autoclaved in {case}"


def test_nurse_scheduled_cases_incharge_also_ok(incharge_token):
    """Regression: in-charge can still see the endpoint."""
    with httpx.Client(timeout=20) as c:
        r = c.get(
            f"{BASE}/procedures/nurse/scheduled-cases",
            headers=_auth(incharge_token),
        )
        assert r.status_code == 200
        js = r.json()
        assert "cases" in js


def test_nurse_scheduled_cases_student_forbidden(student_token):
    with httpx.Client(timeout=20) as c:
        r = c.get(
            f"{BASE}/procedures/nurse/scheduled-cases",
            headers=_auth(student_token),
        )
        assert r.status_code == 403


# ---------- iter-97 regression (patient banner) ----------------------------

def test_iter97_patient_banner_still_works(student_token):
    payload = {
        **SUPPORTED_PAYLOAD,
        "patient_name": "TEST_Banner98",
        "patient_id": "TEST-ID-98",
        "procedure_date": "2026-03-01",
    }
    with httpx.Client(timeout=60) as c:
        r = c.post(
            f"{BASE}/drilling-protocols/export-pdf",
            json=payload,
            headers=_auth(student_token),
        )
        assert r.status_code == 200
        assert r.content[:8] == b"%PDF-1.4"


# ---------- iter-96 regression (pre-surgery reminders) ---------------------

def test_iter96_pre_surgery_reminder_incharge_200(incharge_token):
    with httpx.Client(timeout=40) as c:
        r = c.post(
            f"{BASE}/admin/run-pre-surgery-reminders",
            headers=_auth(incharge_token),
        )
        assert r.status_code == 200
        assert r.json().get("ok") is True


def test_iter96_pre_surgery_reminder_nurse_403(nurse_token):
    with httpx.Client(timeout=20) as c:
        r = c.post(
            f"{BASE}/admin/run-pre-surgery-reminders",
            headers=_auth(nurse_token),
        )
        assert r.status_code == 403
