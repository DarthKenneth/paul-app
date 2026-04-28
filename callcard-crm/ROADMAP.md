# Rolodeck — v1 Release Roadmap

---

## Current State (as of v0.29.0, 2026-04-24)

The app is feature-complete and builds cleanly. Pre-release hardening is done. The profession-system architecture originally planned for v2.0 is now shipped end-to-end for Water Treatment. The iPad tablet buildout (Phases A–C) is now complete — landscape sidebar, master-detail split views in Customers + Services, CustomerDetailPane extraction. Remaining tablet polish (Phase D touch targets, Phase E photo lightbox) is optional before v1.0.

- **iOS** — TestFlight build 11 (v0.23.0 shipped); 0.24.x–0.29.x shipped via OTA + builds in flight
- **Android** — Live on Play internal track (released Apr 16)
- **Auto-submit** — GitHub Actions pipeline fully wired; `git tag vX.Y && git push --tags` builds + submits to both stores

---

## Completed ✅

### Release infrastructure
- Sentry crash reporting (DSN in `.env`, root `Sentry.wrap()`, error boundary → Restart screen)
- Apple Developer, Google Play, Expo, EAS CLI — all accounts set up
- `eas init` → Expo project linked; projectId in `app.json`
- App Store Connect listing created (Bundle ID `com.ardingate.rolodeck`, Apple ID `6762417306`)
- Google Play listing created (package `com.ardingate.rolodeck`, content rating complete)
- iOS distribution cert + provisioning profile (managed by EAS, expire Apr 16 2027)
- Android upload keystore (managed by EAS — `p8ESASctpl`)
- EAS env vars: `APPLE_ID`, `ASC_APP_ID`, `APPLE_TEAM_ID`
- Google Play Service Account fully configured (GCP project + Play Console invite + JSON uploaded to EAS)
- Auto-submit `eas.json` config for Android (track: internal)
- First iOS + Android builds shipped; first Android AAB manually uploaded (Google requirement for first-ever submission)
- GitHub Actions release workflow at `.github/workflows/release.yml` — tests → parallel iOS + Android builds → auto-submit both stores, triggered on tag push
- `EXPO_TOKEN` in GitHub Secrets

### Core app features shipped
- Customer database (CRUD, search, sort, archive)
- Service log per customer (date, type, notes)
- Service interval tracking with global preset + per-entry custom interval
- Device calendar sync (due dates + scheduled services)
- Scheduling engine with configurable work days, hours, durations, travel time
- Per-customer + cross-customer conflict detection (v0.24.1)
- Six color themes (Classic, Ocean Blue, Forest Green, Midnight, Stone, Ember)
- Backup / restore via JSON file share/import
- App icons (light + dark mode)
- OTA updates wired (`expo-updates`, `runtimeVersion: appVersion`)
- Square PKCE OAuth flow built (needs live credentials to activate — see Step 2)
- Offline detection
- Storage v2 (per-customer keys, write mutex, in-memory cache)
- Crypto-random customer IDs (`expo-crypto`)
- 38-item release audit (schema migrations, timezone safety, backup hardening, performance)
- `.env` pattern — all credentials out of source
- Services tab badge count (reliable refresh on launch)
- **Service note photo attachments** (v0.24.0) — camera + library picker via `expo-image-picker`; up to 5 photos per entry; URIs stored locally via `photoUtils.savePhotoLocally` in `documentDirectory`
- **In-app camera** (v0.24.0) — same path; captures job-site photos during a service visit
- **Tap-to-edit service log entries** (v0.25.0) — past service/install entries are selectable; edit notes, add/remove photos, or delete a mistake entry directly from the customer detail screen
- **Tablet / iPad responsive polish** (v0.25.0) — primary screens cap content at 760pt and center on tablets (iPad mini through Pro) so forms and lists don't stretch edge-to-edge; phone layouts untouched
- **Dark theme transition flash fix** (v0.25.3) — `NavigationContainer` now themed so Midnight and Ember no longer flash bright white on tab switch

### Profession system (v0.26 – v0.28)

The "Multi-Profession Upgrade" originally scoped for v2.0 landed as an additive series of minor bumps — no schema migration needed, existing data stayed untouched, Water Treatment stayed the default. Architecture is now in place; remaining work is adding more presets + onboarding picker.

- **Infrastructure** (v0.26.0) — `src/data/professions/` registry, `ProfessionContext` provider, `useProfession()` hook, `@rolodeck_profession` AsyncStorage key (defaults to `'water'`)
- **Water Treatment preset wired end-to-end** (v0.27.0) — 4 service types, 3 custom lists, 6-item checklist, 3 equipment fields, 2 entry field dropdowns
- **Profession Settings screens** (v0.27.0) — Settings → Profession → Water Treatment hub; drill-downs for Service Types (duration steppers), Custom Lists (chip editor per list), Service Checklist (visibility toggles)
- **Editable service types + custom types** (v0.28.0) — Service Types screen with eye toggle, trash button, Add Service Type card (name + icon grid + duration stepper); `effectiveServiceTypes` (for pickers) vs `allServiceTypes` (for log lookups) distinction
- **Editable checklist** (v0.28.0) — Add Checklist Item card with label + check/measure type; custom items can be hidden or deleted; Measurement type supports a unit label (e.g. gpg, ppm) that appears in the checklist row
- **Reusable `ListPickerModal`** (v0.27.0, extended v0.28.1) — single-select picker used for entry fields + equipment dropdowns; `multi: true` prop added in v0.28.1 for multi-select

### Equipment + service entry polish (v0.28.1 – v0.28.5)

- **Equipment as multi-select picker** (v0.28.1) — equipment field converted from inline checklist to a picker row matching the other entry fields; shown for both Install and Service types; label dynamically reads "Equipment Installed" or "Equipment Serviced"
- **Last Service Details on customer card** (v0.28.2) — equipment + salt from the most recent entry with entryValues, visible without opening the log
- **Service log entry summary line** (v0.28.2) — brief equipment/salt line under the type label in each log row
- **Full details in view mode** (v0.28.2) — tapping a service entry shows Details + Checklist sections before Notes/Photos in the view sheet
- **Subtle edit affordance** (v0.28.2) — edit pencil on customer card and entry modal uses `pencil-outline` + muted color
- **View-mode default for all entries** (v0.28.3) — every service entry now opens in view mode (was 'edit' for same-day entries) to prevent accidental edits; pencil to enter edit mode deliberately
- **Photos now actually save on new entries** (v0.28.3) — `addServiceEntry` in storage.js was silently dropping the `photos` field since photo support shipped; fixed
- **Permission recovery** (v0.28.3) — "Permission Denied" alerts now include an "Open Settings" button via `Linking.openSettings()` across Add/Edit service paths and image/camera flows
- **Calendar + photo orphan cleanup on delete** (v0.28.4) — deleting a customer now calls `removeCustomerEvent` + `removeScheduledServiceEvent` for every scheduled entry, and `deletePhotosFromDisk` for every photo across the service log; deleting a single entry or removing a photo in edit mode also cleans up the file
- **Checklist unit preservation** (v0.28.4) — custom measure items were losing their `unit` label on any subsequent add/delete; fixed in `ChecklistScreen.handleDelete` + `handleAddItem`
- **Detail row layout fix** (v0.28.5) — entry detail rows no longer squeeze the label into a character-wrapped column; label sizes to content, value takes remaining space and wraps multi-line

### Release pipeline fixes
- `runtimeVersion: { policy: "appVersion" }` — Expo Go manifest crash
- `promise@8.3.0` direct dep — Sentry launch crash
- `patch-package` for `expo-modules-core` — `addListener` crash in Expo Go
- Android auto-submit `releaseStatus: "draft"` (v0.25.2) — Google rejected auto-publish until listing metadata is complete; draft lets the AAB land in the Play Console for manual promotion

---

## Remaining Steps to v1.0

### Step 1 — Finish beta testing

**Google Play screenshots** (required before the store listing goes live):
- Take screenshots on a real device or simulator
- Required sizes: Phone (16:9 or 9:16), minimum 2
- Upload: Play Console → Rolodeck → Store presence → Main store listing → Graphics

**Golden-path tester checklist** (run on both platforms):
- [ ] Add a customer
- [ ] Log a service
- [ ] Calendar sync populates due dates + appointments
- [ ] Export backup → share file → import on another device
- [ ] Settings → theme changes apply live
- [ ] Kill and relaunch — data persists
- [ ] Add photos to a service entry from camera + library
- [ ] Schedule a service → conflict detection catches overlaps

### Step 2 — Square activation (optional, can ship without)

The PKCE OAuth flow is already built. To activate:

1. Create a Square Developer account at [developer.squareup.com](https://developer.squareup.com)
2. Create a new application → copy **Application ID** + a **Location ID**
3. Add to `.env`:
   ```
   EXPO_PUBLIC_SQUARE_CLIENT_ID=your-application-id
   EXPO_PUBLIC_SQUARE_LOCATION_ID=your-location-id
   EXPO_PUBLIC_SQUARE_ENVIRONMENT=production
   ```
4. Square Developer Dashboard → OAuth settings → add redirect URI: `rolodeck://square-callback`

Can ship v1 without it and enable in a v1.x OTA push.

### Step 3 — Bug fixes from beta

For JS-only fixes, OTA push:
```bash
eas update --branch production --message "fix: describe the fix"
```

For native changes, rebuild and submit.

### Step 4 — Tablet / iPad buildout ✅ (Phases A–C complete in v0.29.0)

`supportsTablet: true` is on in `app.json`. v0.25.0 shipped the first pass: content capped at 760pt on portrait tablet. v0.29.0 shipped the full iPad-native buildout (Phases A–C):

**Phase A — Orientation + landscape ✅ (v0.29.0)**
- [x] `app.json` `orientation` changed to `"default"` — iPad rotates freely
- [x] `useSplitLayout()` hook gates all landscape features (`isTablet && isLandscape`)
- [x] `useIsLandscape()` hook + `SIDEBAR_WIDTH`/`SPLIT_LIST_WIDTH` constants in `responsive.js`

**Phase B — Master-detail split views ✅ (v0.29.0)**
- [x] `CustomerDetailPane` extracted from `CustomerDetailScreen` — works as both a pushed screen and an embedded pane; uses `useEffect` on `customerId` prop instead of `useFocusEffect`
- [x] `CustomersScreen` → split view: list on left (320pt), `CustomerDetailPane` on right; tapping a card swaps the pane; pane callbacks refresh the list (no stale cards after service add)
- [x] `ServicesScreen` → same pattern: due/overdue list + calendar on left, `CustomerDetailPane` on right; calendar taps still navigate on phone
- [x] `CustomerDetailScreen` rewritten as thin nav wrapper (~60 lines): header back button + `safeGoBack`, then delegates to `CustomerDetailPane`

**Phase C — Sidebar navigation ✅ (v0.29.0)**
- [x] `TabletSidebar` in `App.js`: permanent left sidebar (240pt) with Rolodeck logo + 3 nav rows (icon + label + Services badge); no drawer package needed
- [x] `TabNavigator` `hideTabs` prop suppresses bottom bar when sidebar is shown
- [x] Active tab tracked via `NavigationContainer.onStateChange`; sidebar navigates via `navigationRef.current?.navigate()`

**Phase D — Touch-target + typography tuning (optional, deferred):**
- [ ] Bump `FontSize.base` by ~1-2pt on tablet via `tabletScale()` (already in typography.js)
- [ ] Increase card padding and row heights ~15-20% on tablet
- [ ] Audit `Pressable` targets < 44pt — raise to 48pt on tablet
- [ ] Calendar modal: cap width to 520pt on tablet (was 90%)

**Phase E — Tablet-specific polish (optional, deferred):**
- [ ] Photo lightbox: aspect-ratio-preserving layout for iPad landscape
- [ ] iPad-specific splash screen asset (2048×2732 for 12.9" Pro)
- [ ] App Store listing: add iPad screenshots, mention tablet support in description
- [ ] Google Play: tablet-optimized listing (Play Console → Tablet section)

**Phase F — Keyboard + pointer support (nice-to-have, post v1):**

iPad with Magic Keyboard / trackpad is real. Not required for v1, but worth tracking:
- Hover states on cards and buttons (`Pressable onHoverIn/onHoverOut`)
- Command-key shortcuts (⌘F search, ⌘N new customer) via `react-native-keyevent` or RN's `useKeyboardEventListener`
- Pointer cursor on interactive elements

---

### Step 5 — Bump to v1.0 and production release

1. Bump `VERSION` to `1.0.0`
2. Sync `package.json "version"` + `app.json "expo.version"`
3. Add `CHANGELOG.md` entry
4. Commit, tag, push:
   ```bash
   git add -p
   git commit -m "feat: Rolodeck v1.0"
   git tag v1.0
   git push && git push --tags
   ```

GitHub Actions takes it from there. App Store review: 1–3 days. Google Play: usually hours.

---

## Multi-Profession Upgrade (v2.0)

> **Status:** Architecture **shipped in v0.26 – v0.28** (see "Profession system" under Completed above). Water Treatment preset is fully wired end-to-end: service types + custom lists + checklist + equipment fields + entry field dropdowns + customize screens. Remaining work is **content** (the other 11 profession presets) + the first-run onboarding picker. No storage migration is required because the system was built additively — Water stays the default and existing installs were never disrupted, which means the "next big release" does not necessarily need a major-version bump. Mockup at `/tmp/rolodeck-mockup/index.html` (regenerable — see "Mockup" section below).

### Vision

Rolodeck's core engine — customer DB + service log + due dates + scheduling + calendar sync + photos + Square — is already **100% trade-agnostic**. The current app is water-treatment-flavored only at the cosmetic layer (service types, default interval, default durations). v2.0 generalizes this with **profession presets** so any solo service pro can pick their trade and get sensible defaults.

**Target user (unchanged):** solo LLC owners and freelancers running a customer-visit business. Not multi-tech companies. Not regulated enterprise operations. See memory: *project: Rolodeck target user*.

### The 12 profession presets to ship

All of these fit the solo-operator mold. Data shape is identical across all twelve (see "Data model" below).

| # | Profession | Default Interval | Has "install" type |
|---|---|---|---|
| 1 | 💧 Water Treatment | 12 months | Yes (equipment install) |
| 2 | ❄️ HVAC | 6 months (seasonal) | Yes (system install) |
| 3 | 🪲 Pest Control | 90 days (quarterly) | Yes (initial service) |
| 4 | 🌱 Lawn Care | 7 days (weekly in-season) | Yes (install / hardscape) |
| 5 | 🏊 Pool & Spa | 7 days (weekly in-season) | Yes (pool opening) |
| 6 | ⚡ Electrician | On-demand | Yes (new install) |
| 7 | 🧹 Cleaning Service | 14 days (bi-weekly) | Yes (move-in/out) |
| 8 | 🔥 Chimney Sweep | 12 months (annual) | Yes (insert install) |
| 9 | 🔧 Appliance Repair | On-demand | Yes (install / haul-away) |
| 10 | 🏠 Gutter & Window | 6 months (spring + fall) | Yes (guard install) |
| 11 | 🔑 Locksmith | On-demand | Yes (lock install) |
| 12 | 🚪 Garage Door | 12 months (annual tune-up) | Yes (full door install) |

**Plus a "Custom" option** — blank slate, fully user-defined. This is the long-term answer for trades not in the preset list (mobile detailer, piano tuner, pet sitter, etc.).

**Explicitly rejected / deferred:**
- **Fire Extinguisher / Life Safety** — too enterprise, too regulated (AHJ, inspection tags, multi-tech crews). Doesn't fit solo-operator target.
- **Septic service** — borderline. Full pumping requires a $100k vac truck + often a second set of hands. True solo septic pumpers are rare. Could ship later as "Septic Inspection" only (inspection side is solo-friendly).

### Three scheduling archetypes

Every trade falls into one of these, and the UI should emphasize/de-emphasize the due-date system accordingly:

1. **Recurring cadence** — water, HVAC, pest, lawn, pool, septic, chimney, gutter, garage door. Due-date tracking is the whole value prop.
2. **On-demand / reactive** — electrician, appliance repair, locksmith. Customer DB + service log matters; due dates barely used. Show "no recurring" as a valid interval option.
3. **Seasonal burst** — chimney (Sep–Dec), pool open/close (Mar + Oct), HVAC tune-ups (Mar + Sep), gutter (Apr + Oct). Two hits a year with sharp spikes.

### Data model

All changes are **additive**. Existing AsyncStorage keys stay untouched.

**New AsyncStorage keys:**

```
@rolodeck_profession            # string: 'water' | 'hvac' | 'pest' | ... | 'custom'
@rolodeck_profession_custom     # object: user overrides (durations, labels)
@rolodeck_lists_<profession>    # object: per-profession custom list contents
@rolodeck_schema_version        # number: bumped 1 → 2 on first v2 launch
```

**Profession preset config shape** (ships in source, not AsyncStorage):

```js
{
  id: 'pest',
  name: 'Pest Control',
  emoji: '🪲',
  tagline: 'Quarterly routes, termite, mosquito',

  serviceTypes: [
    { id: 'treat',   label: 'Routine Treatment', icon: 'shield-checkmark-outline', dur: '30 min' },
    { id: 'initial', label: 'Initial Service',   icon: 'flash-outline',            dur: '90 min', install: true },
    { id: 'inspect', label: 'Inspection',        icon: 'search-outline',           dur: '45 min' },
    { id: 'follow',  label: 'Follow-Up',         icon: 'repeat-outline',           dur: '20 min' },
    { id: 'wdi',     label: 'WDI / Termite',     icon: 'document-text-outline',    dur: '60 min' },
  ],

  customLists: [
    { key: 'pests',    label: 'Target Pests',         items: ['Ants', 'Roaches', 'Termites', ...] },
    { key: 'products', label: 'Products / Chemicals', items: ['Temprid FX', 'Termidor SC', ...] },
    { key: 'methods',  label: 'Treatment Methods',    items: ['Liquid perimeter', ...] },
    { key: 'areas',    label: 'Areas Treated',        items: ['Interior', 'Exterior perimeter', ...] },
  ],

  entryFields: [
    { label: 'Target Pests',  source: 'pests',    multi: true },
    { label: 'Products Used', source: 'products', multi: true },
    { label: 'Areas Treated', source: 'areas',    multi: true },
  ],

  defaultIntervalDays: 90,

  checklist: [
    { label: 'Product: Temprid FX (0.075%)', type: 'check' },
    { label: 'Activity level',               type: 'measure' },
    // ...
  ],

  equipmentFields: [
    { key: 'targetPests', label: 'Target Pests', kind: 'dropdown', source: 'pests' },
    { key: 'sqft',        label: 'Sq Footage',   kind: 'number' },
    { key: 'pets',        label: 'Pets',         kind: 'text' },
    { key: 'baitStations',label: 'Bait Stations',kind: 'number' },
  ],
}
```

Full preset data for all 12 professions is already built out in the mockup HTML — port it when implementing.

### Screens to add / modify

**New screens** (under Settings → Profession):
- `ProfessionSettingsScreen.js` — profession picker + live preview + drill-down rows
- `ServiceTypesEditorScreen.js` — list of service types with duration steppers, add/remove/reorder, "Reset to profession defaults"
- `CustomListsEditorScreen.js` — each custom list shown as removable chips + "+ Add" button (e.g., add regional pests like palmetto bugs, boxelder bugs, scorpions)
- `ChecklistEditorScreen.js` — reorderable list of check-vs-measure items, add/remove, type toggle
- `EquipmentFieldsEditorScreen.js` — per-customer field editor; each field has a type (text/number/date/dropdown); dropdowns pick which custom list they pull from
- `DefaultIntervalScreen.js` — preset grid (7d, 14d, 30d, 60d, 90d, 6mo, 12mo, 2yr, custom) + toggles ("apply to new customers only", "allow per-customer override")

**Modified screens:**
- `CustomerCard.js` — subtitle content varies by profession (equipment summary instead of city/phone for some trades)
- `CustomerDetailScreen.js` — new "Equipment / Site Info" block between info and service log; field set comes from active profession's `equipmentFields`
- `AddCustomerScreen.js` — render profession-specific fields on customer-create form
- `AddServiceScreen.js` — 
  - Service type picker at top (replaces hardcoded single type — grid of 2-6 types per profession)
  - New "Details" section between Date and Checklist: renders each `entryField` as a dropdown pulling from the corresponding custom list (single-select or multi-select based on `multi: true`)
  - Checklist section still pulls from profession's checklist (currently hardcoded, now dynamic)
- `ScheduleServiceModal.js` — duration lookup now keyed on service type ID rather than the `service`/`install` binary
- `scheduleSettings.js` — `SCHEDULE_DEFAULTS` generalizes from hardcoded `service: 30min, install: 150min` to a lookup keyed on active profession's service types

**Modified scheduling logic:**
- Current: `type: 'service' | 'install'` with hardcoded 30min / 150min durations
- v2: `type` is any profession service type ID. Durations come from `profession.serviceTypes[typeId].dur`, user-overrideable via ServiceTypesEditorScreen.

### "Add Install" rethink

Currently there's no dedicated Add Install screen — AddServiceScreen.js v1.1 removed the `service|install` toggle and saves everything as `type: 'service'`. CustomerDetailScreen still renders entries with `type: 'install'` specially (rust-colored initial-install tag).

**v2 approach:** Each profession flags one of its service types with `install: true`. That type:
- Gets rust-colored save button
- Shows an "Equipment / Job Details" section instead of a checklist
- Typically has a longer default duration
- Is what new customers' onboarding entry maps to

Professions without a real "install" concept (some cleaning use-cases) can still have the onboarding flagged entry — just labeled differently (e.g., "Onboarding" or "First Service").

### Migration strategy

> **Update (v0.28):** The system was built so additively that no explicit migration function was ever needed. Water stayed the default, old `type: 'service' | 'install'` entries already matched the Water preset's type IDs, and new profession data lives under separate keys. The `@rolodeck_schema_version` bump + migration function below is preserved for reference in case a future profession change requires it, but it has not been run.

**Existing user data is 100% safe.** All changes are additive — no renames, no removals.

**Migration function** (reference only — not currently wired):

```js
// On app boot, check @rolodeck_schema_version
if (schemaVersion < 2) {
  // 1. Set default profession = 'water' (preserves Paul-style experience)
  await AsyncStorage.setItem('@rolodeck_profession', 'water');

  // 2. Seed the water profession's custom lists with defaults
  await AsyncStorage.setItem('@rolodeck_lists_water', JSON.stringify(WATER_DEFAULTS));

  // 3. Existing service entries have type: 'service' | 'install' — these map 1:1
  //    to the water profession's service types. No entry modification needed; the
  //    profession's serviceTypes array must include IDs 'service' and 'install'.

  // 4. Bump schema version
  await AsyncStorage.setItem('@rolodeck_schema_version', '2');
}
```

**What existing users see after upgrade:**
- Every customer, phone, address, service log entry, photo, scheduled service — all untouched
- They stay on the water treatment preset by default (no UX regression)
- New optional fields (equipment brand, serial, etc.) are empty; user fills over time
- Settings gains new "Profession" row; no onboarding modal for upgrades

**What fresh installs see:**
- First-run onboarding modal asks which profession they run
- Choice seeds the default interval, service types, and custom lists for that trade
- They can always change later in Settings → Profession

**Profession switch semantics (existing user changes profession mid-stream):**
- Old service log entries **keep their original type labels** (history is history — do not retroactively rewrite)
- New entries use the new profession's service types
- Custom list additions stay attached to the profession they were added to (switching away hides them; switching back shows them)
- Equipment field values on customers: old values preserved under their original keys even if the new profession has different `equipmentFields` (they just don't render on the form)

**Per `CLAUDE.md` rule:** *"Storage schema changes that require migration are always major"* → this is a **v1.x → v2.0** bump. No exceptions.

### UX principles

- **Defaults should Just Work.** 95% of users should never need to touch the customize screens. Ship solid presets.
- **Customization is power-user territory** — discoverable but not required.
- **Never force data entry** — new optional fields stay empty on old customers until the user decides to fill them.
- **History is sacred** — profession switches, field edits, preset updates never rewrite past entries.
- **One-person scope only** — no multi-tech dispatch, no role-based permissions, no crew assignment. See target-user memory.
- **Respect the on-demand trades** — electrician, locksmith, appliance repair: do NOT push due-date badges on customers when interval is "none/on-demand". These users want the DB and service log, not nagging.

### Scope guards (what NOT to build)

- No technician assignment / dispatch (violates solo-target)
- No role-based permissions (violates solo-target)
- No compliance / inspection-tag tracking (too enterprise, rejected fire safety for this reason)
- No multi-seat billing
- No Septic full-service preset (defer until inspection-only scope is confirmed as useful)
- No retroactive history rewriting on profession switch

### Implementation sequencing

Phases 1–3 and most of phase 4 are shipped. Remaining work: port the other 11 profession preset configs (the mockup is the authoritative source) + build the onboarding picker + end-to-end testing per profession.

1. **Phase 1 — Infra** ✅ (v0.26.0) — profession config registry at `src/data/professions/`, `ProfessionContext` provider, `useProfession()` hook, `@rolodeck_profession` AsyncStorage key (default `'water'`). Schema version / migration function deferred — not needed since everything was built additively.
2. **Phase 2 — Core reads** ✅ (v0.26.0 – v0.27.0) — CustomerCard, CustomerDetail, AddService (modal + screen), ScheduleServiceModal, SchedulingSettings all read from active profession. Water treatment behavior unchanged for existing installs.
3. **Phase 3 — Entry field dropdowns** ✅ (v0.27.0, multi-select added v0.28.1) — `ListPickerModal` reused for entry fields; Equipment Serviced / Salt Used pull from custom lists; multi-select Equipment shipped.
4. **Phase 4 — Customize screens** — ✅ Service Types (v0.28.0), ✅ Custom Lists (v0.27.0), ✅ Checklist (v0.27.0, editable v0.28.0), ◻ Equipment Fields editor, ◻ Default Interval screen (preset grid + toggles)
5. **Phase 5 — Onboarding** ◻ — first-run profession picker modal for fresh installs; pick from the 12 presets + Custom. Existing installs stay on Water without prompting.
6. **Phase 6 — Port the other 11 profession presets** ◻ — HVAC, Pest Control, Lawn Care, Pool & Spa, Electrician, Cleaning, Chimney Sweep, Appliance Repair, Gutter & Window, Locksmith, Garage Door, plus the Custom blank slate. Preset contents live in the mockup — port verbatim.
7. **Phase 7 — Testing** ◻ — seed + validate each profession end-to-end; verify profession switch on existing data doesn't rewrite history.
8. **Phase 8 — Release** ◻ — tag and push. Whether this is a v2.0.0 marketing moment or a v1.x series is a judgment call since no schema migration is required.

### Mockup

A full HTML mockup of v2 is buildable at `/tmp/rolodeck-mockup/index.html`. Serve with `python3 -m http.server 8765` and open `http://localhost:8765`. Not checked into the repo — regenerate when needed. The mockup shows:

- 10 phone frames side by side per profession (all 12 professions in the header dropdown):
  - Main flows: Customer List, Customer Detail, Add Service, Add Install
  - Settings drill-downs: Profession Picker, Service Types & Durations, Custom Lists, Visit Checklist, Equipment Fields, Default Interval
- Real Rolodeck color palette (teal primary, cream bg, rust install accent, blue scheduled)
- Real Ionicons via CDN

The mockup data is the authoritative source for the preset contents — port it verbatim when building.

### Open design questions (not yet decided)

- **Onboarding for upgrading users** — do we show the profession picker on first v2 launch to existing users, or silently default to water and let them discover Settings → Profession? Current plan: silent default. Consider a one-time "New in v2: profession presets" banner.
- **Per-customer profession override** — could a user have one Rolodeck app handling two trades (e.g., solo HVAC guy who also does appliance repair)? Out of scope for v2; revisit if requested.
- **Profession-switch UX on existing data** — current plan: no remap UI, history stays as-is. Revisit if beta testers find it confusing.
- **Migration rollback** — if v2 migration fails mid-flight, can we safely revert to v1 behavior? Current plan: the schema bump is the last step, so a failed migration leaves the app in "still v1" state. Worth testing.

---

## Future Feature Backlog (post v1.0, not tied to v2)

### Near-term
- Square OAuth activation (creds swap — see Step 2 above)
- Service note templates — save common notes to reuse
- CSV import — bulk-import customers from a spreadsheet

### Longer-term
- Push notifications — reminders when customers are coming due
- iCloud / Google Drive sync — automatic backup instead of manual export

### Done ✅
- **Customer photos** — shipped as service note photo attachments in v0.24.0
- **In-app camera** — `expo-image-picker` camera + library integration in v0.24.0
- **Service note photo attachments** — v0.24.0
- **Profession system infrastructure + Water Treatment preset** — v0.26.0 – v0.28.0
- **Editable service types with custom types + icons + durations** — v0.28.0
- **Editable checklist with custom items + measurement units** — v0.28.0
- **Equipment as multi-select picker on Add Service** — v0.28.1
- **Last Service Details on customer card + details in entry view** — v0.28.2
- **Calendar + photo file cleanup on delete** — v0.28.4

### Rejected / out of scope
- **Technician assignment** — violates solo-LLC / freelancer target user
- **Multi-seat billing / crew dispatch** — same reason
- **Fire extinguisher / life safety preset** — too enterprise, too regulated

---

## Credentials reference

**Keep these safe — needed for release operations.**

- Apple ID: `kdujardin1@outlook.com`
- ASC App ID: `6762417306`
- Apple Team ID: `W6R4H966U8`
- Expo project: `@ardingate-studios-llc/rolodeck` (ID: `117e475a-df12-4791-a8bf-5d761b4c526c`)
- iOS dist cert serial: `5AF486400E5125FDD1ADB0E61C2A5F18` (expires Apr 16 2027)
- iOS provisioning profile: `M2QQJ7H3UH` (expires Apr 16 2027)
- Android keystore: `p8ESASctpl`
- Android SHA256: `94:2E:8E:0C:9A:1D:A7:16:66:E9:5A:E0:F1:C2:8F:40:38:C2:00:30:69:45:67:DA:EB:FF:38:1E:1B:96:51:C8`
- Support URL: `https://studios.ardingate.com/contact/`
- Privacy policy: `https://ardingate.com/privacy-policy/`

---

## Archive: Completed Pipeline Steps (detail)

> Preserved for reference in case any step needs to be re-run. All marked ✅ above.

### Sentry setup

1. Account at [sentry.io](https://sentry.io) → new project → React Native → "Rolodeck"
2. Copy DSN into `callcard-crm/.env`:
   ```
   EXPO_PUBLIC_SENTRY_DSN=https://your-dsn-here
   ```
3. Optional: add to EAS environment in `eas.json` under `production.env`

### Expo registration

```bash
cd /Users/keithdujardin/Repos/paul-app/rolodeck
eas login
eas init          # accept defaults — adds extra.eas.projectId to app.json
```

### App Store Connect listing

- [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → + → New App
- iOS, Name: Rolodeck, Bundle ID: `com.ardingate.rolodeck`
- Store listing copy lives in `store-assets/`

### iOS credentials + EAS secrets

```bash
eas credentials --platform ios

eas env:create --scope project --name APPLE_ID      --value "kdujardin1@outlook.com"
eas env:create --scope project --name ASC_APP_ID    --value "6762417306"
eas env:create --scope project --name APPLE_TEAM_ID --value "W6R4H966U8"
```

> `eas secret:create` is deprecated — use `eas env:create`.

### Google Play listing

- [play.google.com/console](https://play.google.com/console) → Create app
- Name: Rolodeck, Package: `com.ardingate.rolodeck`
- Copy in `store-assets/android/`; content rating questionnaire in `Content_Rating_Questionnaire.md`

### Android credentials

```bash
eas credentials --platform android
```

EAS generates and stores the upload keystore permanently.

### Google Play Service Account

> The old "Setup → API access" page is gone. The new flow is split across Google Cloud Console and Play Console.

**Part A — GCP Console:**
1. [console.cloud.google.com](https://console.cloud.google.com) → new project ("Play Store API")
2. APIs & Services → Library → enable **Google Play Android Developer API**
3. IAM & Admin → Service Accounts → Create Service Account (name: `eas-submit`). **Skip the GCP role** — all real perms go in Play Console.
4. Service account → Keys tab → Add Key → Create new key → JSON. Download, never commit.

**Part B — Play Console:**
1. Account-level Users and permissions
2. Invite new users → paste the service account email
3. Account permissions:
   - ✅ View app information and download bulk reports
   - ✅ Release apps to testing tracks
   - ✅ Manage testing tracks and edit tester lists
   - ✅ Release to production, exclude devices, and use Play App Signing
4. Invite user (activates immediately — no email accept)

> ⚠️ **Wait 24–36 hours** for Google to propagate perms. `403 The caller does not have permission` errors during that window are normal.

**Part C — Upload to EAS:**
```bash
eas credentials -p android
# → Google Service Account → Upload a Google Service Account Key → path to JSON
```

**Part D — `eas.json`:**
```json
{
  "submit": {
    "production": {
      "android": {
        "track": "internal",
        "releaseStatus": "completed",
        "changesNotSentForReview": true
      }
    }
  }
}
```

> ⚠️ **Hard Google requirement:** The API will reject the first-ever submission unless an AAB has been manually uploaded through Play Console UI at least once. After that, EAS Submit takes over permanently.

### First builds

```bash
npm run build:ios && npm run build:android
```

`app.json` has `ITSAppUsesNonExemptEncryption: false` in `ios.infoPlist` (Apple requirement).

### iOS TestFlight

```bash
npm run submit:beta:ios
```

Apple processes in 5–10 min; email notification when ready.

### First Android AAB (manual)

- Download AAB from EAS artifact URL
- Play Console → Rolodeck → Testing → Internal testing → Create new release → upload AAB → roll out
- Released Apr 16 — future Android submissions use `npm run submit:beta:android`

### GitHub Actions release workflow

File: `.github/workflows/release.yml`

1. Runs tests (blocks on fail)
2. Parallel iOS + Android builds on EAS cloud
3. Auto-submits both to App Store + Google Play
4. EAS manages build numbers automatically (`appVersionSource: remote`)

**Enabling:**
1. [expo.dev](https://expo.dev) → Settings → Access Tokens → Create
2. GitHub repo → Settings → Secrets → Actions → New secret: `EXPO_TOKEN`

**Trigger:**
```bash
git tag v1.1
git push --tags
```

> Android auto-submit requires the Google Play Service Account + first manual AAB upload to already be in place. iOS auto-submit works immediately via EAS secrets.

---

## After-launch operations

**JS-only fixes (90% of updates) — OTA, no store review:**
```bash
eas update --branch production --message "what changed"
```
Users get it on next app open.

**Native changes or new releases — tag push triggers full pipeline:**
```bash
git tag v1.1
git push --tags
```

**TestFlight beta updates:**
```bash
npm run build:ios && npm run submit:beta:ios
```

---

Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
