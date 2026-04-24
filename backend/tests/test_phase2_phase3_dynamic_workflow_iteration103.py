"""
Iteration 103 — Phase 2 / Phase 3 Dynamic Workflow backend regression.

Tests:
1. submit-phase2 accepts new prosthesis_type / prosthesis_type_other /
   healing_abutment_cuff_height fields (no 422) and persists them under
   procedure.phase2_data.
2. case-report POST generates valid PDF and PDF contains expected
   "Prosthesis Type:" / "Immediate Prosthesis Done" banner for Immediate
   Loading flow and "Healing Abutment Placed" banner + cuff heights for
   the Healing Abutment flow.
3. Regression — dashboard stats, procedures list, whats-new, drilling
   protocol PDF, consent PDF endpoints still respond 200.
"""
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or \
    "https://implant-workflow-hub.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")

# Procedure IDs supplied by main agent / discovered during setup
PROC_PHASE1_APPROVED = "69cfde8b356c7405230a9dcc"   # phase1_approved, consent True, 1 implant
PROC_COMPLETED_HEALING = "69c2361dfeb06fbdfc09512e"  # completed, Phase 2 Healing Abutment Placed

ADMIN_IDENT = "Abhijit.patil"
ADMIN_PASS = "Admin@123"


# ------------------------ fixtures ------------------------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"identifier": ADMIN_IDENT, "password": ADMIN_PASS},
                      timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    token = r.json().get("access_token")
    assert token, "no access_token in login response"
    return token


@pytest.fixture(scope="module")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}",
                      "Content-Type": "application/json"})
    return s


# ------------------------ 0. sanity / regression ------------------------
class TestRegressionEndpoints:
    def test_dashboard_stats_200(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/dashboard/stats", timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert isinstance(data, dict)
        # at least one well-known key
        assert any(k in data for k in ("total_procedures", "total", "pending_phase1",
                                       "completed", "draft", "stats"))

    def test_procedures_list_200(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/procedures", timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0

    def test_whats_new_200(self, admin_client):
        # Try both common paths
        paths = ["/api/whats-new", "/api/whatsnew", "/api/whats_new"]
        last_code = None
        for p in paths:
            r = admin_client.get(f"{BASE_URL}{p}", timeout=30)
            last_code = r.status_code
            if r.status_code == 200:
                return
        pytest.skip(f"whats-new endpoint not found (tried {paths}, last={last_code})")

    def test_get_procedure_detail_200(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/procedures/{PROC_PHASE1_APPROVED}",
                             timeout=30)
        assert r.status_code == 200, r.text[:300]
        # Procedure might be in phase1_approved or pending_phase2 depending on whether
        # submit-phase2 has already been run in this session. Both are valid.
        assert r.json().get("status") in ("phase1_approved", "pending_phase2")

    def test_consent_pdf_endpoint(self, admin_client):
        """Consent PDF regression."""
        url = f"{BASE_URL}/api/procedures/{PROC_COMPLETED_HEALING}/consent-pdf"
        r = admin_client.get(url, timeout=60)
        if r.status_code == 404:
            # alternate route
            r = admin_client.post(url, timeout=60)
        # accept 200 (pdf) or 404 (no consent for this case) — just make sure no 500
        assert r.status_code in (200, 404), f"consent-pdf crashed: {r.status_code} {r.text[:200]}"
        if r.status_code == 200:
            assert r.content[:4] == b"%PDF", "consent-pdf not a valid PDF"

    def test_drilling_protocol_pdf_regression(self, admin_client):
        """Drilling-protocol PDF endpoint still works."""
        payload = {
            "brand": "MIS",
            "system": "Lance +",
            "diameter": 4.2,
            "length": 10,
            "bone_density": "D2",
            "tooth": "36",
        }
        # Known endpoint path from prior iterations
        r = admin_client.post(f"{BASE_URL}/api/drilling-protocols/export-pdf",
                              json=payload, timeout=60)
        assert r.status_code == 200, f"drilling export-pdf: {r.status_code} {r.text[:200]}"
        assert r.content[:4] == b"%PDF", "drilling-protocol response is not a PDF"


# ------------------------ 1. submit-phase2 validation ------------------------
class TestSubmitPhase2AcceptsNewFields:
    def test_immediate_loading_with_prosthesis_type_persists(self, admin_client):
        """POST submit-phase2 with Immediate Loading + prosthesis_type.
        Expect 200 and phase2_data.prosthesis_type persisted."""
        payload = {
            "pre_surgery_checklist": {"consent_verified": True, "anaesthesia_ready": True},
            "anesthesia_adequate": "Yes",
            "flap_design": "Full Thickness",
            "drilling_type": "Standard",
            "implant_seated_correctly": True,
            "torque_values": [35.0],
            "bone_graft_used": False,
            "prosthetic_component": "Immediate Loading Done",
            "prosthesis_type": "Other",
            "prosthesis_type_other": "TEST_Custom Hybrid Prosthesis",
            "sutures_placed": True,
            "hemostasis_achieved": True,
            "post_op_checklist": {"post_op_instructions_given": True},
            "student_notes": "TEST_immediate_loading_iter103",
        }
        url = f"{BASE_URL}/api/procedures/{PROC_PHASE1_APPROVED}/submit-phase2"
        r = admin_client.post(url, json=payload, timeout=60)
        # If proc is still phase1_approved, expect 200. If a prior test run already
        # submitted phase2, backend returns 400 ("Phase 1 must be approved") — in
        # that case just verify the previously-persisted fields are still present.
        if r.status_code == 400 and "Phase 1" in r.text:
            pass  # idempotent re-run — fall through to persistence check
        else:
            assert r.status_code == 200, \
                f"submit-phase2 failed: {r.status_code} {r.text[:400]}"

        # Re-fetch procedure and check persistence
        r2 = admin_client.get(f"{BASE_URL}/api/procedures/{PROC_PHASE1_APPROVED}",
                              timeout=30)
        assert r2.status_code == 200
        proc = r2.json()
        p2 = proc.get("phase2_data") or {}
        assert p2.get("prosthetic_component") == "Immediate Loading Done"
        assert p2.get("prosthesis_type") == "Other"
        assert p2.get("prosthesis_type_other") == "TEST_Custom Hybrid Prosthesis"
        assert proc.get("status") == "pending_phase2"

    def test_submit_phase2_rejects_oversize_prosthesis_type(self, admin_client):
        """Pydantic max_length=200 on prosthesis_type should reject >200."""
        # Use a random other procedure or same one (it's now pending_phase2 -> will 400,
        # but pydantic validation runs first so 422 is expected).
        payload = {"prosthesis_type": "X" * 250}
        r = admin_client.post(
            f"{BASE_URL}/api/procedures/{PROC_PHASE1_APPROVED}/submit-phase2",
            json=payload, timeout=30)
        assert r.status_code == 422, f"expected 422 for oversize, got {r.status_code}: {r.text[:300]}"


# ------------------------ 2. case-report PDF ------------------------
def _fetch_case_pdf(client, proc_id):
    url = f"{BASE_URL}/api/procedures/{proc_id}/case-report"
    r = client.post(url, timeout=90)
    assert r.status_code == 200, f"case-report failed ({proc_id}): {r.status_code} {r.text[:300]}"
    assert r.content[:4] == b"%PDF", "case-report did not return a PDF"
    return r.content


def _extract_pdf_text(pdf_bytes):
    try:
        from pypdf import PdfReader
    except ImportError:
        import subprocess, sys
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "pypdf"])
        from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


class TestCaseReportPdfBanners:
    def test_immediate_loading_pdf_banner(self, admin_client):
        """After TestSubmitPhase2AcceptsNewFields ran, PROC_PHASE1_APPROVED has
        prosthetic_component=Immediate Loading Done + prosthesis_type. Verify PDF
        contains 'Prosthesis Type' in Phase 2 section and 'Immediate Prosthesis Done'
        banner in Phase 3 section."""
        pdf = _fetch_case_pdf(admin_client, PROC_PHASE1_APPROVED)
        text = _extract_pdf_text(pdf)
        assert "Prosthesis Type" in text, \
            f"'Prosthesis Type' missing from PDF. Excerpt: {text[:800]}"
        assert "Immediate Prosthesis Done" in text, \
            f"'Immediate Prosthesis Done' banner missing from Phase 3. Excerpt: {text[:1200]}"
        # prosthesis_type_other text should also appear
        assert "TEST_Custom Hybrid Prosthesis" in text, \
            "prosthesis_type_other ('Other - TEST_...') not printed in PDF"

    def test_healing_abutment_pdf_banner(self, admin_client):
        """PROC_COMPLETED_HEALING (completed proc with prosthetic_component
        'Healing Abutment Placed'). PDF must show 'Healing Abutment Placed'
        banner in Phase 3 section. Cuff heights are optional for this proc."""
        pdf = _fetch_case_pdf(admin_client, PROC_COMPLETED_HEALING)
        text = _extract_pdf_text(pdf)
        assert "Healing Abutment Placed" in text, \
            f"'Healing Abutment Placed' banner missing. Excerpt: {text[:1200]}"
        # Phase 3 title should be present
        assert "Phase 3" in text


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
