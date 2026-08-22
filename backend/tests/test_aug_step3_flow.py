import requests, json, sys

BASE = "https://prosthetic-preview.preview.emergentagent.com/api"
CASE = "6a6b300e811c1535451fde6a"

def login(u, p):
    r = requests.post(f"{BASE}/auth/login", json={"identifier": u, "password": p})
    assert r.status_code == 200, f"login {u}: {r.status_code} {r.text[:200]}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}

stu = login("Gaurav.pandey", "Student@123")
sup = login("Paresh.gandhi", "Supervisor@123")
inc = login("Abhijit.patil", "Admin@123")

def get_round():
    r = requests.get(f"{BASE}/procedures/{CASE}", headers=stu)
    assert r.status_code == 200, r.text[:300]
    p = r.json()
    return p, (p.get("augmentations") or [])[-1]

p, rnd = get_round()
print("initial round status:", rnd["status"])

# Step 1
if rnd["status"] == "step1_pending":
    r = requests.post(f"{BASE}/procedures/{CASE}/augmentation/step1", headers=stu, json={
        "reasons": ["Horizontal ridge deficiency"], "reason_other_text": "",
        "defect_teeth": ["24", "25"], "defect_sides": ["Buccal"],
        "horizontal_defect": "Moderate", "vertical_defect": "Mild", "defect_other": "",
        "bone_width_before": "4.2", "bone_height_before": "9.5",
        "medical_assessment": {"diabetes": "No", "smoking": "No", "anticoagulant": "No", "osteoporosis": "No", "radiation": "No"},
        "medical_risk_level": "Low Risk",
    })
    print("step1:", r.status_code, r.json().get("message", r.text[:150]))

p, rnd = get_round()
# Step 2
if rnd["status"] == "step2_pending":
    r = requests.post(f"{BASE}/procedures/{CASE}/augmentation/step2", headers=stu, json={
        "procedures_performed": ["Guided Bone Regeneration (GBR)"], "procedure_other_text": "",
        "autogenous_used": "Yes", "autogenous_sites": ["Chin"], "autogenous_other_text": "",
        "allograft_used": "No", "other_graft_materials": ["Xenograft"], "graft_material_other_text": "",
        "membrane_used": "Yes", "membrane_types": ["Collagen membrane"], "membrane_other_text": "",
        "fixation": ["Bone tacks"],
        "soft_tissue_graft": "No", "soft_tissue_types": [], "soft_tissue_donor_sites": [],
        "soft_tissue_indications": [], "soft_tissue_other_text": "",
        "healing_protocol": "4 months", "healing_custom_text": "",
    })
    print("step2:", r.status_code, r.json().get("message", r.text[:150]))

p, rnd = get_round()
print("after step2 status:", rnd["status"])
if rnd["status"] == "pending_supervisor":
    r = requests.post(f"{BASE}/procedures/{CASE}/augmentation/approve", headers=sup, json={"action": "approve", "comment": "Graft looks fine"})
    print("sup approve step2:", r.status_code, r.json().get("message", r.text[:200]))
p, rnd = get_round()
if rnd["status"] == "pending_incharge":
    r = requests.post(f"{BASE}/procedures/{CASE}/augmentation/approve", headers=inc, json={"action": "approve"})
    print("inc approve step2:", r.status_code, r.json().get("message", r.text[:200]))
p, rnd = get_round()
print("after step2 approvals:", rnd["status"])
assert rnd["status"] == "approved"

# Step 3 — first try a bad payload (missing decision)
r = requests.post(f"{BASE}/procedures/{CASE}/augmentation/step3", headers=stu, json={
    "healing_status": "Completed", "complications": [], "outcome": "Successful", "decision": "complete"})
print("step3 invalid (expect 400):", r.status_code, r.json().get("detail", "")[:80])

r = requests.post(f"{BASE}/procedures/{CASE}/augmentation/step3", headers=stu, json={
    "healing_status": "Completed", "complications": ["None"], "complication_other_text": "",
    "outcome": "Successful", "bone_width_after": "7.1", "bone_height_after": "11.0",
    "cbct_files": [{"filename": "abc.pdf", "original_name": "postgraft_cbct.pdf", "content_type": "application/pdf"}],
    "decision": "complete", "failed_action": "",
})
print("step3 submit:", r.status_code, r.json().get("message", r.text[:200]))

p, rnd = get_round()
print("after step3 submit:", rnd["status"], "| has step3:", bool(rnd.get("step3")))
assert rnd["status"] == "pending_supervisor"

# Supervisor rejects step3 → student revises → resubmit
r = requests.post(f"{BASE}/procedures/{CASE}/augmentation/approve", headers=sup, json={"action": "reject", "rejection_reason": "Add vertical gain detail"})
print("sup reject step3:", r.status_code, r.json().get("message", r.text[:200]))
p, rnd = get_round()
assert rnd["status"] == "rejected" and rnd.get("step3")

# Step 2 resubmission should be blocked now
r = requests.post(f"{BASE}/procedures/{CASE}/augmentation/step2", headers=stu, json={
    "procedures_performed": ["Ridge Split"], "healing_protocol": "2 months"})
print("step2 after step3-reject (expect 400):", r.status_code, r.json().get("detail", "")[:100])

r = requests.post(f"{BASE}/procedures/{CASE}/augmentation/step3", headers=stu, json={
    "healing_status": "Completed", "complications": ["None"], "complication_other_text": "",
    "outcome": "Successful", "bone_width_after": "7.1", "bone_height_after": "11.2",
    "cbct_files": [{"filename": "abc.pdf", "original_name": "postgraft_cbct.pdf", "content_type": "application/pdf"}],
    "decision": "complete", "failed_action": "",
})
print("step3 resubmit:", r.status_code, r.json().get("message", r.text[:150]))

r = requests.post(f"{BASE}/procedures/{CASE}/augmentation/approve", headers=sup, json={"action": "approve"})
print("sup approve step3:", r.status_code, r.json().get("message", r.text[:200]))
r = requests.post(f"{BASE}/procedures/{CASE}/augmentation/approve", headers=inc, json={"action": "approve"})
print("inc approve step3:", r.status_code, r.json().get("message", r.text[:250]))

p, rnd = get_round()
print("final round status:", rnd["status"], "| augmentation_outcome:", p.get("augmentation_outcome"), "| case status:", p.get("status"))
assert rnd["status"] == "step3_approved" and p.get("augmentation_outcome") == "proceed_phase2"

# complete-phase1
payload = {
    "student_name": "Gaurav Pandey", "patient_name": p["patient_name"], "age": "45", "sex": "Male",
    "registration_number": p["registration_number"], "chief_complaint": p.get("chief_complaint", ""),
    "supervisor_id": p["supervisor_id"], "supervisor_name": p["supervisor_name"],
    "implant_incharge_id": p["implant_incharge_id"], "implant_incharge_name": p["implant_incharge_name"],
    "receipt_number": "R-IMPL-77", "amount_paid": 25000,
    "procedure_date": "2026-10-15", "procedure_time": "10:00",
    "implant_procedure_type": "Single Conventional Implant",
    "missing_teeth": ["24"], "loading_type": ["Delayed Loading"],
    "prosthetic_plan": "Screw Retained Crown",
}
r = requests.put(f"{BASE}/procedures/{CASE}/augmentation/complete-phase1", headers=stu, json=payload)
print("complete-phase1:", r.status_code, r.json().get("message", r.text[:300]))
p2 = requests.get(f"{BASE}/procedures/{CASE}", headers=stu).json()
print("post-resume case status:", p2.get("status"), "| type:", p2.get("implant_procedure_type"), "| aug rounds kept:", len(p2.get("augmentations") or []), "| outcome:", p2.get("augmentation_outcome"))
assert p2.get("status") == "draft" and len(p2.get("augmentations") or []) == 1
print("\nALL BACKEND FLOW CHECKS PASSED")
