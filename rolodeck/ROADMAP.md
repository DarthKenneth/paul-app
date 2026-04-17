# Rolodeck — v1 Release Roadmap

---

## Current State (as of v0.23.1, 2026-04-17)

The app is feature-complete and builds cleanly. Pre-release hardening is done.
iOS on TestFlight (build 11, v0.23.0 — v0.23.1 in flight). Android live on Play internal track (released Apr 16). Google Play service account set up — auto-submit ready after 24–36 hr permission propagation.

### What's done ✅
- Core app — customer database, service log, service intervals, calendar sync
- Five color themes (Classic, Ocean Blue, Forest Green, Midnight, Stone, Ember)
- Backup / restore (manual export + import)
- App icons — light + dark mode variants
- EAS build + submit pipeline with beta profiles
- OTA updates wired (expo-updates)
- Sentry crash reporting fully wired ✅
  - DSN set in `.env`, `Sentry.init` fires on launch
  - `Sentry.wrap()` on root component for automatic session tracking
  - Error boundary reports uncaught JS errors to Sentry + shows Restart screen
- Square PKCE OAuth built (needs your credentials — Step 12)
  - Token stored in Keychain/Keystore (expo-secure-store)
  - Expiry detection — expired tokens auto-cleared, user prompted to re-auth
  - Merge is rollback-safe (memory-first, write only after all computations succeed)
- Offline detection
- Storage v2 (per-customer keys, write mutex, in-memory cache)
- Crypto-random customer IDs (expo-crypto)
- 38-item app audit complete — schema migrations, timezone safety, backup hardening,
  performance fixes, calendar sync error surfacing, invoice confirmation prompt
- `.env` / `.env.local` pattern — all credentials out of source (Square, Sentry, Geoapify)
- Services tab badge count fixed — refreshes reliably on launch, not just on app foreground
- `runtimeVersion: { policy: "appVersion" }` in app.json — Expo Go manifest crash fixed
- `promise@8.3.0` direct dep — Sentry launch crash fixed
- `patch-package` for expo-modules-core — `addListener` crash in Expo Go fixed

---

## Step 1 — Sentry ✅ (10 min)

1. Create a free account at [sentry.io](https://sentry.io)
2. New Project → React Native → name it "Rolodeck"
3. Copy the DSN (looks like `https://abc123@o123456.ingest.sentry.io/789`)
4. In `rolodeck/.env`:
   ```
   EXPO_PUBLIC_SENTRY_DSN=https://your-dsn-here
   ```
5. (Optional) Add to EAS environment in `eas.json` under `production.env` so it's
   available in cloud builds without needing the local `.env` file.

Sentry will start capturing crashes immediately after the first build with the DSN.

---

## Step 2 — One-time account setup ✅

- **Apple Developer Program** — [developer.apple.com](https://developer.apple.com) ($99/year)
- **Google Play Developer account** — [play.google.com/console](https://play.google.com/console) ($25 one-time)
- **Expo account** (free) — [expo.dev](https://expo.dev)
- **EAS CLI** installed globally: `npm install -g eas-cli`

---

## Step 3 — Register with Expo ✅

```bash
cd /Users/keithdujardin/Repos/paul-app/rolodeck
eas login          # log in to your Expo account
eas init           # links this project to expo.dev — accept the defaults
```

This adds `extra.eas.projectId` to `app.json`. Commit that change.

---

## Step 4 — Create the App Store Connect listing ✅

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. Click **+** → **New App**
3. Platform: iOS, Name: Rolodeck, Bundle ID: `com.ardingate.rolodeck`
4. Open the new app → **App Information** → copy the **Apple ID** (numeric, ~10 digits)
5. Fill in store listing using the copy in `store-assets/`

---

## Step 5 — Set up iOS credentials ✅

```bash
eas credentials --platform ios
```

EAS walks you through creating a distribution certificate and provisioning profile and
stores them in its cloud.

---

## Step 6 — Set EAS secrets for iOS submission ✅

```bash
eas env:create --scope project --name APPLE_ID      --value "kdujardin1@outlook.com"
eas env:create --scope project --name ASC_APP_ID    --value "6762417306"
eas env:create --scope project --name APPLE_TEAM_ID --value "W6R4H966U8"
```

> Note: `eas secret:create` is deprecated — use `eas env:create` going forward.

Where to find each:
- `APPLE_ID` — your Apple Developer account email
- `ASC_APP_ID` — App Store Connect → your app → App Information → **Apple ID** field
- `APPLE_TEAM_ID` — [developer.apple.com/account](https://developer.apple.com/account) → Membership → **Team ID**

---

## Step 7 — Create the Google Play listing ✅

1. Go to [play.google.com/console](https://play.google.com/console)
2. **Create app** → Name: Rolodeck, Package: `com.ardingate.rolodeck`
3. Work through the store listing (copy in `store-assets/android/`)
4. Complete the content rating questionnaire (`store-assets/android/Content_Rating_Questionnaire.md`)

---

## Step 8 — Set up Android credentials ✅

```bash
eas credentials --platform android
```

EAS generates and securely stores your upload keystore. This keystore is permanent —
Google ties it to your app forever.

---

## Step 9 — Set up Google Play service account (for automated submission) ✅

> **Note:** The old "Setup → API access" page in Play Console no longer exists —
> Google removed it in 2023/2024. The new flow is split across Google Cloud Console
> and Play Console's Users and permissions. Do not follow any docs that reference
> "Setup → API access" — they are stale.

### Part A — Google Cloud Console (create the service account)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project — name it something like **"Play Store API"**
3. **APIs & Services → Library** → search **"Google Play Android Developer API"** → **Enable**
4. **IAM & Admin → Service Accounts → Create Service Account**
   - Name: `eas-submit` (or anything descriptive)
   - **Skip assigning a GCP role** — leave the role field blank, just click Done.
     All real permissions are granted in Play Console, not here.
5. Click the new service account in the list → **Keys tab → Add Key → Create new key → JSON**
6. Download the JSON file. **Do not commit it to git.** Save it somewhere safe.

The service account email will look like:
`eas-submit@your-project-id.iam.gserviceaccount.com`

### Part B — Google Play Console (invite the service account as a user)

1. Go to [play.google.com/console](https://play.google.com/console)
2. Left nav (account level, not inside the app) → **Users and permissions**
3. Click **Invite new users**
4. In the email field, paste the service account email from Part A
5. On the **Account permissions** tab, check:
   - ✅ View app information and download bulk reports
   - ✅ Release apps to testing tracks
   - ✅ Manage testing tracks and edit tester lists
   - ✅ Release to production, exclude devices, and use Play App Signing
6. Click **Invite user** — service accounts don't accept email invitations, it just activates immediately

> ⚠️ **Wait 24–36 hours before testing.** Google's API takes time to propagate the new
> permissions. You will get `403 The caller does not have permission` errors immediately
> after adding the account even when everything is configured correctly. This is normal —
> just wait a day.

### Part C — Upload the credential to EAS

```bash
eas credentials -p android
```

Follow the prompts → **Google Service Account** → **Upload a Google Service Account Key**
→ provide the path to the JSON file you downloaded in Part A.

EAS stores it encrypted on expo.dev. **You do not need to add anything to `eas.json`** —
EAS CLI pulls it automatically during `eas submit`.

### Part D — Update `eas.json` submit config

Add the Android submit profile so `--auto-submit` knows where to send the build:

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

`track: "internal"` is the Android equivalent of TestFlight.
`changesNotSentForReview: true` skips Google's review queue for internal track pushes.

### Part E — Verify it works

Once the 24–36 hour propagation window has passed:

```bash
eas build --platform android --auto-submit
```

> ⚠️ **Hard requirement from Google:** The API will reject the first submission if the
> app has never had an AAB uploaded manually through the Play Console UI. Complete
> Step 11 (manual first upload) before relying on auto-submit. After that first manual
> upload, EAS Submit takes over permanently.

---

## Step 10 — First builds ✅

```bash
npm run build:ios && npm run build:android
```

Both build on EAS cloud — no local Xcode or Android Studio needed. Takes 15–30 min.

**Note:** `app.json` now has `ITSAppUsesNonExemptEncryption: false` in `ios.infoPlist` —
required by Apple. Already added.

---

## Step 11 — Beta testing (TestFlight + Play internal)

**iOS** — already submitted via `npm run submit:beta:ios` ✅
Apple is processing — you'll get an email when it's ready in TestFlight (5–10 min).

**Android** — first submission must be manual (Google requirement): ✅
1. ~~Download the AAB from EAS: `https://expo.dev/artifacts/eas/wpoD2Z5aKc9X5ToZVQ1M2.aab`~~
2. ~~Play Console → Rolodeck → Testing → Internal testing → Create new release~~
3. ~~Upload the `.aab` file and roll out~~ — Done (Released Apr 16)

**Screenshots** — required before the Play Store listing goes live:
- Take screenshots on a real device or simulator after installing the beta build
- Required sizes: Phone (16:9 or 9:16), at least 2 screenshots
- Upload at: Play Console → Rolodeck → Store presence → Main store listing → Graphics

**After both are live**, add yourself as a tester and install on real devices:
- App Store Connect → your app → TestFlight → Internal Testing
- Play Console → your app → Internal testing → Testers

Test the golden path:
- [ ] Add a customer
- [ ] Log a service
- [ ] Calendar sync works (check Calendar app)
- [ ] Export backup → share file → re-import
- [ ] Settings → theme changes apply
- [ ] Kill and relaunch — data persists

**Future Android submissions** (after first manual upload + Google Service Account set up):
```bash
npm run submit:beta:android
```

---

## Step 12 — Square setup (optional, can ship without)

The PKCE OAuth flow is already built. To activate it:

1. Create a Square Developer account at [developer.squareup.com](https://developer.squareup.com)
2. Create a new application → get the **Application ID** and a **Location ID**
3. In `.env`:
   ```
   EXPO_PUBLIC_SQUARE_CLIENT_ID=your-application-id
   EXPO_PUBLIC_SQUARE_LOCATION_ID=your-location-id
   EXPO_PUBLIC_SQUARE_ENVIRONMENT=production
   ```
4. In Square Developer Dashboard → OAuth settings → add your redirect URI:
   `rolodeck://square-callback`

Square sync will go live as soon as those values are in the build. You can ship v1
without it and enable it in a v1.1 OTA push.

---

## Step 13 — Bug fixes

Fix any issues found in beta testing. For JS-only fixes (no new native modules or
config changes), you can push an OTA update without rebuilding:

```bash
eas update --branch production --message "fix: describe the fix"
```

Users get it automatically on next app launch. For native changes, rebuild and submit.

---

## Step 14 — Bump to v1.0 and production release

When you're happy with beta, use the GitHub Actions workflow (Step 15 — already set up):

1. Bump `VERSION` to `1.0`
2. Update `package.json "version"` and `app.json "expo.version"` to match
3. Add a `CHANGELOG.md` entry
4. Commit, tag, and push:
   ```bash
   git add -p
   git commit -m "feat: Rolodeck v1.0"
   git tag v1.0
   git push && git push --tags
   ```

GitHub Actions takes it from there — builds both apps and submits to both stores automatically.
App Store review takes 1–3 days. Google Play is usually hours to a day.

> Note: Android auto-submit requires the Google Play service account to be set up
> (Step 9) and the first AAB manually uploaded (Step 11) before this works.
> iOS submits automatically via the App Store Connect API key.

---

## After launch — how updates work

**JS-only fixes (90% of updates) — OTA, no store review:**
```bash
eas update --branch production --message "what changed"
```
Users get it on next app open. No store submission needed.

**Native changes or new releases — tag push triggers full pipeline:**
```bash
git tag v1.1
git push --tags
```
GitHub Actions builds both apps and submits to both stores automatically.

**TestFlight beta updates:**
```bash
npm run build:ios && npm run submit:beta:ios
```

**Known credentials (keep these safe):**
- Apple ID: `kdujardin1@outlook.com`
- ASC App ID: `6762417306`
- Apple Team ID: `W6R4H966U8`
- Expo project: `@ardingate-studios-llc/rolodeck` (ID: `117e475a-df12-4791-a8bf-5d761b4c526c`)
- iOS dist cert serial: `5AF486400E5125FDD1ADB0E61C2A5F18` (expires Apr 16 2027)
- iOS provisioning profile: `M2QQJ7H3UH` (expires Apr 16 2027)
- Android keystore: `p8ESASctpl` — SHA256: `94:2E:8E:0C:9A:1D:A7:16:66:E9:5A:E0:F1:C2:8F:40:38:C2:00:30:69:45:67:DA:EB:FF:38:1E:1B:96:51:C8`
- Support URL: `https://studios.ardingate.com/contact/`
- Privacy policy: `https://ardingate.com/privacy-policy/`

---

## Step 15 — GitHub Actions ✅

The release workflow at `.github/workflows/release.yml` fully automates the release
pipeline on tag push:

1. Runs tests — build is blocked if they fail
2. Builds iOS + Android on EAS cloud in parallel
3. Auto-submits both to App Store + Google Play immediately after build
4. EAS manages build numbers automatically (`appVersionSource: remote`) — you never
   manually bump them

To enable it, add an `EXPO_TOKEN` to GitHub Secrets:

1. [expo.dev](https://expo.dev) → your account → Settings → Access Tokens → Create token
2. GitHub repo → Settings → Secrets → Actions → New secret
3. Name: `EXPO_TOKEN`, Value: [token from step 1]

Then each release is just:
```bash
git tag v1.1
git push --tags
```

That's it — tests run, both apps build, both stores get the submission. App Store review
takes 1–3 days; Google Play is usually hours. No manual steps needed.

> Note: Android auto-submit requires the Google Play service account (Step 9, Parts A–D)
> and first manual AAB upload (Step 11) before it works.
> iOS auto-submit works immediately using the EAS secrets from Step 6.

---

## Feature Backlog

### Near-term

- **Square OAuth** — ready to activate, just needs credentials (Step 12)
- **Customer photos** — attach a photo to a customer record
- **Service note templates** — save common notes to reuse
- **CSV import** — bulk-import customers from a spreadsheet

### Longer-term

- **Push notifications** — remind you when customers are coming due
- **iCloud / Google Drive sync** — automatic backup instead of manual export
- **In-app camera** — capture job site photos during a service visit
- **Technician assignment** — for shops with multiple techs

---

Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
