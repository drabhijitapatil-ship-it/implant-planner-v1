import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import api from '../../utils/api';
import PasswordRequirements, { isPasswordValid } from '../../components/PasswordRequirements';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_COOLDOWN_SECONDS = 60;

export default function ForgotPasswordScreen() {
  const router = useRouter();

  const [stage, setStage] = useState<'email' | 'reset' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const handleSendCode = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setErrors({ email: 'Enter a valid email address' });
      return;
    }
    setErrors({});
    setSending(true);
    try {
      await api.post('/auth/forgot-password', { email: trimmed });
      setStage('reset');
      startCooldown();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      Alert.alert('Error', typeof detail === 'string' ? detail : 'Could not send reset code. Try again.');
    } finally {
      setSending(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setSending(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
      startCooldown();
    } catch {
    } finally {
      setSending(false);
    }
  };

  const handleResetPassword = async () => {
    const e: Record<string, string> = {};
    if (otp.length !== 6) e.otp = 'Enter the 6-digit code';
    if (!newPassword) e.newPassword = 'Password is required';
    else if (!isPasswordValid(newPassword)) e.newPassword = 'Password does not meet all requirements';
    if (newPassword !== confirmPassword) e.confirmPassword = 'Passwords do not match';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setResetting(true);
    try {
      await api.post('/auth/reset-password', {
        email: email.trim().toLowerCase(),
        otp,
        new_password: newPassword,
      });
      setStage('done');
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      Alert.alert('Error', typeof detail === 'string' ? detail : 'Could not reset password. Try again.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <LinearGradient colors={['#F4F9FD', '#EBF4FC', '#D6E9FA']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

            <TouchableOpacity style={s.backBtn} onPress={() => router.back()} data-testid="forgot-password-back">
              <Ionicons name="arrow-back" size={22} color="#1565C0" />
            </TouchableOpacity>

            {stage === 'done' ? (
              <View style={s.doneWrap}>
                <View style={s.doneIconWrap}>
                  <Ionicons name="checkmark-circle" size={72} color="#1565C0" />
                </View>
                <Text style={[s.title, { textAlign: 'center', marginVertical: 12 }]}>Password Reset</Text>
                <Text style={[s.subtitle, { textAlign: 'center', paddingHorizontal: 20 }]}>
                  Your password has been changed. Sign in with your new password to continue.
                </Text>
                <TouchableOpacity style={s.submitBtn} onPress={() => router.replace('/auth/login')} data-testid="forgot-password-to-login">
                  <Text style={s.submitTxt}>Go to Sign In</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={s.header}>
                  <Ionicons name="lock-open-outline" size={30} color="#1565C0" />
                  <Text style={s.title}>Reset Password</Text>
                </View>
                <Text style={s.subtitle}>
                  {stage === 'email'
                    ? "Enter your account email and we'll send you a reset code."
                    : `Enter the 6-digit code sent to ${email.trim()} and choose a new password.`}
                </Text>

                <View style={s.card}>
                  {stage === 'email' ? (
                    <>
                      <Text style={s.label}>Email</Text>
                      <TextInput
                        style={[s.input, errors.email && s.inputErr]}
                        placeholder="you@example.com"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        data-testid="forgot-password-email"
                      />
                      {errors.email ? <Text style={s.err}>{errors.email}</Text> : null}

                      <TouchableOpacity
                        style={[s.submitBtn, sending && s.btnDisabled]}
                        onPress={handleSendCode}
                        disabled={sending}
                        data-testid="forgot-password-send"
                      >
                        {sending ? <ActivityIndicator color="#FFF" /> : <Text style={s.submitTxt}>Send Reset Code</Text>}
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <Text style={s.label}>6-Digit Code</Text>
                      <TextInput
                        style={[s.input, s.otpInput, errors.otp && s.inputErr]}
                        placeholder="000000"
                        value={otp}
                        onChangeText={(t) => setOtp(t.replace(/[^0-9]/g, '').slice(0, 6))}
                        keyboardType="number-pad"
                        maxLength={6}
                        data-testid="forgot-password-otp"
                      />
                      {errors.otp ? <Text style={s.err}>{errors.otp}</Text> : null}

                      <TouchableOpacity onPress={handleResend} disabled={cooldown > 0 || sending} style={s.resendRow}>
                        <Text style={[s.resendTxt, (cooldown > 0 || sending) && s.resendTxtDisabled]}>
                          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                        </Text>
                      </TouchableOpacity>

                      <Text style={s.label}>New Password</Text>
                      <View style={[s.pwRow, errors.newPassword && s.inputErr]}>
                        <TextInput
                          style={s.pwInput}
                          placeholder="Min. 8 characters"
                          value={newPassword}
                          onChangeText={setNewPassword}
                          secureTextEntry={!showPassword}
                          autoCapitalize="none"
                          data-testid="forgot-password-new-password"
                        />
                        <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                          <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
                        </TouchableOpacity>
                      </View>
                      {errors.newPassword ? <Text style={s.err}>{errors.newPassword}</Text> : null}
                      <PasswordRequirements password={newPassword} />

                      <Text style={s.label}>Confirm New Password</Text>
                      <View style={[s.pwRow, errors.confirmPassword && s.inputErr]}>
                        <TextInput
                          style={s.pwInput}
                          placeholder="Re-enter password"
                          value={confirmPassword}
                          onChangeText={setConfirmPassword}
                          secureTextEntry={!showConfirm}
                          autoCapitalize="none"
                          data-testid="forgot-password-confirm-password"
                        />
                        <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)}>
                          <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
                        </TouchableOpacity>
                      </View>
                      {errors.confirmPassword ? <Text style={s.err}>{errors.confirmPassword}</Text> : null}

                      <TouchableOpacity
                        style={[s.submitBtn, resetting && s.btnDisabled]}
                        onPress={handleResetPassword}
                        disabled={resetting}
                        data-testid="forgot-password-submit"
                      >
                        {resetting ? <ActivityIndicator color="#FFF" /> : <Text style={s.submitTxt}>Reset Password</Text>}
                      </TouchableOpacity>

                      <TouchableOpacity style={s.changeEmailBtn} onPress={() => { setStage('email'); setOtp(''); setErrors({}); }}>
                        <Text style={s.changeEmailTxt}>Use a different email</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  <TouchableOpacity style={s.loginLink} onPress={() => router.replace('/auth/login')}>
                    <Text style={s.loginLinkTxt}>Back to Sign In</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 48, flexGrow: 1 },
  backBtn: { marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  title: { fontSize: 21, fontWeight: '700', color: '#1A1A2E', flex: 1 },
  subtitle: { fontSize: 13, color: '#546E7A', marginBottom: 20, lineHeight: 19 },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  label: { fontSize: 13, fontWeight: '600', color: '#37474F', marginBottom: 6, marginTop: 14 },
  input: { borderWidth: 1.5, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#1A1A2E', backgroundColor: '#FAFAFA' },
  otpInput: { fontSize: 20, letterSpacing: 8, fontFamily: 'monospace', textAlign: 'center' },
  inputErr: { borderColor: '#FF3B30' },
  err: { fontSize: 12, color: '#FF3B30', marginTop: 3 },
  pwRow: { borderWidth: 1.5, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFAFA' },
  pwInput: { flex: 1, fontSize: 15, color: '#1A1A2E', paddingVertical: 8 },
  resendRow: { marginTop: 8, alignItems: 'flex-end' },
  resendTxt: { fontSize: 13, color: '#1565C0', fontWeight: '600' },
  resendTxtDisabled: { color: '#90A4AE' },
  submitBtn: { backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 20, alignSelf: 'stretch' },
  btnDisabled: { opacity: 0.6 },
  submitTxt: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  changeEmailBtn: { alignItems: 'center', marginTop: 14 },
  changeEmailTxt: { color: '#78909C', fontSize: 13 },
  loginLink: { alignItems: 'center', marginTop: 16 },
  loginLinkTxt: { color: '#1565C0', fontSize: 14 },
  doneWrap: { alignItems: 'center', paddingTop: 40 },
  doneIconWrap: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
});
