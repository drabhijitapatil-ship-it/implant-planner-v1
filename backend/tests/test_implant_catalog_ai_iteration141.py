"""Iteration 141 — Implant Catalog CRUD + Ask Implanr AI tests.
Covers GET /implant-catalog, GET/PUT /implant-catalog/by-key,
POST /ai/ask-implanr (system-scoped + global). Also verifies RBAC.
"""
import os
import re
import time
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://dental-workflow-18.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_USER = ("Abhijit.patil", "Admin@123")
STUDENT_USER = ("Gaurav.pandey", "Student@123")


def _login(identifier: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"identifier": identifier, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {identifier}: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"no token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def admin_token():
    return _login(*ADMIN_USER)


@pytest.fixture(scope="module")
def student_token():
    return _login(*STUDENT_USER)


def _h(tok: str):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ─────── GET /implant-catalog ───────
class TestCatalogList:
    def test_list_systems_authed(self, admin_token):
        r = requests.get(f"{API}/implant-catalog", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "systems" in data and isinstance(data["systems"], list)
        systems = data["systems"]
        assert len(systems) >= 30, f"expected ≥30 systems, got {len(systems)}"
        # Validate shape
        sample = systems[0]
        for k in ("key", "brand", "name"):
            assert k in sample, f"missing field {k} in {sample}"

    def test_list_requires_auth(self):
        r = requests.get(f"{API}/implant-catalog", timeout=20)
        assert r.status_code in (401, 403), r.status_code


# ─────── GET /implant-catalog/by-key ───────
class TestCatalogGetOne:
    def test_get_ankylos(self, admin_token):
        key = "Dentsply Sirona|Ankylos C/X"
        r = requests.get(f"{API}/implant-catalog/by-key", params={"key": key}, headers=_h(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["key"] == key
        assert doc["brand"] == "Dentsply Sirona"
        assert "components" in doc and isinstance(doc["components"], list)

    def test_get_missing(self, admin_token):
        r = requests.get(f"{API}/implant-catalog/by-key", params={"key": "Nope|Nada"}, headers=_h(admin_token), timeout=20)
        assert r.status_code == 404


# ─────── PUT /implant-catalog/by-key ───────
class TestCatalogUpsert:
    KEY = "TEST_Brand|TEST_System"

    def test_admin_can_upsert(self, admin_token):
        body = {
            "brand": "TEST_Brand",
            "name": "TEST_System",
            "features": ["feat1"],
            "components": [
                {"type": "healing_abutment", "gingival_heights_mm": [2, 4, 6]}
            ],
        }
        r = requests.put(f"{API}/implant-catalog/by-key", params={"key": self.KEY}, headers=_h(admin_token), json=body, timeout=20)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["key"] == self.KEY
        assert doc["brand"] == "TEST_Brand"
        assert doc["name"] == "TEST_System"
        assert doc["features"] == ["feat1"]
        assert len(doc["components"]) == 1
        assert doc["components"][0]["type"] == "healing_abutment"
        assert doc.get("is_stub") is False

        # Verify GET returns persisted data
        g = requests.get(f"{API}/implant-catalog/by-key", params={"key": self.KEY}, headers=_h(admin_token), timeout=20)
        assert g.status_code == 200
        gd = g.json()
        assert gd["features"] == ["feat1"]
        assert gd["components"][0]["gingival_heights_mm"] == [2, 4, 6]

    def test_student_forbidden(self, student_token):
        body = {"brand": "TEST_Brand", "name": "TEST_System", "features": ["x"]}
        r = requests.put(f"{API}/implant-catalog/by-key", params={"key": self.KEY}, headers=_h(student_token), json=body, timeout=20)
        assert r.status_code == 403, r.status_code


# ─────── POST /ai/ask-implanr ───────
class TestAskImplanrAI:
    def test_scoped_ankylos(self, admin_token):
        body = {"question": "What angulations does Ankylos offer?", "system_key": "Dentsply Sirona|Ankylos C/X"}
        r = requests.post(f"{API}/ai/ask-implanr", headers=_h(admin_token), json=body, timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        ans = (data.get("answer") or "").strip()
        assert ans, "empty answer"
        assert data.get("scoped_system") == "Dentsply Sirona|Ankylos C/X"
        # Catalog grounding check — Ankylos angled abutments come in
        # 0/7.5/15/22.5/30/37.5° steps. Look for at least 2 of the values.
        hits = [v for v in ["0", "7.5", "15", "22.5", "30", "37.5"] if re.search(rf"(?<!\d){re.escape(v)}\s*°", ans) or f" {v}" in ans]
        assert len(hits) >= 2, f"expected catalog angulation values in answer, got: {ans}"

    def test_global_no_scope(self, admin_token):
        body = {"question": "Which systems are documented in this catalog?"}
        r = requests.post(f"{API}/ai/ask-implanr", headers=_h(admin_token), json=body, timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        ans = (data.get("answer") or "").strip()
        assert ans, "empty global answer"
        assert data.get("scoped_system") in (None, "")

    def test_question_required(self, admin_token):
        r = requests.post(f"{API}/ai/ask-implanr", headers=_h(admin_token), json={"question": "  "}, timeout=20)
        assert r.status_code == 400


# ─────── Cleanup ───────
def teardown_module(module):
    try:
        tok = _login(*ADMIN_USER)
        # Can't DELETE (no endpoint), but mark as stub by clearing
        # We'll just leave the TEST_ row — it's namespaced and harmless.
        pass
    except Exception:
        pass
