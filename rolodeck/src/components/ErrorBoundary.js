// =============================================================================
// ErrorBoundary.js - React error boundary — catches render errors app-wide
// Version: 1.0
// Last Updated: 2026-04-14
//
// PROJECT:      Rolodeck (project v0.22)
// FILES:        ErrorBoundary.js  (this file — error boundary component)
//               App.js            (wraps AppInner with this boundary)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Class component (required by React — hooks cannot implement
//     componentDidCatch / getDerivedStateFromError)
//   - Catches any render error in the subtree and shows a simple
//     "Something went wrong" screen with a restart button
//   - Reports the error to Sentry (if configured) before showing the UI
//   - Uses RN's DevSettings.reload() on iOS/Android to restart the JS bundle.
//     Expo Go supports this; standalone builds need expo-updates.reloadAsync()
//     as a fallback (imported conditionally to avoid crashing without the module)
//   - Not used for async errors (those must be caught by try/catch in handlers)
//
// CHANGE LOG:
// v1.0  2026-04-14  Claude  Initial implementation
// =============================================================================

import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Report to Sentry if it's been initialized
    try {
      const Sentry = require('@sentry/react-native');
      Sentry.captureException(error, { extra: info });
    } catch {
      // Sentry not available — swallow silently
    }
  }

  handleRestart = () => {
    // Try expo-updates first (standalone builds), fall back to DevSettings
    try {
      const Updates = require('expo-updates');
      if (Updates?.reloadAsync) {
        Updates.reloadAsync();
        return;
      }
    } catch {
      // expo-updates not available
    }

    try {
      const { DevSettings } = require('react-native');
      if (DevSettings?.reload) {
        DevSettings.reload();
        return;
      }
    } catch {
      // DevSettings not available
    }

    // Last resort: reset error state so at least the UI un-freezes
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          The app ran into an unexpected error. Tap below to restart.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={this.handleRestart}
          accessibilityRole="button"
          accessibilityLabel="Restart app"
        >
          <Text style={styles.buttonText}>Restart App</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: 40,
    backgroundColor:   '#F5F0E8',
  },
  title: {
    fontSize:     22,
    fontWeight:   '700',
    color:        '#1A1A1A',
    marginBottom: 12,
    textAlign:    'center',
  },
  body: {
    fontSize:     15,
    color:        '#666',
    textAlign:    'center',
    lineHeight:   22,
    marginBottom: 36,
  },
  button: {
    backgroundColor: '#4AACA5',
    paddingVertical:   14,
    paddingHorizontal: 32,
    borderRadius:      12,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color:      '#fff',
    fontSize:   16,
    fontWeight: '600',
  },
});
