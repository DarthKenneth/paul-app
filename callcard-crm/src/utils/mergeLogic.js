// =============================================================================
// mergeLogic.js - Square ↔ Callout customer match and merge algorithm (pure)
// Version: 1.2
// Last Updated: 2026-04-25
//
// PROJECT:      Callout (project v1.3.0)
// FILES:        mergeLogic.js         (this file — pure match/merge functions)
//               squareSync.js         (orchestrates: calls matchCustomers,
//                                      mergeSquareIntoCallout, mapSquareToCallout,
//                                      mapCalloutToSquare)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - All functions are pure (no I/O, no async). squareSync.js handles storage.
//   - matchCustomers(): bucket classification in priority order:
//       1. squareCustomerId match  → MATCHED (confident)
//       2. email match (case-insensitive) → MATCHED (confident)
//       3. phone match (digits only) → MATCHED (confident)
//       4. name match (lower+trim) → LOW_CONF (flagged for user review)
//     A Callout record can only be matched once. The first confident match wins.
//   - mergeSquareIntoCallout(): fills EMPTY Callout fields from Square; never
//     overwrites. Detects conflicts where both sides have different non-empty
//     values (email, phone, address, zipCode). notes are appended if different.
//   - mapSquareToCallout(): builds a new Callout customer object from a Square
//     customer (used for NEW records in Step 5).
//   - mapCalloutToSquare(): builds a Square API body from a Callout customer
//     (used for Step 6 Push).
//
// SCHEMA (field map used here):
//   Square field                          → Callout field
//   given_name + family_name              → name
//   email_address                         → email
//   phone_number                          → phone
//   address (composite)                   → address
//   address.postal_code                   → zipCode
//   note                                  → notes (append)
//   id                                    → squareCustomerId
//
// CHANGE LOG:
// v1.0  2026-04-12  Claude  Initial implementation
//       - matchCustomers() with priority-1/2/3 confident + priority-4 low-conf
//       - mergeSquareIntoRolodeck() fill-empty + conflict detection
//       - mapSquareToRolodeck() for new record creation
//       - mapRolodeckToSquare() for push-to-Square
// v1.1  2026-04-25  Claude  Rename rolodeck → callout throughout
//       - matchCustomers() param rolodeckList → calloutList; matched/lowConf
//         objects use callout property instead of rolodeck
//       - mergeSquareIntoRolodeck → mergeSquareIntoCallout (param + name)
//       - mapSquareToRolodeck → mapSquareToCallout
//       - mapRolodeckToSquare → mapCalloutToSquare
//       - Conflict object keys: { square, rolodeck } → { square, callout }
// =============================================================================

// ── Internal helpers ──────────────────────────────────────────────────────────

function normalizePhone(p) {
  return (p || '').replace(/\D/g, '');
}

function normalizeName(n) {
  return (n || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function squareFullName(sq) {
  return [sq.given_name, sq.family_name].filter(Boolean).join(' ');
}

function buildSquareAddress(addr) {
  if (!addr) return '';
  return [
    addr.address_line_1,
    addr.locality,
    addr.administrative_district_level_1,
    addr.postal_code,
  ]
    .filter(Boolean)
    .join(', ');
}

// ── matchCustomers ────────────────────────────────────────────────────────────

/**
 * Classify Square customers against Callout customers into four buckets.
 *
 * @param {Array} squareList   — Square customer objects (from /v2/customers)
 * @param {Array} calloutList  — Callout customer objects (non-archived)
 * @returns {{
 *   matched:   [{ square, callout, matchType: 'id'|'email'|'phone' }],
 *   lowConf:   [{ square, callout }],
 *   newInSquare: [squareCustomer],
 *   localOnly:   [calloutCustomer],
 * }}
 */
export function matchCustomers(squareList, calloutList) {
  const matched     = [];
  const lowConf     = [];
  const newInSquare = [];
  const matchedCalloutIds = new Set();

  for (const sq of squareList) {
    let result = null;

    // Priority 1: squareCustomerId field (already linked). Filter out callouts
    // already matched in this run so a duplicate Square ID (rare but possible
    // across paginated fetches or race conditions) cannot double-claim one
    // local record.
    const byId = calloutList.find(
      (r) => r.squareCustomerId && r.squareCustomerId === sq.id && !matchedCalloutIds.has(r.id),
    );
    if (byId) {
      result = { square: sq, callout: byId, matchType: 'id' };
    }

    // Priority 2: email (case-insensitive)
    if (!result) {
      const sqEmail = (sq.email_address || '').toLowerCase();
      if (sqEmail) {
        const byEmail = calloutList.find(
          (r) =>
            !matchedCalloutIds.has(r.id) &&
            (r.email || '').toLowerCase() === sqEmail,
        );
        if (byEmail) result = { square: sq, callout: byEmail, matchType: 'email' };
      }
    }

    // Priority 3: phone (digits only)
    if (!result) {
      const sqPhone = normalizePhone(sq.phone_number);
      if (sqPhone) {
        const byPhone = calloutList.find(
          (r) =>
            !matchedCalloutIds.has(r.id) &&
            normalizePhone(r.phone) === sqPhone,
        );
        if (byPhone) result = { square: sq, callout: byPhone, matchType: 'phone' };
      }
    }

    if (result) {
      matched.push(result);
      matchedCalloutIds.add(result.callout.id);
      continue;
    }

    // Priority 4: name match — low confidence only
    const sqName = normalizeName(squareFullName(sq));
    if (sqName) {
      const byName = calloutList.find(
        (r) =>
          !matchedCalloutIds.has(r.id) &&
          normalizeName(r.name) === sqName,
      );
      if (byName) {
        lowConf.push({ square: sq, callout: byName });
        matchedCalloutIds.add(byName.id);
        continue;
      }
    }

    // No match found
    newInSquare.push(sq);
  }

  const localOnly = calloutList.filter((r) => !matchedCalloutIds.has(r.id));

  return { matched, lowConf, newInSquare, localOnly };
}

// ── mergeSquareIntoCallout ────────────────────────────────────────────────────

/**
 * Compute the field updates needed to merge Square data into a Callout customer.
 * - Only fills EMPTY Callout fields (never overwrites existing data).
 * - Detects conflicts where both sides have different non-empty values.
 * - Appends Square note to Callout notes if the text is new.
 * - Always sets squareCustomerId, squareSyncedAt, squareSyncStatus.
 *
 * @param {object} callout — existing Callout customer
 * @param {object} square  — Square customer object
 * @returns {{ merged: object, conflicts: object }}
 *   merged:    fields to apply via updateCustomer()
 *   conflicts: { fieldName: { square: val, callout: val } }
 */
export function mergeSquareIntoCallout(callout, square) {
  const merged    = {};
  const conflicts = {};

  const sqEmail   = square.email_address || '';
  const sqPhone   = square.phone_number  || '';
  const sqAddress = buildSquareAddress(square.address);
  const sqZip     = square.address?.postal_code || '';
  const sqNote    = square.note || '';

  // Always link
  merged.squareCustomerId = square.id;
  merged.squareSyncedAt   = new Date().toISOString();

  // email
  if (!callout.email && sqEmail) {
    merged.email = sqEmail;
  } else if (callout.email && sqEmail &&
             callout.email.toLowerCase() !== sqEmail.toLowerCase()) {
    conflicts.email = { square: sqEmail, callout: callout.email };
  }

  // phone
  if (!callout.phone && sqPhone) {
    merged.phone = sqPhone;
  } else if (callout.phone && sqPhone &&
             normalizePhone(callout.phone) !== normalizePhone(sqPhone)) {
    conflicts.phone = { square: sqPhone, callout: callout.phone };
  }

  // address
  if (!callout.address && sqAddress) {
    merged.address = sqAddress;
  } else if (callout.address && sqAddress && callout.address !== sqAddress) {
    conflicts.address = { square: sqAddress, callout: callout.address };
  }

  // zipCode
  if (!callout.zipCode && sqZip) {
    merged.zipCode = sqZip;
  } else if (callout.zipCode && sqZip && callout.zipCode !== sqZip) {
    conflicts.zipCode = { square: sqZip, callout: callout.zipCode };
  }

  // notes — append the Square note if we have not already appended this
  // exact block. Substring containment is fragile: e.g. existing "Bobby"
  // would falsely match an incoming "Bob" and the new note would be dropped.
  // Compare against the literal append fragment instead.
  if (sqNote) {
    const existingNotes = callout.notes || '';
    const appendBlock = `[From Square] ${sqNote}`;
    if (!existingNotes) {
      merged.notes = sqNote;
    } else if (!existingNotes.includes(appendBlock)) {
      merged.notes = `${existingNotes}\n\n${appendBlock}`;
    }
  }

  const hasConflicts = Object.keys(conflicts).length > 0;
  merged.squareSyncStatus   = hasConflicts ? 'conflict' : 'synced';
  merged.squareConflictData = hasConflicts ? conflicts : null;

  return { merged, conflicts };
}

// ── mapSquareToCallout ────────────────────────────────────────────────────────

/**
 * Convert a Square customer object to a new Callout customer record shape.
 * Used when creating a net-new Callout entry from an unmatched Square customer.
 *
 * @param {object} sq — Square customer object
 * @returns {object} data suitable for addCustomer()
 */
export function mapSquareToCallout(sq) {
  return {
    name:               squareFullName(sq),
    email:              sq.email_address || '',
    phone:              sq.phone_number  || '',
    address:            buildSquareAddress(sq.address),
    zipCode:            sq.address?.postal_code || '',
    notes:              sq.note || '',
    squareCustomerId:   sq.id,
    squareSyncedAt:     new Date().toISOString(),
    squareSyncStatus:   'synced',
    squareConflictData: null,
  };
}

// ── mapCalloutToSquare ────────────────────────────────────────────────────────

/**
 * Build a Square Customers API request body from a Callout customer.
 * Used when pushing local-only Callout customers to Square.
 *
 * @param {object} c — Callout customer object
 * @returns {object} Square API customer body (undefined fields omitted)
 */
export function mapCalloutToSquare(c) {
  const nameParts  = (c.name || '').trim().split(/\s+/);
  const givenName  = nameParts[0] || '';
  const familyName = nameParts.slice(1).join(' ') || '';

  const body = {
    given_name:    givenName  || undefined,
    family_name:   familyName || undefined,
    email_address: c.email || undefined,
    phone_number:  c.phone || undefined,
    note:          c.notes || undefined,
  };

  // Remove undefined fields so Square doesn't complain about empty strings
  Object.keys(body).forEach((k) => {
    if (body[k] === undefined) delete body[k];
  });

  return body;
}
