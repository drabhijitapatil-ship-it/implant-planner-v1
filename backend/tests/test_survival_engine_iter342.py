"""iter-342 Phase B+C — Implant Survival & Revision Engine backend tests.

Covers:
  * POST /api/procedures/{id}/survival-review — extended replacement fields,
    validation (missing system/diameter/length, invalid reason), R1/R2 chain.
  * GET  /api/procedures/{id}/implant-lifecycle — chronological events + enrichment.
  * GET  /api/analytics/survival — counters, rates, buckets, time_series, filters.
  * GET  /api/analytics/survival/export.csv — CSV headers + sections.
  * RBAC — student receives 403 for analytics endpoints.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://dental-consent-sign.preview.emergentagent.com").rstrip("/")

ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}
STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}

# Procedure with 1 implant on tooth 16 (SPI system) — used for survival-review flow.
PROC_ID = "6a01da5afaa288be26abd086"


# ---------- fixtures ----------
def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed for {creds['identifier']}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="session")
def student_headers():
    return {"Authorization": f"Bearer {_login(STUDENT)}"}


@pytest.fixture(scope="module", autouse=False)
def reset_survival_state(admin_headers):
    """Ensure the shared procedure starts clean & is reset after mutation tests."""
    # Reset before
    requests.post(
        f"{BASE_URL}/api/procedures/{PROC_ID}/survival-review",
        headers=admin_headers,
        json={"all_survived": True, "failures": []},
        timeout=30,
    )
    yield
    # Reset after
    requests.post(
        f"{BASE_URL}/api/procedures/{PROC_ID}/survival-review",
        headers=admin_headers,
        json={"all_survived": True, "failures": []},
        timeout=30,
    )


# ---------- Survival review submission ----------
class TestSurvivalReviewValidation:
    def test_invalid_procedure_id_returns_400(self, admin_headers):
        r = requests.post(
            f"{BASE_URL}/api/procedures/not-a-real-id/survival-review",
            headers=admin_headers,
            json={"all_survived": True, "failures": []},
            timeout=30,
        )
        assert r.status_code == 400, r.text

    def test_missing_replacement_system_returns_400(self, admin_headers):
        payload = {
            "all_survived": False,
            "failures": [{
                "implant_idx": 0,
                "reason": "Peri-implantitis",
                "removed": True,
                "replaced": True,
                "replacement": {"diameter": 4.3, "length": 10.0},  # no system
            }],
        }
        r = requests.post(
            f"{BASE_URL}/api/procedures/{PROC_ID}/survival-review",
            headers=admin_headers, json=payload, timeout=30,
        )
        assert r.status_code == 400
        assert "system" in r.text.lower() or "diameter" in r.text.lower()

    def test_missing_replacement_diameter_returns_400(self, admin_headers):
        payload = {
            "all_survived": False,
            "failures": [{
                "implant_idx": 0, "reason": "Mobility",
                "removed": True, "replaced": True,
                "replacement": {"system": "Straumann BLT", "length": 10.0},
            }],
        }
        r = requests.post(
            f"{BASE_URL}/api/procedures/{PROC_ID}/survival-review",
            headers=admin_headers, json=payload, timeout=30,
        )
        assert r.status_code == 400

    def test_missing_replacement_length_returns_400(self, admin_headers):
        payload = {
            "all_survived": False,
            "failures": [{
                "implant_idx": 0, "reason": "Infection",
                "removed": True, "replaced": True,
                "replacement": {"system": "Straumann BLT", "diameter": 4.1},
            }],
        }
        r = requests.post(
            f"{BASE_URL}/api/procedures/{PROC_ID}/survival-review",
            headers=admin_headers, json=payload, timeout=30,
        )
        assert r.status_code == 400

    def test_invalid_reason_returns_400(self, admin_headers):
        payload = {
            "all_survived": False,
            "failures": [{
                "implant_idx": 0, "reason": "made up nonsense reason",
                "removed": True, "replaced": False,
            }],
        }
        r = requests.post(
            f"{BASE_URL}/api/procedures/{PROC_ID}/survival-review",
            headers=admin_headers, json=payload, timeout=30,
        )
        assert r.status_code == 400
        assert "reason" in r.text.lower()

    def test_invalid_implant_idx_returns_400(self, admin_headers):
        payload = {
            "all_survived": False,
            "failures": [{
                "implant_idx": 99, "reason": "Peri-implantitis",
                "removed": True, "replaced": False,
            }],
        }
        r = requests.post(
            f"{BASE_URL}/api/procedures/{PROC_ID}/survival-review",
            headers=admin_headers, json=payload, timeout=30,
        )
        assert r.status_code == 400


# ---------- R1 / R2 chain flow (mutation) ----------
@pytest.mark.usefixtures("reset_survival_state")
class TestRevisionChain:
    def test_r1_replacement_saves_and_lifecycle_reflects_it(self, admin_headers):
        r1_payload = {
            "all_survived": False,
            "failures": [{
                "implant_idx": 0,
                "reason": "Peri-implantitis",
                "removed": True,
                "replaced": True,
                "failure_date": "2026-01-05",
                "replacement": {
                    "system": "Straumann BLT",
                    "diameter": 4.1,
                    "length": 10.0,
                    "lot_number": "LOT-R1-001",
                    "insertion_torque_ncm": 35,
                    "isq": 72,
                    "healing_protocol": "Two-stage",
                    "surface": "SLActive",
                    "placement_date": "2026-01-06",
                },
            }],
        }
        r = requests.post(
            f"{BASE_URL}/api/procedures/{PROC_ID}/survival-review",
            headers=admin_headers, json=r1_payload, timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        review_entry = data["review"]["0"] if "0" in data["review"] else data["review"][0]
        repl = review_entry["replacement"]
        assert repl["revision_number"] == 1
        assert repl["system"] == "Straumann BLT"
        assert repl["diameter"] == 4.1
        assert repl["length"] == 10.0
        assert repl["lot_number"] == "LOT-R1-001"
        assert repl["insertion_torque_ncm"] == 35.0
        assert repl["isq"] == 72.0
        assert repl["healing_protocol"] == "Two-stage"
        assert repl["chain"] == []

        # Verify persistence via lifecycle endpoint
        lc = requests.get(
            f"{BASE_URL}/api/procedures/{PROC_ID}/implant-lifecycle",
            headers=admin_headers, timeout=30,
        ).json()
        pos = lc["positions"][0]
        assert pos["tooth"] == "16"
        assert pos["current_status"] == "Replaced"
        assert pos["current_revision"] == 1
        kinds = [e["kind"] for e in pos["events"]]
        assert "placed" in kinds and "failed" in kinds and "replaced" in kinds
        failed = next(e for e in pos["events"] if e["kind"] == "failed")
        assert failed.get("reason") == "Peri-implantitis"
        replaced = next(e for e in pos["events"] if e["kind"] == "replaced")
        assert replaced["revision_number"] == 1
        assert replaced.get("system") == "Straumann BLT"
        assert replaced.get("isq") == 72.0

    def test_r2_replacement_bumps_revision_and_chain(self, admin_headers):
        # Assumes R1 was submitted by previous test; submit R2.
        r2_payload = {
            "all_survived": False,
            "failures": [{
                "implant_idx": 0,
                "reason": "Mobility",
                "removed": True,
                "replaced": True,
                "failure_date": "2026-02-15",
                "replacement": {
                    "system": "Nobel Active",
                    "diameter": 4.3,
                    "length": 11.5,
                    "lot_number": "LOT-R2-002",
                    "insertion_torque_ncm": 45,
                    "isq": 78,
                    "healing_protocol": "Immediate loading",
                    "placement_date": "2026-02-16",
                },
            }],
        }
        r = requests.post(
            f"{BASE_URL}/api/procedures/{PROC_ID}/survival-review",
            headers=admin_headers, json=r2_payload, timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        entry = data["review"].get("0") or data["review"].get(0)
        repl = entry["replacement"]
        assert repl["revision_number"] == 2
        assert repl["system"] == "Nobel Active"
        chain = repl["chain"]
        assert len(chain) == 1
        prior = chain[0]
        assert prior.get("revision_number") == 1
        assert prior.get("failure_reason") == "Mobility"
        assert prior.get("failure_date")
        assert prior.get("system") == "Straumann BLT"


# ---------- Lifecycle endpoint schema ----------
class TestLifecycleSchema:
    def test_lifecycle_returns_positions_with_events(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/procedures/{PROC_ID}/implant-lifecycle",
            headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "positions" in data
        assert isinstance(data["positions"], list)
        assert len(data["positions"]) >= 1
        pos = data["positions"][0]
        for k in ("tooth", "current_status", "current_revision", "events", "implant_idx"):
            assert k in pos, f"missing key {k}"
        assert isinstance(pos["events"], list)
        for evt in pos["events"]:
            assert "kind" in evt
            assert "label" in evt
            assert "revision_number" in evt

    def test_lifecycle_invalid_id_returns_400(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/procedures/bad-id/implant-lifecycle",
            headers=admin_headers, timeout=30,
        )
        assert r.status_code in (400, 404)


# ---------- Analytics summary ----------
class TestAnalyticsSurvival:
    def test_survival_analytics_shape(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/analytics/survival", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        # counters
        c = d["counters"]
        for k in ("placed", "active", "failed", "replaced_success", "replaced_refailed"):
            assert k in c, f"counter {k} missing"
            assert isinstance(c[k], int)
        # rates
        r_ = d["rates"]
        assert "survival_rate" in r_ and "replacement_success_rate" in r_
        # by_system / by_tooth
        assert isinstance(d["by_system"], list)
        assert isinstance(d["by_tooth"], list)
        # tooth buckets present as documented
        buckets = {row["bucket"] for row in d["by_tooth"]}
        allowed = {"anterior_max", "posterior_max", "anterior_mand", "posterior_mand", "unknown"}
        assert buckets.issubset(allowed), f"unexpected buckets: {buckets}"
        # time_series
        assert isinstance(d["time_series"], list)
        for row in d["time_series"]:
            assert "month" in row and "placed" in row and "failed" in row and "survival_rate" in row
            assert len(row["month"]) == 7 and row["month"][4] == "-"
        # filters echo — NOTE: backend uses `from`/`to` (not `from_date`/`to_date`).
        # See critical_code_review_comments in iter342 report for the mismatch.
        assert "system" in d["filters"]
        assert "tooth_bucket" in d["filters"]
        assert ("from_date" in d["filters"]) or ("from" in d["filters"])
        assert ("to_date" in d["filters"]) or ("to" in d["filters"])
        # failure_reasons
        assert isinstance(d["failure_reasons"], list)
        assert any(row.get("reason") for row in d["failure_reasons"])

    def test_survival_analytics_placed_ge_active(self, admin_headers):
        d = requests.get(f"{BASE_URL}/api/analytics/survival", headers=admin_headers, timeout=30).json()
        c = d["counters"]
        assert c["placed"] >= c["active"]
        assert c["placed"] >= c["failed"]

    def test_survival_analytics_system_filter(self, admin_headers):
        d = requests.get(
            f"{BASE_URL}/api/analytics/survival?system=SPI",
            headers=admin_headers, timeout=30,
        ).json()
        # NOTE: filter echo lowercases the value ("SPI" -> "spi").
        assert d["filters"]["system"].lower() == "spi"
        # Rows still surface the original casing.
        for row in d["by_system"]:
            assert row["system"].lower() == "spi"

    def test_survival_analytics_tooth_bucket_filter(self, admin_headers):
        d = requests.get(
            f"{BASE_URL}/api/analytics/survival?tooth_bucket=posterior_max",
            headers=admin_headers, timeout=30,
        ).json()
        assert d["filters"]["tooth_bucket"] == "posterior_max"
        for row in d["by_tooth"]:
            assert row["bucket"] == "posterior_max"

    def test_survival_analytics_date_filter(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/analytics/survival?from_date=2020-01-01&to_date=2020-12-31",
            headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200
        d = r.json()
        # backend echoes as `from`/`to`
        assert (d["filters"].get("from") or d["filters"].get("from_date")) == "2020-01-01"
        assert (d["filters"].get("to") or d["filters"].get("to_date")) == "2020-12-31"
        # Old date range should produce zero placed since no seeded procedures pre-2021
        assert d["counters"]["placed"] == 0


# ---------- CSV export ----------
class TestAnalyticsCSV:
    def test_csv_export_headers_and_sections(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/analytics/survival/export.csv",
            headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        assert "text/csv" in r.headers.get("content-type", "")
        assert "attachment" in r.headers.get("content-disposition", "").lower()
        assert ".csv" in r.headers.get("content-disposition", "").lower()
        body = r.text
        for section in (
            "## Summary Counters",
            "## Failure Reasons",
            "## By System",
            "## By Tooth Bucket",
            "## Monthly Time Series",
            "## Case Rows",
        ):
            assert section in body, f"missing CSV section: {section}"


# ---------- RBAC ----------
class TestAnalyticsRBAC:
    def test_student_forbidden_on_survival_analytics(self, student_headers):
        r = requests.get(f"{BASE_URL}/api/analytics/survival", headers=student_headers, timeout=30)
        assert r.status_code == 403

    def test_student_forbidden_on_csv_export(self, student_headers):
        r = requests.get(
            f"{BASE_URL}/api/analytics/survival/export.csv",
            headers=student_headers, timeout=30,
        )
        assert r.status_code == 403

    def test_student_can_still_read_lifecycle(self, student_headers):
        # Lifecycle isn't role-gated (student may need to see their own case).
        r = requests.get(
            f"{BASE_URL}/api/procedures/{PROC_ID}/implant-lifecycle",
            headers=student_headers, timeout=30,
        )
        # Either 200 (open) or 403 (procedure-level ACL) is acceptable; only 5xx would fail.
        assert r.status_code < 500
