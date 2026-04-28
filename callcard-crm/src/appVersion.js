// =============================================================================
// appVersion.js - Single source of truth for APP_VERSION used in UI and metadata
// Version: 1.0
// Last Updated: 2026-04-10
//
// PROJECT:      Rolodeck (project v0.18)
// FILES:        appVersion.js             (this file — exports APP_VERSION)
//               package.json              (version field — pulled at import time)
//               SettingsScreen.js         (displays APP_VERSION in footer)
//               backup.js                 (writes APP_VERSION into backup metadata)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Reads version from package.json (which is kept in sync with /VERSION per
//     the CLAUDE.md version history protocol)
//   - Strips trailing ".0" so minors display as "0.18" instead of "0.18.0" —
//     matches the project convention (no .0 on minor versions)
//   - Any place in the app that needs the current version should import from
//     here, not hardcode or re-derive from package.json
//
// CHANGE LOG:
// v1.0  2026-04-10  Claude  Extracted from SettingsScreen.js as shared module
//                            so backup.js and any future caller stop drifting
//                            out of sync (backup.js had stale '1.6' hardcoded)
// =============================================================================

import pkg from '../package.json';

/**
 * Current app version, formatted for display.
 * Reads from package.json so it auto-updates when the project version is bumped.
 * Strips trailing ".0" for minor versions (e.g. "0.18.0" → "0.18").
 */
export const APP_VERSION = pkg.version.replace(/\.0$/, '');
