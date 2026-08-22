"""
iter-424 Chunk G — Backend tests for Phase 4 Step 1 (Generate Lab Slip).

Ask 2: Relax the "Phase 3 must be approved" gate on
POST /api/procedures/{id}/stage2/prosthetic.

Both save_only=True and full submit accept:
  {stage2_surgical_approved, pending_stage2_prosthetic,
   stage2_prosthetic_step1_approved, pending_final_delivery}
Fallback: current_phase >= 4 also accepted.
Rejected: phase2_approved AND current_phase < 4 → 400.

Ask 3: Stage2ProstheticSubmit accepts scan_body_types /
scan_types / scan_levels lists; persisted only when
impression_type == 'intraoral_scans'; nulled out when
switched back to conventional. Lab Slip PDF renders
bulleted lines for each.
"""
import io
import os
import copy
import pytest
import requests
import pypdf
from dotenv import load_dotenv
from pymongo import MongoClient
from bson import ObjectId


def _pdf_text(pdf_bytes: bytes) -> str:
    """Extract concatenated text from a PDF byte blob (handles FlateDecode)."""
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join((page.extract_text() or "") for page in reader.pages)

load_dotenv("/app/backend/.env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL"
) else "https://prosthetic-preview.preview.emergentagent.com"

# Direct mongo access (test-side only) for status mutation.
_mongo = MongoClient(os.environ["MONGO_URL"])
_db = _mongo[os.environ["DB_NAME"]]

CASE_ID = "69cf9bdfdafb502718057bcd"  # Approval UI Test — student=Gaurav.pandey


# ---------------- Fixtures ----------------

@pytest.fixture(scope="session")
def student_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"identifier": "Gaurav.pandey", "password": "Student@123"},
    )
    r.raise_for_status()
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def student_headers(student_token):
    return {"Authorization": f"Bearer {student_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session", autouse=True)
def case_backup():
    """Snapshot the target case and restore it at session end."""
    original = _db.procedures.find_one({"_id": ObjectId(CASE_ID)})
    assert original, f"Seed case {CASE_ID} missing"
    snapshot = copy.deepcopy(original)
    yield
    # Restore snapshot — remove _id first so replace_one keeps original
    snapshot.pop("_id", None)
    _db.procedures.replace_one({"_id": ObjectId(CASE_ID)}, snapshot)


def _set_case(status, current_phase=None):
    upd = {"status": status}
    if current_phase is not None:
        upd["current_phase"] = current_phase
    _db.procedures.update_one({"_id": ObjectId(CASE_ID)}, {"$set": upd})


def _base_payload():
    """Valid minimum payload for full submit (must pass shade + non-conventional impression)."""
    return {
        "final_prosthetic_plan": "Fixed hybrid",
        "impression_type": "intraoral_scans",
        "shade_values": ["A2"],
        "shade_layout": "per_implant",
    }


# ---------------- Ask 2: status gate tests ----------------

class TestAsk2StatusGate:
    """Phase 4 Step 1 submit — status gate."""

    def test_1_stage2_surgical_approved_accepts(self, student_headers):
        _set_case("stage2_surgical_approved", current_phase=2)
        r = requests.post(
            f"{BASE_URL}/api/procedures/{CASE_ID}/stage2/prosthetic",
            json=_base_payload(),
            headers=student_headers,
        )
        assert r.status_code == 200, r.text

    def test_2_pending_stage2_prosthetic_accepts_full_submit(self, student_headers):
        # Historically rejected because save_only was not set; now must succeed.
        _set_case("pending_stage2_prosthetic", current_phase=3)
        r = requests.post(
            f"{BASE_URL}/api/procedures/{CASE_ID}/stage2/prosthetic",
            json=_base_payload(),
            headers=student_headers,
        )
        assert r.status_code == 200, r.text

    def test_3_stage2_prosthetic_step1_approved_accepts(self, student_headers):
        _set_case("stage2_prosthetic_step1_approved", current_phase=4)
        r = requests.post(
            f"{BASE_URL}/api/procedures/{CASE_ID}/stage2/prosthetic",
            json=_base_payload(),
            headers=student_headers,
        )
        assert r.status_code == 200, r.text

    def test_4_pending_final_delivery_accepts(self, student_headers):
        _set_case("pending_final_delivery", current_phase=4)
        r = requests.post(
            f"{BASE_URL}/api/procedures/{CASE_ID}/stage2/prosthetic",
            json=_base_payload(),
            headers=student_headers,
        )
        assert r.status_code == 200, r.text

    def test_5_phase2_approved_but_current_phase_4_accepts(self, student_headers):
        # Fallback path: status drifted but current_phase >= 4 → allow.
        _set_case("phase2_approved", current_phase=4)
        r = requests.post(
            f"{BASE_URL}/api/procedures/{CASE_ID}/stage2/prosthetic",
            json=_base_payload(),
            headers=student_headers,
        )
        assert r.status_code == 200, r.text

    def test_6_phase2_approved_and_current_phase_3_rejects(self, student_headers):
        _set_case("phase2_approved", current_phase=3)
        r = requests.post(
            f"{BASE_URL}/api/procedures/{CASE_ID}/stage2/prosthetic",
            json=_base_payload(),
            headers=student_headers,
        )
        assert r.status_code == 400, r.text
        detail = r.json().get("detail", "")
        assert "Phase 3" in detail and "approved" in detail, detail


# ---------------- Ask 3: scan sub-fields ----------------

class TestAsk3ScanFields:
    """Stage2ProstheticSubmit accepts + persists scan_body_types/types/levels."""

    def test_1_intraoral_scans_persists_arrays(self, student_headers):
        _set_case("stage2_surgical_approved", current_phase=2)
        payload = _base_payload()
        payload.update({
            "impression_type": "intraoral_scans",
            "scan_body_types": ["PEEK", "Metal"],
            "scan_types": ["Vertical Scan Body", "Photogrammetry"],
            "scan_levels": ["Implant Level"],
        })
        r = requests.post(
            f"{BASE_URL}/api/procedures/{CASE_ID}/stage2/prosthetic",
            json=payload,
            headers=student_headers,
        )
        assert r.status_code == 200, r.text

        # Read back — direct DB assertion is more robust than parsing the
        # nested API response.
        proc = _db.procedures.find_one({"_id": ObjectId(CASE_ID)})
        p4 = proc.get("phase4_step1_data") or {}
        assert p4.get("scan_body_types") == ["PEEK", "Metal"]
        assert p4.get("scan_types") == ["Vertical Scan Body", "Photogrammetry"]
        assert p4.get("scan_levels") == ["Implant Level"]

    def test_2_switch_to_conventional_nulls_scan_fields(self, student_headers):
        # Precondition: set scan arrays first.
        _set_case("stage2_surgical_approved", current_phase=2)
        r1 = requests.post(
            f"{BASE_URL}/api/procedures/{CASE_ID}/stage2/prosthetic",
            json={**_base_payload(),
                  "impression_type": "intraoral_scans",
                  "scan_body_types": ["Hybrid"],
                  "scan_types": ["Horizontal Scan Bodies (Flags)"],
                  "scan_levels": ["Abutment/Multiunit Level"]},
            headers=student_headers,
        )
        assert r1.status_code == 200, r1.text

        # Switch to conventional, provide required tray + material, echo scan lists
        # (backend must still null them out because impression_type != intraoral_scans).
        _set_case("stage2_surgical_approved", current_phase=2)
        r2 = requests.post(
            f"{BASE_URL}/api/procedures/{CASE_ID}/stage2/prosthetic",
            json={
                "final_prosthetic_plan": "Fixed hybrid",
                "impression_type": "conventional",
                "conventional_tray_type": "open_tray",
                "impression_material": "polyether",
                "shade_values": ["A2"],
                "shade_layout": "per_implant",
                "scan_body_types": ["PEEK"],   # should be ignored
                "scan_types": ["Photogrammetry"],
                "scan_levels": ["Implant Level"],
            },
            headers=student_headers,
        )
        assert r2.status_code == 200, r2.text

        proc = _db.procedures.find_one({"_id": ObjectId(CASE_ID)})
        p4 = proc.get("phase4_step1_data") or {}
        assert p4.get("scan_body_types") is None
        assert p4.get("scan_types") is None
        assert p4.get("scan_levels") is None
        assert p4.get("impression_type") == "conventional"
        assert p4.get("conventional_tray_type") == "open_tray"
        assert p4.get("impression_material") == "polyether"

    def test_3_model_accepts_all_scan_field_shapes(self, student_headers):
        """Stage2ProstheticSubmit tolerates empty lists + missing fields."""
        _set_case("stage2_surgical_approved", current_phase=2)
        # Empty lists — should serialise to null (nothing to preserve).
        r = requests.post(
            f"{BASE_URL}/api/procedures/{CASE_ID}/stage2/prosthetic",
            json={
                **_base_payload(),
                "impression_type": "intraoral_scans",
                "scan_body_types": [],
                "scan_types": [],
                "scan_levels": [],
            },
            headers=student_headers,
        )
        assert r.status_code == 200, r.text
        proc = _db.procedures.find_one({"_id": ObjectId(CASE_ID)})
        p4 = proc.get("phase4_step1_data") or {}
        # Empty list is persisted as empty list (list comp returns []).
        assert p4.get("scan_body_types") == []
        assert p4.get("scan_types") == []
        assert p4.get("scan_levels") == []


# ---------------- Ask 3 (PDF): Lab Slip renders bullets ----------------

class TestAsk3LabSlipPDF:
    """Backend Lab Slip PDF endpoint renders scan sub-fields."""

    def test_1_case_report_pdf_renders_scan_bullets(self, student_headers):
        """Backend Case-Report PDF (server.py L14583-14599) emits the scan
        bulleted lines when phase4_step1_data has scan_* arrays populated
        and impression_type == 'intraoral_scans'."""
        _set_case("stage2_surgical_approved", current_phase=2)
        r = requests.post(
            f"{BASE_URL}/api/procedures/{CASE_ID}/stage2/prosthetic",
            json={
                **_base_payload(),
                "impression_type": "intraoral_scans",
                "scan_body_types": ["PEEK"],
                "scan_types": ["Vertical Scan Body"],
                "scan_levels": ["Implant Level"],
            },
            headers=student_headers,
        )
        assert r.status_code == 200, r.text

        # POST /api/procedures/{id}/case-report → PDF bytes
        resp = requests.post(
            f"{BASE_URL}/api/procedures/{CASE_ID}/case-report",
            headers=student_headers,
        )
        assert resp.status_code == 200, resp.text[:400]
        assert resp.content[:4] == b"%PDF", "Not a PDF"

        text = _pdf_text(resp.content)
        assert "Type of Scan Body" in text, f"Missing scan-body label. First 500 chars:\n{text[:500]}"
        assert "Scan Type" in text, "Missing 'Scan Type' label"
        assert "Scan Level" in text, "Missing 'Scan Level' label"
        assert "PEEK" in text, "Missing 'PEEK' bullet"
        assert "Vertical Scan Body" in text, "Missing 'Vertical Scan Body' bullet"
        assert "Implant Level" in text, "Missing 'Implant Level' bullet"

    def test_2_case_report_pdf_hides_scan_when_conventional(self, student_headers):
        """When impression_type is conventional, scan labels must NOT appear."""
        _set_case("stage2_surgical_approved", current_phase=2)
        r = requests.post(
            f"{BASE_URL}/api/procedures/{CASE_ID}/stage2/prosthetic",
            json={
                "final_prosthetic_plan": "Fixed hybrid",
                "impression_type": "conventional",
                "conventional_tray_type": "open_tray",
                "impression_material": "polyether",
                "shade_values": ["A2"],
                "shade_layout": "per_implant",
            },
            headers=student_headers,
        )
        assert r.status_code == 200, r.text

        resp = requests.post(
            f"{BASE_URL}/api/procedures/{CASE_ID}/case-report",
            headers=student_headers,
        )
        assert resp.status_code == 200
        assert resp.content[:4] == b"%PDF"
        text = _pdf_text(resp.content)
        # These labels are only rendered inside the intraoral_scans branch.
        assert "Type of Scan Body" not in text, "Scan label leaked on conventional PDF"
        # Impression Material row should render instead.
        assert "Polyether" in text, "Missing 'Polyether' material row"
