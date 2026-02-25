import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';
import ChecklistForm from '../../components/ChecklistForm';
import { useRouter } from 'expo-router';
import { format, addDays } from 'date-fns';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { PROCEDURE_TIME_SLOTS } from '../../constants/checklist';

export default function NewProcedureScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [instructors, setInstructors] = useState([]);
  const [implantIncharges, setImplantIncharges] = useState([]);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showInstructorDropdown, setShowInstructorDropdown] = useState(false);
  const [showInchargeDropdown, setShowInchargeDropdown] = useState(false);
  
  // Calculate minimum date (24 hours from now for students)
  const minDate = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  
  const [formData, setFormData] = useState({
    patient_name: '',
    registration_number: '',
    instructor_id: '',
    instructor_name: '',
    implant_incharge_id: '',
    implant_incharge_name: '',
    implant_site: '',
    receipt_number: '',
    amount_paid: '',
    procedure_date: minDate,
    procedure_time: '10:00',
    implant_specifications: '',
    bone_graft_specifications: '',
    remark: '',
  });

  const [checklist, setChecklist] = useState({});

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const usersRes = await api.get('/users');
      const allUsers = usersRes.data;
      
      // Instructors include: instructor role AND administrator role
      const instructorList = allUsers.filter((u: any) => 
        u.role === 'instructor' || u.role === 'administrator' || u.role === 'implant_incharge'
      );
      
      // Implant Incharges include: implant_incharge role AND administrator role
      const inchargeList = allUsers.filter((u: any) => 
        u.role === 'implant_incharge' || u.role === 'administrator'
      );
      
      setInstructors(instructorList);
      setImplantIncharges(inchargeList);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleInstructorChange = (instructorId: string) => {
    const instructor = instructors.find((i: any) => i.id === instructorId);
    setFormData((prev) => ({
      ...prev,
      instructor_id: instructorId,
      instructor_name: instructor ? (instructor as any).name : '',
    }));
  };

  const handleImplantInchargeChange = (inchargeId: string) => {
    const incharge = implantIncharges.find((i: any) => i.id === inchargeId);
    setFormData((prev) => ({
      ...prev,
      implant_incharge_id: inchargeId,
      implant_incharge_name: incharge ? (incharge as any).name : '',
    }));
  };

  const handleDateSelect = (day: any) => {
    setFormData((prev) => ({ ...prev, procedure_date: day.dateString }));
    setShowCalendar(false);
  };

  const validateForm = () => {
    const requiredFields = [
      { field: 'patient_name', label: 'Patient Name' },
      { field: 'registration_number', label: 'Registration Number' },
      { field: 'instructor_id', label: 'Instructor' },
      { field: 'implant_incharge_id', label: 'Implant Incharge' },
      { field: 'implant_site', label: 'Implant Site' },
      { field: 'receipt_number', label: 'Receipt Number' },
      { field: 'amount_paid', label: 'Amount Paid' },
      { field: 'procedure_date', label: 'Procedure Date' },
      { field: 'procedure_time', label: 'Procedure Time' },
      { field: 'implant_specifications', label: 'Implant Specifications' },
      { field: 'bone_graft_specifications', label: 'Bone Graft/Membrane Specifications' },
    ];

    for (const { field, label } of requiredFields) {
      if (!formData[field as keyof typeof formData]) {
        Alert.alert('Validation Error', `${label} is required`);
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const payload = {
        ...formData,
        student_name: user?.name || '',
        amount_paid: parseFloat(formData.amount_paid),
        checklist,
      };

      await api.post('/procedures', payload);
      Alert.alert('Success', 'Procedure submitted successfully!', [
        {
          text: 'OK',
          onPress: () => router.push('/(tabs)/procedures'),
        },
      ]);
    } catch (error: any) {
      console.error('Submit error:', error.response?.data);
      let errorMessage = 'Failed to submit procedure';
      if (error.response?.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          errorMessage = error.response.data.detail
            .map((e: any) => e.msg || e.message || JSON.stringify(e))
            .join('\n');
        } else {
          errorMessage = String(error.response.data.detail);
        }
      }
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const formatDisplayDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return format(date, 'EEEE, MMMM d, yyyy');
    } catch {
      return dateString;
    }
  };

  const getTimeSlotLabel = (value: string) => {
    const slot = PROCEDURE_TIME_SLOTS.find(s => s.value === value);
    return slot ? slot.label : value;
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.title}>New Procedure</Text>
            <Text style={styles.subtitle}>Fill in all required information</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.sectionTitle}>Patient Information</Text>

            <Text style={styles.label}>Patient Name *</Text>
            <TextInput
              style={styles.input}
              value={formData.patient_name}
              onChangeText={(value) => handleInputChange('patient_name', value)}
              placeholder="Enter patient name"
            />

            <Text style={styles.label}>Registration Number *</Text>
            <TextInput
              style={styles.input}
              value={formData.registration_number}
              onChangeText={(value) => handleInputChange('registration_number', value)}
              placeholder="Enter registration number"
            />

            <Text style={styles.label}>Implant Site *</Text>
            <TextInput
              style={styles.input}
              value={formData.implant_site}
              onChangeText={(value) => handleInputChange('implant_site', value)}
              placeholder="Enter implant site (e.g., #16)"
            />

            <Text style={styles.sectionTitle}>Medical Team</Text>

            <Text style={styles.label}>Instructor *</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={formData.instructor_id}
                onValueChange={handleInstructorChange}
                style={styles.picker}
              >
                <Picker.Item label="Select Instructor" value="" />
                {instructors.map((instructor: any) => (
                  <Picker.Item key={instructor.id} label={instructor.name} value={instructor.id} />
                ))}
              </Picker>
            </View>

            <Text style={styles.label}>Implant Incharge *</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={formData.implant_incharge_id}
                onValueChange={handleImplantInchargeChange}
                style={styles.picker}
              >
                <Picker.Item label="Select Implant Incharge" value="" />
                {implantIncharges.map((incharge: any) => (
                  <Picker.Item key={incharge.id} label={incharge.name} value={incharge.id} />
                ))}
              </Picker>
            </View>

            <Text style={styles.sectionTitle}>Payment Details</Text>

            <Text style={styles.label}>Receipt Number *</Text>
            <TextInput
              style={styles.input}
              value={formData.receipt_number}
              onChangeText={(value) => handleInputChange('receipt_number', value)}
              placeholder="Enter receipt number"
            />

            <Text style={styles.label}>Amount Paid (INR) *</Text>
            <TextInput
              style={styles.input}
              value={formData.amount_paid}
              onChangeText={(value) => handleInputChange('amount_paid', value)}
              placeholder="Enter amount"
              keyboardType="numeric"
            />

            <Text style={styles.sectionTitle}>Schedule</Text>

            <Text style={styles.label}>Procedure Date *</Text>
            <TouchableOpacity 
              style={styles.datePickerButton}
              onPress={() => setShowCalendar(true)}
            >
              <Ionicons name="calendar" size={20} color="#007AFF" />
              <Text style={styles.datePickerText}>{formatDisplayDate(formData.procedure_date)}</Text>
              <Ionicons name="chevron-down" size={20} color="#666" />
            </TouchableOpacity>
            <Text style={styles.helperText}>
              Note: Students must schedule at least 24 hours in advance
            </Text>

            <Text style={styles.label}>Procedure Time *</Text>
            <View style={styles.timeSlotContainer}>
              {PROCEDURE_TIME_SLOTS.map((slot) => (
                <TouchableOpacity
                  key={slot.value}
                  style={[
                    styles.timeSlotButton,
                    formData.procedure_time === slot.value && styles.timeSlotButtonActive,
                  ]}
                  onPress={() => handleInputChange('procedure_time', slot.value)}
                >
                  <Ionicons 
                    name="time" 
                    size={18} 
                    color={formData.procedure_time === slot.value ? '#FFF' : '#007AFF'} 
                  />
                  <Text
                    style={[
                      styles.timeSlotText,
                      formData.procedure_time === slot.value && styles.timeSlotTextActive,
                    ]}
                  >
                    {slot.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Implant Details (Mandatory)</Text>

            <Text style={styles.label}>Implant Specifications *</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.implant_specifications}
              onChangeText={(value) => handleInputChange('implant_specifications', value)}
              placeholder="Enter number of implants with specifications (company, length, diameter, etc.)"
              multiline
              numberOfLines={3}
            />

            <Text style={styles.label}>Bone Graft/Membrane Specifications *</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.bone_graft_specifications}
              onChangeText={(value) => handleInputChange('bone_graft_specifications', value)}
              placeholder="Enter bone graft/membrane specifications"
              multiline
              numberOfLines={3}
            />

            <Text style={styles.label}>Additional Remarks (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.remark}
              onChangeText={(value) => handleInputChange('remark', value)}
              placeholder="Enter any additional remarks"
              multiline
              numberOfLines={2}
            />

            <ChecklistForm 
              checklist={checklist} 
              onChecklistChange={setChecklist}
              phase={1}
            />

            <TouchableOpacity
              style={[styles.submitButton, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitButtonText}>Submit Procedure</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Calendar Modal */}
      <Modal
        visible={showCalendar}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCalendar(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.calendarModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Date</Text>
              <TouchableOpacity onPress={() => setShowCalendar(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <Calendar
              minDate={minDate}
              onDayPress={handleDateSelect}
              markedDates={{
                [formData.procedure_date]: { selected: true, selectedColor: '#007AFF' },
              }}
              theme={{
                todayTextColor: '#007AFF',
                selectedDayBackgroundColor: '#007AFF',
                arrowColor: '#007AFF',
              }}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  form: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginTop: 16,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#FAFAFA',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
    overflow: 'hidden',
  },
  picker: {
    height: 50,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#FAFAFA',
    gap: 8,
  },
  datePickerText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  helperText: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
    fontStyle: 'italic',
  },
  timeSlotContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  timeSlotButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    backgroundColor: '#FFF',
  },
  timeSlotButtonActive: {
    backgroundColor: '#007AFF',
  },
  timeSlotText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  timeSlotTextActive: {
    color: '#FFF',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  calendarModal: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
});
