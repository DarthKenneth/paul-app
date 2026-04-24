// =============================================================================
// typography.js - Font family references and type scale constants
// Version: 1.3
// Last Updated: 2026-04-24
//
// PROJECT:      Rolodeck (project v0.29.0)
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
//   - Four presets across two axes (serif/sans) with distinct visual personalities:
//       classic ("Editorial"): Playfair Display 700 Bold (bold, dramatic, editorial
//         serifs with high stroke contrast) + Inter body (tight, neutral)
//       elegant ("Refined"): DM Serif Display (graceful, fine-stroked, airy) +
//         DM Sans body (rounded, warm) — soft and more refined
//       modern ("Geometric"): Inter throughout — tight, utilitarian, neutral
//       clean ("Rounded"): DM Sans throughout — wider spacing, softer geometry
//   - The two serifs differ by weight/contrast: Playfair is bold + dramatic,
//     DM Serif Display is light + graceful. The two sans differ by geometry:
//     Inter is tight + angular, DM Sans is rounded + relaxed.
//
// CHANGE LOG:
// v1.3  2026-04-24  Claude  Tablet font scale — tabletScale(size) bumps by 2pt on tablet
// v1.0  2026-04-03  Claude  Initial scaffold
// v1.1  2026-04-03  Claude  Added Inter and Playfair Display font families
//                           [updated ARCHITECTURE]
// v1.2  2026-04-09  Claude  Differentiated all 4 presets into 2 serif + 2 sans
//       - classic ("Editorial"): Playfair Display 700 Bold + Inter — bold/dramatic
//         serif heading against tight neutral body; high visual contrast
//       - elegant ("Refined"): DM Serif Display + DM Sans — light/graceful serif
//         with rounded warm body; softer, airier feel
//       - modern ("Geometric"): Inter throughout — tight, neutral (unchanged)
//       - clean ("Rounded"): DM Sans throughout — wider, softer (unchanged keys,
//         was Inter heading; now DM Sans heading to match all-rounded feel)
//       - Updated FontPresetNames for all four [updated ARCHITECTURE]
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
  // Bold serif: Playfair Display 700 Bold headings (dramatic, high-contrast editorial strokes)
  // + Inter body (tight, neutral) — punchy and high-contrast
  classic: {
    fontHeading:     'PlayfairDisplay_700Bold',
    fontBody:        'Inter_400Regular',
    fontBodyMedium:  'Inter_500Medium',
    fontBodyBold:    'Inter_700Bold',
    fontUi:          'Inter_400Regular',
    fontUiMedium:    'Inter_500Medium',
    fontUiBold:      'Inter_700Bold',
    fontDisplay:     'PlayfairDisplay_400Regular',
    fontDisplayBold: 'PlayfairDisplay_700Bold',
  },
  // Light serif: DM Serif Display (graceful, fine-stroked, airy) + DM Sans body
  // (rounded, warm) — softer and more refined feel
  elegant: {
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
  // Geometric sans: Inter throughout — tight letter-spacing, neutral, utilitarian
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
  // Rounded sans: DM Sans throughout — wider letter-spacing, softer, more
  // approachable; visually distinct from Inter's tighter geometry
  clean: {
    fontHeading:     'DMSans_700Bold',
    fontBody:        'DMSans_400Regular',
    fontBodyMedium:  'DMSans_500Medium',
    fontBodyBold:    'DMSans_700Bold',
    fontUi:          'DMSans_400Regular',
    fontUiMedium:    'DMSans_500Medium',
    fontUiBold:      'DMSans_700Bold',
    fontDisplay:     'DMSans_700Bold',
    fontDisplayBold: 'DMSans_700Bold',
  },
};

export const FontPresetNames = {
  classic: 'Editorial',
  elegant: 'Refined',
  modern:  'Geometric',
  clean:   'Rounded',
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

// Bump any font size by 2pt on tablet. Pass isTablet from useIsTablet().
export function tabletScale(size, isTablet) {
  return isTablet ? size + 2 : size;
}

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
