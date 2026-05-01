/**
 * Shared wrappers around expo-document-picker / expo-image-picker that defend
 * against the iOS "Different document picking in progress" error. The native
 * iOS module sometimes retains state across screens / sessions and rejects the
 * very first call. We auto-retry once after a 1500 ms delay, so the user
 * normally never sees the error in the UI.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const isPickerStateError = (err: unknown): boolean => {
  const msg = (err as any)?.message || '';
  return /Different document picking in progress|already in progress|currentPickerCall/i.test(msg);
};

/**
 * Retries the document picker once with a 1500 ms delay if the iOS state-stuck
 * error fires. Most users only ever see the second attempt, which succeeds
 * because the native state has had time to release.
 */
export async function safeDocumentPick(
  options: DocumentPicker.DocumentPickerOptions,
): Promise<DocumentPicker.DocumentPickerResult> {
  try {
    return await DocumentPicker.getDocumentAsync(options);
  } catch (e) {
    if (!isPickerStateError(e)) throw e;
    // First attempt failed with the iOS state-stuck error — wait + retry once.
    await sleep(1500);
    return await DocumentPicker.getDocumentAsync(options);
  }
}

export async function safeLaunchCamera(
  options: ImagePicker.ImagePickerOptions,
): Promise<ImagePicker.ImagePickerResult> {
  try {
    return await ImagePicker.launchCameraAsync(options);
  } catch (e) {
    if (!isPickerStateError(e)) throw e;
    await sleep(1500);
    return await ImagePicker.launchCameraAsync(options);
  }
}

export async function safeLaunchLibrary(
  options: ImagePicker.ImagePickerOptions,
): Promise<ImagePicker.ImagePickerResult> {
  try {
    return await ImagePicker.launchImageLibraryAsync(options);
  } catch (e) {
    if (!isPickerStateError(e)) throw e;
    await sleep(1500);
    return await ImagePicker.launchImageLibraryAsync(options);
  }
}

/** True when an error is the iOS picker-state-stuck error after both attempts. */
export const isStuckPickerError = isPickerStateError;
