"""
iter-Feb-2026 v3 (Zygoma/Pterygoid workflow changes #1-#5).
Backend regression tests for `conventional_implant_locations` field
persistence and arch='Maxillary' acceptance on Zygoma types.
"""
import os
import random
from datetime import datetime, timedelta

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not set"
API = f"{BASE_URL}/api"

STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}

# Random 4-char tag per session to avoid slot/receipt collisions across reruns.
_TAG = f"{random.randint(1000, 9999)}"


@pytest.fixture(scope="module")
def student_headers():
    r = requests.post(f"{API}/auth/login", json=STUDENT, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    tok = body.get("access_token") or body.get("token")
    return {"Authorization": f"Bearer {tok}"}


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
    r = requests.get(f"{API}/users?role=implant_incharge", headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    users = r.json()
    if not users:
        pytest.skip("no implant_incharge user available")
    return users[0]


def _next_weekday(offset_days: int) -> str:
    d = datetime.now() + timedelta(days=offset_days)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d.strftime("%Y-%m-%d")


def _payload(ptype: str, offset: int, tag_suffix: str, *, sup, inc,
             conv_locs=None, arch=None):
    body = {
        "student_name": "Test Student",
        "patient_name": f"TEST_ZV3_{tag_suffix}",
        "registration_number": f"TEST-ZV3-{_TAG}-{tag_suffix}",
        "supervisor_id": sup["id"],
        "supervisor_name": sup["name"],
        "implant_incharge_id": inc["id"],
        "implant_incharge_name": inc["name"],
        "receipt_number": f"REC-ZV3-{_TAG}-{tag_suffix}",
        "amount_paid": 5000.0,
        "procedure_date": _next_weekday(offset),
        "procedure_time": f"{9 + (offset % 6):02d}:00",
        "implant_procedure_type": ptype,
        "loading_type": ["Delayed Loading"],
        "prosthetic_plan": "Cement Retained Crown - Zirconia",
        "bone_graft_specifications": "TEST",
    }
    if conv_locs is not None:
        body["conventional_implant_locations"] = conv_locs
    if arch is not None:
        body["arch"] = arch
    return body


# ── Change #2 & #3 — conventional_implant_locations round-trip ─────────
def test_zygoma_pterygoid_conventional_persists_locations(
    student_headers, supervisor_info, incharge_info
):
    payload = _payload(
        "Zygoma, Pterygoid and Conventional Implants",
        offset=11, tag_suffix="ZPC",
        sup=supervisor_info, inc=incharge_info,
        conv_locs=["11", "21", "12", "22"],
        arch="Maxillary",
    )
    r = requests.post(f"{API}/procedures", json=payload,
                      headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    proc = r.json()
    pid = proc["id"]

    assert proc.get("conventional_implant_locations") == ["11", "21", "12", "22"], (
        f"POST response missing/wrong locations: {proc.get('conventional_implant_locations')}"
    )

    # GET round-trip
    r = requests.get(f"{API}/procedures/{pid}", headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    got = r.json()
    assert got["implant_procedure_type"] == "Zygoma, Pterygoid and Conventional Implants"
    assert got.get("conventional_implant_locations") == ["11", "21", "12", "22"], (
        f"GET response missing/wrong locations: {got.get('conventional_implant_locations')}"
    )


def test_pterygoid_and_conventional_persists_locations(
    student_headers, supervisor_info, incharge_info
):
    payload = _payload(
        "Pterygoid and Conventional Implants",
        offset=12, tag_suffix="PC",
        sup=supervisor_info, inc=incharge_info,
        conv_locs=["16", "26"],
    )
    r = requests.post(f"{API}/procedures", json=payload,
                      headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    proc = r.json()
    pid = proc["id"]
    assert proc.get("conventional_implant_locations") == ["16", "26"], (
        f"POST response mismatch: {proc.get('conventional_implant_locations')}"
    )

    r = requests.get(f"{API}/procedures/{pid}", headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    got = r.json()
    assert got.get("conventional_implant_locations") == ["16", "26"]


# ── Change #1 — Zygoma type + arch='Maxillary' accepted ────────────────
def test_zygoma_type_accepts_arch_maxillary(
    student_headers, supervisor_info, incharge_info
):
    payload = _payload(
        "Quad Zygoma Implants",
        offset=13, tag_suffix="QZM",
        sup=supervisor_info, inc=incharge_info,
        arch="Maxillary",
    )
    r = requests.post(f"{API}/procedures", json=payload,
                      headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    proc = r.json()
    pid = proc["id"]
    assert proc.get("arch") == "Maxillary", f"arch not persisted: {proc.get('arch')}"

    r = requests.get(f"{API}/procedures/{pid}", headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    got = r.json()
    assert got.get("arch") == "Maxillary"


# ── Regression — Zygoma type without conv_locations still works ────────
def test_quad_zygoma_no_conv_locations_defaults_empty(
    student_headers, supervisor_info, incharge_info
):
    payload = _payload(
        "Zygoma and Pterygoid Implants",
        offset=14, tag_suffix="ZP",
        sup=supervisor_info, inc=incharge_info,
        arch="Maxillary",
    )
    r = requests.post(f"{API}/procedures", json=payload,
                      headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    proc = r.json()
    # Absent or empty list both acceptable
    locs = proc.get("conventional_implant_locations")
    assert locs in (None, []), f"expected empty/None, got {locs}"
