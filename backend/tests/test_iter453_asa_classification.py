"""iter-453: ASA Classification stored under medical_assessment.asa_class."""
import os
import requests
import research as R

BASE = os.environ.get("BACKEND_URL", "http://localhost:8001").rstrip("/") + "/api"


def _hdr():
    r = requests.post(f"{BASE}/auth/login", json={"identifier": "Abhijit.patil", "password": "Admin@123"}).json()
    return {"Authorization": f"Bearer {r.get('access_token') or r.get('token')}"}


def test_registry_asa_class():
    reg = R.REGISTRY["patient.medical.asa_class"]
    assert [o["code"] for o in reg["options"]] == ["I", "II", "III", "IV", "V", "VI"]
    assert R.case_value({"medical_assessment": {"asa_class": "IV"}}, None, "patient.medical.asa_class") == "IV"
    study = {"eligibility": [{"kind": "exclude", "mode": "query",
                              "query": {"all": [{"field": "patient.medical.asa_class", "op": "in", "value": ["IV", "V", "VI"]}]}}]}
    assert R.evaluate_eligibility(study, {"medical_assessment": {"asa_class": "II"}}, None)["overall"] == "eligible"
    assert R.evaluate_eligibility(study, {"medical_assessment": {"asa_class": "IV"}}, None)["overall"] == "excluded"


def test_edit_fields_persists_asa_and_pdf_renders():
    h = _hdr()
    procs = requests.get(f"{BASE}/procedures", headers=h).json()
    procs = procs if isinstance(procs, list) else procs.get("procedures", [])
    target = next(p for p in procs if p.get("status") not in ("archived",))
    pid = target.get("id") or target.get("_id")
    orig = (target.get("medical_assessment") or {}).copy()
    try:
        r = requests.patch(f"{BASE}/procedures/{pid}/edit-fields",
                           json={"fields": {"medical_assessment": {**orig, "asa_class": "III"}}}, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["medical_assessment"]["asa_class"] == "III"
        pdf = requests.post(f"{BASE}/procedures/{pid}/case-report", json={}, headers=h)
        assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    finally:
        requests.patch(f"{BASE}/procedures/{pid}/edit-fields", json={"fields": {"medical_assessment": orig}}, headers=h)
