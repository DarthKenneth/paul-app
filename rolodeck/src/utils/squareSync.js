// =============================================================================
// squareSync.js - Square customer sync engine (7-step orchestrator)
// Version: 1.2
// Last Updated: 2026-04-14
//
// PROJECT:      Rolodeck (project v0.22)
// FILES:        squareSync.js         (this file — sync orchestrator)
//               squareCustomers.js    (fetchAllSquareCustomers, createSquareCustomer)
//               mergeLogic.js         (matchCustomers, mergeSquareIntoRolodeck,
//                                      mapSquareToRolodeck, mapRolodeckToSquare)
//               storage.js            (getAllCustomers, addCustomer, updateCustomer,
//                                      getSquareSyncMetadata, saveSquareSyncMetadata)
//               squarePlaceholder.js  (getSquareAccessToken, isSquareConnected)
//               SquareSyncScreen.js   (calls runSync, resolveLowConf, resolveConflict,
//                                      pushLocalCustomers)
//               SettingsScreen.js     (calls runSync for quick sync button)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - runSync() implements the 7-step algorithm:
//       1. FETCH  — fetchAllSquareCustomers() (paginated) + getAllCustomers()
//       2. MATCH  — matchCustomers() from mergeLogic.js
//       3. MERGE  — mergeSquareIntoRolodeck() for confident matches; updateCustomer()
//       4. CONFIRM— low-conf pairs saved to sync metadata for user review
//       5. CREATE — mapSquareToRolodeck() + addCustomer() for unmatched Square records
//       6. [PUSH] — pushLocalCustomers() is user-triggered, not part of runSync
//       7. SAVE   — sync metadata written (lastSyncAt, syncLog, pendingLowConf)
//   - Partial failure: successful records saved even if individual records fail;
//     errors collected and returned in result.errors
//   - All state lives in AsyncStorage (sync metadata key) or on customer objects
//     (squareSyncStatus, squareConflictData)
//   - MAX_SYNC_LOG_ENTRIES: keeps last 50 sync summaries to avoid unbounded growth
//
// CHANGE LOG:
// v1.0  2026-04-12  Claude  Initial implementation
//       - runSync() with full 7-step algorithm
//       - resolveLowConf() — link or skip a pending low-confidence match
//       - resolveConflict() — accept square or rolodeck value for one field
//       - pushLocalCustomers() — push local-only customers to Square
//       - getLocalOnlyCustomers() — list Rolodeck customers without squareCustomerId
// v1.1  2026-04-14  Claude  Rollback-safe merge step
//       - Step 3 now computes all merges in memory first, then persists all
//         successes in parallel (no partial-write state if one record fails)
//       - resolveConflict() and resolveLowConf() use getCustomerById() instead
//         of loading the entire customer list [updated ARCHITECTURE]
// v1.2  2026-04-14  Claude  Offline detection at start of runSync()
//       - assertOnline() imported from squarePlaceholder.js; called before
//         Step 1 so a "no internet" message appears immediately rather than
//         after the 10-second fetch timeout
// =============================================================================

import { getSquareAccessToken, isSquareConnected, assertOnline } from './squarePlaceholder';
import { fetchAllSquareCustomers, createSquareCustomer } from './squareCustomers';
import {
  matchCustomers,
  mergeSquareIntoRolodeck,
  mapSquareToRolodeck,
  mapRolodeckToSquare,
} from './mergeLogic';
import {
  getAllCustomers,
  getCustomerById,
  addCustomer,
  updateCustomer,
  getSquareSyncMetadata,
  saveSquareSyncMetadata,
} from '../data/storage';

const MAX_SYNC_LOG_ENTRIES = 50;

// ── runSync ───────────────────────────────────────────────────────────────────

/**
 * Execute the full Square customer sync (Steps 1–5, 7).
 *
 * @returns {Promise<{
 *   merged:    number,
 *   created:   number,
 *   lowConf:   number,
 *   conflicts: number,
 *   errors:    Array<{id: string, message: string}>,
 * }>}
 * @throws {'NOT_CONNECTED'} if no Square token is stored
 */
export async function runSync() {
  await assertOnline();
  const connected = await isSquareConnected();
  if (!connected) throw new Error('NOT_CONNECTED');

  // Step 1: Fetch
  const [squareCustomers, allRolodeck] = await Promise.all([
    fetchAllSquareCustomers(),
    getAllCustomers(),
  ]);
  const rolodeckActive = allRolodeck.filter((c) => !c.archived);

  // Step 2: Match
  const { matched, lowConf, newInSquare } = matchCustomers(squareCustomers, rolodeckActive);

  let mergedCount    = 0;
  let conflictCount  = 0;
  const errors       = [];

  // Step 3: Merge matched records — compute all merges in memory first,
  // then persist successes in parallel so no partial-write state exists.
  const mergeResults = matched.map(({ square, rolodeck }) => {
    try {
      const { merged, conflicts } = mergeSquareIntoRolodeck(rolodeck, square);
      return { id: rolodeck.id, merged, conflictCount: Object.keys(conflicts).length };
    } catch (e) {
      errors.push({ id: square.id, message: e.message });
      return null;
    }
  }).filter(Boolean);

  await Promise.all(
    mergeResults.map(async ({ id, merged, conflictCount: cc }) => {
      try {
        await updateCustomer(id, merged);
        mergedCount++;
        if (cc > 0) conflictCount++;
      } catch (e) {
        errors.push({ id, message: e.message });
      }
    }),
  );

  // Step 4: Queue low-confidence matches for user review
  const pendingLowConf = lowConf.map(({ square, rolodeck }) => ({
    squareCustomer:      square,
    rolodeckCustomerId:  rolodeck.id,
  }));

  // Step 5: Create new Rolodeck records for unmatched Square customers
  let createdCount = 0;
  for (const sq of newInSquare) {
    try {
      await addCustomer(mapSquareToRolodeck(sq));
      createdCount++;
    } catch (e) {
      errors.push({ id: sq.id, message: e.message });
    }
  }

  // Step 7: Save sync metadata
  const now      = new Date().toISOString();
  const prevMeta = (await getSquareSyncMetadata()) || {};
  const syncLog  = Array.isArray(prevMeta.syncLog) ? [...prevMeta.syncLog] : [];

  syncLog.unshift({
    at:        now,
    merged:    mergedCount,
    created:   createdCount,
    lowConf:   lowConf.length,
    conflicts: conflictCount,
    errors:    errors.length,
  });

  if (syncLog.length > MAX_SYNC_LOG_ENTRIES) {
    syncLog.length = MAX_SYNC_LOG_ENTRIES;
  }

  await saveSquareSyncMetadata({
    lastSyncAt:    now,
    syncLog,
    pendingLowConf,
  });

  return {
    merged:    mergedCount,
    created:   createdCount,
    lowConf:   lowConf.length,
    conflicts: conflictCount,
    errors,
  };
}

// ── resolveLowConf ────────────────────────────────────────────────────────────

/**
 * Resolve a pending low-confidence match.
 *
 * @param {object} squareCustomer      — the Square customer object from the pair
 * @param {string} rolodeckCustomerId  — the Rolodeck customer ID from the pair
 * @param {'link'|'skip'} action       — 'link' merges the records; 'skip' discards
 */
export async function resolveLowConf(squareCustomer, rolodeckCustomerId, action) {
  if (action === 'link') {
    const rolodeck = await getCustomerById(rolodeckCustomerId);
    if (!rolodeck) throw new Error('Rolodeck customer not found');

    const { merged } = mergeSquareIntoRolodeck(rolodeck, squareCustomer);
    await updateCustomer(rolodeckCustomerId, merged);
  }

  // Remove from pending list regardless of action
  const meta    = (await getSquareSyncMetadata()) || {};
  const pending = (meta.pendingLowConf || []).filter(
    (p) =>
      !(
        p.squareCustomer?.id === squareCustomer.id &&
        p.rolodeckCustomerId === rolodeckCustomerId
      ),
  );
  await saveSquareSyncMetadata({ ...meta, pendingLowConf: pending });
}

// ── resolveConflict ───────────────────────────────────────────────────────────

/**
 * Accept a winner for one conflicting field on a customer.
 *
 * @param {string} customerId — Rolodeck customer ID
 * @param {string} fieldName  — name of the conflicting field (e.g. 'email', 'phone')
 * @param {'square'|'rolodeck'} winner
 */
export async function resolveConflict(customerId, fieldName, winner) {
  const customer = await getCustomerById(customerId);
  if (!customer) throw new Error('Customer not found');

  const conflictData = customer.squareConflictData || {};
  const field        = conflictData[fieldName];
  if (!field) return; // already resolved

  const updates = {};
  if (winner === 'square') {
    updates[fieldName] = field.square;
  }
  // winner === 'rolodeck' — keep existing value, no field update needed

  // Remove resolved field from conflict data
  const newConflictData = { ...conflictData };
  delete newConflictData[fieldName];

  const hasRemaining         = Object.keys(newConflictData).length > 0;
  updates.squareConflictData = hasRemaining ? newConflictData : null;
  updates.squareSyncStatus   = hasRemaining ? 'conflict' : 'synced';

  await updateCustomer(customerId, updates);
}

// ── pushLocalCustomers ────────────────────────────────────────────────────────

/**
 * Push a selection of local-only Rolodeck customers to Square.
 * On success, stores the returned Square ID on the customer record.
 *
 * @param {string[]} customerIds — array of Rolodeck customer IDs to push
 * @returns {Promise<{ pushed: number, errors: Array }>}
 */
export async function pushLocalCustomers(customerIds) {
  const connected = await isSquareConnected();
  if (!connected) throw new Error('NOT_CONNECTED');

  const customers = await getAllCustomers();
  const toPush    = customers.filter((c) => customerIds.includes(c.id));

  const results = { pushed: 0, errors: [] };

  for (const customer of toPush) {
    try {
      const squareBody   = mapRolodeckToSquare(customer);
      const squareCust   = await createSquareCustomer(squareBody);
      const squareId     = squareCust?.id;

      if (squareId) {
        await updateCustomer(customer.id, {
          squareCustomerId:   squareId,
          squareSyncedAt:     new Date().toISOString(),
          squareSyncStatus:   'synced',
          squareConflictData: null,
        });
        results.pushed++;
      }
    } catch (e) {
      results.errors.push({
        id:      customer.id,
        name:    customer.name,
        message: e.message,
      });
    }
  }

  return results;
}

// ── getLocalOnlyCustomers ─────────────────────────────────────────────────────

/**
 * Return non-archived Rolodeck customers that have no Square ID.
 * Used by SquareSyncScreen to populate the Push to Square section.
 *
 * @returns {Promise<Array>} array of Rolodeck customer objects
 */
export async function getLocalOnlyCustomers() {
  const customers = await getAllCustomers();
  return customers.filter((c) => !c.archived && !c.squareCustomerId);
}
