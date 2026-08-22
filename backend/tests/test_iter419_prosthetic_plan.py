"""iter-419 (Chunk C): PATCH /api/procedures/{id}/prosthetic-plan
Backend suite:
  - student edit → 200, audit log +1
  - idempotent same-value → {ok:true, unchanged:true}, no audit added
  - supervisor edit different value → 200, audit log +1 (2 total, chronological)
  - nurse role → 403
  - student edits another student's case → 403
  - empty body → 400/422
  - non-existent id → 404
  - regression: submit-phase2 does NOT touch prosthetic_plan_change_log
"""
from __future__ import annotations
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://prosthetic-preview.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}
SUPERVISOR = {"identifier": "Paresh.gandhi", "password": "Supervisor@123"}
ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}
NURSE = {"identifier": "Nurse.1", "password": "Nurse@123"}

# Non-Zygoma procedure owned by Gaurav (Single Conventional).
PROC_ID = "6a845e8f8478ad06cfec7e15"


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _auth(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def tokens():
    return {
        "student": _login(STUDENT),
        "supervisor": _login(SUPERVISOR),
        "admin": _login(ADMIN),
        "nurse": _login(NURSE),
    }


def _get_proc(tok, pid):
    r = requests.get(f"{API}/procedures/{pid}", headers=_auth(tok), timeout=15)
    assert r.status_code == 200, f"get proc failed {r.status_code} {r.text}"
    return r.json()


def _reset_change_log(tokens):
    """Ensure the target procedure starts fresh: use admin to force a known plan
    with no change-log residue. We do this by direct patch as student and then
    dropping the change_log via mongo. Since we don't have a drop endpoint,
    just snapshot the starting length and record deltas."""
    # No-op: tests compute deltas rather than absolute lengths.
    return


class TestProstheticPlanUpdate:
    def test_00_baseline(self, tokens):
        """Snapshot baseline so subsequent tests know current values."""
        proc = _get_proc(tokens["student"], PROC_ID)
        assert proc["implant_procedure_type"] == "Single Conventional Implant"
        # store baseline for later
        TestProstheticPlanUpdate.baseline_plan = proc.get("prosthetic_plan") or ""
        TestProstheticPlanUpdate.baseline_log_len = len(proc.get("prosthetic_plan_change_log") or [])

    def test_01_student_updates_own_procedure(self, tokens):
        # Ensure target != baseline
        target = "Cement Retained Crown - Zirconia"
        if TestProstheticPlanUpdate.baseline_plan == target:
            target = "Screw Retained Crown"
        r = requests.patch(
            f"{API}/procedures/{PROC_ID}/prosthetic-plan",
            headers=_auth(tokens["student"]),
            json={"prosthetic_plan": target},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["prosthetic_plan"] == target
        assert isinstance(body["prosthetic_plan_change_log"], list)
        assert len(body["prosthetic_plan_change_log"]) == TestProstheticPlanUpdate.baseline_log_len + 1

        last = body["prosthetic_plan_change_log"][-1]
        assert last["to"] == target
        assert last["from"] == TestProstheticPlanUpdate.baseline_plan
        assert last["changed_by_role"] == "student"
        assert last["changed_in_phase"] == 2
        assert last.get("changed_by_name")
        assert "T" in last["changed_at"]  # ISO
        TestProstheticPlanUpdate.after_student_plan = target
        TestProstheticPlanUpdate.after_student_log_len = len(body["prosthetic_plan_change_log"])

        # Verify persistence via GET
        proc = _get_proc(tokens["student"], PROC_ID)
        assert proc["prosthetic_plan"] == target
        assert len(proc.get("prosthetic_plan_change_log") or []) == TestProstheticPlanUpdate.after_student_log_len

    def test_02_idempotent_same_value(self, tokens):
        target = TestProstheticPlanUpdate.after_student_plan
        r = requests.patch(
            f"{API}/procedures/{PROC_ID}/prosthetic-plan",
            headers=_auth(tokens["student"]),
            json={"prosthetic_plan": target},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("unchanged") is True

        proc = _get_proc(tokens["student"], PROC_ID)
        assert len(proc.get("prosthetic_plan_change_log") or []) == TestProstheticPlanUpdate.after_student_log_len

    def test_03_supervisor_updates_same_procedure(self, tokens):
        prev = TestProstheticPlanUpdate.after_student_plan
        new = "Screw Retained Crown" if prev != "Screw Retained Crown" else "Cement Retained Crown - PFM"
        # Ensure chronological ordering
        time.sleep(1)
        r = requests.patch(
            f"{API}/procedures/{PROC_ID}/prosthetic-plan",
            headers=_auth(tokens["supervisor"]),
            json={"prosthetic_plan": new},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["prosthetic_plan"] == new
        log = body["prosthetic_plan_change_log"]
        assert len(log) == TestProstheticPlanUpdate.after_student_log_len + 1

        last = log[-1]
        assert last["changed_by_role"] == "supervisor"
        assert last["from"] == prev
        assert last["to"] == new
        assert last["changed_in_phase"] == 2

        # Chronological check: at least 2 recent entries in order
        recent = log[-2:]
        assert recent[0]["changed_at"] <= recent[1]["changed_at"]
        assert recent[0]["changed_by_role"] == "student"
        assert recent[1]["changed_by_role"] == "supervisor"

        TestProstheticPlanUpdate.after_super_plan = new
        TestProstheticPlanUpdate.after_super_log_len = len(log)

    def test_04_nurse_forbidden(self, tokens):
        r = requests.patch(
            f"{API}/procedures/{PROC_ID}/prosthetic-plan",
            headers=_auth(tokens["nurse"]),
            json={"prosthetic_plan": "Anything"},
            timeout=15,
        )
        assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text}"

    def test_05_student_forbidden_other_case(self, tokens):
        # find a case NOT owned by Gaurav — need admin to list all cases across users
        r_all = requests.get(f"{API}/procedures", headers=_auth(tokens["admin"]), timeout=15)
        assert r_all.status_code == 200
        rows = r_all.json()
        if isinstance(rows, dict):
            rows = rows.get("items") or rows.get("procedures") or []
        gaurav_id = None
        # get gaurav's own procedure via student list to derive his id
        one = _get_proc(tokens["student"], PROC_ID)
        gaurav_id = str(one.get("student_id") or one.get("created_by_id") or "")
        other = None
        for p in rows:
            sid = str(p.get("student_id") or p.get("created_by_id") or "")
            if sid and sid != gaurav_id:
                other = p
                break
        if not other:
            pytest.skip("No procedure owned by another student available to test ownership 403")
        other_id = other.get("id") or other.get("_id")
        r = requests.patch(
            f"{API}/procedures/{other_id}/prosthetic-plan",
            headers=_auth(tokens["student"]),
            json={"prosthetic_plan": "Cement Retained Crown - Zirconia"},
            timeout=15,
        )
        assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text}"

    def test_06_empty_body_rejected(self, tokens):
        r = requests.patch(
            f"{API}/procedures/{PROC_ID}/prosthetic-plan",
            headers=_auth(tokens["student"]),
            json={"prosthetic_plan": ""},
            timeout=15,
        )
        assert r.status_code in (400, 422), f"expected 400/422, got {r.status_code} {r.text}"

    def test_07_not_found(self, tokens):
        r = requests.patch(
            f"{API}/procedures/000000000000000000000000/prosthetic-plan",
            headers=_auth(tokens["student"]),
            json={"prosthetic_plan": "Cement Retained Crown - Zirconia"},
            timeout=15,
        )
        assert r.status_code == 404, r.text

    def test_08_submit_phase2_preserves_change_log(self, tokens):
        """Regression: an unrelated Phase 2 submission does NOT overwrite
        prosthetic_plan or drop prosthetic_plan_change_log."""
        proc_before = _get_proc(tokens["student"], PROC_ID)
        pre_log = list(proc_before.get("prosthetic_plan_change_log") or [])
        pre_plan = proc_before.get("prosthetic_plan") or ""
        # Send an intentionally empty (but valid) submit-phase2 body
        r = requests.post(
            f"{API}/procedures/{PROC_ID}/submit-phase2",
            headers=_auth(tokens["student"]),
            json={"note": "iter419 regression – empty phase2 submit"},
            timeout=20,
        )
        # Some cases may reject if already-approved; skip regression check in that case
        if r.status_code not in (200, 201):
            # accept 400 if server refuses re-submission but still verify persistence
            pass
        proc_after = _get_proc(tokens["student"], PROC_ID)
        post_log = list(proc_after.get("prosthetic_plan_change_log") or [])
        post_plan = proc_after.get("prosthetic_plan") or ""
        assert post_plan == pre_plan, "submit-phase2 must not overwrite prosthetic_plan"
        assert len(post_log) == len(pre_log), (
            f"submit-phase2 must not touch prosthetic_plan_change_log "
            f"(pre {len(pre_log)} != post {len(post_log)})"
        )
        # Each pre entry must be preserved unchanged in post
        for i, entry in enumerate(pre_log):
            assert post_log[i].get("changed_at") == entry.get("changed_at")
            assert post_log[i].get("to") == entry.get("to")
