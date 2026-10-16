"""iter-452: site.preparation_technique in the Research field registry."""
import os
import requests
import research as R

BASE = os.environ.get("BACKEND_URL", "http://localhost:8001").rstrip("/") + "/api"
PATH = "site.preparation_technique"
OPTS = ["Conventional Drilling", "Conventional Osteotome Technique (Bone Condensation & Expansion)",
        "Osseodensification", "Piezoelectric (Ultrasonic) Osteotomy", "Magneto-dynamic Surgical Device"]


def test_registry_entry_shape():
    reg = R.REGISTRY[PATH]
    assert reg["level"] == "site" and reg["data_type"] == "single_select" and reg["phase"] == 2
    assert [o["code"] for o in reg["options"]] == OPTS


def test_case_value_prefers_phase2_actual_then_phase1_plan():
    imp = {"tooth_number": 36}
    assert R.case_value({"site_prep_technique": "Osseodensification"}, imp, PATH) == "Osseodensification"
    assert R.case_value({"site_prep_technique": "Osseodensification",
                         "phase2_data": {"drilling_site_prep_technique": "Piezoelectric (Ultrasonic) Osteotomy"}},
                        imp, PATH) == "Piezoelectric (Ultrasonic) Osteotomy"
    assert R.case_value({"phase2_data": {"drilling_site_prep_technique": None}}, imp, PATH) is None


def test_eligibility_rule_on_site_prep():
    study = {"eligibility": [
        {"kind": "include", "mode": "query", "query": {"all": [{"field": PATH, "op": "in", "value": ["Osseodensification"]}]}},
    ]}
    ok = R.evaluate_eligibility(study, {"site_prep_technique": "Osseodensification"}, {"tooth_number": 36})
    bad = R.evaluate_eligibility(study, {"site_prep_technique": "Conventional Drilling"}, {"tooth_number": 36})
    assert ok["overall"] == "eligible" and bad["overall"] == "excluded"
    assert R.validate_condition({"field": PATH, "op": "in", "value": ["Osseodensification"]}) == []


def test_registry_endpoint_exposes_path():
    tok = requests.post(f"{BASE}/auth/login", json={"identifier": "Abhijit.patil", "password": "Admin@123"}).json()
    tok = tok.get("access_token") or tok.get("token")
    r = requests.get(f"{BASE}/research/registry", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200, r.text
    paths = {f["path"]: f for f in r.json()["fields"]}
    assert PATH in paths and paths[PATH]["label"] == "Implant site preparation technique"
