/**
 * Single source of truth for onboarding copy. Everything role-conditional
 * lives here so slides stay generic and easy to test. Bump
 * ONBOARDING_VERSION when you ship a major content update — existing users
 * will see the new slides on next login.
 */

export const ONBOARDING_VERSION = 2;

export type Role =
  | 'dentist'
  | 'chief_dentist'
  | 'dental_assistant'
  | 'administrator';

export type RoleHero = {
  greeting: string;
  subhead: string;
  chipLabel: string;
};

const ROLE_HERO: Record<Role, RoleHero> = {
  chief_dentist: {
    greeting: 'Welcome',
    subhead:
      'Final approval on every case across your clinic. Full visibility and control.',
    chipLabel: 'Chief Dentist',
  },
  dentist: {
    greeting: 'Welcome',
    subhead:
      'Run your patient cases from initial planning to prosthetic delivery.',
    chipLabel: 'Dentist',
  },
  dental_assistant: {
    greeting: 'Welcome',
    subhead:
      'Calendar, consent uploads, autoclave stamps — your prep keeps every surgery on track.',
    chipLabel: 'Dental Assistant',
  },
  administrator: {
    greeting: 'Welcome',
    subhead: 'Full Chief Dentist access. Final approval gate on every case.',
    chipLabel: 'Administrator',
  },
};

export function heroFor(role: string): RoleHero {
  const key = (role || 'dentist').toLowerCase() as Role;
  return ROLE_HERO[key] ?? ROLE_HERO.dentist;
}

/** Slide 6 — role-specific 3-line recap shown on the closing slide. */
const ROLE_RECAP: Record<Role, string[]> = {
  chief_dentist: [
    'See every case across every dentist in your clinic',
    'Approve the final gate on each phase',
    'Override any field; archive stuck cases anytime',
  ],
  dentist: [
    'Schedule a case and complete Phase 1',
    'Submit for Chief Dentist approval',
    'Run Phase 2 → 3 → 4 and export the case PDF',
  ],
  dental_assistant: [
    'See today and the next 7 days at a glance',
    'Upload signed consent forms and autoclave stamps',
    'Receive 24-hour reminders for unfinished prep',
  ],
  administrator: [
    'Same authority as Chief Dentist',
    'Full visibility across every case',
    'Override and archive as needed',
  ],
};

export function recapFor(role: string): string[] {
  const key = (role || 'dentist').toLowerCase() as Role;
  return ROLE_RECAP[key] ?? ROLE_RECAP.dentist;
}

/** Slide 3 (approval gates) — which tile glows for this role. */
export function activeGateFor(role: string): 'dentist' | 'incharge' {
  const k = (role || 'dentist').toLowerCase();
  if (k === 'chief_dentist' || k === 'administrator') return 'incharge';
  return 'dentist';
}

/** Slide 2 footer — single role-specific line. */
const PHASE_FOOTER: Record<Role, string> = {
  chief_dentist:
    'You give the final green light at every phase across every case.',
  dentist: 'You drive every phase; the Chief Dentist approves at each gate.',
  dental_assistant:
    'Your prep happens before Phase 2 — consent uploads and autoclave stamps.',
  administrator: 'You can intervene at any phase, on any case.',
};

export function phaseFooterFor(role: string): string {
  const key = (role || 'dentist').toLowerCase() as Role;
  return PHASE_FOOTER[key] ?? PHASE_FOOTER.dentist;
}
