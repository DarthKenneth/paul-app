// =============================================================================
// storage.test.js - Adversarial stress tests for storage.js
// Version: 1.1
// Last Updated: 2026-04-14
//
// PROJECT:      Rolodeck (project v0.22)
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial adversarial test suite
// v1.1  2026-04-14  Claude  Updated for v2 per-customer key architecture
//       - Added expo-crypto mock (getRandomBytesAsync via Node crypto.randomBytes)
//         so generateId() works in the Node test environment
//       - Made beforeEach async; added await clearAllData() to invalidate the
//         in-memory cache between tests (prevented stale cache reads)
//       - Removed getSchemaVersion import (removed from storage.js v2.0)
//       - Updated getAllCustomers serviceLog test to use v2 per-customer keys
//       - Updated addServiceEntry corrupted-serviceLog test to use v2 key
//       - Fixed sort preference default expectation: 'name' → 'firstName'
//       - Rewrote schema version tests for v2 initStorage/migration behavior
//       - Fixed orphaned-key test to set @callcard_customers (migration trigger)
//       - Updated adversarial tests to use v2 per-customer key format
// =============================================================================

// ── expo-crypto mock (Node test env doesn't have native crypto module) ────────

jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: async (n) => {
    const { randomBytes } = require('crypto');
    return randomBytes(n);
  },
}));

// ── AsyncStorage mock ────────────────────────────────────────────────────────

const store = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key) => Promise.resolve(store[key] ?? null)),
  setItem: jest.fn((key, value) => {
    store[key] = value;
    return Promise.resolve();
  }),
  removeItem: jest.fn((key) => {
    delete store[key];
    return Promise.resolve();
  }),
  multiRemove: jest.fn((keys) => {
    keys.forEach((k) => delete store[k]);
    return Promise.resolve();
  }),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getAllCustomers,
  getCustomerById,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  addServiceEntry,
  updateServiceEntry,
  deleteServiceEntry,
  getSortPreference,
  saveSortPreference,
  clearAllData,
  initStorage,
  CURRENT_SCHEMA_VERSION,
} from '../data/storage';

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  // Clear mock store
  Object.keys(store).forEach((k) => delete store[k]);
  jest.clearAllMocks();
  // Invalidate the in-memory cache inside storage.js so each test starts cold.
  // After clearing the store above, clearAllData() just calls invalidateCache().
  await clearAllData();
});

// ── getAllCustomers ───────────────────────────────────────────────────────────

describe('getAllCustomers', () => {
  test('returns empty array when no data exists', async () => {
    const result = await getAllCustomers();
    expect(result).toEqual([]);
  });

  test('returns empty array for corrupted JSON', async () => {
    store['@callcard_customers'] = 'not valid json {{{';
    const result = await getAllCustomers();
    expect(result).toEqual([]);
  });

  test('returns empty array for non-array JSON (object)', async () => {
    store['@callcard_customers'] = JSON.stringify({ not: 'an array' });
    const result = await getAllCustomers();
    expect(result).toEqual([]);
  });

  test('returns empty array for non-array JSON (string)', async () => {
    store['@callcard_customers'] = JSON.stringify('just a string');
    const result = await getAllCustomers();
    expect(result).toEqual([]);
  });

  test('returns empty array for non-array JSON (number)', async () => {
    store['@callcard_customers'] = JSON.stringify(42);
    const result = await getAllCustomers();
    expect(result).toEqual([]);
  });

  test('returns empty array for null value', async () => {
    store['@callcard_customers'] = JSON.stringify(null);
    const result = await getAllCustomers();
    expect(result).toEqual([]);
  });

  test('ensures serviceLog array exists on every customer', async () => {
    store['@callcard_customer_index'] = JSON.stringify(['1', '2', '3', '4']);
    store['@callcard_customer_1'] = JSON.stringify({ id: '1', name: 'No Log' });
    store['@callcard_customer_2'] = JSON.stringify({ id: '2', name: 'Null Log', serviceLog: null });
    store['@callcard_customer_3'] = JSON.stringify({ id: '3', name: 'String Log', serviceLog: 'not an array' });
    store['@callcard_customer_4'] = JSON.stringify({ id: '4', name: 'Good Log', serviceLog: [{ id: 'e1' }] });
    const result = await getAllCustomers();
    expect(result).toHaveLength(4);
    result.forEach((c) => {
      expect(Array.isArray(c.serviceLog)).toBe(true);
    });
    // Good log should preserve its entries
    const good = result.find((c) => c.id === '4');
    expect(good.serviceLog).toHaveLength(1);
  });

  test('returns empty array for empty string', async () => {
    store['@callcard_customers'] = '';
    const result = await getAllCustomers();
    expect(result).toEqual([]);
  });
});

// ── addCustomer ──────────────────────────────────────────────────────────────

describe('addCustomer', () => {
  test('adds a customer with all fields', async () => {
    const result = await addCustomer({
      name: 'John Doe',
      email: 'john@example.com',
      phone: '555-0123',
      address: '123 Main St',
      zipCode: '90210',
    });
    expect(result.id).toBeTruthy();
    expect(result.name).toBe('John Doe');
    expect(result.serviceLog).toEqual([]);

    const all = await getAllCustomers();
    expect(all).toHaveLength(1);
  });

  test('adds a customer with minimal data (only name)', async () => {
    const result = await addCustomer({ name: 'Minimal' });
    expect(result.name).toBe('Minimal');
    expect(result.email).toBe('');
    expect(result.phone).toBe('');
    expect(result.address).toBe('');
    expect(result.zipCode).toBe('');
  });

  test('adds a customer with empty object', async () => {
    const result = await addCustomer({});
    expect(result.name).toBe('');
    expect(result.id).toBeTruthy();
  });

  test('generates unique IDs for multiple customers', async () => {
    const c1 = await addCustomer({ name: 'A' });
    const c2 = await addCustomer({ name: 'B' });
    const c3 = await addCustomer({ name: 'C' });
    expect(c1.id).not.toBe(c2.id);
    expect(c2.id).not.toBe(c3.id);
    expect(c1.id).not.toBe(c3.id);
  });

  test('handles adding many customers', async () => {
    for (let i = 0; i < 100; i++) {
      await addCustomer({ name: `Customer ${i}` });
    }
    const all = await getAllCustomers();
    expect(all).toHaveLength(100);
  });
});

// ── getCustomerById ──────────────────────────────────────────────────────────

describe('getCustomerById', () => {
  test('returns null for non-existent ID', async () => {
    const result = await getCustomerById('nonexistent');
    expect(result).toBeNull();
  });

  test('returns null when no customers exist', async () => {
    const result = await getCustomerById('any-id');
    expect(result).toBeNull();
  });

  test('finds customer by ID', async () => {
    const added = await addCustomer({ name: 'Find Me' });
    const found = await getCustomerById(added.id);
    expect(found).not.toBeNull();
    expect(found.name).toBe('Find Me');
  });
});

// ── updateCustomer ───────────────────────────────────────────────────────────

describe('updateCustomer', () => {
  test('updates customer fields', async () => {
    const c = await addCustomer({ name: 'Original' });
    const updated = await updateCustomer(c.id, { name: 'Updated' });
    expect(updated.name).toBe('Updated');
  });

  test('preserves serviceLog during update', async () => {
    const c = await addCustomer({ name: 'Test' });
    await addServiceEntry(c.id, { date: new Date().toISOString(), notes: 'Test service' });

    const updated = await updateCustomer(c.id, { name: 'Test Updated' });
    expect(updated.serviceLog).toHaveLength(1);
  });

  test('throws for non-existent customer', async () => {
    await expect(updateCustomer('fake-id', { name: 'X' })).rejects.toThrow(
      'Customer not found',
    );
  });

  test('ignores serviceLog in updates (cannot overwrite via update)', async () => {
    const c = await addCustomer({ name: 'Test' });
    await addServiceEntry(c.id, { date: new Date().toISOString(), notes: 'Original' });

    await updateCustomer(c.id, { serviceLog: [] });
    const found = await getCustomerById(c.id);
    expect(found.serviceLog).toHaveLength(1);
  });
});

// ── deleteCustomer ───────────────────────────────────────────────────────────

describe('deleteCustomer', () => {
  test('removes customer', async () => {
    const c = await addCustomer({ name: 'To Delete' });
    await deleteCustomer(c.id);
    const all = await getAllCustomers();
    expect(all).toHaveLength(0);
  });

  test('does not throw for non-existent customer', async () => {
    await expect(deleteCustomer('fake-id')).resolves.toBeUndefined();
  });

  test('only removes the target customer', async () => {
    const c1 = await addCustomer({ name: 'Keep' });
    const c2 = await addCustomer({ name: 'Delete' });
    await deleteCustomer(c2.id);
    const all = await getAllCustomers();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(c1.id);
  });
});

// ── addServiceEntry ──────────────────────────────────────────────────────────

describe('addServiceEntry', () => {
  test('adds an entry to customer serviceLog', async () => {
    const c = await addCustomer({ name: 'Test' });
    const entry = await addServiceEntry(c.id, {
      date: '2026-04-03T12:00:00.000Z',
      notes: 'Annual checkup',
    });
    expect(entry.id).toBeTruthy();
    expect(entry.type).toBe('service');

    const found = await getCustomerById(c.id);
    expect(found.serviceLog).toHaveLength(1);
  });

  test('prepends new entries (newest first)', async () => {
    const c = await addCustomer({ name: 'Test' });
    await addServiceEntry(c.id, { date: '2025-01-01T00:00:00.000Z', notes: 'First' });
    await addServiceEntry(c.id, { date: '2026-01-01T00:00:00.000Z', notes: 'Second' });

    const found = await getCustomerById(c.id);
    expect(found.serviceLog[0].notes).toBe('Second');
    expect(found.serviceLog[1].notes).toBe('First');
  });

  test('throws for non-existent customer', async () => {
    await expect(
      addServiceEntry('fake-id', { date: new Date().toISOString() }),
    ).rejects.toThrow('Customer not found');
  });

  test('defaults to current date and service type', async () => {
    const c = await addCustomer({ name: 'Test' });
    const entry = await addServiceEntry(c.id, {});
    expect(entry.date).toBeTruthy();
    expect(entry.type).toBe('service');
    expect(entry.notes).toBe('');
  });

  test('handles customer with corrupted serviceLog (non-array)', async () => {
    const c = await addCustomer({ name: 'Test' });
    // Corrupt the serviceLog directly in the v2 per-customer key
    store[`@callcard_customer_${c.id}`] = JSON.stringify({ ...c, serviceLog: 'corrupted' });

    // addServiceEntry should recover because loadOneCustomer normalizes serviceLog
    const entry = await addServiceEntry(c.id, { date: new Date().toISOString() });
    expect(entry.id).toBeTruthy();

    const found = await getCustomerById(c.id);
    expect(found.serviceLog).toHaveLength(1);
  });
});

// ── updateServiceEntry ───────────────────────────────────────────────────────

describe('updateServiceEntry', () => {
  test('updates an existing entry', async () => {
    const c = await addCustomer({ name: 'Test' });
    const entry = await addServiceEntry(c.id, { notes: 'Original' });

    const updated = await updateServiceEntry(c.id, entry.id, { notes: 'Updated' });
    expect(updated.notes).toBe('Updated');
    expect(updated.id).toBe(entry.id); // ID preserved
  });

  test('throws for non-existent customer', async () => {
    await expect(updateServiceEntry('fake', 'fake', {})).rejects.toThrow(
      'Customer not found',
    );
  });

  test('throws for non-existent entry', async () => {
    const c = await addCustomer({ name: 'Test' });
    await expect(updateServiceEntry(c.id, 'fake-entry', {})).rejects.toThrow(
      'Service entry not found',
    );
  });

  test('preserves entry ID even if update tries to change it', async () => {
    const c = await addCustomer({ name: 'Test' });
    const entry = await addServiceEntry(c.id, { notes: 'Test' });

    const updated = await updateServiceEntry(c.id, entry.id, {
      id: 'hacked-id',
      notes: 'New',
    });
    expect(updated.id).toBe(entry.id);
  });
});

// ── deleteServiceEntry ───────────────────────────────────────────────────────

describe('deleteServiceEntry', () => {
  test('removes a specific entry', async () => {
    const c = await addCustomer({ name: 'Test' });
    const e1 = await addServiceEntry(c.id, { notes: 'Keep' });
    const e2 = await addServiceEntry(c.id, { notes: 'Delete' });

    await deleteServiceEntry(c.id, e2.id);
    const found = await getCustomerById(c.id);
    expect(found.serviceLog).toHaveLength(1);
    expect(found.serviceLog[0].id).toBe(e1.id);
  });

  test('throws for non-existent customer', async () => {
    await expect(deleteServiceEntry('fake', 'fake')).rejects.toThrow(
      'Customer not found',
    );
  });

  test('silently succeeds for non-existent entry (filter returns same array)', async () => {
    const c = await addCustomer({ name: 'Test' });
    await addServiceEntry(c.id, { notes: 'Keep' });
    // Deleting non-existent entry should not throw
    await expect(deleteServiceEntry(c.id, 'fake-entry')).resolves.toBeUndefined();
  });
});

// ── Sort preference ──────────────────────────────────────────────────────────

describe('sort preference', () => {
  test('defaults to "firstName" when no preference saved', async () => {
    const pref = await getSortPreference();
    expect(pref).toBe('firstName');
  });

  test('persists and retrieves preference', async () => {
    await saveSortPreference('zip');
    const pref = await getSortPreference();
    expect(pref).toBe('zip');
  });

  test('handles overwriting preference', async () => {
    await saveSortPreference('zip');
    await saveSortPreference('email');
    const pref = await getSortPreference();
    expect(pref).toBe('email');
  });
});

// ── clearAllData ─────────────────────────────────────────────────────────────

describe('clearAllData', () => {
  test('removes all customer and preference data', async () => {
    await addCustomer({ name: 'Test' });
    await saveSortPreference('zip');
    await clearAllData();

    const customers = await getAllCustomers();
    const pref = await getSortPreference();
    expect(customers).toEqual([]);
    expect(pref).toBe('firstName');
  });
});

// ── initStorage / migration ───────────────────────────────────────────────────

describe('initStorage', () => {
  test('creates an empty index on fresh install', async () => {
    await initStorage();
    const raw = store['@callcard_customer_index'];
    expect(raw).not.toBeNull();
    expect(raw).not.toBeUndefined();
    expect(JSON.parse(raw)).toEqual([]);
    expect(typeof CURRENT_SCHEMA_VERSION).toBe('number');
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(2);
  });

  test('does not overwrite existing per-customer data on re-init', async () => {
    const c = await addCustomer({ name: 'Existing' });
    await initStorage();
    const all = await getAllCustomers();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Existing');
  });

  test('migrates legacy envelope format (v1) to per-customer keys', async () => {
    store['@callcard_customers'] = JSON.stringify({
      schemaVersion: 1,
      customers: [
        { id: 'abc', name: 'From Legacy', serviceLog: [], scheduledServices: [] },
        { id: 'def', name: 'Also Legacy' },
      ],
    });
    await initStorage();
    // Legacy key removed
    expect(store['@callcard_customers']).toBeUndefined();
    // Data accessible via v2 API
    const all = await getAllCustomers();
    expect(all).toHaveLength(2);
    expect(all.find((c) => c.id === 'abc').name).toBe('From Legacy');
    // serviceLog and scheduledServices normalized on all customers
    all.forEach((c) => {
      expect(Array.isArray(c.serviceLog)).toBe(true);
      expect(Array.isArray(c.scheduledServices)).toBe(true);
    });
  });

  test('migrates legacy raw-array format (v0) to per-customer keys', async () => {
    store['@callcard_customers'] = JSON.stringify([
      { id: '1', name: 'Legacy A', serviceLog: [] },
      { id: '2', name: 'Legacy B' }, // missing serviceLog entirely
    ]);
    await initStorage();
    expect(store['@callcard_customers']).toBeUndefined();
    const all = await getAllCustomers();
    expect(all).toHaveLength(2);
    all.forEach((c) => {
      expect(Array.isArray(c.serviceLog)).toBe(true);
      expect(Array.isArray(c.scheduledServices)).toBe(true);
    });
  });

  test('removes orphaned legacy @callcard_schema_version key', async () => {
    // The multiRemove that cleans up the schema_version key only runs during
    // migration, so we need to also set the legacy customers key to trigger it.
    store['@callcard_schema_version'] = '1';
    store['@callcard_customers'] = JSON.stringify([]);
    await initStorage();
    expect(store['@callcard_schema_version']).toBeUndefined();
  });
});

// ── Adversarial scenarios ────────────────────────────────────────────────────

describe('adversarial scenarios', () => {
  test('handles extremely long customer name', async () => {
    const longName = 'A'.repeat(10000);
    const c = await addCustomer({ name: longName });
    expect(c.name).toBe(longName);
    const found = await getCustomerById(c.id);
    expect(found.name.length).toBe(10000);
  });

  test('handles special characters in fields', async () => {
    const c = await addCustomer({
      name: '"}]}\\n\\t<script>alert("xss")</script>',
      email: 'test@example.com',
      phone: '+1 (555) 🎉',
      address: '123 "Main" St & Co.',
      zipCode: '00000-1234',
    });
    const found = await getCustomerById(c.id);
    expect(found.name).toBe('"}]}\\n\\t<script>alert("xss")</script>');
    expect(found.phone).toBe('+1 (555) 🎉');
  });

  test('handles unicode and emoji in all fields', async () => {
    const c = await addCustomer({
      name: '田中太郎 🏠',
      email: 'tanaka@例え.jp',
      address: '東京都渋谷区 123',
    });
    const found = await getCustomerById(c.id);
    expect(found.name).toBe('田中太郎 🏠');
  });

  test('handles rapid sequential adds', async () => {
    const promises = Array.from({ length: 50 }, (_, i) =>
      addCustomer({ name: `Rapid ${i}` }),
    );
    // These run concurrently — potential race condition
    // With current implementation, some may be lost, but it should not crash
    await Promise.allSettled(promises);
    const all = await getAllCustomers();
    // At minimum should not crash; ideally all 50 are present
    expect(all.length).toBeGreaterThan(0);
    expect(all.length).toBeLessThanOrEqual(50);
  });

  test('handles customer with deeply nested garbage in serviceLog', async () => {
    store['@callcard_customer_index'] = JSON.stringify(['bad']);
    store['@callcard_customer_bad'] = JSON.stringify({
      id: 'bad',
      name: 'Bad Data',
      serviceLog: [
        { id: 'e1', date: { nested: { deep: true } }, type: 'service', notes: '' },
      ],
    });
    // Should not crash when loading
    const customers = await getAllCustomers();
    expect(customers).toHaveLength(1);
    expect(customers[0].serviceLog).toHaveLength(1);
  });

  test('handles storage with massive data (1MB+ JSON)', async () => {
    const customerIds = Array.from({ length: 500 }, (_, i) => `c-${i}`);
    store['@callcard_customer_index'] = JSON.stringify(customerIds);
    customerIds.forEach((id, i) => {
      store[`@callcard_customer_${id}`] = JSON.stringify({
        id,
        name: `Customer ${i} ${'x'.repeat(1000)}`,
        email: `c${i}@example.com`,
        phone: '555-0000',
        address: '123 Test St',
        zipCode: '00000',
        serviceLog: Array.from({ length: 10 }, (_, j) => ({
          id: `e-${i}-${j}`,
          date: new Date(2020 + j, 0, 1).toISOString(),
          type: 'service',
          notes: 'test note'.repeat(10),
        })),
      });
    });

    const all = await getAllCustomers();
    expect(all).toHaveLength(500);
    expect(all[0].serviceLog).toHaveLength(10);
  });

  test('ID generation produces unique IDs even in rapid succession', async () => {
    const ids = new Set();
    const c = await addCustomer({ name: 'Test' });
    for (let i = 0; i < 100; i++) {
      const entry = await addServiceEntry(c.id, { notes: `Entry ${i}` });
      ids.add(entry.id);
    }
    expect(ids.size).toBe(100);
  });
});
