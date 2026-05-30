/**
 * Unified upload picker — exposes the original imperative
 *   showUploadPicker(allowedDocTypes?) => Promise<PickedFile>
 * API, but now delegates to the globally-mounted <AttachPickerModalRoot />.
 *
 * All callers across the app (Phase 1-4 uploads, consent forms, checklist,
 * forum, chat) use this one function → one consistent custom popup with
 * blue-outlined icons (Photo Library / Take Photo or Video / Choose Files).
 */
import { openAttachPicker, PickedFile } from './attachPickerManager';

export type { PickedFile };

export function showUploadPicker(allowedDocTypes?: string[]): Promise<PickedFile> {
  return openAttachPicker(allowedDocTypes);
}
