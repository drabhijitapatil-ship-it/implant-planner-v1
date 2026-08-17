import requests

BASE = "https://dental-consent-sign.preview.emergentagent.com/api"
CASE = "6a6b2d12811c1535451fde5d"

def login(u, p):
    r = requests.post(f"{BASE}/auth/login", json={"identifier": u, "password": p})
    assert r.status_code == 200, r.text[:200]
    return {"Authorization": f"Bearer {r.json()['access_token']}"}

stu = login("Gaurav.pandey", "Student@123")
sup = login("Paresh.gandhi", "Supervisor@123")
inc = login("Abhijit.patil", "Admin@123")

def get_case():
    p = requests.get(f"{BASE}/procedures/{CASE}", headers=stu).json()
    return p, (p.get("augmentations") or [])[-1]

STEP1 = {
    "reasons": ["Vertical ridge deficiency"], "defect_teeth": ["36"], "defect_sides": ["Lingual"],
    "horizontal_defect": "Severe", "vertical_defect": "Severe", "defect_other": "",
    "bone_width_before": "3.0", "bone_height_before": "6.0",
    "medical_assessment": {"diabetes": "No", "smoking": "Yes", "anticoagulant": "No", "osteoporosis": "No", "radiation": "No"},
    "medical_risk_level": "Moderate Risk",
}
STEP2 = {
    "procedures_performed": ["Block Bone Graft"], "autogenous_used": "Yes", "autogenous_sites": ["Ramus"],
    "allograft_used": "No", "membrane_used": "No", "fixation": ["Titanium screws"],
    "soft_tissue_graft": "No", "healing_protocol": "6 months",
}

def run_round(step3_payload):
    p, rnd = get_case()
    if rnd["status"] == "step1_pending":
        r = requests.post(f"{BASE}/procedures/{CASE}/augmentation/step1", headers=stu, json=STEP1)
        print("step1:", r.status_code)
    p, rnd = get_case()
    if rnd["status"] == "step2_pending":
        r = requests.post(f"{BASE}/procedures/{CASE}/augmentation/step2", headers=stu, json=STEP2)
        print("step2:", r.status_code)
    r = requests.post(f"{BASE}/procedures/{CASE}/augmentation/approve", headers=sup, json={"action": "approve"})
    print("sup step2:", r.status_code)
    r = requests.post(f"{BASE}/procedures/{CASE}/augmentation/approve", headers=inc, json={"action": "approve"})
    print("inc step2:", r.status_code)
    r = requests.post(f"{BASE}/procedures/{CASE}/augmentation/step3", headers=stu, json=step3_payload)
    print("step3:", r.status_code, r.json().get("message", r.text[:150]))
    r = requests.post(f"{BASE}/procedures/{CASE}/augmentation/approve", headers=sup, json={"action": "approve"})
    print("sup step3:", r.status_code)
    r = requests.post(f"{BASE}/procedures/{CASE}/augmentation/approve", headers=inc, json={"action": "approve"})
    print("inc step3:", r.status_code, r.json().get("message", r.text[:250]))

# Round 1: failed → repeat
run_round({
    "healing_status": "Failed", "complications": ["Infection", "Partial graft loss"],
    "outcome": "Failed", "decision": "failed", "failed_action": "repeat",
})
p, rnd = get_case()
rounds = p.get("augmentations") or []
print("after repeat: rounds =", len(rounds), "| last round:", rnd["round"], rnd["status"], "| sched:", repr(rnd.get("scheduled_date")), "| outcome:", p.get("augmentation_outcome"))
assert len(rounds) == 2 and rnd["status"] == "step1_pending" and rounds[0]["status"] == "step3_approved"

# Round 2: failed → terminate
run_round({
    "healing_status": "Failed", "complications": ["Complete graft failure"],
    "outcome": "Failed", "decision": "failed", "failed_action": "terminate",
})
p, rnd = get_case()
print("after terminate: case status =", p.get("status"), "| outcome:", p.get("augmentation_outcome"), "| reason:", p.get("treatment_ended_reason"))
assert p.get("status") == "treatment_ended" and rnd["status"] == "step3_approved"
print("\nREPEAT + TERMINATE PATHS PASSED")
