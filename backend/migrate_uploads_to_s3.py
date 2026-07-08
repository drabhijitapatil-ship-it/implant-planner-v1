"""One-time backfill: push every file already sitting in backend/uploads/
(CBCT scans, consent forms, checklist files, photos, forum/chat attachments)
up to S3, so old documents get the same durability/fallback as new ones.

Safe to re-run — by default it skips objects that already exist in S3
(cheap HEAD check), so interrupting and restarting just resumes.

Usage:
    cd backend
    python3 migrate_uploads_to_s3.py             # migrate everything
    python3 migrate_uploads_to_s3.py --dry-run    # list what WOULD upload, no writes
    python3 migrate_uploads_to_s3.py --force      # re-upload even if already in S3

Requires AWS_S3_BUCKET (+ AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION)
to already be set in backend/.env — same env this script's directory uses.
"""
import argparse
import mimetypes
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
UPLOADS_DIR = ROOT_DIR / "uploads"
load_dotenv(ROOT_DIR / ".env")

import s3_storage  # noqa: E402 — after load_dotenv so AWS_* env vars are populated


def _object_exists(key: str) -> bool:
    try:
        s3_storage._get_client().head_object(Bucket=s3_storage._S3_BUCKET, Key=key)
        return True
    except Exception:
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="List files that would be uploaded; upload nothing.")
    parser.add_argument("--force", action="store_true", help="Re-upload even if the object already exists in S3.")
    args = parser.parse_args()

    if not s3_storage.is_configured():
        print("AWS_S3_BUCKET is not set in backend/.env — nothing to migrate to. Aborting.")
        return 1

    if not UPLOADS_DIR.exists():
        print(f"No local uploads directory at {UPLOADS_DIR} — nothing to migrate.")
        return 0

    files = sorted(p for p in UPLOADS_DIR.rglob("*") if p.is_file())
    if not files:
        print("uploads/ is empty — nothing to migrate.")
        return 0

    print(f"Found {len(files)} local file(s) under {UPLOADS_DIR}")
    print(f"Target bucket: {s3_storage._S3_BUCKET} (region {s3_storage._S3_REGION})")
    if args.dry_run:
        print("--dry-run: no uploads will happen.\n")

    uploaded = skipped = failed = 0
    for i, path in enumerate(files, 1):
        key = s3_storage._key_for(path, UPLOADS_DIR)
        prefix = f"[{i}/{len(files)}] {key}"

        if not args.force and not args.dry_run and _object_exists(key):
            print(f"{prefix} — already in S3, skipping")
            skipped += 1
            continue

        if args.dry_run:
            print(f"{prefix} — would upload ({path.stat().st_size:,} bytes)")
            continue

        content_type = mimetypes.guess_type(str(path))[0]
        ok = s3_storage.put_file(path, UPLOADS_DIR, content_type)
        if ok:
            print(f"{prefix} — uploaded")
            uploaded += 1
        else:
            print(f"{prefix} — FAILED (see warning above)")
            failed += 1

    print()
    if args.dry_run:
        print(f"Dry run complete: {len(files)} file(s) would be uploaded.")
    else:
        print(f"Done. Uploaded: {uploaded}  Skipped (already in S3): {skipped}  Failed: {failed}")
        if failed:
            print("Re-run the same command to retry failures — already-uploaded files will be skipped automatically.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
