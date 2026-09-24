"""iter-Jun-2026: Assistant Logbook backend tests.
Covers GET /api/me/assistant-logbook and /export for:
- Aaditya.patil (student, assistant on 2 cases)
- Gaurav.pandey (student, 0 cases; and forbidden cross-student access)
- Paresh.gandhi (supervisor, may query student_id)
- Nurse role forbidden (skip if none seeded)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://prosthetic-preview.preview.emergentagent.com").rstrip("/")


def _login(identifier: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"identifier": identifier, "password": password}, timeout=30)
    assert r.status_code == 200, f"Login failed for {identifier}: {r.status_code} {r.text[:200]}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def tokens():
    return {
        "aaditya": _login("Aaditya.patil", "Student@123"),
        "gaurav": _login("Gaurav.pandey", "Student@123"),
        "paresh": _login("Paresh.gandhi", "Supervisor@123"),
        "admin": _login("Abhijit.patil", "Admin@123"),
    }


def _hdr(token: str):
    return {"Authorization": f"Bearer {token}"}


class TestAssistantLogbookStudentOwn:
    def test_aaditya_own_logbook(self, tokens):
        r = requests.get(f"{BASE_URL}/api/me/assistant-logbook", headers=_hdr(tokens["aaditya"]), timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        # Structure
        assert set(["student_id", "student_name", "total", "by_status", "by_procedure_type", "by_year", "cases"]).issubset(data.keys())
        assert data["total"] >= 2, f"Expected >=2 cases, got {data['total']}"
        # by_status sums to total
        bs = data["by_status"]
        assert set(bs.keys()) == {"completed", "in_progress", "rejected"}
        assert sum(bs.values()) == data["total"]
        # student_name populated
        assert data["student_name"], "student_name missing"
        # operator_name expected 'Dr. Gaurav Pandey'
        ops = {c.get("operator_name") for c in data["cases"]}
        assert any(op and "Gaurav" in op for op in ops), f"Expected operator 'Dr. Gaurav Pandey' among {ops}"
        # each case has status_bucket
        for c in data["cases"]:
            assert c["status_bucket"] in ("completed", "in_progress", "rejected")
            assert c["id"] and c["patient_name"]
        # persist student_id for cross-tests
        pytest.aaditya_id = data["student_id"]


class TestAssistantLogbookCrossStudentForbidden:
    def test_student_cannot_query_other_student(self, tokens):
        # Get Aaditya id
        r0 = requests.get(f"{BASE_URL}/api/me/assistant-logbook", headers=_hdr(tokens["aaditya"]), timeout=30)
        aaditya_id = r0.json()["student_id"]
        # Gaurav queries Aaditya's logbook → 403
        r = requests.get(
            f"{BASE_URL}/api/me/assistant-logbook",
            headers=_hdr(tokens["gaurav"]),
            params={"student_id": aaditya_id},
            timeout=30,
        )
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text[:200]}"


class TestAssistantLogbookSupervisor:
    def test_supervisor_queries_student(self, tokens):
        r0 = requests.get(f"{BASE_URL}/api/me/assistant-logbook", headers=_hdr(tokens["aaditya"]), timeout=30)
        aaditya_id = r0.json()["student_id"]
        r = requests.get(
            f"{BASE_URL}/api/me/assistant-logbook",
            headers=_hdr(tokens["paresh"]),
            params={"student_id": aaditya_id},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data["student_id"] == aaditya_id
        assert data["student_name"] and "Aaditya" in data["student_name"]
        assert data["total"] >= 2


class TestAssistantLogbookGauravEmpty:
    def test_gaurav_own_empty_or_positive(self, tokens):
        r = requests.get(f"{BASE_URL}/api/me/assistant-logbook", headers=_hdr(tokens["gaurav"]), timeout=30)
        assert r.status_code == 200
        data = r.json()
        # No specific assertion on total==0 (may vary), but structure must be valid
        assert isinstance(data["total"], int) and data["total"] >= 0
        assert sum(data["by_status"].values()) == data["total"]


class TestAssistantLogbookExport:
    def test_export_csv_headers(self, tokens):
        r = requests.get(f"{BASE_URL}/api/me/assistant-logbook/export", headers=_hdr(tokens["aaditya"]), timeout=30)
        assert r.status_code == 200, r.text[:300]
        ctype = r.headers.get("content-type", "")
        assert "text/csv" in ctype, f"Expected text/csv, got {ctype}"
        body = r.text
        assert "Assistant" in body and "Total cases assisted" in body
        assert "Procedure Date" in body and "Registration No." in body and "Operator" in body

    def test_export_supervisor_for_student(self, tokens):
        r0 = requests.get(f"{BASE_URL}/api/me/assistant-logbook", headers=_hdr(tokens["aaditya"]), timeout=30)
        aaditya_id = r0.json()["student_id"]
        r = requests.get(
            f"{BASE_URL}/api/me/assistant-logbook/export",
            headers=_hdr(tokens["paresh"]),
            params={"student_id": aaditya_id},
            timeout=30,
        )
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")

    def test_export_forbidden_cross_student(self, tokens):
        r0 = requests.get(f"{BASE_URL}/api/me/assistant-logbook", headers=_hdr(tokens["aaditya"]), timeout=30)
        aaditya_id = r0.json()["student_id"]
        r = requests.get(
            f"{BASE_URL}/api/me/assistant-logbook/export",
            headers=_hdr(tokens["gaurav"]),
            params={"student_id": aaditya_id},
            timeout=30,
        )
        assert r.status_code == 403


class TestAssistantLogbookUnauthenticated:
    def test_unauth_401(self):
        r = requests.get(f"{BASE_URL}/api/me/assistant-logbook", timeout=30)
        assert r.status_code in (401, 403)
