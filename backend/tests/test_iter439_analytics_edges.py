"""iter-439 — Extra edge-case assertions for GET /api/analytics/aesthetic-risk.

Covers:
 - Far-past date filter → 200 with anterior_cases=0 and high_pct is None (not NaN).
 - Unfiltered call: sum(distribution) == anterior_cases.
 - Every factor's options carry a valid risk in {Low, Medium, High}.
 - Unauthenticated call blocked with 401/403 (nurse account not in credentials → skipped).
"""
from __future__ import annotations
import os
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://dental-implant-hub-14.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=20)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


def test_far_past_range_empty(admin_headers):
    r = requests.get(
        f"{API}/analytics/aesthetic-risk",
        params={"from_date": "2020-01-01", "to_date": "2020-01-31"},
        headers=admin_headers,
        timeout=30,
    )
    assert r.status_code == 200, r.text
    j = r.json()
    sm = j["summary"]
    assert sm["anterior_cases"] == 0
    # high_pct should be None (not NaN) when no cases
    assert sm.get("high_pct") is None
    # distribution buckets must exist and sum to 0
    assert set(sm["distribution"]) == {"Low", "Medium", "High"}
    assert sum(sm["distribution"].values()) == 0


def test_distribution_sum_equals_anterior_cases(admin_headers):
    r = requests.get(f"{API}/analytics/aesthetic-risk", headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    sm = r.json()["summary"]
    assert sum(sm["distribution"].values()) == sm["anterior_cases"]


def test_every_factor_option_has_valid_risk(admin_headers):
    r = requests.get(f"{API}/analytics/aesthetic-risk", headers=admin_headers, timeout=30)
    assert r.status_code == 200
    factors = r.json()["factors"]
    assert len(factors) >= 8
    for f in factors:
        assert f.get("key")
        for opt in f.get("options", []):
            assert opt.get("risk") in ("Low", "Medium", "High"), f"{f['key']} / {opt}"


def test_unauth_blocked():
    r = requests.get(f"{API}/analytics/aesthetic-risk", timeout=20)
    assert r.status_code in (401, 403)


def test_nurse_role_forbidden():
    # Nurse account not enumerated in /app/memory/test_credentials.md → skip.
    pytest.skip("No nurse account in test_credentials.md")
