import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';
import { format } from 'date-fns';

/** Build the full HTML for the procedure case report (shared by download + print flows). */
export const buildProcedurePdfHtml = (procedure: any): string => {
  const isCompleted = procedure.status === 'completed';
  const statusBadgeText = isCompleted
    ? 'TREATMENT COMPLETE - ALL PROTOCOLS APPROVED'
    : 'STAGE 1 IMPLANT PLACEMENT DONE SUCCESSFULLY';
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
            .status-badge { display: inline-block; padding: 6px 12px; background-color: ${isCompleted ? '#2E7D32' : '#4CAF50'}; color: white; border-radius: 4px; font-weight: bold; font-size: 11px; margin: 10px 0; }
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
            <h1>Dental Implant Procedure Report</h1>
            <p>Department of Prosthodontics</p>
            <p>Bharati Vidyapeeth Dental College and Hospital, Pune</p>
            <span class="status-badge">${statusBadgeText}</span>
          </div>

          <div class="section">
            <div class="section-title">Patient Information</div>
            <table>
              <tr><td class="info-label">Patient Name:</td><td class="info-value">${procedure.patient_name}</td></tr>
              <tr><td class="info-label">Registration Number:</td><td class="info-value">${procedure.registration_number}</td></tr>
              <tr><td class="info-label">Implant Site:</td><td class="info-value">${procedure.implant_site}</td></tr>
              <tr><td class="info-label">Procedure Date:</td><td class="info-value">${format(new Date(procedure.procedure_date), 'MMMM dd, yyyy')}</td></tr>
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

          ${(procedure.implant_region || procedure.implant_company) ? `
          <div class="section">
            <div class="section-title">Implant Details</div>
            ${procedure.implant_region ? `<p class="info-value"><strong>Region:</strong> ${procedure.implant_region}</p>` : ''}
            ${procedure.implant_company ? `<p class="info-value"><strong>Company:</strong> ${procedure.implant_company}</p>` : ''}
          </div>` : ''}

          ${procedure.implant_procedure_type ? `
          <div class="section">
            <div class="section-title">Procedure Details</div>
            <table>
              <tr><td class="info-label">Procedure Type:</td><td class="info-value">${procedure.implant_procedure_type}</td></tr>
              ${procedure.loading_type?.length ? `<tr><td class="info-label">Loading Type:</td><td class="info-value">${procedure.loading_type.join(', ')}</td></tr>` : ''}
              ${procedure.prosthetic_plan ? `<tr><td class="info-label">Prosthetic Plan:</td><td class="info-value">${procedure.prosthetic_plan}</td></tr>` : ''}
              ${procedure.prosthetic_plan_other ? `<tr><td class="info-label">Prosthetic Plan (Other):</td><td class="info-value">${procedure.prosthetic_plan_other}</td></tr>` : ''}
            </table>
          </div>` : ''}

          ${(procedure.edentulous_sites?.length || procedure.edentulous_site || procedure.arch_condition || procedure.ridge_contour || procedure.soft_tissue_thickness || procedure.keratinized_mucosa) ? `
          <div class="section">
            <div class="section-title">Clinical Examination — Intraoral</div>
            <table>
              ${procedure.edentulous_sites?.length ? `<tr><td class="info-label">Edentulous Sites:</td><td class="info-value">${procedure.edentulous_sites.join(', ')}</td></tr>` : ''}
              ${procedure.edentulous_site && !procedure.edentulous_sites?.length ? `<tr><td class="info-label">Edentulous Site:</td><td class="info-value">${procedure.edentulous_site}</td></tr>` : ''}
              ${procedure.arch_condition ? `<tr><td class="info-label">Arch Condition:</td><td class="info-value">${procedure.arch_condition}</td></tr>` : ''}
              ${procedure.ridge_contour ? `<tr><td class="info-label">Ridge Contour:</td><td class="info-value">${procedure.ridge_contour}</td></tr>` : ''}
              ${procedure.soft_tissue_thickness ? `<tr><td class="info-label">Soft Tissue:</td><td class="info-value">${procedure.soft_tissue_thickness}</td></tr>` : ''}
              ${procedure.keratinized_mucosa ? `<tr><td class="info-label">Keratinized Mucosa:</td><td class="info-value">${procedure.keratinized_mucosa}</td></tr>` : ''}
            </table>
          </div>` : ''}

          ${(procedure.occlusal_scheme || procedure.parafunction_habit || procedure.vertical_dimension || procedure.opposing_dentition || procedure.vertical_dimension_mm || procedure.tmj) ? `
          <div class="section">
            <div class="section-title">Occlusal Analysis</div>
            <table>
              ${procedure.occlusal_scheme ? `<tr><td class="info-label">Occlusal Scheme:</td><td class="info-value">${procedure.occlusal_scheme}</td></tr>` : ''}
              ${procedure.parafunction_habit ? `<tr><td class="info-label">Parafunctional Habits:</td><td class="info-value">${procedure.parafunction_habit}</td></tr>` : ''}
              ${procedure.vertical_dimension ? `<tr><td class="info-label">Vertical Dimension:</td><td class="info-value">${procedure.vertical_dimension}</td></tr>` : ''}
              ${procedure.vertical_dimension_mm ? `<tr><td class="info-label">Vertical Dimension (mm):</td><td class="info-value">${procedure.vertical_dimension_mm}</td></tr>` : ''}
              ${procedure.opposing_dentition ? `<tr><td class="info-label">Opposing Dentition:</td><td class="info-value">${procedure.opposing_dentition}</td></tr>` : ''}
              ${procedure.tmj ? `<tr><td class="info-label">TMJ Assessment:</td><td class="info-value">${procedure.tmj}</td></tr>` : ''}
            </table>
          </div>` : ''}

          ${(procedure.smile_line || procedure.gingival_biotype) ? `
          <div class="section">
            <div class="section-title">Aesthetic Risk Assessment</div>
            <table>
              ${procedure.smile_line ? `<tr><td class="info-label">Smile Line:</td><td class="info-value">${procedure.smile_line}</td></tr>` : ''}
              ${procedure.gingival_biotype ? `<tr><td class="info-label">Gingival Biotype:</td><td class="info-value">${procedure.gingival_biotype}</td></tr>` : ''}
            </table>
          </div>` : ''}

          ${procedure.medical_assessment && Object.keys(procedure.medical_assessment).length > 0 ? `
          <div class="section">
            <div class="section-title">Medical Assessment${procedure.medical_risk_level ? ` — ${procedure.medical_risk_level}` : ''}</div>
            <table>
              ${Object.entries(procedure.medical_assessment).map(([key, value]) => `
              <tr>
                <td class="info-label" style="text-transform: capitalize;">${key.replace(/_/g, ' ')}:</td>
                <td class="info-value">
                  <span style="color: ${value === 'Yes' ? '#F44336' : '#4CAF50'}; font-weight: bold;">${value}</span>
                </td>
              </tr>`).join('')}
            </table>
          </div>` : ''}

          ${procedure.implant_plans?.length ? `
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
              ${procedure.implant_plans.map((imp: any) => `
              <tr>
                <td style="border:1px solid #ddd;padding:6px;font-size:11px;">${imp.position}</td>
                <td style="border:1px solid #ddd;padding:6px;font-size:11px;">${imp.brand}</td>
                <td style="border:1px solid #ddd;padding:6px;font-size:11px;">${imp.system}</td>
                <td style="border:1px solid #ddd;padding:6px;font-size:11px;">${imp.diameter}mm</td>
                <td style="border:1px solid #ddd;padding:6px;font-size:11px;">${imp.length}mm</td>
              </tr>`).join('')}
            </table>
          </div>` : ''}

          ${procedure.bone_graft_specifications ? `
          <div class="section">
            <div class="section-title">Bone Graft/Membrane Specifications</div>
            <p class="info-value">${procedure.bone_graft_specifications}</p>
          </div>` : ''}

          <div class="stage-divider">PHASE 1 — PRE-SURGICAL PROTOCOL</div>

          <div class="section">
            <div class="section-title">Pre-Surgical Checklist</div>
            <div class="checklist">
              ${procedure.checklist?.pre_surgical?.items?.map((item: any) => `
                <div class="checklist-item">
                  <span class="${item.value ? 'check-yes' : 'check-no'}">${item.value ? '&#10003;' : '&#10007;'}</span>
                  ${getChecklistLabel('pre_surgical', item.id)}
                </div>
              `).join('') || '<p>No checklist data available</p>'}
            </div>
            ${renderAdditionalFields(procedure.checklist?.pre_surgical?.additional_fields)}
          </div>

          ${procedure.remark ? `
          <div class="section">
            <div class="section-title">Phase 1 — Remarks</div>
            <p class="info-value">${procedure.remark}</p>
          </div>` : ''}

          ${procedure.phase2_data || procedure.checklist?.surgical ? `
          <div class="stage-divider">PHASE 2 — SURGICAL PROTOCOLS</div>

          ${procedure.phase2_data ? `
          ${procedure.phase2_data.pre_surgery_checklist && Object.keys(procedure.phase2_data.pre_surgery_checklist).length > 0 ? `
          <div class="section">
            <div class="section-title">Pre-Surgery Checklist</div>
            <div class="checklist">
              ${Object.entries(procedure.phase2_data.pre_surgery_checklist).map(([key, val]) => `
                <div class="checklist-item">
                  <span class="${val ? 'check-yes' : 'check-no'}">${val ? '&#10003;' : '&#10007;'}</span>
                  <span style="text-transform:capitalize;">${key.replace(/_/g, ' ')}</span>
                </div>
              `).join('')}
            </div>
          </div>` : ''}

          <div class="section">
            <div class="section-title">Surgical Procedure</div>
            <table>
              ${procedure.phase2_data.anesthesia_adequate ? `<tr><td class="info-label">Anaesthesia Adequate:</td><td class="info-value">${procedure.phase2_data.anesthesia_adequate}</td></tr>` : ''}
              ${procedure.phase2_data.anesthesia_details ? `<tr><td class="info-label">Anaesthesia Notes:</td><td class="info-value">${procedure.phase2_data.anesthesia_details}</td></tr>` : ''}
              ${procedure.phase2_data.flap_design ? `<tr><td class="info-label">Incision / Flap Design:</td><td class="info-value">${procedure.phase2_data.flap_design}</td></tr>` : ''}
              ${procedure.phase2_data.drilling_type ? `<tr><td class="info-label">Drilling Type:</td><td class="info-value">${procedure.phase2_data.drilling_type}</td></tr>` : ''}
              ${procedure.phase2_data.implant_seated_correctly !== undefined ? `<tr><td class="info-label">Implant Seated Correctly:</td><td class="info-value">${procedure.phase2_data.implant_seated_correctly ? 'Yes' : 'No'}</td></tr>` : ''}
              ${procedure.phase2_data.implant_seated_comment ? `<tr><td class="info-label">Seating Notes:</td><td class="info-value">${procedure.phase2_data.implant_seated_comment}</td></tr>` : ''}
              ${procedure.phase2_data.torque_values?.length ? `<tr><td class="info-label">Torque Values:</td><td class="info-value" style="font-weight:bold;color:#E65100;">${procedure.phase2_data.torque_values.map((tv: number, i: number) => 'Implant ' + (i + 1) + ': ' + tv + ' Ncm').join(', ')}</td></tr>` : ''}
              ${procedure.phase2_data.implant_other_notes ? `<tr><td class="info-label">Other Implant Notes:</td><td class="info-value">${procedure.phase2_data.implant_other_notes}</td></tr>` : ''}
              ${procedure.phase2_data.prosthetic_component ? `<tr><td class="info-label">Prosthetic Component:</td><td class="info-value">${procedure.phase2_data.prosthetic_component}</td></tr>` : ''}
              ${procedure.phase2_data.healing_abutment_cuff_height ? `<tr><td class="info-label">Cuff Height:</td><td class="info-value">${procedure.phase2_data.healing_abutment_cuff_height} mm</td></tr>` : ''}
              ${procedure.phase2_data.sutures_placed !== undefined ? `<tr><td class="info-label">Sutures Placed:</td><td class="info-value">${procedure.phase2_data.sutures_placed ? 'Yes' : 'No'}</td></tr>` : ''}
              ${procedure.phase2_data.hemostasis_achieved !== undefined ? `<tr><td class="info-label">Hemostasis Achieved:</td><td class="info-value">${procedure.phase2_data.hemostasis_achieved ? 'Yes' : 'No'}</td></tr>` : ''}
            </table>
          </div>

          ${procedure.phase2_data.post_op_checklist && Object.keys(procedure.phase2_data.post_op_checklist).length > 0 ? `
          <div class="section">
            <div class="section-title">Post-Operative Checklist</div>
            <div class="checklist">
              ${Object.entries(procedure.phase2_data.post_op_checklist).map(([key, val]) => `
                <div class="checklist-item">
                  <span class="${val ? 'check-yes' : 'check-no'}">${val ? '&#10003;' : '&#10007;'}</span>
                  <span style="text-transform:capitalize;">${key.replace(/_/g, ' ')}</span>
                </div>
              `).join('')}
            </div>
          </div>` : ''}
          ` : `
          ${procedure.checklist?.surgical ? `
          <div class="section">
            <div class="section-title">Surgical Checklist (Legacy)</div>
            <div class="checklist">
              ${procedure.checklist.surgical.items?.map((item: any) => `
                <div class="checklist-item">
                  <span class="${item.value ? 'check-yes' : 'check-no'}">${item.value ? '&#10003;' : '&#10007;'}</span>
                  ${getChecklistLabel('surgical', item.id)}
                </div>
              `).join('') || '<p>No checklist data available</p>'}
            </div>
          </div>` : ''}
          `}

          ${(procedure.phase2_student_notes || procedure.phase2_remark || procedure.phase2_supervisor_notes || procedure.phase2_incharge_notes) ? `
          <div class="section">
            <div class="section-title">Phase 2 — Notes & Remarks</div>
            ${(procedure.phase2_student_notes || procedure.phase2_remark) ? `<p class="info-value"><strong>Post-Surgical Notes by Student:</strong><br/>${procedure.phase2_student_notes || procedure.phase2_remark}</p>` : ''}
            ${procedure.phase2_supervisor_notes ? `<p class="info-value"><strong>Remarks by Supervising Faculty:</strong><br/>${procedure.phase2_supervisor_notes}</p>` : ''}
            ${procedure.phase2_incharge_notes ? `<p class="info-value"><strong>Remarks by Implant In-Charge:</strong><br/>${procedure.phase2_incharge_notes}</p>` : ''}
          </div>` : ''}
          ` : ''}

          ${procedure.phase3_data || procedure.checklist?.second_stage || procedure.phase3_student_notes || procedure.stage2_surgical_remark ? `
          <div class="stage-divider">PHASE 3 — SECOND STAGE SURGICAL</div>

          ${procedure.phase3_data ? `
          ${procedure.phase3_data.checklist_items && Object.keys(procedure.phase3_data.checklist_items).length > 0 ? `
          <div class="section">
            <div class="section-title">Phase 3 Checklist</div>
            <div class="checklist">
              ${Object.entries(procedure.phase3_data.checklist_items).map(([key, val]) => `
                <div class="checklist-item">
                  <span class="${val ? 'check-yes' : 'check-no'}">${val ? '&#10003;' : '&#10007;'}</span>
                  <span style="text-transform:capitalize;">${key.replace(/_/g, ' ')}</span>
                </div>
              `).join('')}
            </div>
          </div>` : ''}

          ${(procedure.phase3_data.isq_value || procedure.phase3_data.healing_abutment_height) ? `
          <div class="section">
            <div class="section-title">Measurements</div>
            <table>
              ${procedure.phase3_data.isq_value ? `<tr><td class="info-label">ISQ Value:</td><td class="info-value" style="font-weight:bold;color:#2E7D32;">${procedure.phase3_data.isq_value}</td></tr>` : ''}
              ${procedure.phase3_data.healing_abutment_height ? `<tr><td class="info-label">Healing Abutment Height:</td><td class="info-value">${procedure.phase3_data.healing_abutment_height} mm</td></tr>` : ''}
            </table>
          </div>` : ''}
          ` : `
          ${procedure.checklist?.second_stage ? `
          <div class="section">
            <div class="section-title">Second Stage Surgical Checklist (Legacy)</div>
            <div class="checklist">
              ${procedure.checklist.second_stage.items?.map((item: any) => `
                <div class="checklist-item">
                  <span class="${item.value ? 'check-yes' : 'check-no'}">${item.value ? '&#10003;' : '&#10007;'}</span>
                  ${getChecklistLabel('second_stage', item.id)}
                </div>
              `).join('') || '<p>No checklist data</p>'}
            </div>
          </div>` : ''}
          `}

          ${(procedure.phase3_student_notes || procedure.stage2_surgical_remark || procedure.phase3_supervisor_notes || procedure.phase3_incharge_notes) ? `
          <div class="section">
            <div class="section-title">Phase 3 — Notes & Remarks</div>
            ${(procedure.phase3_student_notes || procedure.stage2_surgical_remark) ? `<p class="info-value"><strong>Notes by Student:</strong><br/>${procedure.phase3_student_notes || procedure.stage2_surgical_remark}</p>` : ''}
            ${procedure.phase3_supervisor_notes ? `<p class="info-value"><strong>Remarks by Supervising Faculty:</strong><br/>${procedure.phase3_supervisor_notes}</p>` : ''}
            ${procedure.phase3_incharge_notes ? `<p class="info-value"><strong>Remarks by Implant In-Charge:</strong><br/>${procedure.phase3_incharge_notes}</p>` : ''}
          </div>` : ''}
          ` : ''}

          ${procedure.phase4_step1_data || procedure.phase4_step2_data || procedure.checklist?.prosthetic_phase || procedure.stage2_prosthetic_remark ? `
          <div class="stage-divider">PHASE 4 — PROSTHETIC PROTOCOL</div>

          ${procedure.phase4_step1_data ? `
          <div class="section">
            <div class="section-title">Step 1 — Prosthetic Plan & Impressions</div>
            <table>
              ${procedure.phase4_step1_data.final_prosthetic_plan ? `<tr><td class="info-label">Final Prosthetic Plan:</td><td class="info-value" style="font-weight:bold;">${procedure.phase4_step1_data.final_prosthetic_plan}</td></tr>` : ''}
              ${procedure.phase4_step1_data.prosthetic_material ? `<tr><td class="info-label">Prosthetic Material:</td><td class="info-value">${procedure.phase4_step1_data.prosthetic_material}</td></tr>` : ''}
              ${procedure.phase4_step1_data.custom_abutment ? `<tr><td class="info-label">Custom Abutment:</td><td class="info-value">${procedure.phase4_step1_data.custom_abutment}</td></tr>` : ''}
              ${procedure.phase4_step1_data.overdenture_attachment ? `<tr><td class="info-label">Overdenture Attachment:</td><td class="info-value">${procedure.phase4_step1_data.overdenture_attachment}</td></tr>` : ''}
              ${procedure.phase4_step1_data.impression_type ? `<tr><td class="info-label">Impression Type:</td><td class="info-value">${procedure.phase4_step1_data.impression_type === 'intraoral_scans' ? 'Intraoral Scans' : 'Conventional Impressions'}</td></tr>` : ''}
              ${procedure.phase4_step1_data.payment_complete !== undefined ? `<tr><td class="info-label">Payment Complete:</td><td class="info-value">${procedure.phase4_step1_data.payment_complete ? 'Yes' : 'No'}</td></tr>` : ''}
              ${procedure.phase4_step1_data.components_available !== undefined ? `<tr><td class="info-label">Components Available:</td><td class="info-value">${procedure.phase4_step1_data.components_available ? 'Yes' : 'No'}</td></tr>` : ''}
            </table>
          </div>

          ${(procedure.phase4_step1_student_notes || procedure.stage2_prosthetic_remark || procedure.stage2_prosthetic_faculty_remark || procedure.stage2_prosthetic_incharge_remark) ? `
          <div class="section">
            <div class="section-title">Step 1 — Notes & Remarks</div>
            ${(procedure.phase4_step1_student_notes || procedure.stage2_prosthetic_remark) ? `<p class="info-value"><strong>Notes by Student:</strong><br/>${procedure.phase4_step1_student_notes || procedure.stage2_prosthetic_remark}</p>` : ''}
            ${procedure.stage2_prosthetic_faculty_remark ? `<p class="info-value"><strong>Remarks by Supervising Faculty:</strong><br/>${procedure.stage2_prosthetic_faculty_remark}</p>` : ''}
            ${procedure.stage2_prosthetic_incharge_remark ? `<p class="info-value"><strong>Remarks by Implant In-Charge:</strong><br/>${procedure.stage2_prosthetic_incharge_remark}</p>` : ''}
          </div>` : ''}
          ` : `
          ${procedure.checklist?.prosthetic_phase ? `
          <div class="section">
            <div class="section-title">Prosthetic Phase Checklist (Legacy)</div>
            <div class="checklist">
              ${procedure.checklist.prosthetic_phase.items?.map((item: any) => `
                <div class="checklist-item">
                  <span class="${item.value ? 'check-yes' : 'check-no'}">${item.value ? '&#10003;' : '&#10007;'}</span>
                  ${getChecklistLabel('prosthetic_phase', item.id)}
                </div>
              `).join('') || '<p>No checklist data</p>'}
            </div>
          </div>` : ''}
          `}

          ${procedure.phase4_step2_data ? `
          <div class="section">
            <div class="section-title">Step 2 — Trial & Delivery</div>
            ${procedure.phase4_step2_data.trial_checklist && Object.keys(procedure.phase4_step2_data.trial_checklist).length > 0 ? `
            <div class="checklist" style="margin-bottom:10px;">
              ${Object.entries(procedure.phase4_step2_data.trial_checklist).map(([key, val]) => `
                <div class="checklist-item">
                  <span class="${val ? 'check-yes' : 'check-no'}">${val ? '&#10003;' : '&#10007;'}</span>
                  <span style="text-transform:capitalize;">${key.replace(/_/g, ' ')}</span>
                </div>
              `).join('')}
            </div>` : ''}
            ${procedure.phase4_step2_data.confirmation_statement !== undefined ? `
            <p class="info-value" style="padding:8px;border-radius:4px;background:${procedure.phase4_step2_data.confirmation_statement ? '#E8F5E9' : '#FFEBEE'};">
              <strong>Confirmation:</strong>
              <span style="color:${procedure.phase4_step2_data.confirmation_statement ? '#2E7D32' : '#C62828'};font-weight:bold;">
                ${procedure.phase4_step2_data.confirmation_statement ? 'Treatment Confirmed Complete' : 'Not Confirmed'}
              </span>
            </p>` : ''}
          </div>

          ${(procedure.phase4_step2_student_notes || procedure.phase4_step2_supervisor_notes || procedure.phase4_step2_incharge_notes) ? `
          <div class="section">
            <div class="section-title">Step 2 — Notes & Remarks</div>
            ${procedure.phase4_step2_student_notes ? `<p class="info-value"><strong>Notes by Student:</strong><br/>${procedure.phase4_step2_student_notes}</p>` : ''}
            ${procedure.phase4_step2_supervisor_notes ? `<p class="info-value"><strong>Remarks by Supervising Faculty:</strong><br/>${procedure.phase4_step2_supervisor_notes}</p>` : ''}
            ${procedure.phase4_step2_incharge_notes ? `<p class="info-value"><strong>Remarks by Implant In-Charge:</strong><br/>${procedure.phase4_step2_incharge_notes}</p>` : ''}
          </div>` : ''}
          ` : ''}
          ` : ''}

          <div class="section">
            <div class="section-title">Approval Timeline</div>
            <table>
              <tr><td class="info-label">Phase 1 (Diagnosis and Treatment Planning) Completed:</td><td class="info-value">${procedure.phase1_completed_at ? format(new Date(procedure.phase1_completed_at), 'MMMM dd, yyyy HH:mm') : 'N/A'}</td></tr>
              <tr><td class="info-label">Phase 2 (Surgical) Completed:</td><td class="info-value">${procedure.phase2_completed_at ? format(new Date(procedure.phase2_completed_at), 'MMMM dd, yyyy HH:mm') : 'N/A'}</td></tr>
              ${procedure.stage2_surgical_completed_at ? `<tr><td class="info-label">Phase 3 (Healing and Second Stage Surgery) Completed:</td><td class="info-value">${format(new Date(procedure.stage2_surgical_completed_at), 'MMMM dd, yyyy HH:mm')}</td></tr>` : ''}
              ${procedure.stage2_prosthetic_completed_at ? `<tr><td class="info-label">Phase 4 (Prosthetic) Completed:</td><td class="info-value">${format(new Date(procedure.stage2_prosthetic_completed_at), 'MMMM dd, yyyy HH:mm')}</td></tr>` : ''}
              ${procedure.treatment_completed_at ? `<tr><td class="info-label">Treatment Completed:</td><td class="info-value">${format(new Date(procedure.treatment_completed_at), 'MMMM dd, yyyy HH:mm')}</td></tr>` : ''}
            </table>
          </div>

          <div class="footer">
            <p>This is a computer-generated report</p>
            <p>Generated on ${format(new Date(), 'MMMM dd, yyyy HH:mm:ss')}</p>
          </div>
        </body>
      </html>
    `;
  return html;
};

/** Generate the PDF and open the Share sheet (or trigger browser download on web). */
export const generateProcedurePDF = async (procedure: any) => {
  try {
    const html = buildProcedurePdfHtml(procedure);

    if (Platform.OS === 'web') {
      // Browser: open the HTML report in a new tab; user can Save As PDF.
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      return url;
    }

    const { uri } = await Print.printToFileAsync({ html });
    const isAvailable = await Sharing.isAvailableAsync();

    if (isAvailable) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Procedure_${procedure.patient_name}_${format(new Date(procedure.procedure_date), 'yyyy-MM-dd')}.pdf`,
        UTI: 'com.adobe.pdf'
      });
    } else {
      Alert.alert('Success', 'PDF generated but sharing is not available on this device');
    }

    return uri;
  } catch (error) {
    console.error('Error generating PDF:', error);
    Alert.alert('Error', 'Failed to generate PDF. Please try again.');
    throw error;
  }
};

/** Open the native print dialog (AirPrint / Android Print Services) with the case report. */
export const printProcedurePDF = async (procedure: any) => {
  try {
    const html = buildProcedurePdfHtml(procedure);

    if (Platform.OS === 'web') {
      // Open the HTML in a hidden iframe, call window.print() on load.
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          window.open(url, '_blank');
        }
      };
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch {}
        URL.revokeObjectURL(url);
      }, 60000);
      return;
    }

    await Print.printAsync({ html });
  } catch (error) {
    console.error('Error printing PDF:', error);
    Alert.alert('Error', 'Failed to open the print dialog.');
  }
};

const renderAdditionalFields = (fields: any): string => {
  if (!fields || Object.keys(fields).length === 0) return '';
  return `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e0e0e0;">
    ${Object.entries(fields).map(([key, value]) => `
      <div style="margin-bottom: 4px;"><span class="info-label">${key}:</span> <span class="info-value">${value}</span></div>
    `).join('')}
  </div>`;
};

const getChecklistLabel = (section: string, id: string): string => {
  const labels: any = {
    pre_surgical: {
      case_selection: 'Case Selection Approved',
      academic_readiness: 'Academic Readiness (with presentation)',
      hematological: 'Hematological Investigations',
      radiographic: 'Radiographic Investigations',
      instruments: 'Availability of the Instruments',
      treatment_plan: 'Approved Treatment & Prosthetic Plan',
      payment: 'Full payment done',
      medical_assessment: 'Medical assessment done',
      realguide: 'RealGUIDE Planning and Report',
      oral_prophylaxis: 'Oral Prophylaxis done',
      patient_consent: 'Patient Consent Taken',
    },
    surgical: {
      consent_form: 'Signed Patient consent form',
      cbct_report: 'Arranged CBCT Report',
      room_cleanliness: 'Cleanliness of the Implant Room',
      drapes_gowns: 'Clean autoclaved drapes and gowns',
      instruments_equipment: 'Clean autoclaved instruments and equipment',
      asepsis: 'Asepsis and disinfection of operatory',
      register_entry: 'Entry into implant register with sticker',
      post_cleaning: 'Post operative cleaning of implant room, instruments and equipment',
    },
    second_stage: {
      healing_assessment: 'Implant healing assessment (clinical & radiographic)',
      tissue_conditioning: 'Tissue conditioning done',
      second_stage_surgery: 'Second stage surgery performed',
      healing_abutment: 'Healing abutment placed',
      soft_tissue_eval: 'Soft tissue evaluation and management',
      patient_hygiene: 'Patient oral hygiene instructions given',
      post_op_radiograph: 'Post-operative radiograph taken',
      follow_up_scheduled: 'Follow-up appointment scheduled',
    },
    prosthetic_phase: {
      impression_taken: 'Final impression taken',
      bite_registration: 'Bite registration completed',
      shade_selection: 'Shade selection done',
      try_in: 'Try-in verification completed',
      final_prosthesis: 'Final prosthesis placed',
      occlusal_adjustment: 'Occlusal adjustment done',
      patient_instructions: 'Patient care instructions given',
      maintenance_schedule: 'Maintenance schedule established',
    },
  };

  return labels[section]?.[id] || id;
};
