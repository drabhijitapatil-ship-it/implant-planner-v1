import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert, Platform } from "react-native";
import { format } from "date-fns";
import { getImplantSite, getImplantSpec } from "./implantPlan";
import api from "./api";

// ── Organization letterhead (name + logo) for generated documents ──
export type OrgBranding = { name?: string | null; logo?: string | null };

/** Fetch the current user's organization name + logo (base64 data URI).
 *  Never throws — PDFs must still generate when the org lookup fails. */
export const fetchOrgBranding = async (): Promise<OrgBranding | null> => {
  try {
    const { data } = await api.get("/organizations/me");
    const org = data?.organization;
    return org && (org.name || org.logo)
      ? { name: org.name, logo: org.logo }
      : null;
  } catch {
    return null;
  }
};

const orgHeaderHtml = (org?: OrgBranding | null): string => {
  if (!org || (!org.name && !org.logo)) return "";
  return `
    <div style="text-align: center; margin-bottom: 12px;">
      ${org.logo ? `<img src="${org.logo}" style="height: 52px; max-width: 220px; object-fit: contain;" />` : ""}
      ${org.name ? `<div style="font-size: 15px; font-weight: bold; color: #263238; margin-top: 4px;">${org.name}</div>` : ""}
    </div>`;
};

// Shared rows for a Step-2-style augmentation capture (staged round or
// Phase 2 simultaneous). Returns <tr> rows.
const augStep2RowsHtml = (a: any): string => {
  if (!a) return "";
  const mats = [
    ...(a.autogenous_used === "Yes"
      ? [
          `Autogenous${(a.autogenous_sites || []).length ? ` (${a.autogenous_sites.join(", ")})` : ""}`,
        ]
      : []),
    ...(a.allograft_used === "Yes" ? ["Allograft"] : []),
    ...(a.other_graft_materials || []),
  ];
  return `
    ${(a.procedures_performed || []).length ? `<tr><td class="info-label">Procedure Performed:</td><td class="info-value">${a.procedures_performed.join(", ")}${a.procedure_other_text ? ` — ${a.procedure_other_text}` : ""}</td></tr>` : ""}
    ${mats.length ? `<tr><td class="info-label">Graft Materials:</td><td class="info-value">${mats.join(", ")}${a.graft_material_other_text ? ` — ${a.graft_material_other_text}` : ""}</td></tr>` : ""}
    ${a.membrane_used ? `<tr><td class="info-label">Membrane:</td><td class="info-value">${a.membrane_used === "Yes" ? (a.membrane_types || []).join(", ") || "Yes" : "No"}</td></tr>` : ""}
    ${(a.fixation || []).length ? `<tr><td class="info-label">Fixation:</td><td class="info-value">${a.fixation.join(", ")}</td></tr>` : ""}
    ${a.soft_tissue_graft ? `<tr><td class="info-label">Soft Tissue Graft:</td><td class="info-value">${a.soft_tissue_graft === "Yes" ? `${(a.soft_tissue_types || []).join(", ") || "Yes"}${(a.soft_tissue_donor_sites || []).length ? ` · Donor: ${a.soft_tissue_donor_sites.join(", ")}` : ""}${(a.soft_tissue_indications || []).length ? ` · Indication: ${a.soft_tissue_indications.join(", ")}` : ""}` : "No"}</td></tr>` : ""}
    ${a.healing_protocol ? `<tr><td class="info-label">Healing Protocol:</td><td class="info-value">${a.healing_protocol === "Custom" ? a.healing_custom_text || "Custom" : a.healing_protocol}</td></tr>` : ""}
  `;
};

// Pre-Implant Augmentation section — all Step 1–3 data per round.
// CBCT files are intentionally NOT embedded (only availability is noted).
const augmentationSectionHtml = (procedure: any): string => {
  const rounds: any[] = procedure?.augmentations || [];
  if (!rounds.length) return "";
  const FAILED_LBL: any = {
    terminate: "Terminate Treatment",
    repeat: "Repeat Pre-Implant Bone Augmentation",
    proceed_phase2: "Proceed to Phase 2",
  };
  return `
    <div class="stage-divider">PRE-IMPLANT BONE &amp; SOFT TISSUE AUGMENTATION</div>
    ${rounds
      .map((rnd: any) => {
        const s1 = rnd.step1 || {};
        const s2 = rnd.step2 || {};
        const s3 = rnd.step3 || {};
        return `
      <div class="section">
        <div class="section-title">Bone Grafting — Round ${rnd.round}${rnd.scheduled_date ? ` (Surgery: ${rnd.scheduled_date}${rnd.scheduled_time ? ` · ${rnd.scheduled_time}` : ""})` : ""}</div>
        <table>
          ${
            rnd.step1
              ? `
          <tr><td class="info-label" style="color:#007AFF;font-weight:bold;" colspan="2">Step 1 — Pre-procedure</td></tr>
          ${(s1.reasons || []).length ? `<tr><td class="info-label">Reason for Grafting:</td><td class="info-value">${s1.reasons.join(", ")}${s1.reason_other_text ? ` — ${s1.reason_other_text}` : ""}</td></tr>` : ""}
          ${(s1.defect_teeth || []).length ? `<tr><td class="info-label">Defect Location (FDI):</td><td class="info-value">${s1.defect_teeth.join(", ")}</td></tr>` : ""}
          ${(s1.defect_sides || []).length ? `<tr><td class="info-label">Bone Defect Side:</td><td class="info-value">${s1.defect_sides.join(", ")}</td></tr>` : ""}
          ${s1.horizontal_defect || s1.vertical_defect ? `<tr><td class="info-label">Horizontal / Vertical Defect:</td><td class="info-value">${s1.horizontal_defect || "—"} / ${s1.vertical_defect || "—"}</td></tr>` : ""}
          ${s1.defect_other ? `<tr><td class="info-label">Other Defect Notes:</td><td class="info-value">${s1.defect_other}</td></tr>` : ""}
          ${s1.bone_width_before || s1.bone_height_before ? `<tr><td class="info-label">Bone Before Graft (W × H):</td><td class="info-value">${s1.bone_width_before || "—"} mm × ${s1.bone_height_before || "—"} mm</td></tr>` : ""}
          <tr><td class="info-label">Pre-operative CBCT:</td><td class="info-value">${(s1.cbct_files || []).length ? `Available (${s1.cbct_files.length} file${s1.cbct_files.length === 1 ? "" : "s"})` : "Not uploaded"}</td></tr>
          ${s1.medical_risk_level ? `<tr><td class="info-label">Medical Risk Level:</td><td class="info-value">${s1.medical_risk_level}</td></tr>` : ""}
          `
              : ""
          }
          ${
            rnd.step2
              ? `
          <tr><td class="info-label" style="color:#007AFF;font-weight:bold;" colspan="2">Step 2 — Post-procedure</td></tr>
          ${augStep2RowsHtml(s2)}
          `
              : ""
          }
          ${
            rnd.step3
              ? `
          <tr><td class="info-label" style="color:#007AFF;font-weight:bold;" colspan="2">Step 3 — Review of Augmentation</td></tr>
          ${s3.healing_status ? `<tr><td class="info-label">Healing Status:</td><td class="info-value">${s3.healing_status}</td></tr>` : ""}
          ${(s3.complications || []).length ? `<tr><td class="info-label">Complications:</td><td class="info-value">${s3.complications.join(", ")}${s3.complication_other_text ? ` — ${s3.complication_other_text}` : ""}</td></tr>` : ""}
          ${s3.outcome ? `<tr><td class="info-label">Bone Graft Outcome:</td><td class="info-value">${s3.outcome}</td></tr>` : ""}
          ${
            s3.bone_width_after ||
            s3.bone_height_after ||
            s1.bone_width_before ||
            s1.bone_height_before
              ? (() => {
                  const seg = (before: any, after: any) => {
                    const b = parseFloat(before);
                    const a = parseFloat(after);
                    const delta =
                      !isNaN(b) && !isNaN(a)
                        ? ` (${a - b >= 0 ? "+" : ""}${Math.round((a - b) * 100) / 100} mm gain)`
                        : "";
                    return `${before || "—"} → ${after || "—"} mm${delta}`;
                  };
                  return `<tr><td class="info-label">Bone Width (pre-op → post-op):</td><td class="info-value" style="font-weight:bold;color:#2E7D32;">${seg(s1.bone_width_before, s3.bone_width_after)}</td></tr>
            <tr><td class="info-label">Bone Height (pre-op → post-op):</td><td class="info-value" style="font-weight:bold;color:#2E7D32;">${seg(s1.bone_height_before, s3.bone_height_after)}</td></tr>`;
                })()
              : ""
          }
          <tr><td class="info-label">CBCT After Graft:</td><td class="info-value">${(s3.cbct_files || []).length ? `Available (${s3.cbct_files.length} file${s3.cbct_files.length === 1 ? "" : "s"})` : "Not uploaded"}</td></tr>
          ${s3.decision ? `<tr><td class="info-label">Decision:</td><td class="info-value">${s3.decision === "complete" ? "Bone Graft Augmentation Complete" : `Bone Graft Augmentation Failed — ${FAILED_LBL[s3.failed_action] || ""}`}</td></tr>` : ""}
          `
              : ""
          }
        </table>
      </div>`;
      })
      .join("")}
  `;
};

/** Build the full HTML for the procedure case report (shared by download + print flows). */
export const buildProcedurePdfHtml = (
  procedure: any,
  org?: OrgBranding | null,
): string => {
  const isCompleted = procedure.status === "completed";
  const statusBadgeText = isCompleted
    ? "TREATMENT COMPLETE - ALL PROTOCOLS APPROVED"
    : "STAGE 1 IMPLANT PLACEMENT DONE SUCCESSFULLY";
  const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 20px; font-size: 12px; line-height: 1.4; }
            .header { text-align: center; border-bottom: 2px solid #007AFF; padding-bottom: 15px; margin-bottom: 20px; }
            .header h1 { margin: 0; color: #007AFF; font-size: 20px; }
            .header p { margin: 5px 0; color: #666; font-size: 11px; }
            .status-badge { display: inline-block; padding: 6px 12px; background-color: ${isCompleted ? "#2E7D32" : "#4CAF50"}; color: white; border-radius: 4px; font-weight: bold; font-size: 11px; margin: 10px 0; }
            .section { margin-bottom: 20px; border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px; }
            .section-title { font-size: 14px; font-weight: bold; color: #007AFF; margin-bottom: 10px; border-bottom: 1px solid #e0e0e0; padding-bottom: 5px; }
            .info-label { font-weight: bold; color: #333; width: 150px; flex-shrink: 0; }
            .info-value { color: #666; }
            .checklist-item { padding: 5px 0; border-bottom: 1px solid #f0f0f0; }
            .checklist-item:last-child { border-bottom: none; }
            .check-yes { color: #4CAF50; font-weight: bold; }
            .check-no { color: #F44336; font-weight: bold; }
            .footer { margin-top: 30px; padding-top: 15px; border-top: 2px solid #007AFF; text-align: center; color: #999; font-size: 10px; }
            .stage-divider { margin: 20px 0; padding: 10px; background-color: #E3F2FD; border-radius: 4px; text-align: center; font-weight: bold; color: #1565C0; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; }
            td { padding: 8px; }
          </style>
        </head>
        <body>
          <div class="header">
            ${orgHeaderHtml(org)}
            <h1>Dental Implant Procedure Report</h1>
            <span class="status-badge">${statusBadgeText}</span>
          </div>

          <div class="section">
            <div class="section-title">Patient Information</div>
            <table>
              <tr><td class="info-label">Patient Name:</td><td class="info-value">${procedure.patient_name}</td></tr>
              <tr><td class="info-label">Registration Number:</td><td class="info-value">${procedure.registration_number}</td></tr>
              <tr><td class="info-label">Implant Site:</td><td class="info-value">${procedure.implant_site}</td></tr>
              <tr><td class="info-label">Procedure Date:</td><td class="info-value">${format(new Date(procedure.procedure_date), "MMMM dd, yyyy")}</td></tr>
              <tr><td class="info-label">Procedure Time:</td><td class="info-value">${procedure.procedure_time}</td></tr>
            </table>
          </div>

          <div class="section">
            <div class="section-title">Medical Team</div>
            <table>
              <tr><td class="info-label">Postgraduate Student:</td><td class="info-value">${procedure.student_name}</td></tr>
              <tr><td class="info-label">Supervisor:</td><td class="info-value">${procedure.supervisor_name}</td></tr>
              <tr><td class="info-label">Implant Incharge:</td><td class="info-value">${procedure.implant_incharge_name}</td></tr>
            </table>
          </div>

          <div class="section">
            <div class="section-title">Payment Details</div>
            <table>
              <tr><td class="info-label">Receipt Number:</td><td class="info-value">${procedure.receipt_number}</td></tr>
              <tr><td class="info-label">Amount Paid:</td><td class="info-value">${procedure.amount_paid}</td></tr>
            </table>
          </div>

          ${
            procedure.implant_region || procedure.implant_company
              ? `
          <div class="section">
            <div class="section-title">Implant Details</div>
            ${procedure.implant_region ? `<p class="info-value"><strong>Region:</strong> ${procedure.implant_region}</p>` : ""}
            ${procedure.implant_company ? `<p class="info-value"><strong>Company:</strong> ${procedure.implant_company}</p>` : ""}
          </div>`
              : ""
          }

          ${
            procedure.implant_procedure_type
              ? `
          <div class="section">
            <div class="section-title">Procedure Details</div>
            <table>
              <tr><td class="info-label">Procedure Type:</td><td class="info-value">${procedure.implant_procedure_type}</td></tr>
              ${procedure.procedure_surgery_type ? `<tr><td class="info-label">Surgical Approach:</td><td class="info-value">${procedure.procedure_surgery_type}</td></tr>` : ""}
              ${procedure.guided_surgery_type ? `<tr><td class="info-label">Type of Guided Surgery:</td><td class="info-value">${procedure.guided_surgery_type}</td></tr>` : ""}
              ${procedure.static_guide_type ? `<tr><td class="info-label">Type of Static Guide:</td><td class="info-value">${procedure.static_guide_type}</td></tr>` : ""}
              ${procedure.sleeve_type ? `<tr><td class="info-label">Type of Sleeve:</td><td class="info-value">${procedure.sleeve_type}</td></tr>` : ""}
              ${procedure.dynamic_nav_system ? `<tr><td class="info-label">Dynamic Navigation System:</td><td class="info-value">${procedure.dynamic_nav_system}</td></tr>` : ""}
              ${procedure.loading_type?.length ? `<tr><td class="info-label">Loading Type:</td><td class="info-value">${procedure.loading_type.join(", ")}</td></tr>` : ""}
              ${procedure.prosthetic_plan ? `<tr><td class="info-label">Prosthetic Plan:</td><td class="info-value">${procedure.prosthetic_plan}</td></tr>` : ""}
              ${procedure.prosthetic_plan_other ? `<tr><td class="info-label">Prosthetic Plan (Other):</td><td class="info-value">${procedure.prosthetic_plan_other}</td></tr>` : ""}
            </table>
          </div>`
              : ""
          }

          ${
            procedure.edentulous_sites?.length ||
            procedure.edentulous_site ||
            procedure.arch_condition ||
            procedure.ridge_contour ||
            procedure.soft_tissue_thickness ||
            procedure.keratinized_mucosa
              ? `
          <div class="section">
            <div class="section-title">Clinical Examination — Intraoral</div>
            <table>
              ${procedure.edentulous_sites?.length ? `<tr><td class="info-label">Edentulous Sites:</td><td class="info-value">${procedure.edentulous_sites.join(", ")}</td></tr>` : ""}
              ${procedure.edentulous_site && !procedure.edentulous_sites?.length ? `<tr><td class="info-label">Edentulous Site:</td><td class="info-value">${procedure.edentulous_site}</td></tr>` : ""}
              ${procedure.arch_condition ? `<tr><td class="info-label">Arch Condition:</td><td class="info-value">${procedure.arch_condition}</td></tr>` : ""}
              ${procedure.ridge_contour ? `<tr><td class="info-label">Ridge Contour:</td><td class="info-value">${procedure.ridge_contour}</td></tr>` : ""}
              ${procedure.soft_tissue_thickness ? `<tr><td class="info-label">Soft Tissue:</td><td class="info-value">${procedure.soft_tissue_thickness}</td></tr>` : ""}
              ${procedure.keratinized_mucosa ? `<tr><td class="info-label">Keratinized Mucosa:</td><td class="info-value">${procedure.keratinized_mucosa}</td></tr>` : ""}
            </table>
          </div>`
              : ""
          }

          ${
            procedure.occlusal_scheme ||
            procedure.parafunction_habit ||
            procedure.vertical_dimension ||
            procedure.opposing_dentition ||
            procedure.vertical_dimension_mm ||
            procedure.tmj
              ? `
          <div class="section">
            <div class="section-title">Occlusal Analysis</div>
            <table>
              ${procedure.occlusal_scheme ? `<tr><td class="info-label">Occlusal Scheme:</td><td class="info-value">${procedure.occlusal_scheme}</td></tr>` : ""}
              ${procedure.parafunction_habit ? `<tr><td class="info-label">Parafunctional Habits:</td><td class="info-value">${procedure.parafunction_habit}</td></tr>` : ""}
              ${procedure.vertical_dimension ? `<tr><td class="info-label">Vertical Dimension:</td><td class="info-value">${procedure.vertical_dimension}</td></tr>` : ""}
              ${procedure.vertical_dimension_mm ? `<tr><td class="info-label">Vertical Dimension (mm):</td><td class="info-value">${procedure.vertical_dimension_mm}</td></tr>` : ""}
              ${procedure.opposing_dentition ? `<tr><td class="info-label">Opposing Dentition:</td><td class="info-value">${procedure.opposing_dentition}</td></tr>` : ""}
              ${procedure.tmj ? `<tr><td class="info-label">TMJ Assessment:</td><td class="info-value">${procedure.tmj}</td></tr>` : ""}
            </table>
          </div>`
              : ""
          }

          ${
            procedure.smile_line || procedure.gingival_biotype
              ? `
          <div class="section">
            <div class="section-title">Aesthetic Risk Assessment</div>
            <table>
              ${procedure.smile_line ? `<tr><td class="info-label">Smile Line:</td><td class="info-value">${procedure.smile_line}</td></tr>` : ""}
              ${procedure.gingival_biotype ? `<tr><td class="info-label">Gingival Biotype:</td><td class="info-value">${procedure.gingival_biotype}</td></tr>` : ""}
            </table>
          </div>`
              : ""
          }

          ${
            procedure.medical_assessment &&
            Object.keys(procedure.medical_assessment).length > 0
              ? `
          <div class="section">
            <div class="section-title">Medical Assessment${procedure.medical_risk_level ? ` — ${procedure.medical_risk_level}` : ""}</div>
            <table>
              ${Object.entries(procedure.medical_assessment)
                .map(
                  ([key, value]) => `
              <tr>
                <td class="info-label" style="text-transform: capitalize;">${key.replace(/_/g, " ")}:</td>
                <td class="info-value">
                  <span style="color: ${value === "Yes" ? "#F44336" : "#4CAF50"}; font-weight: bold;">${value}</span>
                </td>
              </tr>`,
                )
                .join("")}
            </table>
          </div>`
              : ""
          }

          ${
            procedure.implant_plans?.length
              ? `
          <div class="section">
            <div class="section-title">Implant Selection Details</div>
            <table style="width:100%;border-collapse:collapse;">
              <tr style="background:#E3F2FD;">
                <th style="border:1px solid #ddd;padding:6px;text-align:left;font-size:11px;">Position</th>
                <th style="border:1px solid #ddd;padding:6px;text-align:left;font-size:11px;">Brand</th>
                <th style="border:1px solid #ddd;padding:6px;text-align:left;font-size:11px;">System</th>
                <th style="border:1px solid #ddd;padding:6px;text-align:left;font-size:11px;">Diameter</th>
                <th style="border:1px solid #ddd;padding:6px;text-align:left;font-size:11px;">Length</th>
              </tr>
              ${procedure.implant_plans
                .map((imp: any) => {
                  const site = getImplantSite(imp);
                  const spec = getImplantSpec(imp);
                  return `
              <tr>
                <td style="border:1px solid #ddd;padding:6px;font-size:11px;">${site}</td>
                <td style="border:1px solid #ddd;padding:6px;font-size:11px;">${spec.brand}</td>
                <td style="border:1px solid #ddd;padding:6px;font-size:11px;">${spec.system}</td>
                <td style="border:1px solid #ddd;padding:6px;font-size:11px;">${spec.diameter}</td>
                <td style="border:1px solid #ddd;padding:6px;font-size:11px;">${spec.length}</td>
              </tr>`;
                })
                .join("")}
            </table>
          </div>`
              : ""
          }

          ${
            procedure.bone_graft_specifications
              ? `
          <div class="section">
            <div class="section-title">Bone Graft/Membrane Specifications</div>
            <p class="info-value">${procedure.bone_graft_specifications}</p>
          </div>`
              : ""
          }

          <div class="stage-divider">PHASE 1 — PRE-SURGICAL PROTOCOL</div>

          <div class="section">
            <div class="section-title">Pre-Surgical Checklist</div>
            <div class="checklist">
              ${
                procedure.checklist?.pre_surgical?.items
                  ?.map(
                    (item: any) => `
                <div class="checklist-item">
                  <span class="${item.value ? "check-yes" : "check-no"}">${item.value ? "&#10003;" : "&#10007;"}</span>
                  ${getChecklistLabel("pre_surgical", item.id)}
                </div>
              `,
                  )
                  .join("") || "<p>No checklist data available</p>"
              }
            </div>
            ${renderAdditionalFields(procedure.checklist?.pre_surgical?.additional_fields)}
          </div>

          ${
            procedure.remark
              ? `
          <div class="section">
            <div class="section-title">Phase 1 — Remarks</div>
            <p class="info-value">${procedure.remark}</p>
          </div>`
              : ""
          }

          ${augmentationSectionHtml(procedure)}

          ${
            procedure.phase2_data || procedure.checklist?.surgical
              ? `
          <div class="stage-divider">PHASE 2 — SURGICAL PROTOCOLS</div>

          ${
            procedure.phase2_data
              ? `
          ${
            procedure.phase2_data.pre_surgery_checklist &&
            Object.keys(procedure.phase2_data.pre_surgery_checklist).length > 0
              ? `
          <div class="section">
            <div class="section-title">Pre-Surgery Checklist</div>
            <div class="checklist">
              ${Object.entries(procedure.phase2_data.pre_surgery_checklist)
                .map(
                  ([key, val]) => `
                <div class="checklist-item">
                  <span class="${val ? "check-yes" : "check-no"}">${val ? "&#10003;" : "&#10007;"}</span>
                  <span style="text-transform:capitalize;">${key.replace(/_/g, " ")}</span>
                </div>
              `,
                )
                .join("")}
            </div>
          </div>`
              : ""
          }

          <div class="section">
            <div class="section-title">Surgical Procedure</div>
            <table>
              ${procedure.phase2_data.anesthesia_adequate ? `<tr><td class="info-label">Anaesthesia Adequate:</td><td class="info-value">${procedure.phase2_data.anesthesia_adequate}</td></tr>` : ""}
              ${procedure.phase2_data.anesthesia_details ? `<tr><td class="info-label">Anaesthesia Notes:</td><td class="info-value">${procedure.phase2_data.anesthesia_details}</td></tr>` : ""}
              ${procedure.phase2_data.flap_design ? `<tr><td class="info-label">Incision / Flap Design:</td><td class="info-value">${procedure.phase2_data.flap_design}</td></tr>` : ""}
              ${procedure.phase2_data.drilling_type ? `<tr><td class="info-label">Drilling Type:</td><td class="info-value">${procedure.phase2_data.drilling_type}</td></tr>` : ""}
              ${procedure.phase2_data.implant_seated_correctly !== undefined ? `<tr><td class="info-label">Implant Seated Correctly:</td><td class="info-value">${procedure.phase2_data.implant_seated_correctly ? "Yes" : "No"}</td></tr>` : ""}
              ${procedure.phase2_data.implant_seated_comment ? `<tr><td class="info-label">Seating Notes:</td><td class="info-value">${procedure.phase2_data.implant_seated_comment}</td></tr>` : ""}
              ${procedure.phase2_data.torque_values?.length ? `<tr><td class="info-label">Torque Values:</td><td class="info-value" style="font-weight:bold;color:#E65100;">${procedure.phase2_data.torque_values.map((tv: number, i: number) => (procedure.implant_plans?.[i]?.position ? "Tooth " + procedure.implant_plans[i].position : "Implant " + (i + 1)) + ": " + tv + " Ncm").join(", ")}</td></tr>` : ""}
              ${procedure.phase2_data.augmentation ? `<tr><td class="info-label">Bone &amp; Soft Tissue Augmentation:</td><td class="info-value">Yes — during implant surgery</td></tr>${augStep2RowsHtml(procedure.phase2_data.augmentation)}` : procedure.phase2_data.bone_graft_used !== undefined ? `<tr><td class="info-label">Bone &amp; Soft Tissue Augmentation:</td><td class="info-value">${procedure.phase2_data.bone_graft_used ? `Yes${procedure.phase2_data.bone_graft_details ? ` — ${procedure.phase2_data.bone_graft_details}` : ""}` : "No"}</td></tr>` : ""}
              ${procedure.phase2_data.implant_other_notes ? `<tr><td class="info-label">Other Implant Notes:</td><td class="info-value">${procedure.phase2_data.implant_other_notes}</td></tr>` : ""}
              ${procedure.phase2_data.prosthetic_component ? `<tr><td class="info-label">Prosthetic Component:</td><td class="info-value">${procedure.phase2_data.prosthetic_component}</td></tr>` : ""}
              ${procedure.phase2_data.healing_abutment_cuff_height ? `<tr><td class="info-label">Cuff Height:</td><td class="info-value">${procedure.phase2_data.healing_abutment_cuff_height} mm</td></tr>` : ""}
              ${procedure.phase2_data.sutures_placed !== undefined ? `<tr><td class="info-label">Sutures Placed:</td><td class="info-value">${procedure.phase2_data.sutures_placed ? "Yes" : "No"}</td></tr>` : ""}
              ${procedure.phase2_data.hemostasis_achieved !== undefined ? `<tr><td class="info-label">Hemostasis Achieved:</td><td class="info-value">${procedure.phase2_data.hemostasis_achieved ? "Yes" : "No"}</td></tr>` : ""}
            </table>
          </div>

          ${
            procedure.phase2_data.post_op_checklist &&
            Object.keys(procedure.phase2_data.post_op_checklist).length > 0
              ? `
          <div class="section">
            <div class="section-title">Post-Operative Checklist</div>
            <div class="checklist">
              ${Object.entries(procedure.phase2_data.post_op_checklist)
                .map(
                  ([key, val]) => `
                <div class="checklist-item">
                  <span class="${val ? "check-yes" : "check-no"}">${val ? "&#10003;" : "&#10007;"}</span>
                  <span style="text-transform:capitalize;">${key.replace(/_/g, " ")}</span>
                </div>
              `,
                )
                .join("")}
            </div>
          </div>`
              : ""
          }
          `
              : `
          ${
            procedure.checklist?.surgical
              ? `
          <div class="section">
            <div class="section-title">Surgical Checklist (Legacy)</div>
            <div class="checklist">
              ${
                procedure.checklist.surgical.items
                  ?.map(
                    (item: any) => `
                <div class="checklist-item">
                  <span class="${item.value ? "check-yes" : "check-no"}">${item.value ? "&#10003;" : "&#10007;"}</span>
                  ${getChecklistLabel("surgical", item.id)}
                </div>
              `,
                  )
                  .join("") || "<p>No checklist data available</p>"
              }
            </div>
          </div>`
              : ""
          }
          `
          }

          ${
            procedure.phase2_student_notes ||
            procedure.phase2_remark ||
            procedure.phase2_supervisor_notes ||
            procedure.phase2_incharge_notes
              ? `
          <div class="section">
            <div class="section-title">Phase 2 — Notes & Remarks</div>
            ${procedure.phase2_student_notes || procedure.phase2_remark ? `<p class="info-value"><strong>Post-Surgical Notes by Student:</strong><br/>${procedure.phase2_student_notes || procedure.phase2_remark}</p>` : ""}
            ${procedure.phase2_supervisor_notes ? `<p class="info-value"><strong>Remarks by Supervising Faculty:</strong><br/>${procedure.phase2_supervisor_notes}</p>` : ""}
            ${procedure.phase2_incharge_notes ? `<p class="info-value"><strong>Remarks by Implant In-Charge:</strong><br/>${procedure.phase2_incharge_notes}</p>` : ""}
          </div>`
              : ""
          }
          `
              : ""
          }

          ${
            procedure.phase3_data ||
            procedure.checklist?.second_stage ||
            procedure.phase3_student_notes ||
            procedure.stage2_surgical_remark
              ? `
          <div class="stage-divider">PHASE 3 — SECOND STAGE SURGICAL</div>

          ${
            procedure.phase3_data
              ? `
          ${
            procedure.phase3_data.checklist_items &&
            Object.keys(procedure.phase3_data.checklist_items).length > 0
              ? `
          <div class="section">
            <div class="section-title">Phase 3 Checklist</div>
            <div class="checklist">
              ${Object.entries(procedure.phase3_data.checklist_items)
                .map(
                  ([key, val]) => `
                <div class="checklist-item">
                  <span class="${val ? "check-yes" : "check-no"}">${val ? "&#10003;" : "&#10007;"}</span>
                  <span style="text-transform:capitalize;">${key.replace(/_/g, " ")}</span>
                </div>
              `,
                )
                .join("")}
            </div>
          </div>`
              : ""
          }

          ${
            procedure.phase3_data.isq_value ||
            procedure.phase3_data.healing_abutment_height
              ? `
          <div class="section">
            <div class="section-title">Measurements</div>
            <table>
              ${procedure.phase3_data.isq_value ? `<tr><td class="info-label">ISQ Value:</td><td class="info-value" style="font-weight:bold;color:#2E7D32;">${procedure.phase3_data.isq_value}</td></tr>` : ""}
              ${procedure.phase3_data.healing_abutment_height ? `<tr><td class="info-label">Healing Abutment Height:</td><td class="info-value">${procedure.phase3_data.healing_abutment_height} mm</td></tr>` : ""}
            </table>
          </div>`
              : ""
          }
          `
              : `
          ${
            procedure.checklist?.second_stage
              ? `
          <div class="section">
            <div class="section-title">Second Stage Surgical Checklist (Legacy)</div>
            <div class="checklist">
              ${
                procedure.checklist.second_stage.items
                  ?.map(
                    (item: any) => `
                <div class="checklist-item">
                  <span class="${item.value ? "check-yes" : "check-no"}">${item.value ? "&#10003;" : "&#10007;"}</span>
                  ${getChecklistLabel("second_stage", item.id)}
                </div>
              `,
                  )
                  .join("") || "<p>No checklist data</p>"
              }
            </div>
          </div>`
              : ""
          }
          `
          }

          ${
            procedure.phase3_student_notes ||
            procedure.stage2_surgical_remark ||
            procedure.phase3_supervisor_notes ||
            procedure.phase3_incharge_notes
              ? `
          <div class="section">
            <div class="section-title">Phase 3 — Notes & Remarks</div>
            ${procedure.phase3_student_notes || procedure.stage2_surgical_remark ? `<p class="info-value"><strong>Notes by Student:</strong><br/>${procedure.phase3_student_notes || procedure.stage2_surgical_remark}</p>` : ""}
            ${procedure.phase3_supervisor_notes ? `<p class="info-value"><strong>Remarks by Supervising Faculty:</strong><br/>${procedure.phase3_supervisor_notes}</p>` : ""}
            ${procedure.phase3_incharge_notes ? `<p class="info-value"><strong>Remarks by Implant In-Charge:</strong><br/>${procedure.phase3_incharge_notes}</p>` : ""}
          </div>`
              : ""
          }
          `
              : ""
          }

          ${
            procedure.phase4_step1_data ||
            procedure.phase4_step2_data ||
            procedure.checklist?.prosthetic_phase ||
            procedure.stage2_prosthetic_remark
              ? `
          <div class="stage-divider">PHASE 4 — PROSTHETIC PROTOCOL</div>

          ${
            procedure.phase4_step1_data
              ? `
          <div class="section">
            <div class="section-title">Step 1 — Prosthetic Plan & Impressions</div>
            <table>
              ${procedure.phase4_step1_data.final_prosthetic_plan ? `<tr><td class="info-label">Final Prosthetic Plan:</td><td class="info-value" style="font-weight:bold;">${procedure.phase4_step1_data.final_prosthetic_plan}</td></tr>` : ""}
              ${procedure.phase4_step1_data.prosthetic_material ? `<tr><td class="info-label">Prosthetic Material:</td><td class="info-value">${procedure.phase4_step1_data.prosthetic_material}</td></tr>` : ""}
              ${procedure.phase4_step1_data.custom_abutment ? `<tr><td class="info-label">Custom Abutment:</td><td class="info-value">${procedure.phase4_step1_data.custom_abutment}</td></tr>` : ""}
              ${procedure.phase4_step1_data.overdenture_attachment ? `<tr><td class="info-label">Overdenture Attachment:</td><td class="info-value">${procedure.phase4_step1_data.overdenture_attachment}</td></tr>` : ""}
              ${procedure.phase4_step1_data.impression_type ? `<tr><td class="info-label">Impression Type:</td><td class="info-value">${procedure.phase4_step1_data.impression_type === "intraoral_scans" ? "Intraoral Scans" : "Conventional Impressions"}</td></tr>` : ""}
              ${procedure.phase4_step1_data.payment_complete !== undefined ? `<tr><td class="info-label">Payment Complete:</td><td class="info-value">${procedure.phase4_step1_data.payment_complete ? "Yes" : "No"}</td></tr>` : ""}
              ${procedure.phase4_step1_data.components_available !== undefined ? `<tr><td class="info-label">Components Available:</td><td class="info-value">${procedure.phase4_step1_data.components_available ? "Yes" : "No"}</td></tr>` : ""}
            </table>
          </div>

          ${
            procedure.phase4_step1_student_notes ||
            procedure.stage2_prosthetic_remark ||
            procedure.stage2_prosthetic_faculty_remark ||
            procedure.stage2_prosthetic_incharge_remark
              ? `
          <div class="section">
            <div class="section-title">Step 1 — Notes & Remarks</div>
            ${procedure.phase4_step1_student_notes || procedure.stage2_prosthetic_remark ? `<p class="info-value"><strong>Notes by Student:</strong><br/>${procedure.phase4_step1_student_notes || procedure.stage2_prosthetic_remark}</p>` : ""}
            ${procedure.stage2_prosthetic_faculty_remark ? `<p class="info-value"><strong>Remarks by Supervising Faculty:</strong><br/>${procedure.stage2_prosthetic_faculty_remark}</p>` : ""}
            ${procedure.stage2_prosthetic_incharge_remark ? `<p class="info-value"><strong>Remarks by Implant In-Charge:</strong><br/>${procedure.stage2_prosthetic_incharge_remark}</p>` : ""}
          </div>`
              : ""
          }
          `
              : `
          ${
            procedure.checklist?.prosthetic_phase
              ? `
          <div class="section">
            <div class="section-title">Prosthetic Phase Checklist (Legacy)</div>
            <div class="checklist">
              ${
                procedure.checklist.prosthetic_phase.items
                  ?.map(
                    (item: any) => `
                <div class="checklist-item">
                  <span class="${item.value ? "check-yes" : "check-no"}">${item.value ? "&#10003;" : "&#10007;"}</span>
                  ${getChecklistLabel("prosthetic_phase", item.id)}
                </div>
              `,
                  )
                  .join("") || "<p>No checklist data</p>"
              }
            </div>
          </div>`
              : ""
          }
          `
          }

          ${
            procedure.phase4_step2_data
              ? `
          <div class="section">
            <div class="section-title">Step 2 — Trial & Delivery</div>
            ${
              procedure.phase4_step2_data.trial_checklist &&
              Object.keys(procedure.phase4_step2_data.trial_checklist).length >
                0
                ? `
            <div class="checklist" style="margin-bottom:10px;">
              ${Object.entries(procedure.phase4_step2_data.trial_checklist)
                .map(
                  ([key, val]) => `
                <div class="checklist-item">
                  <span class="${val ? "check-yes" : "check-no"}">${val ? "&#10003;" : "&#10007;"}</span>
                  <span style="text-transform:capitalize;">${key.replace(/_/g, " ")}</span>
                </div>
              `,
                )
                .join("")}
            </div>`
                : ""
            }
            ${
              procedure.phase4_step2_data.confirmation_statement !== undefined
                ? `
            <p class="info-value" style="padding:8px;border-radius:4px;background:${procedure.phase4_step2_data.confirmation_statement ? "#E8F5E9" : "#FFEBEE"};">
              <strong>Confirmation:</strong>
              <span style="color:${procedure.phase4_step2_data.confirmation_statement ? "#2E7D32" : "#C62828"};font-weight:bold;">
                ${procedure.phase4_step2_data.confirmation_statement ? "Treatment Confirmed Complete" : "Not Confirmed"}
              </span>
            </p>`
                : ""
            }
          </div>

          ${
            procedure.phase4_step2_student_notes ||
            procedure.phase4_step2_supervisor_notes ||
            procedure.phase4_step2_incharge_notes
              ? `
          <div class="section">
            <div class="section-title">Step 2 — Notes & Remarks</div>
            ${procedure.phase4_step2_student_notes ? `<p class="info-value"><strong>Notes by Student:</strong><br/>${procedure.phase4_step2_student_notes}</p>` : ""}
            ${procedure.phase4_step2_supervisor_notes ? `<p class="info-value"><strong>Remarks by Supervising Faculty:</strong><br/>${procedure.phase4_step2_supervisor_notes}</p>` : ""}
            ${procedure.phase4_step2_incharge_notes ? `<p class="info-value"><strong>Remarks by Implant In-Charge:</strong><br/>${procedure.phase4_step2_incharge_notes}</p>` : ""}
          </div>`
              : ""
          }
          `
              : ""
          }
          `
              : ""
          }

          <div class="section">
            <div class="section-title">Approval Timeline</div>
            <table>
              <tr><td class="info-label">Phase 1 (Diagnosis and Treatment Planning) Completed:</td><td class="info-value">${procedure.phase1_completed_at ? format(new Date(procedure.phase1_completed_at), "MMMM dd, yyyy HH:mm") : "N/A"}</td></tr>
              <tr><td class="info-label">Phase 2 (Surgical) Completed:</td><td class="info-value">${procedure.phase2_completed_at ? format(new Date(procedure.phase2_completed_at), "MMMM dd, yyyy HH:mm") : "N/A"}</td></tr>
              ${procedure.stage2_surgical_completed_at ? `<tr><td class="info-label">Phase 3 (Healing and Second Stage Surgery) Completed:</td><td class="info-value">${format(new Date(procedure.stage2_surgical_completed_at), "MMMM dd, yyyy HH:mm")}</td></tr>` : ""}
              ${procedure.stage2_prosthetic_completed_at ? `<tr><td class="info-label">Phase 4 (Prosthetic) Completed:</td><td class="info-value">${format(new Date(procedure.stage2_prosthetic_completed_at), "MMMM dd, yyyy HH:mm")}</td></tr>` : ""}
              ${procedure.treatment_completed_at ? `<tr><td class="info-label">Treatment Completed:</td><td class="info-value">${format(new Date(procedure.treatment_completed_at), "MMMM dd, yyyy HH:mm")}</td></tr>` : ""}
            </table>
          </div>

          <div class="footer">
            <p><strong>Generated by Implanr</strong></p>
            <p>This is a computer-generated report</p>
            <p>Generated on ${format(new Date(), "MMMM dd, yyyy HH:mm:ss")}</p>
          </div>
        </body>
      </html>
    `;
  return html;
};

/** Generate the PDF and open the Share sheet (or trigger browser download on web). */
export const generateProcedurePDF = async (procedure: any) => {
  try {
    const html = buildProcedurePdfHtml(procedure, await fetchOrgBranding());

    if (Platform.OS === "web") {
      // Browser: open the HTML report in a new tab; user can Save As PDF.
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      return url;
    }

    const { uri } = await Print.printToFileAsync({ html });
    const isAvailable = await Sharing.isAvailableAsync();

    if (isAvailable) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Procedure_${procedure.patient_name}_${format(new Date(procedure.procedure_date), "yyyy-MM-dd")}.pdf`,
        UTI: "com.adobe.pdf",
      });
    } else {
      Alert.alert(
        "Success",
        "PDF generated but sharing is not available on this device",
      );
    }

    return uri;
  } catch (error) {
    console.error("Error generating PDF:", error);
    Alert.alert("Error", "Failed to generate PDF. Please try again.");
    throw error;
  }
};

/** Open the native print dialog (AirPrint / Android Print Services) with the case report. */
export const printProcedurePDF = async (procedure: any) => {
  try {
    const html = buildProcedurePdfHtml(procedure, await fetchOrgBranding());

    if (Platform.OS === "web") {
      // Open the HTML in a hidden iframe, call window.print() on load.
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          window.open(url, "_blank");
        }
      };
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch {}
        URL.revokeObjectURL(url);
      }, 60000);
      return;
    }

    await Print.printAsync({ html });
  } catch (error) {
    console.error("Error printing PDF:", error);
    Alert.alert("Error", "Failed to open the print dialog.");
  }
};

// ─────────────────────────────────────────────────────────────────
// iter-193: Lab Slip — independent prescription PDF generated from
// phase4_step1_data once the prosthetic plan is approved. Mirrors
// the case-report HTML→PDF flow so it works on web (open) and
// native (Print + Sharing) without any backend round-trip.
// ─────────────────────────────────────────────────────────────────
const _labelize = (
  val: string | undefined | null,
  map: Record<string, string>,
): string => {
  if (!val) return "";
  return map[val] || val.replace(/_/g, " ");
};

export const buildLabSlipHtml = (
  procedure: any,
  org?: OrgBranding | null,
): string => {
  const p4 = procedure.phase4_step1_data || {};
  // iter-211: when the case originates from existing implants (Path A), the
  // surgical phases were skipped so `implant_plans` is empty. Pull the
  // implant inventory from `existing_implants` instead so the Lab Slip
  // still has implant-site / brand / system / Ø / length / platform rows.
  const basePlans: any[] =
    Array.isArray(procedure.implant_plans) && procedure.implant_plans.length > 0
      ? procedure.implant_plans
      : (procedure.existing_implants || []).map((r: any) => ({
          position: r.tooth,
          tooth: r.tooth,
          implant_brand: r.system_unknown
            ? "System unknown — verify clinically"
            : r.brand || "",
          implant_system: r.system_unknown ? "—" : r.system || "",
          implant_diameter: r.diameter_mm ?? "",
          implant_length: r.length_mm ?? "",
          implant_platform: r.platform || "",
          gingival_height: r.gingival_height_mm ?? "",
        }));

  // iter-399: Survival Review substitution — the lab slip must carry the
  // ACTIVE implant at each site. Replaced implants show the R{n} revision's
  // specs; failed / treatment-ended implants without a replacement are
  // excluded entirely (no prosthesis can be fabricated on them).
  // `procedure.implants` arrives pre-resolved from GET /procedures/{id}
  // (_resolve_active_implants_inline) and aligns with basePlans by index.
  const resolvedImplants: any[] = Array.isArray(procedure.implants)
    ? procedure.implants
    : [];
  const hasSurvivalOverlay = resolvedImplants.some(
    (r: any) =>
      r &&
      (r._survival_status ||
        r._active_revision ||
        r._active_in_treatment === false),
  );
  const plans: any[] = hasSurvivalOverlay
    ? basePlans
        .map((p: any, i: number) => {
          const r = resolvedImplants[i];
          if (!r) return p;
          if (r._active_in_treatment === false) return null;
          if (!r._active_revision) return p;
          const site = r.tooth_number ?? r.tooth;
          const brand = r.brand ?? r.system ?? "";
          const system = r.system ?? "";
          return {
            ...p,
            ...(site
              ? { position: site, tooth: site, tooth_number: site }
              : {}),
            brand,
            implant_brand: brand,
            system,
            implant_system: system,
            diameter: r.diameter ?? "",
            implant_diameter: r.diameter ?? "",
            length: r.length ?? "",
            implant_length: r.length ?? "",
          };
        })
        .filter(Boolean)
    : basePlans;

  // Implant table rows
  const implantRows = plans
    .map((p: any, i: number) => {
      // iter-200/201: helpers normalise the canonical→legacy field-name drift.
      const site = getImplantSite(p);
      const spec = getImplantSpec(p);
      return `
    <tr>
      <td>${i + 1}</td>
      <td>${site}</td>
      <td>${spec.brand}</td>
      <td>${spec.system}</td>
      <td>${spec.diameter}</td>
      <td>${spec.length}</td>
      <td>${spec.platform}</td>
    </tr>
  `;
    })
    .join("");

  const trayLabel = _labelize(p4.conventional_tray_type, {
    open_tray: "Open Tray",
    closed_tray: "Closed Tray",
  });
  const matLabel = _labelize(p4.impression_material, {
    polyether: "Polyether",
    heavy_light_body: "Heavy and Light body",
    putty_light_body: "Putty and Light body",
  });
  const impressionSummary =
    p4.impression_type === "intraoral_scans"
      ? "Intra-Oral Digital Scans"
      : `Conventional${trayLabel ? ` — ${trayLabel}` : ""}${matLabel ? ` (${matLabel})` : ""}`;

  // iter-202: Multi-Unit Abutment block — historically sourced from Phase 2
  // surgical capture (`procedure.phase2_data.multi_unit_abutment_*`). The lab
  // needs angulation + cuff height per implant to fabricate the substructure.
  // iter-210: prefer the Phase 4 Step 1 override
  // (`procedure.phase4_step1_data.multi_unit_abutment_details`) when the
  // prosthodontist has revised the spec at delivery; fall back to Phase 2
  // only when Phase 4 doesn't carry an override.
  const p2 = procedure.phase2_data || {};
  const phase4MuaOverride: any[] = Array.isArray(p4.multi_unit_abutment_details)
    ? p4.multi_unit_abutment_details
    : [];
  const phase2MuaDetails: any[] = Array.isArray(p2.multi_unit_abutment_details)
    ? p2.multi_unit_abutment_details
    : [];
  const muaSourceIsPhase4 = phase4MuaOverride.length > 0;
  const muaDetails: any[] = muaSourceIsPhase4
    ? phase4MuaOverride
    : phase2MuaDetails;
  const muaPlaced =
    muaSourceIsPhase4 || p2.multi_unit_abutment_placed === "yes";
  const muaRows =
    muaPlaced && muaDetails.length > 0
      ? muaDetails
          .map((row: any, idx: number) => {
            const tooth = row?.tooth ?? "—";
            // iter-210: strip a trailing degree symbol the user may have typed
            // into the structured editor so we don't render '30°°' on the slip.
            const angRaw = (row?.angulation ?? "")
              .toString()
              .trim()
              .replace(/°+$/, "");
            const cuffRaw = (row?.cuff_height ?? "")
              .toString()
              .trim()
              .replace(/(mm|MM)\s*$/, "")
              .trim();
            const ang = angRaw ? `${angRaw}°` : "—";
            const cuff = cuffRaw ? `${cuffRaw} mm` : "—";
            return `
          <tr>
            <td style="text-align: center;">${idx + 1}</td>
            <td style="text-align: center;">${tooth}</td>
            <td style="text-align: center;">${ang}</td>
            <td style="text-align: center;">${cuff}</td>
          </tr>`;
          })
          .join("")
      : "";
  // Healing-abutment cuff heights (sometimes recorded even without an MUA)
  // are included as a small note row when present and MUA wasn't placed.
  const hch = p2.healing_abutment_cuff_height;
  const healingNote =
    !muaPlaced && hch
      ? Array.isArray(hch)
        ? hch.filter(Boolean).join(" / ")
        : String(hch)
      : "";

  // iter-194: shade selection rows
  const shadeValues: string[] = Array.isArray(p4.shade_values)
    ? p4.shade_values
    : [];
  const shadeLayout: string = p4.shade_layout || "per_implant";
  const shadeRowsHtml =
    shadeValues.length === 0
      ? ""
      : (() => {
          const rows = shadeValues
            .map((s: string, i: number) => {
              const siteVal = getImplantSite(plans[i], "");
              const lbl =
                shadeLayout === "full_arch"
                  ? i === 0
                    ? "Anterior"
                    : i === 1
                      ? "Posterior"
                      : `Slot ${i + 1}`
                  : siteVal
                    ? `Tooth #${siteVal}`
                    : `Implant ${i + 1}`;
              return `<tr><td class="lbl">${lbl} Shade</td><td><strong>${s || "—"}</strong></td></tr>`;
            })
            .join("");
          const note = p4.shade_notes
            ? `<tr><td class="lbl">Shade Note (to lab)</td><td style="white-space: pre-wrap;">${p4.shade_notes}</td></tr>`
            : "";
          return rows + note;
        })();

  const issuedAt = format(new Date(), "dd MMM yyyy, HH:mm");
  const procDate = procedure.procedure_date
    ? format(new Date(procedure.procedure_date), "dd MMM yyyy")
    : "—";

  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>
        body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 24px; font-size: 12px; color: #1a1a1a; }
        .ls-header { border-bottom: 3px solid #6A1B9A; padding-bottom: 14px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center; }
        .ls-header h1 { margin: 0; color: #6A1B9A; font-size: 22px; letter-spacing: 1px; }
        .ls-header .meta { text-align: right; font-size: 11px; color: #555; }
        .ls-meta .id { font-weight: bold; color: #6A1B9A; font-size: 13px; }
        .ls-section { margin-bottom: 16px; border: 1px solid #E1BEE7; border-radius: 8px; padding: 12px 14px; }
        .ls-section h2 { margin: 0 0 8px 0; font-size: 13px; color: #6A1B9A; text-transform: uppercase; letter-spacing: 0.5px; }
        table { width: 100%; border-collapse: collapse; }
        .grid td { padding: 5px 8px; vertical-align: top; }
        .grid td.lbl { font-weight: bold; color: #4A148C; width: 38%; }
        .implant-tbl th, .implant-tbl td { border: 1px solid #CE93D8; padding: 6px 8px; text-align: left; font-size: 11px; }
        .implant-tbl th { background-color: #F3E5F5; color: #6A1B9A; }
        .lab-instructions { background-color: #FFF3E0; border-left: 4px solid #FB8C00; padding: 10px 14px; border-radius: 6px; }
        .signature-row { display: flex; justify-content: space-between; margin-top: 36px; }
        .sig-box { width: 45%; border-top: 1px solid #555; padding-top: 6px; font-size: 11px; text-align: center; }
        .footer { margin-top: 28px; padding-top: 10px; border-top: 1px dashed #BDBDBD; font-size: 10px; color: #757575; text-align: center; }
        .badge { display: inline-block; padding: 3px 8px; background-color: #6A1B9A; color: white; border-radius: 10px; font-size: 10px; font-weight: bold; }
      </style>
    </head>
    <body>
      ${orgHeaderHtml(org)}
      <div class="ls-header">
        <div>
          <h1>DENTAL LABORATORY PRESCRIPTION</h1>
          <div style="font-size: 11px; color: #6A1B9A; margin-top: 4px;">Implant-Supported Prosthesis &middot; Lab Slip</div>
        </div>
        <div class="meta">
          <div class="id">CASE #${(procedure.id || procedure._id || "").toString().slice(-8).toUpperCase()}</div>
          <div>Issued: ${issuedAt}</div>
        </div>
      </div>

      <div class="ls-section ls-meta">
        <h2>Patient Information</h2>
        <table class="grid">
          <tr><td class="lbl">Patient Name</td><td>${procedure.patient_name || "—"}</td></tr>
          <tr><td class="lbl">Registration No.</td><td>${procedure.registration_number || "—"}</td></tr>
          <tr><td class="lbl">Age / Gender</td><td>${[procedure.age, procedure.gender].filter(Boolean).join(" / ") || "—"}</td></tr>
          <tr><td class="lbl">Implant Site / Region</td><td>${procedure.implant_site || procedure.region || "—"}</td></tr>
          <tr><td class="lbl">Surgery Date</td><td>${procDate}</td></tr>
        </table>
      </div>

      <div class="ls-section">
        <h2>Implant Details</h2>
        ${
          plans.length > 0
            ? `
          <table class="implant-tbl">
            <tr>
              <th>#</th><th>Implant Site</th><th>Implant Company</th><th>System</th><th>Ø</th><th>Length</th><th>Platform</th>
            </tr>
            ${implantRows}
          </table>
        `
            : `<div style="font-style: italic; color: #777;">No implant plan recorded.</div>`
        }
      </div>

      ${
        muaRows
          ? `
      <div class="ls-section" style="border-color: #B3E5FC; background-color: #E1F5FE;">
        <h2 style="color: #01579B;">Multi-Unit Abutments</h2>
        <table class="implant-tbl mua-tbl" style="width: auto; max-width: 360px; border-collapse: collapse;">
          <colgroup>
            <col style="width: 36px;" />
            <col style="width: 64px;" />
            <col style="width: 92px;" />
            <col style="width: 152px;" />
          </colgroup>
          <tr>
            <th style="background-color: #B3E5FC; color: #01579B; text-align: center;">#</th>
            <th style="background-color: #B3E5FC; color: #01579B; text-align: center;">Site</th>
            <th style="background-color: #B3E5FC; color: #01579B; text-align: center;">Angulation</th>
            <th style="background-color: #B3E5FC; color: #01579B; text-align: center;">Cuff Height</th>
          </tr>
          ${muaRows}
        </table>
      </div>
      `
          : ""
      }
      ${
        healingNote
          ? `
      <div class="ls-section" style="border-color: #B3E5FC; background-color: #E1F5FE;">
        <h2 style="color: #01579B;">Healing Abutment</h2>
        <table class="grid">
          <tr><td class="lbl">Cuff (Gingival) Height</td><td><strong>${healingNote}${/mm/i.test(healingNote) ? "" : " mm"}</strong></td></tr>
        </table>
      </div>
      `
          : ""
      }

      <div class="ls-section">
        <h2>Final Prosthesis Plan</h2>
        <table class="grid">
          <tr><td class="lbl">Final Prosthetic Plan</td><td><span class="badge">${p4.final_prosthetic_plan || "—"}</span></td></tr>
          <tr><td class="lbl">Prosthetic Material</td><td>${p4.prosthetic_material || "—"}</td></tr>
          ${p4.custom_abutment ? `<tr><td class="lbl">Custom Abutment</td><td>${p4.custom_abutment}</td></tr>` : ""}
          ${p4.overdenture_attachment ? `<tr><td class="lbl">Overdenture Attachment</td><td>${p4.overdenture_attachment}</td></tr>` : ""}
          <tr><td class="lbl">Impression</td><td>${impressionSummary}</td></tr>
          ${procedure.shade ? `<tr><td class="lbl">Shade</td><td>${procedure.shade}</td></tr>` : ""}
        </table>
      </div>

      ${
        shadeRowsHtml
          ? `
      <div class="ls-section" style="border-color: #FFB74D; background-color: #FFF8E1;">
        <h2 style="color: #E65100;">Shade Selection</h2>
        <table class="grid">
          ${shadeRowsHtml}
        </table>
      </div>
      `
          : ""
      }

      ${
        procedure.lab_slip_note
          ? `
        <div class="ls-section lab-instructions">
          <h2 style="color: #E65100;">Special Instructions to Lab</h2>
          <div>
            <div style="font-weight: bold; color: #BF360C; margin-bottom: 4px;">Note to the Lab</div>
            <div style="white-space: pre-wrap; line-height: 1.5;">${procedure.lab_slip_note}</div>
          </div>
        </div>
      `
          : ""
      }

      <div class="signature-row">
        <div class="sig-box">${procedure.student_name || procedure.created_by_name || "—"}<br /><span style="color: #888;">Prescribing Dentist</span></div>
        <div class="sig-box">${procedure.implant_incharge_name || procedure.supervisor_name || "—"}<br /><span style="color: #888;">Approving In-Charge</span></div>
      </div>

      <div class="footer">
        Generated by Implanr &middot; ${issuedAt}. This prescription is part of the patient's medical record.
      </div>
    </body>
  </html>
  `;
};

export const generateLabSlipPDF = async (procedure: any) => {
  try {
    const html = buildLabSlipHtml(procedure, await fetchOrgBranding());
    if (Platform.OS === "web") {
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      return url;
    }
    const { uri } = await Print.printToFileAsync({ html });
    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `LabSlip_${procedure.patient_name || "patient"}.pdf`,
        UTI: "com.adobe.pdf",
      });
    } else {
      Alert.alert(
        "Lab Slip",
        "PDF generated but sharing is unavailable on this device.",
      );
    }
    return uri;
  } catch (e) {
    console.error("Lab slip generation failed:", e);
    Alert.alert("Error", "Failed to generate the lab slip. Please try again.");
    throw e;
  }
};

const renderAdditionalFields = (fields: any): string => {
  if (!fields || Object.keys(fields).length === 0) return "";
  return `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e0e0e0;">
    ${Object.entries(fields)
      .map(
        ([key, value]) => `
      <div style="margin-bottom: 4px;"><span class="info-label">${key}:</span> <span class="info-value">${value}</span></div>
    `,
      )
      .join("")}
  </div>`;
};

const getChecklistLabel = (section: string, id: string): string => {
  const labels: any = {
    pre_surgical: {
      case_selection: "Case Selection Approved",
      academic_readiness: "Academic Readiness (with presentation)",
      hematological: "Hematological Investigations",
      radiographic: "Radiographic Investigations",
      instruments: "Availability of the Instruments",
      treatment_plan: "Approved Treatment & Prosthetic Plan",
      payment: "Full payment done",
      medical_assessment: "Medical assessment done",
      realguide:
        "Virtual Implant Planning Done (Exoplan, CoDiagnostiX, RealGuide etc.)",
      oral_prophylaxis: "Oral Prophylaxis done",
      patient_consent: "Patient Consent Taken",
    },
    surgical: {
      consent_form: "Signed Patient consent form",
      cbct_report: "Arranged CBCT Report",
      room_cleanliness: "Cleanliness of the Implant Room",
      drapes_gowns: "Clean autoclaved drapes and gowns",
      instruments_equipment: "Clean autoclaved instruments and equipment",
      asepsis: "Asepsis and disinfection of operatory",
      register_entry: "Entry into implant register with sticker",
      post_cleaning:
        "Post operative cleaning of implant room, instruments and equipment",
    },
    second_stage: {
      healing_assessment:
        "Implant healing assessment (clinical & radiographic)",
      tissue_conditioning: "Tissue conditioning done",
      second_stage_surgery: "Second stage surgery performed",
      healing_abutment: "Healing abutment placed",
      soft_tissue_eval: "Soft tissue evaluation and management",
      patient_hygiene: "Patient oral hygiene instructions given",
      post_op_radiograph: "Post-operative radiograph taken",
      follow_up_scheduled: "Follow-up appointment scheduled",
    },
    prosthetic_phase: {
      impression_taken: "Final impression taken",
      bite_registration: "Bite registration completed",
      shade_selection: "Shade selection done",
      try_in: "Try-in verification completed",
      final_prosthesis: "Final prosthesis placed",
      occlusal_adjustment: "Occlusal adjustment done",
      patient_instructions: "Patient care instructions given",
      maintenance_schedule: "Maintenance schedule established",
    },
  };

  return labels[section]?.[id] || id;
};

// ─────────────────────────────────────────────────────────────────────────────
// Treatment Termination Summary — generated when a case reaches
// `status = "treatment_ended"` (End Implant Treatment on the Survival Review).
// Purpose: hand-off document for the patient's next dentist + institutional
// audit copy. Includes patient info, clinician chain, termination metadata
// (date / decision maker / reason) and the full implant lifecycle events.
// ─────────────────────────────────────────────────────────────────────────────

const _fmtDateTime = (val: any): string => {
  if (!val) return "—";
  try {
    const d = typeof val === "string" ? new Date(val) : val;
    if (Number.isNaN(d?.getTime?.())) return String(val);
    return format(d, "dd MMM yyyy, HH:mm");
  } catch {
    return String(val);
  }
};

const _esc = (s: any): string =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] || c,
  );

/**
 * Build the Termination Summary HTML. Consumed by both the export (Save-As-PDF
 * / share sheet) and the native print flow.
 */
export const buildTerminationSummaryHtml = (procedure: any): string => {
  const p = procedure || {};
  const caseId =
    p.badge_case_id || (p.id || p._id || "").toString().slice(-6).toUpperCase();
  const endedAt =
    p.treatment_ended_at || p.phase2_survival_review?.last_reviewed_at;
  const decisionMaker = p.treatment_ended_decision_maker || "—";
  const endReason = p.treatment_ended_reason || "—";

  // Aggregate ALL implants ever associated with this case (original placements
  // + revision chain items pulled from the survival-review implants map).
  const originalImplants: any[] =
    Array.isArray(p.implants) && p.implants.length
      ? p.implants
      : Array.isArray(p.implant_plans)
        ? p.implant_plans
        : Array.isArray(p.existing_implants)
          ? p.existing_implants
          : [];
  const smap = (p.phase2_survival_review || {}).implants || {};
  const events: any[] = (p.phase2_survival_review || {}).events || [];

  const implantRows =
    originalImplants
      .map((imp: any, i: number) => {
        const surv = smap[String(i)] || {};
        const status = surv.status || "Active";
        const tooth = imp.tooth_number || imp.tooth || imp.position || "—";
        const system =
          [imp.brand, imp.system].filter(Boolean).join(" / ") ||
          imp.system ||
          "—";
        const size =
          [
            imp.diameter && `Ø${imp.diameter}mm`,
            imp.length && `L${imp.length}mm`,
          ]
            .filter(Boolean)
            .join(" · ") || "—";
        const badgeColor =
          status === "Treatment Ended"
            ? "#C62828"
            : status === "Failed"
              ? "#EF6C00"
              : status === "Replaced"
                ? "#795548"
                : "#2E7D32";
        const reason = surv.reason ? _esc(surv.reason) : "";
        return `
      <tr>
        <td style="padding:6px 8px; border-bottom:1px solid #ECEFF1;">${_esc(tooth)}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #ECEFF1;">${_esc(system)}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #ECEFF1;">${_esc(size)}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #ECEFF1;">
          <span style="background:${badgeColor}; color:#FFF; padding:2px 8px; border-radius:999px; font-size:10px; font-weight:700; letter-spacing:0.4px;">${_esc(status.toUpperCase())}</span>
          ${reason ? `<div style="color:#546E7A; font-size:10px; margin-top:3px;">${reason}</div>` : ""}
        </td>
      </tr>`;
      })
      .join("") ||
    `<tr><td colspan="4" style="padding:12px; text-align:center; color:#78909C; font-style:italic;">No implants on record</td></tr>`;

  const timelineRows =
    events
      .map((ev: any) => {
        const at = _fmtDateTime(ev.at);
        const who = ev.by || "—";
        const failuresTxt =
          Array.isArray(ev.failures) && ev.failures.length
            ? ev.failures
                .map((f: any) => {
                  const flags: string[] = [];
                  if (f.end_treatment) flags.push("END TREATMENT");
                  else if (f.replaced) flags.push("replaced");
                  else if (f.removed) flags.push("removed");
                  if (f.site_changed && f.new_tooth_number)
                    flags.push(`site → #${f.new_tooth_number}`);
                  const flagsStr = flags.length
                    ? ` (${flags.join(" · ")})`
                    : "";
                  return `Tooth #${_esc(f.tooth)} — ${_esc(f.reason || "Unknown")}${_esc(flagsStr)}`;
                })
                .join("<br />")
            : ev.all_survived
              ? "All implants surviving"
              : "—";
        return `
      <tr>
        <td style="padding:6px 8px; border-bottom:1px solid #ECEFF1; white-space:nowrap; vertical-align:top; color:#37474F; font-weight:600;">${_esc(at)}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #ECEFF1; color:#546E7A; vertical-align:top;">${_esc(who)}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #ECEFF1; color:#263238; vertical-align:top;">${failuresTxt}</td>
      </tr>`;
      })
      .join("") ||
    `<tr><td colspan="3" style="padding:12px; text-align:center; color:#78909C; font-style:italic;">No survival review events recorded</td></tr>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Treatment Termination Summary — ${_esc(p.patient_name || "Patient")}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Helvetica', 'Arial', sans-serif; margin: 0; padding: 24px; color: #263238; font-size: 12px; line-height: 1.45; }
    .banner { background: #C62828; color: #FFF; padding: 14px 18px; border-radius: 8px; margin-bottom: 18px; }
    .banner h1 { margin: 0; font-size: 20px; letter-spacing: 0.6px; }
    .banner p { margin: 4px 0 0; font-size: 11px; opacity: 0.9; }
    .meta { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 16px; font-size: 11px; color: #546E7A; }
    .card { border: 1px solid #ECEFF1; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }
    .card.danger { border-color: #EF9A9A; background: #FFF5F5; }
    .card h2 { margin: 0 0 8px; font-size: 12px; color: #0D47A1; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 800; }
    .card.danger h2 { color: #B71C1C; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; }
    .grid .k { color: #78909C; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.3px; }
    .grid .v { color: #263238; font-size: 12px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; }
    thead th { background: #F5F7FA; color: #37474F; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.4px; padding: 8px; text-align: left; border-bottom: 1px solid #CFD8DC; }
    tbody td { font-size: 11px; }
    .sig { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 18px; }
    .sig-box { border: 1px solid #ECEFF1; border-radius: 6px; padding: 30px 12px 10px; text-align: center; color: #78909C; font-size: 10.5px; min-height: 90px; }
    .sig-line { border-bottom: 1px solid #37474F; height: 24px; margin-bottom: 8px; }
    .foot { margin-top: 18px; padding-top: 10px; border-top: 1px dashed #CFD8DC; text-align: center; color: #90A4AE; font-size: 9.5px; font-style: italic; }
    .reason-quote { background: #FFEBEE; border-left: 3px solid #C62828; padding: 8px 12px; margin-top: 8px; font-style: italic; color: #B71C1C; border-radius: 0 6px 6px 0; }
  </style>
</head>
<body>
  <div class="banner">
    <h1>TREATMENT TERMINATION SUMMARY</h1>
    <p>Case #${_esc(caseId)} · Generated ${_fmtDateTime(new Date())}</p>
  </div>

  <div class="meta">
    <div><strong>Institution:</strong> Implanr Prosthodontic Records</div>
    <div><strong>Document type:</strong> Terminal-state medico-legal summary</div>
  </div>

  <!-- Patient -->
  <div class="card">
    <h2>Patient Information</h2>
    <div class="grid">
      <div><div class="k">Full name</div><div class="v">${_esc(p.patient_name || "—")}</div></div>
      <div><div class="k">Registration #</div><div class="v">${_esc(p.registration_number || "—")}</div></div>
      <div><div class="k">Age / Sex</div><div class="v">${_esc([p.patient_age, p.patient_gender].filter(Boolean).join(" / ") || "—")}</div></div>
      <div><div class="k">Contact</div><div class="v">${_esc(p.patient_phone || p.patient_contact || "—")}</div></div>
      <div style="grid-column: 1 / -1;"><div class="k">Chief complaint</div><div class="v" style="font-weight:500;">${_esc(p.chief_complaint || "—")}</div></div>
    </div>
  </div>

  <!-- Clinician Chain -->
  <div class="card">
    <h2>Clinician Chain</h2>
    <div class="grid">
      <div><div class="k">Operating Student</div><div class="v">${_esc(p.student_name || "—")}</div></div>
      <div><div class="k">Supervising Consultant</div><div class="v">${_esc(p.supervisor_name || "—")}</div></div>
      <div><div class="k">Implant In-Charge</div><div class="v">${_esc(p.incharge_name || p.implant_incharge_name || "—")}</div></div>
      <div><div class="k">Procedure Type</div><div class="v">${_esc(p.implant_procedure_type || "—")}</div></div>
    </div>
  </div>

  <!-- Termination Details -->
  <div class="card danger">
    <h2>Termination Details</h2>
    <div class="grid">
      <div><div class="k">Terminated on</div><div class="v">${_esc(_fmtDateTime(endedAt))}</div></div>
      <div><div class="k">Decision by</div><div class="v" style="color:#B71C1C;">${_esc(decisionMaker)}</div></div>
    </div>
    <div class="reason-quote">${_esc(endReason)}</div>
    <p style="margin: 10px 0 0; font-size: 10.5px; color: #78909C;">
      Implant therapy for this patient has been <strong style="color:#B71C1C;">discontinued</strong>. No further replacement, healing or prosthetic phases will be recorded in this case file. Alternative therapy discussions and referrals (if any) are documented in the patient's clinical notes.
    </p>
  </div>

  ${(() => {
    // AI Exit Summary — soft clinical recommendations from GPT-5.2
    // (PHI-redacted), optionally edited by clinician. Rendered as a distinct
    // card so downstream dentists can find the hand-off note quickly.
    const s = p.ai_exit_summary || {};
    const txt = (s.text || "").trim();
    if (!txt) return "";
    const edited = s.edited
      ? ` · <span style="color:#AD1457;font-weight:700;">Edited by ${_esc(s.edited_by || "clinician")}</span>`
      : "";
    const genAt = _fmtDateTime(s.edited_at || s.generated_at || null);
    return `
      <div class="card" style="border-color:#F8BBD0; background:#FFF8FA;">
        <h2 style="color:#AD1457;">AI Exit Summary — Clinical Hand-off Recommendation</h2>
        <p style="margin:0 0 6px; font-size:11px; color:#546E7A;">
          Auto-drafted by the platform's clinical AI on ${_esc(genAt)}${edited}. Verify before acting.
        </p>
        <div style="background:#FFF; border-left:3px solid #C62828; border-radius:0 6px 6px 0; padding:10px 12px; color:#263238; font-size:12px; line-height:1.55; white-space:pre-wrap;">${_esc(txt)}</div>
      </div>`;
  })()}

  <!-- Implants -->
  <div class="card">
    <h2>Implants Placed &amp; Final Status</h2>
    <table>
      <thead>
        <tr><th>Site (FDI)</th><th>System</th><th>Size</th><th>Final Status &amp; Reason</th></tr>
      </thead>
      <tbody>${implantRows}</tbody>
    </table>
  </div>

  <!-- Lifecycle -->
  <div class="card">
    <h2>Survival Review Timeline</h2>
    <table>
      <thead>
        <tr><th style="width:150px;">When</th><th style="width:170px;">By</th><th>Outcome</th></tr>
      </thead>
      <tbody>${timelineRows}</tbody>
    </table>
  </div>

  <!-- Signatures -->
  <div class="sig">
    <div class="sig-box">
      <div class="sig-line"></div>
      Operator signature<br /><strong>${_esc(p.student_name || p.supervisor_name || "—")}</strong>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      Patient acknowledgement<br /><strong>${_esc(p.patient_name || "—")}</strong>
    </div>
  </div>

  <div class="foot">
    Generated by Implanr · This document contains PHI — handle per HIPAA safeguards. Access to this record is audit-logged.
  </div>
</body>
</html>`;
};

/** Export the Termination Summary — opens Share sheet on native, new-tab HTML on web. */
export const generateTerminationSummaryPDF = async (procedure: any) => {
  try {
    const html = buildTerminationSummaryHtml(procedure);
    if (Platform.OS === "web") {
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      return url;
    }
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Termination_${(procedure.patient_name || "Patient").replace(/\s+/g, "_")}.pdf`,
        UTI: "com.adobe.pdf",
      });
    } else {
      Alert.alert(
        "Saved",
        "PDF generated. Sharing is unavailable on this device.",
      );
    }
    return uri;
  } catch (e) {
    console.error("Termination PDF error:", e);
    Alert.alert(
      "Error",
      "Failed to generate the Termination Summary. Please try again.",
    );
    throw e;
  }
};

/** Open the native print dialog with the Termination Summary. */
export const printTerminationSummaryPDF = async (procedure: any) => {
  try {
    const html = buildTerminationSummaryHtml(procedure);
    if (Platform.OS === "web") {
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.style.cssText =
        "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          window.open(url, "_blank");
        }
      };
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch {}
        URL.revokeObjectURL(url);
      }, 60000);
      return;
    }
    await Print.printAsync({ html });
  } catch (e) {
    console.error("Termination print error:", e);
    Alert.alert("Error", "Failed to open the print dialog.");
  }
};
