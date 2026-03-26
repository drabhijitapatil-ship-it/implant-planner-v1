import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar } from 'react-native-calendars';
import { format } from 'date-fns';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { STATUS_COLORS, STATUS_LABELS } from '../../constants/checklist';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function DashboardScreen() {
  const [procedures, setProcedures] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [approvingDraftId, setApprovingDraftId] = useState<string | null>(null);
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [proceduresRes, statsRes] = await Promise.all([
        api.get('/procedures'),
        api.get('/dashboard/stats'),
      ]);
      setProcedures(proceduresRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const draftCases = useMemo(() => {
    if (user?.role !== 'student') return [];
    return procedures.filter((proc: any) => proc.status === 'draft');
  }, [procedures, user]);

  const handleSendForApproval = async (procId: string) => {
    setApprovingDraftId(procId);
    try {
      await api.post(`/procedures/${procId}/request-phase1-approval`);
      Alert.alert('Approval Requested', 'Case sent for Phase 1 approval.');
      loadData();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to request approval';
      Alert.alert('Error', String(msg));
    } finally {
      setApprovingDraftId(null);
    }
  };

  const markedDates = procedures.reduce((acc: any, proc: any) => {
    const date = proc.procedure_date;
    if (!acc[date]) {
      acc[date] = { marked: true, dots: [] };
    }
    acc[date].dots.push({
      key: proc.id,
      color: STATUS_COLORS[proc.status as keyof typeof STATUS_COLORS] || '#999',
    });
    return acc;
  }, {} as Record<string, any>);

  if (selectedDate) {
    markedDates[selectedDate] = {
      ...markedDates[selectedDate],
      selected: true,
      selectedColor: '#007AFF',
    };
  }

  const proceduresForSelectedDate = procedures.filter(
    (proc: any) => proc.procedure_date === selectedDate
  );

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'administrator': return '#9C27B0';
      case 'supervisor': return '#2196F3';
      case 'implant_incharge': return '#FF9800';
      case 'student': return '#4CAF50';
      case 'nurse': return '#E91E63';
      default: return '#757575';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header with Profile Photo */}
        <View style={styles.headerRow} data-testid="dashboard-header">
          <View style={styles.headerTextContainer}>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.userName} data-testid="dashboard-user-name">{user?.name}</Text>
          </View>
          <TouchableOpacity
            style={styles.avatarTouchable}
            onPress={() => router.push('/profile')}
            data-testid="dashboard-profile-avatar"
          >
            {user?.profile_photo ? (
              <Image
                source={{ uri: user.profile_photo }}
                style={styles.avatarImage}
              />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: getRoleColor(user?.role || '') }]}>
                <Text style={styles.avatarInitials}>{getInitials(user?.name || 'U')}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Stats Cards */}

        {/* Stats Cards */}
            <View style={styles.statsContainer}>
              <TouchableOpacity
                style={[styles.statCard, { backgroundColor: '#007AFF' }]}
                onPress={() => router.push('/procedures')}
                data-testid="stat-total"
              >
                <Text style={styles.statNumber}>{stats.total}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statCard, { backgroundColor: '#FFA500' }]}
                onPress={() => router.push({ pathname: '/procedures', params: { filter: 'pending' } })}
                data-testid="stat-pending"
              >
                <Text style={styles.statNumber}>{stats.pending}</Text>
                <Text style={styles.statLabel}>Pending</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statCard, { backgroundColor: '#4CAF50' }]}
                onPress={() => router.push({ pathname: '/procedures', params: { filter: 'completed' } })}
                data-testid="stat-approved"
              >
                <Text style={styles.statNumber}>{stats.approved}</Text>
                <Text style={styles.statLabel}>Approved</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statCard, { backgroundColor: '#F44336' }]}
                onPress={() => router.push({ pathname: '/procedures', params: { filter: 'rejected' } })}
                data-testid="stat-rejected"
              >
                <Text style={styles.statNumber}>{stats.rejected}</Text>
                <Text style={styles.statLabel}>Rejected</Text>
              </TouchableOpacity>
            </View>

            {/* Draft Cases (Students only) */}
            {draftCases.length > 0 && (
              <View style={styles.draftSection} data-testid="draft-cases-section">
                <View style={styles.draftHeader}>
                  <Ionicons name="document-text-outline" size={20} color="#78909C" />
                  <Text style={styles.draftSectionTitle}>Draft Cases ({draftCases.length})</Text>
                </View>
                {draftCases.map((proc: any) => (
                  <TouchableOpacity
                    key={proc.id}
                    style={styles.draftCard}
                    onPress={() => router.push(`/procedures/${proc.id}`)}
                    data-testid={`draft-card-${proc.id}`}
                  >
                    <View style={styles.draftCardBody}>
                      <View style={styles.draftCardInfo}>
                        <Text style={styles.draftPatientName}>{proc.patient_name}</Text>
                        <Text style={styles.draftDetail}>{proc.implant_procedure_type}</Text>
                        <Text style={styles.draftDetail}>
                          Scheduled: {proc.procedure_date} at {proc.procedure_time}
                        </Text>
                      </View>
                      <View style={styles.draftBadge}>
                        <Text style={styles.draftBadgeText}>Draft</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.draftApproveBtn, approvingDraftId === proc.id && { opacity: 0.6 }]}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleSendForApproval(proc.id);
                      }}
                      disabled={approvingDraftId === proc.id}
                      data-testid={`draft-approve-btn-${proc.id}`}
                    >
                      {approvingDraftId === proc.id ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <>
                          <Ionicons name="send" size={14} color="#FFF" />
                          <Text style={styles.draftApproveBtnText}>Send for Approval</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Calendar */}
            <View style={styles.calendarContainer}>
              <Calendar
                current={selectedDate}
                onDayPress={(day: any) => setSelectedDate(day.dateString)}
                markedDates={markedDates}
                markingType={'multi-dot'}
                theme={{
                  todayTextColor: '#007AFF',
                  selectedDayBackgroundColor: '#007AFF',
                  arrowColor: '#007AFF',
                }}
              />
            </View>

            {/* Procedures for selected date */}
            <View style={styles.proceduresSection}>
              <Text style={styles.sectionTitle}>
                Procedures on {format(new Date(selectedDate), 'MMM dd, yyyy')}
              </Text>
              {proceduresForSelectedDate.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No procedures scheduled for this date</Text>
                </View>
              ) : (
                proceduresForSelectedDate.map((proc: any) => (
                  <TouchableOpacity
                    key={proc.id}
                    style={styles.procedureCard}
                    onPress={() => router.push(`/procedures/${proc.id}`)}
                  >
                    <View style={styles.procedureHeader}>
                      <Text style={styles.patientName}>{proc.patient_name}</Text>
                      <View
                        style={[
                          styles.statusBadge,
                          { backgroundColor: STATUS_COLORS[proc.status as keyof typeof STATUS_COLORS] || '#999' },
                        ]}
                      >
                        <Text style={styles.statusText}>
                          {STATUS_LABELS[proc.status as keyof typeof STATUS_LABELS] || proc.status}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.procedureDetail}>Student: {proc.student_name}</Text>
                    <Text style={styles.procedureDetail}>Supervisor: {proc.supervisor_name}</Text>
                    <Text style={styles.procedureDetail}>Time: {proc.procedure_time}</Text>
                    <Text style={styles.procedureDetail}>Site: {proc.implant_site}</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTextContainer: {
    flex: 1,
  },
  greeting: {
    fontSize: 14,
    color: '#888',
    fontWeight: '500',
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginTop: 2,
  },
  avatarTouchable: {
    marginLeft: 16,
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#FFF',
    opacity: 0.9,
  },
  calendarContainer: {
    margin: 16,
    borderRadius: 12,
    backgroundColor: '#FFF',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  proceduresSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  emptyState: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
  },
  procedureCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  procedureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  patientName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  statusText: {
    fontSize: 10,
    color: '#FFF',
    fontWeight: '600',
  },
  procedureDetail: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  draftSection: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  draftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  draftSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#546E7A',
  },
  draftCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#78909C',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  draftCardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  draftCardInfo: {
    flex: 1,
    marginRight: 10,
  },
  draftPatientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 3,
  },
  draftDetail: {
    fontSize: 13,
    color: '#888',
    marginTop: 1,
  },
  draftBadge: {
    backgroundColor: '#ECEFF1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  draftBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#78909C',
  },
  draftApproveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34A853',
    borderRadius: 8,
    paddingVertical: 9,
    gap: 6,
  },
  draftApproveBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
