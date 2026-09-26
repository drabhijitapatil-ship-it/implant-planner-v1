"""iter-431 — Implant Overdenture backend suite.

Coverage:
1. GET /api/case-form-options → procedure_types contains 'Implant Overdenture'
   positioned immediately BEFORE 'All on 4' (and AFTER 'Guided Surgery').
2. POST /api/procedures with implant_procedure_type='Implant Overdenture' and
   missing / invalid overdenture_type → 400 mentioning "Type of Overdenture".
3. Same payload with valid overdenture_type='Implant Retained Overdenture' →
   200; GET echoes overdenture_type + implant_procedure_type + fa_prosthetic_plan.
4. Missing-teeth exemption for Implant Overdenture (no missing_teeth accepted;
   arch dropdown persisted).
5. POST /api/procedures/{id}/case-report returns 200 and PDF (best-effort text
   extraction with pypdf) contains "Type of Overdenture".
6. Regression — All-on-4 create without overdenture_type still succeeds; Single
   Conventional Implant create still succeeds.
7. Bonus — add-implant eligibility list now includes 'Implant Overdenture'
   (checked via _ADDITION_CASE_TYPES message when trying with an ineligible
   type would 400; positive path documented by returning 200 or 202).
"""
from __future__ import annotations
import io
import os
import pytest
import requests
from bson import ObjectId
from datetime import datetime, timedelta
from pymongo import MongoClient

try:
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
except Exception:
    pass

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://dental-implant-hub-14.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}
ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}
SUPERVISOR = {"identifier": "Paresh.gandhi", "password": "Supervisor@123"}

_mongo = MongoClient(os.environ["MONGO_URL"])
_db = _mongo[os.environ["DB_NAME"]]


# ------------------------------------------------------------------ Auth --

def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed for {creds['identifier']}: {r.status_code} {r.text}"
    j = r.json()
    return j["access_token"], j.get("user") or {}


@pytest.fixture(scope="module")
def student_ctx():
    tok, user = _login(STUDENT)
    return {"tok": tok, "id": user.get("id") or user.get("_id"),
            "name": user.get("name") or "Dr. Gaurav Pandey",
            "headers": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}}


@pytest.fixture(scope="module")
def admin_ctx():
    tok, user = _login(ADMIN)
    return {"tok": tok, "id": user.get("id") or user.get("_id"),
            "name": user.get("name") or "Dr. Abhijit Patil",
            "headers": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}}


@pytest.fixture(scope="module")
def supervisor_ctx():
    tok, user = _login(SUPERVISOR)
    return {"tok": tok, "id": user.get("id") or user.get("_id"),
            "name": user.get("name") or "Dr. Paresh Gandhi",
            "headers": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}}


# ------------------------------------------------------------- Helpers --

def _next_weekday(delta_days=3):
    d = datetime.now() + timedelta(days=delta_days)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


_slot_counter = {"n": 0}
_TIME_SLOTS = ["09:00", "10:00", "11:00", "13:00", "15:00", "16:00", "17:00"]


def _unique_slot():
    idx = _slot_counter["n"]
    _slot_counter["n"] += 1
    day = _next_weekday(3 + (idx // len(_TIME_SLOTS)))
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day.strftime("%Y-%m-%d"), _TIME_SLOTS[idx % len(_TIME_SLOTS)]


def _base_payload(student_ctx, supervisor_ctx, admin_ctx, *, proc_type, patient,
                  reg, site="Upper Arch", loading=None, **extras):
    date_str, time_str = _unique_slot()
    payload = {
        "student_name": student_ctx["name"],
        "patient_name": patient,
        "registration_number": reg,
        "supervisor_id": supervisor_ctx["id"],
        "supervisor_name": supervisor_ctx["name"],
        "implant_incharge_id": admin_ctx["id"],
        "implant_incharge_name": admin_ctx["name"],
        "implant_site": site,
        "receipt_number": f"TEST-RCP-{reg}",
        "amount_paid": 5000.0,
        "procedure_date": date_str,
        "procedure_time": time_str,
        "implant_procedure_type": proc_type,
        "loading_type": loading or ["Delayed Loading"],
    }
    payload.update(extras)
    return payload


def _post_create(student_ctx, payload):
    """POST /api/procedures with slot retry on 409."""
    r = None
    for _ in range(6):
        r = requests.post(f"{API}/procedures", json=payload,
                          headers=student_ctx["headers"], timeout=25)
        if r.status_code != 409:
            return r
        d, t = _unique_slot()
        payload["procedure_date"] = d
        payload["procedure_time"] = t
    return r


@pytest.fixture
def created_ids():
    ids = []
    yield ids
    if ids:
        _db.procedures.delete_many(
            {"_id": {"$in": [ObjectId(i) for i in ids if i]}}
        )


# =============================================================== TESTS ===

# ---- ASK 1 · case-form-options ordering ---------------------------------

class TestCaseFormOptions:
    def test_procedure_types_includes_implant_overdenture(self):
        r = requests.get(f"{API}/case-form-options", timeout=15)
        assert r.status_code == 200, r.text
        proc = r.json().get("procedure_types") or []
        assert "Implant Overdenture" in proc, f"missing: {proc}"

    def test_implant_overdenture_ordering(self):
        r = requests.get(f"{API}/case-form-options", timeout=15)
        proc = r.json().get("procedure_types") or []
        idx = proc.index("Implant Overdenture")
        assert proc[idx + 1] == "All on 4", f"expected 'All on 4' after IOD, got {proc[idx+1]}"
        # Requirement: "Implant Overdenture appears after Guided Surgery".
        assert proc[idx - 1] == "Guided Surgery", f"expected 'Guided Surgery' before IOD, got {proc[idx-1]}"


# ---- ASK 2 · POST /api/procedures validation -----------------------------

class TestOverdentureValidation:
    def test_missing_overdenture_type_rejected(self, student_ctx, supervisor_ctx, admin_ctx, created_ids):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="Implant Overdenture",
            patient="TEST_IOD_MissingType", reg="TEST-IOD-VAL-001",
            site="Upper Arch",
            arch="Maxillary",
            loading=["Delayed Loading"],
            fa_prosthetic_plan="Locator / Locator R-Tx stud attachment",
            # NOTE: no overdenture_type
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        assert "Type of Overdenture" in r.text, f"error should mention Type of Overdenture: {r.text}"

    def test_invalid_overdenture_type_rejected(self, student_ctx, supervisor_ctx, admin_ctx, created_ids):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="Implant Overdenture",
            patient="TEST_IOD_BadType", reg="TEST-IOD-VAL-002",
            site="Upper Arch",
            arch="Maxillary",
            loading=["Delayed Loading"],
            fa_prosthetic_plan="Hader bar with clips",
            overdenture_type="Something Wrong",
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        assert "Type of Overdenture" in r.text, r.text


# ---- ASK 3 · POST + GET persistence -------------------------------------

class TestOverdenturePersistence:
    def test_create_and_get_persists_all_fields(
        self, student_ctx, supervisor_ctx, admin_ctx, created_ids
    ):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="Implant Overdenture",
            patient="TEST_IOD_Persist", reg="TEST-IOD-PERSIST-001",
            site="Upper Arch",
            arch="Maxillary",
            loading=["Delayed Loading"],
            overdenture_type="Implant Retained Overdenture",
            fa_prosthetic_plan="Locator / Locator R-Tx stud attachment",
            type_of_provisional="Chairside denture conversion",
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, f"create failed: {r.status_code} {r.text}"
        proc = r.json()
        pid = proc.get("id") or proc.get("_id")
        assert pid, proc
        created_ids.append(pid)

        # POST echo
        assert proc.get("implant_procedure_type") == "Implant Overdenture"
        assert proc.get("overdenture_type") == "Implant Retained Overdenture"
        assert proc.get("arch") == "Maxillary"
        assert proc.get("fa_prosthetic_plan") == "Locator / Locator R-Tx stud attachment"

        # GET echo
        g = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15)
        assert g.status_code == 200, g.text
        gp = g.json()
        assert gp.get("implant_procedure_type") == "Implant Overdenture"
        assert gp.get("overdenture_type") == "Implant Retained Overdenture"
        assert gp.get("arch") == "Maxillary"
        assert gp.get("fa_prosthetic_plan") == "Locator / Locator R-Tx stud attachment"

    def test_supported_variant_also_persists(
        self, student_ctx, supervisor_ctx, admin_ctx, created_ids
    ):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="Implant Overdenture",
            patient="TEST_IOD_Supported", reg="TEST-IOD-PERSIST-002",
            site="Lower Arch",
            arch="Mandibular",
            loading=["Delayed Loading"],
            overdenture_type="Implant Supported Overdenture",
            fa_prosthetic_plan="Hader bar with clips",
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, r.text
        pid = r.json().get("id") or r.json().get("_id")
        created_ids.append(pid)
        g = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15)
        gp = g.json()
        assert gp.get("overdenture_type") == "Implant Supported Overdenture"
        assert gp.get("arch") == "Mandibular"


# ---- ASK 4 · Full-arch exemption from missing_teeth ---------------------

class TestFullArchExemption:
    def test_no_missing_teeth_needed_for_implant_overdenture(
        self, student_ctx, supervisor_ctx, admin_ctx, created_ids
    ):
        """Implant Overdenture must NOT require missing_teeth (full-arch)."""
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="Implant Overdenture",
            patient="TEST_IOD_NoTeeth", reg="TEST-IOD-EXEMPT-001",
            site="Upper Arch",
            arch="Maxillary",
            loading=["Delayed Loading"],
            overdenture_type="Implant Retained Overdenture",
            fa_prosthetic_plan="Ball / O-ring attachment",
            # deliberately no missing_teeth
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, f"IOD should not require missing_teeth: {r.status_code} {r.text}"
        pid = r.json().get("id") or r.json().get("_id")
        created_ids.append(pid)


# ---- ASK 5 · Case-report PDF echoes "Type of Overdenture" ---------------

class TestCaseReportPDF:
    def test_case_report_pdf_contains_overdenture_field(
        self, student_ctx, supervisor_ctx, admin_ctx, created_ids
    ):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="Implant Overdenture",
            patient="TEST_IOD_PDF", reg="TEST-IOD-PDF-001",
            site="Upper Arch",
            arch="Maxillary",
            loading=["Delayed Loading"],
            overdenture_type="Implant Retained Overdenture",
            fa_prosthetic_plan="Locator / Locator R-Tx stud attachment",
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, r.text
        pid = r.json().get("id") or r.json().get("_id")
        created_ids.append(pid)

        rep = requests.post(f"{API}/procedures/{pid}/case-report",
                            headers=student_ctx["headers"], timeout=45)
        assert rep.status_code == 200, f"case-report failed: {rep.status_code} {rep.text[:400]}"
        # Content-Type should be pdf
        ct = rep.headers.get("content-type", "").lower()
        assert "pdf" in ct or rep.content[:4] == b"%PDF", f"not a pdf: {ct}"

        # Best-effort text extraction
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(rep.content))
            text = "\n".join((p.extract_text() or "") for p in reader.pages)
            assert "Type of Overdenture" in text, (
                f"'Type of Overdenture' not found in case-report PDF text"
                f" (len={len(text)})"
            )
        except ImportError:
            pytest.skip("pypdf not installed")


# ---- ASK 6 · Regression — All on 4 / SC still work ----------------------

class TestRegression:
    def test_all_on_4_still_works_without_overdenture_type(
        self, student_ctx, supervisor_ctx, admin_ctx, created_ids
    ):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="All on 4",
            patient="TEST_IOD_REG_AO4", reg="TEST-IOD-REG-AO4-001",
            site="Upper Arch",
            arch="Maxillary",
            loading=["Immediate Loading"],
            fa_prosthetic_plan='Metal-acrylic hybrid ("Toronto" / fixed-detachable, FP-3)',
            type_of_provisional="Chairside denture conversion",
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, f"All on 4 regression: {r.status_code} {r.text}"
        pid = r.json().get("id") or r.json().get("_id")
        created_ids.append(pid)
        assert (r.json().get("overdenture_type") or "") == ""

    def test_single_conventional_still_works(
        self, student_ctx, supervisor_ctx, admin_ctx, created_ids
    ):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="Single Conventional Implant",
            patient="TEST_IOD_REG_SC", reg="TEST-IOD-REG-SC-001",
            site="Upper Right 12",
            loading=["Delayed Loading"],
            missing_teeth=["12"],
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, f"SC regression: {r.status_code} {r.text}"
        pid = r.json().get("id") or r.json().get("_id")
        created_ids.append(pid)


# ---- ASK 7 · add-implant eligibility ------------------------------------

class TestAddImplantEligibility:
    """add-implant should be permitted for Implant Overdenture (full-arch)."""

    def test_add_implant_endpoint_reachable_for_iod(
        self, student_ctx, supervisor_ctx, admin_ctx, created_ids
    ):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="Implant Overdenture",
            patient="TEST_IOD_AddImplant", reg="TEST-IOD-ADD-001",
            site="Upper Arch",
            arch="Maxillary",
            loading=["Delayed Loading"],
            overdenture_type="Implant Supported Overdenture",
            fa_prosthetic_plan="Dolder bar",
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, r.text
        pid = r.json().get("id") or r.json().get("_id")
        created_ids.append(pid)

        # Send an add-implant request; the important thing is that the endpoint
        # does NOT reject the case-type with "only available for Multiple
        # Implants and full-arch". Downstream validation errors (workflow
        # state, missing fields, etc.) are OK — but 400 with the specific
        # case-type gate would signal that IOD was left out of the set.
        body = {"reason": "TEST — validate eligibility"}
        r2 = requests.post(f"{API}/procedures/{pid}/add-implant",
                           json=body, headers=student_ctx["headers"], timeout=20)
        # Not asserting 200 — but if 400, ensure the gate rejection wording is absent.
        assert not (
            r2.status_code == 400
            and "only available for Multiple Implants" in r2.text
        ), f"IOD wrongly excluded from add-implant: {r2.status_code} {r2.text}"
