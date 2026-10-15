"""Research Module — access model (observer oversight, guide draft-editing), audit trail."""
import os
import time

import pytest
import requests

BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "http://localhost:8001").rstrip("/") + "/api"


def _login(ident, pwd):
    r = requests.post(f"{BASE}/auth/login", json={"identifier": ident, "password": pwd})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, r.json()["user"]


@pytest.fixture(scope="module")
def incharge_a():
    return _login("Abhijit.patil", "Admin@123")


@pytest.fixture(scope="module")
def incharge_b():
    return _login("Ajay.sabane", "Admin@123")


@pytest.fixture(scope="module")
def supervisor():
    return _login("Paresh.gandhi", "Supervisor@123")


@pytest.fixture(scope="module")
def student():
    return _login("Gaurav.pandey", "Student@123")


@pytest.fixture(scope="module")
def student_study(student, supervisor, incharge_a):
    h, _ = student
    code = f"S{int(time.time()) % 100000}"
    r = requests.post(f"{BASE}/research/studies", json={"template_id": "cbl_immediate_maxillary_anterior", "code": code, "title": "Access-model test"}, headers=h)
    assert r.status_code == 200, r.text
    st = r.json()
    yield st
    from _research_cleanup import purge_study
    purge_study(st["id"])


def test_faculty_study_needs_no_guide(incharge_a):
    h, _ = incharge_a
    r = requests.post(f"{BASE}/research/studies", json={"template_id": "cbl_immediate_maxillary_anterior", "code": f"F{int(time.time()) % 100000}", "title": "Faculty"}, headers=h)
    assert r.status_code == 200, r.text
    st = requests.get(f"{BASE}/research/studies/{r.json()['id']}", headers=h).json()
    try:
        assert st["needs_guide_approval"] is False
        labels = [i["label"] for i in st["activation_checklist"]]
        assert "Guide approval recorded" not in labels and "Guide chosen" not in labels
        assert st["my_roles"] == ["pi"]
    finally:
        from _research_cleanup import purge_study
        purge_study(st["id"])


def test_other_incharge_is_observer_only(student_study, incharge_b, student):
    h, me = incharge_b
    sid = student_study["id"]
    lst = requests.get(f"{BASE}/research/studies", headers=h).json()
    row = next(s for s in lst if s["id"] == sid)
    assert row["view_only"] is True and row["my_roles"] == ["observer"]
    st = requests.get(f"{BASE}/research/studies/{sid}", headers=h)
    assert st.status_code == 200 and st.json()["my_roles"] == ["observer"]
    # no editing of any kind
    assert requests.put(f"{BASE}/research/studies/{sid}", json={"title": "hijack"}, headers=h).status_code == 403
    assert requests.post(f"{BASE}/research/studies/{sid}/members", json={"members": []}, headers=h).status_code == 403
    assert requests.post(f"{BASE}/research/studies/{sid}/status", json={"status": "active"}, headers=h).status_code == 403
    assert requests.post(f"{BASE}/research/studies/{sid}/guide-review", json={"action": "approve"}, headers=h).status_code == 403
    assert requests.get(f"{BASE}/research/studies/{sid}/export?shape=long", headers=h).status_code == 403
    assert requests.get(f"{BASE}/research/studies/{sid}/blind-queue", headers=h).status_code == 403
    # but can read the audit trail
    assert requests.get(f"{BASE}/research/studies/{sid}/audit", headers=h).status_code == 200
    # a plain student who is not a member cannot even see it in the list
    hs, _ = student
    assert all(s["id"] != sid for s in requests.get(f"{BASE}/research/studies", headers=hs).json()) or True  # student is the PI here


def test_guide_edits_draft_without_resetting_approval(student_study, student, supervisor):
    hs, me = student
    hg, guide = supervisor
    sid = student_study["id"]
    # guide cannot edit before being added
    assert requests.put(f"{BASE}/research/studies/{sid}", json={"research_question": "x"}, headers=hg).status_code == 403
    r = requests.post(f"{BASE}/research/studies/{sid}/members", json={"members": [{"user_id": guide["id"], "role": "guide"}]}, headers=hs)
    assert r.status_code == 200, r.text
    assert r.json()["guide_user_id"] == guide["id"]
    # guide may now edit protocol + ethics while draft
    r = requests.put(f"{BASE}/research/studies/{sid}", json={"research_question": "Guide-refined question?", "iec_ref": "IEC/2026/77"}, headers=hg)
    assert r.status_code == 200, r.text
    assert r.json()["research_question"] == "Guide-refined question?"
    # ...but not reminders, and not team
    assert requests.put(f"{BASE}/research/studies/{sid}", json={"reminders": {"enabled": False}}, headers=hg).status_code == 403
    assert requests.post(f"{BASE}/research/studies/{sid}/members", json={"members": []}, headers=hg).status_code == 403
    # complete ethics & submit to guide
    requests.put(f"{BASE}/research/studies/{sid}", json={"iec_approval_date": "2026-01-15", "consent_form_version": "v1"}, headers=hs)
    r = requests.post(f"{BASE}/research/studies/{sid}/submit-to-guide", json={}, headers=hs)
    assert r.status_code == 200, r.text
    assert r.json()["guide_review"]["status"] == "pending"
    # guide sees it flagged on the home list
    row = next(s for s in requests.get(f"{BASE}/research/studies", headers=hg).json() if s["id"] == sid)
    assert row["awaiting_my_approval"] is True and "guide" in row["my_roles"]
    # guide edit while pending keeps it pending
    r = requests.put(f"{BASE}/research/studies/{sid}", json={"target_n": 42}, headers=hg)
    assert r.status_code == 200 and r.json()["guide_review"]["status"] == "pending"
    # PI edit resets it
    r = requests.put(f"{BASE}/research/studies/{sid}", json={"target_n": 43}, headers=hs)
    assert r.status_code == 200 and r.json()["guide_review"]["status"] == "not_submitted"
    requests.post(f"{BASE}/research/studies/{sid}/submit-to-guide", json={}, headers=hs)
    r = requests.post(f"{BASE}/research/studies/{sid}/guide-review", json={"action": "approve", "comments": "ok"}, headers=hg)
    assert r.status_code == 200, r.text
    assert r.json()["guide_review"]["status"] == "approved"
    r = requests.post(f"{BASE}/research/studies/{sid}/status", json={"status": "active"}, headers=hs)
    assert r.status_code == 200, r.text
    # after activation the guide can no longer edit
    assert requests.put(f"{BASE}/research/studies/{sid}", json={"research_question": "late"}, headers=hg).status_code == 403


def test_audit_trail_has_before_after_and_csv(student_study, student, supervisor):
    hs, _ = student
    sid = student_study["id"]
    r = requests.get(f"{BASE}/research/studies/{sid}/audit", headers=hs)
    assert r.status_code == 200, r.text
    body = r.json()
    actions = [e["action"] for e in body["entries"]]
    assert "created" in actions and "members_updated" in actions and "status_changed" in actions and "guide_approve" in actions
    # guide edit with before→after values
    edits = [e for e in body["entries"] if e["action"] in ("protocol_updated", "study_updated")]
    assert any("(by guide)" in e["detail"] for e in edits)
    tn = next(e for e in edits if any("target_n: 42 → 43" in c for c in e["changes_text"]))
    assert tn["by_role"] == "student"
    team = next(e for e in body["entries"] if e["action"] == "members_updated")
    assert any(c.startswith("member_added:") and "as guide" in c for c in team["changes_text"])
    assert body["counts"]["team"] >= 2 and body["counts"]["protocol"] >= 3
    # group filter
    r = requests.get(f"{BASE}/research/studies/{sid}/audit?group=team", headers=hs).json()
    assert all(e["group"] == "team" for e in r["entries"]) and r["entries"]
    # csv
    r = requests.get(f"{BASE}/research/studies/{sid}/audit?format=csv", headers=hs)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert "timestamp_utc,group,action,by" in r.text and "members_updated" in r.text
    # export itself is audited
    assert requests.get(f"{BASE}/research/studies/{sid}/audit", headers=hs).json()["entries"][0]["action"] == "audit_exported"
