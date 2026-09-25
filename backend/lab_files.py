"""iter-Jun-2026: Lab Slip Scan Files — STL/PLY attachments, lab portal link,
secure 30-day lab download page (+QR), Lab directory and "Email lab".

Wired from server.py via `setup_lab_files(app, api_router, db, deps)` so the
monolith does not grow further. Storage = Emergent Object Storage (backend-only
key); uploads arrive in 5 MB chunks and are assembled before the single PUT.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import io
import ipaddress
import json
import logging
import os
import re
import shutil
import tempfile
import uuid
import zipfile
from datetime import datetime, timedelta, timezone
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import httpx
import requests
from bson import ObjectId
from fastapi import BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, HTMLResponse, Response, StreamingResponse
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

logger = logging.getLogger(__name__)

# ── Object storage (Emergent managed) ───────────────────────────────────────
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "implanr"
_storage_key: Optional[str] = None


def init_storage() -> str:
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _reset_key():
    global _storage_key
    _storage_key = None


def put_object_file(path: str, fileobj, content_type: str) -> dict:
    """Streaming PUT of a file object (up to 500 MB)."""
    for attempt in (1, 2):
        key = init_storage()
        fileobj.seek(0)
        resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type},
                            data=fileobj, timeout=600)
        if resp.status_code == 503 and attempt == 1:
            _reset_key()
            continue
        if resp.status_code == 402:
            raise HTTPException(status_code=402, detail="Storage credits exhausted — please top up before uploading more scan files.")
        resp.raise_for_status()
        return resp.json()
    raise HTTPException(status_code=503, detail="Storage temporarily unavailable")


def open_object_stream(path: str):
    """Returns a streaming requests.Response (caller iterates .iter_content)."""
    for attempt in (1, 2):
        key = init_storage()
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, stream=True, timeout=600)
        if resp.status_code == 503 and attempt == 1:
            _reset_key()
            continue
        if resp.status_code >= 400:
            raise HTTPException(status_code=404, detail="File not available")
        return resp
    raise HTTPException(status_code=503, detail="Storage temporarily unavailable")


# ── Constants ───────────────────────────────────────────────────────────────
ALLOWED_EXT = {".stl", ".ply", ".obj", ".zip", ".dcm", ".pdf"}
MAX_FILE_BYTES = 500 * 1024 * 1024
CHUNK_SIZE = 5 * 1024 * 1024
MAX_FILES_PER_CASE = 20
LAB_LINK_DAYS = 30
MIME_BY_EXT = {".stl": "model/stl", ".ply": "application/octet-stream", ".obj": "model/obj", ".zip": "application/zip",
               ".dcm": "application/dicom", ".pdf": "application/pdf"}

# ── Email (Emergent managed Resend) ─────────────────────────────────────────
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME") or "Implanr"
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv", "send us your password",
             "enter your password below", "confirm your card number", "your full card number", "seed phrase",
             "recovery phrase", "verify your card", "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} ≠ real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> Optional[str]:
    if not EMAIL_KEY:
        raise HTTPException(status_code=503, detail="Email service is not configured")
    _assert_safe_email(subject, html)
    payload: Dict[str, Any] = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send", headers={"X-Email-Key": EMAIL_KEY}, json=payload)
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        logger.error("Email send failed: %s %s", e.response.status_code, e.response.text)
        raise HTTPException(status_code=502, detail="Failed to send email")
    except Exception as e:  # pragma: no cover
        logger.error("Email send error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to send email")


# ── Models ──────────────────────────────────────────────────────────────────
class ScanUploadInit(BaseModel):
    filename: str = Field(..., min_length=1, max_length=200)
    size: int = Field(..., ge=1, le=MAX_FILE_BYTES)
    mime: Optional[str] = Field(None, max_length=100)


class ScanLinkIn(BaseModel):
    url: Optional[str] = Field("", max_length=500)


class LabIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    email: str = Field(..., min_length=5, max_length=200)
    contact_person: Optional[str] = Field("", max_length=120)
    phone: Optional[str] = Field("", max_length=40)
    notes: Optional[str] = Field("", max_length=500)


class LabShareSlipIn(BaseModel):
    slip_html: str = Field(..., min_length=20, max_length=2_000_000)


class LabEmailIn(BaseModel):
    lab_id: str = Field(..., min_length=1, max_length=50)


def _ext(name: str) -> str:
    return os.path.splitext(name or "")[1].lower()


def _fmt_size(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit in ("B", "KB") else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n} B"


def _public_base(request: Request) -> str:
    env = (os.environ.get("PUBLIC_BASE_URL") or "").strip()
    if env:
        return env.rstrip("/")
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{proto}://{host}"


# ── Setup ───────────────────────────────────────────────────────────────────
def setup_lab_files(app, api_router, db, *, get_current_user, get_current_user_optional, log_access, secret_key: str,
                    uploads_dir: Path, decode_query_token):
    tmp_root = uploads_dir / "scan_tmp"
    tmp_root.mkdir(parents=True, exist_ok=True)

    @app.on_event("startup")
    async def _init_storage_on_start():
        try:
            await run_in_threadpool(init_storage)
            logger.info("object storage ready")
        except Exception as exc:  # pragma: no cover
            logger.warning("object storage init deferred: %s", exc)

    # ── helpers ──
    async def _load(procedure_id: str) -> dict:
        try:
            proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
        except Exception:
            proc = None
        if not proc:
            raise HTTPException(status_code=404, detail="Procedure not found")
        return proc

    def _can_view(proc: dict, user: dict) -> bool:
        uid = user["_id"]
        if user["role"] in ("implant_incharge", "administrator", "nurse"):
            return True
        return uid in (proc.get("student_id"), proc.get("created_by_id"), proc.get("supervisor_id"), proc.get("assistant_id")) \
            or uid in (proc.get("previous_students") or [])

    def _can_edit(proc: dict, user: dict) -> bool:
        uid = user["_id"]
        return uid in (proc.get("student_id"), proc.get("created_by_id")) or user["role"] in ("implant_incharge", "administrator")

    def _files(proc: dict) -> List[dict]:
        return [f for f in (proc.get("scan_files") or []) if not f.get("deleted")]

    def _sign(payload: dict) -> str:
        b64 = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).rstrip(b"=")
        sig = base64.urlsafe_b64encode(hmac.new(secret_key.encode(), b64, hashlib.sha256).digest()).rstrip(b"=")
        return f"{b64.decode()}.{sig.decode()}"

    def _verify(token: str) -> Optional[dict]:
        try:
            b64, sig_b64 = token.split(".", 1)
            expected = hmac.new(secret_key.encode(), b64.encode(), hashlib.sha256).digest()
            got = base64.urlsafe_b64decode(sig_b64 + "=" * (-len(sig_b64) % 4))
            if not hmac.compare_digest(expected, got):
                return None
            data = json.loads(base64.urlsafe_b64decode(b64 + "=" * (-len(b64) % 4)))
            if int(data.get("e", 0)) < int(datetime.now(timezone.utc).timestamp()):
                return None
            return data
        except Exception:
            return None

    async def _resolve_share(token: str) -> dict:
        data = _verify(token)
        if not data:
            raise HTTPException(status_code=410, detail="This lab link has expired or is invalid.")
        proc = await _load(data["p"])
        share = proc.get("lab_share") or {}
        if share.get("revoked") or share.get("nonce") != data.get("n"):
            raise HTTPException(status_code=410, detail="This lab link has been revoked.")
        return proc

    def _share_payload(proc: dict, request: Request) -> Optional[dict]:
        share = proc.get("lab_share")
        if not share or share.get("revoked"):
            return None
        return {
            "url": f"{_public_base(request)}/api/lab/{share['token']}",
            "expires_at": share.get("expires_at"),
            "created_at": share.get("created_at"),
            "created_by_name": share.get("created_by_name"),
            "has_slip": bool(share.get("slip_path")),
            "downloads": share.get("downloads", 0),
            "emails_sent": share.get("emails_sent", []),
        }

    def _summary(proc: dict, request: Request) -> dict:
        return {
            "files": [{k: v for k, v in f.items() if k != "storage_path"} for f in _files(proc)],
            "scan_portal_link": proc.get("scan_portal_link") or "",
            "lab_share": _share_payload(proc, request),
            "chunk_size": CHUNK_SIZE,
            "max_file_bytes": MAX_FILE_BYTES,
        }

    # ── scan files: list / upload (chunked) / delete / download ──
    @api_router.get("/procedures/{procedure_id}/scan-files")
    async def list_scan_files(procedure_id: str, request: Request, current_user: dict = Depends(get_current_user)):
        proc = await _load(procedure_id)
        if not _can_view(proc, current_user):
            raise HTTPException(status_code=403, detail="Access denied")
        return _summary(proc, request)

    @api_router.post("/procedures/{procedure_id}/scan-files/init")
    async def init_scan_upload(procedure_id: str, body: ScanUploadInit, current_user: dict = Depends(get_current_user)):
        proc = await _load(procedure_id)
        if not _can_edit(proc, current_user):
            raise HTTPException(status_code=403, detail="Only the case owner can attach scan files")
        ext = _ext(body.filename)
        if ext not in ALLOWED_EXT:
            raise HTTPException(status_code=400, detail="Allowed file types: STL, PLY, OBJ, ZIP, DCM, PDF")
        if len(_files(proc)) >= MAX_FILES_PER_CASE:
            raise HTTPException(status_code=400, detail=f"Maximum {MAX_FILES_PER_CASE} files per case")
        upload_id = uuid.uuid4().hex
        (tmp_root / upload_id).mkdir(parents=True, exist_ok=True)
        await db.scan_uploads.insert_one({
            "upload_id": upload_id, "procedure_id": procedure_id, "user_id": current_user["_id"],
            "filename": body.filename, "size": body.size, "mime": body.mime or MIME_BY_EXT.get(ext, "application/octet-stream"),
            "total_chunks": (body.size + CHUNK_SIZE - 1) // CHUNK_SIZE, "received": [], "created_at": datetime.utcnow(),
        })
        return {"upload_id": upload_id, "chunk_size": CHUNK_SIZE, "total_chunks": (body.size + CHUNK_SIZE - 1) // CHUNK_SIZE}

    @api_router.put("/procedures/{procedure_id}/scan-files/{upload_id}/chunk/{index}")
    async def put_scan_chunk(procedure_id: str, upload_id: str, index: int, request: Request,
                             encoding: Optional[str] = Query(None), current_user: dict = Depends(get_current_user)):
        up = await db.scan_uploads.find_one({"upload_id": upload_id, "procedure_id": procedure_id, "user_id": current_user["_id"]})
        if not up:
            raise HTTPException(status_code=404, detail="Upload session not found")
        if index < 0 or index >= up["total_chunks"]:
            raise HTTPException(status_code=400, detail="Bad chunk index")
        raw = await request.body()
        if encoding == "base64":
            raw = base64.b64decode(raw)
        if len(raw) > CHUNK_SIZE + 1024:
            raise HTTPException(status_code=413, detail="Chunk too large")
        (tmp_root / upload_id / f"{index:06d}").write_bytes(raw)
        await db.scan_uploads.update_one({"upload_id": upload_id}, {"$addToSet": {"received": index}})
        return {"ok": True, "index": index}

    @api_router.post("/procedures/{procedure_id}/scan-files/{upload_id}/complete")
    async def complete_scan_upload(procedure_id: str, upload_id: str, request: Request, current_user: dict = Depends(get_current_user)):
        up = await db.scan_uploads.find_one({"upload_id": upload_id, "procedure_id": procedure_id, "user_id": current_user["_id"]})
        if not up:
            raise HTTPException(status_code=404, detail="Upload session not found")
        missing = [i for i in range(up["total_chunks"]) if i not in set(up.get("received", []))]
        if missing:
            raise HTTPException(status_code=400, detail=f"Missing chunks: {missing[:5]}{'…' if len(missing) > 5 else ''}")
        folder = tmp_root / upload_id
        ext = _ext(up["filename"])
        tmp = tempfile.NamedTemporaryFile(delete=False, dir=str(tmp_root), suffix=ext)
        size = 0
        sha = hashlib.sha256()
        try:
            for i in range(up["total_chunks"]):
                data = (folder / f"{i:06d}").read_bytes()
                tmp.write(data); size += len(data); sha.update(data)
            tmp.flush()
            if size != up["size"]:
                raise HTTPException(status_code=400, detail=f"Size mismatch (expected {up['size']}, got {size})")
            file_id = uuid.uuid4().hex
            storage_path = f"{APP_NAME}/scan-files/{procedure_id}/{file_id}{ext}"
            with open(tmp.name, "rb") as fh:
                await run_in_threadpool(put_object_file, storage_path, fh, up["mime"])
        finally:
            tmp.close()
            try:
                os.unlink(tmp.name)
            except OSError:
                pass
            shutil.rmtree(folder, ignore_errors=True)
            await db.scan_uploads.delete_one({"upload_id": upload_id})
        entry = {
            "file_id": file_id, "name": up["filename"], "size": size, "mime": up["mime"], "ext": ext.lstrip("."),
            "sha256": sha.hexdigest(), "storage_path": storage_path,
            "uploaded_by": current_user["_id"], "uploaded_by_name": current_user.get("name"),
            "uploaded_at": datetime.utcnow().isoformat(),
        }
        await db.procedures.update_one({"_id": ObjectId(procedure_id)}, {"$push": {"scan_files": entry}})
        await log_access(action="scan_file_uploaded", resource_type="procedure", resource_id=procedure_id, user=current_user,
                         request=request, extra={"file": up["filename"], "size": size})
        return _summary(await _load(procedure_id), request)

    @api_router.delete("/procedures/{procedure_id}/scan-files/{file_id}")
    async def delete_scan_file(procedure_id: str, file_id: str, request: Request, current_user: dict = Depends(get_current_user)):
        proc = await _load(procedure_id)
        if not _can_edit(proc, current_user):
            raise HTTPException(status_code=403, detail="Only the case owner can remove scan files")
        await db.procedures.update_one(
            {"_id": ObjectId(procedure_id), "scan_files.file_id": file_id},
            {"$set": {"scan_files.$.deleted": True, "scan_files.$.deleted_at": datetime.utcnow().isoformat(), "scan_files.$.deleted_by": current_user["_id"]}},
        )
        await log_access(action="scan_file_removed", resource_type="procedure", resource_id=procedure_id, user=current_user,
                         request=request, extra={"file_id": file_id})
        return _summary(await _load(procedure_id), request)

    def _stream_file(f: dict):
        resp = open_object_stream(f["storage_path"])
        headers = {"Content-Disposition": f'attachment; filename="{f["name"]}"', "Content-Length": str(f["size"])}
        return StreamingResponse(resp.iter_content(chunk_size=1024 * 256), media_type=f.get("mime") or "application/octet-stream", headers=headers)

    @api_router.get("/procedures/{procedure_id}/scan-files/{file_id}/download")
    async def download_scan_file(procedure_id: str, file_id: str, request: Request, token: Optional[str] = Query(None),
                                 current_user: Optional[dict] = Depends(get_current_user_optional)):
        user = current_user or (await decode_query_token(token) if token else None)
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")
        proc = await _load(procedure_id)
        if not _can_view(proc, user):
            raise HTTPException(status_code=403, detail="Access denied")
        f = next((x for x in _files(proc) if x["file_id"] == file_id), None)
        if not f:
            raise HTTPException(status_code=404, detail="File not found")
        await log_access(action="scan_file_download", resource_type="procedure", resource_id=procedure_id, user=user,
                         request=request, extra={"file": f["name"]})
        return await run_in_threadpool(_stream_file, f)

    # ── portal link ──
    @api_router.put("/procedures/{procedure_id}/scan-link")
    async def set_scan_link(procedure_id: str, body: ScanLinkIn, request: Request, current_user: dict = Depends(get_current_user)):
        proc = await _load(procedure_id)
        if not _can_edit(proc, current_user):
            raise HTTPException(status_code=403, detail="Only the case owner can set the scan link")
        url = (body.url or "").strip()
        if url:
            if not url.lower().startswith(("http://", "https://")):
                url = "https://" + url
            parsed = urlparse(url)
            if not parsed.netloc or "." not in parsed.netloc:
                raise HTTPException(status_code=400, detail="Please enter a valid link (e.g. https://…)")
        await db.procedures.update_one({"_id": ObjectId(procedure_id)}, {"$set": {"scan_portal_link": url}})
        await log_access(action="scan_link_set", resource_type="procedure", resource_id=procedure_id, user=current_user,
                         request=request, extra={"url": url})
        return _summary(await _load(procedure_id), request)

    # ── lab share (secure link + QR) ──
    @api_router.post("/procedures/{procedure_id}/lab-share")
    async def create_lab_share(procedure_id: str, request: Request, current_user: dict = Depends(get_current_user)):
        proc = await _load(procedure_id)
        if not _can_edit(proc, current_user) and current_user["_id"] != proc.get("supervisor_id"):
            raise HTTPException(status_code=403, detail="Not permitted")
        share = proc.get("lab_share") or {}
        exp_dt = None
        if share and not share.get("revoked") and share.get("expires_at"):
            try:
                exp_dt = datetime.fromisoformat(share["expires_at"])
            except Exception:
                exp_dt = None
        if not exp_dt or exp_dt < datetime.now(timezone.utc) + timedelta(days=1):
            nonce = uuid.uuid4().hex[:12]
            exp_dt = datetime.now(timezone.utc) + timedelta(days=LAB_LINK_DAYS)
            token = _sign({"p": procedure_id, "e": int(exp_dt.timestamp()), "n": nonce})
            share = {
                "token": token, "nonce": nonce, "expires_at": exp_dt.isoformat(), "created_at": datetime.utcnow().isoformat(),
                "created_by": current_user["_id"], "created_by_name": current_user.get("name"), "revoked": False,
                "downloads": 0, "emails_sent": [], "slip_path": share.get("slip_path") if share else None,
            }
            await db.procedures.update_one({"_id": ObjectId(procedure_id)}, {"$set": {"lab_share": share}})
            await log_access(action="lab_link_created", resource_type="procedure", resource_id=procedure_id, user=current_user, request=request)
        url = f"{_public_base(request)}/api/lab/{share['token']}"
        import qrcode
        img = qrcode.make(url)
        buf = io.BytesIO(); img.save(buf, format="PNG")
        return {"url": url, "expires_at": share["expires_at"], "qr_png_base64": base64.b64encode(buf.getvalue()).decode()}

    @api_router.put("/procedures/{procedure_id}/lab-share/slip")
    async def store_lab_slip(procedure_id: str, body: LabShareSlipIn, request: Request, current_user: dict = Depends(get_current_user)):
        """Frontend renders the Lab Slip HTML on-device; we keep a copy so the
        lab download page can offer it alongside the scan files."""
        proc = await _load(procedure_id)
        if not _can_edit(proc, current_user) and current_user["_id"] != proc.get("supervisor_id"):
            raise HTTPException(status_code=403, detail="Not permitted")
        if not proc.get("lab_share"):
            raise HTTPException(status_code=400, detail="Create the lab link first")
        path = f"{APP_NAME}/lab-slips/{procedure_id}/{uuid.uuid4().hex}.html"
        await run_in_threadpool(put_object_file, path, io.BytesIO(body.slip_html.encode("utf-8")), "text/html; charset=utf-8")
        await db.procedures.update_one({"_id": ObjectId(procedure_id)}, {"$set": {"lab_share.slip_path": path, "lab_share.slip_updated_at": datetime.utcnow().isoformat()}})
        return {"ok": True}

    @api_router.post("/procedures/{procedure_id}/lab-share/revoke")
    async def revoke_lab_share(procedure_id: str, request: Request, current_user: dict = Depends(get_current_user)):
        proc = await _load(procedure_id)
        if not _can_edit(proc, current_user):
            raise HTTPException(status_code=403, detail="Not permitted")
        await db.procedures.update_one({"_id": ObjectId(procedure_id)}, {"$set": {"lab_share.revoked": True, "lab_share.revoked_at": datetime.utcnow().isoformat()}})
        await log_access(action="lab_link_revoked", resource_type="procedure", resource_id=procedure_id, user=current_user, request=request)
        return _summary(await _load(procedure_id), request)

    # ── Lab directory ──
    @api_router.get("/labs")
    async def list_labs(current_user: dict = Depends(get_current_user)):
        docs = await db.labs.find({"deleted": {"$ne": True}}).sort("name", 1).to_list(500)
        return [{"id": str(d.pop("_id")), **{k: v for k, v in d.items() if k != "deleted"}} for d in docs]

    def _faculty(user: dict):
        if user["role"] not in ("implant_incharge", "administrator"):
            raise HTTPException(status_code=403, detail="Only the Implant In-Charge can manage the lab directory")

    @api_router.post("/labs")
    async def create_lab(body: LabIn, current_user: dict = Depends(get_current_user)):
        _faculty(current_user)
        email = body.email.strip().lower()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
            raise HTTPException(status_code=400, detail="Please enter a valid email address")
        doc = {**body.model_dump(), "email": email, "created_by": current_user["_id"], "created_at": datetime.utcnow()}
        r = await db.labs.insert_one(doc)
        return {"id": str(r.inserted_id)}

    @api_router.put("/labs/{lab_id}")
    async def update_lab(lab_id: str, body: LabIn, current_user: dict = Depends(get_current_user)):
        _faculty(current_user)
        email = body.email.strip().lower()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
            raise HTTPException(status_code=400, detail="Please enter a valid email address")
        await db.labs.update_one({"_id": ObjectId(lab_id)}, {"$set": {**body.model_dump(), "email": email, "updated_at": datetime.utcnow()}})
        return {"ok": True}

    @api_router.delete("/labs/{lab_id}")
    async def delete_lab(lab_id: str, current_user: dict = Depends(get_current_user)):
        _faculty(current_user)
        await db.labs.update_one({"_id": ObjectId(lab_id)}, {"$set": {"deleted": True}})
        return {"ok": True}

    # ── Email lab ──
    @api_router.post("/procedures/{procedure_id}/lab-share/email")
    async def email_lab(procedure_id: str, body: LabEmailIn, request: Request, current_user: dict = Depends(get_current_user)):
        proc = await _load(procedure_id)
        if not _can_edit(proc, current_user) and current_user["_id"] != proc.get("supervisor_id"):
            raise HTTPException(status_code=403, detail="Not permitted")
        share = proc.get("lab_share")
        if not share or share.get("revoked"):
            raise HTTPException(status_code=400, detail="Create the lab link first (Generate Lab Slip)")
        try:
            lab = await db.labs.find_one({"_id": ObjectId(body.lab_id), "deleted": {"$ne": True}})
        except Exception:
            lab = None
        if not lab:
            raise HTTPException(status_code=404, detail="Lab not found in directory")
        sent_today = [e for e in share.get("emails_sent", []) if e.get("at", "")[:10] == datetime.utcnow().date().isoformat()]
        if len(sent_today) >= 5:
            raise HTTPException(status_code=429, detail="Daily email limit reached for this case")
        url = f"{_public_base(request)}/api/lab/{share['token']}"
        files = _files(proc)
        exp = (share.get("expires_at") or "")[:10]
        rows = "".join(f"<li>{escape(f['name'])} ({_fmt_size(f['size'])})</li>" for f in files)
        html = (
            '<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#222">'
            f'<h2 style="margin:0 0 12px;color:#1565C0">{escape(EMAIL_FROM_NAME)} — Lab Slip &amp; digital scan files</h2>'
            f'<p>Hello {escape(lab.get("contact_person") or lab["name"])},</p>'
            f'<p>{escape(current_user.get("name") or "The operator")} has shared a lab slip'
            f'{" and " + str(len(files)) + " digital scan file(s)" if files else ""} for patient '
            f'<strong>{escape(proc.get("patient_name") or "")}</strong> (Reg. {escape(str(proc.get("registration_number") or ""))}).</p>'
            f'{"<ul>" + rows + "</ul>" if rows else ""}'
            f'<p><a href="{escape(url)}" style="display:inline-block;padding:12px 18px;background:#1565C0;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Open lab slip &amp; download files</a></p>'
            f'<p style="font-size:12px;color:#555">This secure link works until {escape(exp)} and does not require a login.</p>'
            f'<p style="font-size:12px;color:#888">Sent by {escape(EMAIL_FROM_NAME)} on behalf of the prosthodontics department. '
            'We never ask for passwords or payment details by email.</p></td></tr></table>'
        )
        subject = f"Lab slip & scan files — {proc.get('patient_name') or 'patient'} (Reg. {proc.get('registration_number') or ''})"
        email_id = await send_email(to=lab["email"], subject=subject, html=html)
        entry = {"lab_id": body.lab_id, "lab_name": lab["name"], "to": lab["email"], "by": current_user.get("name"),
                 "at": datetime.utcnow().isoformat(), "email_id": email_id}
        await db.procedures.update_one({"_id": ObjectId(procedure_id)}, {"$push": {"lab_share.emails_sent": entry}})
        await log_access(action="lab_email_sent", resource_type="procedure", resource_id=procedure_id, user=current_user,
                         request=request, extra={"lab": lab["name"], "to": lab["email"]})
        return {"ok": True, "sent": entry}

    # ── Public lab page (token) ──
    async def _count_download(proc: dict, request: Request, what: str):
        await db.procedures.update_one({"_id": proc["_id"]}, {"$inc": {"lab_share.downloads": 1}})
        await db.access_logs.insert_one({
            "action": "lab_download", "resource_type": "procedure", "resource_id": str(proc["_id"]), "outcome": "success",
            "user_id": None, "user_name": "lab (token link)", "ip": request.headers.get("x-forwarded-for", request.client.host if request.client else ""),
            "extra": {"what": what}, "timestamp": datetime.utcnow(),
        })

    @api_router.get("/lab/{token}", response_class=HTMLResponse)
    async def lab_page(token: str, request: Request):
        try:
            proc = await _resolve_share(token)
        except HTTPException as e:
            return HTMLResponse(f"<html><body style='font-family:Arial;padding:40px;text-align:center'><h2>Link unavailable</h2><p>{escape(e.detail)}</p></body></html>", status_code=e.status_code)
        share = proc["lab_share"]
        files = _files(proc)
        base = f"{_public_base(request)}/api/lab/{token}"
        rows = "".join(
            f"<tr><td style='padding:10px;border-bottom:1px solid #eee'>{escape(f['name'])}</td>"
            f"<td style='padding:10px;border-bottom:1px solid #eee;color:#666'>{_fmt_size(f['size'])}</td>"
            f"<td style='padding:10px;border-bottom:1px solid #eee'><a href='{base}/files/{f['file_id']}' style='color:#1565C0;font-weight:bold'>Download</a></td></tr>"
            for f in files)
        link = proc.get("scan_portal_link") or ""
        exp = (share.get("expires_at") or "")[:10]
        html = f"""<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>
<title>Lab slip — {escape(proc.get('patient_name') or '')}</title></head>
<body style='font-family:Arial,sans-serif;background:#F5F7FB;margin:0;padding:24px'>
<div style='max-width:720px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 2px 10px rgba(0,0,0,.06)'>
<h1 style='margin:0 0 4px;color:#1565C0;font-size:22px'>{escape(EMAIL_FROM_NAME)} — Lab Slip &amp; digital scan files</h1>
<p style='margin:0 0 18px;color:#666'>Patient <strong>{escape(proc.get('patient_name') or '')}</strong> · Reg. {escape(str(proc.get('registration_number') or ''))} · Operator {escape(proc.get('student_name') or proc.get('created_by_name') or '')}</p>
<div style='display:flex;gap:12px;flex-wrap:wrap;margin-bottom:22px'>
{f"<a href='{base}/slip' style='padding:12px 18px;background:#E65100;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold'>Open Lab Slip (print / save as PDF)</a>" if share.get('slip_path') else "<span style='padding:12px 18px;background:#eee;color:#888;border-radius:8px'>Lab slip not attached yet</span>"}
{f"<a href='{base}/zip' style='padding:12px 18px;background:#1565C0;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold'>Download all files (ZIP)</a>" if files else ""}
{f"<a href='{escape(link)}' target='_blank' rel='noopener' style='padding:12px 18px;background:#2E7D32;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold'>Open scanner portal link</a>" if link else ""}
</div>
<h3 style='margin:0 0 8px;font-size:15px;color:#333'>Digital scan files ({len(files)})</h3>
{('<table style="width:100%;border-collapse:collapse;font-size:14px">' + rows + '</table>') if files else "<p style='color:#888'>No files attached.</p>"}
<p style='margin-top:24px;font-size:12px;color:#888'>Secure link valid until {escape(exp)}. Downloads are logged for patient-data compliance. Sent by {escape(EMAIL_FROM_NAME)}.</p>
</div></body></html>"""
        return HTMLResponse(html)

    @api_router.get("/lab/{token}/files/{file_id}")
    async def lab_file(token: str, file_id: str, request: Request):
        proc = await _resolve_share(token)
        f = next((x for x in _files(proc) if x["file_id"] == file_id), None)
        if not f:
            raise HTTPException(status_code=404, detail="File not found")
        await _count_download(proc, request, f["name"])
        return await run_in_threadpool(_stream_file, f)

    @api_router.get("/lab/{token}/slip", response_class=HTMLResponse)
    async def lab_slip(token: str, request: Request):
        proc = await _resolve_share(token)
        path = (proc.get("lab_share") or {}).get("slip_path")
        if not path:
            raise HTTPException(status_code=404, detail="Lab slip not attached")
        resp = await run_in_threadpool(open_object_stream, path)
        await _count_download(proc, request, "lab_slip")
        return HTMLResponse(resp.content.decode("utf-8", errors="replace"))

    @api_router.get("/lab/{token}/zip")
    async def lab_zip(token: str, request: Request, background: BackgroundTasks):
        proc = await _resolve_share(token)
        files = _files(proc)
        if not files:
            raise HTTPException(status_code=404, detail="No files")

        def build():
            tmp = tempfile.NamedTemporaryFile(delete=False, dir=str(tmp_root), suffix=".zip")
            tmp.close()
            with zipfile.ZipFile(tmp.name, "w", zipfile.ZIP_STORED) as zf:
                for f in files:
                    resp = open_object_stream(f["storage_path"])
                    with zf.open(f["name"], "w") as dest:
                        for chunk in resp.iter_content(chunk_size=1024 * 512):
                            dest.write(chunk)
            return tmp.name

        zpath = await run_in_threadpool(build)
        await _count_download(proc, request, "zip")
        background.add_task(lambda: os.path.exists(zpath) and os.unlink(zpath))
        safe_name = re.sub(r"[^A-Za-z0-9_-]+", "_", proc.get("patient_name") or "case")
        return FileResponse(zpath, media_type="application/zip", filename=f"ScanFiles_{safe_name}.zip")
