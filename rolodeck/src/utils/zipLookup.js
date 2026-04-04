// =============================================================================
// zipLookup.js - Zip code to city/state lookup via Zippopotam.us API
// Version: 1.0
// Last Updated: 2026-04-03
//
// PROJECT:      Rolodeck (project v1.3)
// FILES:        zipLookup.js          (this file — zip code API utility)
//               AddCustomerScreen.js  (calls lookupZip on zip input)
//               CustomerDetailScreen.js (calls lookupZip in edit mode)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Uses the free Zippopotam.us API (no API key required)
//   - lookupZip(zip) returns { city, stateAbbr } or null on failure
//   - Only triggers on valid 5-digit US zip codes
//   - Timeout of 5 seconds to avoid blocking UI on slow connections
//   - Results are not cached — each lookup is a fresh fetch
//   - Graceful degradation: returns null on any error (network, invalid
//     zip, timeout) so the UI simply doesn't auto-fill
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial implementation
// =============================================================================

const ZIP_REGEX = /^\d{5}$/;
const TIMEOUT_MS = 5000;

/**
 * Look up city and state for a US zip code.
 * @param {string} zip — 5-digit US zip code
 * @returns {Promise<{city: string, stateAbbr: string} | null>}
 */
export async function lookupZip(zip) {
  if (!zip || !ZIP_REGEX.test(zip)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data = await res.json();
    const place = data?.places?.[0];
    if (!place) return null;

    return {
      city:      place['place name'] || '',
      stateAbbr: place['state abbreviation'] || '',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
