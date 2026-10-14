"""Research module iter-444 edge cases — extends test_research_module.py.
Covers: nurse 403, screening exclude/unexclude, members add, enrolment withdrawal,
wide CSV de-id check, member student can view study after being added.
Run: pytest /app/backend/tests/test_research_module_iter444.py -q
"""
import os
import time
import requests
import pytest

BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "http://localhost:8001").rstrip("/") + "/api"


def _login(ident, pwd):
    r = requests.post(f"{BASE}/auth/login", json={"identifier": ident, "password": pwd})
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    uid = r.json().get("user", {}).get("id") or r.json().get("user_id")
    return {"Authorization": f"Bearer {tok}"}, uid


@pytest.fixture(scope="module")
def admin():
    h, _ = _login("Abhijit.patil", "Admin@123")
    return h


@pytest.fixture(scope="module")
def student():
    return _login("Gaurav.pandey", "Student@123")


@pytest.fixture(scope="module")
def nurse():
    h, _ = _login("Nurse.1", "Nurse@123")
    return h


@pytest.fixture(scope="module")
def active_study(admin):
    code = f"T{int(time.time()) % 100000}"
    r = requests.post(f"{BASE}/research/studies", json={"template_id": "cbl_immediate_maxillary_anterior", "code": code, "title": "Iter444 CBL"}, headers=admin)
    assert r.status_code == 200, r.text
    st = r.json()
    sid = st["id"]
    # ethics + activate
    r = requests.put(f"{BASE}/research/studies/{sid}", json={"iec_ref": "IEC/2026/44", "iec_approval_date": "2026-01-15", "consent_form_version": "v1"}, headers=admin)
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE}/research/studies/{sid}/status", json={"status": "active"}, headers=admin)
    assert r.status_code == 200, r.text
    yield st
    requests.post(f"{BASE}/research/studies/{sid}/status", json={"status": "archived"}, headers=admin)
    requests.delete(f"{BASE}/research/studies/{sid}", headers=admin)


# ------------------------------- role gates
def test_nurse_blocked_from_research(nurse):
    r = requests.get(f"{BASE}/research/studies", headers=nurse)
    assert r.status_code == 403, r.text
    r = requests.get(f"{BASE}/research/registry", headers=nurse)
    assert r.status_code == 403
    r = requests.get(f"{BASE}/research/templates", headers=nurse)
    assert r.status_code == 403


def test_non_member_student_blocked(student, active_study):
    sh, _ = student
    r = requests.get(f"{BASE}/research/studies/{active_study['id']}", headers=sh)
    assert r.status_code == 403


# ------------------------------- screening exclude / unexclude
def test_screening_exclude_and_remove(admin, active_study):
    sid = active_study["id"]
    r = requests.get(f"{BASE}/research/studies/{sid}/candidates?limit=5", headers=admin)
    assert r.status_code == 200
    rows = r.json()["rows"]
    if not rows:
        pytest.skip("no candidate rows")
    cand = rows[-1]
    # exclude
    r = requests.post(f"{BASE}/research/studies/{sid}/screening/exclude",
                     json={"procedure_id": cand["procedure_id"], "tooth_number": cand["tooth_number"], "reason": "iter444 test exclude"}, headers=admin)
    assert r.status_code == 200, r.text
    # confirm now listed as excluded
    r = requests.get(f"{BASE}/research/studies/{sid}/candidates?limit=200", headers=admin)
    hit = next((x for x in r.json()["rows"] if x["procedure_id"] == cand["procedure_id"] and x["tooth_number"] == cand["tooth_number"]), None)
    assert hit and hit["decision"] == "excluded", hit
    # DELETE unexclude
    r = requests.delete(f"{BASE}/research/studies/{sid}/screening/exclude",
                        params={"procedure_id": cand["procedure_id"], "tooth_number": cand["tooth_number"]}, headers=admin)
    assert r.status_code == 200
    # reason required
    r = requests.post(f"{BASE}/research/studies/{sid}/screening/exclude",
                     json={"procedure_id": cand["procedure_id"], "tooth_number": cand["tooth_number"]}, headers=admin)
    assert r.status_code == 400


# ------------------------------- members add → non-member → member access
def test_members_add_and_access(admin, student, active_study):
    sid = active_study["id"]
    sh, suid = student
    # before: student forbidden
    r = requests.get(f"{BASE}/research/studies/{sid}", headers=sh)
    assert r.status_code == 403
    # pick student via /users
    r = requests.get(f"{BASE}/research/users", headers=admin)
    assert r.status_code == 200
    pick = next((u for u in r.json() if "gaurav" in (u.get("name") or "").lower() and u.get("role") == "student"), None)
    assert pick, "Gaurav user not found"
    r = requests.post(f"{BASE}/research/studies/{sid}/members",
                     json={"members": [{"user_id": pick["id"], "role": "data_collector"}]}, headers=admin)
    assert r.status_code == 200, r.text
    assert any(m["user_id"] == pick["id"] for m in r.json()["members"])
    # after: student can view study
    r = requests.get(f"{BASE}/research/studies/{sid}", headers=sh)
    assert r.status_code == 200
    # my-tasks accessible to student
    r = requests.get(f"{BASE}/research/my-tasks", headers=sh)
    assert r.status_code == 200


# ------------------------------- enrol + withdraw + wide csv de-id
def test_enrol_withdraw_and_export_deid(admin, active_study):
    sid = active_study["id"]
    r = requests.get(f"{BASE}/research/studies/{sid}/candidates?limit=200", headers=admin)
    rows = r.json()["rows"]
    if not rows:
        pytest.skip("no candidate rows")
    cand = rows[0]
    payload = {"procedure_id": cand["procedure_id"], "tooth_number": cand["tooth_number"],
               "checklist_ticked": [True, True, True], "consent_confirmed": True}
    if cand["decision"] != "eligible":
        payload["override_reason"] = "iter444 override"
    r = requests.post(f"{BASE}/research/studies/{sid}/enrol", json=payload, headers=admin)
    assert r.status_code == 200, r.text
    enr = r.json()
    eid = enr["id"]
    assert enr["subject_code"].endswith("-I01") and "-P001-" in enr["subject_code"]
    # withdraw requires reason
    r = requests.post(f"{BASE}/research/enrolments/{eid}/status", json={"status": "withdrawn"}, headers=admin)
    assert r.status_code == 400
    r = requests.post(f"{BASE}/research/enrolments/{eid}/status",
                      json={"status": "withdrawn", "reason": "lost interest", "withdrawal_scope": "future_only"}, headers=admin)
    assert r.status_code == 200
    # wide export de-id: no patient name
    r = requests.get(f"{BASE}/research/studies/{sid}/export?shape=wide", headers=admin)
    assert r.status_code == 200
    pname = cand.get("patient_name") or ""
    if pname:
        assert pname not in r.text, "patient_name should NOT appear in wide CSV"
    # my-tasks works
    r = requests.get(f"{BASE}/research/my-tasks", headers=admin)
    assert r.status_code == 200
