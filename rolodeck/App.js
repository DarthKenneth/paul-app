// =============================================================================
// App.js - Root application entry point
// Version: 2.1
// Last Updated: 2026-04-28
//
// PROJECT:      Rolodeck (project v1.5)
// FILES:        App.js                  (this file — root entry)
//               src/styles/theme.js     (ThemeProvider)
//               src/components/TabNavigator.js   (navigation structure)
//               src/components/OnboardingModal.js (first-launch walkthrough)
//               src/data/storage.js     (getAllCustomers, initStorage,
//                                        getOnboardingComplete, setOnboardingComplete)
//               src/utils/serviceAlerts.js (getAlertBadgeCount)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - App (outer): loads DM Serif Display + DM Sans via @expo-google-fonts,
//     shows ActivityIndicator splash until fonts are ready
//   - AppInner (inner): has access to ThemeContext; sets up NavigationContainer
//     and computes the Services tab badge count from storage
//   - Badge count refreshes on every app focus (via AppState listener) so
//     the Services tab stays current without a full reload
//   - ThemeProvider must wrap NavigationContainer so all navigation screens
//     can call useTheme()
//   - initStorage() called on mount to ensure schema version is set
//   - Alert refresh wrapped in try/catch for storage resilience
//   - Onboarding modal shown once on first launch; dismissed by completing or
//     skipping; flag persisted to AsyncStorage via setOnboardingComplete()
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial scaffold
// v1.1  2026-04-03  Claude  Harden + futureproof
//       - Added initStorage() call on mount (schema version tracking)
//       - Wrapped refreshAlerts in try/catch (storage resilience)
// v1.3  2026-04-09  Claude  Load interval preference in refreshAlerts so badge
//                           count respects the configured service interval
// v1.2  2026-04-09  Claude  First-launch onboarding walkthrough
//       - Added showOnboarding state, checked via getOnboardingComplete on mount
//       - Imported OnboardingModal and rendered it above NavigationContainer
//       - handleOnboardingComplete writes flag then hides modal
// v2.1  2026-04-28  Claude  Silent auto-backup on app open (once per 24h)
//       - Imported autoBackup from src/utils/backup.js
//       - Called autoBackup() fire-and-forget after initStorage in mount useEffect
// v2.0  2026-04-25  Claude  Rustic Trade default theme + Aptos default font
//       - Load Aptos_400Regular, Aptos_600SemiBold, Aptos_700Bold from assets/fonts/
//       - Updated SPLASH_PRIMARY / SPLASH_BG to Rustic Trade light colors
//       - isDark now sourced from ThemeContext instead of local themeKey check
// v1.9  2026-04-25  Claude  Square auto-sync on app open
//       - Imports getSquareAutoSync from storage, isSquareConnected from
//         squarePlaceholder, runSync from squareSync
//       - After initStorage, if auto-sync is enabled and Square is connected,
//         runs runSync() in the background (non-blocking, errors swallowed)
// v1.8  2026-04-24  Claude  Tablet landscape sidebar layout
//       - Added navigationRef + activeTab state tracking via NavigationContainer
//         onStateChange; on tablet landscape AppInner renders sidebar + TabNavigator
//         side-by-side instead of the standard bottom-tab-only layout
//       - TabNavigator gets hideTabs={showSidebar} to suppress the bottom bar
// v1.7  2026-04-23  Claude  Add ProfessionProvider to root tree
//       - Imported ProfessionProvider from src/contexts/ProfessionContext.js
//       - Wrapped AppInner in ProfessionProvider (inside ThemeProvider so theme
//         is available to all screens; profession loaded from AsyncStorage on mount)
// v1.6.1  2026-04-23  Claude  Fix dark-mode flash on tab/screen transitions — pass a
//                             navTheme to NavigationContainer so React Navigation uses
//                             theme.background instead of its default white for scene
//                             containers; also fixed isDark to include ember theme
// v1.6  2026-04-14  Claude  Remove Sentry test button (DSN confirmed, fully wired)
// v1.5  2026-04-14  Claude  Fix badge count not showing on Services tab
//       - Run refreshAlerts after initStorage completes (not concurrently) so
//         V1→V2 migration writes the customer index before getAllCustomers reads
//         it; fixes alertCount=0 on first launch after schema migration
//       - Added console.warn logging to refreshAlerts catch block so storage
//         errors surface in Metro instead of silently keeping badge at 0
// v1.4.1 2026-04-14  Claude  Added temp Sentry test button (floating, remove after verify)
// v1.4  2026-04-14  Claude  Error boundary, Sentry, hardcoded color fixes
//       - Wrapped AppInner in ErrorBoundary (catches render crashes, shows restart)
//       - Initialized @sentry/react-native with EXPO_PUBLIC_SENTRY_DSN env var
//       - Fixed hardcoded splash color '#4AACA5' → theme.primary (via a
//         pre-theme fallback constant matching the Classic theme primary)
//       - Fixed hardcoded splash backgroundColor '#F5F0E8' → same fallback
//       - Removed unused archived field filter mismatch (was c.archived, schema
//         field is archived — confirmed consistent) [updated ARCHITECTURE]
// =============================================================================

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable, ActivityIndicator, AppState, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Sentry from '@sentry/react-native';
import { useFonts } from 'expo-font';
import {
  DMSerifDisplay_400Regular,
} from '@expo-google-fonts/dm-serif-display';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';

const Aptos_400Regular  = require('./assets/fonts/Aptos-Regular.ttf');
const Aptos_600SemiBold = require('./assets/fonts/Aptos-SemiBold.ttf');
const Aptos_700Bold     = require('./assets/fonts/Aptos-Bold.ttf');

import { ThemeProvider, useTheme } from './src/styles/theme';
import { ProfessionProvider } from './src/contexts/ProfessionContext';
import TabNavigator from './src/components/TabNavigator';
import OnboardingModal from './src/components/OnboardingModal';
import ErrorBoundary from './src/components/ErrorBoundary';
import { useSplitLayout, SIDEBAR_WIDTH } from './src/utils/responsive';
import { FontSize } from './src/styles/typography';
import {
  getAllCustomers,
  initStorage,
  getOnboardingComplete,
  setOnboardingComplete,
  getServiceIntervalMode,
  getServiceIntervalCustomDays,
  modeToIntervalDays,
  getSquareAutoSync,
} from './src/data/storage';
import { isSquareConnected } from './src/utils/squarePlaceholder';
import { autoBackup } from './src/utils/backup';
import { runSync } from './src/utils/squareSync';
import { getAlertBadgeCount } from './src/utils/serviceAlerts';

// ── Sentry init ────────────────────────────────────────────────────────────────
// Set EXPO_PUBLIC_SENTRY_DSN in your .env file (see .env.example).
// Leave empty to disable crash reporting (Sentry is a no-op without a DSN).
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn:              SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}

// ── Splash fallback color ─────────────────────────────────────────────────────
// Used only during font load before ThemeProvider is mounted. Matches the
// Rustic Trade light theme so the spinner looks intentional on any theme.
const SPLASH_PRIMARY = '#8B4513';
const SPLASH_BG      = '#FDF0E0';

// ── Inner component: has ThemeContext access ───────────────────────────────────

// ── Tablet sidebar ────────────────────────────────────────────────────────────

const SIDEBAR_TABS = [
  { name: 'CustomersTab', label: 'Customers', icon: 'people',    outline: 'people-outline'    },
  { name: 'ServicesTab',  label: 'Services',  icon: 'construct', outline: 'construct-outline'  },
  { name: 'SettingsTab',  label: 'Settings',  icon: 'settings',  outline: 'settings-outline'   },
];

function TabletSidebar({ navigationRef, activeTab, alertCount, theme }) {
  return (
    <View style={sidebarStyles.sidebar}>
      <View style={sidebarStyles.logoRow}>
        <Text style={[sidebarStyles.logoText, { fontFamily: theme.fontHeading, color: theme.primary }]}>
          Callcard CRM
        </Text>
      </View>
      {SIDEBAR_TABS.map(({ name, label, icon, outline }) => {
        const focused = activeTab === name;
        return (
          <Pressable
            key={name}
            onPress={() => navigationRef.current?.navigate(name)}
            style={({ pressed }) => [
              sidebarStyles.navRow,
              focused && { backgroundColor: theme.primary + '18' },
              pressed && { opacity: 0.75 },
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
          >
            <Ionicons
              name={focused ? icon : outline}
              size={22}
              color={focused ? theme.primary : theme.textMuted}
              style={sidebarStyles.navIcon}
            />
            <Text style={[
              sidebarStyles.navLabel,
              {
                fontFamily: focused ? theme.fontUiMedium : theme.fontUi,
                color: focused ? theme.primary : theme.textSecondary,
              },
            ]}>
              {label}
            </Text>
            {name === 'ServicesTab' && alertCount > 0 && (
              <View style={[sidebarStyles.badge, { backgroundColor: theme.badge }]}>
                <Text style={[sidebarStyles.badgeText, { color: theme.badgeText }]}>
                  {alertCount}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const sidebarStyles = StyleSheet.create({
  sidebar: {
    width:           SIDEBAR_WIDTH,
    backgroundColor: 'transparent',
    borderRightWidth: 1,
    paddingTop:       56,
    paddingHorizontal: 12,
  },
  logoRow: {
    paddingHorizontal: 8,
    paddingBottom:     32,
  },
  logoText: {
    fontSize: 22,
  },
  navRow: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: 12,
    paddingVertical:   13,
    borderRadius:     10,
    marginBottom:      4,
  },
  navIcon: {
    width: 28,
  },
  navLabel: {
    fontSize:   FontSize.base,
    marginLeft:  4,
    flex:        1,
  },
  badge: {
    minWidth:    20,
    height:      20,
    borderRadius: 10,
    alignItems:  'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    fontSize:   10,
    lineHeight: 20,
  },
});

// ── AppInner ──────────────────────────────────────────────────────────────────

function AppInner() {
  const { theme, themeKey, isDark } = useTheme();
  const [alertCount, setAlertCount]       = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [activeTab, setActiveTab]         = useState('CustomersTab');
  const appState     = useRef(AppState.currentState);
  const navigationRef = useRef(null);
  const showSidebar  = useSplitLayout();

  const refreshAlerts = useCallback(async () => {
    try {
      const [customers, mode, customDays] = await Promise.all([
        getAllCustomers(),
        getServiceIntervalMode(),
        getServiceIntervalCustomDays(),
      ]);
      const intervalDays = modeToIntervalDays(mode, customDays);
      setAlertCount(getAlertBadgeCount(customers.filter((c) => !c.archived), intervalDays));
    } catch (err) {
      // Storage read failed — keep stale badge count
      console.warn('[refreshAlerts] storage error, badge count unchanged:', err);
    }
  }, []);

  const handleOnboardingComplete = useCallback(async () => {
    await setOnboardingComplete();
    setShowOnboarding(false);
  }, []);

  useEffect(() => {
    // Run refreshAlerts AFTER initStorage so the V1→V2 migration (which writes
    // the customer index) completes before getAllCustomers reads the index.
    // initStorage is fast on existing V2 installs (~1 AsyncStorage read).
    initStorage()
      .catch(() => {})
      .then(async () => {
        refreshAlerts();
        // Fire-and-forget Square auto-sync if enabled and connected
        try {
          const [autoSync, connected] = await Promise.all([getSquareAutoSync(), isSquareConnected()]);
          if (autoSync && connected) runSync().catch(() => {});
        } catch { /* non-critical — sync will work when user opens SquareSyncScreen */ }
        autoBackup().catch(() => {});
      });
    getOnboardingComplete().then((done) => {
      if (!done) setShowOnboarding(true);
    });

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        refreshAlerts();
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [refreshAlerts]);

  // isDark comes from ThemeContext (handles rustic auto-dark + midnight + ember)

  const navTheme = {
    ...DefaultTheme,
    colors: { ...DefaultTheme.colors, background: theme.background },
  };

  const handleNavStateChange = (state) => {
    if (state?.routes) {
      setActiveTab(state.routes[state.index]?.name ?? 'CustomersTab');
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.surface }]}>
      <NavigationContainer
        ref={navigationRef}
        theme={navTheme}
        onStateChange={handleNavStateChange}
      >
        <StatusBar style={isDark ? 'light' : 'dark'} />
        {showSidebar && (
          <TabletSidebar
            navigationRef={navigationRef}
            activeTab={activeTab}
            alertCount={alertCount}
            theme={theme}
          />
        )}
        <View style={[styles.content, showSidebar && { marginLeft: SIDEBAR_WIDTH, borderLeftWidth: 1, borderLeftColor: theme.border }]}>
          <TabNavigator
            alertCount={alertCount}
            onAlertsRefresh={refreshAlerts}
            hideTabs={showSidebar}
          />
        </View>
      </NavigationContainer>
      <OnboardingModal visible={showOnboarding} onComplete={handleOnboardingComplete} />
    </View>
  );
}

// ── Root component: font loading + ThemeProvider ───────────────────────────────

export default Sentry.wrap(function App() {
  const [fontsLoaded] = useFonts({
    Aptos_400Regular,
    Aptos_600SemiBold,
    Aptos_700Bold,
    DMSerifDisplay_400Regular,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
    PlayfairDisplay_400Regular,
    PlayfairDisplay_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={SPLASH_PRIMARY} />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ProfessionProvider>
          <AppInner />
        </ProfessionProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
});

const styles = StyleSheet.create({
  root: {
    flex:           1,
    flexDirection:  'row',
  },
  content: {
    flex: 1,
  },
  splash: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: SPLASH_BG,
  },
});
