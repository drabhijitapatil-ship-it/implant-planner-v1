"""Research Module — visit reminders.

Scans active studies and emits in-app notifications:
  • upcoming  — window opens within `days_before` days → data collectors
  • due       — window open today (in_window)          → data collectors
  • overdue   — past window (overdue / missed)          → collectors + PI (+ guide)
Each (enrolment, timepoint, kind) is sent once; overdue repeats every
`overdue_repeat_days`. Studies can tune/disable this via `study.reminders`.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone, timedelta

import research as R

DEFAULTS = {"enabled": True, "days_before": 3, "overdue_repeat_days": 7, "notify_guide_overdue": False}
COLLECTOR_ROLES = ("pi", "co_investigator", "data_collector")


def sanitize_reminders(body) -> dict:
    body = body if isinstance(body, dict) else {}
    out = dict(DEFAULTS)
    out["enabled"] = bool(body.get("enabled", True))
    out["days_before"] = int(min(30, max(0, R._num(body.get("days_before")) if R._num(body.get("days_before")) is not None else 3)))
    out["overdue_repeat_days"] = int(min(60, max(1, R._num(body.get("overdue_repeat_days")) if R._num(body.get("overdue_repeat_days")) is not None else 7)))
    out["notify_guide_overdue"] = bool(body.get("notify_guide_overdue", False))
    return out


async def run_visit_reminders(db) -> dict:
    now = datetime.now(timezone.utc)
    today = R.today()
    summary = {"studies": 0, "upcoming": 0, "due": 0, "overdue": 0, "notifications": 0}
    async for st in db.research_studies.find({"status": {"$in": ["active", "recruitment_closed"]}}):
        cfg = {**DEFAULTS, **(st.get("reminders") or {})}
        if not cfg.get("enabled", True):
            continue
        summary["studies"] += 1
        sid = str(st["_id"])
        tps = {t["key"]: t for t in st.get("timepoints", [])}
        collectors = {m["user_id"] for m in st.get("members", []) if m.get("role") in COLLECTOR_ROLES}
        if st.get("pi_user_id"):
            collectors.add(st["pi_user_id"])
        pi_targets = {st.get("pi_user_id")} if st.get("pi_user_id") else set()
        if cfg.get("notify_guide_overdue") and st.get("guide_user_id"):
            pi_targets.add(st["guide_user_id"])
        async for e in db.research_enrolments.find({"study_id": sid, "status": {"$in": ["enrolled", "active"]}}):
            targets = set(collectors)
            if e.get("enrolled_by_id"):
                targets.add(e["enrolled_by_id"])
            targets |= {c["user_id"] for c in e.get("collaborators") or [] if c.get("user_id")}  # treating clinicians of included cases
            for f in e.get("forms", []):
                tp = tps.get(f["timepoint_key"], {})
                if not f.get("due_date"):
                    continue
                status = R.form_status(f, tp)
                ws = R._to_date(f.get("window_start"))
                if status == "not_due" and ws and 0 <= (ws - today).days <= cfg["days_before"]:
                    kind, recipients = "upcoming", targets
                    msg = f"Research visit soon: {st['code']} · {e['subject_code']} · {f.get('label')} — window opens {f['window_start']} (due {f['due_date']})"
                elif status == "in_window":
                    kind, recipients = "due", targets
                    msg = f"Research visit due now: {st['code']} · {e['subject_code']} · {f.get('label')} — due {f['due_date']}, window closes {f['window_end']}"
                elif status in ("overdue", "missed"):
                    kind, recipients = "overdue", targets | pi_targets
                    days = (today - R._to_date(f["due_date"])).days
                    msg = f"{'Missed' if status == 'missed' else 'Overdue'} research form: {st['code']} · {e['subject_code']} · {f.get('label')} — {days} days past due"
                else:
                    continue
                key = {"study_id": sid, "enrolment_id": str(e["_id"]), "timepoint_key": f["timepoint_key"], "kind": kind}
                prev = await db.research_reminders.find_one(key)
                if prev:
                    sent_at = prev["sent_at"] if prev["sent_at"].tzinfo else prev["sent_at"].replace(tzinfo=timezone.utc)
                    if kind != "overdue" or (now - sent_at) < timedelta(days=cfg["overdue_repeat_days"]):
                        continue
                docs = [{"user_id": uid, "message": msg[:200], "type": "research_visit", "read": False, "created_at": now,
                         "research_study_id": sid, "research_enrolment_id": str(e["_id"]), "timepoint_key": f["timepoint_key"],
                         "reminder_kind": kind} for uid in recipients if uid]
                if docs:
                    await db.notifications.insert_many(docs)
                await db.research_reminders.update_one(key, {"$set": {**key, "sent_at": now, "user_ids": sorted(x for x in recipients if x), "status": status},
                                                             "$inc": {"times": 1}}, upsert=True)
                summary[kind] += 1
                summary["notifications"] += len(docs)
        await db.research_studies.update_one({"_id": st["_id"]}, {"$set": {"last_reminder_run": now.isoformat()}})
    return summary


async def reminder_loop(db, interval_seconds: int = 6 * 3600, initial_delay: int = 45):
    await asyncio.sleep(initial_delay)
    while True:
        try:
            s = await run_visit_reminders(db)
            logging.info("Research visit reminders: %s", s)
        except Exception as ex:  # never let the loop die
            logging.exception("Research visit reminder run failed: %s", ex)
        await asyncio.sleep(interval_seconds)
