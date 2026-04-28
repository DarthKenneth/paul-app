// =============================================================================
// theme.js - ThemeContext, ThemeProvider, and useTheme hook
// Version: 1.3
// Last Updated: 2026-04-26
//
// PROJECT:      Callout (project v1.3.0)
// FILES:        colors.js       (Palette, Themes, ThemeNames, ThemeKeys)
//               typography.js   (FontPresets, FontPresetKeys, FontSize)
//               theme.js        (this file — ThemeContext)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - ThemeProvider wraps the NavigationContainer in App.js
//   - Loads persisted theme key + font key from AsyncStorage on mount
//   - setTheme(key): updates color theme + persists
//   - setFont(key): updates font preset + persists
//   - useTheme(): returns { theme, themeKey, setTheme, fontKey, setFont,
//                           fontSizeKey, setFontSizeScale, isDark }
//     - theme: merged object of color values + font family strings + fontSize object
//       (e.g. theme.primary, theme.fontHeading, theme.fontSize.base, etc.)
//     - theme.fontSize: FontSize values pre-offset by FontSizeScales[fontSizeKey]
//       so components use theme.fontSize.base instead of the static theme.fontSize.base
//     - isDark: true when the effective rendered theme is dark
//     - Components use theme.font* for all fontFamily values in StyleSheet
//   - Font presets are merged onto the color theme object so makeStyles(theme)
//     has access to both colors and fonts in a single parameter
//   - 'rustic' is the default theme: automatically switches between Themes.rusticLight
//     and Themes.rusticDark based on the system color scheme. Any other theme key
//     is resolved directly from Themes without system-aware switching.
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial scaffold
// v1.1  2026-04-03  Claude  Added font preset support
//       - Font preset key persisted to @callcard_font
//       - Font family strings merged onto theme object (theme.fontHeading, etc.)
//       - useTheme() now returns fontKey and setFont
// v1.3  2026-04-26  Claude  Font size scale support
//       - Added FONT_SIZE_SCALE_KEY, fontSizeKey state (default 'normal')
//       - Loads/persists fontSizeKey from @callcard_font_size
//       - setFontSizeScale(key) exposed via context
//       - theme.fontSize: pre-scaled FontSize values using FontSizeScales offset
//       - Context default + ThemeContext.Provider value updated [updated ARCHITECTURE]
// v1.2  2026-04-25  Claude  Rustic auto light/dark + Aptos default + isDark
//       - Default themeKey 'default' → 'rustic'; default fontKey 'classic' → 'aptos'
//       - 'rustic' theme auto-switches rusticLight/rusticDark via useColorScheme()
//       - Exposed isDark in context (true for midnight, ember, and rustic-dark)
//       - ThemeContext default context value updated to match new defaults
// =============================================================================

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Themes } from './colors';
import { FontPresets, FontSize, FontSizeScales } from './typography';

const THEME_STORAGE_KEY     = '@callcard_theme';
const FONT_STORAGE_KEY      = '@callcard_font';
const FONT_SIZE_SCALE_KEY   = '@callcard_font_size';

const DEFAULT_FONT_SIZE = buildFontSize('normal');

const ThemeContext = createContext({
  theme:            { ...Themes.rusticLight, ...FontPresets.aptos, fontSize: DEFAULT_FONT_SIZE },
  themeKey:         'rustic',
  setTheme:         () => {},
  fontKey:          'aptos',
  setFont:          () => {},
  fontSizeKey:      'normal',
  setFontSizeScale: () => {},
  isDark:           false,
});

function buildFontSize(scaleKey) {
  const offset = FontSizeScales[scaleKey] ?? 0;
  const result = {};
  for (const [k, v] of Object.entries(FontSize)) {
    result[k] = v + offset;
  }
  return result;
}

export function ThemeProvider({ children }) {
  const colorScheme          = useColorScheme(); // 'light' | 'dark' | null
  const [themeKey, setThemeKey]         = useState('rustic');
  const [fontKey, setFontKey]           = useState('aptos');
  const [fontSizeKey, setFontSizeKey]   = useState('normal');

  useEffect(() => {
    let active = true;
    Promise.all([
      AsyncStorage.getItem(THEME_STORAGE_KEY),
      AsyncStorage.getItem(FONT_STORAGE_KEY),
      AsyncStorage.getItem(FONT_SIZE_SCALE_KEY),
    ]).then(([storedTheme, storedFont, storedFontSize]) => {
      if (!active) return;
      if (storedTheme && (Themes[storedTheme] || storedTheme === 'rustic')) setThemeKey(storedTheme);
      if (storedFont && FontPresets[storedFont]) setFontKey(storedFont);
      if (storedFontSize && FontSizeScales[storedFontSize] !== undefined) setFontSizeKey(storedFontSize);
    });
    return () => { active = false; };
  }, []);

  const setTheme = async (key) => {
    if (!Themes[key] && key !== 'rustic') return;
    setThemeKey(key);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, key);
  };

  const setFont = async (key) => {
    if (!FontPresets[key]) return;
    setFontKey(key);
    await AsyncStorage.setItem(FONT_STORAGE_KEY, key);
  };

  const setFontSizeScale = async (key) => {
    if (FontSizeScales[key] === undefined) return;
    setFontSizeKey(key);
    await AsyncStorage.setItem(FONT_SIZE_SCALE_KEY, key);
  };

  const { theme, isDark } = useMemo(() => {
    let colors;
    if (themeKey === 'rustic') {
      colors = colorScheme === 'dark' ? Themes.rusticDark : Themes.rusticLight;
    } else {
      colors = Themes[themeKey] ?? Themes.rusticLight;
    }
    const isDark =
      themeKey === 'midnight' ||
      themeKey === 'ember' ||
      (themeKey === 'rustic' && colorScheme === 'dark');
    return {
      theme: { ...colors, ...FontPresets[fontKey], fontSize: buildFontSize(fontSizeKey) },
      isDark,
    };
  }, [themeKey, fontKey, fontSizeKey, colorScheme]);

  return (
    <ThemeContext.Provider value={{ theme, themeKey, setTheme, fontKey, setFont, fontSizeKey, setFontSizeScale, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
