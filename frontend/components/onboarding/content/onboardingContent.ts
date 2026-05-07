/**
 * Single source of truth for onboarding copy. Everything role-conditional
 * lives here so slides stay generic and easy to test. Bump
 * ONBOARDING_VERSION when you ship a major content update — existing users
 * will see the new slides on next login.
 */

export const ONBOARDING_VERSION = 2;

export type Role =
  | 'student'
  | 'supervisor'
  | 'implant_incharge'
  | 'nurse'
  | 'administrator';

export type RoleHero = {
  greeting: string;
  subhead: string;
  chipLabel: string;
};

const ROLE_HERO: Record<Role, RoleHero> = {
  implant_incharge: {
    greeting: 'Welcome',
    subhead:
      'Your final-approval desk for every case across every Supervisor and Student.',
    chipLabel: 'Implant In-Charge',
  },
  supervisor: {
    greeting: 'Welcome',
    subhead:
      "You're the first approval gate for student cases — and you can run your own.",
    chipLabel: 'Supervisor',
  },
  student: {
    greeting: 'Welcome',
    subhead:
      'Run your case from chair-side diagnosis to delivered prosthesis. Two approvals at every gate.',
    chipLabel: 'Student',
  },
  nurse: {
    greeting: 'Welcome',
    subhead:
      'Calendar, consent uploads, autoclave stamps — your prep keeps every surgery on track.',
    chipLabel: 'Nurse',
  },
  administrator: {
    greeting: 'Welcome',
    subhead: 'Full In-Charge access. Final approval gate on every case.',
    chipLabel: 'Administrator',
  },
};

export function heroFor(role: string): RoleHero {
  const key = (role || 'student').toLowerCase() as Role;
  return ROLE_HERO[key] ?? ROLE_HERO.student;
}

/** Slide 6 — role-specific 3-line recap shown on the closing slide. */
const ROLE_RECAP: Record<Role, string[]> = {
  implant_incharge: [
    'See every case across every Supervisor and Student',
    'Approve the final gate on each phase',
    'Override any field; archive stuck cases anytime',
  ],
  supervisor: [
    'Review and approve student submissions',
    'Schedule and run your own cases',
    'Track who is blocking the next phase at a glance',
  ],
  student: [
    'Schedule a case and complete Phase 1',
    'Submit for Supervisor → In-Charge approval',
    'Run Phase 2 → 3 → 4 and archive the case PDF',
  ],
  nurse: [
    'See today and the next 7 days at a glance',
    'Upload signed consent forms and autoclave stamps',
    'Receive 24-hour reminders for unfinished prep',
  ],
  administrator: [
    'Same authority as Implant In-Charge',
    'Full visibility across every case',
    'Override and archive as needed',
  ],
};

export function recapFor(role: string): string[] {
  const key = (role || 'student').toLowerCase() as Role;
  return ROLE_RECAP[key] ?? ROLE_RECAP.student;
}

/** Slide 3 (approval gates) — which tile glows for this role. */
export function activeGateFor(role: string): 'student' | 'supervisor' | 'incharge' {
  const k = (role || 'student').toLowerCase();
  if (k === 'supervisor') return 'supervisor';
  if (k === 'implant_incharge' || k === 'administrator') return 'incharge';
  return 'student';
}

/** Slide 2 footer — single role-specific line. */
const PHASE_FOOTER: Record<Role, string> = {
  implant_incharge:
    'You give the final green light at every phase across every case.',
  supervisor: 'You sign off on Phase 1; the In-Charge gives the final approval.',
  student: 'You drive every phase; both Supervisor and In-Charge must approve.',
  nurse:
    'Your prep happens before Phase 2 — consent uploads and autoclave stamps.',
  administrator: 'You can intervene at any phase, on any case.',
};

export function phaseFooterFor(role: string): string {
  const key = (role || 'student').toLowerCase() as Role;
  return PHASE_FOOTER[key] ?? PHASE_FOOTER.student;
}
