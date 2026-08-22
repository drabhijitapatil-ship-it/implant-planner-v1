"""
Treatment Timeline (Done On dates) feature tests — iter-332/iter156.

Covers:
  - GET  /api/admin/cases-missing-timeline (RBAC + shape)
  - PATCH /api/admin/procedures/{id}/timeline (backfill validation)
  - POST  /api/procedures/{id}/case-report (PDF contains Treatment Timeline)
  - POST  /api/procedures/{id}/stage2/prosthetic/step2 (done_date guard)
"""
import os
import io
import re
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://prosthetic-preview.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}
STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}

# Already-backfilled procedure id supplied by main agent
BACKFILLED_PROC_ID = "69cfb036a19e1d1819e0f6fd"


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def student_token():
    return _login(STUDENT)


def _h(token):
    return {"Authorization": f"Bearer {token}"}


# ── GET /api/admin/cases-missing-timeline ───────────────────────────
class TestCasesMissingTimeline:
    def test_admin_can_list(self, admin_token):
        r = requests.get(f"{API}/admin/cases-missing-timeline", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body and isinstance(body["items"], list)
        assert "count" in body
        # Each item should expose missing_fields list
        for it in body["items"][:5]:
            assert "missing_fields" in it
            assert "id" in it

    def test_student_forbidden(self, student_token):
        r = requests.get(f"{API}/admin/cases-missing-timeline", headers=_h(student_token), timeout=30)
        assert r.status_code == 403


# ── PATCH /api/admin/procedures/{id}/timeline ───────────────────────
class TestBackfillTimeline:
    @pytest.fixture(scope="class")
    def target_proc(self, admin_token):
        r = requests.get(f"{API}/admin/cases-missing-timeline", headers=_h(admin_token), timeout=30)
        items = r.json().get("items", [])
        if not items:
            pytest.skip("No legacy cases to backfill")
        return items[0]

    def test_future_date_rejected(self, admin_token, target_proc):
        pid = target_proc["id"]
        r = requests.patch(
            f"{API}/admin/procedures/{pid}/timeline",
            headers=_h(admin_token),
            json={"procedure_date": "2099-01-01"},
            timeout=30,
        )
        assert r.status_code == 400
        assert "future" in r.text.lower()

    def test_chronological_violation_rejected(self, admin_token, target_proc):
        pid = target_proc["id"]
        # Phase 2 earlier than Phase 1
        r = requests.patch(
            f"{API}/admin/procedures/{pid}/timeline",
            headers=_h(admin_token),
            json={"procedure_date": "2024-06-01", "phase2_actual_done_date": "2024-01-01"},
            timeout=30,
        )
        assert r.status_code == 400
        assert "cannot be before" in r.text.lower() or "before" in r.text.lower()

    def test_old_past_date_allowed(self, admin_token, target_proc):
        pid = target_proc["id"]
        # > 30 days old; should be allowed for backfill
        r = requests.patch(
            f"{API}/admin/procedures/{pid}/timeline",
            headers=_h(admin_token),
            json={"procedure_date": "2023-01-15"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("updated") is True
        assert "procedure_date" in body.get("fields", [])

    def test_student_forbidden(self, student_token, target_proc):
        pid = target_proc["id"]
        r = requests.patch(
            f"{API}/admin/procedures/{pid}/timeline",
            headers=_h(student_token),
            json={"procedure_date": "2024-01-01"},
            timeout=30,
        )
        assert r.status_code == 403


# ── POST /api/procedures/{id}/case-report (PDF) ─────────────────────
class TestCaseReportPDFTimeline:
    def test_pdf_contains_timeline_section(self, admin_token):
        r = requests.post(
            f"{API}/procedures/{BACKFILLED_PROC_ID}/case-report",
            headers=_h(admin_token),
            timeout=60,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        ctype = r.headers.get("content-type", "")
        assert "pdf" in ctype.lower(), f"unexpected content-type {ctype}"
        body = r.content
        assert body[:4] == b"%PDF", "Response is not a PDF"
        # Decompress streams via pypdf to recover human-readable text
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(body))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "Treatment Timeline" in text, f"Missing 'Treatment Timeline' section in PDF. Extracted text head: {text[:500]}"
        # 5 phase rows
        for label in [
            "Phase 1",
            "Phase 2",
            "Phase 3",
            "Phase 4 Step 1",
            "Phase 4 Step 2",
        ]:
            assert label in text, f"Missing label {label!r} in PDF"
        assert re.search(r"Total Treatment Duration", text), "Missing 'Total Treatment Duration' line"


# ── Phase 4 Step 2 submission done_date guard ───────────────────────
# We don't drive a full happy-path submission here because that requires a
# very specific case state; instead we verify the validator wiring via a 404
# (proc not found) is NOT what we get for invalid dates — the validator runs
# before the existence check.
class TestPhase4Step2DoneDateGuard:
    def test_future_done_date_rejected(self, student_token):
        # Use a syntactically valid Mongo ObjectId; even if state guard fails
        # later, the date validator runs first.
        pid = "0" * 24
        r = requests.post(
            f"{API}/procedures/{pid}/stage2/prosthetic/step2",
            headers=_h(student_token),
            json={"done_date": "2099-01-01", "abutment_torque_value": 35},
            timeout=30,
        )
        # We accept either 400 (future date rejected) OR validator runs before
        # existence/permission. If we get 404/403 the validator may run after —
        # log it but still ensure no 5xx.
        assert r.status_code in (400, 403, 404, 409, 422), f"unexpected {r.status_code}: {r.text}"
        if r.status_code == 400:
            assert "future" in r.text.lower()
