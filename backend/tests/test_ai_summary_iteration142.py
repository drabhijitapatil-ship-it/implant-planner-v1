"""Tests for AI Summary edit endpoint, edit_log audit, role gates, and PDF export.

Covers iteration 142 changes:
- PATCH /api/procedures/{id}/ai-summary
- 400 for invalid summary_type
- 200 + idempotent {unchanged: true} when content matches
- Non-owner edit -> edit_log entry with field/old_value/new_value/edited_by/role
- Owner edit -> NO edit_log entry
- Nurse blocked (403)
- PDF Case Report includes both AI sections when populated
"""
import os
import io
import re
import zlib
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://dental-workflow-18.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
PROC_ID = "69cfde8b356c7405230a9dcc"  # known existing case provided by main agent


def _login(identifier: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"identifier": identifier, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login failed for {identifier}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login("Abhijit.patil", "Admin@123")


@pytest.fixture(scope="module")
def student_token():
    return _login("Gaurav.pandey", "Student@123")


@pytest.fixture(scope="module")
def supervisor_token():
    return _login("Paresh.gandhi", "Supervisor@123")


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


def _get_proc(tok):
    r = requests.get(f"{API}/procedures/{PROC_ID}", headers=_h(tok), timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


# === PATCH endpoint validation ===
class TestAiSummaryEndpoint:
    def test_invalid_summary_type_returns_400(self, admin_token):
        r = requests.patch(
            f"{API}/procedures/{PROC_ID}/ai-summary",
            headers=_h(admin_token),
            json={"summary_type": "bogus", "content": "x"},
            timeout=20,
        )
        assert r.status_code == 400, r.text

    def test_non_string_content_returns_400(self, admin_token):
        r = requests.patch(
            f"{API}/procedures/{PROC_ID}/ai-summary",
            headers=_h(admin_token),
            json={"summary_type": "case_summary", "content": 123},
            timeout=20,
        )
        assert r.status_code == 400, r.text

    def test_unknown_procedure_returns_404(self, admin_token):
        r = requests.patch(
            f"{API}/procedures/000000000000000000000000/ai-summary",
            headers=_h(admin_token),
            json={"summary_type": "case_summary", "content": "x"},
            timeout=20,
        )
        assert r.status_code == 404, r.text

    def test_valid_edit_returns_200_and_persists(self, admin_token):
        new_text = "TEST_AI_CASE_SUMMARY: iteration142 edit at unique marker XK1"
        r = requests.patch(
            f"{API}/procedures/{PROC_ID}/ai-summary",
            headers=_h(admin_token),
            json={"summary_type": "case_summary", "content": new_text},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("ai_case_summary") == new_text

        # Verify persistence via GET
        proc = _get_proc(admin_token)
        assert proc.get("ai_case_summary") == new_text

    def test_idempotent_returns_unchanged(self, admin_token):
        text = "TEST_AI_CASE_SUMMARY: idempotent marker XK2"
        # Set first
        requests.patch(
            f"{API}/procedures/{PROC_ID}/ai-summary",
            headers=_h(admin_token),
            json={"summary_type": "case_summary", "content": text},
            timeout=20,
        )
        # Same content again
        r = requests.patch(
            f"{API}/procedures/{PROC_ID}/ai-summary",
            headers=_h(admin_token),
            json={"summary_type": "case_summary", "content": text},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("unchanged") is True


# === Edit log behavior: owner vs non-owner ===
class TestEditLogBehavior:
    def test_non_owner_edit_appends_edit_log(self, admin_token):
        # Admin (Implant In-Charge) is NOT owner of student's case 69cfde8b356c7405230a9dcc
        proc_before = _get_proc(admin_token)
        log_before = proc_before.get("edit_log") or []
        len_before = len(log_before)

        new_text = "TEST_AI_SURGICAL_NOTES: non-owner edit marker XK3"
        r = requests.patch(
            f"{API}/procedures/{PROC_ID}/ai-summary",
            headers=_h(admin_token),
            json={"summary_type": "surgical_notes", "content": new_text},
            timeout=20,
        )
        assert r.status_code == 200, r.text

        proc_after = _get_proc(admin_token)
        log_after = proc_after.get("edit_log") or []
        assert len(log_after) > len_before, "edit_log should grow when non-owner edits"

        last = log_after[-1]
        assert last.get("field") == "ai_surgical_notes"
        assert last.get("new_value") == new_text
        assert last.get("edited_by_role") == "implant_incharge"
        assert "Abhijit" in (last.get("edited_by") or "")
        assert last.get("edited_at")

        # last_edited_by/at also updated
        assert proc_after.get("last_edited_by")
        assert proc_after.get("last_edited_at")

    def test_owner_edit_does_not_append_edit_log(self, student_token, admin_token):
        # Verify case is owned by Gaurav
        proc = _get_proc(admin_token)
        owner_role = proc.get("created_by_role") or proc.get("student_role")
        owner_name = proc.get("created_by") or proc.get("student_name") or ""
        if "Gaurav" not in owner_name and "student" != owner_role:
            pytest.skip(f"Test procedure not owned by student Gaurav (owner={owner_name}, role={owner_role})")

        log_before = (proc.get("edit_log") or [])
        len_before = len(log_before)

        new_text = "TEST_AI_CASE_SUMMARY: owner self-edit marker XK4"
        r = requests.patch(
            f"{API}/procedures/{PROC_ID}/ai-summary",
            headers=_h(student_token),
            json={"summary_type": "case_summary", "content": new_text},
            timeout=20,
        )
        assert r.status_code == 200, r.text

        proc_after = _get_proc(admin_token)
        log_after = proc_after.get("edit_log") or []
        # No new ai_case_summary entry since the student is the owner
        new_ai_entries = [e for e in log_after[len_before:] if e.get("field") in ("ai_case_summary", "ai_surgical_notes")]
        assert new_ai_entries == [], f"Owner edit should NOT append ai_* entries; found {new_ai_entries}"


# === Role gate: nurse blocked ===
class TestNurseBlocked:
    def test_nurse_gets_403(self):
        # Try a few common nurse credential patterns; skip if none exist.
        candidates = [
            ("Nurse.test", "Nurse@123"),
            ("nurse", "Nurse@123"),
        ]
        token = None
        for u, p in candidates:
            try:
                r = requests.post(f"{API}/auth/login", json={"identifier": u, "password": p}, timeout=10)
                if r.status_code == 200:
                    token = r.json()["access_token"]
                    break
            except Exception:
                pass
        if not token:
            pytest.skip("No nurse account available for test")

        r = requests.patch(
            f"{API}/procedures/{PROC_ID}/ai-summary",
            headers=_h(token),
            json={"summary_type": "case_summary", "content": "x"},
            timeout=20,
        )
        assert r.status_code == 403, f"Expected 403 for nurse, got {r.status_code}: {r.text}"


# === PDF export contains AI summary sections ===
class TestPdfExport:
    def test_pdf_contains_ai_sections(self, admin_token):
        # Ensure both fields populated
        for st, txt in [
            ("case_summary", "TEST_AI_CASE_SUMMARY_PDF: clinical XK5"),
            ("surgical_notes", "TEST_AI_SURGICAL_NOTES_PDF: surgical XK6"),
        ]:
            r = requests.patch(
                f"{API}/procedures/{PROC_ID}/ai-summary",
                headers=_h(admin_token),
                json={"summary_type": st, "content": txt},
                timeout=20,
            )
            assert r.status_code == 200, r.text

        r = requests.post(f"{API}/procedures/{PROC_ID}/case-report", headers=_h(admin_token), timeout=60)
        assert r.status_code == 200, r.text
        pdf_bytes = r.content
        assert pdf_bytes[:4] == b"%PDF", "Response is not a PDF"

        # Inflate every FlateDecode stream and search across the decompressed text
        decoded = b""
        for m in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", pdf_bytes, flags=re.DOTALL):
            blob = m.group(1)
            try:
                decoded += zlib.decompress(blob) + b"\n"
            except Exception:
                decoded += blob + b"\n"

        text_blob = decoded.decode("latin-1", errors="ignore")
        assert "AI Clinical Summary" in text_blob, "Missing 'AI Clinical Summary' heading in PDF"
        assert "AI Surgical Summary" in text_blob, "Missing 'AI Surgical Summary' heading in PDF"


# === Cleanup: blank both fields after the run ===
@pytest.fixture(scope="module", autouse=True)
def _cleanup(admin_token):
    yield
    for st in ("case_summary", "surgical_notes"):
        try:
            requests.patch(
                f"{API}/procedures/{PROC_ID}/ai-summary",
                headers=_h(admin_token),
                json={"summary_type": st, "content": ""},
                timeout=20,
            )
        except Exception:
            pass
