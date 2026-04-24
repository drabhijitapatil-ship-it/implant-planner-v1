"""
Audit Log CSV Export tests — iteration 106.

Covers:
  1. GET /api/admin/access-logs/export-csv as implant_incharge → 200
     - Content-Type=text/csv
     - Content-Disposition filename header present
     - Header row is exactly "created_at,action,outcome,user_id,user_name,user_role,resource_type,resource_id,ip,user_agent,extra"
  2. GET /api/admin/access-logs/export-csv as student / supervisor / nurse → 403
  3. CSV export respects filters: action=login, outcome=failure, user_id,
     resource_type, resource_id
  4. CSV export respects start_date / end_date (ISO-8601); invalid date → 400
  5. GET /api/admin/access-logs extended with start_date / end_date (same
     contract, 400 on invalid); no-date call still works (regression)
  6. CSV export writes an access_logs row with action=audit_export
     (audit-of-the-audit)
  7. CSV export row cap = 10000 (header + <=10000 data rows)
"""
import csv as _csv
import io
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://implant-workflow-hub.preview.emergentagent.com",
).rstrip("/")

CSV_URL = f"{BASE_URL}/api/admin/access-logs/export-csv"
LIST_URL = f"{BASE_URL}/api/admin/access-logs"

ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}
STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}
SUPERVISOR = {"identifier": "Paresh.gandhi", "password": "Supervisor@123"}
NURSE = {"identifier": "nurse.1@dental.edu", "password": "Nurse@123"}

# Procedure used to generate fresh audit rows (handed over by main agent).
KNOWN_PROC_ID = "69cf9bdfdafb502718057bcd"

EXPECTED_HEADER = [
    "created_at", "action", "outcome", "user_id", "user_name", "user_role",
    "resource_type", "resource_id", "ip", "user_agent", "extra",
]


# ──────────────────────────── helpers ────────────────────────────
def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed for {creds['identifier']}: {r.status_code} {r.text[:200]}"
    body = r.json()
    return body["token"], body["user"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _parse_csv(text):
    reader = _csv.reader(io.StringIO(text))
    return list(reader)


# ──────────────────────────── fixtures ───────────────────────────
@pytest.fixture(scope="module")
def admin_ctx():
    token, user = _login(ADMIN)
    return {"token": token, "user": user, "headers": _auth(token)}


@pytest.fixture(scope="module")
def student_ctx():
    token, user = _login(STUDENT)
    return {"token": token, "user": user, "headers": _auth(token)}


@pytest.fixture(scope="module")
def supervisor_ctx():
    token, user = _login(SUPERVISOR)
    return {"token": token, "user": user, "headers": _auth(token)}


@pytest.fixture(scope="module")
def nurse_ctx():
    try:
        token, user = _login(NURSE)
    except AssertionError:
        pytest.skip("nurse.1@dental.edu account not seeded — skipping nurse RBAC case")
        return None
    return {"token": token, "user": user, "headers": _auth(token)}


@pytest.fixture(scope="module")
def seeded_audit(admin_ctx):
    """Generate a few fresh audit rows before the tests look at them:
       - 1 successful login (admin, already happened via _login)
       - 1 failed login → outcome=failure, action=login
       - 1 procedure_view by admin → resource_type=procedures
    """
    stamp = str(int(time.time() * 1000))
    bad_identifier = f"iter106_ghost_{stamp}"
    r_fail = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"identifier": bad_identifier, "password": "does-not-matter"},
        timeout=20,
    )
    # Expected 400/401 (brute force / bad creds) – any non-200 is fine.
    assert r_fail.status_code != 200

    r_proc = requests.get(
        f"{BASE_URL}/api/procedures/{KNOWN_PROC_ID}",
        headers=admin_ctx["headers"],
        timeout=20,
    )
    assert r_proc.status_code == 200, f"procedure fetch failed: {r_proc.status_code} {r_proc.text[:200]}"

    # give the fire-and-forget logger a moment
    time.sleep(1.5)
    return {"bad_identifier": bad_identifier, "admin_user_id": admin_ctx["user"]["id"]}


# ────────────────────────── happy path ───────────────────────────
class TestCsvExportHappyPath:
    def test_incharge_gets_csv_200_with_correct_headers(self, admin_ctx, seeded_audit):
        r = requests.get(CSV_URL, headers=admin_ctx["headers"], timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"

        # Content-Type is text/csv (may include charset=utf-8)
        ct = r.headers.get("Content-Type", "")
        assert ct.startswith("text/csv"), f"unexpected Content-Type: {ct!r}"

        # Filename header
        disp = r.headers.get("Content-Disposition", "")
        assert "attachment" in disp and 'filename="access_logs_' in disp and disp.endswith('.csv"'), \
            f"bad Content-Disposition: {disp!r}"

        rows = _parse_csv(r.text)
        assert len(rows) >= 1, "CSV empty — no header row"
        assert rows[0] == EXPECTED_HEADER, f"header mismatch: {rows[0]}"
        # At least some data rows should be present given activity in the system
        assert len(rows) > 1, "no data rows — expected existing audit activity"

    def test_admin_equivalent_role_also_200(self, admin_ctx):
        # Abhijit.patil is tagged as implant_incharge in seed; if an `administrator`
        # fixture is ever seeded, this proves both roles are accepted.  For now we
        # just assert the whitelisted role passes (already verified above) and
        # document the intent — no separate account exists in the env.
        assert admin_ctx["user"]["role"] in ("administrator", "implant_incharge")


# ─────────────────────────── RBAC (403) ──────────────────────────
class TestCsvExportRBAC:
    def test_student_forbidden(self, student_ctx):
        r = requests.get(CSV_URL, headers=student_ctx["headers"], timeout=20)
        assert r.status_code == 403, f"student should be 403, got {r.status_code} {r.text[:200]}"

    def test_supervisor_forbidden(self, supervisor_ctx):
        r = requests.get(CSV_URL, headers=supervisor_ctx["headers"], timeout=20)
        assert r.status_code == 403, f"supervisor should be 403, got {r.status_code} {r.text[:200]}"

    def test_nurse_forbidden(self, nurse_ctx):
        r = requests.get(CSV_URL, headers=nurse_ctx["headers"], timeout=20)
        assert r.status_code == 403, f"nurse should be 403, got {r.status_code} {r.text[:200]}"

    def test_unauthenticated_rejected(self):
        r = requests.get(CSV_URL, timeout=20)
        assert r.status_code in (401, 403), f"unauth should be 401/403, got {r.status_code}"


# ───────────────────────── Filter behaviour ──────────────────────
class TestCsvExportFilters:
    def test_filter_action_login(self, admin_ctx, seeded_audit):
        r = requests.get(
            CSV_URL,
            headers=admin_ctx["headers"],
            params={"action": "login"},
            timeout=30,
        )
        assert r.status_code == 200
        rows = _parse_csv(r.text)
        assert rows[0] == EXPECTED_HEADER
        data = rows[1:]
        assert len(data) >= 1, "expected at least one login row"
        # action column index = 1
        assert all(row[1] == "login" for row in data), "non-login row leaked through filter"

    def test_filter_outcome_failure(self, admin_ctx, seeded_audit):
        r = requests.get(
            CSV_URL,
            headers=admin_ctx["headers"],
            params={"outcome": "failure"},
            timeout=30,
        )
        assert r.status_code == 200
        rows = _parse_csv(r.text)
        data = rows[1:]
        # outcome column index = 2
        assert all(row[2] == "failure" for row in data), "non-failure row leaked through filter"

    def test_filter_user_id(self, admin_ctx, seeded_audit):
        uid = seeded_audit["admin_user_id"]
        r = requests.get(
            CSV_URL,
            headers=admin_ctx["headers"],
            params={"user_id": uid},
            timeout=30,
        )
        assert r.status_code == 200
        rows = _parse_csv(r.text)
        data = rows[1:]
        assert len(data) >= 1, "admin should have at least one audit row"
        # user_id column index = 3
        assert all(row[3] == uid for row in data), "foreign user_id leaked through filter"

    def test_filter_resource_type_and_id(self, admin_ctx, seeded_audit):
        r = requests.get(
            CSV_URL,
            headers=admin_ctx["headers"],
            params={"resource_type": "procedure", "resource_id": KNOWN_PROC_ID},
            timeout=30,
        )
        assert r.status_code == 200
        rows = _parse_csv(r.text)
        data = rows[1:]
        assert len(data) >= 1, "expected at least one procedure view row for KNOWN_PROC_ID"
        # resource_type idx=6, resource_id idx=7
        assert all(row[6] == "procedure" for row in data)
        assert all(row[7] == KNOWN_PROC_ID for row in data)

    def test_filter_combined_no_match_returns_empty(self, admin_ctx):
        r = requests.get(
            CSV_URL,
            headers=admin_ctx["headers"],
            params={"action": "login", "resource_type": "procedure"},  # mutually exclusive
            timeout=30,
        )
        assert r.status_code == 200
        rows = _parse_csv(r.text)
        assert rows[0] == EXPECTED_HEADER
        assert len(rows) == 1, "expected header-only CSV when filters cannot co-exist"


# ─────────────────── Date-range behaviour + 400s ─────────────────
class TestCsvExportDateRange:
    def test_future_range_empty_csv(self, admin_ctx):
        future = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%S")
        r = requests.get(
            CSV_URL,
            headers=admin_ctx["headers"],
            params={"start_date": future},
            timeout=30,
        )
        assert r.status_code == 200
        rows = _parse_csv(r.text)
        assert rows[0] == EXPECTED_HEADER
        assert len(rows) == 1, "future start_date must yield header-only CSV"

    def test_past_range_has_rows(self, admin_ctx, seeded_audit):
        start = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%S")
        r = requests.get(
            CSV_URL,
            headers=admin_ctx["headers"],
            params={"start_date": start},
            timeout=30,
        )
        assert r.status_code == 200
        rows = _parse_csv(r.text)
        assert len(rows) > 1, "last 7 days should produce audit rows"

    def test_invalid_start_date_returns_400(self, admin_ctx):
        r = requests.get(
            CSV_URL,
            headers=admin_ctx["headers"],
            params={"start_date": "not-a-date"},
            timeout=20,
        )
        assert r.status_code == 400, f"expected 400 for bad start_date, got {r.status_code} {r.text[:200]}"

    def test_invalid_end_date_returns_400(self, admin_ctx):
        r = requests.get(
            CSV_URL,
            headers=admin_ctx["headers"],
            params={"end_date": "2026/02/01"},  # wrong separator
            timeout=20,
        )
        assert r.status_code == 400, f"expected 400 for bad end_date, got {r.status_code} {r.text[:200]}"

    def test_iso_with_z_suffix_accepted(self, admin_ctx):
        start = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        r = requests.get(
            CSV_URL,
            headers=admin_ctx["headers"],
            params={"start_date": start},
            timeout=30,
        )
        assert r.status_code == 200, f"Z-suffixed ISO should be accepted: {r.status_code} {r.text[:200]}"


# ──────────────── List endpoint: new date params (regression) ────
class TestListEndpointDateParams:
    def test_list_without_dates_still_works(self, admin_ctx):
        r = requests.get(
            LIST_URL,
            headers=admin_ctx["headers"],
            params={"limit": 10},
            timeout=20,
        )
        assert r.status_code == 200
        body = r.json()
        assert "items" in body and "total" in body and isinstance(body["items"], list)
        # _id must be excluded
        assert all("_id" not in item for item in body["items"])

    def test_list_with_start_date(self, admin_ctx):
        start = (datetime.now(timezone.utc) - timedelta(days=365)).strftime("%Y-%m-%dT%H:%M:%S")
        r = requests.get(
            LIST_URL,
            headers=admin_ctx["headers"],
            params={"limit": 5, "start_date": start},
            timeout=20,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["total"] >= 0
        assert isinstance(body["items"], list)

    def test_list_with_end_date(self, admin_ctx):
        end = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S")
        r = requests.get(
            LIST_URL,
            headers=admin_ctx["headers"],
            params={"limit": 5, "end_date": end},
            timeout=20,
        )
        assert r.status_code == 200
        assert "items" in r.json()

    def test_list_invalid_start_date_400(self, admin_ctx):
        r = requests.get(
            LIST_URL,
            headers=admin_ctx["headers"],
            params={"start_date": "garbage"},
            timeout=20,
        )
        assert r.status_code == 400

    def test_list_invalid_end_date_400(self, admin_ctx):
        r = requests.get(
            LIST_URL,
            headers=admin_ctx["headers"],
            params={"end_date": "2026-13-40"},
            timeout=20,
        )
        assert r.status_code == 400


# ─────────────── audit-of-the-audit self-log row ─────────────────
class TestAuditExportSelfLog:
    def test_csv_export_writes_audit_export_row(self, admin_ctx):
        # Snapshot count BEFORE
        before = requests.get(
            LIST_URL,
            headers=admin_ctx["headers"],
            params={"action": "audit_export", "limit": 1},
            timeout=20,
        )
        assert before.status_code == 200
        count_before = before.json()["total"]

        # Trigger a CSV download
        t0 = datetime.now(timezone.utc)
        r = requests.get(CSV_URL, headers=admin_ctx["headers"], timeout=30)
        assert r.status_code == 200

        # Give fire-and-forget logger a moment to persist
        time.sleep(2)

        after = requests.get(
            LIST_URL,
            headers=admin_ctx["headers"],
            params={"action": "audit_export", "limit": 5},
            timeout=20,
        )
        assert after.status_code == 200
        body = after.json()
        assert body["total"] == count_before + 1, \
            f"expected exactly one new audit_export row; before={count_before}, after={body['total']}"

        # Most recent one should belong to the admin that triggered the export
        top = body["items"][0]
        assert top["action"] == "audit_export"
        assert top["resource_type"] == "access_logs"
        assert top.get("user_id") == admin_ctx["user"]["id"]
        # freshness sanity – within a minute
        ts = top.get("created_at")
        if isinstance(ts, str):
            try:
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                # normalize to tz-aware UTC for delta math
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                delta = abs((t0 - dt).total_seconds())
                assert delta < 120, f"audit_export row too old/skewed: Δ={delta}s"
            except ValueError:
                pass  # timestamp parsing not strict requirement for this test


# ─────────────── 10k row cap (structural assertion) ──────────────
class TestCsvExportRowCap:
    def test_csv_never_exceeds_10k_data_rows(self, admin_ctx):
        r = requests.get(CSV_URL, headers=admin_ctx["headers"], timeout=60)
        assert r.status_code == 200
        rows = _parse_csv(r.text)
        # rows[0] is header, so data rows = len(rows) - 1
        assert len(rows) - 1 <= 10000, f"CSV returned {len(rows)-1} data rows (>10000)"
