/**
 * Temporary screenshot window for "Report an Issue". Screenshot blocking
 * (HIPAA guard, see useScreenCaptureProtection) stays on everywhere by
 * default; the user can lift it for a few minutes to capture the problem,
 * after which it switches back on by itself.
 */
import * as ScreenCapture from 'expo-screen-capture';

const KEY = 'hipaa-phi-guard';
let openUntil = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let guardWanted = false;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

/** Called by useScreenCaptureProtection so we know whether to re-block on expiry. */
export function setScreenshotGuardWanted(wanted: boolean) {
  guardWanted = wanted;
}

export function isScreenshotWindowOpen(): boolean {
  return Date.now() < openUntil;
}

export function screenshotWindowEndsAt(): number {
  return isScreenshotWindowOpen() ? openUntil : 0;
}

export async function openScreenshotWindow(minutes = 10): Promise<void> {
  openUntil = Date.now() + minutes * 60 * 1000;
  if (timer) clearTimeout(timer);
  timer = setTimeout(closeScreenshotWindow, minutes * 60 * 1000);
  await ScreenCapture.allowScreenCaptureAsync(KEY).catch(() => {});
  notify();
}

export async function closeScreenshotWindow(): Promise<void> {
  openUntil = 0;
  if (timer) clearTimeout(timer);
  timer = null;
  if (guardWanted) await ScreenCapture.preventScreenCaptureAsync(KEY).catch(() => {});
  notify();
}

export function onScreenshotWindowChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
