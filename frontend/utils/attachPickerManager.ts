/**
 * Singleton manager bridging the imperative `showUploadPicker()` caller API
 * with the React-mounted `<AttachPickerModalRoot />` component in
 * app/_layout.tsx. One instance → one modal → no iOS multi-modal conflicts.
 */
export type PickedFile = {
  uri: string;
  name: string;
  type: string;
} | null;

type VisibleSetter = (v: boolean) => void;
type ResolveFn = (file: PickedFile) => void;

let visibleSetter: VisibleSetter | null = null;
let pendingResolve: ResolveFn | null = null;
let pendingAllowedDocTypes: string[] | null = null;

export function registerAttachPickerControls(setter: VisibleSetter) {
  visibleSetter = setter;
}

export function openAttachPicker(allowedDocTypes?: string[]): Promise<PickedFile> {
  return new Promise((resolve) => {
    if (pendingResolve) {
      // Very unlikely — two callers racing. Resolve the older one null.
      pendingResolve(null);
    }
    pendingResolve = resolve;
    pendingAllowedDocTypes = allowedDocTypes || null;
    if (visibleSetter) {
      visibleSetter(true);
    } else {
      // Root modal not mounted yet — resolve null gracefully.
      pendingResolve = null;
      resolve(null);
    }
  });
}

export function resolveAttachPicker(file: PickedFile) {
  const r = pendingResolve;
  pendingResolve = null;
  pendingAllowedDocTypes = null;
  if (r) r(file);
}

export function getPendingAllowedDocTypes(): string[] | null {
  return pendingAllowedDocTypes;
}
