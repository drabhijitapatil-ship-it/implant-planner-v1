"""iter-213: tests for POST /api/procedures/with-existing-implants extended fields.

Coverage:
- phase_to_start routing matrix: phase3 / phase4_step1 / draft / omitted (default)
- New ExistingImplant fields: present_component / present_component_gh / present_component_angle / iopa_url
- New top-level fields: original_procedure_type / radiographs (opg_url / iopas)
- New ProsthesisHistory field: prosthesis_stage ('temporary' | 'final')
- original_procedure_type overrides auto-derived implant_procedure_type
"""
import os
import random
import pytest
import requests
from datetime import datetime, timedelta

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://dental-workflow-18.preview.emergentagent.com",
).rstrip("/")
ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}

SUPERVISOR_ID = "69b79407a17f36c024eb2d60"
SUPERVISOR_NAME = "Dr. Paresh Gandhi"
INCHARGE_ID = "69b79407a17f36c024eb2d5f"
INCHARGE_NAME = "Dr. Ajay Sabane"


def _future_weekday(offset_days=30):
    d = datetime.now() + timedelta(days=offset_days)
    while d.weekday() >= 5:  # Mon-Fri
        d += timedelta(days=1)
    return d.strftime("%Y-%m-%d")


_RUN_SEED = random.randint(900, 1500)
_OFFSET = {
    "P3": _RUN_SEED + 1,
    "P4": _RUN_SEED + 16,
    "DR": _RUN_SEED + 32,
    "DEF": _RUN_SEED + 48,
    "EX": _RUN_SEED + 64,
    "OPT": _RUN_SEED + 80,
    "RAD": _RUN_SEED + 96,
    "PS": _RUN_SEED + 112,
    "INV": _RUN_SEED + 128,
}


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture
def auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _minimal_payload(suffix="P3", time="10:00"):
    return {
        "patient_name": f"TEST_iter213{suffix}",
        "registration_number": f"TEST-213-{datetime.now().strftime('%H%M%S%f')}{suffix}",
        "supervisor_id": SUPERVISOR_ID,
        "supervisor_name": SUPERVISOR_NAME,
        "implant_incharge_id": INCHARGE_ID,
        "implant_incharge_name": INCHARGE_NAME,
        "receipt_number": f"R213-{datetime.now().strftime('%H%M%S%f')}{suffix}",
        "amount_paid": 5000,
        "procedure_date": _future_weekday(_OFFSET.get(suffix, 250)),
        "procedure_time": time,
        "existing_implants": [{"tooth": "16"}],
    }


# ── iter-213: phase_to_start routing matrix ───────────────────────────────
class TestPhaseRouting:
    def _post_and_get(self, payload, auth):
        """POST + GET roundtrip helper. POST response status is hardcoded to
        'pending_stage2_prosthetic' (server.py:1770); use GET as DB truth."""
        r = requests.post(
            f"{BASE_URL}/api/procedures/with-existing-implants",
            json=payload, headers=auth, timeout=20,
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        gid = r.json()["id"]
        g = requests.get(f"{BASE_URL}/api/procedures/{gid}", headers=auth, timeout=15)
        assert g.status_code == 200, g.text
        return g.json()

    def test_phase3_routes_to_phase3_inbox(self, auth):
        payload = _minimal_payload(suffix="P3")
        payload["phase_to_start"] = "phase3"
        gd = self._post_and_get(payload, auth)
        assert gd["status"] == "phase2_approved", f"got status={gd.get('status')}"
        assert gd["current_phase"] == 3, f"got current_phase={gd.get('current_phase')}"
        assert gd["phase3_skipped"] is False
        assert gd["phase1_skipped"] is True
        assert gd["phase2_skipped"] is True

    def test_phase4_step1_routes_to_phase4(self, auth):
        payload = _minimal_payload(suffix="P4")
        payload["phase_to_start"] = "phase4_step1"
        gd = self._post_and_get(payload, auth)
        assert gd["status"] == "pending_stage2_prosthetic"
        assert gd["current_phase"] == 4
        assert gd["phase3_skipped"] is True

    def test_draft_routes_to_draft(self, auth):
        payload = _minimal_payload(suffix="DR")
        payload["phase_to_start"] = "draft"
        gd = self._post_and_get(payload, auth)
        assert gd["status"] == "draft", f"got status={gd.get('status')}"
        assert gd["current_phase"] == 0

    def test_omitted_phase_to_start_defaults_to_phase4_step1(self, auth):
        """iter-211 backward-compat — omit field → default phase4_step1."""
        payload = _minimal_payload(suffix="DEF")
        assert "phase_to_start" not in payload
        gd = self._post_and_get(payload, auth)
        assert gd["status"] == "pending_stage2_prosthetic"
        assert gd["current_phase"] == 4
        assert gd["phase3_skipped"] is True
        assert gd["phase1_skipped"] is True
        assert gd["phase2_skipped"] is True


# ── iter-213: extended ExistingImplant fields round-trip ──────────────────
class TestExtendedImplantFields:
    def test_existing_implant_present_component_fields(self, auth):
        payload = _minimal_payload(suffix="EX")
        payload["existing_implants"] = [
            {
                "tooth": "16",
                "brand": "Nobel",
                "system": "Active",
                "diameter_mm": 4.3,
                "length_mm": 10.0,
                "present_component": "Final Abutment",
                "present_component_gh": 3.0,
                "present_component_angle": 17.0,
                "iopa_url": "https://example.com/iopa1.png",
            },
            {
                "tooth": "26",
                "present_component": "Healing Abutment",
                "present_component_gh": 2.0,
                "iopa_url": "https://example.com/iopa2.png",
            },
        ]
        r = requests.post(
            f"{BASE_URL}/api/procedures/with-existing-implants",
            json=payload, headers=auth, timeout=20,
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        gid = r.json()["id"]
        # GET + verify persistence
        g = requests.get(f"{BASE_URL}/api/procedures/{gid}", headers=auth, timeout=15)
        assert g.status_code == 200, g.text
        gd = g.json()
        impls = gd["existing_implants"]
        assert len(impls) == 2
        assert impls[0]["present_component"] == "Final Abutment"
        assert impls[0]["present_component_gh"] == 3.0
        assert impls[0]["present_component_angle"] == 17.0
        assert impls[0]["iopa_url"] == "https://example.com/iopa1.png"
        assert impls[1]["present_component"] == "Healing Abutment"
        assert impls[1]["present_component_gh"] == 2.0
        assert impls[1]["iopa_url"] == "https://example.com/iopa2.png"

    def test_optional_implant_fields_can_be_omitted(self, auth):
        """Backward-compat — old payload without new fields still works."""
        payload = _minimal_payload(suffix="OPT")
        payload["existing_implants"] = [{"tooth": "16"}]
        r = requests.post(
            f"{BASE_URL}/api/procedures/with-existing-implants",
            json=payload, headers=auth, timeout=20,
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text}"


# ── iter-213: new top-level fields ─────────────────────────────────────────
class TestTopLevelExtensions:
    def test_radiographs_block_round_trip(self, auth):
        payload = _minimal_payload(suffix="RAD")
        payload["radiographs"] = {
            "opg_url": "https://example.com/opg.png",
            "iopas": ["https://example.com/i1.png", None, "https://example.com/i3.png"],
        }
        r = requests.post(
            f"{BASE_URL}/api/procedures/with-existing-implants",
            json=payload, headers=auth, timeout=20,
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        gid = r.json()["id"]
        g = requests.get(f"{BASE_URL}/api/procedures/{gid}", headers=auth, timeout=15)
        assert g.status_code == 200
        gd = g.json()
        rad = gd.get("radiographs")
        assert rad is not None, f"radiographs missing in saved doc: {gd.keys()}"
        assert rad["opg_url"] == "https://example.com/opg.png"
        assert rad["iopas"] == ["https://example.com/i1.png", None, "https://example.com/i3.png"]

    def test_original_procedure_type_overrides_auto_derived(self, auth):
        """When original_procedure_type is set, implant_procedure_type should reflect it
        (NOT auto-derived 'Single/Multiple Conventional Implants')."""
        payload = _minimal_payload(suffix="INV")
        payload["original_procedure_type"] = "All on 4"
        payload["existing_implants"] = [
            {"tooth": "11"}, {"tooth": "13"}, {"tooth": "21"}, {"tooth": "23"},
        ]
        r = requests.post(
            f"{BASE_URL}/api/procedures/with-existing-implants",
            json=payload, headers=auth, timeout=20,
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        gid = r.json()["id"]
        g = requests.get(f"{BASE_URL}/api/procedures/{gid}", headers=auth, timeout=15)
        assert g.status_code == 200
        gd = g.json()
        assert gd.get("implant_procedure_type") == "All on 4", (
            f"Expected override 'All on 4', got: {gd.get('implant_procedure_type')}"
        )
        assert gd.get("original_procedure_type") == "All on 4"


# ── iter-213: prosthesis_history.prosthesis_stage ──────────────────────────
class TestProsthesisStage:
    @pytest.mark.parametrize("stage", ["temporary", "final"])
    def test_prosthesis_stage_values(self, auth, stage):
        payload = _minimal_payload(suffix="PS", time="14:00")
        # bump the date by stage to avoid duplicate-slot collision
        payload["procedure_date"] = _future_weekday(
            _OFFSET["PS"] + (1 if stage == "temporary" else 5)
        )
        payload["registration_number"] = f"TEST-213-PS-{stage}-{datetime.now().strftime('%H%M%S%f')}"
        payload["receipt_number"] = f"R213-PS-{stage}-{datetime.now().strftime('%H%M%S%f')}"
        payload["prosthesis_history"] = {
            "had_prosthesis": True,
            "prosthesis_stage": stage,
            "prosthesis_type": "Screw-retained crown",
            "material": "Zirconia",
        }
        r = requests.post(
            f"{BASE_URL}/api/procedures/with-existing-implants",
            json=payload, headers=auth, timeout=20,
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        gid = r.json()["id"]
        g = requests.get(f"{BASE_URL}/api/procedures/{gid}", headers=auth, timeout=15)
        assert g.status_code == 200
        gd = g.json()
        ph = gd.get("prosthesis_history") or {}
        assert ph.get("prosthesis_stage") == stage
        assert ph.get("had_prosthesis") is True
        assert ph.get("material") == "Zirconia"
