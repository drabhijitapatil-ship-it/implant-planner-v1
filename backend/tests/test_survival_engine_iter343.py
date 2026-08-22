"""iter-343 — Implant Survival Engine visibility regression tests.

Covers:
  * GET /api/procedures/{id}/active-implants for procedures whose Phase 2
    was submitted BEFORE iter-343 (i.e., only `implant_plans[]` exists,
    no top-level `implants[]`). Backend must materialize the implant
    list via `_extract_procedure_implants` fallback.
  * Same for procedures with `existing_implants[]` (older schema with
    `_mm` suffixed fields).
  * GET /api/analytics/survival counters.placed > 0 (implants counted
    from procedures that only have implant_plans).
  * PATCH /api/admin/procedures/{id}/timeline — 30-day-back and no-future
    constraints removed; a future / far-past date now succeeds (only
    invalid format returns 400).
"""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://prosthetic-preview.preview.emergentagent.com",
).rstrip("/")

ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}
STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}

# Procedure with only `implant_plans[]` (iter-343 fallback path).
# Patient "Phase2 Test" — tooth 16, ICE 5.0mm × 13.0mm.
PROC_PLANS_ONLY = "699fc5c2248100e8a0d87265"
# Procedure with `existing_implants[]` (older schema).
PROC_EXISTING = "6a01da5afaa288be26abd086"


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="session")
def student_headers():
    return {"Authorization": f"Bearer {_login(STUDENT)}"}


# ------ Active implants fallback ------
class TestActiveImplantsFallback:
    def test_plans_only_procedure_returns_implant(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/procedures/{PROC_PLANS_ONLY}/active-implants",
            headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        active = data.get("active") or data.get("implants") or []
        assert isinstance(active, list)
        assert len(active) >= 1, f"expected >=1 active implant, got: {data}"
        first = active[0]
        assert str(first.get("tooth_number")) == "16"
        # System should surface from implant_plans[].system
        assert (first.get("system") or "").upper() == "ICE"
        assert float(first.get("diameter")) == 5.0
        assert float(first.get("length")) == 13.0

    def test_existing_implants_procedure_normalized(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/procedures/{PROC_EXISTING}/active-implants",
            headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        active = data.get("active") or data.get("implants") or []
        assert len(active) >= 1
        first = active[0]
        assert str(first.get("tooth_number")) == "16"
        # existing_implants has `brand` and `_mm` suffix — helper should
        # coalesce them into `system` + `diameter`.
        assert (first.get("system") or "").upper() == "SPI"
        assert float(first.get("diameter")) == 4.2


class TestLifecycleFallback:
    def test_lifecycle_returns_position_for_plans_only(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/procedures/{PROC_PLANS_ONLY}/implant-lifecycle",
            headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        positions = data.get("positions") or []
        assert len(positions) >= 1
        pos = positions[0]
        assert str(pos.get("tooth")) == "16"
        assert "events" in pos and isinstance(pos["events"], list)


# ------ Procedure GET reflects materialized `implants[]` after phase 2 ------
class TestProcedureImplantsMaterialized:
    def test_procedure_get_shows_implants_after_phase2(self, admin_headers):
        """PROC_PLANS_ONLY is phase2_approved — verify the GET response
        contains either the materialized `implants[]` OR still has
        implant_plans[] that the helper can normalize. Either is
        acceptable so long as active-implants surfaces the implant."""
        r = requests.get(
            f"{BASE_URL}/api/procedures/{PROC_PLANS_ONLY}",
            headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        implants = data.get("implants") or []
        plans = data.get("implant_plans") or []
        # At least one of them must have the implant.
        assert (len(implants) >= 1) or (len(plans) >= 1), (
            f"Neither implants[] nor implant_plans[] present: keys={list(data.keys())}"
        )
        # If materialized, verify shape.
        if implants:
            first = implants[0]
            assert str(first.get("tooth_number")) == "16"
            assert (first.get("system") or "").upper() == "ICE"
            assert float(first.get("diameter")) == 5.0
            assert float(first.get("length")) == 13.0


# ------ Analytics counts implants from plans-only procedures ------
class TestAnalyticsCoversPlansOnly:
    def test_placed_gt_zero(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/analytics/survival",
            headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        placed = d["counters"]["placed"]
        assert placed > 0, f"expected placed>0 since plans-only procs must count; got {placed}"


# ------ Timeline back-fill: constraints relaxed ------
class TestTimelineBackfillRelaxed:
    def test_backfill_far_past_date_accepted(self, admin_headers):
        """iter-343: 30-day back-window removed. A 2025-08-15 date on
        phase2_actual_done_date should now be accepted."""
        r = requests.patch(
            f"{BASE_URL}/api/admin/procedures/{PROC_PLANS_ONLY}/timeline",
            headers=admin_headers,
            json={"phase2_actual_done_date": "2025-08-15"},
            timeout=30,
        )
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
        assert r.json().get("updated") is True

    def test_backfill_future_date_accepted(self, admin_headers):
        """iter-343: future dates now allowed."""
        r = requests.patch(
            f"{BASE_URL}/api/admin/procedures/{PROC_PLANS_ONLY}/timeline",
            headers=admin_headers,
            json={"phase4_step2_done_date": "2027-06-15"},
            timeout=30,
        )
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"

    def test_backfill_invalid_format_rejected(self, admin_headers):
        r = requests.patch(
            f"{BASE_URL}/api/admin/procedures/{PROC_PLANS_ONLY}/timeline",
            headers=admin_headers,
            json={"phase2_actual_done_date": "not-a-date"},
            timeout=30,
        )
        assert r.status_code == 400

    def test_backfill_student_forbidden(self, student_headers):
        r = requests.patch(
            f"{BASE_URL}/api/admin/procedures/{PROC_PLANS_ONLY}/timeline",
            headers=student_headers,
            json={"phase2_actual_done_date": "2026-01-01"},
            timeout=30,
        )
        assert r.status_code == 403
