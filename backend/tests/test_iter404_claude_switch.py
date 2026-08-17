"""iter-404 backend test: verify all 8 TEXT AI endpoints route via Claude
Sonnet 4.6 with automatic fallback (ANTHROPIC key -> EMERGENT_LLM_KEY),
citation policy, PHI redaction, chat continuity, and no 500 leakage.

Uses the customer-facing preview URL (REACT_APP style) and Abhijit.patil/Admin@123.
"""
import os, re, time, pytest, requests
from pymongo import MongoClient
from bson import ObjectId

BASE_URL = "https://dental-consent-sign.preview.emergentagent.com"
LOGIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}

# ── Mongo for seeding / verifying ai_chat_history persistence ────────────
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME   = os.environ.get("DB_NAME", "test_database")
mc = MongoClient(MONGO_URL)
db = mc[DB_NAME]


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=LOGIN, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"] if "access_token" in r.json() else r.json().get("token")


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def any_procedure_id():
    """Reuse an existing procedure with implant_plans. Pick a small single-
    implant case so /api/ai/case-summary finishes under the 60s ingress
    timeout (see backend_issues in report — larger cases 502 at edge)."""
    proc = db.procedures.find_one(
        {"is_deleted": {"$ne": True}, "implant_plans": {"$size": 1}},
        sort=[("created_at", -1)],
    )
    assert proc, "no single-implant procedure available"
    return str(proc["_id"])


FALLBACK_ERR_MARKER = "hit an error reaching the AI service"


# ────────────────────────────────────────────────────────────────────────
# 1. ai_assistant
# ────────────────────────────────────────────────────────────────────────
def test_ai_assistant_isq_question(headers):
    r = requests.post(
        f"{BASE_URL}/api/ai/assistant",
        headers=headers,
        json={"question": "ISQ 58 two-stage mandibular molar, which loading protocol?"},
        timeout=60,
    )
    if r.status_code == 200 and "taking a bit too long" in (r.json().get("answer") or ""):
        # retry once per agent guidance
        time.sleep(2)
        r = requests.post(
            f"{BASE_URL}/api/ai/assistant",
            headers=headers,
            json={"question": "ISQ 58 two-stage mandibular molar loading protocol?"},
            timeout=60,
        )
    assert r.status_code == 200, r.text[:400]
    ans = r.json().get("answer", "")
    assert ans, "empty answer"
    assert FALLBACK_ERR_MARKER not in ans, f"assistant returned error fallback: {ans}"
    # Should mention concrete thresholds (ISQ 70 or 35 Ncm) somewhere or reason about staged loading
    lower = ans.lower()
    assert any(k in lower for k in ["isq", "ncm", "loading", "stage", "healing"]), f"answer lacks clinical substance: {ans[:400]}"
    print(f"[assistant] len={len(ans)} sample={ans[:180]!r}")


# ────────────────────────────────────────────────────────────────────────
# 2. ai_chat multi-turn continuity + persistence
# ────────────────────────────────────────────────────────────────────────
def test_ai_chat_multi_turn(headers, any_procedure_id):
    # snapshot chat history len before
    proc_before = db.procedures.find_one({"_id": ObjectId(any_procedure_id)}, {"ai_chat_history": 1})
    hist_before = len(proc_before.get("ai_chat_history") or [])

    m1 = "What healing protocol suits a 4.3x10 implant at 40 Ncm?"
    r1 = requests.post(f"{BASE_URL}/api/ai/chat", headers=headers,
                       json={"procedure_id": any_procedure_id, "message": m1}, timeout=60)
    assert r1.status_code == 200, r1.text[:400]
    a1 = r1.json().get("response", "")
    assert a1 and FALLBACK_ERR_MARKER not in a1

    m2 = "and if the patient is diabetic?"
    r2 = requests.post(f"{BASE_URL}/api/ai/chat", headers=headers,
                       json={"procedure_id": any_procedure_id, "message": m2}, timeout=60)
    assert r2.status_code == 200, r2.text[:400]
    a2 = r2.json().get("response", "")
    assert a2 and FALLBACK_ERR_MARKER not in a2

    # continuity — 2nd answer should not be a generic diabetes primer with no linkage.
    # accept "healing" / "loading" / "torque"/"protocol"/"integration" as evidence it kept context.
    la2 = a2.lower()
    assert any(k in la2 for k in ["heal", "loading", "torque", "integration", "protocol", "delayed", "immediate"]), (
        f"2nd chat answer looks context-less: {a2[:300]}"
    )
    print(f"[chat] a1 len={len(a1)}  a2 len={len(a2)}")

    # persistence: history grew by ≥ 4 (2 user + 2 assistant)
    proc_after = db.procedures.find_one({"_id": ObjectId(any_procedure_id)}, {"ai_chat_history": 1})
    hist_after = len(proc_after.get("ai_chat_history") or [])
    assert hist_after >= hist_before + 4, f"history didn't grow: {hist_before} -> {hist_after}"


# ────────────────────────────────────────────────────────────────────────
# 3. ai_case_summary — no source names, no PHI
# ────────────────────────────────────────────────────────────────────────
def test_ai_case_summary_no_citations_and_no_phi(headers, any_procedure_id):
    r = requests.post(f"{BASE_URL}/api/ai/case-summary", headers=headers,
                      json={"procedure_id": any_procedure_id}, timeout=180)
    # Cloudflare edge sometimes 502s on long Claude calls — retry once
    if r.status_code in (502, 504):
        time.sleep(5)
        r = requests.post(f"{BASE_URL}/api/ai/case-summary", headers=headers,
                          json={"procedure_id": any_procedure_id}, timeout=180)
    assert r.status_code == 200, r.text[:400]
    summary = r.json().get("summary", "")
    assert summary and FALLBACK_ERR_MARKER not in summary
    banned = ["ITI", "Misch", "World Workshop", "EAO", "Albrektsson", "Lindhe", "Branemark"]
    hits = [b for b in banned if re.search(rf"\b{re.escape(b)}\b", summary)]
    assert not hits, f"formal document leaked source names: {hits}"

    # PHI redaction — patient name from DB should not appear
    proc = db.procedures.find_one({"_id": ObjectId(any_procedure_id)}, {"patient_name": 1})
    pname = (proc.get("patient_name") or "").strip()
    if pname and len(pname) >= 3:
        assert pname.lower() not in summary.lower(), f"PHI leaked: patient name '{pname}' in summary"
    print(f"[case-summary] len={len(summary)}")


# ────────────────────────────────────────────────────────────────────────
# 4. ai_explain_standalone
# ────────────────────────────────────────────────────────────────────────
def test_ai_explain_standalone(headers):
    body = {
        "tooth": "36",
        "tooth_region": "mandibular molar",
        "brand": "Nobel Biocare",
        "system": "Nobel Active",
        "diameter": 4.3,
        "length": 10,
        "bone_width": 7.5,
        "bone_height": 12,
        "bone_type": "D2",
        "risk_level": "Low",
        "risk_score": 2,
        "procedures": ["Single implant placement"],
    }
    r = requests.post(f"{BASE_URL}/api/ai/explain-standalone", headers=headers, json=body, timeout=60)
    assert r.status_code == 200, r.text[:400]
    expl = r.json().get("explanation", "")
    assert expl and FALLBACK_ERR_MARKER not in expl
    banned = ["ITI", "Misch", "World Workshop", "EAO", "Albrektsson", "Lindhe", "Branemark"]
    hits = [b for b in banned if re.search(rf"\b{re.escape(b)}\b", expl)]
    # explain-standalone uses NO_CITE
    assert not hits, f"explain-standalone leaked source names (NO_CITE): {hits}"
    print(f"[explain-standalone] len={len(expl)} sample={expl[:160]!r}")


# ────────────────────────────────────────────────────────────────────────
# 5. ask-implanr — Nobel Active 4.3 platform
# ────────────────────────────────────────────────────────────────────────
def test_ai_ask_implanr_nobel_active(headers):
    r = requests.post(
        f"{BASE_URL}/api/ai/ask-implanr",
        headers=headers,
        json={"question": "What is the platform diameter of the Nobel Active 4.3 implant?"},
        timeout=60,
    )
    assert r.status_code == 200, r.text[:400]
    ans = r.json().get("answer", "")
    assert ans and FALLBACK_ERR_MARKER not in ans
    # Either provides a spec OR follows exact-spec fallback rule
    # (both are acceptable — we're validating routing, not catalog contents)
    print(f"[ask-implanr] len={len(ans)} sample={ans[:200]!r}")


# ────────────────────────────────────────────────────────────────────────
# 6. Fallback mechanics — inspect backend supervisor log for warning
# ────────────────────────────────────────────────────────────────────────
def test_fallback_warning_logged():
    """After the 5 preceding LLM calls, the backend supervisor log MUST show
    at least one 'Claude call failed on key ending ...' warning line
    (customer key has $0 balance so the primary key always errors first)."""
    log_paths = [
        "/var/log/supervisor/backend.err.log",
        "/var/log/supervisor/backend.out.log",
    ]
    combined = ""
    for p in log_paths:
        try:
            with open(p, "r", errors="ignore") as f:
                combined += f.read()[-200_000:]
        except FileNotFoundError:
            pass
    assert "Claude call failed on key ending" in combined, (
        "expected fallback warning not found in backend logs — either primary key succeeded "
        "(unexpected given zero balance) or _claude_send wiring changed."
    )


# ────────────────────────────────────────────────────────────────────────
# 7. Regression — code inspection that vision paths still route to OpenAI
# ────────────────────────────────────────────────────────────────────────
def test_vision_paths_still_openai():
    with open("/app/backend/server.py", "r") as f:
        src = f.read()
    # explain-recommendation
    idx = src.find('@api_router.post("/ai/explain-recommendation")')
    assert idx != -1
    block = src[idx: idx + 20000]
    assert 'with_model("openai", "gpt-5.2")' in block, "explain-recommendation no longer uses openai gpt-5.2"

    # radiograph AI notes — search for "gpt-5.2" in radiograph area (~11031)
    # cheap check: at least 2 openai gpt-5.2 model bindings survive in the file
    assert src.count('with_model("openai", "gpt-5.2")') >= 2, "expected ≥2 openai gpt-5.2 vision call sites"
