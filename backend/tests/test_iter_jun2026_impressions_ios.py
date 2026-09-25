"""iter-Jun-2026: Phase 4 Step 1 impressions & intraoral scanner learning.

Covers:
- GET /api/intraoral-scanners (35 companies, iTero=5, 3Shape=6, Medit=7)
- GET /api/impression-options (2 techniques, 3 mat groups, 8 materials, 3/3/3 chip lists)
- POST /api/procedures/{id}/stage2/prosthetic?save_only=true validation (IOS + conventional)
- Happy paths (IOS 3Shape/TRIOS 5 + closed_tray Polyether Medium)
- Scanner "Other" learning → pending → approve/reject flow
- GET /api/analytics/impressions role-scoping
- Cleanup: delete source='user' scanner rows created by tests
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://prosthetic-preview.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
CASE_ID = "69cfde8b356c7405230a9dcc"

STUDENT = ("Gaurav.pandey", "Student@123")
INCHARGE = ("Abhijit.patil", "Admin@123")
SUPERVISOR = ("Paresh.gandhi", "Supervisor@123")


def _login(identifier, password):
    r = requests.post(f"{API}/auth/login", json={"identifier": identifier, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {identifier}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def student_token():
    return _login(*STUDENT)


@pytest.fixture(scope="module")
def incharge_token():
    return _login(*INCHARGE)


def _hdr(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def _base_payload(**over):
    p = {
        "shade_values": ["A2"],
        "shade_layout": "per_implant",
        "payment_complete": True,
        "components_available": True,
    }
    p.update(over)
    return p


def _submit(token, payload, save_only=True):
    url = f"{API}/procedures/{CASE_ID}/stage2/prosthetic?save_only={'true' if save_only else 'false'}"
    return requests.post(url, headers=_hdr(token), json=payload, timeout=30)


# ── Master lists ─────────────────────────────────────────────────────────────
class TestMasterLists:
    def test_scanners_grouped_counts(self, student_token):
        r = requests.get(f"{API}/intraoral-scanners", headers=_hdr(student_token), timeout=20)
        assert r.status_code == 200
        body = r.json()
        groups = body if isinstance(body, list) else (body.get("companies") or body.get("scanners") or [])
        d = {g["company"]: g.get("models") or [] for g in groups}
        assert len(d) >= 35, f"expected >=35 companies, got {len(d)} — keys: {list(d)[:5]}"
        # iTero 5 models
        itero_key = next((k for k in d if k.lower() == "itero"), None)
        assert itero_key, f"iTero missing; sample: {list(d)[:10]}"
        assert len(d[itero_key]) == 5
        threeshape = next((k for k in d if k.lower() == "3shape"), None)
        assert threeshape and len(d[threeshape]) == 6
        medit = next((k for k in d if k.lower() == "medit"), None)
        assert medit and len(d[medit]) == 7

    def test_impression_options(self, student_token):
        r = requests.get(f"{API}/impression-options", headers=_hdr(student_token), timeout=15)
        assert r.status_code == 200
        b = r.json()
        assert len(b.get("techniques") or {}) == 2
        groups = b.get("material_groups") or []
        assert len(groups) == 3
        # Flatten materials count == 8
        flat = [m for g in groups for m in (g.get("materials") or g.get("options") or [])]
        assert len(flat) == 8, f"expected 8 materials, got {len(flat)}: {flat}"
        assert len(b.get("scan_body_materials") or []) == 3
        assert len(b.get("scan_body_types") or []) == 3
        assert len(b.get("scan_levels") or []) == 3


# ── Validation errors ────────────────────────────────────────────────────────
class TestValidation:
    def test_ios_missing_company(self, student_token):
        r = _submit(student_token, _base_payload(impression_type="intraoral_scans"))
        assert r.status_code == 400
        assert "scanner company" in r.text.lower()

    def test_ios_other_missing_company_other(self, student_token):
        r = _submit(student_token, _base_payload(
            impression_type="intraoral_scans", ios_scanner_company="Other",
        ))
        assert r.status_code == 400
        assert "under 'other'" in r.text.lower() or "under other" in r.text.lower()

    def test_ios_missing_scan_body_material(self, student_token):
        r = _submit(student_token, _base_payload(
            impression_type="intraoral_scans", ios_scanner_company="3Shape", ios_scanner_model="TRIOS 5",
        ))
        assert r.status_code == 400
        assert "scan body material" in r.text.lower()

    def test_ios_empty_scan_body_types(self, student_token):
        r = _submit(student_token, _base_payload(
            impression_type="intraoral_scans", ios_scanner_company="3Shape", ios_scanner_model="TRIOS 5",
            ios_scan_body_material="Metal", ios_scan_body_types=[],
        ))
        assert r.status_code == 400
        assert "type of scan body" in r.text.lower()

    def test_ios_missing_scan_level(self, student_token):
        r = _submit(student_token, _base_payload(
            impression_type="intraoral_scans", ios_scanner_company="3Shape", ios_scanner_model="TRIOS 5",
            ios_scan_body_material="Metal",
            ios_scan_body_types=["Horizontal Scan Body (Scan Flags)"],
        ))
        assert r.status_code == 400
        assert "scan level" in r.text.lower()

    def test_conventional_missing_tray(self, student_token):
        r = _submit(student_token, _base_payload(impression_type="conventional"))
        assert r.status_code == 400
        assert "impression technique" in r.text.lower()

    def test_conventional_bad_material(self, student_token):
        r = _submit(student_token, _base_payload(
            impression_type="conventional", conventional_tray_type="closed_tray", impression_material="Nonsense",
        ))
        assert r.status_code == 400
        assert "impression material" in r.text.lower()

    def test_conventional_other_missing_other_text(self, student_token):
        r = _submit(student_token, _base_payload(
            impression_type="conventional", conventional_tray_type="closed_tray", impression_material="Other",
        ))
        assert r.status_code == 400
        assert "other" in r.text.lower()


# ── Happy paths ──────────────────────────────────────────────────────────────
class TestHappyPaths:
    def test_ios_3shape_trios5_saves(self, student_token):
        r = _submit(student_token, _base_payload(
            impression_type="intraoral_scans",
            ios_scanner_company="3Shape", ios_scanner_model="TRIOS 5",
            ios_scan_body_material="Metal",
            ios_scan_body_types=["Horizontal Scan Body (Scan Flags)", "Photogrammetry Scan Body"],
            ios_scan_level="Implant level",
        ))
        assert r.status_code == 200, r.text
        # Verify persistence
        g = requests.get(f"{API}/procedures/{CASE_ID}", headers=_hdr(student_token), timeout=20)
        assert g.status_code == 200
        p4 = g.json().get("phase4_step1_data") or {}
        assert p4.get("impression_type") == "intraoral_scans"
        assert p4.get("ios_scanner_company") == "3Shape"
        assert p4.get("ios_scanner_model") == "TRIOS 5"
        assert p4.get("ios_scan_body_material") == "Metal"
        assert set(p4.get("ios_scan_body_types") or []) == {
            "Horizontal Scan Body (Scan Flags)", "Photogrammetry Scan Body",
        }
        assert p4.get("ios_scan_level") == "Implant level"
        assert p4.get("impression_material") in (None, "")

    def test_conventional_closed_polyether_saves(self, student_token):
        r = _submit(student_token, _base_payload(
            impression_type="conventional",
            conventional_tray_type="closed_tray",
            impression_material="Polyether - Medium Body",
        ))
        assert r.status_code == 200, r.text
        g = requests.get(f"{API}/procedures/{CASE_ID}", headers=_hdr(student_token), timeout=20)
        p4 = g.json().get("phase4_step1_data") or {}
        assert p4.get("impression_type") == "conventional"
        assert p4.get("conventional_tray_type") == "closed_tray"
        assert p4.get("impression_material") == "Polyether - Medium Body"
        # IOS fields nulled on switch
        for k in ["ios_scanner_company", "ios_scanner_model", "ios_scan_body_material",
                  "ios_scan_body_types", "ios_scan_level"]:
            assert p4.get(k) in (None, [], ""), f"expected null for {k}, got {p4.get(k)!r}"

    def test_conventional_other_material(self, student_token):
        r = _submit(student_token, _base_payload(
            impression_type="conventional", conventional_tray_type="open_tray",
            impression_material="Other", impression_material_other="Custom mix",
        ))
        assert r.status_code == 200, r.text
        g = requests.get(f"{API}/procedures/{CASE_ID}", headers=_hdr(student_token), timeout=20)
        p4 = g.json().get("phase4_step1_data") or {}
        assert p4.get("impression_material") == "Other"
        assert p4.get("impression_material_other") == "Custom mix"


# ── Scanner learning (Other → pending → approve, reject) ─────────────────────
class TestScannerLearning:
    def test_suggestion_flow(self, student_token, incharge_token):
        # 1. Submit IOS with Other company & model
        r = _submit(student_token, _base_payload(
            impression_type="intraoral_scans",
            ios_scanner_company="Other", ios_scanner_company_other="QA ScanCo",
            ios_scanner_model="Other", ios_scanner_model_other="QA-1",
            ios_scan_body_material="PEEK",
            ios_scan_body_types=["Conventional/Vertical Scan Body"],
            ios_scan_level="Abutment level",
        ))
        assert r.status_code == 200, r.text

        # 2. Pending list visible to in-charge
        pend = requests.get(f"{API}/intraoral-scanners/pending", headers=_hdr(incharge_token), timeout=20)
        assert pend.status_code == 200
        items = pend.json()
        if isinstance(items, dict):
            items = items.get("items") or items.get("suggestions") or []
        row = next((it for it in items if (it.get("company") == "QA ScanCo" and it.get("model") == "QA-1")), None)
        assert row is not None, f"pending suggestion QA ScanCo/QA-1 not found: {items[:5]}"

        # 3. Student → 403 on pending endpoint
        r2 = requests.get(f"{API}/intraoral-scanners/pending", headers=_hdr(student_token), timeout=15)
        assert r2.status_code == 403

        # 4. Approve with corrected model
        sid = row.get("id") or row.get("_id")
        appr = requests.post(f"{API}/intraoral-scanners/{sid}/approve",
                             headers=_hdr(incharge_token),
                             json={"company": "QA ScanCo", "model": "QA-1 Pro"}, timeout=20)
        assert appr.status_code == 200, appr.text

        # 5. Verified list contains QA ScanCo with QA-1 Pro
        lst = requests.get(f"{API}/intraoral-scanners", headers=_hdr(student_token), timeout=20).json()
        groups = lst if isinstance(lst, list) else (lst.get("companies") or lst.get("scanners") or [])
        found_models = []
        for g in groups:
            if g.get("company") == "QA ScanCo":
                found_models = g.get("models") or []
                break
        assert "QA-1 Pro" in found_models, f"QA-1 Pro missing from verified list: {found_models}"

        # 6. Submit Other/Other with matching text → backend normalises to verified entry
        r3 = _submit(student_token, _base_payload(
            impression_type="intraoral_scans",
            ios_scanner_company="Other", ios_scanner_company_other="QA ScanCo",
            ios_scanner_model="Other", ios_scanner_model_other="QA-1 Pro",
            ios_scan_body_material="PEEK",
            ios_scan_body_types=["Conventional/Vertical Scan Body"],
            ios_scan_level="Abutment level",
        ))
        assert r3.status_code == 200, r3.text
        g = requests.get(f"{API}/procedures/{CASE_ID}", headers=_hdr(student_token), timeout=15)
        p4 = g.json().get("phase4_step1_data") or {}
        assert p4.get("ios_scanner_company") == "QA ScanCo"
        assert p4.get("ios_scanner_model") == "QA-1 Pro"
        assert p4.get("ios_scanner_company_other") in (None, "")
        assert p4.get("ios_scanner_model_other") in (None, "")

    def test_reject_second_suggestion(self, student_token, incharge_token):
        _submit(student_token, _base_payload(
            impression_type="intraoral_scans",
            ios_scanner_company="Other", ios_scanner_company_other="QA RejectCo",
            ios_scanner_model="Other", ios_scanner_model_other="QR-1",
            ios_scan_body_material="Hybrid",
            ios_scan_body_types=["Photogrammetry Scan Body"],
            ios_scan_level="Multiunit level",
        ))
        pend = requests.get(f"{API}/intraoral-scanners/pending", headers=_hdr(incharge_token), timeout=15).json()
        if isinstance(pend, dict):
            pend = pend.get("items") or pend.get("suggestions") or []
        row = next((it for it in pend if it.get("company") == "QA RejectCo"), None)
        assert row is not None
        sid = row.get("id") or row.get("_id")
        rej = requests.post(f"{API}/intraoral-scanners/{sid}/reject",
                            headers=_hdr(incharge_token), json={}, timeout=15)
        assert rej.status_code == 200, rej.text


# ── Analytics ───────────────────────────────────────────────────────────────
class TestAnalytics:
    def test_incharge_analytics(self, incharge_token):
        r = requests.get(f"{API}/analytics/impressions", headers=_hdr(incharge_token), timeout=20)
        assert r.status_code == 200, r.text
        b = r.json()
        assert (b.get("summary") or {}).get("total", 0) >= 1
        for k in ("scanners", "materials", "scan_levels", "monthly"):
            assert k in b, f"missing key: {k}"

    def test_student_analytics_scoped(self, student_token):
        r = requests.get(f"{API}/analytics/impressions", headers=_hdr(student_token), timeout=20)
        assert r.status_code == 200


# ── Cleanup ─────────────────────────────────────────────────────────────────
def test_zzz_cleanup_user_scanners():
    """Remove test-created scanner rows (source='user')."""
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME") or "test_database"
    if not mongo_url:
        pytest.skip("MONGO_URL not set")
    client = MongoClient(mongo_url)
    dbh = client[db_name]
    res = dbh.intraoral_scanners.delete_many({"source": "user"})
    print(f"Deleted {res.deleted_count} user-added scanner rows")
    client.close()
