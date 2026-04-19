// =============================================================================
// storage.js - AsyncStorage CRUD layer for all on-device data
// Version: 2.0.2
// Last Updated: 2026-04-18
//
// PROJECT:      Rolodeck (project v0.24.1)
// FILES:        storage.js           (this file — all data persistence)
//               serviceAlerts.js     (consumes Customer objects)
//               CustomersScreen.js   (getAllCustomers, getSortPreference)
//               CustomerDetailScreen.js (getCustomerById, updateCustomer,
//                                        deleteCustomer)
//               AddCustomerScreen.js (addCustomer)
//               AddServiceScreen.js  (addServiceEntry, getServiceIntervalMode,
//                                     getServiceIntervalCustomDays)
//               SettingsScreen.js    (getSortPreference, saveSortPreference,
//                                     getServiceIntervalMode,
//                                     getServiceIntervalCustomDays)
//               ServiceIntervalScreen.js (getServiceIntervalMode,
//                                         saveServiceIntervalMode,
//                                         getServiceIntervalCustomDays,
//                                         saveServiceIntervalCustomDays,
//                                         modeToIntervalDays)
//               calendarSync.js      (getServiceIntervalMode,
//                                     getServiceIntervalCustomDays,
//                                     modeToIntervalDays)
//               squareSync.js        (getAllCustomers, addCustomer, updateCustomer,
//                                     getSquareSyncMetadata, saveSquareSyncMetadata)
//               SyncStatusBanner.js  (getSquareSyncMetadata, getAllCustomers)
//               SquareSyncScreen.js  (getSquareSyncMetadata, getAllCustomers,
//                                     getCustomerById)
//               backup.js            (getAllCustomers, restoreCustomers)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   Storage layout (v2 per-customer keys):
//     @rolodeck_customer_index        JSON string[] of customer IDs (ordered list)
//     @rolodeck_customer_{id}         JSON Customer object per customer
//     @rolodeck_sort_pref             string sort key
//     @rolodeck_show_archived         'true'|'false'
//     @rolodeck_onboarding_complete   'true'|'false'
//     @rolodeck_service_interval_mode string
//     @rolodeck_service_interval_custom_days string
//     @rolodeck_square_sync_meta      JSON SquareSyncMeta
//     @rolodeck_square_auto_sync      'true'|'false'
//
//   Migration (v1 → v2):
//     On initStorage(), detects the legacy @rolodeck_customers envelope key.
//     Reads all customers from it, writes each to @rolodeck_customer_{id},
//     writes the index, then deletes the old key. Safe to run multiple times
//     (legacy key absent means migration already ran).
//
//   In-memory cache:
//     _cache: Map<id, Customer> | null — populated on first getAllCustomers()
//     call, invalidated on every write. getCustomerById() uses the cache if
//     warm, otherwise reads directly from AsyncStorage (no full load needed).
//
//   Write mutex:
//     All writes go through withWriteLock(fn) which chains Promises so
//     concurrent writes to the same customer cannot interleave.
//
//   ID generation:
//     generateId() uses expo-crypto getRandomBytesAsync for real randomness.
//
// SCHEMA:
//   Customer: { id, name, email, phone, address, city, state, zipCode,
//               notes, archived (bool), serviceLog, scheduledServices,
//               squareCustomerId (string|null), squareSyncedAt (ISO|null),
//               squareSyncStatus ('synced'|'local-only'|'conflict'|null),
//               squareConflictData (object|null) }
//   ServiceEntry:   { id, date (ISO string), type ('service'|'install'), notes,
//                     intervalDays? (number, custom-interval entries only),
//                     photos?: string[] (local file URIs) }
//   ScheduledEntry: { id, date (ISO string), type ('service'|'install'), notes, createdAt (ISO string) }
//   SquareSyncMeta: { lastSyncAt (ISO|null), syncLog: [SyncLogEntry],
//                     pendingLowConf: [{ squareCustomer, rolodeckCustomerId }] }
//   SyncLogEntry:   { at, merged, created, lowConf, conflicts, errors }
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial scaffold
// v1.1  2026-04-03  Claude  Debug + harden + futureproof
//       - Added JSON parse safety in loadCustomers (returns [] on corrupt data)
//       - Defensive serviceLog guarantee on every loaded customer
//       - Added schema version tracking (CURRENT_SCHEMA_VERSION = 1)
//       - Improved generateId() with better entropy (hex + timestamp)
//       - Added initStorage() for schema version initialization
// v1.3  2026-04-09  Claude  Added getOnboardingComplete / setOnboardingComplete
//                           for first-launch onboarding flag
// v1.2  2026-04-04  Claude  Added restoreCustomers() for backup/restore support
// v1.6  2026-04-10  Claude  Envelope format + migration runner
//       - CUSTOMERS_KEY now stores { schemaVersion, customers: [] } envelope
//         instead of a raw array, so version travels with the data
//       - Added loadEnvelope() / persistEnvelope() internal helpers
//       - Added MIGRATIONS dict + runMigrations() chain runner; migration 1
//         is the legacy raw-array → envelope wrap (no-op on customer shape)
//       - Legacy raw-array detected as schemaVersion 0 and auto-migrated on
//         load with write-back; orphaned @rolodeck_schema_version key removed
//       - Future-version downgrade protection: if stored schemaVersion >
//         CURRENT_SCHEMA_VERSION, data is returned read-only and not clobbered
//       - getSchemaVersion() now reads from the envelope (returns null for
//         fresh install, 0 for legacy, N for envelope)
//       - initStorage() persists an empty envelope on fresh install so the
//         version is always explicit [updated ARCHITECTURE, SCHEMA]
// v1.5  2026-04-10  Claude  Scheduled services support
//       - loadCustomers now initializes scheduledServices: [] on every customer
//       - Added addScheduledService, deleteScheduledService [updated SCHEMA,
//         ARCHITECTURE]
// v1.4  2026-04-09  Claude  Service interval preference storage
//       - Added SERVICE_INTERVAL_MODE_KEY, SERVICE_INTERVAL_CUSTOM_DAYS_KEY
//       - Added getServiceIntervalMode, saveServiceIntervalMode
//       - Added getServiceIntervalCustomDays, saveServiceIntervalCustomDays
//       - Added modeToIntervalDays() pure sync helper [updated SCHEMA,
//         ARCHITECTURE]
// v1.7  2026-04-12  Claude  Square sync metadata + customer sync fields
//       - Added notes, squareCustomerId, squareSyncedAt, squareSyncStatus,
//         squareConflictData to Customer schema and addCustomer()
//       - normalizeCustomers() now initializes all four new Square fields
//         (and notes) to null/'' on load so older records work transparently
//       - Added SQUARE_SYNC_META_KEY, SQUARE_AUTO_SYNC_KEY constants
//       - Added getSquareSyncMetadata(), saveSquareSyncMetadata()
//       - Added getSquareAutoSync(), saveSquareAutoSync()
//         [updated ARCHITECTURE, SCHEMA]
// v2.0.2  2026-04-18  Claude  Persist type field in addScheduledService so conflict
//                             detection uses correct duration (install vs service)
// v2.0.1  2026-04-17  Claude  Updated ServiceEntry schema comment to document
//                             optional photos field (string[] of local file URIs)
// v2.0  2026-04-14  Claude  Per-customer keys + cache + write mutex + hardening
//       - BREAKING: migrated from single @rolodeck_customers envelope key to
//         per-customer @rolodeck_customer_{id} keys with @rolodeck_customer_index
//         (schema version 2; migration runs automatically on initStorage())
//       - In-memory cache (Map<id, Customer>), invalidated on every write,
//         eliminates redundant AsyncStorage parses within a session
//       - Write mutex (Promise chain): concurrent writes to the same customer
//         can no longer interleave and produce lost-update bugs
//       - generateId() now uses expo-crypto getRandomBytesAsync for
//         cryptographically random IDs (was Math.random())
//       - normalizeCustomer() validates customer shape (rejects missing id)
//       - addServiceEntry() now forwards intervalDays from entry data so
//         custom-interval entries are persisted correctly
//       - restoreCustomers() validates each customer shape before importing;
//         clear-then-write replaces the full customer set atomically
//       - clearAllData() updated to remove per-customer keys and index
//         [updated ARCHITECTURE, SCHEMA]
// =============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

// ── Storage keys ───────────────────────────────────────────────────────────────

const CUSTOMER_INDEX_KEY               = '@rolodeck_customer_index';
const CUSTOMER_KEY_PREFIX              = '@rolodeck_customer_';
const LEGACY_CUSTOMERS_KEY             = '@rolodeck_customers';      // v1 envelope — migrated away
const SORT_PREF_KEY                    = '@rolodeck_sort_pref';
const SHOW_ARCHIVED_KEY                = '@rolodeck_show_archived';
const ONBOARDING_DONE_KEY              = '@rolodeck_onboarding_complete';
const SERVICE_INTERVAL_MODE_KEY        = '@rolodeck_service_interval_mode';
const SERVICE_INTERVAL_CUSTOM_DAYS_KEY = '@rolodeck_service_interval_custom_days';
const SQUARE_SYNC_META_KEY             = '@rolodeck_square_sync_meta';
const SQUARE_AUTO_SYNC_KEY             = '@rolodeck_square_auto_sync';

export const CURRENT_SCHEMA_VERSION = 2;

// ── In-memory cache ────────────────────────────────────────────────────────────
// Map<id, Customer> when warm, null when cold (needs a load).
// Invalidated on every write to ensure callers always see current data.

let _cache = null;

function invalidateCache() {
  _cache = null;
}

// ── Write mutex ────────────────────────────────────────────────────────────────
// All writes are chained through this Promise so concurrent writes cannot
// interleave and produce lost-update bugs. The chain never rejects — errors
// are surfaced to the caller but _writeChain itself stays healthy.

let _writeChain = Promise.resolve();

function withWriteLock(fn) {
  const next = _writeChain.then(fn);
  _writeChain = next.catch(() => {});
  return next;
}

// ── ID generation ─────────────────────────────────────────────────────────────

export async function generateId() {
  const bytes = await Crypto.getRandomBytesAsync(8);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex}-${Date.now().toString(36)}`;
}

// ── Customer normalization / shape validation ──────────────────────────────────
//
// Returns a normalized Customer object, or null if the shape is invalid.
// "Invalid" means missing id — every other field is optional and defaults.

function normalizeCustomer(c) {
  if (!c || typeof c !== 'object' || !c.id || typeof c.id !== 'string') {
    return null;
  }
  return {
    id:                 c.id,
    name:               c.name               || '',
    email:              c.email              || '',
    phone:              c.phone              || '',
    address:            c.address            || '',
    city:               c.city               || '',
    state:              c.state              || '',
    zipCode:            c.zipCode            || '',
    notes:              c.notes              || '',
    archived:           c.archived           ?? false,
    serviceLog:         Array.isArray(c.serviceLog)        ? c.serviceLog        : [],
    scheduledServices:  Array.isArray(c.scheduledServices) ? c.scheduledServices : [],
    squareCustomerId:   c.squareCustomerId   ?? null,
    squareSyncedAt:     c.squareSyncedAt     ?? null,
    squareSyncStatus:   c.squareSyncStatus   ?? null,
    squareConflictData: c.squareConflictData ?? null,
  };
}

// ── Internal per-customer I/O ─────────────────────────────────────────────────

async function loadIndex() {
  const raw = await AsyncStorage.getItem(CUSTOMER_INDEX_KEY);
  if (!raw) return [];
  try {
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

async function saveIndex(ids) {
  await AsyncStorage.setItem(CUSTOMER_INDEX_KEY, JSON.stringify(ids));
}

async function loadOneCustomer(id) {
  const raw = await AsyncStorage.getItem(CUSTOMER_KEY_PREFIX + id);
  if (!raw) return null;
  try {
    return normalizeCustomer(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function saveOneCustomer(customer) {
  await AsyncStorage.setItem(CUSTOMER_KEY_PREFIX + customer.id, JSON.stringify(customer));
}

async function deleteOneCustomer(id) {
  await AsyncStorage.removeItem(CUSTOMER_KEY_PREFIX + id);
}

// ── initStorage ────────────────────────────────────────────────────────────────
//
// Call once on app startup. Handles two cases:
//   - V1 migration: legacy @rolodeck_customers envelope key exists → split
//     each customer into its own key, write index, delete old key.
//   - Fresh install: ensure @rolodeck_customer_index exists (empty array).
// Safe to call multiple times; the legacy key check is idempotent.

export async function initStorage() {
  try {
    const legacyRaw = await AsyncStorage.getItem(LEGACY_CUSTOMERS_KEY);

    if (legacyRaw) {
      // V1 → V2 migration
      let customers = [];
      try {
        const parsed = JSON.parse(legacyRaw);
        if (Array.isArray(parsed)) {
          customers = parsed; // old raw-array format
        } else if (parsed && Array.isArray(parsed.customers)) {
          customers = parsed.customers; // envelope format
        }
      } catch {
        // Corrupt legacy data — migrate an empty set (data unrecoverable)
      }

      const normalized = customers.map(normalizeCustomer).filter(Boolean);
      const ids = normalized.map((c) => c.id);

      // Write all customer records in parallel, then index, then clean up
      await Promise.all(normalized.map((c) => saveOneCustomer(c)));
      await saveIndex(ids);
      await AsyncStorage.multiRemove([
        LEGACY_CUSTOMERS_KEY,
        '@rolodeck_schema_version', // orphaned pre-envelope key
      ]).catch(() => {});

      invalidateCache();
    } else {
      // Ensure index exists for fresh installs
      const indexRaw = await AsyncStorage.getItem(CUSTOMER_INDEX_KEY);
      if (!indexRaw) {
        await saveIndex([]);
      }
    }
  } catch {
    // initStorage failing is non-fatal — the app degrades gracefully
  }
}

// ── Onboarding ────────────────────────────────────────────────────────────────

export async function getOnboardingComplete() {
  try {
    const val = await AsyncStorage.getItem(ONBOARDING_DONE_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

export async function setOnboardingComplete() {
  await AsyncStorage.setItem(ONBOARDING_DONE_KEY, 'true');
}

// ── Customer reads ────────────────────────────────────────────────────────────

/**
 * Returns all customers, using the in-memory cache when warm.
 * Populates the cache as a side effect.
 */
export async function getAllCustomers() {
  if (_cache) {
    return Array.from(_cache.values());
  }

  const ids = await loadIndex();
  const loaded = await Promise.all(ids.map(loadOneCustomer));
  const customers = loaded.filter(Boolean);

  _cache = new Map(customers.map((c) => [c.id, c]));
  return customers;
}

/**
 * Returns a single customer by ID. Uses the cache if warm; reads directly
 * from AsyncStorage without a full load if cold.
 */
export async function getCustomerById(id) {
  if (_cache) return _cache.get(id) || null;
  return loadOneCustomer(id);
}

// ── Customer writes ───────────────────────────────────────────────────────────

export async function addCustomer(data) {
  return withWriteLock(async () => {
    const id = await generateId();
    const newCustomer = normalizeCustomer({
      id,
      name:               data.name               || '',
      email:              data.email              || '',
      phone:              data.phone              || '',
      address:            data.address            || '',
      city:               data.city               || '',
      state:              data.state              || '',
      zipCode:            data.zipCode            || '',
      notes:              data.notes              || '',
      archived:           false,
      serviceLog:         [],
      scheduledServices:  [],
      squareCustomerId:   data.squareCustomerId   || null,
      squareSyncedAt:     data.squareSyncedAt     || null,
      squareSyncStatus:   data.squareSyncStatus   || null,
      squareConflictData: data.squareConflictData || null,
    });

    const ids = await loadIndex();
    ids.push(id);
    await Promise.all([saveOneCustomer(newCustomer), saveIndex(ids)]);
    invalidateCache();
    return newCustomer;
  });
}

/**
 * Update top-level customer fields. serviceLog and scheduledServices are
 * intentionally excluded from updates — use their dedicated functions instead.
 */
export async function updateCustomer(id, updates) {
  return withWriteLock(async () => {
    const existing = await loadOneCustomer(id);
    if (!existing) throw new Error(`Customer not found: ${id}`);

    // Strip serviceLog and scheduledServices so callers cannot overwrite them
    const { serviceLog, scheduledServices, ...safeUpdates } = updates;
    const updated = normalizeCustomer({ ...existing, ...safeUpdates });
    await saveOneCustomer(updated);
    invalidateCache();
    return updated;
  });
}

export async function deleteCustomer(id) {
  return withWriteLock(async () => {
    const ids = await loadIndex();
    await Promise.all([
      deleteOneCustomer(id),
      saveIndex(ids.filter((i) => i !== id)),
    ]);
    invalidateCache();
  });
}

// ── Archive ───────────────────────────────────────────────────────────────────

export async function archiveCustomer(id) {
  return withWriteLock(async () => {
    const customer = await loadOneCustomer(id);
    if (!customer) throw new Error(`Customer not found: ${id}`);
    const updated = { ...customer, archived: true };
    await saveOneCustomer(updated);
    invalidateCache();
    return updated;
  });
}

export async function unarchiveCustomer(id) {
  return withWriteLock(async () => {
    const customer = await loadOneCustomer(id);
    if (!customer) throw new Error(`Customer not found: ${id}`);
    const updated = { ...customer, archived: false };
    await saveOneCustomer(updated);
    invalidateCache();
    return updated;
  });
}

// ── Service log writes ────────────────────────────────────────────────────────

export async function addServiceEntry(customerId, data) {
  return withWriteLock(async () => {
    const customer = await loadOneCustomer(customerId);
    if (!customer) throw new Error(`Customer not found: ${customerId}`);

    const entry = {
      id:    await generateId(),
      date:  data.date  || new Date().toISOString(),
      type:  data.type  || 'service',
      notes: data.notes || '',
    };

    // Forward intervalDays if present (custom-interval entries)
    if (data.intervalDays != null) {
      entry.intervalDays = data.intervalDays;
    }

    const updated = {
      ...customer,
      serviceLog: [entry, ...(customer.serviceLog || [])],
    };
    await saveOneCustomer(updated);
    invalidateCache();
    return entry;
  });
}

export async function updateServiceEntry(customerId, entryId, updates) {
  return withWriteLock(async () => {
    const customer = await loadOneCustomer(customerId);
    if (!customer) throw new Error(`Customer not found: ${customerId}`);

    const log = customer.serviceLog || [];
    const eidx = log.findIndex((e) => e.id === entryId);
    if (eidx === -1) throw new Error(`Service entry not found: ${entryId}`);

    const updatedLog = [...log];
    updatedLog[eidx] = { ...log[eidx], ...updates, id: entryId };
    const updated = { ...customer, serviceLog: updatedLog };
    await saveOneCustomer(updated);
    invalidateCache();
    return updatedLog[eidx];
  });
}

export async function deleteServiceEntry(customerId, entryId) {
  return withWriteLock(async () => {
    const customer = await loadOneCustomer(customerId);
    if (!customer) throw new Error(`Customer not found: ${customerId}`);

    const updated = {
      ...customer,
      serviceLog: (customer.serviceLog || []).filter((e) => e.id !== entryId),
    };
    await saveOneCustomer(updated);
    invalidateCache();
  });
}

// ── Scheduled services ────────────────────────────────────────────────────────

export async function addScheduledService(customerId, data) {
  return withWriteLock(async () => {
    const customer = await loadOneCustomer(customerId);
    if (!customer) throw new Error(`Customer not found: ${customerId}`);

    const entry = {
      id:        await generateId(),
      date:      data.date  || new Date().toISOString(),
      type:      data.type  || 'service',
      notes:     data.notes || '',
      createdAt: new Date().toISOString(),
    };
    const updated = {
      ...customer,
      scheduledServices: [entry, ...(customer.scheduledServices || [])],
    };
    await saveOneCustomer(updated);
    invalidateCache();
    return entry;
  });
}

export async function deleteScheduledService(customerId, entryId) {
  return withWriteLock(async () => {
    const customer = await loadOneCustomer(customerId);
    if (!customer) throw new Error(`Customer not found: ${customerId}`);

    const updated = {
      ...customer,
      scheduledServices: (customer.scheduledServices || []).filter((e) => e.id !== entryId),
    };
    await saveOneCustomer(updated);
    invalidateCache();
  });
}

// ── Sort preference ───────────────────────────────────────────────────────────

export async function getSortPreference() {
  const pref = await AsyncStorage.getItem(SORT_PREF_KEY);
  return pref || 'firstName';
}

export async function saveSortPreference(pref) {
  await AsyncStorage.setItem(SORT_PREF_KEY, pref);
}

// ── Show archived preference ─────────────────────────────────────────────────

export async function getShowArchived() {
  const val = await AsyncStorage.getItem(SHOW_ARCHIVED_KEY);
  return val === 'true';
}

export async function saveShowArchived(show) {
  await AsyncStorage.setItem(SHOW_ARCHIVED_KEY, show ? 'true' : 'false');
}

// ── Service interval preference ───────────────────────────────────────────────

/**
 * Maps an interval mode ('30'|'60'|'90'|'180'|'365'|'custom') + optional
 * customDays number to a concrete day count. Pure sync helper.
 */
export function modeToIntervalDays(mode, customDays) {
  if (mode === 'custom') return Math.max(1, Math.round(Number(customDays) || 30));
  return Number(mode) || 365;
}

/** Returns the saved interval mode. Defaults to '365' (1 year). */
export async function getServiceIntervalMode() {
  const val = await AsyncStorage.getItem(SERVICE_INTERVAL_MODE_KEY);
  return val || '365';
}

export async function saveServiceIntervalMode(mode) {
  await AsyncStorage.setItem(SERVICE_INTERVAL_MODE_KEY, mode);
}

/** Returns the saved custom interval in days. Defaults to 30. */
export async function getServiceIntervalCustomDays() {
  const val = await AsyncStorage.getItem(SERVICE_INTERVAL_CUSTOM_DAYS_KEY);
  return val ? Number(val) : 30;
}

export async function saveServiceIntervalCustomDays(days) {
  await AsyncStorage.setItem(
    SERVICE_INTERVAL_CUSTOM_DAYS_KEY,
    String(Math.max(1, Math.round(Number(days) || 30))),
  );
}

// ── Backup / restore ──────────────────────────────────────────────────────────

/**
 * Overwrite the entire customer store with a validated array.
 * Validates each customer shape, clears the existing store, writes the new
 * set, and rebuilds the index. Wrapped in the write mutex.
 */
export async function restoreCustomers(customers) {
  if (!Array.isArray(customers)) {
    throw new Error('restoreCustomers: expected an array');
  }

  // Validate and normalize each customer — reject any without a valid id+name
  const validated = customers
    .map((c) => {
      if (!c || typeof c !== 'object') return null;
      if (!c.id || typeof c.id !== 'string') return null;
      if (!c.name || typeof c.name !== 'string') return null;
      return normalizeCustomer(c);
    })
    .filter(Boolean);

  return withWriteLock(async () => {
    // Remove all existing customers
    const existingIds = await loadIndex();
    await Promise.all(existingIds.map(deleteOneCustomer));

    // Write the restored set
    const ids = validated.map((c) => c.id);
    await Promise.all([
      ...validated.map(saveOneCustomer),
      saveIndex(ids),
    ]);
    invalidateCache();
  });
}

// ── Square sync metadata ──────────────────────────────────────────────────────

/**
 * Returns the stored Square sync metadata object, or null if none exists.
 * Shape: { lastSyncAt, syncLog: [...], pendingLowConf: [...] }
 */
export async function getSquareSyncMetadata() {
  try {
    const raw = await AsyncStorage.getItem(SQUARE_SYNC_META_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveSquareSyncMetadata(metadata) {
  await AsyncStorage.setItem(SQUARE_SYNC_META_KEY, JSON.stringify(metadata));
}

/** Returns true if auto-sync on app open is enabled (default: false). */
export async function getSquareAutoSync() {
  const val = await AsyncStorage.getItem(SQUARE_AUTO_SYNC_KEY);
  return val === 'true';
}

export async function saveSquareAutoSync(enabled) {
  await AsyncStorage.setItem(SQUARE_AUTO_SYNC_KEY, enabled ? 'true' : 'false');
}

// ── Dev helpers ───────────────────────────────────────────────────────────────

export async function clearAllData() {
  const ids = await loadIndex();
  await Promise.all([
    ...ids.map(deleteOneCustomer),
    AsyncStorage.removeItem(CUSTOMER_INDEX_KEY),
    AsyncStorage.removeItem(SORT_PREF_KEY),
  ]);
  invalidateCache();
}
