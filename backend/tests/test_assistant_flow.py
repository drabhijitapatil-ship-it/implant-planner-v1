"""iter-Jun-2026: Case Assistant smoke test (run with: python backend/tests/test_assistant_flow.py)."""
import os, sys, json, datetime
import httpx

BASE = os.environ.get("API_BASE", "http://localhost:8001/api")

def login(identifier, password):
    r = httpx.post(f"{BASE}/auth/login", json={"identifier": identifier, "password": password}, timeout=30)
    r.raise_for_status()
    d = r.json()
    return d.get("access_token") or d.get("token"), d.get("user") or d

def H(t): return {"Authorization": f"Bearer {t}"}

def main():
    st_tok, st_user = login("Gaurav.pandey", "Student@123")
    sup_tok, _ = login("Paresh.gandhi", "Supervisor@123")
    inc_tok, inc_user = login("Abhijit.patil", "Admin@123")

    # candidates: another student, excluding self
    cands = httpx.get(f"{BASE}/procedures/assistant-candidates", headers=H(st_tok), timeout=30).json()
    st_id = st_user.get("id") or st_user.get("_id")
    assert all(c["id"] != st_id for c in cands), "self must be excluded"
    print("candidates:", [c["name"] for c in cands][:5])
    if not cands:
        print("No other student to use as assistant — creating one via admin")
        r = httpx.post(f"{BASE}/users", headers=H(inc_tok), json={"name": "Dr. Test Assistant", "email": "test.assistant@student.dental.edu", "password": "Assist@123", "role": "student"}, timeout=30)
        print("create user:", r.status_code, r.text[:120])
        cands = httpx.get(f"{BASE}/procedures/assistant-candidates", headers=H(st_tok), timeout=30).json()
    asst = cands[0]

    # self-as-assistant must be rejected on create
    users = httpx.get(f"{BASE}/users", headers=H(inc_tok), timeout=30).json()
    sup = next(u for u in users if u["role"] == "supervisor")
    inc = next(u for u in users if u["role"] == "implant_incharge")
    future = (datetime.date.today() + datetime.timedelta(days=3))
    while future.weekday() in (5, 6):
        future += datetime.timedelta(days=1)
    payload = {
        "patient_name": "Assistant Flow Patient", "age": "40", "sex": "Male", "profession": "Teacher",
        "mobile_number": "9999999999", "registration_number": f"ASST-{datetime.datetime.now().strftime('%H%M%S')}",
        "chief_complaint": "Missing tooth", "supervisor_id": sup["id"], "supervisor_name": sup["name"],
        "implant_incharge_id": inc["id"], "implant_incharge_name": inc["name"],
        "receipt_number": "R1", "amount_paid": 100, "procedure_date": future.isoformat(), "procedure_time": "10:00",
        "implant_procedure_type": "Single Conventional Implant", "loading_type": ["Delayed Loading"],
        "missing_teeth": ["16"], "assistant_id": st_id, "assistant_name": st_user.get("name"),
    }
    r = httpx.post(f"{BASE}/procedures", headers=H(st_tok), json=payload, timeout=30)
    print("self-assistant create ->", r.status_code, r.json().get("detail"))
    assert r.status_code == 400

    payload["assistant_id"], payload["assistant_name"] = asst["id"], asst["name"]
    r = httpx.post(f"{BASE}/procedures", headers=H(st_tok), json=payload, timeout=30)
    print("create ->", r.status_code, (r.text[:200] if r.status_code != 200 else "ok"))
    r.raise_for_status()
    pid = r.json().get("id") or r.json().get("_id")
    proc = httpx.get(f"{BASE}/procedures/{pid}", headers=H(st_tok), timeout=30).json()
    assert proc["assistant_id"] == asst["id"], proc.get("assistant_id")
    print("stored assistant:", proc["assistant_name"], "status:", proc["status"])

    # Change assistant to none then back (draft → no notifications)
    r = httpx.patch(f"{BASE}/procedures/{pid}/assistant", headers=H(st_tok), json={"assistant_id": ""}, timeout=30)
    print("remove ->", r.status_code, r.json().get("action"))
    r = httpx.patch(f"{BASE}/procedures/{pid}/assistant", headers=H(st_tok), json={"assistant_id": asst["id"]}, timeout=30)
    print("re-add ->", r.status_code, r.json().get("action"))

    # Submit Phase 1 and approve as supervisor then in-charge
    r = httpx.post(f"{BASE}/procedures/{pid}/request-phase1-approval", headers=H(st_tok), timeout=30)
    print("submit-phase1 ->", r.status_code, r.text[:120])
    r = httpx.post(f"{BASE}/procedures/{pid}/approve", headers=H(sup_tok), json={"action": "approve"}, timeout=30)
    print("supervisor approve ->", r.status_code, r.text[:120])
    r = httpx.post(f"{BASE}/procedures/{pid}/approve", headers=H(inc_tok), json={"action": "approve"}, timeout=30)
    print("incharge approve ->", r.status_code, r.json().get("status"))

    proc = httpx.get(f"{BASE}/procedures/{pid}", headers=H(inc_tok), timeout=30).json()
    print("status:", proc["status"], "assistant_notified_at:", proc.get("assistant_notified_at"))
    assert proc.get("assistant_notified_at"), "assistant should be notified after Phase 1 approval"

    # Assisted scope for the owner should be empty; own list should not include via assistant
    own = httpx.get(f"{BASE}/procedures", headers=H(st_tok), timeout=30).json()
    assert any(p["id"] == pid for p in own)
    print("PASS: create / validate / patch / notify flow OK. pid =", pid)

if __name__ == "__main__":
    main()
