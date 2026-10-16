"""iter-451: Implant Site Preparation Technique (Phase 1 plan + Phase 2 actual)."""
import os
import requests
import pytest
from datetime import datetime, timedelta

BASE = os.environ.get("BACKEND_URL", "http://localhost:8001").rstrip("/") + "/api"


def _login(identifier, password):
    r = requests.post(f"{BASE}/auth/login", json={"identifier": identifier, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"] if "access_token" in r.json() else r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers():
    tok = _login("Abhijit.patil", "Admin@123")
    return {"Authorization": f"Bearer {tok}"}


def test_phase1_create_update_and_phase2_site_prep(admin_headers):
    me = requests.get(f"{BASE}/auth/me", headers=admin_headers).json()
    d = datetime.utcnow() + timedelta(days=3)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    date = d.strftime("%Y-%m-%d")
    payload = {
        "student_name": me["name"],
        "patient_name": "TEST_SitePrep_Iter451",
        "registration_number": f"TEST-SP-{int(datetime.utcnow().timestamp())}",
        "implant_site": "Lower Left 36",
        "receipt_number": "TEST-SP-R1", "amount_paid": 100.0,
        "procedure_date": date, "procedure_time": "10:00",
        "supervisor_id": me["id"], "supervisor_name": me["name"],
        "implant_incharge_id": me["id"], "implant_incharge_name": me["name"],
        "implant_procedure_type": "Single Conventional Implant",
        "procedure_surgery_type": "Free Hand Sequential Drilling",
        "site_prep_technique": "Osseodensification",
        "loading_type": ["Delayed Loading"],
        "missing_teeth": ["36"],
    }
    r = requests.post(f"{BASE}/procedures", json=payload, headers=admin_headers)
    assert r.status_code in (200, 201), r.text
    pid = r.json().get("id") or r.json().get("_id") or r.json().get("procedure_id")
    proc = requests.get(f"{BASE}/procedures/{pid}", headers=admin_headers).json()
    assert proc["site_prep_technique"] == "Osseodensification"

    r = requests.put(f"{BASE}/procedures/{pid}", json={"site_prep_technique": "Piezoelectric (Ultrasonic) Osteotomy"}, headers=admin_headers)
    assert r.status_code == 200, r.text
    proc = requests.get(f"{BASE}/procedures/{pid}", headers=admin_headers).json()
    assert proc["site_prep_technique"] == "Piezoelectric (Ultrasonic) Osteotomy"

    # Phase 2 submit stores the actual technique (bypass preop/consent gates via Mongo)
    from pymongo import MongoClient
    from bson import ObjectId
    from datetime import timezone
    db = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[os.environ.get("DB_NAME", "test_database")]
    db.procedures.update_one({"_id": ObjectId(pid)}, {"$set": {
        "status": "phase1_approved",
        "phase2_preop_completed_at": datetime.now(timezone.utc),
        "patient_consent_form": {"filename": "c.pdf", "original_name": "c.pdf", "content_type": "application/pdf",
                                 "uploaded_by_id": "t", "uploaded_by_name": "t", "uploaded_by_role": "supervisor",
                                 "uploaded_at": datetime.now(timezone.utc).isoformat(), "version": 1},
    }})
    p2 = {
        "pre_surgery_checklist": {}, "anesthesia_adequate": "Yes",
        "flap_design": "Mid-crestal Incision",
        "drilling_type": "Combination of Guided and Free Hand Sequential Drilling",
        "drilling_site_prep_technique": "Magneto-dynamic Surgical Device",
        "drilling_guided_surgery_type": "Static Guide",
        "drilling_static_guide_type": "Tooth Supported Guide",
        "drilling_sleeve_type": "Key Sleeve",
        "torque_values": [35], "prosthetic_component": "Cover Screw Placed",
    }
    r = requests.post(f"{BASE}/procedures/{pid}/submit-phase2", json=p2, headers=admin_headers)
    assert r.status_code == 200, r.text
    proc = requests.get(f"{BASE}/procedures/{pid}", headers=admin_headers).json()
    assert proc["phase2_data"]["drilling_site_prep_technique"] == "Magneto-dynamic Surgical Device"
    db.procedures.delete_one({"_id": ObjectId(pid)})
