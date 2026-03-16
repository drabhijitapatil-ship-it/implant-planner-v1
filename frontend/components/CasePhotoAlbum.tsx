import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import api from '../utils/api';

interface PhotoRecord {
  step_id: string;
  filename: string;
  original_name: string;
  content_type: string;
  uploaded_at: string;
}

interface StepInfo {
  step_id: string;
  label: string;
  category: string;
  caption: string;
  photos: PhotoRecord[];
  has_photo: boolean;
}

interface PhaseInfo {
  name: string;
  steps: StepInfo[];
  total: number;
  completed: number;
}

interface PhotoStepDef {
  id: string;
  label: string;
  category: string;
  purpose: string;
  armamentarium: string[];
  prompt: string;
}

interface PhaseStepDef {
  name: string;
  steps: PhotoStepDef[];
}

interface Props {
  procedureId: string;
  isOwner: boolean;
  userRole: string;
  procedureStatus?: string;
}

export default function CasePhotoAlbum({ procedureId, isOwner, userRole, procedureStatus }: Props) {
  const [photos, setPhotos] = useState<Record<string, PhaseInfo>>({});
  const [stepDefs, setStepDefs] = useState<Record<string, PhaseStepDef>>({});
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [albumLoading, setAlbumLoading] = useState(false);

  const canUpload = isOwner && userRole === 'student';
  const isReviewer = userRole === 'supervisor' || userRole === 'implant_incharge';

  const loadData = useCallback(async () => {
    try {
      const [photosRes, stepsRes] = await Promise.all([
        api.get(`/procedures/${procedureId}/photos`),
        api.get('/photo-steps'),
      ]);
      setPhotos(photosRes.data);
      setStepDefs(stepsRes.data);

      // Auto-expand the relevant phase for reviewers during approval
      if (isReviewer && procedureStatus) {
        const statusToPhase: Record<string, string> = {
          pending_phase1: '1',
          pending_phase2: '2',
          pending_stage2_surgical: '3',
          pending_stage2_prosthetic: '4',
        };
        const autoPhase = statusToPhase[procedureStatus];
        if (autoPhase) setExpandedPhase(autoPhase);
      }
    } catch (err) {
      console.error('Failed to load album data:', err);
    } finally {
      setLoading(false);
    }
  }, [procedureId, isReviewer, procedureStatus]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const pickAndUpload = async (stepId: string, source: 'library' | 'camera') => {
    try {
      let result;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission Required', 'Camera access is needed to take photos.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.8,
          allowsEditing: false,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
          allowsEditing: false,
        });
      }
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const uri = asset.uri;
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const name = `photo_${stepId}.${ext}`;

      setUploading(stepId);
      const formData = new FormData();
      formData.append('file', {
        uri,
        name,
        type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      } as any);

      await api.post(`/procedures/${procedureId}/photos/${stepId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await loadData();
    } catch (err: any) {
      Alert.alert('Upload Failed', err.response?.data?.detail || 'Could not upload photo.');
    } finally {
      setUploading(null);
    }
  };

  const handleDelete = (stepId: string, filename: string) => {
    Alert.alert('Delete Photo', 'Are you sure you want to remove this photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/procedures/${procedureId}/photos/${stepId}/${filename}`);
            await loadData();
          } catch (err: any) {
            Alert.alert('Error', err.response?.data?.detail || 'Failed to delete photo.');
          }
        },
      },
    ]);
  };

  const handleGenerateAlbum = async () => {
    setAlbumLoading(true);
    try {
      const response = await api.post(
        `/procedures/${procedureId}/generate-album`,
        {},
        { responseType: 'blob' }
      );
      // On web, create a download link
      if (typeof window !== 'undefined' && window.URL) {
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `CaseAlbum_${procedureId}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        Alert.alert('Success', 'Album PDF downloaded successfully.');
      } else {
        // On native, we could use expo-file-system + expo-sharing
        Alert.alert('Success', 'Album PDF generated. Download on web for best experience.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to generate album.');
    } finally {
      setAlbumLoading(false);
    }
  };

  const getPhotoUrl = (filename: string) => {
    const baseUrl = api.defaults.baseURL || '';
    return `${baseUrl}/photos/${filename}`;
  };

  const getTotalPhotos = () => {
    let total = 0;
    Object.values(photos).forEach((phase) => {
      total += phase.completed;
    });
    return total;
  };

  const getTotalSteps = () => {
    let total = 0;
    Object.values(photos).forEach((phase) => {
      total += phase.total;
    });
    return total;
  };

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="small" color="#007AFF" />
        <Text style={styles.loadingText}>Loading album...</Text>
      </View>
    );
  }

  const phaseKeys = Object.keys(photos).sort();

  return (
    <View style={styles.container} data-testid="case-photo-album">
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="camera" size={22} color="#007AFF" />
          <Text style={styles.headerTitle}>Clinical Photo Album</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{getTotalPhotos()}/{getTotalSteps()}</Text>
        </View>
      </View>

      {/* Reviewer prompt */}
      {isReviewer && getTotalPhotos() > 0 && (procedureStatus || '').startsWith('pending') && (
        <View style={{ backgroundColor: '#E8F5E9', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }} data-testid="photo-review-prompt">
          <Ionicons name="eye" size={16} color="#2E7D32" />
          <Text style={{ fontSize: 12, color: '#2E7D32', flex: 1 }}>
            {getTotalPhotos()} photo(s) uploaded by student. Tap phases below to review.
          </Text>
        </View>
      )}

      {/* Phase Sections */}
      {phaseKeys.map((phaseKey) => {
        const phase = photos[phaseKey];
        const phaseDef = stepDefs[phaseKey];
        const isExpanded = expandedPhase === phaseKey;
        const phaseColor = PHASE_COLORS[phaseKey] || '#007AFF';

        return (
          <View key={phaseKey} style={styles.phaseCard}>
            <TouchableOpacity
              style={styles.phaseHeader}
              onPress={() => setExpandedPhase(isExpanded ? null : phaseKey)}
              data-testid={`phase-${phaseKey}-header`}
            >
              <View style={[styles.phaseIndicator, { backgroundColor: phaseColor }]} />
              <View style={styles.phaseHeaderContent}>
                <Text style={styles.phaseName}>Phase {phaseKey} - {phase.name}</Text>
                <Text style={styles.phaseProgress}>
                  {phase.completed}/{phase.total} photos
                </Text>
              </View>
              {/* Progress bar */}
              <View style={styles.progressBarContainer}>
                <View
                  style={[
                    styles.progressBar,
                    {
                      width: `${phase.total > 0 ? (phase.completed / phase.total) * 100 : 0}%`,
                      backgroundColor: phaseColor,
                    },
                  ]}
                />
              </View>
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={20}
                color="#666"
              />
            </TouchableOpacity>

            {isExpanded && (
              <View style={styles.stepsContainer}>
                {phase.steps.map((step) => {
                  const stepDef = phaseDef?.steps?.find((s: PhotoStepDef) => s.id === step.step_id);
                  const isStepExpanded = expandedStep === step.step_id;

                  return (
                    <View key={step.step_id} style={styles.stepCard}>
                      <TouchableOpacity
                        style={styles.stepHeader}
                        onPress={() => setExpandedStep(isStepExpanded ? null : step.step_id)}
                        data-testid={`step-${step.step_id}`}
                      >
                        <View style={styles.stepStatus}>
                          <Ionicons
                            name={step.has_photo ? 'checkmark-circle' : 'ellipse-outline'}
                            size={20}
                            color={step.has_photo ? '#4CAF50' : '#CCC'}
                          />
                        </View>
                        <View style={styles.stepInfo}>
                          <Text style={styles.stepLabel}>{step.label}</Text>
                          <Text style={styles.stepCategory}>{step.category}</Text>
                        </View>
                        {step.has_photo && (
                          <View style={styles.photoCountBadge}>
                            <Text style={styles.photoCountText}>{step.photos.length}</Text>
                          </View>
                        )}
                        <Ionicons
                          name={isStepExpanded ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color="#999"
                        />
                      </TouchableOpacity>

                      {isStepExpanded && (
                        <View style={styles.stepExpanded}>
                          {/* Step Instructions */}
                          {stepDef && (
                            <View style={styles.instructionBox}>
                              <View style={styles.instructionRow}>
                                <Ionicons name="information-circle" size={16} color="#007AFF" />
                                <Text style={styles.instructionLabel}>Purpose:</Text>
                              </View>
                              <Text style={styles.instructionText}>{stepDef.purpose}</Text>

                              <View style={[styles.instructionRow, { marginTop: 8 }]}>
                                <Ionicons name="construct" size={16} color="#FF9800" />
                                <Text style={styles.instructionLabel}>Armamentarium:</Text>
                              </View>
                              <Text style={styles.instructionText}>
                                {stepDef.armamentarium.join(', ')}
                              </Text>

                              <View style={[styles.instructionRow, { marginTop: 8 }]}>
                                <Ionicons name="camera-outline" size={16} color="#4CAF50" />
                                <Text style={styles.instructionLabel}>How to capture:</Text>
                              </View>
                              <Text style={styles.instructionText}>{stepDef.prompt}</Text>
                            </View>
                          )}

                          {/* Existing Photos */}
                          {step.photos.length > 0 && (
                            <ScrollView
                              horizontal
                              showsHorizontalScrollIndicator={false}
                              style={styles.photosRow}
                            >
                              {step.photos.map((photo) => (
                                <View key={photo.filename} style={styles.photoThumb}>
                                  <Image
                                    source={{ uri: getPhotoUrl(photo.filename) }}
                                    style={styles.photoImage}
                                    resizeMode="cover"
                                  />
                                  <Text style={styles.photoName} numberOfLines={1}>
                                    {photo.original_name}
                                  </Text>
                                  {canUpload && (
                                    <TouchableOpacity
                                      style={styles.deletePhotoBtn}
                                      onPress={() => handleDelete(step.step_id, photo.filename)}
                                      data-testid={`delete-photo-${photo.filename}`}
                                    >
                                      <Ionicons name="trash-outline" size={14} color="#F44336" />
                                    </TouchableOpacity>
                                  )}
                                </View>
                              ))}
                            </ScrollView>
                          )}

                          {/* Upload Buttons */}
                          {canUpload && (
                            <View style={styles.uploadRow}>
                              <TouchableOpacity
                                style={styles.uploadBtn}
                                onPress={() => pickAndUpload(step.step_id, 'camera')}
                                disabled={uploading === step.step_id}
                                data-testid={`camera-btn-${step.step_id}`}
                              >
                                {uploading === step.step_id ? (
                                  <ActivityIndicator size="small" color="#007AFF" />
                                ) : (
                                  <>
                                    <Ionicons name="camera" size={18} color="#007AFF" />
                                    <Text style={styles.uploadBtnText}>Take Photo</Text>
                                  </>
                                )}
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.uploadBtn}
                                onPress={() => pickAndUpload(step.step_id, 'library')}
                                disabled={uploading === step.step_id}
                                data-testid={`upload-btn-${step.step_id}`}
                              >
                                {uploading === step.step_id ? (
                                  <ActivityIndicator size="small" color="#007AFF" />
                                ) : (
                                  <>
                                    <Ionicons name="images-outline" size={18} color="#007AFF" />
                                    <Text style={styles.uploadBtnText}>Library</Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}

      {/* Generate Album Button */}
      {getTotalPhotos() > 0 && (
        <TouchableOpacity
          style={styles.albumButton}
          onPress={handleGenerateAlbum}
          disabled={albumLoading}
          data-testid="generate-album-btn"
        >
          {albumLoading ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              <Ionicons name="book" size={20} color="#FFF" />
              <Text style={styles.albumButtonText}>Generate Case Album PDF</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const PHASE_COLORS: Record<string, string> = {
  '1': '#007AFF',
  '2': '#FF6B35',
  '3': '#2196F3',
  '4': '#9C27B0',
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  loadingBox: {
    backgroundColor: '#FFF',
    padding: 20,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
  },
  header: {
    backgroundColor: '#FFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  badge: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  phaseCard: {
    backgroundColor: '#FFF',
    marginTop: 1,
  },
  phaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  phaseIndicator: {
    width: 4,
    height: 36,
    borderRadius: 2,
  },
  phaseHeaderContent: {
    flex: 1,
  },
  phaseName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  phaseProgress: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  progressBarContainer: {
    width: 50,
    height: 4,
    backgroundColor: '#E8E8E8',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  stepsContainer: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  stepCard: {
    backgroundColor: '#FAFAFA',
    borderRadius: 10,
    marginBottom: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
  },
  stepStatus: {},
  stepInfo: {
    flex: 1,
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  stepCategory: {
    fontSize: 11,
    color: '#999',
    marginTop: 1,
  },
  photoCountBadge: {
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  photoCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4CAF50',
  },
  stepExpanded: {
    padding: 12,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  instructionBox: {
    backgroundColor: '#F5F8FF',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  instructionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#444',
  },
  instructionText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 22,
    marginTop: 2,
    lineHeight: 18,
  },
  photosRow: {
    marginTop: 10,
  },
  photoThumb: {
    width: 100,
    marginRight: 10,
    alignItems: 'center',
  },
  photoImage: {
    width: 100,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#E8E8E8',
  },
  photoName: {
    fontSize: 10,
    color: '#888',
    marginTop: 4,
    textAlign: 'center',
  },
  deletePhotoBtn: {
    marginTop: 4,
    padding: 4,
  },
  uploadBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
  },
  uploadRow: {
    flexDirection: 'row',
    gap: 8,
  },
  uploadBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
  },
  albumButton: {
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
  },
  albumButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
