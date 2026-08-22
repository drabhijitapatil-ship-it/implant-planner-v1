import requests

BASE = "https://prosthetic-preview.preview.emergentagent.com/api"

def login(u, p):
    r = requests.post(f"{BASE}/auth/login", json={"identifier": u, "password": p})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}

stu = login("Gaurav.pandey", "Student@123")
sup = login("Paresh.gandhi", "Supervisor@123")
inc = login("Abhijit.patil", "Admin@123")

users = requests.get(f"{BASE}/users", headers=stu).json()
sup_u = next(u for u in users if "Paresh" in (u.get("name") or ""))
inc_u = next(u for u in users if "Abhijit" in (u.get("name") or ""))

STEP1 = {
    "reasons": ["Combined defect"], "defect_teeth": ["14"], "defect_sides": ["Buccal"],
    "horizontal_defect": "Moderate", "vertical_defect": "Moderate",
    "bone_width_before": "4.0", "bone_height_before": "8.0",
    "medical_assessment": {"diabetes": "No", "smoking": "No", "anticoagulant": "No", "osteoporosis": "No", "radiation": "No"},
    "medical_risk_level": "Low Risk",
}
STEP2 = {
    "procedures_performed": ["Guided Bone Regeneration (GBR)"], "autogenous_used": "No",
    "allograft_used": "Yes", "membrane_used": "Yes", "membrane_types": ["Collagen membrane"],
    "fixation": ["Pins"], "soft_tissue_graft": "No", "healing_protocol": "3 months",
}
STEP3_OK = {
    "healing_status": "Completed", "complications": ["None"], "outcome": "Successful",
    "bone_width_after": "6.5", "bone_height_after": "10.0", "cbct_files": [],
    "decision": "complete", "failed_action": "",
}

def make_case(reg, date, time):
    r = requests.post(f"{BASE}/procedures/augmentation-case", headers=stu, json={
        "patient_name": "Step3 UI Patient", "age": "50", "sex": "Female",
        "registration_number": reg, "chief_complaint": "Missing upper premolar",
        "supervisor_id": sup_u["id"] if "id" in sup_u else sup_u["_id"],
        "supervisor_name": sup_u["name"],
        "implant_incharge_id": inc_u["id"] if "id" in inc_u else inc_u["_id"],
        "implant_incharge_name": inc_u["name"],
        "receipt_number": f"R-{reg}", "amount_paid": 5000,
        "procedure_date": date, "procedure_time": time,
    })
    assert r.status_code == 200, r.text[:300]
    return r.json()["id"]

def drive_to_step2_approved(cid):
    requests.post(f"{BASE}/procedures/{cid}/augmentation/step1", headers=stu, json=STEP1)
    requests.post(f"{BASE}/procedures/{cid}/augmentation/step2", headers=stu, json=STEP2)
    requests.post(f"{BASE}/procedures/{cid}/augmentation/approve", headers=sup, json={"action": "approve"})
    requests.post(f"{BASE}/procedures/{cid}/augmentation/approve", headers=inc, json={"action": "approve"})

# Case A: step2 approved → "Proceed to Step 3" button visible
a = make_case("AUG-S3-A", "2026-09-10", "10:00")
drive_to_step2_approved(a)
# Case B: step3 approved (complete) → "Proceed to Phase 2" button visible
b = make_case("AUG-S3-B", "2026-09-11", "10:00")
drive_to_step2_approved(b)
requests.post(f"{BASE}/procedures/{b}/augmentation/step3", headers=stu, json=STEP3_OK)
requests.post(f"{BASE}/procedures/{b}/augmentation/approve", headers=sup, json={"action": "approve"})
requests.post(f"{BASE}/procedures/{b}/augmentation/approve", headers=inc, json={"action": "approve"})

pa = requests.get(f"{BASE}/procedures/{a}", headers=stu).json()
pb = requests.get(f"{BASE}/procedures/{b}", headers=stu).json()
print("CASE_A:", a, pa["augmentations"][-1]["status"])
print("CASE_B:", b, pb["augmentations"][-1]["status"], pb.get("augmentation_outcome"))
