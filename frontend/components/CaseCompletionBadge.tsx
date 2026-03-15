import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

interface Badge {
  type: string;
  case_id: string;
  student_name: string;
  patient_name: string;
  supervisor_name: string;
  implant_incharge_name: string;
  implant_procedure_type: string;
  number_of_implants: number;
  completed_at: string;
}

interface Props {
  procedureId: string;
  status: string;
}

export default function CaseCompletionBadge({ procedureId, status }: Props) {
  const [badge, setBadge] = useState<Badge | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    if (status === 'completed') loadBadge();
  }, [status, procedureId]);

  const loadBadge = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/procedures/${procedureId}/badge`);
      setBadge(res.data.badge);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const handleDownloadReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const response = await api.post(
        `/procedures/${procedureId}/case-report`,
        {},
        { responseType: 'blob' }
      );
      if (typeof window !== 'undefined' && window.URL) {
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `CaseReport_${badge?.case_id || procedureId}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        Alert.alert('Success', 'Case Report PDF downloaded.');
      } else {
        Alert.alert('Report Generated', 'Download on web for best experience.');
      }
    } catch {
      Alert.alert('Error', 'Failed to generate case report.');
    } finally {
      setReportLoading(false);
    }
  }, [procedureId, badge]);

  // Only show for completed procedures OR when generating report for any case
  if (status !== 'completed') {
    return (
      <View style={st.reportOnlyContainer}>
        <TouchableOpacity
          style={st.reportButton}
          onPress={handleDownloadReport}
          disabled={reportLoading}
          data-testid="download-case-report-btn"
        >
          {reportLoading ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              <Ionicons name="document-text" size={20} color="#FFF" />
              <Text style={st.reportButtonText}>Download Case Report PDF</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={st.loadingBox}>
        <ActivityIndicator size="small" color="#FFD700" />
      </View>
    );
  }

  return (
    <View style={st.container} data-testid="case-completion-badge">
      {/* Completion Badge */}
      {badge && (
        <View style={st.badgeCard}>
          <View style={st.badgeIconCircle}>
            <Ionicons name="ribbon" size={36} color="#FFD700" />
          </View>
          <Text style={st.badgeTitle}>Case Completed</Text>
          <Text style={st.badgeCaseId}>{badge.case_id}</Text>
          <View style={st.badgeDivider} />
          <View style={st.badgeDetails}>
            <View style={st.badgeRow}>
              <Ionicons name="person" size={14} color="#666" />
              <Text style={st.badgeLabel}>Student:</Text>
              <Text style={st.badgeValue}>{badge.student_name}</Text>
            </View>
            <View style={st.badgeRow}>
              <Ionicons name="medkit" size={14} color="#666" />
              <Text style={st.badgeLabel}>Procedure:</Text>
              <Text style={st.badgeValue}>{badge.implant_procedure_type}</Text>
            </View>
            <View style={st.badgeRow}>
              <Ionicons name="medical" size={14} color="#666" />
              <Text style={st.badgeLabel}>Implants:</Text>
              <Text style={st.badgeValue}>{badge.number_of_implants}</Text>
            </View>
            <View style={st.badgeRow}>
              <Ionicons name="calendar" size={14} color="#666" />
              <Text style={st.badgeLabel}>Completed:</Text>
              <Text style={st.badgeValue}>
                {badge.completed_at ? new Date(badge.completed_at).toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'long', year: 'numeric'
                }) : 'N/A'}
              </Text>
            </View>
          </View>
        </View>
      )}

      {!badge && (
        <View style={st.noBadgeBox}>
          <Ionicons name="checkmark-done-circle" size={32} color="#4CAF50" />
          <Text style={st.noBadgeTitle}>Treatment Complete</Text>
          <Text style={st.noBadgeText}>All phases have been approved.</Text>
        </View>
      )}

      {/* Download Report Button */}
      <TouchableOpacity
        style={st.reportButton}
        onPress={handleDownloadReport}
        disabled={reportLoading}
        data-testid="download-case-report-btn"
      >
        {reportLoading ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <>
            <Ionicons name="document-text" size={20} color="#FFF" />
            <Text style={st.reportButtonText}>Download Full Case Report PDF</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  container: { marginBottom: 12 },
  loadingBox: { padding: 20, alignItems: 'center' },
  reportOnlyContainer: { marginBottom: 12, paddingHorizontal: 16 },
  badgeCard: {
    backgroundColor: '#FFFDF0',
    borderWidth: 2,
    borderColor: '#FFD700',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    alignItems: 'center',
  },
  badgeIconCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#FFF8DC',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFD700',
    marginBottom: 8,
  },
  badgeTitle: { fontSize: 18, fontWeight: '700', color: '#B8860B' },
  badgeCaseId: { fontSize: 22, fontWeight: '800', color: '#333', marginTop: 2 },
  badgeDivider: { width: 60, height: 2, backgroundColor: '#FFD700', marginVertical: 12 },
  badgeDetails: { alignSelf: 'stretch' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  badgeLabel: { fontSize: 12, color: '#888', fontWeight: '600', width: 80 },
  badgeValue: { fontSize: 13, color: '#333', fontWeight: '600', flex: 1 },
  noBadgeBox: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 16,
    alignItems: 'center', gap: 6,
  },
  noBadgeTitle: { fontSize: 16, fontWeight: '700', color: '#2E7D32' },
  noBadgeText: { fontSize: 13, color: '#4CAF50' },
  reportButton: {
    backgroundColor: '#1565C0',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 12,
  },
  reportButtonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
