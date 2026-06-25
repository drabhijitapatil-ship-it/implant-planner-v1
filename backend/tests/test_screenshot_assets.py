"""Asset-delivery regression tests for the screenshot gallery served from
the Expo/React frontend public folder (no auth, no /api prefix).

Public URL is taken from the frontend env so tests stay portable.
"""
import os
import re
import pytest
import requests
from pathlib import Path


def _read_frontend_url() -> str:
    """Read the public frontend URL from /app/frontend/.env (supports either
    REACT_APP_BACKEND_URL or Expo's EXPO_PUBLIC_BACKEND_URL)."""
    env_path = Path("/app/frontend/.env")
    keys = ("REACT_APP_BACKEND_URL", "EXPO_PUBLIC_BACKEND_URL")
    for line in env_path.read_text().splitlines():
        line = line.strip()
        for k in keys:
            if line.startswith(f"{k}="):
                return line.split("=", 1)[1].strip().strip('"').strip("'").rstrip("/")
    raise RuntimeError(f"None of {keys} found in frontend/.env")


BASE_URL = _read_frontend_url()


@pytest.fixture(scope="module")
def http():
    """Anonymous requests session — no cookies, no Authorization header."""
    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AssetDeliveryTest/1.0",
        "Accept": "*/*",
    })
    return s


# --- Gallery HTML index ---------------------------------------------------- #
class TestGalleryIndex:
    def test_index_html_returns_200_and_html(self, http):
        r = http.get(f"{BASE_URL}/shots/index.html", timeout=20)
        assert r.status_code == 200, f"Got {r.status_code}: {r.text[:200]}"
        ctype = r.headers.get("content-type", "").lower()
        assert "text/html" in ctype, f"Unexpected content-type: {ctype}"
        assert len(r.text) > 0
        # cache the body on the session for next assertions
        http._index_body = r.text

    @pytest.mark.parametrize("marker", [
        "01_login.jpg",
        "onb_student_slide1.jpg",
        "22_help_student.jpg",
        "25_help_nurse.jpg",
        "onb_supervisor_slide1.jpg",
        "onb_incharge_slide1.jpg",
        "onb_nurse_slide1.jpg",
    ])
    def test_index_contains_expected_assets(self, http, marker):
        body = getattr(http, "_index_body", None) or http.get(
            f"{BASE_URL}/shots/index.html", timeout=20
        ).text
        assert marker in body, f"'{marker}' not referenced in gallery HTML"

    def test_index_references_all_49_jpgs(self, http):
        body = getattr(http, "_index_body", None) or http.get(
            f"{BASE_URL}/shots/index.html", timeout=20
        ).text
        # Distinct .jpg filenames referenced in the document
        jpgs = set(re.findall(r"[A-Za-z0-9_./-]+\.jpg", body))
        # Strip any leading paths so we compare basenames
        basenames = {Path(p).name for p in jpgs}
        assert len(basenames) >= 49, (
            f"Gallery references only {len(basenames)} distinct JPGs (expected >=49): "
            f"{sorted(basenames)[:5]}..."
        )


# --- Individual JPG assets ------------------------------------------------- #
APP_PAGE_SAMPLES = [
    "01_login.jpg",
    "03_dashboard.jpg",
    "10_user_management.jpg",
    "20_legal.jpg",
    "21_onboarding.jpg",
]

HELP_PER_ROLE = [
    "22_help_student.jpg",
    "23_help_supervisor.jpg",
    "24_help_implant_incharge.jpg",
    "25_help_nurse.jpg",
]

ONBOARDING_FIRST_SLIDE_PER_ROLE = [
    "onb_student_slide1.jpg",
    "onb_supervisor_slide1.jpg",
    "onb_incharge_slide1.jpg",
    "onb_nurse_slide1.jpg",
]


class TestAppPageScreenshots:
    @pytest.mark.parametrize("name", APP_PAGE_SAMPLES)
    def test_app_page_jpg(self, http, name):
        r = http.get(f"{BASE_URL}/shots/{name}", timeout=20)
        assert r.status_code == 200, f"{name} -> {r.status_code}"
        ctype = r.headers.get("content-type", "").lower()
        assert "image/jpeg" in ctype or "image/jpg" in ctype, (
            f"{name} unexpected content-type: {ctype}"
        )
        assert len(r.content) > 1024, f"{name} body too small ({len(r.content)}b)"
        # JPEG magic bytes
        assert r.content[:3] == b"\xff\xd8\xff", f"{name} not a valid JPEG"


class TestHelpWorkflowPerRole:
    @pytest.mark.parametrize("name", HELP_PER_ROLE)
    def test_help_role_jpg(self, http, name):
        r = http.get(f"{BASE_URL}/shots/{name}", timeout=20)
        assert r.status_code == 200, f"{name} -> {r.status_code}"
        assert "image/jpeg" in r.headers.get("content-type", "").lower()
        assert r.content[:3] == b"\xff\xd8\xff"


class TestOnboardingPerRole:
    @pytest.mark.parametrize("name", ONBOARDING_FIRST_SLIDE_PER_ROLE)
    def test_onboarding_first_slide(self, http, name):
        r = http.get(f"{BASE_URL}/shots/{name}", timeout=20)
        assert r.status_code == 200, f"{name} -> {r.status_code}"
        assert "image/jpeg" in r.headers.get("content-type", "").lower()
        assert r.content[:3] == b"\xff\xd8\xff"

    def test_all_24_onboarding_slides_reachable(self, http):
        roles = ["student", "supervisor", "incharge", "nurse"]
        missing = []
        for role in roles:
            for i in range(1, 7):
                name = f"onb_{role}_slide{i}.jpg"
                r = http.get(f"{BASE_URL}/shots/{name}", timeout=20)
                if r.status_code != 200 or "image/jpeg" not in r.headers.get(
                    "content-type", ""
                ).lower():
                    missing.append((name, r.status_code))
        assert not missing, f"Unreachable onboarding slides: {missing}"


# --- No-auth requirement check -------------------------------------------- #
class TestNoAuthRequired:
    def test_no_authorization_header_succeeds(self):
        # Brand-new session, explicitly no cookies/Authorization
        s = requests.Session()
        r = s.get(f"{BASE_URL}/shots/01_login.jpg", timeout=20)
        assert r.status_code == 200
        assert "image/jpeg" in r.headers.get("content-type", "").lower()


# --- Fallback API path probe (diagnostic only) ---------------------------- #
class TestFallbackApiPath:
    """Diagnostic: confirms whether the /api/_internal_screenshots/* fallback
    is reachable from a public requester. Does NOT fail the suite if blocked,
    just records the outcome — the primary fix is the static path above."""

    def test_api_fallback_reachability(self, http, record_property):
        r = http.get(
            f"{BASE_URL}/api/_internal_screenshots/01_login.jpg",
            timeout=20,
            allow_redirects=False,
        )
        record_property("api_fallback_status", r.status_code)
        record_property(
            "api_fallback_content_type", r.headers.get("content-type", "")
        )
        # We only assert that we got *some* response; user-reported blocking
        # would surface here as 401/403/404 from the proxy.
        assert r.status_code < 600
