import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar } from 'react-native-calendars';
import { format } from 'date-fns';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { STATUS_COLORS, STATUS_LABELS } from '../../constants/checklist';
import { useRouter } from 'expo-router';

export default function DashboardScreen() {
  const [procedures, setProcedures] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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

  const markedDates = procedures.reduce((acc: any, proc: any) => {
    const date = proc.procedure_date;
    if (!acc[date]) {
      acc[date] = { marked: true, dots: [] };
    }
    acc[date].dots.push({
      key: proc.id,
      color: STATUS_COLORS[proc.status as keyof typeof STATUS_COLORS],
    });
    return acc;
  }, {});

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
      >
        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={[styles.statCard, { backgroundColor: '#007AFF' }]}>
            <Text style={styles.statNumber}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#FFA500' }]}>
            <Text style={styles.statNumber}>{stats.pending}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#4CAF50' }]}>
            <Text style={styles.statNumber}>{stats.approved}</Text>
            <Text style={styles.statLabel}>Approved</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#F44336' }]}>
            <Text style={styles.statNumber}>{stats.rejected}</Text>
            <Text style={styles.statLabel}>Rejected</Text>
          </View>
        </View>

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
                      { backgroundColor: STATUS_COLORS[proc.status as keyof typeof STATUS_COLORS] },
                    ]}
                  >
                    <Text style={styles.statusText}>
                      {STATUS_LABELS[proc.status as keyof typeof STATUS_LABELS]}
                    </Text>
                  </View>
                </View>
                <Text style={styles.procedureDetail}>Student: {proc.student_name}</Text>
                <Text style={styles.procedureDetail}>Instructor: {proc.instructor_name}</Text>
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
});
