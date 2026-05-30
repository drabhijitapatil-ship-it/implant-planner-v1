/**
 * Global attach picker — the ONE unified center-of-screen dialog used across
 * the entire app (Phase 1-4 uploads, Forum, Chat, consent forms, CBCT/IOPA/OPG).
 *
 * Design (per user's explicit spec):
 *   • Opens in the MIDDLE of the screen (alert-style card, NOT bottom sheet).
 *   • Three rows:  Photo Library · Take Photo or Video · Choose Files.
 *   • Each icon lives inside a blue-bordered square tile → the "blue-coloured
 *     border icon for each file type".
 *
 * Crucial behaviour: we render a plain absolutely-positioned View overlay
 * instead of the React Native <Modal>. Why? Because RN's Modal on iOS takes
 * over the presenting view-controller stack, and launching a native
 * DocumentPicker / ImagePicker while an RN Modal is mid-dismiss silently fails
 * (iOS enforces one modal at a time). Plain View overlays have no such
 * constraint, so native pickers launch cleanly every time.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  registerAttachPickerControls, resolveAttachPicker, getPendingAllowedDocTypes,
} from '../utils/attachPickerManager';
import { safeDocumentPick, safeLaunchCamera, safeLaunchLibrary } from '../utils/safePicker';

const DEFAULT_DOC_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/heic', 'image/heif'];
const BLUE = '#1565C0';

export default function AttachPickerModalRoot() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const launchedRef = useRef(false);

  useEffect(() => {
    registerAttachPickerControls(setVisible);
  }, []);

  useEffect(() => {
    if (visible) launchedRef.current = false;
  }, [visible]);

  const closeAndResolve = (file: any) => {
    setBusy(false);
    setVisible(false);
    resolveAttachPicker(file);
  };

  const pickFromLibrary = async () => {
    if (launchedRef.current) return;
    launchedRef.current = true;
    setBusy(true);
    try {
      if (Platform.OS !== 'web') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission Required', 'Please allow access to your photo library in Settings.');
          return closeAndResolve(null);
        }
      }
      // Hide our overlay immediately; no RN Modal means no dismiss race.
      setVisible(false);
      const result = await safeLaunchLibrary({ mediaTypes: ['images'], quality: 0.8 });
      if (result.canceled || !result.assets?.length) return closeAndResolve(null);
      const a = result.assets[0];
      closeAndResolve({ uri: a.uri, name: a.fileName || `photo_${Date.now()}.jpg`, type: a.mimeType || 'image/jpeg' });
    } catch (err) {
      console.error('[AttachPicker] library pick failed:', err);
      closeAndResolve(null);
    }
  };

  const pickFromCamera = async () => {
    if (launchedRef.current) return;
    launchedRef.current = true;
    setBusy(true);
    try {
      if (Platform.OS !== 'web') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission Required', 'Please allow camera access in Settings.');
          return closeAndResolve(null);
        }
      }
      setVisible(false);
      // Allow images AND videos — matches the "Take Photo or Video" label.
      const result = await safeLaunchCamera({ mediaTypes: ['images', 'videos'], quality: 0.8 });
      if (result.canceled || !result.assets?.length) return closeAndResolve(null);
      const a = result.assets[0];
      const isVideo = (a.type || '').startsWith('video') || (a.mimeType || '').startsWith('video');
      const fallbackName = isVideo ? `video_${Date.now()}.mp4` : `capture_${Date.now()}.jpg`;
      const fallbackType = isVideo ? 'video/mp4' : 'image/jpeg';
      closeAndResolve({ uri: a.uri, name: a.fileName || fallbackName, type: a.mimeType || fallbackType });
    } catch (err) {
      console.error('[AttachPicker] camera pick failed:', err);
      closeAndResolve(null);
    }
  };

  const pickFromFiles = async () => {
    if (launchedRef.current) return;
    launchedRef.current = true;
    setBusy(true);
    try {
      setVisible(false);
      const allowed = getPendingAllowedDocTypes() || DEFAULT_DOC_TYPES;
      const result = await safeDocumentPick({ type: allowed, copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.length) return closeAndResolve(null);
      const a = result.assets[0];
      closeAndResolve({ uri: a.uri, name: a.name || 'file', type: a.mimeType || 'application/octet-stream' });
    } catch (err) {
      console.error('[AttachPicker] file pick failed:', err);
      closeAndResolve(null);
    }
  };

  const cancel = () => closeAndResolve(null);

  if (!visible) return null;

  return (
    <View
      style={s.overlay}
      testID="attach-picker-overlay"
      // @ts-ignore RN-Web mapping
      data-testid="attach-picker-overlay"
      pointerEvents="box-none"
    >
      <Pressable style={s.backdrop} onPress={cancel} />
      <View
        style={s.card}
        testID="attach-picker-sheet"
        // @ts-ignore
        data-testid="attach-picker-sheet"
      >
        <Text style={s.title}>Add attachment</Text>
        <Text style={s.subtitle}>Choose where your file is coming from</Text>

        <IconTile
          icon="images-outline"
          label="Photo Library"
          onPress={pickFromLibrary}
          disabled={busy}
          testID="attach-library-btn"
        />
        <IconTile
          icon="camera-outline"
          label="Take Photo or Video"
          onPress={pickFromCamera}
          disabled={busy}
          testID="attach-camera-btn"
        />
        <IconTile
          icon="folder-outline"
          label="Choose Files"
          onPress={pickFromFiles}
          disabled={busy}
          testID="attach-files-btn"
        />

        <TouchableOpacity
          style={s.cancelBtn}
          onPress={cancel}
          disabled={busy}
          testID="attach-cancel-btn"
          // @ts-ignore
          data-testid="attach-cancel-btn"
        >
          <Text style={s.cancelTxt}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function IconTile({
  icon, label, onPress, disabled, testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      style={[s.row, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.65}
      testID={testID}
      // @ts-ignore
      data-testid={testID}
    >
      <View style={s.iconFrame}>
        <Ionicons name={icon} size={26} color={BLUE} />
      </View>
      <Text style={s.rowLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color="#B0BEC5" />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    // On web, the stacking context needs a concrete background layer to
    // intercept taps; we use a fully-transparent colour so the backdrop
    // Pressable below does the dimming.
    backgroundColor: 'transparent',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  card: {
    width: '86%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingTop: 20,
    paddingBottom: 8,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0D47A1',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    color: '#78909C',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: '#ECEFF1',
  },
  iconFrame: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5FAFF',
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1A2332',
  },
  cancelBtn: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#ECEFF1',
  },
  cancelTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: '#DC3545',
  },
});
