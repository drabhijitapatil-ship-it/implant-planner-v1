"""
iter-Feb-2026 v2 (report iteration_323): Zygoma/Pterygoid workflow tweaks.
Backend regression tests.

Coverage:
- GET /case-form-options returns 15 procedure_types incl new
  'Zygoma, Pterygoid and Conventional Implants' entry.
- POST /procedures with the two new/tweaked types persists & round-trips.
- POST /procedures rejects an invalid implant_procedure_type.
- GET /implant-library/systems?implant_type=advanced returns exactly 2
  (Refirm P-Series + Refirm Z-Series).
- GET /implant-library/systems?implant_type=all returns advanced + conventional
  (>=76).
- Default (no filter) still returns only conventional systems (regression).
"""

import os
from datetime import datetime, timedelta

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not set"
API = f"{BASE_URL}/api"

STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}

NEW_PROC_TYPES = {
    "Quad Zygoma Implants",
    "Zygoma and Pterygoid Implants",
    "Pterygoid and Conventional Implants",
    "Zygoma and Conventional Implants",
    "Zygoma, Pterygoid and Conventional Implants",
}


@pytest.fixture(scope="module")
def student_token():
    r = requests.post(f"{API}/auth/login", json=STUDENT, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    return body.get("access_token") or body.get("token")


@pytest.fixture(scope="module")
def student_headers(student_token):
    return {"Authorization": f"Bearer {student_token}"}


@pytest.fixture(scope="module")
def supervisor_info(student_headers):
    r = requests.get(f"{API}/users?role=supervisor", headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    users = r.json()
    if not users:
        pytest.skip("no supervisor user available")
    return users[0]


@pytest.fixture(scope="module")
def incharge_info(student_headers):
    r = requests.get(
        f"{API}/users?role=implant_incharge", headers=student_headers, timeout=20
    )
    assert r.status_code == 200, r.text
    users = r.json()
    if not users:
        pytest.skip("no implant_incharge user available")
    return users[0]


def _next_weekday_10am(days_offset=3):
    """Return an available Mon-Fri future date >= 24h out, 10:00 slot."""
    d = datetime.now() + timedelta(days=days_offset)
    while d.weekday() >= 5:  # Sat/Sun
        d += timedelta(days=1)
    return d.strftime("%Y-%m-%d")


# ── Change #1: case-form-options ─────────────────────────────────────────
def test_case_form_options_has_15_procedure_types(student_headers):
    r = requests.get(f"{API}/case-form-options", headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    ptypes = data.get("procedure_types", [])
    assert isinstance(ptypes, list)
    assert len(ptypes) == 15, f"expected 15 procedure types, got {len(ptypes)}: {ptypes}"
    for t in NEW_PROC_TYPES:
        assert t in ptypes, f"missing procedure type: {t}"
    assert "Zygoma, Pterygoid and Conventional Implants" in ptypes


# ── POST /procedures with new types ─────────────────────────────────────
def _proc_payload(ptype, supervisor_info, incharge_info, day_offset, tag):
    return {
        "student_name": "Test Student",
        "patient_name": f"TEST_ZP_{tag}",
        "registration_number": f"TEST-ZP-{tag}",
        "supervisor_id": supervisor_info["id"],
        "supervisor_name": supervisor_info["name"],
        "implant_incharge_id": incharge_info["id"],
        "implant_incharge_name": incharge_info["name"],
        "receipt_number": f"REC-TEST-ZP-{tag}",
        "amount_paid": 5000.0,
        "procedure_date": _next_weekday_10am(day_offset),
        "procedure_time": "10:00",
        "implant_procedure_type": ptype,
        "loading_type": ["Delayed Loading"],
        "prosthetic_plan": "Cement Retained Crown - Zirconia",
        "bone_graft_specifications": "TEST",
    }


def test_create_procedure_zygoma_pterygoid_conventional(
    student_headers, supervisor_info, incharge_info
):
    payload = _proc_payload(
        "Zygoma, Pterygoid and Conventional Implants",
        supervisor_info, incharge_info, day_offset=7, tag="ZPC1",
    )
    r = requests.post(f"{API}/procedures", json=payload, headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    proc = r.json()
    assert proc["implant_procedure_type"] == "Zygoma, Pterygoid and Conventional Implants"
    pid = proc["id"]

    # Persistence check
    r = requests.get(f"{API}/procedures/{pid}", headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    got = r.json()
    assert got["implant_procedure_type"] == "Zygoma, Pterygoid and Conventional Implants"


def test_create_procedure_pterygoid_and_conventional(
    student_headers, supervisor_info, incharge_info
):
    payload = _proc_payload(
        "Pterygoid and Conventional Implants",
        supervisor_info, incharge_info, day_offset=8, tag="PC1",
    )
    r = requests.post(f"{API}/procedures", json=payload, headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    proc = r.json()
    assert proc["implant_procedure_type"] == "Pterygoid and Conventional Implants"
    pid = proc["id"]

    r = requests.get(f"{API}/procedures/{pid}", headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    got = r.json()
    assert got["implant_procedure_type"] == "Pterygoid and Conventional Implants"


def test_reject_invalid_procedure_type(student_headers, supervisor_info, incharge_info):
    payload = _proc_payload(
        "Definitely Not Valid",
        supervisor_info, incharge_info, day_offset=9, tag="BAD",
    )
    r = requests.post(f"{API}/procedures", json=payload, headers=student_headers, timeout=20)
    assert r.status_code == 400, r.text
    assert "Invalid implant procedure type" in r.json().get("detail", "")


# ── Implant library / systems filter ────────────────────────────────────
def _extract_systems(response_json):
    if isinstance(response_json, list):
        return response_json
    return response_json.get("systems", response_json.get("data", []))


def test_implant_library_advanced_returns_two(student_headers):
    r = requests.get(
        f"{API}/implant-library/systems",
        params={"implant_type": "advanced"},
        headers=student_headers,
        timeout=20,
    )
    assert r.status_code == 200, r.text
    systems = _extract_systems(r.json())
    assert isinstance(systems, list)
    assert len(systems) == 2, f"expected exactly 2 advanced systems, got {len(systems)}: {systems}"

    names = " | ".join(
        str(s.get("system") or s.get("name") or "").lower() for s in systems
    )
    assert "p-series" in names, f"missing Pterygoid P-Series: {names}"
    assert "z-series" in names, f"missing Zygoma Z-Series: {names}"

    # implant_type field should tag them as advanced (zygoma/pterygoid)
    types_seen = {(s.get("implant_type") or "").lower() for s in systems}
    assert types_seen.issubset({"zygoma", "pterygoid"}), f"unexpected implant_type: {types_seen}"


def test_implant_library_all_returns_at_least_76(student_headers):
    r = requests.get(
        f"{API}/implant-library/systems",
        params={"implant_type": "all"},
        headers=student_headers,
        timeout=20,
    )
    assert r.status_code == 200, r.text
    systems = _extract_systems(r.json())
    assert isinstance(systems, list)
    assert len(systems) >= 76, f"expected >=76 systems for implant_type=all, got {len(systems)}"

    names_lower = " | ".join(
        str(s.get("system") or s.get("name") or "").lower() for s in systems
    )
    assert "p-series" in names_lower, "Advanced Pterygoid P-Series missing from 'all'"
    assert "z-series" in names_lower, "Advanced Zygoma Z-Series missing from 'all'"


def test_implant_library_conventional_default_no_advanced(student_headers):
    """Regression: default (no filter) still returns conventional only —
    Refirm P/Z-Series must NOT leak."""
    r = requests.get(f"{API}/implant-library/systems", headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    systems = _extract_systems(r.json())
    assert isinstance(systems, list)
    assert len(systems) >= 60, f"expected many conventional systems, got {len(systems)}"
    for s in systems:
        it = (s.get("implant_type") or "conventional").lower()
        assert it in ("conventional", ""), f"advanced row leaked into conventional list: {s}"
