import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type PhotoOptionsModalProps = {
  visible: boolean;
  onClose: () => void;
  onTakePhoto: () => void;
  onChooseLibrary: () => void;
};

export default function PhotoOptionsModal({
  visible,
  onClose,
  onTakePhoto,
  onChooseLibrary,
}: PhotoOptionsModalProps) {
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header Icon */}
          <View style={styles.iconContainer}>
            <Ionicons name="camera-outline" size={28} color="#007AFF" />
          </View>

          {/* Texts */}
          <Text style={styles.title}>Update Profile Photo</Text>
          <Text style={styles.subtitle}>Select how you want to upload your photo</Text>

          {/* Options */}
          <TouchableOpacity
            style={styles.optionBtn}
            onPress={() => {
              onClose();
              onTakePhoto();
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.optionIconContainer, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="camera" size={20} color="#007AFF" />
            </View>
            <Text style={styles.optionText}>Take Photo</Text>
            <Ionicons name="chevron-forward" size={16} color="#94A3B8" style={styles.chevron} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.optionBtn}
            onPress={() => {
              onClose();
              onChooseLibrary();
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.optionIconContainer, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="image" size={20} color="#059669" />
            </View>
            <Text style={styles.optionText}>Choose from Library</Text>
            <Ionicons name="chevron-forward" size={16} color="#94A3B8" style={styles.chevron} />
          </TouchableOpacity>

          {/* Cancel */}
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '85%',
    maxWidth: 340,
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: '100%',
    marginBottom: 10,
  },
  optionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  optionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
  },
  chevron: {
    marginLeft: 4,
  },
  cancelBtn: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
  },
});
