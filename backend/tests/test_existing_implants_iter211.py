"""iter-211: tests for POST /api/procedures/with-existing-implants (Path A)."""
import os
import pytest
import requests
from datetime import datetime, timedelta

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://dental-workflow-18.preview.emergentagent.com").rstrip("/")
ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}

SUPERVISOR_ID = "69b79407a17f36c024eb2d60"
SUPERVISOR_NAME = "Dr. Paresh Gandhi"
INCHARGE_ID = "69b79407a17f36c024eb2d5f"
INCHARGE_NAME = "Dr. Ajay Sabane"


def _future_weekday(offset_days=30):
    d = datetime.now() + timedelta(days=offset_days)
    while d.weekday() >= 5:  # Mon-Fri only
        d += timedelta(days=1)
    return d.strftime("%Y-%m-%d")


import random
_RUN_SEED = random.randint(200, 800)
# Per-test unique offsets so duplicate-slot guard does not cross-contaminate
_OFFSET = {"A1": _RUN_SEED + 1, "A2": _RUN_SEED + 15, "A3": _RUN_SEED + 30,
           "A4": _RUN_SEED + 45, "L1": _RUN_SEED + 60, "FR": _RUN_SEED + 75,
           "D": _RUN_SEED + 90}


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture
def auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _minimal_payload(date=None, time="14:00", suffix="A1"):
    return {
        "patient_name": f"TEST_iter211{suffix}",
        "registration_number": f"TEST-MR-{datetime.now().strftime('%H%M%S')}{suffix}",
        "supervisor_id": SUPERVISOR_ID,
        "supervisor_name": SUPERVISOR_NAME,
        "implant_incharge_id": INCHARGE_ID,
        "implant_incharge_name": INCHARGE_NAME,
        "receipt_number": f"R-{datetime.now().strftime('%H%M%S')}{suffix}",
        "amount_paid": 5000,
        "procedure_date": date or _future_weekday(_OFFSET.get(suffix, 200)),
        "procedure_time": time,
        "existing_implants": [{"tooth": "16"}],
    }


# ── iter-211: minimal happy path ─────────────────────────────────────
class TestExistingImplantsCreate:
    def test_minimal_payload_creates_case(self, auth):
        payload = _minimal_payload(suffix="A1")
        r = requests.post(f"{BASE_URL}/api/procedures/with-existing-implants",
                          json=payload, headers=auth, timeout=20)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        data = r.json()
        assert "id" in data
        assert data["status"] == "pending_stage2_prosthetic"
        # Verify GET returns it with new fields
        gid = data["id"]
        g = requests.get(f"{BASE_URL}/api/procedures/{gid}", headers=auth, timeout=15)
        assert g.status_code == 200, g.text
        gd = g.json()
        assert gd["case_origin"] == "existing_implants"
        assert gd["phase1_skipped"] is True
        assert gd["phase2_skipped"] is True
        assert gd["phase3_skipped"] is True
        assert gd["status"] == "pending_stage2_prosthetic"
        assert gd["current_phase"] == 4
        assert gd["supervisor_phase1_approved"] is True
        assert gd["implant_incharge_phase1_approved"] is True
        assert gd["supervisor_phase2_approved"] is True
        assert gd["implant_incharge_phase2_approved"] is True
        assert gd["phase3_approved"] is True
        assert isinstance(gd.get("existing_implants"), list)
        assert len(gd["existing_implants"]) == 1
        assert gd["existing_implants"][0]["tooth"] == "16"
        assert "prosthesis_history" in gd

    def test_system_unknown_implant(self, auth):
        payload = _minimal_payload(suffix="A2")
        payload["existing_implants"] = [{"tooth": "26", "system_unknown": True}]
        r = requests.post(f"{BASE_URL}/api/procedures/with-existing-implants",
                          json=payload, headers=auth, timeout=20)
        assert r.status_code == 200, r.text
        gid = r.json()["id"]
        g = requests.get(f"{BASE_URL}/api/procedures/{gid}", headers=auth, timeout=15)
        gd = g.json()
        row = gd["existing_implants"][0]
        assert row["system_unknown"] is True
        assert row["tooth"] == "26"
        # brand/system can be missing or None
        assert row.get("brand") in (None, "")

    def test_prosthesis_history_failed_round_trip(self, auth):
        payload = _minimal_payload(suffix="A3")
        payload["prosthesis_history"] = {
            "had_prosthesis": True,
            "prosthesis_type": "Bridge",
            "material": "PFM",
            "failed": True,
            "failure_categories": ["Mechanical", "Esthetic"],
            "failure_modes": ["porcelain_chipping", "screw_loosening"],
            "suspected_root_causes": ["occlusal_overload", "parafunction"],
            "failure_narrative": "Patient grinds at night, multiple chip events.",
            "attachments": ["https://example.com/p.jpg"],
        }
        r = requests.post(f"{BASE_URL}/api/procedures/with-existing-implants",
                          json=payload, headers=auth, timeout=20)
        assert r.status_code == 200, r.text
        gid = r.json()["id"]
        g = requests.get(f"{BASE_URL}/api/procedures/{gid}", headers=auth, timeout=15).json()
        ph = g["prosthesis_history"]
        assert ph["had_prosthesis"] is True
        assert ph["failed"] is True
        assert "Mechanical" in ph["failure_categories"]
        assert "porcelain_chipping" in ph["failure_modes"]
        assert "occlusal_overload" in ph["suspected_root_causes"]
        assert ph["failure_narrative"].startswith("Patient grinds")
        assert ph["attachments"] == ["https://example.com/p.jpg"]

    def test_empty_existing_implants_returns_422(self, auth):
        payload = _minimal_payload(suffix="A4")
        payload["existing_implants"] = []
        r = requests.post(f"{BASE_URL}/api/procedures/with-existing-implants",
                          json=payload, headers=auth, timeout=20)
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text}"

    @pytest.mark.parametrize("missing_field", [
        "patient_name", "registration_number", "supervisor_id",
        "implant_incharge_id", "receipt_number", "amount_paid",
        "procedure_date", "procedure_time",
    ])
    def test_missing_required_field_returns_422(self, auth, missing_field):
        payload = _minimal_payload(suffix=f"M{missing_field[:3]}")
        payload.pop(missing_field, None)
        r = requests.post(f"{BASE_URL}/api/procedures/with-existing-implants",
                          json=payload, headers=auth, timeout=20)
        assert r.status_code == 422, f"{missing_field} → {r.status_code}: {r.text[:200]}"

    def test_duplicate_slot_returns_409(self, auth):
        d = _future_weekday(_OFFSET["D"])
        t = "14:00"
        p1 = _minimal_payload(date=d, time=t, suffix="D1")
        p2 = _minimal_payload(date=d, time=t, suffix="D2")
        r1 = requests.post(f"{BASE_URL}/api/procedures/with-existing-implants",
                           json=p1, headers=auth, timeout=20)
        assert r1.status_code == 200, r1.text
        r2 = requests.post(f"{BASE_URL}/api/procedures/with-existing-implants",
                           json=p2, headers=auth, timeout=20)
        assert r2.status_code == 409, f"expected 409, got {r2.status_code}: {r2.text}"

    def test_appears_in_procedures_list(self, auth):
        payload = _minimal_payload(suffix="L1")
        r = requests.post(f"{BASE_URL}/api/procedures/with-existing-implants",
                          json=payload, headers=auth, timeout=20)
        assert r.status_code == 200, r.text
        new_id = r.json()["id"]
        lr = requests.get(f"{BASE_URL}/api/procedures", headers=auth, timeout=15)
        assert lr.status_code == 200
        items = lr.json()
        match = next((p for p in items if p.get("id") == new_id or p.get("_id") == new_id), None)
        assert match is not None, "new procedure not found in list"
        assert match["status"] == "pending_stage2_prosthetic"


# ── iter-211: regression — fresh-case endpoint still works ───────────
class TestFreshCaseRegression:
    def test_fresh_case_endpoint_responds(self, auth):
        # Just ensure the fresh-case endpoint is still mounted and reachable;
        # detailed contract is covered by the iter-205 / iter-210 regression suites.
        r = requests.post(f"{BASE_URL}/api/procedures",
                          json={}, headers=auth, timeout=15)
        # 422 (Pydantic validation error) means the endpoint is mounted and validating.
        assert r.status_code in (400, 422), f"{r.status_code}: {r.text[:200]}"
