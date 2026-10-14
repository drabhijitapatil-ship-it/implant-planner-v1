"""Research Module — FastAPI routes. Mounted from server.py via
`api_router.include_router(research_routes.build_router(db, get_current_user))`.

Collections: research_studies, research_enrolments (forms embedded),
research_patient_values (patient-level values, once per patient per
timepoint — D2), research_screening (manual exclusions / decisions).
"""
from __future__ import annotations

import csv
import io
import math
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import StreamingResponse

import research as R

FACULTY_ADMIN = ("administrator", "implant_incharge")
DATA_ROLES = ("pi", "co_investigator", "data_collector")
EXPORT_ROLES = ("pi", "guide", "statistician")


def _oid(s: str) -> ObjectId:
    try:
        return ObjectId(s)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")


def _pub(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


def build_router(db, get_current_user, user_from_token=None):
    router = APIRouter(prefix="/research", tags=["research"])

    # ------------------------------------------------------------ helpers
    def _deny_nurse(user):
        if user.get("role") == "nurse":
            raise HTTPException(status_code=403, detail="Research module is not available for the nurse role.")

    def _member_roles(study: dict, user: dict) -> set[str]:
        roles = {m["role"] for m in study.get("members", []) if m.get("user_id") == user["_id"]}
        if study.get("pi_user_id") == user["_id"]:
            roles.add("pi")
        if user.get("role") in FACULTY_ADMIN:
            roles.add("admin")
        return roles

    def _can_view(study, user):
        return bool(_member_roles(study, user))

    def _require(study, user, allowed: tuple, msg: str):
        roles = _member_roles(study, user)
        if "admin" in roles or roles & set(allowed):
            return roles
        raise HTTPException(status_code=403, detail=msg)

    async def _get_study(study_id: str, user: dict) -> dict:
        st = await db.research_studies.find_one({"_id": _oid(study_id)})
        if not st:
            raise HTTPException(status_code=404, detail="Study not found")
        if not _can_view(st, user):
            raise HTTPException(status_code=403, detail="You are not a member of this study.")
        return st

    def _case_scope(user: dict) -> dict:
        role = user.get("role")
        if role in FACULTY_ADMIN:
            return {}
        if role == "student":
            return {"$or": [{"student_id": user["_id"]}, {"previous_students": user["_id"]}, {"assistant_id": user["_id"]}]}
        if role == "supervisor":
            return {"$or": [{"supervisor_id": user["_id"]}, {"created_by_id": user["_id"]}]}
        return {"_id": None}

    def _audit(study_update: dict, user: dict, action: str, detail: str = "", reason: str = ""):
        study_update.setdefault("$push", {})["audit_log"] = {
            "action": action, "detail": detail[:400], "reason": reason[:400],
            "by_id": user["_id"], "by_name": user.get("name", ""), "by_role": user.get("role", ""), "at": R.now_iso(),
        }

    def _study_summary(st: dict, counts: dict) -> dict:
        return {
            "id": str(st["_id"]), "code": st.get("code"), "title": st.get("title"), "status": st.get("status"),
            "study_type": st.get("study_type"), "primary_unit": st.get("primary_unit"), "target_n": st.get("target_n"),
            "pi_name": st.get("pi_name"), "is_dissertation": st.get("is_dissertation", False),
            "enrolled": counts.get("enrolled", 0), "overdue": counts.get("overdue", 0), "due_now": counts.get("in_window", 0),
            "member_count": len(st.get("members", [])), "updated_at": st.get("updated_at"), "created_at": st.get("created_at"),
            "research_question": st.get("research_question", ""),
        }

    async def _form_counts(study_ids: list) -> dict:
        out: dict = {str(s): {"enrolled": 0, "overdue": 0, "in_window": 0} for s in study_ids}
        studies = {str(s["_id"]): s async for s in db.research_studies.find({"_id": {"$in": study_ids}}, {"timepoints": 1})}
        async for e in db.research_enrolments.find({"study_id": {"$in": [str(s) for s in study_ids]}}):
            c = out.setdefault(e["study_id"], {"enrolled": 0, "overdue": 0, "in_window": 0})
            if e.get("status") in ("enrolled", "active", "completed"):
                c["enrolled"] += 1
            if e.get("status") not in ("enrolled", "active"):
                continue
            tps = {t["key"]: t for t in (studies.get(e["study_id"]) or {}).get("timepoints", [])}
            for f in e.get("forms", []):
                stt = R.form_status(f, tps.get(f["timepoint_key"], {}))
                if stt in ("overdue", "missed"):
                    c["overdue"] += 1
                elif stt == "in_window":
                    c["in_window"] += 1
        return out

    def _sanitize_study_fields(body: dict, st: Optional[dict] = None) -> dict:
        s = R._s
        out: dict = {}
        if "code" in body:
            code = s(body.get("code"), 20).upper().replace(" ", "-")
            if not R.CODE_RE.match(code):
                raise HTTPException(status_code=400, detail="Code must be 3–20 chars: A–Z, 0–9, hyphen (e.g. CBL-IMM-MXA)")
            out["code"] = code
        for k, n in (("title", 200), ("research_question", 2000), ("iec_ref", 80), ("iec_approval_date", 10), ("ctri_number", 40),
                     ("consent_form_version", 40), ("planned_start", 10), ("planned_end", 10), ("notes", 4000)):
            if k in body:
                out[k] = s(body.get(k), n)
        if "study_type" in body:
            out["study_type"] = body["study_type"] if body["study_type"] in R.STUDY_TYPES else "prospective_cohort"
        if "primary_units" in body and isinstance(body["primary_units"], list):
            units = []
            for x in body["primary_units"]:
                x = s(x, 30).lower()
                if x and x not in units:
                    units.append(x)
            out["primary_units"] = units[:5]
            out["primary_unit"] = (units[0] if units and units[0] in R.LEVELS else next((x for x in units if x in R.LEVELS), "implant"))
        elif "primary_unit" in body:
            out["primary_unit"] = body["primary_unit"] if body["primary_unit"] in R.LEVELS else "implant"
            out["primary_units"] = [out["primary_unit"]]
        if "target_n" in body:
            out["target_n"] = max(1, int(R._num(body.get("target_n")) or 1))
        if "is_dissertation" in body:
            out["is_dissertation"] = bool(body["is_dissertation"])
        for k in ("eligibility", "variables", "timepoints"):
            if k in body and isinstance(body[k], list):
                fn = {"eligibility": R.sanitize_rule, "variables": R.sanitize_variable, "timepoints": R.sanitize_timepoint}[k]
                out[k] = [fn(x) for x in body[k] if isinstance(x, dict)]
        if "variables" in out:
            out["variables"] = [v for v in out["variables"] if v["key"]]
        if "timepoints" in out:
            out["timepoints"] = [t for t in out["timepoints"] if t["key"]]
        return out

    def _apply_template(tpl: dict) -> dict:
        return {
            "title": tpl["name"], "code": tpl["code_suggestion"], "study_type": tpl["study_type"],
            "primary_unit": tpl["primary_unit"], "target_n": tpl.get("target_n", 30),
            "research_question": tpl["research_question"],
            "eligibility": [R.sanitize_rule(r) for r in tpl["eligibility"]],
            "variables": [R.sanitize_variable(v) for v in tpl["variables"]],
            "timepoints": [R.sanitize_timepoint(t) for t in tpl["timepoints"]],
            "template_id": tpl["id"],
        }

    # ------------------------------------------------------------ registry / templates
    @router.get("/registry")
    async def registry(user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        return {"fields": R.registry_public(), "operators": list(R._OP_TXT.keys()), "anchors": R.ANCHORS,
                "data_types": R.DATA_TYPES, "levels": R.LEVELS, "study_types": R.STUDY_TYPES, "member_roles": R.MEMBER_ROLES}

    @router.get("/templates")
    async def templates(user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        return [{"id": t["id"], "name": t["name"], "description": t["description"], "code_suggestion": t["code_suggestion"],
                 "study_type": t["study_type"], "primary_unit": t["primary_unit"],
                 "variable_count": len(t["variables"]), "timepoint_count": len(t["timepoints"])} for t in R.TEMPLATES]

    # ------------------------------------------------------------ studies
    @router.get("/studies")
    async def list_studies(user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        q: dict = {} if user["role"] in FACULTY_ADMIN else {"$or": [{"pi_user_id": user["_id"]}, {"members.user_id": user["_id"]}]}
        studies = [s async for s in db.research_studies.find(q).sort("updated_at", -1)]
        counts = await _form_counts([s["_id"] for s in studies])
        return [_study_summary(s, counts.get(str(s["_id"]), {})) for s in studies]

    @router.post("/studies")
    async def create_study(body: dict, user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        base: dict = {"eligibility": [], "variables": [], "timepoints": [], "study_type": "prospective_cohort",
                      "primary_unit": "implant", "target_n": 30, "research_question": "", "title": "", "code": ""}
        if body.get("template_id"):
            tpl = next((t for t in R.TEMPLATES if t["id"] == body["template_id"]), None)
            if not tpl:
                raise HTTPException(status_code=400, detail="Unknown template")
            base.update(_apply_template(tpl))
        if body.get("clone_from"):
            src = await _get_study(body["clone_from"], user)
            base.update({k: src.get(k) for k in ("study_type", "primary_unit", "target_n", "research_question", "eligibility", "variables", "timepoints")})
            base["title"] = f"Copy of {src.get('title', '')}"[:200]
        upd = _sanitize_study_fields(body)
        if body.get("template_id") or body.get("clone_from"):
            upd = {k: v for k, v in upd.items() if v not in ("", None)}  # keep template text when client sends blanks
        base.update(upd)
        if not base.get("title"):
            raise HTTPException(status_code=400, detail="Title is required")
        if not base.get("code"):
            raise HTTPException(status_code=400, detail="Study code is required")
        if await db.research_studies.find_one({"code": base["code"]}):
            raise HTTPException(status_code=400, detail=f"Study code {base['code']} already exists")
        now = R.now_iso()
        base.setdefault("primary_units", [base.get("primary_unit", "implant")])
        doc = {**base, "status": "draft", "protocol_version": "1.0",
               "created_by_role": user.get("role", ""),
               "guide_review": {"status": "auto_approved" if user.get("role") != "student" else "not_submitted", "history": []},
               "pi_user_id": user["_id"], "pi_name": user.get("name", ""),
               "members": [{"user_id": user["_id"], "name": user.get("name", ""), "role": "pi", "added_at": now}],
               "created_by_id": user["_id"], "created_by_name": user.get("name", ""), "created_at": now, "updated_at": now,
               "audit_log": [{"action": "created", "detail": base.get("template_id") or "blank", "by_id": user["_id"],
                              "by_name": user.get("name", ""), "by_role": user.get("role", ""), "at": now}]}
        res = await db.research_studies.insert_one(doc)
        doc["_id"] = res.inserted_id
        return _pub(doc)

    @router.get("/studies/{study_id}")
    async def get_study(study_id: str, user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        st = await _get_study(study_id, user)
        st["my_roles"] = sorted(_member_roles(st, user))
        st["needs_guide_approval"] = R.needs_guide_approval(st)
        st["can_view_iec_letter"] = _can_see_iec_letter(st, user)
        if not st["can_view_iec_letter"]:
            st["iec_letter"] = {"present": True} if st.get("iec_letter") else None
        st["activation_checklist"] = R.activation_checklist(st)
        st["protocol_errors"] = R.validate_protocol(st)
        counts = await _form_counts([st["_id"]])
        st["counts"] = counts.get(study_id, {})
        return _pub(st)

    @router.put("/studies/{study_id}")
    async def update_study(study_id: str, body: dict, user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        st = await _get_study(study_id, user)
        _require(st, user, ("pi",), "Only the PI can edit the protocol.")
        if st.get("status") in ("data_locked", "archived"):
            raise HTTPException(status_code=400, detail="Study is locked/archived — protocol cannot be edited.")
        upd = _sanitize_study_fields(body, st)
        if "code" in upd and upd["code"] != st.get("code"):
            if st.get("status") != "draft":
                raise HTTPException(status_code=400, detail="Code cannot change after activation.")
            if await db.research_studies.find_one({"code": upd["code"], "_id": {"$ne": st["_id"]}}):
                raise HTTPException(status_code=400, detail="Study code already exists")
        if st.get("status") != "draft":  # BR-06 / BR-17: keys immutable, nothing removed once active
            for coll in ("variables", "timepoints"):
                if coll in upd:
                    old_keys = {x["key"] for x in st.get(coll, [])}
                    new_keys = {x["key"] for x in upd[coll]}
                    missing = old_keys - new_keys
                    if missing:
                        raise HTTPException(status_code=400, detail=f"Active protocol: cannot remove {coll} {', '.join(sorted(missing))}. Add new ones instead.")
        update: dict = {"$set": {**upd, "updated_at": R.now_iso()}}
        changed = ", ".join(sorted(upd.keys()))
        gr = st.get("guide_review") or {}
        if R.needs_guide_approval(st) and st.get("status") == "draft" and gr.get("status") in ("pending", "approved") \
                and any(k in upd and upd[k] != st.get(k) for k in R.PROTOCOL_KEYS):
            update["$set"]["guide_review"] = {**gr, "status": "not_submitted", "reset_reason": f"Protocol edited ({changed})", "reset_at": R.now_iso(),
                                              "history": (gr.get("history") or []) + [{"action": "reset_after_edit", "by": user.get("name", ""), "at": R.now_iso(), "detail": changed}]}
            update["$set"]["guide_approved_at"] = None
        _audit(update, user, "protocol_updated", changed)
        await db.research_studies.update_one({"_id": st["_id"]}, update)
        if st.get("status") != "draft" and "timepoints" in upd:
            await _reschedule_all(st["_id"])
        return await get_study(study_id, user)

    @router.post("/studies/{study_id}/members")
    async def set_members(study_id: str, body: dict, user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        st = await _get_study(study_id, user)
        _require(st, user, ("pi",), "Only the PI (or admin) can manage the team.")
        members, seen = [], set()
        for m in body.get("members") or []:
            uid, role = str(m.get("user_id") or ""), m.get("role")
            if not uid or role not in R.MEMBER_ROLES or (uid, role) in seen:
                continue
            u = await db.users.find_one({"_id": _oid(uid)}, {"name": 1, "role": 1})
            if not u or u.get("role") == "nurse":
                continue
            if role == "guide" and u.get("role") not in ("supervisor", "implant_incharge", "administrator"):
                raise HTTPException(status_code=400, detail=f"{u.get('name')} cannot be a guide — choose a Supervisor or Implant In-charge.")
            seen.add((uid, role))
            members.append({"user_id": uid, "name": u.get("name", ""), "user_role": u.get("role"), "role": role, "added_at": R.now_iso()})
        if not any(m["user_id"] == st["pi_user_id"] and m["role"] == "pi" for m in members):
            members.insert(0, {"user_id": st["pi_user_id"], "name": st.get("pi_name", ""), "role": "pi", "added_at": R.now_iso()})
        guide = next((m for m in members if m["role"] == "guide"), None)
        update = {"$set": {"members": members, "guide_user_id": guide["user_id"] if guide else None,
                           "guide_name": guide["name"] if guide else None, "updated_at": R.now_iso()}}
        gr = st.get("guide_review") or {}
        if R.needs_guide_approval(st) and (guide["user_id"] if guide else None) != st.get("guide_user_id") and gr.get("status") in ("pending", "approved", "changes_requested"):
            update["$set"]["guide_review"] = {**gr, "status": "not_submitted", "history": (gr.get("history") or []) + [{"action": "guide_changed", "by": user.get("name", ""), "at": R.now_iso()}]}
            update["$set"]["guide_approved_at"] = None
        _audit(update, user, "members_updated", f"{len(members)} members")
        await db.research_studies.update_one({"_id": st["_id"]}, update)
        return await get_study(study_id, user)

    @router.get("/users")
    async def pickable_users(user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        out = []
        async for u in db.users.find({"role": {"$ne": "nurse"}}, {"name": 1, "role": 1}).sort("name", 1):
            out.append({"id": str(u["_id"]), "name": u.get("name", ""), "role": u.get("role", "")})
        return out

    async def _notify(uid: str, message: str, study_id: str):
        if not uid:
            return
        await db.notifications.insert_one({"user_id": uid, "message": message[:200], "type": "research_study", "read": False,
                                           "created_at": datetime.now(timezone.utc), "research_study_id": study_id})

    @router.post("/studies/{study_id}/submit-to-guide")
    async def submit_to_guide(study_id: str, user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        st = await _get_study(study_id, user)
        _require(st, user, ("pi",), "Only the PI can submit the protocol to the guide.")
        if not R.needs_guide_approval(st):
            raise HTTPException(status_code=400, detail="Faculty-created studies do not need guide approval.")
        if not st.get("guide_user_id"):
            raise HTTPException(status_code=400, detail="Choose a guide in Team first.")
        if st.get("status") != "draft":
            raise HTTPException(status_code=400, detail="Only draft protocols are submitted for guide approval.")
        pending = [i["label"] for i in R.activation_checklist(st) if not i["ok"] and i["label"] != "Guide approval recorded"]
        if pending:
            raise HTTPException(status_code=400, detail="Complete the checklist first: " + "; ".join(pending))
        gr = st.get("guide_review") or {}
        now = R.now_iso()
        update = {"$set": {"guide_review": {**gr, "status": "pending", "submitted_at": now, "submitted_by": user.get("name", ""), "comments": gr.get("comments", ""),
                                            "history": (gr.get("history") or []) + [{"action": "submitted", "by": user.get("name", ""), "at": now}]}, "updated_at": now}}
        _audit(update, user, "submitted_to_guide", st.get("guide_name", ""))
        await db.research_studies.update_one({"_id": st["_id"]}, update)
        await _notify(st["guide_user_id"], f"Research protocol {st['code']} ({st['title'][:40]}) submitted for your approval by {user.get('name', '')}", study_id)
        return await get_study(study_id, user)

    @router.post("/studies/{study_id}/guide-review")
    async def guide_review(study_id: str, body: dict, user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        st = await _get_study(study_id, user)
        if st.get("guide_user_id") != user["_id"] and user.get("role") != "administrator":
            raise HTTPException(status_code=403, detail="Only the assigned guide can review this protocol.")
        action, comments = body.get("action"), R._s(body.get("comments"), 2000)
        gr = st.get("guide_review") or {}
        if gr.get("status") != "pending":
            raise HTTPException(status_code=400, detail="Protocol is not awaiting guide review.")
        if action not in ("approve", "request_changes"):
            raise HTTPException(status_code=400, detail="action must be approve or request_changes")
        if action == "request_changes" and not comments:
            raise HTTPException(status_code=400, detail="Please tell the student what to change.")
        now = R.now_iso()
        new_status = "approved" if action == "approve" else "changes_requested"
        setv = {"guide_review": {**gr, "status": new_status, "reviewed_at": now, "reviewer_name": user.get("name", ""), "comments": comments,
                                 "history": (gr.get("history") or []) + [{"action": action, "by": user.get("name", ""), "at": now, "comments": comments}]},
                "guide_approved_at": now if action == "approve" else None, "guide_approved_by": user.get("name", "") if action == "approve" else None, "updated_at": now}
        update = {"$set": setv}
        _audit(update, user, f"guide_{action}", comments)
        await db.research_studies.update_one({"_id": st["_id"]}, update)
        msg = f"Guide approved research protocol {st['code']}" if action == "approve" else f"Guide requested changes on {st['code']}: {comments[:80]}"
        await _notify(st["pi_user_id"], msg, study_id)
        return await get_study(study_id, user)

    def _can_see_iec_letter(st: dict, user: dict) -> bool:
        roles = _member_roles(st, user)
        return bool(roles & {"pi", "guide", "admin"})

    @router.post("/studies/{study_id}/iec-letter")
    async def upload_iec_letter(study_id: str, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        st = await _get_study(study_id, user)
        _require(st, user, ("pi",), "Only the PI can upload the IEC approval letter.")
        ctype = (file.content_type or "").lower()
        if ctype not in ("application/pdf", "image/jpeg", "image/png", "image/webp"):
            raise HTTPException(status_code=400, detail="Upload a PDF, JPG or PNG of the IEC approval letter.")
        data = await file.read()
        if not data or len(data) > 15 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File must be under 15 MB")
        from object_storage import put_object, APP_NAME
        ext = {"application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[ctype]
        path = f"{APP_NAME}/research/{study_id}/iec_letter_{uuid.uuid4()}.{ext}"
        try:
            put_object(path, data, ctype)
        except Exception as ex:
            raise HTTPException(status_code=502, detail=f"Object storage upload failed: {ex}")
        letter = {"storage_path": path, "content_type": ctype, "filename": R._s(file.filename, 120) or f"iec_letter.{ext}",
                  "size": len(data), "uploaded_by": user.get("name", ""), "uploaded_at": R.now_iso()}
        update = {"$set": {"iec_letter": letter, "updated_at": R.now_iso()}}
        _audit(update, user, "iec_letter_uploaded", letter["filename"])
        await db.research_studies.update_one({"_id": st["_id"]}, update)
        return letter

    @router.delete("/studies/{study_id}/iec-letter")
    async def delete_iec_letter(study_id: str, user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        st = await _get_study(study_id, user)
        _require(st, user, ("pi",), "Only the PI can remove the IEC approval letter.")
        update = {"$set": {"iec_letter": None, "updated_at": R.now_iso()}}
        _audit(update, user, "iec_letter_removed")
        await db.research_studies.update_one({"_id": st["_id"]}, update)
        return {"ok": True}

    @router.get("/studies/{study_id}/iec-letter")
    async def get_iec_letter(study_id: str, token: str = ""):
        user = await user_from_token(token) if user_from_token else None
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")
        _deny_nurse(user)
        st = await _get_study(study_id, user)
        if not _can_see_iec_letter(st, user):
            raise HTTPException(status_code=403, detail="The IEC letter is visible to the PI and guide only.")
        letter = st.get("iec_letter")
        if not letter:
            raise HTTPException(status_code=404, detail="No IEC letter uploaded")
        from object_storage import get_object
        try:
            data, ctype = get_object(letter["storage_path"])
        except Exception as ex:
            raise HTTPException(status_code=502, detail=f"Object storage fetch failed: {ex}")
        return StreamingResponse(iter([data]), media_type=ctype or letter["content_type"],
                                 headers={"Content-Disposition": f'inline; filename="{letter["filename"]}"', "Cache-Control": "private, max-age=600"})

    @router.post("/studies/{study_id}/status")
    async def set_status(study_id: str, body: dict, user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        st = await _get_study(study_id, user)
        _require(st, user, ("pi",), "Only the PI can change study status.")
        target = body.get("status")
        if target not in R.STUDY_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        if target == "active" and st.get("status") == "draft":
            missing = [i["label"] for i in R.activation_checklist(st) if not i["ok"]]
            if missing:
                raise HTTPException(status_code=400, detail="Cannot activate — missing: " + "; ".join(missing))

        setv = {"status": target, "updated_at": R.now_iso()}
        if target == "active" and not st.get("activated_at"):
            setv["activated_at"] = R.now_iso()
        update = {"$set": setv}
        _audit(update, user, "status_changed", f"{st.get('status')} → {target}", body.get("reason", ""))
        await db.research_studies.update_one({"_id": st["_id"]}, update)
        return await get_study(study_id, user)

    @router.delete("/studies/{study_id}")
    async def delete_study(study_id: str, user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        st = await _get_study(study_id, user)
        _require(st, user, ("pi",), "Only the PI can delete a draft study.")
        if st.get("status") != "draft":
            raise HTTPException(status_code=400, detail="Only draft studies can be deleted. Archive instead.")
        await db.research_enrolments.delete_many({"study_id": study_id})
        await db.research_patient_values.delete_many({"study_id": study_id})
        await db.research_screening.delete_many({"study_id": study_id})
        await db.research_studies.delete_one({"_id": st["_id"]})
        return {"ok": True}

    # ------------------------------------------------------------ screening / feasibility
    async def _candidates(st: dict, user: dict, limit: int, skip: int, search: str) -> dict:
        q = {**_case_scope(user), "archived": {"$ne": True}, "status": {"$ne": "draft"}}
        if search:
            q["patient_name"] = {"$regex": search, "$options": "i"}
        enrolled = {(e["procedure_id"], e["tooth_number"]) async for e in db.research_enrolments.find({"study_id": str(st["_id"])}, {"procedure_id": 1, "tooth_number": 1})}
        excluded = {(e["procedure_id"], e["tooth_number"]): e async for e in db.research_screening.find({"study_id": str(st["_id"])})}
        other_studies: dict = {}
        async for e in db.research_enrolments.find({"study_id": {"$ne": str(st["_id"])}, "status": {"$in": ["enrolled", "active"]}}, {"procedure_id": 1, "tooth_number": 1, "study_code": 1}):
            other_studies.setdefault((e["procedure_id"], e["tooth_number"]), []).append(e.get("study_code"))
        rows, summary = [], {"eligible": 0, "needs_review": 0, "excluded": 0, "enrolled": 0, "manually_excluded": 0, "cases_scanned": 0}
        async for p in db.procedures.find(q).sort("procedure_date", -1):
            summary["cases_scanned"] += 1
            pid = str(p["_id"])
            for site in R.case_sites(p):
                key = (pid, site["tooth_number"])
                if key in enrolled:
                    summary["enrolled"] += 1
                    continue
                ev = R.evaluate_eligibility(st, p, site["implant"])
                if key in excluded:
                    summary["manually_excluded"] += 1
                    decision = "excluded"
                else:
                    summary[ev["overall"]] += 1
                    decision = ev["overall"]
                rows.append({
                    "procedure_id": pid, "patient_name": p.get("patient_name", ""), "age": p.get("age"), "sex": p.get("sex"),
                    "procedure_type": p.get("implant_procedure_type", ""), "case_status": p.get("status"),
                    "tooth_number": site["tooth_number"], "planned_only": site["planned"],
                    "implant": {k: site["implant"].get(k) for k in ("brand", "system", "diameter", "length", "insertion_torque_ncm", "placement_date")},
                    "eligibility": ev, "decision": decision,
                    "exclusion_reason": (excluded.get(key) or {}).get("reason"),
                    "other_studies": other_studies.get(key, []),
                })
        order = {"eligible": 0, "needs_review": 1, "excluded": 2}
        rows.sort(key=lambda r: order.get(r["decision"], 3))
        return {"summary": summary, "total": len(rows), "rows": rows[skip: skip + limit]}

    @router.get("/studies/{study_id}/candidates")
    async def candidates(study_id: str, limit: int = Query(50, le=200), skip: int = 0, search: str = "",
                         user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        st = await _get_study(study_id, user)
        return await _candidates(st, user, limit, skip, search.strip())

    @router.get("/studies/{study_id}/feasibility")
    async def feasibility(study_id: str, user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        st = await _get_study(study_id, user)
        return (await _candidates(st, user, 0, 0, ""))["summary"]

    @router.post("/studies/{study_id}/screening/exclude")
    async def screening_exclude(study_id: str, body: dict, user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        st = await _get_study(study_id, user)
        _require(st, user, DATA_ROLES, "Not allowed to screen cases for this study.")
        pid, tooth, reason = str(body.get("procedure_id") or ""), str(body.get("tooth_number") or ""), R._s(body.get("reason"), 300)
        if not pid or not tooth or not reason:
            raise HTTPException(status_code=400, detail="procedure_id, tooth_number and reason are required")
        await db.research_screening.update_one(
            {"study_id": study_id, "procedure_id": pid, "tooth_number": tooth},
            {"$set": {"reason": reason, "decision": "excluded", "decided_by": user.get("name", ""), "decided_by_id": user["_id"], "decided_at": R.now_iso()}},
            upsert=True)
        return {"ok": True}

    @router.delete("/studies/{study_id}/screening/exclude")
    async def screening_unexclude(study_id: str, procedure_id: str, tooth_number: str, user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        st = await _get_study(study_id, user)
        _require(st, user, DATA_ROLES, "Not allowed to screen cases for this study.")
        await db.research_screening.delete_one({"study_id": study_id, "procedure_id": procedure_id, "tooth_number": tooth_number})
        return {"ok": True}

    # ------------------------------------------------------------ enrolment
    async def _next_codes(st: dict, pid: str) -> tuple[str, str]:
        code = st["code"]
        existing = await db.research_enrolments.find_one({"study_id": str(st["_id"]), "procedure_id": pid}, {"patient_subject_code": 1})
        if existing:
            pcode = existing["patient_subject_code"]
        else:
            n = len(await db.research_enrolments.distinct("procedure_id", {"study_id": str(st["_id"])})) + 1
            pcode = f"{code}-P{n:03d}"
        k = await db.research_enrolments.count_documents({"study_id": str(st["_id"]), "procedure_id": pid}) + 1
        return pcode, f"{pcode}-I{k:02d}"

    @router.post("/studies/{study_id}/enrol")
    async def enrol(study_id: str, body: dict, user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        st = await _get_study(study_id, user)
        _require(st, user, DATA_ROLES, "Not allowed to enrol cases in this study.")
        if st.get("status") != "active":
            raise HTTPException(status_code=400, detail="Study must be active to enrol cases.")
        pid, tooth = str(body.get("procedure_id") or ""), str(body.get("tooth_number") or "")
        proc = await db.procedures.find_one({"_id": _oid(pid), **_case_scope(user)})
        if not proc:
            raise HTTPException(status_code=404, detail="Case not found or not accessible to you.")
        site = next((s for s in R.case_sites(proc) if s["tooth_number"] == tooth), None)
        if not site:
            raise HTTPException(status_code=400, detail="That tooth/site is not part of this case.")
        if await db.research_enrolments.find_one({"study_id": study_id, "procedure_id": pid, "tooth_number": tooth}):
            raise HTTPException(status_code=400, detail="This implant/site is already enrolled in the study.")
        ev = R.evaluate_eligibility(st, proc, site["implant"])
        override = R._s(body.get("override_reason"), 400)
        if ev["overall"] != "eligible":
            if "pi" not in _member_roles(st, user) and "admin" not in _member_roles(st, user):
                raise HTTPException(status_code=400, detail=f"Case is '{ev['overall'].replace('_', ' ')}' — only the PI can override eligibility.")
            if not override:
                raise HTTPException(status_code=400, detail="Eligibility is not fully met — an override reason is required.")
        checklist = [r for r in st.get("eligibility", []) if r["mode"] == "checklist"]
        ticked = body.get("checklist_ticked") or []
        if len(checklist) and len([x for x in ticked if x]) < len(checklist):
            raise HTTPException(status_code=400, detail="All checklist items must be confirmed before enrolment.")
        if not body.get("consent_confirmed"):
            raise HTTPException(status_code=400, detail="Research consent must be confirmed before enrolment.")
        now = R.now_iso()
        pcode, scode = await _next_codes(st, pid)
        forms = R.build_forms(st, proc, site["implant"], now)
        doc = {
            "study_id": study_id, "study_code": st["code"], "procedure_id": pid, "tooth_number": tooth,
            "implant_index": site["index"], "patient_subject_code": pcode, "subject_code": scode,
            "status": "enrolled", "status_reason": "", "protocol_version": st.get("protocol_version", "1.0"),
            "eligibility_at_enrolment": ev, "override_reason": override,
            "checklist": [{"text": c["checklist_text"], "kind": c["kind"]} for c in checklist],
            "consent": {"confirmed": True, "form_version": st.get("consent_form_version"), "method": body.get("consent_method", "paper"),
                        "language": R._s(body.get("consent_language"), 30), "confirmed_by": user.get("name", ""), "at": now},
            "enrolled_by_id": user["_id"], "enrolled_by": user.get("name", ""), "enrolled_at": now, "updated_at": now,
            "forms": forms,
        }
        res = await db.research_enrolments.insert_one(doc)
        await db.research_screening.delete_one({"study_id": study_id, "procedure_id": pid, "tooth_number": tooth})
        upd: dict = {"$set": {"updated_at": now}}
        _audit(upd, user, "enrolled", scode, override)
        await db.research_studies.update_one({"_id": st["_id"]}, upd)
        # BR-12 heads-up: same site in other active studies
        others = [e.get("study_code") async for e in db.research_enrolments.find(
            {"procedure_id": pid, "tooth_number": tooth, "study_id": {"$ne": study_id}, "status": {"$in": ["enrolled", "active"]}})]
        doc["_id"] = res.inserted_id
        out = _pub(doc)
        out["also_in_studies"] = others
        return out

    async def _reschedule_all(study_oid):
        st = await db.research_studies.find_one({"_id": study_oid})
        async for e in db.research_enrolments.find({"study_id": str(study_oid)}):
            proc = await db.procedures.find_one({"_id": _oid(e["procedure_id"])})
            if not proc:
                continue
            site = next((s for s in R.case_sites(proc) if s["tooth_number"] == e["tooth_number"]), None)
            forms = R.build_forms(st, proc, (site or {}).get("implant"), e["enrolled_at"], e.get("forms"), _var_dates(st, e))
            await db.research_enrolments.update_one({"_id": e["_id"]}, {"$set": {"forms": forms}})

    def _var_dates(st: dict, e: dict) -> dict:
        out = {}
        for f in e.get("forms", []):
            for k, v in (f.get("values") or {}).items():
                out.setdefault(k, v)
        return out

    async def _hydrate(st: dict, e: dict, proc: Optional[dict], user: dict) -> dict:
        """Attach live linked values, derived values, statuses, patient-level values."""
        site = next((s for s in R.case_sites(proc) if s["tooth_number"] == e["tooth_number"]), None) if proc else None
        implant = (site or {}).get("implant")
        if proc:
            e["forms"] = R.build_forms(st, proc, implant, e["enrolled_at"], e.get("forms"), _var_dates(st, e))
        vars_by_key = {v["key"]: v for v in st.get("variables", [])}
        pv = {d["timepoint_key"]: d.get("values", {}) async for d in db.research_patient_values.find({"study_id": e["study_id"], "procedure_id": e["procedure_id"]})}
        tps = {t["key"]: t for t in st.get("timepoints", [])}
        for f in e["forms"]:
            f["status"] = R.form_status(f, tps.get(f["timepoint_key"], {}))
            linked, derived = {}, {}
            for key in tps.get(f["timepoint_key"], {}).get("variables", []):
                var = vars_by_key.get(key)
                if not var:
                    continue
                if var["source"] == "linked":
                    snap = (f.get("linked_snapshot") or {})
                    live = R.case_value(proc, implant, var["case_field_path"]) if proc else None
                    if f.get("locked_at") and key in snap:
                        linked[key] = {"value": snap[key], "live": live, "changed": snap[key] != live}
                    else:
                        linked[key] = {"value": live, "live": live, "changed": False}
                elif var["level"] == "patient" and key in (pv.get(f["timepoint_key"]) or {}):
                    f.setdefault("values", {})[key] = pv[f["timepoint_key"]][key]
            f["linked"] = linked
            f["patient_values"] = pv.get(f["timepoint_key"], {})
        # derived after linked/patient values resolved (so formulas can use them)
        for f in e["forms"]:
            merged_forms = []
            for g in e["forms"]:
                vals = {**{k: v["value"] for k, v in g.get("linked", {}).items()}, **(g.get("values") or {})}
                merged_forms.append({**g, "values": vals})
            cur = next(g for g in merged_forms if g["timepoint_key"] == f["timepoint_key"])
            f["derived"] = R.compute_derived(st, merged_forms, cur, pv)
        e["patient_name"] = proc.get("patient_name") if proc and (user["role"] in FACULTY_ADMIN or await db.procedures.count_documents({"_id": proc["_id"], **_case_scope(user)})) else None
        e["case_accessible"] = bool(proc) and (user["role"] in FACULTY_ADMIN or bool(await db.procedures.count_documents({"_id": proc["_id"], **_case_scope(user)})))
        e["implant"] = {k: (implant or {}).get(k) for k in ("brand", "system", "diameter", "length", "insertion_torque_ncm", "placement_date")}
        return _pub(e)

    @router.get("/studies/{study_id}/enrolments")
    async def list_enrolments(study_id: str, user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        st = await _get_study(study_id, user)
        tps = {t["key"]: t for t in st.get("timepoints", [])}
        out = []
        pids = [e["procedure_id"] async for e in db.research_enrolments.find({"study_id": study_id}, {"procedure_id": 1})]
        accessible = {str(p["_id"]): p async for p in db.procedures.find({"_id": {"$in": [_oid(x) for x in set(pids)]}, **_case_scope(user)}, {"patient_name": 1, "implant_procedure_type": 1, "status": 1})}
        async for e in db.research_enrolments.find({"study_id": study_id}).sort("enrolled_at", 1):
            p = accessible.get(e["procedure_id"])
            forms = [{"timepoint_key": f["timepoint_key"], "label": f.get("label"), "due_date": f.get("due_date"),
                      "status": R.form_status(f, tps.get(f["timepoint_key"], {}))} for f in e.get("forms", [])]
            out.append({"id": str(e["_id"]), "subject_code": e["subject_code"], "patient_subject_code": e["patient_subject_code"],
                        "tooth_number": e["tooth_number"], "status": e["status"], "enrolled_at": e["enrolled_at"],
                        "procedure_id": e["procedure_id"], "patient_name": (p or {}).get("patient_name"),
                        "case_accessible": bool(p), "forms": forms})
        return out

    @router.get("/enrolments/{enrolment_id}")
    async def get_enrolment(enrolment_id: str, user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        e = await db.research_enrolments.find_one({"_id": _oid(enrolment_id)})
        if not e:
            raise HTTPException(status_code=404, detail="Enrolment not found")
        st = await _get_study(e["study_id"], user)
        proc = await db.procedures.find_one({"_id": _oid(e["procedure_id"])})
        out = await _hydrate(st, e, proc, user)
        out["study"] = {"id": str(st["_id"]), "code": st["code"], "title": st["title"], "status": st["status"],
                        "variables": st.get("variables", []), "timepoints": st.get("timepoints", []), "my_roles": sorted(_member_roles(st, user))}
        return out

    @router.post("/enrolments/{enrolment_id}/status")
    async def enrolment_status(enrolment_id: str, body: dict, user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        e = await db.research_enrolments.find_one({"_id": _oid(enrolment_id)})
        if not e:
            raise HTTPException(status_code=404, detail="Enrolment not found")
        st = await _get_study(e["study_id"], user)
        _require(st, user, DATA_ROLES, "Not allowed to change enrolment status.")
        target, reason = body.get("status"), R._s(body.get("reason"), 400)
        if target not in R.ENROLMENT_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        if target in ("withdrawn", "lost_to_follow_up", "excluded_post_enrolment") and not reason:
            raise HTTPException(status_code=400, detail="A reason is required for this status.")
        scope = body.get("withdrawal_scope") if body.get("withdrawal_scope") in ("future_only", "all_data") else "future_only"
        await db.research_enrolments.update_one({"_id": e["_id"]}, {"$set": {
            "status": target, "status_reason": reason, "withdrawal_scope": scope if target == "withdrawn" else None,
            "status_changed_by": user.get("name", ""), "status_changed_at": R.now_iso(), "updated_at": R.now_iso()}})
        upd: dict = {"$set": {"updated_at": R.now_iso()}}
        _audit(upd, user, "enrolment_status", f"{e['subject_code']}: {e['status']} → {target}", reason)
        await db.research_studies.update_one({"_id": st["_id"]}, upd)
        return {"ok": True}

    # ------------------------------------------------------------ form entry
    @router.put("/enrolments/{enrolment_id}/forms/{tp_key}")
    async def save_form(enrolment_id: str, tp_key: str, body: dict, user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        e = await db.research_enrolments.find_one({"_id": _oid(enrolment_id)})
        if not e:
            raise HTTPException(status_code=404, detail="Enrolment not found")
        st = await _get_study(e["study_id"], user)
        roles = _require(st, user, DATA_ROLES, "Not allowed to enter data for this study.")
        if st.get("status") in ("data_locked", "archived"):
            raise HTTPException(status_code=400, detail="Study dataset is locked.")
        if e.get("status") not in ("enrolled", "active", "completed"):
            raise HTTPException(status_code=400, detail=f"Enrolment is {e['status']} — no new data can be entered.")
        tp = next((t for t in st.get("timepoints", []) if t["key"] == tp_key), None)
        form = next((f for f in e.get("forms", []) if f["timepoint_key"] == tp_key), None)
        if not tp or not form:
            raise HTTPException(status_code=404, detail="Timepoint not found")
        action = body.get("action", "save")
        reason = R._s(body.get("reason"), 400)
        is_pi = bool(roles & {"pi", "admin"})
        if form.get("locked_at") and action != "unlock":
            raise HTTPException(status_code=400, detail="Form is locked — PI must unlock it first.")
        if action == "unlock":
            if not is_pi:
                raise HTTPException(status_code=403, detail="Only the PI can unlock a form.")
            if not reason:
                raise HTTPException(status_code=400, detail="Unlock reason is required.")
            form["locked_at"] = form["locked_by"] = None
            form["completed_at"] = form["completed_by"] = None
            form["status"] = "in_window"
            form.setdefault("edit_log", []).append({"action": "unlock", "by": user.get("name", ""), "at": R.now_iso(), "reason": reason})
            return await _persist_form(st, e, form, user, "form_unlocked", reason)
        if form.get("completed_at") and not reason:
            raise HTTPException(status_code=400, detail="This form was completed — a reason is required to edit it (BR-18).")

        vars_by_key = {v["key"]: v for v in st.get("variables", [])}
        values_in = body.get("values") or {}
        not_done_in = body.get("not_done") or {}
        errors, warnings, new_values, new_not_done, patient_vals, changes = [], [], {}, {}, {}, []
        for key in tp["variables"]:
            var = vars_by_key.get(key)
            if not var or var["source"] != "study":
                continue
            clean, err, warn = R.validate_value(var, values_in.get(key))
            if err:
                errors.append(err)
                continue
            if warn:
                warnings.append(warn)
            nd = R._s(not_done_in.get(key), 200) if not_done_in.get(key) else None
            if clean is None and nd:
                new_not_done[key] = nd
            if clean is not None:
                (patient_vals if var["level"] == "patient" else new_values)[key] = clean
            old = (form.get("values") or {}).get(key)
            if old != clean and form.get("completed_at"):
                changes.append({"field": key, "old": old, "new": clean})
        visit_date = R._to_date(body.get("visit_date"))
        if body.get("visit_date") and not visit_date:
            errors.append("Visit date must be YYYY-MM-DD")
        if visit_date and visit_date > R.today():
            errors.append("Visit date cannot be in the future")
        if visit_date and not tp.get("is_baseline"):
            base = next((f for f in e["forms"] if f.get("is_baseline") and f.get("visit_date")), None)
            if base and visit_date < R._to_date(base["visit_date"]):
                errors.append("Follow-up visit date cannot precede the baseline visit date")
        deviation = False
        if visit_date and form.get("window_start") and form.get("window_end"):
            deviation = not (R._to_date(form["window_start"]) <= visit_date <= R._to_date(form["window_end"]))
            if deviation and not R._s(body.get("deviation_reason"), 300):
                errors.append("Visit is outside the protocol window — a deviation reason is required (BR-09)")
        if action in ("complete", "lock"):
            if not visit_date:
                errors.append("Visit date is required to complete the form")
            for key in tp["variables"]:
                var = vars_by_key.get(key)
                if var and var["source"] == "study" and var.get("required") and key not in new_values and key not in patient_vals and key not in new_not_done:
                    errors.append(f"{var['label']} is required — enter a value or mark it 'not done' with a reason (BR-10)")
            if warnings and not body.get("confirm_warnings"):
                raise HTTPException(status_code=409, detail={"warnings": warnings, "message": "Please confirm the soft warnings to continue."})
        if errors:
            raise HTTPException(status_code=400, detail={"errors": errors, "warnings": warnings})

        form["values"] = {**{k: v for k, v in (form.get("values") or {}).items() if k not in tp["variables"]}, **new_values}
        form["not_done"] = new_not_done
        form["visit_date"] = visit_date.isoformat() if visit_date else None
        form["deviation_flag"] = deviation
        form["deviation_reason"] = R._s(body.get("deviation_reason"), 300) if deviation else ""
        form["last_saved_by"] = user.get("name", "")
        form["last_saved_at"] = R.now_iso()
        if changes:
            form.setdefault("edit_log", []).append({"action": "edit_after_complete", "by": user.get("name", ""), "at": R.now_iso(), "reason": reason, "changes": changes})
        if patient_vals:
            await db.research_patient_values.update_one(
                {"study_id": e["study_id"], "procedure_id": e["procedure_id"], "timepoint_key": tp_key},
                {"$set": {**{f"values.{k}": v for k, v in patient_vals.items()}, "updated_by": user.get("name", ""), "updated_at": R.now_iso()}}, upsert=True)
        audit_action = "form_saved"
        if action in ("complete", "lock"):
            form["completed_at"] = form.get("completed_at") or R.now_iso()
            form["completed_by"] = form.get("completed_by") or user.get("name", "")
            form["status"] = "completed"
            audit_action = "form_completed"
        if action == "lock":
            if not is_pi:
                raise HTTPException(status_code=403, detail="Only the PI can lock a form.")
            proc = await db.procedures.find_one({"_id": _oid(e["procedure_id"])})
            site = next((s for s in R.case_sites(proc) if s["tooth_number"] == e["tooth_number"]), None) if proc else None
            snap = {}
            for key in tp["variables"]:
                var = vars_by_key.get(key)
                if var and var["source"] == "linked":
                    snap[key] = R.case_value(proc, (site or {}).get("implant"), var["case_field_path"])
            form["linked_snapshot"] = snap
            form["locked_at"], form["locked_by"], form["status"] = R.now_iso(), user.get("name", ""), "locked"
            audit_action = "form_locked"
        return await _persist_form(st, e, form, user, audit_action, reason, warnings)

    async def _persist_form(st, e, form, user, action, reason="", warnings=None):
        forms = [form if f["timepoint_key"] == form["timepoint_key"] else f for f in e["forms"]]
        new_status = "active" if any(f.get("completed_at") for f in forms) and e["status"] == "enrolled" else e["status"]
        await db.research_enrolments.update_one({"_id": e["_id"]}, {"$set": {"forms": forms, "status": new_status, "updated_at": R.now_iso()}})
        upd: dict = {"$set": {"updated_at": R.now_iso()}}
        _audit(upd, user, action, f"{e['subject_code']} / {form['timepoint_key']}", reason)
        await db.research_studies.update_one({"_id": st["_id"]}, upd)
        out = await get_enrolment(str(e["_id"]), user)
        out["warnings"] = warnings or []
        return out

    # ------------------------------------------------------------ case card (S12)
    @router.get("/case/{procedure_id}")
    async def case_card(procedure_id: str, user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        proc = await db.procedures.find_one({"_id": _oid(procedure_id), **_case_scope(user)})
        if not proc:
            raise HTTPException(status_code=404, detail="Case not found")
        q = {} if user["role"] in FACULTY_ADMIN else {"$or": [{"pi_user_id": user["_id"]}, {"members.user_id": user["_id"]}]}
        studies = {str(s["_id"]): s async for s in db.research_studies.find({**q, "status": "active"})}
        enrolled, eligible = [], []
        async for e in db.research_enrolments.find({"procedure_id": procedure_id}):
            st = studies.get(e["study_id"]) or await db.research_studies.find_one({"_id": _oid(e["study_id"])}, {"code": 1, "title": 1, "timepoints": 1})
            if not st:
                continue
            tps = {t["key"]: t for t in st.get("timepoints", [])}
            due = [{"timepoint_key": f["timepoint_key"], "label": f.get("label"), "due_date": f.get("due_date"), "status": R.form_status(f, tps.get(f["timepoint_key"], {}))}
                   for f in e.get("forms", []) if R.form_status(f, tps.get(f["timepoint_key"], {})) in ("in_window", "overdue", "missed")]
            enrolled.append({"enrolment_id": str(e["_id"]), "study_id": e["study_id"], "study_code": st.get("code"), "study_title": st.get("title"),
                             "subject_code": e["subject_code"], "tooth_number": e["tooth_number"], "status": e["status"],
                             "is_member": e["study_id"] in studies, "forms_due": due})
        enrolled_keys = {(x["study_id"], x["tooth_number"]) for x in enrolled}
        for sid, st in studies.items():
            for site in R.case_sites(proc):
                if (sid, site["tooth_number"]) in enrolled_keys:
                    continue
                ev = R.evaluate_eligibility(st, proc, site["implant"])
                if ev["overall"] in ("eligible", "needs_review"):
                    eligible.append({"study_id": sid, "study_code": st["code"], "study_title": st["title"], "tooth_number": site["tooth_number"], "result": ev["overall"]})
        return {"enrolled": enrolled, "eligible": eligible}

    # ------------------------------------------------------------ dashboard / results
    @router.get("/studies/{study_id}/dashboard")
    async def dashboard(study_id: str, group_by: Optional[str] = None, user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        st = await _get_study(study_id, user)
        tps = st.get("timepoints", [])
        tp_map = {t["key"]: t for t in tps}
        vars_by_key = {v["key"]: v for v in st.get("variables", [])}
        enrolments = [e async for e in db.research_enrolments.find({"study_id": study_id})]
        procs = {str(p["_id"]): p async for p in db.procedures.find({"_id": {"$in": [_oid(e["procedure_id"]) for e in enrolments]}})}
        flow = {"screened_excluded": await db.research_screening.count_documents({"study_id": study_id}),
                "enrolled": len(enrolments),
                "active": sum(1 for e in enrolments if e["status"] in ("enrolled", "active")),
                "completed": sum(1 for e in enrolments if e["status"] == "completed"),
                "withdrawn": sum(1 for e in enrolments if e["status"] == "withdrawn"),
                "lost_to_follow_up": sum(1 for e in enrolments if e["status"] == "lost_to_follow_up"),
                "excluded_post_enrolment": sum(1 for e in enrolments if e["status"] == "excluded_post_enrolment"),
                "patients": len({e["procedure_id"] for e in enrolments})}
        per_tp = {t["key"]: {"label": t["label"], "not_due": 0, "in_window": 0, "overdue": 0, "missed": 0, "completed": 0, "locked": 0, "not_done": 0, "deviations": 0} for t in tps}
        var_values: dict = {}   # (var, tp) -> list of (value, group)
        analysable = [e for e in enrolments if not (e["status"] == "withdrawn" and e.get("withdrawal_scope") == "all_data")]
        for e in analysable:
            hyd = await _hydrate(st, dict(e), procs.get(e["procedure_id"]), user)
            grp = None
            if group_by and group_by in vars_by_key:
                gv = vars_by_key[group_by]
                for f in hyd["forms"]:
                    v = (f.get("linked", {}).get(group_by) or {}).get("value") if gv["source"] == "linked" else (f.get("values") or {}).get(group_by)
                    if v is not None:
                        grp = str(v); break
            for f in hyd["forms"]:
                c = per_tp.get(f["timepoint_key"])
                if c is None:
                    continue
                if e["status"] in ("enrolled", "active", "completed"):
                    c[f["status"]] = c.get(f["status"], 0) + 1
                if f.get("deviation_flag"):
                    c["deviations"] += 1
                if not f.get("completed_at"):
                    continue
                for key in tp_map.get(f["timepoint_key"], {}).get("variables", []):
                    var = vars_by_key.get(key)
                    if not var:
                        continue
                    if var["source"] == "linked":
                        v = (f["linked"].get(key) or {}).get("value")
                    elif var["source"] == "derived":
                        v = f["derived"].get(key)
                    else:
                        v = (f.get("values") or {}).get(key)
                    if v is not None:
                        var_values.setdefault((key, f["timepoint_key"]), []).append((v, grp or "All"))
        results = []
        for v in st.get("variables", []):
            row = {"key": v["key"], "label": v["label"], "unit": v.get("unit"), "data_type": v["data_type"], "source": v["source"], "level": v["level"], "timepoints": []}
            numeric = v["data_type"] in ("integer", "decimal", "scale")
            for t in tps:
                if v["key"] not in t["variables"]:
                    continue
                vals = var_values.get((v["key"], t["key"]), [])
                groups = sorted({g for _, g in vals})
                cell = {"timepoint_key": t["key"], "label": t["label"], "n": len(vals)}
                if numeric:
                    cell["stats"] = R.describe([x for x, _ in vals])
                    if group_by and len(groups) > 1:
                        cell["by_group"] = {g: R.describe([x for x, gg in vals if gg == g]) for g in groups}
                else:
                    cell["categories"] = R.count_categories([x for x, _ in vals])
                    if group_by and len(groups) > 1:
                        cell["by_group"] = {g: R.count_categories([x for x, gg in vals if gg == g]) for g in groups}
                row["timepoints"].append(cell)
            results.append(row)
        total_fields = sum(c["completed"] + c["locked"] for c in per_tp.values())
        clustered = flow["patients"] < flow["enrolled"]
        return {"target_n": st.get("target_n"), "flow": flow, "timepoints": list(per_tp.values()), "results": results,
                "completed_forms": total_fields, "clustered_warning": clustered, "group_by": group_by}

    # ------------------------------------------------------------ export (S16)
    @router.get("/studies/{study_id}/export")
    async def export(study_id: str, shape: str = "wide", user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        st = await _get_study(study_id, user)
        _require(st, user, EXPORT_ROLES, "Export is limited to PI, guide and statistician.")
        tps = st.get("timepoints", [])
        tp_map = {t["key"]: t for t in tps}
        vars_ = st.get("variables", [])
        vars_by_key = {v["key"]: v for v in vars_}
        buf = io.StringIO()
        w = csv.writer(buf)
        if shape == "dictionary":
            w.writerow(["key", "label", "level", "source", "data_type", "unit", "min", "max", "codes", "formula", "case_field_path", "method_note", "timepoints"])
            for v in vars_:
                codes = "; ".join(f"{o['code']}={o['label']}" for o in v.get("options") or [])
                w.writerow([v["key"], v["label"], v["level"], v["source"], v["data_type"], v.get("unit") or "", v.get("min") if v.get("min") is not None else "",
                            v.get("max") if v.get("max") is not None else "", codes, v.get("formula") or "", v.get("case_field_path") or "", v.get("method_note") or "",
                            "|".join(t["key"] for t in tps if v["key"] in t["variables"])])
            fname = f"{st['code']}_data_dictionary.csv"
        elif shape == "methods":
            buf.write(_methods_text(st))
            fname = f"{st['code']}_methods.txt"
        else:
            enrolments = [e async for e in db.research_enrolments.find({"study_id": study_id}).sort("subject_code", 1)]
            enrolments = [e for e in enrolments if not (e["status"] == "withdrawn" and e.get("withdrawal_scope") == "all_data")]
            procs = {str(p["_id"]): p async for p in db.procedures.find({"_id": {"$in": [_oid(e["procedure_id"]) for e in enrolments]}})}
            rows = []
            for e in enrolments:
                hyd = await _hydrate(st, dict(e), procs.get(e["procedure_id"]), user)
                for f in hyd["forms"]:
                    anchor = R._to_date(f.get("anchor_date")); vd = R._to_date(f.get("visit_date"))
                    base = {"patient_subject_code": e["patient_subject_code"], "subject_code": e["subject_code"], "site_fdi": e["tooth_number"],
                            "enrolment_status": e["status"], "timepoint_key": f["timepoint_key"],
                            "days_from_anchor": (vd - anchor).days if vd and anchor else "",
                            "visit_in_window": "" if not vd else ("0" if f.get("deviation_flag") else "1"),
                            "form_status": f["status"], "protocol_version": e.get("protocol_version", "1.0")}
                    vals = {}
                    for key in tp_map.get(f["timepoint_key"], {}).get("variables", []):
                        var = vars_by_key.get(key)
                        if not var:
                            continue
                        if var["source"] == "linked":
                            v = (f["linked"].get(key) or {}).get("value")
                        elif var["source"] == "derived":
                            v = f["derived"].get(key)
                        else:
                            v = (f.get("values") or {}).get(key)
                        if var["data_type"] == "date" and v and anchor:
                            d = R._to_date(v); v = (d - anchor).days if d else ""   # de-identify dates
                        if isinstance(v, list):
                            v = "|".join(str(x) for x in v)
                        if isinstance(v, bool):
                            v = 1 if v else 0
                        vals[key] = "" if v is None else v
                        if key in (f.get("not_done") or {}):
                            vals[key] = "ND"
                    rows.append((base, vals))
            if shape == "long":
                cols = list(rows[0][0].keys()) if rows else ["patient_subject_code", "subject_code", "site_fdi", "timepoint_key"]
                w.writerow(cols + ["variable_key", "value"])
                for base, vals in rows:
                    for k, v in vals.items():
                        w.writerow([base[c] for c in cols] + [k, v])
                fname = f"{st['code']}_observations_long.csv"
            else:
                head = ["patient_subject_code", "subject_code", "site_fdi", "enrolment_status", "protocol_version"]
                cols = []
                for t in tps:
                    cols.append(f"visit_days_from_anchor__{t['key']}")
                    cols.append(f"visit_in_window__{t['key']}")
                    for key in t["variables"]:
                        cols.append(f"{key}__{t['key']}")
                w.writerow(head + cols)
                by_subject: dict = {}
                for base, vals in rows:
                    r = by_subject.setdefault(base["subject_code"], {h: base[h] for h in head})
                    r[f"visit_days_from_anchor__{base['timepoint_key']}"] = base["days_from_anchor"]
                    r[f"visit_in_window__{base['timepoint_key']}"] = base["visit_in_window"]
                    for k, v in vals.items():
                        r[f"{k}__{base['timepoint_key']}"] = v
                for r in by_subject.values():
                    w.writerow([r.get(c, "") for c in head + cols])
                fname = f"{st['code']}_wide.csv"
        upd: dict = {"$set": {"updated_at": R.now_iso()}}
        _audit(upd, user, "exported", shape)
        await db.research_studies.update_one({"_id": st["_id"]}, upd)
        media = "text/plain" if shape == "methods" else "text/csv"
        return StreamingResponse(iter([buf.getvalue()]), media_type=media,
                                 headers={"Content-Disposition": f'attachment; filename="{fname}"'})

    def _methods_text(st: dict) -> str:
        inc = [R.describe_condition(r["query"]) if r["mode"] == "query" else r["checklist_text"] for r in st.get("eligibility", []) if r["kind"] == "include"]
        exc = [R.describe_condition(r["query"]) if r["mode"] == "query" else r["checklist_text"] for r in st.get("eligibility", []) if r["kind"] == "exclude"]
        tps = "; ".join(f"{t['label']} ({t['anchor_event'].replace('_', ' ')} + {t['offset_days']} d, window −{t['window_before_days']}/+{t['window_after_days']} d)" for t in st.get("timepoints", []))
        outcomes = ", ".join(f"{v['label']}{' (' + v['unit'] + ')' if v.get('unit') else ''}" for v in st.get("variables", []) if v["source"] != "linked")
        return (f"{st.get('title')} ({st.get('code')})\n\nStudy design: {st.get('study_type', '').replace('_', ' ')}; unit of analysis: {st.get('primary_unit')}; "
                f"target sample size n = {st.get('target_n')}.\n\nResearch question: {st.get('research_question')}\n\n"
                f"Inclusion criteria: {'; '.join(inc) or '—'}.\nExclusion criteria: {'; '.join(exc) or '—'}.\n\n"
                f"Assessment schedule: {tps or '—'}.\n\nStudy-specific outcome variables: {outcomes or '—'}.\n\n"
                f"Baseline demographic and implant characteristics were extracted from the Implanr clinical record (read-only linked variables). "
                f"Derived variables were computed automatically from recorded measurements. Exports are de-identified: subject codes replace identifiers "
                f"and dates are expressed as days from the timepoint anchor.\n")

    # ------------------------------------------------------------ radiographs (S13 image slots, §11 manual measurement)
    async def _load_form_ctx(enrolment_id: str, tp_key: str, user: dict):
        e = await db.research_enrolments.find_one({"_id": _oid(enrolment_id)})
        if not e:
            raise HTTPException(status_code=404, detail="Enrolment not found")
        st = await _get_study(e["study_id"], user)
        form = next((f for f in e.get("forms", []) if f["timepoint_key"] == tp_key), None)
        if not form:
            raise HTTPException(status_code=404, detail="Timepoint not found")
        return st, e, form

    @router.post("/enrolments/{enrolment_id}/forms/{tp_key}/image")
    async def upload_form_image(enrolment_id: str, tp_key: str, file: UploadFile = File(...), slot: str = Form("iopa"),
                                acquisition_date: str = Form(""), user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        st, e, form = await _load_form_ctx(enrolment_id, tp_key, user)
        _require(st, user, DATA_ROLES, "Not allowed to upload images for this study.")
        if form.get("locked_at"):
            raise HTTPException(status_code=400, detail="Form is locked.")
        ctype = (file.content_type or "").lower()
        if ctype not in ("image/jpeg", "image/png", "image/webp"):
            raise HTTPException(status_code=400, detail="Upload a JPEG/PNG/WEBP photo of the radiograph (DICOM import is a later phase).")
        data = await file.read()
        if not data or len(data) > 15 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image must be 1 byte – 15 MB")
        from object_storage import put_object, APP_NAME
        from PIL import Image as _PIL
        try:
            im = _PIL.open(io.BytesIO(data)); width, height = im.size
        except Exception:
            raise HTTPException(status_code=400, detail="Could not read image")
        image_id = str(uuid.uuid4())
        ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[ctype]
        path = f"{APP_NAME}/research/{e['study_id']}/{enrolment_id}/{tp_key}_{slot}_{image_id}.{ext}"
        try:
            put_object(path, data, ctype)
        except Exception as ex:
            raise HTTPException(status_code=502, detail=f"Object storage upload failed: {ex}")
        asset = {"image_id": image_id, "slot": R._s(slot, 40) or "iopa", "storage_path": path, "content_type": ctype,
                 "width": width, "height": height, "source": "photo", "quality_grade": "C",
                 "acquisition_date": R._s(acquisition_date, 10) or None, "calibration": None, "measurements": {},
                 "uploaded_by": user.get("name", ""), "uploaded_at": R.now_iso()}
        form.setdefault("images", {})[asset["slot"]] = asset
        return await _persist_form(st, e, form, user, "image_uploaded", f"{slot}")

    @router.get("/images/{enrolment_id}/{tp_key}/{slot}")
    async def get_form_image(enrolment_id: str, tp_key: str, slot: str, token: str = ""):
        user = await user_from_token(token) if user_from_token else None
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")
        _deny_nurse(user)
        st, e, form = await _load_form_ctx(enrolment_id, tp_key, user)
        asset = (form.get("images") or {}).get(slot)
        if not asset:
            raise HTTPException(status_code=404, detail="Image not found")
        from object_storage import get_object
        try:
            data, ctype = get_object(asset["storage_path"])
        except Exception as ex:
            raise HTTPException(status_code=502, detail=f"Object storage fetch failed: {ex}")
        return StreamingResponse(iter([data]), media_type=ctype or asset["content_type"], headers={"Cache-Control": "private, max-age=3600"})

    @router.put("/enrolments/{enrolment_id}/forms/{tp_key}/image/{slot}/measure")
    async def measure_image(enrolment_id: str, tp_key: str, slot: str, body: dict, user: dict = Depends(get_current_user)):
        """Body: {calibration:{p1:[x,y],p2:[x,y],reference_length_mm}, measurements:{var_key:{p1,p2}}}
        Points are in natural image pixels. Value = px distance / px_per_mm (BR-22: calibration required)."""
        _deny_nurse(user)
        st, e, form = await _load_form_ctx(enrolment_id, tp_key, user)
        _require(st, user, DATA_ROLES, "Not allowed to measure images for this study.")
        if form.get("locked_at"):
            raise HTTPException(status_code=400, detail="Form is locked.")
        asset = (form.get("images") or {}).get(slot)
        if not asset:
            raise HTTPException(status_code=404, detail="Upload the radiograph first")
        cal = body.get("calibration") or asset.get("calibration")
        if not cal or not cal.get("p1") or not cal.get("p2") or not R._num(cal.get("reference_length_mm")):
            raise HTTPException(status_code=400, detail="Calibrate first: mark implant shoulder → apex and enter the known implant length (BR-22).")
        px = math.dist(cal["p1"], cal["p2"])
        if px < 5:
            raise HTTPException(status_code=400, detail="Calibration points are too close together")
        px_per_mm = px / float(cal["reference_length_mm"])
        asset["calibration"] = {"p1": cal["p1"], "p2": cal["p2"], "reference_length_mm": float(cal["reference_length_mm"]), "px_per_mm": round(px_per_mm, 4),
                                "method": "known_implant_length", "calibrated_by": user.get("name", ""), "at": R.now_iso()}
        asset["quality_grade"] = "B"
        vars_by_key = {v["key"]: v for v in st.get("variables", [])}
        tp = next(t for t in st["timepoints"] if t["key"] == tp_key)
        for key, m in (body.get("measurements") or {}).items():
            var = vars_by_key.get(key)
            if not var or var["source"] != "study" or key not in tp["variables"] or not m or not m.get("p1") or not m.get("p2"):
                continue
            mm = math.dist(m["p1"], m["p2"]) / px_per_mm
            if m.get("signed_negative"):
                mm = -mm
            val = round(mm, var.get("decimals") if var.get("decimals") is not None else 2)
            asset.setdefault("measurements", {})[key] = {"p1": m["p1"], "p2": m["p2"], "value_mm": val, "method": "manual",
                                                         "examiner": user.get("name", ""), "at": R.now_iso()}
            form.setdefault("values", {})[key] = val
            form.setdefault("not_done", {}).pop(key, None)
        form["images"][slot] = asset
        return await _persist_form(st, e, form, user, "image_measured", slot)

    # ------------------------------------------------------------ data queries (S17)
    @router.get("/studies/{study_id}/queries")
    async def list_queries(study_id: str, status: Optional[str] = None, user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        await _get_study(study_id, user)
        q: dict = {"study_id": study_id}
        if status:
            q["status"] = status
        out = [ _pub(d) async for d in db.research_queries.find(q).sort("updated_at", -1)]
        return out

    @router.get("/enrolments/{enrolment_id}/queries")
    async def enrolment_queries(enrolment_id: str, user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        e = await db.research_enrolments.find_one({"_id": _oid(enrolment_id)}, {"study_id": 1})
        if not e:
            raise HTTPException(status_code=404, detail="Enrolment not found")
        await _get_study(e["study_id"], user)
        return [_pub(d) async for d in db.research_queries.find({"enrolment_id": enrolment_id}).sort("updated_at", -1)]

    @router.post("/enrolments/{enrolment_id}/queries")
    async def raise_query(enrolment_id: str, body: dict, user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        e = await db.research_enrolments.find_one({"_id": _oid(enrolment_id)})
        if not e:
            raise HTTPException(status_code=404, detail="Enrolment not found")
        st = await _get_study(e["study_id"], user)
        _require(st, user, ("pi", "guide", "statistician"), "Only PI, guide or statistician can raise data queries.")
        text = R._s(body.get("text"), 1000)
        if not text:
            raise HTTPException(status_code=400, detail="Query text is required")
        now = R.now_iso()
        doc = {"study_id": e["study_id"], "study_code": e.get("study_code"), "enrolment_id": enrolment_id, "subject_code": e["subject_code"],
               "timepoint_key": R._s(body.get("timepoint_key"), 40), "variable_key": R._s(body.get("variable_key"), 40),
               "value_at_raise": body.get("value_at_raise"), "status": "open",
               "raised_by_id": user["_id"], "raised_by": user.get("name", ""), "raised_role": user.get("role", ""),
               "thread": [{"by_id": user["_id"], "by": user.get("name", ""), "text": text, "at": now, "kind": "raise"}],
               "created_at": now, "updated_at": now}
        res = await db.research_queries.insert_one(doc)
        collectors = [m["user_id"] for m in st.get("members", []) if m["role"] in ("data_collector", "co_investigator", "pi") and m["user_id"] != user["_id"]]
        if e.get("enrolled_by_id") and e["enrolled_by_id"] != user["_id"]:
            collectors.append(e["enrolled_by_id"])
        for uid in set(collectors):
            await db.notifications.insert_one({"user_id": uid, "message": f"Data query on {e['subject_code']} ({doc['variable_key'] or doc['timepoint_key']}): {text[:80]}",
                                               "type": "research_query", "read": False, "created_at": datetime.now(timezone.utc),
                                               "research_enrolment_id": enrolment_id, "research_query_id": str(res.inserted_id)})
        upd: dict = {"$set": {"updated_at": now}}
        _audit(upd, user, "query_raised", f"{e['subject_code']} / {doc['variable_key']}")
        await db.research_studies.update_one({"_id": st["_id"]}, upd)
        doc["_id"] = res.inserted_id
        return _pub(doc)

    @router.post("/queries/{query_id}/reply")
    async def reply_query(query_id: str, body: dict, user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        q = await db.research_queries.find_one({"_id": _oid(query_id)})
        if not q:
            raise HTTPException(status_code=404, detail="Query not found")
        st = await _get_study(q["study_id"], user)
        text = R._s(body.get("text"), 1000)
        action = body.get("action", "reply")  # reply | answer | close | reopen
        if action in ("reply", "answer") and not text:
            raise HTTPException(status_code=400, detail="Message is required")
        if q["status"] == "closed" and action != "reopen":
            raise HTTPException(status_code=400, detail="Query is closed")
        roles = _member_roles(st, user)
        now = R.now_iso()
        setv: dict = {"updated_at": now}
        entry = {"by_id": user["_id"], "by": user.get("name", ""), "text": text, "at": now, "kind": action}
        if action == "close":
            if not (roles & {"pi", "admin"}) and q["raised_by_id"] != user["_id"]:
                raise HTTPException(status_code=403, detail="Only the raiser or PI can close a query.")
            setv.update({"status": "closed", "closed_by": user.get("name", ""), "closed_at": now})
        elif action == "reopen":
            if not (roles & {"pi", "admin", "guide", "statistician"}):
                raise HTTPException(status_code=403, detail="Only PI/guide/statistician can reopen.")
            setv["status"] = "open"
        elif action == "answer":
            setv["status"] = "answered"
        await db.research_queries.update_one({"_id": q["_id"]}, {"$set": setv, "$push": {"thread": entry}})
        targets = {q["raised_by_id"]} | {t["by_id"] for t in q.get("thread", [])}
        for uid in targets - {user["_id"]}:
            await db.notifications.insert_one({"user_id": uid, "message": f"Query on {q['subject_code']} {action}: {text[:80] if text else ''}".strip(),
                                               "type": "research_query", "read": False, "created_at": datetime.now(timezone.utc),
                                               "research_enrolment_id": q["enrolment_id"], "research_query_id": query_id})
        upd: dict = {"$set": {"updated_at": now}}
        _audit(upd, user, f"query_{action}", q["subject_code"])
        await db.research_studies.update_one({"_id": st["_id"]}, upd)
        return _pub(await db.research_queries.find_one({"_id": q["_id"]}))

    # ------------------------------------------------------------ synopsis (S19/S20, D3 — per-study editable sections)
    @router.put("/studies/{study_id}/synopsis")
    async def save_synopsis(study_id: str, body: dict, user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        st = await _get_study(study_id, user)
        _require(st, user, ("pi", "guide", "co_investigator"), "Not allowed to edit the synopsis.")
        syn = R.sanitize_synopsis(body)
        update = {"$set": {"synopsis": syn, "updated_at": R.now_iso()}}
        _audit(update, user, "synopsis_updated")
        await db.research_studies.update_one({"_id": st["_id"]}, update)
        return syn

    @router.get("/studies/{study_id}/synopsis.{fmt}")
    async def synopsis_export(study_id: str, fmt: str, user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        st = await _get_study(study_id, user)
        if fmt not in ("docx", "pdf"):
            raise HTTPException(status_code=400, detail="fmt must be docx or pdf")
        dash = await dashboard(study_id, None, user)
        data = R.build_synopsis_docx(st, dash) if fmt == "docx" else R.build_synopsis_pdf(st, dash)
        upd: dict = {"$set": {"updated_at": R.now_iso()}}
        _audit(upd, user, "synopsis_exported", fmt)
        await db.research_studies.update_one({"_id": st["_id"]}, upd)
        media = "application/vnd.openxmlformats-officedocument.wordprocessingml.document" if fmt == "docx" else "application/pdf"
        return StreamingResponse(iter([data]), media_type=media,
                                 headers={"Content-Disposition": f'attachment; filename="{st["code"]}_synopsis.{fmt}"'})

    @router.get("/my-tasks")
    async def my_tasks(user: dict = Depends(get_current_user)):
        _deny_nurse(user)
        q = {} if user["role"] in FACULTY_ADMIN else {"$or": [{"pi_user_id": user["_id"]}, {"members.user_id": user["_id"]}]}
        studies = {str(s["_id"]): s async for s in db.research_studies.find({**q, "status": "active"})}
        tasks = []
        async for e in db.research_enrolments.find({"study_id": {"$in": list(studies.keys())}, "status": {"$in": ["enrolled", "active"]}}):
            st = studies[e["study_id"]]
            tps = {t["key"]: t for t in st.get("timepoints", [])}
            for f in e.get("forms", []):
                s = R.form_status(f, tps.get(f["timepoint_key"], {}))
                if s in ("in_window", "overdue", "missed"):
                    tasks.append({"enrolment_id": str(e["_id"]), "study_code": st["code"], "subject_code": e["subject_code"],
                                  "timepoint_key": f["timepoint_key"], "label": f.get("label"), "due_date": f.get("due_date"), "status": s})
        order = {"overdue": 0, "missed": 1, "in_window": 2}
        tasks.sort(key=lambda t: (order.get(t["status"], 9), t.get("due_date") or ""))
        return tasks

    return router
