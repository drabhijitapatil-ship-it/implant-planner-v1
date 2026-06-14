import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
  Modal, FlatList, Pressable, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import api from '../../utils/api';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
  'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman & Nicobar Islands', 'Chandigarh', 'Dadra & Nagar Haveli and Daman & Diu',
  'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

const PREFIXES = ['Dr.', 'Mr.', 'Mrs.', 'Ms.'];

const USER_RANGES = [
  { label: '1 – 5 users', value: 5 },
  { label: '6 – 10 users', value: 10 },
  { label: '11 – 15 users', value: 15 },
  { label: '16 – 20 users', value: 20 },
  { label: '21 – 25 users', value: 25 },
  { label: '26 – 50 users', value: 50 },
  { label: '51+ users', value: 100 },
];

type InfoType = 'chief' | 'users' | null;
type PickerType = 'regState' | 'practiceState' | null;

export default function ClinicRegisterScreen() {
  const router = useRouter();

  const [clinicName, setClinicName] = useState('');
  const [prefix, setPrefix] = useState('Dr.');
  const [chiefName, setChiefName] = useState('');
  const [email, setEmail] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [regState, setRegState] = useState('');
  const [practiceState, setPracticeState] = useState('');
  const [numUsers, setNumUsers] = useState<number | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const [activePicker, setActivePicker] = useState<PickerType>(null);
  const [showPrefixPicker, setShowPrefixPicker] = useState(false);
  const [showUserRangePicker, setShowUserRangePicker] = useState(false);
  const [infoModal, setInfoModal] = useState<InfoType>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!clinicName.trim()) e.clinicName = 'Clinic name is required';
    if (!chiefName.trim()) e.chiefName = 'Name is required';
    if (!email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Invalid email address';
    if (!regNumber.trim()) e.regNumber = 'Registration number is required';
    if (!regState) e.regState = 'State of registration is required';
    if (!practiceState) e.practiceState = 'State of practice is required';
    if (!numUsers) e.numUsers = 'Please select number of users';
    if (!password) e.password = 'Password is required';
    else if (password.length < 8) e.password = 'Minimum 8 characters';
    if (password !== confirmPassword) e.confirmPassword = 'Passwords do not match';
    if (!termsAccepted) e.terms = 'Please accept the Terms & Privacy Policy';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSignup = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await api.post('/auth/signup', {
        org_type: 'clinic',
        email: email.trim().toLowerCase(),
        password,
        clinic_data: {
          clinic_name: clinicName.trim(),
          chief_dentist_name: chiefName.trim(),
          chief_dentist_prefix: prefix,
          registration_number: regNumber.trim(),
          state_of_registration: regState,
          state_of_practice: practiceState,
          num_users: numUsers,
        },
      });
      setShowSuccess(true);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      Alert.alert('Signup Failed', typeof detail === 'string' ? detail : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const selectedRangeLabel = USER_RANGES.find(r => r.value === numUsers)?.label ?? '';

  return (
    <LinearGradient colors={['#F0F9F4', '#E8F5E9', '#C8E6C9']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

            <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={22} color="#2E7D32" />
            </TouchableOpacity>

            <View style={s.headerRow}>
              <Ionicons name="business" size={30} color="#2E7D32" />
              <Text style={s.title}>Set Up Clinic Workspace</Text>
            </View>
            <Text style={s.subtitle}>Create your dental clinic workspace on Implanr</Text>

            <View style={s.card}>

              {/* Clinic Name */}
              <Text style={s.label}>Dental Clinic Name *</Text>
              <TextInput
                style={[s.input, errors.clinicName && s.inputErr]}
                placeholder="e.g. Smile Dental Clinic"
                value={clinicName}
                onChangeText={setClinicName}
                autoCapitalize="words"
              />
              {errors.clinicName ? <Text style={s.err}>{errors.clinicName}</Text> : null}

              {/* Chief Dentist Name */}
              <View style={s.labelRow}>
                <Text style={s.label}>Chief Dentist / Owner Name *</Text>
                <TouchableOpacity onPress={() => setInfoModal('chief')}>
                  <Ionicons name="information-circle-outline" size={19} color="#2E7D32" />
                </TouchableOpacity>
              </View>
              <View style={s.prefixRow}>
                <TouchableOpacity style={s.prefixBtn} onPress={() => setShowPrefixPicker(true)}>
                  <Text style={s.prefixTxt}>{prefix}</Text>
                  <Ionicons name="chevron-down" size={14} color="#666" />
                </TouchableOpacity>
                <TextInput
                  style={[s.nameInput, errors.chiefName && s.inputErr]}
                  placeholder="Full name"
                  value={chiefName}
                  onChangeText={setChiefName}
                  autoCapitalize="words"
                />
              </View>
              {errors.chiefName ? <Text style={s.err}>{errors.chiefName}</Text> : null}

              {/* Email */}
              <Text style={s.label}>Email *</Text>
              <TextInput
                style={[s.input, errors.email && s.inputErr]}
                placeholder="clinic@email.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {errors.email ? <Text style={s.err}>{errors.email}</Text> : null}

              {/* Registration Number */}
              <Text style={s.label}>Registration Number *</Text>
              <TextInput
                style={[s.input, errors.regNumber && s.inputErr]}
                placeholder="Dental registration number"
                value={regNumber}
                onChangeText={setRegNumber}
                autoCapitalize="characters"
              />
              {errors.regNumber ? <Text style={s.err}>{errors.regNumber}</Text> : null}

              {/* State of Registration */}
              <Text style={s.label}>State of Registration *</Text>
              <TouchableOpacity
                style={[s.picker, errors.regState && s.inputErr]}
                onPress={() => setActivePicker('regState')}
              >
                <Text style={regState ? s.pickerVal : s.pickerPH}>{regState || 'Select state'}</Text>
                <Ionicons name="chevron-down" size={18} color="#666" />
              </TouchableOpacity>
              {errors.regState ? <Text style={s.err}>{errors.regState}</Text> : null}

              {/* State of Practice */}
              <Text style={s.label}>State of Practice *</Text>
              <TouchableOpacity
                style={[s.picker, errors.practiceState && s.inputErr]}
                onPress={() => setActivePicker('practiceState')}
              >
                <Text style={practiceState ? s.pickerVal : s.pickerPH}>{practiceState || 'Select state'}</Text>
                <Ionicons name="chevron-down" size={18} color="#666" />
              </TouchableOpacity>
              {errors.practiceState ? <Text style={s.err}>{errors.practiceState}</Text> : null}

              {/* Number of Users */}
              <View style={s.labelRow}>
                <Text style={s.label}>Number of People Using the App *</Text>
                <TouchableOpacity onPress={() => setInfoModal('users')}>
                  <Ionicons name="information-circle-outline" size={19} color="#2E7D32" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[s.picker, errors.numUsers && s.inputErr]}
                onPress={() => setShowUserRangePicker(true)}
              >
                <Text style={numUsers ? s.pickerVal : s.pickerPH}>{selectedRangeLabel || 'Select range'}</Text>
                <Ionicons name="chevron-down" size={18} color="#666" />
              </TouchableOpacity>
              {errors.numUsers ? <Text style={s.err}>{errors.numUsers}</Text> : null}

              {/* Password */}
              <Text style={s.label}>Create Password *</Text>
              <View style={[s.pwRow, errors.password && s.inputErr]}>
                <TextInput
                  style={s.pwInput}
                  placeholder="Min. 8 characters"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
                </TouchableOpacity>
              </View>
              {errors.password ? <Text style={s.err}>{errors.password}</Text> : null}

              <Text style={s.label}>Confirm Password *</Text>
              <View style={[s.pwRow, errors.confirmPassword && s.inputErr]}>
                <TextInput
                  style={s.pwInput}
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)}>
                  <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
                </TouchableOpacity>
              </View>
              {errors.confirmPassword ? <Text style={s.err}>{errors.confirmPassword}</Text> : null}

              {/* Terms */}
              <TouchableOpacity style={s.termsRow} onPress={() => setTermsAccepted(!termsAccepted)} activeOpacity={0.8}>
                <Ionicons
                  name={termsAccepted ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={termsAccepted ? '#2E7D32' : '#90A4AE'}
                />
                <Text style={s.termsTxt}>
                  I agree to the{' '}
                  <Text style={s.link} onPress={() => router.push('/legal/terms')}>Terms of Service</Text>
                  {' '}and{' '}
                  <Text style={s.link} onPress={() => router.push('/legal/privacy-policy')}>Privacy Policy</Text>
                </Text>
              </TouchableOpacity>
              {errors.terms ? <Text style={s.err}>{errors.terms}</Text> : null}

              {/* Submit */}
              <TouchableOpacity
                style={[s.submitBtn, loading && s.btnDisabled]}
                onPress={handleSignup}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#FFF" />
                  : <Text style={s.submitTxt}>Create Dental Clinic Workspace</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity style={s.loginLink} onPress={() => router.replace('/auth/login')}>
                <Text style={s.loginLinkTxt}>Already have an account? Sign In</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* State Pickers */}
      <Modal visible={activePicker !== null} animationType="slide" transparent>
        <View style={s.sheetOverlay}>
          <View style={s.sheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>
                {activePicker === 'regState' ? 'State of Registration' : 'State of Practice'}
              </Text>
              <TouchableOpacity onPress={() => setActivePicker(null)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={INDIAN_STATES}
              keyExtractor={item => item}
              renderItem={({ item }) => {
                const sel = activePicker === 'regState' ? regState === item : practiceState === item;
                return (
                  <TouchableOpacity
                    style={[s.stateItem, sel && s.stateItemSel]}
                    onPress={() => {
                      if (activePicker === 'regState') setRegState(item);
                      else setPracticeState(item);
                      setActivePicker(null);
                    }}
                  >
                    <Text style={[s.stateTxt, sel && s.stateTxtSel]}>{item}</Text>
                    {sel && <Ionicons name="checkmark" size={18} color="#2E7D32" />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* User Range Picker */}
      <Modal visible={showUserRangePicker} animationType="slide" transparent>
        <View style={s.sheetOverlay}>
          <View style={s.sheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Number of Users</Text>
              <TouchableOpacity onPress={() => setShowUserRangePicker(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            {USER_RANGES.map(r => (
              <TouchableOpacity
                key={r.value}
                style={[s.stateItem, numUsers === r.value && s.stateItemSel]}
                onPress={() => { setNumUsers(r.value); setShowUserRangePicker(false); }}
              >
                <Text style={[s.stateTxt, numUsers === r.value && s.stateTxtSel]}>{r.label}</Text>
                {numUsers === r.value && <Ionicons name="checkmark" size={18} color="#2E7D32" />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Prefix Picker */}
      <Modal visible={showPrefixPicker} animationType="fade" transparent>
        <Pressable style={s.centeredOverlay} onPress={() => setShowPrefixPicker(false)}>
          <View style={s.prefixSheet}>
            {PREFIXES.map(p => (
              <TouchableOpacity
                key={p}
                style={[s.prefixItem, prefix === p && s.prefixItemSel]}
                onPress={() => { setPrefix(p); setShowPrefixPicker(false); }}
              >
                <Text style={[s.prefixItemTxt, prefix === p && s.prefixItemTxtSel]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Info Modal */}
      <Modal visible={!!infoModal} animationType="fade" transparent>
        <Pressable style={s.centeredOverlay} onPress={() => setInfoModal(null)}>
          <View style={s.infoCard}>
            <Ionicons name="information-circle" size={28} color="#2E7D32" style={{ marginBottom: 8 }} />
            {infoModal === 'chief' ? (
              <>
                <Text style={s.infoTitle}>About Chief Dentist / Owner</Text>
                <Text style={s.infoBody}>
                  The Chief Dentist or Owner is the primary admin of your clinic workspace. They have full access to all cases, reports, and user management. They can add dentists and auxiliary staff. A maximum of 2 Chief Dentists are allowed per clinic.
                </Text>
              </>
            ) : (
              <>
                <Text style={s.infoTitle}>Number of Users</Text>
                <Text style={s.infoBody}>
                  Count everyone who will use the app — Chief Dentists, Dentists / Consultants, and Auxiliary Staff (Nurses, Receptionists). This helps plan your workspace capacity.
                </Text>
              </>
            )}
            <TouchableOpacity style={s.infoCloseBtn} onPress={() => setInfoModal(null)}>
              <Text style={s.infoCloseTxt}>Got it</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ── Success Modal ── */}
      <Modal visible={showSuccess} animationType="fade" transparent statusBarTranslucent>
        <View style={s.successOverlay}>
          <View style={s.successCard}>
            <View style={s.successIconWrap}>
              <Ionicons name="checkmark-circle" size={72} color="#2E7D32" />
            </View>
            <Text style={s.successTitle}>Workspace Created!</Text>
            <Text style={s.successBody}>
              Your clinic workspace has been set up successfully. Sign in with your credentials to get started.
            </Text>
            <TouchableOpacity
              style={s.successBtn}
              onPress={() => {
                setShowSuccess(false);
                router.replace('/auth/login');
              }}
            >
              <Text style={s.successBtnTxt}>Go to Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 48 },
  backBtn: { marginBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  title: { fontSize: 21, fontWeight: '700', color: '#1A1A2E', flex: 1 },
  subtitle: { fontSize: 13, color: '#546E7A', marginBottom: 20 },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  label: { fontSize: 13, fontWeight: '600', color: '#37474F', marginBottom: 6, marginTop: 14 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#1A1A2E', backgroundColor: '#FAFAFA' },
  inputErr: { borderColor: '#FF3B30' },
  err: { fontSize: 12, color: '#FF3B30', marginTop: 3 },
  picker: { borderWidth: 1.5, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FAFAFA' },
  pickerVal: { fontSize: 15, color: '#1A1A2E' },
  pickerPH: { fontSize: 15, color: '#94A3B8' },
  prefixRow: { flexDirection: 'row', gap: 8 },
  prefixBtn: { borderWidth: 1.5, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FAFAFA' },
  prefixTxt: { fontSize: 15, color: '#1A1A2E', fontWeight: '600' },
  nameInput: { flex: 1, borderWidth: 1.5, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#1A1A2E', backgroundColor: '#FAFAFA' },
  pwRow: { borderWidth: 1.5, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFAFA' },
  pwInput: { flex: 1, fontSize: 15, color: '#1A1A2E', paddingVertical: 8 },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 18 },
  termsTxt: { flex: 1, fontSize: 13, color: '#546E7A', lineHeight: 20 },
  link: { color: '#2E7D32', fontWeight: '600' },
  submitBtn: { backgroundColor: '#2E7D32', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  btnDisabled: { opacity: 0.6 },
  submitTxt: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  loginLink: { alignItems: 'center', marginTop: 16 },
  loginLinkTxt: { color: '#2E7D32', fontSize: 14 },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A2E' },
  stateItem: { paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  stateItemSel: { backgroundColor: '#E8F5E9' },
  stateTxt: { fontSize: 15, color: '#37474F' },
  stateTxtSel: { color: '#2E7D32', fontWeight: '600' },
  centeredOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  prefixSheet: { backgroundColor: '#FFF', borderRadius: 14, padding: 8, minWidth: 150 },
  prefixItem: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  prefixItemSel: { backgroundColor: '#E8F5E9' },
  prefixItemTxt: { fontSize: 15, color: '#37474F' },
  prefixItemTxtSel: { color: '#2E7D32', fontWeight: '700' },
  infoCard: { backgroundColor: '#FFF', borderRadius: 16, margin: 30, padding: 24, alignItems: 'center', maxWidth: 340 },
  infoTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A2E', marginBottom: 10, textAlign: 'center' },
  infoBody: { fontSize: 14, color: '#546E7A', textAlign: 'center', lineHeight: 22 },
  infoCloseBtn: { marginTop: 18, backgroundColor: '#2E7D32', borderRadius: 10, paddingHorizontal: 28, paddingVertical: 10 },
  infoCloseTxt: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  // Success modal
  successOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  successCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 32, alignItems: 'center', width: '100%', maxWidth: 360, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 12 },
  successIconWrap: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  successTitle: { fontSize: 24, fontWeight: '800', color: '#1A1A2E', marginBottom: 12, textAlign: 'center' },
  successBody: { fontSize: 15, color: '#546E7A', textAlign: 'center', lineHeight: 24, marginBottom: 28 },
  successBtn: { backgroundColor: '#2E7D32', borderRadius: 14, paddingVertical: 15, paddingHorizontal: 40, alignItems: 'center', width: '100%' },
  successBtnTxt: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
