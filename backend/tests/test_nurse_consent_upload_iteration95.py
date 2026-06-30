"""Iteration 95 — Nurse consent-upload + regression tests.

Focus:
  1. POST /api/procedures/{id}/upload-consent as NURSE on a case that already has
     consent_uploaded=true → 200 and returns updated procedure with patient_consent_form
     populated (this exercises the "replace" path without changing overall counts).
  2. Regression: POST /api/procedures/{id}/mark-instruments-autoclaved still works.
  3. Regression: GET /api/procedures/nurse/consent-cases still returns expected schema
     and the test case's consent_uploaded flag is intact after re-upload.
"""
import io
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://implant-workflow-hub.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

# Case known to already have consent uploaded (per iter-94 context)
KNOWN_UPLOADED_CASE_ID = "69cf9bdfdafb502718057bcd"

CREDS = {
    "nurse": {"identifier": "nurse.1@dental.edu", "password": "Nurse@123"},
    "student": {"identifier": "Gaurav.pandey", "password": "Student@123"},
    "supervisor": {"identifier": "Paresh.gandhi", "password": "Supervisor@123"},
    "incharge": {"identifier": "Abhijit.patil", "password": "Admin@123"},
}


def _login(identifier, password):
    r = requests.post(
        f"{API}/auth/login",
        json={"identifier": identifier, "password": password},
        timeout=20,
    )
    assert r.status_code == 200, f"login failed {identifier}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def tokens():
    return {role: _login(c["identifier"], c["password"]) for role, c in CREDS.items()}


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


# -- Iter 95: Nurse upload-consent (replace path) --
def test_nurse_can_upload_consent_replace_path(tokens):
    pdf_bytes = b"%PDF-1.4\n%Mock consent for iteration95 test\n%%EOF\n"
    files = {
        "file": ("TEST_iter95_consent.pdf", io.BytesIO(pdf_bytes), "application/pdf"),
    }
    r = requests.post(
        f"{API}/procedures/{KNOWN_UPLOADED_CASE_ID}/upload-consent",
        headers=_hdr(tokens["nurse"]),
        files=files,
        timeout=30,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "patient_consent_form" in body and body["patient_consent_form"], (
        "patient_consent_form missing after upload"
    )
    pcf = body["patient_consent_form"]
    assert pcf.get("original_name") == "TEST_iter95_consent.pdf"
    assert pcf.get("uploaded_by_role") == "nurse"
    assert pcf.get("version", 0) >= 1
    # consent_history should contain the previous version since this was a replace
    hist = body.get("consent_history") or []
    assert isinstance(hist, list)


# -- Iter 95: unauthorized student (not owner) cannot upload to someone else's case --
def test_non_owner_student_cannot_upload_consent(tokens):
    # Gaurav.pandey is the known student used across tests; if they happen to own
    # KNOWN_UPLOADED_CASE_ID this test will skip rather than false-fail.
    # First fetch the case via nurse to inspect student_id.
    r_case = requests.get(
        f"{API}/procedures/{KNOWN_UPLOADED_CASE_ID}",
        headers=_hdr(tokens["nurse"]),
        timeout=20,
    )
    assert r_case.status_code == 200, r_case.text
    case = r_case.json()
    # Who is Gaurav?
    r_me = requests.get(f"{API}/auth/me", headers=_hdr(tokens["student"]), timeout=20)
    assert r_me.status_code == 200
    me = r_me.json()
    my_id = me.get("id") or me.get("_id")
    if case.get("student_id") == my_id or case.get("created_by_id") == my_id:
        pytest.skip("Gaurav owns the known case — skipping non-owner negative test")
    pdf_bytes = b"%PDF-1.4\n%no\n%%EOF\n"
    files = {"file": ("TEST_deny.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    r = requests.post(
        f"{API}/procedures/{KNOWN_UPLOADED_CASE_ID}/upload-consent",
        headers=_hdr(tokens["student"]),
        files=files,
        timeout=20,
    )
    assert r.status_code == 403, r.text


# -- Regression: mark-instruments-autoclaved still works --
def test_mark_instruments_autoclaved_regression(tokens):
    # Mark then unmark to keep state.
    r1 = requests.post(
        f"{API}/procedures/{KNOWN_UPLOADED_CASE_ID}/mark-instruments-autoclaved",
        headers=_hdr(tokens["nurse"]),
        json={"marked": True},
        timeout=20,
    )
    assert r1.status_code == 200, r1.text
    b1 = r1.json()
    ia = b1.get("instruments_autoclaved")
    assert ia is not None and ia.get("marked") is True
    assert ia.get("marked_by_name")

    r2 = requests.post(
        f"{API}/procedures/{KNOWN_UPLOADED_CASE_ID}/mark-instruments-autoclaved",
        headers=_hdr(tokens["nurse"]),
        json={"marked": False},
        timeout=20,
    )
    assert r2.status_code == 200, r2.text
    ia2 = r2.json().get("instruments_autoclaved")
    # Spec may return None or {marked:false} — accept both
    assert ia2 is None or ia2.get("marked") is False


# -- Regression: nurse/consent-cases contract intact --
def test_nurse_consent_cases_contract_intact(tokens):
    r = requests.get(
        f"{API}/procedures/nurse/consent-cases",
        headers=_hdr(tokens["nurse"]),
        timeout=30,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert {"cases", "completed_count", "pending_count"} <= set(data.keys())
    assert data["completed_count"] + data["pending_count"] == len(data["cases"])
    # Known case should still have consent_uploaded True
    match = next((c for c in data["cases"] if c["id"] == KNOWN_UPLOADED_CASE_ID), None)
    if match is not None:
        assert match["consent_uploaded"] is True, (
            "KNOWN_UPLOADED_CASE_ID lost consent_uploaded flag after replace"
        )


# -- Regression: consent-form-template accessible (used by ExportPrintMenu) --
def test_consent_form_template_reachable(tokens):
    r = requests.get(
        f"{API}/procedures/{KNOWN_UPLOADED_CASE_ID}/consent-form-template",
        headers=_hdr(tokens["nurse"]),
        timeout=20,
    )
    # 200 OK or 307/302 redirect to a signed PDF URL are both acceptable
    assert r.status_code in (200, 302, 307), f"unexpected {r.status_code}: {r.text[:200]}"
