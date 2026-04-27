"""
Iteration 109 — backend tests for:

  1) POST /api/audit/safety-override
     - Auth required (401 without token)
     - 422 when context missing
     - 200 + {"ok": True} for a valid body
     - Persists to access_logs with action=safety_override and the body
       fields under `extra`
     - Visible via GET /api/admin/access-logs?action=safety_override for
       In-Charge

  2) Non-admin (student / supervisor) cannot read /api/admin/access-logs

  3) AI explain endpoints prompt-enrichment
     - POST /api/ai/explain-standalone with a KNOWN brand+system from the
       institutional doc → 200 + non-empty explanation
     - POST /api/ai/explain-standalone with an UNKNOWN brand+system → 200
       + non-empty explanation (no inst_block, no exception)
     - POST /api/ai/explain-recommendation against a real procedure with
       implant_plans → 200 + non-empty explanation (regression)

The institutional-prompt enrichment is verified indirectly: we can't peek
into the LLM prompt, but we can confirm the endpoint accepts the known
brand+system and returns a plausible response (status 200 + non-empty
text + the LLM was invoked, i.e. response length > a small threshold).
"""
from __future__ import annotations

import os
import time

import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://implant-workflow-hub.preview.emergentagent.com",
).rstrip("/")

LOGIN_URL = f"{BASE_URL}/api/auth/login"
SAFETY_URL = f"{BASE_URL}/api/audit/safety-override"
ACCESS_LOGS_URL = f"{BASE_URL}/api/admin/access-logs"
EXPLAIN_STD_URL = f"{BASE_URL}/api/ai/explain-standalone"
EXPLAIN_REC_URL = f"{BASE_URL}/api/ai/explain-recommendation"

ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}
STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}
SUPERVISOR = {"identifier": "Paresh.gandhi", "password": "Supervisor@123"}


# ────────────────────── helpers ──────────────────────
def _login(creds):
    r = requests.post(LOGIN_URL, json=creds, timeout=20)
    assert r.status_code == 200, f"login failed for {creds['identifier']}: {r.status_code} {r.text[:200]}"
    body = r.json()
    return body["token"], body["user"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def admin_ctx():
    token, user = _login(ADMIN)
    return {"token": token, "user": user, "headers": _auth(token)}


@pytest.fixture(scope="module")
def student_ctx():
    token, user = _login(STUDENT)
    return {"token": token, "user": user, "headers": _auth(token)}


@pytest.fixture(scope="module")
def supervisor_ctx():
    token, user = _login(SUPERVISOR)
    return {"token": token, "user": user, "headers": _auth(token)}


# ════════════════════════════════════════════════════════════════════
#                  1.  POST /api/audit/safety-override
# ════════════════════════════════════════════════════════════════════
class TestSafetyOverrideEndpoint:
    """New audit endpoint that records soft bone-margin warning overrides."""

    def test_requires_auth(self):
        # No token at all → 401/403
        r = requests.post(
            SAFETY_URL,
            json={"context": "implant_selection_home"},
            timeout=20,
        )
        assert r.status_code in (401, 403), (
            f"expected 401/403 without auth, got {r.status_code}: {r.text[:200]}"
        )

    def test_422_when_context_missing(self, student_ctx):
        # context is required (Field(..., max_length=80))
        r = requests.post(
            SAFETY_URL,
            headers=student_ctx["headers"],
            json={
                "tooth_position": "16",
                "bone_width": 6.5,
                "implant_diameter": 5.0,
                "margin_mm": 0.75,
            },
            timeout=20,
        )
        assert r.status_code == 422, (
            f"expected 422 for missing context, got {r.status_code}: {r.text[:200]}"
        )

    def test_safety_override_happy_path_and_persisted(
        self, student_ctx, admin_ctx
    ):
        # Use a unique system label so we can reliably find this row in the
        # access-logs viewer afterwards.
        unique_system = f"TEST_iter109_{int(time.time())}"
        payload = {
            "context": "implant_selection_home",
            "tooth_position": "16",
            "bone_width": 6.5,
            "bone_height": 11.0,
            "implant_diameter": 5.0,
            "implant_length": 8.5,
            "margin_mm": 0.75,
            "system": unique_system,
        }

        r = requests.post(
            SAFETY_URL,
            headers=student_ctx["headers"],
            json=payload,
            timeout=20,
        )
        assert r.status_code == 200, (
            f"safety-override POST failed: {r.status_code} {r.text[:200]}"
        )
        body = r.json()
        assert body == {"ok": True}, f"unexpected body: {body}"

        # Visible via /admin/access-logs filtered by action=safety_override
        # (allow a brief window for the write to land — log_access fires off
        # the insert but the call returns immediately).
        time.sleep(0.5)
        r2 = requests.get(
            ACCESS_LOGS_URL,
            headers=admin_ctx["headers"],
            params={"action": "safety_override", "limit": 50},
            timeout=20,
        )
        assert r2.status_code == 200, (
            f"admin GET access-logs failed: {r2.status_code} {r2.text[:200]}"
        )
        body2 = r2.json()
        # Endpoint returns either a list (older shape) or a paginated dict
        # like {items, total, limit, skip} (current shape).
        rows = body2["items"] if isinstance(body2, dict) and "items" in body2 else body2
        assert isinstance(rows, list), f"expected list of rows, got {type(rows)}"
        assert len(rows) > 0, "no safety_override rows returned"

        # Every row returned by the action filter must have action=safety_override
        for row in rows:
            assert row.get("action") == "safety_override", (
                f"unexpected action in filtered rows: {row.get('action')}"
            )

        # Find the row we just wrote (matched on the unique system label).
        match = next(
            (
                row for row in rows
                if (row.get("extra") or {}).get("system") == unique_system
            ),
            None,
        )
        assert match is not None, (
            f"could not find our just-written safety_override row "
            f"(system={unique_system}) among {len(rows)} rows"
        )

        # Validate the body fields landed under `extra`.
        extra = match.get("extra") or {}
        assert extra.get("context") == "implant_selection_home"
        assert extra.get("tooth_position") == "16"
        assert extra.get("bone_width") == 6.5
        assert extra.get("implant_diameter") == 5.0
        assert extra.get("margin_mm") == 0.75
        # resource_type=implant_selection per the endpoint impl
        assert match.get("resource_type") == "implant_selection"
        # resource_id mirrors the system label
        assert match.get("resource_id") == unique_system
        # No mongo _id leaked
        assert "_id" not in match


# ════════════════════════════════════════════════════════════════════
#       2.  Non-admin cannot read /api/admin/access-logs
# ════════════════════════════════════════════════════════════════════
class TestAccessLogsRBAC:
    def test_student_forbidden(self, student_ctx):
        r = requests.get(
            ACCESS_LOGS_URL,
            headers=student_ctx["headers"],
            params={"action": "safety_override"},
            timeout=20,
        )
        assert r.status_code == 403, (
            f"student should be forbidden, got {r.status_code}: {r.text[:200]}"
        )

    def test_supervisor_forbidden(self, supervisor_ctx):
        r = requests.get(
            ACCESS_LOGS_URL,
            headers=supervisor_ctx["headers"],
            params={"action": "safety_override"},
            timeout=20,
        )
        assert r.status_code == 403, (
            f"supervisor should be forbidden, got {r.status_code}: {r.text[:200]}"
        )

    def test_admin_allowed(self, admin_ctx):
        r = requests.get(
            ACCESS_LOGS_URL,
            headers=admin_ctx["headers"],
            params={"limit": 5},
            timeout=20,
        )
        assert r.status_code == 200
        body = r.json()
        rows = body["items"] if isinstance(body, dict) and "items" in body else body
        assert isinstance(rows, list)


# ════════════════════════════════════════════════════════════════════
#       3.  AI explain prompt enrichment (institutional doc)
# ════════════════════════════════════════════════════════════════════
class TestAiExplainStandalone:
    """The prompt is now enriched with Institutional Indications/Features
    when the brand+system pair matches an entry in implant_indications.py.

    We can only verify behaviour, not the prompt itself: ensure the call
    returns 200 + a meaningful (non-empty, multi-word) explanation, and
    that the unknown-system path still works without exception."""

    def _post(self, ctx, payload):
        return requests.post(
            EXPLAIN_STD_URL,
            headers=ctx["headers"],
            json=payload,
            timeout=120,  # gpt-5.2 can be slow
        )

    def test_known_system_returns_explanation(self, student_ctx):
        # "Neodent Helix GM Acqua" is a documented entry in implant_indications.py
        payload = {
            "tooth": "16",
            "tooth_region": "posterior maxilla",
            "brand": "Neodent",
            "system": "Helix GM Acqua",
            "diameter": 4.3,
            "length": 10.0,
            "bone_width": 7.5,
            "bone_height": 12.0,
            "bone_type": "D3",
            "risk_level": "Low",
            "risk_score": 12,
            "procedures": ["Implant Placement"],
        }
        r = self._post(student_ctx, payload)
        assert r.status_code == 200, (
            f"explain-standalone failed: {r.status_code} {r.text[:300]}"
        )
        body = r.json()
        explanation = body.get("explanation", "")
        assert isinstance(explanation, str), "explanation must be str"
        # Confirm the LLM was actually called: a real reply is several words.
        assert len(explanation.strip()) > 50, (
            f"explanation suspiciously short ({len(explanation)} chars): {explanation!r}"
        )
        # Not a hard-error stub
        assert "error" not in explanation.lower()[:30]

    def test_unknown_system_still_works(self, student_ctx):
        # No matching entry in the indications dict — must not raise.
        payload = {
            "tooth": "21",
            "tooth_region": "anterior maxilla",
            "brand": "FakeBrandThatDoesNotExist",
            "system": "TotallyMadeUpSystem 9000",
            "diameter": 3.5,
            "length": 11.5,
            "bone_width": 6.0,
            "bone_height": 14.0,
            "bone_type": "D2",
            "risk_level": "Low",
            "risk_score": 8,
            "procedures": ["Implant Placement"],
        }
        r = self._post(student_ctx, payload)
        assert r.status_code == 200, (
            f"explain-standalone with unknown system failed: "
            f"{r.status_code} {r.text[:300]}"
        )
        body = r.json()
        explanation = body.get("explanation", "")
        assert isinstance(explanation, str)
        assert len(explanation.strip()) > 50, (
            f"explanation suspiciously short: {explanation!r}"
        )


class TestAiExplainRecommendationRegression:
    """Regression: explain-recommendation against an existing procedure
    with implant_plans should still return a non-empty explanation."""

    def _find_procedure_with_plans(self, admin_ctx):
        # Use the admin "all procedures" listing. Some installations
        # paginate; we just need the first one with implant_plans.
        # Endpoints we may try in order:
        for url in (
            f"{BASE_URL}/api/admin/procedures",
            f"{BASE_URL}/api/procedures",
        ):
            try:
                r = requests.get(url, headers=admin_ctx["headers"], timeout=20)
            except Exception:
                continue
            if r.status_code != 200:
                continue
            try:
                data = r.json()
            except Exception:
                continue
            items = data if isinstance(data, list) else data.get("procedures") or data.get("items") or []
            for proc in items:
                plans = proc.get("implant_plans") or []
                if plans and proc.get("_id") or proc.get("id"):
                    return proc.get("_id") or proc.get("id"), plans
        return None, []

    def test_explain_recommendation_returns_text(self, admin_ctx):
        proc_id, plans = self._find_procedure_with_plans(admin_ctx)
        if not proc_id:
            pytest.skip("no procedure with implant_plans available for regression")

        r = requests.post(
            EXPLAIN_REC_URL,
            headers=admin_ctx["headers"],
            json={"procedure_id": proc_id, "implant_index": 0},
            timeout=120,
        )
        assert r.status_code == 200, (
            f"explain-recommendation failed: {r.status_code} {r.text[:300]}"
        )
        body = r.json()
        explanation = body.get("explanation", "")
        assert isinstance(explanation, str)
        assert len(explanation.strip()) > 50, (
            f"explanation suspiciously short: {explanation!r}"
        )
