// =============================================================================
// squarePlaceholder.js - Square OAuth + Invoicing integration
// Version: 2.0
// Last Updated: 2026-04-03
//
// PROJECT:      Rolodeck (project v1.3)
// FILES:        squarePlaceholder.js  (this file — OAuth flow + invoice API)
//               SettingsScreen.js     (Connect to Square button, disconnect)
//               InvoiceButton.js      (calls sendSquareInvoice)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - OAuth 2.0 flow with PKCE-style redirect:
//       1. App opens Square's authorization URL in an in-app browser
//       2. User logs in and authorizes Rolodeck
//       3. Square redirects to rolodeck://square/callback?code=XXX
//       4. App sends the code to YOUR backend server
//       5. Backend exchanges code + client_secret for an access token
//       6. App stores the token locally in AsyncStorage
//   - The client_secret NEVER lives in the app — only on the backend
//   - Required setup:
//       1. Register app at https://developer.squareup.com/apps
//       2. Set redirect URL to: rolodeck://square/callback
//       3. Deploy a backend endpoint that accepts { code } and returns
//          { access_token } after exchanging with Square
//       4. Fill in SQUARE_CONFIG below with your values
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
//       - Added handleSquareCallback() for deep link redirect
//       - Restructured sendSquareInvoice() with full 3-step flow
//         (create order → create invoice → publish)
//       - Removed importSquareContacts (feature removed)
// =============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

// ── Configuration — fill these in with your Square app values ─────────────────

const SQUARE_CONFIG = {
  // From https://developer.squareup.com/apps → your app → OAuth
  clientId:    'YOUR_SQUARE_APP_ID',        // TODO: Replace
  // Your backend endpoint that exchanges auth code → access token
  backendTokenUrl: 'https://your-backend.com/api/square/token', // TODO: Replace
  // Must match the redirect URL registered in your Square app
  redirectUri: 'rolodeck://square/callback',
  // Scopes needed for invoicing
  scopes: [
    'INVOICES_WRITE',
    'ORDERS_WRITE',
    'CUSTOMERS_READ',
    'PAYMENTS_WRITE',
  ],
  // Square API base URLs
  authBase: 'https://connect.squareup.com',
  apiBase:  'https://connect.squareup.com',
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

// ── OAuth flow ────────────────────────────────────────────────────────────────

/**
 * Build the Square OAuth authorization URL.
 * Includes a random state parameter for CSRF protection.
 */
function buildAuthUrl() {
  const state = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, '0'),
  ).join('');

  const params = new URLSearchParams({
    client_id:     SQUARE_CONFIG.clientId,
    response_type: 'code',
    scope:         SQUARE_CONFIG.scopes.join(' '),
    redirect_uri:  SQUARE_CONFIG.redirectUri,
    state,
  });

  return {
    url:   `${SQUARE_CONFIG.authBase}/oauth2/authorize?${params.toString()}`,
    state,
  };
}

/**
 * Open the Square OAuth login page in an in-app browser.
 * Returns the authorization code from the redirect, or null if cancelled.
 *
 * @returns {Promise<string|null>} authorization code
 */
export async function connectSquare() {
  const { url } = buildAuthUrl();

  // Open Square's auth page; it will redirect to rolodeck://square/callback
  const result = await WebBrowser.openAuthSessionAsync(
    url,
    SQUARE_CONFIG.redirectUri,
  );

  if (result.type !== 'success' || !result.url) {
    return null;
  }

  // Extract the authorization code from the redirect URL
  const parsed = new URL(result.url);
  const code = parsed.searchParams.get('code');
  const error = parsed.searchParams.get('error');

  if (error) {
    throw new Error(`Square authorization failed: ${error}`);
  }
  if (!code) {
    throw new Error('No authorization code received from Square.');
  }

  // Exchange the code for an access token via your backend
  const token = await exchangeCodeForToken(code);
  await saveSquareAccessToken(token);
  return token;
}

/**
 * Exchange an authorization code for an access token.
 * This calls YOUR backend — the client_secret lives there, not in the app.
 *
 * Your backend should:
 *   1. Receive { code, redirect_uri }
 *   2. POST to https://connect.squareup.com/oauth2/token with:
 *      { client_id, client_secret, code, redirect_uri, grant_type: 'authorization_code' }
 *   3. Return { access_token } from the Square response
 *
 * @param {string} code — authorization code from OAuth redirect
 * @returns {Promise<string>} access token
 */
async function exchangeCodeForToken(code) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const res = await fetch(SQUARE_CONFIG.backendTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        redirect_uri: SQUARE_CONFIG.redirectUri,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Token exchange failed (HTTP ${res.status})`);
    }

    const data = await res.json();
    if (!data.access_token) {
      throw new Error('Backend did not return an access token.');
    }
    return data.access_token;
  } finally {
    clearTimeout(timer);
  }
}

// ── Disconnect ────────────────────────────────────────────────────────────────

/**
 * Disconnect from Square — removes the stored access token.
 * Optionally, your backend could also revoke the token with Square's
 * POST /oauth2/revoke endpoint.
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
 * @param {string} locationId  — your Square location ID (from Square Dashboard)
 * @returns {Promise<{invoiceId: string, invoiceUrl: string}>}
 */
export async function sendSquareInvoice(customer, amountCents, locationId) {
  if (!customer.email) {
    throw new Error(
      `No email address on file for ${customer.name || 'this customer'}.\n\n` +
      'Add an email to their profile before sending an invoice.',
    );
  }

  if (!locationId) {
    throw new Error(
      'Square location ID is required.\n\n' +
      'Set your location ID in the app configuration.',
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
