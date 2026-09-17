/**
 * Central Theme & Design System Tokens for Implanr
 *
 * Single Primary Blue: #1565C0 (Material Blue 800)
 * Standard semantic palette for approvals, warnings, rejections, and backgrounds.
 */

export const THEME = {
  colors: {
    // Single Primary Blue & tints
    primary: '#1565C0',
    primaryDark: '#0D47A1',
    primaryLight: '#E3F2FD',
    primaryMuted: '#90CAF9',
    primarySubtle: '#F0F7FF',

    // Secondary & Neutrals
    secondary: '#455A64',
    secondaryLight: '#ECEFF1',
    neutral: '#78909C',

    // Semantic States
    success: '#0B8A3F',
    successLight: '#E8F5E9',
    successBorder: '#A5D6A7',

    warning: '#D97706',
    warningLight: '#FFF3E0',
    warningBorder: '#FFE082',

    danger: '#DC2626',
    dangerDark: '#B71C1C',
    dangerLight: '#FFEBEE',
    dangerBorder: '#FFCDD2',

    info: '#0288D1',
    infoLight: '#E1F5FE',

    // Surfaces & Backgrounds
    background: '#F5F7FA',
    cardBackground: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceSubtle: '#F8FAFC',

    // Typography
    text: '#0F172A',
    textSecondary: '#546E7A',
    textMuted: '#94A3B8',
    textInverse: '#FFFFFF',

    // Borders & Dividers
    border: '#E2E8F0',
    borderLight: '#F0F0F0',
    borderStrong: '#CFD8DC',
    divider: '#E5E5EA',
  },

  typography: {
    fontFamily: undefined, // uses system font
    badgeFontSize: 11,
    tabLabelFontSize: 11,
    captionFontSize: 12,
    bodyFontSize: 14,
    subheadFontSize: 16,
    titleFontSize: 18,
    headlineFontSize: 20,
  },

  radii: {
    sm: 6,
    md: 10,
    lg: 14,
    xl: 20,
    full: 9999,
  },

  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 3,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 10,
      elevation: 6,
    },
  },
} as const;

export default THEME;
