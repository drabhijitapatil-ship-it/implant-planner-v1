import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { ActionSheetIOS, Platform, Alert } from 'react-native';

export type PickedFile = {
  uri: string;
  name: string;
  type: string;
} | null;

const DOC_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/heic', 'image/heif'];

export function showUploadPicker(allowedDocTypes?: string[]): Promise<PickedFile> {
  return new Promise((resolve) => {
    const options = ['Photo Library', 'Take Photo', 'Browse Files', 'Cancel'];
    const cancelButtonIndex = 3;

    const handleSelection = async (index: number) => {
      try {
        if (index === 0) {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Permission Required', 'Please allow access to your photo library in Settings.');
            return resolve(null);
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
          });
          if (result.canceled || !result.assets?.length) return resolve(null);
          const a = result.assets[0];
          resolve({ uri: a.uri, name: a.fileName || `photo_${Date.now()}.jpg`, type: a.mimeType || 'image/jpeg' });
        } else if (index === 1) {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Permission Required', 'Please allow camera access in Settings.');
            return resolve(null);
          }
          const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
          if (result.canceled || !result.assets?.length) return resolve(null);
          const a = result.assets[0];
          resolve({ uri: a.uri, name: a.fileName || `capture_${Date.now()}.jpg`, type: a.mimeType || 'image/jpeg' });
        } else if (index === 2) {
          const result = await DocumentPicker.getDocumentAsync({
            type: allowedDocTypes || DOC_TYPES,
            copyToCacheDirectory: true,
          });
          if (result.canceled || !result.assets?.length) return resolve(null);
          const a = result.assets[0];
          resolve({ uri: a.uri, name: a.name || 'file', type: a.mimeType || 'application/octet-stream' });
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex, title: 'Choose Upload Source' },
        (buttonIndex) => { handleSelection(buttonIndex); }
      );
    } else {
      Alert.alert('Choose Upload Source', '', [
        { text: 'Photo Library', onPress: () => handleSelection(0) },
        { text: 'Take Photo', onPress: () => handleSelection(1) },
        { text: 'Browse Files', onPress: () => handleSelection(2) },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ]);
    }
  });
}
