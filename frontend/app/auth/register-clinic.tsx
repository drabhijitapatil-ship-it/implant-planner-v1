import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
  Modal, Pressable, Alert, Keyboard, FlatList, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import api from '../../utils/api';
import OtpEmailField from '../../components/OtpEmailField';
import { INDIAN_STATES } from '../../constants/indianStates';

const PREFIXES = ['Dr.', 'Mr.', 'Mrs.', 'Ms.', 'Prof.'];

export default function ClinicRegisterScreen() {
  const router = useRouter();

  const [logo, setLogo] = useState<string | null>(null);

  const [clinicName, setClinicName] = useState('');
  const [prefix, setPrefix] = useState('Dr.');
  const [chiefDentistName, setChiefDentistName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [checkingRegNumber, setCheckingRegNumber] = useState(false);
  const [stateOfRegistration, setStateOfRegistration] = useState('');
  const [stateOfPractice, setStateOfPractice] = useState('');
  const [numUsers, setNumUsers] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [showPrefixPicker, setShowPrefixPicker] = useState(false);
  const [statePicker, setStatePicker] = useState<'registration' | 'practice' | null>(null);
  const [infoModal, setInfoModal] = useState<'registration' | 'users' | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const checkRegistrationNumber = async () => {
    const num = registrationNumber.trim();
    if (!num) return;
    setCheckingRegNumber(true);
    try {
      const res = await api.get('/organizations/check-registration-number', { params: { number: num } });
      if (res.data?.exists) {
        setErrors((e) => ({ ...e, registrationNumber: 'This registration number is already onboarded' }));
      } else {
        setErrors((e) => {
          const { registrationNumber: _drop, ...rest } = e;
          return rest;
        });
      }
    } catch {
    } finally {
      setCheckingRegNumber(false);
    }
  };

  const handlePickLogo = async () => {
    // System photo picker needs no media-library permission (Play policy: READ_MEDIA_* removed).
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setLogo(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!clinicName.trim()) e.clinicName = 'Clinic name is required';
    if (!chiefDentistName.trim()) e.chiefDentistName = 'Name is required';
    if (!registrationNumber.trim()) e.registrationNumber = 'Registration number is required';
    else if (errors.registrationNumber) e.registrationNumber = errors.registrationNumber;
    if (!stateOfRegistration.trim()) e.stateOfRegistration = 'State of registration is required';
    if (!stateOfPractice.trim()) e.stateOfPractice = 'State of practice is required';
    const n = Number(numUsers);
    if (!numUsers || isNaN(n) || n < 1 || n > 500) e.numUsers = 'Enter a valid number (1–500)';
    if (!email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Invalid email address';
    else if (!emailVerified) e.email = 'Please verify your email';
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
      await api.post('/auth/signup', {
        org_type: 'clinic',
        email: email.trim().toLowerCase(),
        password,
        logo,
        clinic_data: {
          clinic_name: clinicName.trim(),
          chief_dentist_name: chiefDentistName.trim(),
          chief_dentist_prefix: prefix,
          registration_number: registrationNumber.trim(),
          state_of_registration: stateOfRegistration.trim(),
          state_of_practice: stateOfPractice.trim(),
          num_users: Number(numUsers),
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

  return (
    <LinearGradient colors={['#F4F9FD', '#EBF4FC', '#D6E9FA']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
        >
          <ScrollView
            contentContainerStyle={[
              s.scroll,
              Platform.OS === 'android' && keyboardHeight > 0 ? { paddingBottom: keyboardHeight + 20 } : null
            ]}
            keyboardShouldPersistTaps="handled"
          >

            <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={22} color="#2E7D32" />
            </TouchableOpacity>

            <View style={s.headerRow}>
              <Ionicons name="medkit" size={30} color="#2E7D32" />
              <Text style={s.title}>Set Up Clinic Workspace</Text>
            </View>
            <Text style={s.subtitle}>Create your dental clinic workspace on Implanr</Text>

            <View style={s.card}>

              {/* Logo (optional) */}
              <View style={s.logoRow}>
                <TouchableOpacity style={s.logoCircle} onPress={handlePickLogo}>
                  {logo ? (
                    <Image source={{ uri: logo }} style={s.logoImage} />
                  ) : (
                    <Ionicons name="image-outline" size={26} color="#90A4AE" />
                  )}
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={s.logoTitle}>Clinic Logo <Text style={s.optional}>(optional)</Text></Text>
                  <TouchableOpacity onPress={handlePickLogo}>
                    <Text style={s.logoAction}>{logo ? 'Change logo' : 'Upload logo'}</Text>
                  </TouchableOpacity>
                </View>
                {logo && (
                  <TouchableOpacity onPress={() => setLogo(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close-circle" size={22} color="#B0BEC5" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Clinic Name */}
              <Text style={s.label}>Clinic Name *</Text>
              <TextInput
                style={[s.input, errors.clinicName && s.inputErr]}
                placeholder="e.g. Smile Dental Clinic"
                value={clinicName}
                onChangeText={setClinicName}
                autoCapitalize="words"
              />
              {errors.clinicName ? <Text style={s.err}>{errors.clinicName}</Text> : null}

              {/* Chief Dentist Name */}
              <Text style={s.label}>Chief Dentist / Owner *</Text>
              <View style={s.prefixRow}>
                <TouchableOpacity style={s.prefixBtn} onPress={() => setShowPrefixPicker(true)}>
                  <Text style={s.prefixTxt}>{prefix}</Text>
                  <Ionicons name="chevron-down" size={14} color="#666" />
                </TouchableOpacity>
                <TextInput
                  style={[s.nameInput, errors.chiefDentistName && s.inputErr]}
                  placeholder="Full name"
                  value={chiefDentistName}
                  onChangeText={setChiefDentistName}
                  autoCapitalize="words"
                />
              </View>
              {errors.chiefDentistName ? <Text style={s.err}>{errors.chiefDentistName}</Text> : null}

              {/* Registration Number */}
              <View style={s.labelRow}>
                <Text style={s.label}>Registration Number *</Text>
                <TouchableOpacity onPress={() => setInfoModal('registration')}>
                  <Ionicons name="information-circle-outline" size={19} color="#2E7D32" />
                </TouchableOpacity>
              </View>
              <View style={[s.input, s.regNumberRow, errors.registrationNumber && s.inputErr]}>
                <TextInput
                  style={s.regNumberInput}
                  placeholder="e.g. DCI-12345"
                  value={registrationNumber}
                  onChangeText={(t) => { setRegistrationNumber(t); if (errors.registrationNumber) setErrors((e) => { const { registrationNumber: _d, ...rest } = e; return rest; }); }}
                  onBlur={checkRegistrationNumber}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                {checkingRegNumber ? <ActivityIndicator size="small" color="#2E7D32" /> : null}
              </View>
              {errors.registrationNumber ? <Text style={s.err}>{errors.registrationNumber}</Text> : null}

              {/* State of Registration */}
              <Text style={s.label}>State of Registration *</Text>
              <TouchableOpacity
                style={[s.input, s.pickerRow, errors.stateOfRegistration && s.inputErr]}
                onPress={() => setStatePicker('registration')}
              >
                <Text style={stateOfRegistration ? s.pickerValueTxt : s.pickerPlaceholderTxt}>
                  {stateOfRegistration || 'Select state'}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#666" />
              </TouchableOpacity>
              {errors.stateOfRegistration ? <Text style={s.err}>{errors.stateOfRegistration}</Text> : null}

              {/* State of Practice */}
              <Text style={s.label}>State of Practice *</Text>
              <TouchableOpacity
                style={[s.input, s.pickerRow, errors.stateOfPractice && s.inputErr]}
                onPress={() => setStatePicker('practice')}
              >
                <Text style={stateOfPractice ? s.pickerValueTxt : s.pickerPlaceholderTxt}>
                  {stateOfPractice || 'Select state'}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#666" />
              </TouchableOpacity>
              {!stateOfPractice && stateOfRegistration ? (
                <TouchableOpacity style={s.sameAsBtn} onPress={() => setStateOfPractice(stateOfRegistration)}>
                  <Ionicons name="copy-outline" size={13} color="#2E7D32" />
                  <Text style={s.sameAsTxt}>Same as registration state</Text>
                </TouchableOpacity>
              ) : null}
              {errors.stateOfPractice ? <Text style={s.err}>{errors.stateOfPractice}</Text> : null}

              {/* Number of Users */}
              <View style={s.labelRow}>
                <Text style={s.label}>Number of People Using the App *</Text>
                <TouchableOpacity onPress={() => setInfoModal('users')}>
                  <Ionicons name="information-circle-outline" size={19} color="#2E7D32" />
                </TouchableOpacity>
              </View>
              <TextInput
                style={[s.input, errors.numUsers && s.inputErr]}
                placeholder="e.g. 8"
                value={numUsers}
                onChangeText={setNumUsers}
                keyboardType="number-pad"
              />
              {errors.numUsers ? <Text style={s.err}>{errors.numUsers}</Text> : null}

              {/* Email */}
              <Text style={s.label}>Email *</Text>
              <OtpEmailField
                value={email}
                onChangeText={setEmail}
                verified={emailVerified}
                onVerifiedChange={setEmailVerified}
                placeholder="doctor@clinic.com"
                error={errors.email}
              />

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
                  : <Text style={s.submitTxt}>Create Clinic Workspace</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity style={s.loginLink} onPress={() => router.replace('/auth/login')}>
                <Text style={s.loginLinkTxt}>Already have an account? Sign In</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

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

      {/* State Picker */}
      <Modal visible={!!statePicker} animationType="slide" transparent>
        <View style={s.sheetOverlay}>
          <View style={s.sheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>
                {statePicker === 'registration' ? 'State of Registration' : 'State of Practice'}
              </Text>
              <TouchableOpacity onPress={() => setStatePicker(null)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={INDIAN_STATES}
              keyExtractor={(item) => item}
              renderItem={({ item }) => {
                const selected = statePicker === 'registration' ? stateOfRegistration === item : stateOfPractice === item;
                return (
                  <TouchableOpacity
                    style={[s.stateItem, selected && s.stateItemSel]}
                    onPress={() => {
                      if (statePicker === 'registration') setStateOfRegistration(item);
                      else setStateOfPractice(item);
                      setStatePicker(null);
                    }}
                  >
                    <Text style={[s.stateItemTxt, selected && s.stateItemTxtSel]}>{item}</Text>
                    {selected && <Ionicons name="checkmark-circle" size={18} color="#2E7D32" />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* Info Modal */}
      <Modal visible={!!infoModal} animationType="fade" transparent>
        <Pressable style={s.centeredOverlay} onPress={() => setInfoModal(null)}>
          <View style={s.infoCard}>
            <Ionicons name="information-circle" size={28} color="#2E7D32" style={{ marginBottom: 8 }} />
            {infoModal === 'registration' ? (
              <>
                <Text style={s.infoTitle}>Registration Number</Text>
                <Text style={s.infoBody}>
                  The dental registration number of the clinic, or of the Chief Dentist if the clinic itself isn't separately registered. This must be unique — each registration number can only be onboarded once.
                </Text>
              </>
            ) : (
              <>
                <Text style={s.infoTitle}>Number of Users</Text>
                <Text style={s.infoBody}>
                  Count everyone who will use the app — Chief Dentist, Dentists, and Dental Assistants.
                </Text>
              </>
            )}
            <TouchableOpacity style={s.infoCloseBtn} onPress={() => setInfoModal(null)}>
              <Text style={s.infoCloseTxt}>Got it</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Success Modal */}
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
              onPress={() => { setShowSuccess(false); router.replace('/auth/login'); }}
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
  optional: { fontWeight: '400', color: '#90A4AE' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#F5F5F5', borderWidth: 1.5, borderColor: '#E0E0E0', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  logoImage: { width: 56, height: 56, borderRadius: 28 },
  logoTitle: { fontSize: 13, fontWeight: '600', color: '#37474F' },
  logoAction: { fontSize: 13, color: '#2E7D32', fontWeight: '600', marginTop: 3 },
  input: { borderWidth: 1.5, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#1A1A2E', backgroundColor: '#FAFAFA' },
  inputErr: { borderColor: '#FF3B30' },
  err: { fontSize: 12, color: '#FF3B30', marginTop: 3 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 6 },
  regNumberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  regNumberInput: { flex: 1, fontSize: 15, color: '#1A1A2E', paddingVertical: 8 },
  sameAsBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  sameAsTxt: { fontSize: 13, color: '#2E7D32' },
  pickerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerValueTxt: { fontSize: 15, color: '#1A1A2E' },
  pickerPlaceholderTxt: { fontSize: 15, color: '#94A3B8' },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%', minHeight: '50%' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A2E' },
  stateItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  stateItemSel: { backgroundColor: '#E8F5E9' },
  stateItemTxt: { fontSize: 15, color: '#37474F' },
  stateItemTxtSel: { color: '#2E7D32', fontWeight: '700' },
  infoCard: { backgroundColor: '#FFF', borderRadius: 16, margin: 30, padding: 24, alignItems: 'center', maxWidth: 340 },
  infoTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A2E', marginBottom: 10, textAlign: 'center' },
  infoBody: { fontSize: 14, color: '#546E7A', textAlign: 'center', lineHeight: 22 },
  infoCloseBtn: { marginTop: 18, backgroundColor: '#2E7D32', borderRadius: 10, paddingHorizontal: 28, paddingVertical: 10 },
  infoCloseTxt: { color: '#FFF', fontWeight: '700', fontSize: 14 },
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
  centeredOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  prefixSheet: { backgroundColor: '#FFF', borderRadius: 14, padding: 8, minWidth: 150 },
  prefixItem: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  prefixItemSel: { backgroundColor: '#E8F5E9' },
  prefixItemTxt: { fontSize: 15, color: '#37474F' },
  prefixItemTxtSel: { color: '#2E7D32', fontWeight: '700' },
  successOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  successCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 32, alignItems: 'center', width: '100%', maxWidth: 360 },
  successIconWrap: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  successTitle: { fontSize: 24, fontWeight: '800', color: '#1A1A2E', marginBottom: 12, textAlign: 'center' },
  successBody: { fontSize: 15, color: '#546E7A', textAlign: 'center', lineHeight: 24, marginBottom: 28 },
  successBtn: { backgroundColor: '#2E7D32', borderRadius: 14, paddingVertical: 15, paddingHorizontal: 40, alignItems: 'center', width: '100%' },
  successBtnTxt: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
