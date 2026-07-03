import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import BackToDashboard from '../../components/BackToDashboard';
import * as ImagePicker from 'expo-image-picker';
import api from '../../utils/api';

const RESEND_COOLDOWN_SECONDS = 60;

export default function ProfileScreen() {
  const { user, logout, updateProfilePhoto } = useAuth();
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [org, setOrg] = useState<any>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const isIncharge = user?.role === 'implant_incharge';

  const fetchOrg = async () => {
    try {
      const res = await api.get('/organizations/me');
      setOrg(res.data?.organization || null);
    } catch {
      // Non-fatal: org section just won't render.
    }
  };
  useEffect(() => { fetchOrg(); }, []);

  // Change password — same OTP-verify flow as forgot-password, just pinned
  // to the logged-in user's own email (no email-entry step needed).
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pwStage, setPwStage] = useState<'sending' | 'code' | 'resetting'>('sending');
  const [pwOtp, setPwOtp] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwShowNew, setPwShowNew] = useState(false);
  const [pwShowConfirm, setPwShowConfirm] = useState(false);
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  const [pwCooldown, setPwCooldown] = useState(0);
  const pwTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pwTimerRef.current) clearInterval(pwTimerRef.current); }, []);

  const startPwCooldown = () => {
    setPwCooldown(RESEND_COOLDOWN_SECONDS);
    if (pwTimerRef.current) clearInterval(pwTimerRef.current);
    pwTimerRef.current = setInterval(() => {
      setPwCooldown((c) => {
        if (c <= 1) {
          if (pwTimerRef.current) clearInterval(pwTimerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const sendPasswordOtp = async () => {
    if (!user?.email) return;
    setPwStage('sending');
    try {
      await api.post('/auth/forgot-password', { email: user.email });
      setPwStage('code');
      startPwCooldown();
    } catch {
      Alert.alert('Error', 'Could not send verification code. Try again.');
      setShowPasswordModal(false);
    }
  };

  const openPasswordModal = () => {
    setPwOtp('');
    setPwNew('');
    setPwConfirm('');
    setPwErrors({});
    setShowPasswordModal(true);
    sendPasswordOtp();
  };

  const handleResendPwOtp = () => {
    if (pwCooldown > 0) return;
    sendPasswordOtp();
  };

  const handleUpdatePassword = async () => {
    const e: Record<string, string> = {};
    if (pwOtp.length !== 6) e.otp = 'Enter the 6-digit code';
    if (!pwNew) e.newPassword = 'Password is required';
    else if (pwNew.length < 8) e.newPassword = 'Minimum 8 characters';
    if (pwNew !== pwConfirm) e.confirmPassword = 'Passwords do not match';
    setPwErrors(e);
    if (Object.keys(e).length > 0) return;

    setPwStage('resetting');
    try {
      await api.post('/auth/reset-password', {
        email: user?.email,
        otp: pwOtp,
        new_password: pwNew,
      });
      setShowPasswordModal(false);
      Alert.alert(
        'Password Updated',
        'Your password has been changed. Please sign in again with your new password.',
        [{ text: 'OK', onPress: async () => { await logout(); router.replace('/auth/login'); } }]
      );
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      Alert.alert('Error', typeof detail === 'string' ? detail : 'Could not update password. Try again.');
      setPwStage('code');
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/auth/login');
        },
      },
    ]);
  };

  const handlePickImage = async () => {
    // Request permission
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library to upload a profile picture.');
      return;
    }

    // Pick image
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setUploading(true);
      try {
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        await updateProfilePhoto(base64Image);
        Alert.alert('Success', 'Profile photo updated successfully!');
      } catch (error: any) {
        Alert.alert('Error', error.message || 'Failed to upload photo');
      } finally {
        setUploading(false);
      }
    }
  };

  const handlePickLogo = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library to upload a logo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setLogoUploading(true);
      try {
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        const res = await api.put('/organizations/me/logo', { logo: base64Image });
        setOrg((prev: any) => (prev ? { ...prev, logo: res.data?.logo || base64Image } : prev));
        Alert.alert('Success', 'Organization logo updated successfully!');
      } catch (error: any) {
        Alert.alert('Error', error?.response?.data?.detail || 'Failed to upload logo');
      } finally {
        setLogoUploading(false);
      }
    }
  };

  const handleTakePhoto = async () => {
    // Request camera permission
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your camera to take a profile picture.');
      return;
    }

    // Take photo
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setUploading(true);
      try {
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        await updateProfilePhoto(base64Image);
        Alert.alert('Success', 'Profile photo updated successfully!');
      } catch (error: any) {
        Alert.alert('Error', error.message || 'Failed to upload photo');
      } finally {
        setUploading(false);
      }
    }
  };

  const showPhotoOptions = () => {
    Alert.alert(
      'Update Profile Photo',
      'Choose an option',
      [
        { text: 'Take Photo', onPress: handleTakePhoto },
        { text: 'Choose from Library', onPress: handlePickImage },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'student':
        return 'Postgraduate Student';
      case 'supervisor':
        return 'Supervisor';
      case 'administrator':
        return 'Administrator (Supervisor + Implant Incharge)';
      case 'implant_incharge':
        return 'Implant Incharge';
      case 'nurse':
        return 'Nurse';
      case 'super_admin':
        return 'Super Admin';
      default:
        return role;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'administrator':
        return '#9C27B0';
      case 'supervisor':
        return '#2196F3';
      case 'implant_incharge':
        return '#FF9800';
      case 'student':
        return '#4CAF50';
      case 'nurse':
        return '#E91E63';
      case 'super_admin':
        return '#212121';
      default:
        return '#757575';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView>
        <View style={styles.profileHeader}>
          <TouchableOpacity 
            style={styles.avatarContainer} 
            onPress={showPhotoOptions}
            disabled={uploading}
          >
            {uploading ? (
              <View style={styles.avatarPlaceholder}>
                <ActivityIndicator size="large" color="#007AFF" />
              </View>
            ) : user?.profile_photo ? (
              <Image 
                source={{ uri: user.profile_photo }} 
                style={styles.avatarImage}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={60} color="#999" />
              </View>
            )}
            <View style={styles.cameraIconContainer}>
              <Ionicons name="camera" size={20} color="#FFF" />
            </View>
          </TouchableOpacity>
          
          <Text style={styles.userName}>{user?.name}</Text>
          <View style={[styles.roleBadge, { backgroundColor: getRoleColor(user?.role || '') }]}>
            <Text style={styles.roleText}>{getRoleLabel(user?.role || '')}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Information</Text>
          
          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Ionicons name="mail" size={20} color="#007AFF" />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{user?.email}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Ionicons name="shield-checkmark" size={20} color="#007AFF" />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Role</Text>
              <Text style={styles.infoValue}>{getRoleLabel(user?.role || '')}</Text>
            </View>
          </View>

          {org && (
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name="business" size={20} color="#007AFF" />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Organization</Text>
                <Text style={styles.infoValue}>{org.name}</Text>
              </View>
              {org.logo ? (
                <Image source={{ uri: org.logo }} style={{ width: 40, height: 40, borderRadius: 8 }} />
              ) : null}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile Photo</Text>
          
          <TouchableOpacity style={styles.photoButton} onPress={showPhotoOptions}>
            <Ionicons name="image" size={24} color="#007AFF" />
            <Text style={styles.photoButtonText}>Change Profile Photo</Text>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
        </View>

        {isIncharge && org && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Organization Logo</Text>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              {org.logo ? (
                <Image source={{ uri: org.logo }} style={{ width: 90, height: 90, borderRadius: 12, borderWidth: 1, borderColor: '#E0E0E0' }} />
              ) : (
                <View style={{ width: 90, height: 90, borderRadius: 12, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="business" size={36} color="#B0BEC5" />
                </View>
              )}
            </View>
            <TouchableOpacity style={styles.photoButton} onPress={handlePickLogo} disabled={logoUploading} data-testid="change-org-logo-btn">
              <Ionicons name="image" size={24} color="#007AFF" />
              <Text style={styles.photoButtonText}>{logoUploading ? 'Uploading…' : 'Change Organization Logo'}</Text>
              {logoUploading ? <ActivityIndicator color="#007AFF" /> : <Ionicons name="chevron-forward" size={20} color="#999" />}
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>

          <TouchableOpacity style={styles.photoButton} onPress={openPasswordModal} data-testid="change-password-btn">
            <Ionicons name="key" size={24} color="#007AFF" />
            <Text style={styles.photoButtonText}>Change Password</Text>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Help</Text>
          <TouchableOpacity
            style={styles.legalRow}
            onPress={() => router.push('/help-workflow?mode=review')}
            data-testid="link-how-it-works"
            testID="link-how-it-works"
          >
            <Ionicons name="help-circle-outline" size={22} color="#1565C0" />
            <Text style={styles.legalRowText}>How it works</Text>
            <Ionicons name="chevron-forward" size={18} color="#999" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.legalRow}
            onPress={() => router.push('/whatsnew?mode=history')}
            data-testid="link-whats-new"
            testID="link-whats-new"
          >
            <Ionicons name="sparkles-outline" size={22} color="#FF8F00" />
            <Text style={styles.legalRowText}>What's new</Text>
            <Ionicons name="chevron-forward" size={18} color="#999" />
          </TouchableOpacity>
        </View>

        {/* HIPAA — Compliance section. Only Implant In-Charge / Administrator
            see this section. Everyone else has no render. */}
        {(user?.role === 'implant_incharge' || user?.role === 'administrator' || user?.role === 'super_admin') && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Compliance</Text>
            <TouchableOpacity
              style={styles.legalRow}
              onPress={() => router.push('/admin/audit-log')}
              data-testid="link-audit-log"
              testID="link-audit-log"
            >
              <Ionicons name="shield-outline" size={22} color="#1565C0" />
              <Text style={styles.legalRowText}>Audit log</Text>
              <Ionicons name="chevron-forward" size={18} color="#999" />
            </TouchableOpacity>
          </View>
        )}

        {(user?.role || '').toLowerCase() !== 'nurse' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Learning</Text>
            <TouchableOpacity
              style={styles.legalRow}
              onPress={() => router.push('/saved-tips' as any)}
              data-testid="link-saved-tips"
              testID="link-saved-tips"
            >
              <Ionicons name="bookmark-outline" size={22} color="#1565C0" />
              <Text style={styles.legalRowText}>Saved Smart Tips</Text>
              <Ionicons name="chevron-forward" size={18} color="#999" />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>
          <TouchableOpacity
            style={styles.legalRow}
            onPress={() => router.push('/legal/privacy-policy')}
            data-testid="link-privacy-policy"
          >
            <Ionicons name="shield-checkmark-outline" size={22} color="#1565C0" />
            <Text style={styles.legalRowText}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={18} color="#999" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.legalRow}
            onPress={() => router.push('/legal/terms')}
            data-testid="link-terms"
          >
            <Ionicons name="document-text-outline" size={22} color="#1565C0" />
            <Text style={styles.legalRowText}>Terms of Service</Text>
            <Ionicons name="chevron-forward" size={18} color="#999" />
          </TouchableOpacity>
          <View style={styles.legalFootnote}>
            <Ionicons name="time-outline" size={12} color="#78909C" />
            <Text style={styles.legalFootnoteText}>Auto-logout after 20 min of inactivity</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out" size={24} color="#FFF" />
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Change Password Modal — OTP verify + set new password */}
      <Modal visible={showPasswordModal} animationType="slide" transparent>
        <View style={pwStyles.overlay}>
          <View style={pwStyles.card}>
            <View style={pwStyles.header}>
              <Text style={pwStyles.title}>Change Password</Text>
              <TouchableOpacity onPress={() => setShowPasswordModal(false)} data-testid="close-password-modal">
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {pwStage === 'sending' ? (
              <View style={pwStyles.sendingBox}>
                <ActivityIndicator color="#007AFF" />
                <Text style={pwStyles.sendingTxt}>Sending verification code to {user?.email}…</Text>
              </View>
            ) : (
              <>
                <Text style={pwStyles.subtitle}>
                  Enter the 6-digit code sent to {user?.email} and choose a new password.
                </Text>

                <Text style={pwStyles.label}>Verification Code</Text>
                <TextInput
                  style={[pwStyles.input, pwStyles.otpInput, pwErrors.otp && pwStyles.inputErr]}
                  placeholder="000000"
                  value={pwOtp}
                  onChangeText={(t) => setPwOtp(t.replace(/[^0-9]/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  data-testid="change-password-otp"
                />
                {pwErrors.otp ? <Text style={pwStyles.err}>{pwErrors.otp}</Text> : null}

                <TouchableOpacity onPress={handleResendPwOtp} disabled={pwCooldown > 0} style={pwStyles.resendRow}>
                  <Text style={[pwStyles.resendTxt, pwCooldown > 0 && pwStyles.resendTxtDisabled]}>
                    {pwCooldown > 0 ? `Resend code in ${pwCooldown}s` : 'Resend code'}
                  </Text>
                </TouchableOpacity>

                <Text style={pwStyles.label}>New Password</Text>
                <View style={[pwStyles.pwRow, pwErrors.newPassword && pwStyles.inputErr]}>
                  <TextInput
                    style={pwStyles.pwInput}
                    placeholder="Min. 8 characters"
                    value={pwNew}
                    onChangeText={setPwNew}
                    secureTextEntry={!pwShowNew}
                    autoCapitalize="none"
                    data-testid="change-password-new"
                  />
                  <TouchableOpacity onPress={() => setPwShowNew(!pwShowNew)}>
                    <Ionicons name={pwShowNew ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
                  </TouchableOpacity>
                </View>
                {pwErrors.newPassword ? <Text style={pwStyles.err}>{pwErrors.newPassword}</Text> : null}

                <Text style={pwStyles.label}>Confirm New Password</Text>
                <View style={[pwStyles.pwRow, pwErrors.confirmPassword && pwStyles.inputErr]}>
                  <TextInput
                    style={pwStyles.pwInput}
                    placeholder="Re-enter password"
                    value={pwConfirm}
                    onChangeText={setPwConfirm}
                    secureTextEntry={!pwShowConfirm}
                    autoCapitalize="none"
                    data-testid="change-password-confirm"
                  />
                  <TouchableOpacity onPress={() => setPwShowConfirm(!pwShowConfirm)}>
                    <Ionicons name={pwShowConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
                  </TouchableOpacity>
                </View>
                {pwErrors.confirmPassword ? <Text style={pwStyles.err}>{pwErrors.confirmPassword}</Text> : null}

                <TouchableOpacity
                  style={[pwStyles.submitBtn, pwStage === 'resetting' && pwStyles.btnDisabled]}
                  onPress={handleUpdatePassword}
                  disabled={pwStage === 'resetting'}
                  data-testid="change-password-submit"
                >
                  {pwStage === 'resetting' ? <ActivityIndicator color="#FFF" /> : <Text style={pwStyles.submitTxt}>Update Password</Text>}
                </TouchableOpacity>
              </>
            )}
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
  profileHeader: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFF',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatarImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: '#007AFF',
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#007AFF',
  },
  cameraIconContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#007AFF',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFF',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  roleBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  roleText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#FFF',
    margin: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 16,
    color: '#1A1A1A',
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  photoButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#1A1A1A',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC3545',
    marginHorizontal: 16,
    marginVertical: 24,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  logoutButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: 12,
  },
  legalRowText: {
    flex: 1,
    fontSize: 15,
    color: '#1A1A1A',
    fontWeight: '500',
  },
  legalFootnote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 10,
  },
  legalFootnoteText: {
    fontSize: 11,
    color: '#78909C',
    fontStyle: 'italic',
  },
});

const pwStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  card: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  subtitle: { fontSize: 13, color: '#546E7A', marginBottom: 8, lineHeight: 19 },
  sendingBox: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  sendingTxt: { fontSize: 14, color: '#546E7A', textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: '#37474F', marginBottom: 6, marginTop: 14 },
  input: { borderWidth: 1.5, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#1A1A2E', backgroundColor: '#FAFAFA' },
  otpInput: { fontSize: 20, letterSpacing: 8, fontFamily: 'monospace', textAlign: 'center' },
  inputErr: { borderColor: '#FF3B30' },
  err: { fontSize: 12, color: '#FF3B30', marginTop: 3 },
  pwRow: { borderWidth: 1.5, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFAFA' },
  pwInput: { flex: 1, fontSize: 15, color: '#1A1A2E', paddingVertical: 8 },
  resendRow: { marginTop: 8, alignItems: 'flex-end' },
  resendTxt: { fontSize: 13, color: '#007AFF', fontWeight: '600' },
  resendTxtDisabled: { color: '#90A4AE' },
  submitBtn: { backgroundColor: '#007AFF', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 20, marginBottom: 8 },
  btnDisabled: { opacity: 0.6 },
  submitTxt: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
