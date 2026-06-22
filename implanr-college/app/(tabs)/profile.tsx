import React, { useState, useRef, useEffect } from 'react';
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
  Animated,
  Pressable,
  Linking,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import api from '../../utils/api';

export default function ProfileScreen() {
  const { user, logout, updateProfilePhoto } = useAuth();
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [crossAppStatus, setCrossAppStatus] = useState<{
    has_cross_app_access: boolean;
    cross_app_requested: boolean;
  } | null>(null);
  const [requestingAccess, setRequestingAccess] = useState(false);

  useEffect(() => {
    api.get('/auth/cross-app-status').then(r => setCrossAppStatus(r.data)).catch(() => {});
  }, []);

  const handleRequestCrossApp = async () => {
    setRequestingAccess(true);
    try {
      await api.post('/auth/request-cross-app-access');
      setCrossAppStatus(prev => prev ? { ...prev, cross_app_requested: true } : prev);
      Alert.alert('Request Sent', 'A platform admin will review your request to access the Clinic App.');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail ?? 'Could not submit request.');
    } finally {
      setRequestingAccess(false);
    }
  };

  // Fade-in animation for the modal backdrop + card
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    if (logoutModalVisible) {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(cardScale, {
          toValue: 1,
          friction: 7,
          tension: 120,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Reset for next open
      backdropOpacity.setValue(0);
      cardScale.setValue(0.92);
    }
  }, [logoutModalVisible]);

  const handleLogout = () => {
    setLogoutModalVisible(true);
  };

  const confirmLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      setLogoutModalVisible(false);
      router.replace('/auth/login');
    } finally {
      setLoggingOut(false);
    }
  };

  const cancelLogout = () => {
    setLogoutModalVisible(false);
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
      default:
        return '#757575';
    }
  };

  return (
    <View style={styles.container}>
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
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile Photo</Text>
          
          <TouchableOpacity style={styles.photoButton} onPress={showPhotoOptions}>
            <Ionicons name="image" size={24} color="#007AFF" />
            <Text style={styles.photoButtonText}>Change Profile Photo</Text>
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
          {user?.role !== 'nurse' && (
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
          )}
        </View>

        {/* HIPAA — Compliance section. Only Implant In-Charge / Administrator
            see this section. Everyone else has no render. */}
        {(user?.role === 'implant_incharge' || user?.role === 'administrator') && (
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

        {user?.role !== 'nurse' && (
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
            <Text style={styles.legalFootnoteText}>Auto-logout after 15 min of inactivity</Text>
          </View>
        </View>

        {/* Cross-App Access */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Switch App</Text>
          <View style={styles.crossAppRow}>
            <View style={styles.infoIcon}>
              <Ionicons name="business-outline" size={20} color="#2E7D32" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoValue}>Dental Clinic App</Text>
              <Text style={styles.infoLabel}>Manage your private clinic cases</Text>
            </View>
            {crossAppStatus?.has_cross_app_access ? (
              <TouchableOpacity
                style={styles.openAppBtn}
                onPress={() => Linking.openURL('implanr-clinic:///')}
              >
                <Text style={styles.openAppTxt}>Open</Text>
              </TouchableOpacity>
            ) : crossAppStatus?.cross_app_requested ? (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingTxt}>Pending</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.requestBtn, requestingAccess && { opacity: 0.6 }]}
                onPress={handleRequestCrossApp}
                disabled={requestingAccess}
              >
                {requestingAccess
                  ? <ActivityIndicator size="small" color="#1565C0" />
                  : <Text style={styles.requestTxt}>Request Access</Text>
                }
              </TouchableOpacity>
            )}
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} testID="logout-btn">
          <Ionicons name="log-out" size={24} color="#FFF" />
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Custom Logout Confirmation Modal ── */}
      <Modal
        visible={logoutModalVisible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={cancelLogout}
      >
        <Animated.View style={[styles.modalOverlay, { opacity: backdropOpacity }]}>
          <Pressable style={styles.modalBackdropTap} onPress={cancelLogout} />

          <Animated.View style={[styles.modalCard, { transform: [{ scale: cardScale }] }]}>
            {/* Icon badge */}
            <View style={styles.modalIconBadge}>
              <Ionicons name="log-out-outline" size={32} color="#DC3545" />
            </View>

            <Text style={styles.modalTitle}>Sign Out?</Text>
            <Text style={styles.modalMessage}>
              You'll need to sign in again to access your implant planning workspace.
            </Text>

            {/* Buttons */}
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={cancelLogout}
                disabled={loggingOut}
                testID="logout-cancel-btn"
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalConfirmBtn, loggingOut && styles.modalConfirmBtnDisabled]}
                onPress={confirmLogout}
                disabled={loggingOut}
                testID="logout-confirm-btn"
              >
                {loggingOut ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="log-out-outline" size={18} color="#FFF" style={{ marginRight: 6 }} />
                    <Text style={styles.modalConfirmText}>Sign Out</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </View>

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

  // ── Cross-app ──
  crossAppRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  openAppBtn: { backgroundColor: '#E8F5E9', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  openAppTxt: { fontSize: 13, color: '#2E7D32', fontWeight: '700' },
  pendingBadge: { backgroundColor: '#FFF3E0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  pendingTxt: { fontSize: 12, color: '#E65100', fontWeight: '600' },
  requestBtn: { borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  requestTxt: { fontSize: 12, color: '#1565C0', fontWeight: '600' },

  // ── Modal styles ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 20, 40, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdropTap: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '84%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 40,
    elevation: 20,
  },
  modalIconBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFF0F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: '#FFCDD2',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0A1428',
    marginBottom: 10,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 28,
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  modalConfirmBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#DC3545',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    shadowColor: '#DC3545',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  modalConfirmBtnDisabled: {
    opacity: 0.6,
  },
  modalConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
});
