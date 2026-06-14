import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../contexts/AuthContext';
import api, { setToken } from '../../../utils/api';

type InviteInfo = {
  org_name: string;
  org_type: string;
  name: string;
  email: string;
  role: string;
  role_display: string;
  sub_role?: string;
};

export default function ActivateScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { refreshUser } = useAuth();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [fetchError, setFetchError] = useState('');
  const [fetchLoading, setFetchLoading] = useState(true);

  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!token) { setFetchError('Invalid activation link.'); setFetchLoading(false); return; }
    (async () => {
      try {
        const res = await api.get(`/organizations/invite/${token}`);
        setInvite(res.data);
        setName(res.data.name || '');
      } catch (err: any) {
        const detail = err.response?.data?.detail;
        setFetchError(typeof detail === 'string' ? detail : 'This invite link is invalid or has expired.');
      } finally {
        setFetchLoading(false);
      }
    })();
  }, [token]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!password) e.password = 'Password is required';
    else if (password.length < 8) e.password = 'Minimum 8 characters';
    if (password !== confirmPassword) e.confirmPassword = 'Passwords do not match';
    if (!termsAccepted) e.terms = 'Please accept the Terms & Privacy Policy';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleActivate = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await api.post(`/organizations/invite/${token}/activate`, {
        password,
        name: name.trim(),
        mobile: mobile.trim() || undefined,
      });
      const { access_token, refresh_token, user } = res.data;
      await setToken('access_token', access_token);
      await setToken('refresh_token', refresh_token);
      await setToken('user', JSON.stringify(user));
      await refreshUser();
      router.replace('/(tabs)/dashboard');
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      Alert.alert('Activation Failed', typeof detail === 'string' ? detail : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (fetchLoading) {
    return (
      <LinearGradient colors={['#F4F9FD', '#EBF4FC', '#D6E9FA']} style={s.center}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={s.loadingTxt}>Verifying invite link...</Text>
      </LinearGradient>
    );
  }

  if (fetchError) {
    return (
      <LinearGradient colors={['#F4F9FD', '#EBF4FC', '#D6E9FA']} style={s.center}>
        <Ionicons name="close-circle" size={56} color="#FF3B30" />
        <Text style={s.errTitle}>Link Invalid</Text>
        <Text style={s.errBody}>{fetchError}</Text>
        <TouchableOpacity style={s.errBtn} onPress={() => router.replace('/auth/login')}>
          <Text style={s.errBtnTxt}>Go to Sign In</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#F4F9FD', '#EBF4FC', '#D6E9FA']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

            {/* Org Badge */}
            <View style={s.orgBadge}>
              <Ionicons name="school" size={24} color="#1565C0" />
              <Text style={s.orgName}>{invite?.org_name}</Text>
            </View>

            <Text style={s.title}>You've Been Invited</Text>
            <Text style={s.subtitle}>
              Set up your account to join as{' '}
              <Text style={s.roleHighlight}>{invite?.role_display}</Text>
              {invite?.sub_role ? ` (${invite.sub_role.replace(/_/g, ' ')})` : ''}
            </Text>

            <View style={s.card}>

              {/* Email (locked) */}
              <Text style={s.label}>Email</Text>
              <View style={s.lockedRow}>
                <Ionicons name="lock-closed-outline" size={16} color="#90A4AE" style={{ marginRight: 8 }} />
                <Text style={s.lockedTxt}>{invite?.email}</Text>
              </View>

              {/* Name */}
              <Text style={s.label}>Your Name *</Text>
              <TextInput
                style={[s.input, errors.name && s.inputErr]}
                placeholder="Enter your full name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
              {errors.name ? <Text style={s.err}>{errors.name}</Text> : null}

              {/* Mobile (optional — editable, pre-filled if admin entered one) */}
              <Text style={s.label}>Mobile Number <Text style={s.optional}>(optional)</Text></Text>
              <TextInput
                style={s.input}
                placeholder="+91 98765 43210"
                value={mobile}
                onChangeText={setMobile}
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
                onPress={handleActivate}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#FFF" />
                  : <Text style={s.submitTxt}>Create Account</Text>
                }
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  loadingTxt: { marginTop: 12, fontSize: 15, color: '#546E7A' },
  errTitle: { fontSize: 22, fontWeight: '700', color: '#1A1A2E', marginTop: 16, marginBottom: 8 },
  errBody: { fontSize: 14, color: '#546E7A', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  errBtn: { backgroundColor: '#1565C0', borderRadius: 12, paddingHorizontal: 28, paddingVertical: 13 },
  errBtnTxt: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  scroll: { padding: 20, paddingBottom: 48 },
  orgBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E3F2FD', alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginBottom: 16 },
  orgName: { fontSize: 14, fontWeight: '600', color: '#1565C0' },
  title: { fontSize: 24, fontWeight: '700', color: '#1A1A2E', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#546E7A', lineHeight: 21, marginBottom: 20 },
  roleHighlight: { color: '#1565C0', fontWeight: '700' },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  label: { fontSize: 13, fontWeight: '600', color: '#37474F', marginBottom: 6, marginTop: 14 },
  lockedRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1.5, borderColor: '#E0E0E0' },
  lockedTxt: { fontSize: 15, color: '#78909C' },
  optional: { fontWeight: '400', color: '#90A4AE' },
  input: { borderWidth: 1.5, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#1A1A2E', backgroundColor: '#FAFAFA' },
  inputErr: { borderColor: '#FF3B30' },
  err: { fontSize: 12, color: '#FF3B30', marginTop: 3 },
  pwRow: { borderWidth: 1.5, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFAFA' },
  pwInput: { flex: 1, fontSize: 15, color: '#1A1A2E', paddingVertical: 8 },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 18 },
  termsTxt: { flex: 1, fontSize: 13, color: '#546E7A', lineHeight: 20 },
  link: { color: '#1565C0', fontWeight: '600' },
  submitBtn: { backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  btnDisabled: { opacity: 0.6 },
  submitTxt: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
