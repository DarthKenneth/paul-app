// =============================================================================
// colors.js - Brand color palette and multi-theme definitions
// Version: 1.0
// Last Updated: 2026-04-03
//
// PROJECT:      Rolodeck (project v1.2)
// FILES:        colors.js       (this file — palette + theme objects)
//               typography.js   (font family + size constants)
//               theme.js        (ThemeContext + ThemeProvider)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Palette: raw hex values — never referenced directly in components
//   - buildTheme(overrides): merges overrides into the default theme shape,
//     ensuring all 4 themes expose the same semantic keys
//   - Themes: named resolved color maps keyed to semantic roles
//     (primary, accent, background, surface, text, etc.)
//   - Components import from theme.js (useTheme) not from here directly
//   - ThemeNames / ThemeKeys: used by SettingsScreen for the theme picker
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial scaffold — 4 themes (default, ocean,
//                           forest, midnight)
// =============================================================================

export const Palette = {
  teal:       '#4AACA5',
  tealDark:   '#2E8A84',
  tealMid:    '#5BBFB9',
  tealLight:  '#7ECEC9',
  tealPale:   '#C6ECEA',
  tealFaint:  '#E8F6F5',
  rust:       '#D4795A',
  rustLight:  '#E8A088',
  cream:      '#F5F0E8',
  creamDark:  '#DDD5C4',
  creamMid:   '#C9B99A',
  ivory:      '#FFFDF9',
  charcoal:   '#1A1A1A',
  slate:      '#444444',
  gray:       '#666666',
  grayLight:  '#999999',
  grayFaint:  '#EEEEEE',
  white:      '#FFFFFF',
  red:        '#E53E3E',
  orange:     '#DD7700',
};

// All themes must define every key in this base shape
const BASE_THEME = {
  primary:          Palette.teal,
  primaryDark:      Palette.tealDark,
  primaryLight:     Palette.tealLight,
  primaryPale:      Palette.tealPale,
  accent:           Palette.rust,
  accentLight:      Palette.rustLight,
  background:       Palette.cream,
  surface:          Palette.ivory,
  border:           Palette.creamDark,
  borderLight:      Palette.grayFaint,
  text:             Palette.charcoal,
  textSecondary:    Palette.slate,
  textMuted:        Palette.grayLight,
  cardBg:           Palette.ivory,
  tabBar:           Palette.ivory,
  tabBarBorder:     Palette.creamDark,
  tabIconActive:    Palette.teal,
  tabIconInactive:  Palette.grayLight,
  badge:            Palette.rust,
  badgeText:        Palette.white,
  overdue:          Palette.red,
  warning:          Palette.orange,
  success:          Palette.teal,
  inputBg:          Palette.white,
  inputBorder:      Palette.creamDark,
  placeholder:      Palette.grayLight,
  headerBg:         Palette.ivory,
  headerText:       Palette.charcoal,
  headerBorder:     Palette.creamDark,
};

function buildTheme(overrides) {
  return { ...BASE_THEME, ...overrides };
}

export const Themes = {
  default: buildTheme({}),

  ocean: buildTheme({
    primary:          '#3A7BD5',
    primaryDark:      '#2560B8',
    primaryLight:     '#6FA3E8',
    primaryPale:      '#C5D9F5',
    accent:           '#F4A261',
    accentLight:      '#F7C08A',
    background:       '#EDF2FB',
    surface:          '#FFFFFF',
    border:           '#C8D8EE',
    borderLight:      '#E5EEF9',
    text:             '#1A1A2E',
    textSecondary:    '#445577',
    textMuted:        '#8899BB',
    cardBg:           '#FFFFFF',
    tabBar:           '#FFFFFF',
    tabBarBorder:     '#C8D8EE',
    tabIconActive:    '#3A7BD5',
    tabIconInactive:  '#8899BB',
    badge:            '#F4A261',
    badgeText:        '#FFFFFF',
    inputBg:          '#FFFFFF',
    inputBorder:      '#C8D8EE',
    placeholder:      '#8899BB',
    headerBg:         '#FFFFFF',
    headerText:       '#1A1A2E',
    headerBorder:     '#C8D8EE',
  }),

  forest: buildTheme({
    primary:          '#5C8A5A',
    primaryDark:      '#3D6B3B',
    primaryLight:     '#8DB88B',
    primaryPale:      '#D0E8CF',
    accent:           '#C97A2F',
    accentLight:      '#DFA660',
    background:       '#F0F4EE',
    surface:          '#FAFFF9',
    border:           '#C8D8C6',
    borderLight:      '#E5F0E4',
    text:             '#1A2418',
    textSecondary:    '#445544',
    textMuted:        '#88AA88',
    cardBg:           '#FAFFF9',
    tabBar:           '#FAFFF9',
    tabBarBorder:     '#C8D8C6',
    tabIconActive:    '#5C8A5A',
    tabIconInactive:  '#88AA88',
    badge:            '#C97A2F',
    badgeText:        '#FFFFFF',
    inputBg:          '#FAFFF9',
    inputBorder:      '#C8D8C6',
    placeholder:      '#88AA88',
    headerBg:         '#FAFFF9',
    headerText:       '#1A2418',
    headerBorder:     '#C8D8C6',
  }),

  midnight: buildTheme({
    primary:          '#9D96FF',
    primaryDark:      '#4B44CC',
    primaryLight:     '#BDB8FF',
    primaryPale:      '#2A2745',
    accent:           '#FF6B9D',
    accentLight:      '#FF9DBD',
    background:       '#13111D',
    surface:          '#1E1B2E',
    border:           '#2E2A44',
    borderLight:      '#3A3558',
    text:             '#F0EEFF',
    textSecondary:    '#AAAACC',
    textMuted:        '#666688',
    cardBg:           '#1E1B2E',
    tabBar:           '#1A1729',
    tabBarBorder:     '#2E2A44',
    tabIconActive:    '#9D96FF',
    tabIconInactive:  '#666688',
    badge:            '#FF6B9D',
    badgeText:        '#FFFFFF',
    overdue:          '#FF6B6B',
    warning:          '#FFAA44',
    success:          '#9D96FF',
    inputBg:          '#13111D',
    inputBorder:      '#2E2A44',
    placeholder:      '#666688',
    headerBg:         '#1A1729',
    headerText:       '#F0EEFF',
    headerBorder:     '#2E2A44',
  }),
};

export const ThemeNames = {
  default:  'Rolodeck Classic',
  ocean:    'Ocean Blue',
  forest:   'Forest Green',
  midnight: 'Midnight',
};

export const ThemeKeys = Object.keys(Themes);
