"""
Iteration 97 — Backend tests for POST /api/drilling-protocols/export-pdf accepting
optional patient_name / patient_id / procedure_date fields used to draw a blue banner
at the top of the generated A4 PDF.

Scope:
  1. With patient fields — PDF generated, >3KB, starts with '%PDF-1.4'.
  2. Without patient fields — still generates a valid PDF (backwards compat).
  3. Missing required fields (brand/system/diameter/length/bone) — 400.
  4. Regression: iter-96 pre-surgery reminder endpoint is still reachable and
     rejects nurse role with 403.
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

# Known valid drilling protocol from the implant library (see agent note).
VALID_PAYLOAD = {
    "brand": "B&B Dental",
    "system": "3P",
    "diameter": 4.0,
    "length": 10.0,
    "bone_density": "D3",
    "tooth": "16",
}


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


# ------------------- export-pdf ----------------------

def test_export_pdf_with_patient_banner_fields(student_token):
    payload = {
        **VALID_PAYLOAD,
        "patient_name": "TEST_Banner Patient",
        "patient_id": "TEST-BANNER-001",
        "procedure_date": "2026-02-20",
    }
    with httpx.Client(timeout=60) as c:
        r = c.post(
            f"{BASE}/drilling-protocols/export-pdf",
            json=payload,
            headers=_auth(student_token),
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        assert r.headers.get("content-type", "").startswith("application/pdf"), r.headers
        body = r.content
        assert body[:8] == b"%PDF-1.4", f"bad pdf header: {body[:16]!r}"
        assert len(body) > 3000, f"pdf too small: {len(body)} bytes"


def test_export_pdf_without_patient_fields_still_works(student_token):
    with httpx.Client(timeout=60) as c:
        r = c.post(
            f"{BASE}/drilling-protocols/export-pdf",
            json=VALID_PAYLOAD,
            headers=_auth(student_token),
        )
        assert r.status_code == 200, r.text[:300]
        body = r.content
        assert body[:8] == b"%PDF-1.4"
        assert len(body) > 3000


def test_export_pdf_empty_patient_strings_are_ok(student_token):
    payload = {**VALID_PAYLOAD, "patient_name": "", "patient_id": "", "procedure_date": ""}
    with httpx.Client(timeout=60) as c:
        r = c.post(
            f"{BASE}/drilling-protocols/export-pdf",
            json=payload,
            headers=_auth(student_token),
        )
        assert r.status_code == 200
        assert r.content[:8] == b"%PDF-1.4"


def test_export_pdf_missing_required_returns_400(student_token):
    bad = {"brand": "B&B Dental", "system": "3P"}  # missing diameter/length/bone
    with httpx.Client(timeout=30) as c:
        r = c.post(
            f"{BASE}/drilling-protocols/export-pdf",
            json=bad,
            headers=_auth(student_token),
        )
        assert r.status_code == 400, r.text[:200]


def test_export_pdf_requires_auth():
    with httpx.Client(timeout=30) as c:
        r = c.post(f"{BASE}/drilling-protocols/export-pdf", json=VALID_PAYLOAD)
        assert r.status_code in (401, 403)


# ------------------- iter-96 regression ----------------------

def test_iter96_pre_surgery_reminder_still_rejects_nurse(nurse_token):
    with httpx.Client(timeout=20) as c:
        r = c.post(
            f"{BASE}/admin/run-pre-surgery-reminders",
            headers=_auth(nurse_token),
        )
        assert r.status_code == 403


def test_iter96_pre_surgery_reminder_incharge_200(incharge_token):
    with httpx.Client(timeout=40) as c:
        r = c.post(
            f"{BASE}/admin/run-pre-surgery-reminders",
            headers=_auth(incharge_token),
        )
        assert r.status_code == 200
        js = r.json()
        assert js.get("ok") is True
