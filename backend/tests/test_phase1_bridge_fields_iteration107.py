"""
Iteration 107 — Phase 1 clinical-correlation bridge fields backend tests.

Coverage:
1. PUT /api/procedures/{id} accepts new bridge_* fields (bridge_design,
   bridge_material, bridge_pontics, bridge_implants) without 422.
2. Persistence: subsequent GET returns the same values.
3. max_length validation (bridge_design <= 200, bridge_material <= 80) -> 422.
4. List-type validation for bridge_pontics / bridge_implants.
5. Partial updates (only one field at a time) succeed without disturbing
   other persisted bridge_* fields.
6. POST /api/procedures/{id}/case-report — PDF body includes the 4 bridge
   strings when set (Default Prosthesis Plan, Bridge Material, Bridge
   Implants, Bridge Pontics) and case-report still works (no 500) when
   bridge_* fields are absent (regression).
7. RBAC: a different student cannot PUT bridge_* on a procedure they
   don't own.
"""

import os
import re
import time
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://implant-workflow-hub.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}
ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}

# Bridge fields under test (top-level on the procedure document).
BRIDGE_FIELDS = ("bridge_design", "bridge_material", "bridge_implants", "bridge_pontics")


# ───────────────────────── fixtures ──────────────────────────
@pytest.fixture(scope="module")
def session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(session: requests.Session, creds: dict) -> str:
    r = session.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed for {creds['identifier']}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def student_token(session) -> str:
    return _login(session, STUDENT)


@pytest.fixture(scope="module")
def admin_token(session) -> str:
    return _login(session, ADMIN)


@pytest.fixture(scope="module")
def student_headers(student_token):
    return {"Authorization": f"Bearer {student_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def _list_procedures(session, headers):
    r = session.get(f"{API}/procedures", headers=headers, timeout=30)
    assert r.status_code == 200, f"list procedures failed {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def draft_procedure_id(session, student_headers) -> str:
    """Pick one draft procedure owned by Gaurav.pandey for non-destructive PUTs."""
    procs = _list_procedures(session, student_headers)
    drafts = [
        p for p in procs
        if p.get("status") == "draft" and (p.get("id") or p.get("_id"))
    ]
    if not drafts:
        pytest.skip("No draft procedure available for student Gaurav.pandey")
    # Prefer the one referenced in the review_request if present.
    preferred = "69d3374795c2d7fbae4b623e"
    for p in drafts:
        if (p.get("id") or p.get("_id")) == preferred:
            return preferred
    return drafts[0].get("id") or drafts[0].get("_id")


@pytest.fixture(scope="module")
def second_draft_id(session, student_headers, draft_procedure_id) -> str:
    """Second draft used for the 'absent bridge fields' regression PDF test."""
    procs = _list_procedures(session, student_headers)
    for p in procs:
        pid = p.get("id") or p.get("_id")
        if p.get("status") == "draft" and pid and pid != draft_procedure_id:
            return pid
    pytest.skip("Need a second draft procedure for regression test")


# ───────────────── 1. happy-path PUT + persistence ─────────────────
class TestBridgeFieldsAcceptedAndPersisted:
    PAYLOAD = {
        "bridge_design": "Three-unit implant-supported bridge",
        "bridge_material": "Zirconia",
        "bridge_implants": ["14", "16"],
        "bridge_pontics": ["15"],
    }

    def test_put_accepts_bridge_fields(self, session, student_headers, draft_procedure_id):
        r = session.put(
            f"{API}/procedures/{draft_procedure_id}",
            headers=student_headers,
            json=self.PAYLOAD,
            timeout=30,
        )
        assert r.status_code == 200, f"expected 200, got {r.status_code} {r.text}"
        body = r.json()
        for k, v in self.PAYLOAD.items():
            assert body.get(k) == v, f"PUT response field {k} = {body.get(k)!r}, expected {v!r}"

    def test_get_returns_persisted_bridge_fields(self, session, student_headers, draft_procedure_id):
        r = session.get(
            f"{API}/procedures/{draft_procedure_id}",
            headers=student_headers,
            timeout=30,
        )
        assert r.status_code == 200, f"GET failed {r.status_code} {r.text}"
        body = r.json()
        # Top-level (NOT nested in phase1_data).
        assert body.get("bridge_design") == self.PAYLOAD["bridge_design"]
        assert body.get("bridge_material") == self.PAYLOAD["bridge_material"]
        assert body.get("bridge_implants") == self.PAYLOAD["bridge_implants"]
        assert body.get("bridge_pontics") == self.PAYLOAD["bridge_pontics"]
        # Make sure they did NOT accidentally land inside phase1_data.
        p1 = body.get("phase1_data") or {}
        if isinstance(p1, dict):
            for k in BRIDGE_FIELDS:
                assert k not in p1, f"{k} should be top-level, not nested in phase1_data"


# ───────────────── 2. validation: max_length ─────────────────
class TestBridgeFieldValidation:
    def test_bridge_design_over_200_returns_422(self, session, student_headers, draft_procedure_id):
        r = session.put(
            f"{API}/procedures/{draft_procedure_id}",
            headers=student_headers,
            json={"bridge_design": "x" * 201},
            timeout=30,
        )
        assert r.status_code == 422, f"expected 422, got {r.status_code} {r.text}"
        detail = r.json().get("detail", [])
        assert any(
            "bridge_design" in (d.get("loc") or []) and d.get("type") == "string_too_long"
            for d in detail
        ), f"expected string_too_long on bridge_design, got {detail}"

    def test_bridge_design_at_200_is_accepted(self, session, student_headers, draft_procedure_id):
        boundary = "a" * 200
        r = session.put(
            f"{API}/procedures/{draft_procedure_id}",
            headers=student_headers,
            json={"bridge_design": boundary},
            timeout=30,
        )
        assert r.status_code == 200, f"boundary 200 should pass: {r.status_code} {r.text}"
        assert r.json().get("bridge_design") == boundary

    def test_bridge_material_over_80_returns_422(self, session, student_headers, draft_procedure_id):
        r = session.put(
            f"{API}/procedures/{draft_procedure_id}",
            headers=student_headers,
            json={"bridge_material": "y" * 81},
            timeout=30,
        )
        assert r.status_code == 422, f"expected 422, got {r.status_code} {r.text}"
        detail = r.json().get("detail", [])
        assert any(
            "bridge_material" in (d.get("loc") or []) and d.get("type") == "string_too_long"
            for d in detail
        ), f"expected string_too_long on bridge_material, got {detail}"

    def test_bridge_material_at_80_is_accepted(self, session, student_headers, draft_procedure_id):
        boundary = "z" * 80
        r = session.put(
            f"{API}/procedures/{draft_procedure_id}",
            headers=student_headers,
            json={"bridge_material": boundary},
            timeout=30,
        )
        assert r.status_code == 200, f"boundary 80 should pass: {r.status_code} {r.text}"
        assert r.json().get("bridge_material") == boundary

    def test_bridge_pontics_must_be_list(self, session, student_headers, draft_procedure_id):
        r = session.put(
            f"{API}/procedures/{draft_procedure_id}",
            headers=student_headers,
            json={"bridge_pontics": "15"},  # string, not List[str]
            timeout=30,
        )
        assert r.status_code == 422, f"expected 422 for non-list, got {r.status_code} {r.text}"

    def test_bridge_implants_must_be_list(self, session, student_headers, draft_procedure_id):
        r = session.put(
            f"{API}/procedures/{draft_procedure_id}",
            headers=student_headers,
            json={"bridge_implants": "14"},
            timeout=30,
        )
        assert r.status_code == 422, f"expected 422 for non-list, got {r.status_code} {r.text}"


# ───────────────── 3. partial update preserves other fields ─────────────────
class TestPartialBridgeUpdate:
    def test_partial_update_does_not_clobber_other_fields(
        self, session, student_headers, draft_procedure_id
    ):
        # Re-seed a known full state first.
        seed = {
            "bridge_design": "Three-unit implant-supported bridge",
            "bridge_material": "Porcelain Fused to Metal",
            "bridge_implants": ["24", "26"],
            "bridge_pontics": ["25"],
        }
        r0 = session.put(
            f"{API}/procedures/{draft_procedure_id}",
            headers=student_headers,
            json=seed,
            timeout=30,
        )
        assert r0.status_code == 200

        # Update ONLY bridge_material.
        r = session.put(
            f"{API}/procedures/{draft_procedure_id}",
            headers=student_headers,
            json={"bridge_material": "Metal"},
            timeout=30,
        )
        assert r.status_code == 200, r.text

        # Verify via GET that the other 3 fields still match the seed.
        r2 = session.get(
            f"{API}/procedures/{draft_procedure_id}",
            headers=student_headers,
            timeout=30,
        )
        body = r2.json()
        assert body.get("bridge_material") == "Metal"
        assert body.get("bridge_design") == seed["bridge_design"]
        assert body.get("bridge_implants") == seed["bridge_implants"]
        assert body.get("bridge_pontics") == seed["bridge_pontics"]


# ───────────────── 4. case-report PDF emits bridge fields ─────────────────
def _extract_pdf_text(blob: bytes) -> str:
    """Extract concatenated text from a PDF using pypdf (handles FlateDecode)."""
    import io
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(blob))
    chunks = []
    for page in reader.pages:
        try:
            chunks.append(page.extract_text() or "")
        except Exception as e:
            chunks.append(f"<extract_err:{e}>")
    return "\n".join(chunks)


class TestCaseReportPdfBridgeEmission:
    PAYLOAD = {
        "bridge_design": "Three-unit implant-supported bridge",
        "bridge_material": "Zirconia",
        "bridge_implants": ["14", "16"],
        "bridge_pontics": ["15"],
    }

    def test_pdf_contains_bridge_strings_when_set(
        self, session, student_headers, draft_procedure_id
    ):
        # Ensure bridge_* are set on the procedure.
        r0 = session.put(
            f"{API}/procedures/{draft_procedure_id}",
            headers=student_headers,
            json=self.PAYLOAD,
            timeout=30,
        )
        assert r0.status_code == 200, r0.text

        r = session.post(
            f"{API}/procedures/{draft_procedure_id}/case-report",
            headers=student_headers,
            timeout=60,
        )
        assert r.status_code == 200, f"case-report failed {r.status_code} {r.text[:300]}"
        ctype = r.headers.get("content-type", "")
        assert "pdf" in ctype.lower() or r.content[:4] == b"%PDF", \
            f"expected PDF, got content-type={ctype}"

        text = _extract_pdf_text(r.content)
        expected_substrings = [
            "Default Prosthesis Plan",
            "Three-unit implant-supported bridge",
            "Bridge Material",
            "Zirconia",
            "Bridge Implants",
            "14, 16",
            "Bridge Pontics",
            "15",
        ]
        missing = [s for s in expected_substrings if s not in text]
        assert not missing, f"PDF missing expected strings: {missing}"

    def test_pdf_works_when_bridge_fields_absent(
        self, session, student_headers, second_draft_id
    ):
        """Regression: PDF generation must NOT 500 when bridge_* are absent."""
        # Verify the chosen procedure has no bridge_design currently — if it
        # does, clear the conditional logic still works since the test just
        # asserts no 500 and PDF returns valid bytes.
        r = session.post(
            f"{API}/procedures/{second_draft_id}/case-report",
            headers=student_headers,
            timeout=60,
        )
        assert r.status_code == 200, f"case-report failed {r.status_code} {r.text[:300]}"
        assert r.content[:4] == b"%PDF", "response is not a PDF"
        # Sanity: should still contain the Phase 1 section title.
        text = _extract_pdf_text(r.content)
        assert "Phase 1" in text, "Phase 1 section title missing from PDF"


# ───────────────── 5. RBAC ─────────────────
class TestBridgeFieldsRbac:
    def test_student_cannot_put_bridge_on_others_procedure(
        self, session, admin_headers, student_headers, draft_procedure_id
    ):
        """
        Find a draft procedure NOT owned by Gaurav.pandey and confirm that
        Gaurav cannot PUT bridge_* on it (must be 403 or 404, never 200).
        """
        # Use admin to list ALL procedures and find one whose student_id != Gaurav.
        r_all = session.get(f"{API}/procedures", headers=admin_headers, timeout=30)
        if r_all.status_code != 200:
            pytest.skip(f"admin list procedures unavailable: {r_all.status_code}")

        # Resolve Gaurav's user id.
        r_me = session.get(
            f"{API}/auth/me",
            headers=student_headers,
            timeout=30,
        )
        assert r_me.status_code == 200, r_me.text
        gaurav_id = r_me.json().get("id")

        target = None
        for p in r_all.json():
            sid = p.get("student_id")
            pid = p.get("id") or p.get("_id")
            if sid and sid != gaurav_id and pid and p.get("status") in (
                "draft", "pending_supervisor", "pending_phase1"
            ):
                target = pid
                break

        if not target:
            pytest.skip("No procedure owned by another student to test RBAC")

        r = session.put(
            f"{API}/procedures/{target}",
            headers=student_headers,
            json={"bridge_material": "Metal"},
            timeout=30,
        )
        assert r.status_code in (403, 404), \
            f"student should be denied PUT on others' procedure, got {r.status_code} {r.text[:200]}"
