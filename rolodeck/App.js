// =============================================================================
// App.js - Root application entry point
// Version: 1.3
// Last Updated: 2026-04-09
//
// PROJECT:      Rolodeck (project v1.14)
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
// =============================================================================

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, ActivityIndicator, AppState, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
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
    } catch {
      // Storage read failed — keep stale badge count
    }
  }, []);

  const handleOnboardingComplete = useCallback(async () => {
    await setOnboardingComplete();
    setShowOnboarding(false);
  }, []);

  useEffect(() => {
    initStorage().catch(() => {});
    refreshAlerts();
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

export default function App() {
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
        <ActivityIndicator size="large" color="#4AACA5" />
      </View>
    );
  }

  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: '#F5F0E8',
  },
});
