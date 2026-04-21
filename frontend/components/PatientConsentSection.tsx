import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import api from '../utils/api';
import { showUploadPicker } from '../utils/uploadPicker';
import { downloadConsentTemplate, printConsentTemplate } from '../utils/consentPdf';
import ExportPrintMenu from './ExportPrintMenu';

type PendingCase = {
  id: string;
  patient_name: string;
  patient_id: string;
  student_name: string;
  implant_procedure_type: string;
  status: string;
  created_at: string;
  procedure_date?: string;
  procedure_time?: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending_phase1: 'Awaiting Phase 1 Approval',
  phase1_approved: 'Phase 1 Approved · Phase 2 Locked',
  pending_phase2: 'Awaiting Phase 2 Approval',
  phase2_approved: 'Phase 2 Approved',
  pending_stage2_surgical: 'Awaiting Stage 2 Surgical',
  stage2_surgical_approved: 'Stage 2 Surgical Approved',
  pending_stage2_prosthetic: 'Awaiting Prosthetic',
  phase2_submitted: 'Phase 2 Submitted',
};

export function PatientConsentSection({ router }: { router: any }) {
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<PendingCase[]>([]);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/procedures/nurse/pending-consents');
      setCases(res.data.cases || []);
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (id: string) => {
    try {
      const picked = await showUploadPicker(['application/pdf', 'image/png', 'image/jpeg', 'image/heic', 'image/heif']);
      if (!picked) return;
      setUploadingId(id);
      const payload = new FormData();
      payload.append('file', {
        uri: picked.uri,
        name: picked.name || 'consent_form.pdf',
        type: picked.type || 'application/pdf',
      } as any);
      await api.post(`/procedures/${id}/upload-consent`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      // Remove from list on success
      setCases(prev => prev.filter(c => c.id !== id));
      Alert.alert('Uploaded', 'Patient consent form uploaded. Phase 2 is now unlocked for this case.');
    } catch (err: any) {
      Alert.alert('Upload Failed', err.response?.data?.detail || 'Could not upload consent form');
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <View style={styles.section} data-testid="patient-consent-section">
      <View style={styles.header}>
        <Ionicons name="document-text" size={16} color="#1565C0" />
        <Text style={styles.title}>Patient Consent Forms</Text>
        {cases.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{cases.length}</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={load} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} data-testid="consent-refresh">
          <Ionicons name="refresh" size={16} color="#78909C" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.emptyCard}>
          <ActivityIndicator size="small" color="#1565C0" />
        </View>
      ) : cases.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="checkmark-circle" size={32} color="#81C784" />
          <Text style={styles.emptyText}>All caught up</Text>
          <Text style={styles.emptySubtext}>No cases are waiting for a consent form.</Text>
        </View>
      ) : (
        (() => {
          const visible = showAll ? cases : cases.slice(0, 5);
          return (
            <>
              {visible.map((c) => (
          <View key={c.id} style={styles.card} data-testid={`consent-card-${c.id}`}>
            <TouchableOpacity
              style={styles.cardHeader}
              onPress={() => router.push(`/procedures/${c.id}`)}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.patientName} numberOfLines={1}>{c.patient_name || 'Patient'}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {c.implant_procedure_type}  ·  {c.student_name}
                </Text>
                <Text style={styles.statusText} numberOfLines={1}>
                  {STATUS_LABELS[c.status] || c.status}
                </Text>
                {(c.procedure_date || c.procedure_time) ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Ionicons name="calendar-outline" size={12} color="#1565C0" />
                    <Text style={styles.scheduleText} numberOfLines={1}>
                      {c.procedure_date ? format(new Date(c.procedure_date), 'EEE, MMM dd') : ''}
                      {c.procedure_date && c.procedure_time ? '  ·  ' : ''}
                      {c.procedure_time ? formatTimeSlot(c.procedure_time) : ''}
                    </Text>
                  </View>
                ) : null}
                {c.created_at ? (
                  <Text style={styles.dateText}>Created {format(new Date(c.created_at), 'MMM dd, hh:mm a')}</Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color="#B0BEC5" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleUpload(c.id)}
              disabled={uploadingId === c.id}
              style={[styles.uploadBtn, uploadingId === c.id && { backgroundColor: '#90CAF9' }]}
              data-testid={`consent-upload-${c.id}`}
            >
              {uploadingId === c.id ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={16} color="#FFF" />
                  <Text style={styles.uploadBtnText}>Upload consent form</Text>
                </>
              )}
            </TouchableOpacity>
            <View style={{ marginTop: 6 }}>
              <ExportPrintMenu
                label="Export / Print consent"
                buttonStyle={{ backgroundColor: '#37474F', paddingVertical: 10, borderRadius: 8 }}
                textStyle={{ fontSize: 12, color: '#FFF', fontWeight: '700', letterSpacing: 0.2 }}
                triggerIcon="share-outline"
                triggerIconSize={14}
                testID={`consent-export-print-${c.id}`}
                printTestID={`consent-print-${c.id}`}
                exportTestID={`consent-download-${c.id}`}
                popoverTitle="Patient Consent Form"
                printLabel="Print consent form"
                exportLabel="Download PDF"
                onPrint={() => printConsentTemplate(c.id)}
                onExport={() => downloadConsentTemplate(c.id)}
              />
            </View>
          </View>
              ))}
              {cases.length > 5 && (
                <TouchableOpacity
                  onPress={() => setShowAll(!showAll)}
                  style={styles.showMoreBtn}
                  data-testid="consent-show-more-btn"
                >
                  <Ionicons
                    name={showAll ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color="#1565C0"
                  />
                  <Text style={styles.showMoreText}>
                    {showAll ? 'Show less' : `Show more (${cases.length - 5})`}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          );
        })()
      )}
    </View>
  );
}

/** Format "10:00" → "10:00 AM", "14:00" → "2:00 PM", pass through "10:00 AM" unchanged. */
function formatTimeSlot(t: string): string {
  if (!t) return '';
  if (/am|pm/i.test(t)) return t.toUpperCase().replace(/\s+/g, ' ');
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return t;
  const h = parseInt(m[1], 10);
  const mm = m[2];
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mm} ${suffix}`;
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, marginTop: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '700', color: '#37474F' },
  countBadge: {
    backgroundColor: '#E53935',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 4,
  },
  countBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFF' },
  emptyCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 4,
  },
  emptyText: { fontSize: 14, fontWeight: '700', color: '#455A64', marginTop: 4 },
  emptySubtext: { fontSize: 12, color: '#78909C', textAlign: 'center' },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    borderLeftWidth: 3,
    borderLeftColor: '#FB8C00',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  patientName: { fontSize: 14, fontWeight: '700', color: '#0D47A1' },
  meta: { fontSize: 12, color: '#546E7A', marginTop: 2 },
  statusText: { fontSize: 11, color: '#FB8C00', fontWeight: '600', marginTop: 2 },
  dateText: { fontSize: 10, color: '#90A4AE', marginTop: 2 },
  scheduleText: { fontSize: 11, color: '#1565C0', fontWeight: '600' },
  showMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    marginTop: 2,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
  },
  showMoreText: { fontSize: 12, fontWeight: '700', color: '#1565C0' },
  uploadBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1565C0',
    paddingVertical: 10,
    borderRadius: 8,
  },
  uploadBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  printBtn: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ECEFF1',
    paddingVertical: 8,
    borderRadius: 8,
  },
  printBtnText: { color: '#37474F', fontSize: 12, fontWeight: '600' },
});
