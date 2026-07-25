import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
  Modal, FlatList, Pressable, Alert, Keyboard, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import api, { setToken } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { DENTAL_COLLEGES, type DentalCollege } from '../../constants/dentalColleges';
import OtpEmailField from '../../components/OtpEmailField';
import PasswordRequirements, { isPasswordValid } from '../../components/PasswordRequirements';

const PREFIXES = ['Dr.', 'Mr.', 'Mrs.', 'Ms.', 'Prof.'];

// Preset department options offered right after signup — Implant Admin can
// still add/rename/remove departments later from Users > Departments, this
// is just a fast-start so the common ones don't need typing.
const PRESET_DEPARTMENTS = [
  'Implant Centre',
  'Centralized Implant Clinic',
  'Prosthodontics',
  'Periodontology',
  'Oral Surgery',
];

export default function CollegeRegisterScreen() {
  const router = useRouter();
  const { refreshUser } = useAuth();

  // 'form' = the signup form below. 'departments' = the post-signup,
  // department-only setup step — the account already exists and is
  // authenticated by the time this renders (signup returns tokens we stash
  // immediately), so department Implant Incharge onboarding can happen
  // later from the Implant Admin's own profile instead of blocking here.
  const [step, setStep] = useState<'form' | 'departments'>('form');
  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set());
  const [otherEnabled, setOtherEnabled] = useState(false);
  const [otherName, setOtherName] = useState('');
  const [creatingDepts, setCreatingDepts] = useState(false);

  const [logo, setLogo] = useState<string | null>(null);

  const [selectedCollege, setSelectedCollege] = useState<DentalCollege | null>(null);
  const [collegeSearch, setCollegeSearch] = useState('');
  const [showCollegePicker, setShowCollegePicker] = useState(false);
  const [manualCollegeName, setManualCollegeName] = useState('');
  const [useManual, setUseManual] = useState(false);

  const [state, setState] = useState('');
  const [prefix, setPrefix] = useState('Dr.');
  const [inchargeName, setInchargeName] = useState('');
  const [email, setEmail] = useState('');
  const [numUsers, setNumUsers] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);

  const [showPrefixPicker, setShowPrefixPicker] = useState(false);
  const [infoModal, setInfoModal] = useState<'incharge' | 'users' | 'email' | null>(null);
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

  const collegeName = useManual ? manualCollegeName : (selectedCollege?.name ?? '');

  // Colleges already onboarded as a workspace shouldn't be selectable again —
  // fetched once on mount (public endpoint, no auth needed pre-signup).
  const [onboardedNames, setOnboardedNames] = useState<Set<string>>(new Set());
  useEffect(() => {
    api.get('/organizations/onboarded-college-names')
      .then(res => setOnboardedNames(new Set((res.data?.names || []).map((n: string) => n.trim().toLowerCase()))))
      .catch(() => {});
  }, []);

  const availableColleges = useMemo(
    () => DENTAL_COLLEGES.filter(c => !onboardedNames.has(c.name.trim().toLowerCase())),
    [onboardedNames]
  );

  const filteredColleges = useMemo(() => {
    const q = collegeSearch.trim().toLowerCase();
    if (!q) return availableColleges;
    return availableColleges.filter(
      c => c.name.toLowerCase().includes(q) || c.state.toLowerCase().includes(q)
    );
  }, [collegeSearch, availableColleges]);

  const handleSelectCollege = (c: DentalCollege) => {
    setSelectedCollege(c);
    setUseManual(false);
    setState(c.state);
    setCollegeSearch('');
    setShowCollegePicker(false);
  };

  const handleManualEntry = () => {
    setUseManual(true);
    setSelectedCollege(null);
    setCollegeSearch('');
    setShowCollegePicker(false);
  };

  const handlePickLogo = async () => {
    // System photo picker needs no media-library permission (Play policy: READ_MEDIA_* removed).
    // allowsEditing intentionally omitted: chaining PHPicker → the native
    // crop screen hangs/blanks on iOS Simulator (Apple/Expo-side bug, not
    // fixable here). Display-side square crop (borderRadius + resizeMode
    // cover) already handles non-square source images.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setLogo(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!collegeName.trim()) e.collegeName = 'College name is required';
    else if (onboardedNames.has(collegeName.trim().toLowerCase())) e.collegeName = 'This college has already been onboarded';
    if (!state) e.state = 'State is required';
    if (!inchargeName.trim()) e.inchargeName = 'Name is required';
    if (!email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Invalid email address';
    else if (!emailVerified) e.email = 'Please verify your email';
    const n = Number(numUsers);
    if (!numUsers || isNaN(n) || n < 1 || n > 500) e.numUsers = 'Enter a valid number (1–500)';
    if (!password) e.password = 'Password is required';
    else if (!isPasswordValid(password, inchargeName)) e.password = 'Password does not meet all requirements';
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
        org_type: 'college',
        email: email.trim().toLowerCase(),
        password,
        logo,
        college_data: {
          college_name: collegeName.trim(),
          state,
          incharge_name: inchargeName.trim(),
          incharge_prefix: prefix,
          num_users: Number(numUsers),
        },
      });
      // Signup already returns a real session — stash it and hydrate
      // AuthContext so the department-setup step below can call the
      // authenticated /departments endpoint immediately, no separate
      // "verify then log in again" round trip.
      const { access_token, refresh_token } = res.data || {};
      if (access_token) await setToken('access_token', access_token);
      if (refresh_token) await setToken('refresh_token', refresh_token);
      await setToken('last_activity_at', String(Date.now()));
      await refreshUser();
      setStep('departments');
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      Alert.alert('Signup Failed', typeof detail === 'string' ? detail : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const togglePreset = (name: string) => {
    setSelectedPresets(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleCreateDepartments = async () => {
    const names = [...selectedPresets];
    if (otherEnabled && otherName.trim()) names.push(otherName.trim());
    if (names.length === 0) {
      Alert.alert('Nothing selected', 'Pick at least one department, or skip for now — you can always add departments later.');
      return;
    }
    setCreatingDepts(true);
    try {
      for (const name of names) {
        await api.post('/departments', { name });
      }
      router.replace('/(tabs)/dashboard');
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      Alert.alert('Could not create departments', typeof detail === 'string' ? detail : 'Please try again.');
    } finally {
      setCreatingDepts(false);
    }
  };

  if (step === 'departments') {
    return (
      <LinearGradient colors={['#F4F9FD', '#EBF4FC', '#D6E9FA']} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <View style={s.successIconWrap}>
              <Ionicons name="checkmark-circle" size={64} color="#1565C0" />
            </View>
            <Text style={s.title}>Workspace Created!</Text>
            <Text style={s.subtitle}>
              Set up your departments — Implant Incharge assignment for each one can be done later from your profile.
            </Text>

            <View style={s.card}>
              <Text style={s.label}>Departments</Text>
              {PRESET_DEPARTMENTS.map(name => {
                const selected = selectedPresets.has(name);
                return (
                  <TouchableOpacity
                    key={name}
                    style={s.deptRow}
                    onPress={() => togglePreset(name)}
                    data-testid={`signup-dept-${name}`}
                  >
                    <Ionicons
                      name={selected ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={selected ? '#1565C0' : '#90A4AE'}
                    />
                    <Text style={s.deptRowTxt}>{name}</Text>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={s.deptRow}
                onPress={() => setOtherEnabled(v => !v)}
                data-testid="signup-dept-other"
              >
                <Ionicons
                  name={otherEnabled ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={otherEnabled ? '#1565C0' : '#90A4AE'}
                />
                <Text style={s.deptRowTxt}>Other</Text>
              </TouchableOpacity>
              {otherEnabled && (
                <TextInput
                  style={[s.input, { marginTop: 4, marginLeft: 32 }]}
                  placeholder="Department name"
                  value={otherName}
                  onChangeText={setOtherName}
                  autoCapitalize="words"
                  data-testid="signup-dept-other-name"
                />
              )}

              <TouchableOpacity
                style={[s.submitBtn, creatingDepts && s.btnDisabled]}
                onPress={handleCreateDepartments}
                disabled={creatingDepts}
                data-testid="signup-create-departments"
              >
                {creatingDepts
                  ? <ActivityIndicator color="#FFF" />
                  : <Text style={s.submitTxt}>Create & Continue</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity
                style={s.loginLink}
                onPress={() => router.replace('/(tabs)/dashboard')}
                disabled={creatingDepts}
              >
                <Text style={s.loginLinkTxt}>Skip for now</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

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
              <Ionicons name="arrow-back" size={22} color="#1565C0" />
            </TouchableOpacity>

            <View style={s.headerRow}>
              <Ionicons name="school" size={30} color="#1565C0" />
              <Text style={s.title}>Set Up College Workspace</Text>
            </View>
            <Text style={s.subtitle}>Create your dental college workspace on Implanr</Text>

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
                  <Text style={s.logoTitle}>College Logo <Text style={s.optional}>(optional)</Text></Text>
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

              {/* College Name */}
              <Text style={s.label}>College Name *</Text>
              {!useManual ? (
                <TouchableOpacity
                  style={[s.picker, errors.collegeName && s.inputErr]}
                  onPress={() => setShowCollegePicker(true)}
                >
                  {selectedCollege ? (
                    <View style={{ flex: 1 }}>
                      <Text style={s.pickerVal} numberOfLines={2}>{selectedCollege.name}</Text>
                      <Text style={s.pickerSub}>{selectedCollege.state} • {selectedCollege.type}</Text>
                    </View>
                  ) : (
                    <Text style={s.pickerPH}>Search college...</Text>
                  )}
                  <Ionicons name={selectedCollege ? 'checkmark-circle' : 'search'} size={20} color={selectedCollege ? '#1565C0' : '#94A3B8'} />
                </TouchableOpacity>
              ) : (
                <View>
                  <TextInput
                    style={[s.input, errors.collegeName && s.inputErr]}
                    placeholder="Enter college name"
                    value={manualCollegeName}
                    onChangeText={setManualCollegeName}
                    autoCapitalize="words"
                  />
                  <TouchableOpacity style={s.switchBtn} onPress={() => { setUseManual(false); setManualCollegeName(''); }}>
                    <Ionicons name="search" size={14} color="#1565C0" />
                    <Text style={s.switchTxt}>Search from list instead</Text>
                  </TouchableOpacity>
                </View>
              )}
              {errors.collegeName ? <Text style={s.err}>{errors.collegeName}</Text> : null}

              {/* State */}
              <Text style={s.label}>State *</Text>
              <View style={[s.lockedRow, errors.state && s.inputErr]}>
                {!useManual && selectedCollege ? (
                  <Ionicons name="location" size={16} color="#1565C0" style={{ marginRight: 8 }} />
                ) : (
                  <Ionicons name="location-outline" size={16} color="#90A4AE" style={{ marginRight: 8 }} />
                )}
                <Text style={[s.lockedTxt, state ? s.lockedTxtFilled : null]}>{state || 'Auto-filled from college selection'}</Text>
                {state && (
                  <TouchableOpacity onPress={() => setState('')}>
                    <Ionicons name="pencil-outline" size={16} color="#90A4AE" />
                  </TouchableOpacity>
                )}
              </View>
              {useManual || !state ? (
                <TextInput
                  style={[s.input, { marginTop: 6 }, errors.state && s.inputErr]}
                  placeholder="Enter state"
                  value={state}
                  onChangeText={setState}
                  autoCapitalize="words"
                />
              ) : null}
              {errors.state ? <Text style={s.err}>{errors.state}</Text> : null}

              {/* Incharge Name */}
              <View style={s.labelRow}>
                <Text style={s.label}>Implant Admin Name *</Text>
                <TouchableOpacity onPress={() => setInfoModal('incharge')}>
                  <Ionicons name="information-circle-outline" size={19} color="#1565C0" />
                </TouchableOpacity>
              </View>
              <View style={s.prefixRow}>
                <TouchableOpacity style={s.prefixBtn} onPress={() => setShowPrefixPicker(true)}>
                  <Text style={s.prefixTxt}>{prefix}</Text>
                  <Ionicons name="chevron-down" size={14} color="#666" />
                </TouchableOpacity>
                <TextInput
                  style={[s.nameInput, errors.inchargeName && s.inputErr]}
                  placeholder="Full name"
                  value={inchargeName}
                  onChangeText={setInchargeName}
                  autoCapitalize="words"
                />
              </View>
              {errors.inchargeName ? <Text style={s.err}>{errors.inchargeName}</Text> : null}

              {/* Email */}
              <View style={s.labelRow}>
                <Text style={s.label}>Email *</Text>
                <TouchableOpacity onPress={() => setInfoModal('email')}>
                  <Ionicons name="information-circle-outline" size={19} color="#1565C0" />
                </TouchableOpacity>
              </View>
              <OtpEmailField
                value={email}
                onChangeText={setEmail}
                verified={emailVerified}
                onVerifiedChange={setEmailVerified}
                placeholder="official@dental.edu"
                error={errors.email}
              />

              {/* Number of Users */}
              <View style={s.labelRow}>
                <Text style={s.label}>Number of People Using the App *</Text>
                <TouchableOpacity onPress={() => setInfoModal('users')}>
                  <Ionicons name="information-circle-outline" size={19} color="#1565C0" />
                </TouchableOpacity>
              </View>
              <TextInput
                style={[s.input, errors.numUsers && s.inputErr]}
                placeholder="e.g. 25"
                value={numUsers}
                onChangeText={setNumUsers}
                keyboardType="number-pad"
              />
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
              <PasswordRequirements password={password} fullName={inchargeName} />

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
                  color={termsAccepted ? '#1565C0' : '#90A4AE'}
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
                  : <Text style={s.submitTxt}>Create College Workspace</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity style={s.loginLink} onPress={() => router.replace('/auth/login')}>
                <Text style={s.loginLinkTxt}>Already have an account? Sign In</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* College Search Modal */}
      <Modal visible={showCollegePicker} animationType="slide" transparent>
        <View style={s.sheetOverlay}>
          <View style={s.sheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Select Your College</Text>
              <TouchableOpacity onPress={() => { setShowCollegePicker(false); setCollegeSearch(''); }}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <View style={s.searchRow}>
              <Ionicons name="search-outline" size={18} color="#90A4AE" style={{ marginRight: 8 }} />
              <TextInput
                style={s.searchInput}
                placeholder="Type college or state name..."
                value={collegeSearch}
                onChangeText={setCollegeSearch}
                autoFocus
                autoCapitalize="none"
                clearButtonMode="while-editing"
              />
            </View>
            <FlatList
              data={filteredColleges}
              keyExtractor={item => item.name}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.collegeItem, selectedCollege?.name === item.name && s.collegeItemSel]}
                  onPress={() => handleSelectCollege(item)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.collegeName, selectedCollege?.name === item.name && s.collegeNameSel]} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={s.collegeMeta}>{item.state} • {item.type}</Text>
                  </View>
                  {selectedCollege?.name === item.name && (
                    <Ionicons name="checkmark-circle" size={20} color="#1565C0" />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={s.emptyList}>
                  <Ionicons name="search-outline" size={32} color="#CFD8DC" />
                  <Text style={s.emptyTxt}>No colleges found</Text>
                </View>
              }
              ListFooterComponent={
                <TouchableOpacity style={s.manualBtn} onPress={handleManualEntry}>
                  <Ionicons name="pencil-outline" size={16} color="#1565C0" />
                  <Text style={s.manualTxt}>My college is not in this list</Text>
                </TouchableOpacity>
              }
            />
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
            <Ionicons name="information-circle" size={28} color="#1565C0" style={{ marginBottom: 8 }} />
            {infoModal === 'incharge' ? (
              <>
                <Text style={s.infoTitle}>About Implant Admin</Text>
                <Text style={s.infoBody}>
                  The Implant Admin in the primary admin of your college workspace. They will have full access to all cases, reports, analytics, and user management. Implant Admin can add departments and allot department Implant Incharge. A maximum of 2 Implant Admins are allowed per college workspace.
                </Text>
              </>
            ) : infoModal === 'email' ? (
              <>
                <Text style={s.infoTitle}>Which Email to Use</Text>
                <Text style={s.infoBody}>
                  Official institutional email is preferred. Use the email of the person who will be the Implant Admin.
                </Text>
              </>
            ) : (
              <>
                <Text style={s.infoTitle}>Number of Users</Text>
                <Text style={s.infoBody}>
                  Count everyone who will use the app — Implant Admins, department Implant Incharges, Supervisors, Postgraduate Students, Undergraduate Students, Fellows, and Auxiliary Staff.
                </Text>
              </>
            )}
            <TouchableOpacity style={s.infoCloseBtn} onPress={() => setInfoModal(null)}>
              <Text style={s.infoCloseTxt}>Got it</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
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
  logoAction: { fontSize: 13, color: '#1565C0', fontWeight: '600', marginTop: 3 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#1A1A2E', backgroundColor: '#FAFAFA' },
  inputErr: { borderColor: '#FF3B30' },
  err: { fontSize: 12, color: '#FF3B30', marginTop: 3 },
  picker: { borderWidth: 1.5, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FAFAFA', minHeight: 48 },
  pickerVal: { fontSize: 15, color: '#1A1A2E', flex: 1, marginRight: 8 },
  pickerSub: { fontSize: 12, color: '#78909C', marginTop: 2 },
  pickerPH: { fontSize: 15, color: '#94A3B8', flex: 1 },
  switchBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  switchTxt: { fontSize: 13, color: '#1565C0' },
  lockedRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1.5, borderColor: '#E0E0E0' },
  lockedTxt: { flex: 1, fontSize: 14, color: '#94A3B8' },
  lockedTxtFilled: { color: '#1A1A2E', fontWeight: '500' },
  prefixRow: { flexDirection: 'row', gap: 8 },
  prefixBtn: { borderWidth: 1.5, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FAFAFA' },
  prefixTxt: { fontSize: 15, color: '#1A1A2E', fontWeight: '600' },
  nameInput: { flex: 1, borderWidth: 1.5, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#1A1A2E', backgroundColor: '#FAFAFA' },
  pwRow: { borderWidth: 1.5, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFAFA' },
  pwInput: { flex: 1, fontSize: 15, color: '#1A1A2E', paddingVertical: 8 },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 18 },
  termsTxt: { flex: 1, fontSize: 13, color: '#546E7A', lineHeight: 20 },
  link: { color: '#1565C0', fontWeight: '600' },
  submitBtn: { backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  btnDisabled: { opacity: 0.6 },
  submitTxt: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  loginLink: { alignItems: 'center', marginTop: 16 },
  loginLinkTxt: { color: '#1565C0', fontSize: 14 },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%', minHeight: '60%' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A2E' },
  searchRow: { flexDirection: 'row', alignItems: 'center', margin: 12, backgroundColor: '#F5F7FA', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#E8ECF0' },
  searchInput: { flex: 1, fontSize: 15, color: '#1A1A2E' },
  collegeItem: { paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F5F5F5', flexDirection: 'row', alignItems: 'center', gap: 8 },
  collegeItemSel: { backgroundColor: '#E3F2FD' },
  collegeName: { fontSize: 14, color: '#1A1A2E', fontWeight: '500', lineHeight: 20 },
  collegeNameSel: { color: '#1565C0', fontWeight: '700' },
  collegeMeta: { fontSize: 12, color: '#78909C', marginTop: 2 },
  emptyList: { alignItems: 'center', paddingVertical: 40 },
  emptyTxt: { marginTop: 8, fontSize: 14, color: '#90A4AE' },
  manualBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, margin: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#1565C0', borderStyle: 'dashed', justifyContent: 'center' },
  manualTxt: { color: '#1565C0', fontSize: 14, fontWeight: '600' },
  centeredOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  prefixSheet: { backgroundColor: '#FFF', borderRadius: 14, padding: 8, minWidth: 150 },
  prefixItem: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  prefixItemSel: { backgroundColor: '#E3F2FD' },
  prefixItemTxt: { fontSize: 15, color: '#37474F' },
  prefixItemTxtSel: { color: '#1565C0', fontWeight: '700' },
  infoCard: { backgroundColor: '#FFF', borderRadius: 16, margin: 30, padding: 24, alignItems: 'center', maxWidth: 340 },
  infoTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A2E', marginBottom: 10, textAlign: 'center' },
  infoBody: { fontSize: 14, color: '#546E7A', textAlign: 'center', lineHeight: 22 },
  infoCloseBtn: { marginTop: 18, backgroundColor: '#1565C0', borderRadius: 10, paddingHorizontal: 28, paddingVertical: 10 },
  infoCloseTxt: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  successIconWrap: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center', marginBottom: 20, alignSelf: 'center' },
  deptRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  deptRowTxt: { fontSize: 15, color: '#1A1A2E' },
});
