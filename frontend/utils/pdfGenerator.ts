import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { format } from 'date-fns';

export const generateProcedurePDF = async (procedure: any) => {
  try {
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

          ${procedure.implant_specifications ? `
          <div class="section">
            <div class="section-title">Implant Specifications</div>
            <p class="info-value">${procedure.implant_specifications}</p>
          </div>` : ''}

          ${procedure.bone_graft_specifications ? `
          <div class="section">
            <div class="section-title">Bone Graft/Membrane Specifications</div>
            <p class="info-value">${procedure.bone_graft_specifications}</p>
          </div>` : ''}

          <div class="stage-divider">STAGE 1 - IMPLANT PLACEMENT</div>

          <div class="section">
            <div class="section-title">Phase 1: Pre-Surgical Protocol</div>
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

          <div class="section">
            <div class="section-title">II. Surgical Protocols</div>
            <div class="checklist">
              ${procedure.checklist?.surgical?.items?.map((item: any) => `
                <div class="checklist-item">
                  <span class="${item.value ? 'check-yes' : 'check-no'}">${item.value ? '&#10003;' : '&#10007;'}</span>
                  ${getChecklistLabel('surgical', item.id)}
                </div>
              `).join('') || '<p>No checklist data available</p>'}
            </div>
          </div>

          ${procedure.remark ? `
          <div class="section">
            <div class="section-title">Stage 1 Remarks</div>
            <p class="info-value">${procedure.remark}</p>
          </div>` : ''}

          ${procedure.checklist?.second_stage || procedure.checklist?.prosthetic_phase ? `
          <div class="stage-divider">PHASE 3 &amp; 4 - HEALING &amp; PROSTHETIC PHASE</div>

          ${procedure.checklist?.second_stage ? `
          <div class="section">
            <div class="section-title">III. Phase 3 - Second Stage Surgical Protocol</div>
            <div class="checklist">
              ${procedure.checklist.second_stage.items?.map((item: any) => `
                <div class="checklist-item">
                  <span class="${item.value ? 'check-yes' : 'check-no'}">${item.value ? '&#10003;' : '&#10007;'}</span>
                  ${getChecklistLabel('second_stage', item.id)}
                </div>
              `).join('') || '<p>No checklist data</p>'}
            </div>
          </div>` : ''}

          ${procedure.stage2_surgical_remark ? `
          <div class="section">
            <div class="section-title">Phase 3 - Second Stage Surgical Remarks</div>
            <p class="info-value">${procedure.stage2_surgical_remark}</p>
          </div>` : ''}

          ${procedure.checklist?.prosthetic_phase ? `
          <div class="section">
            <div class="section-title">IV. Prosthetic Phase Protocol</div>
            <div class="checklist">
              ${procedure.checklist.prosthetic_phase.items?.map((item: any) => `
                <div class="checklist-item">
                  <span class="${item.value ? 'check-yes' : 'check-no'}">${item.value ? '&#10003;' : '&#10007;'}</span>
                  ${getChecklistLabel('prosthetic_phase', item.id)}
                </div>
              `).join('') || '<p>No checklist data</p>'}
            </div>
          </div>` : ''}

          ${procedure.stage2_prosthetic_remark ? `
          <div class="section">
            <div class="section-title">Phase 4 - Prosthetic Remarks</div>
            <p class="info-value">${procedure.stage2_prosthetic_remark}</p>
          </div>` : ''}
          ` : ''}

          <div class="section">
            <div class="section-title">Approval Timeline</div>
            <table>
              <tr><td class="info-label">Phase 1 (Pre-surgical) Completed:</td><td class="info-value">${procedure.phase1_completed_at ? format(new Date(procedure.phase1_completed_at), 'MMMM dd, yyyy HH:mm') : 'N/A'}</td></tr>
              <tr><td class="info-label">Phase 2 (Surgical) Completed:</td><td class="info-value">${procedure.phase2_completed_at ? format(new Date(procedure.phase2_completed_at), 'MMMM dd, yyyy HH:mm') : 'N/A'}</td></tr>
              ${procedure.stage2_surgical_completed_at ? `<tr><td class="info-label">Phase 3 (Second Stage Surgical) Completed:</td><td class="info-value">${format(new Date(procedure.stage2_surgical_completed_at), 'MMMM dd, yyyy HH:mm')}</td></tr>` : ''}
              ${procedure.stage2_prosthetic_completed_at ? `<tr><td class="info-label">Phase 4 (Prosthetic) Completed:</td><td class="info-value">${format(new Date(procedure.stage2_prosthetic_completed_at), 'MMMM dd, yyyy HH:mm')}</td></tr>` : ''}
              ${procedure.treatment_completed_at ? `<tr><td class="info-label">Treatment Completed:</td><td class="info-value">${format(new Date(procedure.treatment_completed_at), 'MMMM dd, yyyy HH:mm')}</td></tr>` : ''}
            </table>
          </div>

          <div class="footer">
            <p>This is a computer-generated report</p>
            <p>Generated on ${format(new Date(), 'MMMM dd, yyyy HH:mm:ss')}</p>
            <p>Dental Implant Manager - Department of Prosthodontics</p>
          </div>
        </body>
      </html>
    `;

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
