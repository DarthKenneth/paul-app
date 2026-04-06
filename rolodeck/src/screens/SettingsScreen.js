// =============================================================================
// SettingsScreen.js - App preferences: theme, sort, Square token, version
// Version: 1.4
// Last Updated: 2026-04-04
//
// PROJECT:      Rolodeck (project v1.6)
// FILES:        SettingsScreen.js     (this file)
//               colors.js             (Themes, ThemeNames, ThemeKeys)
//               storage.js            (getSortPreference, saveSortPreference)
//               squarePlaceholder.js  (get/save/clearSquareAccessToken)
//               theme.js              (useTheme)
//               typography.js         (FontFamily, FontSize)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Theme picker: grid of options, each showing a color swatch + label;
//     calls setTheme() from useTheme() which persists to AsyncStorage
//   - Sort preference: 4-option toggle (Name / Address / Zip Code / Email);
//     matches the 4 sort options in CustomersScreen; persists via
//     saveSortPreference(); CustomersScreen reads it on useFocusEffect
//   - Square token: secureTextEntry field; save/clear with alert feedback;
//     stored via squarePlaceholder.saveSquareAccessToken()
//   - App version: read from a constant; matches app.json expo.version
//   - useEffect cleanup prevents state updates on unmounted component
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial scaffold
// v1.1  2026-04-03  Claude  Debug + harden
//       - Fixed APP_VERSION constant: was '1.0.0', now '1.2' to match VERSION
//       - Fixed sort toggle: was 2-option (Name/Zip), now 4-option
//         (Name/Address/Zip/Email) matching CustomersScreen sort options
//       - Fixed memory leak: added cleanup flag to useEffect so setState
//         calls don't fire after unmount
// v1.2  2026-04-04  Claude  Updated APP_VERSION to '1.4' to match project bump
// v1.3  2026-04-04  Claude  Updated APP_VERSION to '1.5' to match project bump
// v1.4  2026-04-04  Claude  Added Backup & Restore Coming Soon section
//       - Imported cloudProviderLabel from backup.js for platform-specific copy
//       - Added backup section UI (Coming Soon badge, platform-specific description)
//       - Updated APP_VERSION to '1.6'
// =============================================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Animated,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/theme';
import { Themes, ThemeNames, ThemeKeys } from '../styles/colors';
import { FontPresets, FontPresetNames, FontPresetKeys, FontSize } from '../styles/typography';
import { getSortPreference, saveSortPreference, getShowArchived, saveShowArchived } from '../data/storage';
import { cloudProviderLabel } from '../utils/backup';

const APP_VERSION = '1.6';

const SORT_OPTIONS = [
  { key: 'name', label: 'Name',     icon: 'text-outline'     },
  { key: 'city', label: 'City',     icon: 'business-outline' },
  { key: 'zip',  label: 'Zip Code', icon: 'map-outline'      },
];

export default function SettingsScreen() {
  const { theme, themeKey, setTheme, fontKey, setFont } = useTheme();
  const styles = makeStyles(theme);

  const [sortPref, setSortPref]         = useState('name');
  const [showArchived, setShowArchived] = useState(false);
  const toggleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    getSortPreference().then((p) => { if (active) setSortPref(p); });
    getShowArchived().then((v) => { if (active) { setShowArchived(v); toggleAnim.setValue(v ? 1 : 0); } });
    return () => { active = false; };
  }, []);

  const handleSortChange = async (pref) => {
    setSortPref(pref);
    await saveSortPreference(pref);
  };

  const handleArchiveToggle = async () => {
    const next = !showArchived;
    setShowArchived(next);
    Animated.spring(toggleAnim, {
      toValue:         next ? 1 : 0,
      useNativeDriver: false,
      friction:        6,
      tension:         80,
    }).start();
    await saveShowArchived(next);
  };

  const toggleBg = toggleAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [theme.border, theme.primary],
  });
  const knobTranslate = toggleAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [2, 20],
  });

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* ── Color scheme ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Color Scheme</Text>
          <View style={styles.themeGrid}>
            {ThemeKeys.map((key) => {
              const isActive = themeKey === key;
              return (
                <Pressable
                  key={key}
                  style={[styles.themeOption, isActive && styles.themeOptionActive]}
                  onPress={() => setTheme(key)}
                  accessibilityRole="button"
                  accessibilityLabel={`${ThemeNames[key]} theme${isActive ? ', selected' : ''}`}
                >
                  <View
                    style={[
                      styles.themeSwatch,
                      { backgroundColor: Themes[key].primary },
                    ]}
                  />
                  <Text style={[styles.themeLabel, isActive && styles.themeLabelActive]}>
                    {ThemeNames[key]}
                  </Text>
                  {isActive && (
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={theme.primary}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Font style ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Font Style</Text>
          <View style={styles.themeGrid}>
            {FontPresetKeys.map((key) => {
              const isActive = fontKey === key;
              const previewFont = FontPresets[key].fontHeading;
              return (
                <Pressable
                  key={key}
                  style={[styles.themeOption, isActive && styles.themeOptionActive]}
                  onPress={() => setFont(key)}
                  accessibilityRole="button"
                  accessibilityLabel={`${FontPresetNames[key]} font${isActive ? ', selected' : ''}`}
                >
                  <Text style={[styles.fontPreview, { fontFamily: previewFont }]}>Aa</Text>
                  <Text style={[styles.themeLabel, isActive && styles.themeLabelActive]}>
                    {FontPresetNames[key]}
                  </Text>
                  {isActive && (
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={theme.primary}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Sort preference ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Default Sort Order</Text>
          <Text style={styles.sectionDesc}>
            Sets the default sort on the Customers screen.
          </Text>
          <View style={styles.sortToggle}>
            {SORT_OPTIONS.map(({ key, label, icon }) => (
              <Pressable
                key={key}
                style={[
                  styles.sortOption,
                  sortPref === key && styles.sortOptionActive,
                ]}
                onPress={() => handleSortChange(key)}
                accessibilityRole="button"
                accessibilityLabel={`Sort by ${label}`}
              >
                <Ionicons
                  name={icon}
                  size={18}
                  color={sortPref === key ? theme.surface : theme.textSecondary}
                />
                <Text
                  style={[
                    styles.sortOptionText,
                    sortPref === key && styles.sortOptionTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ── Archived customers ── */}
        <Pressable
          style={[styles.section, styles.archiveRow]}
          onPress={handleArchiveToggle}
          accessibilityRole="switch"
          accessibilityState={{ checked: showArchived }}
          accessibilityLabel="Show archived customers"
        >
          <View style={styles.archiveLeft}>
            <Ionicons name="archive-outline" size={20} color={theme.textSecondary} />
            <View>
              <Text style={styles.archiveTitle}>Show Archived Customers</Text>
              <Text style={styles.archiveDesc}>Display archived customers in the list</Text>
            </View>
          </View>
          <Animated.View style={[styles.toggle, { backgroundColor: toggleBg }]}>
            <Animated.View style={[styles.toggleKnob, { transform: [{ translateX: knobTranslate }] }]} />
          </Animated.View>
        </Pressable>

        {/* ── Backup & Restore (coming soon) ── */}
        <View style={[styles.section, styles.comingSoonSection]}>
          <View style={styles.comingSoonHeader}>
            <Ionicons name="cloud-upload-outline" size={22} color={theme.textMuted} />
            <Text style={styles.sectionTitle}>Backup &amp; Restore</Text>
          </View>
          <View style={styles.comingSoonBadge}>
            <Text style={styles.comingSoonText}>Coming Soon</Text>
          </View>
          <Text style={styles.sectionDesc}>
            Back up your customer database to {cloudProviderLabel()} and restore
            it anytime — even after reinstalling the app.
          </Text>
        </View>

        {/* ── Square integration (coming soon) ── */}
        <View style={[styles.section, styles.comingSoonSection]}>
          <View style={styles.comingSoonHeader}>
            <Ionicons name="card-outline" size={22} color={theme.textMuted} />
            <Text style={styles.sectionTitle}>Square Invoicing</Text>
          </View>
          <View style={styles.comingSoonBadge}>
            <Text style={styles.comingSoonText}>Coming Soon</Text>
          </View>
          <Text style={styles.sectionDesc}>
            Connect your Square account to send invoices directly to customers
            from their profile.
          </Text>
        </View>

        {/* ── Copyright + version ── */}
        <Text style={styles.copyright}>
          v{APP_VERSION} · © 2026 ArdinGate Studios LLC. All rights reserved.
        </Text>

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
      padding:          18,
      marginBottom:     14,
      shadowColor:     '#000',
      shadowOffset:    { width: 0, height: 1 },
      shadowOpacity:    0.05,
      shadowRadius:      4,
      elevation:          1,
    },
    sectionTitle: {
      fontFamily:   theme.fontHeading,
      fontSize:     FontSize.lg,
      color:        theme.text,
      marginBottom: 12,
    },
    sectionDesc: {
      fontFamily:   theme.fontBody,
      fontSize:     FontSize.sm,
      color:        theme.textMuted,
      lineHeight:   FontSize.sm * 1.6,
      marginBottom: 14,
    },
    themeGrid: {
      flexDirection: 'row',
      flexWrap:      'wrap',
      gap:            10,
    },
    themeOption: {
      width:         '47%',
      flexDirection: 'row',
      alignItems:    'center',
      borderRadius:  12,
      borderWidth:    1,
      borderColor:   theme.border,
      padding:        11,
      gap:             8,
    },
    themeOptionActive: {
      borderColor:     theme.primary,
      backgroundColor: theme.primaryPale,
    },
    themeSwatch: {
      width:        22,
      height:       22,
      borderRadius: 11,
    },
    themeLabel: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   FontSize.sm,
      color:      theme.textSecondary,
      flex:        1,
    },
    themeLabelActive: {
      color: theme.text,
    },
    sortToggle: {
      flexDirection: 'row',
      flexWrap:      'wrap',
      gap:            10,
    },
    sortOption: {
      width:             '47%',
      flexDirection:     'row',
      alignItems:        'center',
      justifyContent:    'center',
      gap:                7,
      paddingVertical:   12,
      borderRadius:      12,
      borderWidth:        1,
      borderColor:       theme.border,
      backgroundColor:   theme.inputBg,
    },
    sortOptionActive: {
      backgroundColor: theme.primary,
      borderColor:     theme.primary,
    },
    sortOptionText: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   FontSize.base,
      color:      theme.textSecondary,
    },
    sortOptionTextActive: {
      color: theme.surface,
    },
    archiveRow: {
      flexDirection:  'row',
      alignItems:     'center',
      justifyContent: 'space-between',
    },
    archiveLeft: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:           12,
      flex:          1,
    },
    archiveTitle: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   FontSize.base,
      color:      theme.text,
    },
    archiveDesc: {
      fontFamily: theme.fontBody,
      fontSize:   FontSize.xs,
      color:      theme.textMuted,
      marginTop:  2,
    },
    toggle: {
      width:        46,
      height:       28,
      borderRadius: 14,
    },
    toggleKnob: {
      position:        'absolute',
      top:              3,
      width:           22,
      height:          22,
      borderRadius:    11,
      backgroundColor: theme.surface,
      shadowColor:     '#000',
      shadowOffset:    { width: 0, height: 1 },
      shadowOpacity:   0.2,
      shadowRadius:    2,
      elevation:       2,
    },
    comingSoonSection: {
      opacity: 0.7,
    },
    comingSoonHeader: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:           10,
      marginBottom:   8,
    },
    comingSoonBadge: {
      alignSelf:         'flex-start',
      backgroundColor:   theme.primaryPale,
      borderRadius:      8,
      paddingVertical:   4,
      paddingHorizontal: 12,
      marginBottom:      10,
    },
    comingSoonText: {
      fontFamily:    theme.fontUiBold,
      fontSize:      FontSize.xs,
      color:         theme.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    fontPreview: {
      fontSize:   FontSize.lg,
      color:      theme.text,
      width:      28,
      textAlign:  'center',
    },
    copyright: {
      fontFamily: theme.fontBody,
      fontSize:   FontSize.xs,
      color:      theme.textMuted,
      textAlign:  'center',
      marginTop:  10,
      paddingBottom: 8,
    },
  });
}
