// =============================================================================
// ThemeScreen.js - Color scheme, font style, and text size pickers
// Version: 1.1
// Last Updated: 2026-04-26
//
// PROJECT:      Callout (project v1.3.0)
// FILES:        ThemeScreen.js   (this file — theme/font/size pickers)
//               SettingsScreen.js (parent nav, links here via "Theme" row)
//               TabNavigator.js   (registers this screen in SettingsStack)
//               colors.js         (Themes, ThemeNames, ThemeKeys)
//               typography.js     (FontPresets, FontPresetNames, FontPresetKeys,
//                                  FontSizeScales, FontSizeScaleNames, FontSizeScaleKeys)
//               theme.js          (useTheme)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Pushed onto the Settings stack from SettingsScreen's "Theme" nav row
//   - setTheme / setFont / setFontSizeScale from useTheme() persist to AsyncStorage
//   - Color scheme: 2-column grid with color swatch + name
//   - Font style: 2-column grid with "Aa" preview + name
//   - Text size: single horizontal row of 4 equal tiles (Small / Normal / Large / XL)
//     each showing a preview character at the scaled size
//
// CHANGE LOG:
// v1.0  2026-04-09  Claude  Extracted from SettingsScreen; color scheme + font
//                           style pickers now live on their own stack screen
// v1.1  2026-04-26  Claude  Text size picker section
//       - Added Text Size section below Font Style
//       - 4 options: Small / Normal / Large / XL (FontSizeScaleKeys)
//       - Each tile shows "Aa" at the scaled base size + label + checkmark
//       - Uses theme.fontSize.* throughout (no raw FontSize import)
//       - fontSizeKey / setFontSizeScale from useTheme()
// =============================================================================

import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/theme';
import { Themes, ThemeNames, ThemeKeys } from '../styles/colors';
import {
  FontPresets,
  FontPresetNames,
  FontPresetKeys,
  FontSize,
  FontSizeScales,
  FontSizeScaleNames,
  FontSizeScaleKeys,
} from '../styles/typography';

export default function ThemeScreen() {
  const { theme, themeKey, setTheme, fontKey, setFont, fontSizeKey, setFontSizeScale } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* ── Color scheme ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Color Scheme</Text>
          <View style={styles.grid}>
            {ThemeKeys.map((key) => {
              const isActive = themeKey === key;
              return (
                <Pressable
                  key={key}
                  style={[styles.gridOption, isActive && styles.gridOptionActive]}
                  onPress={() => setTheme(key)}
                  accessibilityRole="button"
                  accessibilityLabel={`${ThemeNames[key]} theme${isActive ? ', selected' : ''}`}
                >
                  <View style={[styles.swatch, { backgroundColor: Themes[key].primary }]} />
                  <Text style={[styles.optionLabel, isActive && styles.optionLabelActive]}>
                    {ThemeNames[key]}
                  </Text>
                  {isActive && (
                    <Ionicons name="checkmark-circle" size={16} color={theme.primary} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Font style ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Font Style</Text>
          <View style={styles.grid}>
            {FontPresetKeys.map((key) => {
              const isActive    = fontKey === key;
              const previewFont = FontPresets[key].fontHeading;
              return (
                <Pressable
                  key={key}
                  style={[styles.gridOption, isActive && styles.gridOptionActive]}
                  onPress={() => setFont(key)}
                  accessibilityRole="button"
                  accessibilityLabel={`${FontPresetNames[key]} font${isActive ? ', selected' : ''}`}
                >
                  <Text style={[styles.fontPreview, { fontFamily: previewFont }]}>Aa</Text>
                  <Text style={[styles.optionLabel, isActive && styles.optionLabelActive]}>
                    {FontPresetNames[key]}
                  </Text>
                  {isActive && (
                    <Ionicons name="checkmark-circle" size={16} color={theme.primary} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Text size ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Text Size</Text>
          <View style={styles.sizeRow}>
            {FontSizeScaleKeys.map((key) => {
              const isActive    = fontSizeKey === key;
              const previewSize = FontSize.base + FontSizeScales[key];
              return (
                <Pressable
                  key={key}
                  style={[styles.sizeOption, isActive && styles.sizeOptionActive]}
                  onPress={() => setFontSizeScale(key)}
                  accessibilityRole="button"
                  accessibilityLabel={`${FontSizeScaleNames[key]} text size${isActive ? ', selected' : ''}`}
                >
                  <Text style={[styles.sizePreview, {
                    fontSize: previewSize,
                    color: isActive ? theme.primary : theme.textSecondary,
                  }]}>
                    Aa
                  </Text>
                  <Text style={[styles.sizeLabel, isActive && styles.sizeLabelActive]}>
                    {FontSizeScaleNames[key]}
                  </Text>
                  {isActive && (
                    <Ionicons name="checkmark-circle" size={14} color={theme.primary} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: {
      flex:            1,
      backgroundColor: theme.background,
    },
    content: {
      padding:       18,
      paddingBottom: 48,
    },
    section: {
      backgroundColor: theme.surface,
      borderRadius:    16,
      padding:         18,
      marginBottom:    14,
      shadowColor:     '#000',
      shadowOffset:    { width: 0, height: 1 },
      shadowOpacity:   0.05,
      shadowRadius:    4,
      elevation:       1,
    },
    sectionTitle: {
      fontFamily:   theme.fontHeading,
      fontSize:     theme.fontSize.lg,
      color:        theme.text,
      marginBottom: 12,
    },
    // ── 2-col grid (color + font pickers) ─────────────────────────────────────
    grid: {
      flexDirection: 'row',
      flexWrap:      'wrap',
      gap:           10,
    },
    gridOption: {
      width:         '47%',
      flexDirection: 'row',
      alignItems:    'center',
      borderRadius:  12,
      borderWidth:   1,
      borderColor:   theme.border,
      padding:       11,
      gap:           8,
    },
    gridOptionActive: {
      borderColor:     theme.primary,
      backgroundColor: theme.primaryPale,
    },
    swatch: {
      width:        22,
      height:       22,
      borderRadius: 11,
    },
    optionLabel: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   theme.fontSize.sm,
      color:      theme.textSecondary,
      flex:       1,
    },
    optionLabelActive: {
      color: theme.text,
    },
    fontPreview: {
      fontSize:  theme.fontSize.lg,
      color:     theme.text,
      width:     28,
      textAlign: 'center',
    },
    // ── Size picker row ────────────────────────────────────────────────────────
    sizeRow: {
      flexDirection: 'row',
      gap:           8,
    },
    sizeOption: {
      flex:              1,
      alignItems:        'center',
      justifyContent:    'center',
      paddingVertical:   12,
      paddingHorizontal: 4,
      borderRadius:      12,
      borderWidth:       1,
      borderColor:       theme.border,
      gap:               4,
    },
    sizeOptionActive: {
      borderColor:     theme.primary,
      backgroundColor: theme.primaryPale,
    },
    sizePreview: {
      fontFamily: theme.fontBody,
    },
    sizeLabel: {
      fontFamily: theme.fontUi,
      fontSize:   theme.fontSize.xs,
      color:      theme.textSecondary,
    },
    sizeLabelActive: {
      color: theme.text,
    },
  });
}
