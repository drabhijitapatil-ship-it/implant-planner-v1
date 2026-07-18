"""iter-368 — Global D implant systems (In-Kone Universal, 3.0 Implant, twinkone 4).

Validates:
  • /api/implants/systems exposes all three Global D systems with correct
    brand='Global D', system names, and expected diameter/length grids.
  • Indication + features text is present for all three (backend
    `IMPLANT_SYSTEM_DETAILS` dict).
  • Total SKU counts per system match the datasheet:
      In-Kone Universal → 22, 3.0 Implant → 4, twinkone 4 → 2.
"""
import os
import sys
from pathlib import Path
import requests

# Ensure MONGO_URL / DB_NAME env vars are loaded from backend/.env (needed for
# the catalog check that hits Mongo directly, not via API).
sys.path.insert(0, str(Path("/app/backend").resolve()))
from dotenv import load_dotenv
load_dotenv(Path("/app/backend/.env"))

API_URL = os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001"
if not API_URL.endswith("/api"):
    API_URL = API_URL.rstrip("/") + "/api"


def _login():
    r = requests.post(f"{API_URL}/auth/login",
                      json={"identifier": "Abhijit.patil", "password": "Admin@123"},
                      timeout=10)
    r.raise_for_status()
    return r.json()["access_token"]


TOKEN = None


def setup_module(_):
    global TOKEN
    TOKEN = _login()


def _h():
    return {"Authorization": f"Bearer {TOKEN}"}


def _fetch_global_d_systems():
    r = requests.get(f"{API_URL}/implant-library/systems", headers=_h(), timeout=15)
    r.raise_for_status()
    body = r.json()
    # Payload may be {"systems": [...]} or a bare list; handle both.
    systems = body.get("systems", body) if isinstance(body, dict) else body
    return [s for s in systems if s.get("brand") == "Global D"]


def test_all_three_global_d_systems_present():
    gd = _fetch_global_d_systems()
    names = sorted(s["system"] for s in gd)
    assert names == sorted(["In-Kone Universal", "3.0 Implant", "twinkone 4"]), names


def test_in_kone_universal_grid():
    gd = _fetch_global_d_systems()
    ik = next(s for s in gd if s["system"] == "In-Kone Universal")
    assert ik["count"] == 22, ik["count"]
    assert sorted(ik["diameters"]) == [3.5, 4.0, 4.5, 5.0]
    assert min(ik["lengths"]) == 6.0
    assert max(ik["lengths"]) == 15.0


def test_3_0_implant_grid():
    gd = _fetch_global_d_systems()
    row = next(s for s in gd if s["system"] == "3.0 Implant")
    assert row["count"] == 4
    assert row["diameters"] == [3.0]
    assert sorted(row["lengths"]) == [8.5, 10.0, 11.5, 13.0]


def test_twinkone_4_ultra_short_grid():
    gd = _fetch_global_d_systems()
    tk = next(s for s in gd if s["system"] == "twinkone 4")
    assert tk["count"] == 2
    assert sorted(tk["diameters"]) == [4.0, 4.5]
    assert tk["lengths"] == [4.0]


def test_indications_dict_has_all_three():
    """Backend IMPLANT_SYSTEM_DETAILS must expose all three keys so the AI
    Explain Recommendation can enrich its context."""
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path("/app/backend").resolve()))
    from implant_indications import IMPLANT_SYSTEM_DETAILS, get_details

    for system in ("In-Kone Universal", "3.0 Implant", "twinkone 4"):
        details = get_details("Global D", system)
        assert details is not None, f"no details for Global D / {system}"
        assert details.get("indications"), f"empty indications for {system}"
        assert details.get("features"), f"empty features for {system}"

    # Sanity: 3.0 Implant should mention lateral / mandibular incisor
    d3 = get_details("Global D", "3.0 Implant")
    assert "lateral" in d3["indications"].lower() or "incisor" in d3["indications"].lower()

    # twinkone 4 should mention posterior + avoiding sinus/nerve
    dtk = get_details("Global D", "twinkone 4")
    assert "posterior" in dtk["indications"].lower()
    assert "sinus" in dtk["indications"].lower() or "nerve" in dtk["indications"].lower()


def test_catalog_docs_present():
    """implant_catalog docs enrich the Implant Database screen."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient

    async def _run():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        docs = await db.implant_catalog.find({"brand": "Global D"}).to_list(20)
        client.close()
        return docs

    docs = asyncio.run(_run())
    names = sorted(d["name"] for d in docs)
    assert names == sorted(["In-Kone Universal", "3.0 Implant", "twinkone 4"]), names
    for d in docs:
        assert d.get("connection")
        assert d.get("surface") == "SA²"
        assert d.get("material") == "Titanium"
        assert d.get("clinical_indications")


# ── iter-369 — Drilling protocols ──
def test_in_kone_universal_drilling_protocol_d2_shape():
    r = requests.post(
        f"{API_URL}/drilling-protocols/generate",
        headers=_h(),
        json={"brand": "Global D", "system": "In-Kone Universal",
              "diameter": 4.0, "length": 10, "bone_density": "D2"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    steps = body["steps"]
    assert len(steps) == 6  # 5 drills (2.0, 2.4, 2.7, 2.9, 3.2) + placement
    assert steps[0]["drill_type"] == "Marking Drill"
    assert steps[0]["diameter"] == 2.0
    assert steps[-1]["drill_type"] == "Implant Placement"


def test_in_kone_universal_d1_adds_crestal_bone_profiler():
    r = requests.post(
        f"{API_URL}/drilling-protocols/generate",
        headers=_h(),
        json={"brand": "Global D", "system": "In-Kone Universal",
              "diameter": 5.0, "length": 11.5, "bone_density": "D1"},
        timeout=15,
    ).json()
    types = [s["drill_type"] for s in r["steps"]]
    assert "Crestal Bone Profiler (Optional)" in types
    # D1 for Ø5.0 uses the biggest drill (4.9)
    diameters = [s["diameter"] for s in r["steps"] if s["drill_type"].endswith("Drill")]
    assert 4.9 in diameters


def test_3_0_implant_drilling_protocol():
    r = requests.post(
        f"{API_URL}/drilling-protocols/generate",
        headers=_h(),
        json={"brand": "Global D", "system": "3.0 Implant",
              "diameter": 3.0, "length": 10, "bone_density": "D3"},
        timeout=15,
    ).json()
    steps = r["steps"]
    assert len(steps) == 2  # pilot 2.4 + placement (D3 uses only pilot)
    assert steps[0]["diameter"] == 2.4
    assert steps[0]["rpm"] == "1200"
    assert steps[-1]["drill_type"] == "Implant Placement"


def test_twinkone_4_ultra_short_drilling():
    r = requests.post(
        f"{API_URL}/drilling-protocols/generate",
        headers=_h(),
        json={"brand": "Global D", "system": "twinkone 4",
              "diameter": 4.5, "length": 4, "bone_density": "D1"},
        timeout=15,
    ).json()
    steps = r["steps"]
    # D1 Ø4.5: pilot 2.0 + 2.5 + 3.0 + 3.5 + placement = 5 steps
    assert len(steps) == 5
    for s in steps[:-1]:
        assert s.get("note") is None or "4.8" in (s["note"] or "")


def test_all_three_global_d_in_available_list():
    r = requests.get(f"{API_URL}/drilling-protocols/available", headers=_h(), timeout=15)
    assert r.status_code == 200
    payload = r.json()
    if isinstance(payload, dict):
        rows = payload.get("protocols") or payload.get("systems") or []
    else:
        rows = payload
    text = str(rows)
    for sys in ("In-Kone Universal", "3.0 Implant", "twinkone 4"):
        assert sys in text, f"{sys} not present in available protocols"
