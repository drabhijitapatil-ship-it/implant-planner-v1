import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
  Modal, Pressable, Alert, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import api from '../../utils/api';
import OtpEmailField from '../../components/OtpEmailField';

const PREFIXES = ['Dr.', 'Mr.', 'Mrs.', 'Ms.', 'Prof.'];

export default function ClinicRegisterScreen() {
  const router = useRouter();

  const [clinicName, setClinicName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [prefix, setPrefix] = useState('Dr.');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [showPrefixPicker, setShowPrefixPicker] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [keyboardHeight, setKeyboardHeight] = useState(0);

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
    if (!city.trim()) e.city = 'City is required';
    if (!state.trim()) e.state = 'State is required';
    if (!ownerName.trim()) e.ownerName = 'Name is required';
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
        clinic_data: {
          clinic_name: clinicName.trim(),
          city: city.trim(),
          state: state.trim(),
          owner_name: ownerName.trim(),
          owner_prefix: prefix,
          phone: phone.trim(),
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

              {/* City */}
              <Text style={s.label}>City *</Text>
              <TextInput
                style={[s.input, errors.city && s.inputErr]}
                placeholder="e.g. Mumbai"
                value={city}
                onChangeText={setCity}
                autoCapitalize="words"
              />
              {errors.city ? <Text style={s.err}>{errors.city}</Text> : null}

              {/* State */}
              <Text style={s.label}>State *</Text>
              <TextInput
                style={[s.input, errors.state && s.inputErr]}
                placeholder="e.g. Maharashtra"
                value={state}
                onChangeText={setState}
                autoCapitalize="words"
              />
              {errors.state ? <Text style={s.err}>{errors.state}</Text> : null}

              {/* Owner Name */}
              <Text style={s.label}>Clinic Owner / Primary Doctor *</Text>
              <View style={s.prefixRow}>
                <TouchableOpacity style={s.prefixBtn} onPress={() => setShowPrefixPicker(true)}>
                  <Text style={s.prefixTxt}>{prefix}</Text>
                  <Ionicons name="chevron-down" size={14} color="#666" />
                </TouchableOpacity>
                <TextInput
                  style={[s.nameInput, errors.ownerName && s.inputErr]}
                  placeholder="Full name"
                  value={ownerName}
                  onChangeText={setOwnerName}
                  autoCapitalize="words"
                />
              </View>
              {errors.ownerName ? <Text style={s.err}>{errors.ownerName}</Text> : null}

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

              {/* Phone (optional) */}
              <Text style={s.label}>Phone Number <Text style={s.optional}>(optional)</Text></Text>
              <TextInput
                style={s.input}
                placeholder="e.g. 9876543210"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
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
  input: { borderWidth: 1.5, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#1A1A2E', backgroundColor: '#FAFAFA' },
  inputErr: { borderColor: '#FF3B30' },
  err: { fontSize: 12, color: '#FF3B30', marginTop: 3 },
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
