// =============================================================================
// metro.config.js - Metro bundler configuration
// Version: 1.0
// Last Updated: 2026-04-14
//
// PROJECT:      Rolodeck (project v0.22)
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Uses standard Expo metro config (getDefaultConfig)
//   - Sentry source map upload is handled at EAS build time, not here
//
// CHANGE LOG:
// v1.0  2026-04-14  Claude  Replaced getSentryExpoConfig with standard Expo metro
//                           config — getSentryExpoConfig calls
//                           Updates.getRuntimeVersionAsync which does not exist
//                           in the installed expo-updates version, crashing Metro
// =============================================================================

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
