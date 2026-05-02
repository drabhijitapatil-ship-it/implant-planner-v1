/**
 * Global attach picker — the ONE unified bottom-sheet popup used across the
 * entire app (Phase 1-4 uploads, Forum, Chat, consent forms, CBCT/IOPA/OPG).
 *
 * Design matches user's reference: 3 rows each with a blue-outlined icon.
 *   • Photo Library      — images-outline
 *   • Take Photo or Video — camera-outline (allows both images AND videos)
 *   • Choose Files       — folder-outline
 *
 * Consumption pattern:
 *   import { showUploadPicker } from '../utils/uploadPicker';
 *   const file = await showUploadPicker();   // returns {uri,name,type} | null
 *
 * Under the hood, `showUploadPicker()` asks the singleton root modal to open,
 * waits for the user's choice via a one-shot promise, then resolves with the
 * picked asset. Using ONE globally-mounted modal instance avoids the iOS
 * "only-one-modal-at-a-time" constraint that previously broke Forum / Chat
 * attach flows — the system picker now opens AFTER this sheet is fully
 * dismissed, so iOS accepts it cleanly.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, Pressable, StyleSheet, Text, TouchableOpacity, View, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  registerAttachPickerControls,
  resolveAttachPicker,
  getPendingAllowedDocTypes,
} from '../utils/attachPickerManager';
import { safeDocumentPick, safeLaunchCamera, safeLaunchLibrary } from '../utils/safePicker';

const DEFAULT_DOC_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/heic', 'image/heif'];

export default function AttachPickerModalRoot() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  // Guards against double-fire: once we hand control to the native picker we
  // don't want another tap on the sheet to launch a second one.
  const launchedRef = useRef(false);

  useEffect(() => {
    registerAttachPickerControls(setVisible);
  }, []);

  // Every time the sheet opens we reset the launch guard.
  useEffect(() => {
    if (visible) launchedRef.current = false;
  }, [visible]);

  const closeAndResolve = (file: any) => {
    setBusy(false);
    setVisible(false);
    // Tiny delay lets RN finish Modal dismissal before parent screens paint
    // new state (prevents flicker on iOS).
    setTimeout(() => resolveAttachPicker(file), 60);
  };

  const pickFromLibrary = async () => {
    if (launchedRef.current) return;
    launchedRef.current = true;
    setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photo library in Settings.');
        return closeAndResolve(null);
      }
      setVisible(false);
      await new Promise((r) => setTimeout(r, 250)); // let our modal fully close
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
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'Please allow camera access in Settings.');
        return closeAndResolve(null);
      }
      setVisible(false);
      await new Promise((r) => setTimeout(r, 250));
      // Allow images AND videos — matches the sheet label "Take Photo or Video".
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
      await new Promise((r) => setTimeout(r, 250));
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={cancel}
      statusBarTranslucent
    >
      <Pressable style={s.overlay} onPress={cancel} testID="attach-picker-overlay">
        <Pressable
          style={s.sheet}
          onPress={(e) => e.stopPropagation()}
          testID="attach-picker-sheet"
          // @ts-ignore RN-Web mapping
          data-testid="attach-picker-sheet"
        >
          <Option
            icon="images-outline"
            label="Photo Library"
            onPress={pickFromLibrary}
            disabled={busy}
            testID="attach-library-btn"
          />
          <View style={s.sep} />
          <Option
            icon="camera-outline"
            label="Take Photo or Video"
            onPress={pickFromCamera}
            disabled={busy}
            testID="attach-camera-btn"
          />
          <View style={s.sep} />
          <Option
            icon="folder-outline"
            label="Choose Files"
            onPress={pickFromFiles}
            disabled={busy}
            testID="attach-files-btn"
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Option({
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
      activeOpacity={0.6}
      testID={testID}
      // @ts-ignore
      data-testid={testID}
    >
      <View style={s.iconWrap}>
        <Ionicons name={icon} size={24} color="#1565C0" />
      </View>
      <Text style={s.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    // Soft top shadow mimics iOS bottom-sheet look.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 22,
    paddingVertical: 16,
  },
  iconWrap: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 17,
    fontWeight: '500',
    color: '#1A2332',
  },
  sep: {
    height: 1,
    backgroundColor: '#ECEFF1',
    marginLeft: 66,
  },
});
