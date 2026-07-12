"""iter-355 regression: AI Exit Summary endpoints.

Verifies:
- POST /procedures/{id}/generate-exit-summary generates and caches an AI
  Exit Summary for a `treatment_ended` case.
- Second call is idempotent (returns cached, same generated_at).
- `force=true` re-runs the LLM and overrides `edited` back to False.
- PATCH /procedures/{id}/exit-summary allows case owner / supervisor /
  in-charge / administrator to edit the text.
- Students who don't own the case are blocked (403).
- Non-terminated cases are blocked (400).
"""
import os
import requests

API_URL = os.environ.get("APP_URL", "http://localhost:8001").rstrip("/")


def _login(identifier: str, password: str) -> str:
    r = requests.post(f"{API_URL}/api/auth/login",
                      json={"identifier": identifier, "password": password}, timeout=15)
    r.raise_for_status()
    d = r.json()
    return d.get("access_token") or d.get("token") or ""


def _first_terminated_id(token: str) -> str:
    r = requests.get(f"{API_URL}/api/procedures",
                     params={"status": "treatment_ended"},
                     headers={"Authorization": f"Bearer {token}"}, timeout=15)
    r.raise_for_status()
    data = r.json()
    lst = data if isinstance(data, list) else data.get("procedures") or data.get("items") or []
    assert lst, "Need at least one treatment_ended procedure in the DB to run this test"
    return lst[0].get("_id") or lst[0].get("id")


def test_generate_cache_edit_and_regenerate():
    tok = _login("Abhijit.patil", "Admin@123")
    pid = _first_terminated_id(tok)
    h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}

    # 1. Generate
    r1 = requests.post(f"{API_URL}/api/procedures/{pid}/generate-exit-summary",
                       json={}, headers=h, timeout=90)
    assert r1.status_code == 200, r1.text
    s1 = r1.json().get("ai_exit_summary") or {}
    assert s1.get("text"), "Missing generated text"
    assert s1.get("model") == "openai/gpt-5.2"
    gen1 = s1.get("generated_at")

    # 2. Cache — should be the same generated_at
    r2 = requests.post(f"{API_URL}/api/procedures/{pid}/generate-exit-summary",
                       json={}, headers=h, timeout=15)
    s2 = r2.json().get("ai_exit_summary") or {}
    assert s2.get("generated_at") == gen1, "Cache is expected to return the same generated_at"

    # 3. Edit
    r3 = requests.patch(f"{API_URL}/api/procedures/{pid}/exit-summary",
                        json={"text": "TEST-EDIT — verify persistence."}, headers=h, timeout=15)
    assert r3.status_code == 200, r3.text
    s3 = r3.json().get("ai_exit_summary") or {}
    assert s3.get("text") == "TEST-EDIT — verify persistence."
    assert s3.get("edited") is True

    # 4. Force regenerate resets `edited`
    r4 = requests.post(f"{API_URL}/api/procedures/{pid}/generate-exit-summary",
                       json={"force": True}, headers=h, timeout=90)
    assert r4.status_code == 200, r4.text
    s4 = r4.json().get("ai_exit_summary") or {}
    assert s4.get("edited") is False
    assert s4.get("generated_at") != gen1


def test_non_owner_student_cannot_edit():
    stok = _login("Gaurav.pandey", "Student@123")
    itok = _login("Abhijit.patil", "Admin@123")
    pid = _first_terminated_id(itok)
    # Ensure the summary exists first
    requests.post(f"{API_URL}/api/procedures/{pid}/generate-exit-summary",
                  json={}, headers={"Authorization": f"Bearer {itok}", "Content-Type": "application/json"}, timeout=90)
    r = requests.patch(f"{API_URL}/api/procedures/{pid}/exit-summary",
                       json={"text": "hostile edit"},
                       headers={"Authorization": f"Bearer {stok}", "Content-Type": "application/json"}, timeout=15)
    assert r.status_code == 403, r.text


def test_non_terminated_case_rejected():
    tok = _login("Abhijit.patil", "Admin@123")
    # Pick any pending_phase1 case
    r = requests.get(f"{API_URL}/api/procedures", params={"status": "pending_phase1"},
                     headers={"Authorization": f"Bearer {tok}"}, timeout=15)
    lst = r.json() if isinstance(r.json(), list) else r.json().get("procedures") or r.json().get("items") or []
    if not lst:
        return  # test skipped — no pending cases to exercise
    pid = lst[0].get("_id") or lst[0].get("id")
    r2 = requests.post(f"{API_URL}/api/procedures/{pid}/generate-exit-summary",
                       json={},
                       headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}, timeout=15)
    assert r2.status_code == 400, r2.text
