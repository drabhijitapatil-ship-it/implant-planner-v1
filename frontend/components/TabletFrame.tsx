import React from 'react';
import { View, useWindowDimensions } from 'react-native';

// Tablet breakpoint — iPads start at 768px; Android tablets usually >= 800px.
export const TABLET_BREAKPOINT = 768;
// Cap content width on tablets so the phone-first UI doesn't stretch awkwardly.
const CONTENT_MAX_WIDTH = 480;

/**
 * TabletFrame — wraps the entire app on tablets, centering the phone-sized UI
 * inside a neutral side-gutter background so controls don't stretch across the screen.
 * On phones (< 768px width), renders children unchanged.
 */
export function TabletFrame({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;

  if (!isTablet) return <>{children}</>;

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#0F172A' }} data-testid="tablet-frame">
      <View style={{ flex: 1 }} />
      <View style={{ width: CONTENT_MAX_WIDTH, maxWidth: CONTENT_MAX_WIDTH, backgroundColor: '#FFF' }}>
        {children}
      </View>
      <View style={{ flex: 1 }} />
    </View>
  );
}
