"""Research Module — DICOM import, blinded queue, protocol amendments, visit reminders."""
import io
import os
import time

import numpy as np
import pydicom
import pytest
import requests
from pydicom.dataset import FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian

BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "http://localhost:8001").rstrip("/") + "/api"


def _login(ident, pwd):
    r = requests.post(f"{BASE}/auth/login", json={"identifier": ident, "password": pwd})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def admin():
    return _login("Abhijit.patil", "Admin@123")


def _dicom_bytes(spacing=True):
    fm = FileMetaDataset()
    fm.MediaStorageSOPClassUID = pydicom.uid.generate_uid(); fm.MediaStorageSOPInstanceUID = pydicom.uid.generate_uid()
    fm.TransferSyntaxUID = ExplicitVRLittleEndian
    ds = pydicom.FileDataset("x.dcm", {}, file_meta=fm, preamble=b"\0" * 128)
    ds.Modality = "IO"; ds.Rows = 120; ds.Columns = 160; ds.BitsAllocated = 16; ds.BitsStored = 12; ds.HighBit = 11
    ds.PixelRepresentation = 0; ds.SamplesPerPixel = 1; ds.PhotometricInterpretation = "MONOCHROME2"
    if spacing:
        ds.ImagerPixelSpacing = [0.02, 0.02]
    ds.AcquisitionDate = "20260601"; ds.Manufacturer = "TestVendor"
    ds.PixelData = (np.random.rand(120, 160) * 4000).astype(np.uint16).tobytes()
    b = io.BytesIO(); ds.save_as(b, write_like_original=False)
    return b.getvalue()


@pytest.fixture(scope="module")
def study(admin):
    code = f"T{int(time.time()) % 100000}"
    r = requests.post(f"{BASE}/research/studies", json={"template_id": "cbl_immediate_maxillary_anterior", "code": code, "title": "Amend/DICOM test"}, headers=admin)
    assert r.status_code == 200, r.text
    st = r.json()
    requests.put(f"{BASE}/research/studies/{st['id']}", json={"iec_ref": "IEC/2026/09", "iec_approval_date": "2026-01-15", "consent_form_version": "v1"}, headers=admin)
    r = requests.post(f"{BASE}/research/studies/{st['id']}/status", json={"status": "active"}, headers=admin)
    assert r.status_code == 200, r.text
    yield r.json()
    requests.post(f"{BASE}/research/studies/{st['id']}/status", json={"status": "archived"}, headers=admin)
    from _research_cleanup import purge_study
    purge_study(st["id"])


@pytest.fixture(scope="module")
def enrolment(admin, study):
    sid = study["id"]
    rows = requests.get(f"{BASE}/research/studies/{sid}/candidates?limit=200", headers=admin).json()["rows"]
    cand = rows[0]
    payload = {"procedure_id": cand["procedure_id"], "tooth_number": cand["tooth_number"], "checklist_ticked": [True, True, True], "consent_confirmed": True}
    if cand["decision"] != "eligible":
        payload["override_reason"] = "test override"
    r = requests.post(f"{BASE}/research/studies/{sid}/enrol", json=payload, headers=admin)
    assert r.status_code == 200, r.text
    return r.json()


def test_activation_records_protocol_v1(admin, study):
    st = requests.get(f"{BASE}/research/studies/{study['id']}", headers=admin).json()
    assert st["protocol_version"] == "1.0"
    assert st["protocol_pending_changes"] == []
    assert st["reminders"]["enabled"] is True and st["reminders"]["days_before"] == 3
    r = requests.get(f"{BASE}/research/studies/{study['id']}/amendments", headers=admin)
    assert r.status_code == 200 and r.json()["versions"][0]["version"] == "1.0"


def test_dicom_upload_auto_calibrates_and_measures(admin, study, enrolment):
    eid = enrolment["id"]
    r = requests.post(f"{BASE}/research/enrolments/{eid}/forms/baseline/image", files={"file": ("iopa.dcm", _dicom_bytes(), "application/dicom")}, data={"slot": "iopa"}, headers=admin)
    assert r.status_code == 200, r.text
    asset = next(f for f in r.json()["forms"] if f["timepoint_key"] == "baseline")["images"]["iopa"]
    assert asset["source"] == "dicom" and asset["quality_grade"] == "A"
    assert asset["calibration"]["method"] == "dicom_pixel_spacing" and abs(asset["calibration"]["px_per_mm"] - 50.0) < 1e-6
    assert asset["content_type"] == "image/png" and asset["width"] == 160 and asset["acquisition_date"] == "2026-06-01"
    assert asset["dicom"]["manufacturer"] == "TestVendor"
    # measure without manual calibration: 100 px at 50 px/mm = 2.0 mm
    r = requests.put(f"{BASE}/research/enrolments/{eid}/forms/baseline/image/iopa/measure",
                     json={"measurements": {"bl_mesial": {"p1": [10, 10], "p2": [110, 10]}}, "blinded": True}, headers=admin)
    assert r.status_code == 200, r.text
    base = next(f for f in r.json()["forms"] if f["timepoint_key"] == "baseline")
    assert abs(base["values"]["bl_mesial"] - 2.0) < 1e-6
    assert base["images"]["iopa"]["measurements"]["bl_mesial"]["method"] == "manual_blinded"
    assert base["images"]["iopa"]["quality_grade"] == "A"
    assert base["protocol_version"] == "1.0"


def test_dicom_without_spacing_is_grade_c(admin, study, enrolment):
    eid = enrolment["id"]
    r = requests.post(f"{BASE}/research/enrolments/{eid}/forms/m12/image", files={"file": ("iopa.dcm", _dicom_bytes(spacing=False), "application/octet-stream")}, data={"slot": "iopa"}, headers=admin)
    assert r.status_code == 200, r.text
    asset = next(f for f in r.json()["forms"] if f["timepoint_key"] == "m12")["images"]["iopa"]
    assert asset["source"] == "dicom" and asset["quality_grade"] == "C" and asset["calibration"] is None
    r = requests.put(f"{BASE}/research/enrolments/{eid}/forms/m12/image/iopa/measure", json={"measurements": {"bl_mesial": {"p1": [0, 0], "p2": [50, 0]}}}, headers=admin)
    assert r.status_code == 400


def test_blind_queue(admin, study, enrolment):
    r = requests.get(f"{BASE}/research/studies/{study['id']}/blind-queue", headers=admin)
    assert r.status_code == 200, r.text
    q = r.json()
    assert q["total"] == 2
    labels = [i["blind_label"] for i in q["items"]]
    assert labels == ["Image 01", "Image 02"]
    for it in q["items"]:
        assert "subject_code" not in it and "patient" not in str(it).lower()
        assert it["variables"] and all(v["unit"].lower() == "mm" for v in it["variables"])
    base_item = next(i for i in q["items"] if i["timepoint_key"] == "baseline")
    assert "bl_mesial" not in base_item["pending"] and "bl_distal" in base_item["pending"]
    # stable ordering for the same examiner
    r2 = requests.get(f"{BASE}/research/studies/{study['id']}/blind-queue", headers=admin).json()
    assert [i["timepoint_key"] for i in r2["items"]] == [i["timepoint_key"] for i in q["items"]]


def test_protocol_amendment_flow(admin, study, enrolment):
    sid = study["id"]
    # nothing to publish yet
    r = requests.post(f"{BASE}/research/studies/{sid}/amendments", json={"summary": "x", "rationale": "y"}, headers=admin)
    assert r.status_code == 400
    st = requests.get(f"{BASE}/research/studies/{sid}", headers=admin).json()
    new_var = {"key": "pes_score", "label": "Pink esthetic score", "source": "study", "data_type": "integer", "unit": "", "required": False, "min": 0, "max": 14}
    r = requests.put(f"{BASE}/research/studies/{sid}", json={"variables": st["variables"] + [new_var]}, headers=admin)
    assert r.status_code == 200, r.text
    st = r.json()
    assert any("pes_score" in c for c in st["protocol_pending_changes"])
    # rationale required
    r = requests.post(f"{BASE}/research/studies/{sid}/amendments", json={"summary": "Add PES"}, headers=admin)
    assert r.status_code == 400
    r = requests.post(f"{BASE}/research/studies/{sid}/amendments", json={"summary": "Add PES", "rationale": "Guide asked for an aesthetic outcome", "iec_amendment_ref": "IEC/2026/09-A1"}, headers=admin)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["current_version"] == "1.1" and len(body["versions"]) == 2 and body["pending_changes"] == []
    v11 = body["versions"][1]
    assert v11["summary"] == "Add PES" and any("pes_score" in c for c in v11["changes"]) and v11["iec_amendment_ref"] == "IEC/2026/09-A1"
    assert body["versions"][0]["enrolments"] == 1  # existing enrolment stays on v1.0
    snap = requests.get(f"{BASE}/research/studies/{sid}/amendments/1.0", headers=admin).json()
    assert "pes_score" not in [v["key"] for v in snap["snapshot"]["variables"]]
    # existing form keeps v1.0 even after a new save under v1.1
    r = requests.put(f"{BASE}/research/enrolments/{enrolment['id']}/forms/baseline", json={"action": "save", "values": {"bl_distal": 0.5}}, headers=admin)
    assert r.status_code == 200, r.text
    base = next(f for f in r.json()["forms"] if f["timepoint_key"] == "baseline")
    assert base["protocol_version"] == "1.0"


def test_reminder_settings_and_run(admin, study):
    sid = study["id"]
    r = requests.put(f"{BASE}/research/studies/{sid}", json={"reminders": {"enabled": True, "days_before": 7, "overdue_repeat_days": 14, "notify_guide_overdue": True}}, headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["reminders"] == {"enabled": True, "days_before": 7, "overdue_repeat_days": 14, "notify_guide_overdue": True}
    r = requests.post(f"{BASE}/research/reminders/run", headers=admin)
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["studies"] >= 1 and s["notifications"] >= 0
    # idempotent: second run sends nothing new for the same forms
    s2 = requests.post(f"{BASE}/research/reminders/run", headers=admin).json()
    assert s2["notifications"] == 0 or s2["notifications"] < s["notifications"] or s["notifications"] == 0
    st = requests.get(f"{BASE}/research/studies/{sid}", headers=admin).json()
    assert st.get("last_reminder_run")
    notes = requests.get(f"{BASE}/notifications", headers=admin).json()
    rv = [n for n in notes if n.get("type") == "research_visit"]
    for n in rv[:3]:
        assert n.get("research_enrolment_id") and n.get("timepoint_key")
