// =============================================================================
// typography.js - Font family references and type scale constants
// Version: 1.1
// Last Updated: 2026-04-03
//
// PROJECT:      Rolodeck (project v1.2)
// FILES:        colors.js       (palette + theme objects)
//               typography.js   (this file — font constants)
//               theme.js        (ThemeContext + ThemeProvider)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Font families match the exact string keys registered by App.js via
//     @expo-google-fonts packages (useFonts call)
//   - Components use FontFamily.* and FontSize.* constants exclusively —
//     never hardcode font strings or numeric sizes
//   - DM Serif Display: headings, screen titles, display text
//   - DM Sans: primary body copy, labels, buttons, captions
//   - Inter: badges, small labels, numerical data, tab bar labels
//   - Playfair Display: accent display text, customer name on detail
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial scaffold
// v1.1  2026-04-03  Claude  Added Inter and Playfair Display font families
//                           [updated ARCHITECTURE]
// =============================================================================

// FontFamily is kept as a static fallback; components should use
// theme.font* from useTheme() for dynamic font preset support.
export const FontFamily = {
  heading:      'DMSerifDisplay_400Regular',
  body:         'DMSans_400Regular',
  bodyMedium:   'DMSans_500Medium',
  bodyBold:     'DMSans_700Bold',
  ui:           'Inter_400Regular',
  uiMedium:     'Inter_500Medium',
  uiBold:       'Inter_700Bold',
  display:      'PlayfairDisplay_400Regular',
  displayBold:  'PlayfairDisplay_700Bold',
};

// ── Font presets ─────────────────────────────────────────────────────────────
// Each preset maps semantic roles to specific font family strings.
// Added to the theme object as theme.fontHeading, theme.fontBody, etc.

export const FontPresets = {
  classic: {
    fontHeading:     'DMSerifDisplay_400Regular',
    fontBody:        'DMSans_400Regular',
    fontBodyMedium:  'DMSans_500Medium',
    fontBodyBold:    'DMSans_700Bold',
    fontUi:          'DMSans_400Regular',
    fontUiMedium:    'DMSans_500Medium',
    fontUiBold:      'DMSans_700Bold',
    fontDisplay:     'DMSerifDisplay_400Regular',
    fontDisplayBold: 'DMSerifDisplay_400Regular',
  },
  modern: {
    fontHeading:     'Inter_700Bold',
    fontBody:        'Inter_400Regular',
    fontBodyMedium:  'Inter_500Medium',
    fontBodyBold:    'Inter_700Bold',
    fontUi:          'Inter_400Regular',
    fontUiMedium:    'Inter_500Medium',
    fontUiBold:      'Inter_700Bold',
    fontDisplay:     'Inter_700Bold',
    fontDisplayBold: 'Inter_700Bold',
  },
  elegant: {
    fontHeading:     'PlayfairDisplay_700Bold',
    fontBody:        'DMSans_400Regular',
    fontBodyMedium:  'DMSans_500Medium',
    fontBodyBold:    'DMSans_700Bold',
    fontUi:          'Inter_400Regular',
    fontUiMedium:    'Inter_500Medium',
    fontUiBold:      'Inter_700Bold',
    fontDisplay:     'PlayfairDisplay_400Regular',
    fontDisplayBold: 'PlayfairDisplay_700Bold',
  },
  clean: {
    fontHeading:     'Inter_700Bold',
    fontBody:        'DMSans_400Regular',
    fontBodyMedium:  'DMSans_500Medium',
    fontBodyBold:    'DMSans_700Bold',
    fontUi:          'Inter_400Regular',
    fontUiMedium:    'Inter_500Medium',
    fontUiBold:      'Inter_700Bold',
    fontDisplay:     'Inter_700Bold',
    fontDisplayBold: 'Inter_700Bold',
  },
};

export const FontPresetNames = {
  classic: 'Classic',
  modern:  'Modern',
  elegant: 'Elegant',
  clean:   'Clean',
};

export const FontPresetKeys = Object.keys(FontPresets);

export const FontSize = {
  xxs:  10,
  xs:   12,
  sm:   13,
  base: 15,
  md:   17,
  lg:   20,
  xl:   24,
  xxl:  30,
  hero: 38,
};

export const FontWeight = {
  regular: '400',
  medium:  '500',
  bold:    '700',
};

export const LetterSpacing = {
  tight:  -0.3,
  normal:  0,
  wide:    0.5,
  wider:   1.0,
};
