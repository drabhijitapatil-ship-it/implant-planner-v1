import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

/**
 * "1.3.7 · update 29 Oct, 11:26" when an over-the-air update is running,
 * "1.3.7 · store build" otherwise — so support can tell from a screenshot
 * which update a phone is actually on.
 */
export function appVersionLabel(): string {
  const version = Constants.expoConfig?.version || '';
  try {
    if (Updates.isEmbeddedLaunch || !Updates.createdAt) return `${version} · store build`;
    const when = Updates.createdAt.toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: 'Asia/Kolkata',
    });
    return `${version} · update ${when}`;
  } catch {
    return version;
  }
}
