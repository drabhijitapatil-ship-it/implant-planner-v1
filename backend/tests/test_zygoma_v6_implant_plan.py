"""
iter-407 v6 — Zygoma/Pterygoid Implant Plan extended fields.

Backend coverage:
  1. Create Quad Zygoma procedure.
  2. POST /procedures/{id}/implant-plan with 4 zygoma rows (ZR1/ZR2/ZL1/ZL2)
     including implant_type='zygoma', side, row_label → 200, count=4.
  3. GET  /procedures/{id}/implant-plan → 4 rows preserved with new fields.
  4. POST with 11 implants → 400 (limit 10).
  5. POST duplicate positions (two ZR1) → 400.
  6. POST mixed payload (zygoma ZR1 + pterygoid PR1 + conventional FDI '15')
     → 200, count=3, GET verifies implant_type per row.
"""
import os
import random
from datetime import datetime, timedelta

import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
    or os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")
)
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not set"
API = f"{BASE_URL}/api"

STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}
ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}
SUPERVISOR = {"identifier": "Paresh.gandhi", "password": "Supervisor@123"}

_TAG = f"{random.randint(1000, 9999)}"
_TIME_H = random.randint(8, 16)
_TIME_1 = f"{_TIME_H:02d}:{random.choice(['05','15','25','35','45','55'])}"
_TIME_2 = f"{_TIME_H + 1:02d}:{random.choice(['05','15','25','35','45','55'])}"


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    if r.status_code != 200:
        return None
    b = r.json()
    return b.get("access_token") or b.get("token")


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def student_headers():
    tok = _login(STUDENT)
    assert tok, "student login failed"
    return _hdr(tok)


def _next_weekday(offset):
    d = datetime.now() + timedelta(days=offset)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d.strftime("%Y-%m-%d")


@pytest.fixture(scope="module")
def supervisor_info(student_headers):
    r = requests.get(f"{API}/users?role=supervisor", headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    users = r.json()
    assert users, "no supervisor found"
    return users[0]


@pytest.fixture(scope="module")
def incharge_info(student_headers):
    r = requests.get(f"{API}/users?role=implant_incharge", headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    users = r.json()
    assert users, "no incharge found"
    return users[0]


@pytest.fixture(scope="module")
def quad_zygoma_case(student_headers, supervisor_info, incharge_info):
    body = {
        "student_name": "Test Student",
        "patient_name": f"TEST_ZV6_QZ_{_TAG}",
        "registration_number": f"TEST-ZV6-{_TAG}-QZ",
        "supervisor_id": supervisor_info["id"],
        "supervisor_name": supervisor_info["name"],
        "implant_incharge_id": incharge_info["id"],
        "implant_incharge_name": incharge_info["name"],
        "receipt_number": f"REC-ZV6-{_TAG}-QZ",
        "amount_paid": 5000.0,
        "procedure_date": _next_weekday(20),
        "procedure_time": _TIME_1,
        "implant_procedure_type": "Quad Zygoma Implants",
        "zygoma_pterygoid_configuration": "Quad zygoma",
        "arch": "Maxillary",
        "loading_type": ["Delayed Loading"],
        "prosthetic_plan": "Fixed hybrid",
        "bone_graft_specifications": "TEST",
    }
    r = requests.post(f"{API}/procedures", json=body, headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def mixed_case(student_headers, supervisor_info, incharge_info):
    body = {
        "student_name": "Test Student",
        "patient_name": f"TEST_ZV6_MIX_{_TAG}",
        "registration_number": f"TEST-ZV6-{_TAG}-MIX",
        "supervisor_id": supervisor_info["id"],
        "supervisor_name": supervisor_info["name"],
        "implant_incharge_id": incharge_info["id"],
        "implant_incharge_name": incharge_info["name"],
        "receipt_number": f"REC-ZV6-{_TAG}-MIX",
        "amount_paid": 5000.0,
        "procedure_date": _next_weekday(21),
        "procedure_time": _TIME_2,
        "implant_procedure_type": "Zygoma, Pterygoid and Conventional Implants",
        "arch": "Maxillary",
        "loading_type": ["Delayed Loading"],
        "prosthetic_plan": "Fixed hybrid",
        "bone_graft_specifications": "TEST",
    }
    r = requests.post(f"{API}/procedures", json=body, headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


# ── 1. POST implant-plan — 4 Quad-Zygoma rows persist w/ new fields ────
def test_post_quad_zygoma_plan(student_headers, quad_zygoma_case):
    pid = quad_zygoma_case["id"]
    payload = {
        "implants": [
            {"position": "ZR1", "brand": "Refirm", "system": "Z-Series",
             "diameter": 4.0, "length": 45, "implant_type": "zygoma",
             "side": "Right", "row_label": "Right #1"},
            {"position": "ZR2", "brand": "Refirm", "system": "Z-Series",
             "diameter": 4.0, "length": 45, "implant_type": "zygoma",
             "side": "Right", "row_label": "Right #2"},
            {"position": "ZL1", "brand": "Refirm", "system": "Z-Series",
             "diameter": 4.0, "length": 50, "implant_type": "zygoma",
             "side": "Left", "row_label": "Left #1"},
            {"position": "ZL2", "brand": "Refirm", "system": "Z-Series",
             "diameter": 4.0, "length": 50, "implant_type": "zygoma",
             "side": "Left", "row_label": "Left #2"},
        ]
    }
    r = requests.post(f"{API}/procedures/{pid}/implant-plan",
                      json=payload, headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("count") == 4, body


# ── 2. GET implant-plan — retains new fields ───────────────────────────
def test_get_quad_zygoma_plan_preserves_fields(student_headers, quad_zygoma_case):
    pid = quad_zygoma_case["id"]
    r = requests.get(f"{API}/procedures/{pid}/implant-plan",
                     headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    plans = body.get("implant_plans") or []
    assert len(plans) == 4, f"expected 4 rows, got {len(plans)}: {plans}"
    by_pos = {p.get("position"): p for p in plans}
    for pos in ("ZR1", "ZR2", "ZL1", "ZL2"):
        assert pos in by_pos, f"missing {pos}"
        p = by_pos[pos]
        assert p.get("implant_type") == "zygoma", p
        assert p.get("side") in ("Right", "Left"), p
        assert p.get("row_label"), p
    assert by_pos["ZR1"]["side"] == "Right"
    assert by_pos["ZR1"]["row_label"] == "Right #1"
    assert by_pos["ZL2"]["side"] == "Left"
    assert by_pos["ZL2"]["row_label"] == "Left #2"


# ── 3. POST >10 implants → 400 ─────────────────────────────────────────
def test_reject_over_ten_implants(student_headers, mixed_case):
    pid = mixed_case["id"]
    implants = [
        {"position": f"P{i}", "brand": "Refirm", "system": "Z-Series",
         "diameter": 4.0, "length": 45, "implant_type": "zygoma"}
        for i in range(11)
    ]
    r = requests.post(f"{API}/procedures/{pid}/implant-plan",
                      json={"implants": implants},
                      headers=student_headers, timeout=20)
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"


# ── 4. Duplicate positions → 400 ───────────────────────────────────────
def test_reject_duplicate_positions(student_headers, mixed_case):
    pid = mixed_case["id"]
    implants = [
        {"position": "ZR1", "brand": "Refirm", "system": "Z-Series",
         "diameter": 4.0, "length": 45, "implant_type": "zygoma",
         "side": "Right", "row_label": "Right #1"},
        {"position": "ZR1", "brand": "Refirm", "system": "Z-Series",
         "diameter": 4.0, "length": 45, "implant_type": "zygoma",
         "side": "Right", "row_label": "Right #1 dup"},
    ]
    r = requests.post(f"{API}/procedures/{pid}/implant-plan",
                      json={"implants": implants},
                      headers=student_headers, timeout=20)
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
    assert "unique" in r.text.lower()


# ── 5. Mixed row payload (zygoma + pterygoid + conventional) → 200 ────
def test_mixed_row_payload(student_headers, mixed_case):
    pid = mixed_case["id"]
    payload = {
        "implants": [
            {"position": "ZR1", "brand": "Refirm", "system": "Z-Series",
             "diameter": 4.0, "length": 45, "implant_type": "zygoma",
             "side": "Right", "row_label": "Right #1"},
            {"position": "PR1", "brand": "Refirm", "system": "Pterygo",
             "diameter": 3.75, "length": 15, "implant_type": "pterygoid",
             "side": "Right", "row_label": "Pterygoid Right"},
            {"position": "15", "brand": "Straumann", "system": "BLX",
             "diameter": 4.0, "length": 10, "implant_type": "conventional"},
        ]
    }
    r = requests.post(f"{API}/procedures/{pid}/implant-plan",
                      json=payload, headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json().get("count") == 3

    # GET verifies the three implant_type values
    r = requests.get(f"{API}/procedures/{pid}/implant-plan",
                     headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    plans = r.json().get("implant_plans") or []
    by_pos = {p.get("position"): p for p in plans}
    assert by_pos.get("ZR1", {}).get("implant_type") == "zygoma"
    assert by_pos.get("PR1", {}).get("implant_type") == "pterygoid"
    assert by_pos.get("15", {}).get("implant_type") == "conventional"
