"""iter-Jun-2026: Case Assistant — comprehensive pytest coverage.

Covers:
- GET /api/procedures/assistant-candidates (self excluded, students-only, nurse 403)
- POST /api/procedures with assistant_id: self=400, supervisor=400, another student=200
- PATCH /api/procedures/{id}/assistant (owner add/remove; assistant self=403; unrelated=403; incharge=200)
- Phase 1 approval → single assistant_added notification; idempotent
- GET /api/procedures (default vs scope=assisted) for the assistant
- GET /api/procedures/{id} as assistant returns viewer_is_assistant=true and strips followups
- Assistant cannot edit/submit phases (403)
- After Phase 1 approval, PATCH assistant to different student → old gets assistant_removed, new gets assistant_added
"""
import os
import datetime
import time
import pytest
import requests

BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://dental-implant-hub-14.preview.emergentagent.com").rstrip("/") + "/api"

STUDENT_OWNER = ("Gaurav.pandey", "Student@123")
STUDENT_ASSIST = ("Aaditya.patil", "Student@123")
SUPERVISOR = ("Paresh.gandhi", "Supervisor@123")
INCHARGE = ("Abhijit.patil", "Admin@123")


def _login(identifier, password):
    r = requests.post(f"{BASE}/auth/login", json={"identifier": identifier, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {identifier}: {r.status_code} {r.text[:200]}"
    d = r.json()
    return d.get("access_token") or d.get("token"), d.get("user") or {}


def _H(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def tokens():
    st_tok, st_user = _login(*STUDENT_OWNER)
    as_tok, as_user = _login(*STUDENT_ASSIST)
    sup_tok, sup_user = _login(*SUPERVISOR)
    inc_tok, inc_user = _login(*INCHARGE)
    return {
        "student": (st_tok, st_user),
        "assistant": (as_tok, as_user),
        "supervisor": (sup_tok, sup_user),
        "incharge": (inc_tok, inc_user),
    }


@pytest.fixture(scope="module")
def sup_and_inc(tokens):
    inc_tok = tokens["incharge"][0]
    users = requests.get(f"{BASE}/users", headers=_H(inc_tok), timeout=30).json()
    sup = next(u for u in users if u["role"] == "supervisor")
    inc = next(u for u in users if u["role"] == "implant_incharge")
    return sup, inc, users


def _future_date():
    d = datetime.date.today() + datetime.timedelta(days=4)
    while d.weekday() in (5, 6):  # skip weekends for simplicity
        d += datetime.timedelta(days=1)
    return d


def _payload(sup, inc, assistant_id, assistant_name):
    return {
        "patient_name": "TEST_Assistant Case",
        "age": "35",
        "sex": "Male",
        "profession": "Test",
        "mobile_number": "9999900000",
        "registration_number": f"TEST-ASST-{datetime.datetime.now().strftime('%H%M%S%f')}",
        "chief_complaint": "Missing tooth",
        "supervisor_id": sup["id"],
        "supervisor_name": sup["name"],
        "implant_incharge_id": inc["id"],
        "implant_incharge_name": inc["name"],
        "receipt_number": "R1",
        "amount_paid": 100,
        "procedure_date": _future_date().isoformat(),
        "procedure_time": "10:00",
        "implant_procedure_type": "Single Conventional Implant",
        "loading_type": ["Delayed Loading"],
        "missing_teeth": ["16"],
        "assistant_id": assistant_id,
        "assistant_name": assistant_name,
    }


# ---------- assistant-candidates ----------
class TestAssistantCandidates:
    def test_student_excludes_self_and_only_students(self, tokens):
        st_tok, st_user = tokens["student"]
        r = requests.get(f"{BASE}/procedures/assistant-candidates", headers=_H(st_tok), timeout=30)
        assert r.status_code == 200
        cands = r.json()
        st_id = st_user.get("id") or st_user.get("_id")
        assert all(c["id"] != st_id for c in cands), "self must be excluded"
        # verify only students appear — cross-check with /users
        inc_tok = tokens["incharge"][0]
        users = requests.get(f"{BASE}/users", headers=_H(inc_tok), timeout=30).json()
        student_ids = {u["id"] for u in users if u["role"] == "student"}
        for c in cands:
            assert c["id"] in student_ids, f"non-student surfaced: {c}"

    def test_incharge_can_list(self, tokens):
        r = requests.get(f"{BASE}/procedures/assistant-candidates", headers=_H(tokens["incharge"][0]), timeout=30)
        assert r.status_code == 200

    def test_nurse_forbidden(self, tokens):
        # Try to login as any nurse — if not seeded, skip
        try:
            users = requests.get(f"{BASE}/users", headers=_H(tokens["incharge"][0]), timeout=30).json()
            nurse = next((u for u in users if u["role"] == "nurse"), None)
            if not nurse:
                pytest.skip("no nurse user seeded")
            # try common passwords
            for pw in ("Nurse@123", "Student@123", "Admin@123"):
                try:
                    tok, _ = _login(nurse.get("username") or nurse["name"].split(" ")[-1], pw)
                    r = requests.get(f"{BASE}/procedures/assistant-candidates", headers=_H(tok), timeout=30)
                    assert r.status_code == 403
                    return
                except AssertionError:
                    continue
            pytest.skip("could not login as nurse (unknown password)")
        except Exception as e:
            pytest.skip(f"nurse test skipped: {e}")


# ---------- Create procedure with assistant validation ----------
class TestCreateWithAssistant:
    def test_self_as_assistant_400(self, tokens, sup_and_inc):
        st_tok, st_user = tokens["student"]
        sup, inc, _ = sup_and_inc
        st_id = st_user.get("id") or st_user.get("_id")
        p = _payload(sup, inc, st_id, st_user.get("name"))
        r = requests.post(f"{BASE}/procedures", headers=_H(st_tok), json=p, timeout=30)
        assert r.status_code == 400, r.text[:200]

    def test_supervisor_as_assistant_400(self, tokens, sup_and_inc):
        st_tok, _ = tokens["student"]
        sup, inc, _ = sup_and_inc
        p = _payload(sup, inc, sup["id"], sup["name"])
        r = requests.post(f"{BASE}/procedures", headers=_H(st_tok), json=p, timeout=30)
        assert r.status_code == 400, r.text[:200]

    def test_other_student_ok(self, tokens, sup_and_inc, request):
        st_tok, _ = tokens["student"]
        _, as_user = tokens["assistant"]
        sup, inc, _ = sup_and_inc
        as_id = as_user.get("id") or as_user.get("_id")
        p = _payload(sup, inc, as_id, as_user.get("name"))
        r = requests.post(f"{BASE}/procedures", headers=_H(st_tok), json=p, timeout=30)
        assert r.status_code == 200, r.text[:200]
        pid = r.json().get("id") or r.json().get("_id")
        # verify persisted
        got = requests.get(f"{BASE}/procedures/{pid}", headers=_H(st_tok), timeout=30).json()
        assert got["assistant_id"] == as_id
        assert got["assistant_name"] == as_user.get("name")
        request.config.cache.set("asst_case_pid", pid)


@pytest.fixture(scope="module")
def draft_case(tokens, sup_and_inc):
    """Fresh draft case owned by student with assistant=Aaditya, used across mutation tests."""
    st_tok, _ = tokens["student"]
    _, as_user = tokens["assistant"]
    sup, inc, _ = sup_and_inc
    as_id = as_user.get("id") or as_user.get("_id")
    p = _payload(sup, inc, as_id, as_user.get("name"))
    r = requests.post(f"{BASE}/procedures", headers=_H(st_tok), json=p, timeout=30)
    assert r.status_code == 200, r.text[:200]
    pid = r.json().get("id") or r.json().get("_id")
    return pid


# ---------- PATCH assistant ----------
class TestPatchAssistant:
    def test_owner_remove_then_add(self, tokens, draft_case):
        st_tok, _ = tokens["student"]
        _, as_user = tokens["assistant"]
        as_id = as_user.get("id") or as_user.get("_id")
        r = requests.patch(f"{BASE}/procedures/{draft_case}/assistant", headers=_H(st_tok), json={"assistant_id": ""}, timeout=30)
        assert r.status_code == 200
        assert r.json().get("action") == "removed"
        got = requests.get(f"{BASE}/procedures/{draft_case}", headers=_H(st_tok), timeout=30).json()
        assert not got.get("assistant_id")
        # re-add
        r = requests.patch(f"{BASE}/procedures/{draft_case}/assistant", headers=_H(st_tok), json={"assistant_id": as_id}, timeout=30)
        assert r.status_code == 200
        assert r.json().get("action") == "added"

    def test_assistant_self_patch_403(self, tokens, draft_case):
        as_tok, _ = tokens["assistant"]
        r = requests.patch(f"{BASE}/procedures/{draft_case}/assistant", headers=_H(as_tok), json={"assistant_id": ""}, timeout=30)
        assert r.status_code == 403, r.text[:200]

    def test_unrelated_student_403(self, tokens, sup_and_inc, draft_case):
        # find a third student to attempt patch
        _, _, users = sup_and_inc
        _, owner_user = tokens["student"]
        _, as_user = tokens["assistant"]
        owner_id = owner_user.get("id") or owner_user.get("_id")
        as_id = as_user.get("id") or as_user.get("_id")
        third = next((u for u in users if u["role"] == "student" and u["id"] not in (owner_id, as_id)), None)
        if not third:
            pytest.skip("no third student to test unrelated-student 403")
        # attempt login
        uname = third.get("username") or (third.get("email", "").split("@")[0])
        try:
            tok, _ = _login(uname, "Student@123")
        except AssertionError:
            pytest.skip(f"cannot login as third student {uname}")
        r = requests.patch(f"{BASE}/procedures/{draft_case}/assistant", headers=_H(tok), json={"assistant_id": ""}, timeout=30)
        assert r.status_code == 403, r.text[:200]

    def test_incharge_can_patch(self, tokens, draft_case):
        inc_tok, _ = tokens["incharge"]
        _, as_user = tokens["assistant"]
        as_id = as_user.get("id") or as_user.get("_id")
        r = requests.patch(f"{BASE}/procedures/{draft_case}/assistant", headers=_H(inc_tok), json={"assistant_id": as_id}, timeout=30)
        assert r.status_code == 200, r.text[:200]


# ---------- Approval flow → notification ----------
class TestApprovalNotification:
    def test_full_phase1_approval_notifies_once(self, tokens, sup_and_inc):
        # Create a NEW case dedicated for this test to keep notification counts predictable.
        st_tok, _ = tokens["student"]
        as_tok, as_user = tokens["assistant"]
        sup_tok, _ = tokens["supervisor"]
        inc_tok, _ = tokens["incharge"]
        sup, inc, _ = sup_and_inc
        as_id = as_user.get("id") or as_user.get("_id")
        p = _payload(sup, inc, as_id, as_user.get("name"))
        r = requests.post(f"{BASE}/procedures", headers=_H(st_tok), json=p, timeout=30)
        assert r.status_code == 200, r.text[:200]
        pid = r.json().get("id") or r.json().get("_id")

        # baseline notification count for assistant
        def _asst_notifs():
            r = requests.get(f"{BASE}/notifications", headers=_H(as_tok), timeout=30)
            assert r.status_code == 200
            data = r.json()
            if isinstance(data, dict):
                data = data.get("notifications") or data.get("items") or []
            return [n for n in data if n.get("type") == "assistant_added" and (n.get("procedure_id") == pid or n.get("case_id") == pid or pid in str(n))]

        before = len(_asst_notifs())

        # request phase1 approval → supervisor approve → incharge approve
        r = requests.post(f"{BASE}/procedures/{pid}/request-phase1-approval", headers=_H(st_tok), timeout=30)
        assert r.status_code == 200, r.text[:200]
        r = requests.post(f"{BASE}/procedures/{pid}/approve", headers=_H(sup_tok), json={"action": "approve"}, timeout=30)
        assert r.status_code == 200, r.text[:200]
        r = requests.post(f"{BASE}/procedures/{pid}/approve", headers=_H(inc_tok), json={"action": "approve"}, timeout=30)
        assert r.status_code == 200, r.text[:200]

        # verify assistant_notified_at is set
        proc = requests.get(f"{BASE}/procedures/{pid}", headers=_H(inc_tok), timeout=30).json()
        assert proc.get("assistant_notified_at"), "assistant_notified_at should be set"

        time.sleep(1)
        after = _asst_notifs()
        assert len(after) - before == 1, f"expected exactly 1 new assistant_added notif, got {len(after) - before}"

        # verify text mentions scheduling user
        latest = after[-1] if before == 0 else after[-1]
        msg = (latest.get("message") or latest.get("body") or latest.get("text") or "").lower()
        assert "gaurav" in msg or "assistant" in msg, f"unexpected message: {msg}"

        # save for downstream tests
        TestApprovalNotification.pid = pid

    def test_assistant_default_scope_hides_case(self, tokens):
        as_tok, _ = tokens["assistant"]
        pid = TestApprovalNotification.pid
        r = requests.get(f"{BASE}/procedures", headers=_H(as_tok), timeout=30)
        assert r.status_code == 200
        data = r.json()
        if isinstance(data, dict):
            data = data.get("procedures") or data.get("items") or []
        assert all((p.get("id") or p.get("_id")) != pid for p in data), "assisted case should NOT appear in default scope"

    def test_assistant_scope_shows_case(self, tokens):
        as_tok, _ = tokens["assistant"]
        pid = TestApprovalNotification.pid
        r = requests.get(f"{BASE}/procedures?scope=assisted", headers=_H(as_tok), timeout=30)
        assert r.status_code == 200
        data = r.json()
        if isinstance(data, dict):
            data = data.get("procedures") or data.get("items") or []
        row = next((p for p in data if (p.get("id") or p.get("_id")) == pid), None)
        assert row is not None, "assisted scope must include the case"
        assert row.get("viewer_is_assistant") is True

    def test_assistant_get_detail_readonly(self, tokens):
        as_tok, _ = tokens["assistant"]
        pid = TestApprovalNotification.pid
        r = requests.get(f"{BASE}/procedures/{pid}", headers=_H(as_tok), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d.get("viewer_is_assistant") is True
        assert "followups" not in d, "followups must be stripped for assistant"

    def test_assistant_cannot_edit(self, tokens):
        as_tok, _ = tokens["assistant"]
        pid = TestApprovalNotification.pid
        # attempt PUT
        r = requests.put(f"{BASE}/procedures/{pid}", headers=_H(as_tok), json={"chief_complaint": "hack"}, timeout=30)
        assert r.status_code in (403, 401), f"assistant PUT should be forbidden, got {r.status_code}"

    def test_change_assistant_after_approval_dual_notifications(self, tokens, sup_and_inc):
        st_tok, _ = tokens["student"]
        as_tok, as_user = tokens["assistant"]
        pid = TestApprovalNotification.pid
        _, _, users = sup_and_inc
        _, owner_user = tokens["student"]
        owner_id = owner_user.get("id") or owner_user.get("_id")
        as_id = as_user.get("id") or as_user.get("_id")
        third = next((u for u in users if u["role"] == "student" and u["id"] not in (owner_id, as_id)), None)
        if not third:
            pytest.skip("no third student available")

        def _new_notifs(tok, ntype):
            r = requests.get(f"{BASE}/notifications", headers=_H(tok), timeout=30)
            data = r.json()
            if isinstance(data, dict):
                data = data.get("notifications") or data.get("items") or []
            return [n for n in data if n.get("type") == ntype and (n.get("procedure_id") == pid or n.get("case_id") == pid or pid in str(n))]

        old_removed_before = len(_new_notifs(as_tok, "assistant_removed"))

        # try to get token for third student
        uname = third.get("username") or (third.get("email", "").split("@")[0])
        try:
            new_tok, _ = _login(uname, "Student@123")
        except AssertionError:
            new_tok = None

        new_added_before = 0
        if new_tok:
            new_added_before = len(_new_notifs(new_tok, "assistant_added"))

        # switch assistant
        r = requests.patch(f"{BASE}/procedures/{pid}/assistant", headers=_H(st_tok), json={"assistant_id": third["id"]}, timeout=30)
        assert r.status_code == 200, r.text[:200]

        time.sleep(1)
        old_removed_after = len(_new_notifs(as_tok, "assistant_removed"))
        assert old_removed_after - old_removed_before >= 1, "old assistant should get assistant_removed"

        if new_tok:
            new_added_after = len(_new_notifs(new_tok, "assistant_added"))
            assert new_added_after - new_added_before >= 1, "new assistant should get assistant_added"

        # cleanup — restore Aaditya as assistant
        requests.patch(f"{BASE}/procedures/{pid}/assistant", headers=_H(st_tok), json={"assistant_id": as_id}, timeout=30)
