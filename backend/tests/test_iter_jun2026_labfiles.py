"""iter-Jun-2026: Lab Slip Scan Files — comprehensive backend tests."""
import base64
import hashlib
import io
import os
import zipfile

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or "https://dental-implant-hub-14.preview.emergentagent.com"
API = f"{BASE_URL}/api"
CASE_ID = "69cfde8b356c7405230a9dcc"

CREDS = {
    "gaurav": ("Gaurav.pandey", "Student@123"),
    "abhijit": ("Abhijit.patil", "Admin@123"),
    "paresh": ("Paresh.gandhi", "Supervisor@123"),
    "aaditya": ("Aaditya.patil", "Student@123"),
}


def _login(username, password):
    r = requests.post(f"{API}/auth/login", json={"identifier": username, "password": password}, timeout=30)
    assert r.status_code == 200, f"Login {username}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def tokens():
    return {k: _login(*v) for k, v in CREDS.items()}


def _h(t):
    return {"Authorization": f"Bearer {t}"}


# ── Scan file upload validation ──
class TestScanUploadValidation:
    def test_init_bad_extension(self, tokens):
        r = requests.post(f"{API}/procedures/{CASE_ID}/scan-files/init",
                          headers=_h(tokens["gaurav"]),
                          json={"filename": "bad.exe", "size": 1000, "mime": "application/octet-stream"}, timeout=30)
        assert r.status_code == 400, f"{r.status_code}: {r.text}"

    def test_init_oversize(self, tokens):
        r = requests.post(f"{API}/procedures/{CASE_ID}/scan-files/init",
                          headers=_h(tokens["gaurav"]),
                          json={"filename": "big.stl", "size": 600 * 1024 * 1024, "mime": "model/stl"}, timeout=30)
        assert r.status_code in (400, 422), f"{r.status_code}: {r.text}"


# ── Full chunked upload of a ~6MB STL ──
UPLOADED = {}  # will hold {"stl_file_id": ..., "ply_file_id": ...}


class TestChunkedUpload:
    def test_upload_stl_two_chunks(self, tokens):
        data = os.urandom(6 * 1024 * 1024)  # 6 MB
        r = requests.post(f"{API}/procedures/{CASE_ID}/scan-files/init",
                          headers=_h(tokens["gaurav"]),
                          json={"filename": "TEST_upper.stl", "size": len(data), "mime": "model/stl"}, timeout=30)
        assert r.status_code == 200, r.text
        up = r.json()
        upload_id = up["upload_id"]
        chunk_size = up["chunk_size"]
        assert up["total_chunks"] == 2
        for i in range(up["total_chunks"]):
            chunk = data[i * chunk_size:(i + 1) * chunk_size]
            r2 = requests.put(f"{API}/procedures/{CASE_ID}/scan-files/{upload_id}/chunk/{i}",
                              headers={**_h(tokens["gaurav"]), "Content-Type": "application/octet-stream"},
                              data=chunk, timeout=120)
            assert r2.status_code == 200, r2.text
        r3 = requests.post(f"{API}/procedures/{CASE_ID}/scan-files/{upload_id}/complete",
                           headers=_h(tokens["gaurav"]), timeout=60)
        assert r3.status_code == 200, r3.text
        summary = r3.json()
        stl = next(f for f in summary["files"] if f["name"] == "TEST_upper.stl")
        assert stl["sha256"] == hashlib.sha256(data).hexdigest()
        UPLOADED["stl_file_id"] = stl["file_id"]
        UPLOADED["stl_bytes"] = data
        UPLOADED["stl_sha"] = stl["sha256"]

    def test_upload_ply_base64(self, tokens):
        data = os.urandom(200 * 1024)  # 200 KB (1 chunk)
        r = requests.post(f"{API}/procedures/{CASE_ID}/scan-files/init",
                          headers=_h(tokens["gaurav"]),
                          json={"filename": "TEST_bite.ply", "size": len(data), "mime": "application/octet-stream"}, timeout=30)
        assert r.status_code == 200, r.text
        up = r.json()
        b64 = base64.b64encode(data)
        r2 = requests.put(f"{API}/procedures/{CASE_ID}/scan-files/{up['upload_id']}/chunk/0?encoding=base64",
                          headers=_h(tokens["gaurav"]), data=b64, timeout=60)
        assert r2.status_code == 200, r2.text
        r3 = requests.post(f"{API}/procedures/{CASE_ID}/scan-files/{up['upload_id']}/complete",
                           headers=_h(tokens["gaurav"]), timeout=60)
        assert r3.status_code == 200, r3.text
        ply = next(f for f in r3.json()["files"] if f["name"] == "TEST_bite.ply")
        UPLOADED["ply_file_id"] = ply["file_id"]
        UPLOADED["ply_bytes"] = data

    def test_complete_with_missing_chunk(self, tokens):
        data = os.urandom(6 * 1024 * 1024)
        r = requests.post(f"{API}/procedures/{CASE_ID}/scan-files/init",
                          headers=_h(tokens["gaurav"]),
                          json={"filename": "TEST_partial.stl", "size": len(data), "mime": "model/stl"}, timeout=30)
        assert r.status_code == 200
        up = r.json()
        # Upload only first chunk
        chunk = data[:up["chunk_size"]]
        requests.put(f"{API}/procedures/{CASE_ID}/scan-files/{up['upload_id']}/chunk/0",
                     headers={**_h(tokens["gaurav"]), "Content-Type": "application/octet-stream"},
                     data=chunk, timeout=60)
        r3 = requests.post(f"{API}/procedures/{CASE_ID}/scan-files/{up['upload_id']}/complete",
                           headers=_h(tokens["gaurav"]), timeout=30)
        assert r3.status_code == 400, r3.text
        assert "Missing" in r3.text or "missing" in r3.text


# ── Downloads & auth ──
class TestDownloadsAndAuth:
    def test_download_bearer(self, tokens):
        r = requests.get(f"{API}/procedures/{CASE_ID}/scan-files/{UPLOADED['stl_file_id']}/download",
                         headers=_h(tokens["gaurav"]), timeout=120)
        assert r.status_code == 200
        assert hashlib.sha256(r.content).hexdigest() == UPLOADED["stl_sha"]

    def test_download_query_token(self, tokens):
        r = requests.get(f"{API}/procedures/{CASE_ID}/scan-files/{UPLOADED['stl_file_id']}/download",
                         params={"token": tokens["gaurav"]}, timeout=120)
        assert r.status_code == 200
        assert len(r.content) == len(UPLOADED["stl_bytes"])

    def test_unrelated_student_forbidden(self, tokens):
        r = requests.get(f"{API}/procedures/{CASE_ID}/scan-files", headers=_h(tokens["aaditya"]), timeout=30)
        # Aaditya is not on case 69cfde8b356c7405230a9dcc — should be 403
        assert r.status_code == 403, f"Expected 403 got {r.status_code}: {r.text}"

    def test_supervisor_readonly(self, tokens):
        r = requests.get(f"{API}/procedures/{CASE_ID}/scan-files", headers=_h(tokens["paresh"]), timeout=30)
        assert r.status_code == 200, r.text
        # Delete should be 403 for supervisor
        r2 = requests.delete(f"{API}/procedures/{CASE_ID}/scan-files/{UPLOADED['ply_file_id']}",
                             headers=_h(tokens["paresh"]), timeout=30)
        assert r2.status_code == 403, f"Expected 403 got {r2.status_code}: {r2.text}"


# ── Scan link ──
class TestScanLink:
    def test_set_link_auto_prefix(self, tokens):
        r = requests.put(f"{API}/procedures/{CASE_ID}/scan-link",
                         headers=_h(tokens["gaurav"]), json={"url": "meditlink.com/case/1"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["scan_portal_link"] == "https://meditlink.com/case/1"

    def test_set_link_invalid(self, tokens):
        r = requests.put(f"{API}/procedures/{CASE_ID}/scan-link",
                         headers=_h(tokens["gaurav"]), json={"url": "not a link"}, timeout=30)
        assert r.status_code == 400, r.text


# ── Lab share ──
SHARE = {}


class TestLabShare:
    def test_create_share(self, tokens):
        r = requests.post(f"{API}/procedures/{CASE_ID}/lab-share", headers=_h(tokens["gaurav"]), timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["url"].startswith("https://dental-implant-hub-14.preview.emergentagent.com/api/lab/")
        assert j["qr_png_base64"]
        assert len(base64.b64decode(j["qr_png_base64"])) > 100
        SHARE["url"] = j["url"]
        SHARE["token"] = j["url"].rsplit("/", 1)[-1]

    def test_store_slip(self, tokens):
        html = "<html><body><h1>TEST Lab Slip</h1><p>Patient X</p></body></html>"
        r = requests.put(f"{API}/procedures/{CASE_ID}/lab-share/slip",
                         headers=_h(tokens["gaurav"]), json={"slip_html": html}, timeout=30)
        assert r.status_code == 200, r.text

    def test_public_lab_page(self):
        r = requests.get(f"{API}/lab/{SHARE['token']}", timeout=30)
        assert r.status_code == 200
        assert "Download all files (ZIP)" in r.text
        assert "Open Lab Slip" in r.text

    def test_public_file_download(self):
        r = requests.get(f"{API}/lab/{SHARE['token']}/files/{UPLOADED['stl_file_id']}", timeout=120)
        assert r.status_code == 200
        assert hashlib.sha256(r.content).hexdigest() == UPLOADED["stl_sha"]

    def test_public_zip(self):
        r = requests.get(f"{API}/lab/{SHARE['token']}/zip", timeout=120)
        assert r.status_code == 200
        z = zipfile.ZipFile(io.BytesIO(r.content))
        names = z.namelist()
        assert "TEST_upper.stl" in names
        assert "TEST_bite.ply" in names

    def test_public_slip(self):
        r = requests.get(f"{API}/lab/{SHARE['token']}/slip", timeout=30)
        assert r.status_code == 200
        assert "TEST Lab Slip" in r.text

    def test_tampered_token(self):
        bad = SHARE["token"][:-3] + "AAA"
        r = requests.get(f"{API}/lab/{bad}", timeout=30)
        assert r.status_code == 410

    def test_revoke_and_recreate(self, tokens):
        r = requests.post(f"{API}/procedures/{CASE_ID}/lab-share/revoke", headers=_h(tokens["gaurav"]), timeout=30)
        assert r.status_code == 200
        # After revoke, public page → 410
        r2 = requests.get(f"{API}/lab/{SHARE['token']}", timeout=30)
        assert r2.status_code == 410
        # Recreate → new token works
        r3 = requests.post(f"{API}/procedures/{CASE_ID}/lab-share", headers=_h(tokens["gaurav"]), timeout=30)
        assert r3.status_code == 200
        new_url = r3.json()["url"]
        assert new_url != SHARE["url"]
        SHARE["url"] = new_url
        SHARE["token"] = new_url.rsplit("/", 1)[-1]
        r4 = requests.get(f"{API}/lab/{SHARE['token']}", timeout=30)
        assert r4.status_code == 200


# ── Lab directory ──
LAB = {}


class TestLabDirectory:
    def test_student_cannot_create(self, tokens):
        r = requests.post(f"{API}/labs", headers=_h(tokens["gaurav"]),
                          json={"name": "TEST_ReqLab", "email": "delivered@resend.dev"}, timeout=30)
        assert r.status_code == 403, r.text

    def test_admin_create_lab(self, tokens):
        r = requests.post(f"{API}/labs", headers=_h(tokens["abhijit"]),
                          json={"name": "TEST_QA Lab", "email": "delivered@resend.dev", "contact_person": "Ravi"}, timeout=30)
        assert r.status_code == 200, r.text
        LAB["id"] = r.json()["id"]

    def test_admin_invalid_email(self, tokens):
        r = requests.post(f"{API}/labs", headers=_h(tokens["abhijit"]),
                          json={"name": "TEST_BadEmail", "email": "notanemail"}, timeout=30)
        assert r.status_code == 400, r.text

    def test_student_can_list_labs(self, tokens):
        r = requests.get(f"{API}/labs", headers=_h(tokens["gaurav"]), timeout=30)
        assert r.status_code == 200
        assert any(x["id"] == LAB["id"] for x in r.json())

    def test_update_lab(self, tokens):
        r = requests.put(f"{API}/labs/{LAB['id']}", headers=_h(tokens["abhijit"]),
                         json={"name": "TEST_QA Lab v2", "email": "delivered@resend.dev", "contact_person": "Ravi", "phone": "+91"}, timeout=30)
        assert r.status_code == 200


# ── Email lab ──
class TestEmailLab:
    def test_email_lab_success(self, tokens):
        r = requests.post(f"{API}/procedures/{CASE_ID}/lab-share/email",
                          headers=_h(tokens["gaurav"]), json={"lab_id": LAB["id"]}, timeout=60)
        assert r.status_code == 200, r.text
        assert r.json()["sent"]["to"] == "delivered@resend.dev"

    def test_emails_sent_recorded(self, tokens):
        r = requests.get(f"{API}/procedures/{CASE_ID}/scan-files", headers=_h(tokens["gaurav"]), timeout=30)
        assert r.status_code == 200
        sent = r.json()["lab_share"]["emails_sent"]
        assert len(sent) >= 1

    def test_email_after_revoke_fails(self, tokens):
        # Revoke then try email
        requests.post(f"{API}/procedures/{CASE_ID}/lab-share/revoke", headers=_h(tokens["gaurav"]), timeout=30)
        r = requests.post(f"{API}/procedures/{CASE_ID}/lab-share/email",
                          headers=_h(tokens["gaurav"]), json={"lab_id": LAB["id"]}, timeout=30)
        assert r.status_code == 400, r.text


# ── Cleanup ──
class TestZCleanup:
    def test_delete_uploaded_files(self, tokens):
        for fid_key in ("stl_file_id", "ply_file_id"):
            fid = UPLOADED.get(fid_key)
            if fid:
                r = requests.delete(f"{API}/procedures/{CASE_ID}/scan-files/{fid}",
                                    headers=_h(tokens["gaurav"]), timeout=30)
                assert r.status_code == 200

    def test_delete_lab(self, tokens):
        if LAB.get("id"):
            r = requests.delete(f"{API}/labs/{LAB['id']}", headers=_h(tokens["abhijit"]), timeout=30)
            assert r.status_code == 200
        # Verify gone
        r2 = requests.get(f"{API}/labs", headers=_h(tokens["abhijit"]), timeout=30)
        assert not any(x["id"] == LAB.get("id") for x in r2.json())
