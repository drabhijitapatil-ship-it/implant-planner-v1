"""iter-Feb-2026-B — Multiple / Full-Arch / Zygoma prosthesis workflows.

Backend suite covering:
  Group A — Multiple Conventional / Pterygoid + Conventional Implants
    (4-part ma_* fields, plus type_of_provisional)
  Group B — All on 4 / All on 6 / All on X
    (fa_prosthetic_plan single dropdown)
  Group C — Quad Zygoma / Zygoma+Pterygoid / Zygoma+Conv / Zygoma+Pter+Conv
    (zp_prosthetic_plan single dropdown)

All groups: 'Other' branch → _other free-text sibling.
Phase 4 Step 1 renders *_final_* mirror fields; audit trail appended to
prosthetic_plan_change_log; idempotent re-submit adds no entry.
PDF /api/procedures/{id}/case-report contains group-specific labels.
Existing SC workflow (iter_feb2026) plus non-group cases must not regress.

We seed cases by POST /api/procedures and advance status via direct Mongo
mutation to bypass scheduling / approval gates.
"""
from __future__ import annotations
import io
import os
import sys
import pytest
import requests
from bson import ObjectId
from datetime import datetime, timedelta
from pymongo import MongoClient

try:
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
except Exception:
    pass

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://prosthetic-preview.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}
ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}
SUPERVISOR = {"identifier": "Paresh.gandhi", "password": "Supervisor@123"}

_mongo = MongoClient(os.environ["MONGO_URL"])
_db = _mongo[os.environ["DB_NAME"]]


# ---------------- Auth ----------------

def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed for {creds['identifier']}: {r.status_code} {r.text}"
    j = r.json()
    return j["access_token"], j.get("user") or {}


@pytest.fixture(scope="module")
def student_ctx():
    tok, user = _login(STUDENT)
    return {"tok": tok, "id": user.get("id") or user.get("_id"),
            "name": user.get("name") or "Dr. Gaurav Pandey",
            "headers": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}}


@pytest.fixture(scope="module")
def admin_ctx():
    tok, user = _login(ADMIN)
    return {"tok": tok, "id": user.get("id") or user.get("_id"),
            "name": user.get("name") or "Dr. Abhijit Patil",
            "headers": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}}


@pytest.fixture(scope="module")
def supervisor_ctx():
    tok, user = _login(SUPERVISOR)
    return {"tok": tok, "id": user.get("id") or user.get("_id"),
            "name": user.get("name") or "Dr. Paresh Gandhi",
            "headers": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}}


# ---------------- Helpers ----------------

def _next_weekday(delta_days=3):
    d = datetime.now() + timedelta(days=delta_days)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def _cleanup_ids(ids):
    if not ids:
        return
    _db.procedures.delete_many({"_id": {"$in": [ObjectId(i) for i in ids if i]}})


@pytest.fixture
def created_ids():
    ids = []
    yield ids
    _cleanup_ids(ids)


_slot_counter = {"n": 0}
_TIME_SLOTS = ["09:00", "11:00", "13:00", "15:00", "16:00", "17:00"]


def _unique_slot():
    """Give each POST a unique date+time to avoid 409 duplicate slot."""
    idx = _slot_counter["n"]
    _slot_counter["n"] += 1
    # Rotate through 6 times per day and step days forward.
    day = _next_weekday(3 + (idx // len(_TIME_SLOTS)))
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day.strftime("%Y-%m-%d"), _TIME_SLOTS[idx % len(_TIME_SLOTS)]


def _base_payload(student_ctx, supervisor_ctx, admin_ctx, *, proc_type, patient, reg,
                  site="Upper Right 12", loading=None, **extras):
    date_str, time_str = _unique_slot()
    payload = {
        "student_name": student_ctx["name"],
        "patient_name": patient,
        "registration_number": reg,
        "supervisor_id": supervisor_ctx["id"],
        "supervisor_name": supervisor_ctx["name"],
        "implant_incharge_id": admin_ctx["id"],
        "implant_incharge_name": admin_ctx["name"],
        "implant_site": site,
        "receipt_number": f"TEST-RCP-{reg}",
        "amount_paid": 5000.0,
        "procedure_date": date_str,
        "procedure_time": time_str,
        "implant_procedure_type": proc_type,
        "loading_type": loading or ["Delayed Loading"],
    }
    payload.update(extras)
    return payload


def _post_create(student_ctx, payload):
    """Create, retrying with a fresh slot on 409 conflicts."""
    for _ in range(6):
        r = requests.post(f"{API}/procedures", json=payload, headers=student_ctx["headers"], timeout=25)
        if r.status_code != 409:
            return r
        d, t = _unique_slot()
        payload["procedure_date"] = d
        payload["procedure_time"] = t
    return r


def _advance_to_phase4(pid):
    _db.procedures.update_one(
        {"_id": ObjectId(pid)},
        {"$set": {"status": "stage2_surgical_approved", "current_phase": 3}},
    )


# =====================================================================
# ASK 1 — Group A create/GET persists 4 ma_* fields + type_of_provisional
# =====================================================================
class TestGroupACreate:
    def test_multi_conv_immediate_loading_persists_all_ma_fields(
        self, student_ctx, supervisor_ctx, admin_ctx, created_ids
    ):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="Multiple Conventional Implants",
            patient="TEST_GroupA_MC_IL", reg="TEST-A-MC-IL-001",
            site="Upper Right 15, 16",
            loading=["Immediate Loading"],
            missing_teeth=["15", "16"],
            type_of_provisional="Splinted screw-retained provisional FPD",
            ma_prosthesis_type="Individual non-splinted crowns",
            ma_abutment_type="CAD/CAM custom titanium abutment",
            ma_retention_type="Screw-retained crown",
            ma_crown_material="Monolithic zirconia",
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, f"create failed: {r.status_code} {r.text}"
        proc = r.json()
        pid = proc.get("id") or proc.get("_id")
        assert pid
        created_ids.append(pid)

        for k, v in [
            ("type_of_provisional", "Splinted screw-retained provisional FPD"),
            ("ma_prosthesis_type", "Individual non-splinted crowns"),
            ("ma_abutment_type", "CAD/CAM custom titanium abutment"),
            ("ma_retention_type", "Screw-retained crown"),
            ("ma_crown_material", "Monolithic zirconia"),
        ]:
            assert proc.get(k) == v, f"POST echo mismatch {k}: {proc.get(k)!r}"

        g = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15)
        assert g.status_code == 200, g.text
        gp = g.json()
        for k, v in [
            ("type_of_provisional", "Splinted screw-retained provisional FPD"),
            ("ma_prosthesis_type", "Individual non-splinted crowns"),
            ("ma_abutment_type", "CAD/CAM custom titanium abutment"),
            ("ma_retention_type", "Screw-retained crown"),
            ("ma_crown_material", "Monolithic zirconia"),
        ]:
            assert gp.get(k) == v, f"GET mismatch {k}: {gp.get(k)!r}"


# =====================================================================
# ASK 2 — Group B create/GET persists fa_prosthetic_plan + type_of_provisional
# =====================================================================
class TestGroupBCreate:
    @pytest.mark.parametrize("proc_type", ["All on 4", "All on 6", "All on X"])
    def test_all_on_x_persists_fa_plan(
        self, proc_type, student_ctx, supervisor_ctx, admin_ctx, created_ids
    ):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type=proc_type,
            patient=f"TEST_GroupB_{proc_type.replace(' ', '_')}",
            reg=f"TEST-B-{proc_type.replace(' ', '')}-001",
            site="Upper Arch",
            loading=["Immediate Loading"],
            type_of_provisional="Chairside denture conversion",
            fa_prosthetic_plan='Metal-acrylic hybrid ("Toronto" / fixed-detachable, FP-3)',
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, f"[{proc_type}] create: {r.status_code} {r.text}"
        pid = r.json().get("id") or r.json().get("_id")
        created_ids.append(pid)

        g = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15)
        assert g.status_code == 200, g.text
        gp = g.json()
        assert gp.get("implant_procedure_type") == proc_type
        assert gp.get("type_of_provisional") == "Chairside denture conversion"
        assert gp.get("fa_prosthetic_plan") == 'Metal-acrylic hybrid ("Toronto" / fixed-detachable, FP-3)'


# =====================================================================
# ASK 3 — Group C create/GET persists zp_prosthetic_plan (all 4 subtypes)
# =====================================================================
class TestGroupCCreate:
    @pytest.mark.parametrize("proc_type", [
        "Quad Zygoma Implants",
        "Zygoma and Pterygoid Implants",
        "Zygoma and Conventional Implants",
        "Zygoma, Pterygoid and Conventional Implants",
    ])
    def test_zygoma_variants_persist_zp_plan(
        self, proc_type, student_ctx, supervisor_ctx, admin_ctx, created_ids
    ):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type=proc_type,
            patient=f"TEST_GroupC_{abs(hash(proc_type)) % 100000}",
            reg=f"TEST-C-{abs(hash(proc_type)) % 100000}",
            site="Upper Arch",
            loading=["Immediate Loading"],
            type_of_provisional="Photogrammetry-captured, same-day milled PMMA provisional",
            zp_prosthetic_plan="Monolithic zirconia full-arch",
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, f"[{proc_type}] create failed: {r.status_code} {r.text}"
        pid = r.json().get("id") or r.json().get("_id")
        created_ids.append(pid)

        g = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15)
        gp = g.json()
        assert gp.get("implant_procedure_type") == proc_type
        assert gp.get("zp_prosthetic_plan") == "Monolithic zirconia full-arch"
        assert gp.get("type_of_provisional") == "Photogrammetry-captured, same-day milled PMMA provisional"
        # Group C should NOT accept ma_/fa_ (they can be sent but stored as null).
        # We don't send them here; just verify not leaked from other fields.


# =====================================================================
# ASK 4 — Pterygoid + Conventional Implants is Group A (accepts ma_*)
# =====================================================================
class TestPterygoidConvIsGroupA:
    def test_pterygoid_conv_accepts_ma_fields(
        self, student_ctx, supervisor_ctx, admin_ctx, created_ids
    ):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="Pterygoid and Conventional Implants",
            patient="TEST_PtConv_A", reg="TEST-PT-CONV-A-001",
            site="Upper Right 17, 15",
            loading=["Delayed Loading"],
            ma_prosthesis_type="Splinted FPD, screw-retained on multi-unit abutments",
            ma_abutment_type="Multi-unit abutment (multi-unit use)",
            ma_retention_type="Screw-retained crown",
            ma_crown_material="Metal-ceramic (PFM)",
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, f"create failed: {r.status_code} {r.text}"
        pid = r.json().get("id") or r.json().get("_id")
        created_ids.append(pid)
        g = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15)
        gp = g.json()
        assert gp.get("ma_prosthesis_type") == "Splinted FPD, screw-retained on multi-unit abutments"
        assert gp.get("ma_abutment_type") == "Multi-unit abutment (multi-unit use)"
        assert gp.get("ma_retention_type") == "Screw-retained crown"
        assert gp.get("ma_crown_material") == "Metal-ceramic (PFM)"


# =====================================================================
# ASK 5 — 'Other' handling: parent + _other free-text persist together
# =====================================================================
class TestOtherHandling:
    def test_ma_prosthesis_type_other(self, student_ctx, supervisor_ctx, admin_ctx, created_ids):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="Multiple Conventional Implants",
            patient="TEST_A_Other", reg="TEST-A-OTHER-001",
            site="Upper Left 12, 14",
            missing_teeth=["12", "14"],
            ma_prosthesis_type="Other",
            ma_prosthesis_type_other="My custom bridge design",
            ma_abutment_type="Other",
            ma_abutment_type_other="Custom sleeved zirconia abutment",
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, r.text
        pid = r.json().get("id") or r.json().get("_id")
        created_ids.append(pid)
        gp = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15).json()
        assert gp.get("ma_prosthesis_type") == "Other"
        assert gp.get("ma_prosthesis_type_other") == "My custom bridge design"
        assert gp.get("ma_abutment_type") == "Other"
        assert gp.get("ma_abutment_type_other") == "Custom sleeved zirconia abutment"

    def test_fa_prosthetic_plan_other(self, student_ctx, supervisor_ctx, admin_ctx, created_ids):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="All on 4",
            patient="TEST_B_Other", reg="TEST-B-OTHER-001",
            site="Upper Arch",
            fa_prosthetic_plan="Other",
            fa_prosthetic_plan_other="Bespoke hybrid I designed",
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, r.text
        pid = r.json().get("id") or r.json().get("_id")
        created_ids.append(pid)
        gp = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15).json()
        assert gp.get("fa_prosthetic_plan") == "Other"
        assert gp.get("fa_prosthetic_plan_other") == "Bespoke hybrid I designed"

    def test_zp_prosthetic_plan_other(self, student_ctx, supervisor_ctx, admin_ctx, created_ids):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="Quad Zygoma Implants",
            patient="TEST_C_Other", reg="TEST-C-OTHER-001",
            site="Upper Arch",
            zp_prosthetic_plan="Other",
            zp_prosthetic_plan_other="Custom zygoma hybrid",
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, r.text
        pid = r.json().get("id") or r.json().get("_id")
        created_ids.append(pid)
        gp = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15).json()
        assert gp.get("zp_prosthetic_plan") == "Other"
        assert gp.get("zp_prosthetic_plan_other") == "Custom zygoma hybrid"


# =====================================================================
# ASK 6 — PUT updates all group A/B/C fields (+ _other siblings)
# =====================================================================
class TestPutUpdates:
    def test_put_group_a_fields(self, student_ctx, supervisor_ctx, admin_ctx, created_ids):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="Multiple Conventional Implants",
            patient="TEST_A_PUT", reg="TEST-A-PUT-001",
            site="Upper Right 15, 16",
            missing_teeth=["15", "16"],
            ma_prosthesis_type="Individual non-splinted crowns",
            ma_abutment_type="Stock / prefabricated titanium abutment",
            ma_retention_type="Screw-retained crown",
            ma_crown_material="Metal-ceramic (PFM)",
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, r.text
        pid = r.json().get("id") or r.json().get("_id")
        created_ids.append(pid)

        upd = {
            "ma_prosthesis_type": "Other",
            "ma_prosthesis_type_other": "Segmented bespoke",
            "ma_abutment_type": "Hybrid abutment (Ti-base + CAD/CAM zirconia)",
            "ma_retention_type": "Cement-retained crown",
            "ma_crown_material": "Monolithic zirconia",
        }
        p = requests.put(f"{API}/procedures/{pid}", json=upd, headers=student_ctx["headers"], timeout=20)
        assert p.status_code == 200, f"PUT failed: {p.status_code} {p.text}"
        gp = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15).json()
        for k, v in upd.items():
            assert gp.get(k) == v, f"PUT persistence mismatch {k}: {gp.get(k)!r}"

    def test_put_group_b_and_c(self, student_ctx, supervisor_ctx, admin_ctx, created_ids):
        # Group B
        payload_b = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="All on 6",
            patient="TEST_B_PUT", reg="TEST-B-PUT-001",
            fa_prosthetic_plan="Monolithic zirconia full-arch (full-contour)",
        )
        rb = _post_create(student_ctx, payload_b)
        assert rb.status_code == 200, rb.text
        pid_b = rb.json().get("id") or rb.json().get("_id")
        created_ids.append(pid_b)
        upd_b = {
            "fa_prosthetic_plan": "Other",
            "fa_prosthetic_plan_other": "Custom-milled Ti + composite full arch",
        }
        assert requests.put(f"{API}/procedures/{pid_b}", json=upd_b,
                            headers=student_ctx["headers"], timeout=20).status_code == 200
        gp_b = requests.get(f"{API}/procedures/{pid_b}", headers=student_ctx["headers"], timeout=15).json()
        assert gp_b.get("fa_prosthetic_plan") == "Other"
        assert gp_b.get("fa_prosthetic_plan_other") == "Custom-milled Ti + composite full arch"

        # Group C
        payload_c = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="Zygoma and Conventional Implants",
            patient="TEST_C_PUT", reg="TEST-C-PUT-001",
            zp_prosthetic_plan="Milled titanium bar + acrylic or composite teeth (FP-3)",
        )
        rc = _post_create(student_ctx, payload_c)
        assert rc.status_code == 200, rc.text
        pid_c = rc.json().get("id") or rc.json().get("_id")
        created_ids.append(pid_c)
        upd_c = {"zp_prosthetic_plan": "Monolithic zirconia full-arch"}
        assert requests.put(f"{API}/procedures/{pid_c}", json=upd_c,
                            headers=student_ctx["headers"], timeout=20).status_code == 200
        gp_c = requests.get(f"{API}/procedures/{pid_c}", headers=student_ctx["headers"], timeout=15).json()
        assert gp_c.get("zp_prosthetic_plan") == "Monolithic zirconia full-arch"


# =====================================================================
# ASK 7 — Phase 4 Step 1 persists *_final_* + one audit entry;
#          idempotent re-submit adds no entry.
# =====================================================================
class TestPhase4AuditGroupA:
    def test_group_a_phase4_persist_and_audit(
        self, student_ctx, supervisor_ctx, admin_ctx, created_ids
    ):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="Multiple Conventional Implants",
            patient="TEST_A_P4", reg="TEST-A-P4-001",
            site="Upper Right 15, 16",
            missing_teeth=["15", "16"],
            ma_prosthesis_type="Individual non-splinted crowns",
            ma_abutment_type="Stock / prefabricated titanium abutment",
            ma_retention_type="Screw-retained crown",
            ma_crown_material="Monolithic zirconia",
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, r.text
        pid = r.json().get("id") or r.json().get("_id")
        created_ids.append(pid)
        _advance_to_phase4(pid)

        # First submit — 3 of 4 fields differ from Phase 1 baseline.
        p4_body = {
            "final_prosthetic_plan": "MA final plan v1",
            "ma_final_prosthesis_type": "Splinted FPD, screw-retained on multi-unit abutments",  # different
            "ma_final_abutment_type": "Stock / prefabricated titanium abutment",                  # SAME
            "ma_final_retention_type": "Cement-retained crown",                                   # different
            "ma_final_crown_material": "Metal-ceramic (PFM)",                                     # different
            "impression_type": "intraoral_scans",
            "shade_values": ["A2"],
            "shade_layout": "per_implant",
        }
        r1 = requests.post(f"{API}/procedures/{pid}/stage2/prosthetic",
                           json=p4_body, headers=student_ctx["headers"], timeout=30)
        assert r1.status_code == 200, f"phase4 submit failed: {r1.status_code} {r1.text}"

        gp = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15).json()
        p4 = gp.get("phase4_step1_data") or {}
        for k in ("ma_final_prosthesis_type", "ma_final_abutment_type",
                  "ma_final_retention_type", "ma_final_crown_material"):
            assert p4.get(k) == p4_body[k], f"phase4 mismatch {k}: {p4.get(k)!r}"

        log = gp.get("prosthetic_plan_change_log") or []
        assert len(log) >= 1, f"expected >=1 audit entry, got {len(log)}"
        latest = log[-1]
        assert latest.get("changed_in_phase") == 4
        assert latest.get("changed_step") == 1
        assert latest.get("changed_by_role") == "student"
        assert (latest.get("changed_by_name") or "").strip(), "changed_by_name missing"
        assert (latest.get("changed_at") or "").strip(), "changed_at missing"
        changes = latest.get("changes") or []
        field_names = {c["field"] for c in changes}
        assert "ma_final_prosthesis_type" in field_names
        assert "ma_final_retention_type" in field_names
        assert "ma_final_crown_material" in field_names
        assert "ma_final_abutment_type" not in field_names, "unchanged field must not be audited"

        # Idempotent re-submit
        prev_len = len(log)
        r2 = requests.post(f"{API}/procedures/{pid}/stage2/prosthetic",
                           json=p4_body, headers=student_ctx["headers"], timeout=30)
        assert r2.status_code == 200, r2.text
        g2 = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15).json()
        assert len(g2.get("prosthetic_plan_change_log") or []) == prev_len, \
            "re-submitting identical values must NOT append audit entry"


class TestPhase4AuditGroupB:
    def test_group_b_phase4_persist_and_audit(
        self, student_ctx, supervisor_ctx, admin_ctx, created_ids
    ):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="All on 4",
            patient="TEST_B_P4", reg="TEST-B-P4-001",
            site="Upper Arch",
            fa_prosthetic_plan='Metal-acrylic hybrid ("Toronto" / fixed-detachable, FP-3)',
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, r.text
        pid = r.json().get("id") or r.json().get("_id")
        created_ids.append(pid)
        _advance_to_phase4(pid)

        p4_body = {
            "final_prosthetic_plan": "FA final v1",
            "fa_final_prosthetic_plan": "Monolithic zirconia full-arch (full-contour)",  # different
            "impression_type": "intraoral_scans",
            "shade_values": ["A2"],
            "shade_layout": "per_implant",
        }
        r1 = requests.post(f"{API}/procedures/{pid}/stage2/prosthetic",
                           json=p4_body, headers=student_ctx["headers"], timeout=30)
        assert r1.status_code == 200, r1.text
        gp = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15).json()
        assert (gp.get("phase4_step1_data") or {}).get("fa_final_prosthetic_plan") == \
            "Monolithic zirconia full-arch (full-contour)"
        log = gp.get("prosthetic_plan_change_log") or []
        assert len(log) >= 1
        latest = log[-1]
        field_names = {c["field"] for c in latest.get("changes") or []}
        assert "fa_final_prosthetic_plan" in field_names
        assert latest.get("changed_in_phase") == 4 and latest.get("changed_step") == 1

        # Idempotent
        prev = len(log)
        assert requests.post(f"{API}/procedures/{pid}/stage2/prosthetic",
                             json=p4_body, headers=student_ctx["headers"], timeout=30).status_code == 200
        g2 = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15).json()
        assert len(g2.get("prosthetic_plan_change_log") or []) == prev


class TestPhase4AuditGroupC:
    def test_group_c_phase4_persist_and_audit(
        self, student_ctx, supervisor_ctx, admin_ctx, created_ids
    ):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="Quad Zygoma Implants",
            patient="TEST_C_P4", reg="TEST-C-P4-001",
            site="Upper Arch",
            zp_prosthetic_plan="Milled titanium bar + acrylic or composite teeth (FP-3)",
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, r.text
        pid = r.json().get("id") or r.json().get("_id")
        created_ids.append(pid)
        _advance_to_phase4(pid)

        p4_body = {
            "final_prosthetic_plan": "ZP final v1",
            "zp_final_prosthetic_plan": "Monolithic zirconia full-arch",  # different
            "impression_type": "intraoral_scans",
            "shade_values": ["A2"],
            "shade_layout": "per_implant",
        }
        r1 = requests.post(f"{API}/procedures/{pid}/stage2/prosthetic",
                           json=p4_body, headers=student_ctx["headers"], timeout=30)
        assert r1.status_code == 200, r1.text
        gp = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15).json()
        assert (gp.get("phase4_step1_data") or {}).get("zp_final_prosthetic_plan") == \
            "Monolithic zirconia full-arch"
        log = gp.get("prosthetic_plan_change_log") or []
        assert len(log) >= 1
        latest = log[-1]
        field_names = {c["field"] for c in latest.get("changes") or []}
        assert "zp_final_prosthetic_plan" in field_names

        # Idempotent
        prev = len(log)
        assert requests.post(f"{API}/procedures/{pid}/stage2/prosthetic",
                             json=p4_body, headers=student_ctx["headers"], timeout=30).status_code == 200
        g2 = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15).json()
        assert len(g2.get("prosthetic_plan_change_log") or []) == prev


# =====================================================================
# ASK 8 — PDF exports contain group-specific labels
# =====================================================================
def _fetch_pdf_text(pid, headers):
    pdf = requests.post(f"{API}/procedures/{pid}/case-report", headers=headers, timeout=90)
    assert pdf.status_code == 200, f"PDF failed {pdf.status_code}: {pdf.text[:400]}"
    content = pdf.content
    assert content[:4] == b"%PDF", f"not a pdf: {content[:20]!r}"
    text = ""
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(content))
        text = "\n".join([(p.extract_text() or "") for p in reader.pages])
    except Exception:
        pass
    if not text.strip():
        try:
            from PyPDF2 import PdfReader as PdfReader2  # type: ignore
            reader = PdfReader2(io.BytesIO(content))
            text = "\n".join([(p.extract_text() or "") for p in reader.pages])
        except Exception:
            text = ""
    haystack = text if text.strip() else content.decode("latin-1", "ignore")
    return haystack


class TestPdfLabels:
    def test_group_a_pdf_labels(self, student_ctx, supervisor_ctx, admin_ctx, created_ids):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="Multiple Conventional Implants",
            patient="TEST_A_PDF", reg="TEST-A-PDF-001",
            site="Upper Right 15, 16",
            loading=["Immediate Loading"],
            missing_teeth=["15", "16"],
            type_of_provisional="Splinted screw-retained provisional FPD",
            ma_prosthesis_type="Individual non-splinted crowns",
            ma_abutment_type="CAD/CAM custom titanium abutment",
            ma_retention_type="Screw-retained crown",
            ma_crown_material="Monolithic zirconia",
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, r.text
        pid = r.json().get("id") or r.json().get("_id")
        created_ids.append(pid)

        _advance_to_phase4(pid)
        p4 = {
            "final_prosthetic_plan": "MA final v",
            "ma_final_prosthesis_type": "Splinted FPD, screw-retained on multi-unit abutments",
            "ma_final_abutment_type": "Multi-unit abutment (multi-unit use)",
            "ma_final_retention_type": "Cement-retained crown",
            "ma_final_crown_material": "Metal-ceramic (PFM)",
            "impression_type": "intraoral_scans",
            "shade_values": ["A2"],
            "shade_layout": "per_implant",
        }
        assert requests.post(f"{API}/procedures/{pid}/stage2/prosthetic",
                             json=p4, headers=student_ctx["headers"], timeout=30).status_code == 200

        text = _fetch_pdf_text(pid, student_ctx["headers"])
        expected = [
            "Prosthesis Type", "Abutment Type", "Type of Retention",
            "Crown/Bridge Material", "Type of Provisional",
            "Final Prosthesis Type", "Final Abutment Type",
            "Final Type of Retention", "Final Crown/Bridge Material",
        ]
        missing = [lbl for lbl in expected if lbl not in text]
        assert not missing, f"Group A PDF missing labels: {missing}"

    def test_group_b_pdf_labels(self, student_ctx, supervisor_ctx, admin_ctx, created_ids):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="All on 4",
            patient="TEST_B_PDF", reg="TEST-B-PDF-001",
            site="Upper Arch",
            loading=["Immediate Loading"],
            type_of_provisional="Chairside denture conversion",
            fa_prosthetic_plan='Metal-acrylic hybrid ("Toronto" / fixed-detachable, FP-3)',
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, r.text
        pid = r.json().get("id") or r.json().get("_id")
        created_ids.append(pid)
        _advance_to_phase4(pid)
        p4 = {
            "final_prosthetic_plan": "FA final",
            "fa_final_prosthetic_plan": "Monolithic zirconia full-arch (full-contour)",
            "impression_type": "intraoral_scans",
            "shade_values": ["A2"],
            "shade_layout": "per_implant",
        }
        assert requests.post(f"{API}/procedures/{pid}/stage2/prosthetic",
                             json=p4, headers=student_ctx["headers"], timeout=30).status_code == 200

        text = _fetch_pdf_text(pid, student_ctx["headers"])
        expected = ["Prosthetic Plan", "Type of Provisional", "Final Prosthetic Plan"]
        missing = [lbl for lbl in expected if lbl not in text]
        assert not missing, f"Group B PDF missing labels: {missing}"

    def test_group_c_pdf_labels(self, student_ctx, supervisor_ctx, admin_ctx, created_ids):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="Zygoma and Conventional Implants",
            patient="TEST_C_PDF", reg="TEST-C-PDF-001",
            site="Upper Arch",
            loading=["Immediate Loading"],
            type_of_provisional="Reinforced denture conversion",
            zp_prosthetic_plan="Milled titanium bar + acrylic or composite teeth (FP-3)",
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, r.text
        pid = r.json().get("id") or r.json().get("_id")
        created_ids.append(pid)
        _advance_to_phase4(pid)
        p4 = {
            "final_prosthetic_plan": "ZP final",
            "zp_final_prosthetic_plan": "Monolithic zirconia full-arch",
            "impression_type": "intraoral_scans",
            "shade_values": ["A2"],
            "shade_layout": "per_implant",
        }
        assert requests.post(f"{API}/procedures/{pid}/stage2/prosthetic",
                             json=p4, headers=student_ctx["headers"], timeout=30).status_code == 200

        text = _fetch_pdf_text(pid, student_ctx["headers"])
        expected = ["Prosthetic Plan", "Type of Provisional", "Final Prosthetic Plan"]
        missing = [lbl for lbl in expected if lbl not in text]
        assert not missing, f"Group C PDF missing labels: {missing}"


# =====================================================================
# ASK 9 — Regression: non-group cases (Existing Implant / Single Implant)
# don't require and don't leak group fields.
# =====================================================================
class TestNonGroupRegression:
    @pytest.mark.parametrize("proc_type", ["Immediate Implant", "Guided Surgery"])
    def test_non_group_create_and_update_no_group_fields_leaked(
        self, proc_type, student_ctx, supervisor_ctx, admin_ctx, created_ids
    ):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type=proc_type,
            patient=f"TEST_NG_{proc_type.replace(' ', '_')}",
            reg=f"TEST-NG-{proc_type.replace(' ', '')}-001",
            site="Upper Right 12",
            loading=["Delayed Loading"],
            missing_teeth=["12"],
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, f"[{proc_type}] create failed: {r.status_code} {r.text}"
        pid = r.json().get("id") or r.json().get("_id")
        created_ids.append(pid)
        gp = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15).json()
        for f in ("ma_prosthesis_type", "ma_abutment_type", "ma_retention_type", "ma_crown_material",
                  "fa_prosthetic_plan", "zp_prosthetic_plan"):
            assert not gp.get(f), f"[{proc_type}] must not have {f}: {gp.get(f)!r}"

        # PUT ordinary update
        upd = {"patient_name": f"{gp['patient_name']}_v2"}
        p = requests.put(f"{API}/procedures/{pid}", json=upd, headers=student_ctx["headers"], timeout=15)
        assert p.status_code == 200, p.text


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v", "--tb=short"]))
