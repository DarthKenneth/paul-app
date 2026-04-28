// =============================================================================
// backup.test.js - Backup/restore roundtrip + autoBackup smoke tests
// Version: 1.0
// Last Updated: 2026-04-28
//
// PROJECT:      Rolodeck (project v1.5)
//
// PURPOSE:
//   Exercise the full export → import roundtrip with mocked native modules so
//   we catch shape/format regressions in CI. The original SDK 55 incident was
//   masked because no test ever called exportBackup; the bad import only blew
//   up at runtime in production.
//
//   Also smoke-tests autoBackup's 24h rate limit and the no-op when no
//   customers exist.
//
// CHANGE LOG:
// v1.0  2026-04-28  Claude  Initial — roundtrip + autoBackup behavior
// =============================================================================

// ── In-memory filesystem mock ────────────────────────────────────────────────

const mockFsStore = {};

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  EncodingType:      { UTF8: 'utf8', Base64: 'base64' },
  writeAsStringAsync: jest.fn(async (uri, content) => {
    mockFsStore[uri] = content;
  }),
  readAsStringAsync: jest.fn(async (uri) => {
    if (!(uri in mockFsStore)) {
      const err = new Error('No such file: ' + uri);
      err.code = 'ENOENT';
      throw err;
    }
    return mockFsStore[uri];
  }),
}));

// ── Sharing / DocumentPicker mocks ───────────────────────────────────────────

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync:       jest.fn(async () => undefined),
}));

const mockPickedFileUri = { current: null };
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => {
    if (!mockPickedFileUri.current) return { canceled: true, assets: [] };
    return {
      canceled: false,
      assets: [{ uri: mockPickedFileUri.current, name: 'callcard-backup.json' }],
    };
  }),
}));

// ── AsyncStorage mock ────────────────────────────────────────────────────────

const mockAsync = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k) => (k in mockAsync ? mockAsync[k] : null)),
  setItem: jest.fn(async (k, v) => { mockAsync[k] = v; }),
  removeItem: jest.fn(async (k) => { delete mockAsync[k]; }),
}));

// ── Sentry / react-native mocks ──────────────────────────────────────────────

jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

// ── Storage layer mock ───────────────────────────────────────────────────────
// Stub the data layer so we don't drag in the real storage.js (which has its
// own AsyncStorage schema and migrations).

const mockCustomers = { current: [] };
jest.mock('../data/storage', () => ({
  CURRENT_SCHEMA_VERSION: 2,
  getAllCustomers:  jest.fn(async () => mockCustomers.current),
  restoreCustomers: jest.fn(async (list) => { mockCustomers.current = list; }),
}));

jest.mock('../appVersion', () => ({ APP_VERSION: '1.5.2' }));

// ── Begin tests ──────────────────────────────────────────────────────────────

const FileSystemLegacy   = require('expo-file-system/legacy');
const Sharing            = require('expo-sharing');
const DocumentPicker     = require('expo-document-picker');
const AsyncStorage       = require('@react-native-async-storage/async-storage');
const { exportBackup, importBackup, autoBackup, getLastBackupDate, cloudProviderLabel } =
  require('../utils/backup');

beforeEach(() => {
  // Reset all mock state between tests
  for (const k of Object.keys(mockFsStore)) delete mockFsStore[k];
  for (const k of Object.keys(mockAsync))  delete mockAsync[k];
  mockCustomers.current   = [];
  mockPickedFileUri.current = null;
  FileSystemLegacy.writeAsStringAsync.mockClear();
  FileSystemLegacy.readAsStringAsync.mockClear();
  Sharing.shareAsync.mockClear();
  DocumentPicker.getDocumentAsync.mockClear();
});

describe('cloudProviderLabel', () => {
  test('returns iCloud Drive on iOS', () => {
    expect(cloudProviderLabel()).toBe('iCloud Drive');
  });
});

describe('exportBackup → importBackup roundtrip', () => {
  test('round-trips customers without loss', async () => {
    mockCustomers.current = [
      { id: 'c1', firstName: 'Alice', lastName: 'A',  phone: '111', email: 'a@x.com' },
      { id: 'c2', firstName: 'Bob',   lastName: 'B',  phone: '222', email: 'b@x.com' },
      { id: 'c3', firstName: 'Carol', lastName: 'C',  phone: '333', email: 'c@x.com' },
    ];

    await exportBackup();

    // The backup file should have been written and shared
    expect(FileSystemLegacy.writeAsStringAsync).toHaveBeenCalledTimes(1);
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);

    // The written URI is the path argument to shareAsync
    const writtenUri = Sharing.shareAsync.mock.calls[0][0];
    expect(writtenUri).toMatch(/callcard-backup-\d{4}-\d{2}-\d{2}\.json$/);

    // Now wipe the store and "restore" from the file we just wrote
    mockCustomers.current = [];
    mockPickedFileUri.current = writtenUri;

    const result = await importBackup();
    expect(result).toEqual({
      exportedAt:    expect.any(String),
      customerCount: 3,
    });
    expect(mockCustomers.current).toHaveLength(3);
    expect(mockCustomers.current.map((c) => c.id).sort()).toEqual(['c1','c2','c3']);
  });

  test('exportBackup updates last-backup timestamp', async () => {
    mockCustomers.current = [{ id: 'c1', firstName: 'A' }];
    expect(await getLastBackupDate()).toBeNull();
    await exportBackup();
    const d = await getLastBackupDate();
    expect(d).toBeInstanceOf(Date);
  });

  test('importBackup returns null on user cancel', async () => {
    mockPickedFileUri.current = null; // simulates cancel
    const result = await importBackup();
    expect(result).toBeNull();
  });

  test('importBackup throws on invalid JSON', async () => {
    mockFsStore['file:///docs/garbage.json'] = 'not valid json {';
    mockPickedFileUri.current = 'file:///docs/garbage.json';
    await expect(importBackup()).rejects.toThrow(/Invalid backup file/i);
  });

  test('importBackup throws on missing customers field', async () => {
    mockFsStore['file:///docs/empty.json'] = JSON.stringify({ backupVersion: '1' });
    mockPickedFileUri.current = 'file:///docs/empty.json';
    await expect(importBackup()).rejects.toThrow(/missing customer data/i);
  });

  test('importBackup throws when zero records have valid ids', async () => {
    mockFsStore['file:///docs/bad.json'] = JSON.stringify({
      backupVersion: '1',
      customers: [{ firstName: 'no-id-here' }, { id: '', firstName: 'empty-id' }],
    });
    mockPickedFileUri.current = 'file:///docs/bad.json';
    await expect(importBackup()).rejects.toThrow(/no valid customer records/i);
  });

  test('importBackup filters out individual bad records but restores the rest', async () => {
    mockFsStore['file:///docs/mixed.json'] = JSON.stringify({
      backupVersion: '1',
      customers: [
        { id: 'good-1', firstName: 'A' },
        { firstName: 'no-id' },              // dropped
        { id: '',     firstName: 'empty' },  // dropped
        { id: 'good-2', firstName: 'B' },
      ],
    });
    mockPickedFileUri.current = 'file:///docs/mixed.json';

    const result = await importBackup();
    expect(result.customerCount).toBe(2);
    expect(mockCustomers.current).toHaveLength(2);
    expect(mockCustomers.current.map((c) => c.id).sort()).toEqual(['good-1','good-2']);
  });
});

describe('autoBackup', () => {
  test('writes the auto-backup file when none has run yet', async () => {
    mockCustomers.current = [{ id: 'c1', firstName: 'A' }];
    await autoBackup();
    expect(FileSystemLegacy.writeAsStringAsync).toHaveBeenCalledTimes(1);
    expect(mockFsStore['file:///docs/callcard-auto-backup.json']).toBeTruthy();
  });

  test('does NOT write again within 24h', async () => {
    mockCustomers.current = [{ id: 'c1', firstName: 'A' }];

    await autoBackup();
    expect(FileSystemLegacy.writeAsStringAsync).toHaveBeenCalledTimes(1);

    await autoBackup();
    expect(FileSystemLegacy.writeAsStringAsync).toHaveBeenCalledTimes(1); // still 1
  });

  test('DOES write again when last backup is older than 24h', async () => {
    mockCustomers.current = [{ id: 'c1', firstName: 'A' }];

    // Simulate a backup from 25 hours ago
    const old = new Date(Date.now() - (25 * 60 * 60 * 1000)).toISOString();
    mockAsync['@callcard_last_auto_backup'] = old;

    await autoBackup();
    expect(FileSystemLegacy.writeAsStringAsync).toHaveBeenCalledTimes(1);
  });

  test('skips when there are no customers (nothing to back up)', async () => {
    mockCustomers.current = [];
    await autoBackup();
    expect(FileSystemLegacy.writeAsStringAsync).not.toHaveBeenCalled();
  });
});
