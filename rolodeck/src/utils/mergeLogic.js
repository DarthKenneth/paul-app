// =============================================================================
// mergeLogic.js - Square ↔ Rolodeck customer match and merge algorithm (pure)
// Version: 1.0
// Last Updated: 2026-04-12
//
// PROJECT:      Rolodeck (project v0.20)
// FILES:        mergeLogic.js         (this file — pure match/merge functions)
//               squareSync.js         (orchestrates: calls matchCustomers,
//                                      mergeSquareIntoRolodeck, mapSquareToRolodeck,
//                                      mapRolodeckToSquare)
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
//     A Rolodeck record can only be matched once. The first confident match wins.
//   - mergeSquareIntoRolodeck(): fills EMPTY Rolodeck fields from Square; never
//     overwrites. Detects conflicts where both sides have different non-empty
//     values (email, phone, address, zipCode). notes are appended if different.
//   - mapSquareToRolodeck(): builds a new Rolodeck customer object from a Square
//     customer (used for NEW records in Step 5).
//   - mapRolodeckToSquare(): builds a Square API body from a Rolodeck customer
//     (used for Step 6 Push).
//
// SCHEMA (field map used here):
//   Square field                          → Rolodeck field
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
 * Classify Square customers against Rolodeck customers into four buckets.
 *
 * @param {Array} squareList    — Square customer objects (from /v2/customers)
 * @param {Array} rolodeckList  — Rolodeck customer objects (non-archived)
 * @returns {{
 *   matched:   [{ square, rolodeck, matchType: 'id'|'email'|'phone' }],
 *   lowConf:   [{ square, rolodeck }],
 *   newInSquare: [squareCustomer],
 *   localOnly:   [rolodeckCustomer],
 * }}
 */
export function matchCustomers(squareList, rolodeckList) {
  const matched     = [];
  const lowConf     = [];
  const newInSquare = [];
  const matchedRoloIds = new Set();

  for (const sq of squareList) {
    let result = null;

    // Priority 1: squareCustomerId field (already linked)
    const byId = rolodeckList.find(
      (r) => r.squareCustomerId && r.squareCustomerId === sq.id,
    );
    if (byId) {
      result = { square: sq, rolodeck: byId, matchType: 'id' };
    }

    // Priority 2: email (case-insensitive)
    if (!result) {
      const sqEmail = (sq.email_address || '').toLowerCase();
      if (sqEmail) {
        const byEmail = rolodeckList.find(
          (r) =>
            !matchedRoloIds.has(r.id) &&
            (r.email || '').toLowerCase() === sqEmail,
        );
        if (byEmail) result = { square: sq, rolodeck: byEmail, matchType: 'email' };
      }
    }

    // Priority 3: phone (digits only)
    if (!result) {
      const sqPhone = normalizePhone(sq.phone_number);
      if (sqPhone) {
        const byPhone = rolodeckList.find(
          (r) =>
            !matchedRoloIds.has(r.id) &&
            normalizePhone(r.phone) === sqPhone,
        );
        if (byPhone) result = { square: sq, rolodeck: byPhone, matchType: 'phone' };
      }
    }

    if (result) {
      matched.push(result);
      matchedRoloIds.add(result.rolodeck.id);
      continue;
    }

    // Priority 4: name match — low confidence only
    const sqName = normalizeName(squareFullName(sq));
    if (sqName) {
      const byName = rolodeckList.find(
        (r) =>
          !matchedRoloIds.has(r.id) &&
          normalizeName(r.name) === sqName,
      );
      if (byName) {
        lowConf.push({ square: sq, rolodeck: byName });
        matchedRoloIds.add(byName.id);
        continue;
      }
    }

    // No match found
    newInSquare.push(sq);
  }

  const localOnly = rolodeckList.filter((r) => !matchedRoloIds.has(r.id));

  return { matched, lowConf, newInSquare, localOnly };
}

// ── mergeSquareIntoRolodeck ───────────────────────────────────────────────────

/**
 * Compute the field updates needed to merge Square data into a Rolodeck customer.
 * - Only fills EMPTY Rolodeck fields (never overwrites existing data).
 * - Detects conflicts where both sides have different non-empty values.
 * - Appends Square note to Rolodeck notes if the text is new.
 * - Always sets squareCustomerId, squareSyncedAt, squareSyncStatus.
 *
 * @param {object} rolodeck — existing Rolodeck customer
 * @param {object} square   — Square customer object
 * @returns {{ merged: object, conflicts: object }}
 *   merged:    fields to apply via updateCustomer()
 *   conflicts: { fieldName: { square: val, rolodeck: val } }
 */
export function mergeSquareIntoRolodeck(rolodeck, square) {
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
  if (!rolodeck.email && sqEmail) {
    merged.email = sqEmail;
  } else if (rolodeck.email && sqEmail &&
             rolodeck.email.toLowerCase() !== sqEmail.toLowerCase()) {
    conflicts.email = { square: sqEmail, rolodeck: rolodeck.email };
  }

  // phone
  if (!rolodeck.phone && sqPhone) {
    merged.phone = sqPhone;
  } else if (rolodeck.phone && sqPhone &&
             normalizePhone(rolodeck.phone) !== normalizePhone(sqPhone)) {
    conflicts.phone = { square: sqPhone, rolodeck: rolodeck.phone };
  }

  // address
  if (!rolodeck.address && sqAddress) {
    merged.address = sqAddress;
  } else if (rolodeck.address && sqAddress && rolodeck.address !== sqAddress) {
    conflicts.address = { square: sqAddress, rolodeck: rolodeck.address };
  }

  // zipCode
  if (!rolodeck.zipCode && sqZip) {
    merged.zipCode = sqZip;
  } else if (rolodeck.zipCode && sqZip && rolodeck.zipCode !== sqZip) {
    conflicts.zipCode = { square: sqZip, rolodeck: rolodeck.zipCode };
  }

  // notes — append Square note if not already present
  if (sqNote) {
    const existingNotes = rolodeck.notes || '';
    if (!existingNotes) {
      merged.notes = sqNote;
    } else if (!existingNotes.includes(sqNote)) {
      merged.notes = `${existingNotes}\n\n[From Square] ${sqNote}`;
    }
  }

  const hasConflicts = Object.keys(conflicts).length > 0;
  merged.squareSyncStatus   = hasConflicts ? 'conflict' : 'synced';
  merged.squareConflictData = hasConflicts ? conflicts : null;

  return { merged, conflicts };
}

// ── mapSquareToRolodeck ───────────────────────────────────────────────────────

/**
 * Convert a Square customer object to a new Rolodeck customer record shape.
 * Used when creating a net-new Rolodeck entry from an unmatched Square customer.
 *
 * @param {object} sq — Square customer object
 * @returns {object} data suitable for addCustomer()
 */
export function mapSquareToRolodeck(sq) {
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

// ── mapRolodeckToSquare ───────────────────────────────────────────────────────

/**
 * Build a Square Customers API request body from a Rolodeck customer.
 * Used when pushing local-only Rolodeck customers to Square.
 *
 * @param {object} rolo — Rolodeck customer object
 * @returns {object} Square API customer body (undefined fields omitted)
 */
export function mapRolodeckToSquare(rolo) {
  const nameParts  = (rolo.name || '').trim().split(/\s+/);
  const givenName  = nameParts[0] || '';
  const familyName = nameParts.slice(1).join(' ') || '';

  const body = {
    given_name:    givenName  || undefined,
    family_name:   familyName || undefined,
    email_address: rolo.email || undefined,
    phone_number:  rolo.phone || undefined,
    note:          rolo.notes || undefined,
  };

  // Remove undefined fields so Square doesn't complain about empty strings
  Object.keys(body).forEach((k) => {
    if (body[k] === undefined) delete body[k];
  });

  return body;
}
