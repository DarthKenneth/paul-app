// =============================================================================
// responsive.js - Tablet/phone layout helpers
// Version: 1.0
// Last Updated: 2026-04-19
//
// PROJECT:      Rolodeck (project v0.25.0)
// FILES:        responsive.js             (this file — hooks + constants)
//               CustomersScreen.js        (centers list on tablet)
//               CustomerDetailScreen.js   (caps content width on tablet)
//               AddCustomerScreen.js      (caps form width on tablet)
//               AddServiceScreen.js       (caps form width on tablet)
//               ServicesScreen.js         (caps list width on tablet)
//               SettingsScreen.js         (caps list width on tablet)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - useIsTablet(): returns true when the current window short-side is ≥ the
//     TABLET_BREAKPOINT. Reactive via useWindowDimensions so it flips on
//     orientation change or split-screen resize without remount.
//   - CONTENT_MAX_WIDTH: the width cap applied on tablet to forms + lists so
//     the UI does not stretch edge-to-edge on an iPad. Chosen to fit the
//     longest form field labels comfortably while leaving breathing room
//     around the content on iPad Pro in portrait (820pt).
//   - useContentContainerStyle(): convenience hook that returns { maxWidth,
//     width, alignSelf } when on tablet, or an empty object on phone — drop
//     directly onto a parent View to center content.
//
// CHANGE LOG:
// v1.0  2026-04-19  Claude  Initial scaffold
// =============================================================================

import { useWindowDimensions } from 'react-native';

// iPad mini portrait is 768pt wide, so 720 catches every tablet even in
// split-screen while excluding the largest phones (iPhone Pro Max ≈ 430pt
// in landscape short-side).
export const TABLET_BREAKPOINT = 720;

// Content max-width on tablet. Picked so that form labels + inputs have room
// to breathe without the list feeling cramped on a 768pt-wide iPad mini.
export const CONTENT_MAX_WIDTH = 760;

export function useIsTablet() {
  const { width, height } = useWindowDimensions();
  return Math.min(width, height) >= TABLET_BREAKPOINT;
}

/**
 * Returns a style block for a content wrapper. On tablets it caps width at
 * CONTENT_MAX_WIDTH and centers horizontally; on phones it returns an empty
 * object so components render edge-to-edge as before.
 */
export function useContentContainerStyle() {
  const isTablet = useIsTablet();
  if (!isTablet) return null;
  return {
    width:     '100%',
    maxWidth:  CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  };
}
