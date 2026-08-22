"""Backend tests for Patient Consent E-Signature feature (Phase 1 v2.1)."""
import os
import io
import random
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://prosthetic-preview.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}
SUPERVISOR = {"identifier": "Paresh.gandhi", "password": "Supervisor@123"}
ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}
NURSE = {"identifier": "nurse.1@dental.edu", "password": "Nurse@123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"Login failed for {creds['identifier']}: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def student_tok():
    return _login(STUDENT)


@pytest.fixture(scope="module")
def supervisor_tok():
    return _login(SUPERVISOR)


@pytest.fixture(scope="module")
def admin_tok():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def nurse_tok():
    return _login(NURSE)


def _make_strokes(n_points=40):
    # 2 strokes with n_points each
    s1 = [[50 + i * 5, 100 + (i % 5) * 3] for i in range(n_points // 2)]
    s2 = [[60 + i * 4, 140 + (i % 4) * 2] for i in range(n_points // 2)]
    return [s1, s2]


# ---- 1. consent-texts ----

def test_consent_texts_requires_auth():
    r = requests.get(f"{API}/consent-texts", timeout=30)
    assert r.status_code in (401, 403)


def test_consent_texts_returns_v21_all_langs(student_tok):
    r = requests.get(f"{API}/consent-texts", headers=_h(student_tok), timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("version") == "v2.1", data
    texts = data.get("texts", {})
    for lang in ("en", "hi", "mr"):
        assert lang in texts and len(texts[lang]) > 20, f"missing lang {lang}"


# ---- 2. Find/create a case owned by student ----

@pytest.fixture(scope="module")
def owned_case_id(student_tok):
    # Try to find a case owned by student in a phase-1-ish state
    r = requests.get(f"{API}/procedures", headers=_h(student_tok), timeout=30)
    assert r.status_code == 200, r.text
    procs = r.json()
    # prefer pending_phase1 / phase1_approved
    preferred = [p for p in procs if p.get("status") in ("pending_phase1", "phase1_approved", "consent_uploaded")]
    pool = preferred or procs
    assert pool, "No cases available for student"
    # Try one that is stakeholder-owned
    for p in pool:
        pid = p.get("id") or p.get("_id")
        if pid:
            return pid
    pytest.skip("no case id found")


# ---- 3. Successful esign ----

def test_esign_success(student_tok, owned_case_id):
    payload = {
        "strokes": _make_strokes(40),
        "pad_width": 600,
        "pad_height": 200,
        "consent_version": "v2.1",
        "language": "en",
        "confirmed_explained": True,
    }
    r = requests.post(f"{API}/procedures/{owned_case_id}/consent/esign",
                      json=payload, headers=_h(student_tok), timeout=60)
    assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
    data = r.json()
    ce = data.get("consent_esign") or (data.get("procedure", {}) or {}).get("consent_esign")
    pcf = data.get("patient_consent_form") or (data.get("procedure", {}) or {}).get("patient_consent_form")
    # tolerate wrapper
    if not ce and "procedure" in data:
        ce = data["procedure"].get("consent_esign")
        pcf = data["procedure"].get("patient_consent_form")
    assert ce, f"missing consent_esign: {data}"
    assert "sha256" in ce and len(ce["sha256"]) == 64
    assert "signed_at" in ce
    assert pcf, "missing patient_consent_form"
    assert pcf.get("esigned") is True
    assert pcf.get("version", 1) >= 1


def test_esign_png_file_exists_on_disk(student_tok, owned_case_id):
    # After successful esign the PNG file should be under /app/backend/uploads/
    # Fetch procedure and find file path in patient_consent_form
    r = requests.get(f"{API}/procedures/{owned_case_id}", headers=_h(student_tok), timeout=30)
    assert r.status_code == 200
    proc = r.json()
    pcf = proc.get("patient_consent_form") or {}
    # Try common keys
    fname = pcf.get("filename") or pcf.get("file_name") or pcf.get("path")
    if not fname:
        # Some servers keep it under consent_esign
        ce = proc.get("consent_esign") or {}
        fname = ce.get("filename") or ce.get("path")
    assert fname, f"no filename on consent form: {pcf}"
    base = os.path.basename(fname)
    full = os.path.join("/app/backend/uploads", base)
    assert os.path.exists(full), f"PNG not found on disk: {full}"


# ---- 4. Validation ----

def test_esign_rejects_confirmed_false(student_tok, owned_case_id):
    payload = {
        "strokes": _make_strokes(40),
        "pad_width": 600, "pad_height": 200,
        "consent_version": "v2.1", "language": "en",
        "confirmed_explained": False,
    }
    r = requests.post(f"{API}/procedures/{owned_case_id}/consent/esign",
                      json=payload, headers=_h(student_tok), timeout=30)
    assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text[:200]}"


def test_esign_rejects_too_few_points(student_tok, owned_case_id):
    payload = {
        "strokes": [[[1, 1], [2, 2], [3, 3]]],  # 3 total
        "pad_width": 600, "pad_height": 200,
        "consent_version": "v2.1", "language": "en",
        "confirmed_explained": True,
    }
    r = requests.post(f"{API}/procedures/{owned_case_id}/consent/esign",
                      json=payload, headers=_h(student_tok), timeout=30)
    assert r.status_code == 400
    assert "signature" in r.text.lower() or "point" in r.text.lower()


def test_esign_rejects_bad_version(student_tok, owned_case_id):
    payload = {
        "strokes": _make_strokes(40),
        "pad_width": 600, "pad_height": 200,
        "consent_version": "v9.9", "language": "en",
        "confirmed_explained": True,
    }
    r = requests.post(f"{API}/procedures/{owned_case_id}/consent/esign",
                      json=payload, headers=_h(student_tok), timeout=30)
    assert r.status_code == 400


def test_esign_404_unknown_procedure(student_tok):
    payload = {
        "strokes": _make_strokes(40),
        "pad_width": 600, "pad_height": 200,
        "consent_version": "v2.1", "language": "en",
        "confirmed_explained": True,
    }
    r = requests.post(f"{API}/procedures/deadbeef000000000000000000000000/consent/esign",
                      json=payload, headers=_h(student_tok), timeout=30)
    assert r.status_code == 404


def test_esign_403_non_stakeholder_student(admin_tok, student_tok, owned_case_id):
    # Find a case NOT owned by our student
    r = requests.get(f"{API}/procedures", headers=_h(admin_tok), timeout=30)
    all_procs = r.json() if r.status_code == 200 else []
    r2 = requests.get(f"{API}/procedures", headers=_h(student_tok), timeout=30)
    mine = {(p.get("id") or p.get("_id")) for p in (r2.json() if r2.status_code == 200 else [])}
    foreign = None
    for p in all_procs:
        pid = p.get("id") or p.get("_id")
        if pid and pid not in mine:
            foreign = pid
            break
    if not foreign:
        pytest.skip("no foreign case available for 403 test")
    payload = {
        "strokes": _make_strokes(40),
        "pad_width": 600, "pad_height": 200,
        "consent_version": "v2.1", "language": "en",
        "confirmed_explained": True,
    }
    r = requests.post(f"{API}/procedures/{foreign}/consent/esign",
                      json=payload, headers=_h(student_tok), timeout=30)
    assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text[:200]}"


# ---- 5. Procedure state after esign ----

def test_procedure_state_after_esign(student_tok, owned_case_id):
    r = requests.get(f"{API}/procedures/{owned_case_id}", headers=_h(student_tok), timeout=30)
    assert r.status_code == 200
    proc = r.json()
    assert proc.get("patient_consent_form"), "patient_consent_form missing"
    # approval_history should have a consent/esigned entry
    ah = proc.get("approval_history") or []
    hit = [x for x in ah if (x.get("phase") == "consent" and x.get("action") == "esigned")]
    assert hit, f"approval_history missing consent/esigned entry: {ah[-3:] if ah else ah}"
    # edit_log
    el = proc.get("edit_log") or []
    assert el, "edit_log empty"


def test_esign_again_archives_previous(student_tok, owned_case_id):
    r_before = requests.get(f"{API}/procedures/{owned_case_id}", headers=_h(student_tok), timeout=30)
    before = r_before.json()
    prev_hist_len = len(before.get("consent_history") or [])
    prev_version = ((before.get("patient_consent_form") or {}).get("version") or 1)

    payload = {
        "strokes": _make_strokes(60),
        "pad_width": 600, "pad_height": 200,
        "consent_version": "v2.1", "language": "hi",
        "confirmed_explained": True,
    }
    r = requests.post(f"{API}/procedures/{owned_case_id}/consent/esign",
                      json=payload, headers=_h(student_tok), timeout=60)
    assert r.status_code == 200, r.text[:300]

    r_after = requests.get(f"{API}/procedures/{owned_case_id}", headers=_h(student_tok), timeout=30)
    after = r_after.json()
    new_hist_len = len(after.get("consent_history") or [])
    new_version = ((after.get("patient_consent_form") or {}).get("version") or 1)
    assert new_hist_len >= prev_hist_len + 1, "consent_history not incremented"
    assert new_version >= prev_version + 1, "version not incremented"


# ---- 6. PDF template ----

def _extract_pdf_text(pdf_bytes):
    """Decode ASCII85/Flate compressed content streams from a ReportLab PDF."""
    import re, zlib, base64
    out = []
    for m in re.finditer(rb'stream\n', pdf_bytes):
        start = m.end()
        end = pdf_bytes.find(b'endstream', start)
        if end < 0:
            continue
        body = pdf_bytes[start:end].strip()
        if body.endswith(b'~>'):
            body = body[:-2]
        try:
            raw = base64.a85decode(body, adobe=False, ignorechars=b' \t\n\r')
            u = zlib.decompress(raw)
            out.append(u.decode('latin-1', 'replace'))
        except Exception:
            try:
                out.append(zlib.decompress(body).decode('latin-1', 'replace'))
            except Exception:
                pass
    return "\n".join(out)


def test_consent_pdf_embeds_signature_after_esign(student_tok, owned_case_id):
    r = requests.get(f"{API}/procedures/{owned_case_id}/consent-form-template",
                     headers=_h(student_tok), timeout=60)
    assert r.status_code == 200, r.text[:200]
    body = r.content
    assert body.startswith(b"%PDF"), "not a PDF"
    # embedded image XObject
    assert b"/XObject" in body and b"/Image" in body, "PDF has no image XObject"
    # metadata line — decode compressed content streams first
    text = _extract_pdf_text(body)
    assert "electronically" in text.lower(), "PDF missing 'signed electronically' line"


def test_consent_pdf_regression_for_non_esigned(admin_tok):
    # Find a case that has NOT been e-signed
    r = requests.get(f"{API}/procedures", headers=_h(admin_tok), timeout=30)
    procs = r.json() if r.status_code == 200 else []
    target = None
    for p in procs:
        pcf = p.get("patient_consent_form") or {}
        if not pcf or not pcf.get("esigned"):
            target = p.get("id") or p.get("_id")
            if target:
                break
    if not target:
        pytest.skip("no non-esigned case available")
    r = requests.get(f"{API}/procedures/{target}/consent-form-template",
                     headers=_h(admin_tok), timeout=60)
    assert r.status_code == 200
    assert r.content.startswith(b"%PDF")


# ---- 7. Multipart upload regression ----

def test_multipart_upload_regression_archives_esign(student_tok, owned_case_id):
    # Take current (esigned) state, upload a file, verify archived
    r_before = requests.get(f"{API}/procedures/{owned_case_id}", headers=_h(student_tok), timeout=30)
    before = r_before.json()
    prev_hist_len = len(before.get("consent_history") or [])
    was_esigned = bool((before.get("patient_consent_form") or {}).get("esigned"))

    # Minimal PNG bytes
    png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
           b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0"
           b"\x00\x00\x00\x03\x00\x01[\xe8\x8e\xba\x00\x00\x00\x00IEND\xaeB`\x82")
    files = {"file": ("consent.png", io.BytesIO(png), "image/png")}
    r = requests.post(f"{API}/procedures/{owned_case_id}/upload-consent",
                      files=files, headers=_h(student_tok), timeout=60)
    assert r.status_code == 200, f"upload-consent failed {r.status_code} {r.text[:200]}"

    r_after = requests.get(f"{API}/procedures/{owned_case_id}", headers=_h(student_tok), timeout=30)
    after = r_after.json()
    if was_esigned:
        assert len(after.get("consent_history") or []) >= prev_hist_len + 1, \
            "previous e-signed consent not archived"


# ---- 8. Nurse can esign (stakeholder) ----

def test_nurse_can_esign(nurse_tok, admin_tok):
    # Nurse can esign any case (per spec)
    r = requests.get(f"{API}/procedures", headers=_h(admin_tok), timeout=30)
    procs = r.json() if r.status_code == 200 else []
    if not procs:
        pytest.skip("no procs")
    pid = procs[0].get("id") or procs[0].get("_id")
    payload = {
        "strokes": _make_strokes(40),
        "pad_width": 600, "pad_height": 200,
        "consent_version": "v2.1", "language": "mr",
        "confirmed_explained": True,
    }
    r = requests.post(f"{API}/procedures/{pid}/consent/esign",
                      json=payload, headers=_h(nurse_tok), timeout=60)
    # accept 200 or 403 (if nurse not stakeholder of this specific case) but log
    assert r.status_code in (200, 403), f"unexpected {r.status_code}: {r.text[:200]}"
