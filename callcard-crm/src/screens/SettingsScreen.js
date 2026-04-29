// =============================================================================
// SettingsScreen.js - App preferences: sort, appearance, integrations, version
// Version: 2.3.1
// Last Updated: 2026-04-28
//
// PROJECT:      Rolodeck (project v1.5)
// FILES:        SettingsScreen.js         (this file)
//               ThemeScreen.js            (color scheme + font pickers; navigated
//                                          to from the Appearance card's Theme row)
//               ServiceIntervalScreen.js  (interval picker; navigated to from the
//                                          Default Service Interval row)
//               SquareSyncScreen.js       (sync management; navigated to from
//                                          Square Account → Sync Customers row)
//               colors.js                 (Themes, ThemeNames)
//               typography.js             (FontPresetNames, FontSize)
//               storage.js                (getSortPreference, saveSortPreference,
//                                          getServiceIntervalMode,
//                                          getServiceIntervalCustomDays,
//                                          modeToIntervalDays,
//                                          getSquareSyncMetadata,
//                                          getSquareAutoSync, saveSquareAutoSync)
//               squarePlaceholder.js      (isSquareConnected, connectSquare,
//                                          disconnectSquare)
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
//     Appearance card → Square Account → Backup & Restore → copyright
//   - Service Interval row shows current value as subtitle (e.g. "1 Year",
//     "Custom (45 days)"); chevron navigates to ServiceIntervalScreen
//   - Appearance card groups three rows in one surface: Theme (nav to ThemeScreen),
//     Show Archived Customers (toggle), Calendar Sync (toggle)
//   - Theme row shows current color + font as subtitle; chevron navigates to ThemeScreen
//   - Toggle rows share animated spring pattern (toggleAnim / calSyncAnim)
//   - useEffect cleanup prevents state updates on unmounted component
//
// CHANGE LOG:
// v2.1  2026-04-23  Claude  Profession section (nav row to ProfessionSettingsScreen)
//       - Added useProfession(); Profession section after Scheduling shows
//         profession.emoji + name with chevron to ProfessionSettings
//       - Imported useProfession from ProfessionContext
// v2.0.3 2026-04-19  Claude  Tablet width cap on ScrollView content
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
// v2.0.2 2026-04-17  Claude  handleCalSyncRetry: add catch block safety net + null-coalesce
//                             on getCalendarSyncStatus result
// v2.0.1 2026-04-17  Claude  Retry sync now calls syncAll (due dates + scheduled services)
// v2.3.1 2026-04-28  Claude  __DEV__-only seed-data button in Developer section
// v2.3  2026-04-28  Claude  Backup & Restore section — live (replacing coming-soon)
//       - Added exportBackup, importBackup, getLastBackupDate imports from backup.js
//       - Added lastBackupDate, backupBusy, restoreBusy state
//       - Loads lastBackupDate in mount useEffect
//       - handleBackup: calls exportBackup(), refreshes lastBackupDate, shows error alert
//       - handleRestore: Alert confirm → importBackup(), success/error alerts
//       - Replaced Coming Soon card with two pressable rows (Back Up Now, Restore)
//         each with subtitle and activity indicator while busy [updated ARCHITECTURE]
// v2.2  2026-04-25  Claude  Square Account section — live (replacing coming-soon)
//       - Imported isSquareConnected, connectSquare, disconnectSquare from
//         squarePlaceholder.js
//       - Imported getSquareSyncMetadata, getSquareAutoSync, saveSquareAutoSync
//         from storage.js
//       - Added squareConnected, squareConnecting, squareAutoSync, squareSyncMeta
//         state; autoSyncAnim ref
//       - Loads Square connection + auto-sync pref + sync meta in mount useEffect
//       - handleSquareConnect: opens OAuth flow, updates connected state
//       - handleSquareDisconnect: Alert confirm → disconnectSquare, clears state
//       - handleSquareAutoSyncToggle: animated toggle + saveSquareAutoSync
//       - Square section renders connect button (disconnected) or three rows
//         (Sync Customers nav → SquareSync, Auto-sync toggle, Disconnect)
//       - Added connectButton / connectButtonBusy / connectButtonText styles
//         [updated ARCHITECTURE, FILES]
// v2.1  2026-04-23  Claude  Profession section (nav row to ProfessionSettingsScreen)
//       - Added useProfession(); Profession section after Scheduling shows
//         profession.emoji + name with chevron to ProfessionSettings
//       - Imported useProfession from ProfessionContext
// v2.0.3 2026-04-19  Claude  Tablet width cap on ScrollView content
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
// v2.0.2 2026-04-17  Claude  handleCalSyncRetry: add catch block safety net + null-coalesce
//                             on getCalendarSyncStatus result
// v2.0.1 2026-04-17  Claude  Retry sync now calls syncAll (due dates + scheduled services)
// v2.0  2026-04-12  Claude  Reverted Square to coming-soon placeholder
//       - Removed live Square section (state, handlers, imports, JSX)
//       - Replaced with coming-soon card matching Backup & Restore style
//       - Removed squarePlaceholder/squareSync/storage Square imports
//       - Removed squareConnected, squareSyncMeta, squareAutoSync, squareSyncing,
//         squareConnecting state and autoSyncAnim ref [updated ARCHITECTURE]
// v1.9  2026-04-12  Claude  Square section — live rows replacing coming-soon
// =============================================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Animated,
  ActivityIndicator,
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
import { useContentContainerStyle } from '../utils/responsive';
import {
  getSortPreference,
  saveSortPreference,
  getShowArchived,
  saveShowArchived,
  getServiceIntervalMode,
  getServiceIntervalCustomDays,
  modeToIntervalDays,
  getSquareSyncMetadata,
  getSquareAutoSync,
  saveSquareAutoSync,
  addCustomer,
  addServiceEntry,
} from '../data/storage';
import {
  isSquareConnected,
  connectSquare,
  disconnectSquare,
} from '../utils/squarePlaceholder';
import { cloudProviderLabel, exportBackup, importBackup, getLastBackupDate } from '../utils/backup';
import { reportAndShow } from '../utils/errorReporting';
import {
  getCalendarSyncEnabled,
  enableCalendarSync,
  disableCalendarSync,
  getCalendarSyncStatus,
  syncAll,
} from '../utils/calendarSync';
import { APP_VERSION } from '../appVersion';
import { useProfession } from '../contexts/ProfessionContext';
import { SEED_CUSTOMERS } from '../../scripts/seed-data';

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

function formatSyncTime(iso) {
  if (!iso) return null;
  const diffMs  = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1)  return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24)  return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return diffDay === 1 ? 'yesterday' : `${diffDay} days ago`;
}

const SORT_OPTIONS = [
  { key: 'firstName', label: 'First Name', icon: 'person-outline'        },
  { key: 'lastName',  label: 'Last Name',  icon: 'person-circle-outline' },
  { key: 'city',      label: 'City',       icon: 'business-outline'      },
  { key: 'zip',       label: 'Zip Code',   icon: 'map-outline'           },
];

export default function SettingsScreen({ navigation }) {
  const { theme, themeKey, fontKey } = useTheme();
  const { profession } = useProfession();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const widthCap = useContentContainerStyle();

  const [sortPref, setSortPref]               = useState('name');
  const [showArchived, setShowArchived]       = useState(false);
  const [calendarSync, setCalendarSync]       = useState(false);
  const [calSyncStatus, setCalSyncStatus]     = useState(null); // { status, message, at } | null
  const [calSyncBusy, setCalSyncBusy]         = useState(false);
  const [intervalMode, setIntervalMode]       = useState('365');
  const [intervalCustomDays, setIntervalCustomDays] = useState(30);
  const [squareConnected, setSquareConnected]   = useState(false);
  const [squareConnecting, setSquareConnecting] = useState(false);
  const [squareAutoSync, setSquareAutoSync]     = useState(false);
  const [squareSyncMeta, setSquareSyncMeta]     = useState(null);
  const [lastBackupDate, setLastBackupDate]     = useState(null);
  const [backupBusy, setBackupBusy]             = useState(false);
  const [restoreBusy, setRestoreBusy]           = useState(false);
  const [seedBusy, setSeedBusy]                 = useState(false);
  const toggleAnim    = useRef(new Animated.Value(0)).current;
  const calSyncAnim   = useRef(new Animated.Value(0)).current;
  const autoSyncAnim  = useRef(new Animated.Value(0)).current;

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
    isSquareConnected().then((c) => { if (active) setSquareConnected(c); });
    getSquareAutoSync().then((v) => {
      if (active) { setSquareAutoSync(v); autoSyncAnim.setValue(v ? 1 : 0); }
    });
    getSquareSyncMetadata().then((m) => { if (active) setSquareSyncMeta(m); });
    getLastBackupDate().then((d) => { if (active) setLastBackupDate(d); });
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
              ? 'Callcard needs access to your calendar to sync service due dates. Enable it in Settings > Privacy & Security > Calendars.'
              : 'Callcard needs access to your calendar to sync service due dates. Enable it in Settings > Apps > Callcard > Permissions > Calendar.',
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
      await syncAll();
      const status = await getCalendarSyncStatus();
      setCalSyncStatus(status ?? null);
    } catch {
      // syncAll has internal error handling; this catch is a safety net for
      // unexpected throws so the busy spinner always clears
    } finally {
      setCalSyncBusy(false);
    }
  };

  const handleSquareConnect = async () => {
    if (squareConnecting) return;
    setSquareConnecting(true);
    try {
      const token = await connectSquare();
      if (token) {
        setSquareConnected(true);
        const meta = await getSquareSyncMetadata();
        setSquareSyncMeta(meta);
      }
    } catch (e) {
      Alert.alert('Connection Failed', e.message || 'Could not connect to Square. Please try again.');
    } finally {
      setSquareConnecting(false);
    }
  };

  const handleSquareDisconnect = () => {
    Alert.alert(
      'Disconnect Square',
      'This will remove your Square access token. You can reconnect anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await disconnectSquare();
            setSquareConnected(false);
            setSquareSyncMeta(null);
          },
        },
      ],
    );
  };

  const handleSquareAutoSyncToggle = async () => {
    const next = !squareAutoSync;
    setSquareAutoSync(next);
    Animated.spring(autoSyncAnim, { toValue: next ? 1 : 0, useNativeDriver: false, friction: 6, tension: 80 }).start();
    await saveSquareAutoSync(next);
  };

  const handleSeedData = () => {
    Alert.alert(
      'Seed Sample Data',
      `Add ${SEED_CUSTOMERS.length} sample customers for testing? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Seed',
          onPress: async () => {
            setSeedBusy(true);
            try {
              for (const seed of SEED_CUSTOMERS) {
                const { serviceDaysAgo, ...fields } = seed;
                const customer = await addCustomer(fields);
                if (serviceDaysAgo != null) {
                  const date = new Date(Date.now() - serviceDaysAgo * 86400000).toISOString();
                  await addServiceEntry(customer.id, { date, type: 'service', notes: '' });
                }
              }
              Alert.alert('Done', `${SEED_CUSTOMERS.length} sample customers added.`);
            } catch (err) {
              Alert.alert('Seed Failed', err?.message || 'Something went wrong.');
            } finally {
              setSeedBusy(false);
            }
          },
        },
      ],
    );
  };

  const handleBackup = async () => {
    if (backupBusy || restoreBusy) return;
    setBackupBusy(true);
    try {
      await exportBackup();
      const d = await getLastBackupDate();
      setLastBackupDate(d);
    } catch (err) {
      reportAndShow(err, {
        title:    'Backup Failed',
        fallback: 'Could not create the backup file. Please try again.',
        feature:  'backup',
        action:   'export',
      });
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestore = () => {
    if (backupBusy || restoreBusy) return;
    Alert.alert(
      'Restore Backup',
      'This will replace all your current customer data with the selected backup file. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            setRestoreBusy(true);
            try {
              const result = await importBackup();
              if (result) {
                Alert.alert('Restored', `${result.customerCount} customer${result.customerCount === 1 ? '' : 's'} restored successfully.`);
              }
            } catch (err) {
              reportAndShow(err, {
                title:    'Restore Failed',
                fallback: 'Could not read the selected backup file. It may be corrupt or from a newer version of the app.',
                feature:  'backup',
                action:   'import',
              });
            } finally {
              setRestoreBusy(false);
            }
          },
        },
      ],
    );
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
  const autoSyncBg = autoSyncAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [theme.border, theme.primary],
  });
  const autoSyncKnob = autoSyncAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [2, 20],
  });

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={[styles.content, widthCap]}>

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

        {/* ── Scheduling ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scheduling</Text>
          <Pressable
            style={styles.appearanceRow}
            onPress={() => navigation.navigate('SchedulingSettings')}
            accessibilityRole="button"
            accessibilityLabel="Scheduling settings"
          >
            <View style={styles.rowLeft}>
              <Ionicons name="calendar-outline" size={20} color={theme.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Work Days & Hours</Text>
                <Text style={styles.rowDesc}>
                  Work hours, appointment durations, travel time
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
          </Pressable>
        </View>

        {/* ── Profession ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profession</Text>
          <Pressable
            style={styles.appearanceRow}
            onPress={() => navigation.navigate('ProfessionSettings')}
            accessibilityRole="button"
            accessibilityLabel="Profession settings"
          >
            <View style={styles.rowLeft}>
              <Text style={styles.profEmoji}>{profession.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{profession.name}</Text>
                <Text style={styles.rowDesc}>
                  Service types, custom lists, checklist
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

        {/* ── Square Account ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Square Account</Text>

          {squareConnected ? (
            <>
              {/* Sync Customers nav row */}
              <Pressable
                style={styles.appearanceRow}
                onPress={() => navigation.navigate('SquareSync')}
                accessibilityRole="button"
                accessibilityLabel="Sync customers with Square"
              >
                <View style={styles.rowLeft}>
                  <Ionicons name="sync-outline" size={20} color={theme.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>Sync Customers</Text>
                    <Text style={styles.rowDesc}>
                      {squareSyncMeta?.lastSyncAt
                        ? `Last synced ${formatSyncTime(squareSyncMeta.lastSyncAt)}`
                        : 'Never synced'}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
              </Pressable>

              <View style={styles.rowDivider} />

              {/* Auto-sync toggle */}
              <Pressable
                style={styles.appearanceRow}
                onPress={handleSquareAutoSyncToggle}
                accessibilityRole="switch"
                accessibilityState={{ checked: squareAutoSync }}
                accessibilityLabel="Auto-sync customers on app open"
              >
                <View style={styles.rowLeft}>
                  <Ionicons name="repeat-outline" size={20} color={theme.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>Auto-sync on Open</Text>
                    <Text style={styles.rowDesc}>Sync customers each time the app opens</Text>
                  </View>
                </View>
                <Animated.View style={[styles.toggle, { backgroundColor: autoSyncBg }]}>
                  <Animated.View style={[styles.toggleKnob, { transform: [{ translateX: autoSyncKnob }] }]} />
                </Animated.View>
              </Pressable>

              <View style={styles.rowDivider} />

              {/* Disconnect */}
              <Pressable
                style={styles.appearanceRow}
                onPress={handleSquareDisconnect}
                accessibilityRole="button"
                accessibilityLabel="Disconnect Square account"
              >
                <View style={styles.rowLeft}>
                  <Ionicons name="log-out-outline" size={20} color={theme.overdue} />
                  <Text style={[styles.rowTitle, { color: theme.overdue }]}>Disconnect Square</Text>
                </View>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.sectionDesc}>
                Sync customers and send invoices directly through your Square account.
              </Text>
              <Pressable
                style={[styles.connectButton, squareConnecting && styles.connectButtonBusy]}
                onPress={handleSquareConnect}
                disabled={squareConnecting}
                accessibilityRole="button"
                accessibilityLabel="Connect Square account"
              >
                {squareConnecting
                  ? <ActivityIndicator size="small" color={theme.surface} />
                  : <Text style={styles.connectButtonText}>Connect Square Account</Text>}
              </Pressable>
            </>
          )}
        </View>

        {/* ── Backup & Restore ── */}
        <View style={styles.section}>
          <View style={styles.comingSoonHeader}>
            <Ionicons name="cloud-upload-outline" size={22} color={theme.textSecondary} />
            <Text style={styles.sectionTitle}>Backup &amp; Restore</Text>
          </View>
          <Text style={styles.sectionDesc}>
            Save your customer data to {cloudProviderLabel()} and restore it anytime.
          </Text>

          <Pressable
            style={styles.appearanceRow}
            onPress={handleBackup}
            disabled={backupBusy || restoreBusy}
            accessibilityRole="button"
            accessibilityLabel="Back up customer data"
          >
            <View style={styles.rowLeft}>
              <Ionicons name="cloud-upload-outline" size={20} color={theme.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Back Up Now</Text>
                <Text style={styles.rowDesc}>
                  {lastBackupDate
                    ? `Last backed up ${formatSyncTime(lastBackupDate.toISOString())}`
                    : 'Never backed up'}
                </Text>
              </View>
            </View>
            {backupBusy
              ? <ActivityIndicator size="small" color={theme.primary} />
              : <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />}
          </Pressable>

          <View style={styles.rowDivider} />

          <Pressable
            style={styles.appearanceRow}
            onPress={handleRestore}
            disabled={backupBusy || restoreBusy}
            accessibilityRole="button"
            accessibilityLabel="Restore customer data from backup"
          >
            <View style={styles.rowLeft}>
              <Ionicons name="cloud-download-outline" size={20} color={theme.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Restore</Text>
                <Text style={styles.rowDesc}>Replace all data with a backup file</Text>
              </View>
            </View>
            {restoreBusy
              ? <ActivityIndicator size="small" color={theme.primary} />
              : <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />}
          </Pressable>
        </View>

        {/* ── Developer (DEV builds only) ── */}
        {__DEV__ && (
          <View style={[styles.section, styles.devSection]}>
            <Text style={styles.sectionTitle}>Developer</Text>
            <Pressable
              style={styles.appearanceRow}
              onPress={handleSeedData}
              disabled={seedBusy}
              accessibilityRole="button"
              accessibilityLabel="Seed sample customer data"
            >
              <View style={styles.rowLeft}>
                <Ionicons name="flask-outline" size={20} color={theme.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Seed Sample Data</Text>
                  <Text style={styles.rowDesc}>Add {SEED_CUSTOMERS.length} fake customers for testing</Text>
                </View>
              </View>
              {seedBusy
                ? <ActivityIndicator size="small" color={theme.primary} />
                : <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />}
            </Pressable>
          </View>
        )}

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
      fontSize:     theme.fontSize.lg,
      color:        theme.text,
      marginBottom: 12,
    },
    sectionDesc: {
      fontFamily:   theme.fontBody,
      fontSize:     theme.fontSize.sm,
      color:        theme.textMuted,
      lineHeight:   theme.fontSize.sm * 1.6,
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
      fontSize:   theme.fontSize.base,
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
      fontSize:   theme.fontSize.base,
      color:      theme.text,
    },
    rowDesc: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.xs,
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
      fontSize:   theme.fontSize.sm,
      color:      theme.warning,
    },
    syncBannerDesc: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.xs,
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
    // ── Square connect button ──
    connectButton: {
      backgroundColor: theme.primary,
      borderRadius:    12,
      paddingVertical: 13,
      alignItems:      'center',
    },
    connectButtonBusy: {
      opacity: 0.7,
    },
    connectButtonText: {
      fontFamily: theme.fontUiBold,
      fontSize:   theme.fontSize.base,
      color:      theme.surface,
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
      fontSize:      theme.fontSize.xs,
      color:         theme.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    profEmoji: {
      fontSize:   22,
      lineHeight: 26,
    },
    copyright: {
      fontFamily:    theme.fontBody,
      fontSize:      theme.fontSize.xs,
      color:         theme.textMuted,
      textAlign:     'center',
      marginTop:     10,
      paddingBottom: 8,
    },
    devSection: {
      borderWidth:  1,
      borderColor:  theme.warning + '50',
    },
  });
}
