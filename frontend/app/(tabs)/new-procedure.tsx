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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';
import ChecklistForm from '../../components/ChecklistForm';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';

export default function NewProcedureScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [instructors, setInstructors] = useState([]);
  const [implantIncharges, setImplantIncharges] = useState([]);
  
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
    procedure_date: format(new Date(), 'yyyy-MM-dd'),
    procedure_time: '09:30',
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
      // Get all users and filter by role
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
      instructor_name: instructor?.name || '',
    }));
  };

  const handleImplantInchargeChange = (inchargeId: string) => {
    const incharge = implantIncharges.find((i: any) => i.id === inchargeId);
    setFormData((prev) => ({
      ...prev,
      implant_incharge_id: inchargeId,
      implant_incharge_name: incharge?.name || '',
    }));
  };

  const validateForm = () => {
    const required = [
      'patient_name',
      'registration_number',
      'instructor_id',
      'implant_incharge_id',
      'implant_site',
      'receipt_number',
      'amount_paid',
      'procedure_date',
      'procedure_time',
    ];

    for (const field of required) {
      if (!formData[field as keyof typeof formData]) {
        Alert.alert('Validation Error', `Please fill in ${field.replace(/_/g, ' ')}`);
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
      Alert.alert('Error', error.response?.data?.detail || 'Failed to submit procedure');
    } finally {
      setLoading(false);
    }
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
              placeholder="Enter implant site (e.g., #16, #26)"
            />

            <Text style={styles.sectionTitle}>Staff Assignment</Text>

            <Text style={styles.label}>Instructor *</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={formData.instructor_id}
                onValueChange={handleInstructorChange}
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

            <Text style={styles.label}>Amount Paid *</Text>
            <TextInput
              style={styles.input}
              value={formData.amount_paid}
              onChangeText={(value) => handleInputChange('amount_paid', value)}
              placeholder="Enter amount paid"
              keyboardType="numeric"
            />

            <Text style={styles.sectionTitle}>Scheduling</Text>

            <Text style={styles.label}>Procedure Date *</Text>
            <TextInput
              style={styles.input}
              value={formData.procedure_date}
              onChangeText={(value) => handleInputChange('procedure_date', value)}
              placeholder="YYYY-MM-DD"
            />

            <Text style={styles.label}>Procedure Time *</Text>
            <TextInput
              style={styles.input}
              value={formData.procedure_time}
              onChangeText={(value) => handleInputChange('procedure_time', value)}
              placeholder="HH:MM (e.g., 09:30)"
            />

            <Text style={styles.sectionTitle}>Additional Information</Text>

            <Text style={styles.label}>Implant Specifications</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.implant_specifications}
              onChangeText={(value) => handleInputChange('implant_specifications', value)}
              placeholder="Company, length, diameter, etc."
              multiline
              numberOfLines={3}
            />

            <Text style={styles.label}>Bone Graft/Membrane Specifications</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.bone_graft_specifications}
              onChangeText={(value) => handleInputChange('bone_graft_specifications', value)}
              placeholder="If applicable"
              multiline
              numberOfLines={3}
            />

            <Text style={styles.label}>Remark</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.remark}
              onChangeText={(value) => handleInputChange('remark', value)}
              placeholder="Additional remarks"
              multiline
              numberOfLines={3}
            />
          </View>

          <ChecklistForm checklist={checklist} onChecklistChange={setChecklist} phase={1} />

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
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
    paddingBottom: 32,
  },
  header: {
    backgroundColor: '#FFF',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  form: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginTop: 16,
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: '#FFF',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    backgroundColor: '#FFF',
    overflow: 'hidden',
  },
  buttonContainer: {
    padding: 16,
  },
  submitButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
