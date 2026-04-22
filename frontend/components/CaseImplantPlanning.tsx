import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  FlatList,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';
import ExportPrintMenu from './ExportPrintMenu';

// ── Drilling Protocol PDF helpers (A4, backend-rendered) ────────────────────
type DrillingPdfPayload = {
  implant: { brand: string; system: string; diameter: number; length?: number };
  bone: string;
  tooth: string;
  patientName?: string;
  patientId?: string;
  procedureDate?: string;
  steps?: { step: number; drill: string; speed: string; depth: string; note: string }[];
};

/** Build the POST body expected by /api/drilling-protocols/export-pdf. */
function buildDrillingPdfBody(payload: DrillingPdfPayload) {
  return {
    brand: payload.implant.brand,
    system: payload.implant.system,
    diameter: payload.implant.diameter,
    length: payload.implant.length || 0,
    bone_density: payload.bone || 'D2',
    tooth: payload.tooth,
    patient_name: payload.patientName || '',
    patient_id: payload.patientId || '',
    procedure_date: payload.procedureDate || '',
    // Forward pre-computed steps so PDF always renders, even for brand/system
    // combos that aren't in the backend's DRILLING_PROTOCOLS dictionary.
    steps: payload.steps || [],
  };
}

/** Web-only: fetch as browser Blob via axios. */
async function fetchDrillingPdfBlob(payload: DrillingPdfPayload): Promise<Blob> {
  const res = await api.post('/drilling-protocols/export-pdf', buildDrillingPdfBody(payload), {
    responseType: 'blob',
  });
  return new Blob([res.data], { type: 'application/pdf' });
}

/** Native-safe: POST → ArrayBuffer → base64 → temp file on disk. Returns file URI. */
async function fetchDrillingPdfToCacheNative(payload: DrillingPdfPayload, filename: string): Promise<string | null> {
  try {
    const res = await api.post('/drilling-protocols/export-pdf', buildDrillingPdfBody(payload), {
      responseType: 'arraybuffer',
    });
    const { Buffer } = await import('buffer');
    const base64 = Buffer.from(res.data).toString('base64');
    const FileSystem = await import('expo-file-system/legacy');
    const path = `${FileSystem.cacheDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
    return path;
  } catch (err) {
    console.error('[DrillingProtocol] fetchDrillingPdfToCacheNative failed:', err);
    return null;
  }
}

async function printDrillingProtocolPdf(payload: DrillingPdfPayload) {
  try {
    if (Platform.OS === 'web') {
      const blob = await fetchDrillingPdfBlob(payload);
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
      setTimeout(() => { try { document.body.removeChild(iframe); } catch {} URL.revokeObjectURL(url); }, 60000);
      return;
    }
    // Native: save to cache then route via expo-print.
    const filename = `DrillingProtocol_${payload.implant.brand}_${payload.implant.diameter}x${payload.implant.length || ''}_${payload.bone}.pdf`;
    const uri = await fetchDrillingPdfToCacheNative(payload, filename);
    if (!uri) throw new Error('Could not prepare PDF for printing');
    const Print = await import('expo-print');
    await Print.printAsync({ uri });
  } catch (err) {
    console.error('[DrillingProtocol] Print failed:', err);
    Alert.alert('Print failed', 'Could not open the drilling protocol PDF.');
  }
}

async function exportDrillingProtocolPdf(payload: DrillingPdfPayload) {
  const filename = `DrillingProtocol_${payload.implant.brand}_${payload.implant.diameter}x${payload.implant.length || ''}_${payload.bone}.pdf`;
  try {
    if (Platform.OS === 'web') {
      const blob = await fetchDrillingPdfBlob(payload);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    // Native: save to cache then trigger iOS/Android Share sheet.
    const uri = await fetchDrillingPdfToCacheNative(payload, filename);
    if (!uri) throw new Error('Could not prepare PDF for export');
    const Sharing = await import('expo-sharing');
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Drilling Protocol',
        UTI: 'com.adobe.pdf',
      });
    } else {
      const WebBrowser = await import('expo-web-browser');
      await WebBrowser.openBrowserAsync(uri);
    }
  } catch (err) {
    console.error('[DrillingProtocol] Export failed:', err);
    Alert.alert('Export failed', 'Could not export the drilling protocol PDF.');
  }
}


// ── FDI Tooth Chart Data ───────────────────────────────────
const UPPER_RIGHT = ['17','16','15','14','13','12','11'];
const UPPER_LEFT  = ['21','22','23','24','25','26','27'];
const LOWER_RIGHT = ['47','46','45','44','43','42','41'];
const LOWER_LEFT  = ['31','32','33','34','35','36','37'];
const TOOTH_TYPE: Record<string,string> = {};
['16','17','26','27','36','37','46','47'].forEach(t => TOOTH_TYPE[t] = 'molar');
['14','15','24','25','34','35','44','45'].forEach(t => TOOTH_TYPE[t] = 'premolar');
['13','23','33','43'].forEach(t => TOOTH_TYPE[t] = 'canine');
['11','12','21','22','31','32','41','42'].forEach(t => TOOTH_TYPE[t] = 'incisor');

interface ImplantSystem {
  brand: string; system: string; diameters: number[]; lengths: number[]; count: number;
  indication?: string; restricted_teeth?: string[]; indicated_teeth?: string[];
  indicated_procedures?: string[]; indicated_bone_types?: string[];
}
interface ImplantPlanItem {
  position: string; brand: string; system: string; diameter: number; length: number;
  bone_width?: number; bone_height?: number; bone_type?: string;
  risk_level?: string; risk_score?: number;
}
interface Props {
  procedureId: string;
  isOwner?: boolean;
  userRole: string;
  torqueValues?: number[];
  procedureStatus?: string;
  procedureType?: string;
  status?: string;
  readOnly?: boolean;
  medicalAssessment?: Record<string, string>;
  /** Optional patient context forwarded to the Drilling Protocol PDF header banner. */
  patientName?: string;
  patientId?: string;
  procedureDate?: string;
}

// ── Drilling Protocol Generator ────────────────────────────
// Generates a system-specific drilling sequence based on brand, implant diameter, bone type, and length
function generateDrillingProtocol(brand: string, system: string, diameter: number, boneType: string, length?: number): { step: number; drill: string; speed: string; depth: string; note: string }[] {
  const d = diameter;
  const isHardBone = boneType === 'D1' || boneType === 'D2';
  const isSoftBone = boneType === 'D3' || boneType === 'D4';

  // ── MIS Lance+ specific protocol ──
  if (brand === 'MIS' && system === 'Lance +') {
    const MIS_DRILLS = [1.9, 2.4, 3.1, 3.65, 4.1, 4.9];
    const FINAL_DRILL: Record<number, number> = { 3.3: 3.1, 3.75: 3.65, 4.2: 4.1, 5.0: 4.9 };
    const UNDERPREP: Record<number, number> = { 3.3: 2.4, 3.75: 3.1, 4.2: 3.65, 5.0: 4.1 };
    const finalDrill = FINAL_DRILL[d] || d;
    const underprepStop = UNDERPREP[d] || finalDrill;
    const depthStr = length ? `${length}` : 'Working length';
    const proto: { step: number; drill: string; speed: string; depth: string; note: string }[] = [];
    let s = 1;
    proto.push({ step: s++, drill: 'Marking Drill 1.9mm', speed: '1200-1500 RPM', depth: 'Mark site', note: 'Mark osteotomy site.' });
    proto.push({ step: s++, drill: 'Pilot Drill 2.4mm', speed: '1200-1500 RPM', depth: depthStr, note: 'Establish osteotomy direction. Copious irrigation.' });
    if (isHardBone) {
      const intermediates = MIS_DRILLS.filter(x => x > 2.4 && x <= finalDrill);
      for (const dd of intermediates) {
        const label = dd === finalDrill ? `Final Drill ${dd}mm` : `Drill ${dd}mm`;
        const rpm = dd === finalDrill ? '200-600 RPM' : '500-700 RPM';
        proto.push({ step: s++, drill: label, speed: rpm, depth: depthStr, note: dd === finalDrill ? 'Final diameter reached.' : 'Sequential widening.' });
      }
      if (boneType === 'D1') {
        proto.push({ step: s++, drill: `Countersink ${d}mm`, speed: '200-400 RPM', depth: 'Cortical', note: 'Dense cortical bone (D1) only.' });
      }
    } else {
      const intermediates = MIS_DRILLS.filter(x => x > 2.4 && x <= underprepStop);
      for (const dd of intermediates) {
        proto.push({ step: s++, drill: `Drill ${dd}mm`, speed: '500-700 RPM', depth: depthStr, note: 'Under-preparation for primary stability.' });
      }
    }
    proto.push({ step: s++, drill: `MIS LANCE+ Implant (${d}mm)`, speed: '15-25 RPM', depth: depthStr, note: `${d}mm${length ? ` x ${length}mm` : ''} — Triple Thread, High Primary Stability. 35-50 Ncm.` });
    return proto;
  }

  // ── Ankylos C/X specific protocol ──
  if (brand === 'Dentsply Sirona' && system === 'Ankylos C/X') {
    const ANKYLOS_DRILL_MAP: Record<number, { series: string; color: string; twist: number }> = {
      3.5: { series: 'A', color: 'Red', twist: 2.9 },
      4.5: { series: 'B', color: 'Yellow', twist: 3.8 },
      5.5: { series: 'C', color: 'Blue', twist: 4.7 },
      7.0: { series: 'D', color: 'Green', twist: 5.7 },
    };
    const dm = ANKYLOS_DRILL_MAP[d];
    if (!dm) return [];
    const proto: { step: number; drill: string; speed: string; depth: string; note: string }[] = [];
    let s = 1;
    proto.push({ step: s++, drill: 'Round Drill 1.8 mm', speed: '1500-2000 RPM', depth: 'Mark site', note: `${dm.series} Series (${dm.color}). Mark osteotomy.` });
    proto.push({ step: s++, drill: 'Lindemann Drill', speed: '800-1200 RPM', depth: 'Working length', note: 'Open cortical bone. Copious irrigation.' });
    proto.push({ step: s++, drill: 'Pilot Drill 2.0 mm', speed: '800-1000 RPM', depth: 'Working length', note: 'Verify direction with paralleling pin.' });
    proto.push({ step: s++, drill: `Twist Drill ${dm.twist} mm`, speed: '800-1000 RPM', depth: 'Working length', note: `${dm.series} Series (${dm.color}). Check depth gauge.` });
    proto.push({ step: s++, drill: `Conical Reamer ${dm.series}`, speed: '500-800 RPM', depth: 'Working length', note: `Series ${dm.series} reamer for ${d}mm implant.` });
    if (isHardBone) {
      proto.push({ step: s++, drill: `Tap ${dm.series}`, speed: '15-20 RPM', depth: 'Full depth', note: 'Dense bone only (D1/D2). Pre-tap for easier insertion.' });
    }
    proto.push({ step: s++, drill: `Ankylos C/X Implant (${d}mm)`, speed: '25-30 RPM', depth: 'Final position', note: `${dm.series} Series (${dm.color}). Insert at 25-35 Ncm.` });
    return proto;
  }

  // ── Osstem systems (ET III NH, MS, SS III, TS III, TS IV) ──
  if (brand === 'Osstem') {
    const depthStr = length ? `${length}` : 'Working length';
    const proto: { step: number; drill: string; speed: string; depth: string; note: string }[] = [];
    let s = 1;

    if (system === 'TS IV') {
      // TS IV: Ultra-soft bone — simplified fixed protocols
      const TS_IV: Record<number, number[]> = { 4.0: [2.2, 3.5], 4.5: [2.2, 2.7, 3.5, 4.0], 5.0: [2.2, 2.7, 3.5, 4.5] };
      const seq = TS_IV[d] || TS_IV[4.0] || [2.2, 3.5];
      for (const dd of seq) {
        const label = dd === 2.2 ? 'Pilot Drill 2.2mm' : `Drill ${dd}mm`;
        const note = dd === 2.2 ? 'Initial pilot drill.' : 'Under-sized for maximum primary stability in soft bone.';
        proto.push({ step: s++, drill: label, speed: dd <= 2.2 ? '800 RPM' : '600 RPM', depth: depthStr, note });
      }
      proto.push({ step: s++, drill: `TS IV Implant (${d}mm)`, speed: '20-30 RPM', depth: depthStr, note: `${d}mm${length ? ` x ${length}mm` : ''} — Ultra-soft bone design. Place at bone level. ~40 Ncm.` });
      return proto;
    }

    // Standard Osstem protocol (shared by ET III NH, MS, SS III, TS III)
    const OSSTEM: Record<number, { D1: (number|string)[]; D2: number[]; D3: number[]; D4: number[] }> = {
      3.5: { D1: [2.2, 3.0, 3.5, '3.5_cortical'], D2: [2.2, 3.0, 3.5], D3: [2.2, 3.0], D4: [2.2, 3.0] },
      4.0: { D1: [2.2, 3.5, 4.0, '4.0_cortical'], D2: [2.2, 3.5, 4.0], D3: [2.2, 3.5], D4: [2.2, 3.5] },
      4.5: { D1: [2.2, 3.5, 4.0, 4.5, '4.5_cortical'], D2: [2.2, 3.5, 4.0, 4.5], D3: [2.2, 3.5, 4.0], D4: [2.2, 3.5, 4.0] },
      5.0: { D1: [2.2, 3.5, 4.5, 5.0, '5.0_cortical'], D2: [2.2, 3.5, 4.5, 5.0], D3: [2.2, 3.5, 4.5], D4: [2.2, 3.5, 4.5] },
      5.5: { D1: [2.2, 3.5, 5.0, 5.5, '5.5_cortical'], D2: [2.2, 3.5, 5.0, 5.5], D3: [2.2, 3.5, 5.0], D4: [2.2, 3.5, 5.0] },
    };
    const diaProto = OSSTEM[d] || OSSTEM[4.0];
    const bKey = boneType as 'D1' | 'D2' | 'D3' | 'D4';
    const seq = diaProto[bKey] || diaProto.D2;

    for (const entry of seq) {
      const isCortical = typeof entry === 'string' && entry.includes('_cortical');
      const drillD = isCortical ? parseFloat((entry as string).replace('_cortical', '')) : (entry as number);
      if (isCortical) {
        proto.push({ step: s++, drill: `Cortical Drill ${drillD}mm`, speed: '300 RPM', depth: 'Coronal ONLY', note: 'Cortical widening in hard bone (D1) only — NOT full osteotomy depth.' });
      } else {
        const label = drillD === 2.2 ? 'Pilot Drill 2.2mm' : `Drill ${drillD}mm`;
        let note = drillD === 2.2 ? 'Initial pilot drill.' : 'Sequential widening.';
        if (isSoftBone && entry === seq[seq.length - 1]) note = 'Under-sized preparation — skip final drill for primary stability.';
        proto.push({ step: s++, drill: label, speed: drillD <= 2.2 ? '800 RPM' : '600 RPM', depth: depthStr, note });
      }
    }

    let placementNote = `${d}mm${length ? ` x ${length}mm` : ''} — `;
    if (boneType === 'D2') placementNote += 'Place 1mm subcrestal. ~40 Ncm.';
    else if (boneType === 'D3' || boneType === 'D4') placementNote += 'Place at bone level. ~40 Ncm.';
    else placementNote += '~40 Ncm.';
    proto.push({ step: s++, drill: `${system} Implant (${d}mm)`, speed: '20-30 RPM', depth: depthStr, note: placementNote });
    return proto;
  }

  // ── Bredent SKY systems ──
  if (brand === 'Bredent') {
    const depthVal = (length || 0) + 0.7;
    const depthStr = length ? `${depthVal}` : 'Working length + 0.7';
    const implantDepth = length ? `${length}` : 'Working length';
    const isD1 = boneType === 'D1';
    const isD4 = boneType === 'D4';
    const proto: { step: number; drill: string; speed: string; depth: string; note: string }[] = [];
    let s = 1;

    if (system === 'Copa Sky') {
      // copaSKY: Ultra-short — Pilot → Final → Implant
      proto.push({ step: s++, drill: 'Pilot Drill 2.0mm', speed: '800-1000 RPM', depth: depthStr, note: 'copaSKY ultra-short. Precise axial alignment critical.' });
      proto.push({ step: s++, drill: `Final Drill ${d}mm`, speed: '300 RPM', depth: depthStr, note: `Final drill to implant diameter ${d}mm.` });
      proto.push({ step: s++, drill: `copaSKY Implant (${d}mm)`, speed: '15-25 RPM', depth: implantDepth, note: `${d}mm${length ? ` x ${length}mm` : ''} — Ultra-short. Maintain strict axial alignment.` });
      return proto;
    }

    if (system === 'Mini 2 Sky') {
      // miniSKY: Pilot → Twist → Final → Implant (no crestal)
      proto.push({ step: s++, drill: 'Pilot Drill 2.0mm', speed: '800-1000 RPM', depth: depthStr, note: 'Establish osteotomy direction.' });
      proto.push({ step: s++, drill: 'Twist Drill 2.25mm', speed: '800-1000 RPM', depth: depthStr, note: 'Verify direction with paralleling pin.' });
      const fRpm = isD4 ? '50 RPM (anticlockwise)' : '300 RPM';
      const fNote = isD4 ? 'Anticlockwise for bone condensation (D4).' : `Final drill to ${d}mm.`;
      proto.push({ step: s++, drill: `Final Drill ${d}mm`, speed: fRpm, depth: depthStr, note: fNote });
      proto.push({ step: s++, drill: `miniSKY Implant (${d}mm)`, speed: '15-25 RPM', depth: implantDepth, note: `${d}mm${length ? ` x ${length}mm` : ''} — Self-cutting, no tap required. 25-45 Ncm.` });
      return proto;
    }

    // narrowSKY, blueSKY, classicSKY — common pattern
    const sysLabel = system === 'Narrow Sky' ? 'narrowSKY' : (system === 'Blue Sky' ? 'blueSKY' : 'classicSKY');
    proto.push({ step: s++, drill: 'Pilot Drill 2.0mm', speed: '800-1000 RPM', depth: depthStr, note: 'Establish osteotomy direction. Copious irrigation.' });
    proto.push({ step: s++, drill: 'Twist Drill 2.8mm', speed: '800-1000 RPM', depth: depthStr, note: 'Verify with paralleling pin.' });
    const fRpm = isD4 ? '50 RPM (anticlockwise)' : '300 RPM';
    const fNote = isD4 ? 'Anticlockwise for bone condensation (D4).' : (isD1 ? `Full depth — ${d}mm.` : `Final drill ${d}mm.`);
    proto.push({ step: s++, drill: `Final Drill ${d}mm`, speed: fRpm, depth: depthStr, note: fNote });
    // Crestal Drill: D2-D4 only (NOT for D1)
    if (!isD1) {
      proto.push({ step: s++, drill: `Crestal Drill ${d}mm`, speed: '300 RPM', depth: 'Full insertion', note: `FULL insertion crestal preparation for ${d}mm implant.` });
    }
    proto.push({ step: s++, drill: `${sysLabel} Implant (${d}mm)`, speed: '15-25 RPM', depth: implantDepth, note: `${d}mm${length ? ` x ${length}mm` : ''} — Self-cutting, no tap required. 25-45 Ncm.` });
    return proto;
  }

  // ── Cowellmedi INNO systems ──
  if (brand === 'Cowellmedi') {
    const depthStr = length ? `${length}` : 'Working length';
    const proto: { step: number; drill: string; speed: string; depth: string; note: string }[] = [];
    let s = 1;
    proto.push({ step: s++, drill: 'Round Drill 1.8mm', speed: '1200-1500 RPM', depth: 'Mark site', note: 'Mark osteotomy site.' });

    if (system === 'INNO Submerged') {
      const SUBMERGED_DRILLS = [2.0, 2.8, 3.2, 3.6, 4.2, 4.8];
      const FINAL: Record<number, number> = { 3.5: 3.2, 4.0: 3.6, 4.5: 4.2, 5.0: 4.8, 6.0: 4.8 };
      const UNDERPREP: Record<number, number> = { 3.5: 2.8, 4.0: 3.2, 4.5: 3.6, 5.0: 4.2, 6.0: 4.2 };
      const finalDrill = FINAL[d] || 4.2;
      const underprepStop = UNDERPREP[d] || 3.6;

      proto.push({ step: s++, drill: 'Pilot Drill 2.0mm', speed: '800-1200 RPM', depth: depthStr, note: 'Establish osteotomy. Copious irrigation.' });

      if (isHardBone) {
        const intermediates = SUBMERGED_DRILLS.filter(x => x > 2.0 && x <= finalDrill);
        for (const dd of intermediates) {
          const label = dd === finalDrill ? `Final Drill ${dd}mm` : `Drill ${dd}mm`;
          const rpm = dd === finalDrill ? '≤300 RPM' : '800-1200 RPM';
          proto.push({ step: s++, drill: label, speed: rpm, depth: depthStr, note: dd === finalDrill ? 'Final diameter reached.' : 'Sequential widening.' });
        }
        proto.push({ step: s++, drill: `Countersink ${d}mm`, speed: '≤300 RPM', depth: 'Cortical', note: boneType === 'D1' ? 'Mandatory — dense cortical bone (D1).' : 'If cortical bone is thick.' });
        if (boneType === 'D1') {
          proto.push({ step: s++, drill: `Bone Tap ${d}mm`, speed: '15-20 RPM', depth: depthStr, note: 'Optional — dense cortical bone (D1) only.' });
        }
      } else {
        const intermediates = SUBMERGED_DRILLS.filter(x => x > 2.0 && x <= underprepStop);
        for (const dd of intermediates) {
          proto.push({ step: s++, drill: `Drill ${dd}mm`, speed: '800-1200 RPM', depth: depthStr, note: 'Under-preparation for primary stability.' });
        }
      }
      proto.push({ step: s++, drill: `INNO Submerged Implant (${d}mm)`, speed: '20-30 RPM', depth: depthStr, note: `${d}mm${length ? ` x ${length}mm` : ''} — Grade 4 Ti, SLA Surface. 25-45 Ncm.` });
    } else {
      // INNO Submerged Narrow
      proto.push({ step: s++, drill: 'Pilot Drill 2.0mm', speed: '800-1200 RPM', depth: depthStr, note: 'Establish osteotomy. Copious irrigation.' });
      if (isHardBone) {
        proto.push({ step: s++, drill: 'Drill 2.8mm', speed: '800-1200 RPM', depth: depthStr, note: 'Sequential widening.' });
        if (d > 2.8) {
          proto.push({ step: s++, drill: `Final Drill ${d}mm`, speed: '≤300 RPM', depth: depthStr, note: 'Final diameter reached.' });
        }
      } else {
        proto.push({ step: s++, drill: 'Drill 2.8mm', speed: '800-1200 RPM', depth: depthStr, note: 'Under-preparation — skip final drill for stability.' });
      }
      proto.push({ step: s++, drill: `INNO Narrow Implant (${d}mm)`, speed: '20-30 RPM', depth: depthStr, note: `${d}mm${length ? ` x ${length}mm` : ''} — Narrow Body. 25-45 Ncm. Avoid high occlusal load.` });
    }
    return proto;
  }

  // ── B&B Dental systems ──
  if (brand === 'B&B Dental') {
    const depthVal = (length || 0) + 0.5;
    const depthStr = `${depthVal}`;
    const standardDrills = [3.0, 3.5, 4.0, 4.5, 5.0];
    const proto: { step: number; drill: string; speed: string; depth: string; note: string }[] = [];
    let s = 1;
    const COUNTERSINK: Record<number, string> = { 3.5: 'NECK-334', 3.75: 'NECK-334', 4.0: 'NECK-354', 4.5: 'NECK-455', 5.0: 'NECK-455' };

    if (system === 'Dura-Vit Slim') {
      proto.push({ step: s++, drill: 'Pilot Drill 2.1mm', speed: '800-1000 RPM', depth: depthStr, note: 'Initial osteotomy.' });
      proto.push({ step: s++, drill: 'Drill 3.0mm', speed: '800-1000 RPM', depth: depthStr, note: 'Sequential widening.' });
      if (isHardBone && d > 3.0) {
        proto.push({ step: s++, drill: `Final Drill ${d}mm`, speed: '800-1000 RPM', depth: depthStr, note: 'Dense bone — drill to full diameter.' });
      } else if (!isHardBone && d > 3.0) {
        proto.push({ step: s++, drill: 'Drill 3.2mm (Optional)', speed: '800-1000 RPM', depth: depthStr, note: 'Optional in soft bone.' });
      }
      proto.push({ step: s++, drill: `Implant ${d}mm${length ? ` x ${length}mm` : ''}`, speed: '25-35 RPM', depth: length ? `${length}` : depthStr, note: 'Dura-Vit Slim placement.' });
      return proto;
    }
    if (system === 'Wide Line') {
      const allDrills = [...standardDrills.filter(x => x < d), ...[5.5, 6.0].filter(x => x <= d && x > 5.0)];
      proto.push({ step: s++, drill: 'Pilot Drill 2.1mm', speed: '800-1000 RPM', depth: depthStr, note: 'Initial osteotomy.' });
      for (const dd of allDrills) {
        proto.push({ step: s++, drill: `Drill ${dd}mm`, speed: '800-1000 RPM', depth: depthStr, note: dd === d ? 'Final drill.' : 'Sequential widening.' });
      }
      if (!allDrills.includes(d)) proto.push({ step: s++, drill: `Final Drill ${d}mm`, speed: '800-1000 RPM', depth: depthStr, note: 'Final drill.' });
      proto.push({ step: s++, drill: `Implant ${d}mm${length ? ` x ${length}mm` : ''}`, speed: '25-35 RPM', depth: length ? `${length}` : depthStr, note: 'Wide Line placement.' });
      return proto;
    }
    // EV Line, 3P, 3P Long
    const drillsBelow = standardDrills.filter(x => x < d);
    proto.push({ step: s++, drill: 'Pilot Drill 2.1mm', speed: '800-1000 RPM', depth: depthStr, note: 'Initial osteotomy.' });
    for (const dd of drillsBelow) {
      proto.push({ step: s++, drill: `Drill ${dd}mm`, speed: '800-1000 RPM', depth: depthStr, note: 'Sequential widening.' });
    }
    if (isHardBone) {
      proto.push({ step: s++, drill: `Final Drill ${d}mm`, speed: '800-1000 RPM', depth: depthStr, note: 'Dense bone — full diameter.' });
      const cs = COUNTERSINK[d] || `NECK-${d}`;
      proto.push({ step: s++, drill: `Countersink ${cs}`, speed: '500-800 RPM', depth: 'Collar depth', note: 'Dense bone only (D1/D2).' });
    } else {
      if (drillsBelow.length > 0) proto[proto.length - 1].note = 'Final drill (undersized for soft bone).';
      if (system === '3P' || system === '3P Long') {
        proto.push({ step: s++, drill: `Compactor ${d}mm`, speed: '50-100 RPM', depth: depthStr, note: 'Condense soft bone (D3/D4).' });
      }
    }
    proto.push({ step: s++, drill: `Implant ${d}mm${length ? ` x ${length}mm` : ''}`, speed: '25-35 RPM', depth: length ? `${length}` : depthStr, note: `${system} placement.` });
    return proto;
  }

  // ── ZimVie TSX specific protocol (Dual Kit: Driva Gold + Original) ──
  if (brand === 'Zimmer' && system === 'TSX') {
    const depthStr = length ? `${length}` : 'Working length';
    const isDense = boneType === 'D1' || boneType === 'D2';
    const boneClass = isDense ? 'dense' : 'soft';
    const TSX_DRILLS: Record<string, { soft: string[] | null; dense: string[] }> = {
      '3.1': { soft: ['pilot', '2.3'], dense: ['pilot', '2.3', '2.4/2.8 step'] },
      '3.7': { soft: ['2.3', '2.8'], dense: ['2.3', '2.8', '3.4/2.8 step'] },
      '4.1': { soft: ['2.3', '2.8', '3.4/2.8'], dense: ['2.3', '2.8', '3.4/2.8', '3.8/3.4 step'] },
      '4.7': { soft: ['2.3', '2.8', '3.4/2.8', '3.8'], dense: ['2.3', '2.8', '3.4/2.8', '3.8', '4.4/3.8 step'] },
      '5.4': { soft: null, dense: ['2.3', '2.8', '3.4/2.8', '3.8', '4.4/3.8', '5.1/4.4 step'] },
      '6.0': { soft: ['2.3', '2.8', '3.4/2.8', '3.8', '4.4/3.8', '5.1'], dense: ['2.3', '2.8', '3.4/2.8', '3.8', '4.4/3.8', '5.1', '5.7/5.1 step'] },
    };
    const GOLD: Record<string, string> = {
      'pilot': '0201G', '2.3': 'TSV23G', '2.8': 'TSV28G', '3.4/2.8': 'TSV34D28G', '3.4/2.8 step': 'TSV34D28G',
      '3.8': 'TSV38G', '3.8/3.4 step': 'TSV38D34G', '4.4/3.8': 'TSV44D38G', '4.4/3.8 step': 'TSV44D38G',
      '5.1': 'TSV51G', '5.1/4.4 step': 'TSV51D44G', '5.7/5.1 step': 'TSV57D51G', '2.4/2.8 step': 'EZT28D24G',
    };
    const ORIG: Record<string, string> = {
      'pilot': '0201DSN', '2.3': 'SV2.3DN', '2.8': 'SV2.8DN', '3.4/2.8': 'TSV3DN', '3.4/2.8 step': 'TSV3DN',
      '3.8': 'SV3.8DN', '3.8/3.4 step': 'TSV3.8DN', '4.4/3.8': 'TSV4DN', '4.4/3.8 step': 'TSV4DN',
      '5.1': 'SV5.1DN', '5.1/4.4 step': 'TSV5.1DN', '5.7/5.1 step': 'TSV6DN', '2.4/2.8 step': 'ZOP28DN',
    };
    const diaKey = `${d}`;
    const diaData = TSX_DRILLS[diaKey];
    if (!diaData) return [];
    const sequence = boneClass === 'soft' ? diaData.soft : diaData.dense;
    if (sequence === null) {
      return [{ step: 1, drill: 'No soft bone protocol available', speed: '—', depth: '—', note: `No D3/D4 protocol for ${diaKey}mm TSX. Use clinician judgment.` }];
    }
    const buildKit = (codes: Record<string, string>, kitName: string) => {
      const steps: { step: number; drill: string; speed: string; depth: string; note: string }[] = [];
      steps.push({ step: 0, drill: kitName, speed: '', depth: '', note: '' });
      let s = 1;
      for (const desc of sequence) {
        const code = codes[desc] || desc;
        const isPilot = desc.includes('pilot');
        const isStep = desc.includes('step');
        const drillDia = isPilot ? '2.1/1.6mm' : desc.replace(' step', '') + 'mm';
        const rpm = isPilot ? '800-1500 RPM' : '600-800 RPM';
        const label = isPilot ? `Pilot ${code} (${drillDia})` : (isStep ? `Step Drill ${code} (${drillDia})` : `Drill ${code} (${drillDia})`);
        const note = isPilot ? 'Tapered pilot drill.' : (isStep ? 'Final step drill (dense bone).' : 'Sequential osteotomy.');
        steps.push({ step: s++, drill: label, speed: rpm, depth: depthStr, note });
      }
      steps.push({ step: s++, drill: `TSX Implant (${d}mm)`, speed: '≤30 RPM', depth: depthStr, note: `${d}mm${length ? ` x ${length}mm` : ''} — ≤90 Ncm.` });
      return steps;
    };
    return [...buildKit(GOLD, 'Driva Gold Series Drills'), ...buildKit(ORIG, 'Driva Drills (Original)')];
  }

  // Base protocol varies by diameter and bone density
  const protocol: { step: number; drill: string; speed: string; depth: string; note: string }[] = [];
  let stepNum = 1;

  // Step 1: Pilot Drill (universal)
  protocol.push({ step: stepNum++, drill: 'Pilot Drill (2.0mm)', speed: '800-1000 RPM', depth: 'Full depth', note: 'Mark osteotomy site. Use copious irrigation.' });

  // Step 2: Twist Drill
  protocol.push({ step: stepNum++, drill: 'Twist Drill (2.0mm)', speed: '800 RPM', depth: 'Working length', note: 'Verify direction with paralleling pin.' });

  // Step 3+: Sequential widening based on implant diameter
  if (d >= 3.0) {
    protocol.push({ step: stepNum++, drill: `Drill ${brand === 'Straumann' ? 'BL' : ''} 2.2mm`, speed: '600-800 RPM', depth: 'Working length', note: isHardBone ? 'Use intermittent drilling with irrigation.' : 'Light pressure for soft bone.' });
  }
  if (d >= 3.3) {
    protocol.push({ step: stepNum++, drill: `Drill 2.8mm`, speed: '600-800 RPM', depth: 'Working length', note: 'Check paralleling pin alignment.' });
  }
  if (d >= 3.5) {
    protocol.push({ step: stepNum++, drill: `Drill 3.2mm`, speed: '500-800 RPM', depth: 'Working length', note: isSoftBone ? 'Skip countersink for bone condensation.' : 'Standard sequence.' });
  }
  if (d >= 4.0) {
    protocol.push({ step: stepNum++, drill: `Drill 3.5mm`, speed: '500-800 RPM', depth: 'Working length', note: isHardBone ? 'May require pre-tapping.' : 'Proceed with insertion.' });
  }
  if (d >= 4.5) {
    protocol.push({ step: stepNum++, drill: `Drill 4.0mm`, speed: '500 RPM', depth: 'Working length', note: 'Final widening drill.' });
  }
  if (d >= 5.0) {
    protocol.push({ step: stepNum++, drill: `Drill 4.5mm`, speed: '500 RPM', depth: 'Working length', note: 'Wide platform preparation.' });
  }

  // Countersink (conditional)
  if (isHardBone && d >= 3.5) {
    protocol.push({ step: stepNum++, drill: `Countersink (${d}mm)`, speed: '500 RPM', depth: '1-2mm', note: 'Crestal bone preparation. Only for D1/D2 bone.' });
  }

  // Bone Tap (D1 only)
  if (boneType === 'D1') {
    protocol.push({ step: stepNum++, drill: `Bone Tap (${d}mm)`, speed: '15-20 RPM', depth: 'Full depth', note: 'Required for D1 dense cortical bone.' });
  }

  // Implant Placement
  protocol.push({ step: stepNum++, drill: `${system} Implant (${d}mm)`, speed: '15-25 RPM', depth: 'Final position', note: `Insert at 25-35 Ncm. Target ISQ > 65. ${isSoftBone ? 'Under-prepare by 1 step for primary stability.' : ''}` });

  return protocol;
}

export default function CaseImplantPlanning({ procedureId, isOwner, userRole, torqueValues, procedureStatus, procedureType, medicalAssessment, patientName, patientId, procedureDate }: Props) {
  const [plans, setPlans] = useState<ImplantPlanItem[]>([]);
  const [systems, setSystems] = useState<ImplantSystem[]>([]);
  const [toothRecs, setToothRecs] = useState<Record<string,any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedProtocol, setExpandedProtocol] = useState<number | null>(null);

  // Editable: students until Phase 2 approved; supervisors/incharge at all stages
  const editableStatuses = ['draft', 'pending_phase1', 'phase1_approved', 'pending_phase2'];
  const isStudentEdit = isOwner && userRole === 'student' && (!procedureStatus || editableStatuses.includes(procedureStatus));
  const isFacultyEdit = userRole === 'supervisor' || userRole === 'implant_incharge';
  const canEdit = isStudentEdit || isFacultyEdit;

  const loadData = useCallback(async () => {
    try {
      const [planRes, sysRes, toothRes] = await Promise.allSettled([
        api.get(`/procedures/${procedureId}/implant-plan`),
        api.get('/implant-library/systems'),
        api.get('/implant-library/tooth-recommendations'),
      ]);
      if (planRes.status === 'fulfilled') setPlans(planRes.value.data.implant_plans || []);
      if (sysRes.status === 'fulfilled') setSystems(sysRes.value.data || []);
      if (toothRes.status === 'fulfilled') setToothRecs(toothRes.value.data || {});
    } catch (err) {
      console.error('Failed to load implant planning data:', err);
    } finally {
      setLoading(false);
    }
  }, [procedureId]);

  useEffect(() => { loadData(); }, [loadData]);

  const savePlans = async (newPlans: ImplantPlanItem[]) => {
    setSaving(true);
    try {
      await api.post(`/procedures/${procedureId}/implant-plan`, { implants: newPlans });
      setPlans(newPlans);
      Alert.alert('Saved', `Implant plan saved (${newPlans.length} implant${newPlans.length > 1 ? 's' : ''}).`);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to save implant plan.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddImplant = (item: ImplantPlanItem) => {
    if (editingIdx !== null) {
      const updated = [...plans];
      updated[editingIdx] = item;
      savePlans(updated);
      setEditingIdx(null);
    } else {
      savePlans([...plans, item]);
    }
    setShowAddModal(false);
  };

  const handleDeleteImplant = (idx: number) => {
    Alert.alert('Remove Implant', `Remove implant at position ${plans[idx].position}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        const updated = plans.filter((_, i) => i !== idx);
        savePlans(updated);
      }},
    ]);
  };

  const handleEditImplant = (idx: number) => {
    setEditingIdx(idx);
    setShowAddModal(true);
  };

  const usedPositions = plans.map(p => p.position);

  if (loading) {
    return (
      <View style={st.loadingBox}>
        <ActivityIndicator size="small" color="#1E88E5" />
        <Text style={st.loadingText}>Loading implant plans...</Text>
      </View>
    );
  }

  return (
    <View style={st.container} data-testid="case-implant-planning">
      <View style={st.header}>
        <View style={st.headerLeft}>
          <Ionicons name="medical" size={22} color="#1E88E5" />
          <Text style={st.headerTitle}>Implant Planning</Text>
        </View>
        <View style={st.badge}>
          <Text style={st.badgeText}>{plans.length}/6</Text>
        </View>
      </View>

      {/* Saved Implant Cards */}
      {plans.map((plan, idx) => {
        const rec = toothRecs[plan.position];
        return (
          <View key={`${plan.position}-${idx}`} style={st.implantCard} data-testid={`implant-plan-${idx}`}>
            <View style={st.implantCardHeader}>
              <View style={st.positionBadge}>
                <Text style={st.positionText}>{plan.position}</Text>
              </View>
              <View style={st.implantInfo}>
                <Text style={st.implantTitle}>{plan.brand} - {plan.system}</Text>
                <Text style={st.implantSpecs}>
                  D: {plan.diameter}mm | L: {plan.length}mm
                  {rec ? ` | ${rec.region}` : ''}
                </Text>
              </View>
              {plan.risk_level && (
                <View style={[st.riskBadge, { backgroundColor: plan.risk_level === 'Low' ? '#E8F5E9' : plan.risk_level === 'Moderate' ? '#FFF3E0' : '#FFEBEE' }]}>
                  <Text style={[st.riskBadgeText, { color: plan.risk_level === 'Low' ? '#4CAF50' : plan.risk_level === 'Moderate' ? '#FF9800' : '#F44336' }]}>
                    {plan.risk_level}
                  </Text>
                </View>
              )}
            </View>
            <View style={st.implantDetails}>
              {plan.bone_width && <Text style={st.detailText}>Bone: {plan.bone_width}mm W x {plan.bone_height}mm H</Text>}
              {plan.bone_type && <Text style={st.detailText}>Bone Type: {plan.bone_type}</Text>}
              {plan.risk_score !== undefined && plan.risk_score !== null && <Text style={st.detailText}>Risk Score: {plan.risk_score}/{plan.risk_score > 15 ? 18 : 15}</Text>}
              {torqueValues && torqueValues[idx] !== undefined && (
                <View style={st.torqueRow} data-testid={`implant-torque-${idx}`}>
                  <Ionicons name="speedometer" size={14} color="#FF6D00" />
                  <Text style={st.torqueText}>Torque: <Text style={st.torqueValue}>{torqueValues[idx]} Ncm</Text></Text>
                </View>
              )}
            </View>
            {canEdit && (
              <View style={st.implantActions}>
                <TouchableOpacity style={st.editBtn} onPress={() => handleEditImplant(idx)} data-testid={`edit-implant-${idx}`}>
                  <Ionicons name="pencil" size={16} color="#1E88E5" />
                  <Text style={st.editBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={st.deleteBtn} onPress={() => handleDeleteImplant(idx)} data-testid={`delete-implant-${idx}`}>
                  <Ionicons name="trash-outline" size={16} color="#F44336" />
                  <Text style={st.deleteBtnText}>Remove</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={st.protocolBtn}
                  onPress={() => setExpandedProtocol(expandedProtocol === idx ? null : idx)}
                  data-testid={`protocol-btn-${idx}`}
                >
                  <Ionicons name="construct" size={16} color="#5C6BC0" />
                  <Text style={st.protocolBtnText}>Drilling Protocol</Text>
                </TouchableOpacity>
              </View>
            )}
            {!canEdit && (
              <View style={st.implantActions}>
                <TouchableOpacity
                  style={st.protocolBtn}
                  onPress={() => setExpandedProtocol(expandedProtocol === idx ? null : idx)}
                  data-testid={`protocol-btn-${idx}`}
                >
                  <Ionicons name="construct" size={16} color="#5C6BC0" />
                  <Text style={st.protocolBtnText}>Drilling Protocol</Text>
                </TouchableOpacity>
              </View>
            )}
            {expandedProtocol === idx && plan.bone_type && (
              <View style={st.inlineProtocol}>
                <View style={st.inlineProtocolHeader}>
                  <Ionicons name="construct" size={16} color="#1565C0" />
                  <Text style={st.inlineProtocolTitle}>Drilling Sequence: {plan.brand} {plan.diameter}mm ({plan.bone_type})</Text>
                </View>
                {generateDrillingProtocol(plan.brand, plan.system, plan.diameter, plan.bone_type, plan.length).map((p, idx) => (
                  p.step === 0 ? (
                    <View key={`kit-${idx}`} style={st.kitSeparator}>
                      <Text style={st.kitSeparatorText}>{p.drill}</Text>
                    </View>
                  ) : (
                  <View key={`step-${idx}`} style={st.protocolStepRow}>
                    <View style={st.protocolStepBadge}>
                      <Text style={st.protocolStepBadgeText}>{p.step}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.protocolDrillText}>{p.drill}</Text>
                      <Text style={st.protocolMetaText}>{p.speed} | {p.depth}</Text>
                    </View>
                  </View>
                  )
                ))}
                {/* Print / Export Drilling Protocol PDF — single entry, same popover as elsewhere */}
                <View style={{ marginTop: 8 }}>
                  <ExportPrintMenu
                    label="Print / Export Drilling Protocol PDF"
                    buttonStyle={{ backgroundColor: '#37474F', paddingVertical: 10, borderRadius: 8 }}
                    textStyle={{ color: '#FFF', fontSize: 12, fontWeight: '700', letterSpacing: 0.3 }}
                    triggerIcon="share-outline"
                    triggerIconSize={14}
                    testID={`drilling-export-print-${idx}`}
                    popoverTitle="Drilling Protocol"
                    printLabel="Print drilling protocol"
                    exportLabel="Export drilling protocol PDF"
                    onPrint={() => {
                      const steps = generateDrillingProtocol(plan.brand, plan.system, plan.diameter, plan.bone_type, plan.length);
                      return printDrillingProtocolPdf({ implant: plan, bone: plan.bone_type, tooth: plan.tooth || '', patientName, patientId, procedureDate, steps });
                    }}
                    onExport={() => {
                      const steps = generateDrillingProtocol(plan.brand, plan.system, plan.diameter, plan.bone_type, plan.length);
                      return exportDrillingProtocolPdf({ implant: plan, bone: plan.bone_type, tooth: plan.tooth || '', patientName, patientId, procedureDate, steps });
                    }}
                  />
                </View>
              </View>
            )}
            {expandedProtocol === idx && !plan.bone_type && (
              <View style={st.inlineProtocol}>
                <Text style={{ fontSize: 12, color: '#C62828', textAlign: 'center', padding: 8, fontWeight: '600' }}>
                  Bone type is not set for this implant.
                </Text>
                <Text style={{ fontSize: 11, color: '#78909C', textAlign: 'center', paddingHorizontal: 12, paddingBottom: 8 }}>
                  Drilling Protocol (and its Print / Export PDF) will unlock once the supervising student sets a bone type.
                </Text>
              </View>
            )}
          </View>
        );
      })}

      {plans.length === 0 && (
        <View style={st.emptyState}>
          <Ionicons name="medical-outline" size={36} color="#CCC" />
          <Text style={st.emptyText}>No implants planned yet</Text>
          <Text style={st.emptySubtext}>Add up to 6 implant positions for this case</Text>
        </View>
      )}

      {canEdit && plans.length < 6 && (
        <TouchableOpacity
          style={st.addButton}
          onPress={() => { setEditingIdx(null); setShowAddModal(true); }}
          disabled={saving}
          data-testid="add-implant-btn"
        >
          {saving ? (
            <ActivityIndicator color="#1E88E5" size="small" />
          ) : (
            <>
              <Ionicons name="add-circle" size={20} color="#1E88E5" />
              <Text style={st.addButtonText}>Add Implant Position ({plans.length}/6)</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Add/Edit Modal */}
      <ImplantPlanModal
        visible={showAddModal}
        onClose={() => { setShowAddModal(false); setEditingIdx(null); }}
        onSave={handleAddImplant}
        systems={systems}
        toothRecs={toothRecs}
        usedPositions={editingIdx !== null ? usedPositions.filter((_, i) => i !== editingIdx) : usedPositions}
        editItem={editingIdx !== null ? plans[editingIdx] : undefined}
        medicalAssessment={medicalAssessment}
        procedureType={procedureType}
        procedureId={procedureId}
      />
    </View>
  );
}

// ── Add/Edit Implant Modal Component ───────────────────────
function ImplantPlanModal({ visible, onClose, onSave, systems, toothRecs, usedPositions, editItem, medicalAssessment, procedureType, procedureId }: {
  visible: boolean; onClose: () => void; onSave: (item: ImplantPlanItem) => void;
  systems: ImplantSystem[]; toothRecs: Record<string,any>; usedPositions: string[];
  editItem?: ImplantPlanItem; medicalAssessment?: Record<string, string>;
  procedureType?: string; procedureId: string;
}) {
  const [step, setStep] = useState(1);
  const [position, setPosition] = useState('');
  const [mode, setMode] = useState<'choose'|'suggest'>('choose');
  const [selectedSystem, setSelectedSystem] = useState<ImplantSystem | null>(null);
  const [boneWidth, setBoneWidth] = useState('');
  const [boneHeight, setBoneHeight] = useState('');
  const [boneType, setBoneType] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [selectedImplant, setSelectedImplant] = useState<{diameter: number; length: number; brand: string; system: string} | null>(null);
  const [riskResult, setRiskResult] = useState<any>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [showSystemDD, setShowSystemDD] = useState(false);
  const [systemSearch, setSystemSearch] = useState('');
  const [showAllResults, setShowAllResults] = useState(false);

  // Suggest Me states
  const [sProcedures, setSProcedures] = useState<string[]>([]);
  const PROCEDURES = ['Conventional Implant Placement','Conventional Implant Placement with Bone Graft','Immediate Implant Placement','Immediate Implant Placement with Bone Graft','Sinus Lift','Restricted Bone Height','Narrow Ridge'];
  const BONE_TYPES = ['D1','D2','D3','D4'];

  useEffect(() => {
    if (visible) {
      if (editItem) {
        setPosition(editItem.position);
        setBoneWidth(editItem.bone_width?.toString() || '');
        setBoneHeight(editItem.bone_height?.toString() || '');
        setBoneType(editItem.bone_type || '');
        setSelectedImplant({ diameter: editItem.diameter, length: editItem.length, brand: editItem.brand, system: editItem.system });
        if (editItem.risk_level) {
          setRiskResult({ risk_level: editItem.risk_level, total_score: editItem.risk_score });
        }
        // Pre-select the matching system in the dropdown
        const matchingSystem = systems.find(s => s.brand === editItem.brand && s.system === editItem.system);
        if (matchingSystem) {
          setSelectedSystem(matchingSystem);
        }
        setMode('choose');
        setStep(2); // Start at system selection so user can change system/dimensions
      } else {
        resetForm();
      }
    }
  }, [visible, editItem]);

  const resetForm = () => {
    setStep(1); setPosition(''); setMode('choose'); setSelectedSystem(null);
    setBoneWidth(''); setBoneHeight(''); setBoneType(''); setResult(null);
    setSelectedImplant(null); setRiskResult(null); setSProcedures([]);
  };

  const handleSearch = async () => {
    setSearching(true); setResult(null); setShowAllResults(false);
    try {
      if (mode === 'choose') {
        const res = await api.get('/implant-library/suggest', {
          params: { brand: selectedSystem!.brand, system: selectedSystem!.system,
            bone_width: parseFloat(boneWidth), bone_height: parseFloat(boneHeight), tooth: position, bone_type: boneType || undefined },
        });
        setResult(res.data);
      } else {
        const res = await api.post('/implant-library/suggest-auto', {
          tooth: position, procedures: sProcedures, bone_type: boneType,
          bone_width: parseFloat(boneWidth), bone_height: parseFloat(boneHeight),
        });
        setResult(res.data);
      }
      setStep(3);
    } catch { Alert.alert('Error', 'Failed to get suggestions.'); }
    finally { setSearching(false); }
  };

  const handleCalcRisk = async () => {
    if (!selectedImplant || !boneType) return;
    setRiskLoading(true);
    try {
      const res = await api.post('/implant-library/calculate-risk', {
        bone_width: parseFloat(boneWidth), bone_height: parseFloat(boneHeight),
        implant_diameter: selectedImplant.diameter, implant_length: selectedImplant.length,
        bone_type: boneType, procedure: sProcedures[0] || 'Conventional Implant Placement', tooth: position,
        medical_assessment: medicalAssessment || {},
      });
      setRiskResult(res.data);
    } catch { Alert.alert('Error', 'Failed to calculate risk.'); }
    finally { setRiskLoading(false); }
  };

  const handleConfirm = () => {
    if (!selectedImplant || !position) return;
    onSave({
      position, brand: selectedImplant.brand, system: selectedImplant.system,
      diameter: selectedImplant.diameter, length: selectedImplant.length,
      bone_width: parseFloat(boneWidth) || undefined, bone_height: parseFloat(boneHeight) || undefined,
      bone_type: boneType || undefined, risk_level: riskResult?.risk_level,
      risk_score: riskResult?.total_score,
    });
  };

  const toothInfo = position ? toothRecs[position] : null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ModalContent
        visible={visible}
        onClose={onClose}
        onSave={onSave}
        systems={systems}
        toothRecs={toothRecs}
        usedPositions={usedPositions}
        editItem={editItem}
        step={step} setStep={setStep}
        position={position} setPosition={setPosition}
        mode={mode} setMode={setMode}
        selectedSystem={selectedSystem} setSelectedSystem={setSelectedSystem}
        boneWidth={boneWidth} setBoneWidth={setBoneWidth}
        boneHeight={boneHeight} setBoneHeight={setBoneHeight}
        boneType={boneType} setBoneType={setBoneType}
        searching={searching}
        result={result}
        selectedImplant={selectedImplant} setSelectedImplant={setSelectedImplant}
        riskResult={riskResult}
        riskLoading={riskLoading}
        showSystemDD={showSystemDD} setShowSystemDD={setShowSystemDD}
        systemSearch={systemSearch} setSystemSearch={setSystemSearch}
        showAllResults={showAllResults} setShowAllResults={setShowAllResults}
        sProcedures={sProcedures} setSProcedures={setSProcedures}
        handleSearch={handleSearch}
        handleCalcRisk={handleCalcRisk}
        handleConfirm={handleConfirm}
        toothInfo={toothInfo}
        procedureType={procedureType}
        procedureId={procedureId}
      />
    </Modal>
  );
}

// Separate inner component to use hooks inside Modal
function ModalContent(props: any) {
  const insets = useSafeAreaInsets();
  const {
    onClose, editItem, step, setStep, position, setPosition, mode, setMode,
    selectedSystem, setSelectedSystem, boneWidth, setBoneWidth, boneHeight, setBoneHeight,
    boneType, setBoneType, searching, result, selectedImplant, setSelectedImplant,
    riskResult, riskLoading, showSystemDD, setShowSystemDD, systemSearch, setSystemSearch,
    showAllResults, setShowAllResults,
    sProcedures, setSProcedures, handleSearch, handleCalcRisk, handleConfirm, toothInfo,
    systems, usedPositions, onSave, procedureType, procedureId,
  } = props;

  const BONE_TYPES = ['D1','D2','D3','D4'];
  const PROCEDURES = ['Conventional Implant Placement','Conventional Implant Placement with Bone Graft','Immediate Implant Placement','Immediate Implant Placement with Bone Graft','Sinus Lift','Restricted Bone Height','Narrow Ridge'];
  const RESTRICTED_HEIGHT_P1 = ['BioHorizons|Tapered Short', 'BioHorizons|Tapered Short Conical RBT', 'Bredent|Copa Sky', 'Dentsply Sirona|Ankylos C/X'];
  const isRestrictedHeight = !isNaN(parseFloat(boneHeight)) && parseFloat(boneHeight) > 0 && parseFloat(boneHeight) <= 10;

  // Real-time narrow ridge classification based on bone width
  const narrowRidgeClass = (() => {
    const w = parseFloat(boneWidth);
    if (!w || w <= 0) return null;
    if (w >= 6) return { label: 'Adequate Ridge Width', icon: 'checkmark-circle' as const, color: '#2E7D32', bgColor: '#E8F5E9', borderColor: '#66BB6A', severity: 'safe' };
    if (w >= 4.5) return { label: 'Mildly Narrow Ridge', icon: 'information-circle' as const, color: '#1565C0', bgColor: '#E3F2FD', borderColor: '#64B5F6', severity: 'info' };
    if (w >= 3) return { label: 'Moderately Narrow Ridge', icon: 'alert-circle' as const, color: '#E65100', bgColor: '#FFF3E0', borderColor: '#FFB74D', severity: 'warning' };
    return { label: 'Severely Narrow Ridge — Augmentation Required', icon: 'close-circle' as const, color: '#B71C1C', bgColor: '#FFEBEE', borderColor: '#EF9A9A', severity: 'critical' };
  })();
  const [showProtocol, setShowProtocol] = React.useState(false);
  const [bwFocused, setBwFocused] = React.useState(false);
  const [bhFocused, setBhFocused] = React.useState(false);
  const [aiExplanation, setAiExplanation] = React.useState('');
  const [aiExplaining, setAiExplaining] = React.useState(false);

  const boneWidthInfo = React.useMemo(() => {
    if (!position) return '';
    const t = parseInt(position);
    if ([11,12,13,21,22,23].includes(t)) return 'Measure distance between labial and palatal bone plate';
    if ([14,15,16,17,24,25,26,27].includes(t)) return 'Measure distance between buccal and palatal bone plate';
    if ([31,32,33,41,42,43].includes(t)) return 'Measure distance between labial and lingual bone plate';
    if ([34,35,36,37,44,45,46,47].includes(t)) return 'Measure distance between buccal and lingual bone plate';
    return '';
  }, [position]);

  const boneHeightInfo = React.useMemo(() => {
    if (!position) return '';
    const t = parseInt(position);
    if ([14,15,16,17,24,25,26,27].includes(t)) return 'Measure from crest of the ridge to the floor of maxillary sinus';
    if ([34,35,36,37,44,45,46,47].includes(t)) return 'Measure from crest of the ridge to inferior alveolar nerve';
    return '';
  }, [position]);

  // Auto-expand drilling protocol when an implant is selected
  React.useEffect(() => {
    if (selectedImplant) setShowProtocol(true);
  }, [selectedImplant]);

  return (
    <View style={[ms.container, { paddingTop: Math.max(insets.top, 20) }]}>
        {/* Header */}
        <View style={ms.header}>
          <TouchableOpacity onPress={onClose} style={ms.closeBtn} data-testid="modal-close-btn">
            <Ionicons name="close" size={28} color="#333" />
          </TouchableOpacity>
          <Text style={ms.headerTitle}>{editItem ? 'Edit' : 'Add'} Implant Position</Text>
          <Text style={ms.stepIndicator}>Step {step}/4</Text>
        </View>

        {/* Single flex container */}
        <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 16, paddingTop: step === 1 ? 130 : 16 }}>
          {/* STEP 1: Tooth Selection */}
          {step === 1 && (
            <View>
              <Text style={ms.stepTitle}>Select Tooth Position</Text>
              <MiniDentalChart
                selected={position}
                disabled={usedPositions}
                onSelect={(t) => setPosition(t)}
              />
              {position && toothInfo && (
                <View style={ms.recBox}>
                  <Text style={ms.recTitle}>Tooth {position}: {toothInfo.region}</Text>
                  <Text style={ms.recText}>Diameter: {toothInfo.diameter[0]}-{toothInfo.diameter[1]}mm | Length: {toothInfo.length[0]}-{toothInfo.length[1]}mm</Text>
                </View>
              )}
              <TouchableOpacity
                style={[ms.nextBtn, !position && ms.btnDisabled]}
                disabled={!position}
                onPress={() => setStep(2)}
                data-testid="step1-next"
              >
                <Text style={ms.nextBtnText}>Next: Select Implant</Text>
                <Ionicons name="arrow-forward" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
          )}

          {/* STEPS 2-4: Scrollable */}
          {step > 1 && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={ms.scroll}>

          {/* STEP 2: Select Mode & System */}
          {step === 2 && (
            <View>
              <Text style={ms.stepTitle}>Select Implant System</Text>
              {/* Mode Tabs */}
              <View style={ms.modeRow}>
                <TouchableOpacity style={[ms.modeBtn, mode === 'choose' && ms.modeBtnActive]} onPress={() => setMode('choose')}>
                  <Ionicons name="hand-left-outline" size={16} color={mode === 'choose' ? '#FFF' : '#666'} />
                  <Text style={[ms.modeBtnText, mode === 'choose' && ms.modeBtnTextActive]}>Let Me Choose</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[ms.modeBtn, mode === 'suggest' && ms.modeBtnActive]} onPress={() => setMode('suggest')}>
                  <Ionicons name="bulb-outline" size={16} color={mode === 'suggest' ? '#FFF' : '#666'} />
                  <Text style={[ms.modeBtnText, mode === 'suggest' && ms.modeBtnTextActive]}>Suggest Me</Text>
                </TouchableOpacity>
              </View>

              {mode === 'choose' ? (
                <>
                  <TouchableOpacity style={ms.dropdown} onPress={() => setShowSystemDD(true)} data-testid="modal-system-dropdown">
                    <Text style={selectedSystem ? ms.ddText : ms.ddPlaceholder}>
                      {selectedSystem ? `${selectedSystem.brand} - ${selectedSystem.system}` : `Select System (${systems.length})`}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color="#666" />
                  </TouchableOpacity>

                  {/* Show all available options of the selected system */}
                  {selectedSystem && (
                    <View style={ms.systemOptionsBox} data-testid="system-options-list">
                      <Text style={ms.systemOptionsTitle}>Available Options: {selectedSystem.brand} - {selectedSystem.system}</Text>
                      {selectedSystem.indication ? (
                        <View style={ms.indicationBanner} data-testid="selected-system-indication">
                          <Ionicons name="information-circle" size={16} color="#1565C0" />
                          <Text style={ms.indicationBannerText}>{selectedSystem.indication}</Text>
                        </View>
                      ) : null}
                      <View style={ms.systemOptionsGrid}>
                        <View style={ms.systemOptionsCol}>
                          <Text style={ms.systemOptionsLabel}>Diameters (mm)</Text>
                          <Text style={ms.systemOptionsValues}>{selectedSystem.diameters.join(', ')}</Text>
                        </View>
                        <View style={ms.systemOptionsCol}>
                          <Text style={ms.systemOptionsLabel}>Lengths (mm)</Text>
                          <Text style={ms.systemOptionsValues}>{selectedSystem.lengths.join(', ')}</Text>
                        </View>
                      </View>
                      <Text style={ms.systemOptionsCount}>{selectedSystem.count} size combinations available</Text>
                    </View>
                  )}

                  {/* Drilling Protocol - shown after system is selected */}
                  {selectedSystem && (
                    <View style={ms.protocolBox} data-testid="drilling-protocol">
                      <View style={ms.protocolHeader}>
                        <Ionicons name="construct" size={18} color="#1565C0" />
                        <Text style={ms.protocolTitle}>Drilling Protocol: {selectedSystem.brand} {selectedSystem.system}</Text>
                      </View>
                      <Text style={ms.protocolSubtitle}>
                        Diameters: {selectedSystem.diameters.join(', ')}mm | Lengths: {selectedSystem.lengths.join(', ')}mm
                      </Text>
                      {selectedSystem.diameters.length > 0 && (
                        <>
                          <Text style={ms.protocolDiameterLabel}>
                            Sequence for {selectedSystem.diameters[0]}mm (Bone: {boneType || 'D2'})
                          </Text>
                          {generateDrillingProtocol(selectedSystem.brand, selectedSystem.system, selectedSystem.diameters[0], boneType || 'D2', selectedSystem.lengths?.[0]).map((p, idx) => (
                            p.step === 0 ? (
                              <View key={`kit-${idx}`} style={ms.kitSeparator}>
                                <Text style={ms.kitSeparatorText}>{p.drill}</Text>
                              </View>
                            ) : (
                            <View key={`step-${idx}`} style={ms.protocolStep}>
                              <View style={ms.protocolStepNum}>
                                <Text style={ms.protocolStepNumText}>{p.step}</Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={ms.protocolDrill}>{p.drill}</Text>
                                <Text style={ms.protocolDetail}>{p.speed} | {p.depth}</Text>
                                <Text style={ms.protocolNote}>{p.note}</Text>
                              </View>
                            </View>
                            )
                          ))}
                        </>
                      )}
                    </View>
                  )}

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={ms.inputLabel}>Bone Width (mm)</Text>
                    {boneWidthInfo ? <Ionicons name="information-circle" size={18} color="#1565C0" /> : null}
                  </View>
                  {boneWidthInfo && !bwFocused ? <Text style={{ fontSize: 11, color: '#1565C0', marginBottom: 4, marginLeft: 2, fontStyle: 'italic' }}>{boneWidthInfo}</Text> : null}
                  <TextInput style={ms.input} value={boneWidth} onChangeText={setBoneWidth} keyboardType="decimal-pad" placeholder="e.g. 7" onFocus={() => setBwFocused(true)} onBlur={() => setBwFocused(false)} data-testid="modal-bone-width" />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={ms.inputLabel}>Bone Height (mm)</Text>
                    {boneHeightInfo ? <Ionicons name="information-circle" size={18} color="#1565C0" /> : null}
                  </View>
                  {boneHeightInfo && !bhFocused ? <Text style={{ fontSize: 11, color: '#1565C0', marginBottom: 4, marginLeft: 2, fontStyle: 'italic' }}>{boneHeightInfo}</Text> : null}
                  <TextInput style={ms.input} value={boneHeight} onChangeText={setBoneHeight} keyboardType="decimal-pad" placeholder="e.g. 12" onFocus={() => setBhFocused(true)} onBlur={() => setBhFocused(false)} data-testid="modal-bone-height" />
                  {isRestrictedHeight && (
                    <View style={ms.restrictedBanner} data-testid="choose-restricted-warning">
                      <Ionicons name="alert-circle" size={16} color="#E65100" />
                      <Text style={ms.restrictedBannerText}>Restricted bone height detected. Recommended systems: BioHorizons Tapered Short, Tapered Short Conical RBT, Bredent Copa Sky, Ankylos C/X.</Text>
                    </View>
                  )}
                  {narrowRidgeClass && (
                    <View style={[ms.narrowRidgeBanner, { backgroundColor: narrowRidgeClass.bgColor, borderColor: narrowRidgeClass.borderColor }]} data-testid="choose-narrow-ridge-indicator">
                      <Ionicons name={narrowRidgeClass.icon} size={18} color={narrowRidgeClass.color} />
                      <View style={{ flex: 1 }}>
                        <Text style={[ms.narrowRidgeLabel, { color: narrowRidgeClass.color }]}>{narrowRidgeClass.label}</Text>
                        <Text style={ms.narrowRidgeSubtext}>Ridge Width = Bone Width ({boneWidth}mm)</Text>
                      </View>
                    </View>
                  )}
                </>
              ) : (
                <>
                  <Text style={ms.inputLabel}>Procedure Type</Text>
                  {PROCEDURES.map(proc => {
                    const sel = sProcedures.includes(proc);
                    return (
                      <TouchableOpacity key={proc} style={[ms.procChip, sel && ms.procChipActive]}
                        onPress={() => setSProcedures(prev => sel ? prev.filter(p=>p!==proc) : [...prev, proc])}>
                        <Ionicons name={sel ? 'checkbox' : 'square-outline'} size={18} color={sel ? '#1E88E5' : '#999'} />
                        <Text style={[ms.procChipText, sel && ms.procChipTextActive]}>{proc}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  <Text style={ms.inputLabel}>Bone Type</Text>
                  <View style={ms.boneTypeRow}>
                    {BONE_TYPES.map(bt => (
                      <TouchableOpacity key={bt} style={[ms.boneTypeBtn, boneType === bt && ms.boneTypeBtnActive]} onPress={() => setBoneType(bt)}>
                        <Text style={[ms.boneTypeBtnText, boneType === bt && ms.boneTypeBtnTextActive]}>{bt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={ms.inputLabel}>Bone Width (mm)</Text>
                    {boneWidthInfo ? <Ionicons name="information-circle" size={18} color="#1565C0" /> : null}
                  </View>
                  {boneWidthInfo && !bwFocused ? <Text style={{ fontSize: 11, color: '#1565C0', marginBottom: 4, marginLeft: 2, fontStyle: 'italic' }}>{boneWidthInfo}</Text> : null}
                  <TextInput style={ms.input} value={boneWidth} onChangeText={setBoneWidth} keyboardType="decimal-pad" placeholder="e.g. 7" onFocus={() => setBwFocused(true)} onBlur={() => setBwFocused(false)} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={ms.inputLabel}>Bone Height (mm)</Text>
                    {boneHeightInfo ? <Ionicons name="information-circle" size={18} color="#1565C0" /> : null}
                  </View>
                  {boneHeightInfo && !bhFocused ? <Text style={{ fontSize: 11, color: '#1565C0', marginBottom: 4, marginLeft: 2, fontStyle: 'italic' }}>{boneHeightInfo}</Text> : null}
                  <TextInput style={ms.input} value={boneHeight} onChangeText={setBoneHeight} keyboardType="decimal-pad" placeholder="e.g. 12" onFocus={() => setBhFocused(true)} onBlur={() => setBhFocused(false)} />
                  {narrowRidgeClass && (
                    <View style={[ms.narrowRidgeBanner, { backgroundColor: narrowRidgeClass.bgColor, borderColor: narrowRidgeClass.borderColor }]} data-testid="suggest-narrow-ridge-indicator">
                      <Ionicons name={narrowRidgeClass.icon} size={18} color={narrowRidgeClass.color} />
                      <View style={{ flex: 1 }}>
                        <Text style={[ms.narrowRidgeLabel, { color: narrowRidgeClass.color }]}>{narrowRidgeClass.label}</Text>
                        <Text style={ms.narrowRidgeSubtext}>Ridge Width = Bone Width ({boneWidth}mm)</Text>
                      </View>
                    </View>
                  )}
                </>
              )}

              <View style={ms.navRow}>
                <TouchableOpacity style={ms.backBtn} onPress={() => setStep(1)}>
                  <Ionicons name="arrow-back" size={20} color="#666" />
                  <Text style={ms.backBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[ms.nextBtn, ms.nextBtnFlex,
                    (mode === 'choose' ? (!selectedSystem || !boneWidth || !boneHeight) : (!sProcedures.length || !boneType || !boneWidth || !boneHeight)) && ms.btnDisabled]}
                  disabled={mode === 'choose' ? (!selectedSystem || !boneWidth || !boneHeight || searching) : (!sProcedures.length || !boneType || !boneWidth || !boneHeight || searching)}
                  onPress={handleSearch}
                  data-testid="step2-search"
                >
                  {searching ? <ActivityIndicator color="#FFF" size="small" /> : (
                    <>
                      <Text style={ms.nextBtnText}>Find Implant</Text>
                      <Ionicons name="search" size={20} color="#FFF" />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* STEP 3: Select from Results */}
          {step === 3 && result && (
            <View>
              <Text style={ms.stepTitle}>Select Implant</Text>

              {/* ── High Constraint Mode (Narrow Ridge + Restricted Height) ── */}
              {result.high_constraint_evaluation?.active && (
                <View style={[ms.highConstraintCard, { borderColor: result.high_constraint_evaluation.risk_level === 'HIGH' ? '#EF9A9A' : '#FFB74D' }]} data-testid="high-constraint-display">
                  <View style={[ms.highConstraintBadge, { backgroundColor: result.high_constraint_evaluation.risk_level === 'HIGH' ? '#B71C1C' : '#E65100' }]}>
                    <Ionicons name="warning" size={14} color="#FFF" />
                    <Text style={ms.highConstraintBadgeText}>High Constraint Mode — {result.high_constraint_evaluation.risk_level} Risk</Text>
                  </View>
                  <View style={ms.highConstraintRegion}>
                    <Ionicons name="locate" size={16} color="#37474F" />
                    <Text style={ms.highConstraintRegionText}>
                      {result.high_constraint_evaluation.region?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                      {result.high_constraint_evaluation.anatomical_constraint ? ` (${result.high_constraint_evaluation.anatomical_constraint.replace(/_/g, ' ')})` : ''}
                    </Text>
                  </View>
                  <View style={ms.highConstraintOptions}>
                    <View style={ms.highConstraintOption}>
                      <Text style={ms.highConstraintOptionLabel}>Primary:</Text>
                      <Text style={ms.highConstraintOptionValue}>{result.high_constraint_evaluation.primary_option}</Text>
                    </View>
                    <View style={ms.highConstraintOption}>
                      <Text style={ms.highConstraintOptionLabel}>Alternative:</Text>
                      <Text style={ms.highConstraintOptionValue}>{result.high_constraint_evaluation.secondary_option}</Text>
                    </View>
                  </View>
                  {result.high_constraint_evaluation.recommendations?.map((r: string, i: number) => (
                    <View key={i} style={ms.highConstraintRecItem}>
                      <View style={ms.highConstraintRecDot} />
                      <Text style={ms.highConstraintRecText}>{r}</Text>
                    </View>
                  ))}
                  {result.high_constraint_evaluation.warnings?.map((w: string, i: number) => (
                    <View key={i} style={[ms.highConstraintWarnRow, { borderLeftColor: result.high_constraint_evaluation.risk_level === 'HIGH' ? '#B71C1C' : '#E65100' }]}>
                      <Ionicons name="alert-circle" size={14} color={result.high_constraint_evaluation.risk_level === 'HIGH' ? '#B71C1C' : '#E65100'} />
                      <Text style={ms.highConstraintWarnText}>{w}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* ── Treatment Protocol Display (shown when narrow ridge detected) ── */}
              {result.narrow_ridge_evaluation && result.narrow_ridge_evaluation.classification !== 'adequate' && (
                <View style={[ms.treatmentProtocolCard, {
                  borderColor: result.narrow_ridge_evaluation.severity === 'critical' ? '#EF9A9A' : result.narrow_ridge_evaluation.severity === 'warning' ? '#FFB74D' : '#64B5F6',
                }]} data-testid="treatment-protocol-display">
                  <View style={ms.treatmentProtocolHeader}>
                    <View style={[ms.treatmentProtocolBadge, {
                      backgroundColor: result.narrow_ridge_evaluation.severity === 'critical' ? '#B71C1C' : result.narrow_ridge_evaluation.severity === 'warning' ? '#E65100' : '#1565C0',
                    }]}>
                      <Ionicons name="medical" size={14} color="#FFF" />
                      <Text style={ms.treatmentProtocolBadgeText}>Narrow Ridge Assessment</Text>
                    </View>
                  </View>

                  {/* Classification */}
                  <View style={[ms.treatmentClassRow, {
                    backgroundColor: result.narrow_ridge_evaluation.severity === 'critical' ? '#FFEBEE' : result.narrow_ridge_evaluation.severity === 'warning' ? '#FFF3E0' : '#E3F2FD',
                  }]}>
                    <Ionicons
                      name={result.narrow_ridge_evaluation.severity === 'critical' ? 'close-circle' : result.narrow_ridge_evaluation.severity === 'warning' ? 'alert-circle' : 'information-circle'}
                      size={20}
                      color={result.narrow_ridge_evaluation.severity === 'critical' ? '#B71C1C' : result.narrow_ridge_evaluation.severity === 'warning' ? '#E65100' : '#1565C0'}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[ms.treatmentClassLabel, {
                        color: result.narrow_ridge_evaluation.severity === 'critical' ? '#B71C1C' : result.narrow_ridge_evaluation.severity === 'warning' ? '#E65100' : '#1565C0',
                      }]}>{result.narrow_ridge_evaluation.classification_label}</Text>
                      <Text style={ms.treatmentClassSub}>Ridge Width: {result.narrow_ridge_evaluation.ridge_width_mm}mm</Text>
                    </View>
                  </View>

                  {/* Recommended Implant Type */}
                  {result.narrow_ridge_evaluation.recommendation?.implant_type && (
                    <View style={ms.treatmentRow}>
                      <Ionicons name="fitness" size={16} color="#37474F" />
                      <Text style={ms.treatmentRowLabel}>Implant Type: </Text>
                      <Text style={ms.treatmentRowValue}>
                        {String(result.narrow_ridge_evaluation.recommendation.implant_type).replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                      </Text>
                    </View>
                  )}

                  {/* Treatment Protocols */}
                  {result.narrow_ridge_evaluation.recommendation?.protocols?.length > 0 && (
                    <View style={ms.treatmentSection}>
                      <Text style={ms.treatmentSectionTitle}>Treatment Protocols</Text>
                      {result.narrow_ridge_evaluation.recommendation.protocols.map((p: string, i: number) => (
                        <View key={i} style={ms.treatmentProtocolItem}>
                          <View style={ms.treatmentProtocolDot} />
                          <Text style={ms.treatmentProtocolItemText}>{p.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Bone Density Drilling Protocol */}
                  {result.narrow_ridge_evaluation.recommendation?.drilling_protocol_label && (
                    <View style={ms.treatmentRow}>
                      <Ionicons name="construct" size={16} color="#37474F" />
                      <Text style={ms.treatmentRowLabel}>Drilling: </Text>
                      <Text style={ms.treatmentRowValue}>{result.narrow_ridge_evaluation.recommendation.drilling_protocol_label}</Text>
                    </View>
                  )}

                  {/* Clinical Recommendation */}
                  {result.narrow_ridge_evaluation.recommendation?.label && (
                    <View style={ms.treatmentRecommendBox}>
                      <Ionicons name="bulb" size={16} color="#1565C0" />
                      <Text style={ms.treatmentRecommendText}>{result.narrow_ridge_evaluation.recommendation.label}</Text>
                    </View>
                  )}

                  {/* Warnings */}
                  {result.narrow_ridge_evaluation.warnings?.length > 0 && (
                    <View style={ms.treatmentWarnings}>
                      {result.narrow_ridge_evaluation.warnings.map((w: any, i: number) => (
                        <View key={i} style={[ms.treatmentWarningRow, {
                          borderLeftColor: w.severity === 'critical' ? '#B71C1C' : w.severity === 'high' ? '#E65100' : '#FF9800',
                        }]}>
                          <Ionicons
                            name={w.severity === 'critical' ? 'close-circle' : 'alert-circle'}
                            size={14}
                            color={w.severity === 'critical' ? '#B71C1C' : w.severity === 'high' ? '#E65100' : '#FF9800'}
                          />
                          <Text style={ms.treatmentWarningText}>{w.message}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* No narrow options warning (Let Me Choose only) */}
              {mode === 'choose' && result.narrow_ridge_warning && (
                <View style={ms.narrowNoOptionsWarning} data-testid="no-narrow-options-warning">
                  <Ionicons name="warning" size={18} color="#E65100" />
                  <Text style={ms.narrowNoOptionsText}>{result.narrow_ridge_warning}</Text>
                </View>
              )}

              {/* ── BLOCKED: Severe narrow ridge (both modes) ── */}
              {(result.narrow_ridge_blocked || result.narrow_ridge_evaluation?.blocked) ? (
                <View>
                  <View style={ms.blockedCard} data-testid="narrow-ridge-blocked">
                    <Ionicons name="ban" size={40} color="#B71C1C" />
                    <Text style={ms.blockedTitle}>Implant Placement Blocked</Text>
                    <Text style={ms.blockedText}>
                      Ridge width ({result.narrow_ridge_evaluation?.ridge_width_mm}mm) is insufficient for any implant.
                      Bone augmentation (GBR or block graft) is required before implant placement.
                    </Text>
                  </View>
                  <View style={ms.navRow}>
                    <TouchableOpacity style={ms.backBtn} onPress={() => setStep(2)}>
                      <Ionicons name="arrow-back" size={20} color="#666" />
                      <Text style={ms.backBtnText}>Back</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
              <>
              {(() => {
                // Determine implant list based on mode and narrow ridge state
                let implants: any[];
                const hasNarrowRidge = result.narrow_ridge_evaluation && result.narrow_ridge_evaluation.classification !== 'adequate';
                if (mode === 'choose') {
                  // In narrow ridge: prefer narrow_options, fall back to recommended
                  if (hasNarrowRidge && result.narrow_options?.length > 0) {
                    implants = result.narrow_options;
                  } else {
                    implants = result.recommended?.length ? result.recommended : result.all_options || [];
                  }
                } else {
                  implants = (result.recommended_systems || []).flatMap((s: any) => (s.implants || []).map((imp: any) => ({
                    ...imp, brand: s.brand, system: s.system,
                    indication: s.indication, procedure_match: s.procedure_match,
                    priority: s.priority, priority_label: s.priority_label,
                  })));
                }
                if (implants.length === 0) return <Text style={ms.noResults}>No implants found for these measurements.</Text>;
                const isRestrictedResult = result.restricted_bone_height === true;
                const isNarrowResult = hasNarrowRidge && mode === 'choose' && result.narrow_options?.length > 0;
                const topMatches = implants.slice(0, 3);
                // In "choose" mode, "Show More" reveals all system options beyond top 3
                const allSystemOptions = mode === 'choose' ? (result.all_options || []) : implants;
                const remainingAll = allSystemOptions.filter((opt: any) =>
                  !topMatches.some((t: any) => t.diameter === opt.diameter && t.length === opt.length)
                );
                const remaining = mode === 'choose' ? remainingAll : implants.slice(3);
                const displayed = showAllResults ? [...topMatches, ...remaining] : topMatches;
                return (
                  <>
                    {isRestrictedResult && (
                      <View style={ms.restrictedBanner} data-testid="restricted-height-banner">
                        <Ionicons name="alert-circle" size={18} color="#E65100" />
                        <Text style={ms.restrictedBannerText}>Restricted Bone Height ({result.clinical_guidance?.bone_height}mm): Showing priority-based recommendations.</Text>
                      </View>
                    )}
                    {result.restricted_height_warning && (
                      <View style={ms.cautionBanner} data-testid="restricted-d3d4-warning">
                        <Ionicons name="warning" size={18} color="#B71C1C" />
                        <Text style={ms.cautionBannerText}>{result.restricted_height_warning}</Text>
                      </View>
                    )}
                    <Text style={ms.matchHeader}>
                      {isRestrictedResult ? `Priority-Based Recommendations (${implants.length})` : isNarrowResult ? `Narrow Diameter Options (${implants.length})` : `Top ${Math.min(3, implants.length)} Best Matches`}
                    </Text>
                    {displayed.map((imp: any, i: number) => {
                      const isSelected = selectedImplant?.diameter === imp.diameter && selectedImplant?.length === imp.length && selectedImplant?.brand === imp.brand;
                      return (
                        <TouchableOpacity key={i} style={[ms.implantOption, isSelected && ms.implantOptionSelected]}
                          onPress={() => { setSelectedImplant({ diameter: imp.diameter, length: imp.length, brand: imp.brand || selectedSystem?.brand || '', system: imp.system || selectedSystem?.system || '' }); setShowProtocol(false); }}
                          data-testid={`result-implant-${i}`}>
                          <Ionicons name={isSelected ? 'radio-button-on' : 'radio-button-off'} size={22} color={isSelected ? '#1E88E5' : '#CCC'} />
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                              <Text style={ms.implantName}>{imp.brand || selectedSystem?.brand} - {imp.system || selectedSystem?.system}</Text>
                              {imp.procedure_match && <View style={ms.matchBadge}><Text style={ms.matchBadgeText}>Indicated</Text></View>}
                            </View>
                            <Text style={ms.implantSpec}>D: {imp.diameter}mm | L: {imp.length}mm</Text>
                            {imp.indication ? <Text style={ms.ddItemIndication}>{imp.indication}</Text> : null}
                          </View>
                          {imp.priority === 1 && <View style={[ms.bestBadge, { backgroundColor: '#E8F5E9' }]}><Text style={[ms.bestBadgeText, { color: '#2E7D32' }]}>P1</Text></View>}
                          {imp.priority === 2 && <View style={[ms.bestBadge, { backgroundColor: '#FFF3E0' }]}><Text style={[ms.bestBadgeText, { color: '#E65100' }]}>P2</Text></View>}
                          {!imp.priority && i === 0 && <View style={ms.bestBadge}><Text style={ms.bestBadgeText}>Best</Text></View>}
                          {!imp.priority && i === 1 && <View style={[ms.bestBadge, { backgroundColor: '#E3F2FD' }]}><Text style={[ms.bestBadgeText, { color: '#1565C0' }]}>2nd</Text></View>}
                          {!imp.priority && i === 2 && <View style={[ms.bestBadge, { backgroundColor: '#FFF3E0' }]}><Text style={[ms.bestBadgeText, { color: '#E65100' }]}>3rd</Text></View>}
                        </TouchableOpacity>
                      );
                    })}
                    {remaining.length > 0 && !showAllResults && (
                      <TouchableOpacity style={ms.showMoreBtn} onPress={() => setShowAllResults(true)} data-testid="show-more-implants">
                        <Ionicons name="chevron-down-circle-outline" size={20} color="#1A73E8" />
                        <Text style={ms.showMoreText}>Show {remaining.length} more option{remaining.length > 1 ? 's' : ''}</Text>
                      </TouchableOpacity>
                    )}
                    {showAllResults && remaining.length > 0 && (
                      <TouchableOpacity style={ms.showMoreBtn} onPress={() => setShowAllResults(false)}>
                        <Ionicons name="chevron-up-circle-outline" size={20} color="#1A73E8" />
                        <Text style={ms.showMoreText}>Show less</Text>
                      </TouchableOpacity>
                    )}
                  </>
                );
              })()}

              {/* Drilling Protocol Preview (when implant selected) */}
              {selectedImplant && (
                <View style={ms.protocolPreviewCard} data-testid="drilling-protocol-preview">
                  <TouchableOpacity
                    style={ms.protocolPreviewHeader}
                    onPress={() => setShowProtocol(!showProtocol)}
                    data-testid="toggle-drilling-protocol"
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="construct" size={20} color="#1565C0" />
                      <Text style={ms.protocolPreviewTitle}>Drilling Protocol</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={ms.protocolPreviewSub}>{selectedImplant.brand} {selectedImplant.system} — {selectedImplant.diameter}x{selectedImplant.length}mm</Text>
                      <Ionicons name={showProtocol ? 'chevron-up' : 'chevron-down'} size={20} color="#1565C0" />
                    </View>
                  </TouchableOpacity>
                  {showProtocol && (
                    <View style={ms.protocolPreviewBody}>
                      <Text style={ms.protocolPreviewBone}>Bone Type: {boneType || 'D2'} ({(boneType === 'D1' || boneType === 'D2') ? 'Dense' : 'Soft'} bone)</Text>
                      {generateDrillingProtocol(selectedImplant.brand, selectedImplant.system, selectedImplant.diameter, boneType || 'D2', selectedImplant.length).map((p, idx) => (
                        p.step === 0 ? (
                          <View key={`kit-${idx}`} style={ms.kitSeparator}>
                            <Text style={ms.kitSeparatorText}>{p.drill}</Text>
                          </View>
                        ) : (
                          <View key={`step-${idx}`} style={ms.protocolStep}>
                            <View style={ms.protocolStepNum}>
                              <Text style={ms.protocolStepNumText}>{p.step}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={ms.protocolDrill}>{p.drill}</Text>
                              <Text style={ms.protocolDetail}>{p.speed} | Depth: {p.depth}mm</Text>
                              {p.note ? <Text style={ms.protocolNote}>{p.note}</Text> : null}
                            </View>
                          </View>
                        )
                      ))}
                    </View>
                  )}
                </View>
              )}

              <View style={ms.navRow}>
                <TouchableOpacity style={ms.backBtn} onPress={() => setStep(2)}>
                  <Ionicons name="arrow-back" size={20} color="#666" />
                  <Text style={ms.backBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[ms.nextBtn, ms.nextBtnFlex, !selectedImplant && ms.btnDisabled]}
                  disabled={!selectedImplant}
                  onPress={() => setStep(4)}
                  data-testid="step3-next"
                >
                  <Text style={ms.nextBtnText}>Next: Risk Assessment</Text>
                  <Ionicons name="arrow-forward" size={20} color="#FFF" />
                </TouchableOpacity>
              </View>
              </>
              )}
            </View>
          )}

          {/* STEP 4: Risk Assessment & Confirm */}
          {step === 4 && selectedImplant && (
            <View>
              <Text style={ms.stepTitle}>Risk Assessment & Confirm</Text>
              <View style={ms.summaryCard}>
                <Text style={ms.summaryLabel}>Tooth Position</Text>
                <Text style={ms.summaryValue}>{position} {toothInfo ? `(${toothInfo.region})` : ''}</Text>
                <Text style={ms.summaryLabel}>Implant System</Text>
                <Text style={ms.summaryValue}>{selectedImplant.brand} - {selectedImplant.system}</Text>
                <Text style={ms.summaryLabel}>Dimensions</Text>
                <Text style={ms.summaryValue}>D: {selectedImplant.diameter}mm | L: {selectedImplant.length}mm</Text>
                {boneWidth && <><Text style={ms.summaryLabel}>Bone</Text><Text style={ms.summaryValue}>{boneWidth}mm W x {boneHeight}mm H</Text></>}
              </View>

              {!riskResult && (
                <>
                  {!boneType && (
                    <>
                      <Text style={ms.inputLabel}>Bone Type (for risk calculation)</Text>
                      <View style={ms.boneTypeRow}>
                        {BONE_TYPES.map(bt => (
                          <TouchableOpacity key={bt} style={[ms.boneTypeBtn, boneType === bt && ms.boneTypeBtnActive]} onPress={() => setBoneType(bt)}>
                            <Text style={[ms.boneTypeBtnText, boneType === bt && ms.boneTypeBtnTextActive]}>{bt}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}
                  <TouchableOpacity
                    style={[ms.riskBtn, !boneType && ms.btnDisabled]}
                    disabled={!boneType || riskLoading}
                    onPress={handleCalcRisk}
                    data-testid="calc-risk-btn"
                  >
                    {riskLoading ? <ActivityIndicator color="#FFF" size="small" /> : (
                      <>
                        <Ionicons name="shield-checkmark" size={18} color="#FFF" />
                        <Text style={ms.riskBtnText}>Calculate Risk</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {riskResult && (
                <View style={[ms.riskResultBox, {
                  backgroundColor: riskResult.risk_level === 'Low' ? '#E8F5E9' : riskResult.risk_level === 'Moderate' ? '#FFF3E0' : '#FFEBEE',
                  borderColor: riskResult.risk_level === 'Low' ? '#4CAF50' : riskResult.risk_level === 'Moderate' ? '#FF9800' : '#F44336',
                }]}>
                  <Ionicons name={riskResult.risk_level === 'Low' ? 'shield-checkmark' : 'alert-circle'} size={24}
                    color={riskResult.risk_level === 'Low' ? '#4CAF50' : riskResult.risk_level === 'Moderate' ? '#FF9800' : '#F44336'} />
                  <View style={{ flex: 1 }}>
                    <Text style={ms.riskLevel}>{riskResult.risk_level} Risk</Text>
                    <Text style={ms.riskScore}>Score: {riskResult.total_score}/{riskResult.max_score || 18}</Text>
                  </View>
                </View>
              )}
              {riskResult?.medical_warnings?.length > 0 && (
                <View style={{ backgroundColor: '#FFF3E0', borderRadius: 10, padding: 10, marginTop: 8, borderLeftWidth: 3, borderLeftColor: '#FF9800' }}>
                  {riskResult.medical_warnings.map((w: string, i: number) => (
                    <Text key={i} style={{ fontSize: 12, color: '#5D4037', marginBottom: i < riskResult.medical_warnings.length - 1 ? 4 : 0 }}>{'\u26A0'} {w}</Text>
                  ))}
                </View>
              )}
              {riskResult?.suggested_actions?.length > 0 && (
                <View style={{ backgroundColor: '#E3F2FD', borderRadius: 10, padding: 10, marginTop: 8 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#1565C0', marginBottom: 4 }}>Suggested Actions</Text>
                  {riskResult.suggested_actions.map((a: string, i: number) => (
                    <Text key={i} style={{ fontSize: 11, color: '#37474F', marginBottom: 2 }}>{'\u2022'} {a}</Text>
                  ))}
                </View>
              )}

              {/* AI Explain Recommendation */}
              {selectedImplant && riskResult && (
                <View style={{ marginTop: 10 }}>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0D47A1', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, opacity: aiExplaining ? 0.7 : 1 }}
                    onPress={async () => {
                      if (aiExplaining) return;
                      setAiExplaining(true);
                      setAiExplanation('');
                      try {
                        const res = await api.post('/ai/explain-recommendation', { procedure_id: procedureId, implant_index: 0 });
                        setAiExplanation(res.data.explanation);
                      } catch (e: any) {
                        Alert.alert('Error', e.response?.data?.detail || 'Failed to generate explanation');
                      } finally { setAiExplaining(false); }
                    }}
                    disabled={aiExplaining}
                    data-testid="ai-explain-btn"
                  >
                    {aiExplaining ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name="sparkles" size={18} color="#FFF" />}
                    <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>Explain Recommendation</Text>
                  </TouchableOpacity>
                  {aiExplanation ? (
                    <View style={{ marginTop: 10, backgroundColor: '#E8EAF6', borderRadius: 12, padding: 14, borderLeftWidth: 3, borderLeftColor: '#3F51B5' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <Ionicons name="sparkles" size={14} color="#3F51B5" />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#3F51B5' }}>Implanr AI</Text>
                      </View>
                      <Text style={{ fontSize: 12, color: '#37474F', lineHeight: 18 }}>{aiExplanation}</Text>
                    </View>
                  ) : null}
                </View>
              )}

              <View style={ms.navRow}>
                <TouchableOpacity style={ms.backBtn} onPress={() => setStep(3)}>
                  <Ionicons name="arrow-back" size={20} color="#666" />
                  <Text style={ms.backBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[ms.confirmBtn, ms.nextBtnFlex]} onPress={handleConfirm} data-testid="confirm-implant-btn">
                  <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                  <Text style={ms.confirmBtnText}>{editItem ? 'Update' : 'Add'} Implant</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
        )}
        </View>

        {/* System Dropdown Modal */}
        <Modal visible={showSystemDD} animationType="slide" transparent onRequestClose={() => setShowSystemDD(false)}>
          <View style={ms.ddOverlay}>
            <View style={ms.ddModal}>
              <View style={ms.ddHeader}>
                <Text style={ms.ddHeaderTitle}>Select Implant System</Text>
                <TouchableOpacity onPress={() => setShowSystemDD(false)}>
                  <Ionicons name="close" size={24} color="#333" />
                </TouchableOpacity>
              </View>
              <View style={ms.ddSearchRow}>
                <Ionicons name="search" size={18} color="#999" />
                <TextInput style={ms.ddSearchInput} value={systemSearch} onChangeText={setSystemSearch}
                  placeholder="Search brand or system..." autoFocus />
              </View>
              <FlatList
                data={systems.filter(s => {
                  if (!systemSearch.trim()) return true;
                  const q = systemSearch.toLowerCase();
                  return s.brand.toLowerCase().includes(q) || s.system.toLowerCase().includes(q);
                }).sort((a, b) => {
                  // Primary: always alphabetical by brand + system
                  return `${a.brand} ${a.system}`.localeCompare(`${b.brand} ${b.system}`);
                })}
                keyExtractor={(item, i) => `${item.brand}-${item.system}-${i}`}
                renderItem={({ item }) => {
                  const isSel = selectedSystem?.brand === item.brand && selectedSystem?.system === item.system;
                  const isRestricted = item.restricted_teeth && position && !item.restricted_teeth.includes(position);
                  const isToothIndicated = item.indicated_teeth && position && item.indicated_teeth.includes(position);
                  const isProcMatch = procedureType && item.indicated_procedures?.includes(procedureType);
                  return (
                    <TouchableOpacity style={[ms.ddItem, isSel && ms.ddItemSelected, isRestricted && ms.ddItemRestricted]}
                      onPress={() => {
                        if (isRestricted) { Alert.alert('Not Indicated', `This system is not indicated for tooth ${position}.`); return; }
                        setSelectedSystem(item); setShowSystemDD(false);
                      }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                          <Text style={[ms.ddItemTitle, isRestricted && { color: '#999' }]}>{item.brand} - {item.system}</Text>
                          {isProcMatch && <View style={ms.matchBadge}><Text style={ms.matchBadgeText}>Indicated</Text></View>}
                          {isToothIndicated && <View style={ms.toothBadge}><Text style={ms.toothBadgeText}>Tooth {position}</Text></View>}
                          {isRestrictedHeight && RESTRICTED_HEIGHT_P1.includes(`${item.brand}|${item.system}`) && (
                            <View style={ms.restrictedP1Badge}><Text style={ms.restrictedP1BadgeText}>Short Implant</Text></View>
                          )}
                        </View>
                        <Text style={ms.ddItemSub}>{item.count} sizes | D: {item.diameters[0]}-{item.diameters[item.diameters.length-1]}mm</Text>
                        {item.indication ? (
                          <Text style={ms.ddItemIndication}>{item.indication}</Text>
                        ) : null}
                      </View>
                      {isSel && <Ionicons name="checkmark-circle" size={22} color="#1E88E5" />}
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </View>
        </Modal>
      </View>
  );
}

// ── Mini FDI Dental Chart (compact) ────────────────────────
function MiniDentalChart({ selected, disabled, onSelect }: {
  selected: string; disabled: string[]; onSelect: (t: string) => void;
}) {
  const renderRow = (left: string[], right: string[], label: string) => (
    <View style={dc.row}>
      <Text style={dc.label}>{label}</Text>
      <View style={dc.teeth}>
        {left.map(t => {
          const isSel = selected === t;
          const isDis = disabled.includes(t);
          return (
            <TouchableOpacity key={t} style={[dc.tooth, isSel && dc.toothSel, isDis && dc.toothDis]}
              onPress={() => !isDis && onSelect(t)} disabled={isDis}>
              <Text style={[dc.toothNum, isSel && dc.toothNumSel, isDis && dc.toothNumDis]}>{t}</Text>
            </TouchableOpacity>
          );
        })}
        <View style={dc.midline} />
        {right.map(t => {
          const isSel = selected === t;
          const isDis = disabled.includes(t);
          return (
            <TouchableOpacity key={t} style={[dc.tooth, isSel && dc.toothSel, isDis && dc.toothDis]}
              onPress={() => !isDis && onSelect(t)} disabled={isDis}>
              <Text style={[dc.toothNum, isSel && dc.toothNumSel, isDis && dc.toothNumDis]}>{t}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
  return (
    <View style={dc.container}>
      {renderRow(UPPER_RIGHT, UPPER_LEFT, 'Upper')}
      <View style={dc.jawLine} />
      {renderRow(LOWER_RIGHT, LOWER_LEFT, 'Lower')}
    </View>
  );
}

const dc = StyleSheet.create({
  container: { backgroundColor: '#F8F9FA', borderRadius: 12, padding: 12, marginVertical: 8 },
  row: { marginVertical: 4 },
  label: { fontSize: 11, color: '#888', fontWeight: '600', marginBottom: 4 },
  teeth: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  midline: { width: 2, height: 24, backgroundColor: '#DDD', marginHorizontal: 4 },
  jawLine: { height: 2, backgroundColor: '#DDD', marginVertical: 4 },
  tooth: { width: 28, height: 28, borderRadius: 6, backgroundColor: '#E8EDF2', alignItems: 'center', justifyContent: 'center', marginHorizontal: 1, borderWidth: 1, borderColor: '#C5CDD5' },
  toothSel: { backgroundColor: '#1E88E5', borderColor: '#1565C0' },
  toothDis: { backgroundColor: '#FFCDD2', borderColor: '#EF9A9A' },
  toothNum: { fontSize: 9, fontWeight: '700', color: '#37474F' },
  toothNumSel: { color: '#FFF' },
  toothNumDis: { color: '#E57373' },
});

// ── Styles ─────────────────────────────────────────────────
const st = StyleSheet.create({
  container: { marginBottom: 12 },
  loadingBox: { backgroundColor: '#FFF', padding: 20, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  loadingText: { fontSize: 14, color: '#666' },
  header: { backgroundColor: '#FFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  badge: { backgroundColor: '#1E88E5', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  implantCard: { backgroundColor: '#FFF', marginTop: 1, padding: 14 },
  implantCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  positionBadge: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E3F2FD', alignItems: 'center', justifyContent: 'center' },
  positionText: { fontSize: 14, fontWeight: '700', color: '#1565C0' },
  implantInfo: { flex: 1 },
  implantTitle: { fontSize: 14, fontWeight: '600', color: '#333' },
  implantSpecs: { fontSize: 12, color: '#888', marginTop: 2 },
  riskBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  riskBadgeText: { fontSize: 11, fontWeight: '700' },
  implantDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, paddingLeft: 48 },
  detailText: { fontSize: 11, color: '#888', backgroundColor: '#F5F5F5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  torqueRow: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFF3E0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  torqueText: { fontSize: 11, color: '#BF360C', fontWeight: '500' },
  torqueValue: { fontSize: 13, fontWeight: '700', color: '#E65100' },
  implantActions: { flexDirection: 'row', gap: 12, marginTop: 10, paddingLeft: 48 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editBtnText: { fontSize: 12, color: '#1E88E5', fontWeight: '600' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deleteBtnText: { fontSize: 12, color: '#F44336', fontWeight: '600' },
  protocolBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E8EAF6', borderRadius: 6, padding: 6, paddingHorizontal: 10 },
  protocolBtnText: { fontSize: 12, color: '#5C6BC0', fontWeight: '600' },
  inlineProtocol: { marginTop: 10, backgroundColor: '#F5F7FF', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#E0E4F2' },
  inlineProtocolHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  inlineProtocolTitle: { fontSize: 13, fontWeight: '600', color: '#1565C0', flex: 1 },
  protocolStepRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  protocolStepBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#1565C0', alignItems: 'center', justifyContent: 'center' },
  protocolStepBadgeText: { fontSize: 11, color: '#FFF', fontWeight: '700' },
  protocolDrillText: { fontSize: 13, fontWeight: '600', color: '#333' },
  kitSeparator: { backgroundColor: '#E3F2FD', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 10, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: '#1565C0' },
  kitSeparatorText: { fontSize: 13, fontWeight: '700', color: '#1565C0' },
  protocolMetaText: { fontSize: 11, color: '#888' },
  emptyState: { backgroundColor: '#FFF', padding: 30, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 15, fontWeight: '600', color: '#999' },
  emptySubtext: { fontSize: 12, color: '#BBB' },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 12, borderWidth: 2, borderColor: '#1E88E5', borderStyle: 'dashed' },
  addButtonText: { fontSize: 14, fontWeight: '600', color: '#1E88E5' },
});

const ms = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  closeBtn: { padding: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  stepIndicator: { fontSize: 14, color: '#888', fontWeight: '600' },
  scroll: { padding: 16 },
  stepTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 16 },
  recBox: { backgroundColor: '#E3F2FD', borderRadius: 10, padding: 12, marginTop: 10 },
  recTitle: { fontSize: 14, fontWeight: '600', color: '#1565C0' },
  recText: { fontSize: 12, color: '#1976D2', marginTop: 4 },
  nextBtn: { backgroundColor: '#1E88E5', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20 },
  nextBtnFlex: { flex: 1 },
  nextBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: 10, backgroundColor: '#F0F0F0' },
  modeBtnActive: { backgroundColor: '#1E88E5' },
  modeBtnText: { fontSize: 14, fontWeight: '600', color: '#666' },
  modeBtnTextActive: { color: '#FFF' },
  dropdown: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#DDD', borderRadius: 10, padding: 14, backgroundColor: '#FFF', marginBottom: 12 },
  ddText: { fontSize: 15, color: '#333', flex: 1 },
  ddPlaceholder: { fontSize: 15, color: '#999', flex: 1 },
  systemOptionsBox: { backgroundColor: '#F0F8FF', borderWidth: 1, borderColor: '#B3D4FC', borderRadius: 10, padding: 12, marginBottom: 12 },
  systemOptionsTitle: { fontSize: 13, fontWeight: '700', color: '#1565C0', marginBottom: 8 },
  systemOptionsGrid: { flexDirection: 'row', gap: 12 },
  systemOptionsCol: { flex: 1 },
  systemOptionsLabel: { fontSize: 11, fontWeight: '600', color: '#666', marginBottom: 4 },
  systemOptionsValues: { fontSize: 13, color: '#333', fontWeight: '500' },
  systemOptionsCount: { fontSize: 11, color: '#888', marginTop: 8, fontStyle: 'italic' },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#444', marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 10, padding: 12, fontSize: 16, backgroundColor: '#FFF' },
  procChip: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, marginBottom: 4, backgroundColor: '#F8F8F8' },
  procChipActive: { backgroundColor: '#E3F2FD' },
  procChipText: { fontSize: 13, color: '#666' },
  procChipTextActive: { color: '#1565C0', fontWeight: '600' },
  boneTypeRow: { flexDirection: 'row', gap: 8 },
  boneTypeBtn: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#DDD', backgroundColor: '#FFF' },
  boneTypeBtnActive: { borderColor: '#1E88E5', backgroundColor: '#E3F2FD' },
  boneTypeBtnText: { fontSize: 14, fontWeight: '700', color: '#666' },
  boneTypeBtnTextActive: { color: '#1E88E5' },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 12 },
  backBtnText: { fontSize: 14, color: '#666', fontWeight: '600' },
  noResults: { fontSize: 14, color: '#999', textAlign: 'center', padding: 20 },
  implantOption: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#E0E0E0', backgroundColor: '#FFF', marginBottom: 8 },
  implantOptionSelected: { borderColor: '#1E88E5', backgroundColor: '#F0F8FF' },
  implantName: { fontSize: 14, fontWeight: '600', color: '#333' },
  implantSpec: { fontSize: 12, color: '#888', marginTop: 2 },
  matchHeader: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 10, marginTop: 4 },
  showMoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginTop: 4, borderRadius: 8, backgroundColor: '#F0F7FF' },
  showMoreText: { fontSize: 14, fontWeight: '600', color: '#1A73E8' },
  bestBadge: { backgroundColor: '#E8F5E9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  bestBadgeText: { fontSize: 10, fontWeight: '700', color: '#4CAF50' },
  summaryCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginBottom: 16 },
  summaryLabel: { fontSize: 12, color: '#888', fontWeight: '600', marginTop: 8 },
  summaryValue: { fontSize: 15, fontWeight: '600', color: '#333', marginTop: 2 },
  riskBtn: { backgroundColor: '#5C6BC0', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 },
  riskBtnText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  riskResultBox: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1.5, padding: 14, marginTop: 12 },
  riskLevel: { fontSize: 16, fontWeight: '700' },
  riskScore: { fontSize: 12, color: '#666', marginTop: 2 },
  confirmBtn: { backgroundColor: '#4CAF50', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  confirmBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  ddOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  ddModal: { backgroundColor: '#FFF', borderRadius: 16, maxHeight: '80%', overflow: 'hidden' },
  ddHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  ddHeaderTitle: { fontSize: 18, fontWeight: '600' },
  ddSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  ddSearchInput: { flex: 1, fontSize: 15, padding: 8 },
  ddItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  ddItemSelected: { backgroundColor: '#F0F8FF' },
  ddItemRestricted: { opacity: 0.4 },
  ddItemTitle: { fontSize: 14, fontWeight: '600', color: '#333' },
  ddItemSub: { fontSize: 11, color: '#888', marginTop: 2 },
  ddItemIndication: { fontSize: 11, color: '#1565C0', marginTop: 4, fontStyle: 'italic', lineHeight: 15 },
  matchBadge: { backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: '#66BB6A' },
  matchBadgeText: { fontSize: 10, fontWeight: '700', color: '#2E7D32' },
  toothBadge: { backgroundColor: '#FFF3E0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: '#FFB74D' },
  toothBadgeText: { fontSize: 10, fontWeight: '700', color: '#E65100' },
  indicationBanner: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#E3F2FD', borderRadius: 8, padding: 10, marginTop: 8, marginBottom: 4, gap: 8 },
  indicationBannerText: { flex: 1, fontSize: 13, color: '#1565C0', fontWeight: '500', lineHeight: 18 },
  restrictedBanner: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFF3E0', borderRadius: 10, padding: 12, marginBottom: 12, gap: 8, borderWidth: 1, borderColor: '#FFB74D' },
  restrictedBannerText: { flex: 1, fontSize: 12, color: '#E65100', fontWeight: '500', lineHeight: 17 },
  cautionBanner: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFEBEE', borderRadius: 10, padding: 12, marginBottom: 12, gap: 8, borderWidth: 1, borderColor: '#EF9A9A' },
  cautionBannerText: { flex: 1, fontSize: 12, color: '#B71C1C', fontWeight: '500', lineHeight: 17 },
  restrictedP1Badge: { backgroundColor: '#FFF3E0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: '#FFB74D' },
  restrictedP1BadgeText: { fontSize: 10, fontWeight: '700', color: '#E65100' },
  // Narrow Ridge & Treatment Protocol styles
  narrowRidgeBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, padding: 12, marginTop: 10, borderWidth: 1 },
  narrowRidgeLabel: { fontSize: 13, fontWeight: '700' },
  narrowRidgeSubtext: { fontSize: 11, color: '#666', marginTop: 2 },
  // Treatment Protocol Display (Step 3)
  treatmentProtocolCard: { borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1.5, backgroundColor: '#FFF' },
  treatmentProtocolHeader: { marginBottom: 10 },
  treatmentProtocolBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, alignSelf: 'flex-start' },
  treatmentProtocolBadgeText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  treatmentClassRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 8, padding: 10, marginBottom: 10 },
  treatmentClassLabel: { fontSize: 14, fontWeight: '700' },
  treatmentClassSub: { fontSize: 12, color: '#666', marginTop: 1 },
  treatmentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 4 },
  treatmentRowLabel: { fontSize: 13, fontWeight: '600', color: '#37474F' },
  treatmentRowValue: { fontSize: 13, color: '#455A64', flex: 1 },
  treatmentSection: { marginTop: 6, paddingLeft: 4, marginBottom: 6 },
  treatmentSectionTitle: { fontSize: 13, fontWeight: '700', color: '#37474F', marginBottom: 6 },
  treatmentProtocolItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  treatmentProtocolDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#1565C0' },
  treatmentProtocolItemText: { fontSize: 13, color: '#455A64' },
  treatmentRecommendBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#E3F2FD', borderRadius: 8, padding: 10, marginTop: 8 },
  treatmentRecommendText: { flex: 1, fontSize: 12, color: '#1565C0', fontWeight: '600', lineHeight: 17 },
  treatmentWarnings: { marginTop: 8 },
  treatmentWarningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#FFF8E1', borderRadius: 6, padding: 8, marginBottom: 4, borderLeftWidth: 3 },
  treatmentWarningText: { flex: 1, fontSize: 11, color: '#37474F', lineHeight: 16 },
  narrowNoOptionsWarning: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF3E0', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#FFB74D' },
  narrowNoOptionsText: { flex: 1, fontSize: 12, color: '#E65100', fontWeight: '600', lineHeight: 17 },
  blockedCard: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFEBEE', borderRadius: 16, padding: 30, marginVertical: 20, borderWidth: 1.5, borderColor: '#EF9A9A', gap: 12 },
  blockedTitle: { fontSize: 18, fontWeight: '700', color: '#B71C1C' },
  blockedText: { fontSize: 14, color: '#5D4037', textAlign: 'center', lineHeight: 20 },
  // High Constraint Mode styles
  highConstraintCard: { borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 2, backgroundColor: '#FFF' },
  highConstraintBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, alignSelf: 'flex-start', marginBottom: 10 },
  highConstraintBadgeText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  highConstraintRegion: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, backgroundColor: '#F5F5F5', borderRadius: 8, padding: 8 },
  highConstraintRegionText: { fontSize: 13, fontWeight: '600', color: '#37474F' },
  highConstraintOptions: { marginBottom: 8 },
  highConstraintOption: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  highConstraintOptionLabel: { fontSize: 12, fontWeight: '700', color: '#455A64', width: 80 },
  highConstraintOptionValue: { fontSize: 13, color: '#37474F', flex: 1 },
  highConstraintRecItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3, paddingLeft: 4 },
  highConstraintRecDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#1565C0' },
  highConstraintRecText: { fontSize: 13, color: '#455A64' },
  highConstraintWarnRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#FFF8E1', borderRadius: 6, padding: 8, marginTop: 4, borderLeftWidth: 3 },
  highConstraintWarnText: { flex: 1, fontSize: 11, color: '#37474F', lineHeight: 16 },
  // Drilling Protocol styles
  protocolBox: { backgroundColor: '#F5F9FE', borderRadius: 12, borderWidth: 1, borderColor: '#BBDEFB', padding: 14, marginBottom: 12, marginTop: 4 },
  protocolHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  protocolTitle: { fontSize: 14, fontWeight: '700', color: '#1565C0' },
  protocolSubtitle: { fontSize: 11, color: '#666', marginBottom: 8 },
  protocolDiameterLabel: { fontSize: 12, fontWeight: '600', color: '#444', marginBottom: 8, backgroundColor: '#E3F2FD', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start', overflow: 'hidden' },
  protocolStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  protocolStepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#1E88E5', alignItems: 'center', justifyContent: 'center' },
  protocolStepNumText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  protocolDrill: { fontSize: 13, fontWeight: '600', color: '#333' },
  protocolDetail: { fontSize: 11, color: '#666', marginTop: 1 },
  protocolNote: { fontSize: 11, color: '#888', fontStyle: 'italic', marginTop: 2 },
  kitSeparator: { backgroundColor: '#E3F2FD', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 10, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: '#1565C0' },
  kitSeparatorText: { fontSize: 13, fontWeight: '700', color: '#1565C0' },
  protocolPreviewCard: { backgroundColor: '#F5F9FF', borderRadius: 12, borderWidth: 1, borderColor: '#BBDEFB', marginTop: 16, marginBottom: 8, overflow: 'hidden' },
  protocolPreviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, flexWrap: 'wrap', gap: 4 },
  protocolPreviewTitle: { fontSize: 15, fontWeight: '700', color: '#1565C0' },
  protocolPreviewSub: { fontSize: 11, color: '#666', fontWeight: '500' },
  protocolPreviewBody: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: '#E3F2FD', paddingTop: 10 },
  protocolPreviewBone: { fontSize: 12, fontWeight: '600', color: '#555', marginBottom: 10, backgroundColor: '#E8EAF6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' },
});
