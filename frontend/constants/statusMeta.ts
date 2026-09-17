/**
 * Standardized Status Metadata & Vocabulary for Implanr
 *
 * Unifies all 12 procedure statuses with consistent:
 *  - Human-readable full labels
 *  - Compact short labels (for pills/chips)
 *  - Theme-consistent colors (soft tint bg, bold text fg, solid bg option)
 *  - Ionicons glyph mappings
 *  - Clinical phase associations
 *  - Action categories ('draft' | 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled' | 'other')
 */

import { THEME } from './theme';

export interface StatusMeta {
  label: string;
  shortLabel: string;
  bg: string;          // Pastel/soft background for badges & chips
  fg: string;          // Contrasting bold text & icon color
  border: string;      // Matching subtle border color
  solidBg: string;     // Solid background for high-contrast banners
  solidFg: string;     // Text color on solidBg (usually white)
  icon: string;        // Ionicons icon name
  phase?: number | string | null;
  category: 'draft' | 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled' | 'other';
}

export const STATUS_META: Record<string, StatusMeta> = {
  // 1. Draft
  draft: {
    label: 'Draft',
    shortLabel: 'Draft',
    bg: '#ECEFF1',
    fg: '#546E7A',
    border: '#CFD8DC',
    solidBg: '#78909C',
    solidFg: '#FFFFFF',
    icon: 'document-text-outline',
    phase: 1,
    category: 'draft',
  },

  // 2. Phase 1: Pending
  pending_phase1: {
    label: 'Phase 1: Pending Approval',
    shortLabel: 'P1 Pending',
    bg: THEME.colors.warningLight,
    fg: THEME.colors.warning,
    border: THEME.colors.warningBorder,
    solidBg: THEME.colors.warning,
    solidFg: '#FFFFFF',
    icon: 'time-outline',
    phase: 1,
    category: 'pending',
  },

  // 3. Phase 1: Approved
  phase1_approved: {
    label: 'Phase 1: Approved — Ready for Phase 2',
    shortLabel: 'P1 Approved',
    bg: THEME.colors.successLight,
    fg: THEME.colors.success,
    border: THEME.colors.successBorder,
    solidBg: THEME.colors.success,
    solidFg: '#FFFFFF',
    icon: 'checkmark-circle',
    phase: 1,
    category: 'approved',
  },

  // 4. Phase 2: Pending
  pending_phase2: {
    label: 'Phase 2: Pending Approval',
    shortLabel: 'P2 Pending',
    bg: THEME.colors.warningLight,
    fg: THEME.colors.warning,
    border: THEME.colors.warningBorder,
    solidBg: THEME.colors.warning,
    solidFg: '#FFFFFF',
    icon: 'time-outline',
    phase: 2,
    category: 'pending',
  },

  // 5. Phase 2: Approved
  phase2_approved: {
    label: 'Phase 2: Approved — Ready for Phase 3',
    shortLabel: 'P2 Approved',
    bg: THEME.colors.successLight,
    fg: THEME.colors.success,
    border: THEME.colors.successBorder,
    solidBg: THEME.colors.success,
    solidFg: '#FFFFFF',
    icon: 'checkmark-circle',
    phase: 2,
    category: 'approved',
  },

  // 6. Phase 3 (Stage 2 Surgical): Pending
  pending_stage2_surgical: {
    label: 'Phase 3 (Stage 2): Pending Approval',
    shortLabel: 'Phase 3 Pending',
    bg: THEME.colors.warningLight,
    fg: THEME.colors.warning,
    border: THEME.colors.warningBorder,
    solidBg: THEME.colors.warning,
    solidFg: '#FFFFFF',
    icon: 'time-outline',
    phase: 3,
    category: 'pending',
  },

  // 7. Phase 3 (Stage 2 Surgical): Approved
  stage2_surgical_approved: {
    label: 'Phase 3 (Stage 2): Approved — Ready for Phase 4',
    shortLabel: 'Phase 3 Approved',
    bg: THEME.colors.successLight,
    fg: THEME.colors.success,
    border: THEME.colors.successBorder,
    solidBg: THEME.colors.success,
    solidFg: '#FFFFFF',
    icon: 'checkmark-circle',
    phase: 3,
    category: 'approved',
  },

  // 8. Phase 4 Step 1 (Prosthetic Step 1): Pending
  pending_phase4_step1: {
    label: 'Phase 4 Step 1: Pending Approval',
    shortLabel: 'P4 Step 1 Pending',
    bg: THEME.colors.warningLight,
    fg: THEME.colors.warning,
    border: THEME.colors.warningBorder,
    solidBg: THEME.colors.warning,
    solidFg: '#FFFFFF',
    icon: 'time-outline',
    phase: 4,
    category: 'pending',
  },
  pending_stage2_prosthetic: {
    label: 'Phase 4 Step 1: Pending Approval',
    shortLabel: 'P4 Step 1 Pending',
    bg: THEME.colors.warningLight,
    fg: THEME.colors.warning,
    border: THEME.colors.warningBorder,
    solidBg: THEME.colors.warning,
    solidFg: '#FFFFFF',
    icon: 'time-outline',
    phase: 4,
    category: 'pending',
  },

  // 9. Phase 4 Step 1: Approved
  phase4_step1_approved: {
    label: 'Phase 4 Step 1: Approved — Ready for Step 2',
    shortLabel: 'P4 Step 1 Approved',
    bg: THEME.colors.successLight,
    fg: THEME.colors.success,
    border: THEME.colors.successBorder,
    solidBg: THEME.colors.success,
    solidFg: '#FFFFFF',
    icon: 'checkmark-circle',
    phase: 4,
    category: 'approved',
  },
  stage2_prosthetic_step1_approved: {
    label: 'Phase 4 Step 1: Approved — Ready for Step 2',
    shortLabel: 'P4 Step 1 Approved',
    bg: THEME.colors.successLight,
    fg: THEME.colors.success,
    border: THEME.colors.successBorder,
    solidBg: THEME.colors.success,
    solidFg: '#FFFFFF',
    icon: 'checkmark-circle',
    phase: 4,
    category: 'approved',
  },

  // 10. Phase 4 Step 2 (Final Delivery): Pending
  pending_phase4_step2: {
    label: 'Phase 4 Step 2: Pending Approval',
    shortLabel: 'P4 Step 2 Pending',
    bg: THEME.colors.warningLight,
    fg: THEME.colors.warning,
    border: THEME.colors.warningBorder,
    solidBg: THEME.colors.warning,
    solidFg: '#FFFFFF',
    icon: 'time-outline',
    phase: 4,
    category: 'pending',
  },
  pending_final_delivery: {
    label: 'Phase 4 Step 2: Pending Approval',
    shortLabel: 'P4 Step 2 Pending',
    bg: THEME.colors.warningLight,
    fg: THEME.colors.warning,
    border: THEME.colors.warningBorder,
    solidBg: THEME.colors.warning,
    solidFg: '#FFFFFF',
    icon: 'time-outline',
    phase: 4,
    category: 'pending',
  },

  // 11. Completed
  completed: {
    label: 'Treatment Complete',
    shortLabel: 'Completed',
    bg: THEME.colors.successLight,
    fg: THEME.colors.success,
    border: THEME.colors.successBorder,
    solidBg: THEME.colors.success,
    solidFg: '#FFFFFF',
    icon: 'checkmark-circle',
    phase: 4,
    category: 'completed',
  },
  approved: {
    label: 'Approved',
    shortLabel: 'Approved',
    bg: THEME.colors.successLight,
    fg: THEME.colors.success,
    border: THEME.colors.successBorder,
    solidBg: THEME.colors.success,
    solidFg: '#FFFFFF',
    icon: 'checkmark-circle',
    category: 'approved',
  },

  // 12. Rejected & Variants
  rejected: {
    label: 'Rejected',
    shortLabel: 'Rejected',
    bg: THEME.colors.dangerLight,
    fg: THEME.colors.danger,
    border: THEME.colors.dangerBorder,
    solidBg: THEME.colors.danger,
    solidFg: '#FFFFFF',
    icon: 'alert-circle-outline',
    category: 'rejected',
  },
  rejected_phase1: {
    label: 'Phase 1: Rejected',
    shortLabel: 'P1 Rejected',
    bg: THEME.colors.dangerLight,
    fg: THEME.colors.danger,
    border: THEME.colors.dangerBorder,
    solidBg: THEME.colors.danger,
    solidFg: '#FFFFFF',
    icon: 'alert-circle-outline',
    phase: 1,
    category: 'rejected',
  },
  rejected_phase2: {
    label: 'Phase 2: Rejected',
    shortLabel: 'P2 Rejected',
    bg: THEME.colors.dangerLight,
    fg: THEME.colors.danger,
    border: THEME.colors.dangerBorder,
    solidBg: THEME.colors.danger,
    solidFg: '#FFFFFF',
    icon: 'alert-circle-outline',
    phase: 2,
    category: 'rejected',
  },
  rejected_stage2_surgical: {
    label: 'Phase 3: Rejected',
    shortLabel: 'P3 Rejected',
    bg: THEME.colors.dangerLight,
    fg: THEME.colors.danger,
    border: THEME.colors.dangerBorder,
    solidBg: THEME.colors.danger,
    solidFg: '#FFFFFF',
    icon: 'alert-circle-outline',
    phase: 3,
    category: 'rejected',
  },
  stage2_surgical_rejected: {
    label: 'Phase 3: Rejected',
    shortLabel: 'P3 Rejected',
    bg: THEME.colors.dangerLight,
    fg: THEME.colors.danger,
    border: THEME.colors.dangerBorder,
    solidBg: THEME.colors.danger,
    solidFg: '#FFFFFF',
    icon: 'alert-circle-outline',
    phase: 3,
    category: 'rejected',
  },
  rejected_phase4_step1: {
    label: 'Phase 4 Step 1: Rejected',
    shortLabel: 'P4 S1 Rejected',
    bg: THEME.colors.dangerLight,
    fg: THEME.colors.danger,
    border: THEME.colors.dangerBorder,
    solidBg: THEME.colors.danger,
    solidFg: '#FFFFFF',
    icon: 'alert-circle-outline',
    phase: 4,
    category: 'rejected',
  },
  rejected_phase4_step2: {
    label: 'Phase 4 Step 2: Rejected',
    shortLabel: 'P4 S2 Rejected',
    bg: THEME.colors.dangerLight,
    fg: THEME.colors.danger,
    border: THEME.colors.dangerBorder,
    solidBg: THEME.colors.danger,
    solidFg: '#FFFFFF',
    icon: 'alert-circle-outline',
    phase: 4,
    category: 'rejected',
  },
  stage2_prosthetic_rejected: {
    label: 'Phase 4: Rejected',
    shortLabel: 'P4 Rejected',
    bg: THEME.colors.dangerLight,
    fg: THEME.colors.danger,
    border: THEME.colors.dangerBorder,
    solidBg: THEME.colors.danger,
    solidFg: '#FFFFFF',
    icon: 'alert-circle-outline',
    phase: 4,
    category: 'rejected',
  },
  permanently_rejected: {
    label: 'Permanently Rejected',
    shortLabel: 'Rejected (Final)',
    bg: THEME.colors.dangerLight,
    fg: THEME.colors.dangerDark,
    border: THEME.colors.dangerBorder,
    solidBg: THEME.colors.dangerDark,
    solidFg: '#FFFFFF',
    icon: 'close-circle',
    category: 'rejected',
  },

  // Auxiliary States
  cancelled: {
    label: 'Cancelled',
    shortLabel: 'Cancelled',
    bg: '#ECEFF1',
    fg: '#78909C',
    border: '#CFD8DC',
    solidBg: '#78909C',
    solidFg: '#FFFFFF',
    icon: 'close-circle-outline',
    category: 'cancelled',
  },
  augmentation_in_progress: {
    label: 'Pre-Implant Augmentation In Progress',
    shortLabel: 'Augmentation',
    bg: '#FFF3E0',
    fg: '#E65100',
    border: '#FFE082',
    solidBg: '#E65100',
    solidFg: '#FFFFFF',
    icon: 'pulse-outline',
    category: 'other',
  },
  treatment_ended: {
    label: 'Treatment Terminated',
    shortLabel: 'Terminated',
    bg: THEME.colors.dangerLight,
    fg: THEME.colors.dangerDark,
    border: THEME.colors.dangerBorder,
    solidBg: THEME.colors.dangerDark,
    solidFg: '#FFFFFF',
    icon: 'close-circle',
    category: 'cancelled',
  },
};

/**
 * Safe resolver for any status string, defaulting to a clean slate fallback.
 */
export function getStatusMeta(status?: string | null): StatusMeta {
  if (!status) return STATUS_META.draft;
  const key = status.trim().toLowerCase();
  if (STATUS_META[key]) return STATUS_META[key];

  // Dynamic pattern detection for unknown / custom statuses
  if (key.includes('approved') || key.includes('complete')) {
    return {
      label: status.replace(/_/g, ' '),
      shortLabel: 'Approved',
      bg: THEME.colors.successLight,
      fg: THEME.colors.success,
      border: THEME.colors.successBorder,
      solidBg: THEME.colors.success,
      solidFg: '#FFFFFF',
      icon: 'checkmark-circle',
      category: 'approved',
    };
  }

  if (key.includes('reject')) {
    return {
      label: status.replace(/_/g, ' '),
      shortLabel: 'Rejected',
      bg: THEME.colors.dangerLight,
      fg: THEME.colors.danger,
      border: THEME.colors.dangerBorder,
      solidBg: THEME.colors.danger,
      solidFg: '#FFFFFF',
      icon: 'alert-circle-outline',
      category: 'rejected',
    };
  }

  if (key.includes('pending')) {
    return {
      label: status.replace(/_/g, ' '),
      shortLabel: 'Pending',
      bg: THEME.colors.warningLight,
      fg: THEME.colors.warning,
      border: THEME.colors.warningBorder,
      solidBg: THEME.colors.warning,
      solidFg: '#FFFFFF',
      icon: 'time-outline',
      category: 'pending',
    };
  }

  return {
    label: status.replace(/_/g, ' '),
    shortLabel: status.slice(0, 10),
    bg: '#ECEFF1',
    fg: '#546E7A',
    border: '#CFD8DC',
    solidBg: '#64748B',
    solidFg: '#FFFFFF',
    icon: 'document-text-outline',
    category: 'other',
  };
}

/**
 * Backward compatibility dictionaries mapping status -> string color or string label
 */
export const STATUS_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_META).map(([k, v]) => [k, v.solidBg])
);

export const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_META).map(([k, v]) => [k, v.label])
);
