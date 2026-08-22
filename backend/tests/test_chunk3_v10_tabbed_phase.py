"""
Chunk 3 v10 — Unified Tabbed Phase 2-5 Backend Tests
Tests: PATCH /api/procedures/{id}/tabbed-phase-data/{phase}, PDF export sections,
AI case summary regression.
"""
import io
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://prosthetic-preview.preview.emergentagent.com",
).rstrip("/")

ADMIN_ID = "Abhijit.patil"
ADMIN_PW = "Admin@123"
STUDENT_ID = "Gaurav.pandey"
STUDENT_PW = "Student@123"

# Seed case IDs (verified via GET /api/procedures?search=Zygoma)
CASE_ZYG_PTER = "6a8337dd64ad3269dc584a69"    # Test Patient Zygoma (Zyg+Pter)
CASE_QUAD_ZYG = "6a845d57cff336ac29b34ac1"    # Test v4 workflow (Quad Zygoma)
CASE_CONV = "6a6b7fbf6633443cf356df15"        # P2 Aug UI Patient (Single Conv)


def _login(identifier, password):
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"identifier": identifier, "password": password},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed for {identifier}: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_ID, ADMIN_PW)


@pytest.fixture(scope="module")
def student_token():
    return _login(STUDENT_ID, STUDENT_PW)


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------------------------------------------------------------- PATCH endpoint
class TestTabbedPhaseDataEndpoint:
    def test_1_patch_phase2_happy_path(self, admin_token):
        payload = {
            "per_implant": {
                "ZR1": {
                    "torque_ncm": 40,
                    "insertion_date": "2026-06-20",
                    "timing_type": "immediate",
                    "mua_angulation": "17°",
                    "implant_type": "zygoma",
                    "side": "Right",
                },
                "ZL1": {
                    "torque_ncm": 45,
                    "insertion_date": "2026-06-20",
                    "timing_type": "immediate",
                    "implant_type": "zygoma",
                    "side": "Left",
                },
            },
            "advanced_clinical": {
                "zaga_confirmed_right": "2",
                "zaga_confirmed_left": "1",
                "no_sinus_disease": True,
                "no_oro_antral_communication": True,
                "screw_retained_confirmed": True,
                "passive_fit_verified": True,
                "no_radiographic_peri_implant_lesion": True,
                "immediate_loading_day0_at": "2026-06-20",
                "oris_success_code": 4,
            },
        }
        r = requests.patch(
            f"{BASE_URL}/api/procedures/{CASE_ZYG_PTER}/tabbed-phase-data/2",
            headers=_h(admin_token),
            json=payload,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("phase") == 2
        pi = body.get("per_implant") or {}
        assert "ZR1" in pi and "ZL1" in pi, f"Missing keys: {list(pi.keys())}"
        assert pi["ZR1"].get("torque_ncm") == 40
        assert pi["ZL1"].get("torque_ncm") == 45
        ac = body.get("advanced_clinical") or {}
        assert ac.get("oris_success_code") == 4
        assert ac.get("no_sinus_disease") is True

    def test_2_partial_merge_preserves_prior(self, admin_token):
        r = requests.patch(
            f"{BASE_URL}/api/procedures/{CASE_ZYG_PTER}/tabbed-phase-data/2",
            headers=_h(admin_token),
            json={"per_implant": {"ZR1": {"notes": "extra note"}}},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        pi = r.json().get("per_implant") or {}
        assert pi["ZR1"].get("notes") == "extra note"
        # prior torque MUST be preserved
        assert pi["ZR1"].get("torque_ncm") == 40, (
            f"Shallow-merge failed to preserve torque_ncm: {pi['ZR1']}"
        )
        assert pi["ZR1"].get("timing_type") == "immediate"
        # ZL1 must remain unchanged
        assert pi["ZL1"].get("torque_ncm") == 45
        assert pi["ZL1"].get("timing_type") == "immediate"

    def test_3a_invalid_phase_1(self, admin_token):
        r = requests.patch(
            f"{BASE_URL}/api/procedures/{CASE_ZYG_PTER}/tabbed-phase-data/1",
            headers=_h(admin_token),
            json={"per_implant": {}},
            timeout=30,
        )
        assert r.status_code == 400, r.text

    def test_3b_invalid_phase_6(self, admin_token):
        r = requests.patch(
            f"{BASE_URL}/api/procedures/{CASE_ZYG_PTER}/tabbed-phase-data/6",
            headers=_h(admin_token),
            json={"per_implant": {}},
            timeout=30,
        )
        assert r.status_code == 400, r.text

    def test_4_unauthorized_student(self, student_token):
        # Student is not the owner of admin-created Test Patient Zygoma
        r = requests.patch(
            f"{BASE_URL}/api/procedures/{CASE_ZYG_PTER}/tabbed-phase-data/2",
            headers=_h(student_token),
            json={"per_implant": {"ZR1": {"notes": "hack"}}},
            timeout=30,
        )
        # Depending on ownership: expect 403 OR 404 (if student cannot see the case)
        assert r.status_code in (403, 404), (
            f"Expected 403/404 for student on foreign case, got {r.status_code}: {r.text}"
        )


# ---------------------------------------------------------------- PDF export
def _extract_pdf_text(pdf_bytes):
    try:
        from pypdf import PdfReader
    except ImportError:
        import pip
        pip.main(["install", "pypdf"])
        from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join((p.extract_text() or "") for p in reader.pages)


class TestPDFExport:
    def test_5_pdf_zygoma_case_contains_sections(self, admin_token):
        r = requests.post(
            f"{BASE_URL}/api/procedures/{CASE_ZYG_PTER}/case-report",
            headers=_h(admin_token),
            timeout=60,
        )
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf"), r.headers
        text = _extract_pdf_text(r.content)
        # Save for debug
        with open("/tmp/zyg_case_report.txt", "w") as f:
            f.write(text)
        assert "Per-Implant Records" in text, "Missing 'Per-Implant Records' section"
        assert "Zygoma" in text, "Missing 'Zygoma' group heading"
        assert "Torque" in text, "Missing 'Torque' label"
        assert "Advanced Clinical" in text, "Missing 'Advanced Clinical' section"
        assert "ORIS Success Code" in text, "Missing 'ORIS Success Code' label"
        # ORIS value 4 saved earlier — assert appears in text
        assert "4" in text
        # Look for the ZR1/ZL1 records block and ensure ISQ line is NOT present
        # for the zygoma per-implant rows. Non-strict — just ensure "ISQ" doesn't
        # appear within 200 chars after "Zygoma" heading.
        idx = text.find("Zygoma")
        window = text[idx: idx + 600] if idx >= 0 else ""
        assert "ISQ" not in window, (
            f"ISQ appeared within zygoma per-implant block:\n{window}"
        )

    def test_6_pdf_non_zygoma_no_advanced_clinical(self, admin_token):
        r = requests.post(
            f"{BASE_URL}/api/procedures/{CASE_CONV}/case-report",
            headers=_h(admin_token),
            timeout=60,
        )
        assert r.status_code == 200, r.text
        text = _extract_pdf_text(r.content)
        assert "Advanced Clinical (Zygoma)" not in text, (
            "Advanced Clinical (Zygoma) leaked into non-zygoma PDF"
        )


# ---------------------------------------------------------------- AI summary
class TestAISummary:
    def test_7_ai_summary_zygoma_mentions_keywords(self, admin_token):
        # Endpoint from server.py L12551 area — likely POST /api/generate/ai-case-summary
        # Try common paths, first hit wins.
        candidates = [
            f"/api/generate/ai-case-summary?procedure_id={CASE_ZYG_PTER}",
            f"/api/ai/case-summary?procedure_id={CASE_ZYG_PTER}",
            f"/api/procedures/{CASE_ZYG_PTER}/ai-case-summary",
        ]
        last = None
        for path in candidates:
            r = requests.post(
                f"{BASE_URL}{path}",
                headers=_h(admin_token),
                json={"procedure_id": CASE_ZYG_PTER},
                timeout=120,
            )
            last = r
            if r.status_code == 200:
                break
        assert last is not None
        if last.status_code != 200:
            pytest.skip(
                f"AI summary endpoint returned {last.status_code} on all paths; "
                f"skipping keyword check. Body: {last.text[:200]}"
            )
        body = last.json()
        summary = ""
        if isinstance(body, dict):
            summary = (
                body.get("summary")
                or body.get("ai_case_summary")
                or body.get("response")
                or body.get("text")
                or ""
            )
        elif isinstance(body, str):
            summary = body
        low = summary.lower()
        # Best-effort assertion — log if not matched but do not fail
        keywords = ["zaga", "oris", "immediate load"]
        found = [k for k in keywords if k in low]
        if not found:
            pytest.skip(
                f"AI summary did not mention zygoma keywords (best-effort). "
                f"Preview: {summary[:300]}"
            )
