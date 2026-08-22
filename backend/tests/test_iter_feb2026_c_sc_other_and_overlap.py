"""iter-Feb-2026-C — Backend tests for:

(1) SC `_other` sibling fields:
      Phase 1 : sc_abutment_type_other, sc_retention_type_other,
                sc_crown_material_other (+ existing type_of_provisional_other)
      Phase 4 : sc_final_abutment_type_other, sc_final_retention_type_other,
                sc_final_crown_material_other
      * Persist via POST/GET/PUT
      * Phase 4 diff audit includes the `_other` suffixed field names
      * PDF still contains SC labels

(2) 5 overlap procedure types routing by `num_implants`:
      OVERLAP_TYPES = [
        'Immediate Implant',
        'Partial Extraction Therapy',
        'Implant Placement with Guided Bone Regeneration',
        'Guided Surgery',
        'Sinus Lift',
      ]
      * num_implants == 'Single Implant'   → SC workflow (sc_*, sc_final_*)
      * num_implants == 'Multiple Implants' → Group A (ma_*, ma_final_*)
      * Audit fires for the routed effective workflow
      * PDF shows SC labels for Single Implant; Group A labels for Multiple.

Existing precedence for pure procedure types is unchanged; regression
suites `test_iter_feb2026_single_conventional.py` and
`test_iter_feb2026_b_multi_fullarch_zygoma.py` still pass (28/28) so
we don't repeat those here.

Cases are seeded via POST /api/procedures and advanced through Phase 4
by direct Mongo mutation, mirroring the existing suites.
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

OVERLAP_TYPES = [
    "Immediate Implant",
    "Partial Extraction Therapy",
    "Implant Placement with Guided Bone Regeneration",
    "Guided Surgery",
    "Sinus Lift",
]


# ---------------- Auth ----------------

def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed for {creds['identifier']}: {r.status_code} {r.text}"
    j = r.json()
    return j["access_token"], j.get("user") or {}


@pytest.fixture(scope="module")
def student_ctx():
    tok, user = _login(STUDENT)
    return {
        "tok": tok,
        "id": user.get("id") or user.get("_id"),
        "name": user.get("name") or "Dr. Gaurav Pandey",
        "headers": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
    }


@pytest.fixture(scope="module")
def admin_ctx():
    tok, user = _login(ADMIN)
    return {
        "tok": tok,
        "id": user.get("id") or user.get("_id"),
        "name": user.get("name") or "Dr. Abhijit Patil",
        "headers": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
    }


@pytest.fixture(scope="module")
def supervisor_ctx():
    tok, user = _login(SUPERVISOR)
    return {
        "tok": tok,
        "id": user.get("id") or user.get("_id"),
        "name": user.get("name") or "Dr. Paresh Gandhi",
        "headers": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
    }


# ---------------- Scheduling / cleanup ----------------

_slot_counter = {"n": 0}
_TIME_SLOTS = ["09:00", "10:30", "11:30", "13:30", "14:30", "15:30", "16:30", "17:30"]


def _next_weekday(delta_days=3):
    d = datetime.now() + timedelta(days=delta_days)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def _unique_slot():
    idx = _slot_counter["n"]
    _slot_counter["n"] += 1
    day = _next_weekday(3 + (idx // len(_TIME_SLOTS)))
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day.strftime("%Y-%m-%d"), _TIME_SLOTS[idx % len(_TIME_SLOTS)]


def _cleanup_ids(ids):
    if not ids:
        return
    _db.procedures.delete_many({"_id": {"$in": [ObjectId(i) for i in ids if i]}})


@pytest.fixture
def created_ids():
    ids = []
    yield ids
    _cleanup_ids(ids)


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
    for _ in range(8):
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
    return text if text.strip() else content.decode("latin-1", "ignore")


# =====================================================================
# 1. Pure SC — new Phase 1 `_other` sibling fields persist via POST / GET / PUT
# =====================================================================
class TestSCPhase1OtherFields:
    def test_sc_all_other_fields_post_and_put(
        self, student_ctx, supervisor_ctx, admin_ctx, created_ids
    ):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="Single Conventional Implant",
            patient="TEST_SC_OTHER_C", reg="TEST-C-SC-OTHER-001",
            loading=["Immediate Loading"],
            type_of_provisional="Other",
            type_of_provisional_other="My custom PMMA shell",
            sc_abutment_type="Other",
            sc_abutment_type_other="My custom titanium abutment",
            sc_retention_type="Other",
            sc_retention_type_other="My hybrid screw+cement retention",
            sc_crown_material="Other",
            sc_crown_material_other="My CAD-milled composite",
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, f"create failed: {r.status_code} {r.text}"
        proc = r.json()
        pid = proc.get("id") or proc.get("_id")
        assert pid
        created_ids.append(pid)

        # Response echo
        for k, v in [
            ("type_of_provisional", "Other"),
            ("type_of_provisional_other", "My custom PMMA shell"),
            ("sc_abutment_type", "Other"),
            ("sc_abutment_type_other", "My custom titanium abutment"),
            ("sc_retention_type", "Other"),
            ("sc_retention_type_other", "My hybrid screw+cement retention"),
            ("sc_crown_material", "Other"),
            ("sc_crown_material_other", "My CAD-milled composite"),
        ]:
            assert proc.get(k) == v, f"POST echo mismatch {k}: {proc.get(k)!r}"

        # GET persistence
        gp = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15).json()
        for k, v in [
            ("sc_abutment_type_other", "My custom titanium abutment"),
            ("sc_retention_type_other", "My hybrid screw+cement retention"),
            ("sc_crown_material_other", "My CAD-milled composite"),
            ("type_of_provisional_other", "My custom PMMA shell"),
        ]:
            assert gp.get(k) == v, f"GET persistence mismatch {k}: {gp.get(k)!r}"

        # PUT updates all three new SC `_other` fields
        upd = {
            "sc_abutment_type_other": "Updated Ti abutment name",
            "sc_retention_type_other": "Updated retention",
            "sc_crown_material_other": "Updated crown mat",
        }
        p = requests.put(f"{API}/procedures/{pid}", json=upd, headers=student_ctx["headers"], timeout=20)
        assert p.status_code == 200, f"PUT failed: {p.status_code} {p.text}"
        gp2 = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15).json()
        for k, v in upd.items():
            assert gp2.get(k) == v, f"PUT mismatch {k}: {gp2.get(k)!r}"


# =====================================================================
# 2. Pure SC — Phase 4 Step 1 `_other` finals persist and audit records them
# =====================================================================
class TestSCPhase4OtherAudit:
    def test_sc_final_abutment_other_persist_and_audit(
        self, student_ctx, supervisor_ctx, admin_ctx, created_ids
    ):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="Single Conventional Implant",
            patient="TEST_SC_P4_OTHER_C", reg="TEST-C-SC-P4-OTH-001",
            loading=["Immediate Loading"],
            type_of_provisional="Screw-retained provisional",
            sc_abutment_type="Titanium stock abutment",
            sc_retention_type="Screw-retained",
            sc_crown_material="Monolithic zirconia",
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, r.text
        pid = r.json().get("id") or r.json().get("_id")
        created_ids.append(pid)
        _advance_to_phase4(pid)

        p4_body = {
            "final_prosthetic_plan": "SC final v1",
            "sc_final_abutment_type": "Other",
            "sc_final_abutment_type_other": "Bespoke abutment",
            "sc_final_retention_type": "Screw-retained",         # SAME
            "sc_final_crown_material": "Other",
            "sc_final_crown_material_other": "Bespoke crown mat",
            "impression_type": "intraoral_scans",
            "shade_values": ["A2"],
            "shade_layout": "per_implant",
        }
        r1 = requests.post(f"{API}/procedures/{pid}/stage2/prosthetic",
                           json=p4_body, headers=student_ctx["headers"], timeout=30)
        assert r1.status_code == 200, f"phase4 submit failed: {r1.status_code} {r1.text}"

        gp = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15).json()
        p4 = gp.get("phase4_step1_data") or {}
        assert p4.get("sc_final_abutment_type") == "Other"
        assert p4.get("sc_final_abutment_type_other") == "Bespoke abutment"
        assert p4.get("sc_final_crown_material") == "Other"
        assert p4.get("sc_final_crown_material_other") == "Bespoke crown mat"

        # Audit: at least one entry, includes new `_other` fields as changed
        log = gp.get("prosthetic_plan_change_log") or []
        assert len(log) >= 1, f"expected >=1 audit entry, got {len(log)}"
        latest = log[-1]
        assert latest.get("changed_in_phase") == 4
        assert latest.get("changed_step") == 1
        changed_fields = {c.get("field") for c in (latest.get("changes") or [])}
        assert "sc_final_abutment_type" in changed_fields
        assert "sc_final_abutment_type_other" in changed_fields, \
            f"sc_final_abutment_type_other missing from audit: {changed_fields}"
        assert "sc_final_crown_material_other" in changed_fields
        assert "sc_final_retention_type" not in changed_fields, \
            "unchanged sc_final_retention_type must not be in audit"

        # Idempotent re-submit
        prev = len(log)
        assert requests.post(f"{API}/procedures/{pid}/stage2/prosthetic",
                             json=p4_body, headers=student_ctx["headers"], timeout=30).status_code == 200
        g2 = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15).json()
        assert len(g2.get("prosthetic_plan_change_log") or []) == prev, \
            "identical re-submit should not append audit"


# =====================================================================
# 3. Overlap procedure types: num_implants='Single Implant' → SC workflow
#    (persists sc_*, phase 4 sc_final_* audited, PDF has SC labels)
# =====================================================================
def _overlap_extras(proc_type):
    """Extras required by backend gates for each overlap procedure_type."""
    extras = {"missing_teeth": ["16"], "implant_site": "Upper Right 16"}
    if proc_type == "Sinus Lift":
        extras.update({
            "sinus_lift_type": "Direct Sinus Lift",
            "bone_graft_material_details": "Autogenous + xenograft mix, ~1.5g",
        })
    return extras


@pytest.mark.parametrize("proc_type", OVERLAP_TYPES)
class TestOverlapSingleImplantSC:
    def test_overlap_single_implant_sc_flow(
        self, proc_type, student_ctx, supervisor_ctx, admin_ctx, created_ids
    ):
        extras = _overlap_extras(proc_type)
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type=proc_type,
            patient=f"TEST_C_OV_SC_{proc_type[:10].replace(' ', '_')}",
            reg=f"TEST-C-OV-SC-{abs(hash(proc_type)) % 100000}",
            loading=["Immediate Loading"],
            num_implants="Single Implant",
            type_of_provisional="Screw-retained provisional",
            sc_abutment_type="Titanium stock abutment",
            sc_retention_type="Screw-retained",
            sc_crown_material="Monolithic zirconia",
            **extras,
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, f"[{proc_type}] create: {r.status_code} {r.text}"
        pid = r.json().get("id") or r.json().get("_id")
        created_ids.append(pid)

        gp = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15).json()
        assert gp.get("num_implants") == "Single Implant"
        assert gp.get("sc_abutment_type") == "Titanium stock abutment"
        assert gp.get("sc_retention_type") == "Screw-retained"
        assert gp.get("sc_crown_material") == "Monolithic zirconia"

        # Phase 4 Step 1 — SC finals with differing values → audit fires
        _advance_to_phase4(pid)
        p4_body = {
            "final_prosthetic_plan": f"{proc_type} SC final",
            "sc_final_abutment_type": "Custom milled titanium abutment",  # DIFF
            "sc_final_retention_type": "Screw-retained",                  # SAME
            "sc_final_crown_material": "Lithium disilicate (e.max)",      # DIFF
            "impression_type": "intraoral_scans",
            "shade_values": ["A2"],
            "shade_layout": "per_implant",
        }
        rp = requests.post(f"{API}/procedures/{pid}/stage2/prosthetic",
                           json=p4_body, headers=student_ctx["headers"], timeout=30)
        assert rp.status_code == 200, f"[{proc_type}] phase4 submit: {rp.status_code} {rp.text}"
        gp2 = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15).json()
        p4d = gp2.get("phase4_step1_data") or {}
        assert p4d.get("sc_final_abutment_type") == "Custom milled titanium abutment"
        assert p4d.get("sc_final_crown_material") == "Lithium disilicate (e.max)"

        log = gp2.get("prosthetic_plan_change_log") or []
        assert len(log) >= 1, f"[{proc_type}] expected audit entry"
        latest = log[-1]
        fields = {c["field"] for c in (latest.get("changes") or [])}
        assert "sc_final_abutment_type" in fields, \
            f"[{proc_type}] sc_final_abutment_type missing from audit: {fields}"
        assert "sc_final_crown_material" in fields
        # Group A fields should NOT appear
        assert not any(f.startswith("ma_final_") for f in fields), \
            f"[{proc_type}] Group A field leaked into SC audit: {fields}"


# =====================================================================
# 4. Overlap procedure types: num_implants='Multiple Implants' → Group A
# =====================================================================
@pytest.mark.parametrize("proc_type", OVERLAP_TYPES)
class TestOverlapMultipleImplantsGroupA:
    def test_overlap_multiple_implants_group_a_flow(
        self, proc_type, student_ctx, supervisor_ctx, admin_ctx, created_ids
    ):
        extras = _overlap_extras(proc_type)
        # For Multiple Implants MA path use two-tooth site (except Sinus Lift
        # which is single-tooth maxillary posterior enforced by backend).
        if proc_type != "Sinus Lift":
            extras = {
                "implant_site": "Upper Right 15, 16",
                "missing_teeth": ["15", "16"],
            }
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type=proc_type,
            patient=f"TEST_C_OV_MA_{proc_type[:10].replace(' ', '_')}",
            reg=f"TEST-C-OV-MA-{abs(hash(proc_type)) % 100000}",
            loading=["Immediate Loading"],
            num_implants="Multiple Implants",
            type_of_provisional="Splinted screw-retained provisional FPD",
            ma_prosthesis_type="Individual non-splinted crowns",
            ma_abutment_type="Stock / prefabricated titanium abutment",
            ma_retention_type="Screw-retained crown",
            ma_crown_material="Monolithic zirconia",
            **extras,
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, f"[{proc_type}] MA create: {r.status_code} {r.text}"
        pid = r.json().get("id") or r.json().get("_id")
        created_ids.append(pid)

        gp = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15).json()
        assert gp.get("num_implants") == "Multiple Implants"
        assert gp.get("ma_prosthesis_type") == "Individual non-splinted crowns"
        assert gp.get("ma_abutment_type") == "Stock / prefabricated titanium abutment"
        assert gp.get("ma_retention_type") == "Screw-retained crown"
        assert gp.get("ma_crown_material") == "Monolithic zirconia"

        # Phase 4 Step 1 — MA finals, 3 diffs → audit fires with ma_final_* names
        _advance_to_phase4(pid)
        p4_body = {
            "final_prosthetic_plan": f"{proc_type} MA final",
            "ma_final_prosthesis_type": "Splinted FPD, screw-retained on multi-unit abutments",  # DIFF
            "ma_final_abutment_type": "Stock / prefabricated titanium abutment",                 # SAME
            "ma_final_retention_type": "Cement-retained crown",                                  # DIFF
            "ma_final_crown_material": "Metal-ceramic (PFM)",                                    # DIFF
            "impression_type": "intraoral_scans",
            "shade_values": ["A2"],
            "shade_layout": "per_implant",
        }
        rp = requests.post(f"{API}/procedures/{pid}/stage2/prosthetic",
                           json=p4_body, headers=student_ctx["headers"], timeout=30)
        assert rp.status_code == 200, f"[{proc_type}] MA phase4: {rp.status_code} {rp.text}"
        gp2 = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15).json()
        p4d = gp2.get("phase4_step1_data") or {}
        for k in ("ma_final_prosthesis_type", "ma_final_abutment_type",
                  "ma_final_retention_type", "ma_final_crown_material"):
            assert p4d.get(k) == p4_body[k], f"[{proc_type}] phase4 mismatch {k}: {p4d.get(k)!r}"

        log = gp2.get("prosthetic_plan_change_log") or []
        assert len(log) >= 1, f"[{proc_type}] expected audit entry"
        latest = log[-1]
        fields = {c["field"] for c in (latest.get("changes") or [])}
        assert "ma_final_prosthesis_type" in fields
        assert "ma_final_retention_type" in fields
        assert "ma_final_crown_material" in fields
        assert "ma_final_abutment_type" not in fields, "unchanged must not be audited"
        # SC final fields must not leak into MA audit
        assert not any(f.startswith("sc_final_") for f in fields), \
            f"[{proc_type}] SC field leaked into Group A audit: {fields}"


# =====================================================================
# 5. PDF export for overlap type — labels reflect the *effective* workflow
# =====================================================================
class TestOverlapPdfLabels:
    def test_overlap_single_implant_pdf_has_sc_labels(
        self, student_ctx, supervisor_ctx, admin_ctx, created_ids
    ):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="Immediate Implant",
            patient="TEST_C_OV_SC_PDF", reg="TEST-C-OV-SC-PDF-001",
            site="Upper Right 12",
            loading=["Immediate Loading"],
            num_implants="Single Implant",
            missing_teeth=["12"],
            type_of_provisional="Screw-retained provisional",
            sc_abutment_type="Titanium stock abutment",
            sc_retention_type="Screw-retained",
            sc_crown_material="Monolithic zirconia",
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, r.text
        pid = r.json().get("id") or r.json().get("_id")
        created_ids.append(pid)
        _advance_to_phase4(pid)
        p4 = {
            "final_prosthetic_plan": "SC PDF final",
            "sc_final_abutment_type": "Custom milled titanium abutment",
            "sc_final_retention_type": "Screw-retained",
            "sc_final_crown_material": "Lithium disilicate (e.max)",
            "impression_type": "intraoral_scans",
            "shade_values": ["A2"],
            "shade_layout": "per_implant",
        }
        assert requests.post(f"{API}/procedures/{pid}/stage2/prosthetic",
                             json=p4, headers=student_ctx["headers"], timeout=30).status_code == 200

        text = _fetch_pdf_text(pid, student_ctx["headers"])
        expected = [
            "Type of Provisional",
            "Abutment Type",
            "Type of Retention",
            "Crown Material",
            "Final Abutment Type",
            "Final Type of Retention",
            "Final Crown Material",
        ]
        missing = [lbl for lbl in expected if lbl not in text]
        assert not missing, f"Overlap SC PDF missing labels: {missing}"

    def test_overlap_multiple_implants_pdf_has_group_a_labels(
        self, student_ctx, supervisor_ctx, admin_ctx, created_ids
    ):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type="Immediate Implant",
            patient="TEST_C_OV_MA_PDF", reg="TEST-C-OV-MA-PDF-001",
            site="Upper Right 15, 16",
            loading=["Immediate Loading"],
            num_implants="Multiple Implants",
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
            "final_prosthetic_plan": "MA PDF final",
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
        assert not missing, f"Overlap Group A PDF missing labels: {missing}"


# =====================================================================
# 6. Regression: overlap procedure_type WITHOUT num_implants — must still
#    create (no SC/MA fields required) and no workflow fields leaked.
# =====================================================================
class TestNonOverlapRegression:
    @pytest.mark.parametrize("proc_type", [
        "Immediate Implant",
        "Partial Extraction Therapy",
        "Guided Surgery",
    ])
    def test_overlap_without_num_implants_no_workflow_fields_required(
        self, proc_type, student_ctx, supervisor_ctx, admin_ctx, created_ids
    ):
        payload = _base_payload(
            student_ctx, supervisor_ctx, admin_ctx,
            proc_type=proc_type,
            patient=f"TEST_C_NO_{proc_type.replace(' ', '_')}",
            reg=f"TEST-C-NO-{proc_type.replace(' ', '')}-001",
            site="Upper Right 12",
            loading=["Delayed Loading"],
            missing_teeth=["12"],
            # ← deliberately no num_implants, no sc_*, no ma_*
        )
        r = _post_create(student_ctx, payload)
        assert r.status_code == 200, f"[{proc_type}] create failed: {r.status_code} {r.text}"
        pid = r.json().get("id") or r.json().get("_id")
        created_ids.append(pid)
        gp = requests.get(f"{API}/procedures/{pid}", headers=student_ctx["headers"], timeout=15).json()
        assert gp.get("implant_procedure_type") == proc_type
        for f in ("sc_abutment_type", "sc_retention_type", "sc_crown_material",
                  "sc_abutment_type_other", "sc_retention_type_other", "sc_crown_material_other",
                  "ma_prosthesis_type", "ma_abutment_type",
                  "ma_retention_type", "ma_crown_material",
                  "fa_prosthetic_plan", "zp_prosthetic_plan"):
            assert not gp.get(f), f"[{proc_type}] must not have {f}: {gp.get(f)!r}"

        # PUT ordinary update works
        upd = {"patient_name": f"{gp['patient_name']}_v2"}
        p = requests.put(f"{API}/procedures/{pid}", json=upd, headers=student_ctx["headers"], timeout=15)
        assert p.status_code == 200, p.text


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v", "--tb=short"]))
