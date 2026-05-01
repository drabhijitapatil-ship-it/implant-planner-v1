"""Iteration 116 — Backend regression for chat photo_url + chat & forum endpoints."""
import os
import io
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://dental-workflow-18.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ── Chat group create with photo_url ───────────────────────────────────
class TestChatGroupPhotoUrl:
    def test_create_group_with_photo_url_persisted(self, admin_headers):
        payload = {
            "name": "TEST_iter116_photo",
            "type": "private",
            "member_ids": [],
            "photo_url": "/api/uploads/chat/test_iter116.jpg",
        }
        r = requests.post(f"{API}/chat/groups", json=payload, headers=admin_headers, timeout=15)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
        data = r.json()
        gid = data.get("id")
        assert gid, data
        assert data.get("name") == payload["name"]

        g = requests.get(f"{API}/chat/groups/{gid}", headers=admin_headers, timeout=15)
        assert g.status_code == 200, g.text
        gd = g.json()
        assert gd.get("photo_url") == payload["photo_url"], f"photo_url not persisted: {gd}"

    def test_create_group_without_photo_url(self, admin_headers):
        payload = {"name": "TEST_iter116_nophoto", "type": "private", "member_ids": []}
        r = requests.post(f"{API}/chat/groups", json=payload, headers=admin_headers, timeout=15)
        assert r.status_code in (200, 201), r.text


# ── Chat endpoints regression ──────────────────────────────────────────
class TestChatRegression:
    @pytest.fixture(scope="class")
    def group_id(self, admin_headers):
        r = requests.post(
            f"{API}/chat/groups",
            json={"name": "TEST_iter116_regress", "type": "private", "member_ids": []},
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code in (200, 201), r.text
        return r.json()["id"]

    def test_get_groups(self, admin_headers):
        r = requests.get(f"{API}/chat/groups", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json().get("items", r.json()), list)

    def test_post_message(self, admin_headers, group_id):
        r = requests.post(
            f"{API}/chat/groups/{group_id}/messages",
            json={"body": "iter116 regression msg", "type": "text"},
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code in (200, 201), r.text

    def test_post_typing(self, admin_headers, group_id):
        r = requests.post(f"{API}/chat/groups/{group_id}/typing", headers=admin_headers, timeout=15)
        assert r.status_code in (200, 201, 204), r.text

    def test_mark_read(self, admin_headers, group_id):
        r = requests.post(f"{API}/chat/groups/{group_id}/mark-read", headers=admin_headers, timeout=15)
        assert r.status_code in (200, 201, 204), r.text

    def test_chat_upload(self, admin_headers):
        files = {"file": ("test_iter116.jpg", io.BytesIO(b"\xff\xd8\xffstub"), "image/jpeg")}
        h = {k: v for k, v in admin_headers.items() if k.lower() != "content-type"}
        r = requests.post(f"{API}/chat/upload", files=files, headers=h, timeout=20)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        assert "url" in d
        assert d["url"].startswith("/api/")


# ── Forum endpoints regression ────────────────────────────────────────
class TestForumRegression:
    def test_forum_unread_summary(self, admin_headers):
        r = requests.get(f"{API}/forum/unread-summary", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text

    def test_forum_thread_create_and_post(self, admin_headers):
        # forum threads are tied to a procedure — fetch an existing thread to derive procedure_id
        lst = requests.get(f"{API}/forum/threads", headers=admin_headers, timeout=15)
        assert lst.status_code == 200, lst.text
        items = lst.json().get("items") or lst.json()
        if not items:
            pytest.skip("No existing forum threads to derive procedure_id; skipping create test.")
        proc_id = items[0].get("procedure_id") or items[0].get("procedureId")
        if not proc_id:
            pytest.skip("No procedure_id field in existing thread.")
        r = requests.post(
            f"{API}/forum/threads",
            json={"title": "TEST_iter116_thread", "body": "hello", "category": "general", "procedure_id": proc_id, "consent_acknowledged": True},
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code in (200, 201), r.text
        body = r.json()
        tid = body.get("id") or body.get("thread_id") or body.get("_id")
        if not tid:
            # Some endpoints return the wrapped thread payload
            tid = (body.get("thread") or {}).get("id")
        assert tid, body

        rp = requests.post(
            f"{API}/forum/threads/{tid}/posts",
            json={"body": "iter116 reply"},
            headers=admin_headers,
            timeout=15,
        )
        assert rp.status_code in (200, 201), rp.text

    def test_forum_upload(self, admin_headers):
        files = {"file": ("forum_iter116.jpg", io.BytesIO(b"\xff\xd8\xffstub"), "image/jpeg")}
        h = {k: v for k, v in admin_headers.items() if k.lower() != "content-type"}
        r = requests.post(f"{API}/forum/upload", files=files, headers=h, timeout=20)
        assert r.status_code in (200, 201), r.text
        assert "url" in r.json()
