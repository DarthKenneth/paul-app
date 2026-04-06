// =============================================================================
// squarePlaceholder.js - Square OAuth + Invoicing integration
// Version: 3.0
// Last Updated: 2026-04-04
//
// PROJECT:      Rolodeck (project v1.5)
// FILES:        squarePlaceholder.js  (this file — OAuth flow + invoice API)
//               SettingsScreen.js     (Connect to Square button, disconnect)
//               InvoiceButton.js      (calls sendSquareInvoice)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - OAuth 2.0 + PKCE (RFC 7636) — no backend server required:
//       1. App generates code_verifier (32 random bytes, base64url-encoded)
//          and code_challenge (SHA-256 of verifier, base64url-encoded)
//       2. App opens Square's authorization URL with the code_challenge
//       3. User logs in and authorizes Rolodeck
//       4. Square redirects to rolodeck://square/callback?code=XXX
//       5. App exchanges code + code_verifier DIRECTLY with Square
//          (Square verifies the PKCE challenge; no client_secret needed)
//       6. App stores the access token in AsyncStorage
//   - Required setup:
//       1. Register app at https://developer.squareup.com/apps
//       2. Set redirect URL to: rolodeck://square/callback
//       3. Fill in SQUARE_CONFIG below (clientId, locationId)
//       4. Toggle SQUARE_ENVIRONMENT to 'production' when going live
//   - Required Square OAuth scopes: INVOICES_WRITE, ORDERS_WRITE,
//     CUSTOMERS_READ, PAYMENTS_WRITE
//   - Invoice flow (once connected):
//       1. POST /v2/orders — create an order for the amount
//       2. POST /v2/invoices — create a draft invoice referencing the order
//       3. POST /v2/invoices/{id}/publish — send it via email
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial placeholder scaffold
// v2.0  2026-04-03  Claude  Full rewrite for OAuth + invoice structure
//       - Added OAuth config, authorization URL builder, token exchange
//       - Added connectSquare() using expo-web-browser
//       - Restructured sendSquareInvoice() with full 3-step flow
//         (create order → create invoice → publish)
//       - Removed importSquareContacts (feature removed)
// v2.1  2026-04-04  Claude  Config + plumbing pass
//       - Added SQUARE_ENVIRONMENT flag with dynamic base URL selection
//       - Added locationId to SQUARE_CONFIG
//       - Updated backendTokenUrl to Vercel endpoint pattern
//       - sendSquareInvoice() reads locationId from config
// v3.0  2026-04-04  Claude  Replaced backend token exchange with PKCE
//       - Removed backend dependency entirely (no Vercel / server needed)
//       - Added generateCodeVerifier() and generateCodeChallenge() (expo-crypto)
//       - buildAuthUrl() now includes code_challenge + code_challenge_method=S256
//       - exchangeCodeForToken() calls Square directly with code_verifier
//       - Removed backendTokenUrl from config
//       - Removed unused Linking import
// =============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';

// ── Configuration — fill these in after registering at developer.squareup.com ─

// Toggle between 'sandbox' (free testing) and 'production' (live payments).
// Sandbox and production have SEPARATE app credentials in the Square Developer
// Dashboard — make sure clientId matches whichever environment this is set to.
const SQUARE_ENVIRONMENT = 'sandbox'; // TODO: change to 'production' when going live

const BASE_URLS = {
  sandbox:    'https://connect.squareupsandbox.com',
  production: 'https://connect.squareup.com',
};

const _base = BASE_URLS[SQUARE_ENVIRONMENT] ?? BASE_URLS.production;

const SQUARE_CONFIG = {
  // From developer.squareup.com/apps → your app → Credentials tab
  clientId:   'YOUR_SQUARE_APP_ID',       // TODO: Replace
  // From Square Dashboard → Account & Settings → Locations
  locationId: 'YOUR_SQUARE_LOCATION_ID',  // TODO: Replace
  // Must match the redirect URL registered in your Square app's OAuth settings
  redirectUri: 'rolodeck://square/callback',
  // Scopes needed for invoicing
  scopes: [
    'INVOICES_WRITE',
    'ORDERS_WRITE',
    'CUSTOMERS_READ',
    'PAYMENTS_WRITE',
  ],
  authBase:   _base,
  apiBase:    _base,
  apiVersion: '2024-01-18',
};

const SQUARE_TOKEN_KEY = '@rolodeck_square_token';
const REQUEST_TIMEOUT  = 10000;

// ── Token storage ─────────────────────────────────────────────────────────────

export async function getSquareAccessToken() {
  return AsyncStorage.getItem(SQUARE_TOKEN_KEY);
}

export async function saveSquareAccessToken(token) {
  await AsyncStorage.setItem(SQUARE_TOKEN_KEY, token.trim());
}

export async function clearSquareAccessToken() {
  await AsyncStorage.removeItem(SQUARE_TOKEN_KEY);
}

export async function isSquareConnected() {
  const token = await getSquareAccessToken();
  return !!token;
}

// ── PKCE helpers ──────────────────────────────────────────────────────────────

/**
 * Generate a PKCE code verifier: 32 cryptographically random bytes,
 * base64url-encoded (RFC 7636 §4.1).
 */
async function generateCodeVerifier() {
  const bytes = await Crypto.getRandomBytesAsync(32);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Derive the PKCE code challenge from a verifier:
 * BASE64URL(SHA-256(verifier)) per RFC 7636 §4.2.
 */
async function generateCodeChallenge(verifier) {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  return digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── OAuth flow ────────────────────────────────────────────────────────────────

/**
 * Build the Square OAuth authorization URL with PKCE challenge and CSRF state.
 */
function buildAuthUrl(codeChallenge) {
  const state = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, '0'),
  ).join('');

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
 * Uses PKCE — no backend server required.
 *
 * @returns {Promise<string|null>} access token, or null if cancelled
 */
export async function connectSquare() {
  const verifier   = await generateCodeVerifier();
  const challenge  = await generateCodeChallenge(verifier);
  const { url }    = buildAuthUrl(challenge);

  const result = await WebBrowser.openAuthSessionAsync(
    url,
    SQUARE_CONFIG.redirectUri,
  );

  if (result.type !== 'success' || !result.url) {
    return null;
  }

  const parsed = new URL(result.url);
  const code   = parsed.searchParams.get('code');
  const error  = parsed.searchParams.get('error');

  if (error) {
    throw new Error(`Square authorization failed: ${error}`);
  }
  if (!code) {
    throw new Error('No authorization code received from Square.');
  }

  const token = await exchangeCodeForToken(code, verifier);
  await saveSquareAccessToken(token);
  return token;
}

/**
 * Exchange an authorization code for an access token using PKCE.
 * Calls Square directly — no backend, no client_secret.
 *
 * @param {string} code         — authorization code from OAuth redirect
 * @param {string} codeVerifier — the verifier generated before opening the browser
 * @returns {Promise<string>} access token
 */
async function exchangeCodeForToken(code, codeVerifier) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const res = await fetch(`${SQUARE_CONFIG.authBase}/oauth2/token`, {
      method: 'POST',
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
    return data.access_token;
  } finally {
    clearTimeout(timer);
  }
}

// ── Disconnect ────────────────────────────────────────────────────────────────

/**
 * Disconnect from Square — removes the stored access token.
 */
export async function disconnectSquare() {
  await clearSquareAccessToken();
}

// ── Invoice sending ───────────────────────────────────────────────────────────

/**
 * Helper: make an authenticated request to the Square API.
 */
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
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.errors?.[0]?.detail || `Square API error (HTTP ${res.status})`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send a Square invoice to a customer.
 *
 * Flow:
 *   1. Create an order with a single line item for the amount
 *   2. Create a draft invoice referencing that order
 *   3. Publish the invoice (sends it via email)
 *
 * @param {object} customer    — customer object from storage.js
 * @param {number} amountCents — invoice total in cents (e.g. 9999 = $99.99)
 * @returns {Promise<{invoiceId: string, invoiceUrl: string}>}
 */
export async function sendSquareInvoice(customer, amountCents) {
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
      'Set SQUARE_CONFIG.locationId in squarePlaceholder.js.',
    );
  }

  const idempotencyKey = `rolodeck-${customer.id}-${Date.now()}`;

  // Step 1: Create an order
  const orderData = await squareApi('POST', '/v2/orders', {
    idempotency_key: `${idempotencyKey}-order`,
    order: {
      location_id: locationId,
      line_items: [{
        name:     'Service',
        quantity: '1',
        base_price_money: {
          amount:   amountCents,
          currency: 'USD',
        },
      }],
    },
  });
  const orderId = orderData.order.id;

  // Step 2: Create a draft invoice
  const invoiceData = await squareApi('POST', '/v2/invoices', {
    idempotency_key: `${idempotencyKey}-invoice`,
    invoice: {
      order_id:     orderId,
      location_id:  locationId,
      primary_recipient: {
        email_address: customer.email,
        given_name:    customer.name?.split(' ')[0] || '',
        family_name:   customer.name?.split(' ').slice(1).join(' ') || '',
      },
      payment_requests: [{
        request_type:             'BALANCE',
        due_date:                 new Date(Date.now() + 30 * 86400000)
                                    .toISOString().split('T')[0],
        automatic_payment_source: 'NONE',
      }],
      delivery_method: 'EMAIL',
      invoice_number:  `RD-${Date.now()}`,
      title:           'Service Invoice',
      description:     `Service invoice for ${customer.name || 'customer'}`,
    },
  });
  const invoice = invoiceData.invoice;

  // Step 3: Publish (send) the invoice
  await squareApi('POST', `/v2/invoices/${invoice.id}/publish`, {
    idempotency_key: `${idempotencyKey}-publish`,
    version: invoice.version,
  });

  return {
    invoiceId:  invoice.id,
    invoiceUrl: invoice.public_url || '',
  };
}
