"""iter-455: Phase 1 Clinical Diagnosis (Atlas rules engine)."""
import os
from datetime import datetime, timedelta

import requests
import diagnosis_engine as dx
import research as R

BASE = os.environ.get("BACKEND_URL", "http://localhost:8001").rstrip("/") + "/api"


def _login(ident, pw):
    r = requests.post(f"{BASE}/auth/login", json={"identifier": ident, "password": pw}).json()
    return {"Authorization": f"Bearer {r.get('access_token') or r.get('token')}"}


# ── unit: engine ───────────────────────────────────────────────────────
def test_engine_patient_bands_and_verdict():
    proc = {"implant_procedure_type": "Single Conventional Implant", "missing_teeth": ["36"],
            "medical_assessment": {"asa_class": "IV", "diabetes": "Controlled", "hba1c": "7.5", "smoking": "Heavy (>10/day)"},
            "periodontal_status": "Fair"}
    r = dx.generate(proc)
    codes = {f["code"]: f["band"] for f in r["findings"]}
    assert codes["P-ASA"] == dx.HI and codes["P-DM"] == dx.MOD and codes["P-SMK"] == dx.HI and codes["P-PER"] == dx.MOD
    assert r["verdict"] == "Defer"
    assert "Clearance to the inferior alveolar canal (mm)" in r["not_assessed"]
    text = r["text"]
    import re
    for banned in ("ITI", "SAC", "Tarnow", "Linkevicius", "Elian", "Aparicio", "ERA"):
        assert not re.search(rf"\b{banned}\b", text), banned


def test_engine_site_bands_single_anterior():
    proc = {"implant_procedure_type": "Immediate Implant", "missing_teeth": ["11"],
            "edentulous_site_measurements": {"11": {"md": "6", "oc": "4.5"}}, "socket_types": {"11": "Type II"},
            "gingival_biotype": "Thin, High scalloped", "smile_line": "High", "soft_tissue_thickness": "Thin",
            "aesthetic_risk": {"patient_expectations": "High esthetic demands",
                               "sites": {"11": {"infection_at_site": "Acute", "bone_level_adjacent": "≥ 7 mm to contact point"}}},
            "medical_assessment": {"asa_class": "I"}}
    r = dx.generate(proc)
    by = {(f["code"], f.get("site")): f["band"] for f in r["findings"]}
    assert by[("S-MD", "11")] == dx.MOD and by[("S-IOS", "11")] == dx.HI and by[("S-SOCK", "11")] == dx.MOD
    assert by[("S-INF", "11")] == dx.HI and by[("S-PAP", "11")] == dx.HI
    assert by[("S-PHN", None)] == dx.HI and by[("S-SML", None)] == dx.HI and by[("S-ERA", None)] == dx.HI
    assert r["verdict"] == "Modify plan"  # site HI → modify (staged), patient LO
    assert "tooth 11" in r["text"]


def test_engine_full_arch_and_zygoma_and_existing():
    fa = dx.generate({"implant_procedure_type": "All on 4", "arch": "Maxillary", "num_implants": "4", "arch_condition": "Resorbed",
                      "available_interarch_space": "11", "opposing_arch": "Fixed Implant Prosthesis", "medical_assessment": {"asa_class": "II"}})
    c = {f["code"]: f["band"] for f in fa["findings"]}
    assert c["F-RRF"] == dx.HI and c["F-RS"] == dx.HI and c["F-OPP"] == dx.MOD and c["F-NUM"] == dx.MOD
    zy = dx.generate({"implant_procedure_type": "Quad Zygoma Implants", "arch": "Maxillary", "medical_assessment": {"asa_class": "II"},
                      "zygoma_pterygoid_data": {"phase1": {"pre_surgical": {"interincisal_opening_mm": "32", "sinus_health": "No", "omc_patent": {"right": "No", "left": "Yes"}},
                                                           "intraoral": {"residual_ridge_form": "Class V"}, "zaga": {"right": "ZAGA 4", "left": "ZAGA 1"},
                                                           "bedrossian_zones": {"zone1_premaxilla_mm": {"right": "0", "left": "6"}}}}})
    codes = [f["code"] for f in zy["findings"]]
    assert "Z-MO" in codes and "Z-SIN" in codes and "Z-ZAGA" in codes and "Z-BED" in codes and "F-RRF" in codes
    ex = dx.generate({"implant_procedure_type": "Existing Implant", "medical_assessment": {"asa_class": "III", "smoking": "No"}})
    assert all(f["section"] == "Patient-level risk" for f in ex["findings"]) and ex["verdict"] == "Modify plan"
    assert dx.generate({"implant_procedure_type": "Single Conventional Implant"})["verdict"] == "Incomplete"


def test_registry_verdict_field():
    assert R.case_value({"phase1_diagnosis": {"verdict": "Defer"}}, None, "case.diagnosis_verdict") == "Defer"


# ── API: generate / edit / auto-generate on submit ─────────────────────
def test_api_generate_edit_and_submit_autogen():
    h = _login("Abhijit.patil", "Admin@123")
    me = requests.get(f"{BASE}/auth/me", headers=h).json()
    d = datetime.utcnow() + timedelta(days=4)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    payload = {
        "student_name": me["name"], "patient_name": "TEST_Dx_Iter455", "registration_number": f"TEST-DX-{int(datetime.utcnow().timestamp())}",
        "implant_site": "Lower Left 36", "receipt_number": "TEST-DX-R1", "amount_paid": 100.0,
        "procedure_date": d.strftime("%Y-%m-%d"), "procedure_time": "10:00",
        "supervisor_id": me["id"], "supervisor_name": me["name"], "implant_incharge_id": me["id"], "implant_incharge_name": me["name"],
        "implant_procedure_type": "Single Conventional Implant", "procedure_surgery_type": "Free Hand Sequential Drilling",
        "site_prep_technique": "Conventional Drilling", "loading_type": ["Delayed Loading"], "missing_teeth": ["36"],
        "medical_assessment": {"asa_class": "III", "smoking": "Light (<10/day)"}, "periodontal_status": "Good",
    }
    r = requests.post(f"{BASE}/procedures", json=payload, headers=h)
    assert r.status_code in (200, 201), r.text
    pid = r.json().get("id") or r.json().get("_id")
    from pymongo import MongoClient
    from bson import ObjectId
    db = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[os.environ.get("DB_NAME", "test_database")]
    try:
        g = requests.post(f"{BASE}/procedures/{pid}/diagnosis/generate", headers=h)
        assert g.status_code == 200, g.text
        dxr = g.json()
        assert dxr["verdict"] == "Modify plan" and dxr["text"] and dxr["version"] == 1
        assert any(f["code"] == "P-ASA" for f in dxr["findings"])

        e = requests.put(f"{BASE}/procedures/{pid}/diagnosis", json={"text": "Edited diagnosis text."}, headers=h)
        assert e.status_code == 200 and e.json()["text"] == "Edited diagnosis text." and e.json()["edited_by_name"]

        # Non-forced regenerate keeps edits; forced replaces them
        g2 = requests.post(f"{BASE}/procedures/{pid}/diagnosis/generate", headers=h).json()
        assert g2["text"] == "Edited diagnosis text." and g2["version"] == 2
        g3 = requests.post(f"{BASE}/procedures/{pid}/diagnosis/generate?force=true", headers=h).json()
        assert g3["text"] != "Edited diagnosis text." and g3["text"].startswith("CLINICAL DIAGNOSIS")

        # Empty text rejected
        assert requests.put(f"{BASE}/procedures/{pid}/diagnosis", json={"text": ""}, headers=h).status_code == 422

        # Student not on the case → 403
        sh = _login("Gaurav.pandey", "Student@123")
        assert requests.put(f"{BASE}/procedures/{pid}/diagnosis", json={"text": "x"}, headers=sh).status_code == 403

        # Submission without a diagnosis auto-generates one
        db.procedures.update_one({"_id": ObjectId(pid)}, {"$unset": {"phase1_diagnosis": ""}})
        s = requests.put(f"{BASE}/procedures/{pid}", json={"status": "pending_phase1"}, headers=h)
        assert s.status_code == 200, s.text
        assert (s.json().get("phase1_diagnosis") or {}).get("text", "").startswith("CLINICAL DIAGNOSIS")

        # PDF renders with the diagnosis
        pdf = requests.post(f"{BASE}/procedures/{pid}/case-report", json={}, headers=h)
        assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    finally:
        db.procedures.delete_one({"_id": ObjectId(pid)})
