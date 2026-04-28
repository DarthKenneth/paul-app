// =============================================================================
// squareCustomers.js - Square Customers API calls (paginated fetch, create, update)
// Version: 1.1.1
// Last Updated: 2026-04-25
//
// PROJECT:      Callout (project v1.3.0)
// FILES:        squareCustomers.js    (this file — Square Customers API wrapper)
//               squarePlaceholder.js  (getSquareAccessToken, SQUARE_API_BASE)
//               squareSync.js         (calls all exports here as orchestrator)
//               mergeLogic.js         (mapRolodeckToSquare used by pushLocalCustomers)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Imports getSquareAccessToken + SQUARE_API_BASE from squarePlaceholder.js
//     so the environment (sandbox/production) stays in one place
//   - squareFetch(): private fetch helper with 3-attempt retry on 429 (rate limit)
//     and on network timeout (15s); non-retriable errors throw immediately
//   - fetchAllSquareCustomers(): handles cursor pagination automatically — loops
//     until no cursor is returned in the response, collecting all pages first
//   - createSquareCustomer(): POST /v2/customers — returns the full customer object
//   - updateSquareCustomer(): PUT /v2/customers/{id}
//   - getSquareCustomer():   GET /v2/customers/{id}
//
// CHANGE LOG:
// v1.0  2026-04-12  Claude  Initial implementation
//       - squareFetch() with 3-attempt retry (429, timeout)
//       - fetchAllSquareCustomers() with cursor pagination
//       - createSquareCustomer(), updateSquareCustomer(), getSquareCustomer()
// v1.1  2026-04-14  Claude  Error surfacing + wall-clock timeout cap
//       - squareFetch() now attaches httpStatus to thrown errors so callers
//         can distinguish 401 (bad token) from 429 (rate limit) from 5xx
//       - Added MAX_TOTAL_MS (30s) wall-clock cap: if retries exhaust the
//         budget the loop bails out even if attempts remain
// v1.1.1  2026-04-25  Claude  Rename rolodeck → callout idempotency key prefix
// =============================================================================

import { getSquareAccessToken, SQUARE_API_BASE } from './squarePlaceholder';

const SQUARE_API_VERSION = '2024-01-18'; // check developer.squareup.com/changelog periodically
const REQUEST_TIMEOUT    = 15000;
const MAX_RETRIES        = 3;
const MAX_TOTAL_MS       = 30000; // wall-clock cap across all retry attempts

// ── Private fetch helper ──────────────────────────────────────────────────────

async function squareFetch(method, path, body, token) {
  let lastErr;
  const deadline = Date.now() + MAX_TOTAL_MS;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential back-off: 1s, 2s for attempts 1 and 2
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }

    // Bail out if we've spent the wall-clock budget
    if (Date.now() >= deadline) break;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const res = await fetch(`${SQUARE_API_BASE}${path}`, {
        method,
        headers: {
          Authorization:    `Bearer ${token}`,
          'Content-Type':   'application/json',
          'Square-Version': SQUARE_API_VERSION,
        },
        body:   body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 429) {
        lastErr = new Error('Square rate limit exceeded (HTTP 429). Retrying…');
        lastErr.httpStatus = 429;
        continue;
      }

      const data = await res.json();
      if (!res.ok) {
        // Attach httpStatus so callers can distinguish 401 (bad token),
        // 429 (rate limit), 5xx (Square outage), etc.
        const detail = data.errors?.[0]?.detail || 'Square API error';
        const err = new Error(`${detail} (HTTP ${res.status})`);
        err.httpStatus = res.status;
        throw err; // Non-retriable (not 429, not timeout)
      }
      return data;
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        lastErr = new Error('Square request timed out after 15s.');
        continue;
      }
      throw err; // Non-retriable — propagate immediately
    }
  }

  throw lastErr || new Error('Square API request failed after retries.');
}

// ── Exported API calls ────────────────────────────────────────────────────────

/**
 * Fetch all Square customers, handling cursor pagination.
 * Loops until no cursor is returned, collecting every page into one array.
 *
 * @returns {Promise<Array>} flat array of all Square customer objects
 */
export async function fetchAllSquareCustomers() {
  const token = await getSquareAccessToken();
  if (!token) throw new Error('NOT_CONNECTED');

  const all = [];
  let cursor = null;

  do {
    const path = cursor
      ? `/v2/customers?cursor=${encodeURIComponent(cursor)}`
      : '/v2/customers';

    const data = await squareFetch('GET', path, null, token);
    if (Array.isArray(data.customers)) {
      all.push(...data.customers);
    }
    cursor = data.cursor || null;
  } while (cursor);

  return all;
}

/**
 * Fetch a single Square customer by ID.
 *
 * @param {string} squareId
 * @returns {Promise<object>} Square customer object
 */
export async function getSquareCustomer(squareId) {
  const token = await getSquareAccessToken();
  if (!token) throw new Error('NOT_CONNECTED');

  const data = await squareFetch('GET', `/v2/customers/${squareId}`, null, token);
  return data.customer;
}

/**
 * Create a new customer in Square.
 *
 * @param {object} customerBody — field map ready for Square API (given_name, email_address, etc.)
 * @returns {Promise<object>} the created Square customer object
 */
export async function createSquareCustomer(customerBody) {
  const token = await getSquareAccessToken();
  if (!token) throw new Error('NOT_CONNECTED');

  const idempotencyKey = `callcard-create-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const data = await squareFetch('POST', '/v2/customers', {
    idempotency_key: idempotencyKey,
    ...customerBody,
  }, token);
  return data.customer;
}

/**
 * Update an existing Square customer by ID.
 *
 * @param {string} squareId
 * @param {object} updates  — partial Square customer field map
 * @returns {Promise<object>} updated Square customer object
 */
export async function updateSquareCustomer(squareId, updates) {
  const token = await getSquareAccessToken();
  if (!token) throw new Error('NOT_CONNECTED');

  const data = await squareFetch('PUT', `/v2/customers/${squareId}`, updates, token);
  return data.customer;
}
