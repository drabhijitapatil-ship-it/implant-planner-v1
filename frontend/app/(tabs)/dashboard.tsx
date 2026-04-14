import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar } from 'react-native-calendars';
import { format } from 'date-fns';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { STATUS_COLORS, STATUS_LABELS } from '../../constants/checklist';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// ── Status helpers ────────────────────────────────────────
const ACTION_NEEDED_MAP: Record<string, { label: string; icon: string; color: string }> = {
  draft: { label: 'Complete and submit for approval', icon: 'create-outline', color: '#78909C' },
  phase1_approved: { label: 'Submit Phase 2 surgical data', icon: 'medkit-outline', color: '#4CAF50' },
  phase2_approved: { label: 'Submit Phase 3 data', icon: 'pulse-outline', color: '#2196F3' },
  stage2_surgical_approved: { label: 'Submit Phase 4 Step 1', icon: 'construct-outline', color: '#8BC34A' },
  stage2_prosthetic_step1_approved: { label: 'Submit Phase 4 Step 2', icon: 'checkmark-done-outline', color: '#00BCD4' },
  rejected: { label: 'Review rejection and revise', icon: 'alert-circle-outline', color: '#F44336' },
  stage2_surgical_rejected: { label: 'Review rejection and revise', icon: 'alert-circle-outline', color: '#F44336' },
  stage2_prosthetic_rejected: { label: 'Review rejection and revise', icon: 'alert-circle-outline', color: '#F44336' },
};

const PENDING_STATUSES = ['pending_phase1', 'pending_phase2', 'pending_stage2_surgical', 'pending_stage2_prosthetic', 'pending_final_delivery'];

function getPhaseFromStatus(status: string): number {
  if (['draft', 'pending_phase1'].includes(status)) return 1;
  if (['phase1_approved', 'pending_phase2'].includes(status)) return 2;
  if (['phase2_approved', 'pending_stage2_surgical'].includes(status)) return 3;
  if (['stage2_surgical_approved', 'pending_stage2_prosthetic', 'stage2_prosthetic_step1_approved', 'pending_final_delivery'].includes(status)) return 4;
  if (status === 'completed') return 5;
  return 0;
}

// ── Shared Components ─────────────────────────────────────
function Header({ user, router }: any) {
  const getRoleColor = (role: string) => {
    switch (role) {
      case 'administrator': return '#5C35A3';
      case 'supervisor': return '#1565C0';
      case 'implant_incharge': return '#E65100';
      case 'student': return '#2E7D32';
      default: return '#546E7A';
    }
  };
  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'student': return 'Postgraduate Student';
      case 'supervisor': return 'Supervisor';
      case 'implant_incharge': return 'Implant In-Charge';
      case 'administrator': return 'Administrator';
      default: return role;
    }
  };

  return (
    <View style={s.header} data-testid="dashboard-header">
      <View style={{ flex: 1 }}>
        <Text style={s.greeting}>Welcome back,</Text>
        <Text style={s.userName} data-testid="dashboard-user-name">{user?.name}</Text>
        <Text style={s.roleTag}>{getRoleLabel(user?.role)}</Text>
      </View>
      <TouchableOpacity onPress={() => router.push('/profile')} data-testid="dashboard-profile-avatar">
        {user?.profile_photo ? (
          <Image source={{ uri: user.profile_photo }} style={[s.avatar, { borderColor: getRoleColor(user?.role) }]} />
        ) : (
          <View style={[s.avatarFallback, { backgroundColor: getRoleColor(user?.role || '') }]}>
            <Text style={s.avatarInitials}>{getInitials(user?.name || 'U')}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

function ProcedureCalendar({ procedures, selectedDate, setSelectedDate, router }: any) {
  const markedDates = procedures.reduce((acc: any, proc: any) => {
    const date = proc.procedure_date;
    if (!date) return acc;
    if (!acc[date]) acc[date] = { marked: true, dots: [] };
    acc[date].dots.push({ key: proc.id, color: STATUS_COLORS[proc.status as keyof typeof STATUS_COLORS] || '#999' });
    return acc;
  }, {} as Record<string, any>);
  if (selectedDate) {
    markedDates[selectedDate] = { ...markedDates[selectedDate], selected: true, selectedColor: '#1A73E8' };
  }
  const procsForDate = procedures.filter((p: any) => p.procedure_date === selectedDate);

  return (
    <>
      <View style={s.calendarCard}>
        <Calendar
          current={selectedDate}
          onDayPress={(day: any) => setSelectedDate(day.dateString)}
          markedDates={markedDates}
          markingType="multi-dot"
          theme={{ todayTextColor: '#1A73E8', selectedDayBackgroundColor: '#1A73E8', arrowColor: '#1A73E8' }}
        />
      </View>
      <View style={s.section}>
        <Text style={s.sectionTitle}>
          {format(new Date(selectedDate), 'MMM dd, yyyy')}
        </Text>
        {procsForDate.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="calendar-outline" size={28} color="#B0BEC5" />
            <Text style={s.emptyText}>No procedures scheduled</Text>
          </View>
        ) : (
          procsForDate.map((proc: any) => (
            <TouchableOpacity key={proc.id} style={s.procCard} onPress={() => router.push(`/procedures/${proc.id}`)}>
              <View style={s.procCardHeader}>
                <Text style={s.procPatient}>{proc.patient_name}</Text>
                <View style={[s.statusChip, { backgroundColor: STATUS_COLORS[proc.status as keyof typeof STATUS_COLORS] || '#999' }]}>
                  <Text style={s.statusChipText}>{STATUS_LABELS[proc.status as keyof typeof STATUS_LABELS] || proc.status}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
                <Text style={s.procDetail}><Ionicons name="time-outline" size={12} color="#90A4AE" /> {proc.procedure_time}</Text>
                <Text style={s.procDetail}><Ionicons name="location-outline" size={12} color="#90A4AE" /> Site: {proc.implant_site}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <Ionicons name="person-outline" size={12} color="#90A4AE" />
                <Text style={s.procDetail}> Scheduled by: {proc.created_by_name || proc.student_name || '—'}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    </>
  );
}

// ── Student Dashboard ─────────────────────────────────────
function StudentDashboard({ stats, procedures, selectedDate, setSelectedDate, router }: any) {
  const [approvingDraftId, setApprovingDraftId] = useState<string | null>(null);

  const actionNeeded = useMemo(() =>
    procedures.filter((p: any) => ACTION_NEEDED_MAP[p.status] && p.status !== 'draft'),
    [procedures]
  );
  const draftCases = useMemo(() => procedures.filter((p: any) => p.status === 'draft'), [procedures]);

  const handleSendForApproval = async (procId: string) => {
    setApprovingDraftId(procId);
    try {
      await api.post(`/procedures/${procId}/request-phase1-approval`);
      Alert.alert('Sent', 'Case sent for Phase 1 approval.');
    } catch (err: any) {
      Alert.alert('Error', String(err.response?.data?.detail || 'Failed'));
    } finally {
      setApprovingDraftId(null);
    }
  };

  // Recent remarks from procedures
  const recentRemarks = useMemo(() => {
    const remarks: any[] = [];
    procedures.forEach((p: any) => {
      const fields = [
        { key: 'phase2_supervisor_notes', phase: 'Phase 2', role: 'Supervisor' },
        { key: 'phase2_incharge_notes', phase: 'Phase 2', role: 'In-Charge' },
        { key: 'phase3_supervisor_notes', phase: 'Phase 3', role: 'Supervisor' },
        { key: 'phase3_incharge_notes', phase: 'Phase 3', role: 'In-Charge' },
        { key: 'phase4_step1_supervisor_notes', phase: 'Phase 4', role: 'Supervisor' },
        { key: 'phase4_step1_incharge_notes', phase: 'Phase 4', role: 'In-Charge' },
        { key: 'phase4_step2_supervisor_notes', phase: 'Phase 4', role: 'Supervisor' },
        { key: 'phase4_step2_incharge_notes', phase: 'Phase 4', role: 'In-Charge' },
      ];
      fields.forEach(f => {
        if (p[f.key]) remarks.push({ patient: p.patient_name, text: p[f.key], phase: f.phase, role: f.role, id: p.id });
      });
    });
    return remarks.slice(0, 5);
  }, [procedures]);

  return (
    <>
      {/* Stats */}
      <View style={s.statsRow}>
        <StatCard label="Active" value={stats.total - (stats.completed || 0) - stats.rejected} color="#1A73E8" icon="pulse" onPress={() => router.push('/procedures')} />
        <StatCard label="Pending" value={stats.pending} color="#FF9800" icon="hourglass" onPress={() => router.push({ pathname: '/procedures', params: { filter: 'pending' } })} />
        <StatCard label="Done" value={stats.completed || stats.approved} color="#4CAF50" icon="checkmark-circle" onPress={() => router.push({ pathname: '/procedures', params: { filter: 'completed' } })} />
        <StatCard label="Rejected" value={stats.rejected} color="#F44336" icon="close-circle" onPress={() => router.push({ pathname: '/procedures', params: { filter: 'rejected' } })} />
      </View>

      {/* Action Needed */}
      {actionNeeded.length > 0 && (
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons name="flash" size={18} color="#E65100" />
            <Text style={[s.sectionTitle, { color: '#E65100' }]}>Action Needed ({actionNeeded.length})</Text>
          </View>
          {actionNeeded.slice(0, 4).map((proc: any) => {
            const info = ACTION_NEEDED_MAP[proc.status];
            return (
              <TouchableOpacity key={proc.id} style={s.actionCard} onPress={() => router.push(`/procedures/${proc.id}`)} data-testid={`action-card-${proc.id}`}>
                <View style={[s.actionIconWrap, { backgroundColor: info.color + '18' }]}>
                  <Ionicons name={info.icon as any} size={20} color={info.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.actionPatient}>{proc.patient_name}</Text>
                  <Text style={s.actionLabel}>{info.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#B0BEC5" />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Draft Cases */}
      {draftCases.length > 0 && (
        <View style={s.section} data-testid="draft-cases-section">
          <View style={s.sectionHeader}>
            <Ionicons name="document-text-outline" size={18} color="#546E7A" />
            <Text style={s.sectionTitle}>Drafts ({draftCases.length})</Text>
          </View>
          {draftCases.slice(0, 5).map((proc: any) => (
            <View key={proc.id} style={s.draftCard} data-testid={`draft-card-${proc.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={s.draftPatient}>{proc.patient_name}</Text>
                <Text style={s.draftSub}>{proc.implant_procedure_type} - {proc.procedure_date}</Text>
              </View>
              <TouchableOpacity
                style={s.continueBtn}
                onPress={() => router.push(`/(tabs)/new-procedure?draftId=${proc.id}`)}
                data-testid={`draft-continue-btn-${proc.id}`}
              >
                <Ionicons name="play-circle" size={14} color="#FFF" />
                <Text style={s.continueBtnText}>Continue</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Faculty Remarks */}
      {recentRemarks.length > 0 && (
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color="#5C35A3" />
            <Text style={[s.sectionTitle, { color: '#5C35A3' }]}>Faculty Remarks</Text>
          </View>
          {recentRemarks.map((r, idx) => (
            <TouchableOpacity key={idx} style={s.remarkCard} onPress={() => router.push(`/procedures/${r.id}`)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={s.remarkPhase}>{r.phase} - {r.role}</Text>
                <Text style={s.remarkPatient}>{r.patient}</Text>
              </View>
              <Text style={s.remarkText} numberOfLines={2}>"{r.text}"</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <ProcedureCalendar procedures={procedures} selectedDate={selectedDate} setSelectedDate={setSelectedDate} router={router} />
    </>
  );
}

// ── Supervisor Dashboard ──────────────────────────────────
function SupervisorDashboard({ stats, procedures, selectedDate, setSelectedDate, router, userId }: any) {
  const pendingApproval = useMemo(() =>
    procedures.filter((p: any) => PENDING_STATUSES.includes(p.status)),
    [procedures]
  );

  const draftCases = useMemo(() => procedures.filter((p: any) => p.status === 'draft'), [procedures]);

  const pipeline = stats.pipeline || {};
  const pipelineTotal = (pipeline.phase1 || 0) + (pipeline.phase2 || 0) + (pipeline.phase3 || 0) + (pipeline.phase4 || 0) + (pipeline.completed || 0);

  const myStudents = useMemo(() => {
    const map: Record<string, { name: string; cases: number; pending: number }> = {};
    procedures.forEach((p: any) => {
      const key = p.student_name || 'Unknown';
      if (!map[key]) map[key] = { name: key, cases: 0, pending: 0 };
      map[key].cases++;
      if (PENDING_STATUSES.includes(p.status)) map[key].pending++;
    });
    return Object.values(map).sort((a, b) => b.pending - a.pending);
  }, [procedures]);

  const approvedByMe = stats.approved || 0;
  const rejectedByMe = stats.rejected || 0;
  const totalDecisions = approvedByMe + rejectedByMe;
  const approvalRate = totalDecisions > 0 ? Math.round((approvedByMe / totalDecisions) * 100) : 100;

  return (
    <>
      {/* Stats */}
      <View style={s.statsRow}>
        <StatCard label="To Review" value={stats.pending_my_approval || pendingApproval.length} color="#E65100" icon="document-attach" onPress={() => router.push('/procedures')} />
        <StatCard label="Approved" value={stats.approved} color="#4CAF50" icon="checkmark-circle" onPress={() => router.push('/procedures')} />
        <StatCard label="Total" value={stats.total} color="#1565C0" icon="folder-open" onPress={() => router.push('/procedures')} />
        <StatCard label="Rate" value={`${approvalRate}%`} color="#5C35A3" icon="analytics" onPress={() => router.push('/procedures')} />
      </View>

      {/* Case Pipeline */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Ionicons name="git-branch-outline" size={18} color="#1565C0" />
          <Text style={[s.sectionTitle, { color: '#1565C0' }]}>Case Pipeline</Text>
        </View>
        <View style={s.pipelineCard}>
          {[
            { label: 'Phase 1', count: pipeline.phase1 || 0, color: '#78909C', phase: '1' },
            { label: 'Phase 2', count: pipeline.phase2 || 0, color: '#1A73E8', phase: '2' },
            { label: 'Phase 3', count: pipeline.phase3 || 0, color: '#FF9800', phase: '3' },
            { label: 'Phase 4', count: pipeline.phase4 || 0, color: '#9C27B0', phase: '4' },
            { label: 'Complete', count: pipeline.completed || 0, color: '#4CAF50', phase: 'completed' },
          ].map((item, idx) => (
            <TouchableOpacity key={idx} style={s.pipelineItem} onPress={() => router.push(`/(tabs)/procedures?phase=${item.phase}`)} data-testid={`sup-pipeline-${item.phase}`}>
              <View style={[s.pipelineBar, { backgroundColor: item.color, height: Math.max(8, pipelineTotal > 0 ? (item.count / pipelineTotal) * 80 : 8) }]} />
              <Text style={s.pipelineCount}>{item.count}</Text>
              <Text style={s.pipelineLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Pending Approval Queue */}
      {pendingApproval.length > 0 && (
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons name="clipboard-outline" size={18} color="#E65100" />
            <Text style={[s.sectionTitle, { color: '#E65100' }]}>Pending Your Approval ({pendingApproval.length})</Text>
          </View>
          {pendingApproval.slice(0, 5).map((proc: any) => {
            const phase = getPhaseFromStatus(proc.status);
            return (
              <TouchableOpacity key={proc.id} style={s.approvalCard} onPress={() => router.push(`/procedures/${proc.id}`)} data-testid={`pending-card-${proc.id}`}>
                <View style={s.approvalPhaseWrap}>
                  <Text style={s.approvalPhaseNum}>P{phase}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.approvalPatient}>{proc.patient_name}</Text>
                  <Text style={s.approvalSub}>{proc.student_name} - {proc.implant_procedure_type}</Text>
                </View>
                <View style={s.reviewChip}>
                  <Text style={s.reviewChipText}>Review</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* My Students */}
      {myStudents.length > 0 && (
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons name="people-outline" size={18} color="#1565C0" />
            <Text style={[s.sectionTitle, { color: '#1565C0' }]}>My Students</Text>
          </View>
          {myStudents.map((st, idx) => (
            <View key={idx} style={s.studentCard}>
              <View style={s.studentAvatar}>
                <Text style={s.studentAvatarText}>{st.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.studentName}>{st.name}</Text>
                <Text style={s.studentSub}>{st.cases} cases total</Text>
              </View>
              {st.pending > 0 && (
                <View style={s.pendingBadge}>
                  <Text style={s.pendingBadgeText}>{st.pending} pending</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Draft Cases */}
      {draftCases.length > 0 && (
        <View style={s.section} data-testid="sup-draft-cases-section">
          <View style={s.sectionHeader}>
            <Ionicons name="document-text-outline" size={18} color="#546E7A" />
            <Text style={s.sectionTitle}>Drafts ({draftCases.length})</Text>
          </View>
          {draftCases.slice(0, 5).map((proc: any) => (
            <View key={proc.id} style={s.draftCard} data-testid={`sup-draft-card-${proc.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={s.draftPatient}>{proc.patient_name}</Text>
                <Text style={s.draftSub}>{proc.implant_procedure_type} - {proc.procedure_date}</Text>
              </View>
              <TouchableOpacity
                style={s.continueBtn}
                onPress={() => router.push(`/(tabs)/new-procedure?draftId=${proc.id}`)}
                data-testid={`sup-draft-continue-btn-${proc.id}`}
              >
                <Ionicons name="play-circle" size={14} color="#FFF" />
                <Text style={s.continueBtnText}>Continue</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <ProcedureCalendar procedures={procedures} selectedDate={selectedDate} setSelectedDate={setSelectedDate} router={router} />
    </>
  );
}

// ── In-Charge / Admin Dashboard ───────────────────────────
function InChargeDashboard({ stats, procedures, selectedDate, setSelectedDate, router }: any) {
  const pipeline = stats.pipeline || {};
  const pipelineTotal = (pipeline.phase1 || 0) + (pipeline.phase2 || 0) + (pipeline.phase3 || 0) + (pipeline.phase4 || 0) + (pipeline.completed || 0);
  const studentStats = stats.student_stats || [];

  const pendingApproval = useMemo(() =>
    procedures.filter((p: any) => PENDING_STATUSES.includes(p.status)),
    [procedures]
  );

  return (
    <>
      {/* Stats */}
      <View style={s.statsRow}>
        <StatCard label="Total" value={stats.total} color="#283593" icon="layers" onPress={() => router.push('/procedures')} />
        <StatCard label="Active" value={stats.total - (stats.completed || 0) - stats.rejected} color="#1A73E8" icon="pulse" onPress={() => router.push('/procedures')} />
        <StatCard label="Done" value={stats.completed || 0} color="#4CAF50" icon="checkmark-circle" onPress={() => router.push('/procedures')} />
        <StatCard label="To Review" value={stats.pending_my_approval || 0} color="#E65100" icon="document-attach" onPress={() => router.push('/procedures')} />
      </View>

      {/* Phase Pipeline */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Ionicons name="git-branch-outline" size={18} color="#283593" />
          <Text style={[s.sectionTitle, { color: '#283593' }]}>Case Pipeline</Text>
        </View>
        <View style={s.pipelineCard}>
          {[
            { label: 'Phase 1', count: pipeline.phase1 || 0, color: '#78909C', phase: '1' },
            { label: 'Phase 2', count: pipeline.phase2 || 0, color: '#1A73E8', phase: '2' },
            { label: 'Phase 3', count: pipeline.phase3 || 0, color: '#FF9800', phase: '3' },
            { label: 'Phase 4', count: pipeline.phase4 || 0, color: '#9C27B0', phase: '4' },
            { label: 'Complete', count: pipeline.completed || 0, color: '#4CAF50', phase: 'completed' },
          ].map((item, idx) => (
            <TouchableOpacity key={idx} style={s.pipelineItem} onPress={() => router.push(`/(tabs)/procedures?phase=${item.phase}`)} data-testid={`ic-pipeline-${item.phase}`}>
              <View style={[s.pipelineBar, { backgroundColor: item.color, height: Math.max(8, pipelineTotal > 0 ? (item.count / pipelineTotal) * 80 : 8) }]} />
              <Text style={s.pipelineCount}>{item.count}</Text>
              <Text style={s.pipelineLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Pending Review */}
      {pendingApproval.length > 0 && (
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons name="clipboard-outline" size={18} color="#E65100" />
            <Text style={[s.sectionTitle, { color: '#E65100' }]}>Pending Review ({pendingApproval.length})</Text>
          </View>
          {pendingApproval.slice(0, 5).map((proc: any) => {
            const phase = getPhaseFromStatus(proc.status);
            return (
              <TouchableOpacity key={proc.id} style={s.approvalCard} onPress={() => router.push(`/procedures/${proc.id}`)} data-testid={`ic-pending-${proc.id}`}>
                <View style={s.approvalPhaseWrap}>
                  <Text style={s.approvalPhaseNum}>P{phase}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.approvalPatient}>{proc.patient_name}</Text>
                  <Text style={s.approvalSub}>{proc.student_name} - {proc.implant_procedure_type}</Text>
                </View>
                <View style={s.reviewChip}>
                  <Text style={s.reviewChipText}>Review</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Student Performance */}
      {studentStats.length > 0 && (
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons name="school-outline" size={18} color="#1565C0" />
            <Text style={[s.sectionTitle, { color: '#1565C0' }]}>Student Performance</Text>
          </View>
          {studentStats.filter((st: any) => st.student_name).map((st: any, idx: number) => (
            <View key={idx} style={s.perfCard}>
              <View style={s.perfRank}>
                <Text style={s.perfRankText}>#{idx + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.perfName}>{st.student_name}</Text>
                <View style={s.perfStats}>
                  <View style={s.perfChip}><Text style={[s.perfChipText, { color: '#1A73E8' }]}>{st.total} total</Text></View>
                  <View style={s.perfChip}><Text style={[s.perfChipText, { color: '#4CAF50' }]}>{st.completed} done</Text></View>
                  <View style={s.perfChip}><Text style={[s.perfChipText, { color: '#FF9800' }]}>{st.active} active</Text></View>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Quick Actions */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Ionicons name="apps-outline" size={18} color="#37474F" />
          <Text style={s.sectionTitle}>Quick Actions</Text>
        </View>
        <View style={s.quickActions}>
          <TouchableOpacity style={s.quickBtn} onPress={() => router.push('/new-procedure')}>
            <Ionicons name="add-circle-outline" size={24} color="#1A73E8" />
            <Text style={s.quickBtnText}>New Case</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.quickBtn} onPress={() => router.push('/procedures')}>
            <Ionicons name="folder-open-outline" size={24} color="#4CAF50" />
            <Text style={s.quickBtnText}>All Cases</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.quickBtn} onPress={() => router.push('/user-management')}>
            <Ionicons name="people-outline" size={24} color="#FF9800" />
            <Text style={s.quickBtnText}>Users</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.quickBtn} onPress={() => router.push('/implant-selection')}>
            <Ionicons name="search-outline" size={24} color="#9C27B0" />
            <Text style={s.quickBtnText}>Implants</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ProcedureCalendar procedures={procedures} selectedDate={selectedDate} setSelectedDate={setSelectedDate} router={router} />
    </>
  );
}

// ── Stat Card Component ───────────────────────────────────
function StatCard({ label, value, color, icon, onPress }: { label: string; value: number | string; color: string; icon: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={[s.statCard, { backgroundColor: color }]} onPress={onPress} activeOpacity={onPress ? 0.7 : 1} data-testid={`stat-${label.toLowerCase().replace(/\s/g, '-')}`}>
      <Ionicons name={icon as any} size={18} color="rgba(255,255,255,0.7)" />
      <Text style={s.statNumber}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Main Dashboard ────────────────────────────────────────
export default function DashboardScreen() {
  const [procedures, setProcedures] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({ total: 0, pending: 0, approved: 0, rejected: 0, completed: 0, pipeline: {} });
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [proceduresRes, statsRes] = await Promise.all([
        api.get('/procedures'),
        api.get('/dashboard/stats'),
      ]);
      setProcedures(proceduresRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  if (loading) {
    return <View style={s.loading}><ActivityIndicator size="large" color="#1A73E8" /></View>;
  }

  const role = user?.role;
  const isStudent = role === 'student';
  const isSupervisor = role === 'supervisor';
  const isInCharge = role === 'implant_incharge' || role === 'administrator';

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Header user={user} router={router} />

        {isStudent && (
          <StudentDashboard stats={stats} procedures={procedures} selectedDate={selectedDate} setSelectedDate={setSelectedDate} router={router} />
        )}
        {isSupervisor && (
          <SupervisorDashboard stats={stats} procedures={procedures} selectedDate={selectedDate} setSelectedDate={setSelectedDate} router={router} userId={user?.id} />
        )}
        {isInCharge && (
          <InChargeDashboard stats={stats} procedures={procedures} selectedDate={selectedDate} setSelectedDate={setSelectedDate} router={router} />
        )}
        {!isStudent && !isSupervisor && !isInCharge && (
          <StudentDashboard stats={stats} procedures={procedures} selectedDate={selectedDate} setSelectedDate={setSelectedDate} router={router} />
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
  greeting: { fontSize: 13, color: '#90A4AE', fontWeight: '500' },
  userName: { fontSize: 22, fontWeight: '700', color: '#1A1A1A', marginTop: 1 },
  roleTag: { fontSize: 11, color: '#78909C', marginTop: 2, fontWeight: '500' },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2 },
  avatarFallback: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  avatarInitials: { color: '#FFF', fontSize: 18, fontWeight: '700' },

  // Stats Row
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  statCard: { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center', gap: 4 },
  statNumber: { fontSize: 22, fontWeight: '800', color: '#FFF' },
  statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Sections
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#37474F' },

  // Calendar
  calendarCard: { marginHorizontal: 16, marginTop: 20, borderRadius: 14, backgroundColor: '#FFF', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },

  // Empty state
  emptyCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 28, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 13, color: '#90A4AE' },

  // Procedure cards
  procCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  procCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  procPatient: { fontSize: 16, fontWeight: '600', color: '#1A1A1A', flex: 1 },
  procDetail: { fontSize: 12, color: '#90A4AE' },
  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusChipText: { fontSize: 9, color: '#FFF', fontWeight: '700' },

  // Action Needed (Student)
  actionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 8, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  actionIconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  actionPatient: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  actionLabel: { fontSize: 12, color: '#78909C', marginTop: 2 },

  // Drafts (Student)
  draftCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#78909C', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  draftPatient: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  draftSub: { fontSize: 12, color: '#90A4AE', marginTop: 2 },
  sendBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#34A853', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, gap: 5 },
  sendBtnText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  continueBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A73E8', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, gap: 5 },
  continueBtnText: { color: '#FFF', fontSize: 12, fontWeight: '600' },

  // Remarks (Student)
  remarkCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 12, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#5C35A3', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  remarkPhase: { fontSize: 11, fontWeight: '600', color: '#5C35A3' },
  remarkPatient: { fontSize: 11, color: '#90A4AE' },
  remarkText: { fontSize: 13, color: '#455A64', fontStyle: 'italic', lineHeight: 18 },

  // Approval Queue (Supervisor/InCharge)
  approvalCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, padding: 12, marginBottom: 8, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  approvalPhaseWrap: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#E8EAF6', justifyContent: 'center', alignItems: 'center' },
  approvalPhaseNum: { fontSize: 16, fontWeight: '800', color: '#283593' },
  approvalPatient: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  approvalSub: { fontSize: 12, color: '#90A4AE', marginTop: 2 },
  reviewChip: { backgroundColor: '#E65100', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  reviewChipText: { fontSize: 11, fontWeight: '700', color: '#FFF' },

  // Students (Supervisor)
  studentCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, padding: 12, marginBottom: 8, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  studentAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center' },
  studentAvatarText: { fontSize: 14, fontWeight: '700', color: '#1565C0' },
  studentName: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  studentSub: { fontSize: 12, color: '#90A4AE', marginTop: 1 },
  pendingBadge: { backgroundColor: '#FFF3E0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  pendingBadgeText: { fontSize: 11, fontWeight: '600', color: '#E65100' },

  // Pipeline (InCharge)
  pipelineCard: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 14, padding: 16, justifyContent: 'space-around', alignItems: 'flex-end', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  pipelineItem: { alignItems: 'center', gap: 4, flex: 1 },
  pipelineBar: { width: 28, borderRadius: 6, minHeight: 8 },
  pipelineCount: { fontSize: 16, fontWeight: '800', color: '#263238' },
  pipelineLabel: { fontSize: 9, fontWeight: '600', color: '#90A4AE', textTransform: 'uppercase' },

  // Performance (InCharge)
  perfCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, padding: 12, marginBottom: 8, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  perfRank: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFF8E1', justifyContent: 'center', alignItems: 'center' },
  perfRankText: { fontSize: 12, fontWeight: '800', color: '#F57F17' },
  perfName: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  perfStats: { flexDirection: 'row', gap: 8, marginTop: 4 },
  perfChip: { backgroundColor: '#F5F7FA', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  perfChipText: { fontSize: 10, fontWeight: '600' },

  // Quick Actions (InCharge)
  quickActions: { flexDirection: 'row', gap: 10 },
  quickBtn: { flex: 1, backgroundColor: '#FFF', borderRadius: 14, padding: 14, alignItems: 'center', gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  quickBtnText: { fontSize: 11, fontWeight: '600', color: '#37474F' },
});
