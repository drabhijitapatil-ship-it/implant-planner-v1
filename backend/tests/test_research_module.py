"""Research module smoke/integration test — run with: python -m pytest backend/tests/test_research_module.py -q"""
import os
import requests
import pytest

BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "http://localhost:8001").rstrip("/") + "/api"


def _login(ident, pwd):
    r = requests.post(f"{BASE}/auth/login", json={"identifier": ident, "password": pwd})
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin():
    return _login("Abhijit.patil", "Admin@123")


@pytest.fixture(scope="module")
def student():
    return _login("Gaurav.pandey", "Student@123")


@pytest.fixture(scope="module")
def study(admin):
    import time
    code = f"T{int(time.time()) % 100000}"
    r = requests.post(f"{BASE}/research/studies", json={"template_id": "cbl_immediate_maxillary_anterior", "code": code, "title": "Test CBL"}, headers=admin)
    assert r.status_code == 200, r.text
    st = r.json()
    yield st
    requests.post(f"{BASE}/research/studies/{st['id']}/status", json={"status": "archived"}, headers=admin)
    requests.delete(f"{BASE}/research/studies/{st['id']}", headers=admin)


def test_registry_and_templates(admin):
    r = requests.get(f"{BASE}/research/registry", headers=admin)
    assert r.status_code == 200 and any(f["path"] == "implant.site_fdi" for f in r.json()["fields"])
    r = requests.get(f"{BASE}/research/templates", headers=admin)
    assert r.status_code == 200 and len(r.json()) >= 3


def test_activation_blocked_then_ok(admin, study):
    sid = study["id"]
    r = requests.post(f"{BASE}/research/studies/{sid}/status", json={"status": "active"}, headers=admin)
    assert r.status_code == 400 and "IEC" in r.json()["detail"]
    r = requests.put(f"{BASE}/research/studies/{sid}", json={"iec_ref": "IEC/2026/01", "iec_approval_date": "2026-01-15", "consent_form_version": "v1"}, headers=admin)
    assert r.status_code == 200, r.text
    assert all(i["ok"] for i in r.json()["activation_checklist"]), r.json()["activation_checklist"]
    r = requests.post(f"{BASE}/research/studies/{sid}/status", json={"status": "active"}, headers=admin)
    assert r.status_code == 200 and r.json()["status"] == "active"


def test_active_protocol_cannot_remove_variables(admin, study):
    sid = study["id"]
    st = requests.get(f"{BASE}/research/studies/{sid}", headers=admin).json()
    r = requests.put(f"{BASE}/research/studies/{sid}", json={"variables": st["variables"][:-1]}, headers=admin)
    assert r.status_code == 400


def test_candidates_enrol_form_dashboard_export(admin, study):
    sid = study["id"]
    r = requests.get(f"{BASE}/research/studies/{sid}/candidates?limit=200", headers=admin)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["summary"]["cases_scanned"] > 0
    rows = body["rows"]
    assert rows, "no candidate sites"
    cand = rows[0]
    payload = {"procedure_id": cand["procedure_id"], "tooth_number": cand["tooth_number"], "checklist_ticked": [True, True, True], "consent_confirmed": True}
    if cand["decision"] != "eligible":
        payload["override_reason"] = "test override"
    r = requests.post(f"{BASE}/research/studies/{sid}/enrol", json=payload, headers=admin)
    assert r.status_code == 200, r.text
    enr = r.json()
    assert enr["subject_code"].endswith("-P001-I01")
    assert len(enr["forms"]) == 5
    eid = enr["id"]
    # duplicate blocked
    r = requests.post(f"{BASE}/research/studies/{sid}/enrol", json=payload, headers=admin)
    assert r.status_code == 400
    # save baseline with a required field missing → complete blocked
    r = requests.put(f"{BASE}/research/enrolments/{eid}/forms/baseline", json={"action": "complete", "visit_date": "2026-01-10", "values": {"bl_mesial": 0.4}}, headers=admin)
    assert r.status_code == 400, r.text
    vals = {"bl_mesial": 0.4, "bl_distal": 0.5, "socket_type": "1", "jump_gap_mm": 2.5, "isq": 70}
    r = requests.put(f"{BASE}/research/enrolments/{eid}/forms/baseline", json={"action": "complete", "visit_date": "2026-01-10", "values": vals, "deviation_reason": "retrospective entry"}, headers=admin)
    assert r.status_code == 200, r.text
    base = next(f for f in r.json()["forms"] if f["timepoint_key"] == "baseline")
    assert base["status"] == "completed"
    # m12 with derived CBL (soft warning > 1.5 requires confirm)
    r = requests.put(f"{BASE}/research/enrolments/{eid}/forms/m12", json={"action": "save", "values": {"bl_mesial": 1.3, "bl_distal": 1.1}}, headers=admin)
    assert r.status_code == 200, r.text
    m12 = next(f for f in r.json()["forms"] if f["timepoint_key"] == "m12")
    assert abs(m12["derived"]["cbl_mesial"] - 0.9) < 1e-6
    assert abs(m12["derived"]["cbl_mean"] - 0.75) < 1e-6
    assert m12["derived"]["success_flag"] is True
    # lock baseline → snapshot
    r = requests.put(f"{BASE}/research/enrolments/{eid}/forms/baseline", json={"action": "lock", "visit_date": "2026-01-10", "values": vals, "deviation_reason": "retro", "reason": "lock"}, headers=admin)
    assert r.status_code == 200, r.text
    base = next(f for f in r.json()["forms"] if f["timepoint_key"] == "baseline")
    assert base["status"] == "locked" and "linked_snapshot" in base
    r = requests.put(f"{BASE}/research/enrolments/{eid}/forms/baseline", json={"action": "save", "values": vals}, headers=admin)
    assert r.status_code == 400
    r = requests.put(f"{BASE}/research/enrolments/{eid}/forms/baseline", json={"action": "unlock", "reason": "fix typo"}, headers=admin)
    assert r.status_code == 200
    # dashboard + export
    r = requests.get(f"{BASE}/research/studies/{sid}/dashboard", headers=admin)
    assert r.status_code == 200 and r.json()["flow"]["enrolled"] == 1
    for shape in ("wide", "long", "dictionary", "methods"):
        r = requests.get(f"{BASE}/research/studies/{sid}/export?shape={shape}", headers=admin)
        assert r.status_code == 200, shape
        if shape == "wide":
            assert "bl_mesial__baseline" in r.text and cand["patient_name"] not in r.text
    # case card
    r = requests.get(f"{BASE}/research/case/{cand['procedure_id']}", headers=admin)
    assert r.status_code == 200 and r.json()["enrolled"][0]["subject_code"] == enr["subject_code"]
    # my tasks
    assert requests.get(f"{BASE}/research/my-tasks", headers=admin).status_code == 200


def test_non_member_forbidden(student, study):
    r = requests.get(f"{BASE}/research/studies/{study['id']}", headers=student)
    assert r.status_code == 403
    r = requests.get(f"{BASE}/research/studies", headers=student)
    assert r.status_code == 200


def test_phase1_fields_queries_images_synopsis(admin, study):
    """iter-445: new registry fields, data queries, radiograph upload + calibrated measurement, synopsis export."""
    import io
    from PIL import Image
    sid = study["id"]
    reg = {f["path"] for f in requests.get(f"{BASE}/research/registry", headers=admin).json()["fields"]}
    assert {"patient.medical.hba1c_pct", "patient.medical.cigarettes_per_day", "patient.medical.bisphosphonate_history", "site.socket_type"} <= reg
    eid = requests.get(f"{BASE}/research/studies/{sid}/enrolments", headers=admin).json()[0]["id"]
    # image upload + measure
    img = Image.new("RGB", (800, 600), "gray"); b = io.BytesIO(); img.save(b, "JPEG")
    r = requests.post(f"{BASE}/research/enrolments/{eid}/forms/m6/image", files={"file": ("iopa.jpg", b.getvalue(), "image/jpeg")}, data={"slot": "iopa"}, headers=admin)
    assert r.status_code == 200, r.text
    r = requests.put(f"{BASE}/research/enrolments/{eid}/forms/m6/image/iopa/measure", json={"measurements": {"bl_mesial": {"p1": [0, 0], "p2": [0, 100]}}}, headers=admin)
    assert r.status_code == 400  # calibration required (BR-22)
    r = requests.put(f"{BASE}/research/enrolments/{eid}/forms/m6/image/iopa/measure",
                     json={"calibration": {"p1": [100, 100], "p2": [100, 330], "reference_length_mm": 11.5}, "measurements": {"bl_mesial": {"p1": [0, 0], "p2": [0, 40]}}}, headers=admin)
    assert r.status_code == 200, r.text
    f = next(x for x in r.json()["forms"] if x["timepoint_key"] == "m6")
    assert f["values"]["bl_mesial"] == 2.0 and f["images"]["iopa"]["quality_grade"] == "B"
    tok = admin["Authorization"].split()[1]
    assert requests.get(f"{BASE}/research/images/{eid}/m6/iopa?token={tok}").status_code == 200
    assert requests.get(f"{BASE}/research/images/{eid}/m6/iopa?token=bad").status_code == 401
    # data query lifecycle
    r = requests.post(f"{BASE}/research/enrolments/{eid}/queries", json={"text": "check", "timepoint_key": "m6", "variable_key": "bl_mesial", "value_at_raise": 2.0}, headers=admin)
    assert r.status_code == 200 and r.json()["status"] == "open"
    qid = r.json()["id"]
    assert requests.post(f"{BASE}/research/queries/{qid}/reply", json={"action": "answer", "text": "fixed"}, headers=admin).json()["status"] == "answered"
    assert requests.post(f"{BASE}/research/queries/{qid}/reply", json={"action": "close"}, headers=admin).json()["status"] == "closed"
    assert len(requests.get(f"{BASE}/research/studies/{sid}/queries?status=closed", headers=admin).json()) >= 1
    # synopsis
    assert requests.put(f"{BASE}/research/studies/{sid}/synopsis", json={"university_name": "MUHS", "introduction": "Intro"}, headers=admin).status_code == 200
    r = requests.get(f"{BASE}/research/studies/{sid}/synopsis.docx", headers=admin); assert r.status_code == 200 and r.content[:2] == b"PK"
    r = requests.get(f"{BASE}/research/studies/{sid}/synopsis.pdf", headers=admin); assert r.status_code == 200 and r.content[:4] == b"%PDF"
