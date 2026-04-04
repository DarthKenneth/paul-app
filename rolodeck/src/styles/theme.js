// =============================================================================
// theme.js - ThemeContext, ThemeProvider, and useTheme hook
// Version: 1.1
// Last Updated: 2026-04-03
//
// PROJECT:      Rolodeck (project v1.3)
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
//   - useTheme(): returns { theme, themeKey, setTheme, fontKey, setFont }
//     - theme: merged object of color values + font family strings
//       (e.g. theme.primary, theme.fontHeading, theme.fontBody, etc.)
//     - Components use theme.font* for all fontFamily values in StyleSheet
//   - Font presets are merged onto the color theme object so makeStyles(theme)
//     has access to both colors and fonts in a single parameter
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial scaffold
// v1.1  2026-04-03  Claude  Added font preset support
//       - Font preset key persisted to @rolodeck_font
//       - Font family strings merged onto theme object (theme.fontHeading, etc.)
//       - useTheme() now returns fontKey and setFont
// =============================================================================

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Themes } from './colors';
import { FontPresets } from './typography';

const THEME_STORAGE_KEY = '@rolodeck_theme';
const FONT_STORAGE_KEY  = '@rolodeck_font';

const ThemeContext = createContext({
  theme:    { ...Themes.default, ...FontPresets.classic },
  themeKey: 'default',
  setTheme: () => {},
  fontKey:  'classic',
  setFont:  () => {},
});

export function ThemeProvider({ children }) {
  const [themeKey, setThemeKey] = useState('default');
  const [fontKey, setFontKey]   = useState('classic');

  useEffect(() => {
    let active = true;
    Promise.all([
      AsyncStorage.getItem(THEME_STORAGE_KEY),
      AsyncStorage.getItem(FONT_STORAGE_KEY),
    ]).then(([storedTheme, storedFont]) => {
      if (!active) return;
      if (storedTheme && Themes[storedTheme]) setThemeKey(storedTheme);
      if (storedFont && FontPresets[storedFont]) setFontKey(storedFont);
    });
    return () => { active = false; };
  }, []);

  const setTheme = async (key) => {
    if (!Themes[key]) return;
    setThemeKey(key);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, key);
  };

  const setFont = async (key) => {
    if (!FontPresets[key]) return;
    setFontKey(key);
    await AsyncStorage.setItem(FONT_STORAGE_KEY, key);
  };

  const theme = useMemo(
    () => ({ ...Themes[themeKey], ...FontPresets[fontKey] }),
    [themeKey, fontKey],
  );

  return (
    <ThemeContext.Provider value={{ theme, themeKey, setTheme, fontKey, setFont }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
