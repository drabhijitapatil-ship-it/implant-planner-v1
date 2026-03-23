import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import CaseImplantPlanning from '../../components/CaseImplantPlanning';
import {
  PROCEDURE_TYPES,
  LOADING_TYPES,
  CHECKLIST_DATA,
  PROCEDURE_TIME_SLOTS,
  NON_FULL_ARCH_TYPES,
  FULL_ARCH_GROUP,
  EDENTULOUS_SITE_OPTIONS,
  RIDGE_CONTOUR_OPTIONS,
  SOFT_TISSUE_OPTIONS,
  KERATINIZED_MUCOSA_OPTIONS,
  OCCLUSAL_SCHEME_OPTIONS,
  PARAFUNCTION_HABIT_OPTIONS,
  VERTICAL_DIMENSION_OPTIONS,
  OPPOSING_DENTITION_OPTIONS,
  TMJ_OPTIONS,
  SMILE_LINE_OPTIONS,
  GINGIVAL_BIOTYPE_OPTIONS,
  MEDICAL_RISK_FACTORS,
  calculateMedicalRisk,
  getProstheticOptions,
} from '../../constants/checklist';

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

// ─── Reusable Dropdown ─────────────────────────────────
function Dropdown({ label, value, options, onChange, placeholder, required }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
  placeholder?: string; required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.label}>{label}{required && <Text style={{ color: '#DC3545' }}> *</Text>}</Text>
      <TouchableOpacity style={styles.dropdown} onPress={() => setOpen(!open)} data-testid={`dropdown-${label.toLowerCase().replace(/\s+/g, '-')}`}>
        <Text style={[styles.dropdownText, !value && { color: '#999' }]}>
          {value || placeholder || `Select ${label}`}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
      </TouchableOpacity>
      {open && (
        <View style={styles.dropdownList}>
          {options.map(opt => (
            <TouchableOpacity key={opt} style={[styles.dropdownItem, value === opt && styles.dropdownItemActive]}
              onPress={() => { onChange(opt); setOpen(false); }}>
              <Text style={[styles.dropdownItemText, value === opt && styles.dropdownItemTextActive]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Main Component ────────────────────────────────────
export default function NewProcedureScreen() {
  const { user, token } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<'details' | 'implants'>('details');
  const [loading, setLoading] = useState(false);
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [incharges, setIncharges] = useState<any[]>([]);
  const [createdProcedureId, setCreatedProcedureId] = useState<string | null>(null);

  // ── Form State ──
  const [formData, setFormData] = useState({
    patient_name: '',
    registration_number: '',
    student_name: user?.name || '',
    supervisor_id: '',
    supervisor_name: '',
    implant_incharge_id: '',
    implant_incharge_name: '',
    receipt_number: '',
    amount_paid: '',
    procedure_date: '',
    procedure_time: '',
    implant_procedure_type: '',
    loading_type: [] as string[],
    prosthetic_plan: '',
    prosthetic_plan_other: '',
    bone_graft_specifications: '',
    // Clinical Examination
    edentulous_site: '',
    ridge_contour: '',
    soft_tissue_thickness: '',
    keratinized_mucosa: '',
    // Occlusal Analysis (non-full-arch)
    occlusal_scheme: '',
    parafunction_habit: '',
    vertical_dimension: '',
    opposing_dentition: '',
    // Occlusal Analysis (full-arch)
    vertical_dimension_mm: '',
    tmj: '',
    // Aesthetic Risk Assessment
    smile_line: '',
    gingival_biotype: '',
    // Medical Assessment
    medical_assessment: {} as Record<string, string>,
    medical_risk_level: '',
  });

  // Checklist state
  const [checklistItems, setChecklistItems] = useState<Record<string, boolean>>({});
  const [showSupervisorPicker, setShowSupervisorPicker] = useState(false);
  const [showInchargePicker, setShowInchargePicker] = useState(false);

  const isFullArch = FULL_ARCH_GROUP.has(formData.implant_procedure_type);
  const isNonFullArch = NON_FULL_ARCH_TYPES.has(formData.implant_procedure_type);
  const prostheticOptions = getProstheticOptions(formData.implant_procedure_type, formData.loading_type);

  // ── Load faculty data ──
  useEffect(() => {
    const loadFaculty = async () => {
      try {
        const res = await axios.get(`${API}/api/users`, { headers: { Authorization: `Bearer ${token}` } });
        const users = res.data || [];
        setSupervisors(users.filter((u: any) => u.role === 'supervisor'));
        setIncharges(users.filter((u: any) => u.role === 'implant_incharge'));
      } catch (e) { /* ignore */ }
    };
    loadFaculty();
  }, [token]);

  // Update medical risk when factors change
  useEffect(() => {
    if (Object.keys(formData.medical_assessment).length > 0) {
      const risk = calculateMedicalRisk(formData.medical_assessment);
      setFormData(prev => ({ ...prev, medical_risk_level: risk.level }));
    }
  }, [formData.medical_assessment]);

  const updateForm = useCallback((field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const toggleLoading = (val: string) => {
    setFormData(prev => {
      const types = prev.loading_type.includes(val)
        ? prev.loading_type.filter(t => t !== val)
        : [...prev.loading_type, val];
      return { ...prev, loading_type: types };
    });
  };

  const updateMedical = (key: string, val: string) => {
    setFormData(prev => ({
      ...prev,
      medical_assessment: { ...prev.medical_assessment, [key]: val },
    }));
  };

  // ── Continue to Implant Selection ──
  const handleContinueToImplants = async () => {
    // Validate required fields
    const required = ['patient_name', 'registration_number', 'supervisor_id', 'implant_incharge_id',
      'receipt_number', 'amount_paid', 'procedure_date', 'procedure_time', 'implant_procedure_type'];
    for (const f of required) {
      if (!(formData as any)[f]) {
        Alert.alert('Missing Field', `Please fill in: ${f.replace(/_/g, ' ')}`);
        return;
      }
    }
    if (formData.loading_type.length === 0) {
      Alert.alert('Missing Field', 'Please select at least one loading type.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...formData,
        amount_paid: parseFloat(formData.amount_paid) || 0,
        checklist: {
          pre_surgical: {
            items: CHECKLIST_DATA.pre_surgical.items.map(item => ({
              id: item.id,
              label: item.label,
              value: checklistItems[item.id] || false,
            })),
            additional_fields: {},
          },
        },
        prosthetic_plan: formData.prosthetic_plan === 'Other'
          ? `Other: ${formData.prosthetic_plan_other}`
          : formData.prosthetic_plan,
      };

      const res = await axios.post(`${API}/api/procedures`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const procId = res.data.id || res.data._id;
      setCreatedProcedureId(procId);
      setStep('implants');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to create case');
    } finally {
      setLoading(false);
    }
  };

  // ── Render Step: Implant Selection ──
  if (step === 'implants' && createdProcedureId) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
        <View style={styles.stepHeader}>
          <TouchableOpacity onPress={() => setStep('details')} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#1A73E8" />
          </TouchableOpacity>
          <Text style={styles.stepTitle}>Step 2: Implant Selection</Text>
        </View>
        <CaseImplantPlanning
          procedureId={createdProcedureId}
          procedureType={formData.implant_procedure_type}
          status="draft"
          userRole={user?.role || 'student'}
          readOnly={false}
          medicalAssessment={formData.medical_assessment}
        />
        <View style={styles.submitContainer}>
          <TouchableOpacity style={styles.submitBtn} data-testid="submit-for-approval"
            onPress={() => {
              Alert.alert('Submit for Approval', 'Are you sure you want to submit this case?', [
                { text: 'Cancel' },
                {
                  text: 'Submit', onPress: async () => {
                    try {
                      await axios.put(`${API}/api/procedures/${createdProcedureId}`,
                        { status: 'pending_phase1' },
                        { headers: { Authorization: `Bearer ${token}` } }
                      );
                      Alert.alert('Success', 'Case submitted for approval.');
                      router.replace('/(tabs)/dashboard');
                    } catch (e: any) {
                      Alert.alert('Error', e.response?.data?.detail || 'Failed to submit');
                    }
                  }
                },
              ]);
            }}>
            <Ionicons name="checkmark-circle" size={20} color="#FFF" />
            <Text style={styles.submitBtnText}>Submit for Approval</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Render Step: Case Details ──
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1A73E8" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Case - Phase 1</Text>
      </View>
      <Text style={styles.stepIndicator}>Step 1 of 2: Case Details</Text>

      {/* ─── Patient Info ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Patient Information</Text>
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Patient Name <Text style={{ color: '#DC3545' }}>*</Text></Text>
          <TextInput style={styles.input} value={formData.patient_name}
            onChangeText={v => updateForm('patient_name', v)} placeholder="Enter patient name" data-testid="patient-name-input" />
        </View>
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Registration Number <Text style={{ color: '#DC3545' }}>*</Text></Text>
          <TextInput style={styles.input} value={formData.registration_number}
            onChangeText={v => updateForm('registration_number', v)} placeholder="Enter registration number" data-testid="registration-number-input" />
        </View>
        {user?.role === 'student' && (
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Name of Postgraduate Student</Text>
            <TextInput style={[styles.input, { backgroundColor: '#F0F0F0' }]} value={formData.student_name} editable={false} />
          </View>
        )}
      </View>

      {/* ─── Faculty Selection ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Faculty Assignment</Text>
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Supervising Faculty <Text style={{ color: '#DC3545' }}>*</Text></Text>
          <TouchableOpacity style={styles.dropdown} onPress={() => setShowSupervisorPicker(!showSupervisorPicker)}>
            <Text style={[styles.dropdownText, !formData.supervisor_name && { color: '#999' }]}>
              {formData.supervisor_name || 'Select Supervisor'}
            </Text>
            <Ionicons name={showSupervisorPicker ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
          </TouchableOpacity>
          {showSupervisorPicker && (
            <View style={styles.dropdownList}>
              {supervisors.map(s => (
                <TouchableOpacity key={s._id || s.id} style={styles.dropdownItem}
                  onPress={() => {
                    updateForm('supervisor_id', s._id || s.id);
                    updateForm('supervisor_name', s.name);
                    setShowSupervisorPicker(false);
                  }}>
                  <Text style={styles.dropdownItemText}>{s.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Implant In-Charge <Text style={{ color: '#DC3545' }}>*</Text></Text>
          <TouchableOpacity style={styles.dropdown} onPress={() => setShowInchargePicker(!showInchargePicker)}>
            <Text style={[styles.dropdownText, !formData.implant_incharge_name && { color: '#999' }]}>
              {formData.implant_incharge_name || 'Select Implant In-Charge'}
            </Text>
            <Ionicons name={showInchargePicker ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
          </TouchableOpacity>
          {showInchargePicker && (
            <View style={styles.dropdownList}>
              {incharges.map(s => (
                <TouchableOpacity key={s._id || s.id} style={styles.dropdownItem}
                  onPress={() => {
                    updateForm('implant_incharge_id', s._id || s.id);
                    updateForm('implant_incharge_name', s.name);
                    setShowInchargePicker(false);
                  }}>
                  <Text style={styles.dropdownItemText}>{s.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>

      {/* ─── Payment Details ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment Details</Text>
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Receipt Number <Text style={{ color: '#DC3545' }}>*</Text></Text>
          <TextInput style={styles.input} value={formData.receipt_number}
            onChangeText={v => updateForm('receipt_number', v)} placeholder="Enter receipt number" />
        </View>
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Amount Paid <Text style={{ color: '#DC3545' }}>*</Text></Text>
          <TextInput style={styles.input} value={formData.amount_paid} keyboardType="numeric"
            onChangeText={v => updateForm('amount_paid', v)} placeholder="Enter amount" />
        </View>
      </View>

      {/* ─── Procedure Type ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Procedure Information</Text>
        <Dropdown label="Type of Implant Procedure" value={formData.implant_procedure_type}
          options={PROCEDURE_TYPES} onChange={v => updateForm('implant_procedure_type', v)} required />
      </View>

      {/* ─── Clinical Examination ─── */}
      {formData.implant_procedure_type && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Clinical Examination</Text>

          {/* Intraoral Examination */}
          <Text style={styles.subSectionTitle}>Intraoral Examination</Text>
          <Dropdown label="Edentulous Site" value={formData.edentulous_site}
            options={EDENTULOUS_SITE_OPTIONS} onChange={v => updateForm('edentulous_site', v)} />
          <Dropdown label="Ridge Contour" value={formData.ridge_contour}
            options={RIDGE_CONTOUR_OPTIONS} onChange={v => updateForm('ridge_contour', v)} />
          <Dropdown label="Soft Tissue Thickness" value={formData.soft_tissue_thickness}
            options={SOFT_TISSUE_OPTIONS} onChange={v => updateForm('soft_tissue_thickness', v)} />
          <Dropdown label="Keratinized Mucosa" value={formData.keratinized_mucosa}
            options={KERATINIZED_MUCOSA_OPTIONS} onChange={v => updateForm('keratinized_mucosa', v)} />

          {/* Occlusal Analysis – Non-Full-Arch */}
          {isNonFullArch && (
            <>
              <Text style={styles.subSectionTitle}>Occlusal Analysis</Text>
              <Dropdown label="Occlusal Scheme" value={formData.occlusal_scheme}
                options={OCCLUSAL_SCHEME_OPTIONS} onChange={v => updateForm('occlusal_scheme', v)} />
              <Dropdown label="Parafunction Habit" value={formData.parafunction_habit}
                options={PARAFUNCTION_HABIT_OPTIONS} onChange={v => updateForm('parafunction_habit', v)} />
              <Dropdown label="Vertical Dimension" value={formData.vertical_dimension}
                options={VERTICAL_DIMENSION_OPTIONS} onChange={v => updateForm('vertical_dimension', v)} />
              <Dropdown label="Opposing Dentition" value={formData.opposing_dentition}
                options={OPPOSING_DENTITION_OPTIONS} onChange={v => updateForm('opposing_dentition', v)} />
            </>
          )}

          {/* Occlusal Analysis – Full Arch */}
          {isFullArch && (
            <>
              <Text style={styles.subSectionTitle}>Occlusal Analysis</Text>
              <View style={styles.fieldContainer}>
                <Text style={styles.label}>Vertical Dimension (mm)</Text>
                <TextInput style={styles.input} value={formData.vertical_dimension_mm} keyboardType="numeric"
                  onChangeText={v => updateForm('vertical_dimension_mm', v)} placeholder="Enter in mm" />
              </View>
              <Dropdown label="Temporomandibular Joint" value={formData.tmj}
                options={TMJ_OPTIONS} onChange={v => updateForm('tmj', v)} />
            </>
          )}

          {/* Aesthetic Risk Assessment – Non-Full-Arch */}
          {isNonFullArch && (
            <>
              <Text style={styles.subSectionTitle}>Aesthetic Risk Assessment</Text>
              <Dropdown label="Smile Line" value={formData.smile_line}
                options={SMILE_LINE_OPTIONS} onChange={v => updateForm('smile_line', v)} />
              <Dropdown label="Gingival Biotype" value={formData.gingival_biotype}
                options={GINGIVAL_BIOTYPE_OPTIONS} onChange={v => updateForm('gingival_biotype', v)} />
            </>
          )}
        </View>
      )}

      {/* ─── Schedule ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Schedule</Text>
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Procedure Date <Text style={{ color: '#DC3545' }}>*</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#999"
            value={formData.procedure_date || ''}
            onChangeText={(text) => {
              const cleaned = text.replace(/[^0-9-]/g, '');
              updateForm('procedure_date', cleaned);
            }}
            keyboardType="default"
            maxLength={10}
          />
        </View>
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Time Slot <Text style={{ color: '#DC3545' }}>*</Text></Text>
          <View style={styles.chipRow}>
            {PROCEDURE_TIME_SLOTS.map(slot => (
              <TouchableOpacity key={slot.value}
                style={[styles.chip, formData.procedure_time === slot.value && styles.chipActive]}
                onPress={() => updateForm('procedure_time', slot.value)}>
                <Text style={[styles.chipText, formData.procedure_time === slot.value && styles.chipTextActive]}>
                  {slot.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* ─── Loading Type ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Type of Loading <Text style={{ color: '#DC3545' }}>*</Text></Text>
        <View style={styles.chipRow}>
          {LOADING_TYPES.map(lt => (
            <TouchableOpacity key={lt}
              style={[styles.chip, formData.loading_type.includes(lt) && styles.chipActive]}
              onPress={() => toggleLoading(lt)}>
              <Text style={[styles.chipText, formData.loading_type.includes(lt) && styles.chipTextActive]}>
                {lt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ─── Prosthetic Treatment Plan ─── */}
      {prostheticOptions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prosthetic Treatment Plan</Text>
          <Dropdown label="Prosthetic Plan" value={formData.prosthetic_plan}
            options={prostheticOptions} onChange={v => updateForm('prosthetic_plan', v)} />
          {formData.prosthetic_plan === 'Other' && (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Specify Prosthetic Plan</Text>
              <TextInput style={styles.input} value={formData.prosthetic_plan_other}
                onChangeText={v => updateForm('prosthetic_plan_other', v)}
                placeholder="Enter custom prosthetic plan" multiline />
            </View>
          )}
        </View>
      )}

      {/* ─── Phase 1 Checklist ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Phase 1 Checklist</Text>
        {CHECKLIST_DATA.pre_surgical.items.filter(item => item.id !== 'medical_assessment').map(item => (
          <TouchableOpacity key={item.id} style={styles.checklistRow}
            onPress={() => setChecklistItems(prev => ({ ...prev, [item.id]: !prev[item.id] }))}>
            <Ionicons name={checklistItems[item.id] ? 'checkbox' : 'square-outline'}
              size={22} color={checklistItems[item.id] ? '#1A73E8' : '#999'} />
            <Text style={styles.checklistLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}

        {/* ─── Medical Assessment Sub-section ─── */}
        <View style={styles.medicalSection}>
          <Text style={styles.subSectionTitle}>Medical Assessment</Text>
          {MEDICAL_RISK_FACTORS.map(factor => (
            <View key={factor.id} style={styles.medicalRow}>
              <Text style={styles.medicalLabel}>{factor.label}</Text>
              <View style={styles.yesNoRow}>
                {['Yes', 'No'].map(opt => (
                  <TouchableOpacity key={opt}
                    style={[styles.yesNoBtn, formData.medical_assessment[factor.id] === opt && (opt === 'Yes' ? styles.yesActive : styles.noActive)]}
                    onPress={() => updateMedical(factor.id, opt)}>
                    <Text style={[styles.yesNoText, formData.medical_assessment[factor.id] === opt && styles.yesNoTextActive]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}

          {/* Auto Risk Classification */}
          {Object.keys(formData.medical_assessment).length > 0 && (
            <View style={[styles.riskBadge, { backgroundColor: calculateMedicalRisk(formData.medical_assessment).color + '18' }]}>
              <Text style={[styles.riskBadgeText, { color: calculateMedicalRisk(formData.medical_assessment).color }]}>
                Medical Risk: {calculateMedicalRisk(formData.medical_assessment).level}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ─── Bone Graft (if applicable) ─── */}
      {formData.implant_procedure_type.includes('Bone') && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bone Graft Specifications</Text>
          <TextInput style={[styles.input, { minHeight: 60 }]} value={formData.bone_graft_specifications}
            onChangeText={v => updateForm('bone_graft_specifications', v)}
            placeholder="Enter bone graft details" multiline />
        </View>
      )}

      {/* ─── Continue Button ─── */}
      <TouchableOpacity style={styles.continueBtn} onPress={handleContinueToImplants}
        disabled={loading} data-testid="continue-to-implants">
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Text style={styles.continueBtnText}>Continue to Implant Selection</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFF" />
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Styles ────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  headerBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A2E', marginLeft: 12 },
  backBtn: { padding: 6 },
  stepIndicator: { fontSize: 13, color: '#1A73E8', fontWeight: '600', marginLeft: 54, marginBottom: 12 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  stepTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A2E', marginLeft: 12 },
  section: { backgroundColor: '#FFF', borderRadius: 12, marginHorizontal: 16, marginBottom: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E', marginBottom: 12 },
  subSectionTitle: { fontSize: 14, fontWeight: '600', color: '#444', marginTop: 12, marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  fieldContainer: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12, fontSize: 15, backgroundColor: '#FAFAFA' },
  dropdown: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FAFAFA' },
  dropdownText: { fontSize: 15, color: '#333', flex: 1 },
  dropdownList: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, marginTop: 4, backgroundColor: '#FFF', maxHeight: 250, overflow: 'hidden' },
  dropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  dropdownItemActive: { backgroundColor: '#E8F0FE' },
  dropdownItemText: { fontSize: 14, color: '#333' },
  dropdownItemTextActive: { color: '#1A73E8', fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#DDD', backgroundColor: '#FAFAFA' },
  chipActive: { backgroundColor: '#1A73E8', borderColor: '#1A73E8' },
  chipText: { fontSize: 13, color: '#666' },
  chipTextActive: { color: '#FFF', fontWeight: '600' },
  checklistRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  checklistLabel: { fontSize: 14, color: '#333', marginLeft: 10, flex: 1 },
  medicalSection: { marginTop: 16, padding: 12, backgroundColor: '#F8F9FA', borderRadius: 8 },
  medicalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E8E8E8' },
  medicalLabel: { fontSize: 14, color: '#333', flex: 1 },
  yesNoRow: { flexDirection: 'row', gap: 8 },
  yesNoBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#DDD', backgroundColor: '#FFF' },
  yesActive: { backgroundColor: '#DC3545', borderColor: '#DC3545' },
  noActive: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  yesNoText: { fontSize: 13, color: '#666', fontWeight: '500' },
  yesNoTextActive: { color: '#FFF' },
  riskBadge: { marginTop: 12, padding: 10, borderRadius: 8, alignItems: 'center' },
  riskBadgeText: { fontSize: 14, fontWeight: '700' },
  continueBtn: { flexDirection: 'row', backgroundColor: '#1A73E8', borderRadius: 12, padding: 16, marginHorizontal: 16, marginVertical: 20, alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: '#1A73E8', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  continueBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  submitContainer: { padding: 16, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E0E0E0' },
  submitBtn: { flexDirection: 'row', backgroundColor: '#4CAF50', borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
