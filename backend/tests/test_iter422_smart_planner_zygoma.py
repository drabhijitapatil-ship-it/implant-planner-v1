"""iter-422 (Chunk E, Ask 1): Smart Planner classifier fields for Zygoma cases.

Verifies /api/procedures/{id}/smart-planner returns case_type and arch_condition
for the 6 procedure types described in the review-request.
"""
import os
import pytest
import requests
from pymongo import MongoClient
from bson import ObjectId
from copy import deepcopy

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://prosthetic-preview.preview.emergentagent.com').rstrip('/')
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')

# Case chosen: 6a8337dd64ad3269dc584a69 — seeded Zygoma+Pterygoid+Conventional case (iter-421)
CASE_ID = "6a8337dd64ad3269dc584a69"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"identifier": "Abhijit.patil", "password": "Admin@123"})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def mongo_col():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]["procedures"]


@pytest.fixture(scope="module")
def original_case(mongo_col):
    doc = mongo_col.find_one({"_id": ObjectId(CASE_ID)})
    assert doc is not None, "Test case not found"
    return deepcopy(doc)


@pytest.fixture(autouse=True)
def restore_case(mongo_col, original_case):
    yield
    # After each test, restore the case exactly as it was
    mongo_col.replace_one({"_id": ObjectId(CASE_ID)}, original_case)


def _set_case(mongo_col, implant_procedure_type, arch=None):
    """Mutate the case to have the given implant_procedure_type + status stage2_surgical_approved."""
    update = {
        "implant_procedure_type": implant_procedure_type,
        "status": "stage2_surgical_approved",
    }
    if arch is None:
        # Explicitly clear arch to test the default-to-Maxillary logic for Zygoma
        update["arch"] = ""
    else:
        update["arch"] = arch
    mongo_col.update_one({"_id": ObjectId(CASE_ID)}, {"$set": update})


def _call_planner(token):
    r = requests.post(
        f"{BASE_URL}/api/procedures/{CASE_ID}/smart-planner",
        headers={"Authorization": f"Bearer {token}"},
    )
    return r


# ─── ZYGOMA_FULL_ARCH_SET: 4 procedure types → full_arch + edentulous_maxillary ──

@pytest.mark.parametrize("proc_type", [
    "Quad Zygoma Implants",
    "Zygoma and Pterygoid Implants",
    "Zygoma and Conventional Implants",
    "Zygoma, Pterygoid and Conventional Implants",
])
def test_zygoma_types_return_full_arch_and_edentulous_maxillary(mongo_col, admin_token, proc_type):
    _set_case(mongo_col, proc_type, arch=None)
    r = _call_planner(admin_token)
    assert r.status_code == 200, f"[{proc_type}] status={r.status_code} body={r.text}"
    body = r.json()
    assert body.get("case_type") == "full_arch", f"[{proc_type}] case_type={body.get('case_type')}"
    assert body.get("arch_condition") == "edentulous_maxillary", (
        f"[{proc_type}] arch_condition={body.get('arch_condition')}"
    )
    assert body.get("procedure_type") == proc_type


def test_zygoma_defaults_arch_to_maxillary_when_unset(mongo_col, admin_token):
    """When arch is empty on a Zygoma case, the Restorative Space module (if present)
    should reflect arch=Maxillary. We can also assert the persisted smart_planner_report
    doesn't reject the case."""
    # Provide interarch space so the space module renders and we can see arch resolution
    mongo_col.update_one({"_id": ObjectId(CASE_ID)}, {"$set": {
        "implant_procedure_type": "Quad Zygoma Implants",
        "status": "stage2_surgical_approved",
        "arch": "",
        "available_interarch_space": "13",
    }})
    r = _call_planner(admin_token)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("case_type") == "full_arch"
    assert body.get("arch_condition") == "edentulous_maxillary"
    # Restorative space module should exist and report arch = Maxillary
    modules = body.get("modules") or []
    interarch_mods = [m for m in modules if m.get("id") == "interarch_space"]
    if interarch_mods:
        assert interarch_mods[0]["data"].get("arch") == "Maxillary", (
            f"Expected default Maxillary arch, got {interarch_mods[0]['data'].get('arch')}"
        )
        assert interarch_mods[0]["title"] == "Maxillary Restorative Space Analysis"


# ─── Pterygoid-only (no Zygoma) → dentulous, arch_condition null ──

def test_pterygoid_and_conventional_is_dentulous(mongo_col, admin_token):
    _set_case(mongo_col, "Pterygoid and Conventional Implants", arch=None)
    r = _call_planner(admin_token)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("case_type") == "dentulous", f"case_type={body.get('case_type')}"
    assert body.get("arch_condition") is None, f"arch_condition={body.get('arch_condition')}"


# ─── FULL_ARCH_SET (non-zygoma) → full_arch, arch_condition null ──

@pytest.mark.parametrize("proc_type", ["All on 4", "All on 6", "All on X"])
def test_all_on_x_full_arch_but_null_arch_condition(mongo_col, admin_token, proc_type):
    _set_case(mongo_col, proc_type, arch="Maxillary")
    r = _call_planner(admin_token)
    assert r.status_code == 200, f"[{proc_type}] {r.text}"
    body = r.json()
    assert body.get("case_type") == "full_arch", f"[{proc_type}] case_type={body.get('case_type')}"
    assert body.get("arch_condition") is None, f"[{proc_type}] arch_condition={body.get('arch_condition')}"


# ─── Non full-arch cases → dentulous ──

@pytest.mark.parametrize("proc_type", ["Single Implant Placement", "Multiple Implant Placement"])
def test_single_and_multiple_are_dentulous(mongo_col, admin_token, proc_type):
    _set_case(mongo_col, proc_type, arch="Maxillary")
    r = _call_planner(admin_token)
    assert r.status_code == 200, f"[{proc_type}] {r.text}"
    body = r.json()
    assert body.get("case_type") == "dentulous", f"[{proc_type}] case_type={body.get('case_type')}"
    assert body.get("arch_condition") is None, f"[{proc_type}] arch_condition={body.get('arch_condition')}"
