# Rolodeck

> Every contact, perfectly in hand.

**Rolodeck** is a mobile customer database for service professionals — plumbers, HVAC
technicians, electricians, landscapers, and anyone else who visits customers on a
recurring schedule. Keep every contact organized, log every service visit, and get
notified when a customer is coming up on their annual appointment.

Built with React Native (Expo), runs on iOS and Android, no backend required.

---

## Features

- **Customer database** — name, email, phone, address, zip code; search and sort by
  name or zip code
- **Service log** — per-customer log of service visits and installations, newest first
- **Annual reminders** — badge + filter for customers overdue or due within 30/60/90 days
- **Four color themes** — Rolodeck Classic, Ocean Blue, Forest Green, Midnight
- **Fully offline** — all data stored locally on-device via AsyncStorage, no account
  required, no subscription
- **Square invoice placeholder** — stub for future Square API invoice integration

---

## Tech Stack

| Layer | Library |
|---|---|
| Framework | React Native (Expo managed workflow ~51) |
| Navigation | React Navigation v6 — Stack + Bottom Tabs |
| Storage | @react-native-async-storage/async-storage |
| Typography | DM Serif Display + DM Sans (via @expo-google-fonts) |
| Icons | @expo/vector-icons (Ionicons) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- iOS Simulator (Xcode) or Android Emulator, or the **Expo Go** app on a physical device

### Install & run

```bash
cd rolodeck
npm install
npx expo start
```

Scan the QR code with **Expo Go**, or press `i` for iOS simulator / `a` for Android emulator.

---

## Project Structure

```
rolodeck/
├── App.js                  ← root entry: font loading + navigation
├── app.json                ← Expo config
├── package.json
├── VERSION                 ← project version (source of truth)
├── CHANGELOG.md
├── src/
│   ├── screens/
│   │   ├── CustomersScreen.js       ← list + search + sort
│   │   ├── CustomerDetailScreen.js  ← info + service log + edit
│   │   ├── AddCustomerScreen.js     ← add customer form
│   │   ├── AddServiceScreen.js      ← add service entry form
│   │   ├── ServicesScreen.js        ← overdue/30/60/90 day filters
│   │   └── SettingsScreen.js        ← theme, sort pref, Square token
│   ├── components/
│   │   ├── CustomerCard.js          ← customer list card
│   │   ├── ServiceLogEntry.js       ← single service log row
│   │   ├── InvoiceButton.js         ← Square invoice placeholder
│   │   └── TabNavigator.js          ← tab + stack nav structure
│   ├── styles/
│   │   ├── colors.js                ← palette + 4 theme objects
│   │   ├── typography.js            ← font family + size constants
│   │   └── theme.js                 ← ThemeContext + ThemeProvider
│   ├── data/
│   │   └── storage.js               ← AsyncStorage CRUD
│   └── utils/
│       ├── serviceAlerts.js          ← due-date calculation logic
│       └── squarePlaceholder.js      ← Square API stub
└── store-assets/
    ├── icon.svg                     ← master app icon (SVG)
    ├── icon-preview.html            ← brand preview in browser
    ├── icons/                       ← PNG exports (see icons/README.md)
    ├── ios/                         ← App Store copy
    └── android/                     ← Google Play copy
```

---

## Data Model

```js
// Customer
{
  id:         string,   // generated
  name:       string,
  email:      string,
  phone:      string,
  address:    string,
  zipCode:    string,
  serviceLog: ServiceEntry[]
}

// ServiceEntry
{
  id:    string,          // generated
  date:  string,          // ISO 8601
  type:  'service' | 'install',
  notes: string
}
```

---

## Future: Square Invoice Integration

`src/utils/squarePlaceholder.js` contains a detailed integration stub. To implement:

1. User adds their Square Access Token in Settings
2. Tap **Send Invoice** on a customer card
3. Enter dollar amount
4. `sendSquareInvoice()` creates and publishes an invoice via Square Invoices API

See the file for the full API call skeleton.

---

Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
