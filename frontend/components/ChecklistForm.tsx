import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { CHECKLIST_DATA } from '../constants/checklist';
import api from '../utils/api';

interface ChecklistFormProps {
  checklist: any;
  onChecklistChange: (checklist: any) => void;
  phase?: 1 | 2;
  stage2Section?: 'second_stage' | 'prosthetic_phase';
  procedureId?: string; // needed for file uploads
}

export default function ChecklistForm({ checklist, onChecklistChange, phase, stage2Section, procedureId }: ChecklistFormProps) {
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, any[]>>({});
  const [uploadingItem, setUploadingItem] = useState<string | null>(null);
  const [filesLoaded, setFilesLoaded] = useState(false);

  // Load existing files if procedureId is available
  useEffect(() => {
    if (procedureId) loadFiles();
  }, [procedureId]);

  const loadFiles = useCallback(async () => {
    if (!procedureId) return;
    try {
      const res = await api.get(`/procedures/${procedureId}/checklist-files`);
      setUploadedFiles(res.data.files || {});
    } catch { /* ignore */ }
    finally { setFilesLoaded(true); }
  }, [procedureId]);

  const handleCheckboxToggle = (section: string, itemId: string, itemLabel: string) => {
    const updatedChecklist = { ...checklist };
    if (!updatedChecklist[section]) {
      updatedChecklist[section] = { items: [] };
    }
    const itemIndex = updatedChecklist[section].items.findIndex(
      (item: any) => item.id === itemId
    );
    if (itemIndex >= 0) {
      updatedChecklist[section].items[itemIndex].value =
        !updatedChecklist[section].items[itemIndex].value;
    } else {
      updatedChecklist[section].items.push({ id: itemId, label: itemLabel, value: true });
    }
    onChecklistChange(updatedChecklist);
  };

  const handleAdditionalFieldChange = (section: string, fieldId: string, value: string) => {
    const updatedChecklist = { ...checklist };
    if (!updatedChecklist[section]) {
      updatedChecklist[section] = { items: [], additional_fields: {} };
    }
    if (!updatedChecklist[section].additional_fields) {
      updatedChecklist[section].additional_fields = {};
    }
    updatedChecklist[section].additional_fields[fieldId] = value;
    onChecklistChange(updatedChecklist);
  };

  const getCheckboxValue = (section: string, itemId: string): boolean => {
    if (!checklist[section] || !checklist[section].items) return false;
    const item = checklist[section].items.find((i: any) => i.id === itemId);
    return item?.value || false;
  };

  const getAdditionalFieldValue = (section: string, fieldId: string): string => {
    if (!checklist[section] || !checklist[section].additional_fields) return '';
    return checklist[section].additional_fields[fieldId] || '';
  };

  const handleFileUpload = async (itemId: string) => {
    if (!procedureId) {
      Alert.alert('Info', 'Please save the procedure first, then upload files from the procedure detail page.');
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'image/jpeg', 'image/png', 'image/heic'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setUploadingItem(itemId);
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: asset.name || `file_${itemId}.pdf`,
        type: asset.mimeType || 'application/octet-stream',
      } as any);

      await api.post(`/procedures/${procedureId}/checklist-files/${itemId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await loadFiles();
    } catch (err: any) {
      Alert.alert('Upload Failed', err.response?.data?.detail || 'Could not upload file.');
    } finally {
      setUploadingItem(null);
    }
  };

  const handleDeleteFile = (itemId: string, filename: string, originalName: string) => {
    if (!procedureId) return;
    Alert.alert('Delete File', `Remove "${originalName}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/procedures/${procedureId}/checklist-files/${itemId}/${filename}`);
          await loadFiles();
        } catch {
          Alert.alert('Error', 'Failed to delete file.');
        }
      }},
    ]);
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'document-text';
    if (ext === 'ppt' || ext === 'pptx') return 'easel';
    if (ext === 'doc' || ext === 'docx') return 'document';
    if (['jpg','jpeg','png','heic'].includes(ext || '')) return 'image';
    return 'attach';
  };

  const renderChecklistSection = (sectionKey: string, sectionData: any) => {
    return (
      <View key={sectionKey} style={styles.section}>
        <Text style={styles.sectionTitle}>{sectionData.title}</Text>

        {sectionData.items.map((item: any, index: number) => {
          const isChecked = getCheckboxValue(sectionKey, item.id);
          const itemFiles = uploadedFiles[item.id] || [];
          const isUploading = uploadingItem === item.id;

          return (
            <View key={item.id}>
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => handleCheckboxToggle(sectionKey, item.id, item.label)}
                data-testid={`checklist-${item.id}`}
              >
                <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
                  {isChecked && <Ionicons name="checkmark" size={16} color="#FFF" />}
                </View>
                <View style={styles.labelContainer}>
                  <Text style={styles.checkboxLabel}>{index + 1}. {item.label}</Text>
                  {item.hasUpload && (
                    <Text style={styles.uploadHint}>Attach: {item.uploadTypes}</Text>
                  )}
                </View>
              </TouchableOpacity>

              {/* File Upload Area for items with hasUpload */}
              {item.hasUpload && (
                <View style={styles.fileSection}>
                  {/* Existing files */}
                  {itemFiles.map((file: any) => (
                    <View key={file.filename} style={styles.fileRow}>
                      <Ionicons name={getFileIcon(file.original_name)} size={18} color="#1565C0" />
                      <Text style={styles.fileName} numberOfLines={1}>{file.original_name}</Text>
                      <Text style={styles.fileSize}>
                        {file.size > 1024 * 1024
                          ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                          : `${Math.round(file.size / 1024)} KB`}
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleDeleteFile(item.id, file.filename, file.original_name)}
                        style={styles.deleteFileBtn}
                        data-testid={`delete-file-${file.filename}`}
                      >
                        <Ionicons name="close-circle" size={20} color="#E53935" />
                      </TouchableOpacity>
                    </View>
                  ))}

                  {/* Upload button */}
                  <TouchableOpacity
                    style={styles.uploadBtn}
                    onPress={() => handleFileUpload(item.id)}
                    disabled={isUploading}
                    data-testid={`upload-btn-${item.id}`}
                  >
                    {isUploading ? (
                      <ActivityIndicator size="small" color="#1565C0" />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload-outline" size={16} color="#1565C0" />
                        <Text style={styles.uploadBtnText}>
                          {itemFiles.length > 0 ? 'Upload Another' : `Upload ${item.uploadTypes}`}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}

        {sectionData.additionalFields?.map((field: any) => (
          <View key={field.id} style={styles.additionalField}>
            <Text style={styles.fieldLabel}>{field.label}</Text>
            <TextInput
              style={styles.textInput}
              value={getAdditionalFieldValue(sectionKey, field.id)}
              onChangeText={(value) => handleAdditionalFieldChange(sectionKey, field.id, value)}
              multiline
              placeholder={`Enter ${field.label.toLowerCase()}`}
              data-testid={`field-${field.id}`}
            />
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.mainTitle}>Implant Standard Operating Protocol Checklist</Text>

      {(!phase || phase === 1) && !stage2Section && renderChecklistSection('pre_surgical', CHECKLIST_DATA.pre_surgical)}
      {(!phase || phase === 2) && !stage2Section && renderChecklistSection('surgical', CHECKLIST_DATA.surgical)}
      {stage2Section === 'second_stage' && renderChecklistSection('second_stage', CHECKLIST_DATA.second_stage)}
      {stage2Section === 'prosthetic_phase' && renderChecklistSection('prosthetic_phase', CHECKLIST_DATA.prosthetic_phase)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  mainTitle: {
    fontSize: 18, fontWeight: 'bold', color: '#1A1A1A',
    marginBottom: 24, textAlign: 'center',
  },
  section: {
    backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 3, elevation: 2,
  },
  sectionTitle: {
    fontSize: 16, fontWeight: '600', color: '#1A1A1A',
    marginBottom: 16, textDecorationLine: 'underline',
  },
  checkboxRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  checkbox: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#DDD',
    justifyContent: 'center', alignItems: 'center', marginRight: 12, marginTop: 1,
  },
  checkboxChecked: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  labelContainer: { flex: 1 },
  checkboxLabel: { fontSize: 14, color: '#1A1A1A' },
  uploadHint: { fontSize: 11, color: '#1565C0', marginTop: 2, fontStyle: 'italic' },
  fileSection: {
    marginLeft: 36, marginBottom: 8, marginTop: 4,
  },
  fileRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F5F8FF', borderRadius: 8, padding: 8, marginBottom: 4,
  },
  fileName: { flex: 1, fontSize: 12, color: '#333', fontWeight: '500' },
  fileSize: { fontSize: 10, color: '#999' },
  deleteFileBtn: { padding: 2 },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, padding: 8, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#1565C0', borderStyle: 'dashed',
    marginTop: 4,
  },
  uploadBtnText: { fontSize: 12, fontWeight: '600', color: '#1565C0' },
  additionalField: { marginTop: 16 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 },
  textInput: {
    borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12,
    fontSize: 14, backgroundColor: '#F9F9F9', minHeight: 80, textAlignVertical: 'top',
  },
});
