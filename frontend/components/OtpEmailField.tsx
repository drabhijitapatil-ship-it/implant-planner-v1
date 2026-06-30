import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_COOLDOWN_SECONDS = 60;

interface Props {
  value: string;
  onChangeText: (v: string) => void;
  verified: boolean;
  onVerifiedChange: (v: boolean) => void;
  placeholder?: string;
  error?: string;
}

export default function OtpEmailField({ value, onChangeText, verified, onVerifiedChange, placeholder, error }: Props) {
  const [stage, setStage] = useState<'idle' | 'sending' | 'awaiting_code' | 'verifying'>('idle');
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [cooldown, setCooldown] = useState(0);
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

  const handleEmailChange = (v: string) => {
    onChangeText(v);
    if (verified) onVerifiedChange(false);
    if (stage !== 'idle') {
      setStage('idle');
      setOtp('');
      setOtpError('');
    }
  };

  const handleSendOtp = async () => {
    const email = value.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return;
    setStage('sending');
    setOtpError('');
    try {
      await api.post('/auth/send-otp', { email });
      setStage('awaiting_code');
      startCooldown();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setOtpError(typeof detail === 'string' ? detail : 'Could not send code. Try again.');
      setStage('idle');
    }
  };

  const handleVerifyOtp = async () => {
    const email = value.trim().toLowerCase();
    if (otp.length !== 6) return;
    setStage('verifying');
    setOtpError('');
    try {
      await api.post('/auth/verify-otp', { email, otp });
      onVerifiedChange(true);
      setStage('idle');
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setOtpError(typeof detail === 'string' ? detail : 'Incorrect code. Try again.');
      setStage('awaiting_code');
    }
  };

  if (verified) {
    return (
      <View style={[st.row, st.rowVerified]}>
        <Text style={st.verifiedText} numberOfLines={1}>{value}</Text>
        <Ionicons name="checkmark-circle" size={22} color="#2E7D32" style={{ marginRight: 10 }} />
        <TouchableOpacity onPress={() => onVerifiedChange(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="pencil-outline" size={18} color="#78909C" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <View style={[st.row, error && st.rowErr]}>
        <TextInput
          style={st.input}
          placeholder={placeholder}
          value={value}
          onChangeText={handleEmailChange}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[st.verifyBtn, (!EMAIL_RE.test(value.trim()) || stage === 'sending') && st.verifyBtnDisabled]}
          onPress={handleSendOtp}
          disabled={!EMAIL_RE.test(value.trim()) || stage === 'sending'}
        >
          {stage === 'sending'
            ? <ActivityIndicator size="small" color="#1565C0" />
            : <Text style={st.verifyBtnTxt}>Verify</Text>
          }
        </TouchableOpacity>
      </View>
      {error ? <Text style={st.err}>{error}</Text> : null}

      {stage === 'awaiting_code' || stage === 'verifying' ? (
        <View style={st.otpBox}>
          <Text style={st.otpLabel}>Enter the 6-digit code sent to {value.trim()}</Text>
          <View style={st.otpRow}>
            <TextInput
              style={st.otpInput}
              placeholder="000000"
              value={otp}
              onChangeText={(t) => setOtp(t.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            <TouchableOpacity
              style={[st.confirmBtn, (otp.length !== 6 || stage === 'verifying') && st.verifyBtnDisabled]}
              onPress={handleVerifyOtp}
              disabled={otp.length !== 6 || stage === 'verifying'}
            >
              {stage === 'verifying'
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={st.confirmBtnTxt}>Confirm</Text>
              }
            </TouchableOpacity>
          </View>
          {otpError ? <Text style={st.err}>{otpError}</Text> : null}
          <TouchableOpacity onPress={handleSendOtp} disabled={cooldown > 0}>
            <Text style={[st.resendTxt, cooldown > 0 && st.resendTxtDisabled]}>
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#CFD8DC',
    borderRadius: 10,
    backgroundColor: '#FAFAFA',
    paddingRight: 6,
  },
  rowErr: { borderColor: '#FF3B30' },
  rowVerified: { borderColor: '#A5D6A7', backgroundColor: '#F1F8F1', paddingHorizontal: 14, paddingVertical: 12 },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#1A1A2E' },
  verifyBtn: { backgroundColor: '#E3F2FD', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  verifyBtnDisabled: { opacity: 0.5 },
  verifyBtnTxt: { color: '#1565C0', fontWeight: '700', fontSize: 13 },
  verifiedText: { flex: 1, fontSize: 15, color: '#1A1A2E' },
  err: { fontSize: 12, color: '#FF3B30', marginTop: 3 },
  otpBox: { marginTop: 10, backgroundColor: '#F5F8FC', borderRadius: 10, padding: 12 },
  otpLabel: { fontSize: 12, color: '#546E7A', marginBottom: 8 },
  otpRow: { flexDirection: 'row', gap: 8 },
  otpInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#CFD8DC',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 18,
    letterSpacing: 6,
    color: '#1A1A2E',
    backgroundColor: '#FFF',
  },
  confirmBtn: { backgroundColor: '#1565C0', borderRadius: 8, paddingHorizontal: 18, justifyContent: 'center' },
  confirmBtnTxt: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  resendTxt: { fontSize: 12, color: '#1565C0', fontWeight: '600', marginTop: 8 },
  resendTxtDisabled: { color: '#90A4AE' },
});
