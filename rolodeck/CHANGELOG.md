# Changelog

All notable changes to Rolodeck are documented in this file.

PROJECT TYPE: Mobile app (React Native / Expo managed workflow)
REPO:         local
CREATED:      2026-04-03

---

## [0.25.0] - 2026-04-19

### Added
- **Tap service log entries to view or edit** — every row in a customer's service history is now pressable. Same-day entries open directly in edit mode (for quick fix-ups while still on-site). Older entries open read-only with a pencil icon in the header; tap the pencil to intentionally enter edit mode. Prevents accidentally modifying months-old history while scrolling. From edit mode you can add notes, attach/remove photos, or delete a mistake entry. (`EditServiceModal.js`, `ServiceLogEntry.js`, `CustomerDetailScreen.js`)
- **Tablet / iPad responsive polish** — primary screens (Customers, Customer Detail, Add Customer, Add Service, Services, Settings) now cap their content at 760pt wide and center when running on an iPad or tablet. List items, forms, and the sticky footer no longer stretch edge-to-edge on a 1024pt screen. Phone layouts are unchanged. (`responsive.js` and all primary screens)

### Changed
- `ServiceLogEntry` now accepts an optional `onPress` prop; when provided the row highlights on press and shows a chevron affordance.

### Infrastructure
- New `src/utils/responsive.js` utility: `useIsTablet()` and `useContentContainerStyle()` hooks, `TABLET_BREAKPOINT` and `CONTENT_MAX_WIDTH` constants.

---

## [0.24.2] - 2026-04-18

### Fixed
- **Schedule modal silently showed "no slots" on storage failure** — `refreshSlots` had `try/finally` but no `catch`, so if `getAllCustomers()` threw during slot refresh the error became an unhandled promise rejection and the user just saw an empty slot list. Now catches and alerts the user to retry. (`ScheduleServiceModal.js`)
- **Schedule save crashed if customer prop was missing** — `handleSave` dereferenced `customer.id` with no guard, so a stale or null customer prop would throw instead of alerting the user. (`ScheduleServiceModal.js`)
- **Calendar `minDate` could drift off by a day during fall-back DST** — the millisecond arithmetic `Date.now() + 86400000` advances by exactly 24h in real time, which is only 23h of wall-clock time on the night DST ends; between midnight and 1 AM the "tomorrow or later" floor would resolve to today. Now uses `addDaysLocal(new Date(), 1)`. (`ScheduleServiceModal.js`)
- **`nextWorkDay` returned non-work-day when settings were corrupted** — an empty `workDays` array caused the loop to advance 14 days and hand back whatever day-of-week that landed on. Now returns `fromDate` unchanged in that case. (`scheduleSettings.js`)
- **`isWorkDay` threw on corrupted settings** — called `.includes` on `undefined` if `workDays` was missing from storage. Now returns `false` defensively. (`scheduleSettings.js`)
- **Service interval / last-service date could disagree** — `getLastServiceDate` scanned the log for the max-by-date entry, but `getEffectiveIntervalForCustomer` trusted `log[0]` was newest. Any log-order drift (Square import, manual edit, backup restore) made the two functions point at different entries. Unified both through a single `getLatestServiceEntry` helper. (`serviceAlerts.js`)
- **"Overdue by 1 days" plural bug** in service status label. (`serviceAlerts.js`)
- **Corrupt calendar event-ID map permanently broke sync** — `getEventIds` and `getScheduledEventIds` called `JSON.parse` with no catch, so one bad AsyncStorage write would throw on every subsequent sync attempt. Now returns an empty map on parse failure. (`calendarSync.js`)

---

## [0.24.1] - 2026-04-18

### Fixed
- **Double booking across customers** — conflict detection now checks all customers' scheduled services, not just the current customer's. Previously Paul Bonilla and Keith DuJardin could both be booked at 8:00 AM with no conflict shown. (`ScheduleServiceModal.js`)
- **Install duration not blocking correct time** — the `type` field ('service'|'install') was collected in the schedule modal but never saved to storage, so all existing appointments fell back to the 30-min service duration when calculating conflicts. Installs now correctly block 2.5 hours. (`storage.js`)

---

## [0.24.0] - 2026-04-17

### Added
- **Photos on service notes** — when logging a service (modal and full-screen form) you can attach photos by taking one with the camera or choosing from the photo library. Multiple selection supported (up to 5 at a time). Photos are stored locally on device and displayed as a thumbnail strip on each service log entry; tap any thumbnail to view it full-screen. (`AddServiceModal.js`, `AddServiceScreen.js`, `ServiceLogEntry.js`, `photoUtils.js`)

---

## [0.23.1] - 2026-04-17

### Added
- **Full calendar sync for all scheduled services** — enabling calendar sync (or tapping the retry banner) now pushes every existing scheduled appointment across all customers to the calendar, not just newly created ones. (`calendarSync.js`, `SettingsScreen.js`)

### Fixed
- **Services tab badge not clearing after logging a service** — `CustomersScreen` wasn't receiving `onAlertsRefresh` in its route params, so the callback it forwarded to `CustomerDetailScreen` was always `undefined`. Added `initialParams={{ onAlertsRefresh }}` to the Customers root screen in the stack. (`TabNavigator.js`)
- **Tab bar icons not actually 30px** — `tabBarIconSize` is not a valid React Navigation v6 bottom-tabs option and was silently ignored. Replaced with hardcoded `size={30}` in the render function. (`TabNavigator.js`)
- **Calendar sync status overwritten by batch loop** — individual `syncScheduledService` calls each wrote their own status record, so a mid-loop failure could be clobbered by a later success. Batch sync now suppresses per-entry writes and owns one accurate final status. (`calendarSync.js`)

### Changed
- **Scheduled service display (Services tab)** — list view and calendar day-panel now show appointment time (e.g. "10:00 AM") and type icon (wrench for Service, house for Install) for each scheduled entry. (`ServicesScreen.js`)
- **Tab bar** — icons increased 25% (24→30px), bottom padding increased 20% (9→11px), bar height adjusted to match. (`TabNavigator.js`)

---

## [0.23.0] - 2026-04-17

### Added
- **Scheduling engine** — appointments now have a type (Service = 30 min, Install = 2.5 hr), a specific time slot, and respect configurable work days (Mon–Fri) and work hours (8am–5pm). Time slots are generated in 30-min increments; booked slots are shown grayed out. (`scheduleSettings.js`, `ScheduleServiceModal.js`)
- **Scheduling Settings screen** — new screen under Settings → Scheduling. Configures work days, work start/end hours, service and install durations, and travel time before/after. All settings auto-save; stepper buttons for all numeric values. (`SchedulingSettingsScreen.js`, `TabNavigator.js`, `SettingsScreen.js`)
- **Timed calendar events for scheduled services** — scheduled service appointments now create timed calendar events (not all-day) with the correct start/end time, appointment type in the title, and travel buffer summary in the notes. (`calendarSync.js`)

### Fixed
- **Double-booking allowed** — conflict detection only blocked work time, not travel buffer windows. Fixed to block `[existStart - travelBefore, existEnd + travelAfter]`. (`scheduleSettings.js`)
- **App icon always showing dark variant** — `ios.icon.any` key in `app.json` is not recognized; correct key is `light`. Renamed so iOS properly switches between light and dark icons based on system appearance. (`app.json`)

### Changed
- **Scheduled service display (Customer detail)** — entries show appointment time and type-specific icon. (`CustomerDetailScreen.js`)
- **iOS icon** — added `tinted` variant pointing to dark icon for iOS 26 tinted mode. Added Android `monochromeImage` (white silhouette on transparent) for Material You themed icons. (`app.json`, `generate-icons.js`)

### Infrastructure
- Expo upgraded from 55.0.13 → 55.0.15; `@react-native-community/netinfo` pinned to compatible version 11.5.2.

---

## [0.22.8] - 2026-04-17

### Fixed
- **Address autofill still not working** — removed the Zippopotam.us zip code lookup entirely. It was interfering with Geoapify autocomplete even after the previous guard. Address autocomplete (Geoapify) is now the only autofill mechanism; selecting a suggestion fills address, city, state, and zip in one shot. (`AddCustomerScreen.js`)
- **Address autofill not working on TestFlight** — `EXPO_PUBLIC_GEOAPIFY_API_KEY` was not reaching EAS builds because `.env` is gitignored. Key added as an EAS project secret so it's injected at build time. (EAS secrets, not a code change)

---

## [0.22.7] - 2026-04-16

### Fixed
- **Zip code was overwriting address autocomplete results** — when Geoapify fills city/state/zip after the user picks a suggestion, the zip field changing used to trigger a Zippopotam.us lookup that could race and overwrite the Geoapify-provided city and state. The zip lookup now only runs when Geoapify is unavailable (no API key). (`AddCustomerScreen.js`)

---

## [0.22.6] - 2026-04-14

### Changed
- Removed temporary Sentry test button — DSN is confirmed set, `Sentry.init` fires on launch, `Sentry.wrap` is on the root component. Sentry is fully wired. (`App.js`)

---

## [0.22.5] - 2026-04-14

### Fixed
- **Services tab badge count not showing** — `refreshAlerts()` was called concurrently with `initStorage()`. On the first launch after V1→V2 storage migration, `getAllCustomers()` read the customer index before the migration finished writing it, getting `[]` and locking `alertCount` at 0 until the next app background/foreground. Fixed by running `refreshAlerts` after `initStorage` completes. Also added `console.warn` logging to the catch block so future storage errors surface in Metro logs instead of silently keeping the badge at 0. (`App.js`)

---

## [0.22.4] - 2026-04-14

### Fixed
- **Runtime crash in Expo Go — `NativeJSLogger.addListener is not a function`** — `expo-modules-core/src/sweet/setUpJsLogger.fx.ts` calls `.addListener` on an optional native module without guarding for the case where the module resolves but has no event-emitter methods (Expo Go registers a stub that lacks them). Patched via `patch-package` to check `typeof addListener === 'function'` before iterating listeners. (`patches/expo-modules-core+55.0.22.patch`)

### Infrastructure
- Added `patch-package` dev-dep and a `postinstall` script so the patch re-applies automatically on `npm install`. (`package.json`)

---

## [0.22.3] - 2026-04-14

### Fixed
- **App crash on launch — missing `promise` module** — `@sentry/react-native`'s error-handler utils `require('promise/setimmediate/done')`, but `promise` was only installed as a nested dep of `react-native` and Metro's resolver couldn't reach it from Sentry's location. Added `promise@8.3.0` as a direct dependency (matched to the version React Native ships). (`package.json`)

---

## [0.22.2] - 2026-04-14

### Fixed
- **Bundle failed with SyntaxError** — `AddServiceModal.js` had an unescaped apostrophe (`customer's profile`) inside a single-quoted string, breaking the Metro bundle with `Unexpected token, expected ","`. Swapped the outer delimiters to double quotes. (`AddServiceModal.js`)

---

## [0.22.1] - 2026-04-14

### Fixed
- **Expo Go manifest crash** — `ExpoGoManifestHandlerMiddleware` was throwing `getRuntimeVersionAsync is not a function` whenever Expo Go requested the manifest, because app.json had no `runtimeVersion` and the middleware's fallback path blew up in the running Metro process. Added an explicit `runtimeVersion: { policy: "appVersion" }` so the expo-updates CLI resolves the version directly and the broken fallback is never invoked. (`app.json`)

---

## [0.22.0] - 2026-04-14

### Added
- **Square credentials via env vars** — `EXPO_PUBLIC_SQUARE_CLIENT_ID`, `EXPO_PUBLIC_SQUARE_LOCATION_ID`, and `EXPO_PUBLIC_SQUARE_ENVIRONMENT` are now read from `.env` at build time. No credentials in source. (`.env.example`, `squarePlaceholder.js`)
- **Sentry crash reporting** — optional opt-in: set `EXPO_PUBLIC_SENTRY_DSN` in `.env` to enable. App initialises Sentry only when DSN is present so there's no extra overhead for builds without it. (`App.js`, `.env.example`)
- **Error boundary** — top-level React error boundary wraps the whole app. Catches uncaught JS errors, reports to Sentry, and shows a "Something went wrong" screen with a Restart button instead of a blank crash. (`ErrorBoundary.js`, `App.js`)
- **Square token expiry detection** — `isSquareConnected()` now checks the stored expiry timestamp. An expired token is cleared immediately and the user is treated as disconnected (prompting re-auth) rather than failing at the first API call. (`squarePlaceholder.js`)

### Changed
- **Square OAuth token moved to expo-secure-store** — token is now stored in the iOS Keychain / Android Keystore instead of plain AsyncStorage. (`squarePlaceholder.js`)
- **Per-customer AsyncStorage keys** — storage migrated from a single `@rolodeck_customers` envelope to individual `@rolodeck_customer_{id}` keys with a `@rolodeck_customer_index`. Includes an in-memory cache and a write mutex for concurrency safety. Existing data migrates automatically on first launch. (`storage.js`)
- **Customer IDs use `expo-crypto`** — replaced `Math.random()`-based ID generation with cryptographically random bytes for collision resistance. (`storage.js`)
- **Sort default changed to `firstName`** — the default sort on the Customers screen now matches the available sort options (was `'name'` which didn't match any key). (`storage.js`, `CustomersScreen.js`)
- **"Unnamed" label replaced with "No name"** — nameless customers render "No name" in muted italic instead of "Unnamed" so it reads as a placeholder, not a real name. (`CustomerCard.js`)
- **`addServiceEntry` preserves `intervalDays`** — custom interval days set when logging a service are now correctly saved to the entry (was silently dropped). (`storage.js`)
- **Android back button in onboarding** — tapping back during the onboarding walkthrough now prompts "Skip walkthrough?" instead of silently doing nothing. (`OnboardingModal.js`)
- **Services tab badge accessibility** — badge now announces its count to screen readers via `tabBarAccessibilityLabel`. (`TabNavigator.js`)
- **SyncStatusBanner accessibility** — tappable banner states carry an `accessibilityHint`; non-tappable "ok" state uses `role="text"`. (`SyncStatusBanner.js`)
- **Sync merge step is now rollback-safe** — all merge computations happen in memory before any write so a mid-loop failure cannot leave the database in a partially-updated state. (`squareSync.js`)
- **`resolveLowConf` / `resolveConflict` performance** — both now call `getCustomerById()` instead of loading the full customer list to find one record. (`squareSync.js`)
- **`LowConfRoloSide` performance** — each pending-review row now loads only the one Rolodeck customer it needs (`getCustomerById`) instead of fetching the entire list. (`SquareSyncScreen.js`)
- **Backup schema version embedded** — exported backup files now include `storageSchemaVersion` so future restore logic can detect and handle schema mismatches. (`backup.js`)
- **Address autocomplete cancels stale requests** — the Geoapify fetch is now cancelled via `AbortController` when the user types another character before the previous request completes. (`AddCustomerScreen.js`)
- **`zipLookedUp` Set cleared on navigation focus** — the zip-code dedup Set in `CustomerDetailScreen` resets on each screen focus so it doesn't grow across navigation cycles. (`CustomerDetailScreen.js`)
- **Calendar sync error surfaced to user** — if calendar sync fails after logging a service, a non-blocking alert informs the user ("Service saved, but calendar could not be updated") instead of silently swallowing the error. (`AddServiceModal.js`)
- **Invoice-phase close confirmation** — tapping the backdrop or × while in the invoice-entry phase now shows an "Leave without sending invoice?" confirmation so accidental dismissal doesn't silently skip the invoice flow. (`AddServiceModal.js`)
- **Loading spinner on Customers screen** — a centered `ActivityIndicator` renders while customers load instead of showing a blank list. (`CustomersScreen.js`)
- **Dev seed/dedup buttons removed** — removed development-only "Seed" and "De-dup" buttons that shipped in production builds. (`CustomersScreen.js`)

### Fixed
- **`CustomersScreen` crash** — `route` was missing from the component's props destructure but used on line 320 (`route.params?.onAlertsRefresh`), causing a crash when accessed from the Customers tab. (`CustomersScreen.js`)
- **Backup import shape validation** — `importBackup()` now filters out any customer records missing a valid `id` before calling `restoreCustomers()`, so a corrupted record cannot block a full restore. (`backup.js`)

### Security
- Square access token moved from plain AsyncStorage to `expo-secure-store` (encrypted at rest via iOS Keychain / Android Keystore). (`squarePlaceholder.js`)

---

## [0.21.0] - 2026-04-12

### Added
- **Post-save invoice prompt** — after logging a service, a confirmation sheet appears instead of closing immediately. Shows a checkmark, the date and customer name, and two buttons: **Done** (primary teal, closes the modal) and **Send Invoice →** (outlined, transitions to an inline amount entry). The invoice amount view sends via Square and then closes. (`AddServiceModal.js`)

---

## [0.20.0] - 2026-04-12

### Added
- **Square Customer Sync** — full match-and-merge system linking Rolodeck customers to Square. Pulls all Square customers (paginated), classifies them by confidence (ID / email / phone match vs. name-only), and merges Square data into Rolodeck without overwriting existing values. (`squareSync.js`, `squareCustomers.js`, `mergeLogic.js`)
- **7-step sync algorithm** in `squareSync.js`: Fetch → Match → Merge → Confirm (low-confidence) → Create new → Push (user-triggered) → Save metadata.
- **Square Customers API wrapper** (`squareCustomers.js`) — paginated `GET /customers`, `POST /customers`, `PUT /customers/{id}`, `GET /customers/{id}`. 3-attempt retry on 429 rate limit and 15s timeouts.
- **Match & merge logic** (`mergeLogic.js`) — pure functions: `matchCustomers()` (4-priority matching), `mergeSquareIntoRolodeck()` (fill-empty + conflict detection), `mapSquareToRolodeck()`, `mapRolodeckToSquare()`.
- **SquareSyncScreen** — dedicated sync management screen with 5 sections: Sync Status (Sync Now button + last-synced time), Pending Review (LOW_CONF pairs with Link / Keep Separate), Conflicts (per-field Use Square / Use Rolodeck), Sync History log, Push to Square (individual + Push All with confirm).
- **SyncStatusBanner** — lightweight banner on the Customers screen: green (synced), yellow (items need review), red (sync failed), hidden (not connected).
- **Square section in Settings** — replaced "coming soon" placeholder with live rows: Square Account (connect/disconnect), Sync Customers Now, Manage Sync / Review Conflicts (→ SquareSyncScreen), Auto-Sync on Open toggle. (`SettingsScreen.js`)
- **Customer schema additions** — `squareCustomerId`, `squareSyncedAt`, `squareSyncStatus`, `squareConflictData`, and `notes` fields added to every customer record. Existing records receive null/empty defaults automatically on load. (`storage.js`)
- **Sync metadata storage** — `getSquareSyncMetadata()` / `saveSquareSyncMetadata()` store last-sync timestamp, per-sync summary log (last 50 entries), and pending low-confidence review queue. `getSquareAutoSync()` / `saveSquareAutoSync()` for the auto-sync toggle. (`storage.js`)

### Changed
- **Square OAuth scopes** now include `CUSTOMERS_WRITE` (was missing; required for pushing local customers to Square). (`squarePlaceholder.js`)
- `SQUARE_API_BASE` is now an exported constant from `squarePlaceholder.js` so `squareCustomers.js` uses the same sandbox/production URL without duplicating the environment logic.

---

## [0.19.0] - 2026-04-10

### Added
- **Stone theme** — neutral cool-grey palette with a slate-blue primary and warm amber accent. Good middle ground between the warm Classic and the colored themes. (colors.js)
- **Ember theme** — dark warm theme with deep charcoal-brown background, amber/orange primary, and pink-red accent. Second dark option alongside Midnight. (colors.js)

---

## [0.18.0] - 2026-04-10

### Added
- **AsyncStorage envelope + migration runner.** Customer data is now stored in a `{ schemaVersion, customers: [] }` envelope so the version travels with the data. Legacy raw-array installs auto-migrate on next load. Future schema changes just need a new entry in `MIGRATIONS` and a bump to `CURRENT_SCHEMA_VERSION`. Downgrade-protection prevents older builds from clobbering newer data. (storage.js)
- **Calendar sync status banner.** When calendar sync is enabled but the last sync failed (permission revoked or other error), a warning banner under the Calendar Sync toggle in Settings shows the reason and lets the user tap to retry. (SettingsScreen.js, calendarSync.js)
- **Timezone-safe date utilities** (`src/utils/dateUtils.js`). Local-calendar day helpers replace the scattered `toISOString().split('T')[0]` calls that were returning UTC dates — scheduled customers now show up on the calendar day the user actually picked, regardless of their timezone. DST-safe `addDaysLocal` used for due-date computation.
- **Shared `appVersion.js` module** — single source of truth for the app version, imported by both SettingsScreen (footer display) and backup.js (backup metadata). Both used to hardcode the version and drift out of sync.

### Changed
- **Geoapify API key moved out of source** — now loaded from `.env` via `EXPO_PUBLIC_GEOAPIFY_API_KEY`, bundled at build time by Expo. Restrict the key in the Geoapify dashboard to your bundle ID for defense-in-depth. (placesConfig.js, .env.example)
- **Service tab badge semantics clarified** — the failing test was counting "overdue + 30-day window" but the code only counted overdue. Per user preference, the badge now only counts overdue services; test updated to match. (serviceAlerts.test.js)
- **`makeStyles(theme)` memoized** across all 13 screens and components that use the pattern (`useMemo(() => makeStyles(theme), [theme])`). Small perf win — styles object is no longer re-allocated on every render.

### Fixed
- **backup.js `APP_VERSION` was hardcoded as `'1.6'`** — stale by 10+ versions, so backup metadata was lying. Now imports from shared `appVersion.js`. (backup.js)
- **Calendar sync errors were swallowed silently** — `enableCalendarSync`, `syncCustomerDueDate`, `syncAllCustomers`, `removeCustomerEvent` now write a status record that Settings reads to show the user when sync is broken. (calendarSync.js)

### Infrastructure
- Root `.gitignore` added at repo root for `.DS_Store` and editor crap. The rolodeck subfolder had one but the parent didn't.

---

## [0.17.0] - 2026-04-10

### Changed
- Calendar day panel now distinguishes scheduled services from due-date matches. Scheduled customers render with the blue "Scheduled" styling (matching the list view's Scheduled section) plus their notes; due-date customers keep urgency-colored styling. When a customer is both scheduled and due on the same day, the scheduled entry takes priority. (ServicesScreen.js)
- Day panel title dropped the "Due" prefix (it was misleading when the day also contained scheduled entries). Empty-state copy updated: "Nothing on this date." / "Tap a date to see who's due or scheduled." (ServicesScreen.js)
- Calendar month navigation arrows redesigned — larger Ionicons chevrons inside a primaryPale-filled circle. The default tiny arrows were easy to miss; new buttons are clearly tappable. (ServicesScreen.js)

---

## [0.16.0] - 2026-04-10

### Added
- Smooth tab swap animation — each tab's content fades in and slides from the right over 220ms when switched, so tab changes feel like the stack push animation instead of an instant swap. (TabNavigator.js)

### Fixed
- Phantom "Customer" back button on the Customers list is gone. The root Customers screen now explicitly has no header back button, regardless of the underlying stack state. (TabNavigator.js)
- GO_BACK console errors after cross-tab navigation. CustomerDetail, AddCustomer, and AddService now guard `goBack()` with a `canGoBack()` check and fall back to resetting the stack to the Customers root — previously these could throw `"action 'GO_BACK' was not handled by any navigator"` when the stack only had one screen. (CustomerDetailScreen.js, AddCustomerScreen.js, AddServiceScreen.js)

---

## [0.15.1] - 2026-04-10

### Fixed
- Back button on CustomerDetail now correctly returns to ServicesTab when navigated from the Services screen — previously `goBack()` always went to CustomersScreen regardless of origin. (CustomerDetailScreen.js, ServicesScreen.js)
- Tapping a bottom tab now always resets that tab's navigation stack to its root screen — switching away and back no longer leaves CustomerDetail open with a stale "Services" back label. (TabNavigator.js)

---

## [0.15.0] - 2026-04-10

### Added
- Schedule Service button on every customer card — opens a bottom-sheet modal with the same MM/DD/YYYY date picker and calendar picker as Add Service, restricted to tomorrow and forward. Uses blue throughout.
- Scheduled section at the top of the Services list — shows all upcoming scheduled appointments, sorted soonest first, in blue.

---

## [0.14.1] - 2026-04-10

### Infrastructure
- Versioning scheme normalized to 0.x pre-release (was 1.x). Adopted 0.14.1 continuing from 1.14.1; prior history entries remain as-is.

---

## [1.14.1] - 2026-04-10

### Changed
- "Later" section color on Services screen changed from teal to green across all themes (freeing teal/blue for future use).

### Fixed
- Add Service date picker now restricts to past and today — future dates are grayed out in the calendar and rejected on save.

---

## [1.14] - 2026-04-09

### Added
- Default Service Interval setting — a new card in Settings (below Default Sort
  Order) navigates to a dedicated screen with options: 30 Days, 60 Days, 90 Days,
  6 Months, 1 Year, and Custom. Selection persists to AsyncStorage.
- Custom interval mode — when "Custom" is selected, a day-count input appears in
  the Add Service screen when logging a new service. That count is stored on the
  service entry and used as that customer's due date until a new service is logged.
- Interval-aware due dates — switching from Custom back to a preset takes effect
  on the next logged service; the customer's existing due date remains until then.

### Changed
- Service due dates, alert buckets, calendar sync events, and the overdue badge
  count all now respect the configured interval (previously hardcoded to 365 days).
- Font presets renamed and differentiated across two axes: serif (Editorial vs.
  Refined) and sans (Geometric vs. Rounded). Editorial uses Playfair Display 700 Bold
  (dramatic, high-contrast) + Inter body; Refined uses DM Serif Display (graceful,
  airy) + DM Sans body; Geometric is all-Inter (tight, neutral); Rounded is all-DM
  Sans (wider spacing, softer).

---

## [1.13] - 2026-04-09

### Added
- First-launch onboarding walkthrough — 5-slide modal shown once on install,
  covering the app's core workflow (customers → services → follow-ups). Dismissed
  via "Get Started" or "Skip". Completion state persisted to AsyncStorage so it
  never shows again after the first run.
- Theme screen — color scheme and font style pickers moved to a dedicated screen
  pushed from Settings, accessible via the new "Theme" row in the Appearance card.

### Changed
- Settings screen restructured: Color scheme and font pickers extracted to ThemeScreen;
  Theme nav row, Show Archived Customers toggle, and Calendar Sync toggle now grouped
  in a single "Appearance" card positioned between Default Sort Order and Square
  Invoicing; Backup & Restore moved to last position above copyright.

---

## [1.12] - 2026-04-09

### Infrastructure
- Added `eas.json` — EAS build + submit config for production (iOS App Store +
  Google Play) and preview (internal distribution) profiles; `autoIncrement: true`
  so build numbers and version codes are managed automatically per release
- Added `.github/workflows/release.yml` — push a tag like `git tag v1.12 && git push --tags`
  (or trigger manually from GitHub Actions) to build iOS + Android and submit
  to both stores simultaneously via EAS cloud
- Added `.github/workflows/ci.yml` — runs tests on every push to main and on PRs
- Added `npm run release` / `build:ios` / `build:android` / `submit` / `preview` scripts
- Added `.env.example` documenting EAS and Apple/Android credential setup

---

## [1.11] - 2026-04-09

### Changed
- Upgraded Expo SDK from 51 to 55 (React Native 0.74 → 0.83, React 18 → 19,
  all peer dependencies aligned via `npx expo install --fix`)
- Dark mode iOS icon now handled natively via `ios.icon: { any, dark }` in
  `app.json` (Expo SDK 52+ feature) — `plugins/withDarkIcon.js` removed

### Infrastructure
- Removed `plugins/withDarkIcon.js` (superseded by Expo SDK 55 native support)
- Added `expo-font`, `expo-sharing`, `expo-web-browser` as explicit plugins
  (auto-added by `expo install --fix` for SDK 55 compatibility)

---

## [1.10] - 2026-04-09

### Added
- Dark mode app icon: iOS automatically shows a dark-themed icon when the
  device is in dark mode. Designed to match the light icon's composition with
  a deep teal/near-black palette (`icon-dark.svg`)
- `plugins/withDarkIcon.js` — Expo config plugin that wires `icon-dark.png`
  into the iOS `AppIcon.appiconset` during `expo prebuild`

### Infrastructure
- `scripts/generate-icons.js` updated to also generate `icon-dark.png` from
  `store-assets/icon-dark.svg`

---

## [1.9] - 2026-04-06

### Changed
- Calendar Sync now works properly on Android: the Rolodeck calendar is created
  under the user's Google account source (syncs to Google Calendar automatically)
  instead of a non-syncing local calendar; falls back to any writable calendar
  source if no Google account is found on the device
- Permission-denied alert now gives platform-specific navigation instructions
  (iOS: Settings > Privacy & Security > Calendars;
   Android: Settings > Apps > Rolodeck > Permissions > Calendar)

### Infrastructure
- Added `expo-calendar` plugin config to `app.json` for the iOS calendar
  permission description string used in the system prompt
- Added `READ_CALENDAR` and `WRITE_CALENDAR` to Android permissions in `app.json`

---

## [1.8] - 2026-04-06

### Added
- Calendar Sync toggle in Settings (below Backup & Restore) — one-way push of
  service due dates to Apple Calendar (iCloud synced on iOS automatically)
- `calendarSync.js` utility: creates a dedicated "Rolodeck" calendar on first
  enable, upserts all-day events for each customer's due date with address,
  phone, and email in the event notes, and a 1-day-before alarm
- Auto-sync on service log: whenever a service entry is saved, the customer's
  due-date calendar event is updated automatically (fire-and-forget)
- `removeCustomerEvent()` in calendarSync.js for future archive/delete integration
- `expo-calendar ~13.0.5` dependency added

---

## [1.7] - 2026-04-06

### Added
- Calendar view on the Services tab — toggle between the existing list and a monthly
  calendar showing each customer's upcoming due date as a colored dot (red = overdue,
  orange = due within 30 days, rust = due within 90 days, teal = later)
- Tapping a date on the calendar reveals a panel listing all customers due on that
  day, each tappable to navigate to their detail page
- Installed `react-native-calendars` dependency

---

## [1.6] - 2026-04-04

### Added
- Backup & Restore framework: `exportBackup()` serializes all customer data to
  a JSON file and opens the OS share sheet — iOS routes to iCloud Drive via
  "Save to Files", Android routes to Google Drive or local Files
- `importBackup()` opens the OS file picker (supports iCloud Drive on iOS,
  Google Drive on Android), validates the backup format, and restores customers
- `restoreCustomers()` added to `storage.js` for atomic bulk restore
- `expo-file-system`, `expo-sharing`, `expo-document-picker` dependencies added
- Backup & Restore section added to Settings (Coming Soon)

---

## [1.5] - 2026-04-04

### Infrastructure
- Square OAuth flow now uses PKCE (RFC 7636) — the token exchange happens
  directly between the app and Square with no backend server required
- Added `expo-crypto` dependency for SHA-256 code challenge generation
- Removed Vercel backend (`api/square/token.js`), `vercel.json`, and
  `.env.example` — no longer needed

---

## [1.4] - 2026-04-04

### Infrastructure
- Vercel serverless backend added (`api/square/token.js`) — handles OAuth code
  exchange so the Square client_secret never lives in the app
- `vercel.json` at repo root configures Node 20 runtime for all `api/**` functions
- `.env.example` documents required env vars (`SQUARE_CLIENT_ID`,
  `SQUARE_CLIENT_SECRET`, `SQUARE_ENVIRONMENT`)
- `squarePlaceholder.js` updated: sandbox/production mode flag with dynamic base
  URL selection; `locationId` moved into `SQUARE_CONFIG` (no longer a function
  argument); `backendTokenUrl` now points to the Vercel endpoint pattern

---

## [1.3] - 2026-04-03

### Infrastructure
- CHANGELOG bootstrapped retroactively from git history. Version scheme normalized: `[1.0]`–`[1.2]` entries above describe work done under the initial `v1.3` git commit; `[1.4]` onward follows the standard versioning rules.

---

## [1.2] - 2026-04-03

### Fixed
- App version in Settings displayed "1.0.0" instead of actual version (was hardcoded)
- `useFocusEffect` in Customer Detail passed async function directly, which React
  warns about — now uses proper callback + cleanup pattern
- Date validation in Add Service accepted impossible dates (e.g. month 13, Feb 30)
  because `Date` constructor silently overflows — now uses strict regex + round-trip check
- Settings sort toggle only showed Name/Zip but Customers screen supported 4 options —
  now both screens show all 4: Name, Address, Zip Code, Email
- Memory leak in Settings screen: `useEffect` could call setState after unmount —
  added cleanup flag

### Changed
- All storage operations across every screen are now wrapped in try/catch with
  user-facing error alerts (previously unhandled rejections would crash the app)
- All save/submit buttons have double-tap protection via `saving` state + `disabled` prop
- Customer Detail shows a loading spinner while fetching data (was blank flash)
- Customer Card badge text constrained with `maxWidth` to prevent overflow on long labels
- Input fields trimmed on save in Add Customer form
- `CustomerCard` and `ServiceLogEntry` wrapped with `React.memo` to reduce unnecessary
  FlatList re-renders
- Customer list filtering + sorting memoized with `useMemo`
- `storage.js` `loadCustomers()` handles corrupted JSON gracefully (returns `[]`)
  and ensures every loaded customer has a `serviceLog` array
- Improved ID generation with better entropy (8-byte hex + timestamp + counter)

### Added
- Schema version tracking in AsyncStorage (`@rolodeck_schema_version`) with
  `initStorage()` and migration hook for future data migrations
- Adversarial test suite: 158 tests covering serviceAlerts.js, storage.js, and
  date validation — boundary conditions, corrupted data, unicode, overflow dates,
  massive datasets, rapid concurrent writes
- Jest + babel-jest dev dependencies and `npm test` script
- `babel.config.js` (required by Jest transform)

---

## [1.1] - 2026-04-03

### Added
- Services screen now groups customers into automatic due-window sections:
  Overdue / Next 30 Days / Next 31–60 Days / Next 61–90 Days / Later
- Each service row shows customer name, last service date, and status label
- Section headers color-coded by urgency (red → amber → rust → green)
- `groupCustomersByDueWindow()` pure utility function in serviceAlerts.js

### Changed
- Services screen redesigned from flat filter-chip list to section-based SectionList
  (filter chips removed; sections replace them and always show all customers)
- Customer sort options expanded to 4 ways: name, address, zip code, email
  (previously: name and zip only)
- Add Customer button moved to top of Customers screen (was a FAB)
- Customer detail layout: info → divider → service log → sticky "Add a Service" footer
- Service log: newest entry at top; oldest entry labeled "Initial Install/Service"
- Add Service form: date + notes only (type toggle removed)

### Fixed
- Service log entry label now correctly shows "Initial Install/Service" for the
  chronologically oldest entry per customer

---

## [1.0] - 2026-04-03

### Added
- Initial project scaffold — Expo managed workflow (~51), React Navigation v6
- Customer database with add, edit, delete (name, email, phone, address, zip code)
- Service log per customer: date, type (service/install), notes; newest first
- Annual service reminders: overdue badge on Services tab + 30/60/90-day filter windows
- Customer list screen with live search and sort by name or zip code
- Customer detail screen: editable info card + full service log list
- Add Customer form with field validation (name required)
- Add Service Entry form: type toggle (Service/Install), date input, notes field
- Services screen with filter buttons: Overdue / 30 Days / 60 Days / 90 Days / All
- Settings screen: color theme picker, sort preference toggle, Square token field,
  app version display
- Four color themes: Rolodeck Classic (teal/rust/cream), Ocean Blue, Forest Green,
  Midnight (dark)
- Theme persistence via AsyncStorage; loads saved theme on app start
- Sort preference persistence via AsyncStorage
- AsyncStorage data layer: full CRUD for customers and service log entries
- Pure service-alert utilities: overdue detection, due-window filtering, badge counts
- Square invoice integration placeholder (InvoiceButton UI + squarePlaceholder.js stub
  with full API implementation guide in comments)
- App icon: SVG master source at store-assets/icon.svg
- Brand preview HTML page: store-assets/icon-preview.html
- iOS App Store copy: description, keywords, screenshot spec, privacy policy
- Android Google Play copy: description, short description, keywords,
  content rating questionnaire
- Version history headers on all source files (per project CLAUDE.md convention)
