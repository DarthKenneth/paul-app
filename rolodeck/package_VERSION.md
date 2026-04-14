# package.json — Version History

**File:** `package.json`
**Project:** Rolodeck (project v0.22)
**Copyright:** © 2026 ArdinGate Studios LLC. All rights reserved.

> JSON does not support inline comments. Version history is tracked here.

## Change Log

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| v1.0 | 2026-04-03 | Claude | Initial scaffold — Expo 51 managed workflow, React Navigation v6 (stack + bottom tabs), AsyncStorage 1.23.1, DM Serif Display + DM Sans Google Fonts, @expo/vector-icons (Ionicons), react-native-gesture-handler |
| v1.0.1 | 2026-04-03 | Claude | Added sharp ^0.33.0 to devDependencies and `icons` script (node scripts/generate-icons.js) — makes icon.svg the SVG source of truth for all PNG exports |
| v1.1   | 2026-04-03 | Claude | Bumped version to 1.1.0 — project v1.1 feature release |
| v1.2   | 2026-04-03 | Claude | Bumped version to 1.2.0, added jest + babel-jest + test script, added Jest config — debug/harden/optimize/futureproof release |
| v1.3   | 2026-04-09 | Claude | Bumped version to 1.10.0 — dark icon feature release |
| v1.4   | 2026-04-09 | Claude | Expo SDK 55 upgrade — expo ~55.0.13, react 19.2.0, react-native 0.83.4, all peer deps aligned via npx expo install --fix; bumped version to 1.11.0 |
| v1.5   | 2026-04-09 | Claude | Added release/build/submit/preview scripts (eas-cli); bumped version to 1.12.0 |
| v1.6   | 2026-04-12 | Claude | Bumped version to 0.20.0 — Square customer sync feature release |
| v1.7   | 2026-04-12 | Claude | Bumped version to 0.21.0 — post-save invoice prompt |
| v1.8   | 2026-04-14 | Claude | Bumped version to 0.22.0; added expo-secure-store ~55.0.13, @sentry/react-native ~8.7.0, @react-native-community/netinfo ~12.0.1 |
| v1.8.1 | 2026-04-14 | Claude | Bumped version to 0.22.1 to match app.json after runtimeVersion fix |
| v1.8.2 | 2026-04-14 | Claude | Bumped version to 0.22.2 to match `AddServiceModal.js` syntax-error patch |
| v1.8.3 | 2026-04-14 | Claude | Added `promise@8.3.0` dependency (required by `@sentry/react-native`); bumped version to 0.22.3 |
| v1.8.4 | 2026-04-14 | Claude | Added `patch-package` dev-dep + `postinstall` script; bumped version to 0.22.4 |
