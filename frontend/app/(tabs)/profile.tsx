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
import LogoutConfirmModal from '../../components/LogoutConfirmModal';
import PhotoOptionsModal from '../../components/PhotoOptionsModal';

const RESEND_COOLDOWN_SECONDS = 60;

export default function ProfileScreen() {
  const { user, logout, updateProfilePhoto } = useAuth();
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [org, setOrg] = useState<any>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
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
    setShowLogoutModal(true);
  };

  const handlePickImage = async () => {
    // Request permission
    // System photo picker needs no media-library permission (Play policy: READ_MEDIA_* removed).

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
    // System photo picker needs no media-library permission (Play policy: READ_MEDIA_* removed).
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
    setShowPhotoModal(true);
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
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header Block */}
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
                <Ionicons name="person" size={54} color="#94A3B8" />
              </View>
            )}
            <View style={styles.cameraIconContainer}>
              <Ionicons name="camera" size={16} color="#FFF" />
            </View>
          </TouchableOpacity>
          
          <Text style={styles.userName}>{user?.name}</Text>
          <View style={[styles.roleBadge, { backgroundColor: getRoleColor(user?.role || '') }]}>
            <Text style={styles.roleText}>{getRoleLabel(user?.role || '')}</Text>
          </View>
        </View>

        {/* Section: Account Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Information</Text>
          
          <View style={styles.rowItem}>
            <View style={[styles.iconBadge, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="mail" size={20} color="#1D4ED8" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Email</Text>
              <Text style={styles.rowValue}>{user?.email}</Text>
            </View>
          </View>

          <View style={styles.rowItem}>
            <View style={[styles.iconBadge, { backgroundColor: '#EEF2F6' }]}>
              <Ionicons name="shield-checkmark" size={20} color="#475569" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Role</Text>
              <Text style={styles.rowValue}>{getRoleLabel(user?.role || '')}</Text>
            </View>
          </View>

          {org && (
            <View style={[styles.rowItem, styles.rowItemLast]}>
              <View style={[styles.iconBadge, { backgroundColor: '#E0F2F1' }]}>
                <Ionicons name="business" size={20} color="#00695C" />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Organization</Text>
                <Text style={styles.rowValue}>{org.name}</Text>
              </View>
              {org.logo ? (
                <Image source={{ uri: org.logo }} style={{ width: 36, height: 36, borderRadius: 8 }} />
              ) : null}
            </View>
          )}
        </View>

        {/* Section: Profile Photo */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile Photo</Text>
          
          <TouchableOpacity style={[styles.rowItem, styles.rowItemLast]} onPress={showPhotoOptions}>
            <View style={[styles.iconBadge, { backgroundColor: '#E8F5E9' }]}>
              <Ionicons name="image" size={20} color="#2E7D32" />
            </View>
            <Text style={styles.photoButtonText}>Change Profile Photo</Text>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* Section: Organization Logo (In-charge only) */}
        {isIncharge && org && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Organization Logo</Text>
            <View style={styles.orgLogoContainer}>
              {org.logo ? (
                <Image source={{ uri: org.logo }} style={styles.orgLogo} />
              ) : (
                <View style={styles.orgLogoPlaceholder}>
                  <Ionicons name="business" size={32} color="#94A3B8" />
                </View>
              )}
            </View>
            <TouchableOpacity style={[styles.rowItem, styles.rowItemLast]} onPress={handlePickLogo} disabled={logoUploading} data-testid="change-org-logo-btn">
              <View style={[styles.iconBadge, { backgroundColor: '#E0F7FA' }]}>
                <Ionicons name="image" size={20} color="#00838F" />
              </View>
              <Text style={styles.photoButtonText}>{logoUploading ? 'Uploading…' : 'Change Organization Logo'}</Text>
              {logoUploading ? <ActivityIndicator size="small" color="#007AFF" /> : <Ionicons name="chevron-forward" size={18} color="#94A3B8" />}
            </TouchableOpacity>
          </View>
        )}

        {/* Section: Security */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>

          <TouchableOpacity style={[styles.rowItem, styles.rowItemLast]} onPress={openPasswordModal} data-testid="change-password-btn">
            <View style={[styles.iconBadge, { backgroundColor: '#FFF8E1' }]}>
              <Ionicons name="key" size={20} color="#F57F17" />
            </View>
            <Text style={styles.photoButtonText}>Change Password</Text>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* Section: Help */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Help</Text>
          <TouchableOpacity
            style={styles.rowItem}
            onPress={() => router.push('/help-workflow?mode=review')}
            data-testid="link-how-it-works"
            testID="link-how-it-works"
          >
            <View style={[styles.iconBadge, { backgroundColor: '#E8EAF6' }]}>
              <Ionicons name="help-circle" size={20} color="#3F51B5" />
            </View>
            <Text style={styles.photoButtonText}>How it works</Text>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.rowItem, styles.rowItemLast]}
            onPress={() => router.push('/whatsnew?mode=history')}
            data-testid="link-whats-new"
            testID="link-whats-new"
          >
            <View style={[styles.iconBadge, { backgroundColor: '#FFF3E0' }]}>
              <Ionicons name="sparkles" size={20} color="#E65100" />
            </View>
            <Text style={styles.photoButtonText}>What's new</Text>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* Section: Compliance (Admins / Incharges) */}
        {(user?.role === 'implant_incharge' || user?.role === 'administrator' || user?.role === 'super_admin') && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Compliance</Text>
            <TouchableOpacity
              style={[styles.rowItem, styles.rowItemLast]}
              onPress={() => router.push('/admin/audit-log')}
              data-testid="link-audit-log"
              testID="link-audit-log"
            >
              <View style={[styles.iconBadge, { backgroundColor: '#F1F8E9' }]}>
                <Ionicons name="shield" size={20} color="#558B2F" />
              </View>
              <Text style={styles.photoButtonText}>Audit log</Text>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        )}

        {/* Section: Learning (All except Nurse) */}
        {(user?.role || '').toLowerCase() !== 'nurse' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Learning</Text>
            <TouchableOpacity
              style={[styles.rowItem, styles.rowItemLast]}
              onPress={() => router.push('/saved-tips' as any)}
              data-testid="link-saved-tips"
              testID="link-saved-tips"
            >
              <View style={[styles.iconBadge, { backgroundColor: '#FCE4EC' }]}>
                <Ionicons name="bookmark" size={20} color="#C2185B" />
              </View>
              <Text style={styles.photoButtonText}>Saved Smart Tips</Text>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        )}

        {/* Section: Legal */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>
          <TouchableOpacity
            style={styles.rowItem}
            onPress={() => router.push('/legal/privacy-policy')}
            data-testid="link-privacy-policy"
          >
            <View style={[styles.iconBadge, { backgroundColor: '#ECEFF1' }]}>
              <Ionicons name="shield-checkmark" size={20} color="#37474F" />
            </View>
            <Text style={styles.photoButtonText}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.rowItem, styles.rowItemLast]}
            onPress={() => router.push('/legal/terms')}
            data-testid="link-terms"
          >
            <View style={[styles.iconBadge, { backgroundColor: '#ECEFF1' }]}>
              <Ionicons name="document-text" size={20} color="#37474F" />
            </View>
            <Text style={styles.photoButtonText}>Terms of Service</Text>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>
          <View style={styles.legalFootnote}>
            <Ionicons name="time-outline" size={12} color="#94A3B8" />
            <Text style={styles.legalFootnoteText}>Auto-logout after 15 min of inactivity</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out" size={20} color="#DC2626" />
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
                <Ionicons name="close" size={24} color="#64748B" />
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

      <LogoutConfirmModal 
        visible={showLogoutModal} 
        onClose={() => setShowLogoutModal(false)} 
        onConfirm={async () => {
          setShowLogoutModal(false);
          await logout();
          router.replace('/auth/login');
        }}
      />

      <PhotoOptionsModal
        visible={showPhotoModal}
        onClose={() => setShowPhotoModal(false)}
        onTakePhoto={handleTakePhoto}
        onChooseLibrary={handlePickImage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  profileHeader: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 28,
    paddingHorizontal: 24,
    backgroundColor: '#0B1930',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatarImage: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: '#FFF',
  },
  avatarPlaceholder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFF',
  },
  cameraIconContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#007AFF',
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#0B1930',
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 8,
  },
  roleBadge: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  roleText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#FFF',
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: 12,
    marginBottom: 8,
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  rowItemLast: {
    borderBottomWidth: 0,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    marginBottom: 2,
  },
  rowValue: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
  },
  photoButtonText: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
  },
  orgLogoContainer: {
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 4,
  },
  orgLogo: {
    width: 80,
    height: 80,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  orgLogoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 32,
    padding: 16,
    borderRadius: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  logoutButtonText: {
    color: '#DC2626',
    fontSize: 16,
    fontWeight: '700',
  },
  legalFootnote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 8,
  },
  legalFootnoteText: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
});

const pwStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  card: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '90%', shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  subtitle: { fontSize: 13, color: '#64748B', marginBottom: 12, lineHeight: 18 },
  sendingBox: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  sendingTxt: { fontSize: 14, color: '#64748B', textAlign: 'center' },
  label: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 6, marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#0F172A', backgroundColor: '#F8FAFC' },
  otpInput: { fontSize: 20, letterSpacing: 8, fontFamily: 'monospace', textAlign: 'center' },
  inputErr: { borderColor: '#FF3B30' },
  err: { fontSize: 12, color: '#FF3B30', marginTop: 3 },
  pwRow: { borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC' },
  pwInput: { flex: 1, fontSize: 15, color: '#0F172A', paddingVertical: 8 },
  resendRow: { marginTop: 8, alignItems: 'flex-end' },
  resendTxt: { fontSize: 13, color: '#007AFF', fontWeight: '600' },
  resendTxtDisabled: { color: '#94A3B8' },
  submitBtn: { backgroundColor: '#007AFF', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 24, marginBottom: 8 },
  btnDisabled: { opacity: 0.6 },
  submitTxt: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
