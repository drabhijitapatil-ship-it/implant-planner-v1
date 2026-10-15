"""Research Module — department-wide recruitment: inclusion requests, offers, case collaborators."""
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
def pi():  # student PI with no cases of their own
    return _login("Atharva.mahadik", "Student@123")


@pytest.fixture(scope="module")
def treating():  # student who treats cases
    return _login("Gaurav.pandey", "Student@123")


@pytest.fixture(scope="module")
def guide():
    return _login("Rajshree.jadhav", "Supervisor@123")


@pytest.fixture(scope="module")
def incharge():
    return _login("Abhijit.patil", "Admin@123")


@pytest.fixture(scope="module")
def study(pi, guide):
    h, me = pi
    hg, g = guide
    code = f"D{int(time.time()) % 100000}"
    r = requests.post(f"{BASE}/research/studies", json={"template_id": "isq_stability_over_time", "code": code, "title": "Dept-wide test"}, headers=h)
    assert r.status_code == 200, r.text
    st = r.json(); sid = st["id"]
    r = requests.put(f"{BASE}/research/studies/{sid}", json={"iec_ref": "IEC/2026/99", "iec_approval_date": "2026-01-15", "consent_form_version": "v1",
                                                            "recruitment_scope": "department"}, headers=h)
    assert r.status_code == 200, r.text
    labels = {i["label"]: i["ok"] for i in r.json()["activation_checklist"]}
    assert labels["Multi-operator (department-wide) recruitment declared to IEC"] is False
    requests.put(f"{BASE}/research/studies/{sid}", json={"iec_multi_operator_declared": True}, headers=h)
    assert requests.post(f"{BASE}/research/studies/{sid}/members", json={"members": [{"user_id": g["id"], "role": "guide"}]}, headers=h).status_code == 200
    assert requests.post(f"{BASE}/research/studies/{sid}/submit-to-guide", json={}, headers=h).status_code == 200
    assert requests.post(f"{BASE}/research/studies/{sid}/guide-review", json={"action": "approve", "comments": "ok"}, headers=hg).status_code == 200
    r = requests.post(f"{BASE}/research/studies/{sid}/status", json={"status": "active"}, headers=h)
    assert r.status_code == 200, r.text
    yield r.json()
    requests.post(f"{BASE}/research/studies/{sid}/status", json={"status": "archived"}, headers=h)
    from _research_cleanup import purge_study
    purge_study(sid)
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

    async def _c():
        db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ.get("DB_NAME", "test_database")]
        await db.research_inclusion_requests.delete_many({"study_id": sid})
        await db.notifications.delete_many({"research_study_id": sid})
    asyncio.run(_c())


def _dept_candidates(sid, h):
    return requests.get(f"{BASE}/research/studies/{sid}/candidates?limit=200", headers=h).json()


def test_department_screening_is_deidentified(study, pi):
    h, _ = pi
    c = _dept_candidates(study["id"], h)
    assert c["summary"]["department_wide"] is True and c["total"] > 0
    foreign = [r for r in c["rows"] if not r["accessible"]]
    assert foreign, "student PI should see other clinicians' cases de-identified"
    for r in foreign:
        assert r["patient_name"] is None and r["can_enrol_directly"] is False
    # direct enrol of a foreign case is refused
    cand = next(r for r in foreign if r["decision"] in ("eligible", "needs_review"))
    r = requests.post(f"{BASE}/research/studies/{study['id']}/enrol", json={"procedure_id": cand["procedure_id"], "tooth_number": cand["tooth_number"],
                                                                            "checklist_ticked": [True] * 5, "consent_confirmed": True, "override_reason": "x"}, headers=h)
    assert r.status_code in (403, 404), r.text


def test_incharge_also_follows_request_flow(study, incharge):
    h, _ = incharge
    # In-charge is only an observer here (not on the team): screening itself is readable, enrol forbidden
    c = _dept_candidates(study["id"], h)
    assert all(r["accessible"] for r in c["rows"])  # they can open every case clinically…
    assert all(r["can_enrol_directly"] is False for r in c["rows"] if r["treating"]["student_name"] and "Abhijit" not in (r["treating"]["supervisor_name"] or ""))


def test_request_accept_creates_collaborator(study, pi, treating, guide):
    h, me = pi
    ht, tme = treating
    sid = study["id"]
    c = _dept_candidates(sid, h)
    cand = next(r for r in c["rows"] if not r["accessible"] and r["decision"] == "eligible" and (r["treating"]["student_name"] or "").lower().find("gaurav") >= 0)
    # request
    r = requests.post(f"{BASE}/research/studies/{sid}/inclusion-requests", json={"procedure_id": cand["procedure_id"], "tooth_number": cand["tooth_number"], "message": "Fits our CBL study"}, headers=h)
    assert r.status_code == 200, r.text
    req = r.json()
    assert req["status"] == "pending" and req["direction"] == "request" and tme["id"] in req["responders"]
    # duplicate blocked
    assert requests.post(f"{BASE}/research/studies/{sid}/inclusion-requests", json={"procedure_id": cand["procedure_id"], "tooth_number": cand["tooth_number"]}, headers=h).status_code == 400
    # screening row shows pending
    row = next(r for r in _dept_candidates(sid, h)["rows"] if r["procedure_id"] == cand["procedure_id"] and r["tooth_number"] == cand["tooth_number"])
    assert row["inclusion_request"]["status"] == "pending"
    # treating clinician sees it incoming, with patient identity
    mine = requests.get(f"{BASE}/research/inclusion-requests/mine", headers=ht).json()
    inc = next(x for x in mine["incoming"] if x["id"] == req["id"])
    assert inc["patient_name"] and inc["case_accessible"]
    detail = requests.get(f"{BASE}/research/inclusion-requests/{req['id']}", headers=ht).json()
    assert detail["can_respond"] is True and detail["study"]["code"] == study["code"]
    # PI cannot respond to their own request; random outsider cannot see it
    assert requests.post(f"{BASE}/research/inclusion-requests/{req['id']}/respond", json={"action": "accept", "consent_confirmed": True}, headers=h).status_code == 403
    # accept without consent → 400
    assert requests.post(f"{BASE}/research/inclusion-requests/{req['id']}/respond", json={"action": "accept", "checklist_ticked": [True] * 5}, headers=ht).status_code == 400
    r = requests.post(f"{BASE}/research/inclusion-requests/{req['id']}/respond", json={"action": "accept", "consent_confirmed": True, "checklist_ticked": [True] * 5, "consent_language": "Marathi"}, headers=ht)
    assert r.status_code == 200, r.text
    enr = r.json()["enrolment"]
    assert enr["consent"]["confirmed_by_id"] == tme["id"] and any(cb["user_id"] == tme["id"] for cb in enr["collaborators"])
    # treating clinician now has case-level access (collaborator), but not study-wide access
    lst = requests.get(f"{BASE}/research/studies", headers=ht).json()
    row = next(s for s in lst if s["id"] == sid)
    assert row["my_roles"] == ["case_collaborator"]
    assert requests.get(f"{BASE}/research/studies/{sid}", headers=ht).status_code == 200
    e = requests.get(f"{BASE}/research/enrolments/{enr['id']}", headers=ht)
    assert e.status_code == 200 and e.json()["patient_name"]
    tp0 = enr["forms"][0]["timepoint_key"]
    r = requests.put(f"{BASE}/research/enrolments/{enr['id']}/forms/{tp0}", json={"action": "save", "values": {}}, headers=ht)
    assert r.status_code == 200, r.text
    assert requests.get(f"{BASE}/research/studies/{sid}/candidates", headers=ht).status_code == 403
    assert requests.get(f"{BASE}/research/studies/{sid}/export?shape=long", headers=ht).status_code == 403
    assert requests.get(f"{BASE}/research/studies/{sid}/audit", headers=ht).status_code == 403
    mine_enr = requests.get(f"{BASE}/research/studies/{sid}/enrolments", headers=ht).json()
    assert [x["id"] for x in mine_enr] == [enr["id"]]
    # the PI sees the enrolment but no patient name (never treated the case)
    pe = requests.get(f"{BASE}/research/enrolments/{enr['id']}", headers=h).json()
    assert pe["patient_name"] is None and pe["subject_code"] == enr["subject_code"]
    # tasks for the collaborator include this case only
    tasks = requests.get(f"{BASE}/research/my-tasks", headers=ht).json()
    assert all(t["study_code"] != study["code"] or t["enrolment_id"] == enr["id"] for t in tasks)
    # audit
    acts = [a["action"] for a in requests.get(f"{BASE}/research/studies/{sid}/audit", headers=h).json()["entries"]]
    assert "inclusion_requested" in acts and "inclusion_accepted" in acts and "enrolled" in acts


def test_decline_and_offer_flow(study, pi, treating):
    h, me = pi
    ht, tme = treating
    sid = study["id"]
    c = _dept_candidates(sid, h)
    cands = [r for r in c["rows"] if not r["accessible"] and r["decision"] == "eligible" and (r["treating"]["student_name"] or "").lower().find("gaurav") >= 0 and not r["inclusion_request"]]
    assert len(cands) >= 2
    a, b = cands[0], cands[1]
    # decline needs a reason
    req = requests.post(f"{BASE}/research/studies/{sid}/inclusion-requests", json={"procedure_id": a["procedure_id"], "tooth_number": a["tooth_number"]}, headers=h).json()
    assert requests.post(f"{BASE}/research/inclusion-requests/{req['id']}/respond", json={"action": "decline"}, headers=ht).status_code == 400
    r = requests.post(f"{BASE}/research/inclusion-requests/{req['id']}/respond", json={"action": "decline", "reason": "Patient refused research participation"}, headers=ht)
    assert r.status_code == 200 and r.json()["status"] == "declined"
    row = next(r for r in _dept_candidates(sid, h)["rows"] if r["procedure_id"] == a["procedure_id"] and r["tooth_number"] == a["tooth_number"])
    assert row["inclusion_request"]["status"] == "declined" and "refused" in row["inclusion_request"]["decision_reason"]
    # offer: treating clinician sees the study as offerable on the case card
    card = requests.get(f"{BASE}/research/case/{b['procedure_id']}", headers=ht).json()
    off = next(o for o in card["offerable"] if o["study_id"] == sid and o["tooth_number"] == b["tooth_number"])
    assert off["pi_name"] and off["pending_request"] is None
    assert requests.post(f"{BASE}/research/offers", json={"study_id": sid, "procedure_id": b["procedure_id"], "tooth_number": b["tooth_number"]}, headers=ht).status_code == 400  # consent required
    r = requests.post(f"{BASE}/research/offers", json={"study_id": sid, "procedure_id": b["procedure_id"], "tooth_number": b["tooth_number"], "consent_confirmed": True,
                                                       "checklist_ticked": [True] * 5, "message": "Good candidate"}, headers=ht)
    assert r.status_code == 200, r.text
    offer = r.json()
    assert offer["direction"] == "offer" and me["id"] in offer["responders"]
    card = requests.get(f"{BASE}/research/case/{b['procedure_id']}", headers=ht).json()
    assert next(o for o in card["offerable"] if o["study_id"] == sid and o["tooth_number"] == b["tooth_number"])["pending_request"]["direction"] == "offer"
    # PI accepts the offer
    mine = requests.get(f"{BASE}/research/inclusion-requests/mine", headers=h).json()
    assert any(x["id"] == offer["id"] for x in mine["incoming"])
    r = requests.post(f"{BASE}/research/inclusion-requests/{offer['id']}/respond", json={"action": "accept"}, headers=h)
    assert r.status_code == 200, r.text
    enr = r.json()["enrolment"]
    assert enr["consent"]["confirmed_by_id"] == tme["id"] and enr["enrolled_by_id"] == me["id"]
    # cancel path
    cands2 = [r for r in _dept_candidates(sid, h)["rows"] if not r["accessible"] and r["decision"] == "eligible" and not r["inclusion_request"]]
    if cands2:
        rq = requests.post(f"{BASE}/research/studies/{sid}/inclusion-requests", json={"procedure_id": cands2[0]["procedure_id"], "tooth_number": cands2[0]["tooth_number"]}, headers=h).json()
        assert requests.post(f"{BASE}/research/inclusion-requests/{rq['id']}/cancel", headers=ht).status_code == 403
        assert requests.post(f"{BASE}/research/inclusion-requests/{rq['id']}/cancel", headers=h).status_code == 200
