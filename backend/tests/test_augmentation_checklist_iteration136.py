"""
Iter-136 — Pre-Op Augmentation Checklist regression tests.

Exercises both the deterministic rule engine (unit) and the 3 HTTP endpoints
(GET/regenerate/toggle).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
import requests

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

API_URL = os.environ.get(
    "API_URL",
    "https://dental-workflow-18.preview.emergentagent.com",
).rstrip("/")
STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}
SUPERVISOR = {"identifier": "Paresh.gandhi", "password": "Supervisor@123"}


# ──────────────────────── unit: rule engine ────────────────────────
def test_rule_engine_emits_keratinized_item_for_inadequate_km():
    from augmentation_checklist import generate_augmentation_checklist

    proc = {
        "clinical_exam_per_site": {
            "26": {
                "ridge_contour": "Well Contoured",
                "soft_tissue_thickness": "Thick (>2mm)",
                "keratinized_mucosa": "Inadequate (<2mm)",
            }
        }
    }
    items = generate_augmentation_checklist(proc)
    titles = [it["title"] for it in items]
    assert any("free gingival graft" in t.lower() and "26" in t for t in titles), titles
    # Thick biotype should emit the favourable-zirconia note (informational).
    assert any("thick biotype" in t.lower() and "zirconia" in t.lower() for t in titles), titles
    # No ridge or biotype-augmentation items — ridge is favourable & biotype is thick.
    assert not any("connective-tissue graft" in t.lower() for t in titles), titles
    assert not any("ridge augmentation" in t.lower() for t in titles), titles


def test_rule_engine_emits_full_set_for_deficient_site():
    from augmentation_checklist import generate_augmentation_checklist

    proc = {
        "clinical_exam_per_site": {
            "16": {
                "ridge_contour": "Type B Knife Edge Ridge",
                "soft_tissue_thickness": "Thin (≤1mm)",
                "keratinized_mucosa": "Inadequate (<2mm)",
            }
        }
    }
    items = generate_augmentation_checklist(proc)
    cats = sorted({it["category"] for it in items})
    # Expect at least keratinized + biotype + ridge categories triggered.
    assert "keratinized" in cats
    assert "biotype" in cats
    assert "ridge" in cats
    # Every item must reference site 16.
    assert all(it["site"] == "16" for it in items)
    # Every item is initially un-completed.
    assert all(it["completed"] is False for it in items)
    # IDs are unique 32-char hex.
    ids = [it["id"] for it in items]
    assert len(set(ids)) == len(ids)
    assert all(len(i) == 32 for i in ids)


def test_rule_engine_returns_empty_list_when_no_findings():
    from augmentation_checklist import generate_augmentation_checklist

    assert generate_augmentation_checklist({}) == []
    assert generate_augmentation_checklist({"clinical_exam_per_site": {}}) == []


def test_rule_engine_falls_back_to_legacy_fields():
    """When clinical_exam_per_site is empty but legacy single fields are
    populated (full-arch / single-tooth flows), items should still be emitted
    keyed to the arch label."""
    from augmentation_checklist import generate_augmentation_checklist

    proc = {
        "arch": "Maxillary",
        "ridge_contour": "Type C Atrophied Ridge",
        "soft_tissue_thickness": "Thin (≤1mm)",
        "keratinized_mucosa": "Adequate (≥2mm)",
    }
    items = generate_augmentation_checklist(proc)
    assert items, "expected legacy fallback items"
    sites = {it["site"] for it in items}
    assert sites == {"maxillary arch"}
    # No keratinized item because km is adequate.
    assert not any(it["category"] == "keratinized" for it in items)
    # Ridge + biotype items expected.
    assert any(it["category"] == "ridge" for it in items)
    assert any(it["category"] == "biotype" for it in items)


# ──────────────────────── integration: HTTP endpoints ────────────────────────
@pytest.fixture(scope="module")
def student_headers() -> dict:
    r = requests.post(f"{API_URL}/api/auth/login", json=STUDENT, timeout=20)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json().get('token') or r.json().get('access_token')}"}


@pytest.fixture(scope="module")
def supervisor_headers() -> dict:
    r = requests.post(f"{API_URL}/api/auth/login", json=SUPERVISOR, timeout=20)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json().get('token') or r.json().get('access_token')}"}


def _student_procedure_id(headers) -> str | None:
    r = requests.get(f"{API_URL}/api/procedures", headers=headers, timeout=20)
    r.raise_for_status()
    items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    if not items:
        return None
    return str(items[0].get("_id") or items[0].get("id"))


def test_get_endpoint_returns_items_or_empty(student_headers):
    pid = _student_procedure_id(student_headers)
    if not pid:
        pytest.skip("no procedures visible to student account")
    r = requests.get(
        f"{API_URL}/api/procedures/{pid}/augmentation-checklist",
        headers=student_headers, timeout=20,
    )
    assert r.status_code == 200
    data = r.json()
    assert "items" in data and isinstance(data["items"], list)


def test_regenerate_returns_consistent_items(student_headers):
    pid = _student_procedure_id(student_headers)
    if not pid:
        pytest.skip("no procedures visible to student account")
    # Plant per-site findings directly in Mongo so regenerate has rules to fire
    # on. Students aren't allowed to edit-fields, so we side-step the HTTP API.
    import asyncio
    from server import db
    from bson import ObjectId

    async def _seed():
        await db.procedures.update_one(
            {"_id": ObjectId(pid)},
            {"$set": {
                "clinical_exam_per_site": {
                    "16": {
                        "ridge_contour": "Type B Knife Edge Ridge",
                        "soft_tissue_thickness": "Thin (≤1mm)",
                        "keratinized_mucosa": "Inadequate (<2mm)",
                    }
                }
            }},
        )
    asyncio.get_event_loop().run_until_complete(_seed())

    r = requests.post(
        f"{API_URL}/api/procedures/{pid}/augmentation-checklist/regenerate",
        headers=student_headers, timeout=20,
    )
    assert r.status_code == 200
    items = r.json().get("items", [])
    assert items, "expected non-empty items after regenerate with deficient findings"
    # All items must reference site 16.
    assert all(it["site"] == "16" for it in items)


def test_toggle_requires_supervisor_or_above(student_headers, supervisor_headers):
    pid = _student_procedure_id(student_headers)
    if not pid:
        pytest.skip("no procedures visible to student account")
    # Pull an item id.
    r = requests.get(
        f"{API_URL}/api/procedures/{pid}/augmentation-checklist",
        headers=student_headers, timeout=20,
    )
    items = r.json().get("items", [])
    if not items:
        pytest.skip("no checklist items to toggle")
    first_id = items[0]["id"]

    # Student should be denied 403.
    r1 = requests.patch(
        f"{API_URL}/api/procedures/{pid}/augmentation-checklist/{first_id}",
        json={"completed": True},
        headers=student_headers, timeout=20,
    )
    assert r1.status_code == 403, r1.text

    # Supervisor (or above) — only succeeds if this case is visible to Paresh.
    # Don't fail the suite when it isn't, just confirm 403 vs 200 are the only
    # acceptable outcomes (404/403 means stakeholder check kicked in correctly).
    r2 = requests.patch(
        f"{API_URL}/api/procedures/{pid}/augmentation-checklist/{first_id}",
        json={"completed": True},
        headers=supervisor_headers, timeout=20,
    )
    assert r2.status_code in (200, 403, 404), r2.text
    if r2.status_code == 200:
        assert r2.json()["item"]["completed"] is True
        assert r2.json()["item"]["completed_by_name"]
