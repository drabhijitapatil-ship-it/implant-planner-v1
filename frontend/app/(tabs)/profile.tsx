import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import BackToDashboard from '../../components/BackToDashboard';
import * as ImagePicker from 'expo-image-picker';

export default function ProfileScreen() {
  const { user, logout, updateProfilePhoto } = useAuth();
  const router = useRouter();
  const [uploading, setUploading] = useState(false);

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
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile Photo</Text>
          
          <TouchableOpacity style={styles.photoButton} onPress={showPhotoOptions}>
            <Ionicons name="image" size={24} color="#007AFF" />
            <Text style={styles.photoButtonText}>Change Profile Photo</Text>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out" size={24} color="#FFF" />
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
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
});
