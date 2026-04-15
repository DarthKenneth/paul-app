# app.json — Version History

**File:** `app.json`
**Project:** Rolodeck (project v0.22)
**Copyright:** © 2026 ArdinGate Studios LLC. All rights reserved.

> JSON does not support inline comments. Version history is tracked here.

## Change Log

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| v1.0 | 2026-04-03 | Claude | Initial Expo config — bundle ID com.ardingate.rolodeck, portrait orientation, adaptive icon with #C6ECEA background, automatic userInterfaceStyle |
| v1.1 | 2026-04-03 | Claude | Bumped expo.version to 1.1.0 — project v1.1 feature release |
| v1.2 | 2026-04-03 | Claude | Bumped expo.version to 1.2.0 — debug/harden/optimize/futureproof release |
| v1.3 | 2026-04-09 | Claude | Added withDarkIcon config plugin to plugins array for iOS 18 dark mode icon support |
| v1.4 | 2026-04-09 | Claude | Expo SDK 55 upgrade — removed withDarkIcon plugin, added ios.icon { any, dark } native dark icon config; expo-font/sharing/web-browser added as plugins; bumped expo.version to 1.11.0 |
| v1.5 | 2026-04-09 | Claude | Bumped expo.version to 1.12.0 — release pipeline infrastructure |
| v1.6 | 2026-04-12 | Claude | Bumped expo.version to 0.20.0 — Square customer sync feature release |
| v1.7 | 2026-04-12 | Claude | Bumped expo.version to 0.21.0 — post-save invoice prompt |
| v1.8 | 2026-04-14 | Claude | Bumped expo.version to 0.22.0; expo install auto-added expo-secure-store and @sentry/react-native to plugins array |
| v1.8.1 | 2026-04-14 | Claude | Added `runtimeVersion: { policy: "appVersion" }` and bumped expo.version to 0.22.1 — Expo Go manifest middleware was crashing on `getRuntimeVersionAsync` fallback when no runtime version was defined |
| v1.8.2 | 2026-04-14 | Claude | Bumped expo.version to 0.22.2 to match `AddServiceModal.js` syntax-error patch |
| v1.8.3 | 2026-04-14 | Claude | Bumped expo.version to 0.22.3 to match the `promise` dependency fix |
| v1.8.4 | 2026-04-14 | Claude | Bumped expo.version to 0.22.4 to match the expo-modules-core `addListener` patch |
| v1.8.5 | 2026-04-14 | Claude | Bumped expo.version to 0.22.5 — Services tab badge fix (refreshAlerts sequencing) |
| v1.8.6 | 2026-04-14 | Claude | Bumped expo.version to 0.22.6 — removed Sentry test button |
