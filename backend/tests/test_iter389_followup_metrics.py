"""Iter-389 Phase 5 iteration 2 backend tests:
- GET /api/analytics/followup-metrics shape + role gating
- POST /api/procedures/{id}/followups accepts per-implant payload shapes
"""
import os
import requests
import pytest

BASE_URL = "https://dental-consent-sign.preview.emergentagent.com"

CREDS = {
    "admin": ("Abhijit.patil", "Admin@123"),
    "student": ("Gaurav.pandey", "Student@123"),
    "supervisor": ("Paresh.gandhi", "Supervisor@123"),
    "nurse": ("nurse.1@dental.edu", "Nurse@123"),
}


def _login(identifier, password):
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"identifier": identifier, "password": password},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed for {identifier}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def tokens():
    return {k: _login(*v) for k, v in CREDS.items()}


# ---- Analytics endpoint shape (admin) ----
class TestFollowupMetricsShape:
    def test_admin_shape(self, tokens):
        r = requests.get(
            f"{BASE_URL}/api/analytics/followup-metrics",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Top-level keys
        for k in ["compliance", "survival_over_time", "current_survival", "probing_trend", "scope"]:
            assert k in data, f"missing key {k}"

        comp = data["compliance"]
        for k in [
            "completed_cases",
            "cases_with_followup",
            "compliance_rate",
            "total_followups",
            "avg_days_to_first",
            "avg_interval_days",
            "overdue",
        ]:
            assert k in comp, f"compliance missing {k}"
        assert isinstance(comp["overdue"], list)

        sot = data["survival_over_time"]
        assert isinstance(sot, list) and len(sot) == 5, f"expected 5 buckets got {len(sot)}"
        for bucket in sot:
            for k in ["reviewed", "failed", "survival_rate"]:
                assert k in bucket, f"bucket missing {k}: {bucket}"

        cs = data["current_survival"]
        for k in ["implants_tracked", "surviving", "rate"]:
            assert k in cs, f"current_survival missing {k}"

        assert isinstance(data["probing_trend"], list)


# ---- Role gating ----
class TestFollowupMetricsRoles:
    def test_nurse_forbidden(self, tokens):
        r = requests.get(
            f"{BASE_URL}/api/analytics/followup-metrics",
            headers={"Authorization": f"Bearer {tokens['nurse']}"},
            timeout=30,
        )
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"

    def test_student_scoped_200(self, tokens):
        r = requests.get(
            f"{BASE_URL}/api/analytics/followup-metrics",
            headers={"Authorization": f"Bearer {tokens['student']}"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "compliance" in data
        # scope should indicate own
        assert "scope" in data

    def test_supervisor_200(self, tokens):
        r = requests.get(
            f"{BASE_URL}/api/analytics/followup-metrics",
            headers={"Authorization": f"Bearer {tokens['supervisor']}"},
            timeout=30,
        )
        assert r.status_code == 200, r.text


# ---- Per-implant payload acceptance ----
def _find_student_completed_case(token):
    r = requests.get(
        f"{BASE_URL}/api/procedures",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    procs = r.json()
    if isinstance(procs, dict):
        procs = procs.get("procedures", procs.get("items", []))
    # Prefer 'Phase2 E2E Test' case
    for p in procs:
        name = (p.get("patient_name") or p.get("patient", {}).get("name") or "") if isinstance(p, dict) else ""
        if "Phase2 E2E Test" in name:
            return p
    # fallback: any completed
    for p in procs:
        if p.get("status") in ("completed", "case_completed"):
            return p
    return None


class TestPerImplantFollowupSubmit:
    def test_submit_per_implant_shapes(self, tokens):
        token = tokens["student"]
        proc = _find_student_completed_case(token)
        if not proc:
            pytest.skip("No completed case owned by student for follow-up submission")

        proc_id = proc.get("id") or proc.get("_id")
        # Determine implant positions
        implants = proc.get("implants") or proc.get("selected_implants") or []
        positions = []
        for imp in implants:
            pos = imp.get("tooth") or imp.get("position") or imp.get("site")
            if pos:
                positions.append(str(pos))
        if not positions:
            # try from planned_implants field
            for imp in proc.get("planned_implants", []) or []:
                pos = imp.get("tooth") or imp.get("position")
                if pos:
                    positions.append(str(pos))
        if not positions:
            pytest.skip(f"No implant positions on case {proc_id}")

        survival_review = {p: {"status": "Surviving", "reason": "", "reason_other_text": "", "details": ""} for p in positions}
        soft_tissue = {
            p: {
                "bleeding_on_probing": {"status": "Absent", "details": ""},
                "soft_tissue_inflammation": {"status": "Absent", "details": ""},
                "ulceration": {"status": "Absent", "details": ""},
                "swelling": {"status": "Absent", "details": ""},
            }
            for p in positions
        }
        implant_mobility_map = {p: "Absence of mobility" for p in positions}

        payload = {
            "date": "2026-08-05",
            "systemic_condition_review": {"new_condition": "No", "details": ""},
            "general": {"comfort": "Yes", "pain": "No", "chewing": "Efficient", "speech": "Normal", "esthetics": "Satisfactory"},
            "oral_hygiene": {"plaque_index": "0", "hygiene": "Good"},
            "probing_depth": {p: {"kgw": "3", "vestibular": "3", "distal": "3", "mesial": "3", "lingual": "3"} for p in positions},
            "radiograph": {},
            "survival_review": survival_review,
            "soft_tissue": soft_tissue,
            "prosthesis_occlusion": {
                "implant_mobility": implant_mobility_map,
                "prosthesis_status": "Stable",
                "wear_fracture": "None",
                "occlusion": "Stable",
            },
            "patient_feedback": "No complaints",
        }

        r = requests.post(
            f"{BASE_URL}/api/procedures/{proc_id}/followups",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
            timeout=60,
        )
        # Accept 200/201; or 400 if a previous follow-up is still pending (per spec, expected behaviour)
        if r.status_code == 400 and ("pending" in r.text.lower() or "approval" in r.text.lower()):
            pytest.skip(f"Prior follow-up still pending (expected block): {r.text}")
        assert r.status_code in (200, 201), f"submit failed: {r.status_code} {r.text}"

        # Verify persistence on procedure
        g = requests.get(
            f"{BASE_URL}/api/procedures/{proc_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
        assert g.status_code == 200, g.text
        proc_after = g.json()
        followups = proc_after.get("followups") or []
        assert len(followups) >= 1, "no follow-ups persisted"
        last = followups[-1]
        # Verify shapes
        sr = last.get("survival_review") or {}
        assert isinstance(sr, dict) and positions[0] in sr, f"survival_review shape wrong: {sr}"
        assert sr[positions[0]].get("status") == "Surviving"

        st = last.get("soft_tissue") or {}
        assert isinstance(st, dict) and positions[0] in st, f"soft_tissue shape wrong: {st}"
        assert st[positions[0]]["bleeding_on_probing"]["status"] == "Absent"

        po = last.get("prosthesis_occlusion") or {}
        im = po.get("implant_mobility") or {}
        assert isinstance(im, dict) and im.get(positions[0]) == "Absence of mobility", f"mobility shape wrong: {im}"
