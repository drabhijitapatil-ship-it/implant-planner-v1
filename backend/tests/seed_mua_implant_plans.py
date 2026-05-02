"""Add implant plans to the 3 seeded procedures so Phase-2 UI renders multi-torque + MUA."""
import os, sys, requests
sys.path.insert(0, os.path.dirname(__file__))
from test_mua_phase2_iteration139 import _login, STUDENT_CREDS, _hdr, BASE_URL

IDS = {
    "full_arch_imm": ("69f640120ae04a75cf8d0cb6", ["11","12","21","22"]),
    "single_imm":    ("69f640140ae04a75cf8d0cc7", ["14"]),
    "full_arch_delayed": ("69f640160ae04a75cf8d0cd8", ["31","32","41","42"]),
}

token = _login(STUDENT_CREDS)
for label, (pid, positions) in IDS.items():
    payload = {"implants": [
        {"position": p, "brand": "Straumann", "system": "BLT",
         "diameter": 4.1, "length": 10.0,
         "bone_width": 7.0, "bone_height": 12.0, "bone_type": "D2",
         "risk_level": "Low", "risk_score": 10}
        for p in positions
    ]}
    r = requests.post(f"{BASE_URL}/api/procedures/{pid}/implant-plan",
                      json=payload, headers=_hdr(token), timeout=30)
    print(label, pid, r.status_code, r.text[:200] if r.status_code != 200 else "OK")
