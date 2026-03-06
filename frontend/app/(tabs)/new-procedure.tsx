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
import BackToDashboard from '../../components/BackToDashboard';
import { useRouter } from 'expo-router';
import { format, addDays } from 'date-fns';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { PROCEDURE_TIME_SLOTS } from '../../constants/checklist';
import * as DocumentPicker from 'expo-document-picker';

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
    supervisor_id: '',
    supervisor_name: '',
    implant_incharge_id: '',
    implant_incharge_name: '',
    implant_site: '',
    receipt_number: '',
    amount_paid: '',
    procedure_date: minDate,
    procedure_time: '10:00',
    implant_region: '',
    implant_company: '',
    bone_graft_specifications: '',
    remark: '',
  });

  const [checklist, setChecklist] = useState({});
  const [fieldErrors, setFieldErrors] = useState<{[key: string]: boolean}>({});
  const [cbctFile, setCbctFile] = useState<any>(null);
  const [iosFile, setIosFile] = useState<any>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const usersRes = await api.get('/users');
      const allUsers = usersRes.data;
      
      // Supervisors include: supervisor role AND administrator role (Dr. Abhijit Patil appears here too)
      const supervisorList = allUsers.filter((u: any) => 
        u.role === 'supervisor' || u.role === 'administrator' || u.role === 'implant_incharge'
      );
      
      // Implant Incharges include: implant_incharge role AND administrator role
      const inchargeList = allUsers.filter((u: any) => 
        u.role === 'implant_incharge' || u.role === 'administrator'
      );
      
      setInstructors(supervisorList);
      setImplantIncharges(inchargeList);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when field is filled
    if (value) {
      setFieldErrors((prev) => ({ ...prev, [field]: false }));
    }
  };

  const handleInstructorChange = (supervisorId: string) => {
    const supervisor = instructors.find((i: any) => i.id === supervisorId);
    setFormData((prev) => ({
      ...prev,
      supervisor_id: supervisorId,
      supervisor_name: supervisor ? (supervisor as any).name : '',
    }));
    // Clear error when field is filled
    if (supervisorId) {
      setFieldErrors((prev) => ({ ...prev, supervisor_id: false }));
    }
  };

  const handleImplantInchargeChange = (inchargeId: string) => {
    const incharge = implantIncharges.find((i: any) => i.id === inchargeId);
    setFormData((prev) => ({
      ...prev,
      implant_incharge_id: inchargeId,
      implant_incharge_name: incharge ? (incharge as any).name : '',
    }));
    // Clear error when field is filled
    if (inchargeId) {
      setFieldErrors((prev) => ({ ...prev, implant_incharge_id: false }));
    }
  };

  const handleDateSelect = (day: any) => {
    // Block Sundays
    const selectedDate = new Date(day.dateString);
    if (selectedDate.getUTCDay() === 0) {
      Alert.alert('Not Available', 'No scheduling is available on Sundays.');
      return;
    }
    // If Saturday, auto-set time to 9:30 AM
    if (selectedDate.getUTCDay() === 6) {
      setFormData((prev) => ({ ...prev, procedure_date: day.dateString, procedure_time: '09:30' }));
    } else {
      setFormData((prev) => ({ ...prev, procedure_date: day.dateString }));
    }
    setShowCalendar(false);
  };

  const isSaturday = () => {
    try {
      const d = new Date(formData.procedure_date);
      return d.getUTCDay() === 6;
    } catch { return false; }
  };

  const getAvailableTimeSlots = () => {
    if (isSaturday()) {
      return PROCEDURE_TIME_SLOTS.filter(s => s.value === '09:30');
    }
    return PROCEDURE_TIME_SLOTS.filter(s => s.value !== '09:30');
  };

  const validateForm = () => {
    const requiredFields = [
      { field: 'patient_name', label: 'Patient Name' },
      { field: 'registration_number', label: 'Registration Number' },
      { field: 'supervisor_id', label: 'Supervisor' },
      { field: 'implant_incharge_id', label: 'Implant Incharge' },
      { field: 'implant_site', label: 'Implant Site' },
      { field: 'receipt_number', label: 'Receipt Number' },
      { field: 'amount_paid', label: 'Amount Paid' },
      { field: 'procedure_date', label: 'Procedure Date' },
      { field: 'procedure_time', label: 'Procedure Time' },
      { field: 'implant_region', label: 'Implant Region' },
      { field: 'implant_company', label: 'Implant Company' },
      { field: 'bone_graft_specifications', label: 'Bone Graft/Membrane Specifications' },
    ];

    const errors: {[key: string]: boolean} = {};
    const missingFields: string[] = [];

    for (const { field, label } of requiredFields) {
      if (!formData[field as keyof typeof formData]) {
        errors[field] = true;
        missingFields.push(label);
      }
    }

    if (!iosFile) {
      missingFields.push('IOS or Intra-oral Photos');
    }
    if (!cbctFile) {
      missingFields.push('CBCT Slides and Report');
    }

    setFieldErrors(errors);

    if (missingFields.length > 0) {
      Alert.alert(
        'Required Fields Missing', 
        `Please fill in the following fields:\n\n• ${missingFields.join('\n• ')}`
      );
      return false;
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

      const res = await api.post('/procedures', payload);
      const procedureId = res.data?.id || res.data?._id;

      // Upload IOS file if selected
      if (iosFile && procedureId) {
        try {
          setUploading(true);
          const iosForm = new FormData();
          iosForm.append('file', {
            uri: iosFile.uri,
            name: iosFile.name,
            type: iosFile.mimeType || 'application/octet-stream',
          } as any);
          await api.post(`/procedures/${procedureId}/upload-ios`, iosForm, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch (uploadErr) {
          console.error('IOS upload error:', uploadErr);
          Alert.alert('Warning', 'Procedure created but IOS photo upload failed.');
        } finally {
          setUploading(false);
        }
      }

      // Upload CBCT file if selected
      if (cbctFile && procedureId) {
        try {
          setUploading(true);
          const uploadForm = new FormData();
          uploadForm.append('file', {
            uri: cbctFile.uri,
            name: cbctFile.name,
            type: cbctFile.mimeType || 'application/octet-stream',
          } as any);
          await api.post(`/procedures/${procedureId}/upload-cbct`, uploadForm, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch (uploadErr) {
          console.error('CBCT upload error:', uploadErr);
          Alert.alert('Warning', 'Procedure created but CBCT file upload failed. You can re-upload later.');
        } finally {
          setUploading(false);
        }
      }

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

  const pickCbctFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/png', 'image/jpeg', 'image/heif', 'image/heic'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        if (file.size && file.size > 25 * 1024 * 1024) {
          Alert.alert('File Too Large', 'Maximum file size is 25MB');
          return;
        }
        setCbctFile(file);
      }
    } catch (err) {
      console.error('Document picker error:', err);
    }
  };

  const pickIosFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/png', 'image/jpeg', 'image/heif', 'image/heic'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        if (file.size && file.size > 25 * 1024 * 1024) {
          Alert.alert('File Too Large', 'Maximum file size is 25MB');
          return;
        }
        setIosFile(file);
      }
    } catch (err) {
      console.error('Document picker error:', err);
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
      <BackToDashboard />
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
              style={[styles.input, fieldErrors.patient_name && styles.inputError]}
              value={formData.patient_name}
              onChangeText={(value) => handleInputChange('patient_name', value)}
              placeholder="Enter patient name"
            />

            <Text style={styles.label}>Registration Number *</Text>
            <TextInput
              style={[styles.input, fieldErrors.registration_number && styles.inputError]}
              value={formData.registration_number}
              onChangeText={(value) => handleInputChange('registration_number', value)}
              placeholder="Enter registration number"
            />

            <Text style={styles.label}>Implant Site *</Text>
            <TextInput
              style={[styles.input, fieldErrors.implant_site && styles.inputError]}
              value={formData.implant_site}
              onChangeText={(value) => handleInputChange('implant_site', value)}
              placeholder="Enter implant site (e.g., #16)"
            />

            <Text style={styles.sectionTitle}>Faculty</Text>

            <Text style={styles.label}>Supervisor *</Text>
            <TouchableOpacity 
              style={[styles.dropdownButton, fieldErrors.supervisor_id && styles.inputError]}
              onPress={() => setShowInstructorDropdown(true)}
            >
              <Text style={formData.supervisor_name ? styles.dropdownText : styles.dropdownPlaceholder}>
                {formData.supervisor_name || 'Select Supervisor'}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#666" />
            </TouchableOpacity>

            <Text style={styles.label}>Implant Incharge *</Text>
            <TouchableOpacity 
              style={[styles.dropdownButton, fieldErrors.implant_incharge_id && styles.inputError]}
              onPress={() => setShowInchargeDropdown(true)}
            >
              <Text style={formData.implant_incharge_name ? styles.dropdownText : styles.dropdownPlaceholder}>
                {formData.implant_incharge_name || 'Select Implant Incharge'}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#666" />
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Payment Details</Text>

            <Text style={styles.label}>Receipt Number *</Text>
            <TextInput
              style={[styles.input, fieldErrors.receipt_number && styles.inputError]}
              value={formData.receipt_number}
              onChangeText={(value) => handleInputChange('receipt_number', value)}
              placeholder="Enter receipt number"
            />

            <Text style={styles.label}>Amount Paid (INR) *</Text>
            <TextInput
              style={[styles.input, fieldErrors.amount_paid && styles.inputError]}
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
              Note: Students must schedule at least 24 hours in advance. No scheduling on Sundays. Saturdays: 9:30 AM only.
            </Text>

            <Text style={styles.label}>Procedure Time *</Text>
            <View style={styles.timeSlotContainer}>
              {getAvailableTimeSlots().map((slot) => (
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

            <Text style={styles.sectionTitle}>IOS or Intra-oral Photos *</Text>
            <TouchableOpacity
              style={styles.filePickerButton}
              onPress={pickIosFile}
              data-testid="ios-file-picker"
            >
              <Ionicons name="camera" size={22} color={iosFile ? '#4CAF50' : '#007AFF'} />
              <View style={{ flex: 1 }}>
                <Text style={iosFile ? styles.filePickerTextSelected : styles.filePickerText}>
                  {iosFile ? iosFile.name : 'Tap to select photo'}
                </Text>
                <Text style={styles.helperText}>
                  PNG, JPEG, HEIF (Max 25MB)
                </Text>
              </View>
              {iosFile && (
                <TouchableOpacity
                  onPress={() => setIosFile(null)}
                  style={styles.fileRemoveBtn}
                  data-testid="ios-file-remove"
                >
                  <Ionicons name="close-circle" size={22} color="#F44336" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>CBCT Slides and Report *</Text>
            <TouchableOpacity
              style={styles.filePickerButton}
              onPress={pickCbctFile}
              data-testid="cbct-file-picker"
            >
              <Ionicons name="document-attach" size={22} color={cbctFile ? '#4CAF50' : '#007AFF'} />
              <View style={{ flex: 1 }}>
                <Text style={cbctFile ? styles.filePickerTextSelected : styles.filePickerText}>
                  {cbctFile ? cbctFile.name : 'Tap to select file'}
                </Text>
                <Text style={styles.helperText}>
                  PDF, PNG, JPEG, HEIF (Max 25MB)
                </Text>
              </View>
              {cbctFile && (
                <TouchableOpacity
                  onPress={() => setCbctFile(null)}
                  style={styles.fileRemoveBtn}
                  data-testid="cbct-file-remove"
                >
                  <Ionicons name="close-circle" size={22} color="#F44336" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Implant Details (Mandatory)</Text>

            <Text style={styles.label}>Implant Region *</Text>
            <TextInput
              style={[styles.input, fieldErrors.implant_region && styles.inputError]}
              value={formData.implant_region}
              onChangeText={(value) => handleInputChange('implant_region', value)}
              placeholder="Enter implant region (e.g., Lower Right Molar)"
            />

            <Text style={styles.label}>Implant Company *</Text>
            <TextInput
              style={[styles.input, fieldErrors.implant_company && styles.inputError]}
              value={formData.implant_company}
              onChangeText={(value) => handleInputChange('implant_company', value)}
              placeholder="Enter implant company (e.g., Nobel Biocare)"
            />

            <Text style={styles.label}>Bone Graft/Membrane Specifications *</Text>
            <TextInput
              style={[styles.input, styles.textArea, fieldErrors.bone_graft_specifications && styles.inputError]}
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

      {/* Supervisor Dropdown Modal */}
      <Modal
        visible={showInstructorDropdown}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowInstructorDropdown(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.dropdownModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Supervisor</Text>
              <TouchableOpacity onPress={() => setShowInstructorDropdown(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={instructors}
              keyExtractor={(item: any) => item.id}
              renderItem={({ item }: any) => (
                <TouchableOpacity
                  style={[
                    styles.dropdownItem,
                    formData.supervisor_id === item.id && styles.dropdownItemSelected,
                  ]}
                  onPress={() => {
                    handleInstructorChange(item.id);
                    setShowInstructorDropdown(false);
                  }}
                >
                  <View style={styles.dropdownItemContent}>
                    <Ionicons 
                      name="person-circle" 
                      size={32} 
                      color={formData.supervisor_id === item.id ? '#007AFF' : '#666'} 
                    />
                    <View>
                      <Text style={[
                        styles.dropdownItemText,
                        formData.supervisor_id === item.id && styles.dropdownItemTextSelected,
                      ]}>
                        {item.name}
                      </Text>
                      <Text style={styles.dropdownItemRole}>{item.role}</Text>
                    </View>
                  </View>
                  {formData.supervisor_id === item.id && (
                    <Ionicons name="checkmark-circle" size={24} color="#007AFF" />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Implant Incharge Dropdown Modal */}
      <Modal
        visible={showInchargeDropdown}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowInchargeDropdown(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.dropdownModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Implant Incharge</Text>
              <TouchableOpacity onPress={() => setShowInchargeDropdown(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={implantIncharges}
              keyExtractor={(item: any) => item.id}
              renderItem={({ item }: any) => (
                <TouchableOpacity
                  style={[
                    styles.dropdownItem,
                    formData.implant_incharge_id === item.id && styles.dropdownItemSelected,
                  ]}
                  onPress={() => {
                    handleImplantInchargeChange(item.id);
                    setShowInchargeDropdown(false);
                  }}
                >
                  <View style={styles.dropdownItemContent}>
                    <Ionicons 
                      name="person-circle" 
                      size={32} 
                      color={formData.implant_incharge_id === item.id ? '#007AFF' : '#666'} 
                    />
                    <View>
                      <Text style={[
                        styles.dropdownItemText,
                        formData.implant_incharge_id === item.id && styles.dropdownItemTextSelected,
                      ]}>
                        {item.name}
                      </Text>
                      <Text style={styles.dropdownItemRole}>{item.role}</Text>
                    </View>
                  </View>
                  {formData.implant_incharge_id === item.id && (
                    <Ionicons name="checkmark-circle" size={24} color="#007AFF" />
                  )}
                </TouchableOpacity>
              )}
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
  inputError: {
    borderColor: '#DC3545',
    borderWidth: 2,
    backgroundColor: '#FFF5F5',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 14,
    backgroundColor: '#FAFAFA',
  },
  dropdownText: {
    fontSize: 16,
    color: '#333',
  },
  dropdownPlaceholder: {
    fontSize: 16,
    color: '#999',
  },
  dropdownModal: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    maxHeight: '70%',
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  dropdownItemSelected: {
    backgroundColor: '#F0F8FF',
  },
  dropdownItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  dropdownItemTextSelected: {
    color: '#007AFF',
  },
  dropdownItemRole: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
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
  filePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#DDD',
    borderRadius: 10,
    borderStyle: 'dashed',
    padding: 14,
    backgroundColor: '#FAFAFA',
    gap: 10,
  },
  filePickerText: {
    fontSize: 15,
    color: '#999',
  },
  filePickerTextSelected: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  fileRemoveBtn: {
    padding: 4,
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
