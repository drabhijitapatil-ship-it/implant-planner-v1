/**
 * Delete Account — self-service, permanent account deletion
 * (App Store Review Guideline 5.1.1(v)). Reached from Profile → Delete Account.
 *
 * Flow: explanation of what is deleted / retained → re-enter password →
 * type DELETE → POST /auth/delete-account → signed out → confirmation alert →
 * login screen.
 */
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import ScrollView from '@/components/KeyboardAwareScrollView';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

export default function DeleteAccountScreen() {
  const { user, logout } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const canSubmit = !!password && confirm.trim().toUpperCase() === 'DELETE' && !busy;

  const doDelete = async () => {
    setBusy(true);
    try {
      await api.post('/auth/delete-account', { password, confirm: confirm.trim() });
      // The account no longer exists — clear the local session.
      try { await logout(); } catch {}
      router.replace('/auth/login');
      setTimeout(() => {
        Alert.alert('Account deleted', 'Your Implanr account and personal data have been permanently deleted.');
      }, 300);
    } catch (e: any) {
      Alert.alert('Could not delete account', e?.response?.data?.detail || 'Please try again.');
      setBusy(false);
    }
  };

  const onPress = () => {
    if (!canSubmit) return;
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your Implanr account. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete permanently', style: 'destructive', onPress: doDelete },
      ],
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} testID="delete-account-back">
          <Ionicons name="arrow-back" size={22} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={s.title}>Delete Account</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={s.warnCard}>
          <Ionicons name="warning" size={22} color="#C62828" />
          <Text style={s.warnText}>
            Deleting your account is permanent and cannot be undone.
            {user?.email ? `\nAccount: ${user.email}` : ''}
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>What will be deleted</Text>
          {[
            'Your profile — name, email, username, password and photo',
            'Your sign-in sessions on all devices',
            'Your notifications, saved tips and app preferences',
            'Your name on forum and chat messages (shown as "Deleted user")',
          ].map((t) => (
            <View key={t} style={s.row}>
              <Ionicons name="trash-outline" size={16} color="#C62828" />
              <Text style={s.rowText}>{t}</Text>
            </View>
          ))}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>What your institution keeps</Text>
          <View style={s.row}>
            <Ionicons name="document-text-outline" size={16} color="#455A64" />
            <Text style={s.rowText}>
              Patient case records you worked on belong to your college / clinic and are kept as
              required by medical-record retention laws. They are not deleted with your account.
            </Text>
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.label}>Enter your password</Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            autoComplete="password"
            placeholder="Password"
            placeholderTextColor="#94A3B8"
            testID="delete-account-password"
          />
          <Text style={[s.label, { marginTop: 14 }]}>Type DELETE to confirm</Text>
          <TextInput
            style={s.input}
            value={confirm}
            onChangeText={setConfirm}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="DELETE"
            placeholderTextColor="#94A3B8"
            testID="delete-account-confirm"
          />
        </View>

        <TouchableOpacity
          style={[s.deleteBtn, !canSubmit && s.deleteBtnDisabled]}
          onPress={onPress}
          disabled={!canSubmit}
          testID="delete-account-submit"
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="trash" size={18} color="#FFF" />
              <Text style={s.deleteText}>Delete my account permanently</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={s.cancelBtn} onPress={() => router.back()} testID="delete-account-cancel">
          <Text style={s.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F5F7' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  warnCard: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: '#FFEBEE', borderColor: '#FFCDD2', borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  warnText: { flex: 1, color: '#B71C1C', fontSize: 14, fontWeight: '600', lineHeight: 20 },
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E8EDF5' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1A2332', marginBottom: 10 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 8 },
  rowText: { flex: 1, fontSize: 13, color: '#37474F', lineHeight: 19 },
  label: { fontSize: 13, fontWeight: '600', color: '#37474F', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#1A1A1A', backgroundColor: '#FAFAFA' },
  deleteBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D32F2F', borderRadius: 14, paddingVertical: 15, marginTop: 4 },
  deleteBtnDisabled: { backgroundColor: '#EF9A9A' },
  deleteText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { color: '#546E7A', fontSize: 14, fontWeight: '600' },
});
