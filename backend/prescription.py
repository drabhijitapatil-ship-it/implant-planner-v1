"""Prescription (Rx) feature — data sanitisation, standard template, and the
signed-PDF builder. Mirrors the style of aesthetic_risk.py / the consent PDF.

The prescription lives at procedure["prescription"]:
  {
    status: 'draft' | 'pending' | 'approved',
    diagnosis, allergies, advice: str,
    drugs: [ {name,strength,form,dosage,frequency,duration,timing,notes} ],
    created_by_id/_name/_role, created_at, updated_at, submitted_at,
    signatures: { creator: <sig>, supervisor: <sig> },
    approved_at, approved_by: [ {id,name,role,at} ],
    audit_log: [ {action, by_id, by_name, by_role, at, detail} ],
    reopen_log: [ {from_status, by_name, by_role, at} ],
  }
A signature <sig> = { filename, signed_at, signed_by_id, signed_by_name,
                      signed_by_role, sha256 }.
"""
from __future__ import annotations
from datetime import datetime, timezone
import io
import re

# Two prescriptions can live on a case:
#   "postop" → procedure["prescription"]        (Phase 2, approved with Phase 2)
#   "preop"  → procedure["preop_prescription"]  (Phase 1, approved with Phase 1,
#              carries its own `prescribed_date`)
RX_FIELDS = {"postop": "prescription", "preop": "preop_prescription"}
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

DRUG_FORMS = ["Tablet", "Capsule", "Syrup", "Mouthwash", "Gel", "Injection", "Ointment", "Other"]
MAX_DRUGS = 20

# One-tap standard post-implant prescription (editable by the clinician).
STANDARD_TEMPLATE = [
    {"name": "Amoxicillin + Clavulanic Acid (Augmentin)", "strength": "625 mg", "form": "Tablet",
     "dosage": "1 tab", "frequency": "1-0-1 (BD)", "duration": "5 days", "timing": "After food",
     "notes": "Antibiotic — complete the full course"},
    {"name": "Ibuprofen", "strength": "400 mg", "form": "Tablet",
     "dosage": "1 tab", "frequency": "1-1-1 (TDS)", "duration": "3 days", "timing": "After food",
     "notes": "Analgesic / anti-inflammatory"},
    {"name": "Paracetamol", "strength": "500 mg", "form": "Tablet",
     "dosage": "1 tab", "frequency": "SOS", "duration": "As needed", "timing": "After food",
     "notes": "For pain if Ibuprofen insufficient"},
    {"name": "Chlorhexidine Gluconate 0.2% Mouthwash", "strength": "0.2%", "form": "Mouthwash",
     "dosage": "10 ml rinse", "frequency": "0-1-1", "duration": "7 days", "timing": "After brushing",
     "notes": "Start 24 h post-op; do not eat/rinse for 30 min after use"},
]

PREOP_DEFAULT_ADVICE = (
    "Take the medications exactly as prescribed before the surgery. Have a light meal "
    "unless told otherwise. Continue your regular medicines unless your clinician has "
    "advised a change. Inform the team of any allergy, fever or new medication."
)

DEFAULT_ADVICE = (
    "Apply cold compresses for the first 24 hours. Soft diet for 2-3 days. "
    "Avoid spitting, rinsing vigorously, and smoking. Maintain oral hygiene. "
    "Report any excessive bleeding, swelling or fever."
)

_STR = lambda v, n: (str(v)[:n] if v is not None else "")  # noqa: E731


def _clean_drug(d: dict) -> dict:
    if not isinstance(d, dict):
        return {}
    form = _STR(d.get("form"), 24)
    return {
        "name": _STR(d.get("name"), 160).strip(),
        "strength": _STR(d.get("strength"), 60).strip(),
        "form": form if form in DRUG_FORMS else (form or "Tablet"),
        "dosage": _STR(d.get("dosage"), 60).strip(),
        "frequency": _STR(d.get("frequency"), 60).strip(),
        "duration": _STR(d.get("duration"), 60).strip(),
        "timing": _STR(d.get("timing"), 60).strip(),
        "notes": _STR(d.get("notes"), 240).strip(),
    }


def sanitize_prescription_edit(data: dict | None) -> dict:
    """Sanitise the client-editable fields of a prescription (drugs + text).
    Signatures, status and stamps are managed server-side, never from here."""
    data = data or {}
    drugs = [_clean_drug(d) for d in (data.get("drugs") or []) if isinstance(d, dict)]
    drugs = [d for d in drugs if d.get("name")][:MAX_DRUGS]
    out = {
        "diagnosis": _STR(data.get("diagnosis"), 500).strip(),
        "allergies": _STR(data.get("allergies"), 500).strip(),
        "advice": _STR(data.get("advice"), 2000).strip(),
        "drugs": drugs,
    }
    d = _STR(data.get("prescribed_date"), 10).strip()
    if d and _DATE_RE.match(d):
        out["prescribed_date"] = d
    return out


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def has_drugs(rx: dict | None) -> bool:
    return bool((rx or {}).get("drugs"))


def rx_mark_pending(rx: dict) -> dict:
    """Flip a drafted Rx to 'pending' when Phase 2 is submitted for approval."""
    rx = dict(rx or {})
    if rx.get("status") != "approved":
        rx["status"] = "pending"
        rx["submitted_at"] = now_iso()
    return rx


def rx_mark_approved(rx: dict, approver: dict) -> dict:
    """Auto-approve + lock the Rx alongside Phase 2 approval. `approver` is
    {id,name,role}. Idempotent-ish: records each distinct approver once."""
    rx = dict(rx or {})
    rx["status"] = "approved"
    rx.setdefault("approved_at", now_iso())
    appr = list(rx.get("approved_by") or [])
    if approver and not any(a.get("id") == approver.get("id") for a in appr):
        appr.append({**approver, "at": now_iso()})
    rx["approved_by"] = appr
    return rx


def build_prescription_pdf(procedure: dict, uploads_dir, kind: str = "postop") -> io.BytesIO:
    """Signed prescription PDF (reportlab) — patient block, Rx table, advice,
    and the creator + supervisor signatures with approval metadata."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                    TableStyle, HRFlowable, Image as RLImage)
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.lib.enums import TA_LEFT

    preop = kind == "preop"
    rx = procedure.get(RX_FIELDS.get(kind, "prescription")) or {}
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm,
                            topMargin=12 * mm, bottomMargin=12 * mm)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name='RxTitle', fontName='Helvetica-Bold', fontSize=16,
                              textColor=colors.HexColor('#0D47A1'), alignment=1, spaceAfter=1))
    styles.add(ParagraphStyle(name='RxSub', fontName='Helvetica', fontSize=8,
                              textColor=colors.HexColor('#546E7A'), alignment=1, spaceAfter=4))
    styles.add(ParagraphStyle(name='RxH2', fontName='Helvetica-Bold', fontSize=9.5,
                              textColor=colors.HexColor('#1565C0'), spaceBefore=6, spaceAfter=2))
    styles.add(ParagraphStyle(name='RxBody', fontName='Helvetica', fontSize=8.5,
                              textColor=colors.HexColor('#263238'), leading=11, alignment=TA_LEFT))
    styles.add(ParagraphStyle(name='RxCell', fontName='Helvetica', fontSize=8,
                              textColor=colors.HexColor('#263238'), leading=10))
    styles.add(ParagraphStyle(name='RxSmall', fontName='Helvetica-Oblique', fontSize=7,
                              textColor=colors.HexColor('#78909C'), leading=9))

    story: list = []
    story.append(Paragraph("PRE-OPERATIVE PRESCRIPTION" if preop else "PRESCRIPTION", styles['RxTitle']))
    story.append(Paragraph("Dental Implant Treatment — " + ("Pre-operative Medication" if preop else "Post-Surgical Medication"),
                           styles['RxSub']))
    story.append(HRFlowable(width="100%", thickness=0.6, color=colors.HexColor('#CFD8DC'), spaceAfter=4))

    # Patient block
    pt_rows = [
        ["Patient:", procedure.get("patient_name") or "—", "Age:", str(procedure.get("age") or "—"),
         "Sex:", procedure.get("sex") or "—"],
        ["Reg No.:", procedure.get("registration_number") or "—", "Date:",
         (rx.get("prescribed_date") if preop and rx.get("prescribed_date") else
          (rx.get("approved_at") or rx.get("submitted_at") or rx.get("updated_at") or now_iso())[:10]),
         "", ""],
    ]
    pt = Table(pt_rows, colWidths=[18 * mm, 62 * mm, 14 * mm, 24 * mm, 14 * mm, 50 * mm])
    pt.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'), ('FONTSIZE', (0, 0), (-1, -1), 8.5),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('FONTNAME', (4, 0), (4, -1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#263238')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2), ('TOPPADDING', (0, 0), (-1, -1), 1),
    ]))
    story.append(pt)

    if rx.get("diagnosis"):
        story.append(Paragraph("Diagnosis", styles['RxH2']))
        story.append(Paragraph(rx.get("diagnosis"), styles['RxBody']))
    if rx.get("allergies"):
        story.append(Paragraph("Known Allergies", styles['RxH2']))
        story.append(Paragraph(rx.get("allergies"), styles['RxBody']))

    # Rx drug table
    story.append(Paragraph(u"\u211E  Medications", styles['RxH2']))
    header = ["#", "Drug", "Strength", "Form", "Dose", "Frequency", "Duration", "Timing"]
    rows = [header]
    for i, d in enumerate(rx.get("drugs") or [], 1):
        rows.append([
            str(i),
            Paragraph(f"{d.get('name','')}<br/><font size=6 color='#78909C'>{d.get('notes','')}</font>"
                      if d.get('notes') else d.get('name', ''), styles['RxCell']),
            d.get("strength", ""), d.get("form", ""), d.get("dosage", ""),
            d.get("frequency", ""), d.get("duration", ""), d.get("timing", ""),
        ])
    if len(rows) == 1:
        rows.append(["—", "No medications prescribed", "", "", "", "", "", ""])
    dt = Table(rows, colWidths=[7 * mm, 48 * mm, 18 * mm, 16 * mm, 16 * mm, 24 * mm, 20 * mm, 23 * mm])
    dt.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, -1), 7.5),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#E3F2FD')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#263238')),
        ('GRID', (0, 0), (-1, -1), 0.35, colors.HexColor('#CFD8DC')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3), ('TOPPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(dt)

    advice = rx.get("advice") or (PREOP_DEFAULT_ADVICE if preop else DEFAULT_ADVICE)
    story.append(Paragraph("Pre-operative Instructions" if preop else "Post-Operative Advice", styles['RxH2']))
    story.append(Paragraph(advice, styles['RxBody']))

    # Signatures
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#CFD8DC'), spaceAfter=3))

    def sig_cell(sig):
        if sig and sig.get("filename") and (uploads_dir / sig["filename"]).exists():
            return RLImage(str(uploads_dir / sig["filename"]), width=44 * mm, height=13 * mm, kind='proportional')
        return Paragraph("__________________________", styles['RxBody'])

    sigs = rx.get("signatures") or {}
    creator = sigs.get("creator") or {}
    supervisor = sigs.get("supervisor") or {}
    sig_rows = [
        [sig_cell(creator), sig_cell(supervisor)],
        [Paragraph(f"<b>{creator.get('signed_by_name') or procedure.get('student_name') or procedure.get('created_by_name') or '—'}</b>"
                   f"<br/>Treating Clinician ({creator.get('signed_by_role') or 'student'})"
                   + (f"<br/><font size=6 color='#78909C'>Signed {(creator.get('signed_at') or '')[:19].replace('T',' ')} UTC</font>" if creator.get('signed_at') else ""),
                   styles['RxCell']),
         Paragraph(f"<b>{supervisor.get('signed_by_name') or procedure.get('supervisor_name') or '—'}</b>"
                   f"<br/>Supervising Faculty"
                   + (f"<br/><font size=6 color='#78909C'>Signed {(supervisor.get('signed_at') or '')[:19].replace('T',' ')} UTC</font>" if supervisor.get('signed_at') else ""),
                   styles['RxCell'])],
    ]
    sg = Table(sig_rows, colWidths=[91 * mm, 91 * mm])
    sg.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
        ('LINEBELOW', (0, 0), (-1, 0), 0.4, colors.HexColor('#90A4AE')),
        ('TOPPADDING', (0, 0), (-1, -1), 2), ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    story.append(sg)

    status = rx.get("status")
    if status == "approved":
        appr = rx.get("approved_by") or []
        who = ", ".join(f"{a.get('name')} ({a.get('role')})" for a in appr) or "faculty"
        story.append(Spacer(1, 6))
        story.append(Paragraph(
            f"Digitally approved on {(rx.get('approved_at') or '')[:19].replace('T',' ')} UTC with Phase {1 if preop else 2} by {who}. "
            f"Creator signature SHA-256: {(creator.get('sha256') or '')[:16]}… · "
            f"Supervisor signature SHA-256: {(supervisor.get('sha256') or '')[:16]}…",
            styles['RxSmall']))
    else:
        story.append(Spacer(1, 6))
        story.append(Paragraph(
            f"DRAFT — not yet approved. This prescription becomes valid only after Phase {1 if preop else 2} approval.",
            styles['RxSmall']))

    doc.build(story)
    buf.seek(0)
    return buf
