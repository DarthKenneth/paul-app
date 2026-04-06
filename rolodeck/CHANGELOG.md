# Changelog

All notable changes to Rolodeck are documented in this file.

PROJECT TYPE: Mobile app (React Native / Expo managed workflow)
REPO:         local
CREATED:      2026-04-03

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
