import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

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
}: {
  implant: { brand: string; system: string; diameter: number; length: number };
  tooth: string;
  onClose: () => void;
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
        bone_density: boneType, tooth,
      });
      setProtocol(res.data);
      setCurrentStep(0);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'No drilling protocol available for this system.';
      Alert.alert('Not Available', msg);
    } finally { setLoading(false); }
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const res = await api.post('/drilling-protocols/export-pdf', {
        brand: implant.brand, system: implant.system,
        diameter: implant.diameter, length: implant.length,
        bone_density: boneType, tooth,
      }, { responseType: 'blob' });
      if (Platform.OS === 'web') {
        const blob = new Blob([res.data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `DrillingProtocol_${implant.brand}_${implant.diameter}x${implant.length}_${boneType}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        Alert.alert('PDF Export', 'PDF download is available on web. On mobile, use the Share feature.');
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

            {/* Export PDF */}
            <TouchableOpacity style={p.exportBtn} onPress={handleExportPDF} disabled={exporting}
              data-testid="export-pdf-btn">
              {exporting ? <ActivityIndicator color="#FFF" size="small" /> : (
                <><Ionicons name="download-outline" size={18} color="#FFF" /><Text style={p.exportBtnText}>Export PDF</Text></>
              )}
            </TouchableOpacity>
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
