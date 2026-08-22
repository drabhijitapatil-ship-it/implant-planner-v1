"""
iter-329 Sinus Lift Pre-Op Briefing PDF regression tests.

Covers POST /api/procedures/{id}/preop-briefing:
 * 200 + application/pdf + attachment Content-Disposition with PreOp_SinusLift_ prefix
 * Direct Sinus Lift variant PDF text content
 * Indirect Sinus Lift variant PDF text content
 * 400 on non-Sinus-Lift case
 * 404 on unknown procedure id
 * 401/403 without Authorization
 * Audit log entry pdf_export / preop_briefing
"""
import os
import io
import time
import pytest
import requests
from datetime import datetime, timedelta

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://prosthetic-preview.preview.emergentagent.com").rstrip("/")

STUDENT_CREDS = {"identifier": "Gaurav.pandey", "password": "Student@123"}
INCHARGE_CREDS = {"identifier": "Abhijit.patil", "password": "Admin@123"}
SUPERVISOR_CREDS = {"identifier": "Paresh.gandhi", "password": "Supervisor@123"}


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
    tok, user = _login(SUPERVISOR_CREDS)
    return {"token": tok, "id": user.get("id"), "name": user.get("name")}


def _future_weekday(days_ahead=8):
    d = datetime.now() + timedelta(days=days_ahead)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d.strftime("%Y-%m-%d")


_SLOT_OFFSETS = iter(range(8, 200))


def _next_slot_date():
    off = next(_SLOT_OFFSETS)
    return _future_weekday(off)


def _payload(student_ctx, supervisor_ctx, incharge_ctx, procedure_type, missing_teeth,
             sinus_lift_type="", bone_graft_material_details="",
             procedure_time=None, patient_suffix=""):
    # vary time too in case multiple slots overlap on a single date
    t = procedure_time or f"{10 + (int(time.time()*1000) % 6):02d}:00"
    return {
        "student_name": student_ctx["name"],
        "patient_name": f"TEST_PreOp_{patient_suffix or int(time.time()*1000)%100000}",
        "registration_number": f"TEST-PO-{int(time.time()*1000)%1000000}",
        "supervisor_id": supervisor_ctx["id"],
        "supervisor_name": supervisor_ctx["name"],
        "implant_incharge_id": incharge_ctx["id"],
        "implant_incharge_name": incharge_ctx["name"],
        "implant_site": "Upper Right 16",
        "receipt_number": f"TEST-RCP-{int(time.time()*1000)%1000000}",
        "amount_paid": 5000.0,
        "procedure_date": _next_slot_date(),
        "procedure_time": t,
        "implant_procedure_type": procedure_type,
        "missing_teeth": missing_teeth,
        "sinus_lift_type": sinus_lift_type,
        "bone_graft_material_details": bone_graft_material_details,
        "loading_type": ["Delayed Loading"],
        "age": "47",
        "sex": "Male",
        "num_implants": "1",
    }


def _create(student_ctx, body):
    r = requests.post(
        f"{BASE_URL}/api/procedures",
        json=body,
        headers={"Authorization": f"Bearer {student_ctx['token']}"},
        timeout=30,
    )
    assert r.status_code == 200, f"Create failed: {r.status_code} {r.text}"
    j = r.json()
    return j.get("id") or j.get("_id")


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


def _pdf_text(content: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        from PyPDF2 import PdfReader  # type: ignore
    reader = PdfReader(io.BytesIO(content))
    return "\n".join((p.extract_text() or "") for p in reader.pages)


# ------------------------------------------------------------------
# 1. Happy path — Direct Sinus Lift
# ------------------------------------------------------------------
class TestPreOpBriefingDirect:
    @pytest.fixture(scope="class")
    def direct_proc_id(self, student_ctx, supervisor_ctx, incharge_ctx):
        body = _payload(
            student_ctx, supervisor_ctx, incharge_ctx,
            "Sinus Lift", ["16"],
            sinus_lift_type="Direct Sinus Lift",
            bone_graft_material_details="Bio-Oss xenograft + collagen membrane",
            patient_suffix="DIRECT",
        )
        pid = _create(student_ctx, body)
        yield pid
        _cleanup(pid, incharge_ctx)

    def test_direct_pdf_returns_200_and_pdf_content_type(self, direct_proc_id, incharge_ctx):
        r = requests.post(
            f"{BASE_URL}/api/procedures/{direct_proc_id}/preop-briefing",
            headers={"Authorization": f"Bearer {incharge_ctx['token']}"},
            timeout=60,
        )
        assert r.status_code == 200, r.text[:400]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        cd = r.headers.get("content-disposition", "")
        assert cd.startswith("attachment; filename=\"PreOp_SinusLift_"), cd
        assert len(r.content) > 3 * 1024, f"PDF body too small: {len(r.content)} bytes"
        assert r.content[:5] == b"%PDF-"

    def test_direct_pdf_contains_required_strings(self, direct_proc_id, incharge_ctx):
        # First fetch patient name so we can assert it appears
        g = requests.get(
            f"{BASE_URL}/api/procedures/{direct_proc_id}",
            headers={"Authorization": f"Bearer {incharge_ctx['token']}"},
            timeout=15,
        )
        assert g.status_code == 200
        proc = g.json()
        patient_name = proc.get("patient_name")
        age = str(proc.get("age"))
        sex = proc.get("sex")
        bgm = proc.get("bone_graft_material_details")
        supervisor_name = proc.get("supervisor_name")
        incharge_name = proc.get("implant_incharge_name")

        r = requests.post(
            f"{BASE_URL}/api/procedures/{direct_proc_id}/preop-briefing",
            headers={"Authorization": f"Bearer {incharge_ctx['token']}"},
            timeout=60,
        )
        assert r.status_code == 200, r.text[:400]
        text = _pdf_text(r.content)

        required = [
            "Pre-Operative Briefing",
            patient_name,
            age,
            sex,
            "Direct Sinus Lift",
            bgm.split(" ")[0],  # at least the first token of bone graft text
            supervisor_name,
            incharge_name,
            "upper back teeth",
            "60 to 90",
            "Do not blow your nose",
            "Healing timeline",
            "urgently",
            "Cost & next steps",
        ]
        for needle in required:
            assert needle in text, f"Missing in PDF: {needle!r}\n--- TEXT ---\n{text[:3000]}"

        # Direct-specific phrasing present
        assert "tiny window on the side of your cheekbone" in text
        assert "less than about 5 mm" in text
        # And Indirect-only phrasing absent
        assert "gentler approach" not in text

        # No signature block anywhere
        lower = text.lower()
        assert "signature" not in lower, "PDF must NOT contain a signature block"
        assert "patient signature" not in lower


# ------------------------------------------------------------------
# 2. Indirect Sinus Lift variant
# ------------------------------------------------------------------
class TestPreOpBriefingIndirect:
    @pytest.fixture(scope="class")
    def indirect_proc_id(self, student_ctx, supervisor_ctx, incharge_ctx):
        body = _payload(
            student_ctx, supervisor_ctx, incharge_ctx,
            "Sinus Lift", ["16"],
            sinus_lift_type="Indirect Sinus Lift",
            bone_graft_material_details="Allograft DBBM 0.5g",
            patient_suffix="INDIRECT",
        )
        pid = _create(student_ctx, body)
        yield pid
        _cleanup(pid, incharge_ctx)

    def test_indirect_pdf_contains_indirect_text_only(self, indirect_proc_id, incharge_ctx):
        r = requests.post(
            f"{BASE_URL}/api/procedures/{indirect_proc_id}/preop-briefing",
            headers={"Authorization": f"Bearer {incharge_ctx['token']}"},
            timeout=60,
        )
        assert r.status_code == 200, r.text[:400]
        text = _pdf_text(r.content)
        assert "Indirect Sinus Lift" in text
        # Indirect-specific
        assert ("about 5 - 8 mm" in text) or ("gentler approach" in text), \
            f"Indirect-specific text missing:\n{text[:2000]}"
        # Direct-specific phrasing must NOT be present
        assert "tiny window on the side of your cheekbone" not in text
        assert "less than about 5 mm" not in text


# ------------------------------------------------------------------
# 3. Negative paths
# ------------------------------------------------------------------
class TestPreOpBriefingNegatives:
    def test_non_sinus_lift_returns_400(self, student_ctx, supervisor_ctx, incharge_ctx):
        body = _payload(
            student_ctx, supervisor_ctx, incharge_ctx,
            "Single Conventional Implant", ["16"],
            patient_suffix="NONSINUS",
        )
        pid = _create(student_ctx, body)
        try:
            r = requests.post(
                f"{BASE_URL}/api/procedures/{pid}/preop-briefing",
                headers={"Authorization": f"Bearer {incharge_ctx['token']}"},
                timeout=30,
            )
            assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
            detail = (r.json().get("detail") or "")
            assert detail == "Pre-Op Briefing is only available for Sinus Lift procedures.", detail
        finally:
            _cleanup(pid, incharge_ctx)

    def test_unknown_procedure_returns_404(self, incharge_ctx):
        # 24-char hex string that isn't a real procedure
        fake_id = "0" * 24
        r = requests.post(
            f"{BASE_URL}/api/procedures/{fake_id}/preop-briefing",
            headers={"Authorization": f"Bearer {incharge_ctx['token']}"},
            timeout=30,
        )
        assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text[:300]}"

    def test_no_auth_returns_401_or_403(self, student_ctx, supervisor_ctx, incharge_ctx):
        body = _payload(
            student_ctx, supervisor_ctx, incharge_ctx,
            "Sinus Lift", ["16"],
            sinus_lift_type="Direct Sinus Lift",
            bone_graft_material_details="Bio-Oss",
            patient_suffix="NOAUTH",
        )
        pid = _create(student_ctx, body)
        try:
            r = requests.post(
                f"{BASE_URL}/api/procedures/{pid}/preop-briefing",
                timeout=30,
            )
            assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}: {r.text[:200]}"
        finally:
            _cleanup(pid, incharge_ctx)


# ------------------------------------------------------------------
# 4. Audit log entry
# ------------------------------------------------------------------
class TestPreOpBriefingAudit:
    def test_audit_log_entry_recorded(self, student_ctx, supervisor_ctx, incharge_ctx):
        body = _payload(
            student_ctx, supervisor_ctx, incharge_ctx,
            "Sinus Lift", ["16"],
            sinus_lift_type="Direct Sinus Lift",
            bone_graft_material_details="Bio-Oss xenograft",
            patient_suffix="AUDIT",
        )
        pid = _create(student_ctx, body)
        try:
            r = requests.post(
                f"{BASE_URL}/api/procedures/{pid}/preop-briefing",
                headers={"Authorization": f"Bearer {incharge_ctx['token']}"},
                timeout=60,
            )
            assert r.status_code == 200, r.text[:400]

            # Fetch access logs
            logs = requests.get(
                f"{BASE_URL}/api/admin/access-logs",
                headers={"Authorization": f"Bearer {incharge_ctx['token']}"},
                timeout=30,
            )
            assert logs.status_code == 200, f"access-logs: {logs.status_code} {logs.text[:300]}"
            data = logs.json()
            entries = data if isinstance(data, list) else (data.get("logs") or data.get("items") or [])
            assert entries, "No audit log entries returned"

            match = None
            for e in entries[:200]:
                if (
                    e.get("action") == "pdf_export"
                    and e.get("resource_type") == "preop_briefing"
                    and (e.get("resource_id") == pid or e.get("procedure_id") == pid)
                ):
                    match = e
                    break
            assert match is not None, (
                f"No matching audit log entry for pdf_export/preop_briefing on procedure {pid}. "
                f"First 3 entries: {entries[:3]}"
            )
        finally:
            _cleanup(pid, incharge_ctx)
