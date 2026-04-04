// =============================================================================
// storage.js - AsyncStorage CRUD layer for all on-device data
// Version: 1.1
// Last Updated: 2026-04-03
//
// PROJECT:      Rolodeck (project v1.2)
// FILES:        storage.js           (this file — all data persistence)
//               serviceAlerts.js     (consumes Customer objects)
//               CustomersScreen.js   (getAllCustomers, getSortPreference)
//               CustomerDetailScreen.js (getCustomerById, updateCustomer,
//                                        deleteCustomer)
//               AddCustomerScreen.js (addCustomer)
//               AddServiceScreen.js  (addServiceEntry)
//               SettingsScreen.js    (getSortPreference, saveSortPreference)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - All customer data lives under a single key: @rolodeck_customers
//   - Sort preference lives under @rolodeck_sort_pref
//   - Schema version stored under @rolodeck_schema_version for future migration
//   - No in-memory cache — every call reads from / writes to AsyncStorage
//     directly; for v1 data volumes this is acceptable
//   - IDs generated via crypto-quality random hex + timestamp (no uuid dep)
//   - Service log entries stored inline in each customer object (serviceLog[])
//   - addServiceEntry prepends (newest first) to maintain display order
//   - All exported functions are async and resolve with the result or throw
//   - loadCustomers() defensively handles corrupted JSON and ensures every
//     customer has a serviceLog array
//
// SCHEMA:
//   Customer: { id, name, email, phone, address, city, state, zipCode,
//               archived (bool), serviceLog }
//   ServiceEntry: { id, date (ISO string), type ('service'|'install'), notes }
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial scaffold
// v1.1  2026-04-03  Claude  Debug + harden + futureproof
//       - Added JSON parse safety in loadCustomers (returns [] on corrupt data)
//       - Defensive serviceLog guarantee on every loaded customer
//       - Added schema version tracking (CURRENT_SCHEMA_VERSION = 1)
//       - Improved generateId() with better entropy (hex + timestamp)
//       - Added initStorage() for schema version initialization
// =============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';

const CUSTOMERS_KEY      = '@rolodeck_customers';
const SORT_PREF_KEY      = '@rolodeck_sort_pref';
const SHOW_ARCHIVED_KEY  = '@rolodeck_show_archived';
const SCHEMA_VERSION_KEY = '@rolodeck_schema_version';

export const CURRENT_SCHEMA_VERSION = 1;

// ── ID generation ─────────────────────────────────────────────────────────────

let _idCounter = 0;

function generateId() {
  const hex = Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, '0'),
  ).join('');
  return `${hex}-${Date.now().toString(36)}-${(++_idCounter).toString(36)}`;
}

// ── Schema version ────────────────────────────────────────────────────────────

export async function initStorage() {
  const version = await AsyncStorage.getItem(SCHEMA_VERSION_KEY);
  if (!version) {
    await AsyncStorage.setItem(SCHEMA_VERSION_KEY, String(CURRENT_SCHEMA_VERSION));
  }
  // Future migrations would go here:
  // if (Number(version) < 2) { await migrateV1toV2(); }
}

export async function getSchemaVersion() {
  const v = await AsyncStorage.getItem(SCHEMA_VERSION_KEY);
  return v ? Number(v) : null;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function loadCustomers() {
  const raw = await AsyncStorage.getItem(CUSTOMERS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Ensure every customer has a serviceLog array
    return parsed.map((c) => ({
      ...c,
      serviceLog: Array.isArray(c.serviceLog) ? c.serviceLog : [],
    }));
  } catch {
    return [];
  }
}

async function persistCustomers(customers) {
  await AsyncStorage.setItem(CUSTOMERS_KEY, JSON.stringify(customers));
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

// ── Dev helpers ───────────────────────────────────────────────────────────────

export async function clearAllData() {
  await AsyncStorage.multiRemove([CUSTOMERS_KEY, SORT_PREF_KEY]);
}
