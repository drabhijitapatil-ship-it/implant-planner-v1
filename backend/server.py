from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Response
from fastapi import status as http_status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from passlib.context import CryptContext
import jwt
from bson import ObjectId
import httpx

ROOT_DIR = Path(__file__).parent
UPLOADS_DIR = ROOT_DIR / 'uploads'
UPLOADS_DIR.mkdir(exist_ok=True)
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    import secrets
    SECRET_KEY = secrets.token_urlsafe(32)
    logging.warning("SECRET_KEY not set in environment, using generated key (not recommended for production)")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Health check endpoint for Kubernetes liveness/readiness probes
@app.get("/")
async def health_check():
    return {"status": "ok"}

# Helper functions
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

# Models
class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str  # student, supervisor, implant_incharge, administrator, nurse

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    profile_photo: Optional[str] = None

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
    student_name: str
    patient_name: str
    registration_number: str
    supervisor_id: str
    supervisor_name: str
    implant_incharge_id: str
    implant_incharge_name: str
    implant_site: str
    receipt_number: str
    amount_paid: float
    procedure_date: str
    procedure_time: str
    checklist: Optional[Checklist] = None
    implant_region: Optional[str] = ""
    implant_company: Optional[str] = ""
    bone_graft_specifications: Optional[str] = ""
    remark: Optional[str] = ""

class ProcedureUpdate(BaseModel):
    patient_name: Optional[str] = None
    registration_number: Optional[str] = None
    supervisor_id: Optional[str] = None
    supervisor_name: Optional[str] = None
    implant_incharge_id: Optional[str] = None
    implant_incharge_name: Optional[str] = None
    implant_site: Optional[str] = None
    receipt_number: Optional[str] = None
    amount_paid: Optional[float] = None
    procedure_date: Optional[str] = None
    procedure_time: Optional[str] = None
    checklist: Optional[Checklist] = None
    implant_region: Optional[str] = None
    implant_company: Optional[str] = None
    bone_graft_specifications: Optional[str] = None
    remark: Optional[str] = None

class ApprovalAction(BaseModel):
    action: str  # approve or reject
    rejection_reason: Optional[str] = None

class Phase2Submit(BaseModel):
    checklist_surgical: ChecklistSection
    remark: Optional[str] = None

class Stage2SurgicalSubmit(BaseModel):
    checklist: ChecklistSection
    remark: Optional[str] = None

class Stage2ProstheticSubmit(BaseModel):
    checklist: ChecklistSection
    remark: Optional[str] = None

class FinalCommentSubmit(BaseModel):
    comment: str

class NotificationResponse(BaseModel):
    id: str
    procedure_id: str
    message: str
    type: str
    read: bool
    created_at: str
    procedure_details: Optional[Dict[str, Any]] = None

class PushTokenRegister(BaseModel):
    push_token: str

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
async def login(user: UserLogin):
    # Find user
    db_user = await db.users.find_one({"email": user.email})
    if not db_user or not verify_password(user.password, db_user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Create token
    token = create_access_token({"user_id": str(db_user["_id"])})
    
    return {
        "token": token,
        "user": UserResponse(
            id=str(db_user["_id"]),
            name=db_user["name"],
            email=db_user["email"],
            role=db_user["role"],
            profile_photo=db_user.get("profile_photo")
        )
    }

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user["_id"],
        name=current_user["name"],
        email=current_user["email"],
        role=current_user["role"],
        profile_photo=current_user.get("profile_photo")
    )

# Profile Photo Update
class ProfilePhotoUpdate(BaseModel):
    profile_photo: str  # Base64 encoded image

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
    name: str
    email: EmailStr
    password: str
    role: str

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
    name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None

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

# Procedure Routes
@api_router.post("/procedures")
async def create_procedure(procedure: ProcedureCreate, current_user: dict = Depends(get_current_user)):
    # Only students can create procedures
    if current_user["role"] != "student":
        raise HTTPException(status_code=403, detail="Only students can create procedures")
    
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
            if procedure.procedure_time != "09:30":
                raise HTTPException(
                    status_code=400,
                    detail="Only 9:30 AM slot is available on Saturdays."
                )
        
        # 24-hour restriction for students only
        hours_until_procedure = (procedure_datetime - datetime.now()).total_seconds() / 3600
        if hours_until_procedure < 24:
            raise HTTPException(
                status_code=400, 
                detail="Students cannot schedule procedures less than 24 hours in advance. Please select a date at least 24 hours from now."
            )
    except ValueError:
        pass  # If date parsing fails, let it proceed (will be caught by validation)
    
    # Validate mandatory fields
    if not procedure.implant_region or procedure.implant_region.strip() == "":
        raise HTTPException(status_code=400, detail="Implant Region is a mandatory field")
    if not procedure.implant_company or procedure.implant_company.strip() == "":
        raise HTTPException(status_code=400, detail="Implant Company is a mandatory field")
    if not procedure.bone_graft_specifications or procedure.bone_graft_specifications.strip() == "":
        raise HTTPException(status_code=400, detail="Bone Graft/Membrane Specifications is a mandatory field")
    
    procedure_dict = procedure.model_dump()
    procedure_dict.update({
        "student_id": current_user["_id"],
        "status": "pending_phase1",  # Phase 1: Pre-surgical approval
        "current_phase": 1,
        "supervisor_phase1_approved": False,
        "implant_incharge_phase1_approved": False,
        "supervisor_phase2_approved": False,
        "implant_incharge_phase2_approved": False,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    })
    
    result = await db.procedures.insert_one(procedure_dict)
    procedure_id = str(result.inserted_id)
    
    # Create notification for supervisor that they have been assigned
    await db.notifications.insert_one({
        "user_id": procedure.supervisor_id,
        "procedure_id": procedure_id,
        "message": f"You have been assigned as Instructor for a new procedure by {procedure.student_name} for patient {procedure.patient_name}",
        "type": "assignment",
        "read": False,
        "created_at": datetime.utcnow()
    })
    
    # Create notifications for BOTH supervisor and implant incharge for approval
    await db.notifications.insert_one({
        "user_id": procedure.supervisor_id,
        "procedure_id": procedure_id,
        "message": f"Phase 1: New pre-surgical protocol submitted by {procedure.student_name} for patient {procedure.patient_name}",
        "type": "approval_request",
        "read": False,
        "created_at": datetime.utcnow()
    })
    
    await db.notifications.insert_one({
        "user_id": procedure.implant_incharge_id,
        "procedure_id": procedure_id,
        "message": f"Phase 1: New pre-surgical protocol submitted by {procedure.student_name} for patient {procedure.patient_name}",
        "type": "approval_request",
        "read": False,
        "created_at": datetime.utcnow()
    })
    
    # Send push notifications to supervisor and implant incharge
    push_recipients = list(set([procedure.supervisor_id, procedure.implant_incharge_id]))
    await send_expo_push_notifications(
        push_recipients,
        "New Procedure Requires Approval",
        f"Phase 1: {procedure.student_name} submitted a pre-surgical protocol for patient {procedure.patient_name}",
        {"procedure_id": procedure_id, "type": "approval_request"},
    )
    
    procedure_dict["_id"] = procedure_id
    procedure_dict["id"] = procedure_id
    return procedure_dict

@api_router.get("/procedures")
async def get_procedures(
    status: Optional[str] = None,
    date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    
    # Filter based on role
    if current_user["role"] == "student":
        query["student_id"] = current_user["_id"]
    elif current_user["role"] == "supervisor":
        query["supervisor_id"] = current_user["_id"]
    elif current_user["role"] == "nurse":
        # Nurses can only see fully approved/completed procedures
        query["status"] = {"$in": ["phase1_approved", "phase2_approved", "approved", "stage2_surgical_approved", "completed"]}
    # administrator and implant_incharge can see all
    
    if status and current_user["role"] != "nurse":
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
    
    procedures = await db.procedures.find(query).sort("procedure_date", 1).to_list(100)
    
    for proc in procedures:
        proc["_id"] = str(proc["_id"])
        proc["id"] = proc["_id"]
    
    return procedures

@api_router.get("/procedures/{procedure_id}")
async def get_procedure(procedure_id: str, current_user: dict = Depends(get_current_user)):
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    
    # Check access
    if current_user["role"] == "student" and procedure["student_id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    elif current_user["role"] == "supervisor" and procedure["supervisor_id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    elif current_user["role"] == "nurse":
        # Nurses can only view approved/completed procedures
        if procedure["status"] not in ["phase1_approved", "phase2_approved", "approved", "stage2_surgical_approved", "completed"]:
            raise HTTPException(status_code=403, detail="Nurses can only view approved procedures")
    
    procedure["_id"] = str(procedure["_id"])
    procedure["id"] = procedure["_id"]
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
        # Students can only edit their own pending procedures
        if procedure["student_id"] != current_user["_id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        if procedure["status"] != "pending_supervisor":
            raise HTTPException(status_code=403, detail="Cannot edit approved procedures")
    elif current_user["role"] == "supervisor":
        # Instructors can edit if they are the supervisor
        if procedure["supervisor_id"] != current_user["_id"]:
            raise HTTPException(status_code=403, detail="Access denied")
    # implant_incharge can edit all
    
    update_data = {k: v for k, v in procedure_update.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    await db.procedures.update_one(
        {"_id": ObjectId(procedure_id)},
        {"$set": update_data}
    )
    
    updated_procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    updated_procedure["_id"] = str(updated_procedure["_id"])
    updated_procedure["id"] = updated_procedure["_id"]
    return updated_procedure

@api_router.delete("/procedures/{procedure_id}")
async def delete_procedure(procedure_id: str, current_user: dict = Depends(get_current_user)):
    # Only implant_incharge can delete
    if current_user["role"] != "implant_incharge":
        raise HTTPException(status_code=403, detail="Only Implant Incharge can delete procedures")
    
    result = await db.procedures.delete_one({"_id": ObjectId(procedure_id)})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Procedure not found")
    
    # Delete related notifications
    await db.notifications.delete_many({"procedure_id": procedure_id})
    
    return {"message": "Procedure deleted successfully"}

# File Upload for CBCT
ALLOWED_EXTENSIONS = {'.pdf', '.png', '.jpg', '.jpeg', '.heif', '.heic'}
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB

@api_router.post("/procedures/{procedure_id}/upload-cbct")
async def upload_cbct(
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
async def serve_upload(filename: str, current_user: dict = Depends(get_current_user)):
    file_path = UPLOADS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Only supervisor, implant_incharge, administrator, and the procedure's student can view
    procedure = await db.procedures.find_one({"$or": [{"cbct_file": filename}, {"ios_file": filename}]})
    if procedure:
        allowed = False
        if current_user["role"] in ["administrator", "implant_incharge"]:
            allowed = True
        elif current_user["role"] == "supervisor" and procedure.get("supervisor_id") == current_user["_id"]:
            allowed = True
        elif current_user["role"] == "student" and procedure.get("student_id") == current_user["_id"]:
            allowed = True
        if not allowed:
            raise HTTPException(status_code=403, detail="Access denied")
    
    return FileResponse(file_path, filename=procedure.get("cbct_original_name", filename) if procedure else filename)

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
    
    # Determine which phase we're in
    if procedure["status"] == "pending_phase1":
        # Phase 1: Pre-surgical approval
        if not (is_supervisor or is_implant_incharge):
            raise HTTPException(status_code=403, detail="Only assigned supervisor or implant incharge can approve")
        
        if action.action == "approve":
            # Mark this approver as having approved
            update_fields = {"updated_at": datetime.utcnow()}
            
            # If same person is both supervisor and implant incharge, approve both roles at once
            if same_person_both_roles and (is_supervisor or is_implant_incharge):
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
                
                # Notify student that Phase 1 is approved
                await db.notifications.insert_one({
                    "user_id": procedure["student_id"],
                    "procedure_id": procedure_id,
                    "message": "Phase 1 (Pre-surgical) approved! You can now submit Phase 2 (Surgical) after completing the procedure.",
                    "type": "approved",
                    "read": False,
                    "created_at": datetime.utcnow()
                })
                # Push notify student
                await send_expo_push_notifications(
                    [procedure["student_id"]],
                    "Phase 1 Approved!",
                    "Pre-surgical protocol approved. You can now submit Phase 2.",
                    {"procedure_id": procedure_id, "type": "approved"},
                )
            else:
                # One approved, waiting for the other
                approver_name = current_user["name"]
                waiting_for = "implant incharge" if supervisor_approved else "supervisor"
                
                # Notify student of partial approval
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
            # Reject
            await db.procedures.update_one(
                {"_id": ObjectId(procedure_id)},
                {
                    "$set": {
                        "status": "rejected",
                        "rejection_reason": action.rejection_reason,
                        "rejected_by": current_user["name"],
                        "rejected_at": datetime.utcnow(),
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            
            # Notify student
            await db.notifications.insert_one({
                "user_id": procedure["student_id"],
                "procedure_id": procedure_id,
                "message": f"Phase 1: Procedure rejected by {current_user['name']}. Reason: {action.rejection_reason}",
                "type": "rejected",
                "read": False,
                "created_at": datetime.utcnow()
            })
            
            # Notify the other approver
            other_approver_id = procedure["implant_incharge_id"] if is_supervisor else procedure["supervisor_id"]
            await db.notifications.insert_one({
                "user_id": other_approver_id,
                "procedure_id": procedure_id,
                "message": f"Phase 1: Procedure for {procedure['patient_name']} was rejected by {current_user['name']}",
                "type": "rejected",
                "read": False,
                "created_at": datetime.utcnow()
            })
    
    elif procedure["status"] == "pending_phase2":
        # Phase 2: Surgical protocol approval
        if not (is_supervisor or is_implant_incharge):
            raise HTTPException(status_code=403, detail="Only assigned supervisor or implant incharge can approve")
        
        if action.action == "approve":
            # Mark this approver as having approved Phase 2
            update_fields = {"updated_at": datetime.utcnow()}
            
            # If same person is both supervisor and implant incharge, approve both roles at once
            if same_person_both_roles and (is_supervisor or is_implant_incharge):
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
            await db.procedures.update_one(
                {"_id": ObjectId(procedure_id)},
                {
                    "$set": {
                        "status": "rejected",
                        "rejection_reason": action.rejection_reason,
                        "rejected_by": current_user["name"],
                        "rejected_at": datetime.utcnow(),
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            
            # Notify student
            await db.notifications.insert_one({
                "user_id": procedure["student_id"],
                "procedure_id": procedure_id,
                "message": f"Phase 2: Procedure rejected by {current_user['name']}. Reason: {action.rejection_reason}",
                "type": "rejected",
                "read": False,
                "created_at": datetime.utcnow()
            })
            
            # Notify the other approver
            other_approver_id = procedure["implant_incharge_id"] if is_supervisor else procedure["supervisor_id"]
            await db.notifications.insert_one({
                "user_id": other_approver_id,
                "procedure_id": procedure_id,
                "message": f"Phase 2: Procedure for {procedure['patient_name']} was rejected by {current_user['name']}",
                "type": "rejected",
                "read": False,
                "created_at": datetime.utcnow()
            })
    else:
        raise HTTPException(status_code=400, detail="Procedure cannot be approved in current status")
    
    updated_procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    updated_procedure["_id"] = str(updated_procedure["_id"])
    updated_procedure["id"] = updated_procedure["_id"]
    return updated_procedure

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
    
    # Check if user is the student who created this procedure
    if current_user["role"] != "student" or procedure["student_id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only the student who created this procedure can submit Phase 2")
    
    # Check if Phase 1 is approved
    if procedure["status"] != "phase1_approved":
        raise HTTPException(status_code=400, detail="Phase 1 must be approved before submitting Phase 2")
    
    # Build the update data - handle null checklist properly
    existing_checklist = procedure.get("checklist") or {}
    
    # Create the complete checklist with surgical data
    new_checklist = {
        **existing_checklist,
        "surgical": phase2_data.checklist_surgical.model_dump()
    }
    
    update_data = {
        "checklist": new_checklist,
        "status": "pending_phase2",
        "current_phase": 2,
        "phase2_submitted_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    if phase2_data.remark:
        update_data["phase2_remark"] = phase2_data.remark
    
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
    if current_user["role"] != "student" or procedure["student_id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only the student who created this procedure can submit")
    if procedure["status"] != "phase2_approved":
        raise HTTPException(status_code=400, detail="Phase 2 must be approved before starting Phase 3")

    existing_checklist = procedure.get("checklist") or {}
    new_checklist = {**existing_checklist, "second_stage": data.checklist.model_dump()}

    update_data = {
        "checklist": new_checklist,
        "status": "pending_stage2_surgical",
        "stage2_surgical_submitted_at": datetime.utcnow(),
        "supervisor_stage2_surgical_approved": False,
        "implant_incharge_stage2_surgical_approved": False,
        "updated_at": datetime.utcnow()
    }
    if data.remark:
        update_data["stage2_surgical_remark"] = data.remark

    await db.procedures.update_one({"_id": ObjectId(procedure_id)}, {"$set": update_data})

    # Notify approvers
    for uid in [procedure["supervisor_id"], procedure["implant_incharge_id"]]:
        await db.notifications.insert_one({
            "user_id": uid,
            "procedure_id": procedure_id,
            "message": f"Phase 3: Second Stage Surgical Protocol submitted by {procedure['student_name']} for patient {procedure['patient_name']}",
            "type": "approval_request",
            "read": False,
            "created_at": datetime.utcnow()
        })

    push_recipients = list(set([procedure["supervisor_id"], procedure["implant_incharge_id"]]))
    await send_expo_push_notifications(
        push_recipients,
        "Phase 3: Second Stage Surgical Protocol Requires Approval",
        f"{procedure['student_name']} submitted Phase 3 Second Stage Surgical Protocol for {procedure['patient_name']}",
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
    if current_user["role"] != "student" or procedure["student_id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only the student who created this procedure can submit")
    if procedure["status"] != "stage2_surgical_approved":
        raise HTTPException(status_code=400, detail="Phase 3 must be approved before starting Phase 4")

    existing_checklist = procedure.get("checklist") or {}
    new_checklist = {**existing_checklist, "prosthetic_phase": data.checklist.model_dump()}

    update_data = {
        "checklist": new_checklist,
        "status": "pending_stage2_prosthetic",
        "stage2_prosthetic_submitted_at": datetime.utcnow(),
        "supervisor_stage2_prosthetic_approved": False,
        "implant_incharge_stage2_prosthetic_approved": False,
        "updated_at": datetime.utcnow()
    }
    if data.remark:
        update_data["stage2_prosthetic_remark"] = data.remark

    await db.procedures.update_one({"_id": ObjectId(procedure_id)}, {"$set": update_data})

    for uid in [procedure["supervisor_id"], procedure["implant_incharge_id"]]:
        await db.notifications.insert_one({
            "user_id": uid,
            "procedure_id": procedure_id,
            "message": f"Phase 4: Prosthetic Protocol submitted by {procedure['student_name']} for patient {procedure['patient_name']}",
            "type": "approval_request",
            "read": False,
            "created_at": datetime.utcnow()
        })

    push_recipients = list(set([procedure["supervisor_id"], procedure["implant_incharge_id"]]))
    await send_expo_push_notifications(
        push_recipients,
        "Phase 4: Prosthetic Protocol Requires Approval",
        f"{procedure['student_name']} submitted Phase 4 Prosthetic Protocol for {procedure['patient_name']}",
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
    if not (is_supervisor or is_implant_incharge):
        raise HTTPException(status_code=403, detail="Only assigned supervisor or implant incharge can approve")

    same_person = procedure["supervisor_id"] == procedure["implant_incharge_id"]

    if action.action == "approve":
        update_fields = {"updated_at": datetime.utcnow()}

        if same_person:
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

        sup_ok = procedure.get("supervisor_stage2_surgical_approved", False) or is_supervisor or (same_person and is_implant_incharge)
        inc_ok = procedure.get("implant_incharge_stage2_surgical_approved", False) or is_implant_incharge or (same_person and is_supervisor)

        if sup_ok and inc_ok:
            update_fields["status"] = "stage2_surgical_approved"
            update_fields["stage2_surgical_completed_at"] = datetime.utcnow()
            await db.notifications.insert_one({
                "user_id": procedure["student_id"],
                "procedure_id": procedure_id,
                "message": "Phase 3 approved! You can now submit Phase 4 - Prosthetic Protocol.",
                "type": "approved",
                "read": False,
                "created_at": datetime.utcnow()
            })
            await send_expo_push_notifications(
                [procedure["student_id"]],
                "Phase 3 Approved!",
                "You can now submit Phase 4 - Prosthetic Protocol.",
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
        await db.procedures.update_one(
            {"_id": ObjectId(procedure_id)},
            {"$set": {
                "status": "stage2_surgical_rejected",
                "stage2_surgical_rejection_reason": action.rejection_reason,
                "stage2_surgical_rejected_by": current_user["name"],
                "stage2_surgical_rejected_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }}
        )
        await db.notifications.insert_one({
            "user_id": procedure["student_id"],
            "procedure_id": procedure_id,
            "message": f"Phase 3: Rejected by {current_user['name']}. Reason: {action.rejection_reason}",
            "type": "rejected",
            "read": False,
            "created_at": datetime.utcnow()
        })

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
    if not (is_supervisor or is_implant_incharge):
        raise HTTPException(status_code=403, detail="Only assigned supervisor or implant incharge can approve")

    same_person = procedure["supervisor_id"] == procedure["implant_incharge_id"]

    if action.action == "approve":
        update_fields = {"updated_at": datetime.utcnow()}

        if same_person:
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

        sup_ok = procedure.get("supervisor_stage2_prosthetic_approved", False) or is_supervisor or (same_person and is_implant_incharge)
        inc_ok = procedure.get("implant_incharge_stage2_prosthetic_approved", False) or is_implant_incharge or (same_person and is_supervisor)

        if sup_ok and inc_ok:
            update_fields["status"] = "completed"
            update_fields["stage2_prosthetic_completed_at"] = datetime.utcnow()
            update_fields["treatment_completed_at"] = datetime.utcnow()

            # Notify all parties
            await db.notifications.insert_one({
                "user_id": procedure["student_id"],
                "procedure_id": procedure_id,
                "message": f"Treatment for {procedure['patient_name']} is now complete! All protocols (Phase 1-4) have been approved.",
                "type": "approved",
                "read": False,
                "created_at": datetime.utcnow()
            })
            for uid in [procedure["supervisor_id"], procedure["implant_incharge_id"]]:
                await db.notifications.insert_one({
                    "user_id": uid,
                    "procedure_id": procedure_id,
                    "message": f"Treatment for {procedure['patient_name']} fully completed. All protocols approved.",
                    "type": "approved",
                    "read": False,
                    "created_at": datetime.utcnow()
                })
            push_all = list(set([procedure["student_id"], procedure["supervisor_id"], procedure["implant_incharge_id"]]))
            await send_expo_push_notifications(
                push_all,
                "Treatment Complete!",
                f"All protocols for {procedure['patient_name']} have been approved. Treatment is complete.",
                {"procedure_id": procedure_id, "type": "completed"},
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
        await db.procedures.update_one(
            {"_id": ObjectId(procedure_id)},
            {"$set": {
                "status": "stage2_prosthetic_rejected",
                "stage2_prosthetic_rejection_reason": action.rejection_reason,
                "stage2_prosthetic_rejected_by": current_user["name"],
                "stage2_prosthetic_rejected_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }}
        )
        await db.notifications.insert_one({
            "user_id": procedure["student_id"],
            "procedure_id": procedure_id,
            "message": f"Phase 4: Rejected by {current_user['name']}. Reason: {action.rejection_reason}",
            "type": "rejected",
            "read": False,
            "created_at": datetime.utcnow()
        })

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
    
    if current_user["role"] == "student":
        query["student_id"] = current_user["_id"]
    elif current_user["role"] == "supervisor":
        query["supervisor_id"] = current_user["_id"]
    
    total = await db.procedures.count_documents(query)
    pending = await db.procedures.count_documents({**query, "status": {"$in": ["pending_phase1", "pending_phase2", "pending_stage2_surgical", "pending_stage2_prosthetic"]}})
    approved = await db.procedures.count_documents({**query, "status": {"$in": ["phase1_approved", "phase2_approved", "stage2_surgical_approved", "completed"]}})
    rejected = await db.procedures.count_documents({**query, "status": {"$in": ["rejected", "stage2_surgical_rejected", "stage2_prosthetic_rejected"]}})
    
    return {
        "total": total,
        "pending": pending,
        "approved": approved,
        "rejected": rejected
    }


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
    },
    "Neodent|Drive GM NeoPorous": {
        "indication": "Indicated for Bone D3 and D4 and Immediate Placement.",
    },
    "Neodent|Helix GM Acqua": {
        "indication": "Indicated in D1, D2, D3, and D4 Bone Types and Immediate Placement.",
    },
    "Neodent|Helix GM Neoporous": {
        "indication": "Indicated in D1, D2, D3, and D4 Bone Types and Immediate Placement.",
    },
    "Neodent|Titamax GM NeoPorous": {
        "indication": "Indicated for Bone D1 and D2 and Bone Graft areas.",
    },
    "Noble Biocare|NobelActive NP": {
        "indication": "Only indicated for the replacement of teeth 41, 42, 31, 32, 12, and 22.",
        "restricted_teeth": ["41", "42", "31", "32", "12", "22"],
    },
    "Noble Biocare|NobelActive RP": {
        "indication": "Primary indications for D4 or an extraction socket.",
    },
    "Noble Biocare|NobelParallel RP": {
        "indication": "Universal use.",
    },
    "NeoBiotech|IS-III active": {
        "indication": "Indicated for Immediate placement and Soft Bone.",
    },
    "Osstem|TS III": {
        "indication": "Indicated for D1, D2, D3, and D4 Bone Types.",
    },
    "Osstem|TS IV": {
        "indication": "Indicated for D3 and D4 Bone Type. Indicated for Sinus Lift.",
    },
    "Osstem|SS III": {
        "indication": "Indicated for D3 and D4 Bone Type (Preferably Cancellous).",
    },
    "Osstem|MS": {
        "indication": "Indicated for teeth 31, 32, 33, 41, 42, 43.",
        "restricted_teeth": ["31", "32", "33", "41", "42", "43"],
    },
    "Osstem|ETIII NH": {
        "indication": "Hydroxyapatite Coated. Indicated for Enhanced Osseointegration and Fast Healing.",
    },
    "BioHorizons|Tapered Pro": {
        "indication": "Indicated for Immediate Placement and the esthetic zone. Laser Lock Collar surface for connective tissue attachment.",
    },
    "BioHorizons|Tapered IM": {
        "indication": "Indicated for Immediate Placement in the molar region.",
    },
    "BioHorizons|Tapered Short": {
        "indication": "Indicated for Bone height of 8, 9, 10 mm.",
    },
    "BioHorizons|Tapered Pro Conical RBT": {
        "indication": "Indicated for Immediate Placement and the esthetic zone. Laser Lock Collar surface for connective tissue attachment.",
    },
    "BioHorizons|Tapered Short Conical RBT": {
        "indication": "Indicated for Bone height of 8, 9, 10 mm.",
    },
    "Conelog|Progressive Line": {
        "indication": "Indicated for all bone types (D1–D4). Conical connection with platform switching.",
    },
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
        }
        if "restricted_teeth" in ind_data:
            entry["restricted_teeth"] = ind_data["restricted_teeth"]
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
        "allowedBone": ["D3", "D4"],
    },
}

PROCEDURE_LIST = list(PROCEDURE_BONE_COMPATIBILITY.keys())

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

    # Bone Height → Length range
    if bone_height >= 13:
        len_min, len_max = 11.5, 15.0
        length_label = "Long implant"
    elif bone_height >= 10:
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
        filtered.append(imp)
    all_matching = filtered

    # Group by system
    systems_map = {}
    for imp in all_matching:
        key = f"{imp['brand']}|{imp['system']}"
        if key not in systems_map:
            ind = IMPLANT_INDICATIONS.get(key, {})
            systems_map[key] = {
                "brand": imp["brand"],
                "system": imp["system"],
                "indication": ind.get("indication", ""),
                "implants": [],
            }
        systems_map[key]["implants"].append({
            "diameter": imp["diameter"],
            "length": imp["length"],
        })

    recommended_systems = list(systems_map.values())

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
            bone_type, procedure, tooth }
    """
    bone_width = float(body.get("bone_width", 0))
    bone_height = float(body.get("bone_height", 0))
    implant_diameter = float(body.get("implant_diameter", 0))
    implant_length = float(body.get("implant_length", 0))
    bone_type = body.get("bone_type", "")
    procedure = body.get("procedure", "")
    tooth = body.get("tooth", "")

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

    total = width_score + height_score + density_score + procedure_score + tooth_score

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
    if total >= 8:
        actions.append("Evaluate CBCT carefully")
    if total >= 12:
        actions.append("Consider bone graft")

    return {
        "factors": [
            {"factor": "Bone Width", "remaining": round(remaining_width, 1), "risk": _score_label(width_score), "score": width_score},
            {"factor": "Bone Height", "remaining": round(remaining_height, 1), "risk": _score_label(height_score), "score": height_score},
            {"factor": "Bone Density", "detail": bone_type, "risk": _score_label(density_score), "score": density_score},
            {"factor": "Procedure", "detail": procedure, "risk": _score_label(procedure_score), "score": procedure_score},
            {"factor": "Tooth Position", "detail": f"{tooth} ({region})", "risk": _score_label(tooth_score), "score": tooth_score},
        ],
        "total_score": total,
        "risk_level": risk_level,
        "color": color,
        "suggested_actions": actions,
    }

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

# Alias the "Conical RBT" full names to the same protocols
DRILLING_PROTOCOLS["BioHorizons|Tapered Pro Conical RBT"] = DRILLING_PROTOCOLS["BioHorizons|Tapered Pro"]
DRILLING_PROTOCOLS["BioHorizons|Tapered Short Conical RBT"] = DRILLING_PROTOCOLS["BioHorizons|Tapered Short"]

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

def _find_drill(drills, diameter):
    for d in drills:
        if d["diameter"] == diameter:
            return d
    return None

def _largest_drill_below(drills, max_dia):
    candidates = [d for d in drills if d["diameter"] <= max_dia]
    return candidates[-1] if candidates else None

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

    if "Short" in system and "Conelog" not in system:
        steps = _generate_short_protocol(proto, diameter, length, bone)
    elif "Progressive" in system or brand == "Conelog":
        steps = _generate_conelog_protocol(proto, diameter, length, bone)
    else:
        steps = _generate_pro_protocol(proto, diameter, length, bone)

    protocol_type = "Soft Bone Protocol" if ("Progressive" in system or brand == "Conelog") and bone in ("D3", "D4") else "Standard Protocol" if ("Progressive" in system or brand == "Conelog") else ("Reduced Protocol" if bone == "D4" else "Conventional Protocol")

    return {
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
            f"Target insertion torque: 35-45 Ncm",
        ],
    }

@api_router.get("/drilling-protocols/available")
async def get_available_protocols(current_user: dict = Depends(get_current_user)):
    """Return list of implant systems that have drilling protocols."""
    result = []
    for key, proto in DRILLING_PROTOCOLS.items():
        brand, system = key.split("|")
        result.append({
            "brand": brand,
            "system": system,
            "system_name": proto["system_name"],
            "lengths": proto["lengths"],
        })
    return result

@api_router.post("/drilling-protocols/export-pdf")
async def export_drilling_pdf(
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    """Generate a PDF of the drilling protocol."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from fastapi.responses import StreamingResponse
    import io

    brand = body.get("brand", "")
    system = body.get("system", "")
    diameter = float(body.get("diameter", 0))
    length = float(body.get("length", 0))
    bone = body.get("bone_density", "")
    tooth = body.get("tooth", "")

    if not all([brand, system, diameter, length, bone]):
        raise HTTPException(status_code=400, detail="All fields required")

    key = f"{brand}|{system}"
    proto = DRILLING_PROTOCOLS.get(key)
    if not proto:
        raise HTTPException(status_code=404, detail="No protocol available")

    if "Short" in system and "Conelog" not in system:
        steps = _generate_short_protocol(proto, diameter, length, bone)
    elif "Progressive" in system or brand == "Conelog":
        steps = _generate_conelog_protocol(proto, diameter, length, bone)
    else:
        steps = _generate_pro_protocol(proto, diameter, length, bone)

    protocol_type = "Soft Bone Protocol" if ("Progressive" in system or brand == "Conelog") and bone in ("D3", "D4") else "Standard Protocol" if ("Progressive" in system or brand == "Conelog") else ("Reduced Protocol" if bone == "D4" else "Conventional Protocol")
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20*mm, bottomMargin=15*mm,
                            leftMargin=15*mm, rightMargin=15*mm)
    styles = getSampleStyleSheet()
    elements = []

    # Title
    title_style = ParagraphStyle('title', parent=styles['Title'], fontSize=18,
                                  textColor=colors.HexColor('#1565C0'), spaceAfter=6)
    elements.append(Paragraph("Drilling Protocol – Surgical Reference", title_style))
    elements.append(Spacer(1, 4*mm))

    # Info table
    info_data = [
        ["Implant System:", proto["system_name"]],
        ["Implant Size:", f"{diameter} x {length} mm"],
        ["Bone Density:", bone],
        ["Protocol:", protocol_type],
    ]
    if tooth:
        info_data.insert(0, ["Tooth (FDI):", tooth])
    info_table = Table(info_data, colWidths=[45*mm, 120*mm])
    info_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#263238')),
        ('TEXTCOLOR', (1, 0), (1, -1), colors.HexColor('#1565C0')),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 8*mm))

    # Drilling sequence table
    elements.append(Paragraph("Drilling Sequence", ParagraphStyle('h2', parent=styles['Heading2'],
                               fontSize=14, textColor=colors.HexColor('#263238'))))
    elements.append(Spacer(1, 3*mm))

    header = ["Step", "Drill Type", "Code", "Diameter", "Depth", "RPM", "Irrigation"]
    table_data = [header]
    for s in steps:
        table_data.append([
            str(s["step"]),
            s["drill_type"],
            s["code"],
            f"{s['diameter']} mm",
            f"{s['depth']} mm",
            str(s["rpm"]),
            "Yes" if s["irrigation"] else "No",
        ])

    col_widths = [12*mm, 40*mm, 28*mm, 22*mm, 20*mm, 25*mm, 22*mm]
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

    # Footer
    elements.append(Spacer(1, 10*mm))
    elements.append(Paragraph("Generated by My Implant Planner",
                    ParagraphStyle('footer', parent=styles['Normal'], fontSize=8,
                                    textColor=colors.HexColor('#B0BEC5'), alignment=1)))

    doc.build(elements)
    buf.seek(0)
    filename = f"DrillingProtocol_{brand}_{diameter}x{length}_{bone}.pdf"
    return StreamingResponse(buf, media_type="application/pdf",
                              headers={"Content-Disposition": f"attachment; filename={filename}"})

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

@app.on_event("startup")
async def seed_on_startup():
    """Auto-seed users and implant library if collections are empty (for fresh deployments)."""
    import pandas as pd

    # --- Seed users ---
    user_count = await db.users.count_documents({})
    if user_count == 0:
        logging.info("No users found — seeding default users...")
        users_data = [
            {"name": "Dr. Abhijit Patil", "email": "abhijit.patil@dental.edu", "password": "Admin@123", "role": "implant_incharge"},
            {"name": "Dr. Ajay Sabane", "email": "ajay.sabane@dental.edu", "password": "Admin@123", "role": "administrator"},
            {"name": "Dr. Rajeshree Jadhav", "email": "rajeshree.jadhav@dental.edu", "password": "Supervisor@123", "role": "supervisor"},
            {"name": "Dr. Vasantha N", "email": "vasantha.n@dental.edu", "password": "Supervisor@123", "role": "supervisor"},
            {"name": "Dr. Rupali Patil", "email": "rupali.patil@dental.edu", "password": "Supervisor@123", "role": "supervisor"},
            {"name": "Dr. Pankaj Kadam", "email": "pankaj.kadam@dental.edu", "password": "Supervisor@123", "role": "supervisor"},
            {"name": "Dr. Gaurav Pandey", "email": "gaurav.pandey@student.dental.edu", "password": "Student@123", "role": "student"},
            {"name": "Dr. Anand Kurum", "email": "anand.kurum@student.dental.edu", "password": "Student@123", "role": "student"},
            {"name": "Dr. Manasi Dhiren", "email": "manasi.dhiren@student.dental.edu", "password": "Student@123", "role": "student"},
            {"name": "Dr. Atharva Mahadik", "email": "atharva.mahadik@student.dental.edu", "password": "Student@123", "role": "student"},
            {"name": "Dr. Vaibhav Deshpande", "email": "vaibhav.deshpande@student.dental.edu", "password": "Student@123", "role": "student"},
            {"name": "Dr. Yashica Jain", "email": "yashica.jain@student.dental.edu", "password": "Student@123", "role": "student"},
            {"name": "Dr. Renuka Bodakhe", "email": "renuka.bodakhe@student.dental.edu", "password": "Student@123", "role": "student"},
            {"name": "Dr. Shritej Sevakari", "email": "shritej.sevakari@student.dental.edu", "password": "Student@123", "role": "student"},
            {"name": "Dr. Aaditya Patil", "email": "aaditya.patil@student.dental.edu", "password": "Student@123", "role": "student"},
            {"name": "Dr. Kunal Parikh", "email": "kunal.parikh@student.dental.edu", "password": "Student@123", "role": "student"},
            {"name": "Dr. Krishana Mehta", "email": "krishana.mehta@student.dental.edu", "password": "Student@123", "role": "student"},
            {"name": "Dr. Sakshi Lohade", "email": "sakshi.lohade@student.dental.edu", "password": "Student@123", "role": "student"},
            {"name": "Nurse 1", "email": "nurse1@dental.edu", "password": "Nurse@123", "role": "nurse"},
            {"name": "Nurse 2", "email": "nurse2@dental.edu", "password": "Nurse@123", "role": "nurse"},
        ]
        docs = [
            {"name": u["name"], "email": u["email"], "password_hash": pwd_context.hash(u["password"]), "role": u["role"]}
            for u in users_data
        ]
        await db.users.insert_many(docs)
        logging.info(f"Seeded {len(docs)} users.")
    else:
        logging.info(f"Users collection has {user_count} documents — skipping seed.")

    # --- Seed implant library (always re-seed to ensure latest data) ---
    implant_count = await db.implant_library.count_documents({})
    xlsx_path = ROOT_DIR / "implant_library_latest.xlsx"
    if xlsx_path.exists():
        df = pd.read_excel(xlsx_path, skiprows=0)
        df.columns = [c.strip() for c in df.columns]
        brand_col = [c for c in df.columns if "company" in c.lower()][0]
        system_col = [c for c in df.columns if "system" in c.lower() or "name" in c.lower()][0]
        diam_col = [c for c in df.columns if "diameter" in c.lower()][0]
        len_col = [c for c in df.columns if "length" in c.lower()][0]

        records = []
        seen = set()
        for _, row in df.iterrows():
            try:
                brand = str(row[brand_col]).strip()
                system = str(row[system_col]).strip()
                diameter = round(float(row[diam_col]), 2)
                length = round(float(row[len_col]), 2)
                key = (brand, system, diameter, length)
                if key not in seen:
                    seen.add(key)
                    records.append({"brand": brand, "system": system, "diameter": diameter, "length": length})
            except (ValueError, TypeError):
                continue

        if len(records) != implant_count:
            logging.info(f"Implant library mismatch (DB: {implant_count}, XLSX: {len(records)}) — re-seeding...")
            await db.implant_library.drop()
            if records:
                await db.implant_library.insert_many(records)
            logging.info(f"Re-seeded {len(records)} implant records.")
        else:
            logging.info(f"Implant library has {implant_count} documents — up to date.")
    else:
        logging.warning(f"XLSX file not found at {xlsx_path} — skipping implant seed.")
