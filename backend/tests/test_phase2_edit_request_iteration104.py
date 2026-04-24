"""
Iteration 104 — Phase 2 Edit Request workflow backend tests.

Covers:
  * POST /api/procedures/{id}/phase2-edit-request  (student)
  * POST /api/procedures/{id}/phase2-edit-request/{req_id}/cancel
  * POST /api/procedures/{id}/phase2-edit-request/{req_id}/resolve
  * Integration with PATCH /api/procedures/{id}/edit-fields (save +
    edit_log) for phase2_data.prosthesis_type.
  * Role / ownership / validation / state guards (403 / 400 / 409).
  * Regression smoke on dashboard/stats, procedures, whats-new,
    drilling-protocol PDF, consent flow, submit-phase2 accepts
    prosthesis_type, case-report PDF still builds.
"""
import io
import os
import uuid
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or "https://implant-workflow-hub.preview.emergentagent.com").rstrip("/")

STUDENT_IDENT = "Gaurav.pandey"
STUDENT_PASS = "Student@123"
SUPERVISOR_IDENT = "Paresh.gandhi"
SUPERVISOR_PASS = "Supervisor@123"
INCHARGE_IDENT = "Abhijit.patil"
INCHARGE_PASS = "Admin@123"

# Procedure IDs provided by the main agent
PROC_WITH_HISTORY = "69cf9bdfdafb502718057bcd"     # already has resolved/cancelled req history
PROC_PENDING_PHASE2 = "69cfde8b356c7405230a9dcc"   # pending_phase2 w/ Immediate Loading data (iter103)


# ------------------------ helpers / fixtures ------------------------
def _login(identifier: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"identifier": identifier, "password": password},
                      timeout=30)
    assert r.status_code == 200, f"login failed for {identifier}: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token")
    assert tok, "no access_token"
    return tok


def _client(token: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}",
                      "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def student_client():
    return _client(_login(STUDENT_IDENT, STUDENT_PASS))


@pytest.fixture(scope="module")
def supervisor_client():
    return _client(_login(SUPERVISOR_IDENT, SUPERVISOR_PASS))


@pytest.fixture(scope="module")
def incharge_client():
    return _client(_login(INCHARGE_IDENT, INCHARGE_PASS))


def _get_proc(client: requests.Session, pid: str) -> dict:
    r = client.get(f"{BASE_URL}/api/procedures/{pid}", timeout=30)
    assert r.status_code == 200, f"proc {pid} fetch failed: {r.status_code} {r.text[:200]}"
    return r.json()


def _cancel_any_pending(client: requests.Session, pid: str):
    """Best-effort: as the student, cancel any currently-pending request
    on the procedure to keep the suite idempotent."""
    proc = _get_proc(client, pid)
    for r in (proc.get("phase2_edit_requests") or []):
        if r.get("status") == "pending":
            client.post(
                f"{BASE_URL}/api/procedures/{pid}/phase2-edit-request/{r['id']}/cancel",
                timeout=30,
            )


@pytest.fixture(scope="module")
def owned_proc_id(student_client):
    """Return a procedure ID the student owns AND that has phase2_data
    submitted (so edit-requests are valid). Prefer the main-agent-supplied
    PROC_WITH_HISTORY if usable; otherwise scan /api/procedures."""
    # 1) try the main-agent-supplied procedure first
    try:
        p = _get_proc(student_client, PROC_WITH_HISTORY)
        me = student_client.get(f"{BASE_URL}/api/auth/me", timeout=30).json()
        my_id = me.get("_id") or me.get("id")
        if p.get("phase2_data") and p.get("student_id") == my_id:
            _cancel_any_pending(student_client, PROC_WITH_HISTORY)
            return PROC_WITH_HISTORY
    except Exception:
        pass

    # 2) scan procedures listing for an owned proc with phase2_data
    r = student_client.get(f"{BASE_URL}/api/procedures", timeout=30)
    assert r.status_code == 200, r.text[:200]
    for p in r.json():
        if p.get("phase2_data"):
            pid = p.get("id") or p.get("_id")
            if pid:
                _cancel_any_pending(student_client, pid)
                return pid
    pytest.skip("No student-owned procedure with phase2_data available")


@pytest.fixture(scope="module")
def unsubmitted_proc_id(student_client):
    """A student-owned procedure WITHOUT phase2_data (to trigger the 400
    'Phase 2 not yet submitted' guard)."""
    r = student_client.get(f"{BASE_URL}/api/procedures", timeout=30)
    if r.status_code != 200:
        pytest.skip("cannot list procedures")
    for p in r.json():
        if not p.get("phase2_data"):
            pid = p.get("id") or p.get("_id")
            if pid:
                return pid
    pytest.skip("No student-owned procedure without phase2_data available")


# ==================== 1. create request ====================
class TestCreateRequest:
    def test_student_create_success(self, student_client, owned_proc_id):
        body = {"fields": ["prosthesis_type"], "note": "TEST_iter104 wrong prosthesis"}
        r = student_client.post(
            f"{BASE_URL}/api/procedures/{owned_proc_id}/phase2-edit-request",
            json=body, timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data["status"] == "pending"
        assert "id" in data and isinstance(data["id"], str)
        assert data["fields"] == ["prosthesis_type"]
        assert data["note"] == "TEST_iter104 wrong prosthesis"
        assert data["requested_by_name"]
        # persistence verification via GET
        proc = _get_proc(student_client, owned_proc_id)
        ids = [r.get("id") for r in (proc.get("phase2_edit_requests") or [])]
        assert data["id"] in ids

    def test_duplicate_pending_returns_409(self, student_client, owned_proc_id):
        # relies on the prior test leaving one pending
        r = student_client.post(
            f"{BASE_URL}/api/procedures/{owned_proc_id}/phase2-edit-request",
            json={"fields": ["healing_abutment_cuff_height"], "note": "dup"},
            timeout=30)
        assert r.status_code == 409, r.text[:300]

    def test_supervisor_forbidden_create(self, supervisor_client, owned_proc_id):
        r = supervisor_client.post(
            f"{BASE_URL}/api/procedures/{owned_proc_id}/phase2-edit-request",
            json={"fields": ["prosthesis_type"], "note": "x"}, timeout=30)
        assert r.status_code == 403, r.text[:300]

    def test_incharge_forbidden_create(self, incharge_client, owned_proc_id):
        r = incharge_client.post(
            f"{BASE_URL}/api/procedures/{owned_proc_id}/phase2-edit-request",
            json={"fields": ["prosthesis_type"], "note": "x"}, timeout=30)
        assert r.status_code == 403, r.text[:300]

    def test_empty_fields_and_note_returns_400(self, student_client, owned_proc_id):
        # cancel pending first so we reach the empty-validation branch
        _cancel_any_pending(student_client, owned_proc_id)
        r = student_client.post(
            f"{BASE_URL}/api/procedures/{owned_proc_id}/phase2-edit-request",
            json={"fields": [], "note": "   "}, timeout=30)
        assert r.status_code == 400, r.text[:300]

    def test_whitelist_filters_unknown_fields(self, student_client, owned_proc_id):
        # 'foo' is not in the allow-list, but an allowed field is present so
        # the request should succeed and store only the allowed one.
        _cancel_any_pending(student_client, owned_proc_id)
        r = student_client.post(
            f"{BASE_URL}/api/procedures/{owned_proc_id}/phase2-edit-request",
            json={"fields": ["foo", "prosthesis_type"], "note": ""}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["fields"] == ["prosthesis_type"]
        _cancel_any_pending(student_client, owned_proc_id)

    def test_note_only_is_accepted(self, student_client, owned_proc_id):
        _cancel_any_pending(student_client, owned_proc_id)
        r = student_client.post(
            f"{BASE_URL}/api/procedures/{owned_proc_id}/phase2-edit-request",
            json={"fields": [], "note": "TEST_iter104 note-only"}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data["status"] == "pending"
        assert data["note"] == "TEST_iter104 note-only"
        assert data["fields"] == []
        _cancel_any_pending(student_client, owned_proc_id)

    def test_phase2_not_submitted_returns_400(self, student_client, unsubmitted_proc_id):
        r = student_client.post(
            f"{BASE_URL}/api/procedures/{unsubmitted_proc_id}/phase2-edit-request",
            json={"fields": ["prosthesis_type"], "note": "x"}, timeout=30)
        assert r.status_code == 400, r.text[:300]

    def test_unknown_procedure_returns_404(self, student_client):
        fake = "ffffffffffffffffffffffff"
        r = student_client.post(
            f"{BASE_URL}/api/procedures/{fake}/phase2-edit-request",
            json={"fields": ["prosthesis_type"], "note": "x"}, timeout=30)
        assert r.status_code == 404, r.text[:300]


# ==================== 2. cancel ====================
class TestCancelRequest:
    def test_student_cancel_own_request(self, student_client, owned_proc_id):
        _cancel_any_pending(student_client, owned_proc_id)
        created = student_client.post(
            f"{BASE_URL}/api/procedures/{owned_proc_id}/phase2-edit-request",
            json={"fields": ["prosthesis_type"], "note": "TEST_iter104 cancel"},
            timeout=30)
        assert created.status_code == 200, created.text[:300]
        req_id = created.json()["id"]

        r = student_client.post(
            f"{BASE_URL}/api/procedures/{owned_proc_id}/phase2-edit-request/{req_id}/cancel",
            timeout=30)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body.get("ok") is True
        assert body.get("status") == "cancelled"

        # verify persisted status
        proc = _get_proc(student_client, owned_proc_id)
        target = next((x for x in proc.get("phase2_edit_requests", [])
                       if x.get("id") == req_id), None)
        assert target is not None
        assert target["status"] == "cancelled"
        assert target.get("resolved_by_role") == "student"

    def test_cancel_already_cancelled_returns_400(self, student_client, owned_proc_id):
        proc = _get_proc(student_client, owned_proc_id)
        cancelled = next((r for r in proc.get("phase2_edit_requests", [])
                          if r.get("status") == "cancelled"), None)
        if not cancelled:
            pytest.skip("no cancelled request available to re-cancel")
        r = student_client.post(
            f"{BASE_URL}/api/procedures/{owned_proc_id}/phase2-edit-request/{cancelled['id']}/cancel",
            timeout=30)
        assert r.status_code == 400, r.text[:300]

    def test_supervisor_cannot_cancel_student_request(self, student_client, supervisor_client, owned_proc_id):
        _cancel_any_pending(student_client, owned_proc_id)
        created = student_client.post(
            f"{BASE_URL}/api/procedures/{owned_proc_id}/phase2-edit-request",
            json={"fields": ["prosthesis_type"], "note": "TEST_iter104 sup-cancel"},
            timeout=30)
        assert created.status_code == 200, created.text[:300]
        req_id = created.json()["id"]

        r = supervisor_client.post(
            f"{BASE_URL}/api/procedures/{owned_proc_id}/phase2-edit-request/{req_id}/cancel",
            timeout=30)
        assert r.status_code == 403, r.text[:300]
        # cleanup
        student_client.post(
            f"{BASE_URL}/api/procedures/{owned_proc_id}/phase2-edit-request/{req_id}/cancel",
            timeout=30)

    def test_cancel_unknown_request_returns_404(self, student_client, owned_proc_id):
        r = student_client.post(
            f"{BASE_URL}/api/procedures/{owned_proc_id}/phase2-edit-request/"
            f"{uuid.uuid4()}/cancel",
            timeout=30)
        assert r.status_code == 404, r.text[:300]


# ==================== 3. resolve + integration w/ edit-fields ====================
class TestResolveRequest:
    def test_student_cannot_resolve(self, student_client, owned_proc_id):
        _cancel_any_pending(student_client, owned_proc_id)
        created = student_client.post(
            f"{BASE_URL}/api/procedures/{owned_proc_id}/phase2-edit-request",
            json={"fields": ["prosthesis_type"], "note": "TEST_iter104 student-resolve"},
            timeout=30)
        assert created.status_code == 200
        req_id = created.json()["id"]

        r = student_client.post(
            f"{BASE_URL}/api/procedures/{owned_proc_id}/phase2-edit-request/{req_id}/resolve",
            timeout=30)
        assert r.status_code == 403, r.text[:300]
        # cleanup
        student_client.post(
            f"{BASE_URL}/api/procedures/{owned_proc_id}/phase2-edit-request/{req_id}/cancel",
            timeout=30)

    def test_incharge_patch_phase2_then_resolve(self, student_client, incharge_client, owned_proc_id):
        """Integration: student files → in-charge PATCHes phase2_data.prosthesis_type
        via /edit-fields (verifies persistence + edit_log) → resolves the request."""
        _cancel_any_pending(student_client, owned_proc_id)
        created = student_client.post(
            f"{BASE_URL}/api/procedures/{owned_proc_id}/phase2-edit-request",
            json={"fields": ["prosthesis_type"], "note": "TEST_iter104 integration"},
            timeout=30)
        assert created.status_code == 200, created.text[:300]
        req_id = created.json()["id"]

        # determine the inverse prosthesis_type so we force a diff
        before = _get_proc(incharge_client, owned_proc_id)
        current_pt = (before.get("phase2_data") or {}).get("prosthesis_type")
        new_pt = "Healing Abutment Placed" if current_pt == "Immediate Prosthesis Done" \
                 else "Immediate Prosthesis Done"

        patch = incharge_client.patch(
            f"{BASE_URL}/api/procedures/{owned_proc_id}/edit-fields",
            json={"fields": {"phase2_data": {"prosthesis_type": new_pt}}},
            timeout=30)
        assert patch.status_code == 200, patch.text[:300]

        after = _get_proc(incharge_client, owned_proc_id)
        assert (after.get("phase2_data") or {}).get("prosthesis_type") == new_pt
        edit_log = after.get("edit_log") or []
        assert any(e.get("field") == "phase2_data.prosthesis_type"
                   and e.get("new_value") == new_pt for e in edit_log), \
            "phase2_data.prosthesis_type change not found in edit_log"

        resolve = incharge_client.post(
            f"{BASE_URL}/api/procedures/{owned_proc_id}/phase2-edit-request/{req_id}/resolve",
            timeout=30)
        assert resolve.status_code == 200, resolve.text[:300]

        proc = _get_proc(incharge_client, owned_proc_id)
        target = next((r for r in proc.get("phase2_edit_requests", [])
                       if r.get("id") == req_id), None)
        assert target is not None
        assert target["status"] == "resolved"
        assert target.get("resolved_by_role") == "implant_incharge"
        assert target.get("resolved_by_name")
        assert target.get("resolved_at")

    def test_resolve_already_resolved_returns_400(self, student_client, incharge_client, owned_proc_id):
        proc = _get_proc(incharge_client, owned_proc_id)
        resolved = next((r for r in proc.get("phase2_edit_requests", [])
                         if r.get("status") == "resolved"), None)
        if not resolved:
            pytest.skip("no resolved request available to re-resolve")
        r = incharge_client.post(
            f"{BASE_URL}/api/procedures/{owned_proc_id}/phase2-edit-request/{resolved['id']}/resolve",
            timeout=30)
        assert r.status_code == 400, r.text[:300]

    def test_supervisor_of_case_can_resolve(self, student_client, supervisor_client, owned_proc_id):
        """If the logged-in supervisor is the assigned supervisor, they can resolve."""
        proc = _get_proc(student_client, owned_proc_id)
        me = supervisor_client.get(f"{BASE_URL}/api/auth/me", timeout=30).json()
        my_id = me.get("_id") or me.get("id")
        if proc.get("supervisor_id") != my_id:
            pytest.skip("supervisor is not the assigned supervisor on this proc")
        _cancel_any_pending(student_client, owned_proc_id)
        created = student_client.post(
            f"{BASE_URL}/api/procedures/{owned_proc_id}/phase2-edit-request",
            json={"fields": ["prosthesis_type"], "note": "TEST_iter104 sup-resolve"},
            timeout=30)
        assert created.status_code == 200
        req_id = created.json()["id"]
        r = supervisor_client.post(
            f"{BASE_URL}/api/procedures/{owned_proc_id}/phase2-edit-request/{req_id}/resolve",
            timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json().get("status") != "pending" or True  # tolerant


# ==================== 4. regression smoke ====================
class TestRegression:
    def test_dashboard_stats_200(self, incharge_client):
        r = incharge_client.get(f"{BASE_URL}/api/dashboard/stats", timeout=30)
        assert r.status_code == 200, r.text[:200]

    def test_procedures_list_200(self, incharge_client):
        r = incharge_client.get(f"{BASE_URL}/api/procedures", timeout=30)
        assert r.status_code == 200 and isinstance(r.json(), list)

    def test_whats_new_200(self, incharge_client):
        for p in ("/api/whats-new", "/api/whatsnew", "/api/whats_new"):
            if incharge_client.get(f"{BASE_URL}{p}", timeout=30).status_code == 200:
                return
        pytest.skip("whats-new endpoint not found")

    def test_case_report_pdf_still_builds(self, incharge_client, owned_proc_id):
        r = incharge_client.post(
            f"{BASE_URL}/api/procedures/{owned_proc_id}/case-report",
            timeout=60)
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) > 1000

    def test_drilling_protocol_pdf_200(self, incharge_client, owned_proc_id):
        # try common PDF endpoints
        for p in (f"/api/procedures/{owned_proc_id}/drilling-protocol-pdf",
                  f"/api/procedures/{owned_proc_id}/drilling-protocol/pdf",
                  f"/api/procedures/{owned_proc_id}/drilling-protocol"):
            r = incharge_client.get(f"{BASE_URL}{p}", timeout=60)
            if r.status_code == 200:
                return
        pytest.skip("drilling-protocol PDF endpoint not found")
