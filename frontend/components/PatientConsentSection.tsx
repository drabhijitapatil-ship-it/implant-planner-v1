import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import api from '../utils/api';
import { showUploadPicker } from '../utils/uploadPicker';
import { downloadConsentTemplate, printConsentTemplate } from '../utils/consentPdf';

type PendingCase = {
  id: string;
  patient_name: string;
  patient_id: string;
  student_name: string;
  implant_procedure_type: string;
  status: string;
  created_at: string;
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
        cases.map((c) => (
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
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
              <TouchableOpacity
                onPress={() => printConsentTemplate(c.id)}
                style={[styles.printBtn, { flex: 1, backgroundColor: '#37474F' }]}
                data-testid={`consent-print-${c.id}`}
              >
                <Ionicons name="print" size={13} color="#FFF" />
                <Text style={[styles.printBtnText, { color: '#FFF' }]}>Print</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => downloadConsentTemplate(c.id)}
                style={[styles.printBtn, { flex: 1 }]}
                data-testid={`consent-download-${c.id}`}
              >
                <Ionicons name="download-outline" size={13} color="#37474F" />
                <Text style={styles.printBtnText}>Download PDF</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </View>
  );
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
