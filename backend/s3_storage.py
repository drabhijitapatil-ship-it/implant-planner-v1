"""S3-backed document storage for CBCT scans, consent forms, radiographs,
photos, and forum/chat attachments.

Design: dual-write, S3-first-read. Every upload site keeps writing to local
disk exactly as before (unchanged, zero regression risk) and ALSO pushes the
same bytes to S3 (best-effort — an S3 hiccup never blocks the local write or
fails the user's upload). Every read site checks local disk first (fast path
within one boot cycle); on a miss it falls back to S3 and re-populates the
local cache. This is what actually fixes "sometimes not visible": previously
a redeploy or instance swap that wiped local disk had no fallback at all —
now S3 is the durable source of truth and local disk is just a warm cache.

All AWS credentials come from environment variables only — never hardcoded:
    AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET
If AWS_S3_BUCKET is unset, every function in this module is a no-op / returns
None so the app keeps working purely off local disk (e.g. local dev without
AWS configured) — S3 is additive, not a hard dependency.
"""
import os
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger("s3_storage")

_S3_BUCKET = os.environ.get("AWS_S3_BUCKET", "").strip()
_S3_REGION = os.environ.get("AWS_REGION", "ap-south-1").strip()

_client = None


def is_configured() -> bool:
    return bool(_S3_BUCKET)


def _get_client():
    """Lazy boto3 client — import + construct only when actually needed, so
    a box without AWS env vars set (or without boto3 installed, in a dev
    environment) never pays the cost or errors on module import."""
    global _client
    if _client is None:
        import boto3  # local import: keep boto3 optional at import time
        _client = boto3.client(
            "s3",
            region_name=_S3_REGION,
            aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
        )
    return _client


def _key_for(local_path: Path, uploads_root: Path) -> str:
    """Mirror the local uploads/ directory structure as the S3 key, e.g.
    uploads/forum/abc.jpg -> "forum/abc.jpg". Keeps S3 keys human-readable
    and makes the local<->S3 mapping obvious for debugging."""
    try:
        rel = local_path.relative_to(uploads_root)
    except ValueError:
        rel = Path(local_path.name)
    return str(rel).replace(os.sep, "/")


def put_file(local_path: Path, uploads_root: Path, content_type: Optional[str] = None) -> bool:
    """Best-effort upload of an already-written local file to S3. Returns
    True on success, False on any failure (logged, never raised) — callers
    must not let an S3 failure break the local upload flow."""
    if not is_configured():
        return False
    try:
        key = _key_for(local_path, uploads_root)
        extra = {"ContentType": content_type} if content_type else {}
        _get_client().upload_file(str(local_path), _S3_BUCKET, key, ExtraArgs=extra or None)
        return True
    except Exception as e:
        logger.warning(f"[s3_storage] put_file failed for {local_path}: {e}")
        return False


def put_bytes(key: str, data: bytes, content_type: Optional[str] = None) -> bool:
    """Upload raw bytes directly (no local file involved) under an explicit
    S3 key. Used where there's no on-disk file to point upload_file at."""
    if not is_configured():
        return False
    try:
        extra = {"ContentType": content_type} if content_type else {}
        _get_client().put_object(Bucket=_S3_BUCKET, Key=key, Body=data, **extra)
        return True
    except Exception as e:
        logger.warning(f"[s3_storage] put_bytes failed for {key}: {e}")
        return False


def fetch_to_local(local_path: Path, uploads_root: Path) -> bool:
    """Download from S3 and write to `local_path`, re-populating the local
    cache after a miss. Returns True if the file now exists locally."""
    if not is_configured():
        return False
    try:
        key = _key_for(local_path, uploads_root)
        local_path.parent.mkdir(parents=True, exist_ok=True)
        _get_client().download_file(_S3_BUCKET, key, str(local_path))
        return True
    except Exception as e:
        logger.warning(f"[s3_storage] fetch_to_local failed for {local_path}: {e}")
        return False


def get_bytes(key: str) -> Optional[bytes]:
    """Direct S3 read, no local file involved."""
    if not is_configured():
        return None
    try:
        resp = _get_client().get_object(Bucket=_S3_BUCKET, Key=key)
        return resp["Body"].read()
    except Exception as e:
        logger.warning(f"[s3_storage] get_bytes failed for {key}: {e}")
        return None


def delete_file(local_path: Path, uploads_root: Path) -> bool:
    if not is_configured():
        return False
    try:
        key = _key_for(local_path, uploads_root)
        _get_client().delete_object(Bucket=_S3_BUCKET, Key=key)
        return True
    except Exception as e:
        logger.warning(f"[s3_storage] delete_file failed for {local_path}: {e}")
        return False


def presigned_url(local_path: Path, uploads_root: Path, expires_in: int = 3600) -> Optional[str]:
    """Time-limited direct-to-S3 URL — an alternative to proxying bytes
    through the FastAPI process for very large files (not wired into any
    route yet; available for a future optimization pass)."""
    if not is_configured():
        return None
    try:
        key = _key_for(local_path, uploads_root)
        return _get_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": _S3_BUCKET, "Key": key},
            ExpiresIn=expires_in,
        )
    except Exception as e:
        logger.warning(f"[s3_storage] presigned_url failed for {local_path}: {e}")
        return None


def ensure_local(local_path: Path, uploads_root: Path) -> bool:
    """The core read-path helper: True if `local_path` exists locally OR was
    just pulled down from S3 to fill the gap. False means the file truly
    doesn't exist anywhere — a genuine 404, not a storage-layer hiccup."""
    if local_path.exists():
        return True
    return fetch_to_local(local_path, uploads_root)
