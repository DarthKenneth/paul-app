// =============================================================================
// stress.test.js - Adversarial edge-case suite for the error/backup surface
// Version: 1.0
// Last Updated: 2026-04-28
//
// PROJECT:      Rolodeck (project v1.5)
//
// PURPOSE:
//   Stress-tests deliberately biased toward conditions the original code did
//   NOT handle: empty/malformed input, oversized files, concurrent calls,
//   clock skew, picker shape variance, version skew, and Sentry/Alert blowup.
//
//   Each test is named after the failure mode it asserts is now safe.
//
// CHANGE LOG:
// v1.0  2026-04-28  Claude  Initial — 16 adversarial scenarios
// =============================================================================

// ── In-memory filesystem mock (with size + getInfoAsync support) ─────────────

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
  getInfoAsync: jest.fn(async (uri) => {
    if (uri in mockFsStore) {
      const content = mockFsStore[uri];
      return { exists: true, size: typeof content === 'string' ? content.length : 0 };
    }
    return { exists: false };
  }),
  makeDirectoryAsync: jest.fn(async () => {}),
  copyAsync:          jest.fn(async ({ to }) => { mockFsStore[to] = '<binary>'; }),
  deleteAsync:        jest.fn(async (uri) => { delete mockFsStore[uri]; }),
}));

// ── Sharing mock (toggleable) ────────────────────────────────────────────────

const sharingAvailable = { current: true };
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => sharingAvailable.current),
  shareAsync:       jest.fn(async () => undefined),
}));

// ── DocumentPicker mock (variable result shapes) ─────────────────────────────

const mockPickerResult = { current: null };
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => mockPickerResult.current),
}));

// ── AsyncStorage mock (failure-toggleable) ───────────────────────────────────

const mockAsync = {};
const asyncStorageBroken = { current: false };
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k) => {
    if (asyncStorageBroken.current) throw new Error('AsyncStorage corrupt');
    return k in mockAsync ? mockAsync[k] : null;
  }),
  setItem: jest.fn(async (k, v) => { mockAsync[k] = v; }),
  removeItem: jest.fn(async (k) => { delete mockAsync[k]; }),
}));

// ── react-native + Sentry ────────────────────────────────────────────────────

const mockAlertImpl = { current: jest.fn() };
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Alert:    { alert: (...args) => mockAlertImpl.current(...args) },
}));

jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));

// ── Storage layer + appVersion ───────────────────────────────────────────────

const mockCustomers = { current: [] };
jest.mock('../data/storage', () => ({
  CURRENT_SCHEMA_VERSION: 3,
  getAllCustomers:  jest.fn(async () => mockCustomers.current),
  restoreCustomers: jest.fn(async (list) => { mockCustomers.current = list; }),
  getLastLocalMutation: jest.fn(async () => null),
}));

jest.mock('../appVersion', () => ({ APP_VERSION: '1.5.2' }));

// ── SUT imports ──────────────────────────────────────────────────────────────

const FileSystem      = require('expo-file-system/legacy');
const Sharing         = require('expo-sharing');
const Sentry          = require('@sentry/react-native');
const { exportBackup, importBackup, autoBackup, getLastBackupDate } =
  require('../utils/backup');
const { savePhotoLocally } = require('../utils/photoUtils');
const { reportError, reportAndShow, friendlyMessage } =
  require('../utils/errorReporting');

beforeEach(() => {
  for (const k of Object.keys(mockFsStore)) delete mockFsStore[k];
  for (const k of Object.keys(mockAsync))  delete mockAsync[k];
  mockCustomers.current     = [];
  mockPickerResult.current  = null;
  sharingAvailable.current  = true;
  asyncStorageBroken.current = false;
  mockAlertImpl.current = jest.fn();
  Sentry.captureException.mockReset();
  FileSystem.writeAsStringAsync.mockClear();
  FileSystem.copyAsync.mockClear();
  Sharing.isAvailableAsync.mockClear();
  Sharing.shareAsync.mockClear();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('STRESS 1: empty / null photo URI', () => {
  test('savePhotoLocally("") throws cleanly instead of producing garbage', async () => {
    await expect(savePhotoLocally('')).rejects.toThrow(/empty or invalid/i);
  });

  test('savePhotoLocally(null) throws cleanly', async () => {
    await expect(savePhotoLocally(null)).rejects.toThrow(/empty or invalid/i);
  });

  test('savePhotoLocally(undefined) throws cleanly', async () => {
    await expect(savePhotoLocally(undefined)).rejects.toThrow(/empty or invalid/i);
  });
});

describe('STRESS 2: photo URI with "." in a parent directory', () => {
  test('extension extraction does not produce a "/" — dest stays under PHOTO_DIR', async () => {
    const dest = await savePhotoLocally('/Users/some.user/photo');
    // No extension on the basename → fallback "jpg"
    expect(dest).toMatch(/^file:\/\/\/docs\/service-photos\/[^/]+\.jpg$/);
  });

  test('basename extension wins over parent directory dot', async () => {
    const dest = await savePhotoLocally('/Users/some.user/photo.png');
    expect(dest).toMatch(/^file:\/\/\/docs\/service-photos\/[^/]+\.png$/);
  });

  test('weird extension chars fall back to jpg', async () => {
    const dest = await savePhotoLocally('/Users/x/photo.@#$');
    expect(dest).toMatch(/^file:\/\/\/docs\/service-photos\/[^/]+\.jpg$/);
  });
});

describe('STRESS 3: concurrent photo saves', () => {
  test('5 parallel savePhotoLocally calls all succeed', async () => {
    const results = await Promise.all([
      savePhotoLocally('file:///tmp/a.jpg'),
      savePhotoLocally('file:///tmp/b.jpg'),
      savePhotoLocally('file:///tmp/c.jpg'),
      savePhotoLocally('file:///tmp/d.jpg'),
      savePhotoLocally('file:///tmp/e.jpg'),
    ]);
    expect(results).toHaveLength(5);
    results.forEach((d) => expect(d).toMatch(/^file:\/\/\/docs\/service-photos\//));
    // makeDirectoryAsync is allowed to be called concurrently but should not
    // crash the parallel saves.
    expect(FileSystem.copyAsync).toHaveBeenCalledTimes(5);
  });
});

describe('STRESS 4: oversized backup file', () => {
  test('importBackup rejects a > 50 MB file before parsing', async () => {
    // Mock getInfoAsync to claim the file is huge
    FileSystem.getInfoAsync.mockResolvedValueOnce({ exists: true, size: 60 * 1024 * 1024 });
    mockFsStore['file:///docs/huge.json'] = 'irrelevant';
    mockPickerResult.current = {
      canceled: false,
      assets: [{ uri: 'file:///docs/huge.json' }],
    };
    await expect(importBackup()).rejects.toThrow(/too large/i);
  });

  test('importBackup also catches oversized files via length fallback', async () => {
    // Stub getInfoAsync to return no size info; size guard kicks in on raw.length
    FileSystem.getInfoAsync.mockResolvedValueOnce({ exists: true });
    const huge = 'x'.repeat(51 * 1024 * 1024);
    mockFsStore['file:///docs/huge2.json'] = huge;
    mockPickerResult.current = {
      canceled: false,
      assets: [{ uri: 'file:///docs/huge2.json' }],
    };
    await expect(importBackup()).rejects.toThrow(/too large/i);
  });
});

describe('STRESS 5: future backup version (version skew)', () => {
  test('importBackup refuses backupVersion > current', async () => {
    mockFsStore['file:///docs/future.json'] = JSON.stringify({
      backupVersion: '99',
      customers: [{ id: 'c1', firstName: 'A' }],
    });
    mockPickerResult.current = {
      canceled: false,
      assets: [{ uri: 'file:///docs/future.json' }],
    };
    await expect(importBackup()).rejects.toThrow(/newer version/i);
  });

  test('importBackup accepts a v1 file (current version)', async () => {
    mockFsStore['file:///docs/v1.json'] = JSON.stringify({
      backupVersion: '1',
      customers: [{ id: 'c1', firstName: 'A' }],
    });
    mockPickerResult.current = {
      canceled: false,
      assets: [{ uri: 'file:///docs/v1.json' }],
    };
    const result = await importBackup();
    expect(result.customerCount).toBe(1);
  });

  test('importBackup tolerates a missing backupVersion (legacy file)', async () => {
    mockFsStore['file:///docs/legacy.json'] = JSON.stringify({
      customers: [{ id: 'c1', firstName: 'A' }],
    });
    mockPickerResult.current = {
      canceled: false,
      assets: [{ uri: 'file:///docs/legacy.json' }],
    };
    const result = await importBackup();
    expect(result.customerCount).toBe(1);
  });
});

describe('STRESS 6: picker shape variance', () => {
  test('canceled:false but assets undefined → curated error, not "Cannot read property uri of undefined"', async () => {
    mockPickerResult.current = { canceled: false, assets: undefined };
    await expect(importBackup()).rejects.toThrow(/could not read the selected file/i);
  });

  test('canceled:false but assets:[] → curated error', async () => {
    mockPickerResult.current = { canceled: false, assets: [] };
    await expect(importBackup()).rejects.toThrow(/could not read the selected file/i);
  });

  test('canceled:false but asset has no uri → curated error', async () => {
    mockPickerResult.current = { canceled: false, assets: [{ name: 'foo.json' }] };
    await expect(importBackup()).rejects.toThrow(/could not read the selected file/i);
  });
});

describe('STRESS 7: sharing unavailable on export', () => {
  test('does NOT leave a stranded backup file in documentDirectory', async () => {
    sharingAvailable.current = false;
    mockCustomers.current    = [{ id: 'c1', firstName: 'A' }];

    await expect(exportBackup()).rejects.toThrow(/sharing is not available/i);

    // No file should have been written
    expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
    expect(Object.keys(mockFsStore).filter((k) => k.includes('callcard-backup'))).toHaveLength(0);
  });
});

describe('STRESS 8: clock skew in autoBackup', () => {
  test('a "future" timestamp does NOT suppress backup forever', async () => {
    mockCustomers.current = [{ id: 'c1', firstName: 'A' }];
    // Pretend the last backup happened 1 hour from now
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mockAsync['@callcard_last_auto_backup'] = future;

    await autoBackup();
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);
  });

  test('a corrupt timestamp string does NOT block the backup', async () => {
    mockCustomers.current = [{ id: 'c1', firstName: 'A' }];
    mockAsync['@callcard_last_auto_backup'] = 'totally not a date';

    await autoBackup();
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);
  });
});

describe('STRESS 9: getLastBackupDate with corrupt input', () => {
  test('returns null instead of Invalid Date', async () => {
    mockAsync['@callcard_last_backup'] = 'garbage';
    const d = await getLastBackupDate();
    expect(d).toBeNull();
  });

  test('returns null on empty string', async () => {
    mockAsync['@callcard_last_backup'] = '';
    const d = await getLastBackupDate();
    expect(d).toBeNull();
  });

  test('returns a valid Date for a valid ISO string', async () => {
    mockAsync['@callcard_last_backup'] = '2026-04-28T12:00:00.000Z';
    const d = await getLastBackupDate();
    expect(d).toBeInstanceOf(Date);
    expect(Number.isFinite(d.getTime())).toBe(true);
  });
});

describe('STRESS 10: reportError extra-field nesting', () => {
  test('explicit extra: {} field is FLATTENED, not nested as extra.extra', () => {
    reportError(new Error('boom'), {
      feature: 'x',
      action:  'y',
      extra:   { customerId: 'abc' },
    });

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const callArgs = Sentry.captureException.mock.calls[0][1];
    expect(callArgs.extra).toEqual({ customerId: 'abc' });
    expect(callArgs.extra.extra).toBeUndefined();
  });

  test('flat extras still work', () => {
    reportError(new Error('boom'), {
      feature: 'x',
      action:  'y',
      customerId: 'abc',
    });

    const callArgs = Sentry.captureException.mock.calls[0][1];
    expect(callArgs.extra).toEqual({ customerId: 'abc' });
  });

  test('mixed: explicit and flat both end up flat, explicit wins on conflict', () => {
    reportError(new Error('boom'), {
      feature: 'x',
      action:  'y',
      flat:    'flat-value',
      extra:   { explicit: 'explicit-value', flat: 'override' },
    });

    const callArgs = Sentry.captureException.mock.calls[0][1];
    expect(callArgs.extra).toEqual({
      flat:     'override',         // explicit wins
      explicit: 'explicit-value',
    });
  });
});

describe('STRESS 11: reportError with null / non-object context', () => {
  test('explicit null context does not crash', () => {
    expect(() => reportError(new Error('boom'), null)).not.toThrow();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  test('non-object context (string) does not crash', () => {
    expect(() => reportError(new Error('boom'), 'context')).not.toThrow();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});

describe('STRESS 12: reportError with non-Error inputs', () => {
  test('coerces a string to an Error so Sentry stack tags stay useful', () => {
    reportError('something went wrong', { feature: 'x' });
    const captured = Sentry.captureException.mock.calls[0][0];
    expect(captured).toBeInstanceOf(Error);
    expect(captured.message).toBe('something went wrong');
  });

  test('coerces a plain object to an Error', () => {
    reportError({ random: 'thing' }, { feature: 'x' });
    const captured = Sentry.captureException.mock.calls[0][0];
    expect(captured).toBeInstanceOf(Error);
  });
});

describe('STRESS 13: reportAndShow when Alert.alert itself throws', () => {
  test('does NOT propagate to the caller', () => {
    mockAlertImpl.current = jest.fn(() => { throw new Error('Alert subsystem broken'); });
    expect(() => reportAndShow(new Error('boom'), {
      title: 't', fallback: 'f', feature: 'x', action: 'y',
    })).not.toThrow();
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});

describe('STRESS 14: autoBackup with broken AsyncStorage read', () => {
  test('proceeds to write the backup even when AsyncStorage.getItem throws', async () => {
    asyncStorageBroken.current = true;
    mockCustomers.current      = [{ id: 'c1', firstName: 'A' }];

    await autoBackup();
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalled();
  });
});

describe('STRESS 15: friendlyMessage 401 boundary regression', () => {
  test('numeric values containing "401" do NOT trigger session-expired copy', () => {
    const err = new Error('User 4012345 not found');
    expect(friendlyMessage(err, 'fallback')).toBe('fallback');
  });

  test('a real "401 Unauthorized" still triggers session-expired copy', () => {
    const err = new Error('Got 401 from server');
    expect(friendlyMessage(err, 'fallback')).toMatch(/session has expired/i);
  });

  test('"401" at the start of the string still matches', () => {
    const err = new Error('401 from server');
    expect(friendlyMessage(err, 'fallback')).toMatch(/session has expired/i);
  });

  test('"401" at the end of the string still matches', () => {
    const err = new Error('Got 401');
    expect(friendlyMessage(err, 'fallback')).toMatch(/session has expired/i);
  });
});

describe('STRESS 16: backup roundtrip after hardening still works', () => {
  test('export → import preserves all customers (regression check)', async () => {
    mockCustomers.current = [
      { id: 'c1', firstName: 'A', emoji: 'café ☕' },         // unicode
      { id: 'c2', firstName: 'B', notes: 'line1\nline2' },   // newlines
      { id: 'c3', firstName: 'C', tags: ['x', 'y'] },        // arrays
    ];

    await exportBackup();

    const writtenUri = Sharing.shareAsync.mock.calls[0][0];
    expect(writtenUri).toMatch(/callcard-backup-\d{4}-\d{2}-\d{2}\.json$/);

    mockCustomers.current   = [];
    mockPickerResult.current = {
      canceled: false,
      assets: [{ uri: writtenUri }],
    };

    const result = await importBackup();
    expect(result.customerCount).toBe(3);
    expect(mockCustomers.current.find((c) => c.id === 'c1').emoji).toBe('café ☕');
    expect(mockCustomers.current.find((c) => c.id === 'c2').notes).toBe('line1\nline2');
    expect(mockCustomers.current.find((c) => c.id === 'c3').tags).toEqual(['x', 'y']);
  });
});
