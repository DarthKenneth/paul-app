// =============================================================================
// responsive.js - Tablet/phone layout helpers
// Version: 1.1
// Last Updated: 2026-04-24
//
// PROJECT:      Rolodeck (project v0.29.0)
// FILES:        responsive.js             (this file — hooks + constants)
//               CustomersScreen.js        (centers list on tablet; split view)
//               CustomerDetailScreen.js   (caps content width on tablet)
//               CustomerDetailPane.js     (embedded in split views)
//               AddCustomerScreen.js      (caps form width on tablet)
//               AddServiceScreen.js       (caps form width on tablet)
//               ServicesScreen.js         (caps list width on tablet)
//               SettingsScreen.js         (caps list width on tablet)
//               App.js                    (sidebar layout on tablet landscape)
//               TabNavigator.js           (hides bottom tabs on tablet landscape)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - useIsTablet(): short-side ≥ TABLET_BREAKPOINT. Reactive to orientation.
//   - useIsLandscape(): width > height. Reactive to orientation.
//   - useSplitLayout(): isTablet && isLandscape — gates sidebar + split panes.
//   - SIDEBAR_WIDTH: persistent left sidebar width on tablet landscape.
//   - SPLIT_LIST_WIDTH: left list panel width in split-pane views.
//   - CONTENT_MAX_WIDTH: content cap in portrait tablet (forms + lists).
//   - useContentContainerStyle(): centering wrapper for portrait tablet.
//
// CHANGE LOG:
// v1.0  2026-04-19  Claude  Initial scaffold
// v1.1  2026-04-24  Claude  Landscape detection + split-layout hooks for tablet buildout
//       - Added useIsLandscape(), useSplitLayout()
//       - Added SIDEBAR_WIDTH (240), SPLIT_LIST_WIDTH (320) constants
// =============================================================================

import { useWindowDimensions } from 'react-native';

// iPad mini portrait is 768pt wide; 720 catches every tablet even in split-
// screen while excluding the largest phones (iPhone Pro Max ≈ 430pt landscape).
export const TABLET_BREAKPOINT  = 720;
export const CONTENT_MAX_WIDTH  = 760;
export const SIDEBAR_WIDTH      = 240;
export const SPLIT_LIST_WIDTH   = 320;

export function useIsTablet() {
  const { width, height } = useWindowDimensions();
  return Math.min(width, height) >= TABLET_BREAKPOINT;
}

export function useIsLandscape() {
  const { width, height } = useWindowDimensions();
  return width > height;
}

export function useSplitLayout() {
  const { width, height } = useWindowDimensions();
  const isTablet    = Math.min(width, height) >= TABLET_BREAKPOINT;
  const isLandscape = width > height;
  return isTablet && isLandscape;
}

/**
 * Returns a style block for a content wrapper. On tablets it caps width at
 * CONTENT_MAX_WIDTH and centers horizontally; on phones returns null.
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
