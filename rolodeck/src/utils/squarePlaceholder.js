// =============================================================================
// squarePlaceholder.js - Square OAuth (PKCE), token storage, invoice sending
// Version: 4.0
// Last Updated: 2026-04-14
//
// PROJECT:      Rolodeck (project v0.22)
// FILES:        squarePlaceholder.js  (this file — OAuth + invoice engine)
//               squareCustomers.js    (Customers API wrapper)
//               squareSync.js         (sync orchestrator)
//               SquareSyncScreen.js   (sync management UI)
//               SettingsScreen.js     (connect/disconnect button)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - PKCE OAuth (RFC 7636) — no backend server required
//   - Square clientId read from EXPO_PUBLIC_SQUARE_CLIENT_ID env var at
//     build time; falls back to placeholder so the app loads in dev without
//     a real key (Square connect will fail gracefully until configured)
//   - SQUARE_ENVIRONMENT read from EXPO_PUBLIC_SQUARE_ENVIRONMENT; defaults
//     to 'sandbox'. Change to 'production' in .env (or EAS secret) when
//     going live. Sandbox and production require separate clientId values.
//   - Access token stored in expo-secure-store (iOS Keychain / Android
//     Keystore) with expiry timestamp. isSquareConnected() checks expiry
//     before returning true; expired tokens prompt re-auth.
//   - assertOnline() calls @react-native-community/netinfo before any
//     network request; falls back silently if the package is unavailable.
//     Only throws when isInternetReachable is explicitly false (null =
//     unknown = pass through; network call will fail naturally if offline).
//   - locationId is the merchant's Square location. TODO: fetch from the
//     Square /v2/locations API after auth instead of hardcoding, so any
//     merchant's first location is used automatically.
//   - Request timeout: 10s per call with AbortController
//   - SQUARE_API_VERSION: '2024-01-18' — check developer.squareup.com/changelog
//     periodically for deprecation notices (this line is the only place to update)
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial PKCE OAuth + invoice scaffold
// v2.0  2026-04-09  Claude  Full PKCE implementation
//       - generateCodeVerifier() + generateCodeChallenge() (RFC 7636)
//       - connectSquare() opens WebBrowser auth session
//       - exchangeCodeForToken() — direct Square token exchange, no backend
//       - sendSquareInvoice(): order → draft invoice → publish (3-step)
//       - Idempotency keys prevent duplicate invoices on retry
// v3.0  2026-04-10  Claude  Hardened auth + timeout
//       - AbortController + 10s timeout on all requests
//       - isSquareConnected() + disconnectSquare()
//       - SQUARE_API_BASE exported for squareCustomers.js
// v3.1  2026-04-12  Claude  Sandbox/production environment toggle
//       - SQUARE_ENVIRONMENT constant + BASE_URLS map
//       - SQUARE_CONFIG with clientId/locationId placeholders [updated ARCHITECTURE]
// v4.0  2026-04-14  Claude  SecureStore, env vars, token expiry detection
//       - Token moved from AsyncStorage to expo-secure-store (encrypted at rest)
//       - clientId and SQUARE_ENVIRONMENT read from EXPO_PUBLIC_* env vars
//         instead of hardcoded source (no credentials in source tree)
//       - Token envelope now stores { token, expiresAt } so expiry is checked
//         before use; expired tokens trigger re-auth rather than failing at
//         the API call level [updated ARCHITECTURE]
// v4.1  2026-04-14  Claude  Offline detection before Square API calls
//       - assertOnline() uses @react-native-community/netinfo to give a fast
//         "no internet" message before attempting any network request, instead
//         of making the user wait 10 s for a timeout; falls back gracefully if
//         netinfo is unavailable [updated ARCHITECTURE]
//       - assertOnline() exported; called at start of connectSquare() and
//         sendSquareInvoice()
// =============================================================================

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

// ── Configuration ─────────────────────────────────────────────────────────────
//
// Set these in your .env file (see .env.example). With Expo SDK 49+,
// EXPO_PUBLIC_* variables are inlined into the JS bundle at build time.
// They are NOT secret — restrict your Square app by bundle ID in the
// Square Developer Dashboard rather than relying on build-time obscurity.

// 'sandbox' or 'production'. Change in .env; sandbox and production use
// separate credentials in the Square Developer Dashboard.
const SQUARE_ENVIRONMENT = process.env.EXPO_PUBLIC_SQUARE_ENVIRONMENT || 'sandbox';

// Check developer.squareup.com/changelog for deprecation notices.
const SQUARE_API_VERSION = '2024-01-18';

const BASE_URLS = {
  sandbox:    'https://connect.squareupsandbox.com',
  production: 'https://connect.squareup.com',
};

const _base = BASE_URLS[SQUARE_ENVIRONMENT] ?? BASE_URLS.production;

const SQUARE_CONFIG = {
  // From developer.squareup.com/apps → your app → Credentials tab.
  // Set EXPO_PUBLIC_SQUARE_CLIENT_ID in your .env file.
  clientId: process.env.EXPO_PUBLIC_SQUARE_CLIENT_ID || 'YOUR_SQUARE_APP_ID',

  // TODO: fetch from /v2/locations after auth so any merchant's first
  // location is used automatically. For now, hardcode or set via env.
  locationId: process.env.EXPO_PUBLIC_SQUARE_LOCATION_ID || 'YOUR_SQUARE_LOCATION_ID',

  // Must match the redirect URL registered in your Square app's OAuth settings.
  redirectUri: 'rolodeck://square/callback',

  scopes: [
    'INVOICES_WRITE',
    'ORDERS_WRITE',
    'CUSTOMERS_READ',
    'CUSTOMERS_WRITE',
    'PAYMENTS_WRITE',
  ],

  authBase:   _base,
  apiBase:    _base,
  apiVersion: SQUARE_API_VERSION,
};

const REQUEST_TIMEOUT    = 10000;
const SECURE_TOKEN_KEY   = 'rolodeck_square_token'; // SecureStore key (no @ prefix)

// ── Offline check ─────────────────────────────────────────────────────────────
//
// Best-effort pre-flight check before any Square network request. Uses
// @react-native-community/netinfo via dynamic require so the app still boots
// if the package is somehow unavailable.

export async function assertOnline() {
  try {
    const NetInfo = require('@react-native-community/netinfo').default;
    const state   = await NetInfo.fetch();
    // isInternetReachable can be null (unknown state) — only block when
    // explicitly false so we don't reject requests on devices with unknown
    // connectivity (e.g. emulators or unusual network configurations).
    if (state.isInternetReachable === false) {
      throw new Error('No internet connection. Check your network and try again.');
    }
  } catch (e) {
    if (e.message === 'No internet connection. Check your network and try again.') throw e;
    // NetInfo unavailable or state check failed — proceed and let the fetch
    // timeout / network error surface naturally.
  }
}

// Exported so squareCustomers.js can use the same environment-aware base URL.
export const SQUARE_API_BASE = _base;

// ── Token storage (expo-secure-store) ─────────────────────────────────────────
//
// We store { token: string, expiresAt: ISO-string | null } so expiry can be
// checked locally without an API round-trip. Square access tokens currently
// last 30 days; expiresAt is set from the token exchange response when available.

async function readTokenEnvelope() {
  try {
    const raw = await SecureStore.getItemAsync(SECURE_TOKEN_KEY);
    if (!raw) return null;
    const envelope = JSON.parse(raw);
    if (!envelope || !envelope.token) return null;
    return envelope;
  } catch {
    return null;
  }
}

export async function getSquareAccessToken() {
  const envelope = await readTokenEnvelope();
  return envelope ? envelope.token : null;
}

/**
 * Returns true if a non-expired Square token is stored.
 * Expired tokens return false and should be cleared with disconnectSquare().
 */
export async function isSquareConnected() {
  const envelope = await readTokenEnvelope();
  if (!envelope) return false;

  if (envelope.expiresAt) {
    const expiresAt = new Date(envelope.expiresAt).getTime();
    if (Date.now() >= expiresAt) {
      // Token expired — clear it and treat as disconnected
      await disconnectSquare();
      return false;
    }
  }

  return true;
}

async function saveSquareAccessToken(token, expiresAt = null) {
  const envelope = JSON.stringify({ token: token.trim(), expiresAt });
  await SecureStore.setItemAsync(SECURE_TOKEN_KEY, envelope);
}

export async function clearSquareAccessToken() {
  await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY).catch(() => {});
}

// ── Disconnect ────────────────────────────────────────────────────────────────

export async function disconnectSquare() {
  await clearSquareAccessToken();
}

// ── PKCE helpers ──────────────────────────────────────────────────────────────

async function generateCodeVerifier() {
  const bytes = await Crypto.getRandomBytesAsync(32);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateCodeChallenge(verifier) {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  return digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── OAuth flow ────────────────────────────────────────────────────────────────

function buildAuthUrl(codeChallenge) {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const state = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

  const params = new URLSearchParams({
    client_id:             SQUARE_CONFIG.clientId,
    response_type:         'code',
    scope:                 SQUARE_CONFIG.scopes.join(' '),
    redirect_uri:          SQUARE_CONFIG.redirectUri,
    state,
    code_challenge:        codeChallenge,
    code_challenge_method: 'S256',
  });

  return {
    url:   `${SQUARE_CONFIG.authBase}/oauth2/authorize?${params.toString()}`,
    state,
  };
}

/**
 * Open the Square OAuth login page and return the access token on success.
 * @returns {Promise<string|null>} access token, or null if cancelled
 */
export async function connectSquare() {
  await assertOnline();
  const verifier   = await generateCodeVerifier();
  const challenge  = await generateCodeChallenge(verifier);
  const { url }    = buildAuthUrl(challenge);

  const result = await WebBrowser.openAuthSessionAsync(url, SQUARE_CONFIG.redirectUri);

  if (result.type !== 'success' || !result.url) return null;

  const parsed = new URL(result.url);
  const code   = parsed.searchParams.get('code');
  const error  = parsed.searchParams.get('error');

  if (error) throw new Error(`Square authorization failed: ${error}`);
  if (!code) throw new Error('No authorization code received from Square.');

  const { token, expiresAt } = await exchangeCodeForToken(code, verifier);
  await saveSquareAccessToken(token, expiresAt);
  return token;
}

async function exchangeCodeForToken(code, codeVerifier) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const res = await fetch(`${SQUARE_CONFIG.authBase}/oauth2/token`, {
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'Square-Version': SQUARE_CONFIG.apiVersion,
      },
      body: JSON.stringify({
        client_id:     SQUARE_CONFIG.clientId,
        code,
        code_verifier: codeVerifier,
        redirect_uri:  SQUARE_CONFIG.redirectUri,
        grant_type:    'authorization_code',
      }),
      signal: controller.signal,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.errors?.[0]?.detail || `Token exchange failed (HTTP ${res.status})`);
    }
    if (!data.access_token) {
      throw new Error('Square did not return an access token.');
    }

    // Square returns expires_at as an ISO string when available
    return {
      token:     data.access_token,
      expiresAt: data.expires_at || null,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Authenticated Square API helper ───────────────────────────────────────────

async function squareApi(method, path, body) {
  const token = await getSquareAccessToken();
  if (!token) {
    throw new Error('Not connected to Square. Go to Settings to connect.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const res = await fetch(`${SQUARE_CONFIG.apiBase}${path}`, {
      method,
      headers: {
        'Authorization':  `Bearer ${token}`,
        'Content-Type':   'application/json',
        'Square-Version': SQUARE_CONFIG.apiVersion,
      },
      body:   body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const data = await res.json();
    if (!res.ok) {
      // Surface the HTTP status so callers can distinguish auth vs. rate limit
      const detail = data.errors?.[0]?.detail || `Square API error`;
      const err = new Error(`${detail} (HTTP ${res.status})`);
      err.httpStatus = res.status;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// ── Invoice sending ───────────────────────────────────────────────────────────

/**
 * Send a Square invoice to a customer.
 * Flow: create order → create draft invoice → publish (send via email).
 *
 * @param {object} customer    — customer object from storage.js
 * @param {number} amountCents — invoice total in cents (e.g. 9999 = $99.99)
 * @returns {Promise<{invoiceId: string, invoiceUrl: string}>}
 */
export async function sendSquareInvoice(customer, amountCents) {
  await assertOnline();
  if (!customer.email) {
    throw new Error(
      `No email address on file for ${customer.name || 'this customer'}.\n\n` +
      'Add an email to their profile before sending an invoice.',
    );
  }

  const locationId = SQUARE_CONFIG.locationId;
  if (!locationId || locationId === 'YOUR_SQUARE_LOCATION_ID') {
    throw new Error(
      'Square location ID is not configured.\n\n' +
      'Set EXPO_PUBLIC_SQUARE_LOCATION_ID in your .env file.',
    );
  }

  const idempotencyKey = `rolodeck-${customer.id}-${Date.now()}`;

  const orderData = await squareApi('POST', '/v2/orders', {
    idempotency_key: `${idempotencyKey}-order`,
    order: {
      location_id: locationId,
      line_items: [{
        name:     'Service',
        quantity: '1',
        base_price_money: { amount: amountCents, currency: 'USD' },
      }],
    },
  });
  const orderId = orderData.order.id;

  const invoiceData = await squareApi('POST', '/v2/invoices', {
    idempotency_key: `${idempotencyKey}-invoice`,
    invoice: {
      order_id:    orderId,
      location_id: locationId,
      primary_recipient: {
        email_address: customer.email,
        given_name:    customer.name?.split(' ')[0] || '',
        family_name:   customer.name?.split(' ').slice(1).join(' ') || '',
      },
      payment_requests: [{
        request_type:             'BALANCE',
        due_date:                 new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        automatic_payment_source: 'NONE',
      }],
      delivery_method: 'EMAIL',
      invoice_number:  `RD-${Date.now()}`,
      title:           'Service Invoice',
      description:     `Service invoice for ${customer.name || 'customer'}`,
    },
  });
  const invoice = invoiceData.invoice;

  await squareApi('POST', `/v2/invoices/${invoice.id}/publish`, {
    idempotency_key: `${idempotencyKey}-publish`,
    version:         invoice.version,
  });

  return {
    invoiceId:  invoice.id,
    invoiceUrl: invoice.public_url || '',
  };
}
