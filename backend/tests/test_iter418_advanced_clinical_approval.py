"""
iter-418 Chunk B Ask 3 — Independent Advanced Clinical (Zygoma) approval workflow tests.

Endpoints under test:
  POST /api/procedures/{id}/advanced-clinical/send-for-approval
  POST /api/procedures/{id}/advanced-clinical/approve
  PATCH /api/procedures/{id}/tabbed-phase-data/2   (regression — preserve advanced_clinical)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"

STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}
SUPERVISOR = {"identifier": "Paresh.gandhi", "password": "Supervisor@123"}
ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}


def _login(session, creds):
    r = session.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed for {creds['identifier']}: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in login response: {r.json()}"
    return tok


def _headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def sess():
    return requests.Session()


@pytest.fixture(scope="module")
def tokens(sess):
    return {
        "student": _login(sess, STUDENT),
        "supervisor": _login(sess, SUPERVISOR),
        "admin": _login(sess, ADMIN),
    }


@pytest.fixture(scope="module")
def zygoma_case(sess, tokens):
    """Find a Zygoma/Pterygoid procedure (prefer the well-known test-patient)."""
    # First try the well-known seed
    seed_id = "6a8337dd64ad3269dc584a69"
    r = sess.get(f"{BASE_URL}/api/procedures/{seed_id}", headers=_headers(tokens["admin"]), timeout=30)
    if r.status_code == 200:
        proc_type = r.json().get("implant_procedure_type", "")
        zyg_types = {
            "Quad Zygoma Implants", "Zygoma and Pterygoid Implants",
            "Pterygoid and Conventional Implants", "Zygoma and Conventional Implants",
            "Zygoma, Pterygoid and Conventional Implants",
        }
        if proc_type in zyg_types:
            return r.json()

    # Fallback: list procedures and pick one
    r = sess.get(f"{BASE_URL}/api/procedures", headers=_headers(tokens["admin"]), timeout=30)
    assert r.status_code == 200
    for p in r.json().get("procedures", r.json() if isinstance(r.json(), list) else []):
        if p.get("implant_procedure_type", "") in {
            "Quad Zygoma Implants", "Zygoma and Pterygoid Implants",
            "Pterygoid and Conventional Implants", "Zygoma and Conventional Implants",
            "Zygoma, Pterygoid and Conventional Implants",
        }:
            return p
    pytest.skip("No Zygoma/Pterygoid procedure available for tests")


@pytest.fixture(scope="module")
def non_zygoma_case(sess, tokens):
    r = sess.get(f"{BASE_URL}/api/procedures", headers=_headers(tokens["admin"]), timeout=30)
    assert r.status_code == 200
    data = r.json()
    if isinstance(data, list):
        procs = data
    else:
        procs = data.get("procedures", [])
    zyg_types = {
        "Quad Zygoma Implants", "Zygoma and Pterygoid Implants",
        "Pterygoid and Conventional Implants", "Zygoma and Conventional Implants",
        "Zygoma, Pterygoid and Conventional Implants",
    }
    for p in procs:
        pt = p.get("implant_procedure_type", "")
        if pt and pt not in zyg_types:
            return p
    pytest.skip("No non-Zygoma procedure available")


# ─────────────────────────────────────────────────────────────
# 1) send-for-approval
# ─────────────────────────────────────────────────────────────

class TestAdvancedClinicalSendForApproval:
    def test_404_when_procedure_id_invalid(self, sess, tokens):
        r = sess.post(
            f"{BASE_URL}/api/procedures/000000000000000000000000/advanced-clinical/send-for-approval",
            headers=_headers(tokens["student"]),
            timeout=30,
        )
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text}"

    def test_400_on_non_zygoma_case(self, sess, tokens, non_zygoma_case):
        pid = non_zygoma_case.get("_id") or non_zygoma_case.get("id")
        r = sess.post(
            f"{BASE_URL}/api/procedures/{pid}/advanced-clinical/send-for-approval",
            headers=_headers(tokens["student"]),
            timeout=30,
        )
        assert r.status_code == 400, f"expected 400 for non-zygoma, got {r.status_code}: {r.text}"

    def test_student_sends_zygoma_for_approval(self, sess, tokens, zygoma_case):
        pid = zygoma_case.get("_id") or zygoma_case.get("id")
        r = sess.post(
            f"{BASE_URL}/api/procedures/{pid}/advanced-clinical/send-for-approval",
            headers=_headers(tokens["student"]),
            timeout=30,
        )
        assert r.status_code == 200, f"unexpected status: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("approval_status") == "pending"
        adv = body.get("advanced_clinical", {})
        assert adv.get("approval_status") == "pending"
        assert adv.get("submitted_by"), "submitted_by must be stamped"
        assert adv.get("submitted_by_name"), "submitted_by_name must be stamped"
        assert adv.get("submitted_at"), "submitted_at must be stamped"

        # GET verification — ensure persistence
        r2 = sess.get(f"{BASE_URL}/api/procedures/{pid}", headers=_headers(tokens["admin"]), timeout=30)
        assert r2.status_code == 200
        p2 = (r2.json().get("phase2_data") or {})
        got = p2.get("advanced_clinical", {})
        assert got.get("approval_status") == "pending"
        assert got.get("submitted_by") == adv.get("submitted_by")


# ─────────────────────────────────────────────────────────────
# 2) approve
# ─────────────────────────────────────────────────────────────

class TestAdvancedClinicalApprove:
    def test_403_when_student_tries_to_approve(self, sess, tokens, zygoma_case):
        pid = zygoma_case.get("_id") or zygoma_case.get("id")
        r = sess.post(
            f"{BASE_URL}/api/procedures/{pid}/advanced-clinical/approve",
            headers=_headers(tokens["student"]),
            timeout=30,
        )
        assert r.status_code == 403, f"student should get 403, got {r.status_code}: {r.text}"

    def test_supervisor_approves_pending(self, sess, tokens, zygoma_case):
        """Depends on TestAdvancedClinicalSendForApproval.test_student_sends_zygoma_for_approval running first
        to put the block into 'pending'. That test executes earlier alphabetically."""
        pid = zygoma_case.get("_id") or zygoma_case.get("id")

        # Ensure pending state (idempotent — re-send)
        sess.post(
            f"{BASE_URL}/api/procedures/{pid}/advanced-clinical/send-for-approval",
            headers=_headers(tokens["student"]), timeout=30,
        )

        r = sess.post(
            f"{BASE_URL}/api/procedures/{pid}/advanced-clinical/approve",
            headers=_headers(tokens["supervisor"]),
            timeout=30,
        )
        assert r.status_code == 200, f"supervisor approve failed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("approval_status") == "approved"
        adv = body.get("advanced_clinical", {})
        assert adv.get("approval_status") == "approved"
        assert adv.get("approved_by"), "approved_by must be stamped"
        assert adv.get("approved_by_name"), "approved_by_name must be stamped"
        assert adv.get("approved_by_role") == "supervisor"
        assert adv.get("approved_at"), "approved_at must be stamped"

    def test_400_when_not_pending_double_approve(self, sess, tokens, zygoma_case):
        """After the previous test approved, status is 'approved' — a second approve must 400."""
        pid = zygoma_case.get("_id") or zygoma_case.get("id")
        r = sess.post(
            f"{BASE_URL}/api/procedures/{pid}/advanced-clinical/approve",
            headers=_headers(tokens["admin"]),
            timeout=30,
        )
        assert r.status_code == 400, f"expected 400 (already approved), got {r.status_code}: {r.text}"

    def test_admin_can_approve_after_new_pending(self, sess, tokens, zygoma_case):
        """Re-send-for-approval (resets to pending), then approve as admin (implant_incharge)."""
        pid = zygoma_case.get("_id") or zygoma_case.get("id")
        r0 = sess.post(
            f"{BASE_URL}/api/procedures/{pid}/advanced-clinical/send-for-approval",
            headers=_headers(tokens["student"]),
            timeout=30,
        )
        assert r0.status_code == 200
        assert r0.json()["advanced_clinical"]["approval_status"] == "pending"

        r = sess.post(
            f"{BASE_URL}/api/procedures/{pid}/advanced-clinical/approve",
            headers=_headers(tokens["admin"]),
            timeout=30,
        )
        assert r.status_code == 200, f"admin approve failed: {r.status_code} {r.text}"
        adv = r.json().get("advanced_clinical", {})
        assert adv.get("approval_status") == "approved"
        # Admin's role is 'implant_incharge'
        assert adv.get("approved_by_role") == "implant_incharge"


# ─────────────────────────────────────────────────────────────
# 3) PATCH tabbed-phase-data/2 regression — preserve advanced_clinical
# ─────────────────────────────────────────────────────────────

class TestTabbedPhaseDataAdvancedClinicalPreservation:
    def test_patch_without_advanced_clinical_preserves_it(self, sess, tokens, zygoma_case):
        pid = zygoma_case.get("_id") or zygoma_case.get("id")

        # 1) Seed advanced_clinical via the send-for-approval endpoint
        r0 = sess.post(
            f"{BASE_URL}/api/procedures/{pid}/advanced-clinical/send-for-approval",
            headers=_headers(tokens["student"]),
            timeout=30,
        )
        assert r0.status_code == 200
        before = r0.json()["advanced_clinical"]
        assert before.get("approval_status") == "pending"
        assert before.get("submitted_by_name")

        # 2) PATCH tabbed-phase-data/2 with per_implant only (advanced_clinical omitted)
        payload = {
            "per_implant": {
                "ZR1": {"note": "iter418 regression marker"}
            }
        }
        # Use admin token to bypass ownership gate on the tabbed patch —
        # ownership is orthogonal to this regression test (which is about the
        # advanced_clinical preservation when omitted from the payload).
        r1 = sess.patch(
            f"{BASE_URL}/api/procedures/{pid}/tabbed-phase-data/2",
            json=payload,
            headers=_headers(tokens["admin"]),
            timeout=30,
        )
        assert r1.status_code == 200, f"tabbed patch failed: {r1.status_code} {r1.text}"
        resp = r1.json()
        # Endpoint returns advanced_clinical from persisted state
        after_adv = resp.get("advanced_clinical") or {}
        assert after_adv.get("approval_status") == "pending", f"advanced_clinical lost after tabbed PATCH: {after_adv}"
        assert after_adv.get("submitted_by_name") == before.get("submitted_by_name")
        assert after_adv.get("submitted_at") == before.get("submitted_at")
        # per_implant marker persisted
        pi = resp.get("per_implant") or {}
        assert pi.get("ZR1", {}).get("note") == "iter418 regression marker"

        # 3) GET to verify persistence
        r2 = sess.get(f"{BASE_URL}/api/procedures/{pid}", headers=_headers(tokens["admin"]), timeout=30)
        assert r2.status_code == 200
        p2 = (r2.json().get("phase2_data") or {})
        adv2 = p2.get("advanced_clinical") or {}
        assert adv2.get("approval_status") == "pending"
        assert adv2.get("submitted_by_name") == before.get("submitted_by_name")
