# Changelog

All notable changes to Rolodeck are documented in this file.

PROJECT TYPE: Mobile app (React Native / Expo managed workflow)
REPO:         local
CREATED:      2026-04-03

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
