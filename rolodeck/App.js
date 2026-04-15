// =============================================================================
// App.js - Root application entry point
// Version: 1.6
// Last Updated: 2026-04-14
//
// PROJECT:      Rolodeck (project v0.22.5)
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
import { View, ActivityIndicator, AppState, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
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

import { ThemeProvider, useTheme } from './src/styles/theme';
import TabNavigator from './src/components/TabNavigator';
import OnboardingModal from './src/components/OnboardingModal';
import ErrorBoundary from './src/components/ErrorBoundary';
import {
  getAllCustomers,
  initStorage,
  getOnboardingComplete,
  setOnboardingComplete,
  getServiceIntervalMode,
  getServiceIntervalCustomDays,
  modeToIntervalDays,
} from './src/data/storage';
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
// Classic theme primary so the spinner looks intentional on any theme.
const SPLASH_PRIMARY = '#4AACA5';
const SPLASH_BG      = '#F5F0E8';

// ── Inner component: has ThemeContext access ───────────────────────────────────

function AppInner() {
  const { themeKey } = useTheme();
  const [alertCount, setAlertCount]       = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const appState = useRef(AppState.currentState);

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
      .then(() => refreshAlerts());
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

  const isDark = themeKey === 'midnight';

  return (
    <NavigationContainer>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <TabNavigator alertCount={alertCount} onAlertsRefresh={refreshAlerts} />
      <OnboardingModal visible={showOnboarding} onComplete={handleOnboardingComplete} />
    </NavigationContainer>
  );
}

// ── Root component: font loading + ThemeProvider ───────────────────────────────

export default Sentry.wrap(function App() {
  const [fontsLoaded] = useFonts({
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
        <AppInner />
      </ThemeProvider>
    </ErrorBoundary>
  );
});

const styles = StyleSheet.create({
  splash: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: SPLASH_BG,
  },
});
