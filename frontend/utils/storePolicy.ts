import { Platform } from 'react-native';

/**
 * App Store guideline 3.1.1 / 3.1.3(c): Implanr is licensed to institutions
 * directly (quote + invoice), so the iOS app must not offer self-service
 * registration, trials, pricing, plans or upgrade requests. On iOS those
 * screens are replaced by a "Request access" form; Android and web keep
 * self-registration. Server-side plan limits apply everywhere unchanged.
 */
export const HIDE_COMMERCE = Platform.OS === 'ios';
