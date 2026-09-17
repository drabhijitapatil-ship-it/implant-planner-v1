import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';
import { THEME } from '../constants/theme';

interface SafeDeleteModalProps {
  visible: boolean;
  procedureId: string;
  registrationNumber?: string;
  patientName?: string;
  onClose: () => void;
  onSuccess: (deletedId: string) => void;
}

export default function SafeDeleteModal({
  visible,
  procedureId,
  registrationNumber,
  patientName,
  onClose,
  onSuccess,
}: SafeDeleteModalProps) {
  const [confirmInput, setConfirmInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (visible) {
      setConfirmInput('');
      setIsDeleting(false);
    }
  }, [visible, procedureId]);

  const cleanRegNum = (registrationNumber || '').trim();
  const expectedText = cleanRegNum.length > 0 ? cleanRegNum : 'DELETE';
  const isMatch = confirmInput.trim().toUpperCase() === expectedText.toUpperCase();

  const handleDelete = async () => {
    if (!procedureId) {
      Alert.alert('Error', 'Missing case ID');
      return;
    }
    if (!isMatch || isDeleting) return;

    setIsDeleting(true);
    try {
      await api.delete(`/procedures/${procedureId}`);
      Alert.alert('Done', 'Case deleted successfully');
      onSuccess(procedureId);
      onClose();
    } catch (error: any) {
      Alert.alert(
        'Error',
        error.response?.data?.detail || 'Failed to delete case',
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={isDeleting ? undefined : onClose}
        />
        <View
          style={styles.container}
          testID="safe-delete-modal"
          {...({ 'data-testid': 'safe-delete-modal' } as any)}
        >
          {/* Header Icon */}
          <View style={styles.iconWrapper}>
            <Ionicons name="warning" size={30} color={THEME.colors.danger} />
          </View>

          {/* Title & Warning */}
          <Text style={styles.title}>Delete Case Permanently</Text>
          <Text style={styles.warningText}>
            This action cannot be undone. All stages, checklists, and patient records will be permanently removed.
          </Text>

          {/* Case Info Card */}
          <View style={styles.caseInfoCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.patientLabel}>Patient</Text>
              <Text style={styles.patientName} numberOfLines={1}>
                {patientName || 'Untitled Case'}
              </Text>
            </View>
            <View style={styles.regBadge}>
              <Text style={styles.regBadgeText}>
                #{cleanRegNum || 'N/A'}
              </Text>
            </View>
          </View>

          {/* Confirmation Prompt */}
          <View style={styles.promptContainer}>
            <Text style={styles.promptLabel}>
              Type <Text style={styles.expectedTextBold}>{expectedText}</Text> to confirm deletion:
            </Text>
            <TextInput
              style={[
                styles.textInput,
                confirmInput.length > 0 && (isMatch ? styles.inputValid : styles.inputInvalid),
              ]}
              placeholder={`Enter "${expectedText}"`}
              placeholderTextColor={THEME.colors.textMuted}
              value={confirmInput}
              onChangeText={setConfirmInput}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!isDeleting}
              testID="safe-delete-confirm-input"
              {...({ 'data-testid': 'safe-delete-confirm-input' } as any)}
            />
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
              disabled={isDeleting}
              testID="safe-delete-cancel-btn"
              {...({ 'data-testid': 'safe-delete-cancel-btn' } as any)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                styles.deleteButton,
                (!isMatch || isDeleting) && styles.deleteButtonDisabled,
              ]}
              onPress={handleDelete}
              disabled={!isMatch || isDeleting}
              testID="safe-delete-confirm-btn"
              {...({ 'data-testid': 'safe-delete-confirm-btn' } as any)}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.deleteButtonText}>Delete Case</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    padding: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  container: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: THEME.colors.cardBackground,
    borderRadius: 18,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  iconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: THEME.colors.dangerLight,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: THEME.colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 13,
    lineHeight: 18,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 18,
  },
  caseInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: THEME.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
  },
  patientLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: THEME.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  patientName: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.text,
    marginTop: 2,
  },
  regBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: THEME.colors.primaryLight,
  },
  regBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  promptContainer: {
    marginBottom: 20,
  },
  promptLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: THEME.colors.textSecondary,
    marginBottom: 8,
  },
  expectedTextBold: {
    fontWeight: '700',
    color: THEME.colors.danger,
  },
  textInput: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surfaceSubtle,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '600',
    color: THEME.colors.text,
  },
  inputValid: {
    borderColor: THEME.colors.danger,
    backgroundColor: '#FFF5F5',
  },
  inputInvalid: {
    borderColor: THEME.colors.borderStrong,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: THEME.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
  },
  deleteButton: {
    backgroundColor: THEME.colors.danger,
  },
  deleteButtonDisabled: {
    backgroundColor: '#FCA5A5',
    opacity: 0.65,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
