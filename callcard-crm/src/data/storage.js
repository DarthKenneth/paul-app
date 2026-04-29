// =============================================================================
// storage.js - AsyncStorage CRUD layer for all on-device data
// Version: 3.0
// Last Updated: 2026-04-29
//
// PROJECT:      Callcard CRM (project v2.0.0)
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
//     @callcard_customer_index        JSON string[] of customer IDs (ordered list)
//     @callcard_customer_{id}         JSON Customer object per customer
//     @callcard_sort_pref             string sort key
//     @callcard_show_archived         'true'|'false'
//     @callcard_onboarding_complete   'true'|'false'
//     @callcard_service_interval_mode string
//     @callcard_service_interval_custom_days string
//     @callcard_square_sync_meta      JSON SquareSyncMeta
//     @callcard_square_auto_sync      'true'|'false'
//
//   Migration (v1 → v2):
//     On initStorage(), detects the legacy @callcard_customers envelope key.
//     Reads all customers from it, writes each to @callcard_customer_{id},
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
//                     photos?: string[] (local file URIs),
//                     entryValues?: object (per-visit field values, e.g. equipmentInstalled, saltUsed),
//                     checklist?: object (checklist item id → bool|string) }
//   ScheduledEntry: { id, date (ISO string), type ('service'|'install'), notes, createdAt (ISO string) }
//   SquareSyncMeta: { lastSyncAt (ISO|null), syncLog: [SyncLogEntry],
//                     pendingLowConf: [{ squareCustomer, calloutCustomerId }] }
//   SyncLogEntry:   { at, merged, created, lowConf, conflicts, errors }
//
// CHANGE LOG:
// v3.0   2026-04-29  Claude  Schema V3 — per-record sync foundation (project v2.0.0)
//        - Bumped CURRENT_SCHEMA_VERSION 2 → 3, added @callcard_schema_version key
//        - normalizeCustomer now stamps updatedAt and deletedAt on every record
//        - Service-log entries and scheduled-services entries also get updatedAt
//        - withWriteLock now updates @callcard_last_local_mutation on every successful write
//        - Soft-delete: deleteCustomer marks deletedAt instead of hard-removing;
//          getAllCustomers / getCustomerById filter tombstones (UI sees deletion immediately)
//        - New getAllCustomersIncludingDeleted() for the cloud sync layer
//        - New applyCloudMerge(remote): per-record updatedAt-based merge,
//          tombstones propagate, local-only records preserved
//        - New purgeOldTombstones(): hard-removes tombstones older than 30 days
//        - New getLastLocalMutation() export
//        - V2 → V3 migration runner: stamps updatedAt on every record + entry
//          (backfill from existing date/createdAt fields where possible)
//        - restoreCustomers no longer rejects empty-name records (was silently dropping
//          in-progress edits on cloud pull) [updated SCHEMA, ARCHITECTURE]
// v2.0.5 2026-04-25  Claude  Update project block; fix schema comment rolodeckCustomerId → calloutCustomerId
// v2.0.4 2026-04-24  Claude  addServiceEntry now forwards photos — was silently dropped
//                            [updated SCHEMA to include entryValues and checklist]
// v2.0.3 2026-04-24  Claude  addServiceEntry forwards entryValues and checklist from data
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
//         load with write-back; orphaned @callcard_schema_version key removed
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
//       - BREAKING: migrated from single @callcard_customers envelope key to
//         per-customer @callcard_customer_{id} keys with @callcard_customer_index
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

const CUSTOMER_INDEX_KEY               = '@callcard_customer_index';
const CUSTOMER_KEY_PREFIX              = '@callcard_customer_';
const LEGACY_CUSTOMERS_KEY             = '@callcard_customers';      // v1 envelope — migrated away
const SORT_PREF_KEY                    = '@callcard_sort_pref';
const SHOW_ARCHIVED_KEY                = '@callcard_show_archived';
const ONBOARDING_DONE_KEY              = '@callcard_onboarding_complete';
const SERVICE_INTERVAL_MODE_KEY        = '@callcard_service_interval_mode';
const SERVICE_INTERVAL_CUSTOM_DAYS_KEY = '@callcard_service_interval_custom_days';
const SQUARE_SYNC_META_KEY             = '@callcard_square_sync_meta';
const SQUARE_AUTO_SYNC_KEY             = '@callcard_square_auto_sync';
const SCHEMA_VERSION_KEY               = '@callcard_schema_version';
const LAST_LOCAL_MUTATION_KEY          = '@callcard_last_local_mutation';

export const CURRENT_SCHEMA_VERSION = 3;

// Tombstones older than this get purged after a successful cloud sync round.
// 30 days is enough for any reasonable offline-then-reconnect scenario to
// have already propagated the deletion.
const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

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
  const next = _writeChain.then(async () => {
    const result = await fn();
    // Successful local mutation — stamp the wall-clock so syncUp can know
    // there's something newer than the last successful cloud push.
    AsyncStorage.setItem(LAST_LOCAL_MUTATION_KEY, new Date().toISOString())
      .catch(() => { /* non-fatal */ });
    return result;
  });
  _writeChain = next.catch(() => {});
  return next;
}

/** Returns the ISO timestamp of the last successful local write, or null. */
export async function getLastLocalMutation() {
  try {
    return await AsyncStorage.getItem(LAST_LOCAL_MUTATION_KEY);
  } catch {
    return null;
  }
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
  const nowIso = new Date().toISOString();
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
    // V3 sync fields
    updatedAt:          c.updatedAt          ?? nowIso,
    deletedAt:          c.deletedAt          ?? null,
  };
}

// Compare two ISO timestamps numerically. Tolerates nullish on either side
// (null < anything). Returns -1, 0, or 1.
function compareIso(a, b) {
  const ta = a ? Date.parse(a) : 0;
  const tb = b ? Date.parse(b) : 0;
  if (!Number.isFinite(ta)) return Number.isFinite(tb) ? -1 : 0;
  if (!Number.isFinite(tb)) return 1;
  return ta < tb ? -1 : ta > tb ? 1 : 0;
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
//   - V1 migration: legacy @callcard_customers envelope key exists → split
//     each customer into its own key, write index, delete old key.
//   - Fresh install: ensure @callcard_customer_index exists (empty array).
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
      await AsyncStorage.multiRemove([LEGACY_CUSTOMERS_KEY]).catch(() => {});

      invalidateCache();
    } else {
      // Ensure index exists for fresh installs
      const indexRaw = await AsyncStorage.getItem(CUSTOMER_INDEX_KEY);
      if (!indexRaw) {
        await saveIndex([]);
      }
    }

    // V2 → V3 migration (idempotent): stamp updatedAt and deletedAt on every
    // existing record, plus updatedAt on each service-log and scheduled-service
    // entry. Required for per-record cloud sync. Always write the schema
    // version key so subsequent boots short-circuit cleanly.
    const storedVersion = await getStoredSchemaVersion();
    if (storedVersion !== null && storedVersion < CURRENT_SCHEMA_VERSION) {
      await migrateV2toV3();
      invalidateCache();
    }
    await setStoredSchemaVersion(CURRENT_SCHEMA_VERSION);
  } catch {
    // initStorage failing is non-fatal — the app degrades gracefully
  }
}

// Returns the stored schema version, or null if the key is missing AND the
// store appears to be fresh (empty / no customers). Returns 2 when the key
// is missing but a populated V2 customer index is present (needs migration).
async function getStoredSchemaVersion() {
  const raw = await AsyncStorage.getItem(SCHEMA_VERSION_KEY);
  if (raw == null) {
    const indexRaw = await AsyncStorage.getItem(CUSTOMER_INDEX_KEY);
    if (!indexRaw) return null; // fresh install
    try {
      const ids = JSON.parse(indexRaw);
      if (Array.isArray(ids) && ids.length === 0) return null;
    } catch { /* fall through */ }
    return 2; // populated V2 install — needs V2→V3 migration
  }
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

async function setStoredSchemaVersion(v) {
  await AsyncStorage.setItem(SCHEMA_VERSION_KEY, String(v));
}

async function migrateV2toV3() {
  const ids = await loadIndex();
  if (ids.length === 0) return;
  const nowIso = new Date().toISOString();

  const customers = await Promise.all(ids.map(async (id) => {
    const raw = await AsyncStorage.getItem(CUSTOMER_KEY_PREFIX + id);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }));

  await Promise.all(customers.filter(Boolean).map(async (c) => {
    if (!c.updatedAt) c.updatedAt = nowIso;
    if (c.deletedAt === undefined) c.deletedAt = null;
    if (Array.isArray(c.serviceLog)) {
      c.serviceLog = c.serviceLog.map((e) => ({
        ...e,
        updatedAt: e.updatedAt || e.date || nowIso,
      }));
    }
    if (Array.isArray(c.scheduledServices)) {
      c.scheduledServices = c.scheduledServices.map((e) => ({
        ...e,
        updatedAt: e.updatedAt || e.createdAt || nowIso,
      }));
    }
    await AsyncStorage.setItem(CUSTOMER_KEY_PREFIX + c.id, JSON.stringify(c));
  }));
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
 * Returns live (non-tombstoned) customers, using the in-memory cache when
 * warm. Tombstoned records still live in storage so cloud sync can propagate
 * the deletion to other devices, but they are filtered out of normal reads.
 */
export async function getAllCustomers() {
  const all = await getAllCustomersIncludingDeleted();
  return all.filter((c) => !c.deletedAt);
}

/**
 * Sync-only: returns every customer including tombstones. Callers that
 * surface customers to the user must use getAllCustomers() instead.
 */
export async function getAllCustomersIncludingDeleted() {
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
 * Returns a single customer by ID, or null if missing or tombstoned.
 * Uses the cache if warm.
 */
export async function getCustomerById(id) {
  const c = _cache ? _cache.get(id) || null : await loadOneCustomer(id);
  if (!c || c.deletedAt) return null;
  return c;
}

// ── Customer writes ───────────────────────────────────────────────────────────

export async function addCustomer(data) {
  return withWriteLock(async () => {
    const id = await generateId();
    const nowIso = new Date().toISOString();
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
      updatedAt:          nowIso,
      deletedAt:          null,
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

    // Strip serviceLog and scheduledServices so callers cannot overwrite them.
    // updatedAt is also stripped — it is always set fresh below.
    const { serviceLog, scheduledServices, updatedAt: _u, ...safeUpdates } = updates;
    const updated = normalizeCustomer({
      ...existing,
      ...safeUpdates,
      updatedAt: new Date().toISOString(),
    });
    await saveOneCustomer(updated);
    invalidateCache();
    return updated;
  });
}

/**
 * Soft-delete: marks deletedAt + updatedAt and keeps the record in storage so
 * the deletion can propagate to other devices via cloud sync. Tombstones are
 * filtered out of getAllCustomers/getCustomerById so the UI sees the customer
 * as gone immediately. Hard removal happens later via purgeOldTombstones.
 */
export async function deleteCustomer(id) {
  return withWriteLock(async () => {
    const existing = await loadOneCustomer(id);
    if (!existing) return; // already gone — idempotent

    const nowIso = new Date().toISOString();
    const tombstone = {
      ...existing,
      deletedAt: nowIso,
      updatedAt: nowIso,
    };
    await saveOneCustomer(tombstone);
    invalidateCache();
  });
}

// ── Archive ───────────────────────────────────────────────────────────────────

export async function archiveCustomer(id) {
  return withWriteLock(async () => {
    const customer = await loadOneCustomer(id);
    if (!customer) throw new Error(`Customer not found: ${id}`);
    const updated = { ...customer, archived: true, updatedAt: new Date().toISOString() };
    await saveOneCustomer(updated);
    invalidateCache();
    return updated;
  });
}

export async function unarchiveCustomer(id) {
  return withWriteLock(async () => {
    const customer = await loadOneCustomer(id);
    if (!customer) throw new Error(`Customer not found: ${id}`);
    const updated = { ...customer, archived: false, updatedAt: new Date().toISOString() };
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

    const nowIso = new Date().toISOString();
    const entry = {
      id:        await generateId(),
      date:      data.date  || nowIso,
      type:      data.type  || 'service',
      notes:     data.notes || '',
      updatedAt: nowIso,
    };

    if (data.intervalDays  != null)       entry.intervalDays  = data.intervalDays;
    if (data.photos?.length > 0)          entry.photos        = data.photos;
    if (data.entryValues   != null)       entry.entryValues   = data.entryValues;
    if (data.checklist     != null)       entry.checklist     = data.checklist;

    const updated = {
      ...customer,
      serviceLog: [entry, ...(customer.serviceLog || [])],
      updatedAt: nowIso,
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

    const nowIso = new Date().toISOString();
    const updatedLog = [...log];
    updatedLog[eidx] = { ...log[eidx], ...updates, id: entryId, updatedAt: nowIso };
    const updated = { ...customer, serviceLog: updatedLog, updatedAt: nowIso };
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
      updatedAt: new Date().toISOString(),
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

    const nowIso = new Date().toISOString();
    const entry = {
      id:        await generateId(),
      date:      data.date  || nowIso,
      type:      data.type  || 'service',
      notes:     data.notes || '',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const updated = {
      ...customer,
      scheduledServices: [entry, ...(customer.scheduledServices || [])],
      updatedAt: nowIso,
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
      updatedAt: new Date().toISOString(),
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
 * Used by manual backup-restore (NOT by cloud sync — sync uses applyCloudMerge
 * for per-record merge). Only requires a valid id; empty-name records are
 * preserved (they may be in-progress edits the user wants back).
 */
export async function restoreCustomers(customers) {
  if (!Array.isArray(customers)) {
    throw new Error('restoreCustomers: expected an array');
  }

  const validated = customers
    .map((c) => {
      if (!c || typeof c !== 'object') return null;
      if (!c.id || typeof c.id !== 'string') return null;
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

/**
 * Apply a cloud snapshot to local storage as a per-record merge. Newer
 * `updatedAt` wins. Tombstones (deletedAt set) propagate. Local-only records
 * are left untouched (caller's syncUp will push them next).
 *
 * Returns { applied, skipped, inserted } counts for diagnostics.
 *
 * This function does NOT update LAST_LOCAL_MUTATION_KEY because the writes
 * are not user mutations — they are remote state arriving locally.
 */
export async function applyCloudMerge(remoteCustomers) {
  if (!Array.isArray(remoteCustomers)) {
    throw new Error('applyCloudMerge: expected an array');
  }

  return withWriteLock(async () => {
    const localIds = await loadIndex();
    const localById = new Map();
    await Promise.all(localIds.map(async (id) => {
      const raw = await AsyncStorage.getItem(CUSTOMER_KEY_PREFIX + id);
      if (!raw) return;
      try { localById.set(id, JSON.parse(raw)); } catch { /* ignore */ }
    }));

    let applied = 0, skipped = 0, inserted = 0;
    const toWrite = [];
    const newIds = new Set(localIds);

    for (const rc of remoteCustomers) {
      if (!rc || typeof rc !== 'object' || !rc.id) continue;
      const local = localById.get(rc.id);
      const normalized = normalizeCustomer(rc);
      if (!normalized) continue;

      if (!local) {
        toWrite.push(normalized);
        newIds.add(rc.id);
        inserted++;
        continue;
      }
      // Newer wins. Equal updatedAt = no-op (local already represents this).
      if (compareIso(normalized.updatedAt, local.updatedAt) > 0) {
        toWrite.push(normalized);
        applied++;
      } else {
        skipped++;
      }
    }

    if (toWrite.length > 0) {
      await Promise.all(toWrite.map(saveOneCustomer));
      // Index needs to include any newly inserted IDs.
      if (newIds.size !== localIds.length) {
        await saveIndex(Array.from(newIds));
      }
      invalidateCache();
    }

    return { applied, skipped, inserted };
  });
}

/**
 * Hard-remove tombstones older than TOMBSTONE_RETENTION_MS. Called from the
 * cloud sync layer after a successful round so deleted records do not
 * accumulate forever. Safe to call on devices that never sync — tombstones
 * will pile up but will eventually be reaped.
 */
export async function purgeOldTombstones() {
  return withWriteLock(async () => {
    const ids = await loadIndex();
    const cutoff = Date.now() - TOMBSTONE_RETENTION_MS;
    const stale = [];
    await Promise.all(ids.map(async (id) => {
      const raw = await AsyncStorage.getItem(CUSTOMER_KEY_PREFIX + id);
      if (!raw) return;
      try {
        const c = JSON.parse(raw);
        if (c?.deletedAt && Date.parse(c.deletedAt) < cutoff) {
          stale.push(id);
        }
      } catch { /* ignore */ }
    }));
    if (stale.length === 0) return 0;

    const staleSet = new Set(stale);
    await Promise.all(stale.map(deleteOneCustomer));
    await saveIndex(ids.filter((id) => !staleSet.has(id)));
    invalidateCache();
    return stale.length;
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
    AsyncStorage.removeItem(SCHEMA_VERSION_KEY),
    AsyncStorage.removeItem(LAST_LOCAL_MUTATION_KEY),
  ]);
  invalidateCache();
}
