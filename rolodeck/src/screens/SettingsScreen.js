// =============================================================================
// SettingsScreen.js - App preferences: sort, appearance, integrations, version
// Version: 1.8
// Last Updated: 2026-04-10
//
// PROJECT:      Rolodeck (project v0.16)
// FILES:        SettingsScreen.js         (this file)
//               ThemeScreen.js            (color scheme + font pickers; navigated
//                                          to from the Appearance card's Theme row)
//               ServiceIntervalScreen.js  (interval picker; navigated to from the
//                                          Default Service Interval row)
//               colors.js                 (Themes, ThemeNames)
//               typography.js             (FontPresetNames, FontSize)
//               storage.js                (getSortPreference, saveSortPreference,
//                                          getServiceIntervalMode,
//                                          getServiceIntervalCustomDays,
//                                          modeToIntervalDays)
//               calendarSync.js           (getCalendarSyncEnabled, enableCalendarSync,
//                                          disableCalendarSync)
//               theme.js                  (useTheme)
//               appVersion.js             (APP_VERSION — single source of truth,
//                                          derived from package.json)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Layout (top to bottom): Default Sort Order → Default Service Interval →
//     Appearance card → Square Invoicing (coming soon) →
//     Backup & Restore (coming soon) → copyright
//   - Service Interval row shows current value as subtitle (e.g. "1 Year",
//     "Custom (45 days)"); chevron navigates to ServiceIntervalScreen
//   - Appearance card groups three rows in one surface: Theme (nav to ThemeScreen),
//     Show Archived Customers (toggle), Calendar Sync (toggle)
//   - Theme row shows current color + font as subtitle; chevron navigates to ThemeScreen
//   - Toggle rows share animated spring pattern (toggleAnim / calSyncAnim)
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
// v1.5.3  2026-04-09  Claude  Added flex: 1 to inner text View in both toggle rows
//                             to prevent description text clipping behind the toggle
// v1.5.2  2026-04-06  Claude  Added paddingRight: 12 to archiveLeft to prevent
//                             description text from clipping behind the toggle
// v1.5.1  2026-04-06  Claude  Platform-specific calendar permission denied message
//                             (iOS: Settings > Privacy & Security > Calendars;
//                              Android: Settings > Apps > Rolodeck > Permissions)
// v1.5  2026-04-06  Claude  Calendar Sync section
//       - Added Calendar Sync toggle section (below Backup & Restore)
//       - Toggle calls enableCalendarSync (requests permission + initial sync)
//         or disableCalendarSync on change
//       - Permission denial shows an Alert and reverts the toggle
//       - Animated toggle shares same spring animation as archive toggle
//       - calendarSyncAnim / calendarSyncKnob mirrors archive toggle pattern
//       - Imported getCalendarSyncEnabled, enableCalendarSync, disableCalendarSync
//       - Updated APP_VERSION to '1.8'
// v1.6  2026-04-09  Claude  Restructured layout + extracted theme pickers
//       - Color scheme and font style pickers moved to ThemeScreen.js
//       - Appearance card groups Theme nav row + Archive toggle + Calendar toggle
//         in a single surface between Sort Order and Square Invoicing
//       - Backup & Restore moved to last (before copyright)
//       - Added navigation prop; Theme row pushes ThemeScreen onto Settings stack
//       - Updated APP_VERSION to '1.13'
// v1.7  2026-04-09  Claude  Default Service Interval row
//       - Added Default Service Interval card between Sort Order and Appearance
//       - Row shows current interval as subtitle; chevron navigates to
//         ServiceIntervalScreen
//       - Loads intervalMode + intervalCustomDays in useEffect (with active flag)
//       - Refreshes interval display on useFocusEffect (so it updates after
//         returning from ServiceIntervalScreen)
//       - Imported getServiceIntervalMode, getServiceIntervalCustomDays,
//         modeToIntervalDays from storage.js [updated ARCHITECTURE]
//       - Updated APP_VERSION to '1.14'
// v1.7.1 2026-04-10  Claude  Updated APP_VERSION to '0.14.1' (scheme normalized to 0.x pre-release)
// v1.7.2 2026-04-10  Claude  Updated APP_VERSION to '0.16' (covers missing 0.15 and
//                             0.15.1 bumps that weren't logged in prior sessions)
// v1.7.3 2026-04-10  Claude  APP_VERSION now derived from package.json instead of
//                             hardcoded, stripping trailing ".0" — never goes stale
//                             on future bumps [updated ARCHITECTURE dependency]
// v1.7.4 2026-04-10  Claude  APP_VERSION import moved to shared src/appVersion.js
//                             so backup.js (and future callers) share one source
// v1.8  2026-04-10  Claude  Calendar sync status banner
//       - Loads calendar sync status on mount via getCalendarSyncStatus()
//       - Renders a warning banner under the Calendar Sync toggle when sync
//         is enabled AND last sync didn't succeed; distinct copy for
//         'permission-denied' vs generic 'error' states
//       - Tapping the banner calls handleCalSyncRetry which runs syncAllCustomers
//         and refreshes the status
//       - Toggling sync off clears the stale status [updated ARCHITECTURE]
// =============================================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Animated,
  StyleSheet,
  SafeAreaView,
  Alert,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/theme';
import { Themes, ThemeNames } from '../styles/colors';
import { FontPresetNames, FontSize } from '../styles/typography';
import {
  getSortPreference,
  saveSortPreference,
  getShowArchived,
  saveShowArchived,
  getServiceIntervalMode,
  getServiceIntervalCustomDays,
  modeToIntervalDays,
} from '../data/storage';
import { cloudProviderLabel } from '../utils/backup';
import {
  getCalendarSyncEnabled,
  enableCalendarSync,
  disableCalendarSync,
  getCalendarSyncStatus,
  syncAllCustomers,
} from '../utils/calendarSync';
import { APP_VERSION } from '../appVersion';

const INTERVAL_MODE_LABELS = {
  '30':   '30 Days',
  '60':   '60 Days',
  '90':   '90 Days',
  '180':  '6 Months',
  '365':  '1 Year',
  'custom': null, // built dynamically
};

function intervalLabel(mode, customDays) {
  if (mode === 'custom') return `Custom (${customDays} days)`;
  return INTERVAL_MODE_LABELS[mode] || '1 Year';
}

const SORT_OPTIONS = [
  { key: 'firstName', label: 'First Name', icon: 'person-outline'        },
  { key: 'lastName',  label: 'Last Name',  icon: 'person-circle-outline' },
  { key: 'city',      label: 'City',       icon: 'business-outline'      },
  { key: 'zip',       label: 'Zip Code',   icon: 'map-outline'           },
];

export default function SettingsScreen({ navigation }) {
  const { theme, themeKey, fontKey } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [sortPref, setSortPref]               = useState('name');
  const [showArchived, setShowArchived]       = useState(false);
  const [calendarSync, setCalendarSync]       = useState(false);
  const [calSyncStatus, setCalSyncStatus]     = useState(null); // { status, message, at } | null
  const [calSyncBusy, setCalSyncBusy]         = useState(false);
  const [intervalMode, setIntervalMode]       = useState('365');
  const [intervalCustomDays, setIntervalCustomDays] = useState(30);
  const toggleAnim  = useRef(new Animated.Value(0)).current;
  const calSyncAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    getSortPreference().then((p) => { if (active) setSortPref(p); });
    getShowArchived().then((v) => {
      if (active) { setShowArchived(v); toggleAnim.setValue(v ? 1 : 0); }
    });
    getCalendarSyncEnabled().then((v) => {
      if (active) { setCalendarSync(v); calSyncAnim.setValue(v ? 1 : 0); }
    });
    getCalendarSyncStatus().then((s) => {
      if (active) setCalSyncStatus(s);
    });
    return () => { active = false; };
  }, []);

  // Refresh interval display when returning from ServiceIntervalScreen
  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([getServiceIntervalMode(), getServiceIntervalCustomDays()]).then(
        ([m, d]) => { if (active) { setIntervalMode(m); setIntervalCustomDays(d); } },
      );
      return () => { active = false; };
    }, []),
  );

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

  const handleCalendarSyncToggle = async () => {
    if (calSyncBusy) return;
    setCalSyncBusy(true);
    try {
      if (calendarSync) {
        setCalendarSync(false);
        Animated.spring(calSyncAnim, { toValue: 0, useNativeDriver: false, friction: 6, tension: 80 }).start();
        await disableCalendarSync();
        setCalSyncStatus(null);
      } else {
        setCalendarSync(true);
        Animated.spring(calSyncAnim, { toValue: 1, useNativeDriver: false, friction: 6, tension: 80 }).start();
        const granted = await enableCalendarSync();
        if (!granted) {
          setCalendarSync(false);
          Animated.spring(calSyncAnim, { toValue: 0, useNativeDriver: false, friction: 6, tension: 80 }).start();
          Alert.alert(
            'Calendar Access Required',
            Platform.OS === 'ios'
              ? 'Rolodeck needs access to your calendar to sync service due dates. Enable it in Settings > Privacy & Security > Calendars.'
              : 'Rolodeck needs access to your calendar to sync service due dates. Enable it in Settings > Apps > Rolodeck > Permissions > Calendar.',
          );
        }
        setCalSyncStatus(await getCalendarSyncStatus());
      }
    } finally {
      setCalSyncBusy(false);
    }
  };

  // Manual retry — user taps the sync-error banner
  const handleCalSyncRetry = async () => {
    if (calSyncBusy) return;
    setCalSyncBusy(true);
    try {
      await syncAllCustomers();
      setCalSyncStatus(await getCalendarSyncStatus());
    } finally {
      setCalSyncBusy(false);
    }
  };

  const toggleBg = toggleAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [theme.border, theme.primary],
  });
  const knobTranslate = toggleAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [2, 20],
  });
  const calSyncBg = calSyncAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [theme.border, theme.primary],
  });
  const calSyncKnob = calSyncAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [2, 20],
  });

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* ── Default Sort Order ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Default Sort Order</Text>
          <Text style={styles.sectionDesc}>
            Sets the default sort on the Customers screen.
          </Text>
          <View style={styles.sortToggle}>
            {SORT_OPTIONS.map(({ key, label, icon }) => (
              <Pressable
                key={key}
                style={[styles.sortOption, sortPref === key && styles.sortOptionActive]}
                onPress={() => handleSortChange(key)}
                accessibilityRole="button"
                accessibilityLabel={`Sort by ${label}`}
              >
                <Ionicons
                  name={icon}
                  size={18}
                  color={sortPref === key ? theme.surface : theme.textSecondary}
                />
                <Text style={[styles.sortOptionText, sortPref === key && styles.sortOptionTextActive]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ── Default Service Interval ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Default Service Interval</Text>
          <Pressable
            style={styles.appearanceRow}
            onPress={() => navigation.navigate('ServiceInterval')}
            accessibilityRole="button"
            accessibilityLabel="Default service interval settings"
          >
            <View style={styles.rowLeft}>
              <Ionicons name="timer-outline" size={20} color={theme.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Reminder Interval</Text>
                <Text style={styles.rowDesc}>
                  {intervalLabel(intervalMode, intervalCustomDays)}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
          </Pressable>
        </View>

        {/* ── Appearance card (Theme + Archive + Calendar) ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>

          {/* Theme nav row */}
          <Pressable
            style={styles.appearanceRow}
            onPress={() => navigation.navigate('Theme')}
            accessibilityRole="button"
            accessibilityLabel="Theme settings"
          >
            <View style={styles.rowLeft}>
              <Ionicons name="color-palette-outline" size={20} color={theme.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Theme</Text>
                <Text style={styles.rowDesc}>
                  {ThemeNames[themeKey]} · {FontPresetNames[fontKey]}
                </Text>
              </View>
            </View>
            <View style={styles.themeChevron}>
              <View style={[styles.themeDot, { backgroundColor: Themes[themeKey].primary }]} />
              <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
            </View>
          </Pressable>

          <View style={styles.rowDivider} />

          {/* Show archived customers toggle */}
          <Pressable
            style={styles.appearanceRow}
            onPress={handleArchiveToggle}
            accessibilityRole="switch"
            accessibilityState={{ checked: showArchived }}
            accessibilityLabel="Show archived customers"
          >
            <View style={styles.rowLeft}>
              <Ionicons name="archive-outline" size={20} color={theme.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Show Archived Customers</Text>
                <Text style={styles.rowDesc}>Display archived customers in the list</Text>
              </View>
            </View>
            <Animated.View style={[styles.toggle, { backgroundColor: toggleBg }]}>
              <Animated.View style={[styles.toggleKnob, { transform: [{ translateX: knobTranslate }] }]} />
            </Animated.View>
          </Pressable>

          <View style={styles.rowDivider} />

          {/* Calendar sync toggle */}
          <Pressable
            style={styles.appearanceRow}
            onPress={handleCalendarSyncToggle}
            disabled={calSyncBusy}
            accessibilityRole="switch"
            accessibilityState={{ checked: calendarSync }}
            accessibilityLabel="Calendar sync"
          >
            <View style={styles.rowLeft}>
              <Ionicons name="calendar-outline" size={20} color={theme.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Calendar Sync</Text>
                <Text style={styles.rowDesc}>Auto-add service due dates to Apple Calendar</Text>
              </View>
            </View>
            <Animated.View style={[styles.toggle, { backgroundColor: calSyncBg }]}>
              <Animated.View style={[styles.toggleKnob, { transform: [{ translateX: calSyncKnob }] }]} />
            </Animated.View>
          </Pressable>

          {/* Calendar sync error banner — only shown when sync is enabled AND
              the last sync did not succeed. Tap to retry. */}
          {calendarSync && calSyncStatus && calSyncStatus.status !== 'ok' && (
            <Pressable
              style={styles.syncBanner}
              onPress={handleCalSyncRetry}
              disabled={calSyncBusy}
              accessibilityRole="button"
              accessibilityLabel="Calendar sync is offline, tap to retry"
            >
              <Ionicons name="warning-outline" size={18} color={theme.warning} style={styles.syncBannerIcon} />
              <View style={styles.syncBannerBody}>
                <Text style={styles.syncBannerTitle}>
                  {calSyncStatus.status === 'permission-denied'
                    ? 'Calendar access was revoked'
                    : 'Calendar sync is offline'}
                </Text>
                <Text style={styles.syncBannerDesc} numberOfLines={2}>
                  {calSyncStatus.status === 'permission-denied'
                    ? 'Re-enable calendar access in system Settings, then tap to retry.'
                    : calSyncStatus.message || 'Tap to retry the sync.'}
                </Text>
              </View>
              <Ionicons name="refresh-outline" size={18} color={theme.primary} />
            </Pressable>
          )}
        </View>

        {/* ── Square Invoicing (coming soon) ── */}
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
    sectionDesc: {
      fontFamily:   theme.fontBody,
      fontSize:     FontSize.sm,
      color:        theme.textMuted,
      lineHeight:   FontSize.sm * 1.6,
      marginBottom: 14,
    },
    // ── Sort ──
    sortToggle: {
      flexDirection: 'row',
      flexWrap:      'wrap',
      gap:           10,
    },
    sortOption: {
      width:           '47%',
      flexDirection:   'row',
      alignItems:      'center',
      justifyContent:  'center',
      gap:             7,
      paddingVertical: 12,
      borderRadius:    12,
      borderWidth:     1,
      borderColor:     theme.border,
      backgroundColor: theme.inputBg,
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
    // ── Appearance card rows ──
    appearanceRow: {
      flexDirection:  'row',
      alignItems:     'center',
      justifyContent: 'space-between',
      paddingVertical: 6,
    },
    rowLeft: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:           12,
      flex:          1,
      paddingRight:  12,
    },
    rowTitle: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   FontSize.base,
      color:      theme.text,
    },
    rowDesc: {
      fontFamily: theme.fontBody,
      fontSize:   FontSize.xs,
      color:      theme.textMuted,
      marginTop:  2,
    },
    rowDivider: {
      height:          StyleSheet.hairlineWidth,
      backgroundColor: theme.border,
      marginVertical:  12,
    },
    syncBanner: {
      flexDirection:    'row',
      alignItems:       'center',
      backgroundColor:  theme.warning + '18', // ~9% alpha tint
      borderRadius:     10,
      paddingVertical:  10,
      paddingHorizontal: 12,
      marginTop:        10,
      gap:              10,
    },
    syncBannerIcon: {
      marginTop: 1,
    },
    syncBannerBody: {
      flex: 1,
    },
    syncBannerTitle: {
      fontFamily: theme.fontBodyBold,
      fontSize:   FontSize.sm,
      color:      theme.warning,
    },
    syncBannerDesc: {
      fontFamily: theme.fontBody,
      fontSize:   FontSize.xs,
      color:      theme.textSecondary,
      marginTop:  2,
    },
    themeChevron: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:           8,
    },
    themeDot: {
      width:        14,
      height:       14,
      borderRadius: 7,
    },
    // ── Toggle ──
    toggle: {
      width:        46,
      height:       28,
      borderRadius: 14,
    },
    toggleKnob: {
      position:        'absolute',
      top:             3,
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
    // ── Coming soon ──
    comingSoonSection: {
      opacity: 0.7,
    },
    comingSoonHeader: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:           10,
      marginBottom:  8,
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
    copyright: {
      fontFamily:    theme.fontBody,
      fontSize:      FontSize.xs,
      color:         theme.textMuted,
      textAlign:     'center',
      marginTop:     10,
      paddingBottom: 8,
    },
  });
}
