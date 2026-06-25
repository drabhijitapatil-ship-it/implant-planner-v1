"""Iteration 149 — Asset delivery + content-uniqueness regression tests
for the 76 onboarding/role/case screenshots served via Expo static at
`/shots/*.jpg`. No auth required.

Critical assertion: MD5 of `onb_<role>_slide6.jpg` must be 4 DISTINCT values
(confirms the prior "all roles showed Student content" bug is fixed).
"""
import hashlib
import re
import pytest
import requests
from pathlib import Path


def _read_frontend_url() -> str:
    env_path = Path("/app/frontend/.env")
    keys = ("REACT_APP_BACKEND_URL", "EXPO_PUBLIC_BACKEND_URL")
    for line in env_path.read_text().splitlines():
        line = line.strip()
        for k in keys:
            if line.startswith(f"{k}="):
                return line.split("=", 1)[1].strip().strip('"').strip("'").rstrip("/")
    raise RuntimeError(f"None of {keys} found in frontend/.env")


BASE_URL = _read_frontend_url()


# Anonymous session (no cookies, no Authorization header)
@pytest.fixture(scope="module")
def http():
    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 AssetDeliveryTest/iter149",
        "Accept": "*/*",
    })
    return s


@pytest.fixture(scope="module")
def index_body(http):
    r = http.get(f"{BASE_URL}/shots/index.html", timeout=20)
    assert r.status_code == 200, f"index.html -> {r.status_code}"
    assert "text/html" in r.headers.get("content-type", "").lower()
    return r.text


def _fetch_jpg(http, name):
    r = http.get(f"{BASE_URL}/shots/{name}", timeout=20)
    return r


def _assert_valid_jpg(r, name):
    assert r.status_code == 200, f"{name} -> HTTP {r.status_code}"
    ctype = r.headers.get("content-type", "").lower()
    assert "image/jpeg" in ctype or "image/jpg" in ctype, (
        f"{name} content-type={ctype}"
    )
    assert len(r.content) > 1024, f"{name} body too small ({len(r.content)} bytes)"
    assert r.content[:3] == b"\xff\xd8\xff", f"{name} bad JPEG magic"


# ----------------------------- Gallery index ----------------------------- #
class TestGalleryIndex:
    def test_returns_200_html(self, index_body):
        assert len(index_body) > 100

    @pytest.mark.parametrize("section", [
        "Onboarding — Student",
        "Onboarding — Supervisor",
        "Onboarding — Implant In-Charge",
        "Onboarding — Nurse",
        "Help / How-it-works per role",
        "Student role views",
        "Nurse role views",
        "Implant In-Charge role views",
        "Deeper case screens",
    ])
    def test_section_present(self, index_body, section):
        assert section in index_body, f"Section '{section}' missing in index.html"

    def test_references_exactly_76_unique_jpgs(self, index_body):
        jpgs = set(re.findall(r"[A-Za-z0-9_./-]+\.jpg", index_body))
        basenames = {Path(p).name for p in jpgs}
        assert len(basenames) == 76, (
            f"Expected 76 unique JPGs, got {len(basenames)}: "
            f"sample={sorted(basenames)[:5]}"
        )


# --------------------------- Onboarding 24 slides ----------------------- #
ROLES = ["student", "supervisor", "incharge", "nurse"]


class TestOnboardingSlides:
    def test_all_24_slides_reachable_and_valid(self, http):
        failures = []
        for role in ROLES:
            for i in range(1, 7):
                name = f"onb_{role}_slide{i}.jpg"
                r = _fetch_jpg(http, name)
                try:
                    _assert_valid_jpg(r, name)
                except AssertionError as e:
                    failures.append(str(e))
        assert not failures, "Onboarding slide failures:\n" + "\n".join(failures)

    def test_slide6_md5_four_distinct_values(self, http):
        """CRITICAL: confirms role-specific recap slides differ (bug fix)."""
        md5s = {}
        for role in ROLES:
            name = f"onb_{role}_slide6.jpg"
            r = _fetch_jpg(http, name)
            _assert_valid_jpg(r, name)
            md5s[role] = hashlib.md5(r.content).hexdigest()
        # All four must be distinct
        assert len(set(md5s.values())) == 4, (
            f"slide6 MD5s not all unique: {md5s}"
        )
        # Verify against expected prefixes from review request
        expected_prefix = {
            "student":    "3cebd0d7",
            "supervisor": "98c3e840",
            "incharge":   "b6bf875b",
            "nurse":      "2883f07c",
        }
        for role, prefix in expected_prefix.items():
            assert md5s[role].startswith(prefix), (
                f"slide6 {role} md5={md5s[role]} expected prefix {prefix}"
            )


# --------------------- Help / How-it-works per role -------------------- #
HELP_PER_ROLE = [
    "22_help_student.jpg",
    "23_help_supervisor.jpg",
    "24_help_implant_incharge.jpg",
    "25_help_nurse.jpg",
]


class TestHelpPerRole:
    @pytest.mark.parametrize("name", HELP_PER_ROLE)
    def test_help_jpg_valid(self, http, name):
        r = _fetch_jpg(http, name)
        _assert_valid_jpg(r, name)

    def test_help_md5_all_unique(self, http):
        md5s = {}
        for name in HELP_PER_ROLE:
            r = _fetch_jpg(http, name)
            _assert_valid_jpg(r, name)
            md5s[name] = hashlib.md5(r.content).hexdigest()
        assert len(set(md5s.values())) == 4, (
            f"Help-per-role MD5s not unique: {md5s}"
        )


# ------------------------ Student role views ---------------------------- #
STUDENT_VIEWS = [
    "s_dashboard.jpg", "s_procedures.jpg", "s_new_procedure.jpg",
    "s_implant_selection.jpg", "s_profile.jpg", "s_notifications.jpg",
    "s_archived.jpg", "s_ask_implanr.jpg", "s_forum.jpg",
]


class TestStudentRoleViews:
    @pytest.mark.parametrize("name", STUDENT_VIEWS)
    def test_student_view_valid(self, http, name):
        r = _fetch_jpg(http, name)
        _assert_valid_jpg(r, name)


# ------------------------ Nurse role views ------------------------------ #
NURSE_VIEWS = [
    "n_dashboard.jpg", "n_procedures.jpg", "n_profile.jpg", "n_notifications.jpg",
]


class TestNurseRoleViews:
    @pytest.mark.parametrize("name", NURSE_VIEWS)
    def test_nurse_view_valid(self, http, name):
        r = _fetch_jpg(http, name)
        _assert_valid_jpg(r, name)


# ---------------------- Implant In-Charge role views -------------------- #
INCHARGE_VIEWS = [
    "ic_dashboard.jpg", "ic_user_management.jpg", "ic_implant_catalog.jpg",
    "ic_audit_log.jpg", "ic_implant_compare.jpg", "ic_ask_implanr.jpg",
]


class TestInchargeRoleViews:
    @pytest.mark.parametrize("name", INCHARGE_VIEWS)
    def test_incharge_view_valid(self, http, name):
        r = _fetch_jpg(http, name)
        _assert_valid_jpg(r, name)


# ------------------------ Deep case screens ----------------------------- #
DEEP_CASE_VIEWS = [
    "case_detail_p4.jpg", "case_detail_p2.jpg",
    "phase2_surgical.jpg", "phase4_step2.jpg",
    "stage2_surgical.jpg", "stage2_prosthetic.jpg",
    "phase2_e2e_surgical.jpg",
]


class TestDeepCaseScreens:
    @pytest.mark.parametrize("name", DEEP_CASE_VIEWS)
    def test_deep_case_view_valid(self, http, name):
        r = _fetch_jpg(http, name)
        _assert_valid_jpg(r, name)


# ----------------------- No-auth requirement --------------------------- #
class TestNoAuthRequired:
    @pytest.mark.parametrize("name", [
        "index.html",
        "onb_student_slide1.jpg",
        "onb_nurse_slide6.jpg",
        "ic_dashboard.jpg",
        "phase2_surgical.jpg",
    ])
    def test_anonymous_get_works(self, name):
        # Brand-new session — no cookies, no Authorization
        s = requests.Session()
        r = s.get(f"{BASE_URL}/shots/{name}", timeout=20)
        assert r.status_code == 200, f"{name} -> {r.status_code} without auth"
        # No Set-Cookie demanded; we just need 200 + correct content-type
        ctype = r.headers.get("content-type", "").lower()
        if name.endswith(".html"):
            assert "text/html" in ctype
        else:
            assert "image/jpeg" in ctype or "image/jpg" in ctype
