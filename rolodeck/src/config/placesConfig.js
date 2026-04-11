// =============================================================================
// placesConfig.js - Geoapify address autocomplete API configuration
// Version: 1.3
// Last Updated: 2026-04-10
//
// PROJECT:      Rolodeck (project v0.18)
// FILES:        placesConfig.js         (this file — exports GEOAPIFY_API_KEY)
//               .env                    (EXPO_PUBLIC_GEOAPIFY_API_KEY)
//               .env.example            (documentation + placeholder)
//               AddCustomerScreen.js    (consumer — address autocomplete)
//               CustomerDetailScreen.js (consumer — edit mode autocomplete)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// SETUP:
//   1. Go to https://myprojects.geoapify.com and create a free account
//   2. Create a new project
//   3. Copy the API key from the project dashboard
//   4. Free tier: 3,000 requests/day — plenty for this app
//   5. Paste the key into /.env as EXPO_PUBLIC_GEOAPIFY_API_KEY=...
//   6. Restart `npx expo start` so the new env var is picked up
//
//   Leave empty (or unset) to disable autocomplete — manual entry still works.
//
// ARCHITECTURE:
//   - Key is read from process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY, inlined at
//     build time by Expo SDK 49+ (no extra deps, no app.config.js conversion)
//   - EXPO_PUBLIC_* values are NOT secret — they ship in the JS bundle. Rely
//     on Geoapify's bundle-ID/domain allowlist for key restriction
//   - Fallback to empty string means autocomplete callers check `if (KEY)`
//     and skip the fetch if unset
//
// CHANGE LOG:
// v1.0  2026-04-09  Claude  Initial scaffold (Google Places)
// v1.1  2026-04-09  Claude  Switched to Radar.io — renamed export to
//                            RADAR_PUBLISHABLE_KEY
// v1.2  2026-04-09  Claude  Switched to Geoapify — renamed export to
//                            GEOAPIFY_API_KEY
// v1.3  2026-04-10  Claude  Moved hardcoded key to .env via EXPO_PUBLIC_ prefix
//                            (Expo SDK 49+ auto-inlines). App Store submission
//                            safety + key rotation without code changes.
// =============================================================================

export const GEOAPIFY_API_KEY = process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY || '';
