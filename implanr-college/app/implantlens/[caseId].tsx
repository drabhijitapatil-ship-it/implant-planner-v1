import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import BackButton from '../../components/BackButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';
import CasePhotoAlbum from '../../components/CasePhotoAlbum';

export default function ImplantLensCaseDetail() {
  const { caseId } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [procedure, setProcedure] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadCase(); }, [caseId]);

  const loadCase = async () => {
    try {
      const res = await api.get(`/procedures/${caseId}`);
      setProcedure(res.data);
    } catch (err) {
      console.error('Failed to load case:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[st.container, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 60 }} />
      </View>
    );
  }

  if (!procedure) {
    return (
      <View style={[st.container, { paddingTop: insets.top }]}>
        <Text style={{ textAlign: 'center', marginTop: 60, color: '#999' }}>Case not found</Text>
      </View>
    );
  }

  const isOwner = user?.id === procedure.student_id;

  return (
    <View style={[st.container, { paddingTop: insets.top }]} data-testid="implantlens-detail">
      {/* Header */}
      <View style={st.header}>
        <BackButton />
        <View style={{ flex: 1 }}>
          <Text style={st.title} numberOfLines={1}>{procedure.patient_name}</Text>
          <Text style={st.subtitle}>ImplantLens - Case Album</Text>
        </View>
        <TouchableOpacity onPress={() => router.push(`/procedures/${caseId}`)} style={st.detailBtn}>
          <Ionicons name="open-outline" size={18} color="#007AFF" />
          <Text style={st.detailBtnText}>Full Case</Text>
        </TouchableOpacity>
      </View>

      {/* Case Info */}
      <View style={st.infoBar}>
        <View style={st.infoItem}>
          <Ionicons name="person" size={14} color="#666" />
          <Text style={st.infoText}>{procedure.student_name || 'Faculty Case'}</Text>
        </View>
        <View style={st.infoItem}>
          <Ionicons name="medkit" size={14} color="#666" />
          <Text style={st.infoText}>{procedure.implant_procedure_type || '-'}</Text>
        </View>
        <View style={st.infoItem}>
          <Ionicons name="calendar" size={14} color="#666" />
          <Text style={st.infoText}>{procedure.procedure_date || '-'}</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }}>
        <CasePhotoAlbum
          procedureId={caseId as string}
          isOwner={isOwner}
          userRole={user?.role || ''}
          procedureStatus={procedure.status}
        />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', backgroundColor: '#FFF' },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#1A1A2E' },
  subtitle: { fontSize: 11, color: '#007AFF', marginTop: 1 },
  detailBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#E3F2FD', borderRadius: 8 },
  detailBtnText: { fontSize: 12, fontWeight: '600', color: '#007AFF' },
  infoBar: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0', flexWrap: 'wrap' },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoText: { fontSize: 11, color: '#666' },
});
