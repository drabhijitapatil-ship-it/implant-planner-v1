# iter-456: Implant Information Card (IIC) — card issue/reissue, PDF, public verify, institution setting
import os
import re
import pytest
import requests
from dotenv import dotenv_values

FE_ENV = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or FE_ENV.get("EXPO_PUBLIC_BACKEND_URL") or FE_ENV.get("EXPO_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"

CASE_TRACE = "69cfb036a19e1d1819e0f6fd"      # completed, traceability site 14
CASE_NOTRACE = "6a6891eb702df4d66d11a897"    # completed, no traceability
CASE_OTHER = "69a06378781deba32c41edb7"      # completed, other student/supervisor
CASE_OPEN = "699fbfa15279dfa7819789b8"       # not completed

CREDS = {
    "admin": ("Abhijit.patil", "Admin@123"),
    "sup": ("Paresh.gandhi", "Supervisor@123"),
    "stu": ("Gaurav.pandey", "Student@123"),
    "stu2": ("Aaditya.patil", "Student@123"),
    "nurse": ("Nurse.1", "Nurse@123"),
}
_tok = {}


def hdr(who):
    if who not in _tok:
        ident, pw = CREDS[who]
        r = requests.post(f"{API}/auth/login", json={"identifier": ident, "password": pw}, timeout=30)
        if r.status_code != 200:
            pytest.skip(f"login failed for {who}: {r.status_code}")
        d = r.json()
        _tok[who] = d.get("access_token") or d.get("token")
    return {"Authorization": f"Bearer {_tok[who]}"}


# --- GET card: issue, idempotency, shape ---
class TestGetCard:
    def test_card_shape_and_traceability(self):
        r = requests.get(f"{API}/procedures/{CASE_TRACE}/implant-card", headers=hdr("admin"), timeout=30)
        assert r.status_code == 200, r.text
        c = r.json()
        assert re.fullmatch(r"IIC-\d{4}-\d{5}", c["card_number"])
        assert c["card_number"] == "IIC-2026-00001"
        for k in ("name", "age_sex", "implant_count", "locations", "placement_date", "final_prosthesis_date"):
            assert k in c["patient"]
        assert "prosthesis_type" in c["implant"] and isinstance(c["implant"]["implants"], list)
        site14 = [i for i in c["implant"]["implants"] if i["site"] == "14"]
        assert site14, c["implant"]["implants"]
        assert site14[0]["lot"] == "TX7782"
        assert site14[0]["serial"] == "SN440012"
        assert c["can_reissue"] is True
        assert c["verify_url"].startswith(f"{BASE_URL}/api/iic/verify/"), c["verify_url"]
        assert isinstance(c["warnings"], list)

    def test_idempotent_card_number(self):
        a = requests.get(f"{API}/procedures/{CASE_TRACE}/implant-card", headers=hdr("admin"), timeout=30).json()
        b = requests.get(f"{API}/procedures/{CASE_TRACE}/implant-card", headers=hdr("stu"), timeout=30).json()
        assert a["card_number"] == b["card_number"]
        assert a["verify_url"] == b["verify_url"]
        assert b["can_reissue"] is False  # student

    def test_no_traceability_warnings(self):
        r = requests.get(f"{API}/procedures/{CASE_NOTRACE}/implant-card", headers=hdr("admin"), timeout=30)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["card_number"] == "IIC-2026-00002"
        assert any("lot, serial not recorded" in w for w in c["warnings"]), c["warnings"]
        assert all(i["lot"] == "Not recorded" and i["serial"] == "Not recorded" for i in c["implant"]["implants"])

    def test_non_completed_409(self):
        r = requests.get(f"{API}/procedures/{CASE_OPEN}/implant-card", headers=hdr("admin"), timeout=30)
        assert r.status_code == 409, r.text

    def test_bad_id_404(self):
        r = requests.get(f"{API}/procedures/notanid/implant-card", headers=hdr("admin"), timeout=30)
        assert r.status_code == 404

    def test_unauth_401(self):
        r = requests.get(f"{API}/procedures/{CASE_TRACE}/implant-card", timeout=30)
        assert r.status_code in (401, 403)


# --- RBAC ---
class TestRBAC:
    @pytest.mark.parametrize("who,case", [("nurse", CASE_TRACE), ("stu", CASE_OTHER), ("stu2", CASE_TRACE), ("sup", CASE_OTHER)])
    def test_forbidden(self, who, case):
        r = requests.get(f"{API}/procedures/{case}/implant-card", headers=hdr(who), timeout=30)
        assert r.status_code == 403, f"{who} {case}: {r.status_code} {r.text}"

    def test_assigned_supervisor_ok(self):
        r = requests.get(f"{API}/procedures/{CASE_TRACE}/implant-card", headers=hdr("sup"), timeout=30)
        assert r.status_code == 200 and r.json()["can_reissue"] is True


# --- Reissue ---
class TestReissue:
    def test_student_forbidden(self):
        r = requests.post(f"{API}/procedures/{CASE_NOTRACE}/implant-card/reissue", headers=hdr("stu"), timeout=30)
        assert r.status_code == 403

    def test_supervisor_reissue_increments(self):
        before = requests.get(f"{API}/procedures/{CASE_NOTRACE}/implant-card", headers=hdr("admin"), timeout=30).json()
        r = requests.post(f"{API}/procedures/{CASE_NOTRACE}/implant-card/reissue", headers=hdr("sup"), timeout=30)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["revision"] == before["revision"] + 1
        assert c["reissued_at"]
        assert c["card_number"] == before["card_number"]
        after = requests.get(f"{API}/procedures/{CASE_NOTRACE}/implant-card", headers=hdr("admin"), timeout=30).json()
        assert after["revision"] == c["revision"] and after["verify_url"] == before["verify_url"]


# --- PDF ---
class TestPdf:
    def test_pdf_two_pages_cr80(self):
        r = requests.get(f"{API}/procedures/{CASE_TRACE}/implant-card/pdf", headers=hdr("admin"), timeout=60)
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith("application/pdf")
        assert r.content[:4] == b"%PDF"
        pages = len(re.findall(rb"/Type\s*/Page(?!s)", r.content))
        assert pages == 2, pages
        box = re.search(rb"/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)", r.content)
        assert box, "no MediaBox"
        w, h = float(box.group(1)), float(box.group(2))
        assert abs(w - 85.6 * 72 / 25.4) < 1 and abs(h - 54 * 72 / 25.4) < 1, (w, h)

    def test_pdf_nurse_forbidden(self):
        r = requests.get(f"{API}/procedures/{CASE_TRACE}/implant-card/pdf", headers=hdr("nurse"), timeout=30)
        assert r.status_code == 403


# --- Public verify ---
class TestVerify:
    def test_verify_valid_no_patient(self):
        c = requests.get(f"{API}/procedures/{CASE_TRACE}/implant-card", headers=hdr("admin"), timeout=30).json()
        r = requests.get(c["verify_url"], timeout=30)
        assert r.status_code == 200 and "text/html" in r.headers["content-type"]
        assert "Valid card" in r.text
        assert c["card_number"] in r.text
        assert "TX7782" in r.text and "SN440012" in r.text
        assert c["patient"]["name"] not in r.text
        assert c["patient"]["age_sex"] not in r.text or c["patient"]["age_sex"] == "Not recorded"

    def test_verify_bad_token(self):
        r = requests.get(f"{API}/iic/verify/bogus-token-xyz", timeout=30)
        assert r.status_code == 200
        assert "could not be found" in r.text and "Valid card" not in r.text


# --- Institution setting ---
@pytest.fixture
def restore_institution():
    orig = requests.get(f"{API}/settings/institution", headers=hdr("admin"), timeout=30).json()
    yield orig
    if orig.get("name"):
        requests.put(f"{API}/settings/institution", json={"name": orig["name"]}, headers=hdr("admin"), timeout=30)
    else:
        from pymongo import MongoClient
        env = dotenv_values("/app/backend/.env")
        MongoClient(env["MONGO_URL"])[env["DB_NAME"]].app_settings.delete_one({"_id": "institution"})


class TestInstitution:
    def test_get_default(self):
        r = requests.get(f"{API}/settings/institution", headers=hdr("stu"), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "name" in d and d["effective_name"]

    @pytest.mark.parametrize("who", ["stu", "sup"])
    def test_put_forbidden(self, who):
        r = requests.put(f"{API}/settings/institution", json={"name": "TEST_x"}, headers=hdr(who), timeout=30)
        assert r.status_code == 403

    def test_put_empty_422(self):
        r = requests.put(f"{API}/settings/institution", json={"name": ""}, headers=hdr("admin"), timeout=30)
        assert r.status_code == 422

    def test_put_reflects_on_card(self, restore_institution):
        r = requests.put(f"{API}/settings/institution", json={"name": "  TEST_Inst Dental  "}, headers=hdr("admin"), timeout=30)
        assert r.status_code == 200 and r.json()["name"] == "TEST_Inst Dental"
        g = requests.get(f"{API}/settings/institution", headers=hdr("stu"), timeout=30).json()
        assert g["name"] == "TEST_Inst Dental"
        c = requests.get(f"{API}/procedures/{CASE_TRACE}/implant-card", headers=hdr("admin"), timeout=30).json()
        assert c["institution"] == "TEST_Inst Dental"
        v = requests.get(c["verify_url"], timeout=30)
        assert "TEST_Inst Dental" in v.text
