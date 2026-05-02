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
from passlib.context import CryptContext
import jwt
from bson import ObjectId
import httpx
from augmentation_checklist import generate_augmentation_checklist
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

ROOT_DIR = Path(__file__).parent
UPLOADS_DIR = ROOT_DIR / 'uploads'
UPLOADS_DIR.mkdir(exist_ok=True)
load_dotenv(ROOT_DIR / '.env')

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
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
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

@app.get("/api/expo-qr")
async def expo_qr():
    import os
    qr_path = os.path.join(os.path.dirname(__file__), "expo-qr.png")
    if os.path.exists(qr_path):
        return FileResponse(qr_path, media_type="image/png")
    raise HTTPException(status_code=404, detail="QR code not found")


# Helper functions
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

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
    # Timestamp when the user dismissed the first-login onboarding + workflow help.
    # Null means they haven't seen it yet → frontend routes them through onboarding.
    workflow_seen_at: Optional[datetime] = None
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
    supervisor_id: Optional[str] = Field(None, max_length=50)
    supervisor_name: Optional[str] = Field(None, max_length=100)
    implant_incharge_id: Optional[str] = Field(None, max_length=50)
    implant_incharge_name: Optional[str] = Field(None, max_length=100)
    receipt_number: Optional[str] = Field(None, max_length=50)
    amount_paid: Optional[float] = None
    procedure_date: Optional[str] = Field(None, max_length=30)
    procedure_time: Optional[str] = Field(None, max_length=20)
    implant_procedure_type: Optional[str] = Field(None, max_length=100)
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
    # Pre-surgery checklist (7 items)
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
async def send_expo_push_notifications(user_ids: List[str], title: str, body: str, data: Optional[Dict] = None):
    """Send push notifications to users via Expo Push API."""
    if not user_ids:
        return
    tokens = []
    users = await db.users.find(
        {"_id": {"$in": [ObjectId(uid) for uid in user_ids]}},
        {"push_token": 1}
    ).to_list(len(user_ids))
    for user in users:
        if user.get("push_token"):
            tokens.append(user["push_token"])
    if not tokens:
        return
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

# Auth Routes
@api_router.post("/auth/register", response_model=UserResponse)
async def register(user: UserRegister):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Validate role
    if user.role not in ["student", "supervisor", "implant_incharge", "administrator", "nurse"]:
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
    return UserResponse(
        id=current_user["_id"],
        name=current_user["name"],
        email=current_user["email"],
        role=current_user["role"],
        profile_photo=current_user.get("profile_photo"),
        workflow_seen_at=current_user.get("workflow_seen_at"),
        last_seen_whatsnew_version=current_user.get("last_seen_whatsnew_version"),
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
async def ack_workflow(current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    await db.users.update_one(
        {"_id": ObjectId(current_user["_id"])},
        {"$set": {"workflow_seen_at": now}},
    )
    return {"workflow_seen_at": now.isoformat()}

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
    query = {}
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

    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return sanitize_input(v)

@api_router.post("/users")
async def create_user(user: UserCreate, current_user: dict = Depends(get_current_user)):
    # Only administrators can create users
    if current_user["role"] not in ["administrator", "implant_incharge"]:
        raise HTTPException(status_code=403, detail="Only administrators and implant incharge can create users")
    
    # Check if email already exists
    existing = await db.users.find_one({"email": user.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Validate role
    if user.role not in ["student", "supervisor", "implant_incharge", "administrator", "nurse"]:
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
    
    return {"id": str(result.inserted_id), "message": "User created successfully"}

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    # Only administrators can delete users
    if current_user["role"] not in ["administrator", "implant_incharge"]:
        raise HTTPException(status_code=403, detail="Only administrators and implant incharge can delete users")
    
    # Cannot delete yourself
    if user_id == current_user["_id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
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
    
    update_fields = {}
    if user.name and user.name.strip():
        update_fields["name"] = user.name.strip()
    if user.role:
        if user.role not in ["student", "supervisor", "implant_incharge", "administrator", "nurse"]:
            raise HTTPException(status_code=400, detail="Invalid role")
        update_fields["role"] = user.role
    if user.password and user.password.strip():
        update_fields["password_hash"] = hash_password(user.password)
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update_fields})
    
    return {"message": "User updated successfully"}


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


@api_router.post("/procedures")
async def create_procedure(procedure: ProcedureCreate, current_user: dict = Depends(get_current_user)):
    # Students, supervisors, and implant_incharge can create procedures
    allowed_roles = {"student", "supervisor", "implant_incharge", "administrator"}
    if current_user["role"] not in allowed_roles:
        raise HTTPException(status_code=403, detail="You do not have permission to create procedures")
    
    is_student = current_user["role"] == "student"
    is_supervisor = current_user["role"] == "supervisor"
    is_incharge = current_user["role"] in ("implant_incharge", "administrator")
    
    # Check scheduling restrictions
    try:
        procedure_datetime = datetime.strptime(f"{procedure.procedure_date} {procedure.procedure_time}", "%Y-%m-%d %H:%M")
        
        # Block Sunday scheduling for everyone
        if procedure_datetime.weekday() == 6:  # Sunday
            raise HTTPException(
                status_code=400,
                detail="No scheduling is available on Sundays."
            )
        
        # Saturday: only 9:30 AM slot
        if procedure_datetime.weekday() == 5:  # Saturday
            if procedure.procedure_time != "10:00":
                raise HTTPException(
                    status_code=400,
                    detail="Only 10:00 AM slot is available on Saturdays."
                )
        
        # 24-hour restriction for students only
        if is_student:
            hours_until_procedure = (procedure_datetime - datetime.now()).total_seconds() / 3600
            if hours_until_procedure < 24:
                raise HTTPException(
                    status_code=400, 
                    detail="Students cannot schedule procedures less than 24 hours in advance. Please select a date at least 24 hours from now."
                )
    except ValueError:
        pass  # If date parsing fails, let it proceed (will be caught by validation)

    # ── Duplicate slot check: only 1 patient per slot per day (skip for own draft) ──
    existing = await db.procedures.find_one({
        "procedure_date": procedure.procedure_date,
        "procedure_time": procedure.procedure_time,
    })
    if existing:
        existing_id = str(existing["_id"])
        # Allow if it's the user's own draft being continued
        is_own_draft = existing.get("status") == "draft" and (
            existing.get("created_by_id") == current_user["_id"] or
            existing.get("student_id") == current_user["_id"]
        )
        if not is_own_draft:
            booked_by = existing.get("created_by_name") or existing.get("student_name") or "Unknown"
            patient = existing.get("patient_name", "Unknown")
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
        "All on 4", "All on 6", "All on X",
    ]
    if procedure.implant_procedure_type not in valid_procedure_types:
        raise HTTPException(status_code=400, detail=f"Invalid implant procedure type: {procedure.implant_procedure_type}")

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
            "created_by_role": "student",
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
            "created_by_role": "supervisor",
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
            "created_by_role": "implant_incharge",
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
            )
    
    return procedure_dict


@api_router.get("/procedures/slots/{date}")
async def get_booked_slots(date: str, current_user: dict = Depends(get_current_user)):
    """Return booked time slots for a given date with patient/scheduler info."""
    booked = await db.procedures.find(
        {"procedure_date": date},
        {"_id": 0, "procedure_time": 1, "patient_name": 1, "student_name": 1, "created_by_name": 1, "created_by_role": 1},
    ).to_list(10)
    slots = {}
    for b in booked:
        t = b.get("procedure_time", "")
        slots[t] = {
            "patient_name": b.get("patient_name", ""),
            "scheduled_by": b.get("created_by_name") or b.get("student_name") or "",
        }
    return {"date": date, "booked_slots": slots}


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
            {"created_by_role": {"$ne": "implant_incharge"}},
        ]
    elif current_user["role"] == "nurse":
        # Nurses can only see fully approved/completed procedures
        query["status"] = {"$in": ["phase1_approved", "phase2_approved", "approved", "stage2_surgical_approved", "completed"]}
    # administrator and implant_incharge can see all

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


@api_router.get("/procedures/{procedure_id}")
async def get_procedure(procedure_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    
    # Check access
    if current_user["role"] == "student" and procedure["student_id"] != current_user["_id"]:
        await log_access(action="procedure_view", resource_type="procedure", resource_id=procedure_id, user=current_user, request=request, outcome="denied")
        raise HTTPException(status_code=403, detail="Access denied")
    elif current_user["role"] == "supervisor" and procedure["supervisor_id"] != current_user["_id"]:
        await log_access(action="procedure_view", resource_type="procedure", resource_id=procedure_id, user=current_user, request=request, outcome="denied")
        raise HTTPException(status_code=403, detail="Access denied")
    elif current_user["role"] == "nurse":
        # Nurses can view any case where Phase 1 has been submitted (draft is hidden).
        # They only see Phase 1 data on the UI (frontend-enforced).
        if procedure.get("status") == "draft":
            await log_access(action="procedure_view", resource_type="procedure", resource_id=procedure_id, user=current_user, request=request, outcome="denied")
            raise HTTPException(status_code=403, detail="Nurses cannot view draft procedures")
    
    procedure["_id"] = str(procedure["_id"])
    procedure["id"] = procedure["_id"]
    # Normalise instruments_autoclaved payload so "unmarked" always looks like None/null,
    # keeping the response contract identical to POST mark-instruments-autoclaved and
    # GET /procedures/nurse/scheduled-cases.
    procedure["instruments_autoclaved"] = _serialise_instruments_autoclaved(procedure.get("instruments_autoclaved"))
    await log_access(action="procedure_view", resource_type="procedure", resource_id=procedure_id, user=current_user, request=request, extra={"patient_name": procedure.get("patient_name")})
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

    # If any clinical-finding field was touched, regenerate the augmentation
    # checklist while PRESERVING completed-state on items whose title still
    # matches (so a supervisor's ticked items aren't lost on a benign edit).
    finding_keys = {"clinical_exam_per_site", "ridge_contour", "soft_tissue_thickness", "keratinized_mucosa", "arch", "missing_teeth"}
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


@api_router.get("/procedures/{procedure_id}/augmentation-checklist")
async def get_augmentation_checklist(procedure_id: str, current_user: dict = Depends(get_current_user)):
    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)}, {"_id": 0})
    if not proc:
        raise HTTPException(status_code=404, detail="Case not found")
    if not _is_case_stakeholder(proc, current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    return {
        "items": proc.get("augmentation_checklist") or [],
        "generated_at": proc.get("augmentation_checklist_generated_at") or "",
        "generated_by": proc.get("augmentation_checklist_generated_by") or "",
    }


@api_router.post("/procedures/{procedure_id}/augmentation-checklist/regenerate")
async def regenerate_augmentation_checklist(procedure_id: str, current_user: dict = Depends(get_current_user)):
    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)}, {"_id": 0})
    if not proc:
        raise HTTPException(status_code=404, detail="Case not found")
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
        )
    return {"ok": True, "status": "resolved"}




@api_router.delete("/procedures/{procedure_id}")
async def delete_procedure(procedure_id: str, current_user: dict = Depends(get_current_user)):
    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")

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
    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$set": {"archived": False}, "$unset": {"archived_by": "", "archived_at": ""}}
    )
    return {"message": "Procedure unarchived successfully"}


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
    
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
    
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=12*mm, rightMargin=12*mm, topMargin=8*mm, bottomMargin=8*mm)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name='TitleC', fontName='Helvetica-Bold', fontSize=13, textColor=colors.HexColor('#0D47A1'), alignment=1, spaceAfter=2))
    styles.add(ParagraphStyle(name='SubC', fontName='Helvetica', fontSize=7.5, textColor=colors.HexColor('#546E7A'), alignment=1, spaceAfter=4))
    styles.add(ParagraphStyle(name='H2', fontName='Helvetica-Bold', fontSize=8.5, textColor=colors.HexColor('#1565C0'), spaceBefore=4, spaceAfter=1))
    styles.add(ParagraphStyle(name='Body', fontName='Helvetica', fontSize=7, textColor=colors.HexColor('#263238'), leading=9, alignment=TA_JUSTIFY))
    styles.add(ParagraphStyle(name='BulletC', fontName='Helvetica', fontSize=7, textColor=colors.HexColor('#263238'), leading=9, leftIndent=10, bulletIndent=2))
    styles.add(ParagraphStyle(name='SigLabel', fontName='Helvetica-Bold', fontSize=7.5, textColor=colors.HexColor('#37474F')))
    styles.add(ParagraphStyle(name='SmallGrey', fontName='Helvetica-Oblique', fontSize=6.5, textColor=colors.HexColor('#78909C')))
    
    story = []
    
    # ── Header ──
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
        ["Site / Teeth:", ", ".join(procedure.get("edentulous_sites") or []) or procedure.get("edentulous_site") or "____________"],
        ["Loading Protocol:", ", ".join(procedure.get("loading_type") or []) or "____________________"],
        ["Treating Clinician:", procedure.get("student_name") or procedure.get("created_by_name") or "____________________"],
        ["Supervising Clinician:", procedure.get("supervisor_name") or "____________________"],
        ["Implant In-Charge:", procedure.get("implant_incharge_name") or "____________________"],
        ["Scheduled Date:", f"{procedure.get('procedure_date','__________')} at {procedure.get('procedure_time','______')}"],
    ]
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
        "$or": [
            {"patient_consent_form": {"$exists": False}},
            {"patient_consent_form": None},
        ],
        "archived": {"$ne": True},
    }
    cursor = db.procedures.find(query, {
        "_id": 1, "patient_name": 1, "patient_id": 1, "student_name": 1, "created_by_name": 1,
        "implant_procedure_type": 1, "status": 1, "created_at": 1, "supervisor_name": 1, "implant_incharge_name": 1,
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
    cursor = db.procedures.find(query, {
        "_id": 1, "patient_name": 1, "patient_id": 1, "student_name": 1, "created_by_name": 1,
        "implant_procedure_type": 1, "status": 1, "procedure_date": 1, "procedure_time": 1,
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
    if current_user.get("role") != "nurse":
        raise HTTPException(status_code=403, detail="Only nurses can mark instruments autoclaved")

    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")

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
    return {
        "cbct_file": unique_name,
        "cbct_original_name": file.filename,
        "cbct_content_type": file.content_type or "application/pdf",
    }


@api_router.post("/procedures/{procedure_id}/upload-cbct")
async def upload_cbct(
    procedure_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    
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

@api_router.get("/uploads/{filename}")
async def serve_upload(filename: str, token: Optional[str] = Query(None), current_user: dict = Depends(get_current_user_optional)):
    file_path = UPLOADS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Resolve user from header or query param token
    user = current_user
    if not user and token:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            uid = payload.get("user_id")
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
        elif user["role"] == "supervisor" and procedure.get("supervisor_id") == str(user["_id"]):
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
 footer {{ text-align:center; font-size:11px; opacity:0.6; padding:10px; }}
</style></head>
<body>
  <header>
    <h1>CBCT Files — {patient}</h1>
    <p>Tap any file to view · Link valid for 24 h from printing</p>
  </header>
  <div class='grid'>{items_html}</div>
  <footer>Implanr · Secure CBCT QR Viewer</footer>
</body></html>"""
    return HTMLResponse(html)


@app.get("/cbct/file/{token}/{filename}")
async def cbct_public_file(token: str, filename: str):
    """Stream a single CBCT file once token is verified. Auto-converts HEIC to JPEG
    for browsers that can't render HEIC natively (non-Safari on non-iOS)."""
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
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    content_type = (entry.get("content_type") or "application/octet-stream").lower()
    # HEIC → JPEG auto-conversion (non-Safari browsers can't render HEIC)
    if content_type in ("image/heic", "image/heif") or filename.lower().endswith((".heic", ".heif")):
        converted = _maybe_convert_heic_to_jpeg(path)
        if converted:
            return Response(content=converted, media_type="image/jpeg")
    with open(path, "rb") as fh:
        return Response(content=fh.read(), media_type=content_type)


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
    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)}, {"_id": 0, "student_id": 1})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")
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
    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)}, {"_id": 0, "student_id": 1})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")
    if current_user["role"] == "student" and proc.get("student_id") != current_user["_id"]:
        raise HTTPException(status_code=403, detail="You can only modify your own procedures")

    filepath = CHECKLIST_UPLOADS_DIR / filename
    if filepath.exists():
        filepath.unlink()

    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$pull": {"checklist_files": {"filename": filename, "item_id": item_id}}},
    )
    return {"message": "File deleted"}


@api_router.get("/checklist-files/{filename}")
async def serve_checklist_file(filename: str):
    """Serve a checklist file."""
    filepath = CHECKLIST_UPLOADS_DIR / filename
    if not filepath.exists():
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
    proc = await db.procedures.find_one({"_id": oid}, {"_id": 1, "student_id": 1, "status": 1, "supervisor_id": 1, "implant_incharge_id": 1})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")

    is_assigned_faculty = current_user["_id"] in (proc.get("supervisor_id"), proc.get("implant_incharge_id"))
    is_student_owner = current_user["role"] == "student" and proc.get("student_id") == current_user["_id"]

    if not is_assigned_faculty and not is_student_owner:
        raise HTTPException(status_code=403, detail="You do not have permission to modify this implant plan")

    # Students locked after Phase 2 approval; supervisors/incharge can edit at all stages
    if is_student_owner and not is_assigned_faculty:
        editable_statuses = {"draft", "pending_phase1", "phase1_approved", "pending_phase2"}
        if proc.get("status") not in editable_statuses:
            raise HTTPException(status_code=403, detail="Implant plan cannot be modified after Phase 2 approval")

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

    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$set": {
            "implant_plans": implant_docs,
            "number_of_implants": len(implant_docs),
            "implant_site": ", ".join(sorted(set(imp["position"] for imp in implant_docs))),
        }},
    )
    return {"message": "Implant plan saved", "count": len(implant_docs)}


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
    exists = await db.procedures.find_one({"_id": oid}, {"_id": 1})
    if not exists:
        raise HTTPException(status_code=404, detail="Procedure not found")
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
from emergentintegrations.llm.chat import LlmChat, UserMessage
import uuid

def _build_case_context(proc: dict) -> str:
    """Build a clinical case context string from procedure data."""
    parts = [f"Patient: {proc.get('patient_name','N/A')}, Age: {proc.get('age','N/A')}, Sex: {proc.get('sex','N/A')}"]
    if proc.get('profession'):
        parts.append(f"Profession: {proc.get('profession')}")
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
            parts.append(f"Insertion Torque Values: {', '.join([str(t) + ' Ncm' for t in torques])}")
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
            parts.append(f"Impression Type: {p4.get('impression_type')}")
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
    return os.environ.get("EMERGENT_LLM_KEY", "")


@api_router.post("/ai/explain-recommendation")
async def ai_explain_recommendation(request: Request, current_user: dict = Depends(get_current_user)):
    """Generate AI explanation for implant recommendation."""
    body = await request.json()
    procedure_id = body.get("procedure_id")
    implant_index = body.get("implant_index", 0)
    
    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)}, {"_id": 0})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")
    
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
Bone Type: {plan.get('bone_type','N/A')}{site_focus_block}{inst_block}

Provide a clinical explanation in professional scientific language. Do not mention any guideline names or references. Write as a professional clinical note."""

    chat = LlmChat(
        api_key=_get_llm_key(),
        session_id=f"explain-{procedure_id}-{implant_index}-{uuid.uuid4().hex[:8]}",
        system_message="You are an expert implant dentistry clinical advisor. Provide concise, evidence-based clinical explanations."
    ).with_model("openai", "gpt-5.2")
    
    response = await chat.send_message(UserMessage(text=prompt))
    
    # Store in procedure
    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$set": {f"ai_explanations.implant_{implant_index}": response}}
    )
    
    return {"explanation": response}


@api_router.post("/ai/explain-standalone")
async def ai_explain_standalone(request: Request, current_user: dict = Depends(get_current_user)):
    """Generate AI explanation for standalone implant selection (no procedure ID required)."""
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
- Make section headings **bold** and descriptions in regular type.
{case_type_instruction}

Case Data:
{context}

Current Phase: {current_phase} of 4
Case Type: {case_type.replace('_',' ').title()}

Generate the summary covering ONLY the following sections (as the case is currently at Phase {current_phase}):
{sections_to_include}

FORMAT INSTRUCTIONS:
- Use the section letters and titles as headings in **bold** (e.g., "**A. Patient Information & Chief Complaint**")
- Under each heading, write 2-4 sentences with specific clinical details from the case data in regular (non-bold) type
- Do NOT mention or cite any specific guidelines, organizations, textbooks, or journal references in the text
- Skip any section where no relevant data is available, but note it briefly as "Data pending for this phase"
- Make the summary clinically meaningful and specific to THIS patient — avoid boilerplate language"""

    chat = LlmChat(
        api_key=_get_llm_key(),
        session_id=f"summary-{procedure_id}-{uuid.uuid4().hex[:8]}",
        system_message="You are an expert implant dentistry clinical advisor and prosthodontist. You write case summaries using rigorous scientific clinical language grounded in established evidence-based implantology. Never cite, name, or reference any specific guidelines, organizations, textbooks, or journals in your output — present the knowledge as your own professional clinical assessment."
    ).with_model("openai", "gpt-5.2")

    response = await chat.send_message(UserMessage(text=prompt))

    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$set": {"ai_case_summary": response, "ai_case_summary_phase": current_phase}}
    )

    return {"summary": response}


@api_router.post("/ai/surgical-notes")
async def ai_surgical_notes(request: Request, current_user: dict = Depends(get_current_user)):
    """Generate AI surgical operative notes from drilling protocol data."""
    body = await request.json()
    procedure_id = body.get("procedure_id")
    
    proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)}, {"_id": 0})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")
    
    context = _build_case_context(proc)
    phase2 = proc.get("phase2_data") or {}
    
    # Get torque values from correct location
    torques = phase2.get("torque_values") or proc.get("torque_values") or []
    torque_str = ', '.join([str(t) + ' Ncm' for t in torques]) if torques else 'N/A'
    
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
    
    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$set": {"ai_surgical_notes": response}}
    )
    
    return {"notes": response}


class AIChatMessage(BaseModel):
    procedure_id: str
    message: str


@api_router.post("/ai/chat")
async def ai_chat(body: AIChatMessage, current_user: dict = Depends(get_current_user)):
    """Implanr AI chat — context-aware clinical assistant."""
    proc = await db.procedures.find_one({"_id": ObjectId(body.procedure_id)}, {"_id": 0})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedure not found")
    
    context = _build_case_context(proc)
    
    # Retrieve chat history
    chat_history = proc.get("ai_chat_history") or []
    
    system = f"""You are Implanr AI, an expert implant dentistry clinical assistant. You have access to the following patient case data:

{context}

Answer questions about this specific case using evidence-based implant dentistry knowledge. Be concise (2-4 sentences per answer). If asked about something outside your clinical expertise, say so clearly. Never fabricate clinical data — only reference what's in the case."""

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
        {"_id": ObjectId(procedure_id)}, {"_id": 0, "smart_planner_report": 1}
    )
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
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
    await log_access(
        action="pdf_export",
        resource_type="case_report",
        resource_id=procedure_id,
        user=current_user,
        request=request,
        extra={"patient_name": procedure.get("patient_name")},
    )

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
    pdf.set_font("Helvetica", "B", 24)
    pdf.set_text_color(0, 51, 153)
    pdf.cell(0, 20, "", ln=True)
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
                pos_label = ""
                if i < len(implant_plans):
                    pos_label = f" (Tooth {implant_plans[i].get('position', '')})"
                pdf.cell(0, 6, safe(f"  Implant {i+1}{pos_label}: {t} Ncm"), ln=True)
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
                pos_label = ""
                if i < len(implant_plans):
                    pos_label = f" (Tooth {implant_plans[i].get('position', '')})"
                pdf.cell(0, 6, safe(f"  Implant {i+1}{pos_label}: {tv} Ncm"), ln=True)
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
            add_field("Impression Type", imp_type)
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
    pdf.ln(15)

    # Signature lines
    for title, name in [
        ("PG Student", procedure.get("student_name", "")),
        ("Supervising Faculty", procedure.get("supervisor_name", "")),
        ("Implant Incharge", procedure.get("implant_incharge_name", "")),
    ]:
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(60, 6, safe(f"{title}:"), ln=False)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(0, 6, safe(name), ln=True)
        pdf.line(pdf.get_x(), pdf.get_y() + 12, pdf.get_x() + 60, pdf.get_y() + 12)
        pdf.ln(18)

    # Date
    pdf.set_font("Helvetica", "", 10)
    completed_str = ""
    if procedure.get("treatment_completed_at"):
        d = procedure["treatment_completed_at"]
        completed_str = d.strftime("%B %d, %Y") if isinstance(d, datetime) else str(d)
    pdf.cell(0, 6, safe(f"Date: {completed_str}"), ln=True)

    buf = io.BytesIO()
    pdf.output(buf)
    buf.seek(0)

    report_name = f"CaseReport_{case_id}_{procedure.get('patient_name', 'patient').replace(' ', '_')}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{report_name}"'},
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

    return {"message": "Photo deleted"}


@api_router.get("/procedures/{procedure_id}/photos")
async def get_procedure_photos(
    procedure_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get all photos for a procedure, grouped by step_id."""
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)}, {"_id": 0, "photos": 1})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")

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
    if not file_path.exists():
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
    
    # Check if user is the assigned supervisor or implant incharge for this procedure
    # Assignment-based check (not role-based) allows any faculty to approve when assigned
    is_supervisor = current_user["_id"] == procedure.get("supervisor_id")
    is_implant_incharge = current_user["_id"] == procedure.get("implant_incharge_id")
    
    # Check if the same person is BOTH supervisor AND implant incharge
    same_person_both_roles = procedure["supervisor_id"] == procedure["implant_incharge_id"]
    
    # Check if this case was created by the in-charge (self-approval workflow)
    is_incharge_self_created = procedure.get("created_by_role") == "implant_incharge" and procedure.get("created_by_id") == current_user["_id"]
    
    # Determine which phase we're in
    if procedure["status"] == "pending_phase1":
        # Phase 1: Pre-surgical approval
        if not (is_supervisor or is_implant_incharge or is_incharge_self_created):
            raise HTTPException(status_code=403, detail="Only assigned supervisor or implant incharge can approve")
        
        if action.action == "approve":
            # Mark this approver as having approved
            update_fields = {"updated_at": datetime.utcnow()}
            
            # In-Charge self-created case: auto-approve both roles at once
            if is_incharge_self_created:
                update_fields["supervisor_phase1_approved"] = True
                update_fields["supervisor_phase1_approved_at"] = datetime.utcnow()
                update_fields["implant_incharge_phase1_approved"] = True
                update_fields["implant_incharge_phase1_approved_at"] = datetime.utcnow()
                update_fields["status"] = "phase1_approved"
                update_fields["phase1_completed_at"] = datetime.utcnow()
                
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
                # Both approved - move to Phase 1 Approved
                update_fields["status"] = "phase1_approved"
                update_fields["phase1_completed_at"] = datetime.utcnow()
                
                # Notify student that Phase 1 is approved (if student exists)
                if procedure.get("student_id"):
                    await db.notifications.insert_one({
                        "user_id": procedure["student_id"],
                        "procedure_id": procedure_id,
                        "message": "Phase 1 (Diagnosis and Treatment Planning) approved! You can now submit Phase 2 (Implant Surgery) after completing the procedure.",
                        "type": "approved",
                        "read": False,
                        "created_at": datetime.utcnow()
                    })
                    await send_expo_push_notifications(
                        [procedure["student_id"]],
                        "Phase 1 Approved!",
                        "Diagnosis and Treatment Planning approved. You can now submit Phase 2.",
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
    )
    
    updated_procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    updated_procedure["_id"] = str(updated_procedure["_id"])
    updated_procedure["id"] = updated_procedure["_id"]
    return updated_procedure

# Phase 3 - Second Stage Surgical Protocol Submission
@api_router.post("/procedures/{procedure_id}/stage2/surgical")
async def submit_stage2_surgical(
    procedure_id: str,
    data: Stage2SurgicalSubmit,
    current_user: dict = Depends(get_current_user)
):
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
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
    current_user: dict = Depends(get_current_user)
):
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    if current_user["role"] == "student" and procedure.get("student_id") != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    is_student = current_user["role"] == "student" and procedure.get("student_id") == current_user["_id"]
    is_supervisor = current_user["role"] == "supervisor"
    is_incharge = current_user["role"] == "implant_incharge"
    is_creator = procedure.get("created_by_id") == current_user["_id"]
    if not (is_student or is_supervisor or is_incharge or is_creator):
        raise HTTPException(status_code=403, detail="You don't have permission")
    if procedure["status"] != "stage2_surgical_approved":
        raise HTTPException(status_code=400, detail="Phase 3 must be approved before starting Phase 4")

    # Save Phase 4 Step 1 data
    phase4_step1_data = {
        "final_prosthetic_plan": data.final_prosthetic_plan,
        "prosthetic_material": data.prosthetic_material,
        "custom_abutment": data.custom_abutment,
        "overdenture_attachment": data.overdenture_attachment,
        "payment_complete": data.payment_complete,
        "components_available": data.components_available,
        "impression_type": data.impression_type,
    }
    
    existing_checklist = procedure.get("checklist") or {}
    new_checklist = {**existing_checklist}
    if data.checklist:
        new_checklist["prosthetic_phase"] = data.checklist.model_dump()

    update_data = {
        "checklist": new_checklist,
        "phase4_step1_data": phase4_step1_data,
        "status": "pending_stage2_prosthetic",
        "stage2_prosthetic_submitted_at": datetime.utcnow(),
        "supervisor_stage2_prosthetic_approved": False,
        "implant_incharge_stage2_prosthetic_approved": False,
        "updated_at": datetime.utcnow()
    }
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
    if procedure["status"] != "pending_stage2_surgical":
        raise HTTPException(status_code=400, detail="Procedure is not pending Phase 3 approval")

    is_supervisor = current_user["_id"] == procedure.get("supervisor_id")
    is_implant_incharge = current_user["_id"] == procedure.get("implant_incharge_id")
    is_incharge_self_created = procedure.get("created_by_role") == "implant_incharge" and procedure.get("created_by_id") == current_user["_id"]
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
    if procedure["status"] != "pending_stage2_prosthetic":
        raise HTTPException(status_code=400, detail="Procedure is not pending Phase 4 approval")

    is_supervisor = current_user["_id"] == procedure.get("supervisor_id")
    is_implant_incharge = current_user["_id"] == procedure.get("implant_incharge_id")
    is_incharge_self_created = procedure.get("created_by_role") == "implant_incharge" and procedure.get("created_by_id") == current_user["_id"]
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
    is_student = current_user["role"] == "student" and procedure.get("student_id") == current_user["_id"]
    is_supervisor = current_user["role"] == "supervisor"
    is_incharge = current_user["role"] == "implant_incharge"
    is_creator = procedure.get("created_by_id") == current_user["_id"]
    if not (is_student or is_supervisor or is_incharge or is_creator):
        raise HTTPException(status_code=403, detail="You don't have permission")
    if procedure["status"] != "stage2_prosthetic_step1_approved":
        raise HTTPException(status_code=400, detail="Phase 4 Step 1 must be approved before submitting Step 2")

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
    if procedure["status"] != "pending_final_delivery":
        raise HTTPException(status_code=400, detail="Procedure is not pending Phase 4 Step 2 approval")

    is_supervisor = current_user["_id"] == procedure.get("supervisor_id")
    is_implant_incharge = current_user["_id"] == procedure.get("implant_incharge_id")
    is_incharge_self_created = procedure.get("created_by_role") == "implant_incharge" and procedure.get("created_by_id") == current_user["_id"]
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
            my_pending = await db.procedures.count_documents({"status": {"$in": pending_statuses}})
        result["pending_my_approval"] = my_pending

        # Student stats for incharge
        if role in ["implant_incharge", "administrator"]:
            student_pipeline = [
                {"$match": {"student_id": {"$exists": True}}},
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
                {"$match": {"supervisor_id": {"$exists": True, "$nin": [None, ""]}}},
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
    else:
        steps = _generate_pro_protocol(proto, diameter, length, bone)

    family = proto.get("protocol_family", "")
    if family == "conical_rbt":
        protocol_type = "Reduced Protocol (Conical RBT)" if bone == "D4" else ("Conventional Protocol (Conical RBT)" if bone in ("D1", "D2", "D3") else "Standard Protocol (Conical RBT)")
    elif family == "alpha_bio_spi":
        protocol_type = f"Dense Bone Protocol (Alpha-Bio SPI)" if bone in ("D1", "D2") else f"Under-Preparation Protocol (Alpha-Bio SPI)"
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
    else:
        protocol_type = "Reduced Protocol" if bone == "D4" else "Conventional Protocol"

    insertion_torque = "60 Ncm" if family in ("helix", "drive", "titamax") else ("25-35 Ncm" if family == "ankylos" else ("35-50 Ncm" if family == "mis_lance" else ("25-45 Ncm" if family in ("cowellmedi", "bredent_sky") else ("~40 Ncm" if family == "osstem" else ("≤90 Ncm" if family == "tsx" else ("35-45 Ncm" if family in ("conical_rbt", "alpha_bio_spi", "refirm") else "35-45 Ncm"))))))

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
    else:
        steps = _generate_pro_protocol(proto, diameter, length, bone)

    family = proto.get("protocol_family", "")
    if family == "conical_rbt":
        protocol_type = "Reduced Protocol (Conical RBT)" if bone == "D4" else ("Conventional Protocol (Conical RBT)" if bone in ("D1", "D2", "D3") else "Standard Protocol (Conical RBT)")
    elif family == "alpha_bio_spi":
        protocol_type = f"Dense Bone Protocol (Alpha-Bio SPI)" if bone in ("D1", "D2") else f"Under-Preparation Protocol (Alpha-Bio SPI)"
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
            # Use the backend public base (same host, /cbct/view/<token>)
            public_base = os.environ.get("CBCT_PUBLIC_BASE_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").strip() or ""
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
        "patient_name": t.get("patient_name"),
        "student_name": t.get("student_name"),
        "supervisor_name": t.get("supervisor_name"),
        "implant_procedure_type": t.get("implant_procedure_type"),
        "case_status": t.get("case_status"),
        "case_supervisor_id": t.get("case_supervisor_id"),
    }
    if out["anonymous"]:
        # Redact patient + sharer identity for non-moderators
        initials = "".join([p[0] for p in (t.get("patient_name") or "").split() if p])[:3].upper() or "A.P."
        out["patient_name_display"] = f"{initials} (anonymous)"
        out["shared_by_display"] = "Anonymous"
    else:
        out["patient_name_display"] = t.get("patient_name")
        out["shared_by_display"] = t.get("shared_by_name")
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
        return {"thread": _serialize_thread(existing, viewer_id=str(current_user.get("_id") or current_user.get("id"))), "existing": True}
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
        patient_label = "anonymous case" if payload.anonymous else (proc.get("patient_name") or "a case")
        await _forum_notify(mod_ids, "New Discussion Forum case", f"{current_user.get('name')} shared {patient_label} for discussion.", {"thread_id": tid})
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
            query["$or"] = [
                {"patient_name": {"$regex": qs, "$options": "i"}},
                {"student_name": {"$regex": qs, "$options": "i"}},
                {"supervisor_name": {"$regex": qs, "$options": "i"}},
                {"implant_procedure_type": {"$regex": qs, "$options": "i"}},
                {"tags": {"$regex": qs, "$options": "i"}},
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
    if not path.exists() or not path.is_file():
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
    if not path.exists():
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
    logging.info("Pre-surgery reminder scheduler started (interval=3600s).")

@app.on_event("startup")
async def ensure_access_log_indexes_on_start():
    """HIPAA: guarantee the access_logs collection has TTL + query indexes."""
    await _ensure_access_log_indexes()

@app.on_event("startup")
async def ensure_forum_indexes_on_start():
    """Forum: ensure thread/post indexes for listing + full-text search."""
    await _ensure_forum_indexes()

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

    # --- Seed users (force-sync authoritative user list on every startup) ---
    AUTHORITATIVE_USERS = [
        {"name": "Dr. Abhijit Patil", "username": "Abhijit.patil", "email": "Abhijit.patil@dental.edu", "password": "Admin@123", "role": "implant_incharge"},
        {"name": "Dr. Ajay Sabane", "username": "Ajay.sabane", "email": "Ajay.sabane@dental.edu", "password": "Admin@123", "role": "implant_incharge"},
        {"name": "Dr. Paresh Gandhi", "username": "Paresh.gandhi", "email": "Paresh.gandhi@dental.edu", "password": "Supervisor@123", "role": "supervisor"},
        {"name": "Dr. Rajshree Jadhav", "username": "Rajshree.jadhav", "email": "Rajshree.jadhav@dental.edu", "password": "Supervisor@123", "role": "supervisor"},
        {"name": "Dr. Vasantha N", "username": "Vasantha.n", "email": "Vasantha.n@dental.edu", "password": "Supervisor@123", "role": "supervisor"},
        {"name": "Dr. Rupali Patil", "username": "Rupali.patil", "email": "Rupali.patil@dental.edu", "password": "Supervisor@123", "role": "supervisor"},
        {"name": "Dr. Pankaj Kadam", "username": "Pankaj.kadam", "email": "Pankaj.kadam@dental.edu", "password": "Supervisor@123", "role": "supervisor"},
        {"name": "Dr. Gaurav Pandey", "username": "Gaurav.pandey", "email": "Gaurav.pandey@student.dental.edu", "password": "Student@123", "role": "student"},
        {"name": "Dr. Atharva Mahadik", "username": "Atharva.mahadik", "email": "Atharva.mahadik@student.dental.edu", "password": "Student@123", "role": "student"},
        {"name": "Dr. Anand Kurum", "username": "Anand.kurum", "email": "Anand.kurum@student.dental.edu", "password": "Student@123", "role": "student"},
        {"name": "Dr. Yashica Jain", "username": "Yashica.jain", "email": "Yashica.jain@student.dental.edu", "password": "Student@123", "role": "student"},
        {"name": "Dr. Vaibhav Deshpande", "username": "Vaibhav.deshpande", "email": "Vaibhav.deshpande@student.dental.edu", "password": "Student@123", "role": "student"},
        {"name": "Dr. Manasi Dhiren", "username": "Manasi.dhiren", "email": "Manasi.dhiren@student.dental.edu", "password": "Student@123", "role": "student"},
        {"name": "Dr. Renuka Bodakhe", "username": "Renuka.bodakhe", "email": "Renuka.bodakhe@student.dental.edu", "password": "Student@123", "role": "student"},
        {"name": "Dr. Shritej Shevakari", "username": "Shritej.shevakari", "email": "Shritej.shevakari@student.dental.edu", "password": "Student@123", "role": "student"},
        {"name": "Dr. Aaditya Patil", "username": "Aaditya.patil", "email": "Aaditya.patil@student.dental.edu", "password": "Student@123", "role": "student"},
        {"name": "Dr. Kunal Parikh", "username": "Kunal.parikh", "email": "Kunal.parikh@student.dental.edu", "password": "Student@123", "role": "student"},
        {"name": "Dr. Krishna Mehta", "username": "Krishna.mehta", "email": "Krishna.mehta@student.dental.edu", "password": "Student@123", "role": "student"},
        {"name": "Dr. Sakshi Lohade", "username": "Sakshi.lohade", "email": "Sakshi.lohade@student.dental.edu", "password": "Student@123", "role": "student"},
        {"name": "Nurse 1", "username": "Nurse.1", "email": "Nurse.1@dental.edu", "password": "Nurse@123", "role": "nurse"},
        {"name": "Nurse 2", "username": "Nurse.2", "email": "Nurse.2@dental.edu", "password": "Nurse@123", "role": "nurse"},
    ]

    # Upsert each authoritative user (update existing, insert missing, preserve profile_photo & password for existing users)
    new_count = 0
    for u in AUTHORITATIVE_USERS:
        existing = await db.users.find_one({"username": {"$regex": f"^{re.escape(u['username'])}$", "$options": "i"}})
        if existing:
            # Update name, email, role but keep existing password_hash (avoids slow bcrypt on every startup)
            await db.users.update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "name": u["name"],
                    "email": u["email"],
                    "username": u["username"],
                    "role": u["role"],
                }}
            )
        else:
            # New user — hash password and insert
            await db.users.insert_one({
                "name": u["name"],
                "username": u["username"],
                "email": u["email"],
                "password_hash": pwd_context.hash(u["password"]),
                "role": u["role"],
                "profile_photo": None,
            })
            new_count += 1
    logging.info(f"User sync complete: {len(AUTHORITATIVE_USERS)} checked, {new_count} new users added.")

    # --- Seed implant library (ALWAYS reseed from authoritative Excel on every startup) ---
    xlsx_path = ROOT_DIR / "implant_library_latest.xlsx"
    logging.info(f"Implant library seed: looking for XLSX at {xlsx_path} (exists={xlsx_path.exists()})")
    if xlsx_path.exists():
        try:
            df = pd.read_excel(xlsx_path, skiprows=0)
            df.columns = [c.strip() for c in df.columns]
            brand_col = [c for c in df.columns if "company" in c.lower() or "brand" in c.lower()][0]
            system_col = [c for c in df.columns if "system" in c.lower() or "name" in c.lower()][0]
            diam_col = [c for c in df.columns if "diameter" in c.lower()][0]
            len_col = [c for c in df.columns if "length" in c.lower()][0]

            records = []
            seen = set()
            excel_systems = set()
            for _, row in df.iterrows():
                try:
                    brand = str(row[brand_col]).strip()
                    system = str(row[system_col]).strip()
                    diameter = round(float(row[diam_col]), 2)
                    length = round(float(row[len_col]), 2)
                    if not brand or not system or brand == "nan" or system == "nan":
                        continue
                    brand = BRAND_NAME_CORRECTIONS.get(brand, brand)
                    excel_systems.add(f"{brand}|{system}")
                    key = (brand, system, diameter, length)
                    if key not in seen:
                        seen.add(key)
                        records.append({"brand": brand, "system": system, "diameter": diameter, "length": length})
                except (ValueError, TypeError):
                    continue

            old_count = await db.implant_library.count_documents({})
            if records:
                await db.implant_library.drop()
                await db.implant_library.insert_many(records)
                logging.info(
                    f"Implant library FORCE-RESEEDED: {len(records)} records, {len(excel_systems)} unique systems "
                    f"(replaced {old_count} old records)."
                )
            else:
                logging.error("Implant library seed: XLSX parsed but produced 0 records!")
        except Exception as e:
            logging.error(f"Implant library seed FAILED: {e}")
    else:
        logging.warning(f"XLSX file not found at {xlsx_path} — skipping implant seed.")
