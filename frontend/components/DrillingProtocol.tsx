import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import api from '../utils/api';
import ExportPrintMenu from './ExportPrintMenu';

type DrillStep = {
  step: number; drill_type: string; code: string;
  diameter: number; depth: number; rpm: string; irrigation: boolean;
};

type ProtocolData = {
  system_name: string;
  implant: { brand: string; system: string; diameter: number; length: number };
  bone_density: string;
  protocol_type: string;
  tooth: string;
  steps: DrillStep[];
  total_steps: number;
  notes: string[];
};

const DRILL_COLORS: Record<string, string> = {
  'Pilot Drill': '#1E88E5',
  'Short Pilot Drill': '#1E88E5',
  'Dense Bone Drill': '#546E7A',
  'Soft Bone Drill': '#43A047',
  'Crestal Bone Drill': '#F9A825',
  'Implant Placement': '#E65100',
};

const DRILL_BG: Record<string, string> = {
  'Pilot Drill': '#E3F2FD',
  'Short Pilot Drill': '#E3F2FD',
  'Dense Bone Drill': '#ECEFF1',
  'Soft Bone Drill': '#E8F5E9',
  'Crestal Bone Drill': '#FFF8E1',
  'Implant Placement': '#FFF3E0',
};

export default function DrillingProtocolScreen({
  implant,
  tooth,
  onClose,
  patientName,
  patientId,
  procedureDate,
  procedureId,
}: {
  implant: { brand: string; system: string; diameter: number; length: number };
  tooth: string;
  onClose: () => void;
  /** Optional patient context printed on the A4 PDF header banner. */
  patientName?: string;
  patientId?: string;
  procedureDate?: string;
  procedureId?: string;
}) {
  const [boneType, setBoneType] = useState('');
  const [protocol, setProtocol] = useState<ProtocolData | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [exporting, setExporting] = useState(false);

  const handleGenerate = async () => {
    if (!boneType) return;
    setLoading(true);
    try {
      const res = await api.post('/drilling-protocols/generate', {
        brand: implant.brand, system: implant.system,
        diameter: implant.diameter, length: implant.length,
        bone_density: boneType, tooth, patient_name: patientName, patient_id: patientId, procedure_date: procedureDate, procedure_id: procedureId,
      });
      setProtocol(res.data);
      setCurrentStep(0);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'No drilling protocol available for this system.';
      Alert.alert('Not Available', msg);
    } finally { setLoading(false); }
  };

  const buildDrillingHtml = (): string => {
    if (!protocol) return '';
    const stepsHtml = protocol.steps.map((s, i) => `
      <tr style="background:${i % 2 === 0 ? '#F8FBFF' : '#FFF'}">
        <td style="padding:8px;text-align:center;font-weight:700;color:#1565C0">${s.step}</td>
        <td style="padding:8px;font-weight:600">${s.drill_type}</td>
        <td style="padding:8px;text-align:center">${s.diameter} mm</td>
        <td style="padding:8px;text-align:center">${s.depth} mm</td>
        <td style="padding:8px;text-align:center">${s.code || '—'}</td>
        <td style="padding:8px;text-align:center">${s.rpm}</td>
        <td style="padding:8px;text-align:center">${s.irrigation ? 'Yes' : 'No'}</td>
      </tr>
    `).join('');
    const notesHtml = protocol.notes?.length
      ? protocol.notes.map(n => `<li style="padding:4px 0;color:#555">${n}</li>`).join('')
      : '<li style="color:#999">No additional notes</li>';
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          body { font-family: 'Helvetica','Arial',sans-serif; padding:24px; font-size:12px; color:#263238; }
          .header { text-align:center; border-bottom:3px solid #1565C0; padding-bottom:16px; margin-bottom:20px; }
          .header h1 { margin:0; color:#1565C0; font-size:22px; }
          .header p { margin:4px 0; color:#666; font-size:11px; }
          .info-box { background:#E3F2FD; border-radius:8px; padding:14px; margin-bottom:18px; }
          .info-row { display:flex; justify-content:space-between; margin:4px 0; }
          .info-label { font-weight:700; color:#333; }
          .info-value { color:#1565C0; }
          table { width:100%; border-collapse:collapse; margin-bottom:18px; }
          th { background:#1565C0; color:#FFF; padding:10px 8px; text-align:center; font-size:11px; }
          td { border-bottom:1px solid #E0E0E0; font-size:11px; }
          .notes { background:#FFF8E1; border-radius:8px; padding:14px; }
          .notes h3 { margin:0 0 8px; color:#F57F17; font-size:14px; }
          .footer { text-align:center; margin-top:24px; padding-top:12px; border-top:1px solid #E0E0E0; color:#999; font-size:10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Drilling Protocol</h1>
          <p>${implant.brand} – ${implant.system}</p>
          <p>${implant.diameter} × ${implant.length} mm  ·  Bone: ${boneType}${tooth ? '  ·  Tooth: ' + tooth : ''}</p>
        </div>
        <table>
          <tr><th>Step</th><th>Drill</th><th>Ø</th><th>Depth</th><th>Code</th><th>RPM</th><th>Irrigation</th></tr>
          ${stepsHtml}
        </table>
        <div class="notes"><h3>Clinical Notes</h3><ul>${notesHtml}</ul></div>
        <div class="footer"><p>Implanr — Implant Planning Assistant</p></div>
      </body>
      </html>
    `;
  };

  const handlePrintPDF = async () => {
    if (!protocol) return;
    setExporting(true);
    try {
      if (Platform.OS === 'web') {
        const res = await api.post('/drilling-protocols/export-pdf', {
          brand: implant.brand, system: implant.system,
          diameter: implant.diameter, length: implant.length,
          bone_density: boneType, tooth, patient_name: patientName, patient_id: patientId, procedure_date: procedureDate, procedure_id: procedureId,
        }, { responseType: 'blob' });
        const blob = new Blob([res.data], { type: 'application/pdf' });
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
          try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }
          catch { window.open(url, '_blank'); }
        };
        setTimeout(() => {
          try { document.body.removeChild(iframe); } catch {}
          URL.revokeObjectURL(url);
        }, 60000);
      } else {
        await Print.printAsync({ html: buildDrillingHtml() });
      }
    } catch { Alert.alert('Error', 'Failed to open print dialog.'); }
    finally { setExporting(false); }
  };

  const handleExportPDF = async () => {
    if (!protocol) return;
    setExporting(true);
    try {
      if (Platform.OS === 'web') {
        const res = await api.post('/drilling-protocols/export-pdf', {
          brand: implant.brand, system: implant.system,
          diameter: implant.diameter, length: implant.length,
          bone_density: boneType, tooth, patient_name: patientName, patient_id: patientId, procedure_date: procedureDate, procedure_id: procedureId,
        }, { responseType: 'blob' });
        const blob = new Blob([res.data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `DrillingProtocol_${implant.brand}_${implant.diameter}x${implant.length}_${boneType}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // Mobile: generate PDF locally using expo-print + expo-sharing
        const stepsHtml = protocol.steps.map((s, i) => `
          <tr style="background:${i % 2 === 0 ? '#F8FBFF' : '#FFF'}">
            <td style="padding:8px;text-align:center;font-weight:700;color:#1565C0">${s.step}</td>
            <td style="padding:8px;font-weight:600">${s.drill_type}</td>
            <td style="padding:8px;text-align:center">${s.diameter} mm</td>
            <td style="padding:8px;text-align:center">${s.depth} mm</td>
            <td style="padding:8px;text-align:center">${s.code || '—'}</td>
            <td style="padding:8px;text-align:center">${s.rpm}</td>
            <td style="padding:8px;text-align:center">${s.irrigation ? 'Yes' : 'No'}</td>
          </tr>
        `).join('');

        const notesHtml = protocol.notes?.length
          ? protocol.notes.map(n => `<li style="padding:4px 0;color:#555">${n}</li>`).join('')
          : '<li style="color:#999">No additional notes</li>';

        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <style>
              body { font-family: 'Helvetica','Arial',sans-serif; padding:24px; font-size:12px; color:#263238; }
              .header { text-align:center; border-bottom:3px solid #1565C0; padding-bottom:16px; margin-bottom:20px; }
              .header h1 { margin:0; color:#1565C0; font-size:22px; }
              .header p { margin:4px 0; color:#666; font-size:11px; }
              .info-box { background:#E3F2FD; border-radius:8px; padding:14px; margin-bottom:18px; }
              .info-row { display:flex; justify-content:space-between; margin:4px 0; }
              .info-label { font-weight:700; color:#333; }
              .info-value { color:#1565C0; }
              table { width:100%; border-collapse:collapse; margin-bottom:18px; }
              th { background:#1565C0; color:#FFF; padding:10px 8px; text-align:center; font-size:11px; }
              td { border-bottom:1px solid #E0E0E0; font-size:11px; }
              .notes { background:#FFF8E1; border-radius:8px; padding:14px; }
              .notes h3 { margin:0 0 8px; color:#F57F17; font-size:14px; }
              .footer { text-align:center; margin-top:24px; padding-top:12px; border-top:1px solid #E0E0E0; color:#999; font-size:10px; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Drilling Protocol</h1>
              <p>${implant.brand} — ${implant.system}</p>
            </div>
            <div class="info-box">
              <div class="info-row"><span class="info-label">Implant:</span><span class="info-value">${implant.diameter} x ${implant.length} mm</span></div>
              <div class="info-row"><span class="info-label">Bone Density:</span><span class="info-value">${boneType.toUpperCase()}</span></div>
              <div class="info-row"><span class="info-label">Tooth Position:</span><span class="info-value">${tooth || 'N/A'}</span></div>
              <div class="info-row"><span class="info-label">Total Steps:</span><span class="info-value">${protocol.total_steps}</span></div>
            </div>
            <table>
              <thead>
                <tr><th>#</th><th>Drill Type</th><th>Diameter</th><th>Depth</th><th>Code</th><th>Speed</th><th>Irrigation</th></tr>
              </thead>
              <tbody>${stepsHtml}</tbody>
            </table>
            <div class="notes">
              <h3>Clinical Notes</h3>
              <ul>${notesHtml}</ul>
            </div>
            <div class="footer">
              <p>Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
              <p>Implanr — Implant Planning Assistant</p>
            </div>
          </body>
          </html>
        `;

        const { uri } = await Print.printToFileAsync({ html });
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: `DrillingProtocol_${implant.brand}_${implant.diameter}x${implant.length}.pdf`,
            UTI: 'com.adobe.pdf',
          });
        } else {
          Alert.alert('Success', 'PDF generated but sharing is not available on this device.');
        }
      }
    } catch { Alert.alert('Error', 'Failed to export PDF.'); }
    finally { setExporting(false); }
  };

  const step = protocol?.steps[currentStep];
  const nextStep = protocol?.steps[currentStep + 1];

  return (
    <SafeAreaView style={p.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={p.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={p.headerRow}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            data-testid="protocol-back-btn">
            <Ionicons name="arrow-back" size={24} color="#263238" />
          </TouchableOpacity>
          <Text style={p.headerTitle}>Drilling Protocol</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Implant Info Card */}
        <View style={p.infoCard}>
          <Ionicons name="medical" size={22} color="#FFF" />
          <View style={{ flex: 1 }}>
            <Text style={p.infoSystem}>{implant.brand} – {implant.system}</Text>
            <Text style={p.infoSize}>Implant: {implant.diameter} x {implant.length} mm</Text>
            {tooth ? <Text style={p.infoTooth}>Tooth: {tooth}</Text> : null}
          </View>
        </View>

        {/* Bone Density Selector */}
        <View style={p.card}>
          <Text style={p.cardTitle}>Select Bone Density</Text>
          <View style={p.boneRow}>
            {['D1', 'D2', 'D3', 'D4'].map((bt) => (
              <TouchableOpacity key={bt}
                style={[p.boneBtn, boneType === bt && p.boneBtnActive]}
                onPress={() => { setBoneType(bt); setProtocol(null); }}
                data-testid={`protocol-bone-${bt}`}>
                <Text style={[p.boneBtnText, boneType === bt && p.boneBtnTextActive]}>{bt}</Text>
                <Text style={[p.boneBtnSub, boneType === bt && { color: '#FFF' }]}>
                  {bt === 'D1' ? 'Dense' : bt === 'D2' ? 'Thick' : bt === 'D3' ? 'Porous' : 'Soft'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {boneType === 'D4' && (
            <View style={p.noteBox}>
              <Ionicons name="information-circle" size={14} color="#E65100" />
              <Text style={p.noteText}>D4: Reduced drilling protocol will be generated</Text>
            </View>
          )}
          <TouchableOpacity style={[p.genBtn, !boneType && p.btnOff]}
            onPress={handleGenerate} disabled={!boneType || loading}
            data-testid="generate-protocol-btn">
            {loading ? <ActivityIndicator color="#FFF" size="small" /> : (
              <><Ionicons name="construct" size={18} color="#FFF" /><Text style={p.genBtnText}>Generate Protocol</Text></>
            )}
          </TouchableOpacity>
        </View>

        {/* Protocol Display */}
        {protocol && step && (
          <>
            {/* Protocol Type Badge */}
            <View style={[p.typeBadge, boneType === 'D4' ? { backgroundColor: '#FFF3E0' } : {}]}>
              <Text style={[p.typeText, boneType === 'D4' ? { color: '#E65100' } : {}]}>
                {protocol.protocol_type} | {protocol.total_steps} Steps | Bone {boneType}
              </Text>
            </View>

            {/* Timeline */}
            <View style={p.card}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={p.timeline}>
                  {protocol.steps.map((s, i) => {
                    const isActive = i === currentStep;
                    const isDone = i < currentStep;
                    const isImplant = s.drill_type === 'Implant Placement';
                    const color = DRILL_COLORS[s.drill_type] || '#546E7A';
                    return (
                      <React.Fragment key={i}>
                        {i > 0 && <View style={[p.tlLine, isDone && { backgroundColor: '#4CAF50' }]} />}
                        <TouchableOpacity style={[
                          p.tlNode,
                          isDone && { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
                          isActive && { backgroundColor: color, borderColor: color, transform: [{ scale: 1.2 }] },
                          !isDone && !isActive && { borderColor: '#B0BEC5' },
                        ]} onPress={() => setCurrentStep(i)}>
                          {isDone ? <Ionicons name="checkmark" size={10} color="#FFF" /> :
                           isImplant ? <Ionicons name="star" size={10} color={isActive ? '#FFF' : '#B0BEC5'} /> :
                           <Text style={[p.tlNum, isActive && { color: '#FFF' }]}>{s.step}</Text>}
                        </TouchableOpacity>
                      </React.Fragment>
                    );
                  })}
                </View>
              </ScrollView>
              <View style={p.tlLabels}>
                <Text style={p.tlLabelDone}>Done</Text>
                <Text style={p.tlLabelCur}>Current</Text>
                <Text style={p.tlLabelNext}>Upcoming</Text>
              </View>
            </View>

            {/* Active Drill Card */}
            <View style={[p.drillCard, { borderLeftColor: DRILL_COLORS[step.drill_type] || '#546E7A' }]}>
              <View style={p.drillHeader}>
                <Text style={p.drillStep}>Step {step.step} of {protocol.total_steps}</Text>
                <View style={[p.drillTypeBadge, { backgroundColor: DRILL_BG[step.drill_type] || '#F5F5F5' }]}>
                  <Text style={[p.drillTypeText, { color: DRILL_COLORS[step.drill_type] || '#546E7A' }]}>
                    {step.drill_type}
                  </Text>
                </View>
              </View>
              <View style={p.drillBody}>
                <View style={p.drillRow}><Text style={p.drillLabel}>Diameter</Text><Text style={p.drillVal}>{step.diameter} mm</Text></View>
                <View style={p.drillRow}><Text style={p.drillLabel}>Depth</Text><Text style={p.drillVal}>{step.depth} mm</Text></View>
                <View style={p.drillRow}><Text style={p.drillLabel}>Drill Code</Text><Text style={p.drillVal}>{step.code}</Text></View>
                <View style={p.drillRow}><Text style={p.drillLabel}>Speed</Text><Text style={p.drillVal}>{step.rpm} RPM</Text></View>
                <View style={p.drillRow}><Text style={p.drillLabel}>Irrigation</Text><Text style={[p.drillVal, { color: step.irrigation ? '#43A047' : '#E65100' }]}>{step.irrigation ? 'YES' : 'NO'}</Text></View>
              </View>
            </View>

            {/* Next Step Preview */}
            {nextStep && (
              <View style={p.nextCard}>
                <Text style={p.nextLabel}>Next Step</Text>
                <Text style={p.nextVal}>{nextStep.drill_type} {nextStep.diameter} mm</Text>
              </View>
            )}

            {/* Navigation */}
            <View style={p.navRow}>
              <TouchableOpacity style={[p.navBtn, currentStep === 0 && p.navBtnOff]}
                onPress={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0} data-testid="protocol-prev-btn">
                <Ionicons name="chevron-back" size={20} color={currentStep === 0 ? '#B0BEC5' : '#1E88E5'} />
                <Text style={[p.navBtnText, currentStep === 0 && { color: '#B0BEC5' }]}>Previous</Text>
              </TouchableOpacity>
              <Text style={p.navCount}>{currentStep + 1} / {protocol.total_steps}</Text>
              <TouchableOpacity style={[p.navBtn, currentStep >= protocol.total_steps - 1 && p.navBtnOff]}
                onPress={() => setCurrentStep(Math.min(protocol.total_steps - 1, currentStep + 1))}
                disabled={currentStep >= protocol.total_steps - 1} data-testid="protocol-next-btn">
                <Text style={[p.navBtnText, currentStep >= protocol.total_steps - 1 && { color: '#B0BEC5' }]}>Next</Text>
                <Ionicons name="chevron-forward" size={20} color={currentStep >= protocol.total_steps - 1 ? '#B0BEC5' : '#1E88E5'} />
              </TouchableOpacity>
            </View>

            {/* Quick Reference */}
            <View style={p.card}>
              <Text style={p.cardTitle}>Quick Reference</Text>
              {protocol.steps.map((s, i) => (
                <View key={i} style={[p.qrRow, i === currentStep && { backgroundColor: DRILL_BG[s.drill_type] || '#F5F5F5' }]}>
                  <View style={[p.qrDot, { backgroundColor: DRILL_COLORS[s.drill_type] || '#546E7A' }]} />
                  <Text style={[p.qrText, i === currentStep && { fontWeight: '700' }]}>
                    {s.drill_type} {s.diameter} mm → {s.depth} mm
                  </Text>
                  <Text style={p.qrRpm}>{s.rpm}</Text>
                </View>
              ))}
            </View>

            {/* Export / Print consolidated menu */}
            <ExportPrintMenu
              label="Export / Print protocol"
              buttonStyle={[p.exportBtn, { backgroundColor: '#1565C0' }]}
              textStyle={p.exportBtnText}
              triggerIcon="share-outline"
              triggerIconSize={18}
              loading={exporting}
              disabled={exporting}
              testID="drilling-export-print-btn"
              printTestID="print-pdf-btn"
              exportTestID="export-pdf-btn"
              popoverTitle="Drilling Protocol"
              printLabel="Print drilling protocol"
              exportLabel="Export drilling protocol PDF"
              onPrint={handlePrintPDF}
              onExport={handleExportPDF}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const p = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5FAFF' },
  scroll: { padding: 16, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#263238' },
  infoCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1565C0', borderRadius: 14, padding: 16, marginBottom: 14 },
  infoSystem: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  infoSize: { fontSize: 13, color: '#BBDEFB', marginTop: 2 },
  infoTooth: { fontSize: 12, color: '#90CAF9', marginTop: 1 },
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#263238', marginBottom: 12 },
  boneRow: { flexDirection: 'row', gap: 8 },
  boneBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#D0D7DE', alignItems: 'center', backgroundColor: '#FAFAFA' },
  boneBtnActive: { borderColor: '#1E88E5', backgroundColor: '#1E88E5' },
  boneBtnText: { fontSize: 16, fontWeight: '700', color: '#90A4AE' },
  boneBtnTextActive: { color: '#FFF' },
  boneBtnSub: { fontSize: 9, color: '#B0BEC5', marginTop: 2 },
  noteBox: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: '#FFF3E0', borderRadius: 8, padding: 8 },
  noteText: { fontSize: 11, color: '#E65100', flex: 1 },
  genBtn: { flexDirection: 'row', backgroundColor: '#1565C0', borderRadius: 12, padding: 14, alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 },
  btnOff: { opacity: 0.4 },
  genBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  typeBadge: { backgroundColor: '#E3F2FD', borderRadius: 8, padding: 10, alignItems: 'center', marginBottom: 14 },
  typeText: { fontSize: 13, fontWeight: '600', color: '#1565C0' },
  // Timeline
  timeline: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4 },
  tlLine: { width: 20, height: 2, backgroundColor: '#E0E0E0' },
  tlNode: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#E0E0E0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  tlNum: { fontSize: 9, fontWeight: '700', color: '#90A4AE' },
  tlLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  tlLabelDone: { fontSize: 9, color: '#4CAF50' },
  tlLabelCur: { fontSize: 9, color: '#1E88E5', fontWeight: '600' },
  tlLabelNext: { fontSize: 9, color: '#B0BEC5' },
  // Drill card
  drillCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 14, borderLeftWidth: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 4 },
  drillHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  drillStep: { fontSize: 13, fontWeight: '600', color: '#78909C' },
  drillTypeBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  drillTypeText: { fontSize: 12, fontWeight: '700' },
  drillBody: { gap: 8 },
  drillRow: { flexDirection: 'row', justifyContent: 'space-between' },
  drillLabel: { fontSize: 14, color: '#546E7A' },
  drillVal: { fontSize: 14, fontWeight: '700', color: '#263238' },
  // Next
  nextCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ECEFF1', borderRadius: 10, padding: 12, marginBottom: 14 },
  nextLabel: { fontSize: 12, color: '#78909C', fontWeight: '600' },
  nextVal: { fontSize: 13, fontWeight: '600', color: '#37474F' },
  // Nav
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: '#1E88E5' },
  navBtnOff: { borderColor: '#E0E0E0' },
  navBtnText: { fontSize: 14, fontWeight: '600', color: '#1E88E5' },
  navCount: { fontSize: 14, fontWeight: '700', color: '#263238' },
  // Quick ref
  qrRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 6, marginBottom: 2 },
  qrDot: { width: 8, height: 8, borderRadius: 4 },
  qrText: { flex: 1, fontSize: 13, color: '#37474F' },
  qrRpm: { fontSize: 11, color: '#90A4AE', fontWeight: '500' },
  // Export
  exportBtn: { flexDirection: 'row', backgroundColor: '#43A047', borderRadius: 12, padding: 14, alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  exportBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
