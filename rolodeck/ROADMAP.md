# Rolodeck — v1 Release Roadmap

---

## Current State (as of v0.22, 2026-04-14)

The app is feature-complete and builds cleanly. Pre-release hardening is done.
No external accounts are set up yet. The steps below get you from here to live.

### What's done ✅
- Core app — customer database, service log, service intervals, calendar sync
- Five color themes (Classic, Ocean Blue, Forest Green, Midnight, Stone, Ember)
- Backup / restore (manual export + import)
- App icons — light + dark mode variants
- EAS build + submit pipeline with beta profiles
- OTA updates wired (expo-updates)
- Sentry error reporting wired (needs your DSN — Step 1)
- Square PKCE OAuth built (needs your credentials — Step 3)
- Error boundary + restart recovery
- Offline detection
- Storage v2 (per-customer keys, write mutex, in-memory cache)
- 38-item app audit complete — schema migrations, timezone safety, backup hardening,
  performance fixes, calendar sync error surfacing, invoice confirmation prompt

---

## Step 1 — Sentry (10 min)

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

## Step 2 — One-time account setup

- **Apple Developer Program** — [developer.apple.com](https://developer.apple.com) ($99/year)
- **Google Play Developer account** — [play.google.com/console](https://play.google.com/console) ($25 one-time)
- **Expo account** (free) — [expo.dev](https://expo.dev)
- **EAS CLI** installed globally: `npm install -g eas-cli`

---

## Step 3 — Register with Expo

```bash
cd rolodeck
eas login          # log in to your Expo account
eas init           # links this project to expo.dev — accept the defaults
```

This adds `extra.eas.projectId` to `app.json`. Commit that change.

---

## Step 4 — Create the App Store Connect listing

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. Click **+** → **New App**
3. Platform: iOS, Name: Rolodeck, Bundle ID: `com.ardingate.rolodeck`
4. Open the new app → **App Information** → copy the **Apple ID** (numeric, ~10 digits)
5. Fill in store listing using the copy in `store-assets/`

---

## Step 5 — Set up iOS credentials

```bash
eas credentials --platform ios
```

EAS walks you through creating a distribution certificate and provisioning profile and
stores them in its cloud.

---

## Step 6 — Set EAS secrets for iOS submission

```bash
eas secret:create --scope project --name APPLE_ID      --value "your@apple.com"
eas secret:create --scope project --name ASC_APP_ID    --value "1234567890"
eas secret:create --scope project --name APPLE_TEAM_ID --value "XXXXXXXXXX"
```

Where to find each:
- `APPLE_ID` — your Apple Developer account email
- `ASC_APP_ID` — App Store Connect → your app → App Information → **Apple ID** field
- `APPLE_TEAM_ID` — [developer.apple.com/account](https://developer.apple.com/account) → Membership → **Team ID**

---

## Step 7 — Create the Google Play listing

1. Go to [play.google.com/console](https://play.google.com/console)
2. **Create app** → Name: Rolodeck, Package: `com.ardingate.rolodeck`
3. Work through the store listing (copy in `store-assets/android/`)
4. Complete the content rating questionnaire (`store-assets/android/Content_Rating_Questionnaire.md`)

---

## Step 8 — Set up Android credentials

```bash
eas credentials --platform android
```

EAS generates and securely stores your upload keystore. This keystore is permanent —
Google ties it to your app forever.

---

## Step 9 — Set up Google Play service account (for automated submission)

1. In Play Console → **Setup** → **API access**
2. Link to a Google Cloud project
3. Click **Create new service account** → follow the link to Google Cloud
4. Create a service account, give it the **Service Account Token Creator** role
5. Back in Play Console, grant the service account **Release Manager** permissions
6. In Google Cloud Console → the service account → **Keys** → **Add Key** → JSON → download

Upload the key to EAS:
```bash
eas credentials --platform android
# Select: "Set up Google Service Account Key for submitting"
```

---

## Step 10 — First builds

```bash
npm run build:ios
npm run build:android
```

Both build on EAS cloud — no local Xcode or Android Studio needed. Takes 15–30 min.

---

## Step 11 — Beta testing (TestFlight + Play internal)

Once builds are done:

```bash
npm run submit:beta:ios      # → TestFlight (beta reviewers see it within minutes)
npm run submit:beta:android  # → Play internal track (instant, no review)
```

Add yourself and any testers in:
- App Store Connect → your app → TestFlight → Internal Testing
- Play Console → your app → Internal testing → Testers

Install on real devices. Test the golden path:
- [ ] Add a customer
- [ ] Log a service
- [ ] Calendar sync works (check Calendar app)
- [ ] Export backup → share file → re-import
- [ ] Settings → theme changes apply
- [ ] Kill and relaunch — data persists

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

When you're happy with beta:

1. Bump `VERSION` to `1.0` (or `1.0.0` if you prefer three-part)
2. Update `package.json "version"` and `app.json "expo.version"` to match
3. Add a `CHANGELOG.md` entry
4. Rebuild:
   ```bash
   npm run build:ios && npm run build:android
   ```
5. Submit to production:
   ```bash
   npm run submit
   ```

App Store review takes 1–3 days. Google Play is usually hours to a day.
Sentry will start showing real-world crashes immediately.

---

## After launch — how updates work

For JS-only fixes (90% of updates):
```bash
eas update --branch production --message "what changed"
```
Users get it on next app open. No store submission needed.

For native changes or version bumps:
```bash
npm run build:ios && npm run build:android
npm run submit
```

---

## Step 15 — GitHub Actions (optional)

The release workflow in `.github/workflows/` can automate builds on tag push.
To enable it, add an `EXPO_TOKEN` to GitHub Secrets:

1. [expo.dev](https://expo.dev) → your account → Settings → Access Tokens → Create token
2. GitHub repo → Settings → Secrets → Actions → New secret
3. Name: `EXPO_TOKEN`, Value: [token from step 1]

Then each release is just:
```bash
git tag v1.0
git push --tags
```

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
