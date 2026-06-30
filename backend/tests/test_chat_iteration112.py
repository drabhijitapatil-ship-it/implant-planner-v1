"""
Backend tests for the Chat module (iteration 112).
Covers: groups CRUD, messages, reactions, upload, users picker, DM, nurse 403.
"""
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to REACT_APP_BACKEND_URL (testing-system env)
    BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL / REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

CREDS = {
    "student": ("Gaurav.pandey", "Student@123"),
    "supervisor": ("Paresh.gandhi", "Supervisor@123"),
    "incharge": ("Abhijit.patil", "Admin@123"),
    "nurse": ("nurse.1@dental.edu", "Nurse@123"),
}


def _login(identifier, password):
    r = requests.post(f"{API}/auth/login", json={"identifier": identifier, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {identifier}: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    user = data.get("user") or {}
    assert token, f"no token in login response: {data}"
    return token, user


@pytest.fixture(scope="module")
def tokens():
    t = {}
    for role, (u, p) in CREDS.items():
        try:
            token, user = _login(u, p)
            t[role] = {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}"}}
        except AssertionError as e:
            t[role] = {"error": str(e)}
    return t


def _hdr(tokens, role):
    assert "headers" in tokens[role], f"login missing for {role}: {tokens[role].get('error')}"
    return tokens[role]["headers"]


# -------------------- Nurse 403 guard --------------------
class TestNurseBlocked:
    def test_nurse_blocked_list_groups(self, tokens):
        if "headers" not in tokens.get("nurse", {}):
            pytest.skip("nurse account missing")
        r = requests.get(f"{API}/chat/groups", headers=_hdr(tokens, "nurse"), timeout=20)
        assert r.status_code == 403

    def test_nurse_blocked_users(self, tokens):
        if "headers" not in tokens.get("nurse", {}):
            pytest.skip("nurse account missing")
        r = requests.get(f"{API}/chat/users", headers=_hdr(tokens, "nurse"), timeout=20)
        assert r.status_code == 403

    def test_nurse_blocked_create_group(self, tokens):
        if "headers" not in tokens.get("nurse", {}):
            pytest.skip("nurse account missing")
        r = requests.post(f"{API}/chat/groups",
                          headers=_hdr(tokens, "nurse"),
                          json={"name": "TEST_nurse", "type": "private", "member_ids": []}, timeout=20)
        assert r.status_code == 403

    def test_nurse_blocked_upload(self, tokens):
        if "headers" not in tokens.get("nurse", {}):
            pytest.skip("nurse account missing")
        files = {"file": ("a.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 100), "image/png")}
        r = requests.post(f"{API}/chat/upload", headers=_hdr(tokens, "nurse"), files=files, timeout=20)
        assert r.status_code == 403


# -------------------- All Staff membership --------------------
class TestAllStaff:
    def test_all_staff_present_for_student(self, tokens):
        r = requests.get(f"{API}/chat/groups", headers=_hdr(tokens, "student"), timeout=20)
        assert r.status_code == 200
        items = r.json().get("items", [])
        assert any(g.get("kind") == "all_staff" or g.get("name") == "All Staff" for g in items), \
            "All Staff group must be visible to student"

    def test_all_staff_locked(self, tokens):
        r = requests.get(f"{API}/chat/groups", headers=_hdr(tokens, "student"), timeout=20)
        all_staff = next((g for g in r.json().get("items", []) if g.get("kind") == "all_staff" or g.get("name") == "All Staff"), None)
        assert all_staff is not None
        assert all_staff.get("locked") is True
        # Try to leave: must 400
        uid = tokens["student"]["user"].get("id") or tokens["student"]["user"].get("_id")
        if uid:
            r2 = requests.delete(f"{API}/chat/groups/{all_staff['id']}/members/{uid}",
                                 headers=_hdr(tokens, "student"), timeout=20)
            assert r2.status_code == 400


# -------------------- Users picker --------------------
class TestUsersPicker:
    def test_picker_excludes_nurses_and_self(self, tokens):
        r = requests.get(f"{API}/chat/users", headers=_hdr(tokens, "student"), timeout=20)
        assert r.status_code == 200
        items = r.json().get("items", [])
        self_id = tokens["student"]["user"].get("id") or tokens["student"]["user"].get("_id")
        assert all(u.get("role") != "nurse" for u in items), "picker must exclude nurses"
        assert all(u.get("id") != self_id for u in items), "picker must exclude self"


# -------------------- Group CRUD + messages + reactions --------------------
class TestGroupLifecycle:
    created_gid = None
    created_mid = None

    def test_create_group_by_student(self, tokens):
        # Pick a member from picker
        picker = requests.get(f"{API}/chat/users", headers=_hdr(tokens, "student"), timeout=20).json().get("items", [])
        member_ids = [picker[0]["id"]] if picker else []
        payload = {"name": "TEST_ChatGroup_112", "type": "private",
                   "description": "iter112 test", "member_ids": member_ids}
        r = requests.post(f"{API}/chat/groups", headers=_hdr(tokens, "student"), json=payload, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("name") == "TEST_ChatGroup_112"
        assert data.get("type") == "private"
        assert "id" in data
        TestGroupLifecycle.created_gid = data["id"]
        # Creator must be a member
        self_id = tokens["student"]["user"].get("id") or tokens["student"]["user"].get("_id")
        assert self_id in (data.get("members") or [])

    def test_get_group_detail(self, tokens):
        gid = TestGroupLifecycle.created_gid
        assert gid, "prior create_group failed"
        r = requests.get(f"{API}/chat/groups/{gid}", headers=_hdr(tokens, "student"), timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == gid
        assert "member_details" in d and isinstance(d["member_details"], list)
        assert d.get("is_admin") is True

    def test_list_groups_contains_created(self, tokens):
        r = requests.get(f"{API}/chat/groups", headers=_hdr(tokens, "student"), timeout=20)
        assert r.status_code == 200
        items = r.json().get("items", [])
        assert any(g["id"] == TestGroupLifecycle.created_gid for g in items)

    def test_send_text_message(self, tokens):
        gid = TestGroupLifecycle.created_gid
        r = requests.post(f"{API}/chat/groups/{gid}/messages",
                          headers=_hdr(tokens, "student"),
                          json={"body": "hello iter112", "attachments": []}, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("body") == "hello iter112"
        assert "id" in d
        TestGroupLifecycle.created_mid = d["id"]

    def test_list_messages(self, tokens):
        gid = TestGroupLifecycle.created_gid
        r = requests.get(f"{API}/chat/groups/{gid}/messages", headers=_hdr(tokens, "student"), timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "total" in d
        assert any(m.get("id") == TestGroupLifecycle.created_mid for m in d["items"])

    def test_upload_image(self, tokens):
        # 1x1 PNG
        png = bytes.fromhex("89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C6300010000000500010D0A2DB40000000049454E44AE426082")
        files = {"file": ("pixel.png", io.BytesIO(png), "image/png")}
        r = requests.post(f"{API}/chat/upload", headers=_hdr(tokens, "student"), files=files, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "/uploads/chat/" in d.get("url", ""), f"url must include /uploads/chat/ got {d.get('url')}"
        assert d.get("type") in ("image", "pdf")
        TestGroupLifecycle.uploaded_url = d["url"]

    def test_send_message_with_attachment(self, tokens):
        gid = TestGroupLifecycle.created_gid
        url = getattr(TestGroupLifecycle, "uploaded_url", None)
        if not url:
            pytest.skip("upload failed")
        payload = {"body": "see attached",
                   "attachments": [{"url": url, "filename": "pixel.png", "type": "image", "size": 100}]}
        r = requests.post(f"{API}/chat/groups/{gid}/messages", headers=_hdr(tokens, "student"), json=payload, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        atts = d.get("attachments") or []
        assert len(atts) == 1 and "/uploads/chat/" in atts[0]["url"]

    def test_send_message_rejects_external_attachment(self, tokens):
        gid = TestGroupLifecycle.created_gid
        payload = {"body": "bad", "attachments": [{"url": "http://evil.example.com/x.png", "filename": "x.png", "type": "image", "size": 10}]}
        r = requests.post(f"{API}/chat/groups/{gid}/messages", headers=_hdr(tokens, "student"), json=payload, timeout=20)
        # Message accepted but external attachment filtered out
        assert r.status_code == 200
        d = r.json()
        assert len(d.get("attachments") or []) == 0

    def test_toggle_reaction(self, tokens):
        mid = TestGroupLifecycle.created_mid
        r = requests.post(f"{API}/chat/messages/{mid}/reactions",
                          headers=_hdr(tokens, "student"), json={"reaction": "thumbs"}, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        # API returns reactions_summary (count map) + reactions_mine (bool map)
        summary = d.get("reactions_summary") or {}
        mine = d.get("reactions_mine") or {}
        assert summary.get("thumbs", 0) >= 1, f"thumbs count missing: {d}"
        assert mine.get("thumbs") is True, f"reactions_mine.thumbs should be True: {d}"

    def test_reaction_invalid_rejected(self, tokens):
        mid = TestGroupLifecycle.created_mid
        r = requests.post(f"{API}/chat/messages/{mid}/reactions",
                          headers=_hdr(tokens, "student"), json={"reaction": "fire"}, timeout=20)
        assert r.status_code == 400

    def test_leave_group(self, tokens):
        gid = TestGroupLifecycle.created_gid
        self_id = tokens["student"]["user"].get("id") or tokens["student"]["user"].get("_id")
        r = requests.delete(f"{API}/chat/groups/{gid}/members/{self_id}",
                            headers=_hdr(tokens, "student"), timeout=20)
        assert r.status_code == 200, r.text

    def test_after_leave_get_group_403(self, tokens):
        gid = TestGroupLifecycle.created_gid
        r = requests.get(f"{API}/chat/groups/{gid}", headers=_hdr(tokens, "student"), timeout=20)
        assert r.status_code == 403


# -------------------- DM idempotency --------------------
class TestDM:
    def test_create_dm_idempotent(self, tokens):
        picker = requests.get(f"{API}/chat/users", headers=_hdr(tokens, "student"), timeout=20).json().get("items", [])
        if not picker:
            pytest.skip("no user to DM")
        other = picker[0]["id"]
        r1 = requests.post(f"{API}/chat/dm/{other}", headers=_hdr(tokens, "student"), timeout=20)
        assert r1.status_code == 200, r1.text
        gid1 = r1.json().get("id")
        r2 = requests.post(f"{API}/chat/dm/{other}", headers=_hdr(tokens, "student"), timeout=20)
        assert r2.status_code == 200
        gid2 = r2.json().get("id")
        assert gid1 == gid2, "DM must be idempotent"

    def test_dm_self_rejected(self, tokens):
        self_id = tokens["student"]["user"].get("id") or tokens["student"]["user"].get("_id")
        r = requests.post(f"{API}/chat/dm/{self_id}", headers=_hdr(tokens, "student"), timeout=20)
        assert r.status_code == 400


# -------------------- Upload size/type guards --------------------
class TestUploadGuards:
    def test_reject_unsupported_ext(self, tokens):
        files = {"file": ("bad.exe", io.BytesIO(b"MZ\x90\x00"), "application/octet-stream")}
        r = requests.post(f"{API}/chat/upload", headers=_hdr(tokens, "student"), files=files, timeout=20)
        assert r.status_code == 400
