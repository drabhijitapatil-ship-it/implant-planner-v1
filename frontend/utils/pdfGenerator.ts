import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { format } from 'date-fns';

export const generateProcedurePDF = async (procedure: any) => {
  try {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <style>
            body {
              font-family: 'Helvetica', 'Arial', sans-serif;
              padding: 20px;
              font-size: 12px;
              line-height: 1.4;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #007AFF;
              padding-bottom: 15px;
              margin-bottom: 20px;
            }
            .header h1 {
              margin: 0;
              color: #007AFF;
              font-size: 20px;
            }
            .header p {
              margin: 5px 0;
              color: #666;
              font-size: 11px;
            }
            .status-badge {
              display: inline-block;
              padding: 6px 12px;
              background-color: #4CAF50;
              color: white;
              border-radius: 4px;
              font-weight: bold;
              font-size: 11px;
              margin: 10px 0;
            }
            .section {
              margin-bottom: 20px;
              border: 1px solid #e0e0e0;
              border-radius: 6px;
              padding: 12px;
            }
            .section-title {
              font-size: 14px;
              font-weight: bold;
              color: #007AFF;
              margin-bottom: 10px;
              border-bottom: 1px solid #e0e0e0;
              padding-bottom: 5px;
            }
            .info-row {
              margin-bottom: 8px;
              display: flex;
            }
            .info-label {
              font-weight: bold;
              color: #333;
              width: 150px;
              flex-shrink: 0;
            }
            .info-value {
              color: #666;
            }
            .checklist {
              margin-top: 10px;
            }
            .checklist-item {
              padding: 5px 0;
              border-bottom: 1px solid #f0f0f0;
            }
            .checklist-item:last-child {
              border-bottom: none;
            }
            .check-yes {
              color: #4CAF50;
              font-weight: bold;
            }
            .check-no {
              color: #F44336;
              font-weight: bold;
            }
            .footer {
              margin-top: 30px;
              padding-top: 15px;
              border-top: 2px solid #007AFF;
              text-align: center;
              color: #999;
              font-size: 10px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            td {
              padding: 8px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Dental Implant Procedure Report</h1>
            <p>Department of Prosthodontics</p>
            <p>Bharati Vidyapeeth Dental College and Hospital, Pune</p>
            <span class="status-badge">✓ STAGE 1 IMPLANT PLACEMENT DONE SUCCESSFULLY</span>
          </div>

          <div class="section">
            <div class="section-title">Patient Information</div>
            <table>
              <tr>
                <td class="info-label">Patient Name:</td>
                <td class="info-value">${procedure.patient_name}</td>
              </tr>
              <tr>
                <td class="info-label">Registration Number:</td>
                <td class="info-value">${procedure.registration_number}</td>
              </tr>
              <tr>
                <td class="info-label">Implant Site:</td>
                <td class="info-value">${procedure.implant_site}</td>
              </tr>
              <tr>
                <td class="info-label">Procedure Date:</td>
                <td class="info-value">${format(new Date(procedure.procedure_date), 'MMMM dd, yyyy')}</td>
              </tr>
              <tr>
                <td class="info-label">Procedure Time:</td>
                <td class="info-value">${procedure.procedure_time}</td>
              </tr>
            </table>
          </div>

          <div class="section">
            <div class="section-title">Medical Team</div>
            <table>
              <tr>
                <td class="info-label">Postgraduate Student:</td>
                <td class="info-value">${procedure.student_name}</td>
              </tr>
              <tr>
                <td class="info-label">Supervising Instructor:</td>
                <td class="info-value">${procedure.instructor_name}</td>
              </tr>
              <tr>
                <td class="info-label">Implant Incharge:</td>
                <td class="info-value">${procedure.implant_incharge_name}</td>
              </tr>
            </table>
          </div>

          <div class="section">
            <div class="section-title">Payment Details</div>
            <table>
              <tr>
                <td class="info-label">Receipt Number:</td>
                <td class="info-value">${procedure.receipt_number}</td>
              </tr>
              <tr>
                <td class="info-label">Amount Paid:</td>
                <td class="info-value">₹${procedure.amount_paid}</td>
              </tr>
            </table>
          </div>

          ${procedure.implant_specifications ? `
          <div class="section">
            <div class="section-title">Implant Specifications</div>
            <p class="info-value">${procedure.implant_specifications}</p>
          </div>
          ` : ''}

          ${procedure.bone_graft_specifications ? `
          <div class="section">
            <div class="section-title">Bone Graft/Membrane Specifications</div>
            <p class="info-value">${procedure.bone_graft_specifications}</p>
          </div>
          ` : ''}

          <div class="section">
            <div class="section-title">I. Pre-surgical Protocols</div>
            <div class="checklist">
              ${procedure.checklist?.pre_surgical?.items?.map((item: any) => `
                <div class="checklist-item">
                  <span class="${item.value ? 'check-yes' : 'check-no'}">${item.value ? '✓' : '✗'}</span>
                  ${getChecklistLabel('pre_surgical', item.id)}
                </div>
              `).join('') || '<p>No checklist data available</p>'}
            </div>
            ${procedure.checklist?.pre_surgical?.additional_fields ? `
              <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e0e0e0;">
                ${Object.entries(procedure.checklist.pre_surgical.additional_fields).map(([key, value]) => `
                  <div class="info-row">
                    <span class="info-label">${key}:</span>
                    <span class="info-value">${value}</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>

          <div class="section">
            <div class="section-title">II. Surgical Protocols</div>
            <div class="checklist">
              ${procedure.checklist?.surgical?.items?.map((item: any) => `
                <div class="checklist-item">
                  <span class="${item.value ? 'check-yes' : 'check-no'}">${item.value ? '✓' : '✗'}</span>
                  ${getChecklistLabel('surgical', item.id)}
                </div>
              `).join('') || '<p>No checklist data available</p>'}
            </div>
          </div>

          ${procedure.remark ? `
          <div class="section">
            <div class="section-title">Remarks</div>
            <p class="info-value">${procedure.remark}</p>
          </div>
          ` : ''}

          <div class="section">
            <div class="section-title">Approval Timeline</div>
            <table>
              <tr>
                <td class="info-label">Phase 1 Completed:</td>
                <td class="info-value">${procedure.phase1_completed_at ? format(new Date(procedure.phase1_completed_at), 'MMMM dd, yyyy HH:mm') : 'N/A'}</td>
              </tr>
              <tr>
                <td class="info-label">Phase 2 Completed:</td>
                <td class="info-value">${procedure.phase2_completed_at ? format(new Date(procedure.phase2_completed_at), 'MMMM dd, yyyy HH:mm') : 'N/A'}</td>
              </tr>
              <tr>
                <td class="info-label">Final Completion:</td>
                <td class="info-value">${procedure.fully_completed_at ? format(new Date(procedure.fully_completed_at), 'MMMM dd, yyyy HH:mm') : 'N/A'}</td>
              </tr>
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

    // Generate PDF
    const { uri } = await Print.printToFileAsync({ html });
    
    // Check if sharing is available
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

// Helper function to get checklist labels
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
  };
  
  return labels[section]?.[id] || id;
};
