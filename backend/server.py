from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from passlib.context import CryptContext
import jwt
from bson import ObjectId

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

app = FastAPI()
api_router = APIRouter(prefix="/api")

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
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        user["_id"] = str(user["_id"])
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")

# Models
class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str  # student, instructor, implant_incharge

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str

class ChecklistItem(BaseModel):
    label: str
    value: Optional[bool] = None

class ChecklistSection(BaseModel):
    items: List[ChecklistItem]
    additional_fields: Optional[Dict[str, str]] = {}

class Checklist(BaseModel):
    pre_surgical: Optional[ChecklistSection] = None
    surgical: Optional[ChecklistSection] = None
    second_stage: Optional[ChecklistSection] = None
    prosthetic_phase: Optional[ChecklistSection] = None

class ProcedureCreate(BaseModel):
    student_name: str
    patient_name: str
    registration_number: str
    instructor_id: str
    instructor_name: str
    implant_incharge_id: str
    implant_incharge_name: str
    implant_site: str
    receipt_number: str
    amount_paid: float
    procedure_date: str
    procedure_time: str
    checklist: Optional[Checklist] = None
    implant_specifications: Optional[str] = ""
    bone_graft_specifications: Optional[str] = ""
    remark: Optional[str] = ""

class ProcedureUpdate(BaseModel):
    patient_name: Optional[str] = None
    registration_number: Optional[str] = None
    instructor_id: Optional[str] = None
    instructor_name: Optional[str] = None
    implant_incharge_id: Optional[str] = None
    implant_incharge_name: Optional[str] = None
    implant_site: Optional[str] = None
    receipt_number: Optional[str] = None
    amount_paid: Optional[float] = None
    procedure_date: Optional[str] = None
    procedure_time: Optional[str] = None
    checklist: Optional[Checklist] = None
    implant_specifications: Optional[str] = None
    bone_graft_specifications: Optional[str] = None
    remark: Optional[str] = None

class ApprovalAction(BaseModel):
    action: str  # approve or reject
    rejection_reason: Optional[str] = None

class NotificationResponse(BaseModel):
    id: str
    procedure_id: str
    message: str
    type: str
    read: bool
    created_at: str
    procedure_details: Optional[Dict[str, Any]] = None

# Auth Routes
@api_router.post("/auth/register", response_model=UserResponse)
async def register(user: UserRegister):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Validate role
    if user.role not in ["student", "instructor", "implant_incharge"]:
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
            role=db_user["role"]
        )
    }

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user["_id"],
        name=current_user["name"],
        email=current_user["email"],
        role=current_user["role"]
    )

# User Routes
@api_router.get("/users")
async def get_users(role: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if role:
        query["role"] = role
    
    users = await db.users.find(query, {"password_hash": 0}).to_list(1000)
    for user in users:
        user["_id"] = str(user["_id"])
        user["id"] = user["_id"]
    
    return users

# Procedure Routes
@api_router.post("/procedures")
async def create_procedure(procedure: ProcedureCreate, current_user: dict = Depends(get_current_user)):
    # Only students can create procedures
    if current_user["role"] != "student":
        raise HTTPException(status_code=403, detail="Only students can create procedures")
    
    procedure_dict = procedure.model_dump()
    procedure_dict.update({
        "student_id": current_user["_id"],
        "status": "pending_instructor",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    })
    
    result = await db.procedures.insert_one(procedure_dict)
    procedure_id = str(result.inserted_id)
    
    # Create notification for instructor
    await db.notifications.insert_one({
        "user_id": procedure.instructor_id,
        "procedure_id": procedure_id,
        "message": f"New procedure submitted by {procedure.student_name} for patient {procedure.patient_name}",
        "type": "approval_request",
        "read": False,
        "created_at": datetime.utcnow()
    })
    
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
    elif current_user["role"] == "instructor":
        query["instructor_id"] = current_user["_id"]
    # implant_incharge can see all
    
    if status:
        query["status"] = status
    
    if date:
        query["procedure_date"] = date
    
    procedures = await db.procedures.find(query).sort("procedure_date", 1).to_list(1000)
    
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
    elif current_user["role"] == "instructor" and procedure["instructor_id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    procedure["_id"] = str(procedure["_id"])
    procedure["id"] = procedure["_id"]
    return procedure

@api_router.put("/procedures/{procedure_id}")
async def update_procedure(
    procedure_id: str,
    procedure_update: ProcedureUpdate,
    current_user: dict = Depends(get_current_user)
):
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    
    # Check permissions
    if current_user["role"] == "student":
        # Students can only edit their own pending procedures
        if procedure["student_id"] != current_user["_id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        if procedure["status"] != "pending_instructor":
            raise HTTPException(status_code=403, detail="Cannot edit approved procedures")
    elif current_user["role"] == "instructor":
        # Instructors can edit if they are the instructor
        if procedure["instructor_id"] != current_user["_id"]:
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

# Approval Routes
@api_router.post("/procedures/{procedure_id}/approve")
async def approve_procedure(
    procedure_id: str,
    action: ApprovalAction,
    current_user: dict = Depends(get_current_user)
):
    procedure = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
    
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    
    # Determine who can approve
    if procedure["status"] == "pending_instructor":
        if current_user["role"] != "instructor" or procedure["instructor_id"] != current_user["_id"]:
            raise HTTPException(status_code=403, detail="Only assigned instructor can approve")
        
        if action.action == "approve":
            # Move to next approval stage
            await db.procedures.update_one(
                {"_id": ObjectId(procedure_id)},
                {
                    "$set": {
                        "status": "pending_implant_incharge",
                        "instructor_approved_at": datetime.utcnow(),
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            
            # Notify implant incharge
            await db.notifications.insert_one({
                "user_id": procedure["implant_incharge_id"],
                "procedure_id": procedure_id,
                "message": f"Procedure for {procedure['patient_name']} approved by instructor and awaiting your approval",
                "type": "approval_request",
                "read": False,
                "created_at": datetime.utcnow()
            })
            
            # Notify student
            await db.notifications.insert_one({
                "user_id": procedure["student_id"],
                "procedure_id": procedure_id,
                "message": f"Your procedure for {procedure['patient_name']} has been approved by instructor",
                "type": "approved",
                "read": False,
                "created_at": datetime.utcnow()
            })
        else:
            # Reject
            await db.procedures.update_one(
                {"_id": ObjectId(procedure_id)},
                {
                    "$set": {
                        "status": "rejected",
                        "rejection_reason": action.rejection_reason,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            
            # Notify student
            await db.notifications.insert_one({
                "user_id": procedure["student_id"],
                "procedure_id": procedure_id,
                "message": f"Your procedure for {procedure['patient_name']} was rejected by instructor",
                "type": "rejected",
                "read": False,
                "created_at": datetime.utcnow()
            })
    
    elif procedure["status"] == "pending_implant_incharge":
        if current_user["role"] != "implant_incharge":
            raise HTTPException(status_code=403, detail="Only Implant Incharge can approve at this stage")
        
        if action.action == "approve":
            # Final approval
            await db.procedures.update_one(
                {"_id": ObjectId(procedure_id)},
                {
                    "$set": {
                        "status": "approved",
                        "implant_incharge_approved_at": datetime.utcnow(),
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            
            # Notify student and instructor
            await db.notifications.insert_one({
                "user_id": procedure["student_id"],
                "procedure_id": procedure_id,
                "message": f"Your procedure for {procedure['patient_name']} has been fully approved!",
                "type": "approved",
                "read": False,
                "created_at": datetime.utcnow()
            })
            
            await db.notifications.insert_one({
                "user_id": procedure["instructor_id"],
                "procedure_id": procedure_id,
                "message": f"Procedure for {procedure['patient_name']} has been fully approved",
                "type": "approved",
                "read": False,
                "created_at": datetime.utcnow()
            })
        else:
            # Reject
            await db.procedures.update_one(
                {"_id": ObjectId(procedure_id)},
                {
                    "$set": {
                        "status": "rejected",
                        "rejection_reason": action.rejection_reason,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            
            # Notify student and instructor
            await db.notifications.insert_one({
                "user_id": procedure["student_id"],
                "procedure_id": procedure_id,
                "message": f"Your procedure for {procedure['patient_name']} was rejected by Implant Incharge",
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

# Notification Routes
@api_router.get("/notifications")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    notifications = await db.notifications.find(
        {"user_id": current_user["_id"]}
    ).sort("created_at", -1).to_list(100)
    
    result = []
    for notif in notifications:
        # Get procedure details
        procedure = await db.procedures.find_one({"_id": ObjectId(notif["procedure_id"])})
        
        notif["_id"] = str(notif["_id"])
        notif["id"] = notif["_id"]
        notif["created_at"] = notif["created_at"].isoformat()
        
        if procedure:
            notif["procedure_details"] = {
                "patient_name": procedure.get("patient_name"),
                "procedure_date": procedure.get("procedure_date"),
                "status": procedure.get("status")
            }
        
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
    elif current_user["role"] == "instructor":
        query["instructor_id"] = current_user["_id"]
    
    total = await db.procedures.count_documents(query)
    pending = await db.procedures.count_documents({**query, "status": {"$in": ["pending_instructor", "pending_implant_incharge"]}})
    approved = await db.procedures.count_documents({**query, "status": "approved"})
    rejected = await db.procedures.count_documents({**query, "status": "rejected"})
    
    return {
        "total": total,
        "pending": pending,
        "approved": approved,
        "rejected": rejected
    }

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
