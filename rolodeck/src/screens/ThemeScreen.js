// =============================================================================
// ThemeScreen.js - Color scheme and font style pickers
// Version: 1.0
// Last Updated: 2026-04-09
//
// PROJECT:      Rolodeck (project v1.13)
// FILES:        ThemeScreen.js   (this file — theme/font pickers)
//               SettingsScreen.js (parent nav, links here via "Theme" row)
//               TabNavigator.js   (registers this screen in SettingsStack)
//               colors.js         (Themes, ThemeNames, ThemeKeys)
//               typography.js     (FontPresets, FontPresetNames, FontPresetKeys, FontSize)
//               theme.js          (useTheme)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Pushed onto the Settings stack from SettingsScreen's "Theme" nav row
//   - setTheme / setFont from useTheme() persist selections to AsyncStorage
//   - Color scheme grid and font style grid match the layout previously in
//     SettingsScreen; extracted here so Settings stays focused on preferences
//
// CHANGE LOG:
// v1.0  2026-04-09  Claude  Extracted from SettingsScreen; color scheme + font
//                           style pickers now live on their own stack screen
// =============================================================================

import React from 'react';
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
import { FontPresets, FontPresetNames, FontPresetKeys, FontSize } from '../styles/typography';

export default function ThemeScreen() {
  const { theme, themeKey, setTheme, fontKey, setFont } = useTheme();
  const styles = makeStyles(theme);

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
      fontSize:     FontSize.lg,
      color:        theme.text,
      marginBottom: 12,
    },
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
      fontSize:   FontSize.sm,
      color:      theme.textSecondary,
      flex:       1,
    },
    optionLabelActive: {
      color: theme.text,
    },
    fontPreview: {
      fontSize:  FontSize.lg,
      color:     theme.text,
      width:     28,
      textAlign: 'center',
    },
  });
}
