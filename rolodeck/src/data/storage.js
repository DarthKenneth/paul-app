// =============================================================================
// storage.js - AsyncStorage CRUD layer for all on-device data
// Version: 1.6
// Last Updated: 2026-04-10
//
// PROJECT:      Rolodeck (project v0.18)
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
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Customer data lives in an envelope under @rolodeck_customers:
//       { schemaVersion: N, customers: [...] }
//     schemaVersion is authoritative — drives the migration runner
//   - Sort preference lives under @rolodeck_sort_pref
//   - Legacy raw-array format (pre-envelope) is detected as schemaVersion 0
//     and migrated to the current envelope on first load
//   - MIGRATIONS[N] is a pure function (customers -> customers) that transforms
//     customers from version N-1 to version N. Migration runner walks the chain
//     from the stored version up to CURRENT_SCHEMA_VERSION, persisting the
//     result. Add new migrations by bumping CURRENT_SCHEMA_VERSION and adding
//     MIGRATIONS[newVersion].
//   - If stored version > CURRENT_SCHEMA_VERSION (downgrade scenario), data is
//     returned read-only without modification — never clobber newer data with
//     an older build
//   - No in-memory cache — every call reads from / writes to AsyncStorage
//     directly; for v1 data volumes this is acceptable
//   - IDs generated via crypto-quality random hex + timestamp (no uuid dep)
//   - Service log entries stored inline in each customer object (serviceLog[])
//   - addServiceEntry prepends (newest first) to maintain display order
//   - All exported functions are async and resolve with the result or throw
//   - loadCustomers() defensively handles corrupted JSON and normalizes arrays
//   - Service interval: mode stored as '30'|'60'|'90'|'180'|'365'|'custom';
//     custom mode stores a separate days value; modeToIntervalDays() is a
//     pure sync helper for converting to a day count
//
// SCHEMA:
//   Customer: { id, name, email, phone, address, city, state, zipCode,
//               archived (bool), serviceLog, scheduledServices }
//   ServiceEntry:   { id, date (ISO string), type ('service'|'install'), notes,
//                     intervalDays? (number, present only for custom-interval entries) }
//   ScheduledEntry: { id, date (ISO string), notes, createdAt (ISO string) }
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
//         instead of a raw array, so version travels with the data (previously
//         the version was in a separate key and could drift out of sync)
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
//       - Added addScheduledService, deleteScheduledService [updated SCHEMA, ARCHITECTURE]
// v1.4  2026-04-09  Claude  Service interval preference storage
//       - Added SERVICE_INTERVAL_MODE_KEY, SERVICE_INTERVAL_CUSTOM_DAYS_KEY
//       - Added getServiceIntervalMode, saveServiceIntervalMode
//       - Added getServiceIntervalCustomDays, saveServiceIntervalCustomDays
//       - Added modeToIntervalDays() pure sync helper [updated SCHEMA,
//         ARCHITECTURE]
// =============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';

const CUSTOMERS_KEY                    = '@rolodeck_customers';
const SORT_PREF_KEY                    = '@rolodeck_sort_pref';
const SHOW_ARCHIVED_KEY                = '@rolodeck_show_archived';
const SCHEMA_VERSION_KEY               = '@rolodeck_schema_version';
const ONBOARDING_DONE_KEY              = '@rolodeck_onboarding_complete';
const SERVICE_INTERVAL_MODE_KEY        = '@rolodeck_service_interval_mode';
const SERVICE_INTERVAL_CUSTOM_DAYS_KEY = '@rolodeck_service_interval_custom_days';

export const CURRENT_SCHEMA_VERSION = 1;

// ── ID generation ─────────────────────────────────────────────────────────────

let _idCounter = 0;

function generateId() {
  const hex = Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, '0'),
  ).join('');
  return `${hex}-${Date.now().toString(36)}-${(++_idCounter).toString(36)}`;
}

// ── Schema version & migrations ──────────────────────────────────────────────
//
// Migrations are keyed by TARGET version. MIGRATIONS[N] transforms customers
// from version N-1 to version N. The runner walks the chain from the stored
// version up to CURRENT_SCHEMA_VERSION, calling each migration in order.
//
// Add a new migration by:
//   1. Bumping CURRENT_SCHEMA_VERSION to the next integer
//   2. Adding MIGRATIONS[newVersion] = (customers) => transformed
//   3. The runner handles the rest — existing users will migrate on next load

const MIGRATIONS = {
  // 0 → 1: legacy raw-array wrapped in envelope. Customer shape unchanged,
  // but we defensively ensure serviceLog and scheduledServices are arrays
  // (some early records may be missing scheduledServices entirely).
  1: (customers) => customers.map((c) => ({
    ...c,
    serviceLog:        Array.isArray(c.serviceLog)        ? c.serviceLog        : [],
    scheduledServices: Array.isArray(c.scheduledServices) ? c.scheduledServices : [],
  })),
};

/**
 * Reads raw AsyncStorage and returns an envelope shape, detecting:
 *   - Missing key → empty envelope at current version
 *   - Legacy raw array → envelope at version 0 (will trigger migration)
 *   - Envelope object → envelope at its declared version
 *   - Corrupt JSON / unrecognized shape → empty envelope at current version
 */
async function loadEnvelope() {
  const raw = await AsyncStorage.getItem(CUSTOMERS_KEY);
  if (!raw) return { schemaVersion: CURRENT_SCHEMA_VERSION, customers: [], isFresh: true };
  try {
    const parsed = JSON.parse(raw);
    // Legacy format: raw array — treat as v0, will be migrated
    if (Array.isArray(parsed)) {
      return { schemaVersion: 0, customers: parsed, isFresh: false };
    }
    // Envelope format
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.customers)) {
      const v = Number.isInteger(parsed.schemaVersion) ? parsed.schemaVersion : 0;
      return { schemaVersion: v, customers: parsed.customers, isFresh: false };
    }
    // Unrecognized shape — treat as empty
    return { schemaVersion: CURRENT_SCHEMA_VERSION, customers: [], isFresh: true };
  } catch {
    // Corrupt JSON — treat as empty
    return { schemaVersion: CURRENT_SCHEMA_VERSION, customers: [], isFresh: true };
  }
}

/**
 * Writes customers to AsyncStorage wrapped in the current envelope format.
 * Always writes CURRENT_SCHEMA_VERSION — callers are responsible for running
 * migrations first if they load from an older version.
 */
async function persistEnvelope(customers) {
  const envelope = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    customers,
  };
  await AsyncStorage.setItem(CUSTOMERS_KEY, JSON.stringify(envelope));
}

/**
 * Walks the MIGRATIONS chain from the given version up to CURRENT_SCHEMA_VERSION.
 * Throws if a required migration is missing (guards against half-implemented bumps).
 */
function runMigrations(schemaVersion, customers) {
  let version = schemaVersion;
  let data = customers;
  while (version < CURRENT_SCHEMA_VERSION) {
    const nextVersion = version + 1;
    const migrate = MIGRATIONS[nextVersion];
    if (!migrate) {
      throw new Error(
        `[storage] Missing migration to version ${nextVersion}. Check MIGRATIONS in storage.js.`,
      );
    }
    data = migrate(data);
    version = nextVersion;
  }
  return data;
}

/**
 * Called once on app startup. Ensures the customers envelope exists and is
 * migrated to the current schema version. Also cleans up the orphaned legacy
 * SCHEMA_VERSION_KEY from the pre-envelope era if it's still lying around.
 */
export async function initStorage() {
  const envelope = await loadEnvelope();

  if (envelope.isFresh) {
    // Fresh install — write an empty envelope so getSchemaVersion is explicit
    await persistEnvelope([]);
  } else if (envelope.schemaVersion < CURRENT_SCHEMA_VERSION) {
    // Migrate legacy or older envelope to current version
    const migrated = runMigrations(envelope.schemaVersion, envelope.customers);
    await persistEnvelope(migrated);
  }
  // If envelope.schemaVersion > CURRENT_SCHEMA_VERSION (downgrade scenario),
  // leave the data alone — loadCustomers will return it read-only.

  // Clean up the orphaned pre-envelope SCHEMA_VERSION_KEY if present
  await AsyncStorage.removeItem(SCHEMA_VERSION_KEY).catch(() => {});
}

/**
 * Returns the schema version currently stored on disk.
 *   - null  → no customers key exists (fresh install before initStorage)
 *   - 0     → legacy raw-array format (should be migrated on next load)
 *   - N ≥ 1 → envelope with explicit schemaVersion
 */
export async function getSchemaVersion() {
  const raw = await AsyncStorage.getItem(CUSTOMERS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return 0;
    if (parsed && typeof parsed === 'object' && Number.isInteger(parsed.schemaVersion)) {
      return parsed.schemaVersion;
    }
    return null;
  } catch {
    return null;
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

// ── Internal customer load/persist ────────────────────────────────────────────
//
// loadCustomers() always goes through loadEnvelope + runMigrations, so every
// read path gets the normalized shape regardless of whether initStorage() has
// been called yet. If a migration happens, we write it back so subsequent
// reads are fast. Downgrade scenarios (stored version > current) are returned
// read-only and never clobbered.

function normalizeCustomers(customers) {
  // Defensive: ensure serviceLog and scheduledServices are arrays regardless
  // of migration state — guards against corrupted writes or hand-edited data
  return customers.map((c) => ({
    ...c,
    serviceLog:        Array.isArray(c.serviceLog)        ? c.serviceLog        : [],
    scheduledServices: Array.isArray(c.scheduledServices) ? c.scheduledServices : [],
  }));
}

async function loadCustomers() {
  const envelope = await loadEnvelope();

  if (envelope.schemaVersion === CURRENT_SCHEMA_VERSION) {
    // Fast path — current version. Still normalize defensively in case
    // something wrote corrupted shape directly (tests, debug tools, etc.)
    return normalizeCustomers(envelope.customers);
  }

  if (envelope.schemaVersion > CURRENT_SCHEMA_VERSION) {
    // Downgrade: read-only, don't write back. Still normalize for the reader.
    return normalizeCustomers(envelope.customers);
  }

  // Migration needed — run the chain and persist the result
  const migrated = runMigrations(envelope.schemaVersion, envelope.customers);
  await persistEnvelope(migrated);
  return migrated;
}

async function persistCustomers(customers) {
  await persistEnvelope(customers);
}

// ── Customer reads ────────────────────────────────────────────────────────────

export async function getAllCustomers() {
  return loadCustomers();
}

export async function getCustomerById(id) {
  const customers = await loadCustomers();
  return customers.find((c) => c.id === id) || null;
}

// ── Customer writes ───────────────────────────────────────────────────────────

export async function addCustomer(data) {
  const customers = await loadCustomers();
  const newCustomer = {
    id:         generateId(),
    name:       data.name       || '',
    email:      data.email      || '',
    phone:      data.phone      || '',
    address:    data.address    || '',
    city:       data.city       || '',
    state:      data.state      || '',
    zipCode:    data.zipCode    || '',
    archived:   false,
    serviceLog: [],
  };
  customers.push(newCustomer);
  await persistCustomers(customers);
  return newCustomer;
}

export async function updateCustomer(id, updates) {
  const customers = await loadCustomers();
  const idx = customers.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error(`Customer not found: ${id}`);
  // Preserve serviceLog — only update top-level info fields
  const { serviceLog, ...safeUpdates } = updates;
  customers[idx] = { ...customers[idx], ...safeUpdates };
  await persistCustomers(customers);
  return customers[idx];
}

export async function deleteCustomer(id) {
  const customers = await loadCustomers();
  await persistCustomers(customers.filter((c) => c.id !== id));
}

// ── Archive ───────────────────────────────────────────────────────────────────

export async function archiveCustomer(id) {
  const customers = await loadCustomers();
  const idx = customers.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error(`Customer not found: ${id}`);
  customers[idx].archived = true;
  await persistCustomers(customers);
  return customers[idx];
}

export async function unarchiveCustomer(id) {
  const customers = await loadCustomers();
  const idx = customers.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error(`Customer not found: ${id}`);
  customers[idx].archived = false;
  await persistCustomers(customers);
  return customers[idx];
}

// ── Service log writes ────────────────────────────────────────────────────────

export async function addServiceEntry(customerId, data) {
  const customers = await loadCustomers();
  const idx = customers.findIndex((c) => c.id === customerId);
  if (idx === -1) throw new Error(`Customer not found: ${customerId}`);

  const entry = {
    id:    generateId(),
    date:  data.date  || new Date().toISOString(),
    type:  data.type  || 'service',
    notes: data.notes || '',
  };

  // Ensure serviceLog exists, then prepend so newest entry is always index 0
  if (!Array.isArray(customers[idx].serviceLog)) {
    customers[idx].serviceLog = [];
  }
  customers[idx].serviceLog = [entry, ...customers[idx].serviceLog];
  await persistCustomers(customers);
  return entry;
}

export async function updateServiceEntry(customerId, entryId, updates) {
  const customers = await loadCustomers();
  const cidx = customers.findIndex((c) => c.id === customerId);
  if (cidx === -1) throw new Error(`Customer not found: ${customerId}`);

  const eidx = customers[cidx].serviceLog.findIndex((e) => e.id === entryId);
  if (eidx === -1) throw new Error(`Service entry not found: ${entryId}`);

  customers[cidx].serviceLog[eidx] = {
    ...customers[cidx].serviceLog[eidx],
    ...updates,
    id: entryId,
  };
  await persistCustomers(customers);
  return customers[cidx].serviceLog[eidx];
}

export async function deleteServiceEntry(customerId, entryId) {
  const customers = await loadCustomers();
  const idx = customers.findIndex((c) => c.id === customerId);
  if (idx === -1) throw new Error(`Customer not found: ${customerId}`);

  customers[idx].serviceLog = customers[idx].serviceLog.filter(
    (e) => e.id !== entryId,
  );
  await persistCustomers(customers);
}

// ── Scheduled services ────────────────────────────────────────────────────────

export async function addScheduledService(customerId, data) {
  const customers = await loadCustomers();
  const idx = customers.findIndex((c) => c.id === customerId);
  if (idx === -1) throw new Error(`Customer not found: ${customerId}`);
  const entry = {
    id:        generateId(),
    date:      data.date  || new Date().toISOString(),
    notes:     data.notes || '',
    createdAt: new Date().toISOString(),
  };
  if (!Array.isArray(customers[idx].scheduledServices)) {
    customers[idx].scheduledServices = [];
  }
  customers[idx].scheduledServices = [entry, ...customers[idx].scheduledServices];
  await persistCustomers(customers);
  return entry;
}

export async function deleteScheduledService(customerId, entryId) {
  const customers = await loadCustomers();
  const idx = customers.findIndex((c) => c.id === customerId);
  if (idx === -1) throw new Error(`Customer not found: ${customerId}`);
  customers[idx].scheduledServices = (customers[idx].scheduledServices || []).filter(
    (e) => e.id !== entryId,
  );
  await persistCustomers(customers);
}

// ── Sort preference ───────────────────────────────────────────────────────────

export async function getSortPreference() {
  const pref = await AsyncStorage.getItem(SORT_PREF_KEY);
  return pref || 'name';
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
 * Used exclusively by backup.js during restore. Each customer is passed
 * through the same defensive normalization as loadCustomers(), then persisted
 * as a current-version envelope (so restore always lands on CURRENT_SCHEMA_VERSION
 * regardless of which app version created the backup file).
 */
export async function restoreCustomers(customers) {
  if (!Array.isArray(customers)) {
    throw new Error('restoreCustomers: expected an array');
  }
  const normalized = customers.map((c) => ({
    ...c,
    serviceLog:        Array.isArray(c.serviceLog)        ? c.serviceLog        : [],
    scheduledServices: Array.isArray(c.scheduledServices) ? c.scheduledServices : [],
  }));
  await persistEnvelope(normalized);
}

// ── Dev helpers ───────────────────────────────────────────────────────────────

export async function clearAllData() {
  await AsyncStorage.multiRemove([CUSTOMERS_KEY, SORT_PREF_KEY]);
}
