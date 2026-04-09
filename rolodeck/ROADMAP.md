# Rolodeck — Roadmap

---

## Launch Status

### Waiting on Apple & Google
- **App Store** — submitted, pending review
- **Google Play** — submitted, pending review

### Done ✓
- [x] Core app — customer database, service log, annual reminders
- [x] Four color themes (Classic, Ocean Blue, Forest Green, Midnight)
- [x] Calendar sync — iOS + Android
- [x] Backup / restore (manual export + import)
- [x] App icons — light + dark mode variants
- [x] Store assets — descriptions, keywords, screenshots spec, privacy policy
- [x] EAS build + submit pipeline
- [x] CI/CD — GitHub Actions, tests on every PR, release on tag push

---

## One-Time Release Pipeline Setup

Do this once before the first production build. Takes about an hour.

### Prerequisites

- **Apple Developer Program** — [developer.apple.com](https://developer.apple.com) ($99/year)
- **Google Play Developer account** — [play.google.com/console](https://play.google.com/console) ($25 one-time)
- **Expo account** (free) — [expo.dev](https://expo.dev)
- **EAS CLI** installed globally: `npm install -g eas-cli`

---

### Step 1 — Register the project with Expo

```bash
cd rolodeck
eas login          # log in to your Expo account
eas init           # links this project to expo.dev — accept the defaults
```

This adds an `extra.eas.projectId` to `app.json`. Commit that change.

---

### Step 2 — Create the app in App Store Connect

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. Click **+** → **New App**
3. Platform: iOS, Name: Rolodeck, Bundle ID: `com.ardingate.rolodeck`
4. Open the new app → **App Information** → copy the **Apple ID** (numeric, ~10 digits).
   You'll need this as `ASC_APP_ID` in step 4.

---

### Step 3 — Set up iOS credentials

```bash
eas credentials --platform ios
```

EAS walks you through creating (or reusing) a distribution certificate and App Store
provisioning profile. It stores them in its cloud — you won't manage these locally.

You'll be asked for your Apple ID + password, or you can use an App Store Connect
API key if you have one (faster, doesn't require 2FA every time).

---

### Step 4 — Set EAS secrets for iOS submission

EAS uses these to submit to App Store Connect on your behalf.

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

### Step 5 — Set up Android credentials

```bash
eas credentials --platform android
```

EAS generates and securely stores your upload keystore. This keystore is permanent —
Google ties it to your app forever. EAS keeps a backup in their cloud so you can't
lose it.

---

### Step 6 — Create the app in Google Play Console

1. Go to [play.google.com/console](https://play.google.com/console)
2. **Create app** → Name: Rolodeck, Package: `com.ardingate.rolodeck`
3. Work through the store listing (copy lives in `store-assets/android/`)
4. Complete the content rating questionnaire (answers are in `store-assets/android/Content_Rating_Questionnaire.md`)

---

### Step 7 — Set up Google Play service account (for automated submission)

This lets EAS submit builds to Google Play without you being there.

1. In Play Console → **Setup** → **API access**
2. Link to a Google Cloud project (create one if prompted)
3. Click **Create new service account** → follow the link to Google Cloud
4. Create a service account, give it the **Service Account Token Creator** role
5. Back in Play Console, grant the service account **Release Manager** permissions
6. In Google Cloud Console → the service account → **Keys** → **Add Key** → JSON → download

Upload the key to EAS:
```bash
eas credentials --platform android
# Select: "Set up Google Service Account Key for submitting"
# Provide the path to the downloaded JSON file
```

---

### Step 8 — Add EXPO_TOKEN to GitHub Secrets

The GitHub Actions release workflow needs this to authenticate with EAS.

1. Go to [expo.dev/accounts/[your-username]/settings/access-tokens](https://expo.dev)
2. **Create token** → copy it
3. In your GitHub repo: **Settings** → **Secrets and variables** → **Actions**
4. **New repository secret** → Name: `EXPO_TOKEN`, Value: [token from step 2]

---

### Step 9 — Do a preview build to verify everything works

Before shipping to production, test the pipeline end-to-end with an internal build:

```bash
npm run preview
```

This builds an `.apk` (Android) and distributes the iOS build via Expo's internal
channel. Install and smoke-test before going to production.

---

### Step 10 — First production release

Everything above is done. From here on, every release is just:

```bash
git tag v1.12
git push --tags
```

GitHub Actions picks up the tag → runs tests → builds both platforms on EAS →
submits to App Store + Google Play simultaneously. You'll get email notifications
from both Apple and Google when the builds are received.

To trigger a release without tagging, go to **GitHub Actions** → **Release — iOS & Android** → **Run workflow**.

---

## How Updates Work (After Launch)

1. Make your changes, bump version in `VERSION` / `package.json` / `app.json`
2. Update `CHANGELOG.md`
3. Commit, tag, push:
   ```bash
   git tag v1.13
   git push --tags
   ```
4. Both stores get the update from the same push. Done.

App Store reviews typically take 1–3 days. Google Play is usually hours to a day.

---

## Feature Backlog

### Near-term

- **Square OAuth** — PKCE flow is already built (`src/utils/squarePlaceholder.js`),
  just needs a real `clientId` and `locationId` from the Square Developer Dashboard.
  Drop those in and it's live.
- **Customer photos** — attach a photo to a customer record (camera or library)
- **Service note templates** — save common notes (e.g. "Annual HVAC tune-up") to
  reuse instead of typing every time
- **CSV import** — bulk-import customers from a spreadsheet

### Longer-term

- **Push notifications** — remind you when customers are coming due, without
  opening the app
- **iCloud / Google Drive sync** — currently backup is manual export/import;
  automatic sync would remove that friction
- **In-app camera** — capture a photo of the job site during a service visit and
  attach it to the service log entry
- **Technician assignment** — for shops with multiple techs in the field

---

Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
