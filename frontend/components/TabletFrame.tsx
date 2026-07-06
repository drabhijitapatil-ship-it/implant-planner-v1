import React from 'react';

// Tablet breakpoint — iPads start at 768px; Android tablets usually >= 800px.
export const TABLET_BREAKPOINT = 768;

/**
 * TabletFrame — wraps the entire app on tablets.
 * Previously centered the phone-sized UI inside a 480px column.
 * Now updated to render full-screen natively on iPads as requested.
 */
export function TabletFrame({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
