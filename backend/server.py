from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Response, Request, Query, Body
from fastapi import status as http_status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse, HTMLResponse
from dotenv import load_dotenv
import io
import csv
import json
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import List, Optional, Dict, Any
import asyncio
from datetime import datetime, timedelta, timezone
import re
from fpdf import FPDF
import bcrypt as _bcrypt_lib
import jwt
from bson import ObjectId
import httpx
from augmentation_checklist import generate_augmentation_checklist
from clinical_rules import evaluate_case as evaluate_clinical_rules
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

ROOT_DIR = Path(__file__).parent
UPLOADS_DIR = ROOT_DIR / 'uploads'
UPLOADS_DIR.mkdir(exist_ok=True)
load_dotenv(ROOT_DIR / '.env')

import s3_storage  # noqa: E402 — after load_dotenv so AWS_* env vars are populated


async def _s3_put_async(local_path: Path, uploads_root: Path = None, content_type: Optional[str] = None) -> None:
    """Fire-and-forget best-effort S3 upload after a local file write. boto3
    is synchronous, so this runs off the event loop thread; failures are
    logged and swallowed — the local write already succeeded and the user's
    upload must not fail because of an S3 hiccup."""
    if not s3_storage.is_configured():
        return
    try:
        await asyncio.to_thread(s3_storage.put_file, local_path, uploads_root or UPLOADS_DIR, content_type)
    except Exception as e:
        logging.warning(f"[s3] async put failed for {local_path}: {e}")


async def _s3_delete_async(local_path: Path, uploads_root: Path = None) -> None:
    """Best-effort S3 delete to match a local unlink() — keeps the bucket
    from accumulating orphaned objects for every deleted document."""
    if not s3_storage.is_configured():
        return
    try:
        await asyncio.to_thread(s3_storage.delete_file, local_path, uploads_root or UPLOADS_DIR)
    except Exception as e:
        logging.warning(f"[s3] async delete failed for {local_path}: {e}")


async def _s3_ensure_local_async(local_path: Path, uploads_root: Path = None) -> bool:
    """Read-path helper: True if the file exists locally already, or was
    just pulled down from S3 to fill a local-disk gap (redeploy wipe, fresh
    instance, etc.) — the actual fix for documents intermittently 404ing."""
    if local_path.exists():
        return True
    if not s3_storage.is_configured():
        return False
    try:
        return await asyncio.to_thread(s3_storage.fetch_to_local, local_path, uploads_root or UPLOADS_DIR)
    except Exception as e:
        logging.warning(f"[s3] async fetch failed for {local_path}: {e}")
        return False

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', '')
if not mongo_url:
    logging.error("MONGO_URL not set! Backend cannot start without a database.")
    raise RuntimeError("MONGO_URL environment variable is required")
logging.info(f"Connecting to MongoDB: {mongo_url[:30]}...")
client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=10000, connectTimeoutMS=10000)
db_name = os.environ.get('DB_NAME', 'test_database')
db = client[db_name]

# Security
security = HTTPBearer()
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    import secrets
    SECRET_KEY = secrets.token_urlsafe(32)
    logging.warning("SECRET_KEY not set in environment, using generated key (not recommended for production)")
ALGORITHM = "HS256"

app = FastAPI()
api_router = APIRouter(prefix="/api")

# --- Rate Limiter (SlowAPI) ---
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# --- Token Blocklist (JWT Session Invalidation) ---
token_blocklist: set = set()

# --- Global Exception Handlers ---
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail, "detail": exc.detail})

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logging.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"error": "Internal server error", "detail": str(exc)})

# --- Input Sanitisation ---
PATIENT_NAME_REGEX = re.compile(r"^[\w\s\-'.À-ÿ]+$")

def sanitize_input(value: str) -> str:
    """Strip whitespace and remove dangerous characters from user input."""
    value = value.strip()
    value = re.sub(r'[<>"\';]', '', value)
    return value

# Health check endpoint for Kubernetes liveness/readiness probes
@app.get("/")
async def health_check():
    return {"status": "ok"}

@app.get("/api/health")
async def api_health_check():
    return {"status": "ok"}

@app.get("/api/health/db-status")
async def db_status():
    """Public diagnostic endpoint — shows implant library and user counts to verify deployment state."""
    implant_count = await db.implant_library.count_documents({})
    system_pairs = await db.implant_library.aggregate([
        {"$group": {"_id": {"brand": "$brand", "system": "$system"}}},
    ]).to_list(500)
    user_count = await db.users.count_documents({})
    return {
        "status": "ok",
        "implant_library": {"total_records": implant_count, "unique_systems": len(system_pairs)},
        "users": {"total": user_count},
        "seed_strategy": "force_reseed_on_every_startup",
    }

@app.get("/api/downloads/implanr-elementor.zip")
async def download_implanr_elementor():
    """Public download of the Implanr Elementor Template Kit (JSON templates)."""
    import os as _os
    zip_path = _os.path.join(_os.path.dirname(__file__), "implanr-elementor-templates.zip")
    if not _os.path.exists(zip_path):
        raise HTTPException(status_code=404, detail="Elementor kit not found on server")
    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename="implanr-elementor-templates.zip",
    )


@app.get("/api/expo-qr")
async def expo_qr():
    import os
    qr_path = os.path.join(os.path.dirname(__file__), "expo-qr.png")
    if os.path.exists(qr_path):
        return FileResponse(qr_path, media_type="image/png")
    raise HTTPException(status_code=404, detail="QR code not found")


# Helper functions
def hash_password(password: str) -> str:
    return _bcrypt_lib.hashpw(password.encode("utf-8"), _bcrypt_lib.gensalt()).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return _bcrypt_lib.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire, "type": "access", "jti": str(uuid.uuid4())})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    to_encode.update({"exp": expire, "type": "refresh", "jti": str(uuid.uuid4())})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# Clinic app uses different role names that map 1-to-1 with college equivalents.
# Normalize at auth time so all existing permission checks work without modification.
# _original_role preserves the actual stored value for API responses and DB writes.
CLINIC_ROLE_MAP: dict = {
    "chief_dentist":    "implant_incharge",
    "dentist":          "supervisor",
    "dental_assistant": "nurse",
}
VALID_ROLES = {
    "student", "supervisor", "implant_incharge", "administrator", "nurse",
    "chief_dentist", "dentist", "dental_assistant",
}

def normalize_role(role: str) -> str:
    return CLINIC_ROLE_MAP.get(role, role)

ORG_WIDE_ROLES = {"administrator", "implant_incharge", "nurse"}


# ── Org-configurable scheduling (Implant In-Charge → Organization Settings) ──
# Three modes for the "Time Slot" picker on case creation:
#   "default" — the original fixed slots (10:00 AM Mon-Sat, 2:00 PM Mon-Fri),
#                Sunday blocked entirely. Exact legacy behaviour.
#   "custom"  — the in-charge defines named time slots per weekday.
#   "open"    — the scheduler picks ANY start time; a slot occupies
#               [start, start + open_window_hours). Conflicts are resolved by
#               range overlap instead of an exact-time match.
# Fields stripped from a procedure document when it's viewed through an
# anonymous Discussion Forum share by anyone other than the case owner,
# assigned supervisor, or implant_incharge/administrator (who always see the
# full case). Shared by forum_get_thread and GET /procedures/{id}.
FORUM_ANONYMOUS_PII_KEYS = (
    # Patient identity + contact + identifiers
    "patient_name", "patient_id", "patient_phone", "patient_email",
    "email", "mobile_number", "age", "sex", "profession",
    "registration_number", "receipt_number", "amount_paid",
    # Signed documents carry the patient's name + signature
    "patient_consent_form", "consent_form",
    # Operator identity (the sharer chose to stay anonymous)
    "student_name", "student_id", "created_by_name", "created_by_id",
    "supervisor_name", "supervisor_id", "instructor_name",
    "implant_incharge_name", "implant_incharge_id",
)

DEFAULT_SCHEDULING_CONFIG: Dict[str, Any] = {
    "mode": "default",
    "custom_slots": [],       # [{"time": "HH:MM", "label": str, "days": ["Mon", ...]}]
    "open_window_hours": 2.0,
}
_WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']


async def _get_org_scheduling_config(org_id: Optional[str]) -> Dict[str, Any]:
    """Fetch the caller's org scheduling config, filled in with defaults for
    any field the org hasn't set (or has no scheduling_config at all — every
    org created before this feature shipped defaults to "default" mode, i.e.
    zero behavior change until an in-charge opts into custom/open)."""
    if not org_id:
        return dict(DEFAULT_SCHEDULING_CONFIG)
    try:
        org = await db.organizations.find_one({"_id": ObjectId(org_id)}, {"scheduling_config": 1})
    except Exception:
        return dict(DEFAULT_SCHEDULING_CONFIG)
    if not org or not org.get("scheduling_config"):
        return dict(DEFAULT_SCHEDULING_CONFIG)
    return {**DEFAULT_SCHEDULING_CONFIG, **org["scheduling_config"]}


async def _org_member_ids(org_id: Optional[str]) -> List[str]:
    """All user _id strings (as strings) belonging to this org. Empty org_id -> empty list."""
    if not org_id:
        return []
    ids = await db.users.distinct("_id", {"org_id": org_id})
    return [str(i) for i in ids]


async def _org_scope_match(current_user: dict) -> Dict[str, Any]:
    """Mongo $match restricting a procedures query to the caller's org (derived from the
    linked student/supervisor/creator, since procedures don't store org_id directly).
    super_admin is platform-wide and gets an empty filter — i.e. no restriction."""
    if current_user.get("is_super_admin"):
        return {}
    org_member_ids = await _org_member_ids(current_user.get("org_id"))
    return {"$or": [
        {"student_id": {"$in": org_member_ids}},
        {"supervisor_id": {"$in": org_member_ids}},
        {"created_by_id": {"$in": org_member_ids}},
    ]}


async def _assert_procedure_org_access(proc: dict, current_user: dict) -> None:
    """Cross-tenant guard for single-procedure endpoints. Procedures don't store org_id
    directly, so org membership is derived from the linked student/supervisor/creator.
    Only org-wide roles need this check — student/supervisor self-scoped access is already
    enforced by each endpoint's own identity checks and can't cross orgs."""
    if current_user.get("is_super_admin"):
        return
    role = current_user.get("role")
    if role not in ORG_WIDE_ROLES:
        return
    org_id = current_user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=403, detail="Your account is not linked to an organization")
    owner_ids = [proc.get("student_id"), proc.get("supervisor_id"), proc.get("created_by_id")]
    valid_oids = [ObjectId(o) for o in owner_ids if o and ObjectId.is_valid(o)]
    if not valid_oids:
        raise HTTPException(status_code=403, detail="Cannot access procedures outside your organization")
    match = await db.users.find_one({"_id": {"$in": valid_oids}, "org_id": org_id})
    if not match:
        raise HTTPException(status_code=403, detail="Cannot access procedures outside your organization")


async def _get_procedure_org_name(procedure: dict) -> Optional[str]:
    """Reverse lookup: procedures don't store org_id, so derive the owning
    organization's name via whichever linked user (student/supervisor/creator)
    has one. Used for letterheads on generated documents (consent form, etc.)."""
    owner_ids = [procedure.get("student_id"), procedure.get("supervisor_id"), procedure.get("created_by_id")]
    valid_oids = [ObjectId(o) for o in owner_ids if o and ObjectId.is_valid(o)]
    if not valid_oids:
        return None
    user = await db.users.find_one({"_id": {"$in": valid_oids}, "org_id": {"$exists": True, "$ne": None}}, {"org_id": 1})
    if not user or not user.get("org_id"):
        return None
    try:
        org = await db.organizations.find_one({"_id": ObjectId(user["org_id"])}, {"name": 1})
    except Exception:
        return None
    return org.get("name") if org else None


async def _get_procedure_org_branding(procedure: dict) -> dict:
    """Org letterhead for generated documents: {'name': str|None, 'logo_bytes': bytes|None}.
    Same reverse lookup as _get_procedure_org_name; also decodes the org logo
    (stored as a base64 data URI via PUT /organizations/me/logo) to raw bytes
    ready for FPDF / reportlab image embedding."""
    empty = {"name": None, "logo_bytes": None}
    owner_ids = [procedure.get("student_id"), procedure.get("supervisor_id"), procedure.get("created_by_id")]
    valid_oids = [ObjectId(o) for o in owner_ids if o and ObjectId.is_valid(o)]
    if not valid_oids:
        return empty
    user = await db.users.find_one({"_id": {"$in": valid_oids}, "org_id": {"$exists": True, "$ne": None}}, {"org_id": 1})
    if not user or not user.get("org_id"):
        return empty
    try:
        org = await db.organizations.find_one({"_id": ObjectId(user["org_id"])}, {"name": 1, "logo": 1})
    except Exception:
        return empty
    if not org:
        return empty
    logo_bytes = None
    logo = org.get("logo") or ""
    if isinstance(logo, str) and logo.startswith("data:image"):
        try:
            import base64 as _brand_b64
            logo_bytes = _brand_b64.b64decode(logo.split(",", 1)[1])
        except Exception:
            logo_bytes = None
    return {"name": org.get("name"), "logo_bytes": logo_bytes}


def _fpdf_org_letterhead(pdf, branding: dict, safe) -> None:
    """Draw centered org logo + name at the top of the current FPDF page."""
    if branding.get("logo_bytes"):
        try:
            logo_h = 22
            pdf.image(io.BytesIO(branding["logo_bytes"]), x=pdf.w / 2 - logo_h / 2, y=pdf.get_y(), h=logo_h)
            pdf.set_y(pdf.get_y() + logo_h + 2)
        except Exception:
            pass  # corrupt/unsupported image — skip the logo, keep the name
    if branding.get("name"):
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_text_color(38, 50, 56)
        pdf.cell(0, 8, safe(branding["name"]), ln=True, align="C")
        pdf.set_text_color(0, 0, 0)
        pdf.ln(2)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        # Check if token is blocklisted (logout invalidation)
        jti = payload.get("jti")
        if jti and jti in token_blocklist:
            raise HTTPException(status_code=401, detail="Token has been revoked")
        # Only accept access tokens (not refresh tokens)
        token_type = payload.get("type")
        if token_type not in ("access", None):
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"_id": ObjectId(user_id)}, {"password_hash": 0})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        user["_id"] = str(user["_id"])
        user["_original_role"] = user.get("role", "")
        # super_admin is a platform-wide role with no org_id of its own. It is never
        # granted through any user-editable path (invite / create-user / edit-user all
        # validate role against COLLEGE_ROLES/CLINIC_ROLES, which deliberately exclude
        # it) — only provisioned via the seed script. Rather than threading a
        # super_admin branch through every permission check in the file, it's remapped
        # to "administrator" here (the existing ceiling of in-app capability) and
        # flagged via is_super_admin, which the org-scoping helpers check to bypass
        # the org boundary specifically.
        if user.get("role") == "super_admin":
            user["is_super_admin"] = True
            user["role"] = "administrator"
        else:
            user["is_super_admin"] = False
            user["role"] = normalize_role(user.get("role", ""))
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user_optional(request: Request):
    """Like get_current_user but returns None instead of raising on failure."""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        return None
    try:
        token_str = auth.split(" ", 1)[1]
        payload = jwt.decode(token_str, SECRET_KEY, algorithms=[ALGORITHM])
        jti = payload.get("jti")
        if jti and jti in token_blocklist:
            return None
        token_type = payload.get("type")
        if token_type not in ("access", None):
            return None
        user_id = payload.get("user_id")
        if not user_id:
            return None
        user = await db.users.find_one({"_id": ObjectId(user_id)}, {"password_hash": 0})
        if user:
            user["_id"] = str(user["_id"])
            user["_original_role"] = user.get("role", "")
            user["role"] = normalize_role(user.get("role", ""))
        return user
    except Exception:
        return None


# Models
class UserRegister(BaseModel):
    name: str = Field(..., max_length=100)
    email: EmailStr = Field(..., max_length=255)
    password: str = Field(..., max_length=128)
    role: str = Field(..., max_length=30)

    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return sanitize_input(v)

class UserLogin(BaseModel):
    identifier: Optional[str] = Field(None, max_length=255)  # preferred: email or username
    email: Optional[str] = Field(None, max_length=255)  # backward compat: old clients send 'email'
    password: str = Field(..., max_length=128)

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    profile_photo: Optional[str] = None
    org_id: Optional[str] = None
    org_type: Optional[str] = None
    org_name: Optional[str] = None
    # Timestamp when the user dismissed the first-login onboarding + workflow help.
    # Null means they haven't seen it yet → frontend routes them through onboarding.
    workflow_seen_at: Optional[datetime] = None
    # Version of the onboarding/help content the user has acknowledged.
    # When ONBOARDING_VERSION on the client > this value, onboarding re-fires
    # so existing users see new feature slides on major content updates.
    workflow_seen_version: Optional[int] = 0
    # Latest "What's new" version the user has acknowledged. Null means they
    # haven't seen any → frontend shows the most-recent changelog entry before
    # routing to dashboard. Bumped by POST /api/whatsnew/ack.
    last_seen_whatsnew_version: Optional[str] = None

class ChecklistItem(BaseModel):
    id: Optional[str] = None
    label: str
    value: Optional[bool] = None

class ChecklistSection(BaseModel):
    items: List[ChecklistItem]
    additional_fields: Optional[Dict[str, str]] = {}

class Checklist(BaseModel):
    pre_surgical: Optional[ChecklistSection] = None
    surgical: Optional[ChecklistSection] = None

# ── iter-211: New-Case-with-Existing-Implants flow ────────────────────────
# Captures patients who walk in with implants already placed and need a fresh
# prosthetic plan (Path A — replace prosthesis only). Unlike fresh cases, the
# surgical phases (1-3) are skipped and the case lands directly in the Phase 4
# Step 1 inbox. Failure-analysis lets the prosthodontist record WHY the
# previous restoration failed so the new design avoids the same trap.

class ExistingImplant(BaseModel):
    """One row of the existing-implant inventory. Tooth # is mandatory; the
    rest are optional so cases where the patient genuinely doesn't know the
    system (transferred, foreign treatment, lost paperwork) can still be
    booked. The Lab Slip prints "system unknown — verify clinically" when
    `system_unknown` is true."""
    tooth: str = Field(..., max_length=8)
    system_unknown: bool = False
    brand: Optional[str] = Field(None, max_length=100)
    system: Optional[str] = Field(None, max_length=100)
    connection_type: Optional[str] = Field(None, max_length=80)
    platform: Optional[str] = Field(None, max_length=40)
    diameter_mm: Optional[float] = None
    length_mm: Optional[float] = None
    gingival_height_mm: Optional[float] = None
    surgery_date: Optional[str] = Field(None, max_length=30)
    original_surgeon: Optional[str] = Field(None, max_length=120)
    abutment_present: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=500)
    # iter-213: Present Prosthetic Component already in the mouth at intake.
    # Drives the next-phase logic (e.g. healing-abutment-only ⇒ Phase 3
    # ISQ + swap; final or MUA ⇒ Phase 4 Step 1 directly).
    present_component: Optional[str] = Field(None, max_length=40)  # 'None' | 'Healing Abutment' | 'Final Abutment' | 'Multi-Unit Abutment'
    present_component_gh: Optional[float] = None
    present_component_angle: Optional[float] = None
    iopa_url: Optional[str] = Field(None, max_length=500)


class ProsthesisHistory(BaseModel):
    """If the patient ever had a prosthesis, what was it and why did it
    fail (if it did). All chip arrays use a controlled vocabulary so the data
    stays queryable for analytics + AI re-design recommendations."""
    had_prosthesis: bool = False
    # iter-213: Temporary vs Final flag drives downstream phase decisions
    # (a temporary in place still warrants a Phase 4 Step 1 plan;
    # a failed final demands either Phase 3 evaluation first or a fresh
    # Phase 4 plan depending on operator judgement).
    prosthesis_stage: Optional[str] = Field(None, max_length=20)  # 'temporary' | 'final'
    prosthesis_type: Optional[str] = Field(None, max_length=80)
    material: Optional[str] = Field(None, max_length=80)
    placement_date: Optional[str] = Field(None, max_length=30)
    lab_name: Optional[str] = Field(None, max_length=120)
    failed: bool = False
    failure_categories: List[str] = Field(default_factory=list)
    failure_modes: List[str] = Field(default_factory=list)
    suspected_root_causes: List[str] = Field(default_factory=list)
    failure_narrative: Optional[str] = Field(None, max_length=500)
    attachments: List[str] = Field(default_factory=list)


class RadiographsBlock(BaseModel):
    """iter-213 radiograph upload set. For non-full-arch we keep one IOPA per
    implant (positionally aligned with `existing_implants`); full-arch uses
    a single OPG."""
    opg_url: Optional[str] = None
    iopas: List[Optional[str]] = Field(default_factory=list)


class ProcedureCreateExistingImplants(BaseModel):
    """Lean creation payload for the existing-implants flow.

    No surgical scheduling, no implant-procedure-type, no loading-type — the
    surgery happened elsewhere. Only the prosthodontic appointment slot
    matters. Phases 1-3 are stamped as skipped per `phase_to_start`."""
    student_name: Optional[str] = Field("", max_length=100)
    patient_name: str = Field(..., max_length=100)
    age: Optional[str] = Field("", max_length=5)
    sex: Optional[str] = Field("", max_length=10)
    profession: Optional[str] = Field("", max_length=100)
    mobile_number: Optional[str] = Field("", max_length=20)
    patient_email: Optional[str] = Field("", max_length=255)
    registration_number: str = Field(..., max_length=50)
    chief_complaint: Optional[str] = Field("", max_length=1000)
    supervisor_id: str = Field(..., max_length=50)
    supervisor_name: str = Field(..., max_length=100)
    implant_incharge_id: str = Field(..., max_length=50)
    implant_incharge_name: str = Field(..., max_length=100)
    receipt_number: str = Field(..., max_length=50)
    amount_paid: float
    procedure_date: str = Field(..., max_length=30)
    procedure_time: str = Field(..., max_length=20)
    existing_implants: List[ExistingImplant] = Field(..., min_length=1)
    prosthesis_history: ProsthesisHistory = Field(default_factory=ProsthesisHistory)
    # iter-213: original procedure that placed these implants (e.g. "All on 4")
    original_procedure_type: Optional[str] = Field(None, max_length=80)
    radiographs: Optional[RadiographsBlock] = None
    # iter-213: routing — 'phase3' (Phase 1+2 pre-stamped, ISQ check pending),
    # 'phase4_step1' (Phase 1+2+3 pre-stamped, ready for prosthetic plan —
    # default and the iter-211 behaviour), or 'draft' (saved but not routed).
    phase_to_start: Optional[str] = Field("phase4_step1", max_length=20)
    remark: Optional[str] = Field("", max_length=1000)
    # iter-222: when set, update the existing procedure in-place instead of
    # creating a new one (used by the draft-resume flow in new-procedure.tsx).
    procedure_id: Optional[str] = Field(None, max_length=64)


class ProcedureCreate(BaseModel):
    student_name: Optional[str] = Field("", max_length=100)
    patient_name: str = Field(..., max_length=100)
    age: Optional[str] = Field("", max_length=5)
    sex: Optional[str] = Field("", max_length=10)
    profession: Optional[str] = Field("", max_length=100)
    mobile_number: Optional[str] = Field("", max_length=20)
    patient_email: Optional[str] = Field("", max_length=255)
    registration_number: str = Field(..., max_length=50)
    chief_complaint: Optional[str] = Field("", max_length=1000)
    periodontal_status: Optional[str] = Field("", max_length=20)
    teeth_present: Optional[List[str]] = Field(default_factory=list)
    # New: teeth marked RED on the FDI chart in Phase 1 Step 1.
    # - Healed-edentulous procedures (Conventional Single/Multiple, GBR, Guided Surgery):
    #   missing_teeth == teeth that will receive an implant on already-missing sites.
    # - Extract-and-place procedures (Immediate Implant, PET):
    #   missing_teeth == teeth present now but will be extracted in Phase 2.
    # When present, `teeth_present` is auto-derived server-side (all 32 FDI codes minus missing_teeth).
    missing_teeth: Optional[List[str]] = Field(default_factory=list)
    supervisor_id: str = Field(..., max_length=50)
    supervisor_name: str = Field(..., max_length=100)
    implant_incharge_id: str = Field(..., max_length=50)
    implant_incharge_name: str = Field(..., max_length=100)
    receipt_number: str = Field(..., max_length=50)
    amount_paid: float
    procedure_date: str = Field(..., max_length=30)
    procedure_time: str = Field(..., max_length=20)
    implant_procedure_type: str = Field(..., max_length=100)
    num_implants: Optional[str] = Field("", max_length=50)
    sinus_lift_type: Optional[str] = Field("", max_length=50)
    bone_graft_material_details: Optional[str] = Field("", max_length=200)
    loading_type: List[str] = []
    prosthetic_plan: str = Field("", max_length=500)
    prosthetic_plan_other: Optional[str] = Field("", max_length=500)
    bone_graft_specifications: Optional[str] = Field("", max_length=500)
    checklist: Optional[Checklist] = None
    implant_site: Optional[str] = Field("", max_length=50)
    implant_region: Optional[str] = Field("", max_length=50)
    implant_company: Optional[str] = Field("", max_length=100)
    remark: Optional[str] = Field("", max_length=1000)
    # Arch selection (Full Arch only)
    arch: Optional[str] = Field("", max_length=20)
    # Clinical Examination — Intraoral
    edentulous_site: Optional[str] = Field("", max_length=200)
    edentulous_sites: Optional[List[str]] = None
    occlusocervical_height: Optional[str] = Field("", max_length=10)
    mesiodistal_space: Optional[str] = Field("", max_length=10)
    # Per-tooth Edentulous-site measurements (keyed by FDI code) — used when 2+ teeth
    # are marked missing. Structure: { "16": { "oc": 7.5, "md": 9.0 }, "17": {...} }.
    edentulous_site_measurements: Optional[Dict[str, Dict[str, Any]]] = None
    # Per-cluster intraoral findings (keyed by cluster-leader FDI code) — used when 2+ teeth
    # are missing and procedure != Single Conventional Implant.
    # Structure: { "35": { "ridge_contour": "Oval", "soft_tissue_thickness": "Thick", "keratinized_mucosa": ">2mm" } }
    clinical_exam_per_site: Optional[Dict[str, Dict[str, Any]]] = None
    arch_condition: Optional[str] = Field("", max_length=50)
    ridge_contour: Optional[str] = Field("", max_length=50)
    soft_tissue_thickness: Optional[str] = Field("", max_length=20)
    keratinized_mucosa: Optional[str] = Field("", max_length=20)
    # Occlusal Analysis (non-full-arch)
    occlusal_scheme: Optional[str] = Field("", max_length=50)
    parafunction_habit: Optional[str] = Field("", max_length=20)
    vertical_dimension: Optional[str] = Field("", max_length=50)
    opposing_dentition: Optional[str] = Field("", max_length=20)
    # Occlusal Analysis (full-arch)
    vertical_dimension_mm: Optional[str] = Field("", max_length=20)
    available_interarch_space: Optional[str] = Field("", max_length=20)
    opposing_arch: Optional[str] = Field("", max_length=50)
    tmj: Optional[str] = Field("", max_length=30)
    # Aesthetic Risk Assessment
    smile_line: Optional[str] = Field("", max_length=30)
    gingival_biotype: Optional[str] = Field("", max_length=20)
    # Medical Assessment
    medical_assessment: Optional[Dict[str, str]] = None
    medical_risk_level: Optional[str] = Field("", max_length=30)
    # CBCT Report (uploaded via /uploads/cbct-temp)
    cbct_file: Optional[str] = Field("", max_length=200)
    cbct_original_name: Optional[str] = Field("", max_length=300)
    cbct_content_type: Optional[str] = Field("", max_length=100)
    # Multiple CBCT files (new format)
    cbct_files: Optional[List[Dict[str, str]]] = None  # [{filename, original_name, content_type}]
    # Patient Consent Form (uploaded via /uploads/consent-temp or POST /procedures/{id}/upload-consent)
    patient_consent_form: Optional[Dict[str, Any]] = None  # {filename, original_name, content_type, uploaded_by_*, uploaded_at, version}

    @field_validator('patient_name')
    @classmethod
    def validate_patient_name(cls, v: str) -> str:
        v = sanitize_input(v)
        if not PATIENT_NAME_REGEX.match(v):
            raise ValueError("Patient name contains invalid characters")
        return v

    @field_validator('student_name', 'supervisor_name', 'implant_incharge_name')
    @classmethod
    def sanitize_names(cls, v: str) -> str:
        if v:
            return sanitize_input(v)
        return v

    @field_validator('registration_number', 'receipt_number', 'prosthetic_plan', 'bone_graft_specifications', 'remark')
    @classmethod
    def sanitize_text_fields(cls, v: str) -> str:
        if v:
            return sanitize_input(v)
        return v

class ProcedureUpdate(BaseModel):
    patient_name: Optional[str] = Field(None, max_length=100)
    age: Optional[str] = Field(None, max_length=5)
    sex: Optional[str] = Field(None, max_length=10)
    profession: Optional[str] = Field(None, max_length=100)
    mobile_number: Optional[str] = Field(None, max_length=20)
    patient_email: Optional[str] = Field(None, max_length=255)
    registration_number: Optional[str] = Field(None, max_length=50)
    chief_complaint: Optional[str] = Field(None, max_length=1000)
    teeth_present: Optional[List[str]] = None
    missing_teeth: Optional[List[str]] = None
    edentulous_site_measurements: Optional[Dict[str, Dict[str, Any]]] = None
    clinical_exam_per_site: Optional[Dict[str, Dict[str, Any]]] = None
    supervisor_id: Optional[str] = Field(None, max_length=50)
    supervisor_name: Optional[str] = Field(None, max_length=100)
    implant_incharge_id: Optional[str] = Field(None, max_length=50)
    implant_incharge_name: Optional[str] = Field(None, max_length=100)
    receipt_number: Optional[str] = Field(None, max_length=50)
    amount_paid: Optional[float] = None
    procedure_date: Optional[str] = Field(None, max_length=30)
    procedure_time: Optional[str] = Field(None, max_length=20)
    implant_procedure_type: Optional[str] = Field(None, max_length=100)
    num_implants: Optional[str] = Field(None, max_length=50)
    loading_type: Optional[List[str]] = None
    prosthetic_plan: Optional[str] = Field(None, max_length=500)
    bone_graft_specifications: Optional[str] = Field(None, max_length=500)
    checklist: Optional[Checklist] = None
    implant_site: Optional[str] = Field(None, max_length=50)
    implant_region: Optional[str] = Field(None, max_length=50)
    implant_company: Optional[str] = Field(None, max_length=100)
    remark: Optional[str] = Field(None, max_length=1000)
    status: Optional[str] = Field(None, max_length=50)
    edentulous_sites: Optional[List[str]] = None
    occlusocervical_height: Optional[str] = Field(None, max_length=10)
    mesiodistal_space: Optional[str] = Field(None, max_length=10)
    available_interarch_space: Optional[str] = Field(None, max_length=20)
    opposing_arch: Optional[str] = Field(None, max_length=50)
    arch_condition: Optional[str] = Field(None, max_length=50)
    # Phase 1 default-prosthesis suggestion captured when the student confirms a
    # 3-unit implant-supported bridge from the clinical-correlation prompt.
    bridge_design: Optional[str] = Field(None, max_length=200)
    bridge_material: Optional[str] = Field(None, max_length=80)
    bridge_pontics: Optional[List[str]] = None
    bridge_implants: Optional[List[str]] = None

    @field_validator('patient_name')
    @classmethod
    def validate_patient_name(cls, v):
        if v is not None:
            v = sanitize_input(v)
            if not PATIENT_NAME_REGEX.match(v):
                raise ValueError("Patient name contains invalid characters")
        return v

    @field_validator('supervisor_name', 'implant_incharge_name', 'registration_number', 'receipt_number', 'prosthetic_plan', 'bone_graft_specifications', 'remark')
    @classmethod
    def sanitize_optional_text(cls, v):
        if v is not None:
            return sanitize_input(v)
        return v

class ApprovalAction(BaseModel):
    action: str = Field(..., max_length=20)  # approve or reject
    rejection_reason: Optional[str] = Field(None, max_length=1000)
    rejection_type: Optional[str] = Field(None, max_length=20)  # "permanent" or "reconsider"
    comment: Optional[str] = Field(None, max_length=2000)

    @field_validator('rejection_reason')
    @classmethod
    def sanitize_reason(cls, v):
        if v is not None:
            return sanitize_input(v)
        return v

    @field_validator('comment')
    @classmethod
    def sanitize_comment_field(cls, v):
        if v is not None:
            return sanitize_input(v)
        return v

class Phase2Submit(BaseModel):
    # Pre-surgery checklist (legacy; iter-189 splits this into a separate
    # phase2_preop submission that must complete before surgical fields are sent)
    pre_surgery_checklist: Optional[Dict[str, bool]] = None
    # Surgical procedure data
    anesthesia_adequate: Optional[str] = Field("Yes", max_length=10)  # Yes/No
    anesthesia_details: Optional[str] = Field(None, max_length=500)  # If No
    flap_design: Optional[str] = Field(None, max_length=100)
    drilling_type: Optional[str] = Field(None, max_length=100)
    implant_seated_correctly: Optional[bool] = True
    implant_seated_comment: Optional[str] = Field(None, max_length=500)
    torque_values: Optional[List[float]] = None
    bone_graft_used: Optional[bool] = False
    bone_graft_details: Optional[str] = Field(None, max_length=1000)
    implant_other_notes: Optional[str] = Field(None, max_length=500)
    prosthetic_component: Optional[str] = Field(None, max_length=100)
    # Prosthesis Type chosen when prosthetic_component == 'Immediate Loading Done'.
    # Options are gated on the client based on Phase 1 procedure_type + teeth count.
    prosthesis_type: Optional[str] = Field(None, max_length=200)
    prosthesis_type_other: Optional[str] = Field(None, max_length=500)
    healing_abutment_cuff_height: Optional[Any] = None  # str or list of str (per implant)
    access_channel_openings: Optional[List[str]] = None  # per-implant access-channel observations (Immediate Loading Done)
    # iter-139: Multi-unit Abutment capture for full-arch Immediate Loading cases.
    multi_unit_abutment_placed: Optional[str] = Field(None, max_length=10)  # 'yes' | 'no' | None
    multi_unit_abutment_details: Optional[List[Dict[str, Any]]] = None  # [{tooth, angulation, cuff_height}]
    sutures_placed: Optional[bool] = True
    hemostasis_achieved: Optional[bool] = True
    # Post-surgical radiograph uploads
    iopa_files: Optional[List[Dict[str, str]]] = None  # [{filename, original_name, tooth_label}]
    opg_file: Optional[Dict[str, str]] = None  # {filename, original_name} — full arch only
    # Post-operative checklist
    post_op_checklist: Optional[Dict[str, bool]] = None
    # Notes
    student_notes: Optional[str] = Field(None, max_length=2000)
    supervisor_notes: Optional[str] = Field(None, max_length=2000)
    incharge_notes: Optional[str] = Field(None, max_length=2000)
    # Legacy fields
    checklist_surgical: Optional[ChecklistSection] = None
    remark: Optional[str] = None

class Phase2PreOpSubmit(BaseModel):
    # iter-189: Pre-Surgical Checklist as a separate, day-of submission.
    # Items keyed by `id` from CHECKLIST_DATA.surgical.sections — only
    # mandatory items are enforced server-side.
    items: Dict[str, bool]
    notes: Optional[str] = Field(None, max_length=2000)

class Stage2SurgicalSubmit(BaseModel):
    # Second Stage checklist items
    checklist_items: Optional[Dict[str, bool]] = None
    # Additional data fields
    isq_value: Optional[Any] = None  # str or list of str (per implant)
    healing_abutment_height: Optional[Any] = None  # str or list of str (per implant)
    # Post-surgical radiograph uploads
    iopa_files: Optional[List[Dict[str, str]]] = None  # [{filename, original_name, tooth_label}]
    # Notes
    student_notes: Optional[str] = Field(None, max_length=2000)
    supervisor_notes: Optional[str] = Field(None, max_length=2000)
    incharge_notes: Optional[str] = Field(None, max_length=2000)
    # Legacy
    checklist: Optional[ChecklistSection] = None
    remark: Optional[str] = None

class Stage2ProstheticSubmit(BaseModel):
    # Step 1: Final Prosthesis + Impressions
    final_prosthetic_plan: Optional[str] = Field(None, max_length=500)
    prosthetic_material: Optional[str] = Field(None, max_length=200)
    custom_abutment: Optional[str] = Field(None, max_length=200)
    overdenture_attachment: Optional[str] = Field(None, max_length=200)
    payment_complete: Optional[bool] = False
    components_available: Optional[bool] = False
    impression_type: Optional[str] = Field(None, max_length=100)  # intraoral_scans / conventional
    # iter-191: tray sub-choice required when impression_type == 'conventional'.
    # Validated in submit_stage2_prosthetic; stored alongside impression_type.
    conventional_tray_type: Optional[str] = Field(None, max_length=20)  # open_tray / closed_tray
    # iter-192: impression material — required when impression_type == 'conventional'.
    # One of: polyether / heavy_light_body / putty_light_body.
    impression_material: Optional[str] = Field(None, max_length=30)
    # iter-194: shade selection (mandatory; per-implant or anterior+posterior).
    shade_values: Optional[List[str]] = None
    shade_notes: Optional[str] = Field(None, max_length=2000)
    shade_layout: Optional[str] = Field(None, max_length=20)  # 'per_implant' | 'full_arch'
    # iter-210: optional Multi-Unit Abutment override entered at delivery.
    # When present (and non-empty), the Lab Slip + case-detail readback
    # prefer this over the Phase-2 capture so the prosthodontist can
    # revise angulation / cuff height after soft-tissue remodelling.
    # Each row: {"tooth": "...", "angulation": "...", "cuff_height": "..."}.
    multi_unit_abutment_details: Optional[List[Dict[str, Any]]] = None
    # Notes
    student_notes: Optional[str] = Field(None, max_length=2000)
    # Legacy
    checklist: Optional[ChecklistSection] = None
    remark: Optional[str] = None
    faculty_remark: Optional[str] = None
    incharge_remark: Optional[str] = None

class Phase4Step2Submit(BaseModel):
    # Step 2: Trial & Delivery
    trial_checklist: Optional[Dict[str, bool]] = None
    student_notes: Optional[str] = Field(None, max_length=2000)
    supervisor_notes: Optional[str] = Field(None, max_length=2000)
    incharge_notes: Optional[str] = Field(None, max_length=2000)
    confirmation_statement: Optional[bool] = False
    # Per-implant IOPA uploads (non-full-arch) — keyed by tooth position
    iopa_uploads: Optional[Dict[str, Dict[str, str]]] = None
    # Single OPG upload for full-arch cases
    opg_upload: Optional[Dict[str, str]] = None
    # Final intraoral prosthesis photos with editable labels
    prosthesis_photos: Optional[List[Dict[str, str]]] = None

class ImplantPlanItem(BaseModel):
    position: str  # FDI tooth number e.g. "14"
    brand: str
    system: str
    diameter: float
    length: float
    bone_width: Optional[float] = None
    bone_height: Optional[float] = None
    bone_type: Optional[str] = None
    risk_level: Optional[str] = None
    risk_score: Optional[int] = None

class ImplantPlanSave(BaseModel):
    implants: List[ImplantPlanItem]


class FinalCommentSubmit(BaseModel):
    comment: str = Field(..., max_length=2000)

    @field_validator('comment')
    @classmethod
    def sanitize_comment(cls, v: str) -> str:
        return sanitize_input(v)

class NotificationResponse(BaseModel):
    id: str
    procedure_id: str
    message: str
    type: str
    read: bool
    created_at: str
    procedure_details: Optional[Dict[str, Any]] = None

class PushTokenRegister(BaseModel):
    push_token: str = Field(..., max_length=255)


# Helper to notify the case creator about rejection
async def notify_rejection(procedure: dict, procedure_id: str, phase_label: str, rejection_type: str, rejection_reason: str, rejected_by: str):
    """Send rejection notification to the case creator (student or faculty who created it)."""
    type_label = "permanently rejected" if rejection_type == "permanent" else "rejected with consideration"
    
    # Determine the case creator to notify
    notify_ids = []
    creator_id = procedure.get("student_id") or procedure.get("created_by_id")
    if creator_id:
        notify_ids.append(creator_id)
    
    # Also notify the other approver
    other_ids = [procedure.get("implant_incharge_id"), procedure.get("supervisor_id")]
    
    for uid in notify_ids:
        if uid:
            await db.notifications.insert_one({
                "user_id": uid,
                "procedure_id": procedure_id,
                "message": f"{phase_label}: Case {type_label} by {rejected_by}. Reason: {rejection_reason}",
                "type": "rejected",
                "read": False,
                "created_at": datetime.utcnow()
            })
    
    for uid in other_ids:
        if uid and uid != creator_id:
            await db.notifications.insert_one({
                "user_id": uid,
                "procedure_id": procedure_id,
                "message": f"{phase_label}: Case for {procedure['patient_name']} was {type_label} by {rejected_by}",
                "type": "rejected",
                "read": False,
                "created_at": datetime.utcnow()
            })
    
    # Push notification to creator
    if creator_id:
        resubmit_note = " You can make changes and resubmit." if rejection_type == "reconsider" else ""
        await send_expo_push_notifications(
            [creator_id],
            f"{phase_label} {'Rejected' if rejection_type == 'permanent' else 'Needs Revision'}",
            f"{type_label.capitalize()} by {rejected_by}. {rejection_reason}{resubmit_note}",
            {"procedure_id": procedure_id, "type": "rejected"},
        )

# Expo Push Notification Helper
async def send_expo_push_notifications(user_ids: List[str], title: str, body: str, data: Optional[Dict] = None, redact: Optional[List[str]] = None):
    """Send push notifications to users via Expo Push API.

    `redact`: literal substrings (typically a patient name) to strip from
    `title`/`body` before the payload leaves our server. Push notifications
    render on the OS lock screen — visible to anyone glancing at the device,
    not just the authenticated recipient — so patient identity must not ride
    in a push payload even though the same detail is fine in the persisted
    in-app notification (only visible after login, to an authorized viewer).
    Expo's relay also stores payloads in transit, another reason to keep PHI
    out of it. Callers pass the patient name(s) that were interpolated into
    the message; here they're swapped for a neutral placeholder.
    """
    if not user_ids:
        return
    valid_oids = [ObjectId(uid) for uid in user_ids if ObjectId.is_valid(uid)]
    if not valid_oids:
        return
    tokens = []
    users = await db.users.find(
        {"_id": {"$in": valid_oids}},
        {"push_token": 1}
    ).to_list(len(valid_oids))
    for user in users:
        if user.get("push_token"):
            tokens.append(user["push_token"])
    if not tokens:
        return
    for needle in (redact or []):
        needle = (needle or "").strip()
        if not needle:
            continue
        title = title.replace(needle, "the patient")
        body = body.replace(needle, "the patient")
    messages = [
        {"to": token, "sound": "default", "title": title, "body": body, "data": data or {}}
        for token in tokens
    ]
    try:
        async with httpx.AsyncClient() as client_http:
            await client_http.post(
                "https://exp.host/--/api/v2/push/send",
                json=messages,
                headers={"Accept": "application/json", "Content-Type": "application/json"},
                timeout=10,
            )
    except Exception as e:
        logging.error(f"Failed to send push notification: {e}")


# ───────────────────────────────────────────────────────────────────
# HIPAA access audit log
# ───────────────────────────────────────────────────────────────────
# Every PHI-touching endpoint (procedure view, PDF export, consent view,
# login success/failure) records a row here. TTL index prunes entries
# older than 180 days automatically — adjust retention per institutional
# policy (HIPAA requires ≥6 years for audit logs against BAs, but
# app-level access logs are typically kept 180d–1y with archival to
# cold storage for compliance).
async def log_access(
    *,
    action: str,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    user: Optional[dict] = None,
    request: Optional[Request] = None,
    outcome: str = "success",
    extra: Optional[Dict[str, Any]] = None,
) -> None:
    """Append-only audit record. Failures are swallowed so audit never
    breaks the request path — but we log to stderr so ops can alert."""
    try:
        doc = {
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "user_id": (user or {}).get("_id"),
            "user_name": (user or {}).get("name"),
            "user_role": (user or {}).get("role"),
            "outcome": outcome,
            "created_at": datetime.now(timezone.utc),
        }
        if request is not None:
            fwd = request.headers.get("x-forwarded-for", "")
            client_ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else None)
            doc["ip"] = client_ip
            ua = request.headers.get("user-agent")
            if ua:
                doc["user_agent"] = ua[:300]
        if extra:
            # Strip any obviously-sensitive keys before storing.
            safe_extra = {k: v for k, v in extra.items() if k.lower() not in {"password", "token", "authorization", "cookie"}}
            if safe_extra:
                doc["extra"] = safe_extra
        await db.access_logs.insert_one(doc)
    except Exception as e:
        logging.error(f"[audit] log_access failed for action={action}: {e}")


async def _ensure_access_log_indexes() -> None:
    """Create TTL + query indexes on startup. Idempotent."""
    try:
        await db.access_logs.create_index("created_at", expireAfterSeconds=180 * 24 * 3600)
        await db.access_logs.create_index([("user_id", 1), ("created_at", -1)])
        await db.access_logs.create_index([("resource_type", 1), ("resource_id", 1), ("created_at", -1)])
    except Exception as e:
        logging.warning(f"[audit] index creation skipped: {e}")



# ───────────────────────────────────────────────────────────────────
# Pre-surgery reminder scheduler
# ───────────────────────────────────────────────────────────────────
# Sends a single in-app notification + Expo push to student/supervisor/incharge
# ~24 hours before a scheduled surgery if the case still has:
#   - consent form pending, AND/OR
#   - instruments not yet autoclaved.
# Idempotent via `pre_surgery_reminder_sent` flag on the procedure doc.

def _surgery_dt_from_strings(date_str: str, time_str: str) -> Optional[datetime]:
    """Shared helper to parse procedure_date (YYYY-MM-DD) + procedure_time into naive datetime."""
    if not date_str or not time_str:
        return None
    time_norm = time_str.strip().upper().replace(" ", "")
    try:
        return datetime.strptime(f"{date_str} {time_norm}", "%Y-%m-%d %I:%M%p")
    except ValueError:
        pass
    try:
        return datetime.strptime(f"{date_str} {time_str.strip()}", "%Y-%m-%d %H:%M")
    except ValueError:
        return None


async def run_pre_surgery_reminders():
    """Scan for Phase-2-ready cases ~24 hours out and send single pending-checklist reminder.

    Window: now <= surgery_time - 24h < now + check_interval. Because we run hourly,
    using a 2-hour tolerance window (22h..26h remaining) catches every case exactly once
    and is tolerant to scheduler drift. Idempotent via `pre_surgery_reminder_sent` flag.
    """
    try:
        now = datetime.now()
        # Find candidate cases in the next 2 days (narrow MongoDB query first).
        date_strs = [(now.date() + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(3)]
        cursor = db.procedures.find({
            "status": "phase1_approved",
            "procedure_date": {"$in": date_strs},
            "archived": {"$ne": True},
            "pre_surgery_reminder_sent": {"$ne": True},
        })
        async for proc in cursor:
            surgery_dt = _surgery_dt_from_strings(
                proc.get("procedure_date", ""), proc.get("procedure_time", "")
            )
            if not surgery_dt:
                continue
            hours_out = (surgery_dt - now).total_seconds() / 3600.0
            # Fire exactly once when we're inside the 22h..26h window before surgery.
            if not (22.0 <= hours_out <= 26.0):
                continue

            consent_pending = not bool(proc.get("patient_consent_form"))
            instruments_pending = not bool((proc.get("instruments_autoclaved") or {}).get("marked"))

            if not consent_pending and not instruments_pending:
                # Everything prepped — skip, but mark so we don't recheck.
                await db.procedures.update_one(
                    {"_id": proc["_id"]},
                    {"$set": {"pre_surgery_reminder_sent": True, "pre_surgery_reminder_at": now}},
                )
                continue

            issues = []
            if consent_pending:
                issues.append("patient consent form is not uploaded")
            if instruments_pending:
                issues.append("instruments are not yet autoclaved")
            issue_text = " and ".join(issues)
            title = "Pre-surgery checklist reminder"
            patient_label = proc.get("patient_name") or "your patient"
            time_label = proc.get("procedure_time") or ""
            body = f"Surgery for {patient_label} is in ~24 hours ({time_label}) — {issue_text}."

            # Recipients: student owner + supervisor + implant-incharge (dedupe, skip blanks).
            raw_ids = [
                proc.get("student_id"),
                proc.get("supervisor_id"),
                proc.get("implant_incharge_id"),
            ]
            recipient_ids = [str(x) for x in raw_ids if x]
            recipient_ids = list(dict.fromkeys(recipient_ids))  # preserve order, dedupe

            # 1) In-app notifications
            for uid in recipient_ids:
                await db.notifications.insert_one({
                    "user_id": uid,
                    "procedure_id": str(proc["_id"]),
                    "message": body,
                    "type": "reminder",
                    "read": False,
                    "created_at": now,
                })

            # 2) Expo push
            await send_expo_push_notifications(
                recipient_ids,
                title,
                body,
                {"procedure_id": str(proc["_id"]), "kind": "pre_surgery_reminder"},
                redact=[patient_label],
            )

            # 3) Mark as sent
            await db.procedures.update_one(
                {"_id": proc["_id"]},
                {"$set": {"pre_surgery_reminder_sent": True, "pre_surgery_reminder_at": now}},
            )
            logging.info(
                "Pre-surgery reminder sent for %s (%s). Recipients: %d, issues: %s",
                patient_label, proc["_id"], len(recipient_ids), issue_text,
            )
    except Exception as exc:
        logging.error("Pre-surgery reminder sweep failed: %s", exc)


async def pre_surgery_reminder_loop(interval_seconds: int = 3600):
    """Background task that calls run_pre_surgery_reminders every `interval_seconds`."""
    # Small initial delay to let the app finish starting up.
    await asyncio.sleep(30)
    while True:
        await run_pre_surgery_reminders()
        await asyncio.sleep(interval_seconds)


# ───────────────────────────────────────────────────────────────────
# iter-189: Pre-Op Checklist reminders at T-3h and T-30m
# ───────────────────────────────────────────────────────────────────
async def run_preop_checklist_reminders():
    """Scan phase1_approved cases that haven't completed Pre-Op yet and send
    Expo push + in-app notif at T-3h and T-30m before scheduled surgery.
    Idempotent via `preop_reminder_3h_sent` / `preop_reminder_30m_sent` flags."""
    try:
        now = datetime.now()
        # Narrow Mongo query to today's + tomorrow's surgeries.
        date_strs = [(now.date() + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(2)]
        cursor = db.procedures.find({
            "status": "phase1_approved",
            "procedure_date": {"$in": date_strs},
            "archived": {"$ne": True},
            "phase2_preop_completed_at": {"$in": [None, ""]},
        })
        async for proc in cursor:
            surgery_dt = _surgery_dt_from_strings(
                proc.get("procedure_date", ""), proc.get("procedure_time", "")
            )
            if not surgery_dt:
                continue
            mins_out = (surgery_dt - now).total_seconds() / 60.0
            # Decide which bucket (if any) we're in. Use ±8min windows to absorb
            # scheduler drift at a 15-min poll interval.
            bucket = None
            if 172.0 <= mins_out <= 188.0 and not proc.get("preop_reminder_3h_sent"):
                bucket = "3h"
            elif 22.0 <= mins_out <= 38.0 and not proc.get("preop_reminder_30m_sent"):
                bucket = "30m"
            if bucket is None:
                continue

            patient_label = proc.get("patient_name") or "your patient"
            time_label = proc.get("procedure_time") or ""
            if bucket == "3h":
                title = "Pre-Op Checklist due (~3h to surgery)"
                body = f"Surgery for {patient_label} starts in ~3 hours ({time_label}) — Pre-Surgical Checklist is incomplete."
            else:
                title = "Pre-Op Checklist URGENT (~30m to surgery)"
                body = f"Surgery for {patient_label} starts in ~30 minutes ({time_label}) — Pre-Surgical Checklist still pending."

            raw_ids = [
                proc.get("student_id"),
                proc.get("supervisor_id"),
                proc.get("implant_incharge_id"),
            ]
            recipient_ids = [str(x) for x in raw_ids if x]
            recipient_ids = list(dict.fromkeys(recipient_ids))

            for uid in recipient_ids:
                await db.notifications.insert_one({
                    "user_id": uid,
                    "procedure_id": str(proc["_id"]),
                    "message": body,
                    "type": "preop_reminder",
                    "read": False,
                    "created_at": now,
                })
            await send_expo_push_notifications(
                recipient_ids,
                title,
                body,
                {"procedure_id": str(proc["_id"]), "kind": "preop_reminder", "bucket": bucket},
                redact=[patient_label],
            )
            await db.procedures.update_one(
                {"_id": proc["_id"]},
                {"$set": {f"preop_reminder_{bucket}_sent": True, f"preop_reminder_{bucket}_at": now}},
            )
            logging.info(
                "Pre-op reminder sent (%s) for %s (%s); recipients=%d",
                bucket, patient_label, proc["_id"], len(recipient_ids),
            )
    except Exception as exc:
        logging.error("Pre-op reminder sweep failed: %s", exc)


async def preop_checklist_reminder_loop(interval_seconds: int = 900):
    """Polls every 15min for surgeries hitting the T-3h / T-30m buckets."""
    await asyncio.sleep(45)  # let startup settle
    while True:
        await run_preop_checklist_reminders()
        await asyncio.sleep(interval_seconds)

# Auth Routes
@api_router.post("/auth/register", response_model=UserResponse)
async def register(user: UserRegister):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Validate role
    if user.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    # Create user
    user_dict = {
        "name": user.name,
        "email": user.email,
        "password_hash": hash_password(user.password),
        "role": user.role,
        "created_at": datetime.utcnow()
    }
    result = await db.users.insert_one(user_dict)
    
    return UserResponse(
        id=str(result.inserted_id),
        name=user.name,
        email=user.email,
        role=user.role
    )

@api_router.post("/auth/login")
@limiter.limit("100/minute")
async def login(request: Request, user: UserLogin):
    # Accept either 'identifier' or 'email' field (backward compat)
    raw_identifier = user.identifier or user.email or ""
    identifier = raw_identifier.strip().replace('\u200b', '').replace('\ufeff', '')
    password = user.password.strip().replace('\u200b', '').replace('\ufeff', '')

    if not identifier:
        raise HTTPException(status_code=400, detail="identifier or email is required")

    db_user = None

    logging.info(f"Login attempt: identifier='{identifier}'")

    # 1) Try exact email match
    db_user = await db.users.find_one({"email": identifier})

    # 2) Try case-insensitive email match (for mobile keyboards that may change case)
    if not db_user:
        db_user = await db.users.find_one({"email": {"$regex": f"^{re.escape(identifier)}$", "$options": "i"}})

    # 3) Try case-insensitive username match
    if not db_user:
        db_user = await db.users.find_one({"username": {"$regex": f"^{re.escape(identifier)}$", "$options": "i"}})

    # 4) If not found and input lacks '@', try case-insensitive name match
    if not db_user and "@" not in identifier:
        db_user = await db.users.find_one({"name": {"$regex": re.escape(identifier), "$options": "i"}})

    if not db_user:
        logging.warning(f"Login failed: no user found for '{identifier}'")
        await log_access(action="login", outcome="failure", request=request, extra={"identifier": identifier[:60]})
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Try password as-is, then common mobile keyboard variations
    password_variants = [password]
    if password != password.lower():
        password_variants.append(password.lower())
    if password != password.capitalize():
        password_variants.append(password.capitalize())
    if len(password) > 0 and password[0].islower():
        password_variants.append(password[0].upper() + password[1:])
    if len(password) > 0 and password[0].isupper():
        password_variants.append(password[0].lower() + password[1:])

    matched = False
    for variant in password_variants:
        if verify_password(variant, db_user["password_hash"]):
            matched = True
            break

    if not matched:
        logging.warning(f"Login failed: wrong password for user '{db_user['name']}'")
        await log_access(action="login", outcome="failure", user={"_id": str(db_user["_id"]), "name": db_user["name"], "role": db_user.get("role")}, request=request, extra={"reason": "wrong_password"})
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if db_user.get("disabled"):
        logging.warning(f"Login blocked: account disabled for user '{db_user['name']}'")
        await log_access(action="login", outcome="failure", user={"_id": str(db_user["_id"]), "name": db_user["name"], "role": db_user.get("role")}, request=request, extra={"reason": "account_disabled"})
        raise HTTPException(status_code=403, detail="This account has been disabled. Contact your administrator.")

    user_id_str = str(db_user["_id"])
    # Create access + refresh tokens
    access_token = create_access_token({"user_id": user_id_str})
    refresh_token = create_refresh_token({"user_id": user_id_str})

    # Store refresh token in DB for invalidation on logout
    await db.refresh_tokens.insert_one({
        "user_id": user_id_str,
        "token": refresh_token,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
    })

    # first_login_at powers onboarding tracking (Single/Multiple/CSV-created
    # users get a password immediately, so "onboarded" means "has actually
    # logged in", not "has an activation link pending"). last_login_at just
    # tracks recency for display.
    now_login = datetime.now(timezone.utc)
    login_update = {"last_login_at": now_login}
    if not db_user.get("first_login_at"):
        login_update["first_login_at"] = now_login
    await db.users.update_one({"_id": db_user["_id"]}, {"$set": login_update})

    user_resp = UserResponse(
        id=user_id_str,
        name=db_user["name"],
        email=db_user["email"],
        role=db_user["role"],
        profile_photo=db_user.get("profile_photo")
    )

    await log_access(
        action="login",
        outcome="success",
        user={"_id": user_id_str, "name": db_user["name"], "role": db_user.get("role")},
        request=request,
    )
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token": access_token,  # backward compat for old frontend
        "token_type": "bearer",
        "user": user_resp,
    }

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("org_id")
    org_type = None
    org_name = None
    if org_id:
        try:
            org = await db.organizations.find_one({"_id": ObjectId(org_id)}, {"org_type": 1, "name": 1})
            if org:
                org_type = org.get("org_type")
                org_name = org.get("name")
        except Exception:
            pass
    return UserResponse(
        id=current_user["_id"],
        name=current_user["name"],
        email=current_user["email"],
        role=current_user.get("_original_role") or current_user["role"],
        profile_photo=current_user.get("profile_photo"),
        workflow_seen_at=current_user.get("workflow_seen_at"),
        workflow_seen_version=current_user.get("workflow_seen_version", 0),
        last_seen_whatsnew_version=current_user.get("last_seen_whatsnew_version"),
        org_id=org_id,
        org_type=org_type,
        org_name=org_name,
    )

# --- "What's New" changelog ─────────────────────────────────────────────────
# To ship a new changelog entry: prepend a dict to the TOP of WHATSNEW_ENTRIES
# with a monotonically-increasing semver. Entries newer than the user's
# `last_seen_whatsnew_version` will be shown on their next login, filtered by
# the optional `roles` field.
#
# Versions must sort correctly with `_parse_version` — use dotted numerics only
# (e.g. "1.3", "1.3.1", "2.0"). Do NOT reuse or reorder shipped versions.
WHATSNEW_ENTRIES: List[Dict[str, Any]] = [
    {
        "version": "1.4",
        "date": "2026-04-24",
        "title": "Phases have clearer, clinically-accurate names",
        "items": [
            "Phase 1 is now \"Diagnosis and Treatment Planning\".",
            "Phase 2 is now \"Implant Surgery\".",
            "Phase 3 is now \"Healing and Second Stage Surgery\".",
            "Phase 4 is now \"Prosthetic Rehabilitation\" with Step 1 \"Prosthetic Planning\" and Step 2 \"Final Restoration\".",
            "Case-report PDFs now lead with a \"Phase 1 - Diagnosis and Treatment Planning\" heading right before Patient Information.",
        ],
    },
    {
        "version": "1.3",
        "date": "2026-04-24",
        "title": "Cleaner review experience for Supervisors & In-Charges",
        "roles": ["supervisor", "implant_incharge", "administrator"],
        "items": [
            "A new \"Awaiting student to start Phase N\" indicator tells you at a glance who's blocking progress on any case you didn't schedule.",
            "When a student or nurse uploads a signed Patient Consent Form, you can now view it in read-only mode right from the case screen.",
            "The consent form upload + template export buttons are now visible only to the case scheduler and nurses — less clutter for everyone else.",
        ],
    },
    {
        "version": "1.3",
        "date": "2026-04-24",
        "title": "Your default consent-form workflow just got simpler",
        "roles": ["nurse"],
        "items": [
            "You now have default access to upload / replace and print consent forms on every scheduled case — no matter who scheduled it.",
            "Mark instruments autoclaved and your name + timestamp prints as a stamp on the Drilling Protocol PDF for full traceability.",
            "24-hour pre-surgery reminders notify you if consent is still pending or instruments aren't autoclaved yet.",
        ],
    },
    {
        "version": "1.3",
        "date": "2026-04-24",
        "title": "Tighter case screen + cleaner PDFs",
        "roles": ["student"],
        "items": [
            "The PHASE 1 APPROVED card now shows the Nurse's autoclave confirmation right below it.",
            "The Drilling Protocol PDF now includes your Care Team, an autoclave stamp, and a QR code linking to the patient's CBCT.",
            "Consent controls are de-cluttered: one Upload, one Export/Print, one place for instructions.",
        ],
    },
]


def _parse_version(v: str) -> tuple:
    """Turn '1.3.1' → (1, 3, 1). Missing/invalid → (0, 0, 0)."""
    try:
        return tuple(int(p) for p in (v or "0").split(".") if p.isdigit())
    except Exception:
        return (0, 0, 0)


def _latest_whatsnew_version() -> str:
    if not WHATSNEW_ENTRIES:
        return "0"
    return max((e["version"] for e in WHATSNEW_ENTRIES), key=_parse_version)


def _entries_for_user(user: dict) -> List[Dict[str, Any]]:
    """Return changelog entries newer than user's last-seen, filtered by role."""
    seen = _parse_version(user.get("last_seen_whatsnew_version") or "0")
    role = user.get("role")
    out: List[Dict[str, Any]] = []
    for e in WHATSNEW_ENTRIES:
        if _parse_version(e["version"]) <= seen:
            continue
        roles = e.get("roles")
        if roles and role not in roles:
            continue
        out.append({
            "version": e["version"],
            "date": e.get("date"),
            "title": e.get("title"),
            "items": e.get("items", []),
            # Surface the role-target so the WhatsNewBadge can render
            # role-aware copy (e.g., "What's new for In-Charges N").
            "roles": e.get("roles"),
        })
    return out


@api_router.get("/whatsnew")
async def get_whatsnew(current_user: dict = Depends(get_current_user)):
    """Return unseen, role-matched changelog entries for this user."""
    return {
        "latest_version": _latest_whatsnew_version(),
        "entries": _entries_for_user(current_user),
    }


@api_router.get("/whatsnew/history")
async def get_whatsnew_history(current_user: dict = Depends(get_current_user)):
    """Return the full role-matched changelog history (for Profile → What's new)."""
    role = current_user.get("role")
    history = []
    for e in WHATSNEW_ENTRIES:
        roles = e.get("roles")
        if roles and role not in roles:
            continue
        history.append({
            "version": e["version"],
            "date": e.get("date"),
            "title": e.get("title"),
            "items": e.get("items", []),
        })
    return {"entries": history}


@api_router.post("/whatsnew/ack")
async def ack_whatsnew(current_user: dict = Depends(get_current_user)):
    """Mark the user as having seen the most recent changelog version. Idempotent."""
    latest = _latest_whatsnew_version()
    await db.users.update_one(
        {"_id": ObjectId(current_user["_id"])},
        {"$set": {"last_seen_whatsnew_version": latest}},
    )
    return {"last_seen_whatsnew_version": latest}

# --- Onboarding / Help-Workflow acknowledgement ---
# Called when the user dismisses the first-login onboarding slides + workflow
# chart. Writes a timestamp so the client won't re-show these screens on
# subsequent logins from any device. Idempotent.
@api_router.post("/auth/me/ack-workflow")
async def ack_workflow(
    payload: dict = Body(default=None),
    current_user: dict = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    try:
        version = int((payload or {}).get("version", 1))
    except Exception:
        version = 1
    await db.users.update_one(
        {"_id": ObjectId(current_user["_id"])},
        {"$set": {"workflow_seen_at": now, "workflow_seen_version": version}},
    )
    return {"workflow_seen_at": now.isoformat(), "workflow_seen_version": version}

# --- Logout (JWT Session Invalidation) ---
@api_router.post("/auth/logout")
async def logout(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        jti = payload.get("jti")
        if jti:
            token_blocklist.add(jti)
        # Remove all refresh tokens for this user
        user_id = payload.get("user_id")
        if user_id:
            await db.refresh_tokens.delete_many({"user_id": user_id})
        return {"message": "Logged out successfully"}
    except Exception:
        return {"message": "Logged out"}

# --- Token Refresh ---
class RefreshTokenRequest(BaseModel):
    refresh_token: str

@api_router.post("/auth/refresh")
async def refresh_access_token(body: RefreshTokenRequest):
    try:
        payload = jwt.decode(body.refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        # Check if this refresh token exists in DB (not revoked)
        stored = await db.refresh_tokens.find_one({"token": body.refresh_token})
        if not stored:
            raise HTTPException(status_code=401, detail="Refresh token revoked")
        user_id = payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        # Verify user still exists
        user = await db.users.find_one({"_id": ObjectId(user_id)}, {"password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        new_access_token = create_access_token({"user_id": user_id})
        return {"access_token": new_access_token, "token_type": "bearer"}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

# Profile Photo Update
class ProfilePhotoUpdate(BaseModel):
    profile_photo: str  # Base64 encoded image — no max_length (images are large)

@api_router.put("/auth/profile-photo")
async def update_profile_photo(
    photo_data: ProfilePhotoUpdate,
    current_user: dict = Depends(get_current_user)
):
    await db.users.update_one(
        {"_id": ObjectId(current_user["_id"])},
        {"$set": {"profile_photo": photo_data.profile_photo, "updated_at": datetime.utcnow()}}
    )
    
    return {"message": "Profile photo updated successfully"}

# Push Token Registration
@api_router.post("/auth/push-token")
async def register_push_token(
    data: PushTokenRegister,
    current_user: dict = Depends(get_current_user)
):
    await db.users.update_one(
        {"_id": ObjectId(current_user["_id"])},
        {"$set": {"push_token": data.push_token}}
    )
    return {"message": "Push token registered"}

# User Routes
@api_router.get("/users")
async def get_users(role: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {} if current_user.get("is_super_admin") else {"org_id": current_user.get("org_id")}
    if role:
        query["role"] = role

    users = await db.users.find(query, {"password_hash": 0}).to_list(100)
    for user in users:
        user["_id"] = str(user["_id"])
        user["id"] = user["_id"]
    
    return users

# User Management (Admin/Implant Incharge only)
class UserCreate(BaseModel):
    name: str = Field(..., max_length=100)
    email: EmailStr = Field(..., max_length=255)
    password: str = Field(..., max_length=128)
    role: str = Field(..., max_length=30)
    # Only honoured for super_admin, who has no org_id of their own and must pick
    # a target organization explicitly. Ignored (uses the caller's own org) otherwise.
    org_id: Optional[str] = Field(None, max_length=64)

    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return sanitize_input(v)

@api_router.post("/users")
async def create_user(user: UserCreate, current_user: dict = Depends(get_current_user)):
    # Only administrators can create users
    if current_user["role"] not in ["administrator", "implant_incharge"]:
        raise HTTPException(status_code=403, detail="Only administrators and implant incharge can create users")

    if current_user.get("is_super_admin"):
        org_id = user.org_id
        if not org_id:
            raise HTTPException(status_code=400, detail="org_id is required when creating a user as super admin")
    else:
        org_id = current_user.get("org_id")
        if not org_id:
            raise HTTPException(status_code=400, detail="Your account is not linked to an organization")

    org = await db.organizations.find_one({"_id": ObjectId(org_id)})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Check if email already exists
    existing = await db.users.find_one({"email": user.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Validate role for this org type
    allowed_roles = COLLEGE_ROLES if org["org_type"] == "college" else CLINIC_ROLES
    if user.role not in allowed_roles:
        raise HTTPException(status_code=400, detail=f"Role '{user.role}' not valid for {org['org_type']} workspace")

    # Enforce max 2 per incharge/chief_dentist role
    if user.role in MAX_2_ROLES:
        count = await db.users.count_documents({"org_id": org_id, "role": user.role})
        if count >= 2:
            raise HTTPException(status_code=400, detail=f"Maximum 2 users allowed with role '{user.role}'")

    # Create user
    user_dict = {
        "name": user.name,
        "email": user.email,
        "password_hash": hash_password(user.password),
        "role": user.role,
        "org_id": org_id,
        "created_at": datetime.utcnow()
    }

    result = await db.users.insert_one(user_dict)

    email_sent = await _send_credentials_email(
        to_email=user.email,
        to_name=user.name,
        password=user.password,
        role_display=_role_display_name(user.role),
        org_name=org.get("name", ""),
    )

    return {"id": str(result.inserted_id), "message": "User created successfully", "email_sent": email_sent}

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    # Only administrators can delete users
    if current_user["role"] not in ["administrator", "implant_incharge"]:
        raise HTTPException(status_code=403, detail="Only administrators and implant incharge can delete users")

    # Cannot delete yourself
    if user_id == current_user["_id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    target = await db.users.find_one({"_id": ObjectId(user_id)})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if not current_user.get("is_super_admin") and target.get("org_id") != current_user.get("org_id"):
        raise HTTPException(status_code=403, detail="Cannot manage users outside your organization")

    result = await db.users.delete_one({"_id": ObjectId(user_id)})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    return {"message": "User deleted successfully"}

class UserUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    role: Optional[str] = Field(None, max_length=30)
    password: Optional[str] = Field(None, max_length=128)

    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v):
        if v is not None:
            return sanitize_input(v)
        return v

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, user: UserUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["administrator", "implant_incharge"]:
        raise HTTPException(status_code=403, detail="Only administrators and implant incharge can update users")
    
    existing = await db.users.find_one({"_id": ObjectId(user_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    if not current_user.get("is_super_admin") and existing.get("org_id") != current_user.get("org_id"):
        raise HTTPException(status_code=403, detail="Cannot manage users outside your organization")

    update_fields = {}
    if user.name and user.name.strip():
        update_fields["name"] = user.name.strip()
    if user.role:
        if user.role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail="Invalid role")
        update_fields["role"] = user.role
    if user.password and user.password.strip():
        update_fields["password_hash"] = hash_password(user.password)
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update_fields})

    return {"message": "User updated successfully"}


@api_router.post("/users/{user_id}/resend-credentials")
async def resend_user_credentials(user_id: str, current_user: dict = Depends(get_current_user)):
    """Generate a fresh password and re-email login credentials — the natural
    follow-up for a user stuck in 'pending' onboarding (created but never
    logged in) via the Single/Multiple/CSV Add User flow."""
    if current_user["role"] not in ["administrator", "implant_incharge"]:
        raise HTTPException(status_code=403, detail="Only administrators and implant incharge can resend credentials")

    target = await db.users.find_one({"_id": ObjectId(user_id)})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if not current_user.get("is_super_admin") and target.get("org_id") != current_user.get("org_id"):
        raise HTTPException(status_code=403, detail="Cannot manage users outside your organization")

    new_password = _secrets_mod.token_urlsafe(9)
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"password_hash": hash_password(new_password)}})

    org_name = ""
    if target.get("org_id"):
        try:
            org = await db.organizations.find_one({"_id": ObjectId(target["org_id"])}, {"name": 1})
            org_name = org.get("name", "") if org else ""
        except Exception:
            pass

    email_sent = await _send_credentials_email(
        to_email=target["email"],
        to_name=target.get("name", ""),
        password=new_password,
        role_display=_role_display_name(target.get("role", "")),
        org_name=org_name,
    )
    return {"message": "Credentials resent", "email_sent": email_sent}


# ─────────────────────────────────────────────────────────────────────
# ORGANIZATIONS  &  INVITE-BASED REGISTRATION
# ─────────────────────────────────────────────────────────────────────
# Flow:
#   1. Workspace admin signs up publicly → POST /auth/signup
#      Creates an Organization document + admin User, returns JWT.
#   2. Admin invites team members → POST /organizations/invite
#      Creates an Invite doc, sends activation email.
#   3. Invited person previews invite → GET /organizations/invite/{token}
#      Returns org name + assigned role (no auth required).
#   4. Invited person activates → POST /organizations/invite/{token}/activate
#      Sets password, creates User linked to the org.
#   5. Admin manages invites → GET /organizations/invites
#      Returns active users + pending invites + disabled users.
#   6. Admin revokes / resends → DELETE/POST on /organizations/invites/{invite_id}
# ─────────────────────────────────────────────────────────────────────

import secrets as _secrets_mod
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage

INVITE_EXPIRY_DAYS = 7
INCHARGE_ROLES = {"implant_incharge", "chief_dentist"}

# Roles allowed to be max 2 per org
MAX_2_ROLES = {"implant_incharge", "chief_dentist"}
COLLEGE_ROLES = {"implant_incharge", "supervisor", "student", "nurse", "administrator"}
CLINIC_ROLES = {"chief_dentist", "dentist", "dental_assistant", "administrator"}

EMAIL_LOGO_PATH = ROOT_DIR / "email_assets" / "logo.png"
EMAIL_WEBSITE_URL = os.environ.get("WEBSITE_URL", "https://implanr.com")
# No App Store / Play Store listing yet — placeholder until APP_DOWNLOAD_URL is set,
# falls back to the website so the email link is never broken.
EMAIL_APP_DOWNLOAD_URL = os.environ.get("APP_DOWNLOAD_URL", EMAIL_WEBSITE_URL)


async def _send_smtp_email(to_email: str, subject: str, html_body: str, text_body: str, log_tag: str = "email", inline_logo: bool = False) -> bool:
    """Send an email via SMTP env vars. Returns False (and logs) on missing config or failure."""
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASS", "")
    email_from = os.environ.get("EMAIL_FROM", smtp_user)

    if not smtp_host:
        logging.warning(f"[{log_tag}] SMTP_HOST not configured — skipping email to {to_email}")
        return False

    try:
        root = MIMEMultipart("related")
        root["Subject"] = subject
        root["From"] = email_from
        root["To"] = to_email

        alt = MIMEMultipart("alternative")
        alt.attach(MIMEText(text_body, "plain"))
        alt.attach(MIMEText(html_body, "html"))
        root.attach(alt)

        if inline_logo and EMAIL_LOGO_PATH.exists():
            with open(EMAIL_LOGO_PATH, "rb") as f:
                logo = MIMEImage(f.read())
            logo.add_header("Content-ID", "<implanr_logo>")
            logo.add_header("Content-Disposition", "inline", filename="logo.png")
            root.attach(logo)

        loop = asyncio.get_event_loop()
        def _send():
            with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                if smtp_user:
                    server.login(smtp_user, smtp_pass)
                server.sendmail(email_from, [to_email], root.as_string())
        # Gmail's SMTP relay intermittently defers connections/logins from a
        # datacenter IP (421/454) — retry a few times with backoff before failing.
        last_err = None
        for attempt in range(1, 4):
            try:
                await loop.run_in_executor(None, _send)
                logging.info(f"[{log_tag}] Email sent to {to_email} (attempt {attempt})")
                return True
            except Exception as e:
                last_err = e
                logging.warning(f"[{log_tag}] send attempt {attempt} to {to_email} failed: {e}")
                if attempt < 3:
                    await asyncio.sleep(2 * attempt)
        logging.error(f"[{log_tag}] Failed to send email to {to_email} after retries: {last_err}")
        return False
    except Exception as e:
        logging.error(f"[{log_tag}] Failed to build/send email to {to_email}: {e}")
        return False


async def _send_invite_email(to_email: str, to_name: str, org_name: str, role_display: str, token: str, org_type: str = "college") -> None:
    """Send activation email via SMTP env vars. Silently logs on failure so invite still creates."""
    # Use org-type-aware deep link so college invites open the college app
    # and clinic invites open the clinic app.
    if org_type == "clinic":
        default_base = "implanr-clinic:///auth/activate"
        app_url = os.environ.get("APP_DEEP_LINK_BASE_CLINIC", default_base)
    else:
        default_base = "implanr-college:///auth/activate"
        app_url = os.environ.get("APP_DEEP_LINK_BASE_COLLEGE", default_base)

    activation_url = f"{app_url}/{token}"
    subject = f"You've been invited to join {org_name} on Implanr"
    html_body = f"""
<p>Hi {to_name},</p>
<p>You have been invited to join <strong>{org_name}</strong> on Implanr as <strong>{role_display}</strong>.</p>
<p>Tap the link below to activate your account. This link is valid for {INVITE_EXPIRY_DAYS} days and can only be used once.</p>
<p><a href="{activation_url}" style="background:#1565C0;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Activate Account</a></p>
<p>If the button does not work, copy and paste this link into your browser:<br>{activation_url}</p>
<p>— The Implanr Team</p>
"""
    text_body = (
        f"Hi {to_name},\n\nYou have been invited to join {org_name} on Implanr as {role_display}.\n\n"
        f"Activate your account here (valid for {INVITE_EXPIRY_DAYS} days):\n{activation_url}\n\n— The Implanr Team"
    )
    await _send_smtp_email(to_email, subject, html_body, text_body, log_tag="invite")


OTP_EXPIRY_MINUTES = 10
OTP_VERIFIED_WINDOW_MINUTES = 30
OTP_MAX_ATTEMPTS = 5


async def _send_otp_email(
    to_email: str,
    otp: str,
    heading: str = "Verify your email",
    intro: str = "Enter this code to finish setting up your Implanr workspace.",
    footer_note: str = "If you didn't request this code, you can safely ignore this email — no account will be created.",
    log_tag: str = "otp",
) -> bool:
    subject = f"{otp} is your Implanr verification code"
    otp_spaced = " ".join(otp)
    html_body = f"""\
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#F4F6F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F6F8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(10,37,64,0.08);">
          <tr>
            <td align="center" style="background:linear-gradient(135deg,#0A2540,#1565C0);padding:32px 24px;">
              <img src="cid:implanr_logo" width="96" height="96" alt="Implanr" style="display:block;border-radius:20px;" />
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px 24px 32px;">
              <h1 style="margin:0 0 8px 0;font-size:20px;color:#0A2540;font-weight:700;">{heading}</h1>
              <p style="margin:0 0 24px 0;font-size:14px;line-height:22px;color:#546E7A;">
                {intro}
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="background-color:#EFF6FF;border:1.5px solid #BBDEFB;border-radius:12px;padding:20px;">
                    <span style="font-size:32px;font-weight:800;letter-spacing:10px;color:#1565C0;font-family:'Courier New',monospace;">{otp_spaced}</span>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0 0 0;font-size:13px;color:#90A4AE;text-align:center;">
                This code expires in {OTP_EXPIRY_MINUTES} minutes.
              </p>
              <p style="margin:24px 0 0 0;font-size:12px;line-height:18px;color:#90A4AE;">
                {footer_note}
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="background-color:#F8FAFC;padding:20px 24px;border-top:1px solid #ECEFF1;">
              <a href="{EMAIL_WEBSITE_URL}" style="color:#1565C0;font-size:12px;font-weight:600;text-decoration:none;">{EMAIL_WEBSITE_URL.replace('https://', '').replace('http://', '')}</a>
              <p style="margin:6px 0 0 0;font-size:11px;color:#B0BEC5;">© {datetime.utcnow().year} Implanr. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""
    text_body = (
        f"Your Implanr verification code is: {otp}\n\n"
        f"This code expires in {OTP_EXPIRY_MINUTES} minutes. {footer_note}\n\n"
        f"— The Implanr Team\n{EMAIL_WEBSITE_URL}"
    )
    return await _send_smtp_email(to_email, subject, html_body, text_body, log_tag=log_tag, inline_logo=True)


async def _send_credentials_email(to_email: str, to_name: str, password: str, role_display: str, org_name: str = "") -> bool:
    """Send login credentials to a user created directly by an admin/incharge
    (as opposed to the token-based invite-accept flow)."""
    subject = "Your Implanr account is ready"
    org_line = f" at <strong>{org_name}</strong>" if org_name else ""
    html_body = f"""\
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#F4F6F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F6F8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(10,37,64,0.08);">
          <tr>
            <td align="center" style="background:linear-gradient(135deg,#0A2540,#1565C0);padding:32px 24px;">
              <img src="cid:implanr_logo" width="96" height="96" alt="Implanr" style="display:block;border-radius:20px;" />
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px 24px 32px;">
              <h1 style="margin:0 0 8px 0;font-size:20px;color:#0A2540;font-weight:700;">Welcome to Implanr</h1>
              <p style="margin:0 0 24px 0;font-size:14px;line-height:22px;color:#546E7A;">
                Hi {to_name}, an account has been created for you{org_line} as <strong>{role_display}</strong>. Use these credentials to sign in:
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EFF6FF;border:1.5px solid #BBDEFB;border-radius:12px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 4px 0;font-size:11px;font-weight:700;color:#78909C;text-transform:uppercase;letter-spacing:0.5px;">Email</p>
                    <p style="margin:0 0 14px 0;font-size:15px;color:#0A2540;font-weight:600;">{to_email}</p>
                    <p style="margin:0 0 4px 0;font-size:11px;font-weight:700;color:#78909C;text-transform:uppercase;letter-spacing:0.5px;">Password</p>
                    <p style="margin:0;font-size:15px;color:#0A2540;font-weight:600;font-family:'Courier New',monospace;">{password}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:20px 0 0 0;font-size:12px;line-height:18px;color:#90A4AE;">
                For your security, please sign in and change this password as soon as possible.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                <tr>
                  <td align="center">
                    <a href="{EMAIL_APP_DOWNLOAD_URL}" style="display:inline-block;background:#1565C0;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Open Implanr</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="background-color:#F8FAFC;padding:20px 24px;border-top:1px solid #ECEFF1;">
              <a href="{EMAIL_WEBSITE_URL}" style="color:#1565C0;font-size:12px;font-weight:600;text-decoration:none;">{EMAIL_WEBSITE_URL.replace('https://', '').replace('http://', '')}</a>
              <p style="margin:6px 0 0 0;font-size:11px;color:#B0BEC5;">© {datetime.utcnow().year} Implanr. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""
    text_body = (
        f"Hi {to_name},\n\nAn account has been created for you{org_line.replace('<strong>', '').replace('</strong>', '')} as {role_display}.\n\n"
        f"Email: {to_email}\nPassword: {password}\n\n"
        f"Please sign in and change this password as soon as possible.\n\n"
        f"Open Implanr: {EMAIL_APP_DOWNLOAD_URL}\n\n— The Implanr Team"
    )
    return await _send_smtp_email(to_email, subject, html_body, text_body, log_tag="credentials", inline_logo=True)


def _role_display_name(role: str) -> str:
    mapping = {
        "implant_incharge": "Implant In-Charge",
        "chief_dentist": "Chief Dentist / Owner",
        "supervisor": "Supervisor",
        "dentist": "Dentist / Consultant",
        "student": "Student",
        "nurse": "Nurse / Auxiliary Staff",
        "dental_assistant": "Dental Assistant",
        "administrator": "Administrator",
    }
    return mapping.get(role, role.replace("_", " ").title())


# ── Pydantic models ──

class CollegeSignupData(BaseModel):
    college_name: str = Field(..., max_length=200)
    state: str = Field(..., max_length=100)
    incharge_name: str = Field(..., max_length=100)
    incharge_prefix: str = Field("Dr.", max_length=10)
    num_users: int = Field(..., ge=1, le=500)

class ClinicSignupData(BaseModel):
    clinic_name: str = Field(..., max_length=200)
    chief_dentist_name: str = Field(..., max_length=100)
    chief_dentist_prefix: str = Field("Dr.", max_length=10)
    registration_number: str = Field(..., max_length=100)
    state_of_registration: str = Field(..., max_length=100)
    state_of_practice: str = Field(..., max_length=100)
    num_users: int = Field(..., ge=1, le=500)

class WorkspaceSignup(BaseModel):
    org_type: str = Field(..., pattern="^(college|clinic)$")
    email: EmailStr = Field(..., max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    college_data: Optional[CollegeSignupData] = None
    clinic_data: Optional[ClinicSignupData] = None
    logo: Optional[str] = None  # Base64 data URI — no max_length, images are large

    @field_validator("college_data", "clinic_data", mode="before")
    @classmethod
    def _strip_empty(cls, v):
        return v

class OtpSendRequest(BaseModel):
    email: EmailStr = Field(..., max_length=255)

class ForgotPasswordRequest(BaseModel):
    email: EmailStr = Field(..., max_length=255)

class ResetPasswordRequest(BaseModel):
    email: EmailStr = Field(..., max_length=255)
    otp: str = Field(..., min_length=6, max_length=6)
    new_password: str = Field(..., min_length=8, max_length=128)

class OtpVerifyRequest(BaseModel):
    email: EmailStr = Field(..., max_length=255)
    otp: str = Field(..., min_length=6, max_length=6)

class InviteCreate(BaseModel):
    name: str = Field(..., max_length=100)
    email: EmailStr = Field(..., max_length=255)
    mobile: Optional[str] = Field(None, max_length=20)
    role: str = Field(..., max_length=30)
    sub_role: Optional[str] = Field(None, max_length=30)
    # Only honoured for super_admin, who has no org_id of their own and must pick
    # a target organization explicitly. Ignored (uses the caller's own org) otherwise.
    org_id: Optional[str] = Field(None, max_length=64)

    @field_validator("name")
    @classmethod
    def sanitize(cls, v: str) -> str:
        return sanitize_input(v)

class InviteActivate(BaseModel):
    password: str = Field(..., min_length=8, max_length=128)
    name: Optional[str] = Field(None, max_length=100)
    mobile: Optional[str] = Field(None, max_length=20)


# ── Helper to assert index exists on startup ──

async def _ensure_org_indexes() -> None:
    try:
        await db.organizations.create_index("org_type")
        await db.invites.create_index("token", unique=True)
        await db.invites.create_index("email")
        await db.invites.create_index("org_id")
        await db.invites.create_index("expires_at", expireAfterSeconds=0)
        await db.users.create_index("org_id")
        await db.otp_verifications.create_index("email", unique=True)
        await db.otp_verifications.create_index("expires_at", expireAfterSeconds=3600)
    except Exception as e:
        logging.warning(f"[org] Index creation skipped: {e}")


# ── Endpoint 0: Registration email OTP ──

@api_router.post("/auth/send-otp")
@limiter.limit("3/minute")
async def send_otp(request: Request, payload: OtpSendRequest):
    """Generate and email a 6-digit OTP for registration email verification."""
    email = payload.email.lower()

    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(400, "Email already registered")

    otp = f"{_secrets_mod.randbelow(1_000_000):06d}"
    now = datetime.utcnow()
    await db.otp_verifications.update_one(
        {"email": email},
        {"$set": {
            "email": email,
            "otp_hash": hash_password(otp),
            "expires_at": now + timedelta(minutes=OTP_EXPIRY_MINUTES),
            "attempts": 0,
            "verified": False,
            "verified_at": None,
            "purpose": "signup",
            "created_at": now,
        }},
        upsert=True,
    )

    sent = await _send_otp_email(email, otp)
    if not sent:
        raise HTTPException(500, "Could not send verification email. Please try again later.")

    return {"message": "OTP sent"}


@api_router.post("/auth/verify-otp")
@limiter.limit("10/minute")
async def verify_otp(request: Request, payload: OtpVerifyRequest):
    email = payload.email.lower()
    record = await db.otp_verifications.find_one({"email": email, "purpose": "signup"})
    if not record:
        raise HTTPException(400, "No OTP requested for this email. Please request a new code.")
    if record["expires_at"] < datetime.utcnow():
        raise HTTPException(410, "OTP expired. Please request a new code.")
    if record.get("attempts", 0) >= OTP_MAX_ATTEMPTS:
        raise HTTPException(429, "Too many incorrect attempts. Please request a new code.")

    if not verify_password(payload.otp, record["otp_hash"]):
        await db.otp_verifications.update_one({"email": email}, {"$inc": {"attempts": 1}})
        raise HTTPException(400, "Incorrect OTP")

    await db.otp_verifications.update_one(
        {"email": email},
        {"$set": {"verified": True, "verified_at": datetime.utcnow()}},
    )
    return {"message": "Email verified"}


# ── Forgot / reset password ──
# Reuses the same otp_verifications collection as the signup-email-verify flow
# (one pending OTP per email, upserted). A "purpose" tag keeps the two flows
# from being confused with each other even though they share storage.

@api_router.post("/auth/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(request: Request, payload: ForgotPasswordRequest):
    """Send a password-reset OTP if the email belongs to an account. Always
    returns the same generic response either way, so the endpoint can't be
    used to enumerate which emails are registered."""
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})

    if user:
        otp = f"{_secrets_mod.randbelow(1_000_000):06d}"
        now = datetime.utcnow()
        await db.otp_verifications.update_one(
            {"email": email},
            {"$set": {
                "email": email,
                "otp_hash": hash_password(otp),
                "expires_at": now + timedelta(minutes=OTP_EXPIRY_MINUTES),
                "attempts": 0,
                "verified": False,
                "verified_at": None,
                "purpose": "password_reset",
                "created_at": now,
            }},
            upsert=True,
        )
        sent = await _send_otp_email(
            email, otp,
            heading="Reset your password",
            intro="Enter this code to set a new password for your Implanr account.",
            footer_note="If you didn't request this, you can safely ignore this email — your password won't be changed.",
            log_tag="password_reset",
        )
        if not sent:
            logging.error("[password_reset] OTP generated but email send FAILED for %s — check SMTP env/deliverability", email)
    else:
        logging.info("[password_reset] No account for %s — no email sent (enumeration-safe)", email)

    return {"message": "If that email is registered, a reset code has been sent."}


@api_router.post("/auth/reset-password")
@limiter.limit("10/minute")
async def reset_password(request: Request, payload: ResetPasswordRequest):
    email = payload.email.lower()
    record = await db.otp_verifications.find_one({"email": email, "purpose": "password_reset"})
    if not record:
        raise HTTPException(400, "No reset code requested for this email. Please request a new code.")
    if record["expires_at"] < datetime.utcnow():
        raise HTTPException(410, "Reset code expired. Please request a new code.")
    if record.get("attempts", 0) >= OTP_MAX_ATTEMPTS:
        raise HTTPException(429, "Too many incorrect attempts. Please request a new code.")

    if not verify_password(payload.otp, record["otp_hash"]):
        await db.otp_verifications.update_one({"email": email}, {"$inc": {"attempts": 1}})
        raise HTTPException(400, "Incorrect code")

    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(404, "Account not found")

    user_id = str(user["_id"])
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"password_hash": hash_password(payload.new_password)}},
    )
    await db.otp_verifications.delete_one({"email": email})
    # Force re-login everywhere — a password reset should kill existing sessions.
    await db.refresh_tokens.delete_many({"user_id": user_id})

    return {"message": "Password reset successfully"}


# ── Any authenticated org member: basic details of their own organization
# (read-only display banner, e.g. atop the Users screen) ──

@api_router.get("/organizations/me")
async def get_my_organization(current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("org_id")
    if not org_id:
        return {"organization": None}
    try:
        org = await db.organizations.find_one({"_id": ObjectId(org_id)})
    except Exception:
        org = None
    if not org:
        return {"organization": None}

    entry = {
        "id": str(org["_id"]),
        "name": org.get("name", ""),
        "org_type": org.get("org_type", ""),
        "logo": org.get("logo"),
        # Default True: students always had this restriction; supervisors are
        # folded into the same toggle since orgs previously had no way to
        # scope it independently, and defaulting closed matches the safer,
        # already-live-for-students behavior until an in-charge opts out.
        "enforce_scheduling_restriction": org.get("enforce_scheduling_restriction", True),
        "scheduling_config": {**DEFAULT_SCHEDULING_CONFIG, **(org.get("scheduling_config") or {})},
    }
    if org.get("org_type") == "college":
        entry["state"] = org.get("state")
    else:
        entry["state_of_registration"] = org.get("state_of_registration")
        entry["state_of_practice"] = org.get("state_of_practice")
        entry["registration_number"] = org.get("registration_number")
    return {"organization": entry}


class OrgLogoUpdate(BaseModel):
    logo: str  # Base64 image data URI


@api_router.put("/organizations/me/logo")
async def update_my_organization_logo(payload: OrgLogoUpdate, current_user: dict = Depends(get_current_user)):
    """Update the logo of the caller's organization. Restricted to the Implant In-Charge."""
    if current_user.get("role") != "implant_incharge":
        raise HTTPException(status_code=403, detail="Only the Implant In-Charge can edit the organization logo")
    org_id = current_user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization associated with this account")
    logo = (payload.logo or "").strip()
    if not logo.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="Logo must be an image data URI")
    try:
        result = await db.organizations.update_one({"_id": ObjectId(org_id)}, {"$set": {"logo": logo}})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid organization")
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"logo": logo}


class SchedulingRestrictionUpdate(BaseModel):
    enforce: bool


@api_router.put("/organizations/me/scheduling-restriction")
async def update_scheduling_restriction(payload: SchedulingRestrictionUpdate, current_user: dict = Depends(get_current_user)):
    """Toggle the 24-hour advance-scheduling restriction for students and
    supervisors in the caller's organization. Implant In-Charge always
    bypasses this restriction regardless of the setting. Restricted to the
    Implant In-Charge — same authority level as the org logo."""
    if current_user.get("role") != "implant_incharge":
        raise HTTPException(status_code=403, detail="Only the Implant In-Charge can change this setting")
    org_id = current_user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization associated with this account")
    try:
        result = await db.organizations.update_one(
            {"_id": ObjectId(org_id)},
            {"$set": {"enforce_scheduling_restriction": bool(payload.enforce)}},
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid organization")
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"enforce_scheduling_restriction": bool(payload.enforce)}


class CustomSlotIn(BaseModel):
    time: str = Field(..., description="24-hour HH:MM")
    label: Optional[str] = None
    days: List[str] = Field(..., min_length=1)


class SchedulingConfigUpdate(BaseModel):
    mode: str  # "default" | "custom" | "open"
    custom_slots: Optional[List[CustomSlotIn]] = None
    open_window_hours: Optional[float] = None


@api_router.put("/organizations/me/scheduling-config")
async def update_scheduling_config(payload: SchedulingConfigUpdate, current_user: dict = Depends(get_current_user)):
    """Set the caller's org scheduling mode (default / custom / open) and its
    mode-specific settings. Implant In-Charge only."""
    if current_user.get("role") != "implant_incharge":
        raise HTTPException(status_code=403, detail="Only the Implant In-Charge can change this setting")
    org_id = current_user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization associated with this account")
    if payload.mode not in ("default", "custom", "open"):
        raise HTTPException(status_code=400, detail="mode must be 'default', 'custom', or 'open'")

    valid_days = set(_WEEKDAY_NAMES)
    cfg: Dict[str, Any] = {"mode": payload.mode, "custom_slots": [], "open_window_hours": 2.0}

    if payload.mode == "custom":
        if not payload.custom_slots:
            raise HTTPException(status_code=400, detail="At least one custom time slot is required")
        slots_out = []
        seen_times = set()
        for s in payload.custom_slots:
            if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", s.time):
                raise HTTPException(status_code=400, detail=f"Invalid time format: {s.time} (expected HH:MM, 24-hour)")
            bad_days = set(s.days) - valid_days
            if bad_days:
                raise HTTPException(status_code=400, detail=f"Invalid day(s): {', '.join(bad_days)}")
            if s.time in seen_times:
                raise HTTPException(status_code=400, detail=f"Duplicate time slot: {s.time}")
            seen_times.add(s.time)
            slots_out.append({"time": s.time, "label": (s.label or "").strip() or s.time, "days": s.days})
        cfg["custom_slots"] = slots_out
    elif payload.mode == "open":
        hours = payload.open_window_hours if payload.open_window_hours is not None else 2.0
        if hours < 0.5 or hours > 8:
            raise HTTPException(status_code=400, detail="Slot duration must be between 0.5 and 8 hours")
        cfg["open_window_hours"] = hours

    try:
        result = await db.organizations.update_one({"_id": ObjectId(org_id)}, {"$set": {"scheduling_config": cfg}})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid organization")
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"scheduling_config": cfg}


# ── super_admin: list all organizations (for the cross-org "Add User" picker) ──

@api_router.get("/organizations")
async def list_organizations(current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Only super admin can list all organizations")
    orgs = []
    async for org in db.organizations.find({}, {"name": 1, "org_type": 1}).sort("name", 1):
        orgs.append({"id": str(org["_id"]), "name": org.get("name", ""), "org_type": org.get("org_type", "")})
    return {"organizations": orgs}


@api_router.get("/organizations/details")
async def list_organizations_detailed(skip: int = 0, limit: int = 20, current_user: dict = Depends(get_current_user)):
    """Full onboarding details + live headcounts for every organization on the
    platform. super_admin only — this is the cross-org oversight view.
    Paginated (skip/limit) for infinite-scroll on the Organizations screen."""
    if not current_user.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Only super admin can view organization details")

    limit = max(1, min(int(limit or 20), 50))
    skip = max(0, int(skip or 0))
    total = await db.organizations.count_documents({})

    results = []
    async for org in db.organizations.find({}).sort("created_at", -1).skip(skip).limit(limit):
        org_id = str(org["_id"])

        role_pipeline = [
            {"$match": {"org_id": org_id}},
            {"$group": {"_id": "$role", "count": {"$sum": 1}}},
        ]
        role_counts: Dict[str, int] = {}
        async for doc in db.users.aggregate(role_pipeline):
            role_counts[doc["_id"]] = doc["count"]
        actual_users = sum(role_counts.values())

        member_ids = await _org_member_ids(org_id)
        cases_total = await db.procedures.count_documents({
            "$or": [
                {"student_id": {"$in": member_ids}},
                {"supervisor_id": {"$in": member_ids}},
                {"created_by_id": {"$in": member_ids}},
            ],
            "archived": {"$ne": True},
        })

        entry = {
            "id": org_id,
            "name": org.get("name", ""),
            "org_type": org.get("org_type", ""),
            "logo": org.get("logo"),
            "created_at": org.get("created_at").isoformat() if org.get("created_at") else None,
            "declared_num_users": org.get("num_users"),
            "actual_user_count": actual_users,
            "role_breakdown": role_counts,
            "cases_total": cases_total,
        }
        if org.get("org_type") == "college":
            entry["state"] = org.get("state")
        else:
            entry["state_of_registration"] = org.get("state_of_registration")
            entry["state_of_practice"] = org.get("state_of_practice")
            entry["registration_number"] = org.get("registration_number")

        results.append(entry)

    return {"organizations": results, "total": total, "skip": skip, "limit": limit}


@api_router.get("/organizations/{org_id}/detail")
async def get_organization_detail(org_id: str, current_user: dict = Depends(get_current_user)):
    """Full drill-down for a single organization: onboarding details, case KPIs,
    phase pipeline, monthly throughput, and role breakdown. super_admin only."""
    if not current_user.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Only super admin can view organization details")

    try:
        org = await db.organizations.find_one({"_id": ObjectId(org_id)})
    except Exception:
        org = None
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    member_ids = await _org_member_ids(org_id)
    base_match: Dict[str, Any] = {
        "$or": [
            {"student_id": {"$in": member_ids}},
            {"supervisor_id": {"$in": member_ids}},
            {"created_by_id": {"$in": member_ids}},
        ],
        "archived": {"$ne": True},
    }

    total = await db.procedures.count_documents(base_match)
    pending = await db.procedures.count_documents({**base_match, "status": {"$in": ["pending_phase1", "pending_phase2", "pending_stage2_surgical", "pending_stage2_prosthetic", "pending_final_delivery"]}})
    approved = await db.procedures.count_documents({**base_match, "status": {"$in": ["phase1_approved", "phase2_approved", "stage2_surgical_approved", "completed"]}})
    rejected = await db.procedures.count_documents({**base_match, "status": {"$in": ["rejected", "stage2_surgical_rejected", "stage2_prosthetic_rejected", "permanently_rejected"]}})
    completed = await db.procedures.count_documents({**base_match, "status": "completed"})

    pipeline = {
        "phase1": await db.procedures.count_documents({**base_match, "status": {"$in": ["draft", "pending_phase1"]}}),
        "phase2": await db.procedures.count_documents({**base_match, "status": {"$in": ["phase1_approved", "pending_phase2"]}}),
        "phase3": await db.procedures.count_documents({**base_match, "status": {"$in": ["phase2_approved", "pending_stage2_surgical"]}}),
        "phase4": await db.procedures.count_documents({**base_match, "status": {"$in": ["stage2_surgical_approved", "pending_stage2_prosthetic", "stage2_prosthetic_step1_approved", "pending_final_delivery"]}}),
        "completed": completed,
        "rejected": rejected,
    }

    role_pipeline = [
        {"$match": {"org_id": org_id}},
        {"$group": {"_id": "$role", "count": {"$sum": 1}}},
    ]
    role_counts: Dict[str, int] = {}
    async for doc in db.users.aggregate(role_pipeline):
        role_counts[doc["_id"]] = doc["count"]

    # Monthly throughput — completed cases per month for the last 6 calendar months
    now = datetime.now(timezone.utc)
    monthly: List[Dict[str, Any]] = []
    for offset in range(5, -1, -1):
        y = now.year
        m = now.month - offset
        while m <= 0:
            m += 12
            y -= 1
        start = datetime(y, m, 1, tzinfo=timezone.utc)
        end = datetime(y + 1, 1, 1, tzinfo=timezone.utc) if m == 12 else datetime(y, m + 1, 1, tzinfo=timezone.utc)
        cnt = await db.procedures.count_documents({
            **base_match,
            "status": "completed",
            "treatment_completed_at": {"$gte": start, "$lt": end},
        })
        monthly.append({"label": start.strftime("%b %Y"), "count": cnt})

    profile = {
        "id": org_id,
        "name": org.get("name", ""),
        "org_type": org.get("org_type", ""),
        "logo": org.get("logo"),
        "created_at": org.get("created_at").isoformat() if org.get("created_at") else None,
        "declared_num_users": org.get("num_users"),
    }
    if org.get("org_type") == "college":
        profile["state"] = org.get("state")
    else:
        profile["state_of_registration"] = org.get("state_of_registration")
        profile["state_of_practice"] = org.get("state_of_practice")
        profile["registration_number"] = org.get("registration_number")

    return {
        "profile": profile,
        "kpis": {"total": total, "pending": pending, "approved": approved, "rejected": rejected, "completed": completed},
        "phase_pipeline": pipeline,
        "role_breakdown": role_counts,
        "monthly_throughput": monthly,
    }


@api_router.get("/organizations/{org_id}/users")
async def get_organization_users(org_id: str, skip: int = 0, limit: int = 20, role: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Paginated user list scoped to a single organization, for the org detail
    screen's infinite-scroll list. super_admin only."""
    if not current_user.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Only super admin can view organization users")

    limit = max(1, min(int(limit or 20), 50))
    skip = max(0, int(skip or 0))
    query: Dict[str, Any] = {"org_id": org_id}
    if role:
        query["role"] = role

    total = await db.users.count_documents(query)
    users = await db.users.find(query, {"password_hash": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    for u in users:
        u["_id"] = str(u["_id"])
        u["id"] = u["_id"]

    return {"users": users, "total": total, "skip": skip, "limit": limit}


# ── Public: names of colleges already onboarded (so the registration picker
# can hide them — each college should only be onboarded once) ──

@api_router.get("/organizations/onboarded-college-names")
async def get_onboarded_college_names():
    names = await db.organizations.distinct("name", {"org_type": "college"})
    return {"names": names}


# ── Public: check whether a dental registration number is already in use by
# an onboarded clinic — lets the clinic signup form flag it before submit. ──

@api_router.get("/organizations/check-registration-number")
async def check_registration_number(number: str):
    number = number.strip()
    if not number:
        return {"exists": False}
    existing = await db.organizations.find_one({
        "org_type": "clinic",
        "registration_number": {"$regex": f"^{re.escape(number)}$", "$options": "i"},
    })
    return {"exists": bool(existing)}


# ── Endpoint 1: Public workspace signup ──

@api_router.post("/auth/signup")
async def workspace_signup(payload: WorkspaceSignup):
    """Create a new organization + primary admin account. No auth required."""
    if payload.org_type == "college" and not payload.college_data:
        raise HTTPException(400, "college_data required for college workspace")
    if payload.org_type == "clinic" and not payload.clinic_data:
        raise HTTPException(400, "clinic_data required for clinic workspace")

    existing = await db.users.find_one({"email": payload.email})
    if existing:
        raise HTTPException(400, "Email already registered")

    otp_record = await db.otp_verifications.find_one({"email": payload.email.lower(), "purpose": "signup"})
    if not otp_record or not otp_record.get("verified"):
        raise HTTPException(400, "Please verify your email with the OTP before continuing")
    verified_at = otp_record.get("verified_at")
    if not verified_at or verified_at < datetime.utcnow() - timedelta(minutes=OTP_VERIFIED_WINDOW_MINUTES):
        raise HTTPException(400, "Email verification expired. Please verify your email again.")

    if payload.org_type == "college":
        existing_college = await db.organizations.find_one({
            "org_type": "college",
            "name": {"$regex": f"^{re.escape(payload.college_data.college_name.strip())}$", "$options": "i"},
        })
        if existing_college:
            raise HTTPException(400, "This college has already been onboarded. Contact your Implant In-Charge for access.")
    else:
        existing_clinic = await db.organizations.find_one({
            "org_type": "clinic",
            "registration_number": {"$regex": f"^{re.escape(payload.clinic_data.registration_number.strip())}$", "$options": "i"},
        })
        if existing_clinic:
            raise HTTPException(400, "This registration number is already onboarded. Contact your Chief Dentist for access.")

    # Build org document
    now = datetime.utcnow()
    if payload.org_type == "college":
        d = payload.college_data
        full_name = f"{d.incharge_prefix} {d.incharge_name}".strip()
        admin_role = "implant_incharge"
        org_doc = {
            "org_type": "college",
            "name": d.college_name,
            "state": d.state,
            "num_users": d.num_users,
            "logo": payload.logo,
            "created_at": now,
        }
    else:
        d = payload.clinic_data
        full_name = f"{d.chief_dentist_prefix} {d.chief_dentist_name}".strip()
        admin_role = "chief_dentist"
        org_doc = {
            "org_type": "clinic",
            "name": d.clinic_name,
            "state_of_registration": d.state_of_registration,
            "state_of_practice": d.state_of_practice,
            "registration_number": d.registration_number,
            "num_users": d.num_users,
            "logo": payload.logo,
            "created_at": now,
        }

    org_result = await db.organizations.insert_one(org_doc)
    org_id = str(org_result.inserted_id)

    user_doc = {
        "name": full_name,
        "email": payload.email,
        "password_hash": hash_password(payload.password),
        "role": admin_role,
        "org_id": org_id,
        "created_at": now,
    }
    user_result = await db.users.insert_one(user_doc)
    user_id = str(user_result.inserted_id)
    await db.otp_verifications.delete_one({"email": payload.email.lower()})

    access_token = create_access_token({"user_id": user_id})
    refresh_token = create_refresh_token({"user_id": user_id})
    await db.refresh_tokens.insert_one({
        "user_id": user_id,
        "token": refresh_token,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
    })

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "name": full_name,
            "email": payload.email,
            "role": admin_role,
            "org_id": org_id,
            "org_name": org_doc["name"],
            "org_type": payload.org_type,
        }
    }


# ── Endpoint 2: Admin sends invite ──

@api_router.post("/organizations/invite")
async def send_invite(payload: InviteCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("implant_incharge", "administrator"):
        raise HTTPException(403, "Only admins can invite users")

    if current_user.get("is_super_admin"):
        org_id = payload.org_id
        if not org_id:
            raise HTTPException(400, "org_id is required when inviting as super admin")
    else:
        org_id = current_user.get("org_id")
        if not org_id:
            raise HTTPException(400, "Your account is not linked to an organization")

    org = await db.organizations.find_one({"_id": ObjectId(org_id)})
    if not org:
        raise HTTPException(404, "Organization not found")

    # Validate role for this org type
    allowed_roles = COLLEGE_ROLES if org["org_type"] == "college" else CLINIC_ROLES
    if payload.role not in allowed_roles:
        raise HTTPException(400, f"Role '{payload.role}' not valid for {org['org_type']} workspace")

    # Enforce max 2 per incharge/chief_dentist role
    if payload.role in MAX_2_ROLES:
        count = await db.users.count_documents({"org_id": org_id, "role": payload.role})
        if count >= 2:
            raise HTTPException(400, f"Maximum 2 users allowed with role '{payload.role}'")

    existing_user = await db.users.find_one({"email": payload.email})
    if existing_user:
        raise HTTPException(400, "A user with this email already exists")

    existing_invite = await db.invites.find_one({
        "email": payload.email,
        "org_id": org_id,
        "accepted": False,
        "revoked": False,
        "expires_at": {"$gt": datetime.utcnow()},
    })
    if existing_invite:
        raise HTTPException(400, "An active invite already exists for this email")

    token = _secrets_mod.token_urlsafe(32)
    now = datetime.utcnow()
    invite_doc = {
        "token": token,
        "org_id": org_id,
        "org_name": org["name"],
        "org_type": org["org_type"],
        "email": payload.email,
        "name": payload.name,
        "mobile": payload.mobile,
        "role": payload.role,
        "sub_role": payload.sub_role,
        "invited_by": current_user["_id"],
        "invited_by_name": current_user.get("name", ""),
        "created_at": now,
        "expires_at": now + timedelta(days=INVITE_EXPIRY_DAYS),
        "accepted": False,
        "revoked": False,
    }
    result = await db.invites.insert_one(invite_doc)

    await _send_invite_email(
        to_email=payload.email,
        to_name=payload.name,
        org_name=org["name"],
        role_display=_role_display_name(payload.role),
        token=token,
        org_type=org.get("org_type", "college"),
    )

    return {"message": "Invite sent", "invite_id": str(result.inserted_id)}


# ── Endpoint 3: Validate invite token (public) ──

@api_router.get("/organizations/invite/{token}")
async def get_invite(token: str):
    invite = await db.invites.find_one({"token": token})
    if not invite:
        raise HTTPException(404, "Invite not found or expired")
    if invite.get("revoked"):
        raise HTTPException(410, "This invite has been revoked")
    if invite.get("accepted"):
        raise HTTPException(410, "This invite has already been used")
    if invite["expires_at"] < datetime.utcnow():
        raise HTTPException(410, "This invite has expired")
    return {
        "org_name": invite["org_name"],
        "org_type": invite["org_type"],
        "name": invite["name"],
        "email": invite["email"],
        "role": invite["role"],
        "role_display": _role_display_name(invite["role"]),
        "sub_role": invite.get("sub_role"),
    }


# ── Endpoint 4: Activate invite (create account) ──

@api_router.post("/organizations/invite/{token}/activate")
async def activate_invite(token: str, payload: InviteActivate):
    invite = await db.invites.find_one({"token": token})
    if not invite:
        raise HTTPException(404, "Invite not found or expired")
    if invite.get("revoked"):
        raise HTTPException(410, "This invite has been revoked")
    if invite.get("accepted"):
        raise HTTPException(410, "This invite has already been used")
    if invite["expires_at"] < datetime.utcnow():
        raise HTTPException(410, "This invite has expired")

    existing = await db.users.find_one({"email": invite["email"]})
    if existing:
        raise HTTPException(400, "An account with this email already exists")

    now = datetime.utcnow()
    display_name = (payload.name or invite["name"]).strip()
    user_doc = {
        "name": display_name,
        "email": invite["email"],
        "password_hash": hash_password(payload.password),
        "role": invite["role"],
        "sub_role": invite.get("sub_role"),
        "mobile": payload.mobile or invite.get("mobile"),
        "org_id": invite["org_id"],
        "created_at": now,
    }
    user_result = await db.users.insert_one(user_doc)
    user_id = str(user_result.inserted_id)

    await db.invites.update_one(
        {"_id": invite["_id"]},
        {"$set": {"accepted": True, "accepted_at": now, "accepted_user_id": user_id}},
    )

    access_token = create_access_token({"user_id": user_id})
    refresh_token = create_refresh_token({"user_id": user_id})
    await db.refresh_tokens.insert_one({
        "user_id": user_id,
        "token": refresh_token,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
    })

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "name": display_name,
            "email": invite["email"],
            "role": invite["role"],
            "org_id": invite["org_id"],
            "org_name": invite["org_name"],
            "org_type": invite["org_type"],
        }
    }


# ── Endpoint 5: List org users + invites (admin) ──

@api_router.get("/organizations/members")
async def list_org_members(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("implant_incharge", "chief_dentist", "administrator"):
        raise HTTPException(403, "Admins only")

    org_id = current_user.get("org_id")
    if not org_id:
        raise HTTPException(400, "Account not linked to an organization")

    # Active + disabled users
    users_cursor = db.users.find({"org_id": org_id}, {"password_hash": 0})
    users = []
    async for u in users_cursor:
        u["id"] = str(u.pop("_id"))
        users.append(u)

    # Pending invites (not accepted, not revoked, not expired)
    now = datetime.utcnow()
    pending_cursor = db.invites.find({
        "org_id": org_id,
        "accepted": False,
        "revoked": False,
        "expires_at": {"$gt": now},
    })
    pending = []
    async for inv in pending_cursor:
        inv["id"] = str(inv.pop("_id"))
        pending.append(inv)

    return {"active_users": users, "pending_invites": pending}


# ── Endpoint 6: Revoke invite ──

@api_router.delete("/organizations/invites/{invite_id}")
async def revoke_invite(invite_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("implant_incharge", "administrator"):
        raise HTTPException(403, "Admins only")

    org_id = current_user.get("org_id")
    try:
        obj_id = ObjectId(invite_id)
    except Exception:
        raise HTTPException(400, "Invalid invite ID")

    invite = await db.invites.find_one({"_id": obj_id, "org_id": org_id})
    if not invite:
        raise HTTPException(404, "Invite not found")
    if invite.get("accepted"):
        raise HTTPException(400, "Invite already accepted — cannot revoke")

    await db.invites.update_one({"_id": obj_id}, {"$set": {"revoked": True, "revoked_at": datetime.utcnow()}})
    return {"message": "Invite revoked"}


# ── Endpoint 7: Resend invite ──

@api_router.post("/organizations/invites/{invite_id}/resend")
async def resend_invite(invite_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("implant_incharge", "administrator"):
        raise HTTPException(403, "Admins only")

    org_id = current_user.get("org_id")
    try:
        obj_id = ObjectId(invite_id)
    except Exception:
        raise HTTPException(400, "Invalid invite ID")

    invite = await db.invites.find_one({"_id": obj_id, "org_id": org_id})
    if not invite:
        raise HTTPException(404, "Invite not found")
    if invite.get("accepted"):
        raise HTTPException(400, "Invite already accepted")
    if invite.get("revoked"):
        raise HTTPException(400, "Invite was revoked")

    # Regenerate token + extend expiry
    new_token = _secrets_mod.token_urlsafe(32)
    new_expiry = datetime.utcnow() + timedelta(days=INVITE_EXPIRY_DAYS)
    await db.invites.update_one(
        {"_id": obj_id},
        {"$set": {"token": new_token, "expires_at": new_expiry, "resent_at": datetime.utcnow()}},
    )

    await _send_invite_email(
        to_email=invite["email"],
        to_name=invite["name"],
        org_name=invite["org_name"],
        role_display=_role_display_name(invite["role"]),
        token=new_token,
        org_type=invite.get("org_type", "college"),
    )

    return {"message": "Invite resent"}


# ── Endpoint 8: Disable user ──

@api_router.put("/organizations/users/{user_id}/disable")
async def disable_user(user_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("implant_incharge", "chief_dentist", "administrator"):
        raise HTTPException(403, "Admins only")
    org_id = current_user.get("org_id")
    try:
        obj_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(400, "Invalid user ID")
    target = await db.users.find_one({"_id": obj_id, "org_id": org_id})
    if not target:
        raise HTTPException(404, "User not found in your organization")
    if str(obj_id) == current_user.get("id"):
        raise HTTPException(400, "Cannot disable your own account")
    await db.users.update_one({"_id": obj_id}, {"$set": {"disabled": True, "disabled_at": datetime.utcnow()}})
    return {"message": "User disabled"}


# ── Endpoint 9: Enable user ──

@api_router.put("/organizations/users/{user_id}/enable")
async def enable_user(user_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("implant_incharge", "chief_dentist", "administrator"):
        raise HTTPException(403, "Admins only")
    org_id = current_user.get("org_id")
    try:
        obj_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(400, "Invalid user ID")
    target = await db.users.find_one({"_id": obj_id, "org_id": org_id})
    if not target:
        raise HTTPException(404, "User not found in your organization")
    await db.users.update_one({"_id": obj_id}, {"$set": {"disabled": False}, "$unset": {"disabled_at": ""}})
    return {"message": "User enabled"}


# ── Endpoint 10: Cross-app access status ──

@api_router.get("/auth/cross-app-status")
async def cross_app_status(current_user: dict = Depends(get_current_user)):
    """Return whether this user has access to the other app context."""
    return {
        "has_cross_app_access": bool(current_user.get("cross_app_access")),
        "cross_app_requested": bool(current_user.get("cross_app_requested")),
        "org_type": current_user.get("org_type", "college"),
    }


# ── Endpoint 11: Request cross-app access ──

@api_router.post("/auth/request-cross-app-access")
async def request_cross_app_access(current_user: dict = Depends(get_current_user)):
    """User requests access to the opposite app (college↔clinic). Superadmin grants."""
    if current_user.get("cross_app_access"):
        return {"message": "Access already granted"}
    await db.users.update_one(
        {"_id": ObjectId(current_user["id"])},
        {"$set": {"cross_app_requested": True, "cross_app_requested_at": datetime.utcnow()}},
    )
    return {"message": "Request submitted. A platform admin will review your request."}


# ─── Prosthetic Plan Options Data ──────────────────────────────────
PROSTHETIC_OPTIONS = {
    "single_crown": [
        "Cement Retained Crown - Metal",
        "Cement Retained Crown - Porcelain Fused to Metal",
        "Cement Retained Crown - Zirconia",
        "Cement Retained Crown - Lithium Disilicate",
        "Screw Retained Crown - Metal",
        "Screw Retained Crown - Porcelain Fused to Metal",
        "Screw Retained Crown - Zirconia",
        "Screw Retained Crown - Lithium Disilicate",
    ],
    "bridge": [
        "Cement Retained Bridge - Metal",
        "Cement Retained Bridge - Porcelain Fused to Metal",
        "Cement Retained Bridge - Zirconia",
        "Cement Retained Bridge - Lithium Disilicate",
        "Screw Retained Bridge - Metal",
        "Screw Retained Bridge - Porcelain Fused to Metal",
        "Screw Retained Bridge - Zirconia",
        "Screw Retained Bridge - Lithium Disilicate",
        "Overdenture with Attachment",
    ],
    "immediate_loading": [
        "PMMA Crown with Temporary Abutment",
        "PMMA Crown with Ti-Base",
        "Full Arch Temporary Prosthesis with Multiunit and Temporary Cylinders",
        "Temporary PMMA CAD Prosthesis with Multiunit and Temporary Cylinders",
        "Temporary PMMA CAD Prosthesis on Ti-Base",
    ],
    "full_arch": [
        "Full Arch Co-Cr Framework Removable Denture",
        "Full Arch Porcelain Fused to Metal Prosthesis",
        "Full Arch Co-Cr Framework Zirconia Prosthesis",
        "Full Arch Titanium Framework Zirconia Prosthesis",
        "Full Arch Peek Framework Zirconia Ti Base",
    ],
}

PROCEDURE_TYPES = [
    "Single Conventional Implant",
    "Multiple Conventional Implants",
    "Immediate Implant",
    "Sinus Lift",
    "Partial Extraction Therapy",
    "Implant Placement with Guided Bone Regeneration",
    "Guided Surgery",
    "All on 4",
    "All on 6",
    "All on X",
]

LOADING_TYPES = ["Immediate Loading", "Early Loading", "Delayed Loading"]

@api_router.get("/case-form-options")
async def get_case_form_options():
    """Return all dropdown options for the New Case form."""
    return {
        "procedure_types": PROCEDURE_TYPES,
        "loading_types": LOADING_TYPES,
        "prosthetic_options": PROSTHETIC_OPTIONS,
    }

@api_router.get("/prosthetic-options")
async def get_prosthetic_options(procedure_type: str = "", loading_type: str = ""):
    """Return prosthetic plan options based on procedure type and loading type."""
    options = []
    single_types = {
        "Single Conventional Implant", "Immediate Implant",
        "Partial Extraction Therapy", "Implant Placement with GBR",
    }
    bridge_types = {
        "Multiple Conventional Implants", "Immediate Implant",
        "Partial Extraction Therapy", "Implant Placement with GBR",
    }
    full_arch_types = {"All on 4", "All on 6", "All on X"}

    if procedure_type in single_types:
        options.extend(PROSTHETIC_OPTIONS["single_crown"])
    if procedure_type in bridge_types:
        options.extend(PROSTHETIC_OPTIONS["bridge"])
    if procedure_type in full_arch_types:
        options.extend(PROSTHETIC_OPTIONS["full_arch"])
    # Immediate loading options always available when Immediate Loading is selected
    loading_list = loading_type.split(",") if loading_type else []
    if "Immediate Loading" in loading_list:
        options.extend(PROSTHETIC_OPTIONS["immediate_loading"])
    # Remove duplicates preserving order
    seen = set()
    unique = []
    for o in options:
        if o not in seen:
            seen.add(o)
            unique.append(o)
    return {"options": unique}


# Procedure Routes

# FDI full-mouth set (32 permanent teeth). Used to derive `teeth_present`
# from `missing_teeth` so existing reports/PDFs keep working unchanged.
ALL_FDI_TEETH = [
    "11","12","13","14","15","16","17","18",
    "21","22","23","24","25","26","27","28",
    "31","32","33","34","35","36","37","38",
    "41","42","43","44","45","46","47","48",
]

# Procedure types that use the FDI chart. Full-arch types (All on 4/6/X) do not.
_HEALED_EDENTULOUS = {
    "Conventional Single Implant",
    "Multiple Conventional Implants",
    "Implant Placement with Guided Bone Regeneration",
    "Guided Surgery",
}
_EXTRACT_AND_PLACE = {"Immediate Implant", "Partial Extraction Therapy"}


def _validate_missing_teeth(proc_type: Optional[str], missing_teeth: Optional[List[str]]):
    """Enforce teeth-count rules based on implant procedure type.
    Single -> exactly 1. Multiple -> >=2. GBR/Guided/Immediate/PET -> >=1.
    Full-arch (All on 4/6/X) types skip this check (no FDI chart used)."""
    if not proc_type:
        return
    teeth = [t for t in (missing_teeth or []) if t in ALL_FDI_TEETH]
    if proc_type == "Conventional Single Implant" and len(teeth) != 1:
        raise HTTPException(status_code=400, detail="Conventional Single Implant requires exactly 1 missing tooth to be marked.")
    if proc_type == "Multiple Conventional Implants" and len(teeth) < 2:
        raise HTTPException(status_code=400, detail="Multiple Conventional Implants requires at least 2 missing teeth to be marked.")
    if proc_type in (_HEALED_EDENTULOUS | _EXTRACT_AND_PLACE) and len(teeth) < 1:
        raise HTTPException(status_code=400, detail=f"{proc_type} requires at least 1 tooth to be marked on the FDI chart.")


def _apply_missing_teeth_derive(payload: Dict[str, Any]) -> None:
    """When `missing_teeth` is provided, auto-compute `teeth_present` = all 32 − missing_teeth
    so existing PDFs, queries, and reports keep working unchanged. Mutates in-place."""
    mt = payload.get("missing_teeth")
    if mt is not None and isinstance(mt, list):
        clean = [t for t in mt if t in ALL_FDI_TEETH]
        payload["missing_teeth"] = clean
        payload["teeth_present"] = [t for t in ALL_FDI_TEETH if t not in clean]


@api_router.post("/procedures/with-existing-implants")
async def create_procedure_with_existing_implants(
    payload: ProcedureCreateExistingImplants,
    current_user: dict = Depends(get_current_user),
):
    """iter-211 Path A — patient already has implants placed (elsewhere /
    earlier), needs a fresh prosthetic plan. Skips Phases 1-3 entirely and
    lands the case in the Phase 4 Step 1 inbox of the assigned implant
    in-charge."""
    allowed_roles = {"student", "supervisor", "implant_incharge", "administrator"}
    if current_user["role"] not in allowed_roles:
        raise HTTPException(status_code=403, detail="You do not have permission to create procedures")

    is_student = current_user["role"] == "student"

    # iter-222: Skip scheduling guards (Sunday block, 24h-advance, slot
    # conflict) for existing-implant cases. The `procedure_date` field is a
    # synthetic placeholder ("today") since the actual surgery already
    # happened — there's no real appointment being scheduled, so the policy
    # checks would only ever produce false positives (esp. for draft-resume
    # where the same record self-conflicts on its own saved date).

    procedure_dict = payload.model_dump()
    existing_impl_count = len(payload.existing_implants)

    # iter-213: status routing based on phase_to_start. 'phase4_step1'
    # (default) preserves the iter-211 behaviour. 'phase3' routes the case
    # to the Phase 3 inbox (ISQ + healing-abutment swap pending) with only
    # Phase 1+2 pre-stamped. 'draft' keeps the case parked without phase
    # progression so the operator can return and finish it.
    #
    # iter-228: When `phase_to_start` is 'phase3' or 'phase4_step1' we no
    # longer auto-stamp Phase 1 as approved. The case enters the standard
    # `pending_phase1` review queue (supervisor → implant-incharge approve)
    # and the chosen target is recorded on `existing_phase_to_start` so the
    # approve endpoint can route it to the correct downstream phase after
    # both approvals land. Phase 2 stays skipped because no surgery is
    # performed by us — Phase 1 captures the intake exam and we go
    # straight to Phase 3 / Phase 4 Step 1 once approved.
    phase_to_start = (payload.phase_to_start or "phase4_step1").lower()
    if phase_to_start == "draft":
        new_status = "draft"
        new_phase = 0
        existing_phase_to_start: Optional[str] = None
    elif phase_to_start == "phase3":
        new_status = "pending_phase1"
        new_phase = 1
        existing_phase_to_start = "phase3"
    else:
        new_status = "pending_phase1"
        new_phase = 1
        existing_phase_to_start = "phase4_step1"

    # Mark phase 2 as skipped (no surgery in our clinic — the implants were
    # placed elsewhere). Phase 1 is NOT skipped any more — the student /
    # supervisor / in-charge fills it just like a routine case.
    procedure_dict.update({
        "case_origin": "existing_implants",
        "phase1_skipped": False,
        "phase2_skipped": True,
        # Phase 3 is skipped only if the user routed straight to Phase 4
        # Step 1. Recorded once the approve endpoint stamps Phase 1.
        "phase3_skipped": existing_phase_to_start == "phase4_step1",
        "existing_phase_to_start": existing_phase_to_start,
        # Keep the conventional fields populated so legacy readers (Lab Slip
        # PDF, dashboard widgets) that key off implant_procedure_type don't
        # break. We pick the closest matching label given the count.
        "implant_procedure_type": (
            payload.original_procedure_type
            or ("Single Conventional Implant" if existing_impl_count == 1 else "Multiple Conventional Implants")
        ),
        "number_of_implants": existing_impl_count,
        "loading_type": [],
        "checklist": None,
        "implant_plans": [],   # the Lab Slip will fall back to existing_implants
        "teeth_present": [],
        "missing_teeth": [r.tooth for r in payload.existing_implants],
        "status": new_status,
        "current_phase": new_phase,
        # Phase 1 approval defaults — overridden per role below.
        "supervisor_phase1_approved": False,
        "implant_incharge_phase1_approved": False,
        # Phase 2 approvals stay auto-stamped because Phase 2 is skipped.
        "supervisor_phase2_approved": True,
        "implant_incharge_phase2_approved": True,
        "phase3_approved": False,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    })

    # Role-based ownership block (mirrors the fresh-case endpoint).
    if is_student:
        procedure_dict.update({
            "student_id": current_user["_id"],
            "student_name": payload.student_name or current_user["name"],
            "created_by_role": current_user.get("_original_role", "student"),
        })
    else:
        procedure_dict.update({
            "student_id": None,
            "student_name": "",
            "created_by_role": current_user.get("_original_role", current_user["role"]),
        })
    procedure_dict["created_by_id"] = current_user["_id"]
    procedure_dict["created_by_name"] = current_user["name"]

    # iter-228: Mirror routine `POST /procedures` behaviour for Phase 1
    # approval auto-stamping when the case is being routed through the
    # standard review flow (`pending_phase1`).
    #   • Supervisor creating: own Phase 1 approval auto-stamped — in-charge
    #     still needs to approve.
    #   • Implant in-charge creating: kept un-stamped here; the existing
    #     `is_incharge_self_created` branch inside `approve_procedure` will
    #     auto-stamp both roles when the in-charge approves their own case.
    #   • Student creating: nothing auto-stamped — full review flow.
    if new_status == "pending_phase1" and current_user["role"] == "supervisor":
        procedure_dict["supervisor_phase1_approved"] = True
        procedure_dict["supervisor_phase1_approved_at"] = datetime.utcnow()

    # case_id is computed on read (see /badge endpoint and the
    # `IMP<last 4 of _id>` fallback) — no eager generation needed here.

    # iter-222: Update-in-place when a procedure_id is supplied (draft resume
    # flow). Otherwise insert a new row.
    if payload.procedure_id:
        try:
            obj_pid = ObjectId(payload.procedure_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid procedure_id.")
        existing = await db.procedures.find_one({"_id": obj_pid})
        if not existing:
            raise HTTPException(status_code=404, detail="Draft procedure not found.")
        if existing.get("created_by_id") and existing.get("created_by_id") != current_user["_id"] and current_user["role"] not in ("supervisor", "implant_incharge", "administrator"):
            raise HTTPException(status_code=403, detail="You don't have permission to update this draft.")
        # Preserve immutable identity fields from the original record.
        procedure_dict["_id"] = existing["_id"]
        procedure_dict["created_at"] = existing.get("created_at", procedure_dict.get("created_at"))
        procedure_dict["created_by_id"] = existing.get("created_by_id", procedure_dict.get("created_by_id"))
        procedure_dict["created_by_name"] = existing.get("created_by_name", procedure_dict.get("created_by_name"))
        procedure_dict["created_by_role"] = existing.get("created_by_role", procedure_dict.get("created_by_role"))
        procedure_dict["student_id"] = existing.get("student_id", procedure_dict.get("student_id"))
        await db.procedures.replace_one({"_id": existing["_id"]}, procedure_dict)
        new_id = str(existing["_id"])
    else:
        result = await db.procedures.insert_one(procedure_dict)
        new_id = str(result.inserted_id)

    # Best-effort access-log entry for HIPAA traceability (matches existing
    # patterns elsewhere in this file). Keep this lightweight — never blocks
    # the response if logging fails.
    try:
        await db.access_logs.insert_one({
            "action": "create_procedure_existing_implants",
            "outcome": "success",
            "user_id": current_user["_id"],
            "user_name": current_user["name"],
            "user_role": current_user["role"],
            "resource_type": "procedure",
            "resource_id": new_id,
            "ts": datetime.now(timezone.utc),
            "metadata": {
                "existing_implants_count": existing_impl_count,
                "had_prosthesis": payload.prosthesis_history.had_prosthesis,
                "prosthesis_failed": payload.prosthesis_history.failed,
            },
        })
    except Exception:
        pass

    # case_id is derived on read; mirror the same `IMP<last 4>` fallback here.
    case_id_resp = procedure_dict.get("case_id") or f"IMP{new_id[-4:].upper()}"
    return {"id": new_id, "case_id": case_id_resp, "status": new_status, "current_phase": new_phase}


@api_router.post("/procedures")
async def create_procedure(procedure: ProcedureCreate, current_user: dict = Depends(get_current_user)):
    # Students, supervisors, and implant_incharge can create procedures
    allowed_roles = {"student", "supervisor", "implant_incharge", "administrator"}
    if current_user["role"] not in allowed_roles:
        raise HTTPException(status_code=403, detail="You do not have permission to create procedures")
    
    is_student = current_user["role"] == "student"
    is_supervisor = current_user["role"] == "supervisor"
    is_incharge = current_user["role"] in ("implant_incharge", "administrator")

    # Org-configurable scheduling: mode (default/custom/open) + the 24h
    # advance-booking toggle. Both set by the Implant In-Charge from
    # Organization Settings; fetched once here for the checks below.
    org_id = current_user.get("org_id")
    sched_cfg = await _get_org_scheduling_config(org_id)
    sched_mode = sched_cfg.get("mode", "default")
    org_enforces_restriction = True
    if org_id:
        try:
            org_doc = await db.organizations.find_one({"_id": ObjectId(org_id)}, {"enforce_scheduling_restriction": 1})
            if org_doc is not None:
                org_enforces_restriction = org_doc.get("enforce_scheduling_restriction", True)
        except Exception:
            pass

    # Check scheduling restrictions
    procedure_datetime: Optional[datetime] = None
    try:
        procedure_datetime = datetime.strptime(f"{procedure.procedure_date} {procedure.procedure_time}", "%Y-%m-%d %H:%M")
    except ValueError:
        procedure_datetime = None  # bad date/time format — caught by field validation below

    if procedure_datetime is not None:
        day_name = _WEEKDAY_NAMES[procedure_datetime.weekday()]

        if sched_mode == "default":
            # Block Sunday scheduling for everyone
            if procedure_datetime.weekday() == 6:  # Sunday
                raise HTTPException(status_code=400, detail="No scheduling is available on Sundays.")
            # Saturday: only 10:00 AM slot
            if procedure_datetime.weekday() == 5 and procedure.procedure_time != "10:00":
                raise HTTPException(status_code=400, detail="Only 10:00 AM slot is available on Saturdays.")
        elif sched_mode == "custom":
            day_slots = [s for s in (sched_cfg.get("custom_slots") or []) if day_name in (s.get("days") or [])]
            if not day_slots:
                raise HTTPException(status_code=400, detail=f"No procedure slots are configured for {day_name}.")
            if procedure.procedure_time not in {s.get("time") for s in day_slots}:
                raise HTTPException(status_code=400, detail="Selected time slot is not available on this day.")
        # sched_mode == "open": any day/time is allowed here; the duration-
        # based overlap check below is what actually guards occupancy.

        # 24-hour restriction for students and supervisors — org-configurable
        # by the Implant In-Charge (default: enforced). In-Charge/Admin always
        # bypass this regardless of the setting.
        if (is_student or is_supervisor) and org_enforces_restriction:
            hours_until_procedure = (procedure_datetime - datetime.now()).total_seconds() / 3600
            if hours_until_procedure < 24:
                role_label = "Students" if is_student else "Supervisors"
                raise HTTPException(
                    status_code=400,
                    detail=f"{role_label} cannot schedule procedures less than 24 hours in advance. Please select a date at least 24 hours from now."
                )

    # ── Slot conflict check ──
    if sched_mode == "open" and procedure_datetime is not None:
        # Open-window mode: a booking at T occupies [T, T + open_window_hours).
        # Same-day bookings conflict if their windows overlap. Uses the org's
        # CURRENT duration setting for existing bookings too (duration isn't
        # stored per-booking) — if the in-charge changes it later, past
        # bookings are reinterpreted under the new duration for this check.
        window_hours = float(sched_cfg.get("open_window_hours") or 2.0)
        new_end = procedure_datetime + timedelta(hours=window_hours)
        same_day = await db.procedures.find(
            {"procedure_date": procedure.procedure_date},
            {"_id": 1, "procedure_time": 1, "patient_name": 1, "created_by_name": 1,
             "student_name": 1, "status": 1, "created_by_id": 1, "student_id": 1},
        ).to_list(200)
        for other in same_day:
            is_own_draft = other.get("status") == "draft" and (
                other.get("created_by_id") == current_user["_id"] or
                other.get("student_id") == current_user["_id"]
            )
            if is_own_draft:
                continue
            try:
                other_start = datetime.strptime(f"{procedure.procedure_date} {other['procedure_time']}", "%Y-%m-%d %H:%M")
            except (ValueError, KeyError, TypeError):
                continue
            other_end = other_start + timedelta(hours=window_hours)
            if procedure_datetime < other_end and other_start < new_end:
                booked_by = other.get("created_by_name") or other.get("student_name") or "Unknown"
                patient = other.get("patient_name", "Unknown")
                raise HTTPException(
                    status_code=409,
                    detail=f"This time overlaps an existing booking ({other_start.strftime('%I:%M %p')}–{other_end.strftime('%I:%M %p')}) for patient {patient} (scheduled by {booked_by}). Please choose a different time."
                )
    else:
        # ── Duplicate slot check: only 1 patient per slot per day (default/custom modes) ──
        existing = await db.procedures.find_one({
            "procedure_date": procedure.procedure_date,
            "procedure_time": procedure.procedure_time,
        })
        if existing:
            # Allow if it's the user's own draft being continued
            is_own_draft = existing.get("status") == "draft" and (
                existing.get("created_by_id") == current_user["_id"] or
                existing.get("student_id") == current_user["_id"]
            )
            if not is_own_draft:
                booked_by = existing.get("created_by_name") or existing.get("student_name") or "Unknown"
                patient = existing.get("patient_name", "Unknown")
                if sched_mode == "custom":
                    match = next((s for s in (sched_cfg.get("custom_slots") or []) if s.get("time") == procedure.procedure_time), None)
                    slot_label = (match or {}).get("label") or procedure.procedure_time
                else:
                    slot_label = "10:00 AM" if procedure.procedure_time == "10:00" else "2:00 PM"
                raise HTTPException(
                    status_code=409,
                    detail=f"The {slot_label} slot on {procedure.procedure_date} is already booked for patient {patient} (scheduled by {booked_by}). Please choose a different time or date."
                )

    # Validate mandatory fields
    valid_procedure_types = [
        "Single Conventional Implant", "Multiple Conventional Implants",
        "Immediate Implant", "Partial Extraction Therapy",
        "Implant Placement with Guided Bone Regeneration", "Guided Surgery",
          "Sinus Lift",
        "All on 4", "All on 6", "All on X",
    ]
    if procedure.implant_procedure_type not in valid_procedure_types:
        raise HTTPException(status_code=400, detail=f"Invalid implant procedure type: {procedure.implant_procedure_type}")

    # iter-328: Sinus Lift gates — validate the cascading sub-fields and
    # restrict the tooth set to the maxillary posterior (14-17, 24-27).
    if procedure.implant_procedure_type == "Sinus Lift":
        if procedure.sinus_lift_type not in ("Direct Sinus Lift", "Indirect Sinus Lift"):
            raise HTTPException(status_code=400, detail="Sinus Lift requires a Type of Sinus Lift (Direct or Indirect).")
        if not (procedure.bone_graft_material_details or "").strip():
            raise HTTPException(status_code=400, detail="Sinus Lift requires Details of Bone Graft Material.")
        _SINUS_LIFT_VALID = {"14", "15", "16", "17", "24", "25", "26", "27"}
        invalid = [t for t in (procedure.missing_teeth or []) if str(t) not in _SINUS_LIFT_VALID]
        if invalid:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Sinus Lift procedure selected, choose appropriate tooth/teeth. "
                    f"Eligible only for maxillary posteriors (14-17, 24-27). Invalid: {', '.join(invalid)}."
                ),
            )

    valid_loading = {"Immediate Loading", "Early Loading", "Delayed Loading"}
    if procedure.loading_type:
        for lt in procedure.loading_type:
            if lt not in valid_loading:
                raise HTTPException(status_code=400, detail=f"Invalid loading type: {lt}")
    
    procedure_dict = procedure.model_dump()
    
    if is_student:
        # Student creates: standard draft flow
        procedure_dict.update({
            "student_id": current_user["_id"],
            "student_name": procedure.student_name or current_user["name"],
            "status": "draft",
            "current_phase": 1,
            "supervisor_phase1_approved": False,
            "implant_incharge_phase1_approved": False,
            "supervisor_phase2_approved": False,
            "implant_incharge_phase2_approved": False,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "created_by_role": current_user.get("_original_role", "student"),
        })
    elif is_supervisor:
        # Supervisor creates: supervisor approval implicit, only incharge needs to approve
        procedure_dict.update({
            "student_id": None,
            "student_name": "",
            "status": "draft",
            "current_phase": 1,
            "supervisor_phase1_approved": True,
            "supervisor_phase1_approved_at": datetime.utcnow(),
            "implant_incharge_phase1_approved": False,
            "supervisor_phase2_approved": True,
            "supervisor_phase2_approved_at": datetime.utcnow(),
            "implant_incharge_phase2_approved": False,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "created_by_role": current_user.get("_original_role", "supervisor"),
            "created_by_id": current_user["_id"],
            "created_by_name": current_user["name"],
        })
    elif is_incharge:
        # Implant In-Charge creates: starts as draft, goes through normal approval flow
        procedure_dict.update({
            "student_id": None,
            "student_name": "",
            "status": "draft",
            "current_phase": 1,
            "supervisor_phase1_approved": False,
            "implant_incharge_phase1_approved": False,
            "supervisor_phase2_approved": False,
            "implant_incharge_phase2_approved": False,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "created_by_role": current_user.get("_original_role", "implant_incharge"),
            "created_by_id": current_user["_id"],
            "created_by_name": current_user["name"],
        })
    
    # FDI chart: when the new `missing_teeth` field is supplied, enforce the
    # per-procedure-type count rules and derive `teeth_present` for back-compat.
    _validate_missing_teeth(procedure.implant_procedure_type, procedure.missing_teeth)
    _apply_missing_teeth_derive(procedure_dict)

    # Pre-Op Augmentation Checklist (iter-136) — deterministic, AI-free items
    # derived from per-site clinical findings. Stored alongside the procedure
    # so supervisors see it on /procedures/[id] and can tick items during
    # Phase 1 approval.
    procedure_dict["augmentation_checklist"] = generate_augmentation_checklist(procedure_dict)
    procedure_dict["augmentation_checklist_generated_at"] = datetime.now(timezone.utc).isoformat()
    procedure_dict["augmentation_checklist_generated_by"] = current_user.get("id") or current_user.get("_id") or ""

    result = await db.procedures.insert_one(procedure_dict)
    procedure_id = str(result.inserted_id)
    
    # Notifications
    if is_student:
        # Notify supervisor assignment
        await db.notifications.insert_one({
            "user_id": procedure.supervisor_id,
            "procedure_id": procedure_id,
            "message": f"You have been assigned as Instructor for a new procedure by {procedure.student_name} for patient {procedure.patient_name}",
            "type": "assignment",
            "read": False,
            "created_at": datetime.utcnow()
        })
    elif is_supervisor:
        # Notify implant incharge that a supervisor created a case needing their approval
        await db.notifications.insert_one({
            "user_id": procedure.implant_incharge_id,
            "procedure_id": procedure_id,
            "message": f"New case scheduled by {current_user['name']} for patient {procedure.patient_name}. Your approval is required for all phases.",
            "type": "assignment",
            "read": False,
            "created_at": datetime.utcnow()
        })
    elif is_incharge:
        # Notify supervisor about the auto-completed case
        await db.notifications.insert_one({
            "user_id": procedure.supervisor_id,
            "procedure_id": procedure_id,
            "message": f"Case for patient {procedure.patient_name} was created and auto-completed by Implant In-Charge {current_user['name']}.",
            "type": "approved",
            "read": False,
            "created_at": datetime.utcnow()
        })
    
    procedure_dict["_id"] = procedure_id
    procedure_dict["id"] = procedure_id
    
    # If no consent form was uploaded during Phase 1 creation, notify all nurses so they
    # can pick it up from their dashboard.
    if not procedure_dict.get("patient_consent_form"):
        nurses = await db.users.find({"role": "nurse"}, {"_id": 1}).to_list(100)
        nurse_ids = [str(n["_id"]) for n in nurses]
        creator_label = procedure.student_name or current_user.get("name", "A user")
        msg = f"New case by {creator_label} for {procedure.patient_name} awaiting patient consent form upload."
        for nid in nurse_ids:
            await db.notifications.insert_one({
                "user_id": nid,
                "procedure_id": procedure_id,
                "message": msg,
                "type": "consent_pending",
                "read": False,
                "created_at": datetime.utcnow(),
            })
        if nurse_ids:
            await send_expo_push_notifications(
                nurse_ids,
                "Consent form pending",
                msg,
                {"procedure_id": procedure_id, "type": "consent_pending"},
                redact=[procedure.patient_name],
            )
    
    return procedure_dict


@api_router.get("/procedures/slots/{date}")
async def get_booked_slots(date: str, current_user: dict = Depends(get_current_user)):
    """Return booked time slots for a given date with patient/scheduler info,
    plus the caller's org scheduling config so the case-creation picker can
    render whichever mode (default/custom/open) is active without a second
    round-trip to /organizations/me."""
    booked = await db.procedures.find(
        {"procedure_date": date},
        {"_id": 0, "procedure_time": 1, "patient_name": 1, "student_name": 1, "created_by_name": 1, "created_by_role": 1},
    ).to_list(50)
    slots = {}
    for b in booked:
        t = b.get("procedure_time", "")
        slots[t] = {
            "patient_name": b.get("patient_name", ""),
            "scheduled_by": b.get("created_by_name") or b.get("student_name") or "",
        }

    sched_cfg = await _get_org_scheduling_config(current_user.get("org_id"))
    sched_mode = sched_cfg.get("mode", "default")
    day_slots: List[Dict[str, Any]] = []
    if sched_mode == "custom":
        try:
            day_name = _WEEKDAY_NAMES[datetime.strptime(date, "%Y-%m-%d").weekday()]
            day_slots = [s for s in (sched_cfg.get("custom_slots") or []) if day_name in (s.get("days") or [])]
        except ValueError:
            pass

    return {
        "date": date,
        "booked_slots": slots,
        "mode": sched_mode,
        "day_slots": day_slots,  # populated only in "custom" mode
        "open_window_hours": sched_cfg.get("open_window_hours") if sched_mode == "open" else None,
    }


@api_router.get("/procedures/slots-month/{month}")
async def get_booked_slots_month(month: str, current_user: dict = Depends(get_current_user)):
    """Org-wide slot occupancy for a calendar month (YYYY-MM), visible to every
    role — powers the Home-screen calendar dots (orange = partially booked,
    red = fully booked). `total` is computed server-side from the org's
    scheduling config (fixed count for default/custom, null for open mode —
    there's no fixed capacity to be "full" against). Per slot returns who
    booked it + procedure type; deliberately no patient identity."""
    if not re.fullmatch(r"\d{4}-\d{2}", month):
        raise HTTPException(status_code=400, detail="month must be YYYY-MM")
    query: Dict[str, Any] = {
        "procedure_date": {"$regex": f"^{month}-"},
        "archived": {"$ne": True},
    }
    org_scope = await _org_scope_match(current_user)
    if org_scope:
        query.update(org_scope)
    cursor = db.procedures.find(
        query,
        {"_id": 0, "procedure_date": 1, "procedure_time": 1, "student_name": 1,
         "created_by_name": 1, "implant_procedure_type": 1},
    )
    raw_days: Dict[str, Dict[str, Any]] = {}
    async for p in cursor:
        d, t = p.get("procedure_date"), p.get("procedure_time")
        if not d or not t:
            continue
        raw_days.setdefault(d, {})[t] = {
            "scheduled_by": p.get("created_by_name") or p.get("student_name") or "",
            "procedure_type": p.get("implant_procedure_type") or "",
        }

    sched_cfg = await _get_org_scheduling_config(current_user.get("org_id"))
    sched_mode = sched_cfg.get("mode", "default")

    def _total_for_date(date_str: str) -> Optional[int]:
        try:
            d = datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            return None
        if sched_mode == "default":
            if d.weekday() == 6:  # Sunday
                return 0
            return 1 if d.weekday() == 5 else 2  # Saturday: 1 slot, else 2
        if sched_mode == "custom":
            day_name = _WEEKDAY_NAMES[d.weekday()]
            return len([s for s in (sched_cfg.get("custom_slots") or []) if day_name in (s.get("days") or [])])
        return None  # open mode: no fixed capacity to compare against

    days: Dict[str, Dict[str, Any]] = {
        d: {"slots": slots, "total": _total_for_date(d)} for d, slots in raw_days.items()
    }
    return {"month": month, "days": days, "mode": sched_mode}


@api_router.get("/procedures")
async def get_procedures(
    status: Optional[str] = None,
    phase: Optional[str] = None,
    date: Optional[str] = None,
    student_id: Optional[str] = None,
    supervisor_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}

    # Exclude archived procedures by default
    query["archived"] = {"$ne": True}

    # Filter based on role
    if current_user["role"] == "student":
        query["student_id"] = current_user["_id"]
    elif current_user["role"] == "supervisor":
        query["$and"] = [
            {"$or": [
                {"supervisor_id": current_user["_id"]},
                {"created_by_id": current_user["_id"]},
            ]},
            {"created_by_role": {"$nin": ["implant_incharge", "chief_dentist"]}},
        ]
    elif current_user["role"] == "nurse":
        # Nurses can only see fully approved/completed procedures, within their own org
        query["status"] = {"$in": ["phase1_approved", "phase2_approved", "approved", "stage2_surgical_approved", "completed"]}
        query.update(await _org_scope_match(current_user))
    elif current_user["role"] in ("administrator", "implant_incharge"):
        # Sees all cases within their own organization
        query.update(await _org_scope_match(current_user))

    # Optional student_id filter — honoured for In-Charge / Administrator.
    # Supervisors can also use it but the supervisor $and scope applies on top
    # (i.e. student_id AND (supervisor_id == self OR created_by_id == self)).
    if student_id and current_user["role"] in ("implant_incharge", "administrator", "supervisor"):
        query["student_id"] = student_id

    if supervisor_id and current_user["role"] in ("implant_incharge", "administrator"):
        query["supervisor_id"] = supervisor_id
    
    if phase and current_user["role"] != "nurse":
        phase_status_map = {
            "1": ["draft", "pending_phase1"],
            "2": ["phase1_approved", "pending_phase2"],
            "3": ["phase2_approved", "pending_stage2_surgical"],
            "4": ["stage2_surgical_approved", "pending_stage2_prosthetic", "stage2_prosthetic_step1_approved", "pending_final_delivery"],
            "completed": ["completed"],
        }
        if phase in phase_status_map:
            query["status"] = {"$in": phase_status_map[phase]}
    elif status and current_user["role"] != "nurse":
        if status == "pending":
            query["status"] = {"$in": ["pending_phase1", "pending_phase2", "pending_stage2_surgical", "pending_stage2_prosthetic"]}
        elif status == "completed":
            query["status"] = {"$in": ["phase2_approved", "stage2_surgical_approved", "completed"]}
        elif status == "rejected":
            query["status"] = {"$in": ["rejected", "stage2_surgical_rejected", "stage2_prosthetic_rejected"]}
        else:
            query["status"] = status
    
    if date:
        query["procedure_date"] = date
    
    procedures = await db.procedures.find(query).sort("created_at", -1).to_list(100)
    
    for proc in procedures:
        proc["_id"] = str(proc["_id"])
        proc["id"] = proc["_id"]
    
    return procedures


@api_router.get("/procedures/archived")
async def get_archived_procedures(current_user: dict = Depends(get_current_user)):
    """Get archived procedures visible to the current user."""
    query = {"archived": True}
    role = current_user["role"]
    uid = current_user["_id"]
    if role == "student":
        query["$or"] = [{"created_by_id": uid}, {"student_id": uid}]
    elif role == "supervisor":
        query["$or"] = [{"created_by_id": uid}, {"supervisor_id": uid}]
    else:
        query.update(await _org_scope_match(current_user))
    procedures = []
    async for proc in db.procedures.find(query, {"_id": 0}).sort("archived_at", -1):
        procedures.append(proc)
    return procedures


@api_router.get("/procedures/recent-activity")
async def get_recent_activity(
    limit: int = 10,
    skip: int = 0,
    student_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Return the most recent edit_log entries across all procedures accessible to the user.
    Only Supervisors, Implant In-Charges, and Administrators can view this feed.
    Optional `skip` for pagination (e.g. Show More on the dashboard widget).
    Optional `student_id` filter (in-charge / admin only) for the per-student drill-down.
    """
    role = current_user.get("role")
    if role not in ("supervisor", "implant_incharge", "administrator"):
        raise HTTPException(status_code=403, detail="Only Supervisors and Implant In-Charges can view recent activity")

    limit = max(1, min(int(limit or 10), 50))
    skip = max(0, int(skip or 0))
    match_stage: Dict[str, Any] = {"edit_log": {"$exists": True, "$ne": []}}
    match_stage.update(await _org_scope_match(current_user))
    if student_id and role in ("implant_incharge", "administrator"):
        match_stage["student_id"] = student_id
    pipeline = [
        {"$match": match_stage},
        {"$project": {
            "_id": 0,
            "procedure_id": {"$toString": "$_id"},
            "patient_name": 1,
            "patient_id": 1,
            "implant_procedure_type": 1,
            "status": 1,
            "created_by_name": 1,
            "edit_log": 1,
        }},
        {"$unwind": "$edit_log"},
        {"$sort": {"edit_log.edited_at": -1}},
        {"$skip": skip},
        {"$limit": limit},
        {"$project": {
            "procedure_id": 1,
            "patient_name": 1,
            "patient_id": 1,
            "implant_procedure_type": 1,
            "status": 1,
            "created_by_name": 1,
            "field": "$edit_log.field",
            "old_value": "$edit_log.old_value",
            "new_value": "$edit_log.new_value",
            "edited_by": "$edit_log.edited_by",
            "edited_by_role": "$edit_log.edited_by_role",
            "edited_at": "$edit_log.edited_at",
        }},
    ]
    entries = await db.procedures.aggregate(pipeline).to_list(length=limit)
    return {"activities": entries, "skip": skip, "limit": limit}


# ── In-Charge / Admin: all-students analytics overview ──
@api_router.get("/admin/students")
async def list_students_analytics(current_user: dict = Depends(get_current_user)):
    """Return all students with KPI snapshot. In-Charge/Admin sees all students.
    Supervisor sees only students from their supervised cases."""
    role = current_user.get("role")
    if role not in ("implant_incharge", "administrator", "supervisor"):
        raise HTTPException(status_code=403, detail="Only Implant In-Charge / Administrator / Supervisor can view student analytics")

    uid = current_user["_id"]

    if role == "supervisor":
        # Only students whose cases this supervisor supervises
        supervised_ids = await db.procedures.distinct("student_id", {
            "supervisor_id": uid,
            "archived": {"$ne": True},
        })
        student_filter = {"_id": {"$in": [ObjectId(s) for s in supervised_ids if s]}, "role": "student"}
    elif current_user.get("is_super_admin"):
        student_filter = {"role": "student"}
    else:
        student_filter = {"role": "student", "org_id": current_user.get("org_id")}

    students_cursor = db.users.find(student_filter, {"password_hash": 0})
    students = []
    async for s in students_cursor:
        student_id = str(s["_id"])
        base_match: Dict[str, Any] = {"student_id": student_id, "archived": {"$ne": True}}
        if role == "supervisor":
            base_match["supervisor_id"] = uid

        kpi_pipeline = [
            {"$match": base_match},
            {"$group": {
                "_id": None,
                "total": {"$sum": 1},
                "completed": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
                "active": {"$sum": {"$cond": [{"$not": {"$in": ["$status", ["completed", "rejected", "permanently_rejected"]]}}, 1, 0]}},
                "pending_approval": {"$sum": {"$cond": [{"$in": ["$status", ["pending_phase1", "pending_phase2", "pending_stage2_surgical", "pending_stage2_prosthetic"]]}, 1, 0]}},
            }},
        ]
        kpi_doc = None
        async for d in db.procedures.aggregate(kpi_pipeline):
            kpi_doc = d
            break
        total = (kpi_doc or {}).get("total", 0)
        completed = (kpi_doc or {}).get("completed", 0)
        active = (kpi_doc or {}).get("active", 0)
        pending = (kpi_doc or {}).get("pending_approval", 0)
        approval_rate = round((completed / total) * 100, 1) if total > 0 else None

        students.append({
            "id": student_id,
            "name": s.get("name"),
            "email": s.get("email"),
            "profile_photo": s.get("profile_photo"),
            "kpis": {
                "total": total,
                "completed": completed,
                "active": active,
                "pending_approval": pending,
                "approval_rate": approval_rate,
            },
        })

    # Sort: most active first, then by name
    students.sort(key=lambda x: (-x["kpis"]["active"], x["name"] or ""))
    return {"students": students, "total": len(students)}


# ── In-Charge / Admin: per-student summary for the drill-down screen ──
@api_router.get("/admin/students/{student_id}/summary")
async def get_student_summary(student_id: str, current_user: dict = Depends(get_current_user)):
    """Return profile + aggregated KPIs + phase pipeline + monthly throughput
    for a single student. Visible to Implant In-Charge / Administrator (full scope)
    and Supervisors (scoped to cases they supervise).
    """
    role = current_user.get("role")
    if role not in ("implant_incharge", "administrator", "supervisor"):
        raise HTTPException(status_code=403, detail="Only Implant In-Charge / Administrator / Supervisor can view student summaries")

    # Profile (best-effort — students may also exist purely via their procedures)
    profile = None
    try:
        u = await db.users.find_one({"_id": ObjectId(student_id)})
    except Exception:
        u = None
    if not u:
        u = await db.users.find_one({"_id": student_id})
    if u:
        profile = {
            "id": str(u.get("_id")),
            "name": u.get("name"),
            "email": u.get("email"),
            "role": u.get("role"),
            "username": u.get("username"),
            "profile_photo": u.get("profile_photo"),
        }

    if (
        role in ("implant_incharge", "administrator")
        and not current_user.get("is_super_admin")
        and u and u.get("org_id") != current_user.get("org_id")
    ):
        raise HTTPException(status_code=403, detail="Cannot view students outside your organization")

    # Aggregations across this student's procedures
    base_match: Dict[str, Any] = {"student_id": student_id, "archived": {"$ne": True}}
    # Supervisor scope: only count cases they supervise / created
    if role == "supervisor":
        base_match["$or"] = [
            {"supervisor_id": current_user["_id"]},
            {"created_by_id": current_user["_id"]},
        ]
        # If supervisor has 0 cases for this student, return zeroed stats early
        any_case = await db.procedures.find_one(base_match)
        if not any_case:
            raise HTTPException(status_code=403, detail="No cases for this student under your supervision")

    # KPI counts
    kpi_pipeline = [
        {"$match": base_match},
        {"$group": {
            "_id": None,
            "total": {"$sum": 1},
            "completed": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
            "rejected": {"$sum": {"$cond": [{"$in": ["$status", ["rejected", "permanently_rejected", "stage2_surgical_rejected", "stage2_prosthetic_rejected"]]}, 1, 0]}},
            "active": {"$sum": {"$cond": [{"$not": {"$in": ["$status", ["completed", "rejected", "permanently_rejected"]]}}, 1, 0]}},
            "pending_approval": {"$sum": {"$cond": [{"$in": ["$status", ["pending_phase1", "pending_phase2", "pending_stage2_surgical", "pending_stage2_prosthetic"]]}, 1, 0]}},
        }},
    ]
    kpi_doc = None
    async for d in db.procedures.aggregate(kpi_pipeline):
        kpi_doc = d
        break
    if not kpi_doc:
        kpi_doc = {"total": 0, "completed": 0, "rejected": 0, "active": 0, "pending_approval": 0}
    kpis = {
        "total": kpi_doc.get("total", 0),
        "completed": kpi_doc.get("completed", 0),
        "rejected": kpi_doc.get("rejected", 0),
        "active": kpi_doc.get("active", 0),
        "pending_approval": kpi_doc.get("pending_approval", 0),
    }
    decided = kpis["completed"] + kpis["rejected"]
    kpis["approval_rate"] = round((kpis["completed"] / decided) * 100, 1) if decided > 0 else None

    # Phase pipeline counts (mirrors the dashboard's main pipeline groups)
    phase_groups = {
        "phase1": ["draft", "pending_phase1"],
        "phase2": ["phase1_approved", "pending_phase2"],
        "phase3": ["phase2_approved", "pending_stage2_surgical"],
        "phase4": ["stage2_surgical_approved", "pending_stage2_prosthetic", "stage2_prosthetic_step1_approved", "pending_final_delivery"],
        "complete": ["completed"],
    }
    phase_pipeline = {k: 0 for k in phase_groups}
    async for proc in db.procedures.find(base_match, {"status": 1}):
        st = proc.get("status")
        for k, v in phase_groups.items():
            if st in v:
                phase_pipeline[k] += 1
                break

    # Monthly throughput — completed cases per month for the last 6 calendar months
    now = datetime.now(timezone.utc)
    monthly: List[Dict[str, Any]] = []
    for offset in range(5, -1, -1):
        # Compute month start
        y = now.year
        m = now.month - offset
        while m <= 0:
            m += 12
            y -= 1
        start = datetime(y, m, 1, tzinfo=timezone.utc)
        if m == 12:
            end = datetime(y + 1, 1, 1, tzinfo=timezone.utc)
        else:
            end = datetime(y, m + 1, 1, tzinfo=timezone.utc)
        cnt = await db.procedures.count_documents({
            **base_match,
            "status": "completed",
            "treatment_completed_at": {"$gte": start, "$lt": end},
        })
        monthly.append({"label": start.strftime("%b %Y"), "count": cnt})

    return {
        "profile": profile,
        "kpis": kpis,
        "phase_pipeline": phase_pipeline,
        "monthly_throughput": monthly,
    }


# ── In-Charge / Admin: all-supervisors analytics overview ──
@api_router.get("/admin/supervisors")
async def list_supervisors_analytics(current_user: dict = Depends(get_current_user)):
    """Return all supervisors with KPI snapshot. Implant In-Charge / Admin only."""
    if current_user.get("role") not in ("implant_incharge", "administrator"):
        raise HTTPException(status_code=403, detail="Only Implant In-Charge / Administrator can view supervisor summaries")

    REJECTED = ["rejected", "permanently_rejected", "stage2_surgical_rejected", "stage2_prosthetic_rejected"]
    PENDING = ["pending_phase1", "pending_phase2", "pending_stage2_surgical", "pending_stage2_prosthetic"]
    stale_cutoff = datetime.now(timezone.utc) - timedelta(hours=48)

    sv_filter = {"role": "supervisor"} if current_user.get("is_super_admin") else {"role": "supervisor", "org_id": current_user.get("org_id")}
    supervisors_cursor = db.users.find(sv_filter, {"password_hash": 0})
    results = []
    async for sv in supervisors_cursor:
        sv_id = str(sv["_id"])
        base = {"supervisor_id": sv_id, "archived": {"$ne": True}}

        total = await db.procedures.count_documents(base)
        pending = await db.procedures.count_documents({**base, "status": {"$in": PENDING}})
        completed = await db.procedures.count_documents({**base, "status": "completed"})
        approved = await db.procedures.count_documents({**base, "supervisor_phase1_approved": True})
        rejected = await db.procedures.count_documents({**base, "status": {"$in": REJECTED}})
        stale = await db.procedures.count_documents({**base, "status": {"$in": PENDING}, "created_at": {"$lt": stale_cutoff}})

        decided = approved + rejected
        approval_rate = round((approved / decided) * 100, 1) if decided else None

        # Count distinct students supervised
        student_ids = await db.procedures.distinct("student_id", base)
        students_supervised = len([s for s in student_ids if s])

        results.append({
            "id": sv_id,
            "name": sv.get("name"),
            "email": sv.get("email"),
            "profile_photo": sv.get("profile_photo"),
            "kpis": {
                "total": total,
                "pending": pending,
                "completed": completed,
                "stale": stale,
                "approval_rate": approval_rate,
                "students_supervised": students_supervised,
            },
        })

    # Sort: stale first (needs attention), then by pending desc
    results.sort(key=lambda x: (-x["kpis"]["stale"], -x["kpis"]["pending"]))
    return {"supervisors": results, "total": len(results)}


# ── In-Charge / Admin: per-supervisor summary for the drill-down screen ──
@api_router.get("/admin/supervisors/{supervisor_id}/summary")
async def get_supervisor_summary(supervisor_id: str, current_user: dict = Depends(get_current_user)):
    """Return profile + supervisor-specific KPIs (review-load, turnaround, peer comparison)
    + per-phase approval distribution + monthly decisions + supervised students mini-list
    + recent review actions. Visible only to Implant In-Charge / Administrator."""
    if current_user.get("role") not in ("implant_incharge", "administrator"):
        raise HTTPException(status_code=403, detail="Only Implant In-Charge / Administrator can view supervisor summaries")

    # Profile
    profile = None
    try:
        u = await db.users.find_one({"_id": ObjectId(supervisor_id)})
    except Exception:
        u = None
    if not u:
        u = await db.users.find_one({"_id": supervisor_id})
    if u:
        profile = {
            "id": str(u.get("_id")),
            "name": u.get("name"),
            "email": u.get("email"),
            "role": u.get("role"),
            "username": u.get("username"),
            "profile_photo": u.get("profile_photo"),
        }

    if not current_user.get("is_super_admin") and u and u.get("org_id") != current_user.get("org_id"):
        raise HTTPException(status_code=403, detail="Cannot view supervisors outside your organization")

    base_match: Dict[str, Any] = {"supervisor_id": supervisor_id, "archived": {"$ne": True}}

    # KPI counts (supervisor's view: how many cases under them, decided how)
    REJECTED = ["rejected", "permanently_rejected", "stage2_surgical_rejected", "stage2_prosthetic_rejected"]
    PENDING = ["pending_phase1", "pending_phase2", "pending_stage2_surgical", "pending_stage2_prosthetic"]
    total = await db.procedures.count_documents(base_match)
    approved = await db.procedures.count_documents({**base_match, "supervisor_phase1_approved": True})
    rejected = await db.procedures.count_documents({**base_match, "status": {"$in": REJECTED}})
    pending = await db.procedures.count_documents({**base_match, "status": {"$in": PENDING}})
    completed = await db.procedures.count_documents({**base_match, "status": "completed"})
    permanent_rej = await db.procedures.count_documents({**base_match, "status": "permanently_rejected"})

    # Stale reviews (pending >48h since case created/submitted)
    stale_cutoff = datetime.now(timezone.utc) - timedelta(hours=48)
    stale_count = await db.procedures.count_documents({
        **base_match,
        "status": {"$in": PENDING},
        "created_at": {"$lt": stale_cutoff},
    })

    # Avg review-turnaround (hours): created_at -> supervisor_phase1_approved_at
    review_times: List[float] = []
    async for proc in db.procedures.find({**base_match, "supervisor_phase1_approved_at": {"$exists": True}}, {"created_at": 1, "supervisor_phase1_approved_at": 1}):
        c = proc.get("created_at"); a = proc.get("supervisor_phase1_approved_at")
        if not c or not a:
            continue
        if c.tzinfo is None: c = c.replace(tzinfo=timezone.utc)
        if a.tzinfo is None: a = a.replace(tzinfo=timezone.utc)
        delta = (a - c).total_seconds() / 3600.0
        if 0 <= delta <= 24 * 90:  # cap at 90 days; ignore obvious data anomalies
            review_times.append(delta)
    avg_review_hours = round(sum(review_times) / len(review_times), 1) if review_times else None

    decided = approved + rejected
    approval_rate = round((approved / decided) * 100, 1) if decided else None
    rejection_rate = round((rejected / decided) * 100, 1) if decided else None
    permanent_rate = round((permanent_rej / rejected) * 100, 1) if rejected else None

    kpis = {
        "total": total,
        "approved": approved,
        "rejected": rejected,
        "pending": pending,
        "completed": completed,
        "stale_count": stale_count,
        "avg_review_hours": avg_review_hours,
        "approval_rate": approval_rate,
        "rejection_rate": rejection_rate,
        "permanent_rejection_share": permanent_rate,
    }

    # Per-phase approval distribution
    phase_approvals = {
        "phase1": await db.procedures.count_documents({**base_match, "supervisor_phase1_approved": True}),
        "phase2": await db.procedures.count_documents({**base_match, "supervisor_phase2_approved": True}),
        "phase3": await db.procedures.count_documents({**base_match, "stage2_surgical_supervisor_approved": True}),
        "phase4": await db.procedures.count_documents({**base_match, "stage2_prosthetic_supervisor_approved": True}),
    }

    # Monthly decisions (approvals + rejections in each of the last 6 months)
    now = datetime.now(timezone.utc)
    monthly: List[Dict[str, Any]] = []
    for offset in range(5, -1, -1):
        y, m = now.year, now.month - offset
        while m <= 0:
            m += 12; y -= 1
        start = datetime(y, m, 1, tzinfo=timezone.utc)
        end = datetime(y + 1, 1, 1, tzinfo=timezone.utc) if m == 12 else datetime(y, m + 1, 1, tzinfo=timezone.utc)
        approvals = await db.procedures.count_documents({**base_match, "supervisor_phase1_approved_at": {"$gte": start, "$lt": end}})
        # Rejections in window: heuristic — status flipped to rejected via edit_log timestamps; fallback: count by created_at
        rejs = await db.procedures.count_documents({**base_match, "status": {"$in": REJECTED}, "created_at": {"$gte": start, "$lt": end}})
        monthly.append({"label": start.strftime("%b %Y"), "approvals": approvals, "rejections": rejs})

    # Supervised students top-5 (by case count under this supervisor)
    sup_students_pipeline = [
        {"$match": base_match},
        {"$group": {
            "_id": "$student_id",
            "student_name": {"$first": "$student_name"},
            "total": {"$sum": 1},
            "completed": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
            "active": {"$sum": {"$cond": [{"$not": {"$in": ["$status", ["completed"] + REJECTED]}}, 1, 0]}},
        }},
        {"$sort": {"total": -1}},
        {"$limit": 5},
    ]
    supervised_students: List[Dict[str, Any]] = []
    async for d in db.procedures.aggregate(sup_students_pipeline):
        if not d.get("_id"):
            continue
        supervised_students.append({
            "student_id": d.get("_id"),
            "student_name": d.get("student_name", "Unknown"),
            "total": d["total"],
            "completed": d["completed"],
            "active": d["active"],
        })

    # Peer comparison — compute median + percentile across all supervisors
    peer_avg_times: List[float] = []
    peer_rejection_rates: List[float] = []
    async for s_doc in db.procedures.aggregate([
        {"$match": {"supervisor_id": {"$exists": True, "$nin": [None, ""]}, "archived": {"$ne": True}}},
        {"$group": {
            "_id": "$supervisor_id",
            "approved": {"$sum": {"$cond": [{"$eq": ["$supervisor_phase1_approved", True]}, 1, 0]}},
            "rejected": {"$sum": {"$cond": [{"$in": ["$status", REJECTED]}, 1, 0]}},
        }},
    ]):
        d_total = (s_doc.get("approved", 0) or 0) + (s_doc.get("rejected", 0) or 0)
        if d_total >= 3:
            peer_rejection_rates.append((s_doc.get("rejected", 0) / d_total) * 100)
    # Avg-time peer pool
    async for s_doc in db.procedures.aggregate([
        {"$match": {"supervisor_phase1_approved_at": {"$exists": True}, "archived": {"$ne": True}}},
        {"$project": {"supervisor_id": 1, "diff_h": {"$divide": [{"$subtract": ["$supervisor_phase1_approved_at", "$created_at"]}, 1000 * 60 * 60]}}},
        {"$match": {"diff_h": {"$gte": 0, "$lte": 24 * 90}}},
        {"$group": {"_id": "$supervisor_id", "avg_h": {"$avg": "$diff_h"}, "n": {"$sum": 1}}},
        {"$match": {"n": {"$gte": 3}}},
    ]):
        peer_avg_times.append(s_doc["avg_h"])

    def _percentile(value: Optional[float], pool: List[float], lower_is_better: bool = True) -> Optional[int]:
        if value is None or not pool:
            return None
        # percentage of peers this value beats
        if lower_is_better:
            beats = sum(1 for x in pool if value < x)
        else:
            beats = sum(1 for x in pool if value > x)
        return round((beats / len(pool)) * 100)

    def _median(pool: List[float]) -> Optional[float]:
        if not pool:
            return None
        sp = sorted(pool); n = len(sp)
        return round(sp[n // 2] if n % 2 == 1 else (sp[n // 2 - 1] + sp[n // 2]) / 2, 1)

    peer_comparison = {
        "review_time_percentile": _percentile(avg_review_hours, peer_avg_times, lower_is_better=True),
        "rejection_rate_percentile": _percentile(rejection_rate, peer_rejection_rates, lower_is_better=False),
        "peer_median_review_hours": _median(peer_avg_times),
        "peer_median_rejection_rate": _median(peer_rejection_rates),
        "peer_count_review_time": len(peer_avg_times),
        "peer_count_rejection_rate": len(peer_rejection_rates),
    }

    # Recent review actions — last 10 supervisor approval/rejection events from edit_log
    recent_actions: List[Dict[str, Any]] = []
    pipeline = [
        {"$match": {"supervisor_id": supervisor_id, "edit_log": {"$exists": True, "$ne": []}}},
        {"$project": {"_id": 0, "procedure_id": {"$toString": "$_id"}, "patient_name": 1, "status": 1, "edit_log": 1}},
        {"$unwind": "$edit_log"},
        {"$match": {"edit_log.edited_by": supervisor_id}},
        {"$sort": {"edit_log.edited_at": -1}},
        {"$limit": 10},
        {"$project": {
            "procedure_id": 1, "patient_name": 1, "status": 1,
            "field": "$edit_log.field",
            "new_value": "$edit_log.new_value",
            "edited_at": "$edit_log.edited_at",
        }},
    ]
    async for r in db.procedures.aggregate(pipeline):
        recent_actions.append({
            "procedure_id": r.get("procedure_id"),
            "patient_name": r.get("patient_name"),
            "status": r.get("status"),
            "field": r.get("field"),
            "new_value": str(r.get("new_value"))[:60] if r.get("new_value") is not None else None,
            "edited_at": r.get("edited_at").isoformat() if r.get("edited_at") else None,
        })

    return {
        "profile": profile,
        "kpis": kpis,
        "phase_approvals": phase_approvals,
        "monthly_decisions": monthly,
        "supervised_students": supervised_students,
        "peer_comparison": peer_comparison,
        "recent_actions": recent_actions,
    }


# ── Nudge a student (in-app notification + push) ──────────────────────
NUDGE_COOLDOWN_MINUTES = 30
NUDGE_MAX_LEN = 500


class NudgePayload(BaseModel):
    message: str = Field(..., min_length=1, max_length=NUDGE_MAX_LEN)
    case_ids: Optional[List[str]] = None


async def _verify_nudge_access(student_id: str, current_user: dict) -> dict:
    """Ensure sender is allowed to nudge this student. Supervisors can only
    nudge students whose cases they actively supervise. Returns student profile."""
    role = current_user.get("role")
    if role not in ("implant_incharge", "administrator", "supervisor"):
        raise HTTPException(status_code=403, detail="Only In-Charge / Administrator / Supervisor can nudge students")
    if role == "supervisor":
        any_case = await db.procedures.find_one({
            "student_id": student_id,
            "$or": [
                {"supervisor_id": current_user["_id"]},
                {"created_by_id": current_user["_id"]},
            ],
            "archived": {"$ne": True},
        })
        if not any_case:
            raise HTTPException(status_code=403, detail="You can only nudge students for cases under your supervision")
    # Resolve student profile (best-effort)
    student = None
    try:
        student = await db.users.find_one({"_id": ObjectId(student_id)})
    except Exception:
        pass
    if not student:
        student = await db.users.find_one({"_id": student_id})
    return student or {"_id": student_id, "name": "Student"}


@api_router.post("/students/{student_id}/nudge")
async def nudge_student(
    student_id: str,
    payload: NudgePayload,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    student = await _verify_nudge_access(student_id, current_user)
    # 30-min cooldown per (sender, student) pair
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=NUDGE_COOLDOWN_MINUTES)
    recent = await db.notifications.find_one({
        "user_id": student_id,
        "from_user_id": current_user["_id"],
        "type": "nudge",
        "created_at": {"$gte": cutoff},
    })
    if recent:
        last = recent.get("created_at")
        try:
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            seconds_remaining = max(0, int((last + timedelta(minutes=NUDGE_COOLDOWN_MINUTES) - datetime.now(timezone.utc)).total_seconds()))
        except Exception:
            seconds_remaining = NUDGE_COOLDOWN_MINUTES * 60
        raise HTTPException(
            status_code=429,
            detail={"message": "You recently nudged this student. Please wait before sending another.", "seconds_remaining": seconds_remaining},
        )
    case_ids = [cid for cid in (payload.case_ids or []) if isinstance(cid, str) and cid][:10]
    notif = {
        "user_id": student_id,
        "from_user_id": current_user["_id"],
        "from_user_name": current_user.get("name"),
        "from_user_role": current_user.get("role"),
        "type": "nudge",
        "message": payload.message.strip()[:NUDGE_MAX_LEN],
        "case_ids": case_ids,
        "procedure_id": case_ids[0] if len(case_ids) == 1 else None,
        "read": False,
        "created_at": datetime.now(timezone.utc),
    }
    insert_res = await db.notifications.insert_one(dict(notif))
    # Push notification (best-effort — function silently no-ops if no token)
    sender_label = current_user.get("name") or current_user.get("role") or "Implanr"
    try:
        await send_expo_push_notifications(
            [student_id],
            f"Nudge from {sender_label}",
            payload.message.strip()[:200],
            {"type": "nudge", "from_user_id": current_user["_id"]},
        )
    except Exception as e:
        logging.warning(f"nudge push failed: {e}")
    # HIPAA audit row
    try:
        await log_access(
            action="nudge_student",
            outcome="success",
            user_id=current_user["_id"],
            resource_type="user",
            resource_id=student_id,
            ip=(request.client.host if request and request.client else None),
        )
    except Exception:
        pass
    return {
        "id": str(insert_res.inserted_id),
        "student_id": student_id,
        "student_name": student.get("name"),
        "message": notif["message"],
        "case_ids": case_ids,
        "created_at": notif["created_at"].isoformat(),
        "cooldown_minutes": NUDGE_COOLDOWN_MINUTES,
    }


@api_router.get("/students/{student_id}/nudge-history")
async def get_nudge_history(
    student_id: str,
    limit: int = 5,
    current_user: dict = Depends(get_current_user),
):
    """Return recent nudges sent to this student. Visible to in-charge / admin
    (full history) and to supervisors (only nudges they themselves sent)."""
    role = current_user.get("role")
    if role not in ("implant_incharge", "administrator", "supervisor"):
        raise HTTPException(status_code=403, detail="Forbidden")
    if role == "supervisor":
        await _verify_nudge_access(student_id, current_user)  # raises if no supervised cases
    limit = max(1, min(int(limit or 5), 50))
    q: Dict[str, Any] = {"user_id": student_id, "type": "nudge"}
    if role == "supervisor":
        q["from_user_id"] = current_user["_id"]
    cooldown_cutoff = datetime.now(timezone.utc) - timedelta(minutes=NUDGE_COOLDOWN_MINUTES)
    # Cooldown status for the *current sender*
    my_recent = await db.notifications.find_one(
        {"user_id": student_id, "from_user_id": current_user["_id"], "type": "nudge", "created_at": {"$gte": cooldown_cutoff}}
    )
    cooldown_seconds_remaining = 0
    if my_recent:
        try:
            ca = my_recent["created_at"]
            if ca.tzinfo is None:
                ca = ca.replace(tzinfo=timezone.utc)
            cooldown_seconds_remaining = max(0, int((ca + timedelta(minutes=NUDGE_COOLDOWN_MINUTES) - datetime.now(timezone.utc)).total_seconds()))
        except Exception:
            cooldown_seconds_remaining = 0
    rows = await db.notifications.find(q).sort("created_at", -1).limit(limit).to_list(length=limit)
    history = []
    for r in rows:
        history.append({
            "id": str(r.get("_id")),
            "from_user_id": r.get("from_user_id"),
            "from_user_name": r.get("from_user_name"),
            "from_user_role": r.get("from_user_role"),
            "message": r.get("message"),
            "case_ids": r.get("case_ids", []),
            "read": bool(r.get("read")),
            "read_at": r.get("read_at").isoformat() if r.get("read_at") else None,
            "created_at": r.get("created_at").isoformat() if r.get("created_at") else None,
        })
    return {
        "history": history,
        "cooldown_minutes": NUDGE_COOLDOWN_MINUTES,
        "cooldown_seconds_remaining": cooldown_seconds_remaining,
    }


@api_router.post("/supervisors/{supervisor_id}/nudge")
async def nudge_supervisor(
    supervisor_id: str,
    payload: NudgePayload,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """In-Charge / Administrator can nudge a supervisor directly."""
    if current_user.get("role") not in ("implant_incharge", "administrator"):
        raise HTTPException(status_code=403, detail="Only In-Charge / Administrator can nudge supervisors")

    try:
        target = await db.users.find_one({"_id": ObjectId(supervisor_id)})
    except Exception:
        target = await db.users.find_one({"_id": supervisor_id})
    if not target:
        raise HTTPException(status_code=404, detail="Supervisor not found")
    if target.get("role") not in ("supervisor", "dentist"):
        raise HTTPException(status_code=400, detail="Target user is not a supervisor")

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=NUDGE_COOLDOWN_MINUTES)
    recent = await db.notifications.find_one({
        "user_id": supervisor_id,
        "from_user_id": current_user["_id"],
        "type": "nudge",
        "created_at": {"$gte": cutoff},
    })
    if recent:
        ca = recent.get("created_at")
        if ca and ca.tzinfo is None:
            ca = ca.replace(tzinfo=timezone.utc)
        seconds_remaining = max(0, int((ca + timedelta(minutes=NUDGE_COOLDOWN_MINUTES) - datetime.now(timezone.utc)).total_seconds())) if ca else 0
        raise HTTPException(
            status_code=429,
            detail={"message": "You recently nudged this supervisor. Please wait before sending another.", "seconds_remaining": seconds_remaining},
        )

    notif = {
        "user_id": supervisor_id,
        "from_user_id": current_user["_id"],
        "from_user_name": current_user.get("name"),
        "from_user_role": current_user.get("_original_role") or current_user.get("role"),
        "type": "nudge",
        "message": payload.message.strip()[:NUDGE_MAX_LEN],
        "read": False,
        "created_at": datetime.now(timezone.utc),
    }
    await db.notifications.insert_one(notif)
    await send_expo_push_notifications(
        [supervisor_id],
        f"Nudge from {current_user.get('name')}",
        payload.message.strip()[:200],
        {"type": "nudge"},
    )
    await log_access(action="nudge_supervisor", outcome="success", user=current_user, request=request,
                     extra={"supervisor_id": supervisor_id})
    return {"message": "Nudge sent"}


@api_router.get("/procedures/{procedure_id}")
async def get_procedure(procedure_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)

    # Check access
    async def _forum_share_thread():
        # Cases shared to the Discussion Forum are viewable read-only by every
        # forum member (any non-nurse role in the org — org access is asserted
        # above), including anonymous shares. Returns the thread doc (or None)
        # so the caller can tell whether redaction is needed.
        return await db.forum_threads.find_one({
            "procedure_id": procedure_id,
            "status": {"$in": ["open", "closed"]},
        })

    redact_pii = False
    if current_user["role"] == "student" and procedure["student_id"] != current_user["_id"]:
        thread = await _forum_share_thread()
        if not thread:
            await log_access(action="procedure_view", resource_type="procedure", resource_id=procedure_id, user=current_user, request=request, outcome="denied")
            raise HTTPException(status_code=403, detail="Access denied")
        redact_pii = bool(thread.get("anonymous"))
    elif current_user["role"] == "supervisor" and procedure["supervisor_id"] != current_user["_id"]:
        thread = await _forum_share_thread()
        if not thread:
            await log_access(action="procedure_view", resource_type="procedure", resource_id=procedure_id, user=current_user, request=request, outcome="denied")
            raise HTTPException(status_code=403, detail="Access denied")
        redact_pii = bool(thread.get("anonymous"))
    elif current_user["role"] == "nurse":
        # Nurses can view any case where Phase 1 has been submitted (draft is hidden).
        # They only see Phase 1 data on the UI (frontend-enforced).
        if procedure.get("status") == "draft":
            await log_access(action="procedure_view", resource_type="procedure", resource_id=procedure_id, user=current_user, request=request, outcome="denied")
            raise HTTPException(status_code=403, detail="Nurses cannot view draft procedures")
    # implant_incharge / administrator / super_admin: no restriction — they
    # always see the full case, anonymous share or not.

    if redact_pii:
        procedure = {k: v for k, v in procedure.items() if k not in FORUM_ANONYMOUS_PII_KEYS}
        procedure["patient_name"] = "Anonymous Patient"

    procedure["_id"] = str(procedure["_id"])
    procedure["id"] = procedure["_id"]
    # Normalise instruments_autoclaved payload so "unmarked" always looks like None/null,
    # keeping the response contract identical to POST mark-instruments-autoclaved and
    # GET /procedures/nurse/scheduled-cases.
    procedure["instruments_autoclaved"] = _serialise_instruments_autoclaved(procedure.get("instruments_autoclaved"))
    await log_access(action="procedure_view", resource_type="procedure", resource_id=procedure_id, user=current_user, request=request, extra={"patient_name": procedure.get("patient_name"), "redacted": redact_pii})
    return procedure

@api_router.put("/procedures/{procedure_id}")
async def update_procedure(
    procedure_id: str,
    procedure_update: ProcedureUpdate,
    current_user: dict = Depends(get_current_user)
):
    # Nurses cannot edit procedures (read-only access)
    if current_user["role"] == "nurse":
        raise HTTPException(status_code=403, detail="Nurses have read-only access")
    
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)
    
    # Check permissions
    if current_user["role"] == "student":
        # Students can only edit their own draft/pending procedures
        if procedure["student_id"] != current_user["_id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        if procedure["status"] not in ("draft", "pending_supervisor", "pending_phase1"):
            raise HTTPException(status_code=403, detail="Cannot edit approved procedures")
    elif current_user["role"] == "supervisor":
        # Instructors can edit if they are the supervisor
        if procedure["supervisor_id"] != current_user["_id"]:
            raise HTTPException(status_code=403, detail="Access denied")
    # implant_incharge can edit all
    
    update_data = {k: v for k, v in procedure_update.model_dump().items() if v is not None}

    # If the FDI `missing_teeth` was edited, re-validate against the procedure type
    # (use the payload's new type if provided, else the stored one) and re-derive
    # `teeth_present` so back-compat fields stay in sync with reality.
    if "missing_teeth" in update_data:
        effective_proc_type = update_data.get("implant_procedure_type") or procedure.get("implant_procedure_type")
        _validate_missing_teeth(effective_proc_type, update_data.get("missing_teeth"))
        _apply_missing_teeth_derive(update_data)
    
    # Validate status transitions
    if "status" in update_data:
        valid_transitions = {
            "draft": {"pending_phase1"},
        }
        current_status = procedure["status"]
        new_status = update_data["status"]
        allowed = valid_transitions.get(current_status, set())
        if new_status not in allowed:
            raise HTTPException(status_code=400, detail=f"Cannot change status from '{current_status}' to '{new_status}'")
    
    update_data["updated_at"] = datetime.utcnow()
    
    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$set": update_data}
    )
    
    updated_procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    updated_procedure["_id"] = str(updated_procedure["_id"])
    updated_procedure["id"] = updated_procedure["_id"]
    return updated_procedure


@api_router.patch("/procedures/{procedure_id}/edit-fields")
async def edit_procedure_fields(procedure_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    """Flexible field-level editing for In-Charge and Supervisors."""
    if current_user["role"] == "nurse":
        raise HTTPException(status_code=403, detail="Nurses have read-only access")
    
    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")
    
    if current_user["role"] == "student":
        raise HTTPException(status_code=403, detail="Students cannot edit via this endpoint")
    
    if current_user["role"] == "supervisor":
        if proc.get("supervisor_id") != current_user["_id"] and proc.get("created_by_id") != current_user["_id"]:
            raise HTTPException(status_code=403, detail="Access denied — not your case")
    
    if proc.get("status") == "completed":
        raise HTTPException(status_code=403, detail="Cannot edit completed cases")
    
    body = await request.json()
    fields = body.get("fields", {})
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    # Prevent editing protected fields
    protected = {"_id", "id", "created_by_id", "created_by_name", "created_by_role", "created_at", "edit_log"}
    fields = {k: v for k, v in fields.items() if k not in protected}
    
    # Build per-field edit log entries (diff old vs new)
    now_iso = datetime.now(timezone.utc).isoformat()
    editor_name = current_user.get("name") or current_user.get("_id")
    editor_role = current_user.get("role", "")
    log_entries = []
    for key, new_val in fields.items():
        old_val = proc.get(key)
        # For dict fields (e.g. medical_assessment, phase2_data, phase4_step1_data),
        # log each changed sub-key separately so the timeline is granular.
        if isinstance(new_val, dict) and isinstance(old_val, dict):
            for sub_key, sub_new in new_val.items():
                sub_old = old_val.get(sub_key)
                if sub_old != sub_new:
                    log_entries.append({
                        "field": f"{key}.{sub_key}",
                        "old_value": sub_old,
                        "new_value": sub_new,
                        "edited_by": editor_name,
                        "edited_by_role": editor_role,
                        "edited_at": now_iso,
                    })
        else:
            if old_val != new_val:
                log_entries.append({
                    "field": key,
                    "old_value": old_val,
                    "new_value": new_val,
                    "edited_by": editor_name,
                    "edited_by_role": editor_role,
                    "edited_at": now_iso,
                })
    
    fields["updated_at"] = now_iso
    fields["last_edited_by"] = editor_name
    fields["last_edited_at"] = now_iso

    if isinstance(fields.get("phase2_data"), dict):
        p2 = fields["phase2_data"]
        if "prosthetic_component" in p2:
            existing_p2 = proc.get("phase2_data") or {}
            old_pc = existing_p2.get("prosthetic_component")
            new_pc = p2.get("prosthetic_component")
            if old_pc != new_pc:
                CASCADE_RULES = {
                    "Cover Screw Placed": [
                        "healing_abutment_cuff_height",
                        "prosthesis_type", "prosthesis_type_other",
                        "access_channel_openings",
                        "multi_unit_abutments_placed",
                    ],
                    "Healing Abutment Placed": [
                        "prosthesis_type", "prosthesis_type_other",
                        "access_channel_openings",
                        "multi_unit_abutments_placed",
                    ],
                    "Immediate Loading Done": [
                        "healing_abutment_cuff_height",
                    ],
                }
                for child in CASCADE_RULES.get(new_pc or "", []):
                    prev = existing_p2.get(child)
                    # If THIS SAME request is also explicitly setting a new,
                    # different value for `child` (e.g. an in-charge editing
                    # the Healing Abutment Cuff Height row spreads the whole
                    # phase2_data sub-object, which drags prosthetic_component
                    # along unchanged — but if it were stale that would look
                    # like an unrelated "prosthetic_component changed" cascade
                    # and silently wipe the very value being saved). A
                    # deliberate simultaneous edit always wins over the
                    # cascade-clear, which exists only to drop genuinely
                    # stale children left over from a real type switch.
                    if child in p2 and p2[child] != prev:
                        continue
                    if prev not in (None, "", []):
                        p2[child] = None
                        log_entries.append({
                            "field": f"phase2_data.{child}",
                            "old_value": prev,
                            "new_value": None,
                            "edited_by": editor_name,
                            "edited_by_role": editor_role,
                            "edited_at": now_iso,
                            "cascade_from": "phase2_data.prosthetic_component",
                        })

    # If any clinical-finding field was touched, regenerate the augmentation
    # checklist while PRESERVING completed-state on items whose title still
    # matches (so a supervisor's ticked items aren't lost on a benign edit).
    finding_keys = {"clinical_exam_per_site", "ridge_contour", "soft_tissue_thickness", "keratinized_mucosa", "arch", "missing_teeth", "gingival_biotype"}
    if finding_keys & set(fields.keys()):
        merged_proc = {**proc, **fields}
        new_items = generate_augmentation_checklist(merged_proc)
        old_state = {it.get("title"): it for it in (proc.get("augmentation_checklist") or []) if isinstance(it, dict)}
        for ni in new_items:
            prev = old_state.get(ni["title"])
            if prev and prev.get("completed"):
                ni["completed"] = True
                ni["completed_by_id"] = prev.get("completed_by_id")
                ni["completed_by_name"] = prev.get("completed_by_name")
                ni["completed_at"] = prev.get("completed_at")
                ni["completed_notes"] = prev.get("completed_notes", "")
        fields["augmentation_checklist"] = new_items
        fields["augmentation_checklist_generated_at"] = now_iso

    update_op: dict = {"$set": fields}
    if log_entries:
        update_op["$push"] = {"edit_log": {"$each": log_entries}}
    
    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        update_op,
    )
    
    # Notify the other case stakeholders (student owner, assigned supervisor, assigned in-charge)
    # whenever any edit is made — so they see the activity as a badge on the Alerts tab and get a push.
    if log_entries:
        editor_id = current_user.get("_id")
        patient_label = proc.get("patient_name") or proc.get("patient_id") or "case"
        fields_changed = ", ".join(sorted({e["field"].split(".")[-1].replace("_", " ") for e in log_entries}))[:120]
        actor_role_short = {
            "implant_incharge": "Implant In-Charge",
            "supervisor": "Supervisor",
            "student": "Student",
            "administrator": "Administrator",
            "nurse": "Nurse",
        }.get(editor_role, editor_role.title())
        msg = f"{actor_role_short} {editor_name} edited {patient_label}: {fields_changed}"
        candidate_ids = [uid for uid in [proc.get("student_id"), proc.get("supervisor_id"), proc.get("implant_incharge_id")] if uid and uid != editor_id]
        # Deduplicate
        recipient_ids = list(dict.fromkeys(candidate_ids))
        for uid in recipient_ids:
            await db.notifications.insert_one({
                "user_id": uid,
                "procedure_id": procedure_id,
                "message": msg,
                "type": "case_edited",
                "read": False,
                "created_at": datetime.utcnow(),
            })
        if recipient_ids:
            await send_expo_push_notifications(
                recipient_ids,
                f"Case edited · {patient_label}",
                msg,
                {"procedure_id": procedure_id, "type": "case_edited"},
                redact=[patient_label],
            )
    
    updated = await db.procedures.find_one({"_id": ObjectId(procedure_id)}, {"_id": 0})
    return updated



# ───────────────────────────────────────────────────────────────────
# Pre-Op Augmentation Checklist (iter-136)
#  - GET    /procedures/{id}/augmentation-checklist               → list items
#  - POST   /procedures/{id}/augmentation-checklist/regenerate    → rebuild
#  - PATCH  /procedures/{id}/augmentation-checklist/{item_id}     → toggle
# Authorization:
#  - GET: any case stakeholder (student/supervisor/in-charge/admin/nurse).
#  - REGENERATE: case stakeholders (preserves completed-state where titles match).
#  - TOGGLE: only Supervisor / Implant In-Charge / Admin (sign-off authority).
# ───────────────────────────────────────────────────────────────────

def _is_case_stakeholder(proc: dict, user: dict) -> bool:
    uid = user.get("_id")
    if not uid:
        return False
    if user.get("role") in ("administrator", "implant_incharge"):
        return True
    return uid in (proc.get("student_id"), proc.get("supervisor_id"), proc.get("implant_incharge_id"))


async def _is_case_readable(procedure_id: str, proc: dict, user: dict) -> bool:
    """Stakeholder OR the case has been shared to the Discussion Forum — forum
    members get read-only access to these GET endpoints too (matches GET
    /procedures/{id}). Anonymous-share PII redaction doesn't apply here since
    these endpoints only return checklist items / rule-engine hits, not
    patient identity. Write endpoints (regenerate/toggle) stay stakeholder-only."""
    if _is_case_stakeholder(proc, user):
        return True
    if user.get("role") == "nurse":
        return False
    thread = await db.forum_threads.find_one({
        "procedure_id": procedure_id,
        "status": {"$in": ["open", "closed"]},
    })
    return thread is not None


@api_router.get("/procedures/{procedure_id}/augmentation-checklist")
async def get_augmentation_checklist(procedure_id: str, current_user: dict = Depends(get_current_user)):
    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)}, {"_id": 0})
    if not proc:
        raise HTTPException(status_code=404, detail="Case not found")
    await _assert_procedure_org_access(proc, current_user)
    if not await _is_case_readable(procedure_id, proc, current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    return {
        "items": proc.get("augmentation_checklist") or [],
        "generated_at": proc.get("augmentation_checklist_generated_at") or "",
        "generated_by": proc.get("augmentation_checklist_generated_by") or "",
    }


@api_router.get("/procedures/{procedure_id}/clinical-evaluation")
async def get_clinical_evaluation(
    procedure_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Run the deterministic clinical-rule engine over a procedure.
    Returns ordered hits (hard_block → warning → info) so the UI can
    render evidence-cited banners next to the affected phase."""
    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not proc:
        raise HTTPException(status_code=404, detail="Case not found")
    await _assert_procedure_org_access(proc, current_user)
    if not await _is_case_readable(procedure_id, proc, current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    flat = {**proc}
    p2 = proc.get("phase2_data") or {}
    if p2:
        flat["implant_plans"] = p2.get("implant_plans") or proc.get("implant_plans") or []
    ma = proc.get("medical_assessment") or {}
    mh_base = proc.get("medical_history") or {}
    mh = {**mh_base}
    if "hba1c" not in mh:
        raw_hba1c = ma.get("hba1c")
        if raw_hba1c not in (None, ""):
            try:
                mh["hba1c"] = float(str(raw_hba1c).strip())
            except (ValueError, TypeError):
                pass
    if "smoker" not in mh:
        smoking = ma.get("smoking")
        if smoking and smoking != "No":
            mh["smoker"] = True
    flat["medical_history"] = mh
    hits = evaluate_clinical_rules(flat)
    counts = {"hard_block": 0, "warning": 0, "info": 0}
    for h in hits:
        counts[h["severity"]] = counts.get(h["severity"], 0) + 1
    return {
        "procedure_id": procedure_id,
        "hits": hits,
        "counts": counts,
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
    }


@api_router.post("/procedures/{procedure_id}/augmentation-checklist/regenerate")
async def regenerate_augmentation_checklist(procedure_id: str, current_user: dict = Depends(get_current_user)):
    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)}, {"_id": 0})
    if not proc:
        raise HTTPException(status_code=404, detail="Case not found")
    await _assert_procedure_org_access(proc, current_user)
    if not _is_case_stakeholder(proc, current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    new_items = generate_augmentation_checklist(proc)
    # Preserve completed-state on items whose title still matches.
    old_state = {it.get("title"): it for it in (proc.get("augmentation_checklist") or []) if isinstance(it, dict)}
    for ni in new_items:
        prev = old_state.get(ni["title"])
        if prev and prev.get("completed"):
            ni.update({k: prev.get(k) for k in ("completed", "completed_by_id", "completed_by_name", "completed_at", "completed_notes")})
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$set": {
            "augmentation_checklist": new_items,
            "augmentation_checklist_generated_at": now_iso,
            "augmentation_checklist_generated_by": current_user.get("_id") or "",
        }},
    )
    return {"items": new_items, "generated_at": now_iso}


@api_router.patch("/procedures/{procedure_id}/augmentation-checklist/{item_id}")
async def toggle_augmentation_checklist_item(
    procedure_id: str,
    item_id: str,
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") not in ("supervisor", "implant_incharge", "administrator"):
        raise HTTPException(status_code=403, detail="Only Supervisors and Implant In-Charge can sign off augmentation items")
    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)}, {"_id": 0})
    if not proc:
        raise HTTPException(status_code=404, detail="Case not found")
    items = list(proc.get("augmentation_checklist") or [])
    target_idx = next((i for i, it in enumerate(items) if isinstance(it, dict) and it.get("id") == item_id), -1)
    if target_idx < 0:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    completed = bool(body.get("completed", True))
    notes = sanitize_input(str(body.get("notes") or ""))[:500]
    now_iso = datetime.now(timezone.utc).isoformat()
    items[target_idx] = {
        **items[target_idx],
        "completed": completed,
        "completed_by_id": current_user.get("_id") if completed else None,
        "completed_by_name": current_user.get("name") if completed else None,
        "completed_at": now_iso if completed else None,
        "completed_notes": notes,
    }
    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$set": {"augmentation_checklist": items}},
    )
    return {"item": items[target_idx], "items": items}



# ───────────────────────────────────────────────────────────────────
# Phase 2 Edit Request — student flags wrong prosthesis/cuff data
# captured in Phase 2 so the Supervisor/In-Charge can correct it
# before Phase 3 is submitted. Non-blocking; reuses /edit-fields
# for the actual save (see Phase2EditModal on the client).
# Payload body: { "fields": ["prosthesis_type"|"healing_abutment_cuff_height"|"other"], "note": "<=500 chars" }
# ───────────────────────────────────────────────────────────────────
class Phase2EditRequestCreate(BaseModel):
    fields: List[str] = Field(default_factory=list)
    note: Optional[str] = Field(None, max_length=500)

@api_router.post("/procedures/{procedure_id}/phase2-edit-request")
async def create_phase2_edit_request(
    procedure_id: str,
    body: Phase2EditRequestCreate,
    current_user: dict = Depends(get_current_user),
):
    """Student-only: file an edit request against locked Phase 2 data."""
    if current_user["role"] != "student":
        raise HTTPException(status_code=403, detail="Only the case student can request a Phase 2 edit")
    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(proc, current_user)
    if proc.get("student_id") != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Access denied — not your case")
    if not proc.get("phase2_data"):
        raise HTTPException(status_code=400, detail="Phase 2 has not been submitted yet")
    # Block duplicate pending requests
    existing = [r for r in (proc.get("phase2_edit_requests") or []) if r.get("status") == "pending"]
    if existing:
        raise HTTPException(status_code=409, detail="An edit request is already pending on this case")

    allowed = {"prosthesis_type", "healing_abutment_cuff_height", "other"}
    req_fields = [f for f in (body.fields or []) if f in allowed]
    if not req_fields and not (body.note or "").strip():
        raise HTTPException(status_code=400, detail="Select at least one field or add a note")

    now = datetime.now(timezone.utc)
    request_doc = {
        "id": str(uuid.uuid4()),
        "requested_by": current_user["_id"],
        "requested_by_name": current_user.get("name") or current_user["_id"],
        "requested_at": now.isoformat(),
        "fields": req_fields,
        "note": (body.note or "").strip() or None,
        "status": "pending",
        "resolved_by": None,
        "resolved_by_name": None,
        "resolved_by_role": None,
        "resolved_at": None,
    }
    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$push": {"phase2_edit_requests": request_doc}},
    )

    # Notify supervisor + in-charge (both can resolve per product spec 1c)
    recipients = list(dict.fromkeys([r for r in [proc.get("supervisor_id"), proc.get("implant_incharge_id")] if r]))
    patient_label = proc.get("patient_name") or "case"
    pretty_fields = ", ".join(f.replace("_", " ") for f in req_fields) if req_fields else "Phase 2 data"
    msg = f"{request_doc['requested_by_name']} requested edit on {pretty_fields} for {patient_label}"
    for uid in recipients:
        await db.notifications.insert_one({
            "user_id": uid,
            "procedure_id": procedure_id,
            "message": msg,
            "type": "phase2_edit_request",
            "read": False,
            "created_at": datetime.utcnow(),
        })
    if recipients:
        await send_expo_push_notifications(
            recipients,
            f"Phase 2 edit requested · {patient_label}",
            msg,
            {"procedure_id": procedure_id, "type": "phase2_edit_request", "request_id": request_doc["id"]},
            redact=[patient_label],
        )
    return request_doc


@api_router.post("/procedures/{procedure_id}/phase2-edit-request/{request_id}/cancel")
async def cancel_phase2_edit_request(
    procedure_id: str,
    request_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Student-only: cancel a pending request they filed."""
    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(proc, current_user)
    reqs = proc.get("phase2_edit_requests") or []
    target = next((r for r in reqs if r.get("id") == request_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Edit request not found")
    if target.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Request already {target.get('status')}")
    if target.get("requested_by") != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only the requesting student can cancel this request")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id), "phase2_edit_requests.id": request_id},
        {"$set": {
            "phase2_edit_requests.$.status": "cancelled",
            "phase2_edit_requests.$.resolved_at": now_iso,
            "phase2_edit_requests.$.resolved_by": current_user["_id"],
            "phase2_edit_requests.$.resolved_by_name": current_user.get("name") or current_user["_id"],
            "phase2_edit_requests.$.resolved_by_role": "student",
        }},
    )
    return {"ok": True, "status": "cancelled"}


@api_router.post("/procedures/{procedure_id}/phase2-edit-request/{request_id}/resolve")
async def resolve_phase2_edit_request(
    procedure_id: str,
    request_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Supervisor or In-Charge marks the request resolved after saving edits."""
    if current_user["role"] not in ("supervisor", "implant_incharge", "administrator"):
        raise HTTPException(status_code=403, detail="Only Supervisor or Implant In-Charge can resolve")
    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(proc, current_user)
    if current_user["role"] == "supervisor" and proc.get("supervisor_id") != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Access denied — not your case")
    reqs = proc.get("phase2_edit_requests") or []
    target = next((r for r in reqs if r.get("id") == request_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Edit request not found")
    if target.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Request already {target.get('status')}")

    now_iso = datetime.now(timezone.utc).isoformat()
    resolver_name = current_user.get("name") or current_user["_id"]
    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id), "phase2_edit_requests.id": request_id},
        {"$set": {
            "phase2_edit_requests.$.status": "resolved",
            "phase2_edit_requests.$.resolved_at": now_iso,
            "phase2_edit_requests.$.resolved_by": current_user["_id"],
            "phase2_edit_requests.$.resolved_by_name": resolver_name,
            "phase2_edit_requests.$.resolved_by_role": current_user["role"],
        }},
    )
    # Notify the student who filed it
    student_id = target.get("requested_by")
    if student_id:
        role_label = {"implant_incharge": "Implant In-Charge", "supervisor": "Supervisor"}.get(current_user["role"], current_user["role"].title())
        patient_label = proc.get("patient_name") or "your case"
        msg = f"{role_label} {resolver_name} updated Phase 2 data for {patient_label}"
        await db.notifications.insert_one({
            "user_id": student_id,
            "procedure_id": procedure_id,
            "message": msg,
            "type": "phase2_edit_resolved",
            "read": False,
            "created_at": datetime.utcnow(),
        })
        await send_expo_push_notifications(
            [student_id],
            f"Phase 2 updated · {patient_label}",
            msg,
            {"procedure_id": procedure_id, "type": "phase2_edit_resolved"},
            redact=[patient_label],
        )
    return {"ok": True, "status": "resolved"}




@api_router.delete("/procedures/{procedure_id}")
async def delete_procedure(procedure_id: str, current_user: dict = Depends(get_current_user)):
    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(proc, current_user)

    # Allow any user to delete their own draft cases
    is_owner = proc.get("created_by_id") == current_user["_id"] or proc.get("student_id") == current_user["_id"]
    is_draft = proc.get("status") == "draft"
    is_incharge = current_user["role"] == "implant_incharge"

    if not (is_incharge or (is_owner and is_draft)):
        raise HTTPException(status_code=403, detail="Only Implant Incharge or the case creator (for drafts) can delete procedures")
    
    result = await db.procedures.delete_one({"_id": ObjectId(procedure_id)})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Procedure not found")
    
    # Delete related notifications
    await db.notifications.delete_many({"procedure_id": procedure_id})
    
    return {"message": "Procedure deleted successfully"}


@api_router.post("/procedures/{procedure_id}/archive")
async def archive_procedure(procedure_id: str, current_user: dict = Depends(get_current_user)):
    """Archive a procedure. Available to all roles except nurse."""
    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(proc, current_user)
    if current_user["role"] == "nurse":
        raise HTTPException(status_code=403, detail="Nurses cannot archive procedures")
    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$set": {"archived": True, "archived_by": current_user["_id"], "archived_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Procedure archived successfully"}


@api_router.post("/procedures/{procedure_id}/unarchive")
async def unarchive_procedure(procedure_id: str, current_user: dict = Depends(get_current_user)):
    """Unarchive a procedure."""
    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(proc, current_user)
    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$set": {"archived": False}, "$unset": {"archived_by": "", "archived_at": ""}}
    )
    return {"message": "Procedure unarchived successfully"}


# ── Reschedule surgery (iter-269) ─────────────────────────────────────────
# Allows the case creator OR faculty (supervisor / implant_incharge /
# administrator) to change the scheduled procedure_date + procedure_time
# while Phase 2 has not been initiated yet. A reason note is mandatory
# and every change is appended to `reschedule_history` for full audit.
# All other assigned stakeholders receive a push + in-app notification.
class RescheduleRequest(BaseModel):
    procedure_date: str = Field(..., max_length=30)
    procedure_time: str = Field(..., max_length=20)
    reason: str = Field(..., min_length=3, max_length=500)


# Statuses where Phase 2 has NOT been initiated yet — eligible to reschedule.
RESCHEDULE_ELIGIBLE_STATUSES = {
    "draft",
    "pending_phase1",
    "rejected_phase1",
    "phase1_approved",
}


@api_router.post("/procedures/{procedure_id}/reschedule")
async def reschedule_procedure(
    procedure_id: str,
    body: RescheduleRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(proc, current_user)

    # Permission: case creator OR faculty
    creator_id = proc.get("created_by_id") or proc.get("student_id")
    role = current_user.get("role")
    is_creator = creator_id == current_user["_id"]
    is_faculty = role in ("supervisor", "implant_incharge", "administrator")
    if not (is_creator or is_faculty):
        raise HTTPException(
            status_code=403,
            detail="Only the case creator or a Supervisor / Implant In-Charge / Administrator can reschedule this case.",
        )

    # Eligibility window: Phase 2 must not have started yet.
    if proc.get("status") not in RESCHEDULE_ELIGIBLE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="This case can no longer be rescheduled because Phase 2 (or a later phase) has already been initiated.",
        )

    # Validate scheduling rules (Sunday block + Saturday-only 10:00 slot).
    try:
        new_dt = datetime.strptime(f"{body.procedure_date} {body.procedure_time}", "%Y-%m-%d %H:%M")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date/time format. Expected YYYY-MM-DD and HH:MM.")

    if new_dt.weekday() == 6:
        raise HTTPException(status_code=400, detail="No scheduling is available on Sundays.")
    if new_dt.weekday() == 5 and body.procedure_time != "10:00":
        raise HTTPException(status_code=400, detail="Only 10:00 AM slot is available on Saturdays.")

    # Slot conflict — skip for existing-implant cases (their date is synthetic
    # per the create-procedure-from-existing handler).
    is_existing_implants_case = bool(proc.get("existing_implants"))
    if not is_existing_implants_case:
        clash = await db.procedures.find_one({
            "_id": {"$ne": ObjectId(procedure_id)},
            "procedure_date": body.procedure_date,
            "procedure_time": body.procedure_time,
            "status": {"$ne": "draft"},
        })
        if clash:
            booked_by = clash.get("created_by_name") or clash.get("student_name") or "Unknown"
            patient = clash.get("patient_name", "Unknown")
            slot_label = "10:00 AM" if body.procedure_time == "10:00" else body.procedure_time
            raise HTTPException(
                status_code=409,
                detail=f"The {slot_label} slot on {body.procedure_date} is already booked for patient {patient} (scheduled by {booked_by}). Please choose a different time or date.",
            )

    # No-op guard
    if proc.get("procedure_date") == body.procedure_date and proc.get("procedure_time") == body.procedure_time:
        raise HTTPException(status_code=400, detail="New date/time is the same as the current schedule.")

    now_iso = datetime.now(timezone.utc).isoformat()
    history_entry = {
        "id": str(uuid.uuid4()),
        "from_date": proc.get("procedure_date"),
        "from_time": proc.get("procedure_time"),
        "to_date": body.procedure_date,
        "to_time": body.procedure_time,
        "reason": body.reason.strip(),
        "by_user_id": current_user["_id"],
        "by_user_name": current_user.get("name") or current_user.get("username"),
        "by_user_role": role,
        "at": now_iso,
    }

    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {
            "$set": {
                "procedure_date": body.procedure_date,
                "procedure_time": body.procedure_time,
            },
            "$push": {"reschedule_history": history_entry},
        },
    )

    # Notify other assigned stakeholders (push + in-app).
    actor_id = current_user["_id"]
    recipient_ids = [
        rid for rid in [
            proc.get("student_id"),
            proc.get("supervisor_id"),
            proc.get("implant_incharge_id"),
            proc.get("nurse_id"),
            creator_id,
        ]
        if rid and rid != actor_id
    ]
    recipient_ids = list(dict.fromkeys(recipient_ids))  # dedupe, preserve order

    patient_label = proc.get("patient_name") or "case"
    msg = (
        f"{history_entry['by_user_name']} rescheduled {patient_label} "
        f"from {history_entry['from_date'] or '—'} {history_entry['from_time'] or ''} "
        f"to {body.procedure_date} {body.procedure_time}. Reason: {history_entry['reason']}"
    ).strip()

    for uid in recipient_ids:
        await db.notifications.insert_one({
            "user_id": uid,
            "procedure_id": procedure_id,
            "message": msg,
            "type": "procedure_rescheduled",
            "read": False,
            "created_at": datetime.utcnow(),
        })
    if recipient_ids:
        await send_expo_push_notifications(
            recipient_ids,
            f"Surgery rescheduled · {patient_label}",
            f"New schedule: {body.procedure_date} at {body.procedure_time}",
            {
                "procedure_id": procedure_id,
                "type": "procedure_rescheduled",
                "new_date": body.procedure_date,
                "new_time": body.procedure_time,
            },
            redact=[patient_label],
        )

    # iter-270: HIPAA audit — every reschedule is recorded to access_logs
    # (and therefore the admin CSV export) with the full reason note.
    await log_access(
        action="procedure_reschedule",
        resource_type="procedure",
        resource_id=procedure_id,
        user=current_user,
        request=request,
        extra={
            "patient_name": patient_label,
            "from_date": history_entry["from_date"],
            "from_time": history_entry["from_time"],
            "to_date": body.procedure_date,
            "to_time": body.procedure_time,
            "reason": history_entry["reason"],
            "notified_user_ids": recipient_ids,
        },
    )

    return {"message": "Procedure rescheduled successfully", "entry": history_entry}





# File Upload for CBCT
ALLOWED_EXTENSIONS = {'.pdf', '.png', '.jpg', '.jpeg', '.heif', '.heic'}
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB


@api_router.get("/procedures/{procedure_id}/consent-form-template")
async def generate_consent_template(
    procedure_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Generate a printable Patient Consent Form pre-filled with case data plus signature fields.
    Users print this, collect the patient's handwritten signature, then upload the signed copy
    via /upload-consent.
    """
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)
    
    role = current_user.get("role")
    uid = current_user.get("_id")
    is_stakeholder = (
        procedure.get("created_by_id") == uid or
        procedure.get("student_id") == uid or
        procedure.get("supervisor_id") == uid or
        procedure.get("implant_incharge_id") == uid or
        role in ("nurse", "implant_incharge", "administrator", "supervisor")
    )
    if not is_stakeholder:
        raise HTTPException(status_code=403, detail="Not allowed to view this consent form")

    branding = await _get_procedure_org_branding(procedure)
    org_name = branding["name"]

    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, Image as RLImage
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
    
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=12*mm, rightMargin=12*mm, topMargin=8*mm, bottomMargin=8*mm)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name='OrgHeader', fontName='Helvetica-Bold', fontSize=11, textColor=colors.HexColor('#263238'), alignment=1, spaceAfter=1))
    styles.add(ParagraphStyle(name='TitleC', fontName='Helvetica-Bold', fontSize=13, textColor=colors.HexColor('#0D47A1'), alignment=1, spaceAfter=2))
    styles.add(ParagraphStyle(name='SubC', fontName='Helvetica', fontSize=7.5, textColor=colors.HexColor('#546E7A'), alignment=1, spaceAfter=4))
    styles.add(ParagraphStyle(name='H2', fontName='Helvetica-Bold', fontSize=8.5, textColor=colors.HexColor('#1565C0'), spaceBefore=4, spaceAfter=1))
    styles.add(ParagraphStyle(name='Body', fontName='Helvetica', fontSize=7, textColor=colors.HexColor('#263238'), leading=9, alignment=TA_JUSTIFY))
    styles.add(ParagraphStyle(name='BulletC', fontName='Helvetica', fontSize=7, textColor=colors.HexColor('#263238'), leading=9, leftIndent=10, bulletIndent=2))
    styles.add(ParagraphStyle(name='SigLabel', fontName='Helvetica-Bold', fontSize=7.5, textColor=colors.HexColor('#37474F')))
    styles.add(ParagraphStyle(name='SmallGrey', fontName='Helvetica-Oblique', fontSize=6.5, textColor=colors.HexColor('#78909C')))
    
    story = []
    
    # ── Header ──
    if branding.get("logo_bytes"):
        try:
            logo_img = RLImage(io.BytesIO(branding["logo_bytes"]))
            ratio = logo_img.imageWidth / float(logo_img.imageHeight or 1)
            logo_img.drawHeight = 14 * mm
            logo_img.drawWidth = min(14 * mm * ratio, 60 * mm)
            logo_img.drawHeight = logo_img.drawWidth / ratio
            logo_img.hAlign = 'CENTER'
            story.append(logo_img)
            story.append(Spacer(1, 2))
        except Exception:
            pass  # unreadable logo — letterhead falls back to name only
    if org_name:
        from xml.sax.saxutils import escape as _xml_escape
        story.append(Paragraph(_xml_escape(org_name), styles['OrgHeader']))
    story.append(Paragraph("INFORMED CONSENT — DENTAL IMPLANT PROCEDURE", styles['TitleC']))
    story.append(Paragraph("Please read carefully before signing. Keep one signed copy for your records.", styles['SubC']))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#CFD8DC'), spaceAfter=3))
    
    # ── Patient Information ──
    story.append(Paragraph("Patient Information", styles['H2']))
    patient_rows = [
        ["Patient Name:", procedure.get("patient_name") or "____________________________", "Age:", str(procedure.get("age") or "____")],
        ["Sex:", procedure.get("sex") or "____", "Registration No.:", procedure.get("registration_number") or "____________"],
        ["Mobile:", procedure.get("mobile_number") or "____________", "Email:", procedure.get("email") or "____________"],
        ["Chief Complaint:", Paragraph(procedure.get("chief_complaint") or "____________________________________________________", styles['Body']), "", ""],
    ]
    pt = Table(patient_rows, colWidths=[25*mm, 70*mm, 22*mm, 45*mm])
    pt.setStyle(TableStyle([
        ('FONTNAME', (0,0), (-1,-1), 'Helvetica'),
        ('FONTSIZE', (0,0), (-1,-1), 7.5),
        ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
        ('FONTNAME', (2,0), (2,-1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0,0), (-1,-1), colors.HexColor('#263238')),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('TOPPADDING', (0,0), (-1,-1), 1),
        ('SPAN', (1,3), (3,3)),
    ]))
    story.append(pt)
    
    # ── Procedure Details ──
    story.append(Paragraph("Planned Procedure", styles['H2']))
    proc_rows = [
        ["Procedure Type:", procedure.get("implant_procedure_type") or "____________________"],
        ["Arch:", procedure.get("arch") or "____________________"],
        ["Site / Teeth:", ", ".join(procedure.get("missing_teeth") or []) or ", ".join(procedure.get("edentulous_sites") or []) or procedure.get("edentulous_site") or "____________"],
        ["Loading Protocol:", ", ".join(procedure.get("loading_type") or []) or "____________________"],
        ["Treating Clinician:", procedure.get("student_name") or procedure.get("created_by_name") or "____________________"],
        ["Supervising Clinician:", procedure.get("supervisor_name") or "____________________"],
        ["Implant In-Charge:", procedure.get("implant_incharge_name") or "____________________"],
        ["Scheduled Date:", f"{procedure.get('procedure_date','__________')} at {procedure.get('procedure_time','______')}"],
    ]
    if (procedure.get("implant_procedure_type") or "") == "Sinus Lift":
        proc_rows.insert(1, ["Type of Sinus Lift:", procedure.get("sinus_lift_type") or "____________________"])
        proc_rows.insert(2, ["Bone Graft Material:", procedure.get("bone_graft_material_details") or "____________________"])
    prt = Table(proc_rows, colWidths=[40*mm, 142*mm])
    prt.setStyle(TableStyle([
        ('FONTNAME', (0,0), (-1,-1), 'Helvetica'),
        ('FONTSIZE', (0,0), (-1,-1), 7.5),
        ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0,0), (-1,-1), colors.HexColor('#263238')),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 1),
        ('TOPPADDING', (0,0), (-1,-1), 1),
        ('BACKGROUND', (0,0), (0,-1), colors.HexColor('#F5F7FA')),
    ]))
    story.append(prt)
    
    # ── Selected Implants (if any) ──
    implants = procedure.get("implants") or procedure.get("selected_implants") or []
    if implants:
        implant_rows = [["#", "Site", "Brand / System", "Diameter × Length"]]
        for i, imp in enumerate(implants, 1):
            site = imp.get("tooth") or imp.get("site") or imp.get("fdi") or "—"
            brand = imp.get("brand") or imp.get("manufacturer") or "—"
            system = imp.get("system") or imp.get("line") or ""
            label = f"{brand} {system}".strip()
            dia = imp.get("diameter") or imp.get("width") or "—"
            length = imp.get("length") or "—"
            implant_rows.append([str(i), str(site), label, f"{dia} × {length} mm"])
        it = Table(implant_rows, colWidths=[10*mm, 30*mm, 85*mm, 45*mm])
        it.setStyle(TableStyle([
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,-1), 8.5),
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#E3F2FD')),
            ('TEXTCOLOR', (0,0), (-1,-1), colors.HexColor('#263238')),
            ('GRID', (0,0), (-1,-1), 0.4, colors.HexColor('#CFD8DC')),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
            ('TOPPADDING', (0,0), (-1,-1), 4),
        ]))
        story.append(Paragraph("Planned Implant(s)", styles['H2']))
        story.append(it)
    
    # ── Nature, Risks, Alternatives, Responsibilities (compact) ──
    story.append(Paragraph("1. Nature of the Procedure", styles['H2']))
    story.append(Paragraph(
        "A dental implant is a titanium or zirconia post surgically placed into the jawbone to replace missing teeth. "
        "The procedure may involve local anaesthesia, gingival incision, osteotomy, implant placement, bone grafting if needed, "
        "and suture closure. A prosthesis (crown / bridge / denture) is delivered after a healing period.",
        styles['Body']
    ))
    
    story.append(Paragraph("2. Known Risks &amp; Complications", styles['H2']))
    story.append(Paragraph(
        "Pain, swelling, bruising, and post-operative bleeding; infection requiring antibiotics; injury to adjacent teeth, nerves, "
        "blood vessels, or the maxillary sinus; temporary or (rarely) permanent numbness of the lip, chin, or tongue; failure of "
        "osseointegration requiring implant removal and possible re-placement; need for additional procedures (bone graft, sinus lift, "
        "soft-tissue augmentation); late mechanical complications — screw loosening, prosthesis fracture, wear; aesthetic variability.",
        styles['Body']
    ))
    
    story.append(Paragraph("3. Alternatives &amp; My Responsibilities", styles['H2']))
    story.append(Paragraph(
        "<b>Alternatives:</b> no treatment, conventional fixed bridge, removable partial/complete denture, orthodontic repositioning — "
        "advantages, limitations, and costs have been explained to me. "
        "<b>My responsibilities:</b> disclose complete medical history and medications; follow pre- and post-operative instructions; "
        "attend all follow-ups; maintain oral hygiene; refrain from smoking during healing; pay agreed professional fees.",
        styles['Body']
    ))
    
    # ── Data Protection & Digital Record Consent (4 → renumbered) ──
    story.append(Paragraph("4. Data Protection &amp; Digital Record Consent", styles['H2']))
    story.append(Paragraph(
        "<b>In plain language:</b> I understand my clinical information — name, contact details, medical history, radiographs, "
        "photographs, and treatment records — will be stored in the Implanr application and shared with the clinicians and authorized "
        "staff directly involved in my care (treating clinician, supervising faculty or senior dentist, implant in-charge, nurses, and "
        "the designated clinic/institution administrator). I may withdraw this consent in writing at any time, understanding that "
        "withdrawal may affect continuity of treatment.",
        styles['Body']
    ))
    story.append(Paragraph(
        "<b>Formal clause:</b> I expressly and voluntarily consent, under the Digital Personal Data Protection Act, 2023 (and, where "
        "applicable, GDPR, HIPAA, or other governing law), to the collection, storage, processing, and transmission of my identifiable "
        "health data within the Implanr application for clinical evaluation, treatment planning, treatment delivery, audit, and "
        "longitudinal record-keeping, and to access by, and sharing with, the individuals lawfully involved in my treatment.",
        styles['Body']
    ))
    
    # ── Consent Statement (5) ──
    story.append(Paragraph("5. Consent Statement", styles['H2']))
    story.append(Paragraph(
        "I have read and understood the information above, had the opportunity to ask questions, and had all my questions answered "
        "to my satisfaction. I understand that dentistry is not an exact science and no guarantees have been made regarding the "
        "outcome. I hereby authorize the treating clinician and their team to perform the procedure described above, along with any "
        "additional procedures deemed necessary during treatment in my best interest. I also consent to clinical photography/video "
        "recording for record-keeping, clinical, and educational purposes with appropriate identity safeguards.",
        styles['Body']
    ))
    
    # ── Signatures (compact) ──
    story.append(Spacer(1, 4))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#CFD8DC'), spaceAfter=2))
    story.append(Paragraph("Signatures", styles['H2']))
    sig_line = "__________________________"
    sig_rows = [
        ["Patient Signature:", sig_line, "Date:", "____________"],
        ["Patient Name (printed):", procedure.get("patient_name") or sig_line, "", ""],
        ["Guardian Signature (if minor):", sig_line, "Relationship:", "____________"],
        ["Treating Clinician Signature:", sig_line, "Date:", "____________"],
        ["Treating Clinician Name:", procedure.get("student_name") or procedure.get("created_by_name") or sig_line, "", ""],
        ["Witness Signature:", sig_line, "Witness Name:", sig_line],
    ]
    st = Table(sig_rows, colWidths=[45*mm, 65*mm, 22*mm, 50*mm])
    st.setStyle(TableStyle([
        ('FONTNAME', (0,0), (-1,-1), 'Helvetica'),
        ('FONTSIZE', (0,0), (-1,-1), 7.5),
        ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
        ('FONTNAME', (2,0), (2,-1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0,0), (-1,-1), colors.HexColor('#263238')),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('TOPPADDING', (0,0), (-1,-1), 1),
    ]))
    story.append(st)
    story.append(Paragraph(
        "Print — get patient to sign — scan or photograph — upload in the Implanr app to unlock Phase 2.",
        styles['SmallGrey']
    ))
    
    doc.build(story)
    buf.seek(0)
    filename = f"Consent_{(procedure.get('patient_name') or 'Patient').replace(' ', '_')}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@api_router.post("/uploads/consent-temp")
async def upload_consent_temp(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload Patient Consent Form before procedure creation (from Phase 1 form). Returns a temp reference to attach."""
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 25MB limit")
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOADS_DIR / unique_name
    with open(file_path, "wb") as f:
        f.write(contents)
    import mimetypes as _mt_5799
    await _s3_put_async(file_path, content_type=_mt_5799.guess_type(str(file_path))[0])
    return {
        "filename": unique_name,
        "original_name": file.filename,
        "content_type": file.content_type or "application/pdf",
    }


@api_router.post("/procedures/{procedure_id}/upload-consent")
async def upload_consent_for_procedure(
    procedure_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload (or replace) the Patient Consent Form for an existing case.
    Permitted: case creator, assigned student, supervisor, in-charge, nurse, administrator.
    When replaced, the previous consent is archived into consent_history[] for audit.
    """
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)
    
    role = current_user.get("role")
    uid = current_user.get("_id")
    is_stakeholder = (
        procedure.get("created_by_id") == uid or
        procedure.get("student_id") == uid or
        procedure.get("supervisor_id") == uid or
        procedure.get("implant_incharge_id") == uid or
        role in ("nurse", "dental_assistant", "implant_incharge", "chief_dentist", "administrator", "supervisor", "dentist")
    )
    if not is_stakeholder:
        raise HTTPException(status_code=403, detail="Not allowed to upload consent for this case")
    
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 25MB limit")
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOADS_DIR / unique_name
    with open(file_path, "wb") as f:
        f.write(contents)
    import mimetypes as _mt_5843
    await _s3_put_async(file_path, content_type=_mt_5843.guess_type(str(file_path))[0])
    
    previous = procedure.get("patient_consent_form")
    version = (previous.get("version", 1) + 1) if previous else 1
    consent_entry = {
        "filename": unique_name,
        "original_name": file.filename,
        "content_type": file.content_type or "application/pdf",
        "uploaded_by_id": uid,
        "uploaded_by_name": current_user.get("name", ""),
        "uploaded_by_role": role or "",
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "version": version,
    }
    
    update_op: dict = {
        "$set": {
            "patient_consent_form": consent_entry,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    }
    # Track the consent change in both dedicated consent_history (versioned
    # file archive) AND the unified edit_log so it surfaces in the case's
    # "Edit History" modal + the Recent Activity feed.
    edit_log_entry = {
        "field": "patient_consent_form",
        "old_value": (previous.get("original_name") if previous else None) or ("v" + str(previous.get("version")) if previous else None),
        "new_value": f"v{version} · {file.filename}",
        "edited_by": current_user.get("name", ""),
        "edited_by_role": role or "",
        "edited_at": datetime.now(timezone.utc).isoformat(),
    }
    if previous:
        update_op["$push"] = {
            "consent_history": previous,
            "edit_log": edit_log_entry,
        }
    else:
        # First upload → still log it so we have a timeline entry for the initial upload.
        update_op["$push"] = {"edit_log": edit_log_entry}
    
    await db.procedures.update_one({"_id": ObjectId(procedure_id)}, update_op)
    
    # Notify other stakeholders that consent is now on file
    patient_label = procedure.get("patient_name") or procedure.get("patient_id") or "case"
    stakeholders = [s for s in [
        procedure.get("student_id"),
        procedure.get("supervisor_id"),
        procedure.get("implant_incharge_id"),
    ] if s and s != uid]
    for sid in stakeholders:
        await db.notifications.insert_one({
            "user_id": sid,
            "procedure_id": procedure_id,
            "message": f"{current_user.get('name','A user')} uploaded the patient consent form for {patient_label}. Phase 2 is now unlocked.",
            "type": "consent_uploaded",
            "read": False,
            "created_at": datetime.utcnow(),
        })
    if stakeholders:
        await send_expo_push_notifications(
            stakeholders,
            f"Consent uploaded · {patient_label}",
            f"Patient consent form uploaded by {current_user.get('name','')}. Phase 2 is unlocked.",
            {"procedure_id": procedure_id, "type": "consent_uploaded"},
            redact=[patient_label],
        )
    
    updated = await db.procedures.find_one({"_id": ObjectId(procedure_id)}, {"_id": 0})
    return updated


@api_router.get("/procedures/nurse/pending-consents")
async def get_pending_consents(current_user: dict = Depends(get_current_user)):
    """List all cases still awaiting a patient consent upload.
    Returns cases where Phase 1 has been submitted (pending or already approved) but no consent form is on file.
    Restricted to nurses, implant in-charges and administrators.
    """
    role = current_user.get("role")
    if role not in ("nurse", "implant_incharge", "administrator", "supervisor"):
        raise HTTPException(status_code=403, detail="Only authorized clinical staff can view pending consents")
    
    statuses_needing_consent = [
        "pending_phase1", "phase1_approved", "pending_phase2",
        "phase2_approved", "pending_stage2_surgical", "stage2_surgical_approved",
        "pending_stage2_prosthetic", "phase2_submitted",
    ]
    query = {
        "status": {"$in": statuses_needing_consent},
        "$and": [
            {"$or": [
                {"patient_consent_form": {"$exists": False}},
                {"patient_consent_form": None},
            ]},
            await _org_scope_match(current_user),
        ],
        "archived": {"$ne": True},
    }
    cursor = db.procedures.find(query, {
        "_id": 1, "patient_name": 1, "patient_id": 1, "student_name": 1, "created_by_name": 1,
        "implant_procedure_type": 1, "num_implants": 1, "status": 1, "created_at": 1, "supervisor_name": 1, "implant_incharge_name": 1,
        "procedure_date": 1, "procedure_time": 1,
    }).sort("created_at", -1).limit(100)
    
    items = []
    async for doc in cursor:
        items.append({
            "id": str(doc["_id"]),
            "patient_name": doc.get("patient_name", ""),
            "patient_id": doc.get("patient_id", ""),
            "student_name": doc.get("student_name") or doc.get("created_by_name", ""),
            "implant_procedure_type": doc.get("implant_procedure_type", ""),
            "num_implants": doc.get("num_implants", ""),
            "status": doc.get("status", ""),
            "supervisor_name": doc.get("supervisor_name", ""),
            "implant_incharge_name": doc.get("implant_incharge_name", ""),
            "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else "",
            "procedure_date": doc.get("procedure_date", ""),
            "procedure_time": doc.get("procedure_time", ""),
        })
    return {"cases": items}


@api_router.get("/procedures/nurse/scheduled-cases")
async def get_nurse_scheduled_cases(
    days: int = 5,
    current_user: dict = Depends(get_current_user),
):
    """Phase-2-ready cases scheduled in the next `days` (default 5, starting today).
    Only shown to nurses/in-charges/admins/supervisors. A case is 'Phase 2-ready' when
    Phase 1 has been approved (status == 'phase1_approved') — i.e. actual surgery is
    queued but Phase 2 hasn't been submitted yet.
    Sorted chronologically (earliest first).
    """
    role = current_user.get("role")
    if role not in ("nurse", "implant_incharge", "administrator", "supervisor"):
        raise HTTPException(status_code=403, detail="Only authorized clinical staff can view scheduled cases")

    if days < 1 or days > 30:
        days = 5
    today = datetime.now().date()
    date_strs = [(today + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days)]

    query = {
        "status": "phase1_approved",
        "procedure_date": {"$in": date_strs},
        "archived": {"$ne": True},
    }
    query.update(await _org_scope_match(current_user))
    cursor = db.procedures.find(query, {
        "_id": 1, "patient_name": 1, "patient_id": 1, "student_name": 1, "created_by_name": 1,
        "implant_procedure_type": 1, "num_implants": 1, "status": 1, "procedure_date": 1, "procedure_time": 1,
        "supervisor_name": 1, "implant_incharge_name": 1, "created_at": 1,
        "instruments_autoclaved": 1, "patient_consent_form": 1,
    }).limit(200)

    items = []
    async for doc in cursor:
        items.append({
            "id": str(doc["_id"]),
            "patient_name": doc.get("patient_name", ""),
            "patient_id": doc.get("patient_id", ""),
            "student_name": doc.get("student_name") or doc.get("created_by_name", ""),
            "implant_procedure_type": doc.get("implant_procedure_type", ""),
            "num_implants": doc.get("num_implants", ""),
            "status": doc.get("status", ""),
            "procedure_date": doc.get("procedure_date", ""),
            "procedure_time": doc.get("procedure_time", ""),
            "supervisor_name": doc.get("supervisor_name", ""),
            "implant_incharge_name": doc.get("implant_incharge_name", ""),
            "instruments_autoclaved": _serialise_instruments_autoclaved(doc.get("instruments_autoclaved")),
            "consent_uploaded": bool(doc.get("patient_consent_form")),
        })
    # Sort chronologically: procedure_date asc, then procedure_time asc (10:00 < 14:00)
    items.sort(key=lambda x: (x["procedure_date"] or "", x["procedure_time"] or ""))
    return {"cases": items, "window_days": days, "start_date": date_strs[0], "end_date": date_strs[-1]}


@api_router.post("/admin/run-pre-surgery-reminders")
async def admin_run_pre_surgery_reminders(current_user: dict = Depends(get_current_user)):
    """On-demand trigger for the pre-surgery reminder sweep. Admins only (used by ops and tests)."""
    if current_user.get("role") not in ("administrator", "implant_incharge"):
        raise HTTPException(status_code=403, detail="Administrator or Implant In-Charge role required")
    await run_pre_surgery_reminders()
    return {"ok": True, "ran_at": datetime.utcnow().isoformat()}


class SafetyOverrideBody(BaseModel):
    """Captures a clinician's decision to override the soft bone-margin warning
    on the implant selection screen. Persisted into access_logs so the audit
    viewer surfaces it under action=safety_override."""
    context: str = Field(..., max_length=80)  # e.g. "implant_selection_home" / "phase1_step2"
    tooth_position: Optional[str] = Field(None, max_length=4)
    bone_width: Optional[float] = None
    bone_height: Optional[float] = None
    implant_diameter: Optional[float] = None
    implant_length: Optional[float] = None
    margin_mm: Optional[float] = None
    system: Optional[str] = Field(None, max_length=120)


@api_router.post("/audit/safety-override")
async def audit_safety_override(
    body: SafetyOverrideBody,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """HIPAA: log when a user dismisses the bone-margin soft-warning.
    Body is intentionally minimal — no PHI, just clinical parameters and the
    context string. Routed through the same access_logs collection used by
    login / procedure_view / pdf_export so In-Charges can review overrides
    in the existing /admin/access-logs viewer."""
    extra = body.dict()
    await log_access(
        action="safety_override",
        resource_type="implant_selection",
        resource_id=body.system or None,
        user=current_user,
        request=request,
        outcome="success",
        extra=extra,
    )
    return {"ok": True}



@api_router.get("/admin/access-logs")
async def admin_get_access_logs(
    limit: int = 100,
    skip: int = 0,
    user_id: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    action: Optional[str] = None,
    outcome: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """HIPAA: paginated audit viewer for admins / in-charges.
    Returns ObjectId-free documents sorted by most recent first."""
    if current_user.get("role") not in ("administrator", "implant_incharge"):
        raise HTTPException(status_code=403, detail="Administrator or Implant In-Charge role required")
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 500")
    if skip < 0:
        raise HTTPException(status_code=400, detail="skip must be >= 0")

    query: Dict[str, Any] = {}
    if user_id:
        query["user_id"] = user_id
    if resource_type:
        query["resource_type"] = resource_type
    if resource_id:
        query["resource_id"] = resource_id
    if action:
        query["action"] = action
    if outcome:
        query["outcome"] = outcome
    date_filter: Dict[str, Any] = {}
    try:
        if start_date:
            date_filter["$gte"] = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
        if end_date:
            date_filter["$lt"] = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="start_date/end_date must be ISO 8601")
    if date_filter:
        query["created_at"] = date_filter

    total = await db.access_logs.count_documents(query)
    cursor = db.access_logs.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    items = []
    async for doc in cursor:
        # datetime → ISO string for JSON safety
        if isinstance(doc.get("created_at"), datetime):
            doc["created_at"] = doc["created_at"].isoformat()
        items.append(doc)
    return {"total": total, "skip": skip, "limit": limit, "items": items}


@api_router.get("/admin/access-logs/export-csv")
async def admin_export_access_logs_csv(
    user_id: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    action: Optional[str] = None,
    outcome: Optional[str] = None,
    start_date: Optional[str] = None,  # ISO date (inclusive)
    end_date: Optional[str] = None,  # ISO date (exclusive upper bound)
    current_user: dict = Depends(get_current_user),
):
    """HIPAA: CSV export of access logs for compliance review (capped at 10k rows)."""
    if current_user.get("role") not in ("administrator", "implant_incharge"):
        raise HTTPException(status_code=403, detail="Administrator or Implant In-Charge role required")

    query: Dict[str, Any] = {}
    if user_id: query["user_id"] = user_id
    if resource_type: query["resource_type"] = resource_type
    if resource_id: query["resource_id"] = resource_id
    if action: query["action"] = action
    if outcome: query["outcome"] = outcome

    date_filter: Dict[str, Any] = {}
    try:
        if start_date:
            date_filter["$gte"] = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
        if end_date:
            date_filter["$lt"] = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="start_date/end_date must be ISO 8601")
    if date_filter:
        query["created_at"] = date_filter

    cursor = db.access_logs.find(query, {"_id": 0}).sort("created_at", -1).limit(10000)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "created_at", "action", "outcome", "user_id", "user_name", "user_role",
        "resource_type", "resource_id", "ip", "user_agent", "extra",
    ])
    async for d in cursor:
        writer.writerow([
            d.get("created_at").isoformat() if isinstance(d.get("created_at"), datetime) else (d.get("created_at") or ""),
            d.get("action") or "",
            d.get("outcome") or "",
            d.get("user_id") or "",
            d.get("user_name") or "",
            d.get("user_role") or "",
            d.get("resource_type") or "",
            d.get("resource_id") or "",
            d.get("ip") or "",
            (d.get("user_agent") or "")[:200],
            json.dumps(d.get("extra"), default=str) if d.get("extra") else "",
        ])

    # Log the export itself — audit-of-the-audit
    await log_access(
        action="audit_export",
        resource_type="access_logs",
        user=current_user,
        extra={"row_count": buf.getvalue().count("\n") - 1, "filters": {k: v for k, v in query.items() if k != "created_at"}},
    )

    filename = f"access_logs_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )



def _serialise_instruments_autoclaved(raw: Optional[dict]) -> Optional[dict]:
    """Convert mongo doc (with datetime) into a JSON-safe dict. Returns None when unmarked."""
    if not raw or not raw.get("marked"):
        return None
    marked_at = raw.get("marked_at")
    return {
        "marked": True,
        "marked_by": str(raw.get("marked_by") or ""),
        "marked_by_name": raw.get("marked_by_name") or "",
        "marked_at": marked_at.isoformat() if isinstance(marked_at, datetime) else (marked_at or ""),
    }


def _parse_procedure_datetime(date_str: str, time_str: str) -> Optional[datetime]:
    """Parse procedure_date (YYYY-MM-DD) + procedure_time (either '10:00' or '10:00 AM') to a naive datetime."""
    if not date_str or not time_str:
        return None
    time_norm = time_str.strip().upper().replace(" ", "")
    fmts_24h = ["%H:%M"]
    fmts_12h = ["%I:%M%p"]
    for fmt in fmts_24h + fmts_12h:
        try:
            if fmt in fmts_12h:
                return datetime.strptime(f"{date_str} {time_norm}", f"%Y-%m-%d {fmt}")
            return datetime.strptime(f"{date_str} {time_str.strip()}", f"%Y-%m-%d {fmt}")
        except ValueError:
            continue
    return None


@api_router.post("/procedures/{procedure_id}/mark-instruments-autoclaved")
async def mark_instruments_autoclaved(
    procedure_id: str,
    payload: dict = Body(default={}),
    current_user: dict = Depends(get_current_user),
):
    """Nurse checkbox: toggle whether instruments have been autoclaved for a scheduled case.
    Window: can only be toggled until 1 hour before the scheduled procedure datetime.
    After that window the record becomes immutable (returns 409).
    Unknown procedure_date/time (shouldn't happen for Phase-2 cases) falls back to allowing the toggle.
    Body: { marked: bool }. Defaults to True if omitted.
    """
    if current_user.get("role") not in ("nurse", "dental_assistant"):
        raise HTTPException(status_code=403, detail="Only nurses / dental assistants can mark instruments autoclaved")

    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)

    marked = bool(payload.get("marked", True))

    # Enforce 1-hour window
    surgery_dt = _parse_procedure_datetime(procedure.get("procedure_date", ""), procedure.get("procedure_time", ""))
    if surgery_dt is not None:
        cutoff = surgery_dt - timedelta(hours=1)
        if datetime.now() >= cutoff:
            raise HTTPException(
                status_code=409,
                detail="Instruments autoclaved status is locked within 1 hour of the scheduled surgery time.",
            )

    if marked:
        value = {
            "marked": True,
            "marked_by": current_user["_id"],
            "marked_by_name": current_user.get("full_name") or current_user.get("name") or current_user.get("email", ""),
            "marked_at": datetime.utcnow(),
        }
    else:
        value = {"marked": False}

    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$set": {"instruments_autoclaved": value}},
    )

    return {"instruments_autoclaved": _serialise_instruments_autoclaved(value)}


@api_router.get("/procedures/nurse/consent-cases")
async def get_nurse_consent_cases(current_user: dict = Depends(get_current_user)):
    """Return all nurse-visible cases with consent-upload status + schedule metadata.
    Used by the nurse Home calendar, Home tiles, and Cases tab filters.
    Only returns cases past the draft stage (i.e. the nurse can actually act on them).
    """
    role = current_user.get("role")
    if role not in ("nurse", "implant_incharge", "administrator", "supervisor"):
        raise HTTPException(status_code=403, detail="Only authorized clinical staff can view consent cases")

    query = {
        "status": {"$nin": ["draft", "rejected"]},
        "archived": {"$ne": True},
    }
    query.update(await _org_scope_match(current_user))
    cursor = db.procedures.find(query, {
        "_id": 1, "patient_name": 1, "patient_id": 1, "student_name": 1, "created_by_name": 1,
        "implant_procedure_type": 1, "status": 1, "procedure_date": 1, "procedure_time": 1,
        "supervisor_name": 1, "implant_incharge_name": 1, "created_at": 1,
        "patient_consent_form": 1, "instruments_autoclaved": 1,
    }).limit(1000)

    items = []
    async for doc in cursor:
        items.append({
            "id": str(doc["_id"]),
            "patient_name": doc.get("patient_name", ""),
            "patient_id": doc.get("patient_id", ""),
            "student_name": doc.get("student_name") or doc.get("created_by_name", ""),
            "implant_procedure_type": doc.get("implant_procedure_type", ""),
            "status": doc.get("status", ""),
            "procedure_date": doc.get("procedure_date", ""),
            "procedure_time": doc.get("procedure_time", ""),
            "supervisor_name": doc.get("supervisor_name", ""),
            "implant_incharge_name": doc.get("implant_incharge_name", ""),
            "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else "",
            "consent_uploaded": bool(doc.get("patient_consent_form")),
            "instruments_autoclaved": _serialise_instruments_autoclaved(doc.get("instruments_autoclaved")),
        })
    items.sort(key=lambda x: (x["procedure_date"] or "", x["procedure_time"] or ""))
    completed = sum(1 for x in items if x["consent_uploaded"])
    pending = len(items) - completed
    return {"cases": items, "completed_count": completed, "pending_count": pending}


@api_router.post("/uploads/cbct-temp")
async def upload_cbct_temp(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload CBCT file before procedure creation. Returns a temp reference to attach later."""
    if current_user.get("role") in ("nurse", "dental_assistant"):
        raise HTTPException(status_code=403, detail="CBCT upload not permitted for this role")
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 25MB limit")
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOADS_DIR / unique_name
    with open(file_path, "wb") as f:
        f.write(contents)
    import mimetypes as _mt_6338
    await _s3_put_async(file_path, content_type=_mt_6338.guess_type(str(file_path))[0])
    return {
        "cbct_file": unique_name,
        "cbct_original_name": file.filename,
        "cbct_content_type": file.content_type or "application/pdf",
    }


@api_router.post("/uploads/media-temp")
async def upload_media_temp(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Generic temp upload for Phase 4 Step 2 imaging (IOPA, OPG) and prosthesis photos.
    Returns clean field names: filename, original_name, content_type."""
    if current_user.get("role") in ("nurse", "dental_assistant"):
        raise HTTPException(status_code=403, detail="Photo/CBCT upload not permitted for this role")
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 25MB limit")
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOADS_DIR / unique_name
    with open(file_path, "wb") as f:
        f.write(contents)
    import mimetypes as _mt_6364
    await _s3_put_async(file_path, content_type=_mt_6364.guess_type(str(file_path))[0])
    return {
        "filename": unique_name,
        "original_name": file.filename,
        "content_type": file.content_type or "application/octet-stream",
    }


@api_router.post("/procedures/{procedure_id}/upload-cbct")
async def upload_cbct(
    procedure_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") in ("nurse", "dental_assistant"):
        raise HTTPException(status_code=403, detail="CBCT upload not permitted for this role")
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)
    
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")
    
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 25MB limit")
    
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOADS_DIR / unique_name
    with open(file_path, "wb") as f:
        f.write(contents)
    import mimetypes as _mt_6396
    await _s3_put_async(file_path, content_type=_mt_6396.guess_type(str(file_path))[0])
    
    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$set": {
            "cbct_file": unique_name,
            "cbct_original_name": file.filename,
            "cbct_content_type": file.content_type,
            "updated_at": datetime.utcnow()
        }}
    )
    
    return {"message": "File uploaded successfully", "filename": file.filename}

@api_router.post("/procedures/{procedure_id}/upload-ios")
async def upload_ios(
    procedure_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "student":
        raise HTTPException(status_code=403, detail="Only students can upload files")
    
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)
    if procedure["student_id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    ext = Path(file.filename).suffix.lower()
    allowed_ios = {'.png', '.jpg', '.jpeg', '.heif', '.heic'}
    if ext not in allowed_ios:
        raise HTTPException(status_code=400, detail=f"File type not allowed. Allowed: {', '.join(allowed_ios)}")
    
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 25MB limit")
    
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOADS_DIR / unique_name
    with open(file_path, "wb") as f:
        f.write(contents)
    import mimetypes as _mt_6438
    await _s3_put_async(file_path, content_type=_mt_6438.guess_type(str(file_path))[0])
    
    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$set": {
            "ios_file": unique_name,
            "ios_original_name": file.filename,
            "ios_content_type": file.content_type,
            "updated_at": datetime.utcnow()
        }}
    )
    
    return {"message": "File uploaded successfully", "filename": file.filename}

@api_router.post("/uploads/mint-file-token")
async def mint_file_token(body: dict, current_user: dict = Depends(get_current_user)):
    """Mint a short-lived, single-file access token for the given filename.
    Requires a logged-in user; authorization for the file itself is enforced at
    serve time (same procedure-membership / role checks as GET /uploads/{filename}),
    so this only needs a valid session and cannot be used to bypass those checks.
    """
    filename = (body.get("filename") or "").strip()
    if not filename or "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    token = _sign_file_token(str(current_user["_id"]), filename)
    return {"token": token, "expires_in_seconds": FILE_TOKEN_TTL_SECONDS}


@api_router.get("/uploads/{filename}")
async def serve_upload(
    filename: str,
    token: Optional[str] = Query(None),
    ft: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user_optional),
):
    file_path = UPLOADS_DIR / filename
    if not await _s3_ensure_local_async(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    # Resolve user from (1) header, (2) scoped file token, (3) legacy access JWT.
    user = current_user
    # (2) Preferred: scoped single-file token — bound to this exact filename.
    if not user and ft:
        data = _verify_file_token(ft)
        if data and data.get("filename") == filename and data.get("uid"):
            try:
                user = await db.users.find_one({"_id": ObjectId(data["uid"])})
            except Exception:
                user = None
    # (3) Back-compat: full access JWT in the query string (being phased out).
    if not user and token:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            uid = payload.get("user_id") or payload.get("sub")
            if uid:
                user = await db.users.find_one({"_id": ObjectId(uid)})
        except Exception:
            pass
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Only supervisor, implant_incharge, administrator, and the procedure's student can view
    procedure = await db.procedures.find_one({"$or": [
        {"cbct_file": filename},
        {"cbct_files.filename": filename},
        {"ios_file": filename},
        {"phase2_data.iopa_files.filename": filename},
        {"phase2_data.opg_file.filename": filename},
        {"phase3_data.iopa_files.filename": filename},
    ]})
    if procedure:
        allowed = False
        if user["role"] in ["administrator", "implant_incharge"]:
            allowed = True
        elif user["role"] == "supervisor" and (
            procedure.get("supervisor_id") == str(user["_id"])
            or procedure.get("created_by_id") == str(user["_id"])
        ):
            allowed = True
        elif user["role"] == "student" and procedure.get("student_id") == str(user["_id"]):
            allowed = True
        if not allowed:
            raise HTTPException(status_code=403, detail="Access denied")
    
    return FileResponse(file_path, filename=procedure.get("cbct_original_name", filename) if procedure else filename)


# ───────────────────────────────────────────────────────────────────
# Public tokenised CBCT viewer (for QR codes embedded in Drilling PDF)
# ───────────────────────────────────────────────────────────────────
# Token format: HMAC-SHA256 signed JSON payload {"p": <procedure_id>, "e": <unix_expiry>}
# base64url-encoded. Verified server-side before serving the viewer or any file.

import hmac as _hmac
import hashlib as _hashlib
import base64 as _base64
import json as _json_cbct

CBCT_TOKEN_TTL_HOURS = 24


def _sign_cbct_token(procedure_id: str) -> str:
    """Return a short signed token valid for 24h from now."""
    exp = int((datetime.now(timezone.utc) + timedelta(hours=CBCT_TOKEN_TTL_HOURS)).timestamp())
    payload = _json_cbct.dumps({"p": procedure_id, "e": exp}, separators=(",", ":")).encode()
    b64 = _base64.urlsafe_b64encode(payload).rstrip(b"=")
    sig = _hmac.new(SECRET_KEY.encode(), b64, _hashlib.sha256).digest()
    sig_b64 = _base64.urlsafe_b64encode(sig).rstrip(b"=")
    return f"{b64.decode()}.{sig_b64.decode()}"


def _verify_cbct_token(token: str) -> Optional[str]:
    """Return procedure_id if the token is valid + unexpired, else None."""
    try:
        b64, sig_b64 = token.split(".", 1)
        expected = _hmac.new(SECRET_KEY.encode(), b64.encode(), _hashlib.sha256).digest()
        got = _base64.urlsafe_b64decode(sig_b64 + "=" * (-len(sig_b64) % 4))
        if not _hmac.compare_digest(expected, got):
            return None
        data = _json_cbct.loads(_base64.urlsafe_b64decode(b64 + "=" * (-len(b64) % 4)))
        if int(data.get("e", 0)) < int(datetime.now(timezone.utc).timestamp()):
            return None
        return str(data["p"])
    except Exception:
        return None


# ── Scoped single-file access token ─────────────────────────────────
# Unlike the full access JWT, this token is NOT a credential for the rest of the
# API. It binds {user_id, filename, short expiry} and is HMAC-signed, so a leaked
# file URL only exposes that one file, for a few minutes, at that user's rights.
FILE_TOKEN_TTL_SECONDS = 300  # 5 minutes


def _sign_file_token(uid: str, filename: str) -> str:
    exp = int((datetime.now(timezone.utc) + timedelta(seconds=FILE_TOKEN_TTL_SECONDS)).timestamp())
    payload = _json_cbct.dumps({"u": uid, "f": filename, "e": exp}, separators=(",", ":")).encode()
    b64 = _base64.urlsafe_b64encode(payload).rstrip(b"=")
    sig = _hmac.new(SECRET_KEY.encode(), b64, _hashlib.sha256).digest()
    sig_b64 = _base64.urlsafe_b64encode(sig).rstrip(b"=")
    return f"{b64.decode()}.{sig_b64.decode()}"


def _verify_file_token(token: str) -> Optional[dict]:
    """Return {uid, filename} if the token is valid + unexpired, else None."""
    try:
        b64, sig_b64 = token.split(".", 1)
        expected = _hmac.new(SECRET_KEY.encode(), b64.encode(), _hashlib.sha256).digest()
        got = _base64.urlsafe_b64decode(sig_b64 + "=" * (-len(sig_b64) % 4))
        if not _hmac.compare_digest(expected, got):
            return None
        data = _json_cbct.loads(_base64.urlsafe_b64decode(b64 + "=" * (-len(b64) % 4)))
        if int(data.get("e", 0)) < int(datetime.now(timezone.utc).timestamp()):
            return None
        return {"uid": str(data["u"]), "filename": str(data["f"])}
    except Exception:
        return None


async def _list_cbct_files(proc: dict) -> List[dict]:
    """Return normalised list of CBCT file entries for a procedure doc.
    Supports both the legacy single-file (cbct_file) and the new cbct_files array.
    Each entry: {filename, original_name, content_type}
    """
    items: List[dict] = []
    seen = set()
    for f in (proc.get("cbct_files") or []):
        fn = f.get("filename")
        if fn and fn not in seen:
            items.append({
                "filename": fn,
                "original_name": f.get("original_name") or fn,
                "content_type": f.get("content_type") or "application/octet-stream",
            })
            seen.add(fn)
    legacy = proc.get("cbct_file")
    if legacy and legacy not in seen:
        items.append({
            "filename": legacy,
            "original_name": proc.get("cbct_original_name") or legacy,
            "content_type": proc.get("cbct_content_type") or "application/octet-stream",
        })
    return items


def _maybe_convert_heic_to_jpeg(path: Path) -> Optional[bytes]:
    """Convert HEIC → JPEG bytes so browsers without HEIC support can render it."""
    try:
        import pillow_heif  # type: ignore
        pillow_heif.register_heif_opener()
        from PIL import Image as _PIL_Image
        img = _PIL_Image.open(str(path)).convert("RGB")
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return buf.getvalue()
    except Exception as exc:
        logging.warning("HEIC→JPEG conversion failed for %s: %s", path, exc)
        return None


@api_router.post("/procedures/{procedure_id}/cbct-qr-token")
async def mint_cbct_qr_token(procedure_id: str, current_user: dict = Depends(get_current_user)):
    """Mint a fresh 24-hour signed token for a case's CBCT QR viewer.
    Only users who can view the case can mint a token (same rules as GET /procedures/{id}).
    """
    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(proc, current_user)
    role = current_user.get("role")
    if role in ("administrator", "implant_incharge", "nurse"):
        allowed = True
    elif role == "supervisor" and proc.get("supervisor_id") == str(current_user["_id"]):
        allowed = True
    elif role == "student" and proc.get("student_id") == str(current_user["_id"]):
        allowed = True
    else:
        allowed = False
    if not allowed:
        raise HTTPException(status_code=403, detail="Not authorised for this case")
    token = _sign_cbct_token(procedure_id)
    return {"token": token, "expires_in_hours": CBCT_TOKEN_TTL_HOURS}


@app.get("/cbct/view/{token}", response_class=HTMLResponse)
async def cbct_public_viewer(token: str):
    """Public HTML viewer reached by scanning the QR code on the printed drilling PDF.
    Renders a minimal gallery of CBCT files for that procedure. Each file can be opened
    via /cbct/file/{token}/{filename} which validates the token on every request.
    """
    procedure_id = _verify_cbct_token(token)
    if not procedure_id:
        return HTMLResponse(
            "<html><body style='font-family:system-ui;text-align:center;padding:40px'>"
            "<h2>Link expired or invalid</h2>"
            "<p>Ask the care team to re-print the drilling protocol to regenerate the QR code.</p>"
            "</body></html>", status_code=403,
        )
    try:
        proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    except Exception:
        proc = None
    if not proc:
        return HTMLResponse("Procedure not found", status_code=404)
    files = await _list_cbct_files(proc)
    patient = proc.get("patient_name") or "Patient"
    items_html = ""
    for f in files:
        ct = (f.get("content_type") or "").lower()
        is_image = ct.startswith("image/") or ct.startswith("application/dicom")
        is_pdf = "pdf" in ct
        preview_url = f"/cbct/file/{token}/{f['filename']}"
        if is_image:
            thumb_inner = f"<img src='{preview_url}'/>"
        else:
            icon = "📄" if is_pdf else "📁"
            thumb_inner = f"<span class='icon'>{icon}</span>"
        orig = f["original_name"]
        meta = ct or "file"
        items_html += (
            f"<a class='item' href='{preview_url}' target='_blank'>"
            f"<div class='thumb'>{thumb_inner}</div>"
            f"<div class='label'>{orig}</div>"
            f"<div class='meta'>{meta}</div>"
            f"</a>"
        )
    actions_html = ""
    if files:
        actions_html = (
            f"<div class='actions'><a class='btn' href='/cbct/pdf/{token}'>"
            f"Download all as one PDF</a></div>"
        )
    if not items_html:
        items_html = "<p class='empty'>No CBCT files uploaded for this case yet.</p>"
    html = f"""<!doctype html>
<html><head><meta charset='utf-8'>
<meta name='viewport' content='width=device-width,initial-scale=1'>
<title>CBCT — {patient}</title>
<style>
 body {{ font-family: -apple-system, system-ui, sans-serif; margin:0; background:#0D1B2A; color:#E0E7EE; }}
 header {{ background:#1565C0; color:#FFF; padding:14px 18px; }}
 header h1 {{ margin:0; font-size:18px; letter-spacing:0.3px; }}
 header p {{ margin:2px 0 0; font-size:12px; opacity:0.85; }}
 .grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:12px; padding:14px; }}
 .item {{ background:#1a2a3d; border-radius:10px; overflow:hidden; text-decoration:none; color:inherit; display:flex; flex-direction:column; border:1px solid #2a3f5a; }}
 .item:hover {{ border-color:#64B5F6; }}
 .thumb {{ aspect-ratio:1; display:flex; align-items:center; justify-content:center; background:#0a1624; }}
 .thumb img {{ width:100%; height:100%; object-fit:cover; }}
 .thumb .icon {{ font-size:42px; }}
 .label {{ font-size:12px; padding:8px 8px 2px; word-break:break-all; }}
 .meta {{ font-size:10px; opacity:0.6; padding:0 8px 8px; }}
 .empty {{ text-align:center; padding:40px; opacity:0.7; }}
 .actions {{ padding:12px 14px 0; }}
 .btn {{ display:inline-block; background:#1565C0; color:#FFF; text-decoration:none;
         padding:11px 18px; border-radius:8px; font-size:14px; font-weight:600; }}
 .btn:hover {{ background:#1976D2; }}
 footer {{ text-align:center; font-size:11px; opacity:0.6; padding:10px; }}
</style></head>
<body>
  <header>
    <h1>CBCT Files — {patient}</h1>
    <p>Tap any file to view · Link valid for 24 h from printing</p>
  </header>
  {actions_html}
  <div class='grid'>{items_html}</div>
  <footer>Implanr · Secure CBCT QR Viewer</footer>
</body></html>"""
    return HTMLResponse(html)


_EXT_MIME = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
    ".tif": "image/tiff", ".tiff": "image/tiff", ".pdf": "application/pdf",
    ".heic": "image/heic", ".heif": "image/heif",
}


def _cbct_content_type(entry: dict, filename: str) -> str:
    """Best-effort MIME: trust a real content_type, else infer from the extension.
    Mobile uploads frequently send octet-stream/empty, which makes browsers
    download instead of previewing — inferring from the ext fixes inline preview."""
    ct = (entry.get("content_type") or "").lower()
    if ct and ct != "application/octet-stream":
        return ct
    ext = os.path.splitext(filename.lower())[1]
    return _EXT_MIME.get(ext, "application/octet-stream")


@app.get("/cbct/file/{token}/{filename}")
async def cbct_public_file(token: str, filename: str, download: Optional[str] = Query(None)):
    """Stream a single CBCT file once token is verified. Auto-converts HEIC to JPEG
    for browsers that can't render HEIC natively (non-Safari on non-iOS).
    Pass ?download=1 to force a download (attachment) instead of inline preview."""
    procedure_id = _verify_cbct_token(token)
    if not procedure_id:
        raise HTTPException(status_code=403, detail="Link expired or invalid")
    try:
        proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    except Exception:
        proc = None
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")
    files = await _list_cbct_files(proc)
    entry = next((f for f in files if f["filename"] == filename), None)
    if not entry:
        raise HTTPException(status_code=404, detail="File not associated with this procedure")
    path = UPLOADS_DIR / filename
    if not await _s3_ensure_local_async(path):
        raise HTTPException(status_code=404, detail="File not found")
    content_type = _cbct_content_type(entry, filename)
    orig_name = entry.get("original_name") or filename
    # HEIC → JPEG auto-conversion (non-Safari browsers can't render HEIC)
    if content_type in ("image/heic", "image/heif") or filename.lower().endswith((".heic", ".heif")):
        converted = _maybe_convert_heic_to_jpeg(path)
        if converted:
            content_type = "image/jpeg"
            body = converted
            orig_name = os.path.splitext(orig_name)[0] + ".jpg"
        else:
            body = path.read_bytes()
    else:
        body = path.read_bytes()
    disp_type = "attachment" if download else "inline"
    headers = {"Content-Disposition": f'{disp_type}; filename="{orig_name}"'}
    return Response(content=body, media_type=content_type, headers=headers)


@app.get("/cbct/view/{token}/{filename}", response_class=HTMLResponse)
async def cbct_public_single_viewer(token: str, filename: str):
    """Single-file preview page opened in the browser: shows the image/PDF inline
    with a Download button. Reached from the in-app CBCT 'View' button."""
    procedure_id = _verify_cbct_token(token)
    if not procedure_id:
        return HTMLResponse(
            "<html><body style='font-family:system-ui;text-align:center;padding:40px'>"
            "<h2>Link expired or invalid</h2></body></html>", status_code=403,
        )
    try:
        proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    except Exception:
        proc = None
    if not proc:
        return HTMLResponse("Procedure not found", status_code=404)
    files = await _list_cbct_files(proc)
    entry = next((f for f in files if f["filename"] == filename), None)
    if not entry:
        return HTMLResponse("File not associated with this procedure", status_code=404)
    ct = _cbct_content_type(entry, filename)
    if filename.lower().endswith((".heic", ".heif")):
        ct = "image/jpeg"  # served converted
    orig = entry.get("original_name") or filename
    raw = f"/cbct/file/{token}/{filename}"
    dl = f"{raw}?download=1"
    if ct.startswith("image/"):
        preview = f"<img src='{raw}' alt='{orig}'/>"
    elif "pdf" in ct:
        preview = f"<iframe src='{raw}' title='{orig}'></iframe>"
    else:
        preview = "<div class='fallback'><span class='icon'>📁</span><p>Preview not available for this file type.</p></div>"
    html = f"""<!doctype html>
<html><head><meta charset='utf-8'>
<meta name='viewport' content='width=device-width,initial-scale=1'>
<title>{orig}</title>
<style>
 * {{ box-sizing:border-box; }}
 body {{ font-family:-apple-system,system-ui,sans-serif; margin:0; background:#0D1B2A; color:#E0E7EE;
        min-height:100vh; display:flex; flex-direction:column; }}
 header {{ background:#1565C0; color:#FFF; padding:12px 16px; display:flex; align-items:center;
          justify-content:space-between; gap:12px; position:sticky; top:0; }}
 header .name {{ font-size:14px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }}
 .btn {{ display:inline-flex; align-items:center; gap:6px; background:#4CAF50; color:#FFF;
        text-decoration:none; padding:9px 16px; border-radius:8px; font-size:14px; font-weight:700; white-space:nowrap; }}
 .btn:active {{ opacity:0.85; }}
 .stage {{ flex:1; display:flex; align-items:center; justify-content:center; padding:12px; overflow:auto; }}
 .stage img {{ max-width:100%; max-height:88vh; border-radius:8px; }}
 .stage iframe {{ width:100%; height:88vh; border:0; border-radius:8px; background:#fff; }}
 .fallback {{ text-align:center; opacity:0.8; }}
 .fallback .icon {{ font-size:56px; }}
</style></head>
<body>
  <header>
    <span class='name'>{orig}</span>
    <a class='btn' href='{dl}' download>Download</a>
  </header>
  <div class='stage'>{preview}</div>
</body></html>"""
    return HTMLResponse(html)


# ── Combined CBCT PDF (all uploaded files merged into one PDF) ───────
def _image_bytes_to_pdf_page(img_bytes: bytes, caption: str = "") -> bytes:
    """Render one image as a single aspect-fit A4 PDF page. Returns PDF bytes."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas as _canvas
    from PIL import Image as _PILImage, ImageOps as _ImageOps
    buf = io.BytesIO()
    c = _canvas.Canvas(buf, pagesize=A4)
    pw, ph = A4
    margin = 28
    try:
        img = _PILImage.open(io.BytesIO(img_bytes))
        img.load()
        # Honour EXIF orientation, then normalise to a clean RGB PNG so reportlab
        # never has to decode an exotic mode (CMYK / P / 16-bit / progressive) itself.
        img = _ImageOps.exif_transpose(img)
        img = img.convert("RGB")
        clean = io.BytesIO()
        img.save(clean, format="PNG")
        clean.seek(0)
        iw, ih = img.size
        avail_w, avail_h = pw - 2 * margin, ph - 2 * margin - 24
        scale = min(avail_w / iw, avail_h / ih)
        dw, dh = iw * scale, ih * scale
        x = (pw - dw) / 2
        y = (ph - dh) / 2 + 12
        c.drawImage(ImageReader(clean), x, y, width=dw, height=dh,
                    preserveAspectRatio=True, anchor='c')
    except Exception as exc:
        logging.warning("CBCT image->pdf failed (%s): %s", caption or "?", exc)
        c.setFont("Helvetica", 12)
        c.drawCentredString(pw / 2, ph / 2, "Image could not be rendered")
    if caption:
        c.setFont("Helvetica", 9)
        c.setFillColorRGB(0.3, 0.3, 0.3)
        c.drawCentredString(pw / 2, margin, caption[:120])
    c.showPage()
    c.save()
    return buf.getvalue()


def _placeholder_pdf_page(title: str, subtitle: str = "") -> bytes:
    """A text-only A4 page used for missing files, DICOM, or unknown types."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas as _canvas
    buf = io.BytesIO()
    c = _canvas.Canvas(buf, pagesize=A4)
    pw, ph = A4
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(pw / 2, ph / 2 + 10, title[:90])
    if subtitle:
        c.setFont("Helvetica", 10)
        c.setFillColorRGB(0.4, 0.4, 0.4)
        c.drawCentredString(pw / 2, ph / 2 - 12, subtitle[:110])
    c.showPage()
    c.save()
    return buf.getvalue()


async def _build_cbct_combined_pdf(proc: dict) -> bytes:
    """Merge every CBCT file for a procedure into one PDF (built per request).
    Images -> aspect-fit pages, PDFs -> pages appended, HEIC -> converted first,
    DICOM/unknown/missing -> placeholder page (never fails the whole document).
    """
    from PyPDF2 import PdfReader, PdfWriter
    files = await _list_cbct_files(proc)
    writer = PdfWriter()
    patient = proc.get("patient_name") or "Patient"

    def _append(pdf_bytes: bytes):
        for p in PdfReader(io.BytesIO(pdf_bytes)).pages:
            writer.add_page(p)

    cover = _placeholder_pdf_page(
        f"CBCT — {patient}",
        f"{len(files)} file(s) · generated {datetime.now(timezone.utc).strftime('%b %d, %Y %H:%M UTC')}",
    )
    _append(cover)

    for f in files:
        filename = f["filename"]
        path = UPLOADS_DIR / filename
        ct = (f.get("content_type") or "").lower()
        orig = f.get("original_name") or filename
        low = filename.lower()
        if not await _s3_ensure_local_async(path):
            _append(_placeholder_pdf_page(orig, "File missing on server"))
            continue
        orig_low = (orig or "").lower()
        # Content-type from mobile uploads is unreliable (often octet-stream/empty),
        # so classify by file extension too — the stored filename always keeps its ext.
        def _ext(*exts):
            return low.endswith(exts) or orig_low.endswith(exts)
        is_heic = ct in ("image/heic", "image/heif") or _ext(".heic", ".heif")
        is_pdf = "pdf" in ct or _ext(".pdf")
        is_dicom = "dicom" in ct or _ext(".dcm", ".dicom")
        is_image = (
            ct.startswith("image/")
            or _ext(".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff")
        ) and not is_heic
        try:
            if is_pdf:
                for p in PdfReader(str(path)).pages:
                    writer.add_page(p)
            elif is_heic:
                conv = _maybe_convert_heic_to_jpeg(path)
                _append(_image_bytes_to_pdf_page(conv if conv else path.read_bytes(), orig))
            elif is_image:
                _append(_image_bytes_to_pdf_page(path.read_bytes(), orig))
            elif is_dicom:
                _append(_placeholder_pdf_page(orig, "DICOM volume — open in the CBCT gallery viewer"))
            else:
                # Unknown/misreported type — last-ditch: try to render it as an image.
                try:
                    from PIL import Image as _PILProbe
                    _PILProbe.open(io.BytesIO(path.read_bytes())).verify()
                    _append(_image_bytes_to_pdf_page(path.read_bytes(), orig))
                except Exception:
                    _append(_placeholder_pdf_page(orig, ct or "unknown file type"))
        except Exception as exc:
            logging.warning("CBCT combine failed for %s: %s", filename, exc)
            _append(_placeholder_pdf_page(orig, "Could not be included"))

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


@app.get("/cbct/pdf/{token}")
async def cbct_public_pdf(token: str):
    """Combined single PDF of all CBCT files for a case. Token-verified per request."""
    procedure_id = _verify_cbct_token(token)
    if not procedure_id:
        raise HTTPException(status_code=403, detail="Link expired or invalid")
    try:
        proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    except Exception:
        proc = None
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")
    pdf_bytes = await _build_cbct_combined_pdf(proc)
    patient = (proc.get("patient_name") or "patient").replace(" ", "_")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=CBCT_{patient}.pdf"},
    )


# ── Clinical Case Album: Photo Step Definitions ─────────────────────
PHOTO_STEPS = {
    1: {  # Phase 1 — Pre-Surgical Documentation
        "name": "Pre-Surgical Documentation",
        "steps": [
            {"id": "p1_extraoral_rest", "label": "Full Face at Rest", "category": "Extraoral",
             "purpose": "Document baseline facial profile.",
             "armamentarium": ["DSLR / phone camera", "Neutral background"],
             "prompt": "Patient seated upright. Frankfort horizontal plane parallel to floor. Camera at eye level."},
            {"id": "p1_extraoral_smile", "label": "Full Face Smile", "category": "Extraoral",
             "purpose": "Evaluate esthetics and smile line.",
             "armamentarium": ["Camera", "Neutral background"],
             "prompt": "Ask patient to give natural smile. Capture entire face including lips and chin."},
            {"id": "p1_extraoral_profile", "label": "Profile View", "category": "Extraoral",
             "purpose": "Document lateral facial profile.",
             "armamentarium": ["Camera", "Neutral background"],
             "prompt": "Patient facing 90 degrees. Capture full profile from ear to chin."},
            {"id": "p1_intraoral_frontal", "label": "Frontal Intraoral View", "category": "Intraoral",
             "purpose": "Document frontal occlusion.",
             "armamentarium": ["Cheek retractors", "Camera with macro lens"],
             "prompt": "Place cheek retractors symmetrically. Ask patient to bite in centric occlusion. Capture from front showing both arches."},
            {"id": "p1_intraoral_right", "label": "Right Buccal View", "category": "Intraoral",
             "purpose": "Document right lateral occlusion.",
             "armamentarium": ["Cheek retractors", "Intraoral mirror (optional)"],
             "prompt": "Patient in centric occlusion. Mirror or camera aligned with buccal surfaces. Capture canine to molar region clearly."},
            {"id": "p1_intraoral_left", "label": "Left Buccal View", "category": "Intraoral",
             "purpose": "Document left lateral occlusion.",
             "armamentarium": ["Cheek retractors", "Intraoral mirror"],
             "prompt": "Retract cheek completely. Ensure occlusal plane horizontal. Capture entire left posterior segment."},
            {"id": "p1_intraoral_maxillary", "label": "Maxillary Occlusal View", "category": "Intraoral",
             "purpose": "Document maxillary arch occlusal surface.",
             "armamentarium": ["Occlusal mirror", "Cheek retractors", "Air syringe"],
             "prompt": "Place mirror parallel to occlusal plane. Dry teeth before capturing. Capture entire maxillary arch."},
            {"id": "p1_intraoral_mandibular", "label": "Mandibular Occlusal View", "category": "Intraoral",
             "purpose": "Document mandibular arch occlusal surface.",
             "armamentarium": ["Occlusal mirror", "Cheek retractors"],
             "prompt": "Tilt mirror slightly upward. Capture full mandibular arch including molars."},
            {"id": "p1_implant_site", "label": "Implant Site Close-Up", "category": "Intraoral",
             "purpose": "Document edentulous ridge at implant site.",
             "armamentarium": ["Cheek retractors", "Macro lens"],
             "prompt": "Focus on edentulous ridge. Ensure gingival margins clearly visible."},
            {"id": "p1_diag_opg", "label": "OPG Radiograph", "category": "Diagnostic",
             "purpose": "Panoramic radiographic documentation.",
             "armamentarium": ["OPG radiograph upload"],
             "prompt": "Upload OPG radiograph image or scan."},
            {"id": "p1_diag_cbct", "label": "CBCT Screenshot", "category": "Diagnostic",
             "purpose": "CBCT documentation.",
             "armamentarium": ["CBCT screenshot"],
             "prompt": "Upload CBCT screenshot showing implant site."},
            {"id": "p1_diag_cbct_cross", "label": "CBCT Cross-Section", "category": "Diagnostic",
             "purpose": "CBCT cross-section at implant site.",
             "armamentarium": ["CBCT cross-section image"],
             "prompt": "Upload CBCT cross-section showing implant site bone dimensions."},
            {"id": "p1_diag_planning", "label": "Digital Planning Screenshot", "category": "Diagnostic",
             "purpose": "Digital implant planning documentation.",
             "armamentarium": ["Digital planning software screenshot"],
             "prompt": "Upload screenshot from digital planning software (if applicable)."},
            {"id": "p1_diag_guide", "label": "Surgical Guide Design", "category": "Diagnostic",
             "purpose": "Surgical guide design documentation.",
             "armamentarium": ["Surgical guide design file"],
             "prompt": "Upload surgical guide design image (if applicable)."},
        ],
    },
    2: {  # Phase 2 — Surgical Documentation
        "name": "Surgical Documentation",
        "steps": [
            {"id": "p2_pre_tray", "label": "Surgical Tray Setup", "category": "Pre-Surgical",
             "purpose": "Document surgical instrument preparation.",
             "armamentarium": ["Camera", "Surgical tray"],
             "prompt": "Capture complete surgical tray setup with all instruments visible."},
            {"id": "p2_pre_kit", "label": "Implant Kit Display", "category": "Pre-Surgical",
             "purpose": "Document implant kit and components.",
             "armamentarium": ["Camera", "Implant kit"],
             "prompt": "Display implant kit with drill sequence visible."},
            {"id": "p2_pre_asepsis", "label": "Operatory Asepsis Setup", "category": "Pre-Surgical",
             "purpose": "Document aseptic preparation.",
             "armamentarium": ["Camera"],
             "prompt": "Capture operatory after asepsis and fumigation setup."},
            {"id": "p2_ridge", "label": "Edentulous Ridge Before Incision", "category": "Intra-operative",
             "purpose": "Document ridge contour before surgery.",
             "armamentarium": ["Cheek retractors", "Surgical suction"],
             "prompt": "Dry surgical field. Capture ridge contour clearly."},
            {"id": "p2_incision", "label": "Crestal Incision", "category": "Intra-operative",
             "purpose": "Document incision line.",
             "armamentarium": ["Cheek retractors", "Surgical light"],
             "prompt": "Capture incision line clearly. Ensure minimal blood obscuring view."},
            {"id": "p2_flap", "label": "Flap Reflection", "category": "Intra-operative",
             "purpose": "Document bone exposure.",
             "armamentarium": ["Minnesota retractor", "Surgical suction"],
             "prompt": "Expose bone fully. Capture ridge anatomy."},
            {"id": "p2_osteotomy", "label": "Osteotomy Preparation", "category": "Intra-operative",
             "purpose": "Document drilling procedure.",
             "armamentarium": ["Implant drill kit", "Suction"],
             "prompt": "Capture drill entering osteotomy site. Keep camera perpendicular to ridge."},
            {"id": "p2_placement", "label": "Implant Placement", "category": "Intra-operative",
             "purpose": "Document implant fixture insertion.",
             "armamentarium": ["Implant driver", "Surgical suction"],
             "prompt": "Capture implant fixture partially visible in osteotomy. Ensure implant threads visible."},
            {"id": "p2_verification", "label": "Implant Position Verification", "category": "Intra-operative",
             "purpose": "Verify final implant position.",
             "armamentarium": [],
             "prompt": "Capture final implant position within bone. Show surrounding ridge clearly."},
            {"id": "p2_cover_screw", "label": "Cover Screw Placement", "category": "Intra-operative",
             "purpose": "Document cover screw seating.",
             "armamentarium": ["Cover screw driver"],
             "prompt": "Capture cover screw seated on implant."},
            {"id": "p2_suturing", "label": "Suturing", "category": "Intra-operative",
             "purpose": "Document wound closure.",
             "armamentarium": ["Suture kit"],
             "prompt": "Capture sutures approximating flap margins. Avoid blood pooling in field."},
            {"id": "p2_postop", "label": "Immediate Postoperative", "category": "Postoperative",
             "purpose": "Document immediate post-surgical state.",
             "armamentarium": ["Camera"],
             "prompt": "Capture immediate postoperative intraoral view."},
        ],
    },
    3: {  # Phase 3 — Second Stage Surgery
        "name": "Second Stage Surgery",
        "steps": [
            {"id": "p3_before_uncover", "label": "Implant Site Before Uncovering", "category": "Pre-operative",
             "purpose": "Document implant site before second stage.",
             "armamentarium": ["Cheek retractors"],
             "prompt": "Capture healed implant site before uncovering."},
            {"id": "p3_exposure", "label": "Implant Exposure", "category": "Intra-operative",
             "purpose": "Document implant platform exposure.",
             "armamentarium": ["Tissue punch / surgical instrument", "Cheek retractors"],
             "prompt": "Expose implant platform clearly. Capture implant connection."},
            {"id": "p3_healing_abutment", "label": "Healing Abutment Placement", "category": "Intra-operative",
             "purpose": "Document healing abutment seating.",
             "armamentarium": ["Healing cap driver"],
             "prompt": "Capture healing abutment seated on implant. Ensure soft tissue margins visible."},
            {"id": "p3_soft_tissue", "label": "Soft Tissue Healing", "category": "Follow-up",
             "purpose": "Document peri-implant soft tissue contour.",
             "armamentarium": [],
             "prompt": "Capture peri-implant gingival contour."},
            {"id": "p3_scan_body", "label": "Scan Body Placement", "category": "Impression",
             "purpose": "Document scan body placement.",
             "armamentarium": ["Scan body", "Intraoral scanner"],
             "prompt": "Capture scan body seated correctly."},
            {"id": "p3_digital_scan", "label": "Digital Scan", "category": "Impression",
             "purpose": "Document digital impression.",
             "armamentarium": ["Intraoral scanner"],
             "prompt": "Capture intraoral scanner screen showing digital impression."},
            {"id": "p3_temp_prosthesis", "label": "Temporary Prosthesis Delivery", "category": "Prosthetic",
             "purpose": "Document temporary crown/prosthesis.",
             "armamentarium": [],
             "prompt": "Capture temporary crown in occlusion."},
        ],
    },
    4: {  # Phase 4 — Prosthetic Rehabilitation
        "name": "Prosthetic Rehabilitation",
        "steps": [
            {"id": "p4_abutment", "label": "Abutment Placement", "category": "Laboratory/Clinical",
             "purpose": "Document abutment seating.",
             "armamentarium": ["Abutment", "Driver"],
             "prompt": "Capture abutment seated on implant. Show emergence profile."},
            {"id": "p4_framework", "label": "Framework Try-In", "category": "Laboratory/Clinical",
             "purpose": "Document framework fit.",
             "armamentarium": ["Framework"],
             "prompt": "Capture framework seated. Check marginal fit."},
            {"id": "p4_jig_trial", "label": "Jig Trial", "category": "Laboratory/Clinical",
             "purpose": "Verify passive fit.",
             "armamentarium": ["Verification jig"],
             "prompt": "Capture jig trial. Document Sheffield's test."},
            {"id": "p4_tryin", "label": "Crown / Bridge Try-In", "category": "Laboratory/Clinical",
             "purpose": "Evaluate prosthesis fit before cementation.",
             "armamentarium": [],
             "prompt": "Capture prosthesis seated without cement. Evaluate margins."},
            {"id": "p4_occlusion", "label": "Occlusion Evaluation", "category": "Laboratory/Clinical",
             "purpose": "Document occlusal contacts.",
             "armamentarium": ["Articulating paper"],
             "prompt": "Capture occlusal contacts."},
            {"id": "p4_cementation", "label": "Screw Tightening / Cementation", "category": "Laboratory/Clinical",
             "purpose": "Document final fixation.",
             "armamentarium": ["Torque wrench / Cement"],
             "prompt": "Capture screw tightening or cementation process."},
            {"id": "p4_final_frontal", "label": "Frontal Intraoral (Final)", "category": "Final Documentation",
             "purpose": "Final frontal documentation.",
             "armamentarium": ["Cheek retractors"],
             "prompt": "Capture frontal intraoral view showing final restoration."},
            {"id": "p4_final_right", "label": "Right Lateral Occlusion (Final)", "category": "Final Documentation",
             "purpose": "Final right lateral documentation.",
             "armamentarium": ["Cheek retractors"],
             "prompt": "Capture right lateral view in occlusion."},
            {"id": "p4_final_left", "label": "Left Lateral Occlusion (Final)", "category": "Final Documentation",
             "purpose": "Final left lateral documentation.",
             "armamentarium": ["Cheek retractors"],
             "prompt": "Capture left lateral view in occlusion."},
            {"id": "p4_final_occlusal", "label": "Occlusal View (Final)", "category": "Final Documentation",
             "purpose": "Final occlusal documentation.",
             "armamentarium": ["Occlusal mirror"],
             "prompt": "Capture occlusal view of final restoration."},
            {"id": "p4_final_smile", "label": "Final Smile", "category": "Final Documentation",
             "purpose": "Document final esthetic result.",
             "armamentarium": ["Camera", "Neutral background"],
             "prompt": "Capture full smile showing implant restoration."},
        ],
    },
}

# Figure captions for album generation (auto-generated)
ALBUM_CAPTIONS = {
    "p1_extraoral_rest": "Full face at rest – baseline facial profile",
    "p1_extraoral_smile": "Full face smile – esthetic evaluation",
    "p1_extraoral_profile": "Profile view – lateral facial assessment",
    "p1_intraoral_frontal": "Preoperative frontal intraoral view",
    "p1_intraoral_right": "Right buccal view in centric occlusion",
    "p1_intraoral_left": "Left buccal view in centric occlusion",
    "p1_intraoral_maxillary": "Maxillary occlusal mirror view",
    "p1_intraoral_mandibular": "Mandibular occlusal mirror view",
    "p1_implant_site": "Implant site close-up – edentulous ridge",
    "p1_diag_opg": "OPG radiograph",
    "p1_diag_cbct": "CBCT screenshot",
    "p1_diag_cbct_cross": "CBCT cross-section showing implant site",
    "p1_diag_planning": "Digital implant planning",
    "p1_diag_guide": "Surgical guide design",
    "p2_pre_tray": "Surgical tray setup",
    "p2_pre_kit": "Implant kit display with drill sequence",
    "p2_pre_asepsis": "Operatory asepsis setup",
    "p2_ridge": "Edentulous ridge before incision",
    "p2_incision": "Crestal incision",
    "p2_flap": "Flap reflection exposing alveolar bone",
    "p2_osteotomy": "Osteotomy preparation using sequential drilling protocol",
    "p2_placement": "Implant placement into osteotomy site",
    "p2_verification": "Implant position verification",
    "p2_cover_screw": "Cover screw placement",
    "p2_suturing": "Flap closure with sutures",
    "p2_postop": "Immediate postoperative view",
    "p3_before_uncover": "Implant site before uncovering",
    "p3_exposure": "Implant exposure – platform visible",
    "p3_healing_abutment": "Healing abutment placed to facilitate gingival contour",
    "p3_soft_tissue": "Peri-implant soft tissue healing",
    "p3_scan_body": "Scan body placement for digital impression",
    "p3_digital_scan": "Digital impression capture",
    "p3_temp_prosthesis": "Temporary prosthesis delivery",
    "p4_abutment": "Abutment placement – emergence profile",
    "p4_framework": "Framework try-in – marginal fit evaluation",
    "p4_jig_trial": "Jig trial – passive fit verification",
    "p4_tryin": "Crown/bridge try-in before cementation",
    "p4_occlusion": "Occlusal contacts evaluation",
    "p4_cementation": "Final prosthesis – screw tightening / cementation",
    "p4_final_frontal": "Final frontal intraoral view",
    "p4_final_right": "Final right lateral occlusion",
    "p4_final_left": "Final left lateral occlusion",
    "p4_final_occlusal": "Final occlusal view",
    "p4_final_smile": "Final smile showing implant restoration",
}



# ── Checklist File Upload Management ─────────────────────────────────
CHECKLIST_UPLOADS_DIR = ROOT_DIR / 'uploads' / 'checklist_files'
CHECKLIST_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_CHECKLIST_EXTENSIONS = {'.pdf', '.ppt', '.pptx', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.heic'}
MAX_CHECKLIST_FILE_SIZE = 25 * 1024 * 1024  # 25 MB

@api_router.post("/procedures/{procedure_id}/checklist-files/{item_id}")
async def upload_checklist_file(
    procedure_id: str,
    item_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a file for a specific checklist item (e.g. academic_readiness, hematological, radiographic)."""
    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)}, {"_id": 0, "student_id": 1, "supervisor_id": 1, "created_by_id": 1})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(proc, current_user)
    if current_user["role"] == "student" and proc.get("student_id") != current_user["_id"]:
        raise HTTPException(status_code=403, detail="You can only modify your own procedures")

    # Validate file extension
    ext = Path(file.filename).suffix.lower() if file.filename else ""
    if ext not in ALLOWED_CHECKLIST_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type not allowed. Allowed: {', '.join(ALLOWED_CHECKLIST_EXTENSIONS)}")

    contents = await file.read()
    if len(contents) > MAX_CHECKLIST_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 25 MB limit")

    import uuid
    unique_id = uuid.uuid4().hex[:8]
    filename = f"{procedure_id}_{item_id}_{unique_id}{ext}"
    filepath = CHECKLIST_UPLOADS_DIR / filename
    with open(filepath, "wb") as f:
        f.write(contents)
    import mimetypes as _mt_7304
    await _s3_put_async(filepath, content_type=_mt_7304.guess_type(str(filepath))[0])

    file_record = {
        "item_id": item_id,
        "filename": filename,
        "original_name": file.filename,
        "content_type": file.content_type or "application/octet-stream",
        "size": len(contents),
        "uploaded_at": datetime.utcnow().isoformat(),
    }
    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$push": {"checklist_files": file_record}},
    )
    return {"message": "File uploaded", "filename": filename, "original_name": file.filename}


@api_router.get("/procedures/{procedure_id}/checklist-files")
async def list_checklist_files(
    procedure_id: str,
    current_user: dict = Depends(get_current_user),
):
    """List all checklist files for a procedure, grouped by item_id."""
    proc = await db.procedures.find_one(
        {"_id": ObjectId(procedure_id)},
        {"_id": 0, "checklist_files": 1},
    )
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(proc, current_user)
    files = proc.get("checklist_files", [])
    grouped: dict = {}
    for f in files:
        item = f.get("item_id", "unknown")
        if item not in grouped:
            grouped[item] = []
        grouped[item].append(f)
    return {"files": grouped}


@api_router.delete("/procedures/{procedure_id}/checklist-files/{item_id}/{filename}")
async def delete_checklist_file(
    procedure_id: str,
    item_id: str,
    filename: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a checklist file."""
    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)}, {"_id": 0, "student_id": 1, "supervisor_id": 1, "created_by_id": 1})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(proc, current_user)
    if current_user["role"] == "student" and proc.get("student_id") != current_user["_id"]:
        raise HTTPException(status_code=403, detail="You can only modify your own procedures")

    filepath = CHECKLIST_UPLOADS_DIR / filename
    if filepath.exists():
        filepath.unlink()
    await _s3_delete_async(filepath)

    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$pull": {"checklist_files": {"filename": filename, "item_id": item_id}}},
    )
    return {"message": "File deleted"}


@api_router.get("/checklist-files/{filename}")
async def serve_checklist_file(filename: str):
    """Serve a checklist file."""
    filepath = CHECKLIST_UPLOADS_DIR / filename
    if not await _s3_ensure_local_async(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(filepath))


# ── Implant Plan Management ──────────────────────────────────────────
@api_router.post("/procedures/{procedure_id}/implant-plan")
async def save_implant_plan(
    procedure_id: str,
    plan: ImplantPlanSave,
    current_user: dict = Depends(get_current_user),
):
    """Save or update implant plans (1-6 implants) for a procedure."""
    try:
        oid = ObjectId(procedure_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid procedure ID")
    proc = await db.procedures.find_one({"_id": oid}, {"_id": 1, "student_id": 1, "status": 1, "supervisor_id": 1, "implant_incharge_id": 1, "implant_plans": 1})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(proc, current_user)

    is_assigned_faculty = current_user["_id"] in (proc.get("supervisor_id"), proc.get("implant_incharge_id"))
    is_student_owner = current_user["role"] == "student" and proc.get("student_id") == current_user["_id"]

    if not is_assigned_faculty and not is_student_owner:
        raise HTTPException(status_code=403, detail="You do not have permission to modify this implant plan")

    editable_statuses = {"draft", "pending_phase1", "phase1_approved", "pending_phase2"}

    # Students locked after Phase 2 approval; supervisors/incharge can edit at all stages
    if is_student_owner and not is_assigned_faculty:
        if proc.get("status") not in editable_statuses:
            raise HTTPException(status_code=403, detail="Implant plan cannot be modified after Phase 2 approval")

    # iter-249: After Phase 2 surgery is performed, no role (including
    # faculty) can ADD or REMOVE implant positions — the surgery is
    # already done with the existing set. Editing the metadata of an
    # existing position (brand / size / torque) is still allowed for
    # post-hoc record corrections.
    if proc.get("status") and proc.get("status") not in editable_statuses:
        old_positions = {p.get("position") for p in (proc.get("implant_plans") or []) if p.get("position")}
        new_positions = {imp.position for imp in plan.implants}
        if old_positions and old_positions != new_positions:
            raise HTTPException(
                status_code=403,
                detail="Implant positions cannot be added or removed after Phase 2 surgery. Existing positions can still be edited.",
            )

    if len(plan.implants) < 1 or len(plan.implants) > 6:
        raise HTTPException(status_code=400, detail="Must plan between 1 and 6 implants")

    # Validate unique positions
    positions = [imp.position for imp in plan.implants]
    if len(positions) != len(set(positions)):
        raise HTTPException(status_code=400, detail="Each implant must have a unique tooth position")

    implant_docs = []
    for imp in plan.implants:
        implant_docs.append({
            "position": imp.position,
            "brand": imp.brand,
            "system": imp.system,
            "diameter": imp.diameter,
            "length": imp.length,
            "bone_width": imp.bone_width,
            "bone_height": imp.bone_height,
            "bone_type": imp.bone_type,
            "risk_level": imp.risk_level,
            "risk_score": imp.risk_score,
        })

    # iter-277: track field-level edits to the implant plan once Phase 1
    # is approved. Pre-Phase-1-approval saves are still considered part of
    # "creating Phase 1" and are intentionally NOT logged.
    POST_PHASE1_APPROVED = {
        "phase1_approved", "pending_phase2", "phase2_approved",
        "pending_stage2_surgical", "stage2_surgical_approved",
        "pending_stage2_prosthetic", "completed",
    }
    history_entries: list = []
    if proc.get("status") in POST_PHASE1_APPROVED:
        old_by_pos = {p.get("position"): p for p in (proc.get("implant_plans") or []) if p.get("position")}
        new_by_pos = {p["position"]: p for p in implant_docs}
        TRACKED = ("brand", "system", "diameter", "length", "bone_width", "bone_height", "bone_type", "risk_level", "risk_score")
        now_iso = datetime.now(timezone.utc).isoformat()
        actor = {
            "by_user_id": current_user["_id"],
            "by_user_name": current_user.get("name") or current_user.get("username"),
            "by_user_role": current_user.get("role"),
            "at": now_iso,
        }
        # Edits to existing positions
        for pos, new_imp in new_by_pos.items():
            old_imp = old_by_pos.get(pos)
            if not old_imp:
                history_entries.append({
                    "id": str(uuid.uuid4()),
                    "position": pos,
                    "kind": "added",
                    "snapshot": {k: new_imp.get(k) for k in TRACKED},
                    **actor,
                })
                continue
            changes = {}
            for f in TRACKED:
                if (old_imp.get(f) or None) != (new_imp.get(f) or None):
                    changes[f] = {"from": old_imp.get(f), "to": new_imp.get(f)}
            if changes:
                history_entries.append({
                    "id": str(uuid.uuid4()),
                    "position": pos,
                    "kind": "edited",
                    "changes": changes,
                    **actor,
                })
        # Removed positions
        for pos, old_imp in old_by_pos.items():
            if pos not in new_by_pos:
                history_entries.append({
                    "id": str(uuid.uuid4()),
                    "position": pos,
                    "kind": "removed",
                    "snapshot": {k: old_imp.get(k) for k in TRACKED},
                    **actor,
                })

    update_doc: dict = {
        "$set": {
            "implant_plans": implant_docs,
            "number_of_implants": len(implant_docs),
            "implant_site": ", ".join(sorted(set(imp["position"] for imp in implant_docs))),
        },
    }
    if history_entries:
        update_doc["$push"] = {"implant_edit_history": {"$each": history_entries}}

    await db.procedures.update_one({"_id": ObjectId(procedure_id)}, update_doc)
    return {"message": "Implant plan saved", "count": len(implant_docs), "history_entries": len(history_entries)}


@api_router.get("/procedures/{procedure_id}/implant-plan")
async def get_implant_plan(
    procedure_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Retrieve the implant plan for a procedure."""
    try:
        oid = ObjectId(procedure_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid procedure ID")
    # Check existence first (without projection that can return empty dict)
    exists = await db.procedures.find_one({"_id": oid}, {"_id": 1, "student_id": 1, "supervisor_id": 1, "created_by_id": 1})
    if not exists:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(exists, current_user)
    proc = await db.procedures.find_one(
        {"_id": oid},
        {"_id": 0, "implant_plans": 1, "number_of_implants": 1},
    )
    return {
        "implant_plans": (proc or {}).get("implant_plans", []),
        "number_of_implants": (proc or {}).get("number_of_implants", 0),
    }



# ── Badge & Case Report ─────────────────────────────────────────────
@api_router.get("/procedures/{procedure_id}/badge")
async def get_procedure_badge(
    procedure_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get the completion badge for a procedure."""
    badge = await db.badges.find_one(
        {"procedure_id": procedure_id},
        {"_id": 0},
    )
    if not badge:
        return {"badge": None}
    if isinstance(badge.get("completed_at"), datetime):
        badge["completed_at"] = badge["completed_at"].isoformat()
    if isinstance(badge.get("created_at"), datetime):
        badge["created_at"] = badge["created_at"].isoformat()
    return {"badge": badge}


# ── AI Integration (Implanr AI) ────────────────────────────────────────────



try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    import uuid
except ImportError:
    # Fall back to openai SDK directly (emergentintegrations not on PyPI)
    try:
        from openai import AsyncOpenAI as _AsyncOpenAI

        class ImageContent:
            def __init__(self, image_base64: str = "", image_url: str = ""):
                self.image_base64 = image_base64
                self.image_url = image_url

        class UserMessage:
            def __init__(self, text: str = "", file_contents=None):
                self.text = text
                self.file_contents = file_contents or []

        class LlmChat:
            def __init__(self, api_key: str = "", session_id: str = "", system_message: str = ""):  # noqa: ARG002
                self._api_key = api_key
                self._model = "gpt-4o"
                self._messages: list = []
                if system_message:
                    self._messages = [{"role": "system", "content": system_message}]

            def with_model(self, provider: str, model: str):  # noqa: ARG002
                # Map legacy model aliases that may not exist yet
                _alias = {"gpt-5.2": "gpt-4o", "gpt-5": "gpt-4o"}
                self._model = _alias.get(model, model)
                return self

            async def send_message(self, message: "UserMessage") -> str:
                client = _AsyncOpenAI(api_key=self._api_key)
                if message.file_contents:
                    content: list = [{"type": "text", "text": message.text}]
                    for img in message.file_contents:
                        if img.image_base64:
                            content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img.image_base64}"}})
                        elif img.image_url:
                            content.append({"type": "image_url", "image_url": {"url": img.image_url}})
                else:
                    content = message.text  # type: ignore[assignment]
                msgs = list(self._messages) + [{"role": "user", "content": content}]
                resp = await client.chat.completions.create(model=self._model, messages=msgs)  # type: ignore[arg-type]
                return resp.choices[0].message.content or ""

        logging.info("emergentintegrations not installed — using openai SDK directly.")
    except ImportError:
        logging.warning("Neither emergentintegrations nor openai installed — AI features disabled.")
        class _AIStub:
            def __init__(self, *a, **kw): raise HTTPException(503, "AI features not available")
            def with_model(self, *a, **kw): return self
            async def send_message(self, *a, **kw): raise HTTPException(503, "AI features not available")
        class LlmChat(_AIStub): pass  # type: ignore[no-redef]
        class UserMessage(_AIStub): pass  # type: ignore[no-redef]
        class ImageContent(_AIStub): pass  # type: ignore[no-redef]


def _redact_phi_from_ai_text(text: str, proc: Optional[dict]) -> str:
    """iter-339 HIPAA: redact all patient PHI identifiers from an AI response.
    Belt-and-braces net that runs on every AI response before the DB stores it
    or the frontend renders it. Redacts:
      - Patient name (full + tokens ≥3 chars, case-insensitive, word-boundary safe)
      - Phone/mobile numbers (from proc.mobile_number AND generic 10-digit / +91 patterns)
      - Email addresses (from proc.patient_email AND generic RFC-lite regex)
      - Dates of birth (any date preceded by 'DOB:', 'D.O.B.:', 'Date of Birth:', 'Born:')
      - Street address (from proc.address if present)
    Preserves clinical dates (surgery, appointments) and demographic minimums
    (age, sex, profession) which are HIPAA-safe."""
    if not text or not proc:
        return text
    import re as _re

    # 1) Patient name (full + tokens)
    name = (proc.get("patient_name") or "").strip()
    if name:
        text = _re.sub(_re.escape(name), "the patient", text, flags=_re.IGNORECASE)
        for token in name.split():
            tok = token.strip(".,")
            if len(tok) < 3 or tok.lower() in {"mr", "mrs", "ms", "dr", "prof", "the"}:
                continue
            text = _re.sub(rf"\b{_re.escape(tok)}\b", "the patient", text, flags=_re.IGNORECASE)

    # 2) Known phone/mobile from record (exact match first)
    for phone_field in ("mobile_number", "phone", "patient_phone", "contact_number"):
        pv = (proc.get(phone_field) or "").strip()
        if pv:
            text = _re.sub(_re.escape(pv), "[phone redacted]", text)

    # 3) Generic phone patterns: +91-9876543210 / 9876543210 / (022) 12345678
    #    Only matches sequences of 10+ digits (with optional +country / spaces / hyphens).
    text = _re.sub(
        r"(?<!\d)(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,5}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}(?!\d)",
        "[phone redacted]", text,
    )

    # 4) Known email from record
    for email_field in ("patient_email", "email"):
        ev = (proc.get(email_field) or "").strip()
        if ev and "@" in ev:
            text = _re.sub(_re.escape(ev), "[email redacted]", text, flags=_re.IGNORECASE)

    # 5) Generic email regex (RFC-lite)
    text = _re.sub(
        r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
        "[email redacted]", text,
    )

    # 6) DOB — only when explicitly labelled (protects clinical dates)
    text = _re.sub(
        r"(?i)(D\.?O\.?B\.?|Date of Birth|Born)\s*[:\-]?\s*[\w\s,./-]{5,25}",
        r"\1: [DOB redacted]", text,
    )

    # 7) Address field from record (if stored)
    for addr_field in ("address", "patient_address", "residential_address"):
        av = (proc.get(addr_field) or "").strip()
        if av and len(av) >= 8:  # avoid over-scrubbing tiny strings
            text = _re.sub(_re.escape(av), "[address redacted]", text, flags=_re.IGNORECASE)

    return text


# iter-338 backward-compat alias — old call-sites still work.
def _redact_name_from_ai_text(text: str, patient_name: Optional[str]) -> str:
    return _redact_phi_from_ai_text(text, {"patient_name": patient_name} if patient_name else None)



def _build_case_context(proc: dict) -> str:
    """Build a clinical case context string from procedure data.
    De-identified: patient name / age / profession are never included — the
    context is sent to a third-party AI provider and the generated summary is
    shown and exported, so identity stays out end-to-end (sex is kept as a
    clinically relevant, non-identifying attribute)."""
    parts = [f"Patient: [de-identified], Sex: {proc.get('sex','N/A')}"]
    if proc.get('chief_complaint'):
        parts.append(f"Chief Complaint: {proc.get('chief_complaint')}")
    parts.append(f"Procedure Type: {proc.get('implant_procedure_type','N/A')}")
    parts.append(f"Status: {proc.get('status','N/A')}")
    if proc.get('arch'):
        parts.append(f"Arch: {proc.get('arch')}")
    if proc.get('arch_condition'):
        parts.append(f"Arch Condition: {proc.get('arch_condition')}")
    if proc.get('available_interarch_space'):
        parts.append(f"Restorative Space: {proc.get('available_interarch_space')} mm")
    if proc.get('opposing_arch'):
        parts.append(f"Opposing Arch: {proc.get('opposing_arch')}")
    if proc.get('opposing_dentition'):
        parts.append(f"Opposing Dentition: {proc.get('opposing_dentition')}")
    if proc.get('occlusal_scheme'):
        parts.append(f"Occlusal Scheme: {proc.get('occlusal_scheme')}")
    if proc.get('occlusocervical_height'):
        parts.append(f"Occlusocervical Height: {proc.get('occlusocervical_height')} mm")
    if proc.get('mesiodistal_space'):
        parts.append(f"Mesiodistal Space: {proc.get('mesiodistal_space')} mm")
    if proc.get('prosthetic_plan'):
        parts.append(f"Prosthetic Plan: {proc.get('prosthetic_plan')}")
    if proc.get('loading_type'):
        lt = proc['loading_type']
        parts.append(f"Loading Type: {', '.join(lt) if isinstance(lt, list) else lt}")
    if proc.get('ridge_contour'):
        parts.append(f"Ridge Contour: {proc.get('ridge_contour')}")
    if proc.get('soft_tissue_thickness'):
        parts.append(f"Soft Tissue Thickness: {proc.get('soft_tissue_thickness')}")
    if proc.get('keratinized_mucosa'):
        parts.append(f"Keratinized Mucosa: {proc.get('keratinized_mucosa')}")
    # Per-site intraoral findings (iter-135) — keyed by cluster-leader tooth so
    # adjacent missing teeth share one site, non-adjacent gaps each have their
    # own. Emitted as a structured block so the LLM can correlate each implant
    # plan to its specific edentulous site.
    per_site = proc.get('clinical_exam_per_site') or {}
    if isinstance(per_site, dict) and per_site:
        site_lines = []
        for leader, findings in per_site.items():
            if not isinstance(findings, dict):
                continue
            bits = []
            if findings.get('ridge_contour'):
                bits.append(f"ridge {findings['ridge_contour']}")
            if findings.get('soft_tissue_thickness'):
                bits.append(f"soft tissue {findings['soft_tissue_thickness']}")
            if findings.get('keratinized_mucosa'):
                bits.append(f"keratinized {findings['keratinized_mucosa']}")
            if bits:
                site_lines.append(f"  - Site {leader}: {', '.join(bits)}")
        if site_lines:
            parts.append("Per-Site Intraoral Findings:")
            parts.extend(site_lines)
    if proc.get('smile_line'):
        parts.append(f"Smile Line: {proc.get('smile_line')}")
    if proc.get('gingival_biotype'):
        parts.append(f"Gingival Biotype: {proc.get('gingival_biotype')}")
    teeth = proc.get('teeth_present') or []
    if teeth:
        parts.append(f"Teeth Present: {', '.join(sorted(teeth, key=lambda x: int(x) if x.isdigit() else 0))}")

    # Implant plans
    plans = proc.get('implant_plans') or []
    for i, p in enumerate(plans):
        parts.append(f"Implant Plan {i+1}: Tooth {p.get('position', p.get('tooth_number','?'))}, Brand: {p.get('brand','?')}, System: {p.get('system','?')}, Diameter: {p.get('diameter','?')}mm, Length: {p.get('length','?')}mm, Bone Width: {p.get('bone_width','?')}mm, Bone Height: {p.get('bone_height','?')}mm, Bone Type: {p.get('bone_type','?')}")

    # ── Full-Arch atrophy assessment (silently injected institutional guidance) ──
    aa = proc.get('atrophy_assessment') or {}
    for arch_key in ('maxilla', 'mandible'):
        a = aa.get(arch_key) or {}
        if a.get('class'):
            parts.append("")
            try:
                from full_arch_classification import render_for_ai_context
                parts.append(render_for_ai_context(a))
            except Exception:
                parts.append(f"Atrophy class for the {arch_key}: {a.get('class')} ({a.get('severity_label','')})")

    # Medical assessment
    if proc.get('medical_assessment'):
        ma = proc['medical_assessment']
        if ma.get('asa_classification'):
            parts.append(f"ASA Classification: {ma['asa_classification']}")
        conditions = [k for k, v in ma.items() if v is True or v == 'Yes']
        if conditions:
            parts.append(f"Medical Conditions: {', '.join(conditions)}")
    if proc.get('medical_risk_level'):
        parts.append(f"Medical Risk Level: {proc.get('medical_risk_level')}")

    # Phase 2 - Surgical data
    p2 = proc.get('phase2_data') or {}
    if p2:
        parts.append("\n--- Phase 2: Surgical Data ---")
        torques = p2.get('torque_values') or proc.get('torque_values') or []
        if torques:
            implant_plans_ctx = proc.get('implant_plans') or []
            torque_labels = []
            for i, t in enumerate(torques):
                label = f"Tooth {implant_plans_ctx[i].get('position')}" if i < len(implant_plans_ctx) and implant_plans_ctx[i].get('position') else f"Implant {i+1}"
                torque_labels.append(f"{label}: {t} Ncm")
            parts.append(f"Insertion Torque Values: {', '.join(torque_labels)}")
        if p2.get('anesthesia_details'):
            parts.append(f"Anesthesia: {p2.get('anesthesia_details')}")
        if p2.get('flap_design'):
            parts.append(f"Flap Design: {p2.get('flap_design')}")
        if p2.get('drilling_type'):
            parts.append(f"Drilling Type: {p2.get('drilling_type')}")
        if p2.get('bone_graft_used'):
            parts.append(f"Bone Graft Used: Yes — {p2.get('bone_graft_details','')}")
        if p2.get('prosthetic_component'):
            parts.append(f"Prosthetic Component: {p2.get('prosthetic_component')}")
        if p2.get('healing_abutment_cuff_height'):
            hch = p2['healing_abutment_cuff_height']
            if isinstance(hch, list):
                parts.append(f"Healing Abutment Cuff Heights: {', '.join([str(h) for h in hch])}")
            else:
                parts.append(f"Healing Abutment Cuff Height: {hch}")
        if p2.get('implant_other_notes'):
            parts.append(f"Implant Notes: {p2.get('implant_other_notes')}")
        if p2.get('sutures_placed'):
            parts.append(f"Sutures Placed: {p2.get('sutures_placed')}")
        aco = p2.get('access_channel_openings') or []
        if aco and any(a for a in aco):
            parts.append(f"Access Channel Openings: {', '.join([a for a in aco if a])}")
        # iter-139: surface MUA context for AI explanations
        mua_placed = p2.get('multi_unit_abutment_placed')
        if mua_placed in ('yes', 'no'):
            parts.append(f"Multi-unit Abutment Placed: {'Yes' if mua_placed == 'yes' else 'No'}")
            mua_details = p2.get('multi_unit_abutment_details') or []
            if mua_placed == 'yes' and isinstance(mua_details, list) and mua_details:
                rows = []
                for r in mua_details:
                    if not isinstance(r, dict):
                        continue
                    t = r.get('tooth', '')
                    a = r.get('angulation', '')
                    c = r.get('cuff_height', '')
                    rows.append(f"Tooth {t}: {a}° / {c}mm")
                if rows:
                    parts.append(f"MUA Details: {'; '.join(rows)}")

    # Phase 3 - Second Stage Surgical
    p3 = proc.get('phase3_data') or {}
    if p3:
        parts.append("\n--- Phase 3: Healing and Second Stage Surgery ---")
        isq = p3.get('isq_value')
        if isq:
            if isinstance(isq, list):
                parts.append(f"ISQ Values: {', '.join([str(v) for v in isq])}")
            else:
                parts.append(f"ISQ Value: {isq}")
        if p3.get('healing_abutment_height'):
            hah = p3['healing_abutment_height']
            if isinstance(hah, list):
                parts.append(f"Healing Abutment Heights: {', '.join([str(h) for h in hah])}")
            else:
                parts.append(f"Healing Abutment Height: {hah}")

    # Phase 4 - Prosthetic Protocol
    p4 = proc.get('phase4_step1_data') or {}
    if p4:
        parts.append("\n--- Phase 4: Prosthetic Rehabilitation ---")
        if p4.get('final_prosthetic_plan'):
            parts.append(f"Final Prosthetic Plan: {p4.get('final_prosthetic_plan')}")
        if p4.get('prosthetic_material'):
            parts.append(f"Prosthetic Material: {p4.get('prosthetic_material')}")
        if p4.get('impression_type'):
            imp = p4.get('impression_type')
            tray = p4.get('conventional_tray_type')
            label = imp + (f" ({tray.replace('_', ' ')})" if imp == 'conventional' and tray else '')
            parts.append(f"Impression Type: {label}")
            mat = p4.get('impression_material')
            if imp == 'conventional' and mat:
                parts.append(f"Impression Material: {mat.replace('_', ' ')}")
        if p4.get('custom_abutment'):
            parts.append(f"Custom Abutment: {p4.get('custom_abutment')}")
        if p4.get('overdenture_attachment'):
            parts.append(f"Overdenture Attachment: {p4.get('overdenture_attachment')}")

    # Notes from all phases — include operator observations
    note_keys = [
        'phase2_student_notes', 'phase2_supervisor_notes', 'phase2_incharge_notes',
        'phase3_student_notes', 'phase3_supervisor_notes', 'phase3_incharge_notes',
        'phase4_step1_student_notes', 'phase4_step1_supervisor_notes', 'phase4_step1_incharge_notes',
        'phase4_step2_student_notes', 'phase4_step2_supervisor_notes', 'phase4_step2_incharge_notes',
    ]
    collected_notes = []
    for key in note_keys:
        if proc.get(key):
            label = key.replace('_', ' ').replace('phase2', 'Phase 2').replace('phase3', 'Phase 3').replace('phase4 step1', 'Phase 4 Step 1').replace('phase4 step2', 'Phase 4 Step 2').title()
            collected_notes.append(f"{label}: {proc[key]}")
    if collected_notes:
        parts.append("\n--- Clinical Notes & Operator Observations ---")
        parts.extend(collected_notes)

    return "\n".join(parts)


def _get_llm_key():
    return os.environ.get("OPENAI_API_KEY", "") or os.environ.get("EMERGENT_LLM_KEY", "")


_AI_BLOCKED_ROLES = {"nurse", "dental_assistant"}

@api_router.post("/ai/explain-recommendation")
async def ai_explain_recommendation(request: Request, current_user: dict = Depends(get_current_user)):
    """Generate AI explanation for implant recommendation."""
    if current_user.get("role") in _AI_BLOCKED_ROLES:
        raise HTTPException(status_code=403, detail="AI features not available for this role")
    body = await request.json()
    procedure_id = body.get("procedure_id")
    implant_index = body.get("implant_index", 0)
    
    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)}, {"_id": 0})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(proc, current_user)
    
    plans = proc.get("implant_plans") or []
    plan = plans[implant_index] if implant_index < len(plans) else (plans[0] if plans else {})
    
    context = _build_case_context(proc)
    # ── Inject institutional Indications & Features for grounded reasoning ──
    from implant_indications import get_details as _get_implant_details
    inst = _get_implant_details(plan.get("brand"), plan.get("system"))
    inst_block = ""
    if inst:
        if inst.get("indications"): inst_block += f"\nInstitutional Indications: {inst['indications']}"
        if inst.get("features"):    inst_block += f"\nInstitutional Features: {inst['features']}"

    # ── iter-142: inject Implant Catalog (components/SKUs) for the chosen system ──
    catalog_block = ""
    try:
        cat_key = f"{plan.get('brand','')}|{plan.get('system','')}"
        cat_doc = await db.implant_catalog.find_one({"key": cat_key}, {"_id": 0})
        if cat_doc:
            from implant_catalog_seed import build_ai_context as _build_cat_ctx
            cat_summary = _build_cat_ctx(cat_doc)
            if cat_summary:
                catalog_block = f"\n\nSystem Catalog (available components / SKUs):\n{cat_summary}"
    except Exception as _e:
        logging.debug(f"catalog injection skipped: {_e}")

    # ── Pick the per-site findings that apply to THIS implant (iter-135) ──
    # The clinical_exam_per_site map is keyed by the cluster-leader tooth, but
    # the implant plan's tooth_number may be any tooth in that adjacent run.
    # We resolve the right site by walking missing_teeth runs ordered by
    # adjacency and picking the run that contains the implant tooth.
    site_focus_block = ""
    plan_tooth = str(plan.get('tooth_number') or plan.get('position') or '').strip()
    per_site = proc.get('clinical_exam_per_site') or {}
    if plan_tooth and isinstance(per_site, dict) and per_site:
        # Build adjacency runs from missing_teeth (FDI-aware: same quadrant +
        # consecutive position numbers). Mirrors frontend findMissingRuns().
        missing = [str(t) for t in (proc.get('missing_teeth') or []) if str(t).isdigit()]
        runs: list[list[str]] = []
        for t in sorted(missing, key=lambda x: (x[0], int(x))):
            if runs and runs[-1] and t[0] == runs[-1][-1][0] and int(t) == int(runs[-1][-1]) + 1:
                runs[-1].append(t)
            else:
                runs.append([t])
        chosen_leader = None
        for run in runs:
            if plan_tooth in run:
                # Leader = highest tooth number in the run (clusterLeader rule).
                chosen_leader = max(run, key=lambda x: int(x))
                break
        # Fall back: maybe map keys directly contain the implant tooth.
        if not chosen_leader and plan_tooth in per_site:
            chosen_leader = plan_tooth
        if chosen_leader and isinstance(per_site.get(chosen_leader), dict):
            f = per_site[chosen_leader]
            bits = []
            if f.get('ridge_contour'):           bits.append(f"Ridge Contour: {f['ridge_contour']}")
            if f.get('soft_tissue_thickness'):   bits.append(f"Soft Tissue Thickness: {f['soft_tissue_thickness']}")
            if f.get('keratinized_mucosa'):      bits.append(f"Keratinized Mucosa: {f['keratinized_mucosa']}")
            if bits:
                site_focus_block = f"\nSite-Specific Findings (tooth {plan_tooth}, leader {chosen_leader}): {' | '.join(bits)}"

    prompt = f"""You are an expert implantologist. Based on the following clinical case data, explain in 4-5 concise sentences why the selected implant is appropriate for this case AND surface any per-site soft-tissue / ridge-contour considerations that affect surgical or prosthetic planning.

Use clinical reasoning grounded in established scientific literature — reference bone-to-implant safety margins, anatomical considerations, bone density classification, and implant design rationale specific to the bone type and site. When institutional Indications/Features are provided below, anchor your reasoning in those system-specific properties (e.g. tapered body for soft bone, conical connection for crestal preservation) rather than generic platitudes.

If Site-Specific Findings are provided, weight them explicitly: a thin soft-tissue biotype (≤1mm) warrants soft-tissue augmentation or a wider emergence profile and may favour a zirconia abutment for thick biotypes; minimal/inadequate keratinized mucosa (<2mm) warrants a free gingival graft or apically-positioned flap; a knife-edge or atrophied ridge warrants ridge-split, GBR, or a narrower-platform implant. Mention the clinical correlation explicitly — do NOT say "consider per-site findings" generically. Do NOT cite or name any specific guidelines, organizations, or textbooks.

Case Data:
{context}

Selected Implant: {plan.get('brand','')} {plan.get('system','')} {plan.get('diameter','')}×{plan.get('length','')}mm at site {plan.get('tooth_number','')}
Bone Type: {plan.get('bone_type','N/A')}{site_focus_block}{inst_block}{catalog_block}

If the System Catalog is provided, you may briefly cite which prosthetic / surgical components are available for the chosen system when relevant (e.g. healing-abutment heights, available abutment angulations, retention modes, multi-unit-abutment SKUs). Only mention what is actually present in the catalog — do NOT invent SKUs, angulations, gingival heights, or retention modes that are not listed.

Provide a clinical explanation in professional scientific language. Do not mention any guideline names or references. Write as a professional clinical note."""

    chat = LlmChat(
        api_key=_get_llm_key(),
        session_id=f"explain-{procedure_id}-{implant_index}-{uuid.uuid4().hex[:8]}",
        system_message="You are an expert implant dentistry clinical advisor. Provide concise, evidence-based clinical explanations."
    ).with_model("openai", "gpt-5.2")
    
    response = await chat.send_message(UserMessage(text=prompt))
    # iter-339 HIPAA: scrub all PHI (name, phone, email, DOB, address).
    response = _redact_phi_from_ai_text(response, proc)
    
    
    # Store in procedure
    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$set": {f"ai_explanations.implant_{implant_index}": response}}
    )
    
    return {"explanation": response}


@api_router.post("/ai/explain-standalone")
async def ai_explain_standalone(request: Request, current_user: dict = Depends(get_current_user)):
    """Generate AI explanation for standalone implant selection (no procedure ID required)."""
    if current_user.get("role") in _AI_BLOCKED_ROLES:
        raise HTTPException(status_code=403, detail="AI features not available for this role")
    body = await request.json()
    tooth = body.get("tooth", "")
    brand = body.get("brand", "")
    system = body.get("system", "")
    diameter = body.get("diameter", "")
    length = body.get("length", "")
    bone_width = body.get("bone_width", "")
    bone_height = body.get("bone_height", "")
    bone_type = body.get("bone_type", "")
    risk_level = body.get("risk_level", "")
    risk_score = body.get("risk_score", "")
    procedures = body.get("procedures", [])
    tooth_region = body.get("tooth_region", "")
    # Optional per-site intraoral findings sent from the Home implant tool
    # (iter-135). These let the standalone AI explanation correlate to the
    # specific edentulous site even outside a saved procedure context.
    ridge_contour = body.get("ridge_contour", "")
    soft_tissue_thickness = body.get("soft_tissue_thickness", "")
    keratinized_mucosa = body.get("keratinized_mucosa", "")

    context_parts = [f"Tooth: {tooth} ({tooth_region})" if tooth_region else f"Tooth: {tooth}"]
    context_parts.append(f"Implant: {brand} {system}, Diameter: {diameter}mm, Length: {length}mm")
    context_parts.append(f"Bone Width: {bone_width}mm, Bone Height: {bone_height}mm")
    if bone_type:
        context_parts.append(f"Bone Type: {bone_type}")
    if risk_level:
        context_parts.append(f"Risk Level: {risk_level} (Score: {risk_score})")
    if procedures:
        context_parts.append(f"Procedures: {', '.join(procedures) if isinstance(procedures, list) else procedures}")
    site_bits = []
    if ridge_contour:           site_bits.append(f"Ridge Contour: {ridge_contour}")
    if soft_tissue_thickness:   site_bits.append(f"Soft Tissue Thickness: {soft_tissue_thickness}")
    if keratinized_mucosa:      site_bits.append(f"Keratinized Mucosa: {keratinized_mucosa}")
    if site_bits:
        context_parts.append(f"Site-Specific Findings: {' | '.join(site_bits)}")
    context = "\n".join(context_parts)

    # ── Inject institutional Indications & Features so the LLM grounds its
    # rationale in the same clinical doc the student saw on screen ──
    from implant_indications import get_details as _get_implant_details
    inst = _get_implant_details(brand, system)
    inst_block = ""
    if inst:
        if inst.get("indications"):
            inst_block += f"\nInstitutional Indications: {inst['indications']}"
        if inst.get("features"):
            inst_block += f"\nInstitutional Features: {inst['features']}"

    prompt = f"""You are an expert implantologist. Based on the following clinical data, explain in 4-5 concise sentences why the selected implant is appropriate for this case AND surface any per-site soft-tissue / ridge-contour considerations that affect surgical or prosthetic planning.

Use clinical reasoning grounded in established scientific literature — reference bone-to-implant safety margins, anatomical considerations, and implant design rationale. When institutional Indications/Features are provided below, anchor your reasoning in those system-specific properties (e.g. tapered body for soft bone, conical connection for crestal preservation) rather than generic platitudes.

If Site-Specific Findings are provided, weight them explicitly: a thin soft-tissue biotype (≤1mm) warrants soft-tissue augmentation or a wider emergence profile and may favour a zirconia abutment for thick biotypes; minimal/inadequate keratinized mucosa (<2mm) warrants a free gingival graft or apically-positioned flap; a knife-edge or atrophied ridge warrants ridge-split, GBR, or a narrower-platform implant. Mention the clinical correlation explicitly — do NOT say "consider per-site findings" generically. Do NOT cite or name any specific guidelines, organizations, or textbooks.

Clinical Data:
{context}{inst_block}

Provide a clinical explanation in professional scientific language. Do not mention any guideline names or references. Write as a professional clinical note."""

    chat = LlmChat(
        api_key=_get_llm_key(),
        session_id=f"explain-standalone-{uuid.uuid4().hex[:8]}",
        system_message="You are an expert implant dentistry clinical advisor. Provide concise, evidence-based clinical explanations."
    ).with_model("openai", "gpt-5.2")

    response = await chat.send_message(UserMessage(text=prompt))

    return {"explanation": response}



# ────────────────────────────────────────────────────────────────────────
# iter-227: Radiograph compare — AI-generated clinical notes with editable
# follow-up persisted per tooth on the procedure. Used by the Phase 4 Step 2
# side-by-side comparison view (Phase 1 vs Phase 4 for existing-implant
# cases, Phase 2 vs Phase 4 for routine cases).
# ────────────────────────────────────────────────────────────────────────

import base64 as _b64
from PIL import Image as _PILImage  # noqa: WPS433 — already installed via fpdf deps; soft-fall handled below

class RadiographAINoteRequest(BaseModel):
    tooth_label: str = Field(..., max_length=40)
    baseline_filename: Optional[str] = Field(None, max_length=300)
    current_filename: Optional[str] = Field(None, max_length=300)
    baseline_phase_label: str = Field("Baseline", max_length=80)
    current_phase_label: str = Field("Current", max_length=80)


class RadiographEditNoteRequest(BaseModel):
    tooth_label: str = Field(..., max_length=40)
    notes: str = Field(..., max_length=4000)


def _user_can_edit_radiograph_notes(user: dict, procedure: dict) -> bool:
    role = user.get("role")
    if role in ("administrator", "implant_incharge"):
        return True
    if role == "supervisor" and procedure.get("supervisor_id") == str(user["_id"]):
        return True
    # "Primal user" = the student who created the case.
    if role == "student" and procedure.get("student_id") == str(user["_id"]):
        return True
    return False


def _load_radiograph_image_b64(filename: Optional[str]) -> Optional[Dict[str, str]]:
    """Read an uploaded radiograph from disk → re-encode as JPEG base64 so it
    plays nicely with the LLM vision payload (HEIC/HEIF are rejected by some
    providers; PDFs are not supported)."""
    if not filename:
        return None
    file_path = UPLOADS_DIR / filename
    if not file_path.exists():
        return None
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return {"error": "pdf"}
    try:
        with _PILImage.open(file_path) as img:
            img = img.convert("RGB")
            # Resize down to keep payload small / costs predictable.
            max_dim = 1600
            if max(img.size) > max_dim:
                img.thumbnail((max_dim, max_dim))
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=85)
            b64 = _b64.b64encode(buf.getvalue()).decode("ascii")
            return {"b64": b64, "mime": "image/jpeg"}
    except Exception:
        return None


@api_router.post("/procedures/{procedure_id}/radiograph-compare/ai-notes")
async def generate_radiograph_ai_notes(
    procedure_id: str,
    body: RadiographAINoteRequest,
    current_user: dict = Depends(get_current_user),
):
    """Generate AI clinical comparison notes for two radiographs of the same
    tooth taken at different phases. Saves the AI-generated text on the
    procedure under `radiograph_compare_notes[tooth_label]` and returns it.
    The frontend lets the primary student, supervisor, or implant in-charge
    edit the saved text afterwards via the PUT endpoint below."""
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)
    if not _user_can_edit_radiograph_notes(current_user, procedure):
        raise HTTPException(status_code=403, detail="Not authorised for this case")

    baseline = _load_radiograph_image_b64(body.baseline_filename)
    current_img = _load_radiograph_image_b64(body.current_filename)

    if not baseline and not current_img:
        raise HTTPException(status_code=400, detail="No readable radiograph images supplied")
    if (baseline and baseline.get("error") == "pdf") or (current_img and current_img.get("error") == "pdf"):
        raise HTTPException(status_code=415, detail="PDF radiographs are not supported for AI analysis — please upload an image (JPG/PNG).")

    image_attachments = []
    image_descriptors = []
    if baseline and baseline.get("b64"):
        image_attachments.append(ImageContent(image_base64=baseline["b64"]))
        image_descriptors.append(f"Image 1: {body.baseline_phase_label} (Tooth {body.tooth_label})")
    if current_img and current_img.get("b64"):
        image_attachments.append(ImageContent(image_base64=current_img["b64"]))
        image_descriptors.append(f"Image {len(image_attachments)}: {body.current_phase_label} (Tooth {body.tooth_label})")

    prompt = f"""You are reviewing two periapical radiographs of the SAME implant site to support a prosthodontist's final-delivery sign-off. Compare the two images and write concise clinical notes (4-7 bullet points) that a supervising clinician would find useful.

{chr(10).join(image_descriptors)}

For each of the following, comment ONLY on what is visually discernible — if a finding is not assessable from the image, say so plainly rather than speculating:
1. Crestal bone level around the implant (mesial vs distal change relative to baseline)
2. Peri-implant radiolucency (presence, location, magnitude)
3. Implant-abutment / implant-crown interface fit
4. Apical region — any periapical lesion or change
5. Adjacent structures (sinus floor, IAN canal, neighbouring teeth) where visible
6. Overall comparison verdict — stable / improving / concerning

Begin with a one-line summary line "Verdict: stable | watchful | concerning — <one phrase rationale>". Then list the bullets.

End with an explicit one-line caveat: "AI radiographic review — not a diagnostic substitute. Clinical correlation required."

Write in professional clinical language. Do not invent measurements or units. If image quality is too poor to assess a specific item, state that explicitly for that item."""

    try:
        chat = LlmChat(
            api_key=_get_llm_key(),
            session_id=f"radio-compare-{procedure_id}-{body.tooth_label}-{uuid.uuid4().hex[:8]}",
            system_message="You are an expert prosthodontist providing concise radiographic comparison notes. You are conservative — you flag what you cannot assess rather than guess.",
        ).with_model("openai", "gpt-5.2")
        response = await chat.send_message(UserMessage(text=prompt, file_contents=image_attachments))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI generation failed: {e}")

    now_iso = datetime.now(timezone.utc).isoformat()
    note_entry = {
        "tooth_label": body.tooth_label,
        "ai_generated": response,
        "ai_generated_at": now_iso,
        "ai_model": "gpt-5.2",
        "ai_baseline_phase": body.baseline_phase_label,
        "ai_current_phase": body.current_phase_label,
        # On first generation `edited` mirrors AI text so the front-end can
        # always render a single source of truth.
        "edited": response,
        "edited_at": now_iso,
        "edited_by_id": str(current_user["_id"]),
        "edited_by_role": current_user.get("role"),
        "edited_by_name": current_user.get("name") or current_user.get("identifier"),
        "is_ai_only": True,
    }

    # Preserve any prior manual edits if the user already typed something:
    existing = (procedure.get("radiograph_compare_notes") or {}).get(body.tooth_label) or {}
    if existing.get("edited") and not existing.get("is_ai_only", True):
        # User already customised the note — keep their edit, just refresh AI metadata.
        note_entry["edited"] = existing["edited"]
        note_entry["edited_at"] = existing.get("edited_at", now_iso)
        note_entry["edited_by_id"] = existing.get("edited_by_id", str(current_user["_id"]))
        note_entry["edited_by_role"] = existing.get("edited_by_role")
        note_entry["edited_by_name"] = existing.get("edited_by_name")
        note_entry["is_ai_only"] = False

    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$set": {f"radiograph_compare_notes.{body.tooth_label}": note_entry, "updated_at": datetime.utcnow()}},
    )

    return {"note": note_entry}


@api_router.put("/procedures/{procedure_id}/radiograph-compare/notes")
async def edit_radiograph_notes(
    procedure_id: str,
    body: RadiographEditNoteRequest,
    current_user: dict = Depends(get_current_user),
):
    """Persist a user-edited radiograph comparison note. Only the student
    creator, supervisor of record, implant in-charge, or administrator may
    edit."""
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)
    if not _user_can_edit_radiograph_notes(current_user, procedure):
        raise HTTPException(status_code=403, detail="Not authorised for this case")

    existing = (procedure.get("radiograph_compare_notes") or {}).get(body.tooth_label) or {}
    now_iso = datetime.now(timezone.utc).isoformat()
    merged = {
        **existing,
        "tooth_label": body.tooth_label,
        "edited": body.notes,
        "edited_at": now_iso,
        "edited_by_id": str(current_user["_id"]),
        "edited_by_role": current_user.get("role"),
        "edited_by_name": current_user.get("name") or current_user.get("identifier"),
        "is_ai_only": False,
    }

    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$set": {f"radiograph_compare_notes.{body.tooth_label}": merged, "updated_at": datetime.utcnow()}},
    )

    return {"note": merged}


# ────────────────────────────────────────────────────────────────────────
# iter-142: Implant System Catalog — Implanr AI knowledge base + admin CRUD.
# ────────────────────────────────────────────────────────────────────────

@api_router.get("/implant-catalog")
async def list_implant_catalog(current_user: dict = Depends(get_current_user)):
    """Return all catalog records (read by all authenticated users)."""
    cursor = db.implant_catalog.find({}, {"_id": 0}).sort("brand", 1)
    docs = await cursor.to_list(length=200)
    return {"systems": docs}


@api_router.get("/implant-catalog/compare")
async def compare_implant_catalog(component_type: str, current_user: dict = Depends(get_current_user)):
    """
    iter-152 — Brand Comparison view.
    Returns all catalog systems that contain the given component_type, with the
    component rows side-by-sided so the UI can render a comparison table.
    component_type examples: 'healing_abutment', 'multi_unit_abutment',
    'final_abutment', 'ti_base', 'cover_screw', 'scanbody', 'overdenture_attachment',
    'temporary_cylinder', 'analog', 'impression_coping', 'esthetic_abutment',
    'locator', 'prosthetic_screw', 'castable_abutment', 'gingiva_former'.
    Stub systems (is_stub=True) are excluded so the comparison only shows
    fully detailed catalogs.
    """
    cursor = db.implant_catalog.find(
        {"is_stub": {"$ne": True}, "components.type": component_type},
        {"_id": 0, "key": 1, "brand": 1, "name": 1, "connection": 1,
         "platform_switching": 1, "components": 1},
    ).sort("brand", 1)
    docs = await cursor.to_list(length=200)
    rows = []
    for d in docs:
        matches = [c for c in (d.get("components") or []) if c.get("type") == component_type]
        if not matches:
            continue
        # iter-297: `connection` can be a dict ({type, ...}) for older catalog
        # rows or a plain string for newer brand additions. Previously always
        # called `.get("type")` and crashed with 500 on string-connection rows.
        conn = d.get("connection")
        if isinstance(conn, dict):
            conn_type = conn.get("type")
        elif isinstance(conn, str):
            conn_type = conn
        else:
            conn_type = None
        rows.append({
            "key": d.get("key"),
            "brand": d.get("brand"),
            "name": d.get("name"),
            "connection": conn_type,
            "platform_switching": d.get("platform_switching"),
            "components": matches,
        })
    return {"component_type": component_type, "systems": rows, "total_systems": len(rows)}


@api_router.get("/implant-catalog/component-types")
async def list_component_types(current_user: dict = Depends(get_current_user)):
    """Return distinct component types present across non-stub catalog systems."""
    pipeline = [
        {"$match": {"is_stub": {"$ne": True}}},
        {"$unwind": "$components"},
        {"$group": {"_id": "$components.type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    rows = await db.implant_catalog.aggregate(pipeline).to_list(length=100)
    return {"types": [{"type": r["_id"], "count": r["count"]} for r in rows if r.get("_id")]}


@api_router.get("/implant-catalog/by-key")
async def get_implant_catalog_one(key: str, current_user: dict = Depends(get_current_user)):
    """Get a single catalog record by 'Brand|System' key."""
    doc = await db.implant_catalog.find_one({"key": key}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Catalog entry '{key}' not found")
    return doc


@api_router.put("/implant-catalog/by-key")
async def upsert_implant_catalog(request: Request, key: str, current_user: dict = Depends(get_current_user)):
    """Admin / In-Charge: upsert a catalog record."""
    if current_user.get("role") not in ("administrator", "implant_incharge"):
        raise HTTPException(status_code=403, detail="Only Administrator or Implant In-Charge can edit the catalog.")
    body = await request.json()
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Body must be a JSON object")
    try:
        brand_in, name_in = key.split("|", 1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Key must be 'Brand|System' format")
    body["key"] = key
    body["brand"] = body.get("brand") or brand_in
    body["name"] = body.get("name") or name_in
    body["is_stub"] = bool(not (body.get("components") or body.get("connection") or body.get("features")))
    body["updated_at"] = datetime.now(timezone.utc).isoformat()
    body["updated_by"] = current_user.get("name") or current_user.get("email")
    await db.implant_catalog.update_one({"key": key}, {"$set": body}, upsert=True)
    doc = await db.implant_catalog.find_one({"key": key}, {"_id": 0})
    return doc


# ─────────── iter-165: Catalog deletion + attachments ───────────
def _require_catalog_admin(current_user: dict) -> None:
    if current_user.get("role") not in ("administrator", "implant_incharge"):
        raise HTTPException(status_code=403, detail="Only Administrator or Implant In-Charge can edit the catalog.")


@api_router.delete("/implant-catalog/by-key")
async def delete_implant_catalog_record(
    request: Request,
    key: str,
    current_user: dict = Depends(get_current_user),
):
    """Admin / In-Charge: delete a single catalog record (variant/system).
    Soft-deletes any attachments first, then removes the catalog doc.
    Audit-logged."""
    _require_catalog_admin(current_user)
    doc = await db.implant_catalog.find_one({"key": key}, {"_id": 0, "key": 1, "brand": 1, "name": 1, "attachments": 1})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Catalog entry '{key}' not found")
    # Soft-delete any attachment refs (storage has no delete API).
    for att in (doc.get("attachments") or []):
        path = att.get("storage_path")
        if path:
            await db.catalog_attachments.update_one(
                {"storage_path": path},
                {"$set": {"is_deleted": True, "deleted_at": datetime.now(timezone.utc).isoformat()}},
            )
    res = await db.implant_catalog.delete_one({"key": key})
    await log_access(
        action="catalog.delete_system",
        resource_type="implant_catalog",
        resource_id=key,
        user=current_user,
        request=request,
        outcome="success",
        extra={"brand": doc.get("brand"), "name": doc.get("name"), "attachments_soft_deleted": len(doc.get("attachments") or [])},
    )
    return {"deleted": res.deleted_count, "key": key}


@api_router.delete("/implant-catalog/by-brand")
async def delete_implant_catalog_brand(
    request: Request,
    brand: str,
    current_user: dict = Depends(get_current_user),
):
    """Admin / In-Charge: delete an entire implant company and all its
    systems/variants. Cascades attachments soft-delete. Audit-logged."""
    _require_catalog_admin(current_user)
    if not brand or not brand.strip():
        raise HTTPException(status_code=400, detail="brand is required")
    docs = await db.implant_catalog.find({"brand": brand}, {"_id": 0, "key": 1, "attachments": 1}).to_list(2000)
    if not docs:
        raise HTTPException(status_code=404, detail=f"No systems found for brand '{brand}'")
    keys = [d["key"] for d in docs]
    soft_deleted_attachments = 0
    for d in docs:
        for att in (d.get("attachments") or []):
            path = att.get("storage_path")
            if path:
                await db.catalog_attachments.update_one(
                    {"storage_path": path},
                    {"$set": {"is_deleted": True, "deleted_at": datetime.now(timezone.utc).isoformat()}},
                )
                soft_deleted_attachments += 1
    res = await db.implant_catalog.delete_many({"brand": brand})
    await log_access(
        action="catalog.delete_brand",
        resource_type="implant_catalog_brand",
        resource_id=brand,
        user=current_user,
        request=request,
        outcome="success",
        extra={"systems_deleted": res.deleted_count, "keys": keys, "attachments_soft_deleted": soft_deleted_attachments},
    )
    return {"deleted": res.deleted_count, "brand": brand, "keys": keys}


# ── Catalog attachments ─────────────────────────────────────────────
ALLOWED_ATTACHMENT_MIME = {
    "application/pdf",
    "image/png", "image/jpeg", "image/webp", "image/gif",
}
MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024  # 25 MB


@api_router.post("/implant-catalog/by-key/attachments")
async def upload_catalog_attachment(
    request: Request,
    key: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload an attachment (PDF brochure, lab manual, image) to a catalog
    record. Stored in Emergent object storage; metadata appended to
    `implant_catalog.attachments`. Admin / In-Charge only."""
    _require_catalog_admin(current_user)
    doc = await db.implant_catalog.find_one({"key": key}, {"_id": 0, "key": 1, "brand": 1})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Catalog entry '{key}' not found")
    content_type = (file.content_type or "application/octet-stream").lower()
    if content_type not in ALLOWED_ATTACHMENT_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{content_type}'. Allowed: PDF, PNG, JPEG, WEBP, GIF.",
        )
    data = await file.read()
    if len(data) > MAX_ATTACHMENT_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large (max {MAX_ATTACHMENT_SIZE // (1024*1024)} MB)")
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    from object_storage import put_object as _put_object, APP_NAME as _APP_NAME
    ext = (file.filename or "bin").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin"
    att_id = str(uuid.uuid4())
    safe_brand = re.sub(r"[^A-Za-z0-9_-]+", "_", (doc.get("brand") or "x"))[:40]
    storage_path = f"{_APP_NAME}/catalog/{safe_brand}/{att_id}.{ext}"
    try:
        result = _put_object(storage_path, data, content_type)
    except Exception as e:
        await log_access(
            action="catalog.attachment.upload",
            resource_type="implant_catalog",
            resource_id=key,
            user=current_user, request=request, outcome="failure",
            extra={"error": str(e)[:200]},
        )
        raise HTTPException(status_code=502, detail=f"Object storage upload failed: {e}")

    # iter-166: extract searchable text from PDFs at upload time so Ask Implanr
    # can quote the manufacturer's own brochure when answering clinician
    # questions. Best-effort — if extraction fails we keep the upload.
    extracted_text: Optional[str] = None
    if content_type == "application/pdf":
        try:
            from PyPDF2 import PdfReader
            from io import BytesIO as _BytesIO
            reader = PdfReader(_BytesIO(data))
            chunks: List[str] = []
            for p in reader.pages[:60]:  # cap at 60 pages
                try:
                    t = p.extract_text() or ""
                    if t.strip():
                        chunks.append(t.strip())
                except Exception:
                    continue
            extracted_text = "\n".join(chunks)[:60_000]  # cap at 60k chars
            if not extracted_text.strip():
                extracted_text = None
        except Exception as e:
            logging.warning(f"[catalog] PDF text extraction failed for {att_id}: {e}")

    record = {
        "id": att_id,
        "storage_path": result.get("path", storage_path),
        "original_filename": file.filename or f"{att_id}.{ext}",
        "content_type": content_type,
        "size": int(result.get("size") or len(data)),
        "uploaded_by": current_user.get("name") or current_user.get("email"),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "catalog_key": key,
        "is_deleted": False,
        "extracted_text": extracted_text,
    }
    await db.catalog_attachments.insert_one(dict(record))
    record.pop("_id", None)
    await db.implant_catalog.update_one(
        {"key": key},
        {"$push": {"attachments": {
            "id": record["id"],
            "storage_path": record["storage_path"],
            "original_filename": record["original_filename"],
            "content_type": record["content_type"],
            "size": record["size"],
            "uploaded_by": record["uploaded_by"],
            "uploaded_at": record["uploaded_at"],
            "has_extracted_text": bool(extracted_text),
        }}, "$set": {"updated_at": record["uploaded_at"]}},
    )
    await log_access(
        action="catalog.attachment.upload",
        resource_type="implant_catalog",
        resource_id=key,
        user=current_user, request=request, outcome="success",
        extra={"attachment_id": att_id, "filename": record["original_filename"], "size": record["size"], "extracted_text_len": len(extracted_text or "")},
    )
    # Don't return raw extracted_text in the API response (can be large).
    return {k: v for k, v in record.items() if k != "extracted_text"}


@api_router.delete("/implant-catalog/by-key/attachments/{att_id}")
async def delete_catalog_attachment(
    request: Request,
    key: str,
    att_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Soft-delete an attachment. Removes it from the catalog doc and marks
    the underlying storage record `is_deleted=True` (storage has no delete API)."""
    _require_catalog_admin(current_user)
    doc = await db.implant_catalog.find_one({"key": key}, {"_id": 0, "attachments": 1})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Catalog entry '{key}' not found")
    atts = doc.get("attachments") or []
    target = next((a for a in atts if a.get("id") == att_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Attachment not found on this record")
    await db.implant_catalog.update_one(
        {"key": key},
        {"$pull": {"attachments": {"id": att_id}}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if target.get("storage_path"):
        await db.catalog_attachments.update_one(
            {"storage_path": target["storage_path"]},
            {"$set": {"is_deleted": True, "deleted_at": datetime.now(timezone.utc).isoformat()}},
        )
    await log_access(
        action="catalog.attachment.delete",
        resource_type="implant_catalog",
        resource_id=key,
        user=current_user, request=request, outcome="success",
        extra={"attachment_id": att_id, "filename": target.get("original_filename")},
    )
    return {"deleted": True, "id": att_id}


@api_router.get("/implant-catalog/attachments/{att_id}/download")
async def download_catalog_attachment(
    request: Request,
    att_id: str,
    auth: Optional[str] = Query(None),
):
    """Authenticated download for catalog attachments. Supports query-param
    auth so <img src> / <a href> can fetch without setting headers."""
    auth_header = request.headers.get("authorization")
    if not auth_header and auth:
        auth_header = f"Bearer {auth}"
    if not auth_header:
        raise HTTPException(status_code=401, detail="Authentication required")
    token = auth_header.replace("Bearer ", "").strip()
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)}, {"password_hash": 0})
    except Exception:
        user = None
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    record = await db.catalog_attachments.find_one(
        {"id": att_id, "is_deleted": {"$ne": True}},
        {"_id": 0},
    )
    if not record:
        raise HTTPException(status_code=404, detail="Attachment not found")

    from object_storage import get_object as _get_object
    try:
        data, ctype = _get_object(record["storage_path"])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Object storage fetch failed: {e}")

    await log_access(
        action="catalog.attachment.download",
        resource_type="implant_catalog",
        resource_id=record.get("catalog_key"),
        user=user, request=request, outcome="success",
        extra={"attachment_id": att_id, "filename": record.get("original_filename")},
    )
    headers = {"Content-Disposition": f'inline; filename="{record.get("original_filename") or att_id}"'}
    return Response(content=data, media_type=record.get("content_type") or ctype, headers=headers)


# ── iter-242: Ask Implanr AI personal assistant ──────────────────────────
# Broad-scope assistant available from the Home Screen FAB. Unlike the
# catalog-only `/ai/ask-implanr` endpoint above, this one is aware of:
#   • the calling user's role + display name
#   • a compact summary of THEIR cases (status + last activity)
#   • the implant catalog (when the question matches a brand/system name)
#   • app-workflow help (system prompt only)
# Patient names are tokenised before being sent to the LLM so the model
# never sees raw PII; tokens are de-tokenised in the response.
@api_router.post("/ai/assistant")
async def ai_assistant(request: Request, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") in _AI_BLOCKED_ROLES:
        raise HTTPException(status_code=403, detail="AI features not available for this role")
    body = await request.json()
    question = (body.get("question") or "").strip()
    history = body.get("history") or []  # list of {role: user|assistant, content: str}
    if not question:
        raise HTTPException(status_code=400, detail="question is required")

    role = current_user.get("role", "student")
    user_id = current_user.get("id") or current_user.get("user_id") or current_user.get("_id")

    # ── Gather a compact case summary scoped by role ──
    case_filter: dict = {"is_deleted": {"$ne": True}}
    if role == "student":
        case_filter["user_id"] = str(user_id)
    elif role == "supervisor":
        case_filter["supervisor_id"] = str(user_id)
    elif role == "implant_incharge":
        case_filter["implant_incharge_id"] = str(user_id)
    # admin / nurse: no scope filter — they see everything (limited by .limit below)

    procs = await db.procedures.find(
        case_filter,
        {"_id": 1, "patient_name": 1, "registration_number": 1, "implant_procedure_type": 1, "status": 1, "current_phase": 1, "created_at": 1, "case_origin": 1}
    ).sort("created_at", -1).limit(10).to_list(length=10)

    # Tokenise patient names so the LLM never sees raw PII.
    tokens: dict[str, str] = {}
    case_lines = []
    for i, p in enumerate(procs):
        pid = str(p.get("_id"))
        pname = (p.get("patient_name") or "").strip() or "Unknown"
        token = f"Patient_{i+1:02d}"
        tokens[token] = pname
        case_lines.append(
            f"• [{token}] reg#{p.get('registration_number', '—')} | "
            f"{p.get('implant_procedure_type', 'Unknown procedure')} | "
            f"origin={p.get('case_origin', 'routine')} | "
            f"status={p.get('status', '—')} | phase={p.get('current_phase', '—')}"
        )
    cases_block = ("\n".join(case_lines)) if case_lines else "(no cases yet)"

    # ── Catalog grounding: if the question mentions a brand/system, pull
    #     its catalog block so the AI can answer about components / sizes. ──
    catalog_block = ""
    try:
        from implant_catalog_seed import build_ai_context as _build_cat_ctx
        # crude match — pull up to 3 catalogs whose key/brand appears in the question
        q_lower = question.lower()
        cursor = db.implant_catalog.find({"is_stub": {"$ne": True}}, {"_id": 0}).limit(50)
        all_cat = await cursor.to_list(length=50)
        matched = [c for c in all_cat if (c.get("brand", "").lower() in q_lower) or (c.get("system", "").lower() in q_lower)][:3]
        if matched:
            catalog_block = "\n\n".join(_build_cat_ctx(c) for c in matched if _build_cat_ctx(c))
    except Exception:
        pass

    role_capabilities = {
        "student": "Students create new cases, fill Phase 1 forms, manage drafts, and view their own case timelines. They can request edits, but cannot approve cases.",
        "supervisor": "Supervisors review student Phase 1 submissions, approve/reject them, and route approved cases to the implant in-charge.",
        "implant_incharge": "Implant in-charges give final Phase 1 approval, manage surgical planning (Phase 2), schedule cases, and approve subsequent phases.",
        "administrator": "Administrators can do everything — manage users, see all cases, configure the implant catalog, view audit logs, export reports.",
        "nurse": "Nurses see the case schedule, prep checklists, and have read-only access to most case details.",
    }
    role_help = role_capabilities.get(role, "")

    # iter-244: pull the FULL distinct list of implant brands + systems from
    # the catalog so the AI can answer "which systems are available?" without
    # hallucinating or under-listing.
    systems_block = ""
    try:
        sys_cursor = db.implant_catalog.find(
            {"is_stub": {"$ne": True}},
            {"_id": 0, "brand": 1, "name": 1}
        )
        sys_docs = await sys_cursor.to_list(length=500)
        by_brand: dict[str, set] = {}
        for d in sys_docs:
            b = (d.get("brand") or "").strip()
            # iter-244: actual field in implant_catalog is `name`, not
            # `system`. Without this the systems_block was always empty
            # and the AI hallucinated/under-listed available systems.
            s = (d.get("name") or "").strip()
            if not b or not s:
                continue
            by_brand.setdefault(b, set()).add(s)
        if by_brand:
            lines = []
            for brand in sorted(by_brand.keys()):
                lines.append(f"  • {brand}: {', '.join(sorted(by_brand[brand]))}")
            systems_block = "IMPLANT SYSTEMS AVAILABLE IN THE APP (live count: " + str(sum(len(v) for v in by_brand.values())) + "):\n" + "\n".join(lines)
    except Exception:
        systems_block = ""

    # iter-244: comprehensive app knowledge baked into the system prompt so
    # the assistant gives complete, accurate answers about features, role
    # capabilities, and workflows — not just whatever it can infer from the
    # short capability blurb above.
    APP_KNOWLEDGE = """
IMPLANR APP — COMPLETE OVERVIEW

WHAT IT IS
  Implanr is a mobile-first prosthodontics workflow app for managing dental implant cases across 4 sequential phases. It enforces multi-tier clinical approvals, generates phase-aware AI case summaries (which clinicians can edit, and edits are fed back so the AI learns), and ships HIPAA technical safeguards (15-minute auto-logout, screenshot blocking, full access-log audit trail).

ROLES & EXACT CAPABILITIES
  • STUDENT — creates new cases (routine OR existing-implant), fills Phase 1 (clinical exam, medical assessment, prosthetic plan, FDI tooth chart, CBCT upload, Phase 1 checklist), saves drafts, requests Phase-2 edits if surgical info changes; cannot approve.
  • SUPERVISOR — reviews and approves/rejects student Phase 1 submissions; once approved, the case routes to the implant in-charge.
  • IMPLANT IN-CHARGE — gives the final Phase 1 approval, plans surgery (Phase 2 — implant brand/system/size selection, surgical date scheduling), reviews Pre-Phase-3 summary, resolves student edit requests, approves Phase 3 (delivery) and Phase 4 (follow-up).
  • NURSE — read-only across cases; sees the surgical schedule and prep checklists; cannot approve or edit.
  • ADMINISTRATOR — full access; manages users, configures the implant catalog, views audit logs, exports CSV reports, runs the AI feedback stats dashboard.

4-PHASE CASE WORKFLOW (every routine case)
  PHASE 1 — Diagnosis & Treatment Planning
    Step 1 (Case Details): patient info, chief complaint, faculty assignment, procedure type (dropdown), payment.
    Step 2 (Treatment Plan): prosthetic plan, FDI chart, clinical examination, schedule, type of loading, CBCT upload, Phase 1 Checklist (including medical assessment risk factors).
    Submit → routes to Supervisor → Implant In-Charge for sequential approval.
  PHASE 2 — Surgical Planning & Surgery
    Implant in-charge selects implant brand/system/diameter/length/gingival height, schedules surgery date, captures intra-op notes, healing-abutment PDF generation, prosthesis type selection.
  PHASE 3 — Prosthesis Delivery
    Pre-Phase-3 readback summary; Student can raise an edit-request if Phase-2 data is wrong, In-Charge resolves; final prosthesis delivery captured.
  PHASE 4 — Follow-Up & Closure
    Step 1: clinical review; Step 2: side-by-side radiograph compare with AI-editable notes (compares baseline vs. follow-up). Case closes with a full case-report PDF.

EXISTING IMPLANT WORKFLOW (parallel entry — for patients who already have implants placed elsewhere)
  Shares the same 3-tier approval routing, Clinical Examination, and Medical Assessment as routine cases.
  Additional sections: Type of Implant Procedure Done (dropdown), Arch picker (Maxillary / Mandibular / Both, for All on 4 / 6 / X), FDI multi-select chart to mark each existing implant tooth, per-implant Brand / System / Diameter / Length / Gingival Height / Present Prosthetic Component / Surgery Date / Original Surgeon (all required; ISQ is optional), Prosthetic History (with stage Temporary / Final), Failure Analysis.
  Per-implant IOPA Radiograph upload is required for non-full-arch; case-level OPG / CBCT upload is required for full-arch.
  Phase 1 submit routes to Phase 3 OR Phase 4 Step 1 depending on the implant state.

KEY FEATURES
  • Sticky 5-step progress strip (Case Details → Treatment Plan/Implant Details → Clinical Examination → Phase 1 Checklist/Medical Assessment → Submit) with green ✓ on completed steps and tap-to-jump pills. Pills show a popup listing missing fields if incomplete.
  • Phase-aware AI case summary (this assistant's sibling endpoint): generates a clinical summary covering the sections relevant to the case's current phase; clinicians can edit and edits feed back as voice/style examples for future generations.
  • Clinical decision support: bridge / cantilever detection, biological safety validation (bone width soft-blocks, bone height hard-blocks for posteriors), implant-tooth correlation checks, automatic atrophy classification for full-arch cases (skipped for existing-implant cases since implants are already placed).
  • Implant Catalog with 30+ institutional systems (each carrying indications, components, diameter & length matrices). The catalog grounds the AI "Explain Recommendation" feature and surfaces the "Suggest Me" tool in the Home Screen Implant Selection tab.
  • HIPAA safeguards: 15-min auto-logout, screenshot blocking (expo-screen-capture), every read/export/login/override is logged to access_logs, admin CSV export.
  • Per-case AI radiograph comparison (Phase 4 Step 2) with editable AI notes.
  • Ask Implanr AI (this assistant): role-aware Q&A, case-status lookups, implant catalog answers, app navigation help.

WHERE TO FIND THINGS IN THE APP
  • Home (Dashboard tab) — counters for Drafts, Active, Approved, Completed, plus quick action cards.
  • New Case tab — creates a new case (routine or existing-implant).
  • Implant tab — Implant Database, Suggest Me, Let Me Choose, Safety rules.
  • My Cases tab — paginated list of every case the user has access to, with filters.
  • Alerts tab — notifications about approvals, edit-requests, schedule changes.
  • Admin (admin only) — user management, audit log, AI feedback stats, implant catalog editor.
"""

    system_message = (
        "You are Implanr AI, a friendly, accurate, and concise personal assistant for prosthodontists using the Implanr mobile app. "
        "Your job: help the current user navigate the app and use its full potential. "
        "Answer in plain professional language. Use short paragraphs, not bullet markdown. "
        "Do NOT use Markdown — no asterisks for bold (**), no underscores for italic (_), no leading dashes for lists. Write in plain natural sentences. "
        "If a list is clearer, use a number followed by a period (1. ...) at the start of each item with a blank line between items. "
        "Never invent facts about cases, app features, or the implant catalog — if the data isn't in the provided context, say so honestly. "
        "Never use the raw patient name; refer to cases by their token (e.g. Patient_01) — the app de-tokenises before showing the answer to the user. "
        "Do NOT mention HIPAA tokenisation or that names are anonymised; just use the tokens naturally."
        + APP_KNOWLEDGE
        + (("\n\n" + systems_block) if systems_block else "")
    )

    prompt = (
        f"USER ROLE: {role}\n"
        f"USER NAME: {current_user.get('name', '—')}\n"
        f"ROLE CAPABILITIES: {role_help}\n\n"
        f"USER'S RECENT CASES (most recent first, max 20):\n{cases_block}\n\n"
        + (f"RELEVANT IMPLANT CATALOG DATA:\n{catalog_block}\n\n" if catalog_block else "")
        + (("RECENT CONVERSATION:\n" + "\n".join(f"{m.get('role','user')}: {m.get('content','')[:400]}" for m in history[-6:]) + "\n\n") if history else "")
        + f"USER QUESTION: {question}\n\n"
        + "Answer the user directly and helpfully. If their question is about how to do something in the app, give the step-by-step. "
        + "If it's about a case, use the token from the list above. If it's about an implant system, ground in the catalog block."
    )

    session_id = body.get("session_id") or f"assistant-{user_id}-{uuid.uuid4().hex[:8]}"
    # iter-243: 520/502s reported — those are gateway timeouts when the LLM
    # call exceeds Cloudflare's 30s budget. Use a faster model and asyncio
    # wait_for so we fail fast (in 25s) with a friendly message instead of
    # letting the gateway return a confusing 5xx.
    try:
        chat = LlmChat(
            api_key=_get_llm_key(),
            session_id=session_id,
            system_message=system_message,
        ).with_model("openai", "gpt-4o-mini")
        response_text = await asyncio.wait_for(chat.send_message(UserMessage(text=prompt)), timeout=25.0)
    except asyncio.TimeoutError:
        return {"answer": "I'm taking a bit too long to think — could you ask that again, maybe a touch shorter? (My responses time out at 25 s.)", "session_id": session_id}
    except Exception as e:
        return {"answer": f"Hmm, I hit an error reaching the AI service — please try again in a moment. (debug: {type(e).__name__})", "session_id": session_id}

    # De-tokenise patient names so the user sees the real names.
    for tok, real in tokens.items():
        response_text = response_text.replace(tok, real)

    # iter-244: strip residual markdown asterisks / underscores so the
    # chat bubble renders as plain text. We tell the model not to use
    # markdown in the system prompt; this is defense-in-depth.
    import re as _re_md
    response_text = _re_md.sub(r"\*\*(.*?)\*\*", r"\1", response_text)
    response_text = _re_md.sub(r"(?<!\w)\*(.+?)\*(?!\w)", r"\1", response_text)
    response_text = _re_md.sub(r"(?<!\w)_(.+?)_(?!\w)", r"\1", response_text)

    # Log to access_logs for HIPAA.
    try:
        await db.access_logs.insert_one({
            "action": "ai_assistant_query",
            "outcome": "ok",
            "user_id": str(user_id),
            "resource_type": "ai_assistant",
            "resource_id": session_id,
            "metadata": {"question_length": len(question), "tokens_used": len(tokens)},
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass

    return {"answer": response_text, "session_id": session_id}




@api_router.post("/ai/ask-implanr")
async def ai_ask_implanr(request: Request, current_user: dict = Depends(get_current_user)):
    """Free-form Implanr AI Q&A scoped to the implant catalog. Auto-scopes to
    a case's chosen system when procedure_id is provided."""
    if current_user.get("role") in _AI_BLOCKED_ROLES:
        raise HTTPException(status_code=403, detail="AI features not available for this role")
    from implant_catalog_seed import build_ai_context as _build_cat_ctx
    body = await request.json()
    question = (body.get("question") or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="question is required")
    procedure_id = body.get("procedure_id")
    system_key = (body.get("system_key") or "").strip()

    case_system = None
    if procedure_id and not system_key:
        try:
            proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)}, {"_id": 0, "implant_plans": 1})
            if proc and proc.get("implant_plans"):
                p0 = proc["implant_plans"][0]
                case_system = f"{p0.get('brand','')}|{p0.get('system','')}".strip("|")
        except Exception:
            pass
    target_key = system_key or case_system or ""

    cat_block = ""
    if target_key:
        doc = await db.implant_catalog.find_one({"key": target_key}, {"_id": 0})
        if doc:
            cat_block = _build_cat_ctx(doc)
    if not cat_block:
        cursor = db.implant_catalog.find({"is_stub": {"$ne": True}}, {"_id": 0}).limit(8)
        docs = await cursor.to_list(length=8)
        cat_block = "\n\n".join(_build_cat_ctx(d) for d in docs if _build_cat_ctx(d))

    if not cat_block:
        return {"answer": "The implant catalog has not been populated yet. Please ask an administrator to add component data via the Implant Catalog admin page.", "scoped_system": None}

    # iter-166: pull text extracted from manufacturer-uploaded PDFs for the
    # scoped system (and only that system) so the AI can quote the official
    # brochure when answering. Cap total brochure context to keep the prompt
    # well below the LLM input limit.
    brochure_block = ""
    if target_key:
        atts = await db.catalog_attachments.find(
            {"catalog_key": target_key, "is_deleted": {"$ne": True}, "extracted_text": {"$nin": [None, ""]}},
            {"_id": 0, "original_filename": 1, "extracted_text": 1},
        ).to_list(length=10)
        if atts:
            chunks = []
            budget = 12_000
            for a in atts:
                txt = (a.get("extracted_text") or "").strip()
                if not txt:
                    continue
                snippet = txt[: max(500, budget // max(1, len(atts)))]
                chunks.append(f"--- Brochure: {a.get('original_filename')} ---\n{snippet}")
                budget -= len(snippet)
                if budget <= 0:
                    break
            if chunks:
                brochure_block = "\n\nMANUFACTURER BROCHURE EXCERPTS (verbatim text from uploaded PDFs — quote conservatively, never invent):\n\n" + "\n\n".join(chunks)

    from implanr_conventions import DATA_CONVENTIONS_BLOCK as _CONVENTIONS

    scope_line = f"Active system in this case: {target_key}\n\n" if target_key else ""
    prompt = (
        f"You are Implanr AI, a precise clinical assistant for prosthodontists.\n\n"
        f"{_CONVENTIONS}\n\n"
        f"{scope_line}"
        f"Component database (verified specifications — only quote values that appear here):\n\n{cat_block}"
        f"{brochure_block}\n\n"
        f"Clinician question: {question}\n\n"
        f"OUTPUT RULES (strict — must follow):\n"
        f"1. Reply in plain text. NEVER use markdown asterisks (no **bold**, no *italics*), no hashes, no backticks.\n"
        f"2. NEVER use the words 'catalog', 'catalogue', 'database', 'uploaded', 'provided data', 'records', or 'JSON'. "
        f"Speak as a clinician, not as a data engineer.\n"
        f"3. When the question is about a component (e.g. healing abutment, cover screw, multi-unit, ti-base, "
        f"temporary cylinder, final abutment), answer in this structured plain-text format:\n\n"
        f"   Specification of <Component> — <Brand> <System>\n"
        f"   Diameter (mm): <values>\n"
        f"   Cuff height / GH (mm): <values>\n"
        f"   Angulation (deg): <values>\n"
        f"   Material: <values>\n"
        f"   Retention: <values>\n"
        f"   Indication: <text>\n\n"
        f"   Omit any line whose data is not available. Use exact numeric values, not ranges, when listed.\n"
        f"4. For comparative or general questions (e.g. 'compare angulations', 'which systems support zirconia'), "
        f"reply in 2–4 short numbered points, one system per line, with exact figures.\n"
        f"5. If a specific value is not present for the asked system or component, reply with exactly this sentence "
        f"and nothing else:\n\n   Information is not available.\n\n"
        f"6. NEVER fabricate diameters, heights, angulations, materials, or SKUs. Clinical interpretation is "
        f"acceptable when grounded in the specifications above and standard prosthodontic literature "
        f"(Misch, ITI consensus, Branemark protocol), but specifications themselves must be exact.\n"
        f"7. When the brochure excerpts conflict with the structured component data, prefer the structured data and "
        f"add 'Brochure detail: …' on a new line for the additional information."
    )

    chat = LlmChat(
        api_key=_get_llm_key(),
        session_id=f"implanr-{current_user.get('id','')}-{uuid.uuid4().hex[:8]}",
        system_message=(
            "You are Implanr AI, a precise prosthodontic assistant. Output plain text only — never markdown. "
            f"{_CONVENTIONS} "
            "Quote exact specification values from the supplied component database and uploaded manufacturer "
            "brochure excerpts. If a value is missing, reply only with 'Information is not available.' Never fabricate."
        )
    ).with_model("openai", "gpt-5.2")

    response = await chat.send_message(UserMessage(text=prompt))
    return {"answer": response, "scoped_system": target_key or None}


async def _seed_implant_catalog():
    """Idempotent seed for the implant_catalog collection (called on startup)."""
    try:
        from implant_catalog_seed import (
            ANKYLOS_CX, OSSTEM_TSIII, MIS_LANCE_PLUS,
            BIOHORIZONS_TAPERED_PRO, BIOHORIZONS_TAPERED_PRO_CONICAL,
            CONELOG_PROGRESSIVE, ALPHABIO_SPI, CATALOG_EXTRA,
            STUB_KEYS, _stub
        )
    except Exception as e:
        logging.warning(f"implant_catalog seed skipped: {e}")
        return

    now = datetime.now(timezone.utc).isoformat()
    curated = (
        ANKYLOS_CX, OSSTEM_TSIII, MIS_LANCE_PLUS,
        BIOHORIZONS_TAPERED_PRO, BIOHORIZONS_TAPERED_PRO_CONICAL,
        CONELOG_PROGRESSIVE, ALPHABIO_SPI,
        *CATALOG_EXTRA,
    )
    for rec in curated:
        rec_with_meta = {**rec, "is_stub": False, "updated_at": now, "updated_by": "seed"}
        # iter-149: respect admin edits — only seed-overwrite when the record
        # has not been touched by a user. If updated_by != "seed" (i.e. an
        # Implant In-Charge or Administrator saved their own values), keep
        # those values intact across backend reloads.
        existing_doc = await db.implant_catalog.find_one(
            {"key": rec["key"]}, {"updated_by": 1, "_id": 0}
        )
        if existing_doc and existing_doc.get("updated_by") not in (None, "", "seed"):
            continue  # admin-edited — never overwrite
        await db.implant_catalog.update_one(
            {"key": rec["key"]}, {"$set": rec_with_meta}, upsert=True
        )
    existing = {d["key"] async for d in db.implant_catalog.find({}, {"key": 1, "_id": 0})}
    for k in STUB_KEYS:
        if k not in existing:
            stub = _stub(k)
            stub["updated_at"] = now
            stub["updated_by"] = "seed"
            await db.implant_catalog.insert_one(stub)
    logging.info("implant_catalog seeded (Ankylos C/X + Osstem TS III curated; stubs ensured).")



def _detect_case_phase(proc: dict) -> int:
    """Detect the current phase of the procedure based on status."""
    status = proc.get('status', 'draft')
    phase4_statuses = {'pending_final_delivery', 'final_delivery_approved', 'completed', 'phase4_step2_submitted',
                       'pending_phase4_step1', 'phase4_step1_approved', 'phase4_step1_submitted'}
    phase3_statuses = {'pending_stage2_surgical', 'stage2_surgical_submitted', 'stage2_surgical_approved',
                       'pending_stage2_prosthetic', 'stage2_prosthetic_submitted', 'stage2_prosthetic_approved'}
    phase2_statuses = {'phase2_submitted', 'phase2_approved', 'pending_phase2',
                       'pending_phase2_approval'}
    if status in phase4_statuses or proc.get('phase4_step1_data'):
        return 4
    if status in phase3_statuses or proc.get('phase3_data'):
        return 3
    if status in phase2_statuses or proc.get('phase2_data'):
        return 2
    return 1


def _detect_case_type(proc: dict) -> str:
    """Detect the clinical case type for dynamic summary structuring."""
    ptype = (proc.get('implant_procedure_type') or '').lower()
    plans = proc.get('implant_plans') or []
    has_graft = False
    p2 = proc.get('phase2_data') or {}
    if p2.get('bone_graft_used') or p2.get('bone_graft_details'):
        has_graft = True
    for p in plans:
        if p.get('bone_graft') or 'graft' in str(p.get('procedures', [])).lower():
            has_graft = True

    if 'all-on' in ptype or 'full arch' in ptype.replace('-', ' ') or 'allon' in ptype.replace('-', ''):
        return 'full_arch'
    if 'overdenture' in ptype:
        return 'overdenture'
    if has_graft:
        return 'bone_graft'
    if len(plans) > 1:
        return 'multiple_implant'
    if 'immediate' in str(proc.get('loading_type', [])).lower():
        return 'immediate_loading'
    return 'single_implant'


@api_router.post("/ai/case-summary")
async def ai_case_summary(request: Request, current_user: dict = Depends(get_current_user)):
    """Generate AI clinical case summary — phase-aware, dynamic per case type, ITI/ICOI referenced."""
    if current_user.get("role") in _AI_BLOCKED_ROLES:
        raise HTTPException(status_code=403, detail="AI features not available for this role")
    body = await request.json()
    procedure_id = body.get("procedure_id")

    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)}, {"_id": 0})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")

    current_phase = _detect_case_phase(proc)
    case_type = _detect_case_type(proc)
    context = _build_case_context(proc)

    # ---------- Build phase-specific section instructions ----------
    phase1_sections = """
**Phase 1 — Diagnostic & Treatment Planning**
A. Patient Information & Chief Complaint
B. Procedure Type & Treatment Rationale (type of implant procedure, arch, loading protocol selected and why)
C. Clinical Examination Findings (ridge contour, soft tissue thickness, keratinized mucosa, occlusocervical height, mesiodistal space)
D. Occlusal Analysis (scheme, parafunction, opposing dentition, vertical dimension / restorative space)
E. Aesthetic Risk Assessment (smile line, gingival biotype, SAC classification)
F. Medical Assessment & ASA Classification (medical conditions affecting treatment, risk level)
G. Implant Selection & Planning (for each planned site: tooth number, implant brand/system/dimensions, bone dimensions, bone type, implant-to-bone safety margins, bone density classification)"""

    phase2_sections = """
**Phase 2 — Implant Surgery & Outcomes**
H. Surgical Approach (anesthesia, flap design, drilling protocol)
I. Implant Placement & Primary Stability (insertion torque values per implant, thresholds for the selected loading protocol)
J. Bone Augmentation (if performed: type, material, rationale)
K. Prosthetic Components & Closure (healing abutments, sutures, post-operative instructions)"""

    phase3_sections = """
**Phase 3 — Second Stage Surgery & Healing**
L. Osseointegration Assessment (ISQ values, clinical assessment of integration)
M. Healing Abutment Placement (heights, soft tissue management)"""

    phase4_sections = """
**Phase 4 — Prosthetic Rehabilitation**
N. Final Prosthetic Plan (type, material selection rationale)
O. Impression & Abutment (impression type, custom/stock abutment, prosthetic material)
P. Treatment Outcome (overall assessment, prognosis)"""

    sections_to_include = phase1_sections
    if current_phase >= 2:
        sections_to_include += phase2_sections
    if current_phase >= 3:
        sections_to_include += phase3_sections
    if current_phase >= 4:
        sections_to_include += phase4_sections

    # ---------- Case-type adaptive instruction ----------
    case_type_instruction = ""
    if case_type == 'full_arch':
        case_type_instruction = "This is a full-arch rehabilitation case. Emphasize biomechanical considerations of implant distribution, cantilever management, and material selection for full-arch prostheses."
    elif case_type == 'overdenture':
        case_type_instruction = "This is an implant-retained overdenture case. Discuss attachment system rationale, residual ridge preservation, and retention mechanism."
    elif case_type == 'bone_graft':
        case_type_instruction = "This case involves bone augmentation. Detail the grafting rationale, material choice, and expected timeline for graft maturation."
    elif case_type == 'multiple_implant':
        case_type_instruction = "This involves multiple implant sites. Discuss inter-implant spacing, load distribution, and splinting considerations."
    elif case_type == 'immediate_loading':
        case_type_instruction = "This case uses an immediate loading protocol. Discuss criteria for immediate loading (minimum insertion torque, ISQ thresholds, occlusal considerations)."
    else:
        case_type_instruction = "This is a single-implant case. Discuss site-specific anatomy, implant-to-adjacent-tooth distance, and platform considerations."

    prompt = f"""You are a senior implantologist and prosthodontist generating a clinical case summary for a dental implant case currently at Phase {current_phase}.

IMPORTANT GUIDELINES:
- Base your reasoning on established scientific literature, standard implantology textbooks, and recognized consensus guidelines — but DO NOT cite or name any specific references, organizations, journals, or guideline names in the output.
- Write in professional scientific clinical language.
- Generate a DYNAMIC summary tailored to this specific case — do not produce a generic template.
- Write section headings as plain uppercase text (no bold, no asterisks).
- DE-IDENTIFIED OUTPUT: never state the patient's name, age, or profession. Refer to them only as "the patient".
{case_type_instruction}

Case Data:
{context}

Current Phase: {current_phase} of 4
Case Type: {case_type.replace('_',' ').title()}

Generate the summary covering ONLY the following sections (as the case is currently at Phase {current_phase}):
{sections_to_include}

FORMAT INSTRUCTIONS:
- NEVER use markdown — no asterisks (no **bold**, no *italics*), no hashes, no backticks. Output plain text only.
- Use the section letters and titles as plain uppercase headings (e.g., "A. PATIENT INFORMATION & CHIEF COMPLAINT")
- Under each heading, write 2-4 sentences with specific clinical details from the case data
- Do NOT mention or cite any specific guidelines, organizations, textbooks, or journal references in the text
- Skip any section where no relevant data is available, but note it briefly as "Data pending for this phase"
- Make the summary clinically meaningful and specific to THIS patient — avoid boilerplate language"""

    # iter-243: feedback loop — fold the most recent (ai_text → edited_text)
    # pairs from `ai_summary_feedback` into the prompt as voice/style
    # examples. The model learns the rewrites our clinicians prefer
    # (tone, sentence length, terminology) without us shipping a fine-tune.
    fb_examples = await _get_summary_feedback_examples("case_summary", limit=3)
    if fb_examples:
        style_block = "\n\n".join(
            f"--- BEFORE (AI draft) ---\n{ex['ai_text'][:600]}\n--- AFTER (clinician edit) ---\n{ex['edited_text'][:600]}"
            for ex in fb_examples
        )
        prompt += (
            "\n\nVOICE & STYLE EXAMPLES — match the cadence, tone, and clinician phrasing shown in these recent edits "
            "(do NOT copy their content; copy the rewriting style — sentence length, terminology, what they keep vs. cut):\n\n"
            + style_block
        )

    chat = LlmChat(
        api_key=_get_llm_key(),
        session_id=f"summary-{procedure_id}-{uuid.uuid4().hex[:8]}",
        system_message="You are an expert implant dentistry clinical advisor and prosthodontist. You write case summaries using rigorous scientific clinical language grounded in established evidence-based implantology. Never cite, name, or reference any specific guidelines, organizations, textbooks, or journals in your output — present the knowledge as your own professional clinical assessment."
    ).with_model("openai", "gpt-5.2")

    response = await chat.send_message(UserMessage(text=prompt))

    # Strip residual markdown asterisks / underscores — defense-in-depth
    # (matches the stripping already applied in the chat assistant endpoint).
    import re as _re_md_cs
    response = _re_md_cs.sub(r"\*\*(.*?)\*\*", r"\1", response)
    response = _re_md_cs.sub(r"(?<!\w)\*(.+?)\*(?!\w)", r"\1", response)
    response = _re_md_cs.sub(r"(?<!\w)_(.+?)_(?!\w)", r"\1", response)

    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$set": {"ai_case_summary": response, "ai_case_summary_phase": current_phase}}
    )

    return {"summary": response}


@api_router.post("/ai/surgical-notes")
async def ai_surgical_notes(request: Request, current_user: dict = Depends(get_current_user)):
    """Generate AI surgical operative notes from drilling protocol data."""
    if current_user.get("role") in _AI_BLOCKED_ROLES:
        raise HTTPException(status_code=403, detail="AI features not available for this role")
    body = await request.json()
    procedure_id = body.get("procedure_id")
    
    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)}, {"_id": 0})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")
    
    context = _build_case_context(proc)
    phase2 = proc.get("phase2_data") or {}
    
    # Get torque values from correct location
    torques = phase2.get("torque_values") or proc.get("torque_values") or []
    if torques:
        implant_plans_ctx = proc.get("implant_plans") or []
        torque_parts = []
        for i, t in enumerate(torques):
            label = f"Tooth {implant_plans_ctx[i].get('position')}" if i < len(implant_plans_ctx) and implant_plans_ctx[i].get('position') else f"Implant {i+1}"
            torque_parts.append(f"{label}: {t} Ncm")
        torque_str = ', '.join(torque_parts)
    else:
        torque_str = 'N/A'
    
    drill_info = ""
    if phase2.get("drilling_protocol"):
        dp = phase2["drilling_protocol"]
        drill_info = f"Drilling Protocol: {', '.join([s.get('drill','') + ' at ' + str(s.get('speed','')) + ' RPM' for s in dp.get('steps',[])])}"
    
    prompt = f"""You are a senior implant surgeon dictating operative notes. Generate professional surgical operative notes based on the case and protocol data below.

Case Data:
{context}

Surgical Data:
Insertion Torque Values: {torque_str}
Anesthesia: {phase2.get('anesthesia_details','N/A')}
Flap Design: {phase2.get('flap_design','N/A')}
Drilling Type: {phase2.get('drilling_type','N/A')}
{drill_info}
Bone Graft Used: {'Yes — ' + str(phase2.get('bone_graft_details','')) if phase2.get('bone_graft_used') else 'No'}
Prosthetic Component: {phase2.get('prosthetic_component','N/A')}
Sutures: {phase2.get('sutures_placed','N/A')}
Hemostasis Achieved: {'Yes' if phase2.get('hemostasis_achieved') else 'N/A'}

Write a concise operative note (4-6 sentences) in standard surgical documentation format. Include: preparation, osteotomy, implant placement, primary stability (referencing actual torque values), and closure. Professional tone."""

    chat = LlmChat(
        api_key=_get_llm_key(),
        session_id=f"surgical-{procedure_id}-{uuid.uuid4().hex[:8]}",
        system_message="You are an expert implant surgeon generating operative notes."
    ).with_model("openai", "gpt-5.2")
    
    response = await chat.send_message(UserMessage(text=prompt))

    # Strip residual markdown asterisks / underscores — defense-in-depth.
    import re as _re_md_sn
    response = _re_md_sn.sub(r"\*\*(.*?)\*\*", r"\1", response)
    response = _re_md_sn.sub(r"(?<!\w)\*(.+?)\*(?!\w)", r"\1", response)
    response = _re_md_sn.sub(r"(?<!\w)_(.+?)_(?!\w)", r"\1", response)
    
    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$set": {"ai_surgical_notes": response}}
    )
    
    return {"notes": response}


@api_router.patch("/procedures/{procedure_id}/ai-summary")
async def update_ai_summary(procedure_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    """Update an AI-generated summary (case_summary or surgical_notes).
    Any logged-in non-nurse user with case access may edit.
    Edits made by anyone other than the case owner are recorded in edit_log."""
    if current_user.get("role") == "nurse":
        raise HTTPException(status_code=403, detail="Read-only access")

    body = await request.json()
    summary_type = body.get("summary_type")
    content = body.get("content", "")
    if summary_type not in ("case_summary", "surgical_notes"):
        raise HTTPException(status_code=400, detail="Invalid summary_type")
    if not isinstance(content, str):
        raise HTTPException(status_code=400, detail="content must be a string")

    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")

    field_name = "ai_case_summary" if summary_type == "case_summary" else "ai_surgical_notes"
    old_value = proc.get(field_name) or ""
    if old_value == content:
        return {"ok": True, "unchanged": True, field_name: content}

    now_iso = datetime.now(timezone.utc).isoformat()
    editor_name = current_user.get("name") or current_user.get("_id")
    editor_role = current_user.get("role", "")
    editor_id = current_user.get("_id")

    # Owner = case student or original creator. Non-owner edits get logged.
    is_owner = (editor_id == proc.get("student_id")) or (editor_id == proc.get("created_by_id"))

    update_set: dict = {field_name: content, "updated_at": now_iso}
    update_op: dict = {"$set": update_set}
    if not is_owner:
        update_set["last_edited_by"] = editor_name
        update_set["last_edited_at"] = now_iso
        update_op["$push"] = {"edit_log": {
            "field": field_name,
            "old_value": old_value,
            "new_value": content,
            "edited_by": editor_name,
            "edited_by_role": editor_role,
            "edited_at": now_iso,
        }}

    await db.procedures.update_one({"_id": ObjectId(procedure_id)}, update_op)

    # iter-243: feedback loop — capture (original AI text → user-edited text)
    # pairs into `ai_summary_feedback` so we can replay them as few-shot
    # examples on future generations. The AI gradually learns the kinds of
    # rewrites our users prefer (tone, sentence length, terminology).
    try:
        if old_value.strip() and content.strip():
            await db.ai_summary_feedback.insert_one({
                "summary_type": summary_type,
                "procedure_id": procedure_id,
                "ai_text": old_value,
                "edited_text": content,
                "edited_by": editor_name,
                "edited_by_role": editor_role,
                "edited_by_id": str(editor_id) if editor_id else None,
                "is_owner_edit": is_owner,
                "created_at": now_iso,
            })
    except Exception:
        pass

    return {"ok": True, field_name: content}


# ── iter-243: Few-shot retrieval for AI summary generators ──
# Returns the N most recent (ai_text → edited_text) pairs of the given
# summary type so future AI calls can include them as in-context examples
# (a poor-man's RLHF). Capped at 5 to keep the prompt budget under control.
async def _get_summary_feedback_examples(summary_type: str, limit: int = 5) -> list[dict]:
    try:
        cursor = db.ai_summary_feedback.find(
            {"summary_type": summary_type},
            {"_id": 0, "ai_text": 1, "edited_text": 1}
        ).sort("created_at", -1).limit(limit)
        return await cursor.to_list(length=limit)
    except Exception:
        return []


@api_router.get("/ai/summary-feedback-stats")
async def ai_summary_feedback_stats(current_user: dict = Depends(get_current_user)):
    """Admin / in-charge view of how many feedback examples we've accumulated."""
    if current_user.get("role") not in ("administrator", "implant_incharge"):
        raise HTTPException(status_code=403, detail="Not authorised")
    case_count = await db.ai_summary_feedback.count_documents({"summary_type": "case_summary"})
    surg_count = await db.ai_summary_feedback.count_documents({"summary_type": "surgical_notes"})
    return {
        "case_summary_examples": case_count,
        "surgical_notes_examples": surg_count,
        "total": case_count + surg_count,
    }


# ── Full-Arch atrophy classification (silent institutional guidance) ──

# ── Full-Arch atrophy classification (silent institutional guidance) ──
from full_arch_classification import classify_full_arch as _classify_full_arch  # noqa: E402


class AtrophyInputs(BaseModel):
    arch: str  # "maxilla" | "mandible"
    anterior_height: Optional[float] = None
    posterior_height: Optional[float] = None
    anterior_width: Optional[float] = None
    posterior_width: Optional[float] = None
    # Patient context used to highlight the best-fit option for THIS case.
    opposing_arch: Optional[str] = None
    smoking: Optional[str] = None  # "No" | "Light (<10/day)" | "Heavy (>10/day)"
    hba1c: Optional[float] = None


def _build_atrophy_context(
    opposing_arch: Optional[str],
    smoking: Optional[str],
    hba1c: Optional[float],
) -> Dict[str, Any]:
    """Normalise raw form fields into the context shape the classifier reads."""
    ctx: Dict[str, Any] = {}
    if opposing_arch:
        ctx["opposing_arch"] = opposing_arch
    if smoking and "Heavy" in smoking:
        ctx["smoker_heavy"] = True
    if isinstance(hba1c, (int, float)) and hba1c > 0:
        ctx["hba1c"] = float(hba1c)
    return ctx



@api_router.post("/full-arch-classify")
async def full_arch_classify(payload: AtrophyInputs, current_user: dict = Depends(get_current_user)):
    """Classify a full-arch atrophy case and return the recommended therapeutic options.
    Pure pure function — does not write to DB."""
    return _classify_full_arch(
        payload.arch,
        payload.anterior_height,
        payload.posterior_height,
        payload.anterior_width,
        payload.posterior_width,
        context=_build_atrophy_context(payload.opposing_arch, payload.smoking, payload.hba1c),
    )


@api_router.put("/procedures/{procedure_id}/atrophy-assessment")
async def save_atrophy_assessment(procedure_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    """Save per-arch atrophy assessment(s) on a procedure.

    Body: { "maxilla": {anterior_height, posterior_height, anterior_width, posterior_width},
            "mandible": {...} }
    Either or both arches may be provided. Only arches present in the payload are stored.
    """
    if current_user.get("role") == "nurse":
        raise HTTPException(status_code=403, detail="Read-only access")

    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(proc, current_user)

    body = await request.json()
    # Derive patient context once, from the persisted procedure document, so
    # the recommendation reflects the most current opposing-arch + medical
    # assessment values regardless of what the caller sends.
    ma = proc.get("medical_assessment") or {}
    try:
        hba1c_val = float(ma.get("hba1c")) if ma.get("hba1c") not in (None, "") else None
    except (TypeError, ValueError):
        hba1c_val = None
    ctx = _build_atrophy_context(proc.get("opposing_arch"), ma.get("smoking"), hba1c_val)
    out: Dict[str, Any] = {}
    for arch_key in ("maxilla", "mandible"):
        a = body.get(arch_key)
        if not a:
            continue
        result = _classify_full_arch(
            arch_key,
            a.get("anterior_height"),
            a.get("posterior_height"),
            a.get("anterior_width"),
            a.get("posterior_width"),
            context=ctx,
        )
        if result.get("ok"):
            out[arch_key] = result

    if not out:
        raise HTTPException(status_code=400, detail="No valid atrophy data provided")

    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$set": {"atrophy_assessment": out, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "atrophy_assessment": out}


class AIChatMessage(BaseModel):
    procedure_id: str
    message: str


@api_router.post("/ai/chat")
async def ai_chat(body: AIChatMessage, current_user: dict = Depends(get_current_user)):
    """Implanr AI chat — context-aware clinical assistant."""
    if current_user.get("role") in _AI_BLOCKED_ROLES:
        raise HTTPException(status_code=403, detail="AI features not available for this role")
    proc = await db.procedures.find_one({"_id": ObjectId(body.procedure_id)}, {"_id": 0})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")
    
    context = _build_case_context(proc)

    # iter-147: Implant Catalog awareness for the floating Ask Implanr AI bubble.
    # Inject catalog blocks for EVERY distinct (brand, system) used in the case
    # so mixed-brand restorations can be reasoned about side-by-side. Falls back
    # to the no-system directive when no plan resolves to a populated catalog
    # entry.
    catalog_block = ""
    case_has_system = False
    plans = proc.get("implant_plans") or []
    if plans:
        seen_keys: list = []
        for plan in plans:
            cat_key = f"{plan.get('brand','')}|{plan.get('system','')}".strip("|")
            if cat_key and cat_key not in seen_keys:
                seen_keys.append(cat_key)
        # Cap at 4 distinct systems to keep the prompt within budget.
        seen_keys = seen_keys[:4]
        cat_summaries = []
        from implant_catalog_seed import build_ai_context as _build_cat_ctx
        for cat_key in seen_keys:
            cat_doc = await db.implant_catalog.find_one(
                {"key": cat_key, "is_stub": {"$ne": True}}, {"_id": 0}
            )
            if cat_doc:
                summary = _build_cat_ctx(cat_doc)
                if summary:
                    cat_summaries.append(summary)
                    case_has_system = True
        if cat_summaries:
            joined = "\n\n".join(cat_summaries)
            catalog_block = (
                f"\n\nVerified component specifications for the implant system(s) used in this case "
                f"(quote only values listed below; never invent SKUs, diameters, gingival heights, "
                f"angulations, materials, or retention modes). {len(cat_summaries)} system(s); each "
                f"is delimited by '===' headers:\n\n{joined}"
            )
    no_system_directive = "" if case_has_system else (
        "\n\nNote: The implant system chosen for this case does not yet have verified component "
        "specifications on file. If the user asks about specific component availability "
        "(angulations, gingival heights, multi-unit abutment options, retention modes, etc.), "
        "reply with exactly: \"Information is not available.\" Do NOT fabricate values."
    )

    # Retrieve chat history
    chat_history = proc.get("ai_chat_history") or []
    
    system = f"""You are Implanr AI, a precise prosthodontic clinical assistant. You have access to the following patient case data:

{context}{catalog_block}

OUTPUT RULES (strict):
1. Reply in plain text. NEVER use markdown asterisks (no **bold**, no *italics*), no hashes, no backticks.
2. NEVER use the words 'catalog', 'catalogue', 'database', 'uploaded', 'provided data', 'records', or 'JSON'. Speak as a clinician.
3. When asked about a specific component (healing abutment, cover screw, multi-unit abutment, ti-base, temporary cylinder, final abutment), output structured plain-text:

   Specification of <Component> — <Brand> <System>
   Diameter (mm): <values>
   Gingival height (mm): <values>
   Angulation (deg): <values>
   Material: <values>
   Retention: <values>
   Indication: <text>

   Omit any line whose value is not on file. Use exact values, not ranges.
4. For comparative questions, reply in 2–4 short numbered points, one system per line, with exact figures.
5. If a specific value is not on file for the asked system or component, reply with exactly this sentence and nothing else:

   Information is not available.

6. Be concise (2–4 sentences for non-component questions). Reference standard prosthodontic literature (Misch, ITI consensus, Branemark protocol) for clinical interpretation, but specifications must be exact.{no_system_directive}"""

    # Build history context for the prompt
    history_context = ""
    for msg in chat_history[-10:]:
        role_label = "User" if msg["role"] == "user" else "Implanr AI"
        history_context += f"\n{role_label}: {msg['content']}"

    prompt = body.message
    if history_context:
        prompt = f"Previous conversation:{history_context}\n\nUser: {body.message}\n\nRespond to the latest user message."

    chat = LlmChat(
        api_key=_get_llm_key(),
        session_id=f"chat-{body.procedure_id}-{uuid.uuid4().hex[:8]}",
        system_message=system
    ).with_model("openai", "gpt-5.2")
    
    response = await chat.send_message(UserMessage(text=prompt))
    
    # Append to history
    chat_history.append({"role": "user", "content": body.message})
    chat_history.append({"role": "assistant", "content": response})
    
    await db.procedures.update_one(
        {"_id": ObjectId(body.procedure_id)},
        {"$set": {"ai_chat_history": chat_history}}
    )
    
    return {"response": response, "history": chat_history}


@api_router.get("/ai/chat/{procedure_id}")
async def get_ai_chat_history(procedure_id: str, current_user: dict = Depends(get_current_user)):
    """Get chat history for a procedure."""
    if current_user.get("role") in _AI_BLOCKED_ROLES:
        raise HTTPException(status_code=403, detail="AI features not available for this role")
    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)}, {"_id": 0, "ai_chat_history": 1})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")
    return {"history": proc.get("ai_chat_history") or []}


# ── Smart Prosthetic Planner ───────────────────────────────────────────────
FULL_ARCH_SET = {"All on 4", "All on 6", "All on X"}
ANTERIOR_TEETH = {11, 12, 13, 21, 22, 23}

def _generate_smart_planner_report(procedure: dict) -> dict:
    proc_type = procedure.get("implant_procedure_type", "")
    is_full_arch = proc_type in FULL_ARCH_SET
    implant_plans = procedure.get("implant_plans", [])
    risk_score = procedure.get("medical_risk_score", "")
    p3 = procedure.get("phase3_data") or {}

    modules = []

    if is_full_arch:
        # ── FULL ARCH PATH ──
        arch = procedure.get("arch", "") or ""
        interarch_raw = procedure.get("available_interarch_space", "")
        interarch = 0
        try:
            interarch = float(interarch_raw)
        except (ValueError, TypeError):
            pass

        # Dynamic label based on arch selection
        space_label = "Maxillary Restorative Space" if arch == "Maxillary" else "Mandibular Restorative Space" if arch == "Mandibular" else "Restorative Space"

        # 1. Restorative Space Analysis
        if interarch > 0:
            if interarch < 10:
                severity = "SEVERE"
                interpretation = "Severely limited prosthetic space"
                implications = ["Hybrid prosthesis not feasible", "Consider zirconia monolithic", "Higher fracture risk with thin material"]
            elif interarch <= 12:
                severity = "MODERATE"
                interpretation = "Moderate prosthetic space"
                implications = ["Limited for hybrid prosthesis", "Better suited for zirconia or metal ceramic", "Careful framework design needed"]
            else:
                severity = "ADEQUATE"
                interpretation = "Adequate prosthetic space"
                implications = ["All prosthetic options available", "Hybrid, zirconia, or metal ceramic feasible", "Optimal material thickness achievable"]
            modules.append({
                "id": "interarch_space",
                "title": f"{space_label} Analysis",
                "icon": "resize",
                "severity": severity,
                "data": {"space_mm": interarch, "arch": arch, "interpretation": interpretation, "implications": implications}
            })

        # 2. Material Compatibility — per-prosthesis feasibility based on Available Interarch Space
        if interarch > 0:
            prosthesis_types = [
                {"name": "Fixed Prosthesis", "min_feasible": 8, "min_marginal": 6},
                {"name": "Overdentures with Individual Attachments", "min_feasible": 12, "min_marginal": 10},
                {"name": "Overdenture with Bar Attachments", "min_feasible": 14, "min_marginal": 12},
                {"name": "Hybrid Prosthesis with Metal Framework and Acrylic", "min_feasible": 15, "min_marginal": 12},
                {"name": "Zirconia Hybrid Prosthesis", "min_feasible": 12, "min_marginal": 9},
            ]
            suitable = []
            limited = []
            not_feasible = []
            for pt in prosthesis_types:
                label = f"{pt['name']} (requires \u2265{pt['min_feasible']}mm)"
                if interarch >= pt["min_feasible"]:
                    suitable.append(label)
                elif interarch >= pt["min_marginal"]:
                    limited.append(label)
                else:
                    not_feasible.append(label)
            modules.append({
                "id": "material_compatibility",
                "title": "Material Compatibility",
                "icon": "layers",
                "data": {"suitable": suitable, "limited": limited, "not_feasible": not_feasible}
            })

        # 3. Biomechanical Interpretation
        bio_warnings = []
        if interarch > 12:
            bio_warnings.append("Increased crown height leads to higher leverage")
            bio_warnings.append("Greater risk of screw loosening")
            bio_warnings.append("Consider cross-arch splinting for stability")
        else:
            bio_warnings.append("Reduced crown height limits leverage risk")
            bio_warnings.append("Favorable biomechanical profile")
        modules.append({
            "id": "biomechanics",
            "title": "Biomechanical Interpretation",
            "icon": "fitness",
            "data": {"warnings": bio_warnings}
        })

        # 4. Opposing arch consideration
        opposing = procedure.get("opposing_arch", "")
        if opposing:
            opp_notes = []
            if opposing == "Natural Dentition":
                opp_notes = ["Higher occlusal forces expected", "Consider metal-occlusal surface for durability", "Mutually protected occlusion recommended"]
            elif opposing == "Fixed Implant Prosthesis":
                opp_notes = ["Bilateral implant-supported — careful occlusal equilibration", "Risk of excessive force transmission", "Regular occlusal adjustment recommended"]
            elif opposing == "Removable Prosthesis":
                opp_notes = ["Lower occlusal forces expected", "Favorable for material longevity", "Balanced bilateral occlusion advised"]
            elif opposing == "Edentulous":
                opp_notes = ["Minimal opposing forces", "Consider patient's future prosthetic plans", "Provisional loading protocol appropriate"]
            modules.append({
                "id": "opposing_arch",
                "title": "Opposing Arch Consideration",
                "icon": "git-compare",
                "data": {"opposing_type": opposing, "notes": opp_notes}
            })

        # 5. Hygiene Module (always for full arch)
        modules.append({
            "id": "hygiene",
            "title": "Hygiene Considerations",
            "icon": "water",
            "data": {"recommendations": [
                "Ensure cleansable intaglio surface design",
                "Avoid concave tissue surface contours",
                "Patient education on superfloss / water flosser",
                "Plan for regular professional maintenance visits",
            ]}
        })

    else:
        # ── DENTULOUS PATH ──
        oc_height_raw = procedure.get("occlusocervical_height", "")
        md_space_raw = procedure.get("mesiodistal_space", "")
        oc_height = 0
        md_space = 0
        try:
            oc_height = float(oc_height_raw)
        except (ValueError, TypeError):
            pass
        try:
            md_space = float(md_space_raw)
        except (ValueError, TypeError):
            pass

        # 1. Space Analysis
        space_flags = []
        if oc_height > 0:
            if oc_height < 6:
                space_flags.append({"param": "Occlusocervical Height", "value": f"{oc_height} mm", "status": "CRITICAL", "note": "Limited restorative space — reduced material thickness, higher fracture risk, compromised esthetics"})
            elif oc_height < 8:
                space_flags.append({"param": "Occlusocervical Height", "value": f"{oc_height} mm", "status": "WARNING", "note": "Marginal restorative space — careful material selection needed"})
            else:
                space_flags.append({"param": "Occlusocervical Height", "value": f"{oc_height} mm", "status": "ADEQUATE", "note": "Sufficient restorative space for standard prosthetic options"})
        if md_space > 0:
            if md_space < 5.5:
                space_flags.append({"param": "Mesiodistal Space", "value": f"{md_space} mm", "status": "CRITICAL", "note": "Narrow prosthetic width — consider custom abutment, limited crown contour"})
            elif md_space < 7:
                space_flags.append({"param": "Mesiodistal Space", "value": f"{md_space} mm", "status": "WARNING", "note": "Borderline mesiodistal space — verify contact point feasibility"})
            else:
                space_flags.append({"param": "Mesiodistal Space", "value": f"{md_space} mm", "status": "ADEQUATE", "note": "Adequate space for standard prosthetic contours"})
        if space_flags:
            modules.append({
                "id": "space_analysis",
                "title": "Space Analysis",
                "icon": "resize",
                "data": {"flags": space_flags}
            })

        # 2. Esthetic Module (anterior teeth)
        anterior_implants = []
        for imp in implant_plans:
            pos = imp.get("position", "")
            try:
                pos_num = int(str(pos).strip())
            except (ValueError, TypeError):
                pos_num = 0
            if pos_num in ANTERIOR_TEETH:
                anterior_implants.append(pos)
        if anterior_implants:
            modules.append({
                "id": "esthetic_zone",
                "title": "Esthetic Zone Assessment",
                "icon": "flower",
                "data": {
                    "teeth": anterior_implants,
                    "alerts": [
                        "Emergence profile design is critical",
                        "Tissue symmetry with adjacent teeth required",
                        "Provisional crown recommended for soft tissue conditioning",
                        "Risk: black triangle or recession if poorly managed",
                    ]
                }
            })

        # 3. Retention Guidance
        retention = {
            "preferred": "Screw-retained (better retrievability, no cement complications)",
            "alternative": "Cement-retained (when screw access hole compromises esthetics)",
            "advisory": "Final choice depends on implant angulation — verify clinically"
        }
        modules.append({
            "id": "retention_guidance",
            "title": "Retention Guidance",
            "icon": "link",
            "data": retention
        })

        # 4. Occlusal Considerations
        occlusal_notes = ["Light centric contact on implant crown recommended"]
        has_posterior = any(
            int(str(imp.get("position", 0)).strip() or 0) > 23
            for imp in implant_plans
            if str(imp.get("position", "")).strip().isdigit()
        )
        if has_posterior:
            occlusal_notes.append("Posterior implant — higher occlusal load expected")
            occlusal_notes.append("Avoid lateral (excursive) contacts on implant crown")
        if risk_score and "high" in str(risk_score).lower():
            occlusal_notes.append("High medical risk — minimize occlusal stress")
        occlusal_notes.append("Night guard recommended for parafunctional habits")
        modules.append({
            "id": "occlusion",
            "title": "Occlusal Considerations",
            "icon": "pulse",
            "data": {"notes": occlusal_notes}
        })

    # ISQ-based stability alert
    isq_values = p3.get("isq_value", [])
    if isinstance(isq_values, str):
        isq_values = [isq_values] if isq_values else []
    low_isq = []
    for i, v in enumerate(isq_values):
        try:
            val = float(str(v).strip())
            if val < 60:
                low_isq.append({"implant": i + 1, "value": val})
        except (ValueError, TypeError):
            pass
    if low_isq:
        modules.append({
            "id": "stability_alert",
            "title": "Stability Alert",
            "icon": "warning",
            "data": {
                "low_isq_implants": low_isq,
                "recommendation": "Consider delayed loading protocol for implants with ISQ < 60"
            }
        })

    # General alerts
    alerts = []
    for flag in (modules[0].get("data", {}).get("flags", []) if modules and modules[0].get("id") == "space_analysis" else []):
        if flag.get("status") == "CRITICAL":
            alerts.append(f"{flag['param']}: {flag['note']}")
    if anterior_implants if not is_full_arch else False:
        alerts.append("Esthetic zone — high patient expectation management needed")
    if low_isq:
        alerts.append("Low ISQ values detected — delayed loading may be required")

    return {
        "case_type": "full_arch" if is_full_arch else "dentulous",
        "procedure_type": proc_type,
        "modules": modules,
        "alerts": alerts,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@api_router.post("/procedures/{procedure_id}/smart-planner")
async def generate_smart_planner(
    procedure_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Generate Pre-Prosthetic Insights report after Phase 3 approval."""
    procedure = await db.procedures.find_one(
        {"_id": ObjectId(procedure_id)}, {"_id": 0}
    )
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)

    valid_statuses = {"stage2_surgical_approved", "pending_stage2_prosthetic", "completed"}
    if procedure.get("status") not in valid_statuses:
        raise HTTPException(status_code=400, detail="Smart Planner is available only after Phase 3 approval")

    report = _generate_smart_planner_report(procedure)

    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$set": {"smart_planner_report": report}}
    )

    return report


@api_router.get("/procedures/{procedure_id}/smart-planner")
async def get_smart_planner(
    procedure_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Retrieve existing Smart Planner report."""
    procedure = await db.procedures.find_one(
        {"_id": ObjectId(procedure_id)}, {"_id": 0, "smart_planner_report": 1, "student_id": 1, "supervisor_id": 1, "created_by_id": 1}
    )
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)
    report = procedure.get("smart_planner_report")
    if not report:
        raise HTTPException(status_code=404, detail="Smart Planner report not yet generated")
    return report



@api_router.post("/procedures/{procedure_id}/case-report")
async def generate_case_report(
    procedure_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Generate a comprehensive Case Report PDF."""
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)
    await log_access(
        action="pdf_export",
        resource_type="case_report",
        resource_id=procedure_id,
        user=current_user,
        request=request,
        extra={"patient_name": procedure.get("patient_name")},
    )

    branding = await _get_procedure_org_branding(procedure)

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)

    def safe(text):
        if not isinstance(text, str):
            text = str(text)
        return text.encode("latin-1", "replace").decode("latin-1")

    def add_section_title(title, r=0, g=51, b=153):
        pdf.set_font("Helvetica", "B", 14)
        pdf.set_text_color(r, g, b)
        pdf.cell(0, 10, safe(title), ln=True)
        pdf.set_draw_color(r, g, b)
        pdf.line(pdf.get_x(), pdf.get_y(), pdf.get_x() + 180, pdf.get_y())
        pdf.ln(4)
        pdf.set_text_color(0, 0, 0)

    def add_field(label, value):
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(60, 7, safe(label + ":"), ln=False)
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(0, 7, safe(str(value) if value else "N/A"), ln=True)

    def add_checklist_section(title, checklist_data):
        if not checklist_data:
            return
        pdf.set_font("Helvetica", "BI", 11)
        pdf.cell(0, 8, safe(title), ln=True)
        items = checklist_data.get("items", [])
        if isinstance(items, list):
            for item in items:
                if isinstance(item, dict):
                    checked = item.get("checked", False)
                    label = item.get("label", item.get("id", ""))
                    marker = "[X]" if checked else "[ ]"
                    pdf.set_font("Helvetica", "", 9)
                    pdf.cell(0, 6, safe(f"  {marker} {label}"), ln=True)
                elif isinstance(item, str):
                    pdf.set_font("Helvetica", "", 9)
                    pdf.cell(0, 6, safe(f"  [X] {item}"), ln=True)
        pdf.ln(3)

    # ── Page 1: Title Page ──────────────────────────────────
    pdf.add_page()
    # Organization letterhead (logo + name) on top of the report.
    pdf.set_y(15)
    _fpdf_org_letterhead(pdf, branding, safe)
    pdf.set_font("Helvetica", "B", 24)
    pdf.set_text_color(0, 51, 153)
    pdf.cell(0, 10, "", ln=True)
    pdf.cell(0, 15, safe("Implant Case Report"), ln=True, align="C")
    pdf.set_font("Helvetica", "", 14)
    pdf.set_text_color(80, 80, 80)
    pdf.ln(10)

    # Case ID
    case_id = procedure.get("badge_case_id", f"IMP{procedure_id[-4:].upper()}")
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(0, 0, 0)
    pdf.cell(0, 12, safe(f"Case ID: {case_id}"), ln=True, align="C")
    pdf.ln(8)

    # Patient & Clinician Summary Box
    pdf.set_fill_color(240, 245, 255)
    pdf.rect(15, pdf.get_y(), 180, 50, "F")
    y_start = pdf.get_y() + 5
    pdf.set_xy(20, y_start)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(80, 7, safe(f"Patient: {procedure.get('patient_name', 'N/A')}"))
    pdf.cell(80, 7, safe(f"Reg: {procedure.get('registration_number', 'N/A')}"), ln=True)
    pdf.set_x(20)
    pdf.cell(80, 7, safe(f"PG Student: {procedure.get('student_name', 'N/A')}"))
    pdf.cell(80, 7, safe(f"Supervisor: {procedure.get('supervisor_name', 'N/A')}"), ln=True)
    pdf.set_x(20)
    pdf.cell(80, 7, safe(f"Implant Incharge: {procedure.get('implant_incharge_name', 'N/A')}"))
    pdf.cell(80, 7, safe(f"Procedure: {procedure.get('implant_procedure_type', 'N/A')}"), ln=True)
    pdf.set_x(20)
    loading = ", ".join(procedure.get("loading_type", [])) or "N/A"
    pdf.cell(80, 7, safe(f"Loading: {loading}"))
    prosthetic = procedure.get("final_prosthetic_plan", "") or procedure.get("prosthetic_plan", "") or "N/A"
    pdf.cell(80, 7, safe(f"Prosthetic Plan: {prosthetic}"), ln=True)
    pdf.set_y(y_start + 55)

    status_text = "COMPLETED" if procedure.get("status") == "completed" else procedure.get("status", "").upper()
    pdf.set_font("Helvetica", "B", 12)
    color = (0, 153, 0) if procedure.get("status") == "completed" else (200, 120, 0)
    pdf.set_text_color(*color)
    pdf.cell(0, 10, safe(f"Status: {status_text}"), ln=True, align="C")
    pdf.set_text_color(0, 0, 0)

    # ── Page 2: Phase 1 banner + Patient & Treatment Details ──────
    pdf.add_page()
    # Phase 1 heading must lead the clinical section per product spec.
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(0, 122, 255)
    pdf.cell(0, 10, safe("Phase 1 - Diagnosis and Treatment Planning"), ln=True, align="L")
    pdf.set_text_color(0, 0, 0)
    pdf.set_draw_color(0, 122, 255)
    pdf.set_line_width(0.5)
    pdf.line(pdf.get_x(), pdf.get_y(), pdf.get_x() + 190, pdf.get_y())
    pdf.ln(4)
    add_section_title("Patient & Treatment Details")
    add_field("Patient Name", procedure.get("patient_name"))
    add_field("Age", f"{procedure.get('age', '')} years" if procedure.get("age") else None)
    add_field("Sex", procedure.get("sex"))
    add_field("Profession", procedure.get("profession"))
    add_field("Mobile Number", procedure.get("mobile_number"))
    add_field("Email", procedure.get("patient_email"))
    add_field("Registration Number", procedure.get("registration_number"))
    if procedure.get("chief_complaint"):
        add_field("Chief Complaint", procedure.get("chief_complaint"))
    add_field("PG Student", procedure.get("student_name"))
    add_field("Supervising Faculty", procedure.get("supervisor_name"))
    add_field("Implant Incharge", procedure.get("implant_incharge_name"))
    add_field("Procedure Date", procedure.get("procedure_date"))
    add_field("Procedure Time", procedure.get("procedure_time"))
    add_field("Receipt Number", procedure.get("receipt_number"))
    add_field("Amount Paid", procedure.get("amount_paid"))
    add_field("Procedure Type", procedure.get("implant_procedure_type"))
    add_field("Number of Implants", procedure.get("num_implants"))
    if (procedure.get("implant_procedure_type") or "") == "Sinus Lift":
        add_field("Type of Sinus Lift", procedure.get("sinus_lift_type"))
        add_field("Bone Graft Material Details", procedure.get("bone_graft_material_details"))
    add_field("Loading Type", ", ".join(procedure.get("loading_type", [])))
    add_field("Prosthetic Plan", prosthetic)
    add_field("Bone Graft Specifications", procedure.get("bone_graft_specifications"))
    add_field("Implant Site", procedure.get("implant_site"))
    pdf.ln(4)

    # ── Clinical Examination ─────────────────────────────────
    has_clinical = any(procedure.get(k) for k in [
        "occlusocervical_height", "mesiodistal_space",
        "edentulous_sites", "edentulous_site", "arch_condition",
        "ridge_contour", "soft_tissue_thickness", "keratinized_mucosa", "periodontal_status",
    ])
    if has_clinical:
        add_section_title("Clinical Examination — Intraoral", 30, 136, 229)
        if procedure.get("occlusocervical_height") or procedure.get("mesiodistal_space"):
            pdf.set_font("Helvetica", "B", 10)
            pdf.cell(0, 6, "Edentulous Site", new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("Helvetica", "", 10)
            add_field("Occlusocervical Height", f"{procedure.get('occlusocervical_height', '')} mm" if procedure.get("occlusocervical_height") else None)
            add_field("Mesiodistal Space", f"{procedure.get('mesiodistal_space', '')} mm" if procedure.get("mesiodistal_space") else None)
        sites = procedure.get("edentulous_sites", [])
        if sites:
            add_field("Edentulous Sites", ", ".join(str(s) for s in sites))
        elif procedure.get("edentulous_site"):
            add_field("Edentulous Site", procedure.get("edentulous_site"))
        arch_val = procedure.get("arch", "")
        if arch_val:
            add_field("Arch", arch_val)
        arch_cond_label = f"{arch_val} Arch Condition" if arch_val in ("Maxillary", "Mandibular") else "Arch Condition"
        add_field(arch_cond_label, procedure.get("arch_condition"))
        add_field("Ridge Contour", procedure.get("ridge_contour"))
        add_field("Soft Tissue Thickness", procedure.get("soft_tissue_thickness"))
        add_field("Keratinized Mucosa", procedure.get("keratinized_mucosa"))
        add_field("Periodontal Status", procedure.get("periodontal_status"))
        teeth = procedure.get("teeth_present") or []
        missing = procedure.get("missing_teeth") or []
        if teeth:
            add_field("Teeth Present", ", ".join(sorted(teeth, key=lambda x: int(x) if x.isdigit() else 0)))
        if missing:
            add_field("Missing Teeth", ", ".join(sorted(missing, key=lambda x: int(x) if x.isdigit() else 0)))
        pdf.ln(3)

    # ── Occlusal Analysis ────────────────────────────────────
    has_occlusal = any(procedure.get(k) for k in [
        "occlusal_scheme", "parafunction_habit", "vertical_dimension",
        "vertical_dimension_mm", "available_interarch_space", "opposing_arch",
        "opposing_dentition", "tmj",
    ])
    if has_occlusal:
        add_section_title("Occlusal Analysis", 123, 31, 162)
        if procedure.get("available_interarch_space"):
            arch_val_oc = procedure.get("arch", "")
            space_pdf_label = f"{arch_val_oc} Restorative Space" if arch_val_oc in ("Maxillary", "Mandibular") else "Available Interarch Space"
            add_field(space_pdf_label, f"{procedure.get('available_interarch_space')} mm")
        if procedure.get("opposing_arch"):
            add_field("Opposing Arch", procedure.get("opposing_arch"))
        add_field("Occlusal Scheme", procedure.get("occlusal_scheme"))
        add_field("Parafunctional Habits", procedure.get("parafunction_habit"))
        add_field("Vertical Dimension", procedure.get("vertical_dimension"))
        if procedure.get("vertical_dimension_mm"):
            add_field("Vertical Dimension (mm)", procedure.get("vertical_dimension_mm"))
        add_field("Opposing Dentition", procedure.get("opposing_dentition"))
        add_field("TMJ Assessment", procedure.get("tmj"))
        pdf.ln(3)

    # ── Aesthetic Risk Assessment ────────────────────────────
    has_aesthetic = any(procedure.get(k) for k in ["smile_line", "gingival_biotype"])
    if has_aesthetic:
        add_section_title("Aesthetic Risk Assessment", 233, 30, 99)
        add_field("Smile Line", procedure.get("smile_line"))
        add_field("Gingival Biotype", procedure.get("gingival_biotype"))
        pdf.ln(3)

    # ── Medical Assessment ───────────────────────────────────
    med = procedure.get("medical_assessment")
    # iter-314/315: lab values captured in Phase 1 form; rendered in their own
    # block below risk factors. Skip here so colour-coding doesn't fire on them.
    LAB_KEYS = {"hba1c", "hb", "tlc", "bleeding_time", "clotting_time", "prothrombin_time", "inr"}
    if isinstance(med, dict) and med:
        risk = procedure.get("medical_risk_level", "")
        title = f"Medical Assessment — {risk}" if risk else "Medical Assessment"
        add_section_title(title, 211, 47, 47)
        risk_label_map = {
            "Uncontrolled": ("High", (244, 67, 54)),
            "Heavy (>10/day)": ("High", (244, 67, 54)),
            "Controlled": ("Moderate", (255, 152, 0)),
            "Light (<10/day)": ("Moderate", (255, 152, 0)),
        }
        for key, value in med.items():
            if key in LAB_KEYS:
                continue
            label = key.replace("_", " ").title()
            pdf.set_font("Helvetica", "B", 10)
            pdf.cell(60, 7, safe(label + ":"), ln=False)
            val_str = str(value) if value else "N/A"
            is_no = val_str == "No"
            # Determine color based on granular value
            if is_no:
                color = (76, 175, 80)  # green
            elif val_str in risk_label_map:
                _, color = risk_label_map[val_str]
            elif val_str == "Yes" and key in ("osteoporosis", "radiation"):
                color = (244, 67, 54)  # red - high risk
            elif val_str == "Yes":
                color = (255, 152, 0)  # orange - moderate
            else:
                color = (0, 0, 0)
            pdf.set_font("Helvetica", "B", 10)
            pdf.set_text_color(*color)
            pdf.cell(0, 7, safe(val_str), ln=True)
            pdf.set_text_color(0, 0, 0)

        # ── Haematology Examination + HbA1c (Phase 1 lab values) ─────
        lab_rows = [
            ("hba1c",            "HbA1c",                              "%"),
            ("hb",               "Haemoglobin (Hb)",                   "g/dL"),
            ("tlc",              "Total Leucocyte Count",              "/cumm"),
            ("bleeding_time",    "Bleeding Time",                      "min"),
            ("clotting_time",    "Clotting Time",                      "min"),
            ("prothrombin_time", "Prothrombin Time",                   "sec"),
            ("inr",              "International Normalised Ratio",     ""),
        ]
        present_labs = [(k, lbl, unit) for (k, lbl, unit) in lab_rows
                        if med.get(k) not in (None, "", "N/A")]
        if present_labs:
            pdf.ln(2)
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_text_color(30, 58, 95)
            pdf.cell(0, 7, safe("Haematology Examination"), ln=True)
            pdf.set_text_color(0, 0, 0)
            for key, label, unit in present_labs:
                raw = med.get(key)
                color = (0, 0, 0)
                try:
                    n = float(str(raw).strip())
                    if key == "hba1c" and n >= 9:
                        color = (244, 67, 54)
                    elif key == "hba1c" and n > 7:
                        color = (255, 152, 0)
                    elif key == "tlc" and (n < 4000 or n > 10000):
                        color = (244, 67, 54)
                    elif key == "prothrombin_time" and (n < 11 or n > 16):
                        color = (244, 67, 54)
                    elif key == "inr" and n > 1.5:
                        color = (244, 67, 54)
                    elif key == "hb" and n < 10:
                        color = (244, 67, 54)
                except (ValueError, TypeError):
                    pass
                pdf.set_font("Helvetica", "B", 10)
                pdf.cell(60, 7, safe(label + ":"), ln=False)
                pdf.set_text_color(*color)
                val_str = f"{raw} {unit}".strip()
                pdf.cell(0, 7, safe(val_str), ln=True)
                pdf.set_text_color(0, 0, 0)
        pdf.ln(3)

    # ── Implant Planning Section ─────────────────────────────
    implant_plans = procedure.get("implant_plans", [])
    if implant_plans:
        add_section_title("Implant Planning", 0, 102, 204)
        add_field("Number of Implants", len(implant_plans))
        pdf.ln(2)
        for i, imp in enumerate(implant_plans):
            pdf.set_font("Helvetica", "B", 10)
            pdf.set_fill_color(230, 240, 255)
            pdf.cell(0, 7, safe(f"  Implant {i+1} - Tooth {imp.get('position', '?')}"), ln=True, fill=True)
            pdf.set_font("Helvetica", "", 9)
            pdf.cell(0, 6, safe(f"    System: {imp.get('brand', '')} - {imp.get('system', '')}"), ln=True)
            pdf.cell(0, 6, safe(f"    Diameter: {imp.get('diameter', '')}mm | Length: {imp.get('length', '')}mm"), ln=True)
            if imp.get("bone_width"):
                pdf.cell(0, 6, safe(f"    Bone: {imp.get('bone_width')}mm W x {imp.get('bone_height', '')}mm H | Type: {imp.get('bone_type', '')}"), ln=True)
            if imp.get("risk_level"):
                pdf.cell(0, 6, safe(f"    Risk: {imp.get('risk_level')} (Score: {imp.get('risk_score', '')})"), ln=True)
            pdf.ln(2)

    # ── Phase 1: Diagnosis and Treatment Planning ─────────────
    pdf.add_page()
    add_section_title("Phase 1 - Diagnosis and Treatment Planning", 0, 122, 255)
    checklist = procedure.get("checklist", {})
    if isinstance(checklist, dict):
        add_checklist_section("Pre-Surgical Checklist", checklist.get("pre_surgical"))
    # ── Phase 1 default-prosthesis suggestion (3-unit bridge) ──
    bridge_design = procedure.get("bridge_design")
    if bridge_design:
        add_field("Default Prosthesis Plan", bridge_design)
        if procedure.get("bridge_material"):
            add_field("Bridge Material", procedure["bridge_material"])
        impl = procedure.get("bridge_implants") or []
        pont = procedure.get("bridge_pontics") or []
        if impl:
            add_field("Bridge Implants", ", ".join(map(str, impl)))
        if pont:
            add_field("Bridge Pontics", ", ".join(map(str, pont)))
    phase1_date = procedure.get("phase1_completed_at")
    if phase1_date:
        add_field("Phase 1 Completed", phase1_date.isoformat() if isinstance(phase1_date, datetime) else str(phase1_date))
    # iter-248: include Phase 1 approval comments (when present) in the
    # case-report PDF, mirroring the Phase 2 supervisor/incharge remarks.
    if procedure.get("phase1_supervisor_notes"):
        add_field("Supervisor Comment", procedure.get("phase1_supervisor_notes"))
    if procedure.get("phase1_incharge_notes"):
        add_field("Implant In-Charge Comment", procedure.get("phase1_incharge_notes"))

    # ── Phase 2: Implant Surgery ──────────────────────────────
    add_section_title("Phase 2 - Implant Surgery", 255, 107, 53)
    p2 = procedure.get("phase2_data", {})
    if isinstance(p2, dict) and p2:
        pre_surg = p2.get("pre_surgery_checklist", {})
        if pre_surg:
            pdf.set_font("Helvetica", "BI", 11)
            pdf.cell(0, 8, safe("Pre-Surgery Checklist"), ln=True)
            for k, v in pre_surg.items():
                marker = "[X]" if v else "[ ]"
                pdf.set_font("Helvetica", "", 9)
                pdf.cell(0, 6, safe(f"  {marker} {k.replace('_', ' ').title()}"), ln=True)
            pdf.ln(3)
        if p2.get("anesthesia_adequate"):
            add_field("Anaesthesia Adequate", p2["anesthesia_adequate"])
        if p2.get("anesthesia_details"):
            add_field("Anaesthesia Notes", p2["anesthesia_details"])
        if p2.get("flap_design"):
            add_field("Incision / Flap Design", p2["flap_design"])
        if p2.get("drilling_type"):
            add_field("Drilling Type", p2["drilling_type"])
        if p2.get("implant_seated_correctly") is not None:
            add_field("Implant Seated Correctly", "Yes" if p2["implant_seated_correctly"] else "No")
        if p2.get("implant_seated_comment"):
            add_field("Seating Notes", p2["implant_seated_comment"])
        tv = p2.get("torque_values", [])
        if tv:
            pdf.set_font("Helvetica", "B", 10)
            pdf.cell(0, 7, safe("Torque Values (Ncm):"), ln=True)
            pdf.set_font("Helvetica", "", 9)
            for i, t in enumerate(tv):
                label = f"Tooth {implant_plans[i].get('position', '')}" if i < len(implant_plans) and implant_plans[i].get('position') else f"Implant {i+1}"
                pdf.cell(0, 6, safe(f"  {label}: {t} Ncm"), ln=True)
            pdf.ln(2)
        if p2.get("implant_other_notes"):
            add_field("Other Implant Notes", p2["implant_other_notes"])
        if p2.get("prosthetic_component"):
            add_field("Prosthetic Component", p2["prosthetic_component"])
        # Prosthesis Type appears only on Immediate Loading cases per product spec.
        if p2.get("prosthesis_type"):
            pt = p2["prosthesis_type"]
            if pt == "Other" and p2.get("prosthesis_type_other"):
                pt = f"Other — {p2['prosthesis_type_other']}"
            add_field("Prosthesis Type", pt)
        if p2.get("healing_abutment_cuff_height"):
            hch = p2["healing_abutment_cuff_height"]
            if isinstance(hch, list):
                add_field("Healing Abutment Cuff Height", ", ".join([f"{v} mm" for v in hch if v]))
            else:
                add_field("Healing Abutment Cuff Height", f"{hch} mm")
        # iter-139: Multi-unit Abutment (full-arch Immediate Loading cases)
        mua_placed = p2.get("multi_unit_abutment_placed")
        if mua_placed in ("yes", "no"):
            add_field("Multi-unit Abutment Placed", "Yes" if mua_placed == "yes" else "No")
            mua_details = p2.get("multi_unit_abutment_details") or []
            if mua_placed == "yes" and isinstance(mua_details, list) and mua_details:
                pdf.set_font("Helvetica", "BI", 11)
                pdf.cell(0, 8, safe("Multi-unit Abutment Details"), ln=True)
                pdf.set_font("Helvetica", "", 9)
                for row in mua_details:
                    if not isinstance(row, dict):
                        continue
                    tooth = row.get("tooth", "")
                    ang = row.get("angulation", "")
                    cuff = row.get("cuff_height", "")
                    ang_s = f"{ang}°" if str(ang).strip() != "" else "—"
                    cuff_s = f"{cuff} mm" if str(cuff).strip() != "" else "—"
                    pdf.cell(0, 6, safe(f"  Tooth {tooth}:  Angulation {ang_s}   Cuff Height {cuff_s}"), ln=True)
                pdf.ln(2)
        if p2.get("sutures_placed") is not None:
            add_field("Sutures Placed", "Yes" if p2["sutures_placed"] else "No")
        if p2.get("hemostasis_achieved") is not None:
            add_field("Hemostasis Achieved", "Yes" if p2["hemostasis_achieved"] else "No")
        post_op = p2.get("post_op_checklist", {})
        if post_op:
            pdf.set_font("Helvetica", "BI", 11)
            pdf.cell(0, 8, safe("Post-Operative Checklist"), ln=True)
            for k, v in post_op.items():
                marker = "[X]" if v else "[ ]"
                pdf.set_font("Helvetica", "", 9)
                pdf.cell(0, 6, safe(f"  {marker} {k.replace('_', ' ').title()}"), ln=True)
            pdf.ln(3)
    else:
        checklist_s = (procedure.get("checklist") or {}).get("surgical")
        if checklist_s:
            add_checklist_section("Surgical Checklist", checklist_s)
        torque = procedure.get("torque_values", [])
        if torque:
            pdf.set_font("Helvetica", "B", 10)
            pdf.cell(0, 7, safe("Torque Values (Ncm):"), ln=True)
            pdf.set_font("Helvetica", "", 9)
            for i, tv in enumerate(torque):
                label = f"Tooth {implant_plans[i].get('position', '')}" if i < len(implant_plans) and implant_plans[i].get('position') else f"Implant {i+1}"
                pdf.cell(0, 6, safe(f"  {label}: {tv} Ncm"), ln=True)
            pdf.ln(2)
    # Bone Graft and Membrane
    p2 = procedure.get("phase2_data", {})
    if isinstance(p2, dict) and p2.get("bone_graft_used"):
        add_field("Bone Graft & Membrane", "Yes")
        if p2.get("bone_graft_details"):
            add_field("Bone Graft Details", p2["bone_graft_details"])
    elif isinstance(p2, dict) and p2.get("bone_graft_used") is not None:
        add_field("Bone Graft & Membrane", "No")
    if procedure.get("phase2_remark") or procedure.get("phase2_student_notes"):
        add_field("Post-Surgical Notes", procedure.get("phase2_student_notes") or procedure.get("phase2_remark"))
    if procedure.get("phase2_supervisor_notes"):
        add_field("Supervisor Remarks", procedure.get("phase2_supervisor_notes"))
    if procedure.get("phase2_incharge_notes"):
        add_field("Incharge Remarks", procedure.get("phase2_incharge_notes"))
    phase2_date = procedure.get("phase2_completed_at")
    if phase2_date:
        add_field("Phase 2 Completed", phase2_date.isoformat() if isinstance(phase2_date, datetime) else str(phase2_date))

    # ── Phase 3: Second Stage ────────────────────────────────
    pdf.add_page()
    add_section_title("Phase 3 - Healing and Second Stage Surgery", 33, 150, 243)
    # Phase 2 carry-over context (per product spec, Phase 3 displays the
    # Immediate Prosthesis Done / Healing Abutment Placed summary inherited
    # from Phase 2).
    p2_ctx = procedure.get("phase2_data", {}) or {}
    pc = p2_ctx.get("prosthetic_component")
    if pc == "Immediate Loading Done":
        pt = p2_ctx.get("prosthesis_type") or ""
        if pt == "Other" and p2_ctx.get("prosthesis_type_other"):
            pt = f"Other - {p2_ctx['prosthesis_type_other']}"
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(27, 94, 32)
        pdf.cell(0, 7, safe("Immediate Prosthesis Done"), ln=True)
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(0, 0, 0)
        pdf.cell(0, 6, safe(f"  {pt or '-'}"), ln=True)
        pdf.ln(2)
    elif pc == "Healing Abutment Placed":
        hch = p2_ctx.get("healing_abutment_cuff_height")
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(13, 71, 161)
        pdf.cell(0, 7, safe("Healing Abutment Placed"), ln=True)
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(0, 0, 0)
        if isinstance(hch, list):
            plans = procedure.get("implant_plans") or []
            for i, v in enumerate(hch):
                label = plans[i].get("position") if i < len(plans) and isinstance(plans[i], dict) else None
                prefix = f"Tooth #{label}" if label else f"Implant {i+1}"
                pdf.cell(0, 6, safe(f"  {prefix}: {v or '-'} mm"), ln=True)
        elif hch:
            pdf.cell(0, 6, safe(f"  {hch} mm"), ln=True)
        pdf.ln(2)
    p3 = procedure.get("phase3_data", {})
    if isinstance(p3, dict) and p3:
        chk = p3.get("checklist_items", {})
        if chk:
            pdf.set_font("Helvetica", "BI", 11)
            pdf.cell(0, 8, safe("Phase 3 Checklist"), ln=True)
            for k, v in chk.items():
                marker = "[X]" if v else "[ ]"
                pdf.set_font("Helvetica", "", 9)
                pdf.cell(0, 6, safe(f"  {marker} {k.replace('_', ' ').title()}"), ln=True)
            pdf.ln(3)
        if p3.get("isq_value"):
            add_field("ISQ Value", p3["isq_value"])
        if p3.get("healing_abutment_height"):
            add_field("Healing Abutment Height", f"{p3['healing_abutment_height']} mm")
    else:
        checklist_ss = (procedure.get("checklist") or {}).get("second_stage")
        if checklist_ss:
            add_checklist_section("Second Stage Checklist", checklist_ss)
    if procedure.get("stage2_surgical_remark") or procedure.get("phase3_student_notes"):
        add_field("Student Notes", procedure.get("phase3_student_notes") or procedure.get("stage2_surgical_remark"))
    if procedure.get("phase3_supervisor_notes"):
        add_field("Supervisor Remarks", procedure.get("phase3_supervisor_notes"))
    if procedure.get("phase3_incharge_notes"):
        add_field("Incharge Remarks", procedure.get("phase3_incharge_notes"))
    phase3_date = procedure.get("stage2_surgical_completed_at")
    if phase3_date:
        add_field("Phase 3 Completed", phase3_date.isoformat() if isinstance(phase3_date, datetime) else str(phase3_date))

    # ── Phase 4: Prosthetic ──────────────────────────────────
    add_section_title("Phase 4 - Prosthetic Rehabilitation", 156, 39, 176)
    p4s1 = procedure.get("phase4_step1_data", {})
    if isinstance(p4s1, dict) and p4s1:
        pdf.set_font("Helvetica", "BI", 11)
        pdf.cell(0, 8, safe("Step 1 — Prosthetic Plan & Impressions"), ln=True)
        if p4s1.get("final_prosthetic_plan"):
            add_field("Final Prosthetic Plan", p4s1["final_prosthetic_plan"])
        if p4s1.get("prosthetic_material"):
            add_field("Prosthetic Material", p4s1["prosthetic_material"])
        if p4s1.get("custom_abutment"):
            add_field("Custom Abutment", p4s1["custom_abutment"])
        if p4s1.get("overdenture_attachment"):
            add_field("Overdenture Attachment", p4s1["overdenture_attachment"])
        if p4s1.get("impression_type"):
            imp_type = "Intraoral Scans" if p4s1["impression_type"] == "intraoral_scans" else "Conventional Impressions"
            tray = p4s1.get("conventional_tray_type")
            if p4s1["impression_type"] == "conventional" and tray:
                tray_label = "Open Tray" if tray == "open_tray" else "Closed Tray"
                imp_type = f"{imp_type} ({tray_label})"
            add_field("Impression Type", imp_type)
            # iter-192: impression material (conventional only)
            mat = p4s1.get("impression_material")
            if p4s1["impression_type"] == "conventional" and mat:
                mat_label = {
                    "polyether": "Polyether",
                    "heavy_light_body": "Heavy and Light body",
                    "putty_light_body": "Putty and Light body",
                }.get(mat, mat)
                add_field("Impression Material", mat_label)
        if p4s1.get("payment_complete") is not None:
            add_field("Payment Complete", "Yes" if p4s1["payment_complete"] else "No")
        if p4s1.get("components_available") is not None:
            add_field("Components Available", "Yes" if p4s1["components_available"] else "No")
        pdf.ln(3)
    else:
        checklist_sp = (procedure.get("checklist") or {}).get("prosthetic_phase")
        if checklist_sp:
            add_checklist_section("Prosthetic Checklist", checklist_sp)
    if procedure.get("final_prosthetic_plan"):
        add_field("Final Prosthetic Plan", procedure.get("final_prosthetic_plan"))
    if procedure.get("stage2_prosthetic_remark") or procedure.get("phase4_step1_student_notes"):
        add_field("Student Remark (Step 1)", procedure.get("phase4_step1_student_notes") or procedure.get("stage2_prosthetic_remark"))
    if procedure.get("phase4_step1_supervisor_notes"):
        add_field("Supervisor Remarks (Step 1)", procedure.get("phase4_step1_supervisor_notes"))
    if procedure.get("phase4_step1_incharge_notes"):
        add_field("Incharge Remarks (Step 1)", procedure.get("phase4_step1_incharge_notes"))
    if procedure.get("stage2_prosthetic_faculty_remark"):
        add_field("Faculty Remark (Step 1)", procedure.get("stage2_prosthetic_faculty_remark"))
    if procedure.get("stage2_prosthetic_incharge_remark"):
        add_field("Incharge Remark (Step 1)", procedure.get("stage2_prosthetic_incharge_remark"))

    p4s2 = procedure.get("phase4_step2_data", {})
    if isinstance(p4s2, dict) and p4s2:
        pdf.set_font("Helvetica", "BI", 11)
        pdf.cell(0, 8, safe("Step 2 — Trial & Delivery"), ln=True)
        trial_chk = p4s2.get("trial_checklist", {})
        if trial_chk:
            for k, v in trial_chk.items():
                marker = "[X]" if v else "[ ]"
                pdf.set_font("Helvetica", "", 9)
                pdf.cell(0, 6, safe(f"  {marker} {k.replace('_', ' ').title()}"), ln=True)
            pdf.ln(2)
        if p4s2.get("confirmation_statement") is not None:
            status_txt = "Treatment Confirmed Complete" if p4s2["confirmation_statement"] else "Not Confirmed"
            add_field("Confirmation", status_txt)
    if procedure.get("phase4_step2_student_notes"):
        add_field("Student Notes (Step 2)", procedure.get("phase4_step2_student_notes"))
    if procedure.get("phase4_step2_supervisor_notes"):
        add_field("Supervisor Remarks (Step 2)", procedure.get("phase4_step2_supervisor_notes"))
    if procedure.get("phase4_step2_incharge_notes"):
        add_field("Incharge Remarks (Step 2)", procedure.get("phase4_step2_incharge_notes"))

    phase4_date = procedure.get("treatment_completed_at")
    if phase4_date:
        add_field("Treatment Completed", phase4_date.isoformat() if isinstance(phase4_date, datetime) else str(phase4_date))

    # ── AI-Generated Summaries (editable; included verbatim in PDF) ─────
    ai_clinical = (procedure.get("ai_case_summary") or "").strip()
    ai_surgical = (procedure.get("ai_surgical_notes") or "").strip()
    if ai_clinical or ai_surgical:
        pdf.add_page()
        if ai_clinical:
            add_section_title("AI Clinical Summary", 63, 81, 181)
            pdf.set_font("Helvetica", "", 10)
            pdf.multi_cell(0, 6, safe(ai_clinical))
            pdf.ln(6)
        if ai_surgical:
            add_section_title("AI Surgical Summary", 63, 81, 181)
            pdf.set_font("Helvetica", "", 10)
            pdf.multi_cell(0, 6, safe(ai_surgical))
            pdf.ln(6)

    # ── Final Page: Faculty Remarks & Confirmation ───────────
    pdf.add_page()
    add_section_title("Summary & Confirmation", 0, 100, 0)
    pdf.set_font("Helvetica", "", 11)
    pdf.multi_cell(0, 7, safe(
        "This is to confirm that the above-mentioned post-graduate student has "
        "satisfactorily completed the implant case as per the Department of Prosthodontics "
        "Standard Operating Protocol. All four phases of the treatment protocol have been "
        "reviewed and approved by the supervising faculty and implant incharge."
    ))
    pdf.ln(10)

    # ── Digital Sign-Off block (auto-stamped on completion) ─────────
    def _fmt_dt(v):
        if not v: return ""
        if isinstance(v, datetime):
            return v.strftime("%B %d, %Y · %H:%M UTC")
        return str(v)

    sup_at = _fmt_dt(procedure.get("supervisor_final_delivery_approved_at"))
    inc_at = _fmt_dt(procedure.get("implant_incharge_final_delivery_approved_at"))
    sup_note = (procedure.get("phase4_step2_supervisor_notes") or "").strip()
    inc_note = (procedure.get("phase4_step2_incharge_notes") or "").strip()

    blocks = [
        ("PG Student", procedure.get("student_name", ""), "", ""),
        ("Supervising Faculty", procedure.get("supervisor_name", ""), sup_at, sup_note),
        ("Implant Incharge", procedure.get("implant_incharge_name", ""), inc_at, inc_note),
    ]

    for title, name, stamp, note in blocks:
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(60, 6, safe(f"{title}:"), ln=False)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(0, 6, safe(name or "—"), ln=True)
        if stamp:
            pdf.set_font("Helvetica", "I", 9)
            pdf.set_text_color(85, 139, 47)
            pdf.cell(60, 5, safe(""), ln=False)
            pdf.cell(0, 5, safe(f"Approved: {stamp}"), ln=True)
            pdf.set_text_color(0, 0, 0)
        if note:
            pdf.set_font("Helvetica", "I", 9)
            pdf.set_text_color(70, 70, 70)
            pdf.cell(60, 5, safe(""), ln=False)
            pdf.multi_cell(0, 5, safe(f'"{note}"'))
            pdf.set_text_color(0, 0, 0)
        pdf.ln(6)

    # Treatment-completed date footer
    pdf.set_font("Helvetica", "", 10)
    completed_str = ""
    if procedure.get("treatment_completed_at"):
        d = procedure["treatment_completed_at"]
        completed_str = d.strftime("%B %d, %Y") if isinstance(d, datetime) else str(d)
    pdf.cell(0, 6, safe(f"Treatment Completed: {completed_str}"), ln=True)

    pdf.ln(2)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(124, 179, 66)
    pdf.multi_cell(0, 4, safe("Auto-stamped on case completion. Subsequent edits are recorded in the case audit log."))
    pdf.set_text_color(0, 0, 0)

    buf = io.BytesIO()
    pdf.output(buf)
    buf.seek(0)

    report_name = f"CaseReport_{case_id}_{procedure.get('patient_name', 'patient').replace(' ', '_')}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{report_name}"'},
    )

# ── Pre-Op Briefing PDF (iter-329) ───────────────────────────────────
# Lay-language briefing handed to the patient at scheduling for Sinus
# Lift cases. 2-page A4, generated on-demand. Open to the case owner
# (student), the supervising consultant, the implant in-charge and the
# nurse so any of them can print and hand it over at the chair.
@api_router.post("/procedures/{procedure_id}/preop-briefing")
async def generate_preop_briefing(
    procedure_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Generate the Sinus Lift Pre-Op Briefing PDF for the patient."""
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)
    if (procedure.get("implant_procedure_type") or "") != "Sinus Lift":
        raise HTTPException(
            status_code=400,
            detail="Pre-Op Briefing is only available for Sinus Lift procedures.",
        )
    await log_access(
        action="pdf_export",
        resource_type="preop_briefing",
        resource_id=procedure_id,
        user=current_user,
        request=request,
        extra={"patient_name": procedure.get("patient_name")},
    )

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.set_margins(left=15, top=15, right=15)

    def safe(t):
        if t is None:
            return ""
        if not isinstance(t, str):
            t = str(t)
        return t.encode("latin-1", "replace").decode("latin-1")

    BLUE = (13, 71, 161)         # primary heading
    DARK = (33, 33, 33)
    GREY = (96, 109, 117)
    GREEN = (46, 125, 50)
    RED = (198, 40, 40)

    def h1(txt):
        pdf.set_font("Helvetica", "B", 16)
        pdf.set_text_color(*BLUE)
        pdf.multi_cell(0, 8, safe(txt))
        pdf.ln(1)
        pdf.set_text_color(*DARK)

    def h2(txt):
        pdf.set_font("Helvetica", "B", 12)
        pdf.set_text_color(*BLUE)
        pdf.multi_cell(0, 7, safe(txt))
        pdf.set_draw_color(*BLUE)
        y = pdf.get_y()
        pdf.line(15, y, 195, y)
        pdf.ln(3)
        pdf.set_text_color(*DARK)

    def para(txt, size=10):
        pdf.set_font("Helvetica", "", size)
        pdf.set_text_color(*DARK)
        pdf.multi_cell(0, 5.5, safe(txt))
        pdf.ln(1)

    def bullet(txt, marker="-", colour=DARK, size=10):
        # Reset to left margin so the next bullet doesn't inherit any
        # x-cursor drift from a prior cell/multi_cell.
        pdf.set_x(15)
        pdf.set_font("Helvetica", "B", size)
        pdf.set_text_color(*colour)
        pdf.cell(8, 5.5, safe(marker))
        pdf.set_font("Helvetica", "", size)
        pdf.set_text_color(*DARK)
        # Explicit width so multi_cell never gets squeezed when an
        # earlier element left x mid-page. Inner width 180 - marker 8 = 172.
        pdf.multi_cell(172, 5.5, safe(txt))
        pdf.set_text_color(*DARK)
        pdf.set_x(15)

    def kv_row(label, value):
        # Reset to left margin to avoid x-cursor drift from a preceding
        # multi_cell call (fpdf2 leaves x where the previous call ended).
        pdf.set_x(15)
        y0 = pdf.get_y()
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*GREY)
        pdf.cell(55, 6, safe(label), border=0)
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(*DARK)
        # Explicit width = page_inner_width (180) - label column (55) = 125
        pdf.multi_cell(125, 6, safe(value if value not in (None, "") else "-"))
        # Make sure the next row starts at left margin, just below the
        # taller of the two cells in this row.
        pdf.set_x(15)

    def footer_note():
        pdf.set_y(-15)
        pdf.set_font("Helvetica", "I", 8)
        pdf.set_text_color(*GREY)
        pdf.cell(0, 5, safe(
            "Informational only - does not replace personal medical advice. "
            "Generated by Implanr - Prosthodontics Implant Manager."
        ), align="C")
        pdf.set_text_color(*DARK)

    # ── Page 1 ────────────────────────────────────────────────
    pdf.add_page()
    # Organization letterhead (logo + name) on top of the briefing.
    _fpdf_org_letterhead(pdf, await _get_procedure_org_branding(procedure), safe)
    h1("Sinus Lift Surgery - Pre-Operative Briefing")
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(*GREY)
    from datetime import datetime as _dt
    pdf.cell(0, 5, safe(f"Prepared on {_dt.utcnow().strftime('%d %b %Y')}    |    Confidential health information"))
    pdf.ln(6)

    # Appointment at a glance card
    h2("Your appointment at a glance")
    sites = ", ".join(procedure.get("missing_teeth") or []) or procedure.get("edentulous_site") or "-"
    kv_row("Patient name", procedure.get("patient_name"))
    age_sex = []
    if procedure.get("age"): age_sex.append(f"{procedure.get('age')} years")
    if procedure.get("sex"): age_sex.append(procedure.get("sex"))
    kv_row("Age / Sex", ", ".join(age_sex) if age_sex else None)
    kv_row("Scheduled procedure", "Sinus Lift + Implant placement")
    kv_row("Type of sinus lift", procedure.get("sinus_lift_type"))
    kv_row("Tooth / teeth area", f"{sites}  (your upper back teeth)")
    kv_row("Number of implants planned", procedure.get("num_implants"))
    kv_row("Bone graft material", procedure.get("bone_graft_material_details"))
    kv_row("Procedure date & time", f"{procedure.get('procedure_date','-')} at {procedure.get('procedure_time','-')}")
    kv_row("Your surgeon", procedure.get("student_name"))
    kv_row("Supervising consultant", procedure.get("supervisor_name"))
    kv_row("Implant specialist", procedure.get("implant_incharge_name"))
    pdf.ln(2)

    # What is a sinus lift
    h2("What is a Sinus Lift, in plain words?")
    para(
        "Your upper back teeth sit very close to a hollow air space inside your cheekbones called the "
        "maxillary sinus. When a tooth is lost, the bone underneath that sinus shrinks over time. If we "
        "placed an implant there directly, it would be too short and unstable."
    )
    para(
        "A 'sinus lift' is a small, well-established surgery where we gently raise the floor of that sinus "
        "and pack in a special bone-building material. Over a few months, your body turns this material "
        "into solid bone - strong enough to hold an implant for the rest of your life."
    )

    # Direct vs Indirect — only the chosen one renders
    h2("Your chosen approach")
    if (procedure.get("sinus_lift_type") or "").startswith("Direct"):
        para(
            "Direct Sinus Lift: your surgeon will make a tiny window on the side of your cheekbone "
            "(under the gum - no visible scar). Through this window, the sinus floor is lifted and the "
            "bone graft is placed. We use this approach when the existing bone is thin (less than about 5 mm)."
        )
    elif (procedure.get("sinus_lift_type") or "").startswith("Indirect"):
        para(
            "Indirect Sinus Lift: your surgeon will lift the sinus floor through the same hole used to "
            "place the implant - no separate window is needed. This is a gentler approach used when "
            "there is already a moderate amount of bone (about 5 - 8 mm)."
        )
    else:
        para("Your surgeon will discuss the exact approach with you on the day of surgery.")

    # Before the procedure checklist
    h2("Before the procedure")
    bullet("Have a normal meal about 2 hours before the appointment - you will be awake under local anaesthesia.", marker="OK", colour=GREEN)
    bullet("Take all your usual medicines unless your doctor specifically asked you to stop one.", marker="OK", colour=GREEN)
    bullet("Bring someone to drive you home if you are nervous or sedated.", marker="OK", colour=GREEN)
    bullet("Brush and rinse your mouth as usual on the morning of surgery.", marker="OK", colour=GREEN)
    bullet("Do not smoke for 24 hours before surgery - smoking significantly increases the risk of graft failure.", marker="X", colour=RED)
    bullet("Avoid alcohol the night before.", marker="X", colour=RED)
    bullet("If you have a cold, blocked nose or sinus infection, call us to reschedule - we cannot operate near an infected sinus.", marker="!", colour=RED)
    footer_note()

    # ── Page 2 ────────────────────────────────────────────────
    pdf.add_page()
    h2("What to expect during the procedure")
    bullet("Duration: about 60 to 90 minutes.", marker="-")
    bullet("You will be awake but completely numb (local anaesthesia).", marker="-")
    bullet("You will feel pressure, not pain.", marker="-")
    bullet("You may hear tapping or gentle drilling sounds - this is normal.", marker="-")
    bullet("Your surgeon will explain each step as it happens.", marker="-")
    pdf.ln(1)

    h2("After the procedure - Recovery")
    pdf.set_font("Helvetica", "B", 10); pdf.cell(0, 5.5, safe("The first 48 hours"), ln=True)
    bullet("Bite gently on the gauze for 30 minutes; mild oozing is normal for a few hours.", marker="-")
    bullet("Ice pack on the cheek (20 minutes on, 20 minutes off) for the first day reduces swelling.", marker="-")
    bullet("Take all prescribed medicines (antibiotic + painkiller) on time.", marker="-")
    pdf.ln(1)
    pdf.set_font("Helvetica", "B", 10); pdf.cell(0, 5.5, safe("For the first 2 weeks - sinus precautions"), ln=True)
    bullet("Do not blow your nose - open your mouth if you need to sneeze.", marker="X", colour=RED)
    bullet("No straws, no smoking, no heavy lifting or strenuous exercise.", marker="X", colour=RED)
    bullet("No air travel.", marker="X", colour=RED)
    bullet("No swimming or diving.", marker="X", colour=RED)
    bullet("Eat soft, lukewarm foods (curd, dal, soups, mashed rice, soft fruit). Avoid the surgical side.", marker="OK", colour=GREEN)
    bullet("Sleep with your head slightly elevated for the first 3 nights.", marker="OK", colour=GREEN)
    bullet("Rinse very gently with the prescribed mouthwash after meals.", marker="OK", colour=GREEN)
    pdf.ln(1)

    h2("Healing timeline")
    bullet("Week 1 to 2 - initial healing; stitches removed at the 7 to 10 day review.", marker="-")
    bullet("Month 2 - soft tissue fully healed.", marker="-")
    bullet("Month 4 to 6 - bone graft matures.", marker="-")
    bullet("Around month 6 - implant integration check; prosthesis (crown / bridge) is planned.", marker="-")
    bullet("Month 8 to 9 - your new tooth or teeth are delivered.", marker="-")

    h2("When to call us urgently")
    pdf.set_font("Helvetica", "", 10)
    para("Contact your surgeon or the clinic immediately if you experience any of the following:")
    bullet("Heavy bleeding that does not stop after 2 hours of firm pressure.", marker="!", colour=RED)
    bullet("Severe swelling 3+ days after surgery (some early swelling is normal).", marker="!", colour=RED)
    bullet("Fever above 38.5 degrees C (101.3 F).", marker="!", colour=RED)
    bullet("A salty or foul-tasting discharge from the nose.", marker="!", colour=RED)
    bullet("Air leaking from the surgical site when you blow or sip.", marker="!", colour=RED)
    bullet("Pain that is not controlled by your prescribed medication.", marker="!", colour=RED)
    pdf.ln(1)
    pdf.set_font("Helvetica", "B", 10)
    surgeon = procedure.get("student_name") or "Your surgeon"
    supervisor = procedure.get("supervisor_name") or "the supervising consultant"
    para(f"Primary contact: {surgeon}.   Backup: {supervisor}.")

    h2("Cost & next steps")
    kv_row("Today's scheduling deposit", f"Rs. {procedure.get('amount_paid','-')}")
    kv_row("Receipt number", procedure.get("receipt_number"))
    para(
        "Final treatment plan and total cost will be reviewed at your next visit. "
        "Please bring this document to every follow-up appointment."
    )

    footer_note()

    # Stream
    buf = io.BytesIO()
    pdf.output(buf)
    buf.seek(0)
    fname = f"PreOp_SinusLift_{(procedure.get('patient_name') or 'Patient').replace(' ', '_')}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )



# ── Photo Step Definitions API ───────────────────────────────────────
@api_router.get("/photo-steps/{phase}")
async def get_photo_steps(phase: int, current_user: dict = Depends(get_current_user)):
    """Return photo step definitions for a given phase (1-4)."""
    if phase not in PHOTO_STEPS:
        raise HTTPException(status_code=400, detail=f"Invalid phase: {phase}. Must be 1-4.")
    return PHOTO_STEPS[phase]


@api_router.get("/photo-steps")
async def get_all_photo_steps(current_user: dict = Depends(get_current_user)):
    """Return all photo step definitions for all phases."""
    return PHOTO_STEPS


# ── Photo Upload / Management ────────────────────────────────────────
PHOTO_UPLOADS_DIR = ROOT_DIR / 'uploads' / 'photos'
PHOTO_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
PHOTO_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.heif', '.heic'}
MAX_PHOTO_SIZE = 15 * 1024 * 1024  # 15MB per photo


@api_router.post("/procedures/{procedure_id}/photos/{step_id}")
async def upload_photo(
    procedure_id: str,
    step_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a photo for a specific step in a procedure."""
    if current_user["role"] != "student":
        raise HTTPException(status_code=403, detail="Only students can upload photos")

    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)
    if procedure["student_id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    # Validate step_id exists in any phase
    valid_ids = set()
    for phase_data in PHOTO_STEPS.values():
        for step in phase_data["steps"]:
            valid_ids.add(step["id"])
    if step_id not in valid_ids:
        raise HTTPException(status_code=400, detail=f"Invalid step_id: {step_id}")

    ext = Path(file.filename).suffix.lower()
    if ext not in PHOTO_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type not allowed. Allowed: {', '.join(PHOTO_EXTENSIONS)}")

    contents = await file.read()
    if len(contents) > MAX_PHOTO_SIZE:
        raise HTTPException(status_code=400, detail="Photo exceeds 15MB limit")

    unique_name = f"{procedure_id}_{step_id}_{uuid.uuid4().hex[:8]}{ext}"
    file_path = PHOTO_UPLOADS_DIR / unique_name
    with open(file_path, "wb") as f:
        f.write(contents)
    import mimetypes as _mt_10951
    await _s3_put_async(file_path, content_type=_mt_10951.guess_type(str(file_path))[0])

    # Store in procedure's photos subdocument
    photo_record = {
        "step_id": step_id,
        "filename": unique_name,
        "original_name": file.filename,
        "content_type": file.content_type,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "uploaded_by": current_user["_id"],
    }

    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {
            "$push": {f"photos.{step_id}": photo_record},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()},
        },
    )

    return {"message": "Photo uploaded", "step_id": step_id, "filename": unique_name}


@api_router.delete("/procedures/{procedure_id}/photos/{step_id}/{filename}")
async def delete_photo(
    procedure_id: str,
    step_id: str,
    filename: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a specific photo."""
    if current_user["role"] != "student":
        raise HTTPException(status_code=403, detail="Only students can delete photos")

    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)
    if procedure["student_id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    # Remove from DB
    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$pull": {f"photos.{step_id}": {"filename": filename}}},
    )

    # Remove file
    file_path = PHOTO_UPLOADS_DIR / filename
    if file_path.exists():
        file_path.unlink()
    await _s3_delete_async(file_path)

    return {"message": "Photo deleted"}


@api_router.get("/procedures/{procedure_id}/photos")
async def get_procedure_photos(
    procedure_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get all photos for a procedure, grouped by step_id."""
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)}, {"_id": 0, "photos": 1, "student_id": 1, "supervisor_id": 1, "created_by_id": 1})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)

    photos = procedure.get("photos", {})

    # Build response with step metadata
    result = {}
    for phase_num, phase_data in PHOTO_STEPS.items():
        phase_photos = []
        for step in phase_data["steps"]:
            step_photos = photos.get(step["id"], [])
            phase_photos.append({
                "step_id": step["id"],
                "label": step["label"],
                "category": step["category"],
                "caption": ALBUM_CAPTIONS.get(step["id"], step["label"]),
                "photos": step_photos,
                "has_photo": len(step_photos) > 0,
            })
        result[str(phase_num)] = {
            "name": phase_data["name"],
            "steps": phase_photos,
            "total": len(phase_photos),
            "completed": sum(1 for s in phase_photos if s["has_photo"]),
        }

    return result


@api_router.get("/implantlens/cases")
async def get_implantlens_cases(current_user: dict = Depends(get_current_user)):
    """Get all cases with photo completion stats for ImplantLens album view."""
    if current_user.get("role") in _AI_BLOCKED_ROLES:
        raise HTTPException(status_code=403, detail="ImplantLens not available for this role")
    query = {}
    if current_user["role"] == "student":
        query["student_id"] = current_user["_id"]
    elif current_user["role"] == "supervisor":
        query["$or"] = [
            {"supervisor_id": current_user["_id"]},
            {"created_by_id": current_user["_id"]},
        ]
    # admin/implant_incharge see all

    total_steps = sum(len(phase["steps"]) for phase in PHOTO_STEPS.values())

    cursor = db.procedures.find(query, {"_id": 1, "patient_name": 1, "student_name": 1, "status": 1, "photos": 1, "implant_procedure_type": 1, "created_at": 1, "procedure_date": 1}).sort("created_at", -1)
    cases = []
    async for proc in cursor:
        photos = proc.get("photos", {})
        uploaded_count = sum(1 for step_id, step_photos in photos.items() if isinstance(step_photos, list) and len(step_photos) > 0)

        # Collect missing steps
        uploaded_step_ids = set(step_id for step_id, step_photos in photos.items() if isinstance(step_photos, list) and len(step_photos) > 0)
        missing = []
        for phase_num, phase_data in PHOTO_STEPS.items():
            for step in phase_data["steps"]:
                if step["id"] not in uploaded_step_ids:
                    missing.append({"phase": phase_num, "label": step["label"]})

        cases.append({
            "id": str(proc["_id"]),
            "patient_name": proc.get("patient_name", ""),
            "student_name": proc.get("student_name", ""),
            "status": proc.get("status", ""),
            "implant_procedure_type": proc.get("implant_procedure_type", ""),
            "procedure_date": proc.get("procedure_date", ""),
            "photos_uploaded": uploaded_count,
            "photos_total": total_steps,
            "missing_count": len(missing),
            "missing_steps": missing[:5],  # First 5 missing for preview
        })

    return {"cases": cases, "total_steps": total_steps}




@api_router.get("/photos/{filename}")
async def serve_photo(filename: str, current_user: dict = Depends(get_current_user)):
    """Serve a photo file."""
    file_path = PHOTO_UPLOADS_DIR / filename
    if not await _s3_ensure_local_async(file_path):
        raise HTTPException(status_code=404, detail="Photo not found")
    return FileResponse(file_path)


# ── Clinical Case Album PDF Generation ───────────────────────────────
@api_router.post("/procedures/{procedure_id}/generate-album")
async def generate_album(
    procedure_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Generate a Clinical Case Album PDF for a completed procedure."""
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)

    photos = procedure.get("photos", {})
    patient_name = procedure.get("patient_name", "Unknown")
    student_name = procedure.get("student_name", "Unknown")
    reg_number = procedure.get("registration_number", "")
    supervisor_name = procedure.get("supervisor_name", "")
    implant_incharge_name = procedure.get("implant_incharge_name", "")

    def _safe(text):
        """Sanitize text for PDF (replace unicode chars unsupported by Helvetica)."""
        return str(text).replace("\u2013", "-").replace("\u2014", "-").replace("\u2018", "'").replace("\u2019", "'").replace("\u201c", '"').replace("\u201d", '"')

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)

    # Page 1 — Cover
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 24)
    pdf.cell(0, 40, "", ln=True)
    pdf.cell(0, 15, "Clinical Case Album", ln=True, align="C")
    pdf.set_font("Helvetica", "", 14)
    pdf.cell(0, 10, "", ln=True)
    pdf.cell(0, 10, _safe(f"Patient: {patient_name}"), ln=True, align="C")
    pdf.cell(0, 10, _safe(f"Registration: {reg_number}"), ln=True, align="C")
    pdf.cell(0, 10, "", ln=True)
    pdf.cell(0, 10, _safe(f"Post-Graduate Student: {student_name}"), ln=True, align="C")
    pdf.cell(0, 10, _safe(f"Supervising Faculty: {supervisor_name}"), ln=True, align="C")
    pdf.cell(0, 10, _safe(f"Implant In-Charge: {implant_incharge_name}"), ln=True, align="C")
    pdf.cell(0, 10, "", ln=True)
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 10, f"Generated: {datetime.now(timezone.utc).strftime('%B %d, %Y')}", ln=True, align="C")

    # Page 2 — Patient & Treatment Details
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 12, "Patient & Treatment Details", ln=True)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 3, "", ln=True)
    details = [
        ("Patient Name", patient_name),
        ("Registration Number", reg_number),
        ("Implant Site", procedure.get("implant_site", "")),
        ("Implant Region", procedure.get("implant_region", "")),
        ("Implant Company", procedure.get("implant_company", "")),
        ("Procedure Date", procedure.get("procedure_date", "")),
    ]
    for label, value in details:
        if value:
            pdf.cell(60, 8, _safe(f"{label}:"), ln=False)
            pdf.cell(0, 8, _safe(str(value)), ln=True)

    # Pages 3-6 — Phase photos
    figure_num = 1
    for phase_num in [1, 2, 3, 4]:
        phase_data = PHOTO_STEPS[phase_num]
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 16)
        pdf.cell(0, 12, _safe(f"Phase {phase_num} - {phase_data['name']}"), ln=True)
        pdf.line(10, pdf.get_y(), 200, pdf.get_y())
        pdf.cell(0, 3, "", ln=True)

        has_photos_in_phase = False
        for step in phase_data["steps"]:
            step_photos = photos.get(step["id"], [])
            if step_photos:
                has_photos_in_phase = True
                for photo_rec in step_photos:
                    photo_path = PHOTO_UPLOADS_DIR / photo_rec["filename"]
                    caption = ALBUM_CAPTIONS.get(step["id"], step["label"])

                    if pdf.get_y() > 220:
                        pdf.add_page()

                    if photo_path.exists():
                        try:
                            pdf.image(str(photo_path), x=10, y=pdf.get_y(), w=80)
                            pdf.set_y(pdf.get_y() + 62)
                        except Exception:
                            pdf.set_font("Helvetica", "I", 10)
                            pdf.cell(0, 8, f"[Image could not be embedded: {photo_rec['filename']}]", ln=True)

                    pdf.set_font("Helvetica", "I", 10)
                    pdf.cell(0, 6, _safe(f"Figure {figure_num} - {caption}"), ln=True)
                    pdf.cell(0, 3, "", ln=True)
                    figure_num += 1

        if not has_photos_in_phase:
            pdf.set_font("Helvetica", "I", 11)
            pdf.cell(0, 10, "No photos uploaded for this phase.", ln=True)

    # Final page — Outcome summary
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 12, "Final Outcome", ln=True)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 3, "", ln=True)
    pdf.cell(0, 8, _safe(f"Case Status: {procedure.get('status', 'In Progress')}"), ln=True)
    pdf.cell(0, 8, _safe(f"Total Figures: {figure_num - 1}"), ln=True)
    pdf.cell(0, 15, "", ln=True)

    # Signatures
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 8, _safe(f"Post-Graduate Student: {student_name}"), ln=True)
    pdf.cell(0, 8, _safe(f"Supervising Faculty: {supervisor_name}"), ln=True)
    pdf.cell(0, 8, _safe(f"Implant In-Charge: {implant_incharge_name}"), ln=True)
    pdf.cell(0, 15, "", ln=True)
    pdf.set_font("Helvetica", "I", 9)
    pdf.cell(0, 6, "This is to confirm that the above post-graduate student satisfactorily completed", ln=True)
    pdf.cell(0, 6, "all work for the above patient under our supervision and guidance.", ln=True)

    buf = io.BytesIO()
    buf.write(pdf.output())
    buf.seek(0)

    album_name = f"CaseAlbum_{patient_name.replace(' ', '_')}_{reg_number}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{album_name}"'},
    )


# Approval Routes
@api_router.post("/procedures/{procedure_id}/approve")
async def approve_procedure(
    procedure_id: str,
    action: ApprovalAction,
    current_user: dict = Depends(get_current_user)
):
    # Students and nurses cannot approve
    if current_user["role"] in ["student", "nurse"]:
        raise HTTPException(status_code=403, detail="Only supervisors and implant incharge can approve procedures")
    
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)
    
    # Check if user is the assigned supervisor or implant incharge for this procedure
    # Assignment-based check (not role-based) allows any faculty to approve when assigned
    is_supervisor = current_user["_id"] == procedure.get("supervisor_id")
    is_implant_incharge = current_user["_id"] == procedure.get("implant_incharge_id")
    
    # Check if the same person is BOTH supervisor AND implant incharge
    same_person_both_roles = procedure["supervisor_id"] == procedure["implant_incharge_id"]
    
    # Check if this case was created by the in-charge (self-approval workflow)
    is_incharge_self_created = procedure.get("created_by_role") in ("implant_incharge", "chief_dentist") and procedure.get("created_by_id") == current_user["_id"]
    
    # Determine which phase we're in
    if procedure["status"] == "pending_phase1":
        # Phase 1: Pre-surgical approval
        if not (is_supervisor or is_implant_incharge or is_incharge_self_created):
            raise HTTPException(status_code=403, detail="Only assigned supervisor or implant incharge can approve")
        
        if action.action == "approve":
            # Mark this approver as having approved
            update_fields = {"updated_at": datetime.utcnow()}

            # iter-248: Save the role-specific approval comment (optional).
            # Mirrors the Phase 2 pattern — supervisor comment + in-charge
            # comment are stored in separate fields so the case detail page
            # can render them with role-specific headings. When the same
            # person holds both roles (`same_person_both_roles`), their
            # single comment is written to BOTH fields so downstream
            # display logic stays uniform. The `is_incharge_self_created`
            # path purposely does NOT touch the supervisor field here so a
            # separate supervisor's earlier comment is not overwritten.
            if action.comment and action.comment.strip():
                cmt = action.comment.strip()
                if same_person_both_roles:
                    update_fields["phase1_supervisor_notes"] = cmt
                    update_fields["phase1_incharge_notes"] = cmt
                else:
                    if is_supervisor:
                        update_fields["phase1_supervisor_notes"] = cmt
                    if is_implant_incharge:
                        update_fields["phase1_incharge_notes"] = cmt

            # iter-228: Helper — when Phase 1 is fully approved on an
            # existing-implant case the status moves directly to the
            # downstream phase chosen at case-creation time. Routine cases
            # land in `phase1_approved` (the student then submits Phase 2).
            def _stamp_phase1_done(fields: dict) -> None:
                target = procedure.get("existing_phase_to_start") if procedure.get("case_origin") == "existing_implants" else None
                now_ts = datetime.utcnow()
                fields["phase1_completed_at"] = now_ts
                if target == "phase3":
                    # Skip Phase 2 (no surgery performed by us) → land in the Phase 3 inbox.
                    fields["status"] = "phase2_approved"
                    fields["current_phase"] = 3
                    fields["phase2_skipped"] = True
                    fields["supervisor_phase2_approved"] = True
                    fields["supervisor_phase2_approved_at"] = now_ts
                    fields["implant_incharge_phase2_approved"] = True
                    fields["implant_incharge_phase2_approved_at"] = now_ts
                    fields["phase2_completed_at"] = now_ts
                elif target == "phase4_step1":
                    # Skip Phase 2 + Phase 3 → land in the Phase 4 Step 1 inbox.
                    fields["status"] = "stage2_surgical_approved"
                    fields["current_phase"] = 4
                    fields["phase2_skipped"] = True
                    fields["phase3_skipped"] = True
                    fields["supervisor_phase2_approved"] = True
                    fields["supervisor_phase2_approved_at"] = now_ts
                    fields["implant_incharge_phase2_approved"] = True
                    fields["implant_incharge_phase2_approved_at"] = now_ts
                    fields["phase2_completed_at"] = now_ts
                    fields["phase3_approved"] = True
                    fields["phase3_completed_at"] = now_ts
                else:
                    fields["status"] = "phase1_approved"

            # In-Charge self-created case: auto-approve both roles at once
            if is_incharge_self_created:
                update_fields["supervisor_phase1_approved"] = True
                update_fields["supervisor_phase1_approved_at"] = datetime.utcnow()
                update_fields["implant_incharge_phase1_approved"] = True
                update_fields["implant_incharge_phase1_approved_at"] = datetime.utcnow()
                _stamp_phase1_done(update_fields)
                
                await db.procedures.update_one(
                    {"_id": ObjectId(procedure_id)},
                    {"$set": update_fields}
                )
                
                updated_procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
                updated_procedure["_id"] = str(updated_procedure["_id"])
                updated_procedure["id"] = updated_procedure["_id"]
                return updated_procedure
            
            # If same person is both supervisor and implant incharge, approve both roles at once
            elif same_person_both_roles and (is_supervisor or is_implant_incharge):
                update_fields["supervisor_phase1_approved"] = True
                update_fields["supervisor_phase1_approved_at"] = datetime.utcnow()
                update_fields["implant_incharge_phase1_approved"] = True
                update_fields["implant_incharge_phase1_approved_at"] = datetime.utcnow()
            else:
                if is_supervisor:
                    update_fields["supervisor_phase1_approved"] = True
                    update_fields["supervisor_phase1_approved_at"] = datetime.utcnow()
                
                if is_implant_incharge:
                    update_fields["implant_incharge_phase1_approved"] = True
                    update_fields["implant_incharge_phase1_approved_at"] = datetime.utcnow()
            
            # Check if BOTH have now approved
            supervisor_approved = procedure.get("supervisor_phase1_approved", False) or is_supervisor or (same_person_both_roles and is_implant_incharge)
            implant_incharge_approved = procedure.get("implant_incharge_phase1_approved", False) or is_implant_incharge or (same_person_both_roles and is_supervisor)
            
            if supervisor_approved and implant_incharge_approved:
                # Both approved - move to Phase 1 Approved (or directly to the
                # next phase for existing-implant cases — see helper above).
                _stamp_phase1_done(update_fields)

                # iter-228: Tailor the student notification to the actual
                # downstream phase the case is moving to.
                if procedure.get("case_origin") == "existing_implants":
                    if procedure.get("existing_phase_to_start") == "phase3":
                        notif_msg = "Phase 1 approved! You can now submit Phase 3 — Healing and Second Stage Surgery."
                        push_body = "Phase 1 approved. You can now start Phase 3."
                    else:
                        notif_msg = "Phase 1 approved! You can now submit Phase 4 Step 1 — Prosthetic Phase."
                        push_body = "Phase 1 approved. You can now start Phase 4 Step 1."
                else:
                    notif_msg = "Phase 1 (Diagnosis and Treatment Planning) approved! You can now submit Phase 2 (Implant Surgery) after completing the procedure."
                    push_body = "Diagnosis and Treatment Planning approved. You can now submit Phase 2."

                # Notify student that Phase 1 is approved (if student exists)
                if procedure.get("student_id"):
                    await db.notifications.insert_one({
                        "user_id": procedure["student_id"],
                        "procedure_id": procedure_id,
                        "message": notif_msg,
                        "type": "approved",
                        "read": False,
                        "created_at": datetime.utcnow()
                    })
                    await send_expo_push_notifications(
                        [procedure["student_id"]],
                        "Phase 1 Approved!",
                        push_body,
                        {"procedure_id": procedure_id, "type": "approved"},
                    )
            else:
                # One approved, waiting for the other
                approver_name = current_user["name"]
                waiting_for = "implant incharge" if supervisor_approved else "supervisor"
                
                # Notify student of partial approval (if student exists)
                if procedure.get("student_id"):
                    await db.notifications.insert_one({
                        "user_id": procedure["student_id"],
                        "procedure_id": procedure_id,
                        "message": f"Phase 1: Approved by {approver_name}. Waiting for {waiting_for} approval.",
                        "type": "approved",
                        "read": False,
                        "created_at": datetime.utcnow()
                    })
            
            await db.procedures.update_one(
                {"_id": ObjectId(procedure_id)},
                {"$set": update_fields}
            )
        else:
            # Reject Phase 1
            rej_type = action.rejection_type or "permanent"
            if rej_type == "reconsider":
                # Soft reject: go back to draft so student can edit and resubmit
                await db.procedures.update_one(
                    {"_id": ObjectId(procedure_id)},
                    {"$set": {
                        "status": "draft",
                        "rejection_reason": action.rejection_reason,
                        "rejection_type": "reconsider",
                        "rejected_by": current_user["name"],
                        "rejected_at": datetime.utcnow(),
                        "rejected_phase": "phase1",
                        "supervisor_phase1_approved": False,
                        "implant_incharge_phase1_approved": False,
                        "updated_at": datetime.utcnow()
                    }}
                )
            else:
                # Permanent reject: case stops here
                await db.procedures.update_one(
                    {"_id": ObjectId(procedure_id)},
                    {"$set": {
                        "status": "permanently_rejected",
                        "rejection_reason": action.rejection_reason,
                        "rejection_type": "permanent",
                        "rejected_by": current_user["name"],
                        "rejected_at": datetime.utcnow(),
                        "rejected_phase": "phase1",
                        "updated_at": datetime.utcnow()
                    }}
                )
            
            await notify_rejection(procedure, procedure_id, "Phase 1", rej_type, action.rejection_reason or "", current_user["name"])
    
    elif procedure["status"] == "pending_phase2":
        # Phase 2: Surgical protocol approval
        if not (is_supervisor or is_implant_incharge or is_incharge_self_created):
            raise HTTPException(status_code=403, detail="Only assigned supervisor or implant incharge can approve")
        
        if action.action == "approve":
            # Mark this approver as having approved Phase 2
            update_fields = {"updated_at": datetime.utcnow()}
            
            # Save approval comment if provided
            if action.comment and action.comment.strip():
                if is_supervisor:
                    update_fields["phase2_supervisor_notes"] = action.comment.strip()
                if is_implant_incharge:
                    update_fields["phase2_incharge_notes"] = action.comment.strip()
            
            # In-Charge self-created case: auto-approve both roles at once
            if is_incharge_self_created:
                update_fields["supervisor_phase2_approved"] = True
                update_fields["supervisor_phase2_approved_at"] = datetime.utcnow()
                update_fields["implant_incharge_phase2_approved"] = True
                update_fields["implant_incharge_phase2_approved_at"] = datetime.utcnow()
                update_fields["status"] = "phase2_approved"
                update_fields["phase2_completed_at"] = datetime.utcnow()
                
                await db.procedures.update_one(
                    {"_id": ObjectId(procedure_id)},
                    {"$set": update_fields}
                )
                
                updated_procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
                updated_procedure["_id"] = str(updated_procedure["_id"])
                updated_procedure["id"] = updated_procedure["_id"]
                return updated_procedure
            
            # If same person is both supervisor and implant incharge, approve both roles at once
            elif same_person_both_roles and (is_supervisor or is_implant_incharge):
                update_fields["supervisor_phase2_approved"] = True
                update_fields["supervisor_phase2_approved_at"] = datetime.utcnow()
                update_fields["implant_incharge_phase2_approved"] = True
                update_fields["implant_incharge_phase2_approved_at"] = datetime.utcnow()
            else:
                if is_supervisor:
                    update_fields["supervisor_phase2_approved"] = True
                    update_fields["supervisor_phase2_approved_at"] = datetime.utcnow()
                
                if is_implant_incharge:
                    update_fields["implant_incharge_phase2_approved"] = True
                    update_fields["implant_incharge_phase2_approved_at"] = datetime.utcnow()
            
            # Check if BOTH have now approved Phase 2
            supervisor_approved = procedure.get("supervisor_phase2_approved", False) or is_supervisor or (same_person_both_roles and is_implant_incharge)
            implant_incharge_approved = procedure.get("implant_incharge_phase2_approved", False) or is_implant_incharge or (same_person_both_roles and is_supervisor)
            
            if supervisor_approved and implant_incharge_approved:
                # Both approved - procedure complete!
                update_fields["status"] = "phase2_approved"
                update_fields["phase2_completed_at"] = datetime.utcnow()
                update_fields["fully_completed_at"] = datetime.utcnow()
                
                # Notify student of completion
                await db.notifications.insert_one({
                    "user_id": procedure["student_id"],
                    "procedure_id": procedure_id,
                    "message": "🎉 Procedure completed! Phase 2 (Surgical) approved by both reviewers.",
                    "type": "approved",
                    "read": False,
                    "created_at": datetime.utcnow()
                })
                # Push notify student of completion
                await send_expo_push_notifications(
                    [procedure["student_id"]],
                    "Procedure Complete!",
                    f"Stage 1 Implant Placement for {procedure['patient_name']} done successfully!",
                    {"procedure_id": procedure_id, "type": "completed"},
                    redact=[procedure['patient_name']],
                )
                
                # Notify both approvers
                await db.notifications.insert_one({
                    "user_id": procedure["supervisor_id"],
                    "procedure_id": procedure_id,
                    "message": f"Procedure for {procedure['patient_name']} fully completed",
                    "type": "approved",
                    "read": False,
                    "created_at": datetime.utcnow()
                })
                
                await db.notifications.insert_one({
                    "user_id": procedure["implant_incharge_id"],
                    "procedure_id": procedure_id,
                    "message": f"Procedure for {procedure['patient_name']} fully completed",
                    "type": "approved",
                    "read": False,
                    "created_at": datetime.utcnow()
                })
            else:
                # One approved, waiting for the other
                approver_name = current_user["name"]
                waiting_for = "implant incharge" if supervisor_approved else "supervisor"
                
                # Notify student of partial approval
                await db.notifications.insert_one({
                    "user_id": procedure["student_id"],
                    "procedure_id": procedure_id,
                    "message": f"Phase 2: Approved by {approver_name}. Waiting for {waiting_for} approval.",
                    "type": "approved",
                    "read": False,
                    "created_at": datetime.utcnow()
                })
            
            await db.procedures.update_one(
                {"_id": ObjectId(procedure_id)},
                {"$set": update_fields}
            )
        else:
            # Reject Phase 2
            rej_type = action.rejection_type or "permanent"
            if rej_type == "reconsider":
                # Soft reject: go back to phase1_approved so student can re-submit Phase 2
                await db.procedures.update_one(
                    {"_id": ObjectId(procedure_id)},
                    {"$set": {
                        "status": "phase1_approved",
                        "phase2_rejection_reason": action.rejection_reason,
                        "phase2_rejection_type": "reconsider",
                        "phase2_rejected_by": current_user["name"],
                        "phase2_rejected_at": datetime.utcnow(),
                        "rejected_phase": "phase2",
                        "supervisor_phase2_approved": False,
                        "implant_incharge_phase2_approved": False,
                        "updated_at": datetime.utcnow()
                    }}
                )
            else:
                # Permanent reject
                await db.procedures.update_one(
                    {"_id": ObjectId(procedure_id)},
                    {"$set": {
                        "status": "permanently_rejected",
                        "phase2_rejection_reason": action.rejection_reason,
                        "phase2_rejection_type": "permanent",
                        "phase2_rejected_by": current_user["name"],
                        "phase2_rejected_at": datetime.utcnow(),
                        "rejected_phase": "phase2",
                        "updated_at": datetime.utcnow()
                    }}
                )
            
            await notify_rejection(procedure, procedure_id, "Phase 2", rej_type, action.rejection_reason or "", current_user["name"])
    else:
        raise HTTPException(status_code=400, detail="Procedure cannot be approved in current status")
    
    updated_procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    updated_procedure["_id"] = str(updated_procedure["_id"])
    updated_procedure["id"] = updated_procedure["_id"]
    return updated_procedure

# ── Request Phase 1 Approval (Draft → Pending Phase 1) ───────────
@api_router.post("/procedures/{procedure_id}/request-phase1-approval")
async def request_phase1_approval(
    procedure_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Student or Implant In-Charge sends the case for Phase 1 approval after completing implant planning."""
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)

    is_student = current_user["role"] == "student" and procedure.get("student_id") == current_user["_id"]
    is_incharge_creator = current_user["role"] in ("implant_incharge", "administrator") and procedure.get("created_by_id") == current_user["_id"]

    if not (is_student or is_incharge_creator):
        raise HTTPException(status_code=403, detail="Only the case creator can request approval")

    if procedure["status"] != "draft":
        raise HTTPException(status_code=400, detail="Case is not in draft status")

    update_fields = {
        "status": "pending_phase1",
        "phase1_requested_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$set": update_fields},
    )

    if is_student:
        student_name = procedure.get("student_name", "A student")
        patient_name = procedure.get("patient_name", "")
        msg = f"Phase 1 approval requested by {student_name} for patient {patient_name}"

        await db.notifications.insert_one({
            "user_id": procedure["supervisor_id"],
            "procedure_id": procedure_id,
            "message": msg,
            "type": "approval_request",
            "read": False,
            "created_at": datetime.utcnow(),
        })
        await db.notifications.insert_one({
            "user_id": procedure["implant_incharge_id"],
            "procedure_id": procedure_id,
            "message": msg,
            "type": "approval_request",
            "read": False,
            "created_at": datetime.utcnow(),
        })

        push_recipients = list(set([procedure["supervisor_id"], procedure["implant_incharge_id"]]))
        await send_expo_push_notifications(
            push_recipients,
            "Phase 1 Approval Requested",
            msg,
            {"procedure_id": procedure_id, "type": "approval_request"},
            redact=[patient_name],
        )

    updated = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    updated["_id"] = str(updated["_id"])
    updated["id"] = updated["_id"]
    return updated


# Phase 2 Submission Route
@api_router.post("/procedures/{procedure_id}/submit-phase2")
async def submit_phase2(
    procedure_id: str,
    phase2_data: Phase2Submit,
    current_user: dict = Depends(get_current_user)
):
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)
    
    # Check if user has permission to submit Phase 2
    is_student = current_user["role"] == "student" and procedure.get("student_id") == current_user["_id"]
    is_supervisor = current_user["role"] == "supervisor" and procedure.get("supervisor_id") == current_user["_id"]
    is_incharge = current_user["role"] == "implant_incharge"
    is_creator = procedure.get("created_by_id") == current_user["_id"]
    
    if not (is_student or is_supervisor or is_incharge or is_creator):
        raise HTTPException(status_code=403, detail="You don't have permission to submit Phase 2 for this procedure")
    
    # Check if Phase 1 is approved
    if procedure["status"] != "phase1_approved":
        raise HTTPException(status_code=400, detail="Phase 1 must be approved before submitting Phase 2")
    
    # iter-189: Pre-Surgical Checklist must be completed first
    if not procedure.get("phase2_preop_completed_at"):
        raise HTTPException(
            status_code=400,
            detail="Pre-Surgical Checklist must be completed before recording surgical findings."
        )
    
    # Gate: Patient Consent Form MUST be on file before Phase 2 can be submitted.
    if not procedure.get("patient_consent_form"):
        raise HTTPException(
            status_code=400,
            detail="Patient Consent Form is required before starting Phase 2. Please upload the consent form first."
        )
    
    # Build the update data
    existing_checklist = procedure.get("checklist") or {}
    
    # Store full Phase 2 surgical data
    phase2_surgical_data = {
        "pre_surgery_checklist": phase2_data.pre_surgery_checklist or {},
        "anesthesia_adequate": phase2_data.anesthesia_adequate,
        "anesthesia_details": phase2_data.anesthesia_details,
        "flap_design": phase2_data.flap_design,
        "drilling_type": phase2_data.drilling_type,
        "implant_seated_correctly": phase2_data.implant_seated_correctly,
        "implant_seated_comment": phase2_data.implant_seated_comment,
        "torque_values": phase2_data.torque_values or [],
        "bone_graft_used": phase2_data.bone_graft_used or False,
        "bone_graft_details": phase2_data.bone_graft_details,
        "implant_other_notes": phase2_data.implant_other_notes,
        "prosthetic_component": phase2_data.prosthetic_component,
        "prosthesis_type": phase2_data.prosthesis_type,
        "prosthesis_type_other": phase2_data.prosthesis_type_other,
        "healing_abutment_cuff_height": phase2_data.healing_abutment_cuff_height,
        "sutures_placed": phase2_data.sutures_placed,
        "hemostasis_achieved": phase2_data.hemostasis_achieved,
        "iopa_files": phase2_data.iopa_files or [],
        "opg_file": phase2_data.opg_file,
        "post_op_checklist": phase2_data.post_op_checklist or {},
        # iter-139: persist MUA capture + per-implant access-channel openings.
        "access_channel_openings": phase2_data.access_channel_openings,
        "multi_unit_abutment_placed": phase2_data.multi_unit_abutment_placed,
        "multi_unit_abutment_details": phase2_data.multi_unit_abutment_details,
    }
    
    # Merge surgical checklist if provided (legacy support)
    new_checklist = {**existing_checklist}
    if phase2_data.checklist_surgical:
        new_checklist["surgical"] = phase2_data.checklist_surgical.model_dump()
    
    update_data = {
        "checklist": new_checklist,
        "phase2_data": phase2_surgical_data,
        "status": "pending_phase2",
        "current_phase": 2,
        "phase2_submitted_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    if phase2_data.student_notes:
        update_data["phase2_student_notes"] = phase2_data.student_notes
    if phase2_data.remark:
        update_data["phase2_remark"] = phase2_data.remark
    if phase2_data.supervisor_notes:
        update_data["phase2_supervisor_notes"] = phase2_data.supervisor_notes
    if phase2_data.incharge_notes:
        update_data["phase2_incharge_notes"] = phase2_data.incharge_notes
    if phase2_data.torque_values:
        update_data["torque_values"] = phase2_data.torque_values
    
    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$set": update_data}
    )
    
    # Notify both supervisor and implant incharge
    await db.notifications.insert_one({
        "user_id": procedure["supervisor_id"],
        "procedure_id": procedure_id,
        "message": f"Phase 2: Surgical protocol submitted by {procedure['student_name']} for patient {procedure['patient_name']}",
        "type": "approval_request",
        "read": False,
        "created_at": datetime.utcnow()
    })
    
    await db.notifications.insert_one({
        "user_id": procedure["implant_incharge_id"],
        "procedure_id": procedure_id,
        "message": f"Phase 2: Surgical protocol submitted by {procedure['student_name']} for patient {procedure['patient_name']}",
        "type": "approval_request",
        "read": False,
        "created_at": datetime.utcnow()
    })
    
    # Send push notifications to supervisor and implant incharge
    push_recipients = list(set([procedure["supervisor_id"], procedure["implant_incharge_id"]]))
    await send_expo_push_notifications(
        push_recipients,
        "Phase 2 Requires Approval",
        f"Surgical protocol submitted by {procedure['student_name']} for patient {procedure['patient_name']}",
        {"procedure_id": procedure_id, "type": "approval_request"},
        redact=[procedure['patient_name']],
    )
    
    updated_procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    updated_procedure["_id"] = str(updated_procedure["_id"])
    updated_procedure["id"] = updated_procedure["_id"]
    return updated_procedure

# ───────────────────────────────────────────────────────────────────
# iter-189: Phase 2 Pre-Surgical Checklist (separate, day-of submission)
# ───────────────────────────────────────────────────────────────────
PHASE2_PREOP_MANDATORY = {
    "patient_id_consent_verified",
    "vitals_ok",
    "preop_chx_rinse",
    "imaging_chairside",
    "drilling_sequence_ready",
    "implant_verified",
    "drilling_kit_sterile",
    "physiodispenser_ready",
    "instruments_autoclaved",
    "saline_irrigation",
    "aseptic_field_draped",
    "suction_tested",
    "team_briefed",
}

@api_router.post("/procedures/{procedure_id}/phase2-preop")
async def submit_phase2_preop(
    procedure_id: str,
    payload: Phase2PreOpSubmit,
    current_user: dict = Depends(get_current_user),
):
    """Stamp the Pre-Surgical Checklist as completed. Required before
    submit_phase2. Idempotent — re-submission overwrites the previous stamp."""
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)
    
    is_student = current_user["role"] == "student" and procedure.get("student_id") == current_user["_id"]
    is_supervisor = current_user["role"] == "supervisor" and procedure.get("supervisor_id") == current_user["_id"]
    is_incharge = current_user["role"] == "implant_incharge"
    is_creator = procedure.get("created_by_id") == current_user["_id"]
    if not (is_student or is_supervisor or is_incharge or is_creator):
        raise HTTPException(status_code=403, detail="You don't have permission to submit Pre-Op for this procedure")
    
    if procedure["status"] != "phase1_approved":
        raise HTTPException(status_code=400, detail="Phase 1 must be approved before completing the Pre-Surgical Checklist")
    
    items = payload.items or {}
    missing = [k for k in PHASE2_PREOP_MANDATORY if not items.get(k)]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Mandatory pre-op item(s) not checked: {', '.join(sorted(missing))}",
        )
    
    now = datetime.now(timezone.utc)
    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$set": {
            "phase2_preop_checklist": items,
            "phase2_preop_notes": payload.notes,
            "phase2_preop_completed_at": now,
            "phase2_preop_completed_by": current_user["_id"],
            "phase2_preop_completed_by_name": current_user.get("name") or current_user.get("email"),
            "phase2_preop_completed_by_role": current_user.get("role"),
            "updated_at": now,
        }},
    )
    
    # Audit
    try:
        await log_access(
            action="phase2_preop.complete",
            outcome="success",
            user=current_user,
            resource_type="procedure",
            resource_id=procedure_id,
        )
    except Exception:
        pass
    
    return {
        "ok": True,
        "phase2_preop_completed_at": now.isoformat(),
        "phase2_preop_completed_by_name": current_user.get("name") or current_user.get("email"),
    }


@api_router.post("/procedures/{procedure_id}/stage2/surgical")
async def submit_stage2_surgical(
    procedure_id: str,
    data: Stage2SurgicalSubmit,
    current_user: dict = Depends(get_current_user)
):
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)
    if current_user["role"] == "student" and procedure.get("student_id") != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only the student who created this procedure can submit")
    is_student = current_user["role"] == "student" and procedure.get("student_id") == current_user["_id"]
    is_supervisor = current_user["role"] == "supervisor"
    is_incharge = current_user["role"] == "implant_incharge"
    is_creator = procedure.get("created_by_id") == current_user["_id"]
    if not (is_student or is_supervisor or is_incharge or is_creator):
        raise HTTPException(status_code=403, detail="You don't have permission to submit Phase 3")
    if procedure["status"] != "phase2_approved":
        raise HTTPException(status_code=400, detail="Phase 2 must be approved before starting Phase 3")

    existing_checklist = procedure.get("checklist") or {}
    
    # Store Phase 3 data
    phase3_data = {
        "checklist_items": data.checklist_items or {},
        "isq_value": data.isq_value,
        "healing_abutment_height": data.healing_abutment_height,
        "iopa_files": data.iopa_files or [],
    }
    
    # Merge legacy checklist if provided
    new_checklist = {**existing_checklist}
    if data.checklist:
        new_checklist["second_stage"] = data.checklist.model_dump()

    update_data = {
        "checklist": new_checklist,
        "phase3_data": phase3_data,
        "status": "pending_stage2_surgical",
        "stage2_surgical_submitted_at": datetime.utcnow(),
        "supervisor_stage2_surgical_approved": False,
        "implant_incharge_stage2_surgical_approved": False,
        "updated_at": datetime.utcnow()
    }
    if data.student_notes:
        update_data["phase3_student_notes"] = data.student_notes
    if data.supervisor_notes:
        update_data["phase3_supervisor_notes"] = data.supervisor_notes
    if data.incharge_notes:
        update_data["phase3_incharge_notes"] = data.incharge_notes
    if data.remark:
        update_data["stage2_surgical_remark"] = data.remark

    await db.procedures.update_one({"_id": ObjectId(procedure_id)}, {"$set": update_data})

    # Notify approvers
    for uid in [procedure["supervisor_id"], procedure["implant_incharge_id"]]:
        await db.notifications.insert_one({
            "user_id": uid,
            "procedure_id": procedure_id,
            "message": f"Phase 3: Healing and Second Stage Surgery submitted by {procedure['student_name']} for patient {procedure['patient_name']}",
            "type": "approval_request",
            "read": False,
            "created_at": datetime.utcnow()
        })

    push_recipients = list(set([procedure["supervisor_id"], procedure["implant_incharge_id"]]))
    await send_expo_push_notifications(
        push_recipients,
        "Phase 3: Healing and Second Stage Surgery Requires Approval",
        f"{procedure['student_name']} submitted Phase 3 Healing and Second Stage Surgery for {procedure['patient_name']}",
        {"procedure_id": procedure_id, "type": "approval_request"},
        redact=[procedure['patient_name']],
    )

    updated = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    updated["_id"] = str(updated["_id"])
    updated["id"] = updated["_id"]
    return updated


# Phase 4 - Prosthetic Protocol Submission
@api_router.post("/procedures/{procedure_id}/stage2/prosthetic")
async def submit_stage2_prosthetic(
    procedure_id: str,
    data: Stage2ProstheticSubmit,
    save_only: bool = False,
    current_user: dict = Depends(get_current_user)
):
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)
    if current_user["role"] == "student" and procedure.get("student_id") != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    is_student = current_user["role"] == "student" and procedure.get("student_id") == current_user["_id"]
    is_supervisor = current_user["role"] == "supervisor"
    is_incharge = current_user["role"] == "implant_incharge"
    is_creator = procedure.get("created_by_id") == current_user["_id"]
    if not (is_student or is_supervisor or is_incharge or is_creator):
        raise HTTPException(status_code=403, detail="You don't have permission")
    # iter-194: save_only=true (Generate-Lab-Slip on the form) tolerates the
    # case being mid-flow — it's a soft draft. The full submit (save_only=false)
    # still requires the strict status precondition below.
    if not save_only and procedure["status"] != "stage2_surgical_approved":
        raise HTTPException(status_code=400, detail="Phase 3 must be approved before starting Phase 4")
    if save_only and procedure["status"] not in ("stage2_surgical_approved", "pending_stage2_prosthetic", "stage2_prosthetic_step1_approved"):
        raise HTTPException(status_code=400, detail="Phase 3 must be approved before drafting Phase 4 data")

    # iter-191: when conventional impression is selected, the tray-type sub-choice
    # is mandatory and must be one of {open_tray, closed_tray}.
    if data.impression_type == "conventional":
        if data.conventional_tray_type not in ("open_tray", "closed_tray"):
            raise HTTPException(
                status_code=400,
                detail="Please choose Open tray or Closed tray for the conventional impression.",
            )
        # iter-192: impression material is also mandatory for conventional impressions.
        if data.impression_material not in ("polyether", "heavy_light_body", "putty_light_body"):
            raise HTTPException(
                status_code=400,
                detail="Please choose an impression material (Polyether, Heavy and Light body, or Putty and Light body).",
            )

    # iter-194: shade selection is mandatory for both submit and save_only paths.
    sv = [s for s in (data.shade_values or []) if s and s.strip()]
    layout = data.shade_layout or "per_implant"
    if layout == "full_arch":
        if len(sv) < 2:
            raise HTTPException(status_code=400, detail="Please record both Anterior and Posterior shades.")
    else:
        if len(sv) < 1:
            raise HTTPException(status_code=400, detail="Please record at least one implant shade.")

    # Save Phase 4 Step 1 data
    phase4_step1_data = {
        "final_prosthetic_plan": data.final_prosthetic_plan,
        "prosthetic_material": data.prosthetic_material,
        "custom_abutment": data.custom_abutment,
        "overdenture_attachment": data.overdenture_attachment,
        "payment_complete": data.payment_complete,
        "components_available": data.components_available,
        "impression_type": data.impression_type,
        # iter-191: only persisted when impression_type is conventional;
        # explicitly nulled otherwise so a user that switches from conventional
        # → intra-oral doesn't leave a stale tray-type behind.
        "conventional_tray_type": (
            data.conventional_tray_type if data.impression_type == "conventional" else None
        ),
        # iter-192: same null-on-switch contract for impression_material.
        "impression_material": (
            data.impression_material if data.impression_type == "conventional" else None
        ),
        # iter-194: shade is always persisted (mandatory), with the layout flag
        # so renderers can label slots correctly (Anterior/Posterior vs per implant).
        "shade_values": [s.strip() for s in (data.shade_values or [])],
        "shade_layout": layout,
        "shade_notes": (data.shade_notes or "").strip() or None,
        # iter-210: optional MUA override entered at delivery. Stored only
        # when the client sent a non-null payload (touched in the UI). When
        # omitted, the existing override (if any) is preserved by the
        # caller; when explicitly null, the override is cleared so the Lab
        # Slip falls back to phase2_data.
        **({} if data.multi_unit_abutment_details is None
            else {"multi_unit_abutment_details": data.multi_unit_abutment_details}),
    }
    
    existing_checklist = procedure.get("checklist") or {}
    new_checklist = {**existing_checklist}
    if data.checklist:
        new_checklist["prosthetic_phase"] = data.checklist.model_dump()

    update_data = {
        "checklist": new_checklist,
        "phase4_step1_data": phase4_step1_data,
        "updated_at": datetime.utcnow()
    }
    # iter-194: save_only mode (Generate-Lab-Slip on the form) only persists
    # the data; it does NOT flip the workflow status or notify approvers.
    if not save_only:
        update_data["status"] = "pending_stage2_prosthetic"
        update_data["stage2_prosthetic_submitted_at"] = datetime.utcnow()
        update_data["supervisor_stage2_prosthetic_approved"] = False
        update_data["implant_incharge_stage2_prosthetic_approved"] = False
    if data.student_notes:
        update_data["phase4_step1_student_notes"] = data.student_notes
    if data.final_prosthetic_plan:
        update_data["final_prosthetic_plan"] = data.final_prosthetic_plan
    if data.remark:
        update_data["stage2_prosthetic_remark"] = data.remark
    if data.faculty_remark:
        update_data["stage2_prosthetic_faculty_remark"] = data.faculty_remark
    if data.incharge_remark:
        update_data["stage2_prosthetic_incharge_remark"] = data.incharge_remark

    await db.procedures.update_one({"_id": ObjectId(procedure_id)}, {"$set": update_data})

    # iter-194: in save_only (lab-slip draft) mode we skip notifying approvers.
    if not save_only:
        for uid in [procedure["supervisor_id"], procedure["implant_incharge_id"]]:
            await db.notifications.insert_one({
                "user_id": uid,
                "procedure_id": procedure_id,
                "message": f"Phase 4: Prosthetic Rehabilitation submitted by {procedure['student_name']} for patient {procedure['patient_name']}",
                "type": "approval_request",
                "read": False,
                "created_at": datetime.utcnow()
            })

        push_recipients = list(set([procedure["supervisor_id"], procedure["implant_incharge_id"]]))
        await send_expo_push_notifications(
            push_recipients,
            "Phase 4: Prosthetic Rehabilitation Requires Approval",
            f"{procedure['student_name']} submitted Phase 4 Prosthetic Rehabilitation for {procedure['patient_name']}",
            {"procedure_id": procedure_id, "type": "approval_request"},
            redact=[procedure['patient_name']],
        )

    updated = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    updated["_id"] = str(updated["_id"])
    updated["id"] = updated["_id"]
    return updated


# Phase 3 - Second Stage Surgical Protocol Approval
@api_router.post("/procedures/{procedure_id}/stage2/surgical/approve")
async def approve_stage2_surgical(
    procedure_id: str,
    action: ApprovalAction,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] in ["student", "nurse"]:
        raise HTTPException(status_code=403, detail="Only supervisors and implant incharge can approve")

    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)
    if procedure["status"] != "pending_stage2_surgical":
        raise HTTPException(status_code=400, detail="Procedure is not pending Phase 3 approval")

    is_supervisor = current_user["_id"] == procedure.get("supervisor_id")
    is_implant_incharge = current_user["_id"] == procedure.get("implant_incharge_id")
    is_incharge_self_created = procedure.get("created_by_role") in ("implant_incharge", "chief_dentist") and procedure.get("created_by_id") == current_user["_id"]
    if not (is_supervisor or is_implant_incharge or is_incharge_self_created):
        raise HTTPException(status_code=403, detail="Only assigned supervisor or implant incharge can approve")

    same_person = procedure["supervisor_id"] == procedure["implant_incharge_id"]

    if action.action == "approve":
        update_fields = {"updated_at": datetime.utcnow()}

        # Save approval comment if provided (Phase 3)
        if action.comment and action.comment.strip():
            if is_supervisor:
                update_fields["phase3_supervisor_notes"] = action.comment.strip()
            if is_implant_incharge:
                update_fields["phase3_incharge_notes"] = action.comment.strip()

        if is_incharge_self_created or same_person:
            update_fields["supervisor_stage2_surgical_approved"] = True
            update_fields["supervisor_stage2_surgical_approved_at"] = datetime.utcnow()
            update_fields["implant_incharge_stage2_surgical_approved"] = True
            update_fields["implant_incharge_stage2_surgical_approved_at"] = datetime.utcnow()
        else:
            if is_supervisor:
                update_fields["supervisor_stage2_surgical_approved"] = True
                update_fields["supervisor_stage2_surgical_approved_at"] = datetime.utcnow()
            if is_implant_incharge:
                update_fields["implant_incharge_stage2_surgical_approved"] = True
                update_fields["implant_incharge_stage2_surgical_approved_at"] = datetime.utcnow()

        sup_ok = procedure.get("supervisor_stage2_surgical_approved", False) or is_supervisor or (same_person and is_implant_incharge) or is_incharge_self_created
        inc_ok = procedure.get("implant_incharge_stage2_surgical_approved", False) or is_implant_incharge or (same_person and is_supervisor) or is_incharge_self_created

        if sup_ok and inc_ok:
            update_fields["status"] = "stage2_surgical_approved"
            update_fields["stage2_surgical_completed_at"] = datetime.utcnow()
            await db.notifications.insert_one({
                "user_id": procedure["student_id"],
                "procedure_id": procedure_id,
                "message": "Phase 3 approved! You can now submit Phase 4 - Prosthetic Rehabilitation.",
                "type": "approved",
                "read": False,
                "created_at": datetime.utcnow()
            })
            await send_expo_push_notifications(
                [procedure["student_id"]],
                "Phase 3 Approved!",
                "You can now submit Phase 4 - Prosthetic Rehabilitation.",
                {"procedure_id": procedure_id, "type": "approved"},
            )
        else:
            approver_name = current_user["name"]
            waiting_for = "implant incharge" if sup_ok else "supervisor"
            await db.notifications.insert_one({
                "user_id": procedure["student_id"],
                "procedure_id": procedure_id,
                "message": f"Phase 3: Approved by {approver_name}. Waiting for {waiting_for}.",
                "type": "approved",
                "read": False,
                "created_at": datetime.utcnow()
            })

        await db.procedures.update_one({"_id": ObjectId(procedure_id)}, {"$set": update_fields})
    else:
        rej_type = action.rejection_type or "permanent"
        if rej_type == "reconsider":
            # Soft reject: go back to phase2_approved so student can re-submit Phase 3
            await db.procedures.update_one(
                {"_id": ObjectId(procedure_id)},
                {"$set": {
                    "status": "phase2_approved",
                    "stage2_surgical_rejection_reason": action.rejection_reason,
                    "stage2_surgical_rejection_type": "reconsider",
                    "stage2_surgical_rejected_by": current_user["name"],
                    "stage2_surgical_rejected_at": datetime.utcnow(),
                    "rejected_phase": "phase3",
                    "updated_at": datetime.utcnow()
                }}
            )
        else:
            # Permanent reject
            await db.procedures.update_one(
                {"_id": ObjectId(procedure_id)},
                {"$set": {
                    "status": "permanently_rejected",
                    "stage2_surgical_rejection_reason": action.rejection_reason,
                    "stage2_surgical_rejection_type": "permanent",
                    "stage2_surgical_rejected_by": current_user["name"],
                    "stage2_surgical_rejected_at": datetime.utcnow(),
                    "rejected_phase": "phase3",
                    "updated_at": datetime.utcnow()
                }}
            )
        
        await notify_rejection(procedure, procedure_id, "Phase 3", rej_type, action.rejection_reason or "", current_user["name"])

    updated = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    updated["_id"] = str(updated["_id"])
    updated["id"] = updated["_id"]
    return updated


# Phase 4 - Prosthetic Protocol Approval
@api_router.post("/procedures/{procedure_id}/stage2/prosthetic/approve")
async def approve_stage2_prosthetic(
    procedure_id: str,
    action: ApprovalAction,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] in ["student", "nurse"]:
        raise HTTPException(status_code=403, detail="Only supervisors and implant incharge can approve")

    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)
    if procedure["status"] != "pending_stage2_prosthetic":
        raise HTTPException(status_code=400, detail="Procedure is not pending Phase 4 approval")

    is_supervisor = current_user["_id"] == procedure.get("supervisor_id")
    is_implant_incharge = current_user["_id"] == procedure.get("implant_incharge_id")
    is_incharge_self_created = procedure.get("created_by_role") in ("implant_incharge", "chief_dentist") and procedure.get("created_by_id") == current_user["_id"]
    if not (is_supervisor or is_implant_incharge or is_incharge_self_created):
        raise HTTPException(status_code=403, detail="Only assigned supervisor or implant incharge can approve")

    same_person = procedure["supervisor_id"] == procedure["implant_incharge_id"]

    if action.action == "approve":
        update_fields = {"updated_at": datetime.utcnow()}

        # Save approval comment if provided (Phase 4 Step 1)
        if action.comment and action.comment.strip():
            if is_supervisor:
                update_fields["phase4_step1_supervisor_notes"] = action.comment.strip()
            if is_implant_incharge:
                update_fields["phase4_step1_incharge_notes"] = action.comment.strip()

        if is_incharge_self_created or same_person:
            update_fields["supervisor_stage2_prosthetic_approved"] = True
            update_fields["supervisor_stage2_prosthetic_approved_at"] = datetime.utcnow()
            update_fields["implant_incharge_stage2_prosthetic_approved"] = True
            update_fields["implant_incharge_stage2_prosthetic_approved_at"] = datetime.utcnow()
        else:
            if is_supervisor:
                update_fields["supervisor_stage2_prosthetic_approved"] = True
                update_fields["supervisor_stage2_prosthetic_approved_at"] = datetime.utcnow()
            if is_implant_incharge:
                update_fields["implant_incharge_stage2_prosthetic_approved"] = True
                update_fields["implant_incharge_stage2_prosthetic_approved_at"] = datetime.utcnow()

        sup_ok = procedure.get("supervisor_stage2_prosthetic_approved", False) or is_supervisor or (same_person and is_implant_incharge) or is_incharge_self_created
        inc_ok = procedure.get("implant_incharge_stage2_prosthetic_approved", False) or is_implant_incharge or (same_person and is_supervisor) or is_incharge_self_created

        if sup_ok and inc_ok:
            update_fields["status"] = "stage2_prosthetic_step1_approved"
            update_fields["stage2_prosthetic_step1_approved_at"] = datetime.utcnow()

            # Notify student that Step 1 is approved, proceed to Step 2
            student_id = procedure.get("student_id")
            creator_id = procedure.get("created_by_id")
            notify_id = student_id or creator_id
            if notify_id:
                await db.notifications.insert_one({
                    "user_id": notify_id,
                    "procedure_id": procedure_id,
                    "message": f"Phase 4 Step 1 approved for {procedure['patient_name']}! You can now submit Step 2 - Trial and Prosthesis Delivery.",
                    "type": "approved",
                    "read": False,
                    "created_at": datetime.utcnow()
                })
            push_all = list(set(filter(None, [procedure.get("student_id"), procedure.get("supervisor_id"), procedure.get("implant_incharge_id")])))
            await send_expo_push_notifications(
                push_all,
                "Phase 4 Step 1 Approved!",
                f"Phase 4 Step 1 for {procedure['patient_name']} approved. Proceed to Step 2 - Trial and Delivery.",
                {"procedure_id": procedure_id, "type": "approved"},
                redact=[procedure['patient_name']],
            )
        else:
            approver_name = current_user["name"]
            waiting_for = "implant incharge" if sup_ok else "supervisor"
            await db.notifications.insert_one({
                "user_id": procedure["student_id"],
                "procedure_id": procedure_id,
                "message": f"Phase 4: Approved by {approver_name}. Waiting for {waiting_for}.",
                "type": "approved",
                "read": False,
                "created_at": datetime.utcnow()
            })

        await db.procedures.update_one({"_id": ObjectId(procedure_id)}, {"$set": update_fields})
    else:
        rej_type = action.rejection_type or "permanent"
        if rej_type == "reconsider":
            # Soft reject: go back to stage2_surgical_approved so student can re-submit Phase 4
            await db.procedures.update_one(
                {"_id": ObjectId(procedure_id)},
                {"$set": {
                    "status": "stage2_surgical_approved",
                    "stage2_prosthetic_rejection_reason": action.rejection_reason,
                    "stage2_prosthetic_rejection_type": "reconsider",
                    "stage2_prosthetic_rejected_by": current_user["name"],
                    "stage2_prosthetic_rejected_at": datetime.utcnow(),
                    "rejected_phase": "phase4",
                    "updated_at": datetime.utcnow()
                }}
            )
        else:
            # Permanent reject
            await db.procedures.update_one(
                {"_id": ObjectId(procedure_id)},
                {"$set": {
                    "status": "permanently_rejected",
                    "stage2_prosthetic_rejection_reason": action.rejection_reason,
                    "stage2_prosthetic_rejection_type": "permanent",
                    "stage2_prosthetic_rejected_by": current_user["name"],
                    "stage2_prosthetic_rejected_at": datetime.utcnow(),
                    "rejected_phase": "phase4",
                    "updated_at": datetime.utcnow()
                }}
            )
        
        await notify_rejection(procedure, procedure_id, "Phase 4", rej_type, action.rejection_reason or "", current_user["name"])

    updated = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    updated["_id"] = str(updated["_id"])
    updated["id"] = updated["_id"]
    return updated




# Phase 4 Step 2 - Trial and Prosthesis Delivery Submission
@api_router.post("/procedures/{procedure_id}/stage2/prosthetic/step2")
async def submit_phase4_step2(
    procedure_id: str,
    data: Phase4Step2Submit,
    current_user: dict = Depends(get_current_user)
):
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)
    is_student = current_user["role"] == "student" and procedure.get("student_id") == current_user["_id"]
    is_supervisor = current_user["role"] == "supervisor"
    is_incharge = current_user["role"] == "implant_incharge"
    is_creator = procedure.get("created_by_id") == current_user["_id"]
    if not (is_student or is_supervisor or is_incharge or is_creator):
        raise HTTPException(status_code=403, detail="You don't have permission")
    if procedure["status"] != "stage2_prosthetic_step1_approved":
        raise HTTPException(status_code=400, detail="Phase 4 Step 1 must be approved before submitting Step 2")

    # ── Validate IOPA / OPG / Prosthesis-photo uploads ──────────────────
    full_arch_types = {"All on 4", "All on 6", "All on X"}
    is_full_arch = procedure.get("implant_procedure_type") in full_arch_types
    if is_full_arch:
        if not data.opg_upload or not data.opg_upload.get("filename"):
            raise HTTPException(status_code=400, detail="An OPG upload is required for full-arch cases.")
    else:
        plans = procedure.get("implant_plans") or []
        positions = [str(p.get("position", "")) for p in plans if p.get("position")]
        iopa = data.iopa_uploads or {}
        missing = [pos for pos in positions if not (iopa.get(pos) or {}).get("filename")]
        if positions and missing:
            raise HTTPException(status_code=400, detail=f"IOPA missing for tooth positions: {', '.join(missing)}")
    photos = data.prosthesis_photos or []
    valid_photos = [p for p in photos if p.get("filename")]
    if len(valid_photos) < 2:
        raise HTTPException(status_code=400, detail="At least 2 final prosthesis photos are required.")

    phase4_step2_data = {
        "trial_checklist": data.trial_checklist or {},
        "confirmation_statement": data.confirmation_statement,
    }

    update_data = {
        "phase4_step2_data": phase4_step2_data,
        "status": "pending_final_delivery",
        "phase4_step2_submitted_at": datetime.utcnow(),
        "supervisor_final_delivery_approved": False,
        "implant_incharge_final_delivery_approved": False,
        "updated_at": datetime.utcnow()
    }
    if data.student_notes:
        update_data["phase4_step2_student_notes"] = data.student_notes
    if data.supervisor_notes:
        update_data["phase4_step2_supervisor_notes"] = data.supervisor_notes
    if data.incharge_notes:
        update_data["phase4_step2_incharge_notes"] = data.incharge_notes
    if data.iopa_uploads:
        update_data["phase4_step2_iopa_uploads"] = data.iopa_uploads
    if data.opg_upload:
        update_data["phase4_step2_opg_upload"] = data.opg_upload
    if data.prosthesis_photos:
        update_data["phase4_step2_prosthesis_photos"] = [p for p in data.prosthesis_photos if p.get("filename")]

    await db.procedures.update_one({"_id": ObjectId(procedure_id)}, {"$set": update_data})

    # Notify supervisor and incharge
    for uid in filter(None, [procedure.get("supervisor_id"), procedure.get("implant_incharge_id")]):
        await db.notifications.insert_one({
            "user_id": uid,
            "procedure_id": procedure_id,
            "message": f"Phase 4 Step 2: Trial & Delivery submitted for {procedure['patient_name']}. Approval required.",
            "type": "approval_request",
            "read": False,
            "created_at": datetime.utcnow()
        })

    updated = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    updated["_id"] = str(updated["_id"])
    updated["id"] = updated["_id"]
    return updated


# Phase 4 Step 2 - Trial and Delivery Approval
@api_router.post("/procedures/{procedure_id}/stage2/prosthetic/step2/approve")
async def approve_phase4_step2(
    procedure_id: str,
    action: ApprovalAction,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] in ["student", "nurse"]:
        raise HTTPException(status_code=403, detail="Only supervisors and implant incharge can approve")

    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    await _assert_procedure_org_access(procedure, current_user)
    if procedure["status"] != "pending_final_delivery":
        raise HTTPException(status_code=400, detail="Procedure is not pending Phase 4 Step 2 approval")

    is_supervisor = current_user["_id"] == procedure.get("supervisor_id")
    is_implant_incharge = current_user["_id"] == procedure.get("implant_incharge_id")
    is_incharge_self_created = procedure.get("created_by_role") in ("implant_incharge", "chief_dentist") and procedure.get("created_by_id") == current_user["_id"]
    if not (is_supervisor or is_implant_incharge or is_incharge_self_created):
        raise HTTPException(status_code=403, detail="Only assigned supervisor or implant incharge can approve")

    same_person = procedure.get("supervisor_id") == procedure.get("implant_incharge_id")

    if action.action == "approve":
        update_fields = {"updated_at": datetime.utcnow()}

        # Save approval comment if provided (Phase 4 Step 2)
        if action.comment and action.comment.strip():
            if is_supervisor:
                update_fields["phase4_step2_supervisor_notes"] = action.comment.strip()
            if is_implant_incharge:
                update_fields["phase4_step2_incharge_notes"] = action.comment.strip()

        if is_incharge_self_created or same_person:
            update_fields["supervisor_final_delivery_approved"] = True
            update_fields["supervisor_final_delivery_approved_at"] = datetime.utcnow()
            update_fields["implant_incharge_final_delivery_approved"] = True
            update_fields["implant_incharge_final_delivery_approved_at"] = datetime.utcnow()
        else:
            if is_supervisor:
                update_fields["supervisor_final_delivery_approved"] = True
                update_fields["supervisor_final_delivery_approved_at"] = datetime.utcnow()
            if is_implant_incharge:
                update_fields["implant_incharge_final_delivery_approved"] = True
                update_fields["implant_incharge_final_delivery_approved_at"] = datetime.utcnow()

        sup_ok = procedure.get("supervisor_final_delivery_approved", False) or is_supervisor or (same_person and is_implant_incharge) or is_incharge_self_created
        inc_ok = procedure.get("implant_incharge_final_delivery_approved", False) or is_implant_incharge or (same_person and is_supervisor) or is_incharge_self_created

        if sup_ok and inc_ok:
            update_fields["status"] = "completed"
            update_fields["stage2_prosthetic_completed_at"] = datetime.utcnow()
            update_fields["treatment_completed_at"] = datetime.utcnow()

            # Generate completion badge
            case_id = f"IMP{procedure_id[-4:].upper()}"
            badge = {
                "procedure_id": procedure_id,
                "type": "Implant Case Completed",
                "case_id": case_id,
                "student_name": procedure.get("student_name", ""),
                "student_id": procedure.get("student_id", ""),
                "patient_name": procedure.get("patient_name", ""),
                "supervisor_name": procedure.get("supervisor_name", ""),
                "implant_incharge_name": procedure.get("implant_incharge_name", ""),
                "implant_procedure_type": procedure.get("implant_procedure_type", ""),
                "number_of_implants": procedure.get("number_of_implants", 0),
                "completed_at": datetime.utcnow(),
                "created_at": datetime.utcnow(),
            }
            await db.badges.insert_one(badge)
            update_fields["badge_case_id"] = case_id

            # Notify all parties
            student_id = procedure.get("student_id")
            if student_id:
                await db.notifications.insert_one({
                    "user_id": student_id,
                    "procedure_id": procedure_id,
                    "message": f"Treatment for {procedure['patient_name']} is now complete! All protocols (Phase 1-4) have been approved.",
                    "type": "approved",
                    "read": False,
                    "created_at": datetime.utcnow()
                })
            for uid in filter(None, [procedure.get("supervisor_id"), procedure.get("implant_incharge_id")]):
                await db.notifications.insert_one({
                    "user_id": uid,
                    "procedure_id": procedure_id,
                    "message": f"Treatment for {procedure['patient_name']} fully completed. All protocols approved.",
                    "type": "approved",
                    "read": False,
                    "created_at": datetime.utcnow()
                })

            push_all = list(set(filter(None, [procedure.get("student_id"), procedure.get("supervisor_id"), procedure.get("implant_incharge_id")])))
            await send_expo_push_notifications(
                push_all,
                "Treatment Complete!",
                f"All protocols for {procedure['patient_name']} approved. Treatment complete.",
                {"procedure_id": procedure_id, "type": "completed"},
                redact=[procedure['patient_name']],
            )

        await db.procedures.update_one({"_id": ObjectId(procedure_id)}, {"$set": update_fields})
    else:
        # Rejection - go back to step1_approved so student can re-submit step 2
        rej_reason = action.rejection_reason or "No reason provided"
        await db.procedures.update_one(
            {"_id": ObjectId(procedure_id)},
            {"$set": {
                "status": "stage2_prosthetic_step1_approved",
                "phase4_step2_rejection_reason": rej_reason,
                "phase4_step2_rejected_by": current_user["name"],
                "phase4_step2_rejected_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }}
        )

    updated = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    updated["_id"] = str(updated["_id"])
    updated["id"] = updated["_id"]
    return updated


# Notification Routes
@api_router.get("/notifications")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    # Use aggregation to avoid N+1 query problem
    pipeline = [
        {"$match": {"user_id": current_user["_id"]}},
        {"$sort": {"created_at": -1}},
        {"$limit": 100},
        {
            "$lookup": {
                "from": "procedures",
                "let": {"procedure_id_str": "$procedure_id"},
                "pipeline": [
                    {
                        "$match": {
                            "$expr": {
                                "$eq": [{"$toString": "$_id"}, "$$procedure_id_str"]
                            }
                        }
                    },
                    {
                        "$project": {
                            "patient_name": 1,
                            "procedure_date": 1,
                            "status": 1
                        }
                    }
                ],
                "as": "procedure_info"
            }
        }
    ]
    
    notifications = await db.notifications.aggregate(pipeline).to_list(100)
    
    result = []
    for notif in notifications:
        notif["_id"] = str(notif["_id"])
        notif["id"] = notif["_id"]
        notif["created_at"] = notif["created_at"].isoformat()
        
        # Extract procedure details from lookup result
        if notif.get("procedure_info") and len(notif["procedure_info"]) > 0:
            procedure = notif["procedure_info"][0]
            notif["procedure_details"] = {
                "patient_name": procedure.get("patient_name"),
                "procedure_date": procedure.get("procedure_date"),
                "status": procedure.get("status")
            }
        
        # Remove the temporary lookup field
        notif.pop("procedure_info", None)
        
        result.append(notif)
    
    return result

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    await db.notifications.update_one(
        {"_id": ObjectId(notification_id), "user_id": current_user["_id"]},
        {"$set": {"read": True}}
    )
    return {"message": "Notification marked as read"}

@api_router.get("/notifications/unread-count")
async def get_unread_count(current_user: dict = Depends(get_current_user)):
    count = await db.notifications.count_documents(
        {"user_id": current_user["_id"], "read": False}
    )
    return {"count": count}

# Dashboard Stats
@api_router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    query = {}
    user_id = current_user["_id"]
    role = current_user["role"]

    if role == "student":
        query["student_id"] = user_id
    elif role == "supervisor":
        query["supervisor_id"] = user_id
    elif role in ORG_WIDE_ROLES:
        query.update(await _org_scope_match(current_user))

    total = await db.procedures.count_documents(query)
    pending = await db.procedures.count_documents({**query, "status": {"$in": ["pending_phase1", "pending_phase2", "pending_stage2_surgical", "pending_stage2_prosthetic", "pending_final_delivery"]}})
    approved = await db.procedures.count_documents({**query, "status": {"$in": ["phase1_approved", "phase2_approved", "stage2_surgical_approved", "completed"]}})
    rejected = await db.procedures.count_documents({**query, "status": {"$in": ["rejected", "stage2_surgical_rejected", "stage2_prosthetic_rejected", "permanently_rejected"]}})
    drafts = await db.procedures.count_documents({**query, "status": "draft"})
    completed = await db.procedures.count_documents({**query, "status": "completed"})

    # Phase pipeline counts
    pipeline = {
        "phase1": await db.procedures.count_documents({**query, "status": {"$in": ["draft", "pending_phase1"]}}),
        "phase2": await db.procedures.count_documents({**query, "status": {"$in": ["phase1_approved", "pending_phase2"]}}),
        "phase3": await db.procedures.count_documents({**query, "status": {"$in": ["phase2_approved", "pending_stage2_surgical"]}}),
        "phase4": await db.procedures.count_documents({**query, "status": {"$in": ["stage2_surgical_approved", "pending_stage2_prosthetic", "stage2_prosthetic_step1_approved", "pending_final_delivery"]}}),
        "completed": completed,
        "rejected": rejected,
    }

    result = {
        "total": total,
        "pending": pending,
        "approved": approved,
        "rejected": rejected,
        "drafts": drafts,
        "completed": completed,
        "pipeline": pipeline,
    }

    # Role-specific extras
    if role == "supervisor" or role == "implant_incharge" or role == "administrator":
        # Pending my approval count
        pending_statuses = ["pending_phase1", "pending_phase2", "pending_stage2_surgical", "pending_stage2_prosthetic", "pending_final_delivery"]
        if role == "supervisor":
            my_pending = await db.procedures.count_documents({"supervisor_id": user_id, "status": {"$in": pending_statuses}})
        else:
            my_pending = await db.procedures.count_documents({**(await _org_scope_match(current_user)), "status": {"$in": pending_statuses}})
        result["pending_my_approval"] = my_pending

        # Student stats for incharge
        if role in ["implant_incharge", "administrator"]:
            if current_user.get("is_super_admin"):
                student_id_match: Dict[str, Any] = {"$exists": True, "$nin": [None, ""]}
                supervisor_id_match: Dict[str, Any] = {"$exists": True, "$nin": [None, ""]}
            else:
                _org_ids = await _org_member_ids(current_user.get("org_id"))
                student_id_match = {"$in": _org_ids}
                supervisor_id_match = {"$in": _org_ids}

            student_pipeline = [
                {"$match": {"student_id": student_id_match}},
                {"$group": {
                    "_id": "$student_id",
                    "student_name": {"$first": "$student_name"},
                    "total": {"$sum": 1},
                    "completed": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
                    "rejected": {"$sum": {"$cond": [{"$in": ["$status", ["rejected", "permanently_rejected", "stage2_surgical_rejected", "stage2_prosthetic_rejected"]]}, 1, 0]}},
                    "active": {"$sum": {"$cond": [{"$not": {"$in": ["$status", ["completed", "rejected", "permanently_rejected"]]}}, 1, 0]}},
                }}
            ]
            student_stats = []
            async for doc in db.procedures.aggregate(student_pipeline):
                student_stats.append({
                    "student_id": doc.get("_id"),
                    "student_name": doc.get("student_name", "Unknown"),
                    "total": doc["total"],
                    "completed": doc["completed"],
                    "rejected": doc["rejected"],
                    "active": doc["active"],
                })
            student_stats.sort(key=lambda x: x["completed"], reverse=True)
            result["student_stats"] = student_stats

            # Supervisor stats — aggregate cases per supervisor with review-load metrics
            sup_pipeline = [
                {"$match": {"supervisor_id": supervisor_id_match}},
                {"$group": {
                    "_id": "$supervisor_id",
                    "supervisor_name": {"$first": "$supervisor_name"},
                    "total": {"$sum": 1},
                    "approved": {"$sum": {"$cond": [{"$eq": ["$supervisor_phase1_approved", True]}, 1, 0]}},
                    "rejected": {"$sum": {"$cond": [{"$in": ["$status", ["rejected", "permanently_rejected"]]}, 1, 0]}},
                    "pending": {"$sum": {"$cond": [{"$in": ["$status", ["pending_phase1", "pending_phase2", "pending_stage2_surgical", "pending_stage2_prosthetic"]]}, 1, 0]}},
                }}
            ]
            supervisor_stats: List[Dict[str, Any]] = []
            async for doc in db.procedures.aggregate(sup_pipeline):
                supervisor_stats.append({
                    "supervisor_id": doc.get("_id"),
                    "supervisor_name": doc.get("supervisor_name", "Unknown"),
                    "total": doc["total"],
                    "approved": doc["approved"],
                    "rejected": doc["rejected"],
                    "pending": doc["pending"],
                })
            supervisor_stats.sort(key=lambda x: x["total"], reverse=True)
            result["supervisor_stats"] = supervisor_stats

    return result


# Implant Library endpoints

# Tooth-wise Implant Recommendation Database (from user specification section 4)
TOOTH_RECOMMENDATIONS = {
    "11": {"region": "Maxillary Central Incisor", "diameter": [3.5, 4.3], "length": [11, 13]},
    "12": {"region": "Maxillary Lateral Incisor", "diameter": [3.0, 3.5], "length": [10, 13]},
    "13": {"region": "Maxillary Canine", "diameter": [3.5, 4.0], "length": [11, 13]},
    "14": {"region": "Maxillary 1st Premolar", "diameter": [3.5, 4.0], "length": [10, 13]},
    "15": {"region": "Maxillary 2nd Premolar", "diameter": [3.5, 4.5], "length": [10, 12]},
    "16": {"region": "Maxillary 1st Molar", "diameter": [4.5, 5.0], "length": [10, 12]},
    "17": {"region": "Maxillary 2nd Molar", "diameter": [4.5, 5.5], "length": [8, 10]},
    "21": {"region": "Maxillary Central Incisor", "diameter": [3.5, 4.3], "length": [11, 13]},
    "22": {"region": "Maxillary Lateral Incisor", "diameter": [3.0, 3.5], "length": [10, 13]},
    "23": {"region": "Maxillary Canine", "diameter": [3.5, 4.0], "length": [11, 13]},
    "24": {"region": "Maxillary 1st Premolar", "diameter": [3.5, 4.0], "length": [10, 13]},
    "25": {"region": "Maxillary 2nd Premolar", "diameter": [3.5, 4.5], "length": [10, 12]},
    "26": {"region": "Maxillary 1st Molar", "diameter": [4.5, 5.0], "length": [10, 12]},
    "27": {"region": "Maxillary 2nd Molar", "diameter": [4.5, 5.5], "length": [8, 10]},
    "31": {"region": "Mandibular Central Incisor", "diameter": [3.0, 3.3], "length": [10, 13]},
    "32": {"region": "Mandibular Lateral Incisor", "diameter": [3.0, 3.5], "length": [10, 13]},
    "33": {"region": "Mandibular Canine", "diameter": [3.5, 4.0], "length": [11, 13]},
    "34": {"region": "Mandibular 1st Premolar", "diameter": [3.5, 4.0], "length": [10, 13]},
    "35": {"region": "Mandibular 2nd Premolar", "diameter": [3.5, 4.5], "length": [10, 13]},
    "36": {"region": "Mandibular 1st Molar", "diameter": [4.5, 5.0], "length": [10, 12]},
    "37": {"region": "Mandibular 2nd Molar", "diameter": [4.5, 5.5], "length": [8, 10]},
    "41": {"region": "Mandibular Central Incisor", "diameter": [3.0, 3.3], "length": [10, 13]},
    "42": {"region": "Mandibular Lateral Incisor", "diameter": [3.0, 3.5], "length": [10, 13]},
    "43": {"region": "Mandibular Canine", "diameter": [3.5, 4.0], "length": [11, 13]},
    "44": {"region": "Mandibular 1st Premolar", "diameter": [3.5, 4.0], "length": [10, 13]},
    "45": {"region": "Mandibular 2nd Premolar", "diameter": [3.5, 4.5], "length": [10, 13]},
    "46": {"region": "Mandibular 1st Molar", "diameter": [4.5, 5.0], "length": [10, 12]},
    "47": {"region": "Mandibular 2nd Molar", "diameter": [4.5, 5.5], "length": [8, 10]},
}

# Implant system-specific indications
# Key format: "brand|system"
IMPLANT_INDICATIONS = {
    "Neodent|Drive GM Acqua": {
        "indication": "Indicated for Bone D3 and D4 and Immediate Placement.",
        "indicated_procedures": ["Immediate Implant"],
        "indicated_bone_types": ["D3", "D4"],
    },
    "Neodent|Drive GM NeoPorous": {
        "indication": "Indicated for Bone D3 and D4 and for Immediate Placement.",
        "indicated_procedures": ["Immediate Implant"],
        "indicated_bone_types": ["D3", "D4"],
    },
    "Neodent|Helix GM Acqua": {
        "indication": "Indicated in D1, D2, D3, and D4 Bone Types and for Immediate Placement.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant", "Partial Extraction Therapy"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Neodent|Helix GM Neoporous": {
        "indication": "Indicated in D1, D2, D3, and D4 Bone Types and for Immediate Placement.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant", "Partial Extraction Therapy"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Neodent|Titamax GM NeoPorous": {
        "indication": "Indicated for Bone type D1 and D2 and Guided Bone Regeneration areas.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Implant Placement with Guided Bone Regeneration"],
        "indicated_bone_types": ["D1", "D2"],
    },
    "Nobel Biocare|NobelActive NP": {
        "indication": "Indicated only for the replacement of 11, 12, 21, 22, 31, 32, 41, 42.",
        "restricted_teeth": ["11", "12", "21", "22", "31", "32", "41", "42"],
        "indicated_procedures": ["Single Conventional Implant"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Nobel Biocare|NobelActive RP": {
        "indication": "Indicated for D4 and for Immediate Placement.",
        "indicated_procedures": ["Immediate Implant", "Partial Extraction Therapy"],
        "indicated_bone_types": ["D4"],
    },
    "Nobel Biocare|NobelParallel RP": {
        "indication": "Indicated for all bone types D1, D2, D3, D4, for Immediate Placement, for Conventional Placement.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant", "Partial Extraction Therapy"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "NeoBiotech|IS-III active": {
        "indication": "Indicated for Immediate placement and D3, D4 Bone Types.",
        "indicated_procedures": ["Immediate Implant", "Partial Extraction Therapy"],
        "indicated_bone_types": ["D3", "D4"],
    },
    "Osstem|TS III": {
        "indication": "Indicated for D1, D2, D3, and D4 Bone Types.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Osstem|TS IV": {
        "indication": "Indicated for D3 and D4 Bone Type. Indicated for Sinus Lift.",
        "indicated_procedures": ["Immediate Implant"],
        "indicated_bone_types": ["D3", "D4"],
    },
    "Osstem|SS III": {
        "indication": "Indicated for D3 and D4 Bone Type.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants"],
        "indicated_bone_types": ["D3", "D4"],
    },
    "Osstem|MS": {
        "indication": "Indicated for 31, 32, 33, 41, 42, 43.",
        "restricted_teeth": ["31", "32", "33", "41", "42", "43"],
        "indicated_procedures": ["Single Conventional Implant"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Osstem|ETIII NH": {
        "indication": "Hydroxyapatite Coated. Indicated for Enhanced Osseointegration and Fast Healing.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "BioHorizons|Tapered Pro": {
        "indication": "Hydroxyapatite Coated. Indicated for Immediate Placement and for 11, 12, 13, 21, 22, 23. Laser Lock Collar surface for good connective tissue attachment.",
        "indicated_teeth": ["11", "12", "13", "21", "22", "23"],
        "indicated_procedures": ["Immediate Implant", "Partial Extraction Therapy"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "BioHorizons|Tapered Pro Conical RBT": {
        "indication": "Indicated for Immediate Placement and All on 4, All on 6, and All on X. Feature Camelog connection with Biohorizons Tapered Pro features.",
        "indicated_procedures": ["Immediate Implant", "All on 4", "All on 6", "All on X"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "BioHorizons|Tapered Short Conical RBT": {
        "indication": "Indicated when available bone height is 9, 9.5, or 10 mm.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants"],
        "indicated_bone_types": ["D3", "D4"],
    },
    "BioHorizons|Tapered IM": {
        "indication": "Indicated for Immediate Placement in the 16, 17, 26, 27, 36, 37, 46, 47.",
        "indicated_teeth": ["16", "17", "26", "27", "36", "37", "46", "47"],
        "indicated_procedures": ["Immediate Implant"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "BioHorizons|Tapered Short": {
        "indication": "Indicated for Bone height of 8, 9, 10 mm.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants"],
        "indicated_bone_types": ["D3", "D4"],
    },
    "BioHorizons|Narrow Diameter": {
        "indication": "Indicated for 11, 12, 13, 21, 22, 23, 31, 32, 33, 41, 42, 43 with narrow spaces.",
        "indicated_teeth": ["11", "12", "13", "21", "22", "23", "31", "32", "33", "41", "42", "43"],
        "indicated_procedures": ["Single Conventional Implant"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Conelog|Progressive Line": {
        "indication": "Indicated for 11, 12, 13, 21, 22, 23 and Immediate Extraction. Parallel Body provides excellent primary stability.",
        "indicated_teeth": ["11", "12", "13", "21", "22", "23"],
        "indicated_procedures": ["Immediate Implant", "Partial Extraction Therapy"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Zimmer|Tapered Screw-Vent (TSV)": {
        "indication": "Indicated for D1, D2, D3, and D4 Bone Type, for Immediate Loading - high primary stability due to Apical Vent design.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Zimmer|TSX": {
        "indication": "Indicated for Immediate placement.",
        "indicated_procedures": ["Immediate Implant", "Partial Extraction Therapy"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Bredent|Mini 2 Sky": {
        "indication": "Indicated for bone width 4mm, 4.5mm, 5mm - Narrow Ridges.",
        "indicated_procedures": ["Single Conventional Implant"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Bredent|Copa Sky": {
        "indication": "Indicated for 34, 35, 36, 37, 44, 45, 46, 47 regions with Bone Height 6mm, 7mm, or 8mm.",
        "indicated_teeth": ["34", "35", "36", "37", "44", "45", "46", "47"],
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants"],
        "indicated_bone_types": ["D3", "D4"],
    },
    "Bredent|Narrow Sky": {
        "indication": "Indicated for bone width 4mm, 4.5mm, 5mm - Narrow Ridges.",
        "indicated_procedures": ["Single Conventional Implant"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Bredent|Blue Sky": {
        "indication": "Indicated for D1, D2, D3, D4 bone type with Immediate Loading. High Primary Stability.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "B&B Dental|EV Line": {
        "indication": "Indicated for Soft Bone with High Stability, for 14, 15, 16, 17, 24, 25, 26, 27 and D3 and D4 Bone, for Immediate Implants.",
        "indicated_teeth": ["14", "15", "16", "17", "24", "25", "26", "27"],
        "indicated_procedures": ["Immediate Implant"],
        "indicated_bone_types": ["D3", "D4"],
    },
    "B&B Dental|3P": {
        "indication": "Indicated primarily for D1 and D2 Bone Types.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants"],
        "indicated_bone_types": ["D1", "D2"],
    },
    "B&B Dental|3P Long": {
        "indication": "Indicated for Pterygoid Implant.",
        "indicated_procedures": ["All on 4", "All on 6", "All on X"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "B&B Dental|Wide Line": {
        "indication": "Indicated for Immediate extraction for 16, 17, 26, 27, 36, 37, 46, 47 for Bone Width 8mm, 9mm, 10mm.",
        "indicated_teeth": ["16", "17", "26", "27", "36", "37", "46", "47"],
        "indicated_procedures": ["Immediate Implant", "Partial Extraction Therapy"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "B&B Dental|Dura-Vit Slim": {
        "indication": "Indicated for Narrow Ridge with Bone Width 4.5mm, 5mm, 6mm, for 12, 13, 22, 23, 31, 32, 33, 41, 42, 43.",
        "indicated_teeth": ["12", "13", "22", "23", "31", "32", "33", "41", "42", "43"],
        "indicated_procedures": ["Single Conventional Implant"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Cowellmedi|INNO Submerged": {
        "indication": "Indicated for Universal use for D1, D2, D3, D4 bone, for the Delayed Protocol. SLA surface treatment.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Cowellmedi|INNO Submerged Narrow": {
        "indication": "Indicated for Narrow Ridge with Bone Width 4.5mm, 5mm, 6mm, for 11, 12, 13, 21, 22, 23, 31, 32, 33, 41, 42, 43.",
        "indicated_teeth": ["11", "12", "13", "21", "22", "23", "31", "32", "33", "41", "42", "43"],
        "indicated_procedures": ["Single Conventional Implant"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Alpha Bio|SPI": {
        "indication": "Indicated primarily for D3 and D4 bone, for Immediate Implant. Sand-blasted + double acid etched.",
        "indicated_procedures": ["Immediate Implant"],
        "indicated_bone_types": ["D3", "D4"],
    },
    "Dentsply Sirona|Ankylos C/X": {
        "indication": "Indicated for all bone type D1, D2, D3, D4, and for 11, 12, 13, 21, 22, 23. Provides excellent soft tissue stability.",
        "indicated_teeth": ["11", "12", "13", "21", "22", "23"],
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "MIS|Lance +": {
        "indication": "Indicated for D1, D2, D3, D4 Bone Types, and for Immediate Loading. SLA surface treatment.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    # ── Straumann BLX Roxolid (iter-283, Feb 2026) ───────────────────────────
    "Straumann|BLX Roxolid SLActive - RB Platform": {
        "indication": (
            "Roxolid® bone-level tapered implant with SLActive® hydrophilic "
            "surface. Indicated for D1-D4 bone types. Suitable for immediate, "
            "early and conventional placement and loading; supports all-on-4 "
            "/ all-on-6 / all-on-X rehabilitations."
        ),
        "indicated_procedures": [
            "Single Conventional Implant",
            "Multiple Conventional Implants",
            "Immediate Implant",
            "Partial Extraction Therapy",
            "All on 4",
            "All on 6",
            "All on X",
        ],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Straumann|BLX Roxolid SLActive - WB Platform": {
        "indication": (
            "Wide-Base Roxolid® bone-level tapered implant with SLActive® "
            "surface — posterior, wide-ridge and fresh extraction sockets. "
            "D1-D4 bone types. Immediate, early and conventional protocols, "
            "including full-arch all-on-X rehabilitations."
        ),
        "indicated_procedures": [
            "Single Conventional Implant",
            "Multiple Conventional Implants",
            "Immediate Implant",
            "Partial Extraction Therapy",
            "All on 4",
            "All on 6",
            "All on X",
        ],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Straumann|BLX Roxolid SLA - RB Platform": {
        "indication": (
            "Roxolid® bone-level tapered implant with conventional SLA® "
            "(sandblasted, large-grit, acid-etched) surface. D1-D4 bone "
            "types. Conventional delayed-loading single and multi-unit "
            "restorations."
        ),
        "indicated_procedures": [
            "Single Conventional Implant",
            "Multiple Conventional Implants",
        ],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Straumann|BLX Roxolid SLA - WB Platform": {
        "indication": (
            "Wide-Base Roxolid® bone-level tapered implant with conventional "
            "SLA® surface for posterior and wide-ridge indications. D1-D4 "
            "bone types, conventional delayed-loading single and multi-unit "
            "restorations."
        ),
        "indicated_procedures": [
            "Single Conventional Implant",
            "Multiple Conventional Implants",
        ],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    # ── Adin Dental Implants (iter-284, Feb 2026) ────────────────────────────
    "Adin|UNP CloseFit": {
        "indication": "Adin CloseFit Ultra-Narrow Platform (Ø2.75) with Conical Hex / Morse-taper connection and OsseoFix™ surface. Very narrow ridges, lateral incisors and mandibular incisors. D1-D4 bone types.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Adin|NP CloseFit": {
        "indication": "Adin CloseFit Narrow Platform (Ø3.0) with Conical Hex / Morse-taper connection and OsseoFix™ surface. Narrow ridges and tight spaces. D1-D4 with immediate function.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Adin|RP CloseFit": {
        "indication": "Adin CloseFit Regular Platform (Ø3.5) with Conical Hex / Morse-taper connection and OsseoFix™ surface. Standard ridges. D1-D4 with immediate function.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant", "Partial Extraction Therapy"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Adin|WP CloseFit": {
        "indication": "Adin CloseFit Wide Platform (Ø4.3 / Ø5.0) with Conical Hex / Morse-taper connection and OsseoFix™ surface. Wide ridges and posterior molars. D1-D4 with immediate function and All-on-X support.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant", "Partial Extraction Therapy", "All on 4", "All on 6", "All on X"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Adin|Touareg-OS": {
        "indication": "Adin Touareg-OS — tapered self-tapping bone-condensing 2-piece implant with Standard Internal Hex connection and OsseoFix™ (Calcium-Phosphate RBM) surface. D1-D4 with immediate function. Single, multi-unit and full-arch All-on-X.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant", "Partial Extraction Therapy", "All on 4", "All on 6", "All on X"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Adin|Touareg-S": {
        "indication": "Adin Touareg-S — tapered self-tapping bone-condensing 2-piece implant with Standard Internal Hex connection and AB/AE surface. D1-D4 with immediate function. Single, multi-unit and full-arch All-on-X.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant", "Partial Extraction Therapy", "All on 4", "All on 6", "All on X"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Adin|Swell": {
        "indication": "Adin Swell — straight parallel-walled slightly tapered 2-piece implant with V-shaped thread, Standard Internal Hex connection and AB/AE surface. Accurate positioning and load distribution. D1-D4.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Adin|One": {
        "indication": "Adin One — one-piece tapered spiral implant with AB/AE surface and integrated abutment. Narrow ridges, flapless minimally-invasive surgery, lateral/mandibular incisors. Immediate function.",
        "indicated_procedures": ["Single Conventional Implant", "Immediate Implant"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    # ── Straumann BLT (iter-292, Feb 2026) ────────────────────────────────
    "Straumann|BLT Roxolid SLActive": {
        "indication": "Roxolid® Bone Level Tapered implant with SLActive® hydrophilic surface. D1-D4. Immediate / early / conventional. Soft bone & fresh extraction sockets — primary stability via apical taper. CrossFit® connection (SC Ø2.9 / NC Ø3.3 / RC Ø4.1 / RC Ø4.8).",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant", "Partial Extraction Therapy", "All on 4", "All on 6", "All on X"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Straumann|BLT Roxolid SLA": {
        "indication": "Roxolid® Bone Level Tapered implant with conventional SLA® surface. D1-D4. Conventional & immediate placement, conventional loading. CrossFit® connection.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant", "Partial Extraction Therapy"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Straumann|BLT Ti SLA": {
        "indication": "Ti Grade 4 Bone Level Tapered implant with SLA® surface. D1-D4. Conventional & immediate placement. CrossFit® connection (NC/RC).",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant", "Partial Extraction Therapy"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    # ── Alpha-Bio brochure-derived systems (iter-182) ────────────────────────
    "Alpha Bio|ATID": {
        "indication": "Suitable for D1 and D2 bone types and conventional loading protocols.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants"],
        "indicated_bone_types": ["D1", "D2"],
    },
    "Alpha Bio|DFI": {
        "indication": "Indicated in D1, D2, D3, and D4 bone types. Offers both cylindrical and tapered implant design advantages.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Alpha Bio|ICE": {
        "indication": "Indicated for D1, D2, D3 bone types. Improved stress distribution; stable placement where denser bone is desired.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants"],
        "indicated_bone_types": ["D1", "D2", "D3"],
    },
    "Alpha Bio|NICE": {
        "indication": "Indicated for narrow alveolar ridges with 4mm, 4.5mm, and 5mm bone width. Suitable for D1, D2, D3, D4 bone types.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Alpha Bio|NeO Conical Hex Connection": {
        "indication": "Indicated for D1, D2, D3, and D4 bone types and for narrow ridges, limited interdental spaces, and esthetic-zone restorations.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Alpha Bio|NeO Conical Standard Connection": {
        "indication": "Indicated for immediate and delayed loading and soft-tissue preservation in the high-esthetics zone.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Alpha Bio|NeO Internal Hex Connection": {
        "indication": "Indicated in D2, D3, and D4 bone types. Suitable for cases requiring high primary stability, immediate or delayed placement and loading.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant"],
        "indicated_bone_types": ["D2", "D3", "D4"],
    },
}

# Map Suggest Me procedure types → New Case procedure types for indication matching
SUGGEST_ME_TO_CASE_PROCEDURES = {
    "Conventional Implant Placement": ["Single Conventional Implant", "Multiple Conventional Implants"],
    "Conventional Implant Placement with Bone Graft": ["Implant Placement with Guided Bone Regeneration"],
    "Immediate Implant Placement": ["Immediate Implant", "Partial Extraction Therapy"],
    "Immediate Implant Placement with Bone Graft": ["Immediate Implant", "Implant Placement with Guided Bone Regeneration"],
    "Sinus Lift": [],
    "Restricted Bone Height": [],
}

BRAND_NAME_CORRECTIONS = {
    "Noble Biocare": "Nobel Biocare",
}

@api_router.get("/implant-library/systems")
async def get_implant_systems(response: Response, current_user: dict = Depends(get_current_user)):
    """Return implant systems grouped by brand+system with indications and restrictions."""
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    pipeline = [
        {"$group": {
            "_id": {"brand": "$brand", "system": "$system"},
            "diameters": {"$addToSet": "$diameter"},
            "lengths": {"$addToSet": "$length"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id.brand": 1, "_id.system": 1}},
    ]
    results = await db.implant_library.aggregate(pipeline).to_list(200)
    systems = []
    for r in results:
        brand = r["_id"]["brand"]
        system = r["_id"]["system"]
        key = f"{brand}|{system}"
        ind_data = IMPLANT_INDICATIONS.get(key, {})
        entry = {
            "brand": brand,
            "system": system,
            "diameters": sorted(r["diameters"]),
            "lengths": sorted(r["lengths"]),
            "count": r["count"],
            "indication": ind_data.get("indication", ""),
            "indicated_procedures": ind_data.get("indicated_procedures", []),
            "indicated_bone_types": ind_data.get("indicated_bone_types", []),
        }
        if "restricted_teeth" in ind_data:
            entry["restricted_teeth"] = ind_data["restricted_teeth"]
        if "indicated_teeth" in ind_data:
            entry["indicated_teeth"] = ind_data["indicated_teeth"]
        systems.append(entry)
    return systems

@api_router.get("/implant-library/tooth-recommendations")
async def get_tooth_recommendations(current_user: dict = Depends(get_current_user)):
    return TOOTH_RECOMMENDATIONS

@api_router.get("/implant-library/tooth-recommendations/{tooth}")
async def get_tooth_recommendation(tooth: str, current_user: dict = Depends(get_current_user)):
    if tooth not in TOOTH_RECOMMENDATIONS:
        raise HTTPException(status_code=404, detail=f"No recommendation for tooth {tooth}")
    return TOOTH_RECOMMENDATIONS[tooth]

@api_router.get("/implant-library/suggest")
async def suggest_implant(
    system: str,
    brand: str,
    bone_width: float,
    bone_height: float,
    tooth: Optional[str] = None,
    bone_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Implant suggestion engine (per user specification sections 8-11).
    Bone width rule: maintain >=1.5mm bone around implant.
    Bone height rule: maintain 2mm clearance from nerve/sinus.
    """
    tooth_data = TOOTH_RECOMMENDATIONS.get(tooth) if tooth else None

    # Bone Width Algorithm (section 8): determine max diameter
    if bone_width < 5:
        diam_min, diam_max = 3.0, 3.5
    elif bone_width < 6:
        diam_min, diam_max = 3.75, 4.0
    elif bone_width < 7:
        diam_min, diam_max = 4.0, 4.5
    else:
        diam_min, diam_max = 4.5, 6.0

    # Intersect with tooth-specific diameter range
    if tooth_data:
        diam_min = max(diam_min, tooth_data["diameter"][0])
        diam_max = min(diam_max, tooth_data["diameter"][1])
        if diam_min > diam_max:
            diam_min, diam_max = tooth_data["diameter"][0], tooth_data["diameter"][1]

    # Bone Height Algorithm (section 9): determine length range
    max_length = bone_height - 2.0  # 2mm safety clearance
    if bone_height >= 13:
        length_label = "Long implant"
        len_min, len_max = 11.5, min(14.0, max_length)
    elif bone_height >= 10:
        length_label = "Standard implant"
        len_min, len_max = 10.0, min(12.0, max_length)
    elif bone_height >= 8:
        length_label = "Short implant"
        len_min, len_max = 7.0, min(10.0, max_length)
    else:
        length_label = "Insufficient bone height"
        len_min, len_max = 0, max_length

    # Intersect with tooth-specific length range
    if tooth_data:
        len_min = max(len_min, tooth_data["length"][0])
        len_max = min(len_max, tooth_data["length"][1])
        if len_min > len_max:
            len_min, len_max = tooth_data["length"][0], tooth_data["length"][1]

    # Query matching implants
    query = {
        "brand": brand, "system": system,
        "diameter": {"$gte": diam_min, "$lte": diam_max},
        "length": {"$gte": len_min, "$lte": len_max},
    }
    recommended = await db.implant_library.find(query, {"_id": 0}).sort([("diameter", 1), ("length", 1)]).to_list(50)

    # Wider fallback if no exact matches
    if not recommended:
        query_wider = {
            "brand": brand, "system": system,
            "diameter": {"$gte": diam_min - 0.5, "$lte": diam_max + 0.5},
            "length": {"$gte": max(len_min - 2, 6), "$lte": len_max + 2},
        }
        recommended = await db.implant_library.find(query_wider, {"_id": 0}).sort([("diameter", 1), ("length", 1)]).to_list(50)

    all_implants = await db.implant_library.find(
        {"brand": brand, "system": system}, {"_id": 0}
    ).sort([("diameter", 1), ("length", 1)]).to_list(200)

    response = {
        "recommended": recommended,
        "all_options": all_implants,
        "clinical_guidance": {
            "bone_width": bone_width,
            "bone_height": bone_height,
            "recommended_diameter_range": f"{diam_min}–{diam_max} mm",
            "recommended_length_range": f"{len_min}–{len_max} mm",
            "length_category": length_label,
            "safety_note": "Maintain >=1.5 mm bone around implant and >=2 mm clearance from inferior alveolar nerve / maxillary sinus.",
        },
    }

    if tooth_data:
        response["tooth_recommendation"] = {
            "tooth": tooth,
            "region": tooth_data["region"],
            "recommended_diameter": f"{tooth_data['diameter'][0]}–{tooth_data['diameter'][1]} mm",
            "recommended_length": f"{tooth_data['length'][0]}–{tooth_data['length'][1]} mm",
        }

    # Narrow ridge evaluation (always included when bone_width < 6)
    if bone_width < 6:
        tooth_region = _get_tooth_region(tooth) if tooth else None
        response["narrow_ridge_evaluation"] = evaluate_narrow_ridge(bone_width, bone_density=bone_type, tooth_region=tooth_region)
        # High constraint: narrow ridge + restricted height
        if bone_height <= 10:
            response["high_constraint_evaluation"] = evaluate_high_constraint(tooth, bone_width, bone_height, bone_type)
        # Also return narrow diameter options (<=3.5mm) for narrow ridge cases
        narrow_query = {
            "brand": brand, "system": system,
            "diameter": {"$lte": 3.5},
            "length": {"$gte": len_min, "$lte": len_max},
        }
        narrow_options = await db.implant_library.find(narrow_query, {"_id": 0}).sort([("diameter", 1), ("length", 1)]).to_list(50)
        if not narrow_options:
            # Fallback: wider length range for narrow diameter
            narrow_query_wider = {
                "brand": brand, "system": system,
                "diameter": {"$lte": 3.5},
            }
            narrow_options = await db.implant_library.find(narrow_query_wider, {"_id": 0}).sort([("diameter", 1), ("length", 1)]).to_list(50)
        response["narrow_options"] = narrow_options
        if not narrow_options:
            response["narrow_ridge_warning"] = f"No narrow diameter (\u22643.5mm) implants available for {brand} {system}. Consider a system with narrow implant options."

    return response

# Procedure → Bone Type compatibility (Indication Dictionary)
PROCEDURE_BONE_COMPATIBILITY = {
    "Conventional Implant Placement": {
        "allowedBone": ["D1", "D2", "D3", "D4"],
    },
    "Conventional Implant Placement with Bone Graft": {
        "allowedBone": ["D1", "D2", "D3", "D4"],
    },
    "Immediate Implant Placement": {
        "allowedBone": ["D1", "D2", "D3"],
    },
    "Immediate Implant Placement with Bone Graft": {
        "allowedBone": ["D2", "D3", "D4"],
    },
    "Sinus Lift": {
        "allowedBone": ["D3", "D4"],
    },
    "Restricted Bone Height": {
        "allowedBone": ["D1", "D2", "D3", "D4"],
    },
    "Narrow Ridge": {
        "allowedBone": ["D1", "D2", "D3", "D4"],
    },
}

PROCEDURE_LIST = list(PROCEDURE_BONE_COMPATIBILITY.keys())

# ── Narrow Ridge Clinical Decision Engine ─────────────────────
NARROW_RIDGE_CONFIG = {
    "version": "1.0",
    "classification": [
        {"min": 6, "label": "adequate", "clinical_action": "standard_implant"},
        {"min": 4.5, "max": 6, "label": "mild_narrow", "clinical_action": "standard_or_narrow"},
        {"min": 3, "max": 4.5, "label": "moderate_narrow", "clinical_action": "narrow_or_expansion"},
        {"max": 3, "label": "severe_narrow", "clinical_action": "augmentation_required"},
    ],
    "decision_logic": [
        {
            "min": 6,
            "recommendation": {
                "implant_type": "standard", "protocols": ["conventional_drilling"],
                "label": "Standard implant placement indicated",
            },
        },
        {
            "min": 4.5, "max": 6,
            "recommendation": {
                "implant_type": "standard_or_narrow", "protocols": ["conventional_drilling"],
                "label": "Standard or narrow implant; conventional drilling protocol",
            },
        },
        {
            "min": 3, "max": 4.5,
            "recommendation": {
                "implant_type": "narrow", "protocols": ["undersized_drilling", "ridge_expansion", "split_crest"],
                "label": "Narrow implant with ridge modification protocol",
            },
        },
        {
            "max": 3,
            "recommendation": {
                "implant_type": None, "protocols": ["GBR", "block_graft"],
                "action": "block_implant",
                "label": "Implant placement not possible; bone augmentation required",
            },
        },
    ],
    "bone_density_protocol": {
        "D1": {"key": "full_drilling", "label": "Full sequential drilling"},
        "D2": {"key": "slight_undersizing", "label": "Slight undersizing for better primary stability"},
        "D3": {"key": "undersized_drilling", "label": "Undersized drilling for enhanced primary stability"},
        "D4": {"key": "osteotome_or_minimal_drilling", "label": "Osteotome technique or minimal drilling"},
    },
}

CLASSIFICATION_LABELS = {
    "adequate": "Adequate Ridge Width",
    "mild_narrow": "Mildly Narrow Ridge",
    "moderate_narrow": "Moderately Narrow Ridge",
    "severe_narrow": "Severely Narrow Ridge",
}

CLASSIFICATION_SEVERITY = {
    "adequate": "safe",
    "mild_narrow": "info",
    "moderate_narrow": "warning",
    "severe_narrow": "critical",
}


def evaluate_narrow_ridge(
    ridge_width_mm: float,
    implant_diameter_mm: float = None,
    bone_density: str = None,
    tooth_region: str = None,
) -> dict:
    """Evaluate narrow ridge clinical decision engine and return classification, recommendations, warnings."""
    output = {
        "classification": None,
        "classification_label": None,
        "clinical_action": None,
        "severity": None,
        "recommendation": {},
        "warnings": [],
        "blocked": False,
        "ridge_width_mm": ridge_width_mm,
    }

    # 1. Ridge width classification
    for rule in NARROW_RIDGE_CONFIG["classification"]:
        min_val = rule.get("min")
        max_val = rule.get("max")
        if (min_val is None or ridge_width_mm >= min_val) and (max_val is None or ridge_width_mm < max_val):
            output["classification"] = rule["label"]
            output["clinical_action"] = rule["clinical_action"]
            break
    output["classification_label"] = CLASSIFICATION_LABELS.get(output["classification"], "Unknown")
    output["severity"] = CLASSIFICATION_SEVERITY.get(output["classification"], "info")

    # 2. Decision logic — recommendation
    for rule in NARROW_RIDGE_CONFIG["decision_logic"]:
        min_val = rule.get("min")
        max_val = rule.get("max")
        if (min_val is None or ridge_width_mm >= min_val) and (max_val is None or ridge_width_mm < max_val):
            output["recommendation"] = dict(rule["recommendation"])
            if rule["recommendation"].get("action") == "block_implant":
                output["blocked"] = True
            break

    # 3. Safety rules
    if ridge_width_mm < 3:
        output["warnings"].append({
            "id": "severe_ridge", "severity": "critical",
            "message": "Ridge width <3mm: Bone augmentation (GBR or block graft) required before implant placement.",
        })
    if implant_diameter_mm and ridge_width_mm - implant_diameter_mm < 2:
        remaining = round(ridge_width_mm - implant_diameter_mm, 1)
        output["warnings"].append({
            "id": "bone_envelope", "severity": "high",
            "message": f"Insufficient bone envelope: {remaining}mm remaining ({ridge_width_mm}mm ridge - {implant_diameter_mm}mm implant). Minimum 1mm buccal/lingual required.",
        })

    # 4. Bone density drilling protocol
    if bone_density and bone_density in NARROW_RIDGE_CONFIG["bone_density_protocol"]:
        dp = NARROW_RIDGE_CONFIG["bone_density_protocol"][bone_density]
        output["recommendation"]["drilling_protocol"] = dp["key"]
        output["recommendation"]["drilling_protocol_label"] = dp["label"]

    # 5. Prosthetic rules
    if implant_diameter_mm and tooth_region:
        if implant_diameter_mm <= 3.5 and tooth_region.lower() == "molar":
            output["warnings"].append({
                "id": "narrow_in_molar", "severity": "warning",
                "message": "Avoid narrow implants in molar region — higher occlusal forces may compromise implant longevity.",
            })
        if implant_diameter_mm <= 3.3:
            output["warnings"].append({
                "id": "splinting_needed", "severity": "info",
                "message": "Consider splinting adjacent implants for better load distribution with narrow diameter.",
            })

    return output


# ── High Constraint Mode (Narrow Ridge + Restricted Height) ──
def _get_arch(tooth: str) -> str:
    if not tooth:
        return "unknown"
    try:
        num = int(tooth)
        return "maxilla" if 11 <= num <= 28 else "mandible" if 31 <= num <= 48 else "unknown"
    except Exception:
        return "unknown"


def _get_position(tooth: str) -> str:
    if not tooth:
        return "unknown"
    try:
        unit = int(tooth) % 10
        return "anterior" if unit in (1, 2, 3) else "premolar" if unit in (4, 5) else "molar"
    except Exception:
        return "unknown"


def evaluate_high_constraint(tooth: str, bone_width: float, bone_height: float, bone_type: str = None) -> dict:
    """Combined narrow ridge + restricted bone height: region-specific clinical decision."""
    arch = _get_arch(tooth)
    position = _get_position(tooth)
    is_posterior = position in ("premolar", "molar")
    region = f"{'posterior' if is_posterior else 'anterior'}_{arch}" if arch != "unknown" else "unknown"

    if arch == "maxilla":
        aug = "Sinus Lift" if is_posterior else "GBR / Block Graft"
        return {
            "active": True, "region": region, "arch": arch, "position": position,
            "anatomical_constraint": "maxillary_sinus" if is_posterior else "nasal_floor",
            "typical_bone_density": "D3-D4",
            "primary_option": f"Augmentation Preferred ({aug})",
            "secondary_option": "Narrow Short Implant",
            "implant_filter": {"max_diameter": 3.5, "preferred_length": 8, "avoid_length_below": 6},
            "risk_level": "HIGH",
            "risk_adjustments": {"short_implant_penalty": 3, "soft_bone_penalty": 3},
            "recommendations": [
                f"{aug} + standard implant",
                "3.3\u20133.5 mm \u00d7 8 mm implant (compromise)",
            ],
            "warnings": [
                "Low primary stability expected",
                "Splinting mandatory",
                "Avoid ultra-short implants",
            ],
        }
    elif arch == "mandible":
        nerve_warn = (
            "Maintain 2 mm from IAN" if is_posterior
            else "Maintain 2 mm from mental foramen" if position == "premolar"
            else "Consider bone augmentation for anterior mandible"
        )
        return {
            "active": True, "region": region, "arch": arch, "position": position,
            "anatomical_constraint": "inferior_alveolar_nerve" if is_posterior else ("mental_foramen" if position == "premolar" else "mandibular_symphysis"),
            "typical_bone_density": "D1-D2",
            "primary_option": "Narrow Short Implant",
            "secondary_option": "Ultra Short Implant",
            "implant_filter": {"max_diameter": 3.5, "length_min": 6, "length_max": 8, "allow_ultra_short": True},
            "risk_level": "MODERATE",
            "risk_adjustments": {"short_implant_penalty": 1, "nerve_penalty": 4},
            "recommendations": [
                "3.3\u20133.5 mm \u00d7 6\u20138 mm implant",
                "Ultra-short implant (if severe height loss)",
            ],
            "warnings": [nerve_warn, "Splinting recommended"],
        }
    return {
        "active": True, "region": region, "arch": arch, "position": position,
        "primary_option": "Augmentation + Narrow Short Implant",
        "secondary_option": "Narrow Short Implant",
        "implant_filter": {"max_diameter": 3.5, "length_min": 6, "length_max": 8},
        "risk_level": "HIGH",
        "recommendations": ["Bone augmentation + standard implant", "3.3\u20133.5 mm \u00d7 6\u20138 mm implant (compromise)"],
        "warnings": ["Both narrow ridge and restricted height detected", "Splinting recommended"],
    }


@api_router.get("/implant-library/procedure-options")
async def get_procedure_options(current_user: dict = Depends(get_current_user)):
    """Return available procedure types and bone compatibility info."""
    return {
        "procedures": PROCEDURE_LIST,
        "bone_types": ["D1", "D2", "D3", "D4"],
        "compatibility": PROCEDURE_BONE_COMPATIBILITY,
    }

@api_router.post("/implant-library/suggest-auto")
async def suggest_auto(
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    """
    Suggest Me engine: auto-suggest implants based on clinical conditions.
    Body: { tooth?, procedures: [], bone_type, bone_width, bone_height }
    """
    procedures = body.get("procedures", [])
    bone_type = body.get("bone_type", "")
    bone_width = float(body.get("bone_width", 0))
    bone_height = float(body.get("bone_height", 0))
    tooth = body.get("tooth")

    if not procedures or not bone_type or bone_width <= 0 or bone_height <= 0:
        raise HTTPException(status_code=400, detail="Missing required fields")

    # Validate procedure + bone type compatibility
    warnings = []
    valid_procedures = []
    for proc in procedures:
        compat = PROCEDURE_BONE_COMPATIBILITY.get(proc)
        if not compat:
            warnings.append(f"Unknown procedure: {proc}")
            continue
        if bone_type not in compat["allowedBone"]:
            warnings.append(f"{proc} is not recommended for bone type {bone_type}")
        else:
            valid_procedures.append(proc)

    # Bone Width → Diameter range
    if bone_width < 5:
        diam_min, diam_max = 3.0, 3.5
    elif bone_width < 6:
        diam_min, diam_max = 3.75, 4.0
    elif bone_width < 7:
        diam_min, diam_max = 4.0, 4.5
    else:
        diam_min, diam_max = 4.5, 6.0

    # ─── Restricted Bone Height Logic (≤ 10mm) ──────────────────
    is_restricted_height = bone_height <= 10 or "Restricted Bone Height" in procedures
    is_high_constraint = is_restricted_height and bone_width < 6  # narrow + restricted
    if is_high_constraint:
        diam_max = min(diam_max, 3.5)  # Cap diameter for high constraint
    if is_restricted_height:
        PRIORITY1_KEYS = {
            "BioHorizons|Tapered Short",
            "BioHorizons|Tapered Short Conical RBT",
            "Bredent|Copa Sky",
            "Dentsply Sirona|Ankylos C/X",
        }
        # Priority 1: Query P1 systems filtered by diameter only (no length/bone_type filter)
        p1_conditions = [{"brand": k.split("|")[0], "system": k.split("|")[1]} for k in PRIORITY1_KEYS]
        p1_query = {"$or": p1_conditions, "diameter": {"$gte": diam_min, "$lte": diam_max}}
        p1_implants = await db.implant_library.find(p1_query, {"_id": 0}).sort(
            [("brand", 1), ("system", 1), ("diameter", 1), ("length", 1)]
        ).to_list(500)
        # Apply tooth restrictions to P1
        p1_filtered = []
        for imp in p1_implants:
            key = f"{imp['brand']}|{imp['system']}"
            ind = IMPLANT_INDICATIONS.get(key, {})
            restricted = ind.get("restricted_teeth")
            if restricted and tooth and tooth not in restricted:
                continue
            p1_filtered.append(imp)
        # Group P1 by system
        p1_systems = {}
        for imp in p1_filtered:
            key = f"{imp['brand']}|{imp['system']}"
            if key not in p1_systems:
                ind = IMPLANT_INDICATIONS.get(key, {})
                p1_systems[key] = {
                    "brand": imp["brand"], "system": imp["system"],
                    "indication": ind.get("indication", ""),
                    "priority": 1, "priority_label": "Recommended for Restricted Bone Height",
                    "procedure_match": True, "implants": [],
                }
            p1_systems[key]["implants"].append({"diameter": imp["diameter"], "length": imp["length"]})
        # Priority 2: All other systems with length ≤ 8mm, filtered by diameter
        p2_query = {"diameter": {"$gte": diam_min, "$lte": diam_max}, "length": {"$lte": 8.0}}
        p2_all = await db.implant_library.find(p2_query, {"_id": 0}).sort(
            [("length", 1), ("brand", 1), ("system", 1), ("diameter", 1)]
        ).to_list(500)
        # Exclude P1, apply tooth restrictions, require indications
        p2_filtered = []
        for imp in p2_all:
            key = f"{imp['brand']}|{imp['system']}"
            if key in PRIORITY1_KEYS:
                continue
            ind = IMPLANT_INDICATIONS.get(key, {})
            if not ind.get("indication"):
                continue
            restricted = ind.get("restricted_teeth")
            if restricted and tooth and tooth not in restricted:
                continue
            p2_filtered.append(imp)
        # Group P2 by system with min_length tracking
        p2_systems = {}
        for imp in p2_filtered:
            key = f"{imp['brand']}|{imp['system']}"
            if key not in p2_systems:
                ind = IMPLANT_INDICATIONS.get(key, {})
                p2_systems[key] = {
                    "brand": imp["brand"], "system": imp["system"],
                    "indication": ind.get("indication", ""),
                    "priority": 2, "priority_label": "Short Implant Option",
                    "procedure_match": False, "implants": [],
                    "_min_length": imp["length"],
                }
            p2_systems[key]["implants"].append({"diameter": imp["diameter"], "length": imp["length"]})
            if imp["length"] < p2_systems[key]["_min_length"]:
                p2_systems[key]["_min_length"] = imp["length"]
        # Sort: P1 alphabetically, P2 by shortest length then alphabetically
        p1_sorted = sorted(p1_systems.values(), key=lambda s: (s["brand"], s["system"]))
        p2_sorted = sorted(p2_systems.values(), key=lambda s: (s["_min_length"], s["brand"], s["system"]))
        for s in p2_sorted:
            del s["_min_length"]
        recommended_systems = p1_sorted + p2_sorted
        # Build tooth recommendation
        tooth_data = TOOTH_RECOMMENDATIONS.get(tooth) if tooth else None
        tooth_rec = None
        if tooth_data:
            tooth_rec = {
                "tooth": tooth, "region": tooth_data["region"],
                "recommended_diameter": f"{tooth_data['diameter'][0]}–{tooth_data['diameter'][1]} mm",
                "recommended_length": f"{tooth_data['length'][0]}–{tooth_data['length'][1]} mm",
            }
        # D3/D4 caution warning with tooth-specific augmentation advice
        restricted_height_warning = None
        if bone_type in ("D3", "D4"):
            msg = "Short implants are ideal and preferred for D1 and D2-type bone only. Make a decision cautiously."
            maxillary_posterior = {"14", "15", "16", "17", "24", "25", "26", "27"}
            mandibular_posterior = {"34", "35", "36", "37", "44", "45", "46", "47"}
            if tooth and tooth in maxillary_posterior:
                msg += " Advised to increase bone length by Indirect or Direct Sinus Lift."
            elif tooth and tooth in mandibular_posterior:
                msg += " Advised to increase bone length by Vertical Bone Augmentation."
            restricted_height_warning = msg

        return {
            "recommended_systems": recommended_systems,
            "restricted_bone_height": True,
            "restricted_height_warning": restricted_height_warning,
            "narrow_ridge_evaluation": evaluate_narrow_ridge(bone_width, bone_density=bone_type, tooth_region=_get_tooth_region(tooth) if tooth else None),
            "high_constraint_evaluation": evaluate_high_constraint(tooth, bone_width, bone_height, bone_type) if is_high_constraint else None,
            "clinical_guidance": {
                "bone_width": bone_width, "bone_height": bone_height,
                "bone_type": bone_type, "procedures": procedures,
                "recommended_diameter_range": f"{diam_min}–{diam_max} mm",
                "recommended_length_range": "Short implants for restricted height",
                "length_category": "Restricted bone height",
            },
            "tooth_recommendation": tooth_rec,
            "validation_warnings": warnings,
            "valid_procedures": valid_procedures,
        }

    # ─── Narrow Ridge Block: bone_width < 3mm → augmentation required ──
    nr_eval = evaluate_narrow_ridge(bone_width, bone_density=bone_type, tooth_region=_get_tooth_region(tooth) if tooth else None)
    if nr_eval["blocked"]:
        tooth_data = TOOTH_RECOMMENDATIONS.get(tooth) if tooth else None
        tooth_rec = None
        if tooth_data:
            tooth_rec = {
                "tooth": tooth, "region": tooth_data["region"],
                "recommended_diameter": f"{tooth_data['diameter'][0]}–{tooth_data['diameter'][1]} mm",
                "recommended_length": f"{tooth_data['length'][0]}–{tooth_data['length'][1]} mm",
            }
        return {
            "recommended_systems": [],
            "narrow_ridge_evaluation": nr_eval,
            "narrow_ridge_blocked": True,
            "clinical_guidance": {
                "bone_width": bone_width, "bone_height": bone_height,
                "bone_type": bone_type, "procedures": procedures,
                "recommended_diameter_range": "N/A — augmentation required",
                "recommended_length_range": "N/A — augmentation required",
                "length_category": "Bone augmentation required",
            },
            "tooth_recommendation": tooth_rec,
            "validation_warnings": warnings + [w["message"] for w in nr_eval["warnings"]],
            "valid_procedures": valid_procedures,
        }

    # ─── Normal Bone Height → Length range ──────────────────────
    if bone_height >= 13:
        len_min, len_max = 11.5, 15.0
        length_label = "Long implant"
    elif bone_height > 10:
        len_min, len_max = 10.0, 13.0
        length_label = "Standard implant"
    elif bone_height >= 8:
        len_min, len_max = 8.0, 10.0
        length_label = "Short implant"
    else:
        len_min, len_max = 6.0, 8.0
        length_label = "Very short implant"

    # Query all matching implants across all systems
    query = {
        "diameter": {"$gte": diam_min, "$lte": diam_max},
        "length": {"$gte": len_min, "$lte": len_max},
    }
    all_matching = await db.implant_library.find(query, {"_id": 0}).sort(
        [("brand", 1), ("system", 1), ("diameter", 1), ("length", 1)]
    ).to_list(500)

    # Check tooth restrictions and filter to indication-only systems
    # Also match against selected procedures using SUGGEST_ME_TO_CASE_PROCEDURES mapping
    mapped_case_procedures = set()
    for proc in procedures:
        mapped_case_procedures.update(SUGGEST_ME_TO_CASE_PROCEDURES.get(proc, []))

    filtered = []
    for imp in all_matching:
        key = f"{imp['brand']}|{imp['system']}"
        ind = IMPLANT_INDICATIONS.get(key, {})
        # Only include systems that have indications
        if not ind.get("indication"):
            continue
        # Check tooth restrictions
        restricted = ind.get("restricted_teeth")
        if restricted and tooth and tooth not in restricted:
            continue
        # Check bone type match
        indicated_bone = ind.get("indicated_bone_types", [])
        if indicated_bone and bone_type and bone_type not in indicated_bone:
            continue
        filtered.append(imp)
    all_matching = filtered

    # Group by system
    systems_map = {}
    for imp in all_matching:
        key = f"{imp['brand']}|{imp['system']}"
        if key not in systems_map:
            ind = IMPLANT_INDICATIONS.get(key, {})
            sys_indicated_procs = ind.get("indicated_procedures", [])
            proc_match = bool(mapped_case_procedures & set(sys_indicated_procs)) if mapped_case_procedures else False
            systems_map[key] = {
                "brand": imp["brand"],
                "system": imp["system"],
                "indication": ind.get("indication", ""),
                "indicated_procedures": sys_indicated_procs,
                "procedure_match": proc_match,
                "implants": [],
            }
        systems_map[key]["implants"].append({
            "diameter": imp["diameter"],
            "length": imp["length"],
        })

    # Sort: procedure-matched systems first, then alphabetically
    recommended_systems = sorted(
        systems_map.values(),
        key=lambda s: (0 if s["procedure_match"] else 1, s["brand"], s["system"])
    )

    # Build tooth recommendation
    tooth_data = TOOTH_RECOMMENDATIONS.get(tooth) if tooth else None
    tooth_rec = None
    if tooth_data:
        tooth_rec = {
            "tooth": tooth,
            "region": tooth_data["region"],
            "recommended_diameter": f"{tooth_data['diameter'][0]}–{tooth_data['diameter'][1]} mm",
            "recommended_length": f"{tooth_data['length'][0]}–{tooth_data['length'][1]} mm",
        }

    return {
        "recommended_systems": recommended_systems,
        "narrow_ridge_evaluation": nr_eval,
        "high_constraint_evaluation": evaluate_high_constraint(tooth, bone_width, bone_height, bone_type) if (bone_width < 6 and bone_height <= 10) else None,
        "clinical_guidance": {
            "bone_width": bone_width,
            "bone_height": bone_height,
            "bone_type": bone_type,
            "procedures": procedures,
            "recommended_diameter_range": f"{diam_min}–{diam_max} mm",
            "recommended_length_range": f"{len_min}–{len_max} mm",
            "length_category": length_label,
        },
        "tooth_recommendation": tooth_rec,
        "validation_warnings": warnings,
        "valid_procedures": valid_procedures,
    }

# ── Implant Risk Calculator ──────────────────────────────────

PROCEDURE_RISK_SCORES = {
    "Conventional Implant Placement": 1,
    "Conventional Implant Placement with Bone Graft": 2,
    "Immediate Implant Placement": 2,
    "Immediate Implant Placement with Bone Graft": 2,
    "Sinus Lift": 3,
    "Restricted Bone Height": 3,
    "Narrow Ridge": 3,
}

BONE_DENSITY_SCORES = {"D1": 1, "D2": 1, "D3": 2, "D4": 3}

def _get_tooth_region(tooth: str) -> str:
    """Return anterior/premolar/molar for an FDI tooth number."""
    unit = int(tooth) % 10
    if unit in (1, 2, 3):
        return "Anterior"
    if unit in (4, 5):
        return "Premolar"
    return "Molar"

TOOTH_REGION_SCORES = {"Anterior": 1, "Premolar": 2, "Molar": 3}

def _score_label(score: int) -> str:
    if score <= 1:
        return "Low"
    if score <= 2:
        return "Moderate"
    return "High"

@api_router.post("/implant-library/calculate-risk")
async def calculate_risk(
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    """
    Implant Risk Calculator.
    Body: { bone_width, bone_height, implant_diameter, implant_length,
            bone_type, procedure, tooth, medical_assessment? }
    medical_assessment: { diabetes, smoking, anticoagulant, osteoporosis, radiation }
    """
    bone_width = float(body.get("bone_width", 0))
    bone_height = float(body.get("bone_height", 0))
    implant_diameter = float(body.get("implant_diameter", 0))
    implant_length = float(body.get("implant_length", 0))
    bone_type = body.get("bone_type", "")
    procedure = body.get("procedure", "")
    tooth = body.get("tooth", "")
    medical = body.get("medical_assessment", {})

    if not all([bone_width, bone_height, implant_diameter, implant_length, bone_type, procedure, tooth]):
        raise HTTPException(status_code=400, detail="All fields are required")

    # 1. Width risk
    remaining_width = bone_width - implant_diameter
    if remaining_width >= 3:
        width_score = 1
    elif remaining_width >= 2:
        width_score = 2
    else:
        width_score = 3

    # 2. Height risk
    remaining_height = bone_height - implant_length
    if remaining_height >= 3:
        height_score = 1
    elif remaining_height >= 2:
        height_score = 2
    else:
        height_score = 3

    # 3. Bone density risk
    density_score = BONE_DENSITY_SCORES.get(bone_type, 2)

    # 4. Procedure risk
    procedure_score = PROCEDURE_RISK_SCORES.get(procedure, 2)

    # 5. Tooth position risk
    region = _get_tooth_region(tooth)
    tooth_score = TOOTH_REGION_SCORES.get(region, 2)

    # 6. Medical risk factors (granular scoring)
    medical_score = 1
    medical_warnings = []
    medical_details_parts = []

    if medical:
        factor_scores = {}

        # Diabetes: No=1, Controlled=2, Uncontrolled=3
        diabetes_val = medical.get("diabetes", "No")
        if diabetes_val == "Uncontrolled":
            factor_scores["diabetes"] = 3
            medical_warnings.append("Uncontrolled diabetes - delay implant until glycemic control achieved")
        elif diabetes_val == "Controlled":
            factor_scores["diabetes"] = 2
        else:
            factor_scores["diabetes"] = 1

        # Smoking: No=1, Light=2, Heavy=3
        smoking_val = medical.get("smoking", "No")
        if smoking_val.startswith("Heavy"):
            factor_scores["smoking"] = 3
            medical_warnings.append("Heavy smoking - smoking cessation protocol required")
        elif smoking_val.startswith("Light"):
            factor_scores["smoking"] = 2
        else:
            factor_scores["smoking"] = 1

        # Anticoagulant: No=1, Yes=2
        factor_scores["anticoagulant"] = 2 if medical.get("anticoagulant") == "Yes" else 1
        if medical.get("anticoagulant") == "Yes":
            medical_warnings.append("Coordinate with physician for anticoagulant management")

        # Osteoporosis: No=1, Yes=3 (MRONJ risk)
        factor_scores["osteoporosis"] = 3 if medical.get("osteoporosis") == "Yes" else 1
        if medical.get("osteoporosis") == "Yes":
            medical_warnings.append("MRONJ risk - evaluate bisphosphonate therapy duration")

        # Radiation: No=1, Yes=3 (Osteoradionecrosis)
        factor_scores["radiation"] = 3 if medical.get("radiation") == "Yes" else 1
        if medical.get("radiation") == "Yes":
            medical_warnings.append("Osteoradionecrosis risk - assess radiation dose and field")

        # Override: force HIGH if any factor is 3
        has_high_risk_factor = any(s == 3 for s in factor_scores.values())
        elevated_count = sum(1 for s in factor_scores.values() if s > 1)
        medical_score_total = sum(factor_scores.values())

        if has_high_risk_factor or elevated_count >= 2:
            medical_score = 3
        elif elevated_count == 1:
            medical_score = 2
        else:
            medical_score = 1

        # Build details string
        for key, score in factor_scores.items():
            label_map = {"diabetes": "Diabetes", "smoking": "Smoking", "anticoagulant": "Anticoagulant", "osteoporosis": "Osteoporosis", "radiation": "Radiation"}
            val = medical.get(key, "No")
            if score > 1:
                medical_details_parts.append(f"{label_map.get(key, key)}: {val}")
    
    medical_details = ", ".join(medical_details_parts) if medical_details_parts else "None"

    factors = [
        {"factor": "Bone Width", "remaining": round(remaining_width, 1), "risk": _score_label(width_score), "score": width_score},
        {"factor": "Bone Height", "remaining": round(remaining_height, 1), "risk": _score_label(height_score), "score": height_score},
        {"factor": "Bone Density", "detail": bone_type, "risk": _score_label(density_score), "score": density_score},
        {"factor": "Procedure", "detail": procedure, "risk": _score_label(procedure_score), "score": procedure_score},
        {"factor": "Tooth Position", "detail": f"{tooth} ({region})", "risk": _score_label(tooth_score), "score": tooth_score},
    ]

    total = width_score + height_score + density_score + procedure_score + tooth_score

    # Add medical factor only if medical assessment was provided
    if medical:
        factors.append({"factor": "Medical Risk", "detail": medical_details, "risk": _score_label(medical_score), "score": medical_score})
        total += medical_score
        max_score = 18
    else:
        max_score = 15

    # Updated thresholds: 6-9 Low, 10-14 Moderate, 15-18 High (with medical)
    # Without medical: 5-7 Low, 8-11 Moderate, 12-15 High
    if max_score == 18:
        if total <= 9:
            risk_level = "Low"
            color = "green"
        elif total <= 14:
            risk_level = "Moderate"
            color = "orange"
        else:
            risk_level = "High"
            color = "red"
    else:
        if total <= 7:
            risk_level = "Low"
            color = "green"
        elif total <= 11:
            risk_level = "Moderate"
            color = "orange"
        else:
            risk_level = "High"
            color = "red"

    # Suggested actions for moderate/high risk
    actions = []
    if height_score == 3:
        actions.append("Consider shorter implant")
    if width_score == 3:
        actions.append("Consider narrower implant or bone graft")
    if density_score == 3:
        actions.append("Consider implant with enhanced surface treatment")
    if procedure_score == 3:
        actions.append("Ensure advanced surgical planning")
    # Medical-specific actions based on granular values
    if medical and medical_score >= 2:
        actions.extend(medical_warnings)
    if total >= 10:
        actions.append("Evaluate CBCT carefully")
    if total >= 15:
        actions.append("Consider staged implant placement")

    return {
        "factors": factors,
        "total_score": total,
        "max_score": max_score,
        "risk_level": risk_level,
        "color": color,
        "suggested_actions": actions,
        "medical_warnings": medical_warnings,
    }

# ── Narrow Ridge Evaluation Endpoint ──────────────────────────
@api_router.post("/implant-library/evaluate-narrow-ridge")
async def evaluate_narrow_ridge_endpoint(
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    """Standalone narrow ridge clinical decision evaluation."""
    ridge_width = float(body.get("ridge_width_mm", 0))
    if ridge_width <= 0:
        raise HTTPException(status_code=400, detail="ridge_width_mm is required and must be > 0")
    implant_diameter = body.get("implant_diameter_mm")
    if implant_diameter is not None:
        implant_diameter = float(implant_diameter)
    bone_density = body.get("bone_density")
    tooth = body.get("tooth", "")
    tooth_region = _get_tooth_region(tooth) if tooth else None
    return evaluate_narrow_ridge(ridge_width, implant_diameter, bone_density, tooth_region)


# ── Drilling Protocol Engine ─────────────────────────────────

DRILLING_PROTOCOLS = {
    "BioHorizons|Tapered Pro": {
        "system_name": "BioHorizons Tapered Pro Conical RBT",
        "lengths": [9, 10.5, 12, 15, 18],
        "pilot": {"diameter": 2.0, "code": "TSD2020PD", "type": "Pilot Drill", "rpm": "1500-2000"},
        "soft_drills": [
            {"diameter": 2.8, "code": "TSD2028SB"},
            {"diameter": 3.2, "code": "TSD2032SB"},
            {"diameter": 3.7, "code": "TSD2037SB"},
            {"diameter": 4.1, "code": "TSD2041SB"},
            {"diameter": 4.7, "code": "TSD2047SB"},
        ],
        "dense_drills": [
            {"diameter": 2.5, "code": "TSD2025DB"},
            {"diameter": 2.8, "code": "TSD2028DB"},
            {"diameter": 3.2, "code": "TSD2032DB"},
            {"diameter": 3.7, "code": "TSD2037DB"},
            {"diameter": 4.1, "code": "TSD2041DB"},
            {"diameter": 4.7, "code": "TSD2047DB"},
            {"diameter": 5.4, "code": "TSD2054DB"},
        ],
        "dense_protocol_map": {
            "3.3": [2.5, 2.8, 3.2],
            "3.8": [2.5, 2.8, 3.2, 3.7],
            "4.2": [2.5, 2.8, 3.2, 3.7, 4.1],
            "4.6": [2.5, 2.8, 3.2, 3.7, 4.1, 4.7],
            "5.2": [2.5, 2.8, 3.2, 3.7, 4.1, 4.7, 5.4],
        },
    },
    "BioHorizons|Tapered Short": {
        "system_name": "BioHorizons Tapered Short RBT",
        "lengths": [6, 7.5],
        "pilot": {"diameter": 2.0, "code": "TDS32PD", "type": "Short Pilot Drill", "rpm": "1500-2000"},
        "soft_drills": [
            {"diameter": 3.3, "code": "TDS33SB"},
            {"diameter": 3.7, "code": "TDS37SB"},
            {"diameter": 4.2, "code": "TDS42SB"},
            {"diameter": 4.7, "code": "TDS47SB"},
        ],
        "dense_drills": [
            {"diameter": 3.7, "code": "TDS37DB"},
            {"diameter": 4.2, "code": "TDS42DB"},
            {"diameter": 4.8, "code": "TDS48DB"},
            {"diameter": 5.4, "code": "TDS54DB"},
        ],
        "crestal_drills": [
            {"diameter": 4.2, "code": "TDS42CB"},
            {"diameter": 4.8, "code": "TDS48CB"},
            {"diameter": 5.4, "code": "TDS54CB"},
        ],
    },
}

# ── Dentsply Sirona Ankylos C/X Drilling Protocol ──────────────────────────
DRILLING_PROTOCOLS["Dentsply Sirona|Ankylos C/X"] = {
    "system_name": "Dentsply Sirona Ankylos C/X",
    "protocol_family": "ankylos",
    "implant_series": [
        {"series": "A", "color": "Red", "diameter": 3.5},
        {"series": "B", "color": "Yellow", "diameter": 4.5},
        {"series": "C", "color": "Blue", "diameter": 5.5},
        {"series": "D", "color": "Green", "diameter": 7.0},
    ],
    "size_database": {
        3.5: [6.6, 8, 9.5, 11, 14, 17],
        4.5: [6.6, 8, 9.5, 11, 14, 17],
        5.5: [6.6, 8, 9.5, 11, 14, 17],
        7.0: [8, 9.5, 11, 14],
    },
    "drill_mapping": {
        3.5: {"series": "A", "color": "Red", "twist_drill": 2.9},
        4.5: {"series": "B", "color": "Yellow", "twist_drill": 3.8},
        5.5: {"series": "C", "color": "Blue", "twist_drill": 4.7},
        7.0: {"series": "D", "color": "Green", "twist_drill": 5.7},
    },
}

# ── Straumann BLX Roxolid Drilling Protocols (iter-283, Feb 2026) ────────
for _blx_sys, _blx_label in (
    ("BLX Roxolid SLActive - RB Platform", "Straumann BLX RB SLActive"),
    ("BLX Roxolid SLActive - WB Platform", "Straumann BLX WB SLActive"),
    ("BLX Roxolid SLA - RB Platform", "Straumann BLX RB SLA"),
    ("BLX Roxolid SLA - WB Platform", "Straumann BLX WB SLA"),
):
    DRILLING_PROTOCOLS[f"Straumann|{_blx_sys}"] = {
        "system_name": _blx_label,
        "protocol_family": "straumann_blx",
        "connection": "TorcFit",
        "material": "Roxolid",
    }
del _blx_sys, _blx_label

# ── Adin Dental Implants Drilling Protocols (iter-284, Feb 2026) ─────────
for _adin_sys in (
    "UNP CloseFit", "NP CloseFit", "RP CloseFit", "WP CloseFit",
    "Touareg-OS", "Touareg-S", "Swell", "One",
):
    DRILLING_PROTOCOLS[f"Adin|{_adin_sys}"] = {
        "system_name": f"Adin {_adin_sys}",
        "protocol_family": "adin",
        "connection": (
            "Conical Hex" if "CloseFit" in _adin_sys
            else "One-Piece" if _adin_sys == "One"
            else "Internal Hex"
        ),
        "material": "Ti-6Al-4V ELI",
        "surface": (
            "OsseoFix" if (_adin_sys.endswith("CloseFit") or _adin_sys == "Touareg-OS")
            else "AB/AE"
        ),
    }
del _adin_sys

# ── Straumann BLT Drilling Protocols (iter-292, Feb 2026) ────────────────
for _blt_sys in ("BLT Roxolid SLActive", "BLT Roxolid SLA", "BLT Ti SLA"):
    DRILLING_PROTOCOLS[f"Straumann|{_blt_sys}"] = {
        "system_name": f"Straumann {_blt_sys}",
        "protocol_family": "straumann_blt",
        "connection": "CrossFit",
        "material": "Roxolid" if "Roxolid" in _blt_sys else "Ti Grade 4",
        "surface": "SLActive" if "SLActive" in _blt_sys else "SLA",
    }
del _blt_sys

def _generate_ankylos_protocol(proto, implant_diameter, implant_length, bone):
    """Generate drilling protocol for Dentsply Sirona Ankylos C/X system.
    Per document: D1 = Full drilling + Tap, D2 = Standard, D3/D4 = Skip full reaming (under-preparation).
    Drill depth slightly deeper than implant length."""
    steps = []
    step_num = 1
    drill_depth = round(implant_length + 0.5, 1)
    depth = str(drill_depth)
    is_d1 = bone == "D1"
    is_soft = bone in ("D3", "D4")

    dm = proto["drill_mapping"].get(implant_diameter)
    if not dm:
        return steps
    series = dm["series"]
    color = dm["color"]
    twist_drill = dm["twist_drill"]

    # Step 1: Round Drill
    steps.append({"step": step_num, "drill_type": "Round Drill", "code": "—",
                   "diameter": 1.8, "depth": "Mark site", "rpm": "1500-2000", "irrigation": True,
                   "series": series, "color": color})
    step_num += 1

    # Step 2: Pilot Drill 2.0 mm
    steps.append({"step": step_num, "drill_type": "Pilot Drill", "code": "—",
                   "diameter": 2.0, "depth": depth, "rpm": "800-1000", "irrigation": True,
                   "series": series, "color": color})
    step_num += 1

    # Step 3: Twist Drill (series-specific)
    steps.append({"step": step_num, "drill_type": f"Twist Drill {series} ({twist_drill} mm)", "code": "—",
                   "diameter": twist_drill, "depth": depth, "rpm": "800-1000", "irrigation": True,
                   "series": series, "color": color})
    step_num += 1

    # Step 4: Conical Reamer — Skip for D3/D4 (under-preparation)
    if not is_soft:
        reamer_label = f"Conical Reamer {series}{int(implant_length) if implant_length == int(implant_length) else implant_length}"
        steps.append({"step": step_num, "drill_type": reamer_label, "code": "—",
                       "diameter": implant_diameter, "depth": depth, "rpm": "500-800", "irrigation": True,
                       "series": series, "color": color,
                       "note": "Mandatory for shaping conical osteotomy."})
        step_num += 1

    # Step 5: Tap — D1 (hard bone) only
    if is_d1:
        steps.append({"step": step_num, "drill_type": f"Tap {series}", "code": "—",
                       "diameter": implant_diameter, "depth": depth, "rpm": "15-20", "irrigation": True,
                       "series": series, "color": color, "note": "Dense bone (D1) only — thread preparation."})
        step_num += 1

    # Final: Implant Placement (subcrestal)
    steps.append({"step": step_num, "drill_type": "Implant Placement", "code": "—",
                   "diameter": implant_diameter, "depth": str(implant_length), "rpm": "25-30", "irrigation": False,
                   "series": series, "color": color,
                   "note": f"Ankylos C/X {series} Series ({color}) — {implant_diameter}mm x {implant_length}mm. Subcrestal placement."})

    return steps

# ── BioHorizons Tapered Pro Conical RBT ─────────────────────────────────────
# Per the user's document, Conical RBT has DIFFERENT drill sizes from Tapered Pro:
# Dense bone drills: Pilot + 3.0, 3.3, 3.8, 4.2, 4.6, 5.2 (sequential) + Crestal
# Soft bone drills:  Pilot + 3.8, 4.2, 4.6, 5.2 (reduced set, starting at 3.8)
# Diameters: 3.3, 3.8, 4.2, 4.6, 5.2
DRILLING_PROTOCOLS["BioHorizons|Tapered Pro Conical RBT"] = {
    "system_name": "BioHorizons Tapered Pro Conical RBT",
    "protocol_family": "conical_rbt",
    "lengths": [9, 10.5, 12, 15, 18],
    "dense_drills": [3.0, 3.3, 3.8, 4.2, 4.6, 5.2],
    "soft_drills": [3.8, 4.2, 4.6, 5.2],
}

def _generate_conical_rbt_protocol(proto, implant_diameter, implant_length, bone):
    """Generate drilling protocol for BioHorizons Tapered Pro Conical RBT."""
    steps = []
    step_num = 1
    depth = str(implant_length)
    is_dense = bone in ("D1", "D2")
    is_d4 = bone == "D4"

    # Step 1: Pilot Drill
    steps.append({"step": step_num, "drill_type": "Pilot Drill", "code": "—",
                   "diameter": 2.0, "depth": depth, "rpm": "1500-2000", "irrigation": True})
    step_num += 1

    if is_d4:
        # D4 (Reduced): Pilot → Soft Bone Drill (implant dia) → Dense Bone Drill (implant dia) → Implant
        steps.append({"step": step_num, "drill_type": "Soft Bone Drill", "code": "—",
                       "diameter": implant_diameter, "depth": depth, "rpm": "1000", "irrigation": True})
        step_num += 1
        steps.append({"step": step_num, "drill_type": "Dense Bone Drill", "code": "—",
                       "diameter": implant_diameter, "depth": depth, "rpm": "1000", "irrigation": True})
        step_num += 1
    elif is_dense:
        # D1/D2/D3 (Conventional): Sequential dense drills up to implant diameter + Crestal
        dense_seq = [d for d in proto["dense_drills"] if d <= implant_diameter]
        for drill_d in dense_seq:
            steps.append({"step": step_num, "drill_type": "Dense Bone Drill", "code": "—",
                           "diameter": drill_d, "depth": depth, "rpm": "1000", "irrigation": True})
            step_num += 1
        # Crestal Bone Drill
        steps.append({"step": step_num, "drill_type": "Crestal Bone Drill", "code": "—",
                       "diameter": implant_diameter, "depth": "Crestal", "rpm": "1000", "irrigation": True})
        step_num += 1
    else:
        # D3 (Conventional same as D1/D2 per document): Sequential dense drills + Crestal
        dense_seq = [d for d in proto["dense_drills"] if d <= implant_diameter]
        for drill_d in dense_seq:
            steps.append({"step": step_num, "drill_type": "Dense Bone Drill", "code": "—",
                           "diameter": drill_d, "depth": depth, "rpm": "1000", "irrigation": True})
            step_num += 1
        steps.append({"step": step_num, "drill_type": "Crestal Bone Drill", "code": "—",
                       "diameter": implant_diameter, "depth": "Crestal", "rpm": "1000", "irrigation": True})
        step_num += 1

    # Implant Placement
    steps.append({"step": step_num, "drill_type": "Implant Placement", "code": "—",
                   "diameter": implant_diameter, "depth": depth, "rpm": "30", "irrigation": False,
                   "note": f"BioHorizons Tapered Pro Conical RBT {implant_diameter}mm x {implant_length}mm"})
    return steps


# Tapered Short Conical RBT uses same protocol as Tapered Short
DRILLING_PROTOCOLS["BioHorizons|Tapered Short Conical RBT"] = DRILLING_PROTOCOLS["BioHorizons|Tapered Short"]


# ── Alpha-Bio SPI Drilling Protocol ────────────────────────────────────────
# SPI = Spiral Implant (Self-drilling, bone condensing system)
# Depth Rule: Osteotomy depth = Implant Length
# Drill library: 2.0 (pilot), 2.8, 3.2, 3.65, 4.1, 4.5, 4.8, 5.2, 5.8
# D3/D4: Under-preparation (fewer drills for primary stability in soft bone)
# D1/D2: Full sequential drilling to final drill
# Bone condensing — minimal osteotomy preparation
# Can redirect during placement (rotate back 2-3 turns)

ALPHA_BIO_DRILLS = [2.0, 2.8, 3.2, 3.65, 4.1, 4.5, 4.8, 5.2, 5.8]

# Dense bone (D1/D2): full sequence to final drill diameter
ALPHA_BIO_DENSE = {
    3.3:  [2.0, 2.8, 3.2],
    3.75: [2.0, 2.8, 3.2, 3.65],
    4.2:  [2.0, 2.8, 3.2, 3.65, 4.1],
    5.0:  [2.0, 2.8, 3.2, 3.65, 4.1, 4.5],
    6.0:  [2.0, 2.8, 3.2, 3.65, 4.1, 4.5, 4.8, 5.2],
}

# Soft bone (D3/D4): under-preparation — fewer drills
ALPHA_BIO_SOFT = {
    3.3:  [2.0, 2.8],
    3.75: [2.0, 2.8, 3.2],
    4.2:  [2.0, 2.8, 3.2],
    5.0:  [2.0, 2.8, 3.2, 3.65],
    6.0:  [2.0, 2.8, 3.2, 3.65, 4.1],
}

DRILLING_PROTOCOLS["Alpha Bio|SPI"] = {
    "system_name": "Alpha-Bio SPI",
    "protocol_family": "alpha_bio_spi",
    "lengths": [8, 10, 11.5, 13, 16],
}

def _generate_alpha_bio_spi_protocol(proto, implant_diameter, implant_length, bone):
    """Generate drilling protocol for Alpha-Bio SPI system."""
    steps = []
    step_num = 1
    depth = str(implant_length)
    d = implant_diameter
    is_dense = bone in ("D1", "D2")

    if is_dense:
        seq = ALPHA_BIO_DENSE.get(d)
        if not seq:
            closest = min(ALPHA_BIO_DENSE.keys(), key=lambda x: abs(x - d))
            seq = ALPHA_BIO_DENSE[closest]
    else:
        seq = ALPHA_BIO_SOFT.get(d)
        if not seq:
            closest = min(ALPHA_BIO_SOFT.keys(), key=lambda x: abs(x - d))
            seq = ALPHA_BIO_SOFT[closest]

    for i, drill_d in enumerate(seq):
        if drill_d == 2.0:
            label = "Pilot Drill"
            rpm = "800-1200"
        elif i == len(seq) - 1 and is_dense:
            label = "Final Drill"
            rpm = "500-800"
        else:
            label = "Drill"
            rpm = "800-1000"
        steps.append({"step": step_num, "drill_type": label, "code": "—",
                       "diameter": drill_d, "depth": depth, "rpm": rpm, "irrigation": True})
        step_num += 1

    # Implant Placement
    note = f"Alpha-Bio SPI {d}mm x {implant_length}mm — Self-drilling, bone condensing."
    if not is_dense:
        note += " Under-preparation for primary stability in soft bone."
    steps.append({"step": step_num, "drill_type": "Implant Placement", "code": "—",
                   "diameter": d, "depth": depth, "rpm": "20-30", "irrigation": False,
                   "note": note})
    return steps


# ── Alpha-Bio Brochure Protocols (NeO / ICE / ATID / DFI / NICE) ───────────
# Driven by the brochure's straight-drilling tables (see
# alpha_bio_brochure_data.py for the raw data). Each protocol entry embeds
# its own per-(diameter, bone) drill sequence so the generator stays generic.
try:
    from alpha_bio_brochure_data import (
        DRILL_SEQUENCES as _AB_DRILL_SEQS,
        SYSTEM_SIZES as _AB_SIZES,
        SYSTEM_PLATFORM as _AB_PLATFORM,
    )
    for _ab_sys, _ab_seqs in _AB_DRILL_SEQS.items():
        # Lengths are common to the system; use the union across all diameters.
        _all_lengths = sorted({
            ln for diam_lengths in _AB_SIZES[_ab_sys]["lengths_by_diameter"].values()
            for ln in diam_lengths
        })
        DRILLING_PROTOCOLS[f"Alpha Bio|{_ab_sys}"] = {
            "system_name": f"Alpha Bio {_ab_sys}",
            "protocol_family": "alpha_bio_brochure",
            "platform": _AB_PLATFORM[_ab_sys],
            "lengths": _all_lengths,
            "drill_sequences": _ab_seqs,
        }
except Exception as _ab_imp_err:
    logging.warning(f"Alpha-Bio brochure protocols not loaded: {_ab_imp_err}")


def _generate_alpha_bio_brochure_protocol(proto, implant_diameter, implant_length, bone):
    """Generate drilling protocol for Alpha-Bio NeO / ICE / ATID / DFI / NICE
    using the brochure's straight-drilling tables.
    """
    # Map the 4-tier bone density to the brochure's 3-tier model
    bone_key = "D1" if bone == "D1" else ("D4" if bone == "D4" else "D2_D3")

    seqs_by_diam = proto.get("drill_sequences", {})
    if not seqs_by_diam:
        return []

    # Pick the closest tabulated diameter
    diam_keys = list(seqs_by_diam.keys())
    diam = implant_diameter if implant_diameter in seqs_by_diam else min(
        diam_keys, key=lambda x: abs(x - implant_diameter))

    bone_seqs = seqs_by_diam.get(diam, {})
    seq = bone_seqs.get(bone_key) or bone_seqs.get("D2_D3") or []

    full_depth = str(implant_length)
    short_depth = str(max(implant_length - 3, 1))

    steps = []
    last_idx = len(seq) - 1
    for i, (drill_d, mode) in enumerate(seq):
        if mode == "cortical_only":
            depth = "cortical plate (~2-3mm)"
            label = "Cortical Drill"
            rpm = "500-800"
            note_mode = "Drill through the cortical plate only — do not advance to full implant length."
        elif mode == "short_3mm":
            depth = short_depth
            label = "Drill (3 mm short)"
            rpm = "500-800" if bone == "D1" else "800-1000"
            note_mode = "Stop 3 mm short of the implant's full length to preserve apical bone."
        else:
            depth = full_depth
            if drill_d == 2.0:
                label = "Pilot Drill"
                rpm = "800-1200"
            elif i == last_idx and bone == "D1":
                label = "Final Drill"
                rpm = "500-800"
            else:
                label = "Drill"
                rpm = "800-1000"
            note_mode = None

        step = {
            "step": i + 1,
            "drill_type": label,
            "code": "—",
            "diameter": drill_d,
            "depth": depth,
            "rpm": rpm,
            "irrigation": True,
        }
        if note_mode:
            step["note"] = note_mode
        steps.append(step)

    # Implant placement
    sys_name = proto.get("system_name", "Alpha-Bio")
    placement_note = f"{sys_name} {implant_diameter}mm × {implant_length}mm. "
    if bone == "D4":
        placement_note += "Soft bone — under-preparation maintained for primary stability."
    elif bone == "D1":
        placement_note += "Hard bone — cortical pass completed; expect higher insertion torque."
    else:
        placement_note += "Standard insertion sequence."

    steps.append({
        "step": len(steps) + 1,
        "drill_type": "Implant Placement",
        "code": "—",
        "diameter": implant_diameter,
        "depth": full_depth,
        "rpm": "25-35",
        "irrigation": False,
        "note": placement_note,
    })
    return steps


# ── B&B Dental Drilling Protocols ──────────────────────────────────────────
# Universal Rule: Drill Depth = Implant Length + 0.5 mm
# Standard drill set: 2.1, 3.0, 3.5, 4.0, 4.5, 5.0 (sequential)
# Countersink mapping by implant diameter
BB_COUNTERSINK_MAP = {3.5: "NECK-334", 3.75: "NECK-334", 4.0: "NECK-354", 4.5: "NECK-455", 5.0: "NECK-455"}

DRILLING_PROTOCOLS["B&B Dental|EV Line"] = {
    "system_name": "B&B Dental EV Line",
    "protocol_family": "bb_dental",
    "bb_system": "ev_line",
    "lengths": [6.5, 8, 10, 12, 14, 16],
}
DRILLING_PROTOCOLS["B&B Dental|3P"] = {
    "system_name": "B&B Dental 3P",
    "protocol_family": "bb_dental",
    "bb_system": "3p",
    "lengths": [6.5, 8, 10, 12, 14],
}
DRILLING_PROTOCOLS["B&B Dental|3P Long"] = {
    "system_name": "B&B Dental 3P Long",
    "protocol_family": "bb_dental",
    "bb_system": "3p_long",
    "lengths": [18, 20, 22, 24],
}
DRILLING_PROTOCOLS["B&B Dental|Wide Line"] = {
    "system_name": "B&B Dental Wide Line",
    "protocol_family": "bb_dental",
    "bb_system": "wide_line",
    "lengths": [6.5, 8, 10, 12, 14],
}
DRILLING_PROTOCOLS["B&B Dental|Dura-Vit Slim"] = {
    "system_name": "B&B Dental Dura-Vit Slim",
    "protocol_family": "bb_dental",
    "bb_system": "dura_vit_slim",
    "lengths": [8, 10, 12, 14],
}

def _generate_bb_dental_protocol(proto, implant_diameter, implant_length, bone):
    """Generate drilling protocol for all B&B Dental systems."""
    steps = []
    step_num = 1
    depth = implant_length + 0.5
    depth_str = f"{depth:.1f}" if depth != int(depth) else str(int(depth))
    is_dense = bone in ("D1", "D2")
    bb_sys = proto.get("bb_system", "")
    d = implant_diameter

    # ── Dura-Vit Slim: simplified narrow implant sequence ──
    if bb_sys == "dura_vit_slim":
        steps.append({"step": step_num, "drill_type": "Pilot Drill", "code": "—",
                       "diameter": 2.1, "depth": depth_str, "rpm": "800-1000", "irrigation": True})
        step_num += 1
        steps.append({"step": step_num, "drill_type": "Drill", "code": "—",
                       "diameter": 3.0, "depth": depth_str, "rpm": "800-1000", "irrigation": True})
        step_num += 1
        if is_dense and d > 3.0:
            steps.append({"step": step_num, "drill_type": "Final Drill", "code": "—",
                           "diameter": d, "depth": depth_str, "rpm": "800-1000", "irrigation": True})
            step_num += 1
        elif not is_dense and d > 3.0:
            steps.append({"step": step_num, "drill_type": "Drill (Optional)", "code": "—",
                           "diameter": 3.2, "depth": depth_str, "rpm": "800-1000", "irrigation": True,
                           "note": "Optional in soft bone"})
            step_num += 1
        steps.append({"step": step_num, "drill_type": "Implant Placement", "code": "—",
                       "diameter": d, "depth": str(implant_length), "rpm": "25-35", "irrigation": False,
                       "note": f"B&B Dental Dura-Vit Slim {d}mm x {implant_length}mm"})
        return steps

    # ── Wide Line: standard sequential drilling to full diameter ──
    if bb_sys == "wide_line":
        standard_drills = [2.1, 3.0, 3.5, 4.0, 4.5, 5.0]
        # Add wider drills for Wide Line system
        if d > 5.0:
            wide_drills = [x for x in [5.5, 6.0] if x <= d]
            all_drills = standard_drills + wide_drills
        else:
            all_drills = [x for x in standard_drills if x <= d]
        for drill_d in all_drills:
            label = "Pilot Drill" if drill_d == 2.1 else ("Final Drill" if drill_d == d else "Drill")
            steps.append({"step": step_num, "drill_type": label, "code": "—",
                           "diameter": drill_d, "depth": depth_str, "rpm": "800-1000", "irrigation": True})
            step_num += 1
        steps.append({"step": step_num, "drill_type": "Implant Placement", "code": "—",
                       "diameter": d, "depth": str(implant_length), "rpm": "25-35", "irrigation": False,
                       "note": f"B&B Dental Wide Line {d}mm x {implant_length}mm"})
        return steps

    # ── EV Line, 3P, 3P Long: bone-dependent protocol ──
    standard_drills = [3.0, 3.5, 4.0, 4.5, 5.0]
    drills_below = [x for x in standard_drills if x < d]

    # Step 1: Pilot Drill
    steps.append({"step": step_num, "drill_type": "Pilot Drill", "code": "—",
                   "diameter": 2.1, "depth": depth_str, "rpm": "800-1000", "irrigation": True})
    step_num += 1

    # Sequential drills below implant diameter
    for drill_d in drills_below:
        steps.append({"step": step_num, "drill_type": "Drill", "code": "—",
                       "diameter": drill_d, "depth": depth_str, "rpm": "800-1000", "irrigation": True})
        step_num += 1

    if is_dense:
        # D1/D2: Final drill at implant diameter + Countersink
        steps.append({"step": step_num, "drill_type": "Final Drill", "code": "—",
                       "diameter": d, "depth": depth_str, "rpm": "800-1000", "irrigation": True})
        step_num += 1
        cs = BB_COUNTERSINK_MAP.get(d, f"NECK-{d}")
        steps.append({"step": step_num, "drill_type": f"Countersink {cs}", "code": "—",
                       "diameter": d, "depth": "Collar depth", "rpm": "500-800", "irrigation": True,
                       "note": "Dense bone only (D1/D2)"})
        step_num += 1
    else:
        # D3/D4: Last sequential drill is final (undersized) + optional compactor for 3P/3P Long
        if drills_below:
            steps[-1]["drill_type"] = "Final Drill"
        if bb_sys in ("3p", "3p_long"):
            steps.append({"step": step_num, "drill_type": f"Compactor", "code": "—",
                           "diameter": d, "depth": depth_str, "rpm": "50-100", "irrigation": False,
                           "note": "Condense soft bone (D3/D4)"})
            step_num += 1

    # Implant Placement
    system_label = proto["system_name"]
    steps.append({"step": step_num, "drill_type": "Implant Placement", "code": "—",
                   "diameter": d, "depth": str(implant_length), "rpm": "25-35", "irrigation": False,
                   "note": f"{system_label} {d}mm x {implant_length}mm"})

    return steps

# ── MIS LANCE+ Drilling Protocol ──────────────────────────────────────────
# Depth Rule: Osteotomy depth = Implant length (no offset)
# Drill library: 1.9 (marking), 2.4 (pilot), 3.1, 3.65, 4.1, 4.9
# D1: Full drilling + countersink (for Ø5.0)
# D2: Standard full sequence
# D3/D4: Under-preparation (skip final drill for primary stability)
# Triple thread, self-tapping, conical — high primary stability system

MIS_LANCE_DRILLS = [1.9, 2.4, 3.1, 3.65, 4.1, 4.9]

# Map implant diameter → final drill diameter for D1/D2
MIS_LANCE_FINAL_DRILL = {
    3.3: 3.1,     # Narrow: final = 3.1
    3.75: 3.65,   # Standard: final = 3.65
    4.2: 4.1,     # Standard: final = 4.1
    5.0: 4.9,     # Wide: final = 4.9
}

# Map implant diameter → D3/D4 last drill (one step before final)
MIS_LANCE_UNDERPREP = {
    3.3: 2.4,     # Stop at pilot 2.4, skip 3.1
    3.75: 3.1,    # Stop at 3.1, skip 3.65
    4.2: 3.65,    # Stop at 3.65, skip 4.1
    5.0: 4.1,     # Stop at 4.1, skip 4.9
}

DRILLING_PROTOCOLS["MIS|Lance +"] = {
    "system_name": "MIS LANCE+",
    "protocol_family": "mis_lance",
    "lengths": [8, 10, 11.5, 13, 16],
}

def _generate_mis_lance_protocol(proto, implant_diameter, implant_length, bone):
    """Generate drilling protocol for MIS LANCE+ system."""
    steps = []
    step_num = 1
    depth = str(implant_length)
    d = implant_diameter
    is_d1 = bone == "D1"
    is_dense = bone in ("D1", "D2")
    is_soft = bone in ("D3", "D4")

    final_drill = MIS_LANCE_FINAL_DRILL.get(d, d)
    underprep_stop = MIS_LANCE_UNDERPREP.get(d, final_drill)

    # Step 1: Marking Drill 1.9mm
    steps.append({"step": step_num, "drill_type": "Marking Drill", "code": "—",
                   "diameter": 1.9, "depth": "Mark site", "rpm": "1200-1500", "irrigation": True})
    step_num += 1

    # Step 2: Pilot Drill 2.4mm
    steps.append({"step": step_num, "drill_type": "Pilot Drill", "code": "—",
                   "diameter": 2.4, "depth": depth, "rpm": "1200-1500", "irrigation": True})
    step_num += 1

    if is_dense:
        # D1/D2: Full sequential drilling up to final drill
        intermediate_drills = [x for x in MIS_LANCE_DRILLS if x > 2.4 and x <= final_drill]
        for drill_d in intermediate_drills:
            label = "Final Drill" if drill_d == final_drill else "Drill"
            rpm = "200-600" if drill_d == final_drill else "500-700"
            steps.append({"step": step_num, "drill_type": label, "code": "—",
                           "diameter": drill_d, "depth": depth, "rpm": rpm, "irrigation": True})
            step_num += 1

        # D1 only: Countersink for dense cortical bone
        if is_d1:
            steps.append({"step": step_num, "drill_type": "Countersink", "code": "—",
                           "diameter": d, "depth": "Cortical", "rpm": "200-400", "irrigation": True,
                           "note": "Dense cortical bone (D1) only"})
            step_num += 1
    else:
        # D3/D4: Under-preparation — stop one drill short for primary stability
        intermediate_drills = [x for x in MIS_LANCE_DRILLS if x > 2.4 and x <= underprep_stop]
        for drill_d in intermediate_drills:
            steps.append({"step": step_num, "drill_type": "Drill", "code": "—",
                           "diameter": drill_d, "depth": depth, "rpm": "500-700", "irrigation": True})
            step_num += 1

    # Implant Placement
    steps.append({"step": step_num, "drill_type": "Implant Placement", "code": "—",
                   "diameter": d, "depth": depth, "rpm": "15-25", "irrigation": False,
                   "note": f"MIS LANCE+ {d}mm x {implant_length}mm — Triple Thread, High Primary Stability"})

    return steps

# ── COWELLMEDI INNO Drilling Protocols ──────────────────────────────────
# Depth Rule: Osteotomy depth = Implant length (no offset)
# Drill library (Submerged): Round, 2.0 (pilot), 2.8, 3.2, 3.6, 4.2, 4.8
# Drill library (Narrow): Round, 2.0 (pilot), 2.8
# D1: Full drilling + countersink + optional bone tap
# D2: Standard full sequence
# D3/D4: Under-preparation (skip final drill for primary stability)
# Torque: 25-45 Ncm
# RPM: Initial 800-1200, Final ≤300, Placement 20-30

COWELLMEDI_SUBMERGED_DRILLS = [2.0, 2.8, 3.2, 3.6, 4.2, 4.8]

COWELLMEDI_SUBMERGED_FINAL = {
    3.5: 3.2,
    4.0: 3.6,
    4.5: 4.2,
    5.0: 4.8,
    6.0: 4.8,
}

COWELLMEDI_SUBMERGED_UNDERPREP = {
    3.5: 2.8,
    4.0: 3.2,
    4.5: 3.6,
    5.0: 4.2,
    6.0: 4.2,
}

DRILLING_PROTOCOLS["Cowellmedi|INNO Submerged"] = {
    "system_name": "Cowellmedi INNO Submerged",
    "protocol_family": "cowellmedi",
    "cowellmedi_system": "submerged",
    "lengths": [7, 8, 10, 12, 14, 16, 18],
}

COWELLMEDI_NARROW_FINAL = {
    3.0: 2.8,
    3.1: 2.8,
    3.2: 2.8,
    3.3: 2.8,
}

COWELLMEDI_NARROW_UNDERPREP = {
    3.0: 2.0,
    3.1: 2.0,
    3.2: 2.0,
    3.3: 2.0,
}

DRILLING_PROTOCOLS["Cowellmedi|INNO Submerged Narrow"] = {
    "system_name": "Cowellmedi INNO Submerged Narrow",
    "protocol_family": "cowellmedi",
    "cowellmedi_system": "narrow",
    "lengths": [8, 10, 12, 14],
}


def _generate_cowellmedi_protocol(proto, implant_diameter, implant_length, bone):
    """Generate drilling protocol for Cowellmedi INNO systems."""
    steps = []
    step_num = 1
    depth = str(implant_length)
    d = implant_diameter
    is_d1 = bone == "D1"
    is_dense = bone in ("D1", "D2")
    is_soft = bone in ("D3", "D4")
    sys_type = proto.get("cowellmedi_system", "submerged")

    # Step 1: Round Drill (mark site)
    steps.append({"step": step_num, "drill_type": "Round Drill", "code": "—",
                   "diameter": 1.8, "depth": "Mark site", "rpm": "1200-1500", "irrigation": True})
    step_num += 1

    if sys_type == "submerged":
        # Step 2: Pilot Drill 2.0mm
        steps.append({"step": step_num, "drill_type": "Pilot Drill", "code": "—",
                       "diameter": 2.0, "depth": depth, "rpm": "800-1200", "irrigation": True})
        step_num += 1

        final_drill = COWELLMEDI_SUBMERGED_FINAL.get(d, 4.2)
        underprep_stop = COWELLMEDI_SUBMERGED_UNDERPREP.get(d, 3.6)

        if is_dense:
            # D1/D2: Full sequential drilling up to final drill
            intermediates = [x for x in COWELLMEDI_SUBMERGED_DRILLS if x > 2.0 and x <= final_drill]
            for drill_d in intermediates:
                label = "Final Drill" if drill_d == final_drill else "Drill"
                rpm = "≤300" if drill_d == final_drill else "800-1200"
                steps.append({"step": step_num, "drill_type": label, "code": "—",
                               "diameter": drill_d, "depth": depth, "rpm": rpm, "irrigation": True})
                step_num += 1

            # Countersink for D1 (mandatory) or D2 (if cortical thick)
            cs_note = "Mandatory for dense cortical bone (D1)." if is_d1 else "If cortical bone is thick."
            steps.append({"step": step_num, "drill_type": "Countersink", "code": "—",
                           "diameter": d, "depth": "Cortical", "rpm": "≤300", "irrigation": True,
                           "note": cs_note})
            step_num += 1

            # D1 only: Optional bone tap
            if is_d1:
                steps.append({"step": step_num, "drill_type": "Bone Tap", "code": "—",
                               "diameter": d, "depth": depth, "rpm": "15-20", "irrigation": False,
                               "note": "Optional — dense cortical bone (D1) only"})
                step_num += 1
        else:
            # D3/D4: Under-preparation — stop one drill short
            intermediates = [x for x in COWELLMEDI_SUBMERGED_DRILLS if x > 2.0 and x <= underprep_stop]
            for drill_d in intermediates:
                steps.append({"step": step_num, "drill_type": "Drill", "code": "—",
                               "diameter": drill_d, "depth": depth, "rpm": "800-1200", "irrigation": True})
                step_num += 1

    else:
        # Narrow system
        # Step 2: Pilot Drill 2.0mm
        steps.append({"step": step_num, "drill_type": "Pilot Drill", "code": "—",
                       "diameter": 2.0, "depth": depth, "rpm": "800-1200", "irrigation": True})
        step_num += 1

        if is_dense:
            # D1/D2: Drill 2.8 + Final drill to diameter
            steps.append({"step": step_num, "drill_type": "Drill", "code": "—",
                           "diameter": 2.8, "depth": depth, "rpm": "800-1200", "irrigation": True})
            step_num += 1
            if d > 2.8:
                steps.append({"step": step_num, "drill_type": "Final Drill", "code": "—",
                               "diameter": d, "depth": depth, "rpm": "≤300", "irrigation": True})
                step_num += 1
        else:
            # D3/D4: Stop at 2.8, skip final drill
            steps.append({"step": step_num, "drill_type": "Drill", "code": "—",
                           "diameter": 2.8, "depth": depth, "rpm": "800-1200", "irrigation": True,
                           "note": "Under-preparation — skip final drill for stability"})
            step_num += 1

    # Implant Placement
    sys_label = "INNO Submerged" if sys_type == "submerged" else "INNO Submerged Narrow"
    steps.append({"step": step_num, "drill_type": "Implant Placement", "code": "—",
                   "diameter": d, "depth": depth, "rpm": "20-30", "irrigation": False,
                   "note": f"Cowellmedi {sys_label} {d}mm x {implant_length}mm — Grade 4 Ti, SLA Surface, Internal Hex"})

    return steps


# ── BREDENT SKY Drilling Protocols ──────────────────────────────────────
# Global Rules:
#   Depth = Implant Length + 0.7mm
#   No tapping required (self-cutting implants)
#   Pilot/Twist: 800-1000 RPM | Final/Crestal: 300 RPM | Placement: 15-25 RPM
#   D1 (Hard): Full drilling sequence, NO crestal drill
#   D2-D4: Reduced drilling + crestal drill (FULL insertion)
#   D4 (Very soft): Final drill anticlockwise at 50 RPM for condensation
#   Torque: 25-45 Ncm. >45 Ncm → unscrew 1-2 turns, wait, reinsert

DRILLING_PROTOCOLS["Bredent|Mini 2 Sky"] = {
    "system_name": "Bredent miniSKY",
    "protocol_family": "bredent_sky",
    "bredent_system": "mini",
    "lengths": [8, 10, 12, 14],
}

DRILLING_PROTOCOLS["Bredent|Copa Sky"] = {
    "system_name": "Bredent copaSKY",
    "protocol_family": "bredent_sky",
    "bredent_system": "copa",
    "lengths": [5.2],
}

DRILLING_PROTOCOLS["Bredent|Narrow Sky"] = {
    "system_name": "Bredent narrowSKY",
    "protocol_family": "bredent_sky",
    "bredent_system": "narrow",
    "lengths": [8, 10, 12, 14],
}

DRILLING_PROTOCOLS["Bredent|Blue Sky"] = {
    "system_name": "Bredent blueSKY",
    "protocol_family": "bredent_sky",
    "bredent_system": "blue",
    "lengths": [8, 10, 12, 14, 16],
}

DRILLING_PROTOCOLS["Bredent|Sky Classic"] = {
    "system_name": "Bredent classicSKY",
    "protocol_family": "bredent_sky",
    "bredent_system": "classic",
    "lengths": [8, 10, 12, 14, 16],
}


def _generate_bredent_protocol(proto, implant_diameter, implant_length, bone):
    """Generate drilling protocol for Bredent SKY systems."""
    steps = []
    step_num = 1
    d = implant_diameter
    depth = round(implant_length + 0.7, 1)
    depth_str = str(depth)
    is_d1 = bone == "D1"
    is_soft = bone in ("D3", "D4")
    is_very_soft = bone == "D4"
    sys_type = proto.get("bredent_system", "blue")

    SYSTEM_LABELS = {
        "mini": "miniSKY", "copa": "copaSKY", "narrow": "narrowSKY",
        "blue": "blueSKY", "classic": "classicSKY",
    }
    sys_label = SYSTEM_LABELS.get(sys_type, sys_type)

    if sys_type == "copa":
        # copaSKY: Ultra-short (5.2mm) — simplified: Pilot → Final → Implant
        steps.append({"step": step_num, "drill_type": "Pilot Drill", "code": "—",
                       "diameter": 2.0, "depth": depth_str, "rpm": "800-1000", "irrigation": True,
                       "note": "copaSKY ultra-short. Precise axial alignment critical."})
        step_num += 1
        steps.append({"step": step_num, "drill_type": "Final Drill", "code": "—",
                       "diameter": d, "depth": depth_str, "rpm": "300", "irrigation": True,
                       "note": f"Final drill to implant diameter {d}mm."})
        step_num += 1
        steps.append({"step": step_num, "drill_type": "Implant Placement", "code": "—",
                       "diameter": d, "depth": str(implant_length), "rpm": "15-25", "irrigation": False,
                       "note": f"Bredent copaSKY {d}mm x {implant_length}mm — Ultra-short. Maintain strict axial alignment."})
        return steps

    if sys_type == "mini":
        # miniSKY: Pilot → Twist → Final → Implant (no crestal for any bone)
        steps.append({"step": step_num, "drill_type": "Pilot Drill", "code": "—",
                       "diameter": 2.0, "depth": depth_str, "rpm": "800-1000", "irrigation": True})
        step_num += 1
        steps.append({"step": step_num, "drill_type": "Twist Drill", "code": "—",
                       "diameter": 2.25, "depth": depth_str, "rpm": "800-1000", "irrigation": True,
                       "note": "Verify direction with paralleling pin."})
        step_num += 1
        final_rpm = "50 (anticlockwise)" if is_very_soft else "300"
        final_note = "Anticlockwise for bone condensation (D4)." if is_very_soft else f"Final drill to {d}mm."
        steps.append({"step": step_num, "drill_type": "Final Drill", "code": "—",
                       "diameter": d, "depth": depth_str, "rpm": final_rpm, "irrigation": True,
                       "note": final_note})
        step_num += 1
        steps.append({"step": step_num, "drill_type": "Implant Placement", "code": "—",
                       "diameter": d, "depth": str(implant_length), "rpm": "15-25", "irrigation": False,
                       "note": f"Bredent miniSKY {d}mm x {implant_length}mm — Self-cutting, no tap required. 25-45 Ncm."})
        return steps

    # narrowSKY, blueSKY, classicSKY — share common pattern
    # Step 1: Pilot Drill
    steps.append({"step": step_num, "drill_type": "Pilot Drill", "code": "—",
                   "diameter": 2.0, "depth": depth_str, "rpm": "800-1000", "irrigation": True,
                   "note": "Establish osteotomy direction. Copious irrigation."})
    step_num += 1

    # Step 2: Twist Drill
    steps.append({"step": step_num, "drill_type": "Twist Drill", "code": "—",
                   "diameter": 2.8, "depth": depth_str, "rpm": "800-1000", "irrigation": True,
                   "note": "Verify with paralleling pin."})
    step_num += 1

    # Step 3: Final Drill
    final_rpm = "50 (anticlockwise)" if is_very_soft else "300"
    final_note = "Anticlockwise for bone condensation (D4)." if is_very_soft else (
        f"Full depth — {d}mm." if is_d1 else f"Final drill {d}mm.")
    steps.append({"step": step_num, "drill_type": "Final Drill", "code": "—",
                   "diameter": d, "depth": depth_str, "rpm": final_rpm, "irrigation": True,
                   "note": final_note})
    step_num += 1

    # Step 4: Crestal Drill — D2-D4 only (NOT for D1 hard bone)
    if not is_d1:
        steps.append({"step": step_num, "drill_type": "Crestal Drill", "code": "—",
                       "diameter": d, "depth": "Full insertion", "rpm": "300", "irrigation": True,
                       "note": f"FULL insertion crestal preparation for {d}mm implant."})
        step_num += 1

    # Implant Placement
    steps.append({"step": step_num, "drill_type": "Implant Placement", "code": "—",
                   "diameter": d, "depth": str(implant_length), "rpm": "15-25", "irrigation": False,
                   "note": f"Bredent {sys_label} {d}mm x {implant_length}mm — Self-cutting, no tap required. 25-45 Ncm."})

    return steps


# ── OSSTEM Drilling Protocols ──────────────────────────────────────────
# Systems: ET III NH, MS, SS III, TS III (shared general protocol), TS IV (ultra-soft bone)
# Depth = Implant Length
# D1: Full drilling + cortical drill (coronal widening only)
# D2: Standard full drilling
# D3/D4: Under-preparation (skip last drill for primary stability)
# TS IV: Simplified protocol designed for ultra-soft bone (D4)
# Torque: ~40 Ncm
# 122 concept: 2–4 drill simplified protocol based on bone density
# In-built stopper maintains ~1mm safety margin

OSSTEM_PROTOCOLS = {
    3.5: {"D1": [2.2, 3.0, 3.5, "3.5_cortical"], "D2": [2.2, 3.0, 3.5], "D3": [2.2, 3.0], "D4": [2.2, 3.0]},
    4.0: {"D1": [2.2, 3.5, 4.0, "4.0_cortical"], "D2": [2.2, 3.5, 4.0], "D3": [2.2, 3.5], "D4": [2.2, 3.5]},
    4.5: {"D1": [2.2, 3.5, 4.0, 4.5, "4.5_cortical"], "D2": [2.2, 3.5, 4.0, 4.5], "D3": [2.2, 3.5, 4.0], "D4": [2.2, 3.5, 4.0]},
    5.0: {"D1": [2.2, 3.5, 4.5, 5.0, "5.0_cortical"], "D2": [2.2, 3.5, 4.5, 5.0], "D3": [2.2, 3.5, 4.5], "D4": [2.2, 3.5, 4.5]},
    5.5: {"D1": [2.2, 3.5, 5.0, 5.5, "5.5_cortical"], "D2": [2.2, 3.5, 5.0, 5.5], "D3": [2.2, 3.5, 5.0], "D4": [2.2, 3.5, 5.0]},
}

OSSTEM_TS_IV_PROTOCOLS = {
    4.0: [2.2, 3.5],
    4.5: [2.2, 2.7, 3.5, 4.0],
    5.0: [2.2, 2.7, 3.5, 4.5],
}

# Register all 5 Osstem systems
for _sys_key, _sys_name in [
    ("Osstem|ETIII NH", "Osstem ET III NH"),
    ("Osstem|MS", "Osstem ET III MS"),
    ("Osstem|SS III", "Osstem SS III"),
    ("Osstem|TS III", "Osstem TS III"),
]:
    DRILLING_PROTOCOLS[_sys_key] = {
        "system_name": _sys_name,
        "protocol_family": "osstem",
        "osstem_type": "standard",
    }

DRILLING_PROTOCOLS["Osstem|TS IV"] = {
    "system_name": "Osstem TS IV",
    "protocol_family": "osstem",
    "osstem_type": "ts_iv",
}


def _generate_osstem_protocol(proto, implant_diameter, implant_length, bone):
    """Generate drilling protocol for Osstem implant systems."""
    steps = []
    step_num = 1
    d = implant_diameter
    depth = str(implant_length)
    sys_name = proto.get("system_name", "Osstem")
    osstem_type = proto.get("osstem_type", "standard")

    if osstem_type == "ts_iv":
        # TS IV: ultra-soft bone protocol — fixed simplified sequences
        ts_seq = OSSTEM_TS_IV_PROTOCOLS.get(d)
        if not ts_seq:
            # Fallback to closest available TS IV diameter
            available = sorted(OSSTEM_TS_IV_PROTOCOLS.keys())
            closest = min(available, key=lambda x: abs(x - d)) if available else None
            ts_seq = OSSTEM_TS_IV_PROTOCOLS.get(closest, [2.2, 3.5])
        for drill_d in ts_seq:
            label = "Pilot Drill" if drill_d == 2.2 else f"Drill {drill_d}mm"
            rpm = "800" if drill_d <= 2.2 else "600"
            note = "Initial pilot drill." if drill_d == 2.2 else "Under-sized for maximum primary stability in soft bone."
            steps.append({"step": step_num, "drill_type": label, "code": "—",
                           "diameter": drill_d, "depth": depth, "rpm": rpm, "irrigation": True,
                           "note": note})
            step_num += 1
        steps.append({"step": step_num, "drill_type": "Implant Placement", "code": "—",
                       "diameter": d, "depth": depth, "rpm": "20-30", "irrigation": False,
                       "note": f"Osstem TS IV {d}mm x {implant_length}mm — Ultra-soft bone design. Place at bone level. ~40 Ncm."})
        return steps

    # Standard Osstem protocol (ET III NH, MS, SS III, TS III)
    dia_proto = OSSTEM_PROTOCOLS.get(d)
    if not dia_proto:
        available = sorted(OSSTEM_PROTOCOLS.keys())
        closest = min(available, key=lambda x: abs(x - d)) if available else 4.0
        dia_proto = OSSTEM_PROTOCOLS.get(closest, OSSTEM_PROTOCOLS[4.0])

    seq = dia_proto.get(bone, dia_proto.get("D2", [2.2, 3.5]))

    for drill_entry in seq:
        is_cortical = isinstance(drill_entry, str) and "_cortical" in drill_entry
        drill_d = float(drill_entry.replace("_cortical", "")) if isinstance(drill_entry, str) else drill_entry
        if is_cortical:
            steps.append({"step": step_num, "drill_type": f"Cortical Drill {drill_d}mm", "code": "—",
                           "diameter": drill_d, "depth": "Coronal ONLY", "rpm": "300", "irrigation": True,
                           "note": "Cortical widening in hard bone (D1) only — NOT full osteotomy depth."})
        else:
            label = "Pilot Drill" if drill_d == 2.2 else (f"Final Drill {drill_d}mm" if drill_entry == seq[-1] and bone in ("D1", "D2") else f"Drill {drill_d}mm")
            rpm = "800" if drill_d <= 2.2 else "600"
            note = "Initial pilot drill." if drill_d == 2.2 else ("Final diameter reached." if label.startswith("Final") else "Sequential widening.")
            if bone in ("D3", "D4") and drill_entry == seq[-1]:
                note = "Under-sized preparation — skip final drill for primary stability."
            steps.append({"step": step_num, "drill_type": label, "code": "—",
                           "diameter": drill_d, "depth": depth, "rpm": rpm, "irrigation": True,
                           "note": note})
        step_num += 1

    placement_note = f"{sys_name} {d}mm x {implant_length}mm"
    if bone == "D2":
        placement_note += " — Place 1mm subcrestal. ~40 Ncm."
    elif bone in ("D3", "D4"):
        placement_note += " — Place at bone level. ~40 Ncm."
    else:
        placement_note += " — ~40 Ncm."

    steps.append({"step": step_num, "drill_type": "Implant Placement", "code": "—",
                   "diameter": d, "depth": depth, "rpm": "20-30", "irrigation": False,
                   "note": placement_note})

    return steps


# Conelog Progressive Line protocol
DRILLING_PROTOCOLS["Conelog|Progressive Line"] = {
    "system_name": "CONELOG Progressive Line",
    "lengths": [7, 9, 11, 13, 16],
    "bone_marker": {"diameter": 2.3, "code": "J5050.2300"},
    "pilot_drill": {"diameter": 2.0, "code": "J5051.2000"},
    "twist_drills": [
        {"diameter": 3.3, "code": "J5079.3300"},
        {"diameter": 3.8, "code": "J5079.3800"},
        {"diameter": 4.3, "code": "J5079.4300"},
        {"diameter": 5.0, "code": "J5079.5000"},
    ],
    "profile_drills": [
        {"diameter": 3.3, "code": "J5080.3300"},
        {"diameter": 3.8, "code": "J5080.3800"},
        {"diameter": 4.3, "code": "J5080.4300"},
        {"diameter": 5.0, "code": "J5080.5000"},
    ],
    "dense_bone_drills": [
        {"diameter": 3.3, "code": "J5072.3300"},
        {"diameter": 3.8, "code": "J5072.3800"},
        {"diameter": 4.3, "code": "J5072.4300"},
        {"diameter": 5.0, "code": "J5072.5000"},
    ],
}

# ── Neodent Grand Morse Drilling Protocols ──────────────────────────
# Shared drill code lookup for all Neodent GM systems
NEODENT_GM_CODES = {
    2.0: "103.170", 2.8: "103.162", 3.0: "103.213",
    3.3: "103.163", 3.5: "103.414", 3.6: "103.166",
    3.75: "103.168", 3.8: "103.415", 4.0: "103.416",
    4.3: "103.167", 5.0: "103.418",
}
NEODENT_GM_COMBO_CODES = {
    "2.8/3.5": "103.414", "3.0/3.75": "103.168",
    "3.3/4.0": "103.415", "3.6/4.3": "103.416",
    "4.3/5.0": "103.418",
}

# Helix GM protocol — Updated with precise diameter-wise drilling sequences
# D1/D2: Drill up to implant diameter + Plus (+) drill (coronal only)
# D3/D4: Stop one drill before final diameter, no Plus drill
# Depth = implant length
DRILLING_PROTOCOLS["Neodent|Helix GM Acqua"] = {
    "system_name": "Neodent Helix GM",
    "protocol_family": "helix",
    "lengths": [8, 10, 11.5, 13, 16, 18],
    "helix_protocols": {
        3.5:  {"D1_D2": [3.5],                                    "D3_D4": [],                                     "plus": 3.5},
        3.75: {"D1_D2": [3.5, 3.75],                              "D3_D4": [3.5],                                  "plus": 3.75},
        4.0:  {"D1_D2": [3.5, 3.75, 4.0],                         "D3_D4": [3.5, 3.75],                            "plus": 4.0},
        4.3:  {"D1_D2": [3.5, 3.75, 4.0, 4.3],                    "D3_D4": [3.5, 3.75, 4.0],                       "plus": 4.3},
        5.0:  {"D1_D2": [3.5, 3.75, 4.0, 4.3, 5.0],               "D3_D4": [3.5, 3.75, 4.0, 4.3],                  "plus": 5.0},
        6.0:  {"D1_D2": [3.5, 3.75, 4.0, 4.3, 5.0, 6.0],          "D3_D4": [3.5, 3.75, 4.0, 4.3, 5.0],             "plus": 6.0},
    },
}
DRILLING_PROTOCOLS["Neodent|Helix GM Neoporous"] = DRILLING_PROTOCOLS["Neodent|Helix GM Acqua"]

# Drive GM protocol
DRILLING_PROTOCOLS["Neodent|Drive GM Acqua"] = {
    "system_name": "Neodent Drive GM",
    "protocol_family": "drive",
    "lengths": [8, 10, 11.5, 13, 16, 18],
    "sequences": {
        3.5: [3.5],
        4.3: [3.5, 4.3],
        5.0: [3.5, 4.3, 5.0],
    },
}
DRILLING_PROTOCOLS["Neodent|Drive GM NeoPorous"] = DRILLING_PROTOCOLS["Neodent|Drive GM Acqua"]

# Titamax GM protocol
DRILLING_PROTOCOLS["Neodent|Titamax GM Acqua"] = {
    "system_name": "Neodent Titamax GM",
    "protocol_family": "titamax",
    "lengths": [7, 8, 9, 11, 13, 15, 17],
    "titamax_sequences": {
        3.5:  ["2/3", 2.8, 3.0, "2.8/3.5", 3.3],
        3.75: ["2/3", 2.8, 3.0, "3.0/3.75", 3.3],
        4.0:  ["2/3", 2.8, 3.0, "3.3/4.0", 3.8],
        5.0:  ["2/3", 2.8, 3.0, "3.3/4.0", 3.8, 4.3, "4.3/5.0"],
    },
}
DRILLING_PROTOCOLS["Neodent|Titamax GM NeoPorous"] = DRILLING_PROTOCOLS["Neodent|Titamax GM Acqua"]

# ── ZimVie TSX Drilling Protocols ──────────────────────────────────
DRILLING_PROTOCOLS["Zimmer|TSX"] = {
    "system_name": "ZimVie TSX",
    "protocol_family": "tsx",
    "lengths": [8.0, 10.0, 11.5, 13.0, 16.0],
    "diameters": {
        "3.1": {
            "soft": ["pilot", "2.3"],
            "dense": ["pilot", "2.3", "2.4/2.8 step"],
        },
        "3.7": {
            "soft": ["2.3", "2.8"],
            "dense": ["2.3", "2.8", "3.4/2.8 step"],
        },
        "4.1": {
            "soft": ["2.3", "2.8", "3.4/2.8"],
            "dense": ["2.3", "2.8", "3.4/2.8", "3.8/3.4 step"],
        },
        "4.7": {
            "soft": ["2.3", "2.8", "3.4/2.8", "3.8"],
            "dense": ["2.3", "2.8", "3.4/2.8", "3.8", "4.4/3.8 step"],
        },
        "5.4": {
            "soft": None,
            "dense": ["2.3", "2.8", "3.4/2.8", "3.8", "4.4/3.8", "5.1/4.4 step"],
        },
        "6.0": {
            "soft": ["2.3", "2.8", "3.4/2.8", "3.8", "4.4/3.8", "5.1"],
            "dense": ["2.3", "2.8", "3.4/2.8", "3.8", "4.4/3.8", "5.1", "5.7/5.1 step"],
        },
    },
    "gold_codes": {
        "pilot": "0201G", "2.3": "TSV23G", "2.8": "TSV28G",
        "3.4/2.8": "TSV34D28G", "3.4/2.8 step": "TSV34D28G",
        "3.8": "TSV38G", "3.8/3.4 step": "TSV38D34G",
        "4.4/3.8": "TSV44D38G", "4.4/3.8 step": "TSV44D38G",
        "5.1": "TSV51G", "5.1/4.4 step": "TSV51D44G",
        "5.7/5.1 step": "TSV57D51G", "2.4/2.8 step": "EZT28D24G",
    },
    "original_codes": {
        "pilot": "0201DSN", "2.3": "SV2.3DN", "2.8": "SV2.8DN",
        "3.4/2.8": "TSV3DN", "3.4/2.8 step": "TSV3DN",
        "3.8": "SV3.8DN", "3.8/3.4 step": "TSV3.8DN",
        "4.4/3.8": "TSV4DN", "4.4/3.8 step": "TSV4DN",
        "5.1": "SV5.1DN", "5.1/4.4 step": "TSV5.1DN",
        "5.7/5.1 step": "TSV6DN", "2.4/2.8 step": "ZOP28DN",
    },
}


# ── Refirm R Series Drilling Protocol ──────────────────────────────────────
DRILLING_PROTOCOLS["Refirm|R Series"] = {
    "system_name": "Refirm R Series",
    "protocol_family": "refirm",
    "lengths": [7.5, 8.5, 10, 11.5, 13, 15],
    "all_drills": [2.0, 2.5, 2.9, 3.4, 3.9, 4.4, 4.9],
    "csk_map": {3.2: 3.2, 3.5: 3.2, 4.0: 3.7, 4.5: 4.2, 5.0: 4.7, 5.5: 5.3},
}


def _generate_refirm_protocol(proto, implant_diameter, implant_length, bone):
    """Generate drilling protocol for Refirm R Series."""
    steps = []
    step_num = 1
    depth_str = str(implant_length)
    all_drills = proto["all_drills"]
    csk_map = proto["csk_map"]
    d = implant_diameter
    is_55 = abs(d - 5.5) < 0.01

    # Build the full drill sequence for this diameter (all drills < diameter)
    full_seq = [dr for dr in all_drills if dr < d]

    def add(drill_type, diameter, depth, rpm, irrigation, note=""):
        nonlocal step_num
        entry = {"step": step_num, "drill_type": drill_type, "code": "—",
                 "diameter": diameter, "depth": depth, "rpm": rpm, "irrigation": irrigation}
        if note:
            entry["note"] = note
        steps.append(entry)
        step_num += 1

    def rpm_for(dr):
        return "1200-1500" if dr <= 2.5 else "800-1000"

    if is_55:
        # --- Ø5.5 SPECIAL CASE ---
        if bone == "D1":
            for dr in full_seq:
                tp = "Lance Drill" if dr == 2.0 else ("Cylindrical Drill" if dr == 2.5 else "Taper Drill")
                add(tp, dr, depth_str, rpm_for(dr), True)
            add("Countersink (Crestal)", csk_map[5.5], "4-5 mm (Crestal Only)", "600-800", True,
                "MANDATORY — cortical expansion only")
        elif bone == "D2":
            for dr in full_seq:
                tp = "Lance Drill" if dr == 2.0 else ("Cylindrical Drill" if dr == 2.5 else "Taper Drill")
                add(tp, dr, depth_str, rpm_for(dr), True)
            add("Countersink (Crestal)", csk_map[5.5], "4-5 mm (Crestal Only)", "600-800", True,
                "MANDATORY — cortical expansion only")
        elif bone == "D3":
            for dr in full_seq:
                tp = "Lance Drill" if dr == 2.0 else ("Cylindrical Drill" if dr == 2.5 else "Taper Drill")
                add(tp, dr, depth_str, rpm_for(dr), True)
        elif bone == "D4":
            for dr in full_seq[:-1]:
                tp = "Lance Drill" if dr == 2.0 else ("Cylindrical Drill" if dr == 2.5 else "Taper Drill")
                add(tp, dr, depth_str, rpm_for(dr), True)
    else:
        # --- Standard diameters (Ø3.2 – Ø5.0) ---
        if bone == "D1":
            for dr in full_seq:
                tp = "Lance Drill" if dr == 2.0 else ("Cylindrical Drill" if dr == 2.5 else "Taper Drill")
                add(tp, dr, depth_str, rpm_for(dr), True)
        elif bone == "D2":
            for dr in full_seq[:-1]:
                tp = "Lance Drill" if dr == 2.0 else ("Cylindrical Drill" if dr == 2.5 else "Taper Drill")
                add(tp, dr, depth_str, rpm_for(dr), True)
            add("Countersink (Crestal)", csk_map.get(d, d - 0.3), "4-5 mm (Crestal Only)", "600-800", True,
                "Cortical expansion only — replaces final taper drill")
        elif bone == "D3":
            for dr in full_seq[:-1]:
                tp = "Lance Drill" if dr == 2.0 else ("Cylindrical Drill" if dr == 2.5 else "Taper Drill")
                add(tp, dr, depth_str, rpm_for(dr), True)
        elif bone == "D4":
            undersize_seq = full_seq[:-2] if len(full_seq) > 2 else full_seq[:1]
            for dr in undersize_seq:
                tp = "Lance Drill" if dr == 2.0 else ("Cylindrical Drill" if dr == 2.5 else "Taper Drill")
                add(tp, dr, depth_str, rpm_for(dr), True)

    # Always end with Implant Placement
    add("Implant Placement", d, depth_str, "20-30", False,
        f"Refirm R Series Ø{d}mm × {implant_length}mm — Target torque: 35-45 Ncm")

    return steps


def _find_drill(drills, diameter):
    for d in drills:
        if d["diameter"] == diameter:
            return d
    return None

def _largest_drill_below(drills, max_dia):
    candidates = [d for d in drills if d["diameter"] <= max_dia]
    return candidates[-1] if candidates else None


def _generate_neodent_protocol(proto, implant_diameter, implant_length, bone):
    """Generate drilling protocol for Neodent Grand Morse systems (Helix/Drive/Titamax)."""
    family = proto.get("protocol_family", "helix")
    steps = []
    step_num = 1
    depth = str(implant_length)
    is_dense = bone in ("D1", "D2")
    rpm_drill = "800-1200" if is_dense else "500-800"

    def _add_step(drill_type, diameter, code="—", irrigation=True, rpm=None):
        nonlocal step_num
        steps.append({
            "step": step_num, "drill_type": drill_type, "code": code,
            "diameter": diameter, "depth": depth,
            "rpm": rpm or rpm_drill, "irrigation": irrigation,
        })
        step_num += 1

    # Step 1 always: Initial Drill 2.0
    _add_step("Initial Drill", 2.0, NEODENT_GM_CODES.get(2.0, "—"))

    if family == "helix":
        helix_protos = proto.get("helix_protocols", {})
        dia_proto = helix_protos.get(implant_diameter)
        if not dia_proto:
            # Fallback: find closest diameter
            available = sorted(helix_protos.keys())
            closest = min(available, key=lambda x: abs(x - implant_diameter)) if available else None
            dia_proto = helix_protos.get(closest, {"D1_D2": [2.0, 2.8], "D3_D4": [2.0], "plus": implant_diameter})

        bone_key = "D1_D2" if is_dense else "D3_D4"
        seq = dia_proto[bone_key]
        plus_dia = dia_proto.get("plus", implant_diameter)

        for i, d in enumerate(seq):
            code = NEODENT_GM_CODES.get(d, "—")
            label = f"Final Drill {d} mm" if (i == len(seq) - 1 and is_dense) else f"Drill {d} mm"
            _add_step(label, d, code)

        # D1/D2: Add Plus (+) drill — crestal/coronal only
        if is_dense:
            _add_step(f"Plus Drill {plus_dia}+", plus_dia, "—", rpm="300",)
            steps[-1]["depth"] = "Coronal ONLY"
            steps[-1]["note"] = "Crestal cortical expansion only — NOT full osteotomy depth"

    elif family == "drive":
        seq_map = proto["sequences"]
        seq = list(seq_map.get(implant_diameter, []))
        for d in seq:
            code = NEODENT_GM_CODES.get(d, "—")
            _add_step(f"Drill {d} mm", d, code)
        # Dense bone: add optional final drill (next size up)
        if is_dense and implant_diameter < 5.0:
            all_diams = sorted(seq_map.keys())
            idx = all_diams.index(implant_diameter) if implant_diameter in all_diams else -1
            if idx >= 0 and idx + 1 < len(all_diams):
                next_d = all_diams[idx + 1]
                code = NEODENT_GM_CODES.get(next_d, "—")
                _add_step(f"Final Drill {next_d} mm (Dense Bone)", next_d, code)

    elif family == "titamax":
        seq_map = proto["titamax_sequences"]
        seq = list(seq_map.get(implant_diameter, []))
        for entry in seq:
            if isinstance(entry, str):
                if entry == "2/3":
                    _add_step("Step Drill 2/3", 3.0, "—")
                else:
                    code = NEODENT_GM_COMBO_CODES.get(entry, "—")
                    _add_step(f"Combination Drill {entry}", float(entry.split("/")[-1]), code)
            else:
                code = NEODENT_GM_CODES.get(entry, "—")
                _add_step(f"Drill {entry} mm", entry, code)

    # Final: Implant Placement
    _add_step("Implant Placement", implant_diameter, "—", irrigation=False, rpm="30")
    return steps


def _generate_tsx_protocol(proto, implant_diameter, implant_length, bone, kit="gold"):
    """Generate drilling protocol for ZimVie TSX system (Driva Gold or Original kit)."""
    steps = []
    step_num = 1
    depth = str(implant_length)
    is_dense = bone in ("D1", "D2")
    bone_cat = "dense" if is_dense else "soft"

    dia_key = str(implant_diameter)
    dia_data = proto["diameters"].get(dia_key)
    if not dia_data:
        closest = min(proto["diameters"].keys(), key=lambda k: abs(float(k) - implant_diameter), default=None)
        dia_data = proto["diameters"].get(closest, {})

    sequence = dia_data.get(bone_cat) if dia_data else None
    if sequence is None:
        return [{"step": 1, "drill_type": "Warning", "code": "—",
                 "diameter": implant_diameter, "depth": depth, "rpm": "—", "irrigation": False,
                 "note": f"No {bone_cat} bone protocol for {dia_key}mm TSX. Use clinician judgment."}]

    codes = proto["gold_codes"] if kit == "gold" else proto["original_codes"]
    kit_label = "Driva Gold Series" if kit == "gold" else "Driva Drills (Original)"

    for drill_desc in sequence:
        code = codes.get(drill_desc, drill_desc)
        is_pilot = "pilot" in drill_desc
        is_step = "step" in drill_desc
        if is_pilot:
            drill_type = "Tapered Pilot Drill"
            drill_dia = "2.1/1.6"
            rpm = "800-1500"
        elif is_step:
            drill_type = "Step Drill"
            drill_dia = drill_desc.replace(" step", "")
            rpm = "600-800"
        else:
            drill_type = "Drill"
            drill_dia = drill_desc
            rpm = "600-800"

        steps.append({
            "step": step_num, "drill_type": f"{drill_type} ({kit_label})", "code": code,
            "diameter": drill_dia, "depth": depth, "rpm": rpm, "irrigation": True,
        })
        step_num += 1

    steps.append({
        "step": step_num, "drill_type": "Implant Placement", "code": "—",
        "diameter": implant_diameter, "depth": depth, "rpm": "≤30", "irrigation": False,
    })
    return steps


def _generate_pro_protocol(proto, implant_diameter, implant_length, bone):
    steps = []
    step_num = 1
    depth = implant_length

    # Step 1: Pilot drill
    p = proto["pilot"]
    steps.append({"step": step_num, "drill_type": p["type"], "code": p["code"],
                   "diameter": p["diameter"], "depth": depth, "rpm": p["rpm"], "irrigation": True})
    step_num += 1

    dia_key = str(implant_diameter)
    dense_map = proto["dense_protocol_map"]

    if bone == "D4":
        # Reduced: pilot → last soft ≤ implant → last dense ≤ implant → implant
        soft = _largest_drill_below(proto["soft_drills"], implant_diameter)
        if soft:
            steps.append({"step": step_num, "drill_type": "Soft Bone Drill", "code": soft["code"],
                           "diameter": soft["diameter"], "depth": depth, "rpm": "1000", "irrigation": True})
            step_num += 1
        dense = _largest_drill_below(proto["dense_drills"], implant_diameter)
        if dense:
            steps.append({"step": step_num, "drill_type": "Dense Bone Drill", "code": dense["code"],
                           "diameter": dense["diameter"], "depth": depth, "rpm": "1000", "irrigation": True})
            step_num += 1
    else:
        # Full dense drill sequence from protocol map
        drill_diameters = dense_map.get(dia_key, [])
        if not drill_diameters:
            closest = min(dense_map.keys(), key=lambda k: abs(float(k) - implant_diameter), default=None)
            if closest:
                drill_diameters = dense_map[closest]
        for dd in drill_diameters:
            drill = _find_drill(proto["dense_drills"], dd)
            if drill:
                steps.append({"step": step_num, "drill_type": "Dense Bone Drill", "code": drill["code"],
                               "diameter": drill["diameter"], "depth": depth, "rpm": "1000", "irrigation": True})
                step_num += 1

    # Final: Implant placement
    steps.append({"step": step_num, "drill_type": "Implant Placement", "code": "—",
                   "diameter": implant_diameter, "depth": depth, "rpm": "30", "irrigation": False})
    return steps

def _generate_short_protocol(proto, implant_diameter, implant_length, bone):
    steps = []
    step_num = 1
    depth = implant_length

    p = proto["pilot"]
    steps.append({"step": step_num, "drill_type": p["type"], "code": p["code"],
                   "diameter": p["diameter"], "depth": depth, "rpm": p["rpm"], "irrigation": True})
    step_num += 1

    if bone == "D4":
        soft = _largest_drill_below(proto["soft_drills"], implant_diameter)
        if soft:
            steps.append({"step": step_num, "drill_type": "Soft Bone Drill", "code": soft["code"],
                           "diameter": soft["diameter"], "depth": depth, "rpm": "1000", "irrigation": True})
            step_num += 1
    else:
        # Soft bone drill
        soft = _largest_drill_below(proto["soft_drills"], implant_diameter)
        if soft:
            steps.append({"step": step_num, "drill_type": "Soft Bone Drill", "code": soft["code"],
                           "diameter": soft["diameter"], "depth": depth, "rpm": "1000", "irrigation": True})
            step_num += 1
        # Dense bone drill
        dense = _largest_drill_below(proto["dense_drills"], implant_diameter + 0.5)
        if dense:
            steps.append({"step": step_num, "drill_type": "Dense Bone Drill", "code": dense["code"],
                           "diameter": dense["diameter"], "depth": depth, "rpm": "1000", "irrigation": True})
            step_num += 1
        # Crestal (D1/D2 only)
        if bone in ("D1", "D2") and proto.get("crestal_drills"):
            crestal = _largest_drill_below(proto["crestal_drills"], implant_diameter + 0.5)
            if crestal:
                steps.append({"step": step_num, "drill_type": "Crestal Bone Drill", "code": crestal["code"],
                               "diameter": crestal["diameter"], "depth": depth, "rpm": "800", "irrigation": True})
                step_num += 1

    steps.append({"step": step_num, "drill_type": "Implant Placement", "code": "—",
                   "diameter": implant_diameter, "depth": depth, "rpm": "30", "irrigation": False})
    return steps

def _generate_conelog_protocol(proto, implant_diameter, implant_length, bone):
    """Generate drilling protocol for Conelog Progressive Line."""
    steps = []
    step_num = 1
    depth = f"{implant_length}"
    is_dense = bone in ("D1", "D2")
    is_soft = bone in ("D3", "D4")

    # Step 1: Bone Marker
    bm = proto["bone_marker"]
    steps.append({"step": step_num, "drill_type": "Bone Marker", "code": bm["code"],
                   "diameter": bm["diameter"], "depth": "Mark site", "rpm": "1500", "irrigation": True})
    step_num += 1

    # Step 2: Pilot Drill
    pd = proto["pilot_drill"]
    steps.append({"step": step_num, "drill_type": "Pilot Drill", "code": pd["code"],
                   "diameter": pd["diameter"], "depth": depth, "rpm": "800-1000", "irrigation": True})
    step_num += 1

    # Step 3: Parallel Pin (alignment check)
    steps.append({"step": step_num, "drill_type": "Parallel Pin", "code": "—",
                   "diameter": 2.0, "depth": depth, "rpm": "—", "irrigation": False})
    step_num += 1

    # Step 4: Progressive Twist Drills up to implant diameter
    # In soft bone (D3/D4): skip the FINAL twist drill for under-preparation
    drill_sequence = [d for d in proto["twist_drills"] if d["diameter"] <= implant_diameter]
    drills_to_use = drill_sequence[:-1] if is_soft and len(drill_sequence) > 1 else drill_sequence
    for drill in drills_to_use:
        steps.append({"step": step_num, "drill_type": f"Twist Drill {drill['diameter']} mm", "code": drill["code"],
                       "diameter": drill["diameter"], "depth": depth, "rpm": "800-1000", "irrigation": True})
        step_num += 1

    # Step 5: Profile Drill matching implant diameter
    profile = _find_drill(proto["profile_drills"], implant_diameter)
    if profile:
        steps.append({"step": step_num, "drill_type": "Profile Drill", "code": profile["code"],
                       "diameter": profile["diameter"], "depth": depth, "rpm": "800-1000", "irrigation": True})
        step_num += 1

    # Step 6: Dense Bone Drill (only D1/D2)
    if is_dense:
        dense = _find_drill(proto["dense_bone_drills"], implant_diameter)
        if dense:
            steps.append({"step": step_num, "drill_type": "Dense Bone Drill", "code": dense["code"],
                           "diameter": dense["diameter"], "depth": depth, "rpm": "800-1000", "irrigation": True})
            step_num += 1

    # Final: Implant Placement
    steps.append({"step": step_num, "drill_type": "Implant Placement", "code": "—",
                   "diameter": implant_diameter, "depth": depth, "rpm": "25-30", "irrigation": False})
    return steps

@api_router.post("/drilling-protocols/generate")
async def generate_drilling_protocol(
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    """Generate a drilling protocol for a specific implant and bone density."""
    brand = body.get("brand", "")
    system = body.get("system", "")
    diameter = float(body.get("diameter", 0))
    length = float(body.get("length", 0))
    bone = body.get("bone_density", "")
    tooth = body.get("tooth", "")

    if not all([brand, system, diameter, length, bone]):
        raise HTTPException(status_code=400, detail="brand, system, diameter, length, bone_density required")

    key = f"{brand}|{system}"
    proto = DRILLING_PROTOCOLS.get(key)
    if not proto:
        raise HTTPException(status_code=404, detail=f"No drilling protocol available for {brand} {system}")

    if proto.get("protocol_family") == "conical_rbt":
        steps = _generate_conical_rbt_protocol(proto, diameter, length, bone)
    elif proto.get("protocol_family") == "alpha_bio_spi":
        steps = _generate_alpha_bio_spi_protocol(proto, diameter, length, bone)
    elif proto.get("protocol_family") == "alpha_bio_brochure":
        steps = _generate_alpha_bio_brochure_protocol(proto, diameter, length, bone)
    elif "Short" in system and "Conelog" not in system and brand != "Neodent":
        steps = _generate_short_protocol(proto, diameter, length, bone)
    elif "Progressive" in system or brand == "Conelog":
        steps = _generate_conelog_protocol(proto, diameter, length, bone)
    elif proto.get("protocol_family") in ("helix", "drive", "titamax"):
        steps = _generate_neodent_protocol(proto, diameter, length, bone)
    elif proto.get("protocol_family") == "ankylos":
        steps = _generate_ankylos_protocol(proto, diameter, length, bone)
    elif proto.get("protocol_family") == "bb_dental":
        steps = _generate_bb_dental_protocol(proto, diameter, length, bone)
    elif proto.get("protocol_family") == "mis_lance":
        steps = _generate_mis_lance_protocol(proto, diameter, length, bone)
    elif proto.get("protocol_family") == "cowellmedi":
        steps = _generate_cowellmedi_protocol(proto, diameter, length, bone)
    elif proto.get("protocol_family") == "bredent_sky":
        steps = _generate_bredent_protocol(proto, diameter, length, bone)
    elif proto.get("protocol_family") == "osstem":
        steps = _generate_osstem_protocol(proto, diameter, length, bone)
    elif proto.get("protocol_family") == "tsx":
        steps = _generate_tsx_protocol(proto, diameter, length, bone, kit="gold")
    elif proto.get("protocol_family") == "refirm":
        steps = _generate_refirm_protocol(proto, diameter, length, bone)
    elif proto.get("protocol_family") == "straumann_blx":
        from straumann_blx_data import generate_blx_protocol
        steps = generate_blx_protocol(system, diameter, length, bone)
    elif proto.get("protocol_family") == "straumann_blt":
        from straumann_blt_data import generate_blt_protocol
        steps = generate_blt_protocol(system, diameter, length, bone)
    elif proto.get("protocol_family") == "adin":
        from adin_data import generate_adin_protocol
        steps = generate_adin_protocol(system, diameter, length, bone)
    else:
        steps = _generate_pro_protocol(proto, diameter, length, bone)

    family = proto.get("protocol_family", "")
    if family == "conical_rbt":
        protocol_type = "Reduced Protocol (Conical RBT)" if bone == "D4" else ("Conventional Protocol (Conical RBT)" if bone in ("D1", "D2", "D3") else "Standard Protocol (Conical RBT)")
    elif family == "alpha_bio_spi":
        protocol_type = f"Dense Bone Protocol (Alpha-Bio SPI)" if bone in ("D1", "D2") else f"Under-Preparation Protocol (Alpha-Bio SPI)"
    elif family == "alpha_bio_brochure":
        sys_label = proto.get("system_name", system)
        if bone == "D1":
            protocol_type = f"Hard Bone + Cortical Pass ({sys_label})"
        elif bone == "D4":
            protocol_type = f"Soft Bone Under-Preparation ({sys_label})"
        else:
            protocol_type = f"Standard Protocol ({sys_label})"
    elif family in ("helix", "drive", "titamax"):
        protocol_type = "Dense Bone Protocol" if bone in ("D1", "D2") else ("Soft Bone Protocol" if bone == "D4" else "Standard Protocol")
    elif "Progressive" in system or brand == "Conelog":
        protocol_type = "Soft Bone Protocol" if bone in ("D3", "D4") else "Standard Protocol"
    elif family == "ankylos":
        dm = proto["drill_mapping"].get(diameter, {})
        series_info = f" ({dm.get('series', '')} Series / {dm.get('color', '')})" if dm else ""
        protocol_type = f"Dense Bone Protocol{series_info}" if bone in ("D1", "D2") else f"Standard Protocol{series_info}"
    elif family == "bb_dental":
        bb_sys = proto.get("bb_system", "")
        sys_label = {"ev_line": "EV Line", "3p": "3P", "3p_long": "3P Long", "wide_line": "Wide Line", "dura_vit_slim": "Dura-Vit Slim"}.get(bb_sys, system)
        protocol_type = f"Dense Bone Protocol ({sys_label})" if bone in ("D1", "D2") else f"Soft Bone Protocol ({sys_label})"
    elif family == "mis_lance":
        protocol_type = f"Dense Bone Protocol (MIS LANCE+)" if bone in ("D1", "D2") else (f"Under-Preparation Protocol (MIS LANCE+)" if bone in ("D3", "D4") else "Standard Protocol (MIS LANCE+)")
    elif family == "cowellmedi":
        cw_sys = proto.get("cowellmedi_system", "submerged")
        cw_label = "INNO Submerged" if cw_sys == "submerged" else "INNO Narrow"
        protocol_type = f"Dense Bone Protocol ({cw_label})" if bone in ("D1", "D2") else (f"Under-Preparation Protocol ({cw_label})" if bone in ("D3", "D4") else f"Standard Protocol ({cw_label})")
    elif family == "bredent_sky":
        br_sys = proto.get("bredent_system", "blue")
        br_labels = {"mini": "miniSKY", "copa": "copaSKY", "narrow": "narrowSKY", "blue": "blueSKY", "classic": "classicSKY"}
        br_label = br_labels.get(br_sys, system)
        protocol_type = f"Hard Bone Protocol ({br_label})" if bone == "D1" else (f"Condensation Protocol ({br_label})" if bone == "D4" else f"Standard Protocol ({br_label})")
    elif family == "osstem":
        os_type = proto.get("osstem_type", "standard")
        os_label = proto.get("system_name", system)
        if os_type == "ts_iv":
            protocol_type = f"Ultra-Soft Bone Protocol ({os_label})"
        else:
            protocol_type = f"Hard Bone + Cortical Protocol ({os_label})" if bone == "D1" else (f"Under-Preparation Protocol ({os_label})" if bone in ("D3", "D4") else f"Standard Protocol ({os_label})")
    elif family == "tsx":
        protocol_type = f"Dense Bone Protocol (ZimVie TSX)" if bone in ("D1", "D2") else f"Soft Bone Protocol (ZimVie TSX)"
    elif family == "refirm":
        bone_labels = {"D1": "Dense Bone (Full Sequence)", "D2": "Moderately Dense (Countersink)", "D3": "Soft Bone (Under-Preparation)", "D4": "Very Soft Bone (Undersized)"}
        protocol_type = f"{bone_labels.get(bone, 'Standard')} Protocol (Refirm R Series)"
    elif family == "straumann_blx":
        sys_label = proto.get("system_name", system)
        blx_bone_labels = {"D1": "Hard Bone (Straumann BLX §5.2)", "D2": "Medium Bone (Straumann BLX §5.2)", "D3": "Soft Bone (Straumann BLX §5.2)", "D4": "Soft Bone (Straumann BLX §5.2)"}
        protocol_type = f"{blx_bone_labels.get(bone, 'Standard Protocol')} — {sys_label}"
    elif family == "straumann_blt":
        sys_label = proto.get("system_name", system)
        blt_bone_labels = {"D1": "Hard Bone (Straumann BLT §5.1)", "D2": "Medium Bone (Straumann BLT §5.1)", "D3": "Soft Bone (Straumann BLT §5.1)", "D4": "Soft Bone (Straumann BLT §5.1)"}
        protocol_type = f"{blt_bone_labels.get(bone, 'Standard Protocol')} — {sys_label}"
    elif family == "adin":
        sys_label = proto.get("system_name", system)
        adin_bone_labels = {"D1": "D-I Bone", "D2": "D-II/III Bone", "D3": "D-II/III Bone", "D4": "D-IV Bone"}
        protocol_type = f"Adin Catalog Protocol — {sys_label} ({adin_bone_labels.get(bone, 'Standard')})"
    else:
        protocol_type = "Reduced Protocol" if bone == "D4" else "Conventional Protocol"

    insertion_torque = "60 Ncm" if family in ("helix", "drive", "titamax") else ("25-35 Ncm" if family == "ankylos" else ("35-50 Ncm" if family == "mis_lance" else ("25-45 Ncm" if family in ("cowellmedi", "bredent_sky") else ("~40 Ncm" if family == "osstem" else ("≤90 Ncm" if family == "tsx" else ("30-80 Ncm (target 35 Ncm)" if family == "straumann_blx" else ("≤35 Ncm (target — check bed if >35 Ncm reached early)" if family == "straumann_blt" else ("Not specified by Adin catalog — refer to Adin surgical guide" if family == "adin" else ("35-45 Ncm" if family in ("conical_rbt", "alpha_bio_spi", "refirm") else "35-45 Ncm")))))))))

    # Add Ankylos series info to response
    ankylos_info = {}
    if family == "ankylos":
        dm = proto["drill_mapping"].get(diameter, {})
        ankylos_info = {
            "series": dm.get("series", ""),
            "color": dm.get("color", ""),
            "twist_drill": dm.get("twist_drill", 0),
            "implant_series": proto.get("implant_series", []),
        }

    response = {
        "system_name": proto["system_name"],
        "implant": {"brand": brand, "system": system, "diameter": diameter, "length": length},
        "bone_density": bone,
        "protocol_type": protocol_type,
        "tooth": tooth,
        "steps": steps,
        "total_steps": len(steps),
        "notes": [
            f"All drills use depth marking {length} mm",
            "Maintain copious irrigation during drilling" if bone != "D4" else "Reduced drilling for soft bone",
            f"Target insertion torque: {insertion_torque}",
        ],
        **({"ankylos_info": ankylos_info} if ankylos_info else {}),
    }

    # Add alternate kit for TSX (Driva Original)
    if family == "tsx":
        alt_steps = _generate_tsx_protocol(proto, diameter, length, bone, kit="original")
        response["alt_protocol"] = {"name": "Driva Drills (Original)", "steps": alt_steps, "total_steps": len(alt_steps)}

    if family == "adin" and system in ("RP CloseFit", "WP CloseFit",
                                        "Touareg-OS", "Touareg-S",
                                        "Swell", "One"):
        from adin_data import generate_adin_tristep_alt_protocol
        alt_steps = generate_adin_tristep_alt_protocol(system, diameter, length, bone)
        if alt_steps:
            response["alt_protocol"] = {
                "name": "Tri-Step Drill (alternative)",
                "description": "Single multi-step burr replaces the Ø2.0 + Ø2.8 + Ø3.2 sequential drills.",
                "steps": alt_steps,
                "total_steps": len(alt_steps),
            }

    return response

@api_router.get("/drilling-protocols/available")
async def get_available_protocols(current_user: dict = Depends(get_current_user)):
    """Return list of implant systems that have drilling protocols."""
    result = []
    for key, proto in DRILLING_PROTOCOLS.items():
        brand, system = key.split("|")
        entry = {
            "brand": brand,
            "system": system,
            "system_name": proto["system_name"],
            "lengths": proto.get("lengths", []),
        }
        if proto.get("protocol_family") == "ankylos":
            entry["implant_series"] = proto.get("implant_series", [])
            entry["size_database"] = {str(k): v for k, v in proto.get("size_database", {}).items()}
            entry["drill_mapping"] = {str(k): v for k, v in proto.get("drill_mapping", {}).items()}
        result.append(entry)
    return result

@api_router.post("/drilling-protocols/export-pdf")
async def export_drilling_pdf(
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    """Generate a PDF of the drilling protocol."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.lib.enums import TA_CENTER
    brand = body.get("brand", "")
    system = body.get("system", "")
    diameter = float(body.get("diameter", 0))
    length = float(body.get("length", 0))
    bone = body.get("bone_density", "")
    tooth = body.get("tooth", "")
    # Optional patient/case context — drawn as a banner + care team + QR on the A4 PDF.
    patient_name = (body.get("patient_name") or "").strip()
    patient_id_str = (body.get("patient_id") or "").strip()
    procedure_date = (body.get("procedure_date") or "").strip()
    procedure_id = (body.get("procedure_id") or "").strip()

    # Enrich from the procedure doc (care team, autoclave stamp, CBCT token for QR).
    proc_doc = None
    if procedure_id:
        try:
            proc_doc = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
        except Exception:
            proc_doc = None
    student_name_ctx = (proc_doc.get("student_name") if proc_doc else None) or (body.get("student_name") or "")
    supervisor_name_ctx = (proc_doc.get("supervisor_name") if proc_doc else None) or (body.get("supervisor_name") or "")
    incharge_name_ctx = (proc_doc.get("implant_incharge_name") if proc_doc else None) or (body.get("implant_incharge_name") or "")
    autoclave_info = (proc_doc.get("instruments_autoclaved") if proc_doc else None) or {}
    autoclave_marked = bool(autoclave_info.get("marked"))
    autoclave_by = autoclave_info.get("marked_by_name") or ""
    autoclave_at = autoclave_info.get("marked_at")
    if isinstance(autoclave_at, datetime):
        autoclave_at_str = autoclave_at.strftime("%b %d, %Y · %H:%M")
    elif isinstance(autoclave_at, str) and autoclave_at:
        try:
            autoclave_at_str = datetime.fromisoformat(autoclave_at.replace("Z", "+00:00")).strftime("%b %d, %Y · %H:%M")
        except Exception:
            autoclave_at_str = autoclave_at
    else:
        autoclave_at_str = ""

    if not all([brand, system, diameter, length, bone]):
        raise HTTPException(status_code=400, detail="All fields required")

    # Accept optional pre-computed steps from the frontend. This lets the PDF
    # render exactly what the user saw inline (covers brands/systems not yet
    # in DRILLING_PROTOCOLS without blocking clinical use).
    client_steps = body.get("steps")
    key = f"{brand}|{system}"
    proto = DRILLING_PROTOCOLS.get(key)
    if not proto and not client_steps:
        raise HTTPException(status_code=404, detail="No protocol available")
    protocol_type = None
    if not proto and client_steps:
        # Fallback render path — trust client payload and normalise to the
        # downstream table shape: drill_type/code/diameter/depth/rpm/irrigation.
        import re as _re
        steps = []
        for idx, s in enumerate(client_steps, start=1):
            drill = str(s.get("drill") or "Drill")
            speed = str(s.get("speed") or "")
            depth_str = str(s.get("depth") or "")
            # Try to pull a numeric diameter from the drill label ("2.2 mm", "Ø2.2", "2.2mm").
            m_dia = _re.search(r"(\d+(?:\.\d+)?)\s*mm", drill) or _re.search(r"[Øø]\s*(\d+(?:\.\d+)?)", drill)
            diameter_val: Any = float(m_dia.group(1)) if m_dia else ""
            # Pull numeric mm from depth field if present.
            m_depth = _re.search(r"(\d+(?:\.\d+)?)", depth_str)
            depth_val: Any = float(m_depth.group(1)) if m_depth else depth_str or ""
            # Pull a numeric RPM from the speed field.
            m_rpm = _re.search(r"(\d+)", speed)
            rpm_val: Any = int(m_rpm.group(1)) if m_rpm else speed or ""
            steps.append({
                "step": int(s.get("step") or idx),
                "drill_type": drill,
                "code": str(s.get("code") or ""),
                "diameter": diameter_val,
                "depth": depth_val,
                "rpm": rpm_val,
                "irrigation": True,
            })
        proto = {"protocol_family": "client", "sequence": steps, "system_name": f"{brand} {system}"}
        protocol_type = "Custom Protocol"

    if proto.get("protocol_family") == "client":
        # steps already assembled from client payload above
        pass
    elif proto.get("protocol_family") == "conical_rbt":
        steps = _generate_conical_rbt_protocol(proto, diameter, length, bone)
    elif proto.get("protocol_family") == "alpha_bio_spi":
        steps = _generate_alpha_bio_spi_protocol(proto, diameter, length, bone)
    elif "Short" in system and "Conelog" not in system and brand != "Neodent":
        steps = _generate_short_protocol(proto, diameter, length, bone)
    elif "Progressive" in system or brand == "Conelog":
        steps = _generate_conelog_protocol(proto, diameter, length, bone)
    elif proto.get("protocol_family") in ("helix", "drive", "titamax"):
        steps = _generate_neodent_protocol(proto, diameter, length, bone)
    elif proto.get("protocol_family") == "ankylos":
        steps = _generate_ankylos_protocol(proto, diameter, length, bone)
    elif proto.get("protocol_family") == "bb_dental":
        steps = _generate_bb_dental_protocol(proto, diameter, length, bone)
    elif proto.get("protocol_family") == "mis_lance":
        steps = _generate_mis_lance_protocol(proto, diameter, length, bone)
    elif proto.get("protocol_family") == "cowellmedi":
        steps = _generate_cowellmedi_protocol(proto, diameter, length, bone)
    elif proto.get("protocol_family") == "bredent_sky":
        steps = _generate_bredent_protocol(proto, diameter, length, bone)
    elif proto.get("protocol_family") == "osstem":
        steps = _generate_osstem_protocol(proto, diameter, length, bone)
    elif proto.get("protocol_family") == "tsx":
        steps = _generate_tsx_protocol(proto, diameter, length, bone, kit="gold")
    elif proto.get("protocol_family") == "refirm":
        steps = _generate_refirm_protocol(proto, diameter, length, bone)
    elif proto.get("protocol_family") == "straumann_blx":
        from straumann_blx_data import generate_blx_protocol
        steps = generate_blx_protocol(system, diameter, length, bone)
    elif proto.get("protocol_family") == "straumann_blt":
        from straumann_blt_data import generate_blt_protocol
        steps = generate_blt_protocol(system, diameter, length, bone)
    elif proto.get("protocol_family") == "adin":
        from adin_data import generate_adin_protocol
        steps = generate_adin_protocol(system, diameter, length, bone)
    else:
        steps = _generate_pro_protocol(proto, diameter, length, bone)

    family = proto.get("protocol_family", "")
    if family == "conical_rbt":
        protocol_type = "Reduced Protocol (Conical RBT)" if bone == "D4" else ("Conventional Protocol (Conical RBT)" if bone in ("D1", "D2", "D3") else "Standard Protocol (Conical RBT)")
    elif family == "alpha_bio_spi":
        protocol_type = f"Dense Bone Protocol (Alpha-Bio SPI)" if bone in ("D1", "D2") else f"Under-Preparation Protocol (Alpha-Bio SPI)"
    elif family == "alpha_bio_brochure":
        sys_label = proto.get("system_name", system)
        if bone == "D1":
            protocol_type = f"Hard Bone + Cortical Pass ({sys_label})"
        elif bone == "D4":
            protocol_type = f"Soft Bone Under-Preparation ({sys_label})"
        else:
            protocol_type = f"Standard Protocol ({sys_label})"
    elif family in ("helix", "drive", "titamax"):
        protocol_type = "Dense Bone Protocol" if bone in ("D1", "D2") else ("Soft Bone Protocol" if bone == "D4" else "Standard Protocol")
    elif "Progressive" in system or brand == "Conelog":
        protocol_type = "Soft Bone Protocol" if bone in ("D3", "D4") else "Standard Protocol"
    elif family == "ankylos":
        dm = proto["drill_mapping"].get(diameter, {})
        series_info = f" ({dm.get('series', '')} Series / {dm.get('color', '')})" if dm else ""
        protocol_type = f"Dense Bone Protocol{series_info}" if bone in ("D1", "D2") else f"Standard Protocol{series_info}"
    elif family == "bb_dental":
        bb_sys = proto.get("bb_system", "")
        sys_label = {"ev_line": "EV Line", "3p": "3P", "3p_long": "3P Long", "wide_line": "Wide Line", "dura_vit_slim": "Dura-Vit Slim"}.get(bb_sys, system)
        protocol_type = f"Dense Bone Protocol ({sys_label})" if bone in ("D1", "D2") else f"Soft Bone Protocol ({sys_label})"
    elif family == "mis_lance":
        protocol_type = f"Dense Bone Protocol (MIS LANCE+)" if bone in ("D1", "D2") else (f"Under-Preparation Protocol (MIS LANCE+)" if bone in ("D3", "D4") else "Standard Protocol (MIS LANCE+)")
    elif family == "cowellmedi":
        cw_sys = proto.get("cowellmedi_system", "submerged")
        cw_label = "INNO Submerged" if cw_sys == "submerged" else "INNO Narrow"
        protocol_type = f"Dense Bone Protocol ({cw_label})" if bone in ("D1", "D2") else (f"Under-Preparation Protocol ({cw_label})" if bone in ("D3", "D4") else f"Standard Protocol ({cw_label})")
    elif family == "bredent_sky":
        br_sys = proto.get("bredent_system", "blue")
        br_labels = {"mini": "miniSKY", "copa": "copaSKY", "narrow": "narrowSKY", "blue": "blueSKY", "classic": "classicSKY"}
        br_label = br_labels.get(br_sys, system)
        protocol_type = f"Hard Bone Protocol ({br_label})" if bone == "D1" else (f"Condensation Protocol ({br_label})" if bone == "D4" else f"Standard Protocol ({br_label})")
    elif family == "osstem":
        os_type = proto.get("osstem_type", "standard")
        os_label = proto.get("system_name", system)
        if os_type == "ts_iv":
            protocol_type = f"Ultra-Soft Bone Protocol ({os_label})"
        else:
            protocol_type = f"Hard Bone + Cortical Protocol ({os_label})" if bone == "D1" else (f"Under-Preparation Protocol ({os_label})" if bone in ("D3", "D4") else f"Standard Protocol ({os_label})")
    elif family == "tsx":
        protocol_type = f"Dense Bone Protocol (ZimVie TSX)" if bone in ("D1", "D2") else f"Soft Bone Protocol (ZimVie TSX)"
    elif family == "refirm":
        bone_labels = {"D1": "Dense Bone (Full Sequence)", "D2": "Moderately Dense (Countersink)", "D3": "Soft Bone (Under-Preparation)", "D4": "Very Soft Bone (Undersized)"}
        protocol_type = f"{bone_labels.get(bone, 'Standard')} Protocol (Refirm R Series)"
    elif family == "straumann_blx":
        sys_label = proto.get("system_name", system)
        blx_bone_labels = {"D1": "Hard Bone (Straumann BLX §5.2)", "D2": "Medium Bone (Straumann BLX §5.2)", "D3": "Soft Bone (Straumann BLX §5.2)", "D4": "Soft Bone (Straumann BLX §5.2)"}
        protocol_type = f"{blx_bone_labels.get(bone, 'Standard Protocol')} — {sys_label}"
    elif family == "straumann_blt":
        sys_label = proto.get("system_name", system)
        blt_bone_labels = {"D1": "Hard Bone (Straumann BLT §5.1)", "D2": "Medium Bone (Straumann BLT §5.1)", "D3": "Soft Bone (Straumann BLT §5.1)", "D4": "Soft Bone (Straumann BLT §5.1)"}
        protocol_type = f"{blt_bone_labels.get(bone, 'Standard Protocol')} — {sys_label}"
    elif family == "adin":
        sys_label = proto.get("system_name", system)
        adin_bone_labels = {"D1": "D-I Bone", "D2": "D-II/III Bone", "D3": "D-II/III Bone", "D4": "D-IV Bone"}
        protocol_type = f"Adin Catalog Protocol — {sys_label} ({adin_bone_labels.get(bone, 'Standard')})"
    else:
        protocol_type = "Reduced Protocol" if bone == "D4" else "Conventional Protocol"
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20*mm, bottomMargin=15*mm,
                            leftMargin=15*mm, rightMargin=15*mm)
    styles = getSampleStyleSheet()
    elements = []

    # ── Patient banner (centered text on blue strip) ────────────────────
    banner_bits = []
    if patient_name:
        banner_bits.append(f"<b>Patient:</b> {patient_name}")
    if patient_id_str:
        banner_bits.append(f"<b>ID:</b> {patient_id_str}")
    if procedure_date:
        banner_bits.append(f"<b>Surgery date:</b> {procedure_date}")
    banner_bits.append(f"<b>Generated:</b> {datetime.now().strftime('%b %d, %Y · %H:%M')}")
    banner_style = ParagraphStyle(
        'banner', parent=styles['BodyText'], fontSize=10, alignment=TA_CENTER,
        textColor=colors.HexColor('#FFFFFF'), leading=14,
        backColor=colors.HexColor('#0D47A1'), borderPadding=6,
    )
    elements.append(Paragraph(" &nbsp;·&nbsp; ".join(banner_bits), banner_style))
    elements.append(Spacer(1, 4*mm))

    # ── Title + QR code row ─────────────────────────────────────────────
    title_style = ParagraphStyle('title', parent=styles['Title'], fontSize=18,
                                  textColor=colors.HexColor('#1565C0'), spaceAfter=6, alignment=0)
    # Build QR pointing at the public CBCT gallery (only if we have a procedure_id).
    qr_cell = ""
    if procedure_id:
        try:
            import qrcode as _qrcode_mod
            token = _sign_cbct_token(procedure_id)
            # Absolute base URL required — a relative URL produces an unscannable QR.
            public_base = (
                os.environ.get("CBCT_PUBLIC_BASE_URL")
                or os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").strip()
                or "https://api.implanr.com"
            )
            if not public_base.startswith("http"):
                logging.warning("CBCT QR base URL missing/invalid: %r", public_base)
            # Lands on the gallery, which links to /cbct/pdf/<token> for the combined PDF.
            qr_url = f"{public_base.rstrip('/')}/cbct/view/{token}"
            qr_img = _qrcode_mod.make(qr_url)
            qr_buf = io.BytesIO()
            qr_img.save(qr_buf, format="PNG")
            qr_buf.seek(0)
            qr_cell = RLImage(qr_buf, width=28*mm, height=28*mm)
        except Exception as exc:
            logging.warning("QR generation failed: %s", exc)
            qr_cell = ""

    # Two-column layout: left = title + info table; right = QR + label.
    info_data = [
        ["Implant System:", proto.get("system_name") or f"{brand} {system}"],
        ["Implant Size:", f"{diameter} x {length} mm"],
        ["Bone Density:", bone],
        ["Protocol:", protocol_type],
    ]
    if tooth:
        info_data.insert(0, ["Tooth (FDI):", tooth])
    info_table = Table(info_data, colWidths=[38*mm, 80*mm])
    info_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#263238')),
        ('TEXTCOLOR', (1, 0), (1, -1), colors.HexColor('#1565C0')),
    ]))
    qr_caption_style = ParagraphStyle(
        'qr_cap', parent=styles['BodyText'], fontSize=7.5, alignment=TA_CENTER,
        textColor=colors.HexColor('#546E7A'), leading=9,
    )
    qr_stack = Table([
        [qr_cell if qr_cell else Paragraph("", qr_caption_style)],
        [Paragraph("Scan for CBCT<br/>(valid 24 h)", qr_caption_style)],
    ], colWidths=[32*mm])
    qr_stack.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    title_para = Paragraph("Drilling Protocol – Surgical Reference", title_style)
    left_col = Table([[title_para], [Spacer(1, 2*mm)], [info_table]], colWidths=[118*mm])
    left_col.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    header_row = Table([[left_col, qr_stack]], colWidths=[120*mm, 50*mm])
    header_row.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    elements.append(header_row)
    elements.append(Spacer(1, 8*mm))

    # ── Care team row (postgrad student + supervisor + implant in-charge) ──
    team_bits = []
    if student_name_ctx:
        team_bits.append(f"<b>Postgraduate student:</b> {student_name_ctx}")
    if supervisor_name_ctx:
        team_bits.append(f"<b>Supervisor:</b> {supervisor_name_ctx}")
    if incharge_name_ctx:
        team_bits.append(f"<b>Implant In-Charge:</b> {incharge_name_ctx}")
    if team_bits:
        team_style = ParagraphStyle(
            'team', parent=styles['BodyText'], fontSize=9.5, alignment=TA_CENTER,
            textColor=colors.HexColor('#37474F'), leading=12,
            backColor=colors.HexColor('#ECEFF1'), borderPadding=5,
        )
        elements.append(Paragraph(" &nbsp;·&nbsp; ".join(team_bits), team_style))
        elements.append(Spacer(1, 6*mm))

    # ── Drilling sequence (centered title) ──────────────────────────────
    elements.append(Paragraph("Drilling Sequence", ParagraphStyle('h2', parent=styles['Heading2'],
                               fontSize=14, textColor=colors.HexColor('#263238'), alignment=TA_CENTER)))
    elements.append(Spacer(1, 3*mm))

    # Render Drill Type and Depth columns via Paragraph so long text wraps inside the cell.
    cell_style = ParagraphStyle('cell', parent=styles['BodyText'], fontSize=9.5, leading=11, alignment=TA_CENTER)
    header = ["Step", "Drill Type", "Code", "Diameter", "Depth", "RPM", "Irrigation"]
    table_data = [header]
    for s in steps:
        depth_str = f"{s['depth']} mm" if not str(s['depth']).lower().endswith('mm') else str(s['depth'])
        table_data.append([
            str(s["step"]),
            Paragraph(str(s["drill_type"]), cell_style),
            str(s["code"]),
            f"{s['diameter']} mm",
            Paragraph(depth_str, cell_style),
            str(s["rpm"]),
            "Yes" if s["irrigation"] else "No",
        ])

    col_widths = [12*mm, 40*mm, 26*mm, 20*mm, 30*mm, 20*mm, 22*mm]
    t = Table(table_data, colWidths=col_widths)

    drill_colors = {
        "Pilot Drill": colors.HexColor('#E3F2FD'),
        "Short Pilot Drill": colors.HexColor('#E3F2FD'),
        "Dense Bone Drill": colors.HexColor('#F5F5F5'),
        "Soft Bone Drill": colors.HexColor('#E8F5E9'),
        "Crestal Bone Drill": colors.HexColor('#FFF8E1'),
        "Implant Placement": colors.HexColor('#FFF3E0'),
    }
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1565C0')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#B0BEC5')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
    ]
    for i, s in enumerate(steps):
        bg = drill_colors.get(s["drill_type"], colors.white)
        style_cmds.append(('BACKGROUND', (0, i + 1), (-1, i + 1), bg))

    t.setStyle(TableStyle(style_cmds))
    elements.append(t)
    elements.append(Spacer(1, 8*mm))

    # Notes
    elements.append(Paragraph("Notes", ParagraphStyle('h3', parent=styles['Heading3'],
                               fontSize=12, textColor=colors.HexColor('#37474F'))))
    notes = [
        f"All drills use depth marking {length} mm.",
        "Maintain copious irrigation during drilling.",
        "Target insertion torque: 35-45 Ncm.",
        "Verify primary stability before prosthetic loading.",
    ]
    for n in notes:
        elements.append(Paragraph(f"• {n}", ParagraphStyle('note', parent=styles['Normal'],
                                   fontSize=10, spaceAfter=2, leftIndent=5*mm)))
    elements.append(Spacer(1, 6*mm))

    # Checklist
    elements.append(Paragraph("Surgical Checklist", ParagraphStyle('h3', parent=styles['Heading3'],
                               fontSize=12, textColor=colors.HexColor('#37474F'))))
    checklist = [
        "CBCT reviewed", "Implant size verified", "Surgical kit prepared",
        "Sterile irrigation ready", "Primary stability confirmed",
        "Torque recorded", "Post-operative instructions given",
    ]
    for c in checklist:
        elements.append(Paragraph(f"☐  {c}", ParagraphStyle('check', parent=styles['Normal'],
                                   fontSize=10, spaceAfter=3, leftIndent=5*mm)))

    # ── Autoclave stamp (only when nurse has marked instruments sterilised) ──
    if autoclave_marked:
        stamp_lines = ["<b>INSTRUMENTS AUTOCLAVED</b>"]
        meta_bits = []
        if autoclave_by:
            meta_bits.append(f"By: {autoclave_by}")
        if autoclave_at_str:
            meta_bits.append(autoclave_at_str)
        if meta_bits:
            stamp_lines.append(" &nbsp;·&nbsp; ".join(meta_bits))
        stamp_style = ParagraphStyle(
            'autoclave_stamp', parent=styles['BodyText'], fontSize=10, alignment=TA_CENTER,
            textColor=colors.HexColor('#1B5E20'), leading=13,
            backColor=colors.HexColor('#E8F5E9'), borderPadding=6,
            borderColor=colors.HexColor('#2E7D32'), borderWidth=1, borderRadius=4,
        )
        elements.append(Spacer(1, 8*mm))
        elements.append(Paragraph("<br/>".join(stamp_lines), stamp_style))

    # Footer
    elements.append(Spacer(1, 10*mm))
    elements.append(Paragraph("Generated by Implanr",
                    ParagraphStyle('footer', parent=styles['Normal'], fontSize=8,
                                    textColor=colors.HexColor('#B0BEC5'), alignment=1)))

    doc.build(elements)
    buf.seek(0)
    filename = f"DrillingProtocol_{brand}_{diameter}x{length}_{bone}.pdf"
    return StreamingResponse(buf, media_type="application/pdf",
                              headers={"Content-Disposition": f"attachment; filename={filename}"})


# ═══════════════════════════════════════════════════════════════════════════
# DISCUSSION FORUM (iteration 121)
# ---------------------------------------------------------------------------
# Collections:
#   forum_threads   — one per shared case  {id, procedure_id, shared_by_*,
#                     shared_at, status: open|closed|removed, closed_by_*,
#                     close_reason, last_activity_at, reply_count, anonymous,
#                     tags, participants: [user_id], bookmarks: [user_id],
#                     watchers: [user_id]}
#   forum_posts     — replies     {id, thread_id, author_*, body, attachments,
#                     reactions: {type: [user_id]}, verified_by_*, mentions,
#                     created_at, edited_at, deleted_at, deleted_by_*}
# ═══════════════════════════════════════════════════════════════════════════

FORUM_ATTACH_DIR = UPLOADS_DIR / 'forum'
FORUM_ATTACH_DIR.mkdir(parents=True, exist_ok=True)
FORUM_ALLOWED_EXT = {'.png', '.jpg', '.jpeg', '.pdf', '.heic', '.heif', '.webp'}
FORUM_MAX_BYTES = 10 * 1024 * 1024  # 10 MB
FORUM_EDIT_WINDOW = timedelta(minutes=15)
FORUM_REACTIONS = {"thumbs", "heart", "think", "check"}
FORUM_CLOSE_REASONS = {
    "resolved": "Resolved — answer verified",
    "off_topic": "Off-topic",
    "privacy": "Patient privacy concern",
    "other": "Other",
}


async def _ensure_forum_indexes():
    try:
        await db.forum_threads.create_index([("last_activity_at", -1)])
        await db.forum_threads.create_index([("procedure_id", 1)])
        await db.forum_threads.create_index([("status", 1)])
        await db.forum_threads.create_index([("tags", 1)])
        await db.forum_posts.create_index([("thread_id", 1), ("created_at", 1)])
        await db.forum_posts.create_index([("body", "text")])
    except Exception as e:
        logging.error(f"[forum] index creation failed: {e}")


class ForumShareRequest(BaseModel):
    procedure_id: str
    consent_acknowledged: bool = False
    anonymous: bool = False


class ForumPostCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=5000)
    attachments: Optional[List[Dict[str, Any]]] = None  # [{url, filename, type, size}]
    reply_to: Optional[str] = None  # post_id being replied to


class ForumPostEdit(BaseModel):
    body: str = Field(..., min_length=1, max_length=5000)


class ForumCloseRequest(BaseModel):
    reason: str = "other"  # key from FORUM_CLOSE_REASONS
    note: Optional[str] = Field(None, max_length=500)


class ForumReactionRequest(BaseModel):
    reaction: str  # must be in FORUM_REACTIONS


def _forum_can_share(user: dict, procedure: dict) -> bool:
    role = (user or {}).get("role")
    if role == "nurse":
        return False
    if role in ("implant_incharge", "administrator"):
        return True
    uid = str(user.get("_id") or user.get("id") or "")
    if role == "supervisor":
        return procedure.get("supervisor_id") == uid
    if role == "student":
        return procedure.get("student_id") == uid or procedure.get("created_by_id") == uid
    return False


def _forum_can_moderate(user: dict, thread: dict) -> bool:
    role = (user or {}).get("role")
    if role in ("implant_incharge", "administrator"):
        return True
    uid = str(user.get("_id") or user.get("id") or "")
    if thread.get("shared_by_id") == uid:
        return True
    if role == "supervisor" and thread.get("case_supervisor_id") == uid:
        return True
    return False


def _forum_can_access(user: dict) -> bool:
    return (user or {}).get("role") != "nurse"


def _derive_forum_tags(procedure: dict) -> List[str]:
    tags: List[str] = []
    ptype = procedure.get("implant_procedure_type")
    if ptype:
        tags.append(ptype)
    arch = procedure.get("arch")
    if arch:
        tags.append(arch)
    if procedure.get("bone_graft_specifications"):
        tags.append("Bone Graft")
    ridge = (procedure.get("ridge_contour") or "").lower()
    if "narrow" in ridge or "knife" in ridge:
        tags.append("Narrow Ridge")
    return sorted(set(tags))


def _serialize_thread(t: dict, viewer_id: Optional[str] = None) -> dict:
    out = {
        "id": t.get("id"),
        "procedure_id": t.get("procedure_id"),
        "shared_by_id": t.get("shared_by_id"),
        "shared_by_name": t.get("shared_by_name"),
        "shared_by_role": t.get("shared_by_role"),
        "shared_at": t.get("shared_at").isoformat() if t.get("shared_at") else None,
        "status": t.get("status"),
        "close_reason": t.get("close_reason"),
        "close_note": t.get("close_note"),
        "closed_by_id": t.get("closed_by_id"),
        "closed_by_name": t.get("closed_by_name"),
        "closed_at": t.get("closed_at").isoformat() if t.get("closed_at") else None,
        "last_activity_at": t.get("last_activity_at").isoformat() if t.get("last_activity_at") else None,
        "reply_count": t.get("reply_count", 0),
        "anonymous": t.get("anonymous", False),
        "tags": t.get("tags", []),
        "implant_procedure_type": t.get("implant_procedure_type"),
        "case_status": t.get("case_status"),
        "case_supervisor_id": t.get("case_supervisor_id"),
    }
    if out["anonymous"]:
        # Redact patient + sharer identity — strip raw fields, expose initials only
        initials = "".join([p[0] for p in (t.get("patient_name") or "").split() if p])[:3].upper() or "A.P."
        out["patient_name"] = None
        out["student_name"] = None
        out["supervisor_name"] = None
        out["patient_name_display"] = f"{initials} (anonymous)"
        out["shared_by_display"] = "Anonymous"
        out["shared_by_name"] = None
        out["shared_by_role"] = None
        out["shared_by_id"] = None
    else:
        out["patient_name"] = t.get("patient_name")
        out["student_name"] = t.get("student_name")
        out["supervisor_name"] = t.get("supervisor_name")
        out["patient_name_display"] = t.get("patient_name")
        out["shared_by_display"] = t.get("shared_by_name")
    # is_my_thread: true only for the original sharer so the owner can still
    # open their own case details even when shared anonymously.
    real_sharer_id = str(t.get("shared_by_id") or "")
    out["is_my_thread"] = bool(viewer_id and real_sharer_id and viewer_id == real_sharer_id)
    if viewer_id:
        out["bookmarked"] = viewer_id in (t.get("bookmarks") or [])
        out["watching"] = viewer_id in (t.get("watchers") or [])
    return out


def _serialize_post(p: dict, viewer_id: Optional[str] = None) -> dict:
    reactions = p.get("reactions") or {}
    summary = {k: len(v or []) for k, v in reactions.items()}
    mine = {k: (viewer_id in (v or [])) for k, v in reactions.items()} if viewer_id else {}
    return {
        "id": p.get("id"),
        "thread_id": p.get("thread_id"),
        "author_id": p.get("author_id"),
        "author_name": p.get("author_name"),
        "author_role": p.get("author_role"),
        "body": p.get("body") if not p.get("deleted_at") else "[deleted]",
        "attachments": p.get("attachments") or [],
        "created_at": p.get("created_at").isoformat() if p.get("created_at") else None,
        "edited_at": p.get("edited_at").isoformat() if p.get("edited_at") else None,
        "deleted_at": p.get("deleted_at").isoformat() if p.get("deleted_at") else None,
        "verified_by_id": p.get("verified_by_id"),
        "verified_by_name": p.get("verified_by_name"),
        "verified_at": p.get("verified_at").isoformat() if p.get("verified_at") else None,
        "reactions_summary": summary,
        "reactions_mine": mine,
        "mentions": p.get("mentions") or [],
        "reply_to": p.get("reply_to"),
    }


async def _forum_notify(user_ids: List[str], title: str, body: str, data: Dict[str, Any]):
    now = datetime.now(timezone.utc)
    for uid in set(user_ids):
        if not uid:
            continue
        try:
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": uid,
                "title": title,
                "body": body,
                "type": "forum",
                "data": data,
                "read": False,
                "created_at": now,
            })
        except Exception as e:
            logging.error(f"[forum] notification insert failed: {e}")
    try:
        await send_expo_push_notifications(list(set(user_ids)), title, body, {"type": "forum", **data})
    except Exception:
        pass


@api_router.post("/forum/threads")
async def forum_share_case(payload: ForumShareRequest, request: Request, current_user: dict = Depends(get_current_user)):
    if not _forum_can_access(current_user):
        raise HTTPException(status_code=403, detail="Nurses cannot use the Discussion Forum.")
    if not payload.consent_acknowledged:
        raise HTTPException(status_code=400, detail="Patient consent acknowledgment required before sharing.")
    proc = await db.procedures.find_one({"_id": ObjectId(payload.procedure_id)} if ObjectId.is_valid(payload.procedure_id) else {"id": payload.procedure_id})
    if not proc:
        raise HTTPException(status_code=404, detail="Case not found.")
    if not _forum_can_share(current_user, proc):
        raise HTTPException(status_code=403, detail="You cannot share this case.")
    # Idempotent: return existing open thread if any
    existing = await db.forum_threads.find_one({"procedure_id": payload.procedure_id, "status": "open"}, {"_id": 0})
    if existing:
        # Honour a stricter privacy choice on re-share: requesting anonymous on
        # a currently-public thread flips it to anonymous. The reverse
        # (de-anonymising) is only allowed for the original sharer — otherwise
        # a colleague re-sharing publicly would unmask the sharer's choice.
        req_uid = str(current_user.get("_id") or current_user.get("id"))
        want_anon = bool(payload.anonymous)
        if want_anon != bool(existing.get("anonymous")):
            if want_anon or existing.get("shared_by_id") == req_uid:
                await db.forum_threads.update_one({"id": existing["id"]}, {"$set": {"anonymous": want_anon}})
                existing["anonymous"] = want_anon
        return {"thread": _serialize_thread(existing, viewer_id=req_uid), "existing": True}
    uid = str(current_user.get("_id") or current_user.get("id"))
    now = datetime.now(timezone.utc)
    tid = str(uuid.uuid4())
    thread = {
        "id": tid,
        "procedure_id": payload.procedure_id,
        "shared_by_id": uid,
        "shared_by_name": current_user.get("name"),
        "shared_by_role": current_user.get("role"),
        "shared_at": now,
        "status": "open",
        "anonymous": bool(payload.anonymous),
        "last_activity_at": now,
        "reply_count": 0,
        "tags": _derive_forum_tags(proc),
        "patient_name": proc.get("patient_name"),
        "student_name": proc.get("student_name"),
        "supervisor_name": proc.get("supervisor_name"),
        "implant_procedure_type": proc.get("implant_procedure_type"),
        "case_status": proc.get("status"),
        "case_supervisor_id": proc.get("supervisor_id"),
        "participants": [uid],
        "bookmarks": [],
        "watchers": [uid],
    }
    await db.forum_threads.insert_one(thread)
    await log_access(action="forum_share", outcome="success", user=current_user, request=request,
                     resource_type="forum_thread", resource_id=tid, extra={"procedure_id": payload.procedure_id, "anonymous": payload.anonymous})
    # Broadcast to all in-charges + admins
    try:
        mods = db.users.find({"role": {"$in": ["implant_incharge", "administrator"]}}, {"_id": 0, "id": 1})
        mod_ids = [m.get("id") async for m in mods if m.get("id") and m.get("id") != uid]
        if payload.anonymous:
            # Anonymous share — hide the sharer's identity in the broadcast too.
            body = "An anonymous case was shared for discussion."
        else:
            body = f"{current_user.get('name')} shared {proc.get('patient_name') or 'a case'} for discussion."
        await _forum_notify(mod_ids, "New Discussion Forum case", body, {"thread_id": tid})
    except Exception:
        pass
    thread_clean = await db.forum_threads.find_one({"id": tid}, {"_id": 0})
    return {"thread": _serialize_thread(thread_clean, viewer_id=uid), "existing": False}


@api_router.get("/forum/threads")
async def forum_list_threads(
    status: Optional[str] = None,
    q: Optional[str] = None,
    tag: Optional[str] = None,
    mine_only: bool = False,
    bookmarked: bool = False,
    limit: int = Query(20, ge=1, le=100),
    skip: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    if not _forum_can_access(current_user):
        raise HTTPException(status_code=403, detail="Nurses cannot use the Discussion Forum.")
    uid = str(current_user.get("_id") or current_user.get("id"))
    query: Dict[str, Any] = {}
    if status:
        if status not in ("open", "closed", "removed"):
            raise HTTPException(status_code=400, detail="Invalid status filter.")
        query["status"] = status
    else:
        # Hide removed threads from non-mods by default
        role = current_user.get("role")
        if role not in ("implant_incharge", "administrator"):
            query["status"] = {"$in": ["open", "closed"]}
    if tag:
        query["tags"] = tag
    if mine_only:
        query["shared_by_id"] = uid
    if bookmarked:
        query["bookmarks"] = uid
    if q:
        qs = q.strip()
        if qs:
            rx = {"$regex": qs, "$options": "i"}
            # Name-based matches are restricted to non-anonymous threads —
            # otherwise searching a patient/operator name would reveal that an
            # anonymous case about them exists.
            query["$or"] = [
                {"anonymous": {"$ne": True}, "patient_name": rx},
                {"anonymous": {"$ne": True}, "student_name": rx},
                {"anonymous": {"$ne": True}, "supervisor_name": rx},
                {"implant_procedure_type": rx},
                {"tags": rx},
            ]
    total = await db.forum_threads.count_documents(query)
    cursor = db.forum_threads.find(query, {"_id": 0}).sort("last_activity_at", -1).skip(skip).limit(limit)
    items = [_serialize_thread(t, viewer_id=uid) async for t in cursor]
    return {"total": total, "skip": skip, "limit": limit, "items": items}


@api_router.get("/forum/threads/{thread_id}")
async def forum_get_thread(thread_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    if not _forum_can_access(current_user):
        raise HTTPException(status_code=403, detail="Nurses cannot use the Discussion Forum.")
    thread = await db.forum_threads.find_one({"id": thread_id}, {"_id": 0})
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found.")
    if thread.get("status") == "removed" and current_user.get("role") not in ("implant_incharge", "administrator"):
        raise HTTPException(status_code=404, detail="Thread not found.")
    procedure = await db.procedures.find_one({"id": thread["procedure_id"]}, {"_id": 0})
    uid = str(current_user.get("_id") or current_user.get("id"))
    await log_access(action="forum_view_thread", outcome="success", user=current_user, request=request,
                     resource_type="forum_thread", resource_id=thread_id)
    # For anonymous threads, strip all patient / operator PII from the procedure
    # snapshot so other members cannot identify the patient or sharer.
    if thread.get("anonymous") and procedure:
        procedure = {k: v for k, v in procedure.items() if k not in FORUM_ANONYMOUS_PII_KEYS}
    return {
        "thread": _serialize_thread(thread, viewer_id=uid),
        "procedure": procedure,
        "can_moderate": _forum_can_moderate(current_user, thread),
        "can_remove": current_user.get("role") in ("implant_incharge", "administrator"),
        "can_verify": current_user.get("role") in ("implant_incharge", "administrator"),
    }


@api_router.get("/forum/threads/{thread_id}/posts")
async def forum_list_posts(
    thread_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    if not _forum_can_access(current_user):
        raise HTTPException(status_code=403, detail="Nurses cannot use the Discussion Forum.")
    thread = await db.forum_threads.find_one({"id": thread_id}, {"_id": 0, "status": 1})
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found.")
    uid = str(current_user.get("_id") or current_user.get("id"))
    total = await db.forum_posts.count_documents({"thread_id": thread_id})
    cursor = db.forum_posts.find({"thread_id": thread_id}, {"_id": 0}).sort("created_at", 1).skip(skip).limit(limit)
    items = [_serialize_post(p, viewer_id=uid) async for p in cursor]
    return {"total": total, "skip": skip, "limit": limit, "items": items}


def _extract_mentions(body: str) -> List[str]:
    # Returns a list of usernames (without @) found in body. Bound to 10.
    return list({m.group(1) for m in re.finditer(r"@([a-zA-Z0-9_.\-]{2,40})", body or "")})[:10]


@api_router.post("/forum/threads/{thread_id}/posts")
async def forum_add_post(thread_id: str, payload: ForumPostCreate, request: Request, current_user: dict = Depends(get_current_user)):
    if not _forum_can_access(current_user):
        raise HTTPException(status_code=403, detail="Nurses cannot use the Discussion Forum.")
    thread = await db.forum_threads.find_one({"id": thread_id}, {"_id": 0})
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found.")
    if thread.get("status") != "open":
        raise HTTPException(status_code=409, detail=f"Thread is {thread.get('status')}; cannot add posts.")
    uid = str(current_user.get("_id") or current_user.get("id"))
    now = datetime.now(timezone.utc)
    pid = str(uuid.uuid4())
    mention_names = _extract_mentions(payload.body)
    mentioned_ids: List[str] = []
    if mention_names:
        mcursor = db.users.find(
            {"$or": [{"username": {"$in": mention_names}}, {"name": {"$in": mention_names}}]},
            {"_id": 0, "id": 1, "name": 1, "username": 1},
        )
        mentioned_ids = [m.get("id") async for m in mcursor if m.get("id")]
    # Validate attachments: only ones uploaded via /forum/upload are referenced
    atts = []
    for a in (payload.attachments or [])[:6]:
        if not isinstance(a, dict):
            continue
        url = str(a.get("url") or "")
        if "/uploads/forum/" not in url:
            continue
        atts.append({
            "url": url,
            "filename": str(a.get("filename") or "")[:120],
            "type": str(a.get("type") or "image")[:20],
            "size": int(a.get("size") or 0),
        })
    post = {
        "id": pid,
        "thread_id": thread_id,
        "author_id": uid,
        "author_name": current_user.get("name"),
        "author_role": current_user.get("role"),
        "body": payload.body,
        "attachments": atts,
        "reactions": {},
        "mentions": mentioned_ids,
        "reply_to": payload.reply_to,
        "created_at": now,
    }
    await db.forum_posts.insert_one(post)
    # Update thread counters + participants
    participants = set(thread.get("participants") or [])
    participants.add(uid)
    watchers = set(thread.get("watchers") or [])
    watchers.add(uid)
    await db.forum_threads.update_one(
        {"id": thread_id},
        {
            "$set": {"last_activity_at": now, "participants": list(participants), "watchers": list(watchers)},
            "$inc": {"reply_count": 1},
        },
    )
    await log_access(action="forum_post", outcome="success", user=current_user, request=request,
                     resource_type="forum_thread", resource_id=thread_id)
    # Notifications
    notify_ids = [u for u in list(watchers) if u != uid]
    if notify_ids:
        snippet = payload.body[:140]
        await _forum_notify(notify_ids, f"New reply — {thread.get('patient_name') or 'Forum'}", f"{current_user.get('name')}: {snippet}", {"thread_id": thread_id, "post_id": pid})
    if mentioned_ids:
        extra_mentions = [m for m in mentioned_ids if m != uid and m not in notify_ids]
        if extra_mentions:
            await _forum_notify(extra_mentions, f"You were mentioned", f"{current_user.get('name')} mentioned you.", {"thread_id": thread_id, "post_id": pid})
    post_clean = await db.forum_posts.find_one({"id": pid}, {"_id": 0})
    return _serialize_post(post_clean, viewer_id=uid)


@api_router.patch("/forum/posts/{post_id}")
async def forum_edit_post(post_id: str, payload: ForumPostEdit, current_user: dict = Depends(get_current_user)):
    if not _forum_can_access(current_user):
        raise HTTPException(status_code=403, detail="Nurses cannot use the Discussion Forum.")
    post = await db.forum_posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")
    uid = str(current_user.get("_id") or current_user.get("id"))
    if post.get("author_id") != uid:
        raise HTTPException(status_code=403, detail="You can only edit your own posts.")
    created = post.get("created_at")
    if not isinstance(created, datetime):
        raise HTTPException(status_code=500, detail="Corrupt post record.")
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - created > FORUM_EDIT_WINDOW:
        raise HTTPException(status_code=409, detail="Edit window (15 min) has passed.")
    now = datetime.now(timezone.utc)
    await db.forum_posts.update_one({"id": post_id}, {"$set": {"body": payload.body, "edited_at": now}})
    post_clean = await db.forum_posts.find_one({"id": post_id}, {"_id": 0})
    return _serialize_post(post_clean, viewer_id=uid)


@api_router.delete("/forum/posts/{post_id}")
async def forum_delete_post(post_id: str, current_user: dict = Depends(get_current_user)):
    if not _forum_can_access(current_user):
        raise HTTPException(status_code=403, detail="Nurses cannot use the Discussion Forum.")
    post = await db.forum_posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")
    uid = str(current_user.get("_id") or current_user.get("id"))
    role = current_user.get("role")
    is_author = post.get("author_id") == uid
    is_mod = role in ("implant_incharge", "administrator")
    if not (is_author or is_mod):
        raise HTTPException(status_code=403, detail="Not allowed to delete this post.")
    now = datetime.now(timezone.utc)
    await db.forum_posts.update_one({"id": post_id}, {"$set": {"deleted_at": now, "deleted_by_id": uid, "deleted_by_name": current_user.get("name")}})
    return {"ok": True}


@api_router.post("/forum/posts/{post_id}/reactions")
async def forum_toggle_reaction(post_id: str, payload: ForumReactionRequest, current_user: dict = Depends(get_current_user)):
    if not _forum_can_access(current_user):
        raise HTTPException(status_code=403, detail="Nurses cannot use the Discussion Forum.")
    if payload.reaction not in FORUM_REACTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid reaction. Allowed: {sorted(FORUM_REACTIONS)}")
    post = await db.forum_posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")
    uid = str(current_user.get("_id") or current_user.get("id"))
    reactions = post.get("reactions") or {}
    lst = list(reactions.get(payload.reaction) or [])
    if uid in lst:
        lst.remove(uid)
    else:
        lst.append(uid)
    await db.forum_posts.update_one({"id": post_id}, {"$set": {f"reactions.{payload.reaction}": lst}})
    post_clean = await db.forum_posts.find_one({"id": post_id}, {"_id": 0})
    return _serialize_post(post_clean, viewer_id=uid)


@api_router.post("/forum/posts/{post_id}/verify")
async def forum_verify_post(post_id: str, current_user: dict = Depends(get_current_user)):
    if not _forum_can_access(current_user) or current_user.get("role") not in ("implant_incharge", "administrator"):
        raise HTTPException(status_code=403, detail="Only Implant In-Charge / Administrator can verify answers.")
    post = await db.forum_posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")
    now = datetime.now(timezone.utc)
    uid = str(current_user.get("_id") or current_user.get("id"))
    # Only one verified post per thread — unverify any other in same thread
    await db.forum_posts.update_many({"thread_id": post["thread_id"], "id": {"$ne": post_id}}, {"$unset": {"verified_by_id": "", "verified_by_name": "", "verified_at": ""}})
    await db.forum_posts.update_one({"id": post_id}, {"$set": {"verified_by_id": uid, "verified_by_name": current_user.get("name"), "verified_at": now}})
    post_clean = await db.forum_posts.find_one({"id": post_id}, {"_id": 0})
    return _serialize_post(post_clean, viewer_id=uid)


@api_router.delete("/forum/posts/{post_id}/verify")
async def forum_unverify_post(post_id: str, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") not in ("implant_incharge", "administrator"):
        raise HTTPException(status_code=403, detail="Only Implant In-Charge / Administrator can unverify.")
    await db.forum_posts.update_one({"id": post_id}, {"$unset": {"verified_by_id": "", "verified_by_name": "", "verified_at": ""}})
    return {"ok": True}


@api_router.post("/forum/threads/{thread_id}/close")
async def forum_close_thread(thread_id: str, payload: ForumCloseRequest, request: Request, current_user: dict = Depends(get_current_user)):
    if not _forum_can_access(current_user):
        raise HTTPException(status_code=403, detail="Nurses cannot use the Discussion Forum.")
    thread = await db.forum_threads.find_one({"id": thread_id}, {"_id": 0})
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found.")
    if not _forum_can_moderate(current_user, thread):
        raise HTTPException(status_code=403, detail="Not allowed to close this thread.")
    if thread.get("status") != "open":
        raise HTTPException(status_code=409, detail=f"Thread is already {thread.get('status')}.")
    if payload.reason not in FORUM_CLOSE_REASONS:
        raise HTTPException(status_code=400, detail=f"Invalid reason. Allowed: {sorted(FORUM_CLOSE_REASONS)}")
    now = datetime.now(timezone.utc)
    uid = str(current_user.get("_id") or current_user.get("id"))
    await db.forum_threads.update_one(
        {"id": thread_id},
        {"$set": {"status": "closed", "closed_by_id": uid, "closed_by_name": current_user.get("name"),
                  "closed_at": now, "close_reason": payload.reason, "close_note": payload.note,
                  "last_activity_at": now}},
    )
    await log_access(action="forum_close", outcome="success", user=current_user, request=request,
                     resource_type="forum_thread", resource_id=thread_id, extra={"reason": payload.reason})
    # Notify participants
    notify_ids = [u for u in (thread.get("participants") or []) if u != uid]
    if notify_ids:
        await _forum_notify(notify_ids, "Discussion closed", f"{current_user.get('name')} closed the discussion.", {"thread_id": thread_id})
    updated = await db.forum_threads.find_one({"id": thread_id}, {"_id": 0})
    return _serialize_thread(updated, viewer_id=uid)


@api_router.post("/forum/threads/{thread_id}/reopen")
async def forum_reopen_thread(thread_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") not in ("implant_incharge", "administrator"):
        raise HTTPException(status_code=403, detail="Only Implant In-Charge / Administrator can reopen.")
    thread = await db.forum_threads.find_one({"id": thread_id}, {"_id": 0})
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found.")
    if thread.get("status") == "open":
        return _serialize_thread(thread, viewer_id=str(current_user.get("_id") or current_user.get("id")))
    now = datetime.now(timezone.utc)
    await db.forum_threads.update_one(
        {"id": thread_id},
        {"$set": {"status": "open", "last_activity_at": now},
         "$unset": {"closed_by_id": "", "closed_by_name": "", "closed_at": "", "close_reason": "", "close_note": ""}},
    )
    await log_access(action="forum_reopen", outcome="success", user=current_user, request=request,
                     resource_type="forum_thread", resource_id=thread_id)
    updated = await db.forum_threads.find_one({"id": thread_id}, {"_id": 0})
    return _serialize_thread(updated, viewer_id=str(current_user.get("_id") or current_user.get("id")))


@api_router.delete("/forum/threads/{thread_id}")
async def forum_remove_thread(thread_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") not in ("implant_incharge", "administrator"):
        raise HTTPException(status_code=403, detail="Only Implant In-Charge / Administrator can remove a case from the forum.")
    thread = await db.forum_threads.find_one({"id": thread_id}, {"_id": 0})
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found.")
    now = datetime.now(timezone.utc)
    uid = str(current_user.get("_id") or current_user.get("id"))
    await db.forum_threads.update_one(
        {"id": thread_id},
        {"$set": {"status": "removed", "closed_by_id": uid, "closed_by_name": current_user.get("name"),
                  "closed_at": now, "last_activity_at": now}},
    )
    await log_access(action="forum_remove", outcome="success", user=current_user, request=request,
                     resource_type="forum_thread", resource_id=thread_id)
    return {"ok": True}


@api_router.post("/forum/threads/{thread_id}/bookmark")
async def forum_toggle_bookmark(thread_id: str, current_user: dict = Depends(get_current_user)):
    if not _forum_can_access(current_user):
        raise HTTPException(status_code=403, detail="Nurses cannot use the Discussion Forum.")
    thread = await db.forum_threads.find_one({"id": thread_id}, {"_id": 0})
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found.")
    uid = str(current_user.get("_id") or current_user.get("id"))
    marks = list(thread.get("bookmarks") or [])
    if uid in marks:
        marks.remove(uid)
        state = False
    else:
        marks.append(uid)
        state = True
    await db.forum_threads.update_one({"id": thread_id}, {"$set": {"bookmarks": marks}})
    return {"bookmarked": state}


@api_router.post("/forum/threads/{thread_id}/watch")
async def forum_toggle_watch(thread_id: str, current_user: dict = Depends(get_current_user)):
    if not _forum_can_access(current_user):
        raise HTTPException(status_code=403, detail="Nurses cannot use the Discussion Forum.")
    thread = await db.forum_threads.find_one({"id": thread_id}, {"_id": 0})
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found.")
    uid = str(current_user.get("_id") or current_user.get("id"))
    w = list(thread.get("watchers") or [])
    if uid in w:
        w.remove(uid)
        state = False
    else:
        w.append(uid)
        state = True
    await db.forum_threads.update_one({"id": thread_id}, {"$set": {"watchers": w}})
    return {"watching": state}


@api_router.get("/forum/unread-summary")
async def forum_unread_summary(current_user: dict = Depends(get_current_user)):
    """Returns count of forum threads with new activity since the user last
    visited the forum list. Drives the red-dot indicator on the hamburger /
    drawer 'Discussion Forum' entry. Nurses always get 0.

    Scoped to threads the user is engaged with:
      • sharer of the thread, OR
      • bookmarked it, OR
      • posted/replied in it (i.e. is in participants).
    This prevents pinging faculty about every new student case while still
    surfacing activity on cases they actually care about. In-Charges and
    administrators additionally see all open threads (so moderators don't
    miss new cases needing review)."""
    if not _forum_can_access(current_user):
        return {"unread_threads": 0, "has_unread": False}
    uid = str(current_user.get("_id") or current_user.get("id"))
    last_seen = current_user.get("forum_last_seen_at")
    if not isinstance(last_seen, datetime):
        last_seen = datetime(1970, 1, 1, tzinfo=timezone.utc)
    elif last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=timezone.utc)
    role = current_user.get("role")
    engagement_or = [
        {"shared_by_id": uid},
        {"bookmarks": uid},
        {"participants": uid},
    ]
    is_mod = role in ("implant_incharge", "administrator")
    if is_mod:
        # Mods also see all *new* threads (so they catch unreviewed cases)
        engagement_or.append({"status": "open"})
    query: Dict[str, Any] = {
        "$and": [
            {"$or": engagement_or},
            {"last_activity_at": {"$gt": last_seen}},
            {"status": {"$ne": "removed"}} if not is_mod else {},
        ],
    }
    # Drop the empty {} for non-mod path won't break Mongo — but be tidy:
    query["$and"] = [c for c in query["$and"] if c]
    count = await db.forum_threads.count_documents(query)
    return {"unread_threads": count, "has_unread": count > 0}


@api_router.post("/forum/mark-seen")
async def forum_mark_seen(current_user: dict = Depends(get_current_user)):
    """Stamp the user's last-visit timestamp; clears the red-dot."""
    if not _forum_can_access(current_user):
        return {"ok": True}
    uid = str(current_user.get("_id") or current_user.get("id"))
    try:
        await db.users.update_one({"_id": ObjectId(uid)}, {"$set": {"forum_last_seen_at": datetime.now(timezone.utc)}})
    except Exception as e:
        logging.error(f"[forum] mark-seen update failed: {e}")
    return {"ok": True}


@api_router.post("/forum/upload")
async def forum_upload_attachment(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    if not _forum_can_access(current_user):
        raise HTTPException(status_code=403, detail="Nurses cannot upload to the Discussion Forum.")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in FORUM_ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"Unsupported file type. Allowed: {sorted(FORUM_ALLOWED_EXT)}")
    content = await file.read()
    if len(content) > FORUM_MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit.")
    unique = f"forum_{uuid.uuid4().hex}{ext}"
    path = FORUM_ATTACH_DIR / unique
    with open(path, "wb") as f:
        f.write(content)
    import mimetypes as _mt_17021
    await _s3_put_async(path, content_type=_mt_17021.guess_type(str(path))[0])
    url = f"/api/uploads/forum/{unique}"
    return {"url": url, "filename": file.filename or unique, "size": len(content), "type": "pdf" if ext == ".pdf" else "image"}


@api_router.get("/uploads/forum/{filename}")
async def serve_forum_upload(filename: str, token: Optional[str] = Query(None), current_user: dict = Depends(get_current_user_optional)):
    if not current_user and token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            uid = payload.get("sub")
            if uid:
                current_user = await db.users.find_one({"id": uid}, {"_id": 0, "password": 0})
        except Exception:
            pass
    if not current_user or current_user.get("role") == "nurse":
        raise HTTPException(status_code=403, detail="Access denied.")
    safe = filename.replace("..", "").lstrip("/")
    path = FORUM_ATTACH_DIR / safe
    if not await _s3_ensure_local_async(path) or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(str(path))



# ═══════════════════════════════════════════════════════════════════════════
# GROUP CHAT (iteration 131) — chat_groups + chat_messages
# ═══════════════════════════════════════════════════════════════════════════
CHAT_ATTACH_DIR = UPLOADS_DIR / 'chat'
CHAT_ATTACH_DIR.mkdir(parents=True, exist_ok=True)
CHAT_ALLOWED_EXT = {'.png', '.jpg', '.jpeg', '.pdf', '.heic', '.heif', '.webp'}
CHAT_MAX_BYTES = 10 * 1024 * 1024
CHAT_EDIT_WINDOW = timedelta(minutes=15)
CHAT_REACTIONS = {"thumbs", "heart", "think", "check"}


async def _ensure_chat_indexes():
    try:
        await db.chat_groups.create_index([("members", 1)])
        await db.chat_groups.create_index([("last_activity_at", -1)])
        await db.chat_messages.create_index([("group_id", 1), ("created_at", 1)])
    except Exception as e:
        logging.error(f"[chat] index failed: {e}")


async def _seed_all_staff_group():
    """Auto-create the 'All Staff' group if missing and enrol all non-nurse users."""
    try:
        existing = await db.chat_groups.find_one({"kind": "all_staff"}, {"_id": 0, "id": 1})
        member_ids = []
        cursor = db.users.find({"role": {"$ne": "nurse"}}, {"_id": 1})
        async for u in cursor:
            member_ids.append(str(u["_id"]))
        now = datetime.now(timezone.utc)
        if existing:
            await db.chat_groups.update_one({"id": existing["id"]}, {"$set": {"members": member_ids, "admins": member_ids[:1]}})
            return
        gid = str(uuid.uuid4())
        await db.chat_groups.insert_one({
            "id": gid, "kind": "all_staff", "name": "All Staff", "description": "College-wide announcements. You cannot leave this group.",
            "type": "public", "photo_url": None, "members": member_ids, "admins": member_ids[:1],
            "created_by_id": member_ids[0] if member_ids else None, "created_at": now,
            "last_activity_at": now, "locked": True,
        })
    except Exception as e:
        logging.error(f"[chat] all-staff seed failed: {e}")


def _chat_can_access(user: dict) -> bool:
    return (user or {}).get("role") != "nurse"


def _uid(user: dict) -> str:
    return str(user.get("_id") or user.get("id"))


def _serialize_group(g: dict, viewer_id: Optional[str] = None) -> dict:
    return {
        "id": g.get("id"), "kind": g.get("kind", "group"), "name": g.get("name"),
        "description": g.get("description"), "type": g.get("type", "private"),
        "photo_url": g.get("photo_url"), "members": g.get("members", []), "admins": g.get("admins", []),
        "created_by_id": g.get("created_by_id"), "created_at": g.get("created_at").isoformat() if g.get("created_at") else None,
        "last_activity_at": g.get("last_activity_at").isoformat() if g.get("last_activity_at") else None,
        "last_message_preview": g.get("last_message_preview"),
        "last_message_at": g.get("last_message_at").isoformat() if g.get("last_message_at") else None,
        "locked": g.get("locked", False), "other_user_id": g.get("other_user_id"),
        "unread_count": 0,
    }


async def _chat_unread_count(group_id: str, uid: str, last_activity_at: Optional[datetime]) -> int:
    """Count messages in `group_id` authored by someone else that were created
    after the viewer's last_read_at for that group. Returns 0 when the group is
    silent (no last_activity_at) to avoid a pointless query."""
    if not last_activity_at:
        return 0
    read = await db.chat_group_reads.find_one({"user_id": uid, "group_id": group_id}, {"_id": 0, "last_read_at": 1})
    lr = (read or {}).get("last_read_at")
    if lr and lr >= last_activity_at:
        return 0
    q: Dict[str, Any] = {"group_id": group_id, "author_id": {"$ne": uid}}
    if lr:
        q["created_at"] = {"$gt": lr}
    # Cap at 99 for badge display — no one reads 100+ unread chat messages.
    return min(await db.chat_messages.count_documents(q), 99)


async def _chat_typing_users(group_id: str, viewer_id: str) -> List[Dict[str, str]]:
    """Return the list of users currently typing in `group_id`, excluding the
    viewer. Entries with `expires_at` in the past are filtered out (lazy GC)."""
    g = await db.chat_groups.find_one({"id": group_id}, {"_id": 0, "typing": 1})
    typing = (g or {}).get("typing") or {}
    now = datetime.now(timezone.utc)
    out: List[Dict[str, str]] = []
    for tid, t in (typing.items() if isinstance(typing, dict) else []):
        if tid == viewer_id:
            continue
        exp = t.get("expires_at") if isinstance(t, dict) else None
        if not exp:
            continue
        # MongoDB roundtrips can strip tzinfo; coerce to UTC.
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp > now:
            out.append({"user_id": tid, "name": t.get("name") or "Someone"})
    return out


def _serialize_message(m: dict, viewer_id: Optional[str] = None) -> dict:
    reactions = m.get("reactions") or {}
    return {
        "id": m.get("id"), "group_id": m.get("group_id"),
        "author_id": m.get("author_id"), "author_name": m.get("author_name"), "author_role": m.get("author_role"),
        "body": m.get("body") if not m.get("deleted_at") else "[deleted]",
        "attachments": m.get("attachments") or [],
        "created_at": m.get("created_at").isoformat() if m.get("created_at") else None,
        "edited_at": m.get("edited_at").isoformat() if m.get("edited_at") else None,
        "deleted_at": m.get("deleted_at").isoformat() if m.get("deleted_at") else None,
        "reactions_summary": {k: len(v or []) for k, v in reactions.items()},
        "reactions_mine": {k: (viewer_id in (v or [])) for k, v in reactions.items()} if viewer_id else {},
        "mentions": m.get("mentions") or [],
        "system": m.get("system", False),
    }


class ChatGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    description: Optional[str] = Field(None, max_length=300)
    type: str = Field("private", pattern="^(private|public)$")
    member_ids: List[str] = Field(default_factory=list)
    photo_url: Optional[str] = None


class ChatMessageCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)
    attachments: Optional[List[Dict[str, Any]]] = None


class ChatGroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    photo_url: Optional[str] = None


@api_router.post("/chat/groups")
async def chat_create_group(payload: ChatGroupCreate, request: Request, current_user: dict = Depends(get_current_user)):
    if not _chat_can_access(current_user):
        raise HTTPException(status_code=403, detail="Nurses cannot use group chat.")
    uid = _uid(current_user)
    member_ids = list({uid, *payload.member_ids})
    # Validate members aren't nurses
    if member_ids:
        nurse_count = await db.users.count_documents({"_id": {"$in": [ObjectId(m) for m in member_ids if ObjectId.is_valid(m)]}, "role": "nurse"})
        if nurse_count:
            raise HTTPException(status_code=400, detail="Cannot add nurses to chat groups.")
    now = datetime.now(timezone.utc)
    gid = str(uuid.uuid4())
    await db.chat_groups.insert_one({
        "id": gid, "kind": "group", "name": payload.name, "description": payload.description,
        "type": payload.type, "photo_url": payload.photo_url,
        "members": member_ids, "admins": [uid],
        "created_by_id": uid, "created_at": now, "last_activity_at": now,
    })
    await log_access(action="chat_group_create", outcome="success", user=current_user, request=request,
                     resource_type="chat_group", resource_id=gid)
    g = await db.chat_groups.find_one({"id": gid}, {"_id": 0})
    return _serialize_group(g, viewer_id=uid)


@api_router.get("/chat/groups")
async def chat_list_groups(q: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    if not _chat_can_access(current_user):
        raise HTTPException(status_code=403, detail="Nurses cannot use group chat.")
    uid = _uid(current_user)
    query: Dict[str, Any] = {"members": uid}
    if q and q.strip():
        query["name"] = {"$regex": q.strip(), "$options": "i"}
    cursor = db.chat_groups.find(query, {"_id": 0}).sort("last_activity_at", -1)
    items = []
    async for g in cursor:
        s = _serialize_group(g, viewer_id=uid)
        s["unread_count"] = await _chat_unread_count(g.get("id"), uid, g.get("last_activity_at"))
        items.append(s)
    # For DMs, resolve other-user display name
    for it in items:
        if it.get("kind") == "dm":
            other = next((m for m in it.get("members", []) if m != uid), None)
            if other and ObjectId.is_valid(other):
                u = await db.users.find_one({"_id": ObjectId(other)}, {"_id": 0, "name": 1, "role": 1, "profile_photo": 1})
                if u:
                    it["name"] = u.get("name")
                    it["photo_url"] = u.get("profile_photo")
                    it["other_user_id"] = other
    total_unread = sum(i.get("unread_count", 0) for i in items)
    return {"items": items, "total_unread": total_unread}


@api_router.post("/chat/dm/{other_user_id}")
async def chat_start_dm(other_user_id: str, current_user: dict = Depends(get_current_user)):
    if not _chat_can_access(current_user):
        raise HTTPException(status_code=403, detail="Nurses cannot use chat.")
    if not ObjectId.is_valid(other_user_id):
        raise HTTPException(status_code=400, detail="Invalid user id.")
    other = await db.users.find_one({"_id": ObjectId(other_user_id)}, {"_id": 0, "role": 1, "name": 1})
    if not other:
        raise HTTPException(status_code=404, detail="User not found.")
    if other.get("role") == "nurse":
        raise HTTPException(status_code=400, detail="Cannot DM a nurse.")
    uid = _uid(current_user)
    if uid == other_user_id:
        raise HTTPException(status_code=400, detail="Cannot DM yourself.")
    # Idempotent: find existing DM
    existing = await db.chat_groups.find_one({"kind": "dm", "members": {"$all": [uid, other_user_id], "$size": 2}}, {"_id": 0})
    if existing:
        g = _serialize_group(existing, viewer_id=uid)
        g["name"] = other.get("name")
        g["other_user_id"] = other_user_id
        return g
    now = datetime.now(timezone.utc)
    gid = str(uuid.uuid4())
    await db.chat_groups.insert_one({
        "id": gid, "kind": "dm", "name": other.get("name"), "type": "private",
        "members": [uid, other_user_id], "admins": [uid, other_user_id],
        "created_by_id": uid, "created_at": now, "last_activity_at": now,
    })
    g = await db.chat_groups.find_one({"id": gid}, {"_id": 0})
    out = _serialize_group(g, viewer_id=uid)
    out["name"] = other.get("name")
    out["other_user_id"] = other_user_id
    return out


async def _require_member(group_id: str, uid: str) -> dict:
    g = await db.chat_groups.find_one({"id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found.")
    if uid not in (g.get("members") or []):
        raise HTTPException(status_code=403, detail="You are not a member of this group.")
    return g


@api_router.get("/chat/groups/{group_id}")
async def chat_get_group(group_id: str, current_user: dict = Depends(get_current_user)):
    if not _chat_can_access(current_user):
        raise HTTPException(status_code=403, detail="Nurses cannot use chat.")
    uid = _uid(current_user)
    g = await _require_member(group_id, uid)
    # Hydrate member details
    member_objs = []
    for mid in g.get("members", []):
        if not ObjectId.is_valid(mid):
            continue
        u = await db.users.find_one({"_id": ObjectId(mid)}, {"_id": 1, "name": 1, "role": 1, "profile_photo": 1})
        if u:
            member_objs.append({"id": str(u["_id"]), "name": u.get("name"), "role": u.get("role"), "profile_photo": u.get("profile_photo")})
    out = _serialize_group(g, viewer_id=uid)
    out["member_details"] = member_objs
    out["is_admin"] = uid in (g.get("admins") or [])
    out["typing_users"] = await _chat_typing_users(group_id, uid)
    out["unread_count"] = await _chat_unread_count(group_id, uid, g.get("last_activity_at"))
    return out


@api_router.post("/chat/groups/{group_id}/mark-read")
async def chat_mark_read(group_id: str, current_user: dict = Depends(get_current_user)):
    """Mark this group as read up to now for the current user. Called by the
    chat room on mount and after every send/load so the unread-count badge
    clears on the group list. Idempotent."""
    if not _chat_can_access(current_user):
        raise HTTPException(status_code=403, detail="Nurses cannot use chat.")
    uid = _uid(current_user)
    await _require_member(group_id, uid)
    now = datetime.now(timezone.utc)
    await db.chat_group_reads.update_one(
        {"user_id": uid, "group_id": group_id},
        {"$set": {"user_id": uid, "group_id": group_id, "last_read_at": now}},
        upsert=True,
    )
    return {"ok": True, "last_read_at": now.isoformat()}


@api_router.post("/chat/groups/{group_id}/typing")
async def chat_set_typing(group_id: str, current_user: dict = Depends(get_current_user)):
    """Stamp the current user as typing in `group_id` for ~5 seconds. The
    frontend debounce-fires this every ~3s while the composer has non-empty
    text; the server auto-expires entries via `_chat_typing_users()`."""
    if not _chat_can_access(current_user):
        raise HTTPException(status_code=403, detail="Nurses cannot use chat.")
    uid = _uid(current_user)
    await _require_member(group_id, uid)
    now = datetime.now(timezone.utc)
    expires = now + timedelta(seconds=5)
    await db.chat_groups.update_one(
        {"id": group_id},
        {"$set": {f"typing.{uid}": {"name": current_user.get("name") or "Someone", "expires_at": expires}}},
    )
    return {"ok": True}


@api_router.patch("/chat/groups/{group_id}")
async def chat_update_group(group_id: str, payload: ChatGroupUpdate, current_user: dict = Depends(get_current_user)):
    uid = _uid(current_user)
    g = await _require_member(group_id, uid)
    if uid not in (g.get("admins") or []):
        raise HTTPException(status_code=403, detail="Only admins can edit the group.")
    update = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if update:
        await db.chat_groups.update_one({"id": group_id}, {"$set": update})
    return {"ok": True}


@api_router.post("/chat/groups/{group_id}/members")
async def chat_add_members(group_id: str, body: Dict[str, List[str]], current_user: dict = Depends(get_current_user)):
    uid = _uid(current_user)
    g = await _require_member(group_id, uid)
    if uid not in (g.get("admins") or []):
        raise HTTPException(status_code=403, detail="Only admins can add members.")
    new_ids = body.get("member_ids") or []
    if not new_ids:
        return {"ok": True}
    # Validate
    nurse_count = await db.users.count_documents({"_id": {"$in": [ObjectId(m) for m in new_ids if ObjectId.is_valid(m)]}, "role": "nurse"})
    if nurse_count:
        raise HTTPException(status_code=400, detail="Cannot add nurses.")
    await db.chat_groups.update_one({"id": group_id}, {"$addToSet": {"members": {"$each": new_ids}}})
    # System message
    now = datetime.now(timezone.utc)
    names = []
    for mid in new_ids:
        if ObjectId.is_valid(mid):
            u = await db.users.find_one({"_id": ObjectId(mid)}, {"_id": 0, "name": 1})
            if u:
                names.append(u.get("name"))
    await db.chat_messages.insert_one({
        "id": str(uuid.uuid4()), "group_id": group_id, "author_id": "system", "author_name": "System",
        "author_role": "system", "body": f"{', '.join(names)} has been added to the group",
        "created_at": now, "system": True, "reactions": {},
    })
    await db.chat_groups.update_one({"id": group_id}, {"$set": {"last_activity_at": now, "last_message_preview": f"{', '.join(names)} added", "last_message_at": now}})
    return {"ok": True}


@api_router.delete("/chat/groups/{group_id}/members/{member_id}")
async def chat_remove_member(group_id: str, member_id: str, current_user: dict = Depends(get_current_user)):
    uid = _uid(current_user)
    g = await _require_member(group_id, uid)
    if g.get("locked"):
        raise HTTPException(status_code=400, detail="This group cannot be left.")
    is_self = member_id == uid
    is_admin = uid in (g.get("admins") or [])
    if not (is_self or is_admin):
        raise HTTPException(status_code=403, detail="Only admins or the member themselves can remove.")
    await db.chat_groups.update_one({"id": group_id}, {"$pull": {"members": member_id, "admins": member_id}})
    # System message
    u = await db.users.find_one({"_id": ObjectId(member_id)}, {"_id": 0, "name": 1}) if ObjectId.is_valid(member_id) else None
    name = u.get("name") if u else "A member"
    now = datetime.now(timezone.utc)
    txt = f"{name} left the group" if is_self else f"{name} was removed from the group"
    await db.chat_messages.insert_one({
        "id": str(uuid.uuid4()), "group_id": group_id, "author_id": "system", "author_name": "System",
        "author_role": "system", "body": txt, "created_at": now, "system": True, "reactions": {},
    })
    await db.chat_groups.update_one({"id": group_id}, {"$set": {"last_activity_at": now, "last_message_preview": txt, "last_message_at": now}})
    return {"ok": True}


@api_router.get("/chat/groups/{group_id}/messages")
async def chat_list_messages(group_id: str, skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100), current_user: dict = Depends(get_current_user)):
    uid = _uid(current_user)
    await _require_member(group_id, uid)
    cursor = db.chat_messages.find({"group_id": group_id}, {"_id": 0}).sort("created_at", 1).skip(skip).limit(limit)
    items = [_serialize_message(m, viewer_id=uid) async for m in cursor]
    total = await db.chat_messages.count_documents({"group_id": group_id})
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@api_router.post("/chat/groups/{group_id}/messages")
async def chat_send_message(group_id: str, payload: ChatMessageCreate, current_user: dict = Depends(get_current_user)):
    uid = _uid(current_user)
    g = await _require_member(group_id, uid)
    now = datetime.now(timezone.utc)
    mid = str(uuid.uuid4())
    atts = []
    for a in (payload.attachments or [])[:6]:
        url = str(a.get("url") or "")
        if "/uploads/chat/" not in url and "/uploads/forum/" not in url:
            continue
        atts.append({"url": url, "filename": str(a.get("filename") or "")[:120], "type": str(a.get("type") or "image")[:20], "size": int(a.get("size") or 0)})
    mentions_ids: List[str] = []
    mention_names = list({m.group(1) for m in re.finditer(r"@([a-zA-Z0-9_.\-]{2,40})", payload.body or "")})[:10]
    if mention_names:
        async for u in db.users.find({"$or": [{"username": {"$in": mention_names}}, {"name": {"$in": mention_names}}]}, {"_id": 1}):
            mentions_ids.append(str(u["_id"]))
    await db.chat_messages.insert_one({
        "id": mid, "group_id": group_id, "author_id": uid,
        "author_name": current_user.get("name"), "author_role": current_user.get("role"),
        "body": payload.body, "attachments": atts, "reactions": {}, "mentions": mentions_ids,
        "created_at": now,
    })
    preview = payload.body[:80] if payload.body else ("📎 Attachment" if atts else "")
    # Clear this user's typing marker + bump last_activity_at + preview.
    await db.chat_groups.update_one(
        {"id": group_id},
        {"$set": {"last_activity_at": now, "last_message_preview": preview, "last_message_at": now},
         "$unset": {f"typing.{uid}": ""}},
    )
    # Mark sender as read up to now (their own message doesn't contribute to unread).
    await db.chat_group_reads.update_one(
        {"user_id": uid, "group_id": group_id},
        {"$set": {"user_id": uid, "group_id": group_id, "last_read_at": now}},
        upsert=True,
    )
    # Notify other members
    other_members = [m for m in (g.get("members") or []) if m != uid]
    if other_members:
        try:
            await send_expo_push_notifications(other_members, g.get("name") or "New message", f"{current_user.get('name')}: {preview}", {"type": "chat", "group_id": group_id})
        except Exception:
            pass
    msg = await db.chat_messages.find_one({"id": mid}, {"_id": 0})
    return _serialize_message(msg, viewer_id=uid)


@api_router.post("/chat/messages/{message_id}/reactions")
async def chat_toggle_reaction(message_id: str, body: Dict[str, str], current_user: dict = Depends(get_current_user)):
    reaction = body.get("reaction")
    if reaction not in CHAT_REACTIONS:
        raise HTTPException(status_code=400, detail="Invalid reaction.")
    m = await db.chat_messages.find_one({"id": message_id}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Message not found.")
    uid = _uid(current_user)
    await _require_member(m["group_id"], uid)
    reactions = m.get("reactions") or {}
    lst = list(reactions.get(reaction) or [])
    if uid in lst:
        lst.remove(uid)
    else:
        lst.append(uid)
    await db.chat_messages.update_one({"id": message_id}, {"$set": {f"reactions.{reaction}": lst}})
    updated = await db.chat_messages.find_one({"id": message_id}, {"_id": 0})
    return _serialize_message(updated, viewer_id=uid)


@api_router.delete("/chat/messages/{message_id}")
async def chat_delete_message(message_id: str, current_user: dict = Depends(get_current_user)):
    m = await db.chat_messages.find_one({"id": message_id}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Message not found.")
    uid = _uid(current_user)
    role = current_user.get("role")
    if m.get("author_id") != uid and role not in ("implant_incharge", "administrator"):
        raise HTTPException(status_code=403, detail="Not allowed.")
    now = datetime.now(timezone.utc)
    await db.chat_messages.update_one({"id": message_id}, {"$set": {"deleted_at": now, "deleted_by_id": uid}})
    return {"ok": True}


@api_router.post("/chat/upload")
async def chat_upload(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    if not _chat_can_access(current_user):
        raise HTTPException(status_code=403, detail="Nurses cannot upload.")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in CHAT_ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"Unsupported file type.")
    content = await file.read()
    if len(content) > CHAT_MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB.")
    unique = f"chat_{uuid.uuid4().hex}{ext}"
    path = CHAT_ATTACH_DIR / unique
    with open(path, "wb") as f:
        f.write(content)
    import mimetypes as _mt_17513
    await _s3_put_async(path, content_type=_mt_17513.guess_type(str(path))[0])
    url = f"/api/uploads/chat/{unique}"
    return {"url": url, "filename": file.filename or unique, "size": len(content), "type": "pdf" if ext == ".pdf" else "image"}


@api_router.get("/uploads/chat/{filename}")
async def serve_chat_upload(filename: str, token: Optional[str] = Query(None), current_user: dict = Depends(get_current_user_optional)):
    if not current_user and token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            u = payload.get("sub")
            if u:
                current_user = await db.users.find_one({"_id": ObjectId(u)} if ObjectId.is_valid(u) else {"id": u}, {"_id": 0, "password": 0})
        except Exception:
            pass
    if not current_user or current_user.get("role") == "nurse":
        raise HTTPException(status_code=403, detail="Access denied.")
    safe = filename.replace("..", "").lstrip("/")
    path = CHAT_ATTACH_DIR / safe
    if not await _s3_ensure_local_async(path):
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(str(path))


@api_router.get("/chat/users")
async def chat_list_users(q: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Used by the Add Members / DM picker. Returns non-nurse users."""
    if not _chat_can_access(current_user):
        raise HTTPException(status_code=403, detail="Nurses cannot use chat.")
    uid = _uid(current_user)
    query: Dict[str, Any] = {"role": {"$ne": "nurse"}}
    if q and q.strip():
        query["$or"] = [{"name": {"$regex": q.strip(), "$options": "i"}}, {"username": {"$regex": q.strip(), "$options": "i"}}]
    cursor = db.users.find(query, {"_id": 1, "name": 1, "role": 1, "profile_photo": 1}).limit(50)
    items = []
    async for u in cursor:
        s = str(u["_id"])
        if s == uid:
            continue
        items.append({"id": s, "name": u.get("name"), "role": u.get("role"), "profile_photo": u.get("profile_photo")})
    return {"items": items}


@app.on_event("startup")
async def ensure_chat_indexes_on_start():
    await _ensure_chat_indexes()
    await _seed_all_staff_group()


# ── Smart Clinical Tip engine (iter-280) ─────────────────────────────
@app.on_event("startup")
async def seed_smart_tips_on_startup():
    """Idempotent seed of the curated Smart Clinical Tip library."""
    try:
        from tips_seed import TIP_LIBRARY
        for t in TIP_LIBRARY:
            await db.tips.update_one({"tip_id": t["tip_id"]}, {"$set": {**t, "active": True}}, upsert=True)
        logging.info("smart-tips: seeded/updated %d entries", len(TIP_LIBRARY))
    except Exception as exc:  # pragma: no cover
        logging.warning("Smart-tip seed skipped: %s", exc)


def _today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def _get_user_primary_case_context(user_id: str) -> dict:
    proc = await db.procedures.find_one({
        "$or": [{"created_by_id": user_id}, {"student_id": user_id}, {"supervisor_id": user_id}, {"implant_incharge_id": user_id}],
        "status": {"$nin": ["completed", "draft"]},
    }, sort=[("updated_at", -1), ("created_at", -1)])
    if not proc:
        return {}
    case_type = None
    n_imp = proc.get("number_of_implants") or len(proc.get("implant_plans") or [])
    if n_imp >= 4:
        case_type = "full_arch"
    elif n_imp == 1:
        case_type = "single"
    densities = [str(p.get("bone_type") or "").upper() for p in (proc.get("implant_plans") or []) if p.get("bone_type")]
    bone_density = None
    for tag in ("D4", "D3", "D2", "D1"):
        if any(tag in d for d in densities):
            bone_density = tag
            break
    phase = None
    status = proc.get("status") or ""
    if status.startswith("pending_phase1") or status.startswith("phase1") or status == "rejected_phase1":
        phase = "planning"
    elif "phase2" in status or "stage2_surgical" in status:
        phase = "surgery"
    elif "stage2_prosthetic" in status:
        phase = "restoration"
    return {"case_type": case_type, "bone_density": bone_density, "phase": phase}


async def _pick_daily_tip_for_user(user_id: str, context: dict | None = None) -> tuple[dict, str | None]:
    now = datetime.now(timezone.utc)
    cutoff_180 = (now - timedelta(days=180)).isoformat()
    cutoff_7 = (now - timedelta(days=7)).isoformat()
    history_180 = await db.tip_history.find({
        "user_id": user_id, "shown_at": {"$gte": cutoff_180},
    }).to_list(length=1000)
    recent_tip_ids = {h.get("tip_id") for h in history_180 if h.get("tip_id")}
    cat_counts: dict = {}
    for h in history_180:
        if h.get("shown_at", "") < cutoff_7:
            continue
        c = h.get("category")
        if c:
            cat_counts[c] = cat_counts.get(c, 0) + 1
    blocked_categories = {c for c, n in cat_counts.items() if n >= 2}
    candidates = await db.tips.find(
        {"active": True, "tip_id": {"$nin": list(recent_tip_ids)}},
        {"_id": 0},
    ).to_list(length=2000)
    pool = [t for t in candidates if t.get("category") not in blocked_categories]
    if not pool:
        pool = candidates
    if not pool:
        all_tips = await db.tips.find({"active": True}, {"_id": 0}).to_list(length=2000)
        if not all_tips:
            return {}, None
        ages = {t["tip_id"]: "0000-00-00" for t in all_tips}
        for h in history_180:
            ages[h.get("tip_id", "")] = max(ages.get(h.get("tip_id", ""), ""), h.get("shown_at", ""))
        all_tips.sort(key=lambda t: ages.get(t["tip_id"], ""))
        return all_tips[0], None
    preferred_cats: list[str] = []
    rationale: str | None = None
    if context:
        if context.get("case_type") == "full_arch":
            preferred_cats.append("Full Arch Rehabilitation")
            rationale = "Surfaced because your active case is a full-arch rehabilitation."
        elif context.get("case_type") == "single":
            preferred_cats.extend(["Treatment Planning", "Prosthetic"])
            rationale = "Surfaced because your active case is a single-implant restoration."
        if context.get("bone_density") == "D4":
            preferred_cats.append("Surgical")
            rationale = "Surfaced because your active case involves soft D4 bone."
        if context.get("phase") == "surgery":
            preferred_cats.extend(["Surgical", "Soft Tissue"])
            rationale = rationale or "Surfaced because your active case is in the surgical phase."
        elif context.get("phase") == "restoration":
            preferred_cats.extend(["Prosthetic", "Occlusion"])
            rationale = rationale or "Surfaced because your active case is in the restorative phase."
    import random
    biased = [t for t in pool if t.get("category") in preferred_cats] if preferred_cats else []
    if biased and random.random() < 0.7:
        return random.choice(biased), rationale
    return random.choice(pool), None


async def _compute_tip_streak(user_id: str) -> dict:
    today = datetime.now(timezone.utc).date()
    cutoff = (today - timedelta(days=400)).isoformat()
    rows = await db.tip_history.find(
        {"user_id": user_id, "shown_date": {"$gte": cutoff}},
        {"_id": 0, "shown_date": 1},
    ).to_list(length=500)
    days = {r.get("shown_date") for r in rows if r.get("shown_date")}
    engaged_today = today.isoformat() in days
    current = 0
    cursor = today if engaged_today else today - timedelta(days=1)
    while cursor.isoformat() in days:
        current += 1
        cursor -= timedelta(days=1)
    longest = 0
    if days:
        sorted_days = sorted(days)
        run = 1
        longest = 1
        for i in range(1, len(sorted_days)):
            try:
                prev = datetime.fromisoformat(sorted_days[i - 1]).date()
                cur = datetime.fromisoformat(sorted_days[i]).date()
            except Exception:
                continue
            if (cur - prev).days == 1:
                run += 1
                longest = max(longest, run)
            else:
                run = 1
        longest = max(longest, current)
    return {"current": current, "longest": longest, "engaged_today": engaged_today}


@api_router.get("/tips/streak")
async def get_tip_streak(current_user: dict = Depends(get_current_user)):
    return await _compute_tip_streak(current_user["_id"])


@api_router.get("/tips/daily")
async def get_daily_tip(current_user: dict = Depends(get_current_user)):
    user_id = current_user["_id"]
    today = _today_str()
    existing = await db.tip_history.find_one({"user_id": user_id, "shown_date": today})
    if existing:
        tip = await db.tips.find_one({"tip_id": existing.get("tip_id")}, {"_id": 0})
        if tip:
            saved = await db.tip_saves.find_one({"user_id": user_id, "tip_id": tip["tip_id"]})
            tip["saved"] = bool(saved)
            tip["dismissed_today"] = bool(existing.get("dismissed_at"))
            tip["personalised_hint"] = existing.get("personalised_hint")
            tip["streak"] = await _compute_tip_streak(user_id)
            return tip
    context = await _get_user_primary_case_context(user_id)
    picked, hint = await _pick_daily_tip_for_user(user_id, context)
    if not picked:
        raise HTTPException(status_code=404, detail="No tips available")
    await db.tip_history.insert_one({
        "user_id": user_id, "tip_id": picked["tip_id"],
        "category": picked.get("category"), "shown_date": today,
        "shown_at": datetime.now(timezone.utc).isoformat(),
        "dismissed_at": None,
        "personalised_hint": hint,
    })
    saved = await db.tip_saves.find_one({"user_id": user_id, "tip_id": picked["tip_id"]})
    picked["saved"] = bool(saved)
    picked["dismissed_today"] = False
    picked["personalised_hint"] = hint
    picked["streak"] = await _compute_tip_streak(user_id)
    return picked


@api_router.post("/tips/{tip_id}/save")
async def toggle_save_tip(tip_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["_id"]
    existing = await db.tip_saves.find_one({"user_id": user_id, "tip_id": tip_id})
    if existing:
        await db.tip_saves.delete_one({"user_id": user_id, "tip_id": tip_id})
        return {"saved": False}
    await db.tip_saves.insert_one({
        "user_id": user_id, "tip_id": tip_id,
        "saved_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"saved": True}


@api_router.post("/tips/{tip_id}/dismiss")
async def dismiss_tip(tip_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["_id"]
    today = _today_str()
    await db.tip_history.update_one(
        {"user_id": user_id, "shown_date": today, "tip_id": tip_id},
        {"$set": {"dismissed_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"dismissed": True}


@api_router.get("/tips/saved")
async def list_saved_tips(current_user: dict = Depends(get_current_user)):
    user_id = current_user["_id"]
    saves = await db.tip_saves.find({"user_id": user_id}).sort("saved_at", -1).to_list(length=500)
    out = []
    for s in saves:
        tip = await db.tips.find_one({"tip_id": s.get("tip_id")}, {"_id": 0})
        if tip:
            tip["saved_at"] = s.get("saved_at")
            out.append(tip)
    return out


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# ── HIPAA / secrets hardening: redact bearer tokens + ?token= URLs from access logs.
# Uvicorn's default access logger logs the full request line which can include
# ?token=<jwt> when the frontend hits /api/uploads/... Protect against leakage.
class _SensitiveLogRedactor(logging.Filter):
    _token_re = re.compile(r"(?:access_token|refresh_token|api_key|api-key|token)=[^\s&\"]+", re.IGNORECASE)
    _bearer_re = re.compile(r"Bearer\s+[A-Za-z0-9._\-]+", re.IGNORECASE)

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: D401
        try:
            msg = record.getMessage()
            if "token=" in msg or "Bearer" in msg:
                msg = self._token_re.sub("token=<redacted>", msg)
                msg = self._bearer_re.sub("Bearer <redacted>", msg)
                record.msg = msg
                record.args = ()
        except Exception:
            pass
        return True

for _name in ("uvicorn.access", "uvicorn.error", "uvicorn", __name__, "root"):
    logging.getLogger(_name).addFilter(_SensitiveLogRedactor())

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


@app.on_event("startup")
async def start_pre_surgery_scheduler():
    """Kick off the background reminder loop once per worker."""
    asyncio.create_task(pre_surgery_reminder_loop(3600))
    asyncio.create_task(preop_checklist_reminder_loop(900))
    logging.info("Pre-surgery reminder scheduler started (interval=3600s, preop=900s).")

@app.on_event("startup")
async def ensure_access_log_indexes_on_start():
    """HIPAA: guarantee the access_logs collection has TTL + query indexes."""
    await _ensure_access_log_indexes()

@app.on_event("startup")
async def ensure_forum_indexes_on_start():
    """Forum: ensure thread/post indexes for listing + full-text search."""
    await _ensure_forum_indexes()

@app.on_event("startup")
async def ensure_org_indexes_on_start():
    """Organizations + invites: ensure indexes for token lookups and TTL expiry."""
    await _ensure_org_indexes()

@app.on_event("startup")
async def seed_implant_catalog_on_start():
    """iter-142: ensure the implant_catalog collection has the curated data
    for Ankylos C/X + Osstem TS III, plus stub records for every other system."""
    await _seed_implant_catalog()
    # iter-178 (re-wired in iter-207): seed the 7 Alpha-Bio brochure systems
    # (NeO Conical Standard / Hex / Internal Hex, ICE, ATID, DFI, NICE) +
    # the shared Surgical & Prosthetic Instrumentation doc into both
    # implant_library (size matrices) and implant_catalog (rich docs).
    # Previously only ran as a manual run-once script — meaning freshly
    # deployed backends (e.g. the production `*.emergent.host` instance)
    # never received these systems and only ever showed SPI in the Implant
    # Database tile. The seed is idempotent (skips existing library rows
    # and uses upsert for catalog docs), so it's safe to run on every boot.
    try:
        from _seed_alpha_bio_brochure import main as _ab_brochure_seed
        await _ab_brochure_seed()
    except Exception as exc:  # pragma: no cover — best-effort
        logging.warning("Alpha-Bio brochure seed skipped: %s", exc)
    # iter-205: expand Alpha-Bio system component lists from the thin
    # 12-entry per-platform template to the brochure-grade 30-50 entry list,
    # so each AlphaBio system tile mirrors the depth of Neodent / Nobel /
    # MIS LANCE+. Idempotent — only updates when the live row has fewer
    # components than the expansion target.
    try:
        from _seed_alpha_bio_components import seed_if_thin as _ab_seed_if_thin
        await _ab_seed_if_thin()
    except Exception as exc:  # pragma: no cover — best-effort
        logging.warning("Alpha-Bio component expansion seed skipped: %s", exc)
    try:
        from _seed_straumann_blx import main as _blx_seed
        await _blx_seed()
    except Exception as exc:  # pragma: no cover — best-effort
        logging.warning("Straumann BLX seed skipped: %s", exc)
    try:
        from _seed_adin import main as _adin_seed
        await _adin_seed()
    except Exception as exc:  # pragma: no cover — best-effort
        logging.warning("Adin seed skipped: %s", exc)
    try:
        from _seed_straumann_blt import main as _blt_seed
        await _blt_seed()
    except Exception as exc:  # pragma: no cover — best-effort
        logging.warning("Straumann BLT seed skipped: %s", exc)
    try:
        from _seed_straumann_blx_components import seed_if_thin as _blx_comp_seed
        await _blx_comp_seed()
    except Exception as exc:  # pragma: no cover — best-effort
        logging.warning("Straumann BLX component expansion seed skipped: %s", exc)
    try:
        from _seed_adin_components import seed_if_thin as _adin_comp_seed
        await _adin_comp_seed()
    except Exception as exc:  # pragma: no cover — best-effort
        logging.warning("Adin CloseFit component expansion seed skipped: %s", exc)
    try:
        from _seed_adin_rs_components import seed_if_thin as _adin_rs_comp_seed
        await _adin_rs_comp_seed()
    except Exception as exc:  # pragma: no cover — best-effort
        logging.warning("Adin RS/One component expansion seed skipped: %s", exc)
    try:
        from _seed_straumann_blt_components import seed_if_thin as _blt_comp_seed
        await _blt_comp_seed()
    except Exception as exc:  # pragma: no cover — best-effort
        logging.warning("Straumann BLT SC component expansion seed skipped: %s", exc)
    try:
        from _seed_straumann_nc_components import seed_if_thin as _blt_nc_seed
        await _blt_nc_seed()
    except Exception as exc:  # pragma: no cover — best-effort
        logging.warning("Straumann BLT NC component expansion seed skipped: %s", exc)
    try:
        from _seed_straumann_rc_components import seed_if_thin as _blt_rc_seed
        await _blt_rc_seed()
    except Exception as exc:  # pragma: no cover — best-effort
        logging.warning("Straumann BLT RC component expansion seed skipped: %s", exc)
    try:
        ncur = db.implant_catalog.find(
            {"connection": {"$type": "string"}},
            {"_id": 0, "key": 1, "connection": 1},
        )
        nrows = await ncur.to_list(length=500)
        for r in nrows:
            await db.implant_catalog.update_one(
                {"key": r["key"]},
                {"$set": {"connection": {"type": r["connection"]}}},
            )
        if nrows:
            print(f"[implant_catalog] normalised connection field on {len(nrows)} row(s)")
    except Exception as exc:  # pragma: no cover — best-effort
        logging.warning("Catalog connection normalization skipped: %s", exc)

@app.on_event("startup")
async def seed_on_startup():
    """Auto-seed users and implant library if collections are empty (for fresh deployments)."""
    try:
        import pandas as pd
    except ImportError:
        logging.warning("pandas not installed — skipping seed.")
        return

    try:
        # Quick connectivity check
        await client.admin.command('ping')
        logging.info("MongoDB connection verified.")
    except Exception as e:
        logging.error(f"MongoDB unreachable during startup seed: {e}. App will start without seeding.")
        return

    # --- HTTPS enforcement check ---
    cors_origins = os.environ.get("CORS_ORIGINS", "")
    env_urls = [cors_origins, os.environ.get("REACT_APP_BACKEND_URL", ""), os.environ.get("EXPO_PUBLIC_BACKEND_URL", "")]
    for url in env_urls:
        for u in url.split(","):
            u = u.strip()
            if u and u.startswith("http://") and u not in ("http://localhost", "http://127.0.0.1", "http://0.0.0.0"):
                logging.warning(f"HTTPS enforcement: URL '{u}' uses http:// instead of https://. Consider using HTTPS in production.")

    # --- User seeding and cleanup disabled ---

    # --- Seed implant library (iter-179: IDEMPOTENT — no more drop()) ──────
    # Source-of-truth = implant_library_data.SYSTEMS (Python module).
    # Brochure-derived rows from alpha_bio_brochure_data.SYSTEM_SIZES are
    # merged on top. Existing rows are preserved (admin-added rows survive
    # restarts), and missing rows are inserted via $setOnInsert upsert.
    try:
        from implant_library_data import SYSTEMS as _LIB_SYSTEMS

        records = []
        for (brand, system), sizes in _LIB_SYSTEMS.items():
            for diameter, length in sizes:
                records.append({
                    "brand": brand,
                    "system": system,
                    "diameter": float(diameter),
                    "length": float(length),
                    "source": "library_master",
                })

        # Append Alpha-Bio brochure rows (NeO×3 / ICE / ATID / DFI / NICE).
        try:
            from alpha_bio_brochure_data import SYSTEM_SIZES as _AB_SIZES
            for sys_name, sizes in _AB_SIZES.items():
                for diameter, lengths in sizes["lengths_by_diameter"].items():
                    for length in lengths:
                        records.append({
                            "brand": "Alpha Bio",
                            "system": sys_name,
                            "diameter": float(diameter),
                            "length": float(length),
                            "source": "alpha_bio_brochure",
                        })
        except Exception as ab_err:
            logging.warning(f"Alpha-Bio brochure rows skipped: {ab_err}")

        # Idempotent upsert keyed on the natural composite key. We $set the
        # source field on every match (so existing rows imported by the
        # legacy destructive seed get correctly tagged), and $setOnInsert the
        # base document for new rows. Rows that are NOT in the canonical set
        # (admin-added or any other origin) keep their fields untouched.
        inserted = 0
        for rec in records:
            key = {k: rec[k] for k in ("brand", "system", "diameter", "length")}
            res = await db.implant_library.update_one(
                key,
                {
                    "$set": {"source": rec["source"]},
                    "$setOnInsert": key,
                },
                upsert=True,
            )
            if res.upserted_id is not None:
                inserted += 1

        total = await db.implant_library.count_documents({})
        admin_added = await db.implant_library.count_documents(
            {"source": {"$exists": False}}
        )
        logging.info(
            f"Implant library seeded (idempotent): {len(records)} canonical "
            f"records, {inserted} newly inserted, {total} total in DB "
            f"({admin_added} legacy/admin-added preserved)."
        )
    except Exception as e:
        logging.error(f"Implant library idempotent seed FAILED: {e}")


# ── Dental Colleges ───────────────────────────────────────────────────────────

DENTAL_COLLEGES_DATA = [
    {"name": "Anil Neerukonda Institute of Dental Sciences, Visakhapatnam", "state": "Andhra Pradesh", "type": "Private"},
    {"name": "CKS Theja Institute of Dental Sciences & Research, Tirupati", "state": "Andhra Pradesh", "type": "Private"},
    {"name": "Dr. NTR University of Health Sciences, Vijayawada (Dental Wing)", "state": "Andhra Pradesh", "type": "Govt"},
    {"name": "GSL Dental College & Hospital, Rajahmundry", "state": "Andhra Pradesh", "type": "Private"},
    {"name": "Gitam Dental College & Hospital, Visakhapatnam", "state": "Andhra Pradesh", "type": "Private"},
    {"name": "Government Dental College & Hospital, Vijayawada", "state": "Andhra Pradesh", "type": "Govt"},
    {"name": "Lenora Institute of Dental Sciences, Rajahmundry", "state": "Andhra Pradesh", "type": "Private"},
    {"name": "Narayana Dental College & Hospital, Nellore", "state": "Andhra Pradesh", "type": "Private"},
    {"name": "NDRMF Institute of Dental Sciences, Nellore", "state": "Andhra Pradesh", "type": "Private"},
    {"name": "Rajiv Gandhi Institute of Medical Sciences (Dental Wing), Kadapa", "state": "Andhra Pradesh", "type": "Govt"},
    {"name": "Rangaraya Medical College (Dental Wing), Kakinada", "state": "Andhra Pradesh", "type": "Govt"},
    {"name": "Sibar Institute of Dental Sciences, Guntur", "state": "Andhra Pradesh", "type": "Private"},
    {"name": "Sri Sai College of Dental Surgery, Vikarabad", "state": "Andhra Pradesh", "type": "Private"},
    {"name": "Sri Venkateswara Dental College & Hospital, Tirupati", "state": "Andhra Pradesh", "type": "Private"},
    {"name": "SVS Institute of Dental Sciences, Mahabubnagar", "state": "Andhra Pradesh", "type": "Private"},
    {"name": "Vishnu Dental College, Bhimavaram", "state": "Andhra Pradesh", "type": "Private"},
    {"name": "VRS & YRN Dental College & Hospital, Chirala", "state": "Andhra Pradesh", "type": "Private"},
    {"name": "Gauhati Medical College & Hospital (Dental Wing), Guwahati", "state": "Assam", "type": "Govt"},
    {"name": "Regional Dental College, Guwahati", "state": "Assam", "type": "Govt"},
    {"name": "Tezpur Dental College & Hospital, Tezpur", "state": "Assam", "type": "Private"},
    {"name": "Buddha Institute of Dental Sciences & Hospital, Patna", "state": "Bihar", "type": "Private"},
    {"name": "Government Dental College & Hospital, Patna", "state": "Bihar", "type": "Govt"},
    {"name": "Patna Dental College & Hospital, Patna", "state": "Bihar", "type": "Govt"},
    {"name": "Sardar Patel Medical College (Dental Wing), Bikaner", "state": "Bihar", "type": "Govt"},
    {"name": "Vananchal Dental College & Hospital, Faraka", "state": "Bihar", "type": "Private"},
    {"name": "Dr. Harvansh Singh Judge Institute of Dental Sciences, Chandigarh", "state": "Chandigarh", "type": "Govt"},
    {"name": "Chhattisgarh Dental College & Research Institute, Rajnandgaon", "state": "Chhattisgarh", "type": "Private"},
    {"name": "Government Dental College, Raipur", "state": "Chhattisgarh", "type": "Govt"},
    {"name": "New Government Dental College & Hospital, Raipur", "state": "Chhattisgarh", "type": "Govt"},
    {"name": "RKDF Dental College & Research Centre, Bhopal", "state": "Chhattisgarh", "type": "Private"},
    {"name": "Rungta College of Dental Sciences & Research, Bhilai", "state": "Chhattisgarh", "type": "Private"},
    {"name": "Shri Shankaracharya Institute of Medical Sciences (Dental Wing), Bhilai", "state": "Chhattisgarh", "type": "Private"},
    {"name": "Trinity Institute of Dental Sciences & Research, Gariyaband", "state": "Chhattisgarh", "type": "Private"},
    {"name": "Shri Bhausaheb Hire Government Medical College (Dental Wing), Dhule", "state": "Dadra & Nagar Haveli and Daman & Diu", "type": "Private"},
    {"name": "Army College of Dental Sciences, New Delhi", "state": "Delhi", "type": "Govt"},
    {"name": "Faculty of Dentistry, Jamia Millia Islamia, New Delhi", "state": "Delhi", "type": "Govt"},
    {"name": "Government Dental College & Hospital, New Delhi", "state": "Delhi", "type": "Govt"},
    {"name": "I.T.S Centre for Dental Studies & Research, Ghaziabad", "state": "Delhi", "type": "Private"},
    {"name": "Indira Gandhi Government Dental College & Hospital, Jammu", "state": "Delhi", "type": "Govt"},
    {"name": "Maulana Azad Institute of Dental Sciences, New Delhi", "state": "Delhi", "type": "Govt"},
    {"name": "Goa Dental College & Hospital, Panaji", "state": "Goa", "type": "Govt"},
    {"name": "Ahmedabad Dental College & Hospital, Ahmedabad", "state": "Gujarat", "type": "Private"},
    {"name": "College of Dental Sciences & Research Centre, Ahmedabad", "state": "Gujarat", "type": "Private"},
    {"name": "Government Dental College & Hospital, Ahmedabad", "state": "Gujarat", "type": "Govt"},
    {"name": "Government Dental College & Hospital, Jamnagar", "state": "Gujarat", "type": "Govt"},
    {"name": "K M Shah Dental College & Hospital, Vadodara", "state": "Gujarat", "type": "Private"},
    {"name": "Karnavati School of Dentistry, Gandhinagar", "state": "Gujarat", "type": "Private"},
    {"name": "Manubhai Patel Dental College & Hospital, Vadodara", "state": "Gujarat", "type": "Private"},
    {"name": "Narsinhbhai Patel Dental College & Hospital, Visnagar", "state": "Gujarat", "type": "Private"},
    {"name": "Pacific Dental College & Hospital, Udaipur", "state": "Gujarat", "type": "Private"},
    {"name": "Pramukh Swami Medical College (Dental Wing), Karamsad", "state": "Gujarat", "type": "Private"},
    {"name": "Rajasthan Dental College & Hospital, Jaipur", "state": "Gujarat", "type": "Private"},
    {"name": "Saurashtra University Dental College, Rajkot", "state": "Gujarat", "type": "Private"},
    {"name": "Sumandeep Vidyapeeth Dental College & Hospital, Vadodara", "state": "Gujarat", "type": "Private"},
    {"name": "Bhojia Dental College & Hospital, Baddi", "state": "Haryana", "type": "Private"},
    {"name": "D.A.V. Centenary Dental College, Yamunanagar", "state": "Haryana", "type": "Private"},
    {"name": "Faculty of Dental Sciences, SGT University, Gurugram", "state": "Haryana", "type": "Private"},
    {"name": "Haryana Kalpana Chawla Government Medical College (Dental Wing), Karnal", "state": "Haryana", "type": "Govt"},
    {"name": "Jan Nayak Ch. Devi Lal Dental College, Sirsa", "state": "Haryana", "type": "Private"},
    {"name": "Maharishi Markandeshwar College of Dental Sciences & Research, Ambala", "state": "Haryana", "type": "Private"},
    {"name": "PDM Dental College & Research Institute, Bahadurgarh", "state": "Haryana", "type": "Private"},
    {"name": "Post Graduate Institute of Dental Sciences, Rohtak", "state": "Haryana", "type": "Govt"},
    {"name": "SGT Dental College Hospital & Research Institute, Gurugram", "state": "Haryana", "type": "Private"},
    {"name": "Sudha Rustagi College of Dental Sciences & Research, Faridabad", "state": "Haryana", "type": "Private"},
    {"name": "H.P. Government Dental College & Hospital, Shimla", "state": "Himachal Pradesh", "type": "Govt"},
    {"name": "Himachal Pradesh Government Dental College, Shimla", "state": "Himachal Pradesh", "type": "Govt"},
    {"name": "M.N.D.A.V. Dental College & Hospital, Solan", "state": "Himachal Pradesh", "type": "Private"},
    {"name": "Himachal Dental College, Sundernagar", "state": "Himachal Pradesh", "type": "Private"},
    {"name": "Bhojia Dental College & Hospital, Baddi", "state": "Himachal Pradesh", "type": "Private"},
    {"name": "Government Dental College, Srinagar", "state": "Jammu & Kashmir", "type": "Govt"},
    {"name": "Indira Gandhi Government Dental College & Hospital, Jammu", "state": "Jammu & Kashmir", "type": "Govt"},
    {"name": "Institute of Dental Sciences, Sehora, Jammu", "state": "Jammu & Kashmir", "type": "Private"},
    {"name": "Hazaribag College of Dental Sciences & Hospital, Hazaribag", "state": "Jharkhand", "type": "Private"},
    {"name": "Dental Institute, Rajendra Institute of Medical Sciences, Ranchi", "state": "Jharkhand", "type": "Govt"},
    {"name": "Awadh Dental College & Hospital, Jamshedpur", "state": "Jharkhand", "type": "Private"},
    {"name": "Vananchal Dental College & Hospital, Garhwa", "state": "Jharkhand", "type": "Private"},
    {"name": "A.J. Institute of Dental Sciences, Mangaluru", "state": "Karnataka", "type": "Private"},
    {"name": "A.M.E's Dental College & Hospital, Raichur", "state": "Karnataka", "type": "Private"},
    {"name": "Al-Badar Rural Dental College & Hospital, Kalaburagi", "state": "Karnataka", "type": "Private"},
    {"name": "Al-Ameen Dental College & Hospital, Bijapur", "state": "Karnataka", "type": "Private"},
    {"name": "Bapuji Dental College & Hospital, Davangere", "state": "Karnataka", "type": "Private"},
    {"name": "College of Dental Sciences, Davangere", "state": "Karnataka", "type": "Govt"},
    {"name": "Coorg Institute of Dental Sciences, Virajpet", "state": "Karnataka", "type": "Private"},
    {"name": "Dayananda Sagar College of Dental Sciences, Bengaluru", "state": "Karnataka", "type": "Private"},
    {"name": "Faculty of Dental Sciences, M.S. Ramaiah University, Bengaluru", "state": "Karnataka", "type": "Private"},
    {"name": "Farooqia Dental College & Hospital, Mysuru", "state": "Karnataka", "type": "Private"},
    {"name": "Government Dental College & Research Institute, Bengaluru", "state": "Karnataka", "type": "Govt"},
    {"name": "H.K.E. Society's S. Nijalingappa Institute of Dental Sciences & Research, Kalaburagi", "state": "Karnataka", "type": "Private"},
    {"name": "JSS Dental College & Hospital, Mysuru", "state": "Karnataka", "type": "Private"},
    {"name": "K.L.E. Institute of Dental Sciences, Bengaluru", "state": "Karnataka", "type": "Private"},
    {"name": "K.L.E.V.K. Institute of Dental Sciences, Belagavi", "state": "Karnataka", "type": "Private"},
    {"name": "K.L.E. Society's Institute of Dental Sciences, Hubli", "state": "Karnataka", "type": "Private"},
    {"name": "Kannur Dental College, Anjarakandy", "state": "Karnataka", "type": "Private"},
    {"name": "Karnataka Lingayat Education Society's Institute of Dental Sciences, Belagavi", "state": "Karnataka", "type": "Private"},
    {"name": "M.R. Ambedkar Dental College & Hospital, Bengaluru", "state": "Karnataka", "type": "Private"},
    {"name": "Manipal College of Dental Sciences, Mangaluru", "state": "Karnataka", "type": "Private"},
    {"name": "Manipal College of Dental Sciences, Manipal", "state": "Karnataka", "type": "Private"},
    {"name": "Maratha Mandal's N.G.H. Institute of Dental Sciences & Research Centre, Belagavi", "state": "Karnataka", "type": "Private"},
    {"name": "Navodaya Dental College & Hospital, Raichur", "state": "Karnataka", "type": "Private"},
    {"name": "Nitte (Deemed to be University) AB Shetty Memorial Institute of Dental Sciences, Mangaluru", "state": "Karnataka", "type": "Private"},
    {"name": "Oxford Dental College, Bengaluru", "state": "Karnataka", "type": "Private"},
    {"name": "P.M.N.M. Dental College & Hospital, Bagalkot", "state": "Karnataka", "type": "Private"},
    {"name": "Rajarajeswari Dental College & Hospital, Bengaluru", "state": "Karnataka", "type": "Private"},
    {"name": "S.B. Patil Dental College & Hospital, Bidar", "state": "Karnataka", "type": "Private"},
    {"name": "S.D.M. College of Dental Sciences, Dharwad", "state": "Karnataka", "type": "Private"},
    {"name": "Srinivas Institute of Dental Sciences, Mangaluru", "state": "Karnataka", "type": "Private"},
    {"name": "Sri Rajiv Gandhi College of Dental Sciences & Hospital, Bengaluru", "state": "Karnataka", "type": "Private"},
    {"name": "Sri Siddhartha Dental College, Tumkur", "state": "Karnataka", "type": "Private"},
    {"name": "SRM Institute of Dental Sciences and Hospital, Bengaluru", "state": "Karnataka", "type": "Private"},
    {"name": "Subbaiah Institute of Dental Sciences, Shivamogga", "state": "Karnataka", "type": "Private"},
    {"name": "The Oxford Dental College & Hospital, Bengaluru", "state": "Karnataka", "type": "Private"},
    {"name": "Vokkaligara Sangha Dental College & Hospital, Bengaluru", "state": "Karnataka", "type": "Private"},
    {"name": "Vydehi Institute of Dental Sciences & Research Centre, Bengaluru", "state": "Karnataka", "type": "Private"},
    {"name": "Yenepoya Dental College, Mangaluru", "state": "Karnataka", "type": "Private"},
    {"name": "Azeezia College of Dental Sciences & Research, Kollam", "state": "Kerala", "type": "Private"},
    {"name": "Century International Institute of Dental Science & Research Centre, Kasaragod", "state": "Kerala", "type": "Private"},
    {"name": "Cooperative Dental College, Calicut", "state": "Kerala", "type": "Private"},
    {"name": "De Paul Institute of Science & Technology (Dental Wing), Angamaly", "state": "Kerala", "type": "Private"},
    {"name": "Educare Institute of Dental Sciences, Malappuram", "state": "Kerala", "type": "Private"},
    {"name": "Government Dental College, Alappuzha", "state": "Kerala", "type": "Govt"},
    {"name": "Government Dental College, Calicut", "state": "Kerala", "type": "Govt"},
    {"name": "Government Dental College, Kottayam", "state": "Kerala", "type": "Govt"},
    {"name": "Government Dental College, Thrissur", "state": "Kerala", "type": "Govt"},
    {"name": "Government Dental College, Thiruvananthapuram", "state": "Kerala", "type": "Govt"},
    {"name": "Indira Gandhi Institute of Dental Sciences, Puducherry", "state": "Kerala", "type": "Private"},
    {"name": "Mar Baselios Dental College, Kothamangalam", "state": "Kerala", "type": "Private"},
    {"name": "MES Dental College, Malappuram", "state": "Kerala", "type": "Private"},
    {"name": "Noorul Islam College of Dental Sciences, Thiruvananthapuram", "state": "Kerala", "type": "Private"},
    {"name": "P.S.M. College of Dental Science & Research, Akkikavu", "state": "Kerala", "type": "Private"},
    {"name": "PMS College of Dental Science & Research, Thiruvananthapuram", "state": "Kerala", "type": "Private"},
    {"name": "Pushpagiri College of Dental Sciences, Tiruvalla", "state": "Kerala", "type": "Private"},
    {"name": "Royal Dental College, Palakkad", "state": "Kerala", "type": "Private"},
    {"name": "Sree Anjaneya Institute of Dental Sciences, Calicut", "state": "Kerala", "type": "Private"},
    {"name": "Sree Mookambika Institute of Dental Sciences, Kanyakumari", "state": "Kerala", "type": "Private"},
    {"name": "St. Gregorious Dental College & Research Centre, Kothamangalam", "state": "Kerala", "type": "Private"},
    {"name": "Travancore Dental College, Kollam", "state": "Kerala", "type": "Private"},
    {"name": "Vasan Dental College & Hospital, Ernakulam", "state": "Kerala", "type": "Private"},
    {"name": "Annoor Dental College & Hospital, Ernakulam", "state": "Kerala", "type": "Private"},
    {"name": "Amrita School of Dentistry, Ernakulam", "state": "Kerala", "type": "Private"},
    {"name": "College of Dental Sciences, Davangere", "state": "Madhya Pradesh", "type": "Govt"},
    {"name": "Government College of Dentistry, Indore", "state": "Madhya Pradesh", "type": "Govt"},
    {"name": "Hitkarini Dental College & Hospital, Jabalpur", "state": "Madhya Pradesh", "type": "Private"},
    {"name": "Index Institute of Dental Sciences, Indore", "state": "Madhya Pradesh", "type": "Private"},
    {"name": "Mandsaur Institute of Dental Science & Research, Mandsaur", "state": "Madhya Pradesh", "type": "Private"},
    {"name": "Modern Dental College & Research Centre, Indore", "state": "Madhya Pradesh", "type": "Private"},
    {"name": "People's Dental Academy, Bhopal", "state": "Madhya Pradesh", "type": "Private"},
    {"name": "Peoples College of Dental Sciences & Research Centre, Bhopal", "state": "Madhya Pradesh", "type": "Private"},
    {"name": "R.K.D.F. Dental College & Research Centre, Bhopal", "state": "Madhya Pradesh", "type": "Private"},
    {"name": "Rishiraj College of Dental Sciences & Research Centre, Bhopal", "state": "Madhya Pradesh", "type": "Private"},
    {"name": "Saraswati Dhanwantari Dental College & Hospital, Palghar", "state": "Madhya Pradesh", "type": "Private"},
    {"name": "School of Dental Sciences, Peoples University, Bhopal", "state": "Madhya Pradesh", "type": "Private"},
    {"name": "Shyam Shah Medical College (Dental Wing), Rewa", "state": "Madhya Pradesh", "type": "Govt"},
    {"name": "Sri Aurobindo College of Dentistry, Indore", "state": "Madhya Pradesh", "type": "Private"},
    {"name": "A. Nair Hospital Dental College, Mumbai", "state": "Maharashtra", "type": "Govt"},
    {"name": "Bharati Vidyapeeth Dental College & Hospital, Pune", "state": "Maharashtra", "type": "Private"},
    {"name": "Bharati Vidyapeeth Deemed University Dental College & Hospital, Navi Mumbai", "state": "Maharashtra", "type": "Private"},
    {"name": "Bharati Vidyapeeth Deemed University Dental College & Hospital, Sangli", "state": "Maharashtra", "type": "Private"},
    {"name": "Chettinad Dental College & Research Institute, Kanchipuram", "state": "Maharashtra", "type": "Private"},
    {"name": "D.Y. Patil Dental College & Hospital, Kolhapur", "state": "Maharashtra", "type": "Private"},
    {"name": "D.Y. Patil University School of Dentistry, Navi Mumbai", "state": "Maharashtra", "type": "Private"},
    {"name": "Dr. D.Y. Patil Dental College & Hospital, Pune", "state": "Maharashtra", "type": "Private"},
    {"name": "Dr. Hedgewar Smruti Rugna Seva Mandal's Dental College & Hospital, Hingoli", "state": "Maharashtra", "type": "Private"},
    {"name": "Dr. Rajesh Ramdasji Kambe Dental College & Hospital, Akola", "state": "Maharashtra", "type": "Private"},
    {"name": "Government Dental College & Hospital, Aurangabad", "state": "Maharashtra", "type": "Govt"},
    {"name": "Government Dental College & Hospital, Mumbai", "state": "Maharashtra", "type": "Govt"},
    {"name": "Government Dental College & Hospital, Nagpur", "state": "Maharashtra", "type": "Govt"},
    {"name": "K.B.H. Dental College & Hospital, Nashik", "state": "Maharashtra", "type": "Private"},
    {"name": "M.A. Rangoonwala College of Dental Sciences & Research Centre, Pune", "state": "Maharashtra", "type": "Private"},
    {"name": "M.G.M. Dental College & Hospital, Navi Mumbai", "state": "Maharashtra", "type": "Private"},
    {"name": "Mahatma Gandhi Mission's Dental College & Hospital, Aurangabad", "state": "Maharashtra", "type": "Private"},
    {"name": "Mahatma Gandhi Vidyamandir's Dental College & Research Institute, Nashik", "state": "Maharashtra", "type": "Private"},
    {"name": "Maharashtra Institute of Dental Sciences & Research, Latur", "state": "Maharashtra", "type": "Private"},
    {"name": "Nair Hospital Dental College, Mumbai", "state": "Maharashtra", "type": "Govt"},
    {"name": "P.D.M. Dental College & Research Institute, Bahadurgarh", "state": "Maharashtra", "type": "Private"},
    {"name": "Padmashree Dr. D.Y. Patil Dental College & Hospital, Pune", "state": "Maharashtra", "type": "Private"},
    {"name": "Pravara Institute of Medical Sciences Dental College & Hospital, Ahmednagar", "state": "Maharashtra", "type": "Private"},
    {"name": "Rural Dental College, Loni", "state": "Maharashtra", "type": "Private"},
    {"name": "S.M.B.T. Dental College & Hospital, Nashik", "state": "Maharashtra", "type": "Private"},
    {"name": "Saraswati Dhanwantari Dental College & Hospital, Nandurbar", "state": "Maharashtra", "type": "Private"},
    {"name": "School of Dental Sciences, Krishna Institute of Medical Sciences, Karad", "state": "Maharashtra", "type": "Private"},
    {"name": "Seth G.S. Medical College (Dental Wing), Mumbai", "state": "Maharashtra", "type": "Govt"},
    {"name": "Sharad Pawar Dental College, Wardha", "state": "Maharashtra", "type": "Private"},
    {"name": "Sinhgad Dental College & Hospital, Pune", "state": "Maharashtra", "type": "Private"},
    {"name": "Swargiya Dadasaheb Kalmegh Smruti Dental College & Hospital, Nagpur", "state": "Maharashtra", "type": "Private"},
    {"name": "Tatyasaheb Kore Dental College & Research Centre, Kolhapur", "state": "Maharashtra", "type": "Private"},
    {"name": "Terna Dental College & Hospital, Navi Mumbai", "state": "Maharashtra", "type": "Private"},
    {"name": "Vasantdada Patil Dental College & Hospital, Sangli", "state": "Maharashtra", "type": "Private"},
    {"name": "Vidarbha Youth Welfare Society's Dental College & Hospital, Amravati", "state": "Maharashtra", "type": "Private"},
    {"name": "YMT Dental College & Hospital, Navi Mumbai", "state": "Maharashtra", "type": "Private"},
    {"name": "Dental College, Regional Institute of Medical Sciences, Imphal", "state": "Manipur", "type": "Govt"},
    {"name": "Shija Academy of Health Sciences (Dental Wing), Imphal", "state": "Manipur", "type": "Private"},
    {"name": "Hi Tech Dental College & Hospital, Bhubaneswar", "state": "Odisha", "type": "Private"},
    {"name": "Institute of Dental Sciences, Bhubaneswar", "state": "Odisha", "type": "Private"},
    {"name": "SCB Dental College & Hospital, Cuttack", "state": "Odisha", "type": "Govt"},
    {"name": "Kalinga Institute of Dental Sciences, Bhubaneswar", "state": "Odisha", "type": "Private"},
    {"name": "Chettinad Dental College, Kanchipuram", "state": "Puducherry", "type": "Private"},
    {"name": "Indira Gandhi Institute of Dental Sciences, Sri Balaji Vidyapeeth, Puducherry", "state": "Puducherry", "type": "Private"},
    {"name": "Mahatma Gandhi Post Graduate Institute of Dental Sciences, Puducherry", "state": "Puducherry", "type": "Govt"},
    {"name": "Sri Venkateshwaraa Dental College, Puducherry", "state": "Puducherry", "type": "Private"},
    {"name": "Adesh Institute of Dental Sciences & Research, Bathinda", "state": "Punjab", "type": "Private"},
    {"name": "Baba Jaswant Singh Dental College, Hospital & Research Institute, Ludhiana", "state": "Punjab", "type": "Private"},
    {"name": "Christian Dental College, Ludhiana", "state": "Punjab", "type": "Private"},
    {"name": "Desh Bhagat Dental College & Hospital, Mandi Gobindgarh", "state": "Punjab", "type": "Private"},
    {"name": "Genesis Institute of Dental Sciences & Research, Ferozepur", "state": "Punjab", "type": "Private"},
    {"name": "Gian Sagar Dental College & Hospital, Patiala", "state": "Punjab", "type": "Private"},
    {"name": "Guru Nanak Dev Dental College & Research Institute, Sunam", "state": "Punjab", "type": "Private"},
    {"name": "ITS Dental College, Greater Noida", "state": "Punjab", "type": "Private"},
    {"name": "Laxmi Bai Dental College & Hospital, Patiala", "state": "Punjab", "type": "Private"},
    {"name": "National Dental College & Hospital, Derabassi", "state": "Punjab", "type": "Private"},
    {"name": "Punjab Government Dental College & Hospital, Amritsar", "state": "Punjab", "type": "Govt"},
    {"name": "Rayat Bahra Dental College & Hospital, Mohali", "state": "Punjab", "type": "Private"},
    {"name": "Sri Guru Ram Das Institute of Dental Sciences & Research, Amritsar", "state": "Punjab", "type": "Private"},
    {"name": "Sukh Sagar Medical College & Hospital (Dental Wing), Jalandhar", "state": "Punjab", "type": "Private"},
    {"name": "Swami Devi Dyal Hospital & Dental College, Panchkula", "state": "Punjab", "type": "Private"},
    {"name": "Bhojia Dental College & Hospital, Bhud", "state": "Punjab", "type": "Private"},
    {"name": "Daswani Dental College & Research Centre, Kota", "state": "Rajasthan", "type": "Private"},
    {"name": "Darshan Dental College & Hospital, Udaipur", "state": "Rajasthan", "type": "Private"},
    {"name": "Dr. B.R. Ambedkar Government Dental College, Shimla", "state": "Rajasthan", "type": "Govt"},
    {"name": "Eklavya Dental College & Hospital, Jaipur", "state": "Rajasthan", "type": "Private"},
    {"name": "Geetanjali Dental & Research Institute, Udaipur", "state": "Rajasthan", "type": "Private"},
    {"name": "Government Dental College, Jaipur", "state": "Rajasthan", "type": "Govt"},
    {"name": "Government Dental College, Jodhpur", "state": "Rajasthan", "type": "Govt"},
    {"name": "Government Dental College, Kota", "state": "Rajasthan", "type": "Govt"},
    {"name": "Jaipur Dental College, Jaipur", "state": "Rajasthan", "type": "Private"},
    {"name": "Jodhpur Dental College General Hospital, Jodhpur", "state": "Rajasthan", "type": "Private"},
    {"name": "Maharaj Vinayak Global University, Faculty of Dental Sciences, Jaipur", "state": "Rajasthan", "type": "Private"},
    {"name": "Maharishi Arvind Dental College & Hospital, Jaipur", "state": "Rajasthan", "type": "Private"},
    {"name": "Pacific Dental College & Hospital, Udaipur", "state": "Rajasthan", "type": "Private"},
    {"name": "RUHS College of Dental Sciences, Jaipur", "state": "Rajasthan", "type": "Govt"},
    {"name": "Rajasthan Dental College & Hospital, Jaipur", "state": "Rajasthan", "type": "Private"},
    {"name": "Surendra Dental College & Research Institute, Sri Ganganagar", "state": "Rajasthan", "type": "Private"},
    {"name": "Vyas Dental College & Hospital, Jodhpur", "state": "Rajasthan", "type": "Private"},
    {"name": "Yogiraj Dental College & Hospital, Bikaner", "state": "Rajasthan", "type": "Private"},
    {"name": "Adhiparasakthi Dental College & Hospital, Melmaruvathur", "state": "Tamil Nadu", "type": "Private"},
    {"name": "ACS Dental College & Hospital, Chennai", "state": "Tamil Nadu", "type": "Private"},
    {"name": "Best Dental Science College, Madurai", "state": "Tamil Nadu", "type": "Private"},
    {"name": "Chettinad Dental College & Research Institute, Kanchipuram", "state": "Tamil Nadu", "type": "Private"},
    {"name": "CSI College of Dental Sciences & Research, Madurai", "state": "Tamil Nadu", "type": "Private"},
    {"name": "Dhanalakshmi Srinivasan Dental College & Hospital, Perambalur", "state": "Tamil Nadu", "type": "Private"},
    {"name": "Dr. Subramanian Chettiar Dental College, Tirunelveli", "state": "Tamil Nadu", "type": "Private"},
    {"name": "Asan Memorial Dental College & Hospital, Kanchipuram", "state": "Tamil Nadu", "type": "Private"},
    {"name": "Indira Gandhi Institute of Dental Sciences, Puducherry", "state": "Tamil Nadu", "type": "Private"},
    {"name": "J.K.K. Nattraja Dental College & Hospital, Namakkal", "state": "Tamil Nadu", "type": "Private"},
    {"name": "Karpaga Vinayaga Institute of Dental Sciences, Kanchipuram", "state": "Tamil Nadu", "type": "Private"},
    {"name": "K.S.R. Institute of Dental Science and Research, Namakkal", "state": "Tamil Nadu", "type": "Private"},
    {"name": "Marundeeswarar Institute of Dental Sciences, Chennai", "state": "Tamil Nadu", "type": "Private"},
    {"name": "Meenakshi Ammal Dental College & Hospital, Chennai", "state": "Tamil Nadu", "type": "Private"},
    {"name": "Meenakshi Academy of Higher Education & Research (Dental College), Chennai", "state": "Tamil Nadu", "type": "Private"},
    {"name": "Penang International Dental College, Chennai", "state": "Tamil Nadu", "type": "Private"},
    {"name": "R.V.S. Dental College & Hospital, Coimbatore", "state": "Tamil Nadu", "type": "Private"},
    {"name": "Ragas Dental College & Hospital, Chennai", "state": "Tamil Nadu", "type": "Private"},
    {"name": "S.R.M. Dental College, Chennai", "state": "Tamil Nadu", "type": "Private"},
    {"name": "Saveetha Dental College & Hospital, Chennai", "state": "Tamil Nadu", "type": "Private"},
    {"name": "Sri Ramachandra Institute of Higher Education & Research (Dental College), Chennai", "state": "Tamil Nadu", "type": "Private"},
    {"name": "Sri Ramakrishna Dental College & Hospital, Coimbatore", "state": "Tamil Nadu", "type": "Private"},
    {"name": "Sri Venkateswara Dental College & Hospital, Chennai", "state": "Tamil Nadu", "type": "Private"},
    {"name": "SRM Dental College, Ramapuram, Chennai", "state": "Tamil Nadu", "type": "Private"},
    {"name": "Tamil Nadu Government Dental College & Hospital, Chennai", "state": "Tamil Nadu", "type": "Govt"},
    {"name": "Thai Moogambigai Dental College & Hospital, Chennai", "state": "Tamil Nadu", "type": "Private"},
    {"name": "Tamilnadu Dr. M.G.R. Medical University (Dental Wing), Chennai", "state": "Tamil Nadu", "type": "Govt"},
    {"name": "Vivekanandha Dental College for Women, Namakkal", "state": "Tamil Nadu", "type": "Private"},
    {"name": "Vinayaka Mission's Sankarachariyar Dental College, Salem", "state": "Tamil Nadu", "type": "Private"},
    {"name": "Rajiv Gandhi Institute of Medical Sciences, Adilabad (Dental Wing)", "state": "Telangana", "type": "Govt"},
    {"name": "Govt. Dental College & Hospital, Hyderabad", "state": "Telangana", "type": "Govt"},
    {"name": "Kamineni Institute of Dental Sciences, Nalgonda", "state": "Telangana", "type": "Private"},
    {"name": "MNR Dental College & Hospital, Sangareddy", "state": "Telangana", "type": "Private"},
    {"name": "Mamata Dental College, Khammam", "state": "Telangana", "type": "Private"},
    {"name": "Meghna Institute of Dental Sciences, Nizamabad", "state": "Telangana", "type": "Private"},
    {"name": "Malla Reddy Dental College for Women, Hyderabad", "state": "Telangana", "type": "Private"},
    {"name": "Panineeya Mahavidyalaya Institute of Dental Sciences & Research Centre, Hyderabad", "state": "Telangana", "type": "Private"},
    {"name": "Penang International Dental College, Hyderabad", "state": "Telangana", "type": "Private"},
    {"name": "Sri Sai College of Dental Surgery, Vikarabad", "state": "Telangana", "type": "Private"},
    {"name": "Sri Venkata Sai Institute of Medical Sciences & Research (Dental), Mahabubnagar", "state": "Telangana", "type": "Private"},
    {"name": "SVS Institute of Dental Sciences, Mahabubnagar", "state": "Telangana", "type": "Private"},
    {"name": "Tirumala Dental College & Hospital, Nizamabad", "state": "Telangana", "type": "Private"},
    {"name": "Vishnu Dental College, Bhimavaram", "state": "Telangana", "type": "Private"},
    {"name": "Tripura Dental College & MK Ct Hospital, Agartala", "state": "Tripura", "type": "Govt"},
    {"name": "Babu Banarasi Das College of Dental Sciences, Lucknow", "state": "Uttar Pradesh", "type": "Private"},
    {"name": "Buddha Institute of Dental Sciences & Hospital, Patna", "state": "Uttar Pradesh", "type": "Private"},
    {"name": "Career Institute of Dental Sciences & Hospital, Lucknow", "state": "Uttar Pradesh", "type": "Private"},
    {"name": "Chandra Dental College & Hospital, Safedabad, Barabanki", "state": "Uttar Pradesh", "type": "Private"},
    {"name": "Dental College & Hospital, M.L.N. Medical College, Allahabad", "state": "Uttar Pradesh", "type": "Govt"},
    {"name": "Dr. Ram Manohar Lohia Institute of Medical Sciences (Dental Wing), Lucknow", "state": "Uttar Pradesh", "type": "Govt"},
    {"name": "Era's Lucknow Medical College & Hospital (Dental Wing), Lucknow", "state": "Uttar Pradesh", "type": "Private"},
    {"name": "Faculty of Dental Sciences, C.S.M. Medical University, Lucknow", "state": "Uttar Pradesh", "type": "Govt"},
    {"name": "G.S.V.M. Medical College (Dental Wing), Kanpur", "state": "Uttar Pradesh", "type": "Govt"},
    {"name": "Government Dental College, Azamgarh", "state": "Uttar Pradesh", "type": "Govt"},
    {"name": "Hind Institute of Medical Sciences (Dental Wing), Lucknow", "state": "Uttar Pradesh", "type": "Private"},
    {"name": "I.T.S. Centre for Dental Studies & Research, Muradnagar, Ghaziabad", "state": "Uttar Pradesh", "type": "Private"},
    {"name": "Inderprastha Dental College & Hospital, Ghaziabad", "state": "Uttar Pradesh", "type": "Private"},
    {"name": "Institute of Dental Sciences, Bareilly", "state": "Uttar Pradesh", "type": "Private"},
    {"name": "Kalka Dental College, Meerut", "state": "Uttar Pradesh", "type": "Private"},
    {"name": "Kothiwal Dental College & Research Centre, Moradabad", "state": "Uttar Pradesh", "type": "Private"},
    {"name": "Maharana Pratap Dental College & Hospital, Kanpur", "state": "Uttar Pradesh", "type": "Private"},
    {"name": "Nehru Dental College & Hospital, Faridabad", "state": "Uttar Pradesh", "type": "Private"},
    {"name": "NIMS Institute of Dental Sciences & Research, Jaipur", "state": "Uttar Pradesh", "type": "Private"},
    {"name": "Rama Dental College Hospital & Research Centre, Kanpur", "state": "Uttar Pradesh", "type": "Private"},
    {"name": "Saraswati Dental College & Hospital, Lucknow", "state": "Uttar Pradesh", "type": "Private"},
    {"name": "School of Dental Sciences, Sharda University, Greater Noida", "state": "Uttar Pradesh", "type": "Private"},
    {"name": "Seema Dental College & Hospital, Rishikesh", "state": "Uttar Pradesh", "type": "Private"},
    {"name": "Subharti Dental College & Hospital, Meerut", "state": "Uttar Pradesh", "type": "Private"},
    {"name": "Teerthankar Mahaveer Dental College & Research Centre, Moradabad", "state": "Uttar Pradesh", "type": "Private"},
    {"name": "UP Rural Institute of Medical Sciences & Research (Dental Wing), Saifai, Etawah", "state": "Uttar Pradesh", "type": "Govt"},
    {"name": "Uttarakhand Dental College & Research Institute, Dehradun", "state": "Uttarakhand", "type": "Private"},
    {"name": "Himgiri Zee University, Faculty of Dental Sciences, Dehradun", "state": "Uttarakhand", "type": "Private"},
    {"name": "Calcutta National Medical College (Dental Wing), Kolkata", "state": "West Bengal", "type": "Govt"},
    {"name": "Dr. R. Ahmed Dental College & Hospital, Kolkata", "state": "West Bengal", "type": "Govt"},
    {"name": "Guru Nanak Institute of Dental Sciences & Research, Kolkata", "state": "West Bengal", "type": "Private"},
    {"name": "North Bengal Dental College & Hospital, Darjeeling", "state": "West Bengal", "type": "Private"},
    {"name": "Sardar Patel Dental College & Hospital, Lucknow", "state": "West Bengal", "type": "Private"},
    {"name": "Haldia Institute of Dental Sciences & Research, Haldia", "state": "West Bengal", "type": "Private"},
    {"name": "Raiganj Government Medical College (Dental Wing), Raiganj", "state": "West Bengal", "type": "Govt"},
]


async def _seed_dental_colleges():
    """Idempotent: populate dental_colleges collection from DCI list (AY 2025-26). Skips if already seeded."""
    count = await db.dental_colleges.count_documents({})
    if count >= len(DENTAL_COLLEGES_DATA):
        logging.info(f"Dental colleges already seeded ({count} docs). Skipping.")
        return
    await db.dental_colleges.delete_many({})
    await db.dental_colleges.insert_many(DENTAL_COLLEGES_DATA)
    await db.dental_colleges.create_index([("name", "text"), ("state", "text")])
    await db.dental_colleges.create_index("state")
    logging.info(f"Dental colleges seeded: {len(DENTAL_COLLEGES_DATA)} records.")


@app.on_event("startup")
async def seed_dental_colleges_on_start():
    await _seed_dental_colleges()


@api_router.get("/dental-colleges")
async def get_dental_colleges(
    q: Optional[str] = Query(None, description="Search term for name or state"),
    state: Optional[str] = Query(None, description="Filter by state"),
    college_type: Optional[str] = Query(None, alias="type", description="Govt or Private"),
):
    """Public endpoint — returns list of DCI-recognised dental colleges."""
    mongo_filter: Dict[str, Any] = {}

    if q and q.strip():
        mongo_filter["$or"] = [
            {"name": {"$regex": q.strip(), "$options": "i"}},
            {"state": {"$regex": q.strip(), "$options": "i"}},
        ]

    if state and state.strip():
        mongo_filter["state"] = {"$regex": f"^{state.strip()}$", "$options": "i"}

    if college_type and college_type.strip():
        mongo_filter["type"] = college_type.strip()

    cursor = db.dental_colleges.find(mongo_filter, {"_id": 0}).sort("name", 1)
    results = await cursor.to_list(length=500)
    return {"colleges": results, "total": len(results)}
