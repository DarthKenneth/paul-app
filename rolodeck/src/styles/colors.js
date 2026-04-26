// =============================================================================
// colors.js - Brand color palette and multi-theme definitions
// Version: 1.4.1
// Last Updated: 2026-04-25
//
// PROJECT:      Rolodeck (project v1.2.0)
// FILES:        colors.js       (this file — palette + theme objects)
//               typography.js   (font family + size constants)
//               theme.js        (ThemeContext + ThemeProvider)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Palette: raw hex values — never referenced directly in components
//   - buildTheme(overrides): merges overrides into the default theme shape,
//     ensuring all themes expose the same semantic keys
//   - Themes: named resolved color maps keyed to semantic roles
//     (primary, accent, background, surface, text, etc.)
//   - Components import from theme.js (useTheme) not from here directly
//   - ThemeNames / ThemeKeys: used by ThemeScreen and SettingsScreen
//   - 'rustic' is an auto light/dark theme: ThemeProvider picks rusticLight or
//     rusticDark based on the system color scheme. Themes.rustic is an alias for
//     rusticLight and exists only for swatch display in ThemeScreen/SettingsScreen.
//   - ThemeKeys is a manually ordered array — rusticLight + rusticDark are
//     internal and intentionally excluded from the user-facing picker.
//
// CHANGE LOG:
// v1.4.1  2026-04-25  Claude  Fix syntax error: rusticLight/rusticDark placed outside Themes object
// v1.4  2026-04-25  Claude  Rustic Trade auto light/dark theme
//       - Added rusticLight and rusticDark themes (warm sienna / parchment palette)
//       - Added Themes.rustic alias → rusticLight for swatch display
//       - Changed ThemeKeys to a manually ordered array (excludes rusticLight/Dark)
//       - Added ThemeNames.rustic = 'Rustic Trade'
// v1.3  2026-04-10  Claude  Added Stone (grey) and Ember (dark warm) themes
//       - Added Stone theme: cool grey background, slate-blue primary, amber accent
//       - Added Ember theme: dark warm charcoal, amber primary, pink-red accent
//       - Added ThemeNames entries for both new themes
// v1.2  2026-04-10  Claude  Added scheduled (blue) semantic color
//       - Added Palette.blue (#2B7FF0)
//       - Added scheduled: blue to BASE_THEME; midnight override: #60A5FA
// v1.1  2026-04-10  Claude  Changed success color to green across all themes
//       - Added Palette.green (#3DAA6A)
//       - BASE_THEME success: teal → green (affects default, ocean, forest)
//       - Midnight success override: purple (#9D96FF) → bright green (#4CC87A)
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
  green:      '#3DAA6A',
  blue:       '#2B7FF0',
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
  success:          Palette.green,
  scheduled:        Palette.blue,
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
    success:          '#4CC87A',
    scheduled:        '#60A5FA',
    inputBg:          '#13111D',
    inputBorder:      '#2E2A44',
    placeholder:      '#666688',
    headerBg:         '#1A1729',
    headerText:       '#F0EEFF',
    headerBorder:     '#2E2A44',
  }),

  stone: buildTheme({
    primary:          '#6878A0',
    primaryDark:      '#4D5C82',
    primaryLight:     '#8D9DC0',
    primaryPale:      '#DDE2EF',
    accent:           '#C8743A',
    accentLight:      '#DFA070',
    background:       '#EDEDF0',
    surface:          '#F7F7F9',
    border:           '#D4D4DB',
    borderLight:      '#E8E8EC',
    text:             '#1C1C24',
    textSecondary:    '#50506A',
    textMuted:        '#9090A8',
    cardBg:           '#F7F7F9',
    tabBar:           '#F7F7F9',
    tabBarBorder:     '#D4D4DB',
    tabIconActive:    '#6878A0',
    tabIconInactive:  '#9090A8',
    badge:            '#C8743A',
    badgeText:        '#FFFFFF',
    inputBg:          '#FFFFFF',
    inputBorder:      '#D4D4DB',
    placeholder:      '#9090A8',
    headerBg:         '#F7F7F9',
    headerText:       '#1C1C24',
    headerBorder:     '#D4D4DB',
  }),

  ember: buildTheme({
    primary:          '#F59E3A',
    primaryDark:      '#C97B1A',
    primaryLight:     '#F7C070',
    primaryPale:      '#2E2010',
    accent:           '#E85D75',
    accentLight:      '#F0808F',
    background:       '#0E0B07',
    surface:          '#1A1510',
    border:           '#2E2518',
    borderLight:      '#3A3020',
    text:             '#F5EDD8',
    textSecondary:    '#BBAA88',
    textMuted:        '#776655',
    cardBg:           '#1A1510',
    tabBar:           '#140F0A',
    tabBarBorder:     '#2E2518',
    tabIconActive:    '#F59E3A',
    tabIconInactive:  '#776655',
    badge:            '#E85D75',
    badgeText:        '#FFFFFF',
    overdue:          '#FF6B6B',
    warning:          '#FFAA44',
    success:          '#4CC87A',
    scheduled:        '#60A5FA',
    inputBg:          '#0E0B07',
    inputBorder:      '#2E2518',
    placeholder:      '#776655',
    headerBg:         '#140F0A',
    headerText:       '#F5EDD8',
    headerBorder:     '#2E2518',
  }),

  // ── Rustic Trade light (system light mode) ────────────────────────────────
  rusticLight: buildTheme({
    primary:          '#8B4513',
    primaryDark:      '#6B2E0E',
    primaryLight:     '#B87040',
    primaryPale:      '#F5E3C8',
    accent:           '#D4A853',
    accentLight:      '#E8C882',
    background:       '#FDF0E0',
    surface:          '#FFF7EE',
    border:           '#E8D4B0',
    borderLight:      '#F2E8D0',
    text:             '#2A1506',
    textSecondary:    '#6B4B30',
    textMuted:        '#B89878',
    cardBg:           '#FFF7EE',
    tabBar:           '#FFF7EE',
    tabBarBorder:     '#E8D4B0',
    tabIconActive:    '#8B4513',
    tabIconInactive:  '#B89878',
    badge:            '#D4A853',
    badgeText:        '#2A1506',
    overdue:          '#CC3311',
    warning:          '#E07700',
    success:          '#4A7C40',
    scheduled:        '#3A6CA8',
    inputBg:          '#FFF7EE',
    inputBorder:      '#E8D4B0',
    placeholder:      '#B89878',
    headerBg:         '#FFF7EE',
    headerText:       '#2A1506',
    headerBorder:     '#E8D4B0',
  }),

  // ── Rustic Trade dark (system dark mode) ──────────────────────────────────
  rusticDark: buildTheme({
    primary:          '#C8853A',
    primaryDark:      '#A86A2A',
    primaryLight:     '#DFA060',
    primaryPale:      '#4A2810',
    accent:           '#D4A853',
    accentLight:      '#E8C882',
    background:       '#2A1506',
    surface:          '#3A1E08',
    border:           '#4A2810',
    borderLight:      '#5A3318',
    text:             '#F5E3C8',
    textSecondary:    '#C8A880',
    textMuted:        '#8B7055',
    cardBg:           '#3A1E08',
    tabBar:           '#241206',
    tabBarBorder:     '#4A2810',
    tabIconActive:    '#C8853A',
    tabIconInactive:  '#8B7055',
    badge:            '#D4A853',
    badgeText:        '#2A1506',
    overdue:          '#FF6B6B',
    warning:          '#FFAA44',
    success:          '#4CC87A',
    scheduled:        '#60A5FA',
    inputBg:          '#2A1506',
    inputBorder:      '#4A2810',
    placeholder:      '#8B7055',
    headerBg:         '#241206',
    headerText:       '#F5E3C8',
    headerBorder:     '#4A2810',
  }),
};

// Alias for swatch display in ThemeScreen/SettingsScreen — do not use for rendering
Themes.rustic = Themes.rusticLight;

export const ThemeNames = {
  rustic:   'Rustic Trade',
  default:  'Classic',
  ocean:    'Ocean Blue',
  forest:   'Forest Green',
  midnight: 'Midnight',
  stone:    'Stone',
  ember:    'Ember',
};

// Manually ordered — rusticLight + rusticDark are internal, excluded from picker
export const ThemeKeys = ['rustic', 'default', 'ocean', 'forest', 'midnight', 'stone', 'ember'];
