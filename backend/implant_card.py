"""Implant Information Card (IIC).

Issued automatically when a treatment is marked complete. Two sides:
  P (Patient) — name, age/sex, implant count + FDI sites, placement date,
                final prosthesis date.
  I (Implant) — prosthesis type + per-implant company/name, dimensions,
                model, lot and serial (from the DataMatrix traceability scan).

Card content is always built live from the procedure so corrections flow
through; only the card number / issue metadata / verify token are stored on
`procedure.implant_card`. A public verify page (QR) shows implant details only
— never the patient's identity.
"""
import io
import html
import secrets
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

import qrcode
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
from fpdf import FPDF
from pydantic import BaseModel, Field

NOT_RECORDED = "Not recorded"
REISSUE_ROLES = {"supervisor", "implant_incharge", "administrator"}
SETTINGS_ROLES = {"implant_incharge", "administrator"}
DEFAULT_INSTITUTION = "Implanr"


def _fmt_date(v: Any) -> str:
    if not v:
        return NOT_RECORDED
    if isinstance(v, datetime):
        return v.strftime("%d %b %Y")
    s = str(v)[:10]
    try:
        return datetime.strptime(s, "%Y-%m-%d").strftime("%d %b %Y")
    except ValueError:
        return str(v)


def _with_other(src: Dict[str, Any], field: str) -> Optional[str]:
    v = src.get(field)
    if not v:
        return None
    other = src.get(f"{field}_other")
    if other and str(v).strip().lower().startswith("other"):
        return str(other)
    return str(v)


def _prosthesis_type(proc: Dict[str, Any]) -> str:
    p4 = proc.get("phase4_step1_data") or {}
    for src, fields in (
        (p4, ("ma_final_prosthesis_type", "fa_final_prosthetic_plan", "zp_final_prosthetic_plan", "final_prosthetic_plan")),
        (proc, ("ma_prosthesis_type", "fa_prosthetic_plan", "zp_prosthetic_plan", "prosthetic_plan")),
    ):
        for f in fields:
            v = _with_other(src, f)
            if v:
                return v
    for src, pre in ((p4, "sc_final_"), (proc, "sc_")):
        mat = _with_other(src, f"{pre}crown_material")
        ret = _with_other(src, f"{pre}retention_type")
        if mat or ret:
            return "Single crown" + "".join(f" - {x}" for x in (mat, ret) if x)
    p2 = proc.get("phase2_data") or {}
    return _with_other(p2, "prosthesis_type") or NOT_RECORDED


def _num(v: Any) -> str:
    if v in (None, ""):
        return ""
    try:
        f = float(v)
        return str(int(f)) if f.is_integer() else str(f)
    except (TypeError, ValueError):
        return str(v)


def build_card(proc: Dict[str, Any], resolve_implants: Callable, institution: str) -> Dict[str, Any]:
    trace = (proc.get("phase2_data") or {}).get("implant_traceability") or {}
    p1 = proc.get("phase1_data") or {}
    implants: List[Dict[str, Any]] = []
    for i, imp in enumerate(resolve_implants(proc) or []):
        if imp.get("_active_in_treatment") is False or imp.get("_survival_status") == "Failed":
            continue
        site = str(imp.get("tooth_number") or imp.get("tooth") or imp.get("position") or "").strip()
        r0_site = str((imp.get("_r0") or {}).get("tooth_number") or site)
        t = trace.get(site) or trace.get(r0_site) or trace.get(f"idx{i}") or {}
        if imp.get("_r0") and imp.get("_survival_status") == "Replaced":
            t = {"lot": imp.get("lot_number"), "serial": imp.get("serial_number"), "model_label": None}
        brand = (imp.get("brand") or "").strip()
        system = (imp.get("system") or "").strip()
        company = " ".join(x for x in [brand, system if system != brand else ""] if x) or NOT_RECORDED
        d, ln = _num(imp.get("diameter")), _num(imp.get("length"))
        dims = f"{d} x {ln} mm" if d and ln else (f"Dia {d} mm" if d else (f"L {ln} mm" if ln else NOT_RECORDED))
        model = t.get("model_label") or " ".join(x for x in [t.get("model_brand"), t.get("model_system")] if x) or t.get("gtin")
        implants.append({
            "site": site or f"#{i + 1}",
            "company": company,
            "dimensions": dims,
            "model": model or NOT_RECORDED,
            "lot": t.get("lot") or NOT_RECORDED,
            "serial": t.get("serial") or NOT_RECORDED,
            "replaced": imp.get("_survival_status") == "Replaced",
            "_scan_brand": (t.get("model_brand") or "").strip(),
            "_plan_brand": brand,
        })
    age = proc.get("age") or p1.get("age") or ""
    sex = proc.get("sex") or p1.get("sex") or ""
    missing = [f"Implant {x['site']}: {', '.join(k for k in ('lot', 'serial') if x[k] == NOT_RECORDED)} not recorded"
               for x in implants if NOT_RECORDED in (x["lot"], x["serial"])]
    for x in implants:
        sb, pb = x.pop("_scan_brand"), x.pop("_plan_brand")
        if sb and pb and sb.lower() not in pb.lower() and pb.lower() not in sb.lower():
            missing.append(f"Implant {x['site']}: scanned box brand ({sb}) does not match the recorded implant ({pb})")
    meta = proc.get("implant_card") or {}
    return {
        "card_number": meta.get("card_number"),
        "issued_at": meta.get("issued_at"),
        "reissued_at": meta.get("reissued_at"),
        "revision": meta.get("revision", 1),
        "verify_token": meta.get("verify_token"),
        "institution": institution,
        "patient": {
            "name": proc.get("patient_name") or NOT_RECORDED,
            "age_sex": " / ".join(x for x in [f"{age} yrs" if age else "", sex] if x) or NOT_RECORDED,
            "implant_count": len(implants),
            "locations": ", ".join(x["site"] for x in implants) or NOT_RECORDED,
            "placement_date": _fmt_date(proc.get("phase2_actual_done_date") or proc.get("procedure_date")),
            "final_prosthesis_date": _fmt_date(proc.get("phase4_step2_done_date") or proc.get("treatment_completed_at")),
        },
        "implant": {"prosthesis_type": _prosthesis_type(proc), "implants": implants},
        "warnings": missing,
    }


# ── PDF (CR80 credit-card size, P side page 1, I side page 2+) ──────────────
CARD_W, CARD_H = 85.6, 54.0
ROWS_PER_PAGE = 4


def _safe(t: Any) -> str:
    return str(t).replace("Ø", "D ").encode("latin-1", "replace").decode("latin-1")


def _fit(pdf: FPDF, text: str, w: float) -> str:
    s = _safe(text)
    while s and pdf.get_string_width(s) > w - 1:
        s = s[:-2] + "~" if len(s) > 2 else ""
    return s


def _wrap2(pdf: FPDF, text: str, w: float) -> List[str]:
    """Split into at most two lines that fit width w (2nd line truncated)."""
    lines, cur = [], ""
    for wd in _safe(text).split(" "):
        trial = f"{cur} {wd}".strip()
        if pdf.get_string_width(trial) <= w - 1 or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = wd
    lines.append(cur)
    if len(lines) > 2:
        lines = [lines[0], " ".join(lines[1:])]
    return [_fit(pdf, ln, w) for ln in lines]


def _band(pdf: FPDF, institution: str, side: str, sub: str):
    pdf.set_fill_color(13, 71, 161)
    pdf.rect(0, 0, CARD_W, 11, "F")
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 7.5)
    pdf.set_xy(3, 1.6)
    pdf.cell(CARD_W - 16, 4, _fit(pdf, institution, CARD_W - 16))
    pdf.set_font("Helvetica", "", 5.5)
    pdf.set_xy(3, 5.8)
    pdf.cell(CARD_W - 16, 3.5, _safe(f"IMPLANT INFORMATION CARD (IIC)  |  {sub}"))
    pdf.set_fill_color(255, 255, 255)
    pdf.ellipse(CARD_W - 11, 1.5, 8, 8, "F")
    pdf.set_text_color(13, 71, 161)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_xy(CARD_W - 11, 3.4)
    pdf.cell(8, 4, side, align="C")
    pdf.set_text_color(33, 33, 33)


def _footer(pdf: FPDF, card: Dict[str, Any], text: str):
    pdf.set_draw_color(200, 210, 225)
    pdf.line(3, CARD_H - 6, CARD_W - 3, CARD_H - 6)
    pdf.set_font("Helvetica", "", 4.8)
    pdf.set_text_color(96, 110, 125)
    pdf.set_xy(3, CARD_H - 5.4)
    issued = _fmt_date(card.get("reissued_at") or card.get("issued_at"))
    rev = f" (rev {card['revision']})" if (card.get("revision") or 1) > 1 else ""
    pdf.cell(CARD_W - 6, 2.4, _safe(f"Card No: {card.get('card_number') or '-'}   Issued: {issued}{rev}"))
    pdf.set_xy(3, CARD_H - 3)
    pdf.cell(CARD_W - 6, 2.4, _safe(text))


def render_pdf(card: Dict[str, Any], verify_url: Optional[str]) -> bytes:
    pdf = FPDF(unit="mm", format=(CARD_W, CARD_H))
    pdf.set_auto_page_break(False)
    pdf.set_margins(0, 0, 0)

    # P side
    pdf.add_page()
    _band(pdf, card["institution"], "P", "Patient")
    p = card["patient"]
    rows = [
        ("Patient Name", p["name"]),
        ("Age and Sex", p["age_sex"]),
        ("No. of Implants & Location (FDI)", f"{p['implant_count']}  -  {p['locations']}"),
        ("Date of Implant Placement", p["placement_date"]),
        ("Date of Final Prosthesis", p["final_prosthesis_date"]),
    ]
    text_w = CARD_W - (27 if verify_url else 6)
    y = 13.2
    for label, val in rows:
        pdf.set_xy(3, y)
        pdf.set_font("Helvetica", "", 4.8)
        pdf.set_text_color(96, 110, 125)
        pdf.cell(text_w, 2.4, _safe(label.upper()))
        pdf.set_xy(3, y + 2.4)
        pdf.set_font("Helvetica", "B", 6.8)
        pdf.set_text_color(33, 33, 33)
        pdf.cell(text_w, 3.4, _fit(pdf, val, text_w))
        y += 6.5
    if verify_url:
        img = qrcode.make(verify_url, box_size=6, border=1)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        pdf.image(buf, x=CARD_W - 23, y=14, w=20, h=20)
        pdf.set_font("Helvetica", "", 4.2)
        pdf.set_text_color(96, 110, 125)
        pdf.set_xy(CARD_W - 24, 34.5)
        pdf.cell(22, 2.2, "Scan to verify implants", align="C")
    _footer(pdf, card, "Please carry this card and show it to any dental or medical professional.")

    # I side (continues on extra pages when many implants)
    imps = card["implant"]["implants"] or [{"site": "-", "company": NOT_RECORDED, "dimensions": "-", "model": "-", "lot": "-", "serial": "-"}]
    chunks = [imps[i:i + ROWS_PER_PAGE] for i in range(0, len(imps), ROWS_PER_PAGE)]
    cols = [("Site", 7), ("Company & Name", 21), ("Dia x Length", 13.6), ("Model", 14), ("Lot No.", 12.5), ("Serial No.", 11.5)]
    for n, chunk in enumerate(chunks):
        pdf.add_page()
        sub = "Implant" + (f"  ({n + 1}/{len(chunks)})" if len(chunks) > 1 else "")
        _band(pdf, card["institution"], "I", sub)
        pdf.set_xy(3, 12.6)
        pdf.set_font("Helvetica", "", 4.8)
        pdf.set_text_color(96, 110, 125)
        pdf.cell(22, 3, "TYPE OF PROSTHESIS")
        pdf.set_font("Helvetica", "B", 6.2)
        pdf.set_text_color(33, 33, 33)
        pdf.cell(CARD_W - 28, 3, _fit(pdf, card["implant"]["prosthesis_type"], CARD_W - 28))
        y = 16.6
        pdf.set_fill_color(227, 242, 253)
        pdf.set_font("Helvetica", "B", 4.8)
        pdf.set_text_color(13, 71, 161)
        x = 3
        for name, w in cols:
            pdf.set_xy(x, y)
            pdf.cell(w, 3.6, name, fill=True)
            x += w
        y += 3.8
        pdf.set_text_color(33, 33, 33)
        for imp in chunk:
            x = 3
            for (key, w) in zip(("site", "company", "dimensions", "model", "lot", "serial"), [c[1] for c in cols]):
                val = imp.get(key) or "-"
                missing = val == NOT_RECORDED
                pdf.set_font("Helvetica", "I" if missing else ("B" if key == "site" else ""), 4.9)
                pdf.set_text_color(183, 28, 28) if missing else pdf.set_text_color(33, 33, 33)
                for k, line in enumerate(_wrap2(pdf, val, w)):
                    pdf.set_xy(x, y + k * 2.6)
                    pdf.cell(w, 2.6, line)
                x += w
            pdf.set_draw_color(225, 230, 238)
            pdf.line(3, y + 5.6, CARD_W - 3, y + 5.6)
            y += 6.4
        _footer(pdf, card, "Model, lot & serial numbers are from the implant box DataMatrix.")
    return bytes(pdf.output())


def _verify_html(card: Optional[Dict[str, Any]]) -> str:
    style = ("body{font-family:Helvetica,Arial,sans-serif;background:#F4F7FB;margin:0;padding:24px;color:#263238}"
             ".c{max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.08)}"
             ".h{background:#0D47A1;color:#fff;padding:18px 20px}.h b{font-size:18px}.h div{font-size:12px;opacity:.85;margin-top:4px}"
             ".b{padding:18px 20px}.ok{display:inline-block;background:#E8F5E9;color:#2E7D32;font-weight:700;border-radius:20px;padding:6px 12px;font-size:13px}"
             "table{width:100%;border-collapse:collapse;margin-top:14px;font-size:13px}th{background:#E3F2FD;color:#0D47A1;text-align:left;padding:8px}"
             "td{padding:8px;border-bottom:1px solid #ECEFF1}.m{color:#78909C;font-size:12px;margin-top:14px}.r{color:#B71C1C;font-style:italic}")
    if not card:
        body = "<div class='h'><b>Implant Information Card</b></div><div class='b'><p>This card could not be found. It may have been withdrawn.</p></div>"
    else:
        e = html.escape
        rows = "".join(
            "<tr>" + "".join(
                f"<td class='{'r' if v == NOT_RECORDED else ''}'>{e(str(v))}</td>"
                for v in (x["site"], x["company"], x["dimensions"], x["model"], x["lot"], x["serial"])
            ) + "</tr>" for x in card["implant"]["implants"])
        issued = _fmt_date(card.get("reissued_at") or card.get("issued_at"))
        body = (f"<div class='h'><b>{e(card['institution'])}</b><div>IMPLANT INFORMATION CARD (IIC)</div></div><div class='b'>"
                f"<span class='ok'>&#10003; Valid card</span><p><b>Card No:</b> {e(card.get('card_number') or '-')}<br>"
                f"<b>Issued:</b> {e(issued)}<br><b>Type of prosthesis:</b> {e(card['implant']['prosthesis_type'])}<br>"
                f"<b>Implant placement:</b> {e(card['patient']['placement_date'])}<br>"
                f"<b>Final prosthesis:</b> {e(card['patient']['final_prosthesis_date'])}</p>"
                "<table><tr><th>Site (FDI)</th><th>Company &amp; Name</th><th>Dia x Length</th><th>Model</th><th>Lot</th><th>Serial</th></tr>"
                f"{rows}</table><p class='m'>Patient identity is not shown on this page for privacy. "
                "Contact the issuing institution for clinical records.</p></div>")
    return f"<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><title>IIC Verification</title><style>{style}</style></head><body><div class='c'>{body}</div></body></html>"


class InstitutionIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)


def build_router(db, get_current_user, resolve_implants: Callable, log_access: Callable) -> APIRouter:
    router = APIRouter()

    async def institution_name() -> str:
        doc = await db.app_settings.find_one({"_id": "institution"})
        return (doc or {}).get("name") or DEFAULT_INSTITUTION

    async def issue(proc: Dict[str, Any], user: Optional[dict] = None) -> Dict[str, Any]:
        """Assign a card number on first issue (idempotent)."""
        if proc.get("implant_card"):
            return proc
        now = datetime.utcnow()
        counter = await db.counters.find_one_and_update(
            {"_id": f"iic_{now.year}"}, {"$inc": {"seq": 1}}, upsert=True, return_document=True)
        meta = {
            "card_number": f"IIC-{now.year}-{int(counter['seq']):05d}",
            "issued_at": now,
            "revision": 1,
            "verify_token": secrets.token_urlsafe(16),
            "issued_by": (user or {}).get("name"),
        }
        res = await db.procedures.update_one(
            {"_id": proc["_id"], "implant_card": {"$exists": False}}, {"$set": {"implant_card": meta}})
        if res.modified_count:
            proc["implant_card"] = meta
        else:
            proc = await db.procedures.find_one({"_id": proc["_id"]})
        return proc

    async def load(procedure_id: str, user: dict) -> Dict[str, Any]:
        try:
            proc = await db.procedures.find_one({"_id": ObjectId(procedure_id)})
        except Exception:
            proc = None
        if not proc:
            raise HTTPException(status_code=404, detail="Procedure not found")
        role, uid = user.get("role"), user.get("_id")
        if role == "student" and not (
            proc.get("student_id") == uid or uid in (proc.get("previous_students") or []) or proc.get("assistant_id") == uid):
            raise HTTPException(status_code=403, detail="Access denied")
        if role == "supervisor" and proc.get("supervisor_id") != uid:
            raise HTTPException(status_code=403, detail="Access denied")
        if role == "nurse":
            raise HTTPException(status_code=403, detail="Access denied")
        if proc.get("status") != "completed":
            raise HTTPException(status_code=409, detail="The Implant Information Card is issued once treatment is complete")
        return await issue(proc, user)

    def verify_url(request: Request, token: str) -> str:
        host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
        proto = request.headers.get("x-forwarded-proto") or ("https" if "localhost" not in host else "http")
        return f"{proto}://{host}/api/iic/verify/{token}"

    @router.get("/settings/institution")
    async def get_institution(current_user: dict = Depends(get_current_user)):
        doc = await db.app_settings.find_one({"_id": "institution"}) or {}
        return {"name": doc.get("name") or "", "effective_name": doc.get("name") or DEFAULT_INSTITUTION}

    @router.put("/settings/institution")
    async def set_institution(body: InstitutionIn, current_user: dict = Depends(get_current_user)):
        if current_user.get("role") not in SETTINGS_ROLES:
            raise HTTPException(status_code=403, detail="Only Implant In-charge or Administrator can change this")
        name = body.name.strip()
        await db.app_settings.update_one(
            {"_id": "institution"},
            {"$set": {"name": name, "updated_by": current_user.get("name"), "updated_at": datetime.utcnow()}}, upsert=True)
        return {"name": name, "effective_name": name}

    @router.get("/procedures/{procedure_id}/implant-card")
    async def get_card(procedure_id: str, request: Request, current_user: dict = Depends(get_current_user)):
        proc = await load(procedure_id, current_user)
        card = build_card(proc, resolve_implants, await institution_name())
        card["verify_url"] = verify_url(request, card["verify_token"])
        card["can_reissue"] = current_user.get("role") in REISSUE_ROLES
        return card

    @router.post("/procedures/{procedure_id}/implant-card/reissue")
    async def reissue_card(procedure_id: str, request: Request, current_user: dict = Depends(get_current_user)):
        if current_user.get("role") not in REISSUE_ROLES:
            raise HTTPException(status_code=403, detail="Only supervisors, Implant In-charge or Administrator can re-issue")
        proc = await load(procedure_id, current_user)
        meta = dict(proc["implant_card"])
        meta.update({"reissued_at": datetime.utcnow(), "reissued_by": current_user.get("name"),
                     "revision": int(meta.get("revision") or 1) + 1})
        await db.procedures.update_one({"_id": proc["_id"]}, {"$set": {"implant_card": meta}})
        proc["implant_card"] = meta
        card = build_card(proc, resolve_implants, await institution_name())
        card["verify_url"] = verify_url(request, card["verify_token"])
        card["can_reissue"] = True
        return card

    @router.get("/procedures/{procedure_id}/implant-card/pdf")
    async def card_pdf(procedure_id: str, request: Request, current_user: dict = Depends(get_current_user)):
        proc = await load(procedure_id, current_user)
        await log_access(action="pdf_export", resource_type="implant_card", resource_id=procedure_id,
                         user=current_user, request=request, extra={"patient_name": proc.get("patient_name")})
        card = build_card(proc, resolve_implants, await institution_name())
        data = render_pdf(card, verify_url(request, card["verify_token"]))
        fname = f"{card['card_number']}.pdf"
        return Response(content=data, media_type="application/pdf",
                        headers={"Content-Disposition": f'inline; filename="{fname}"'})

    @router.get("/iic/verify/{token}", response_class=HTMLResponse)
    async def verify(token: str):
        proc = await db.procedures.find_one({"implant_card.verify_token": token}) if token else None
        card = build_card(proc, resolve_implants, await institution_name()) if proc else None
        return HTMLResponse(_verify_html(card))

    router.issue_card = issue  # used by the treatment-completion hook
    return router
