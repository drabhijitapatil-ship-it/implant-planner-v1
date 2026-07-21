"""
iter-328 Sinus Lift regression tests.

Covers:
 * GET /api/case-form-options procedure_types contains "Sinus Lift" between
   "Guided Surgery" and "All on 4".
 * POST /api/procedures Sinus Lift gates:
    - missing tooth-validation message for mandibular / max-anterior teeth
    - missing sinus_lift_type → 400
    - missing bone_graft_material_details → 400
    - happy path with each sinus_lift_type value persists fields
    - All 8 maxillary posteriors accepted
 * Non-Sinus-Lift procedure ignores sinus_lift_type field (200).
 * Case-report PDF includes Sinus Lift extras + base Procedure Type / Number of Implants rows.
"""
import os
import io
import time
import pytest
import requests
from datetime import datetime, timedelta

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://case-approval.preview.emergentagent.com").rstrip("/")

STUDENT_CREDS = {"identifier": "Gaurav.pandey", "password": "Student@123"}
INCHARGE_CREDS = {"identifier": "Abhijit.patil", "password": "Admin@123"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"Login failed {creds['identifier']}: {r.status_code} {r.text}"
    j = r.json()
    tok = j.get("access_token") or j.get("token")
    user = j.get("user", {})
    return tok, user


@pytest.fixture(scope="module")
def student_ctx():
    tok, user = _login(STUDENT_CREDS)
    return {"token": tok, "id": user.get("id"), "name": user.get("name")}


@pytest.fixture(scope="module")
def incharge_ctx():
    tok, user = _login(INCHARGE_CREDS)
    return {"token": tok, "id": user.get("id"), "name": user.get("name")}


@pytest.fixture(scope="module")
def supervisor_ctx():
    # Use existing supervisor account from /app/memory/test_credentials.md
    tok, user = _login({"identifier": "Paresh.gandhi", "password": "Supervisor@123"})
    return {"token": tok, "id": user.get("id"), "name": user.get("name")}


def _future_weekday(days_ahead=8):
    d = datetime.now() + timedelta(days=days_ahead)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d.strftime("%Y-%m-%d")


# Use unique 10:00 slot per test to avoid duplicate-slot 409.
# We pre-allocate distinct future weekdays for each create-test.
_SLOT_OFFSETS = iter(range(8, 90))


def _next_slot_date():
    """Return a future weekday at least 8 days out; iterate to avoid clashes."""
    off = next(_SLOT_OFFSETS)
    return _future_weekday(off)


def _payload(student_ctx, supervisor_ctx, incharge_ctx, procedure_type, missing_teeth,
             sinus_lift_type="", bone_graft_material_details="",
             procedure_date=None, procedure_time="10:00", patient_suffix=""):
    return {
        "student_name": student_ctx["name"],
        "patient_name": f"TEST_SinusLift_{patient_suffix or int(time.time()*1000)%100000}",
        "registration_number": f"TEST-SL-{int(time.time()*1000)%1000000}",
        "supervisor_id": supervisor_ctx["id"],
        "supervisor_name": supervisor_ctx["name"],
        "implant_incharge_id": incharge_ctx["id"],
        "implant_incharge_name": incharge_ctx["name"],
        "implant_site": "Upper Right 16",
        "receipt_number": f"TEST-RCP-{int(time.time()*1000)%1000000}",
        "amount_paid": 5000.0,
        "procedure_date": procedure_date or _next_slot_date(),
        "procedure_time": procedure_time,
        "implant_procedure_type": procedure_type,
        "missing_teeth": missing_teeth,
        "sinus_lift_type": sinus_lift_type,
        "bone_graft_material_details": bone_graft_material_details,
        "loading_type": ["Delayed Loading"],
    }


def _cleanup(proc_id, incharge_ctx):
    if not proc_id:
        return
    try:
        requests.delete(
            f"{BASE_URL}/api/procedures/{proc_id}",
            headers={"Authorization": f"Bearer {incharge_ctx['token']}"},
            timeout=15,
        )
    except Exception:
        pass


# -------------------- 1. case-form-options --------------------

class TestCaseFormOptions:
    def test_procedure_types_contains_sinus_lift_in_right_place(self, student_ctx):
        r = requests.get(
            f"{BASE_URL}/api/case-form-options",
            headers={"Authorization": f"Bearer {student_ctx['token']}"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        types = r.json().get("procedure_types", [])
        assert "Sinus Lift" in types, f"'Sinus Lift' missing in procedure_types: {types}"
        # iter-329: Sinus Lift moved between Immediate Implant and Partial Extraction Therapy
        expected = [
            "Single Conventional Implant",
            "Multiple Conventional Implants",
            "Immediate Implant",
            "Sinus Lift",
            "Partial Extraction Therapy",
            "Implant Placement with Guided Bone Regeneration",
            "Guided Surgery",
            "All on 4",
            "All on 6",
            "All on X",
        ]
        assert types == expected, f"procedure_types order mismatch.\nGot:      {types}\nExpected: {expected}"


# -------------------- 2. Validation gates --------------------

class TestSinusLiftValidation:
    def test_mandibular_tooth_36_blocked(self, student_ctx, supervisor_ctx, incharge_ctx):
        body = _payload(student_ctx, supervisor_ctx, incharge_ctx,
                        "Sinus Lift", ["36"],
                        sinus_lift_type="Direct Sinus Lift",
                        bone_graft_material_details="Bio-Oss")
        r = requests.post(f"{BASE_URL}/api/procedures", json=body,
                          headers={"Authorization": f"Bearer {student_ctx['token']}"}, timeout=30)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        detail = (r.json().get("detail") or "")
        assert "Sinus Lift procedure selected, choose appropriate tooth/teeth" in detail, detail
        assert "36" in detail, f"'36' not listed in detail: {detail}"

    def test_maxillary_anterior_tooth_11_blocked(self, student_ctx, supervisor_ctx, incharge_ctx):
        body = _payload(student_ctx, supervisor_ctx, incharge_ctx,
                        "Sinus Lift", ["11"],
                        sinus_lift_type="Direct Sinus Lift",
                        bone_graft_material_details="Bio-Oss")
        r = requests.post(f"{BASE_URL}/api/procedures", json=body,
                          headers={"Authorization": f"Bearer {student_ctx['token']}"}, timeout=30)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        detail = (r.json().get("detail") or "")
        assert "Sinus Lift procedure selected, choose appropriate tooth/teeth" in detail, detail
        assert "11" in detail, f"'11' not listed in detail: {detail}"

    def test_missing_sinus_lift_type_returns_400(self, student_ctx, supervisor_ctx, incharge_ctx):
        body = _payload(student_ctx, supervisor_ctx, incharge_ctx,
                        "Sinus Lift", ["16"],
                        sinus_lift_type="",
                        bone_graft_material_details="Bio-Oss")
        r = requests.post(f"{BASE_URL}/api/procedures", json=body,
                          headers={"Authorization": f"Bearer {student_ctx['token']}"}, timeout=30)
        assert r.status_code == 400, r.text
        detail = (r.json().get("detail") or "")
        assert "Type of Sinus Lift" in detail, detail

    def test_missing_bone_graft_material_details_returns_400(self, student_ctx, supervisor_ctx, incharge_ctx):
        body = _payload(student_ctx, supervisor_ctx, incharge_ctx,
                        "Sinus Lift", ["16"],
                        sinus_lift_type="Direct Sinus Lift",
                        bone_graft_material_details="")
        r = requests.post(f"{BASE_URL}/api/procedures", json=body,
                          headers={"Authorization": f"Bearer {student_ctx['token']}"}, timeout=30)
        assert r.status_code == 400, r.text
        detail = (r.json().get("detail") or "")
        assert "Bone Graft Material" in detail, detail


# -------------------- 3. Happy path --------------------

@pytest.mark.parametrize("slt", ["Direct Sinus Lift", "Indirect Sinus Lift"])
def test_create_sinus_lift_success_both_types(student_ctx, supervisor_ctx, incharge_ctx, slt):
    bgm = "Bio-Oss xenograft + collagen membrane"
    body = _payload(student_ctx, supervisor_ctx, incharge_ctx,
                    "Sinus Lift", ["16"],
                    sinus_lift_type=slt,
                    bone_graft_material_details=bgm)
    r = requests.post(f"{BASE_URL}/api/procedures", json=body,
                      headers={"Authorization": f"Bearer {student_ctx['token']}"}, timeout=30)
    assert r.status_code == 200, f"{slt}: {r.status_code} {r.text}"
    j = r.json()
    pid = j.get("id") or j.get("_id")
    try:
        assert j.get("sinus_lift_type") == slt, j
        assert j.get("bone_graft_material_details") == bgm, j

        # GET to confirm persistence
        g = requests.get(f"{BASE_URL}/api/procedures/{pid}",
                         headers={"Authorization": f"Bearer {student_ctx['token']}"}, timeout=15)
        assert g.status_code == 200
        gj = g.json()
        assert gj.get("sinus_lift_type") == slt
        assert gj.get("bone_graft_material_details") == bgm
    finally:
        _cleanup(pid, incharge_ctx)


def test_create_sinus_lift_all_8_valid_maxillary_posteriors(student_ctx, supervisor_ctx, incharge_ctx):
    teeth = ["14", "15", "16", "17", "24", "25", "26", "27"]
    body = _payload(student_ctx, supervisor_ctx, incharge_ctx,
                    "Sinus Lift", teeth,
                    sinus_lift_type="Direct Sinus Lift",
                    bone_graft_material_details="Allograft DBBM 0.5g")
    r = requests.post(f"{BASE_URL}/api/procedures", json=body,
                      headers={"Authorization": f"Bearer {student_ctx['token']}"}, timeout=30)
    assert r.status_code == 200, f"All 8 teeth path: {r.status_code} {r.text}"
    pid = r.json().get("id") or r.json().get("_id")
    _cleanup(pid, incharge_ctx)


# -------------------- 4. Non-Sinus-Lift unaffected --------------------

def test_non_sinus_lift_ignores_sinus_lift_type(student_ctx, supervisor_ctx, incharge_ctx):
    """A Single-Conventional case with stray sinus_lift_type should NOT trigger gates."""
    body = _payload(student_ctx, supervisor_ctx, incharge_ctx,
                    "Single Conventional Implant", ["16"],
                    sinus_lift_type="Direct Sinus Lift",
                    bone_graft_material_details="")
    r = requests.post(f"{BASE_URL}/api/procedures", json=body,
                      headers={"Authorization": f"Bearer {student_ctx['token']}"}, timeout=30)
    assert r.status_code == 200, f"Non-sinus case should succeed: {r.status_code} {r.text}"
    pid = r.json().get("id") or r.json().get("_id")
    _cleanup(pid, incharge_ctx)


# -------------------- 5. PDF case-report --------------------

class TestSinusLiftCaseReportPDF:
    @pytest.fixture(scope="class")
    def created_proc_id(self, student_ctx, supervisor_ctx, incharge_ctx):
        body = _payload(student_ctx, supervisor_ctx, incharge_ctx,
                        "Sinus Lift", ["16"],
                        sinus_lift_type="Direct Sinus Lift",
                        bone_graft_material_details="Bio-Oss xenograft + collagen membrane")
        r = requests.post(f"{BASE_URL}/api/procedures", json=body,
                          headers={"Authorization": f"Bearer {student_ctx['token']}"}, timeout=30)
        assert r.status_code == 200, r.text
        pid = r.json().get("id") or r.json().get("_id")
        yield pid
        _cleanup(pid, incharge_ctx)

    def test_pdf_contains_sinus_lift_fields(self, created_proc_id, incharge_ctx):
        r = requests.post(
            f"{BASE_URL}/api/procedures/{created_proc_id}/case-report",
            headers={"Authorization": f"Bearer {incharge_ctx['token']}"},
            timeout=60,
        )
        assert r.status_code == 200, f"Case report PDF: {r.status_code} {r.text[:300]}"
        content = r.content
        assert content[:5] == b"%PDF-", "Response is not a PDF"

        # Extract text via pypdf to avoid relying on raw substring search.
        try:
            from pypdf import PdfReader
        except ImportError:
            try:
                from PyPDF2 import PdfReader
            except ImportError:
                pytest.skip("No PDF library installed to extract text")
        reader = PdfReader(io.BytesIO(content))
        text = "\n".join((p.extract_text() or "") for p in reader.pages)

        # Sinus Lift specific rows
        assert "Type of Sinus Lift" in text, f"'Type of Sinus Lift' missing.\n--- PDF TEXT ---\n{text[:2000]}"
        assert "Direct Sinus Lift" in text, "Sinus lift value missing"
        assert "Bone Graft Material Details" in text, "Bone Graft Material Details label missing"
        assert "Bio-Oss" in text, "Bone graft material text missing"

        # Existing baseline rows should still appear
        assert "Procedure Type" in text and "Sinus Lift" in text
        assert "Number of Implants" in text, "Number of Implants row missing"
