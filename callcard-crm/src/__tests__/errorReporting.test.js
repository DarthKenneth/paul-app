// =============================================================================
// errorReporting.test.js - Unit tests for errorReporting helpers
// Version: 1.0.1
// Last Updated: 2026-04-28
//
// PROJECT:      Rolodeck (project v1.5)
//
// CHANGE LOG:
// v1.0    2026-04-28  Claude  Initial — covers friendlyMessage pattern matching
//                              and reportError robustness (Sentry init can fail)
// v1.0.1  2026-04-28  Claude  Restructure mocks to satisfy jest.mock hoisting
//                              (factory must self-contain its jest.fn())
// =============================================================================

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
}));

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
}));

const Sentry = require('@sentry/react-native');
const { Alert } = require('react-native');
const { reportError, friendlyMessage, reportAndShow } = require('../utils/errorReporting');

beforeEach(() => {
  Sentry.captureException.mockReset();
  Alert.alert.mockReset();
});

describe('friendlyMessage', () => {
  test('returns fallback for unknown errors — never raw err.message', () => {
    const err = new Error('Cannot read property UTF8 of undefined');
    expect(friendlyMessage(err, 'fallback copy')).toBe('fallback copy');
  });

  test('returns fallback for null / undefined / non-Error inputs', () => {
    expect(friendlyMessage(null, 'fallback')).toBe('fallback');
    expect(friendlyMessage(undefined, 'fallback')).toBe('fallback');
    expect(friendlyMessage('string error', 'fallback')).toBe('fallback');
    expect(friendlyMessage({}, 'fallback')).toBe('fallback');
  });

  test('detects network failures', () => {
    expect(friendlyMessage(new Error('Network request failed'), 'x')).toMatch(/internet/i);
    expect(friendlyMessage(new Error('NetworkError when attempting to fetch'), 'x')).toMatch(/internet/i);
  });

  test('detects timeouts', () => {
    expect(friendlyMessage(new Error('The operation timed out'), 'x')).toMatch(/took too long/i);
    expect(friendlyMessage(new Error('Aborted'), 'x')).toMatch(/took too long/i);
  });

  test('detects permission denials', () => {
    expect(friendlyMessage(new Error('Permission denied'), 'x')).toMatch(/permission/i);
  });

  test('detects auth / token failures', () => {
    expect(friendlyMessage(new Error('401 Unauthorized'), 'x')).toMatch(/session has expired/i);
    expect(friendlyMessage(new Error('invalid_token'), 'x')).toMatch(/session has expired/i);
  });

  test('detects file / storage problems', () => {
    expect(friendlyMessage(new Error('No such file or directory'), 'x')).toMatch(/file could not be read/i);
    expect(friendlyMessage(new Error('ENOSPC: no space left'), 'x')).toMatch(/storage space/i);
  });
});

describe('reportError', () => {
  test('forwards to Sentry with feature/action tags', () => {
    const err = new Error('boom');
    reportError(err, { feature: 'backup', action: 'export', customerId: 'abc' });

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(err, expect.objectContaining({
      tags: { feature: 'backup', action: 'export' },
      extra: { customerId: 'abc' },
    }));
  });

  test('handles missing context gracefully', () => {
    const err = new Error('boom');
    expect(() => reportError(err)).not.toThrow();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  test('never re-throws if Sentry capture itself throws', () => {
    Sentry.captureException.mockImplementationOnce(() => { throw new Error('sentry init failed'); });
    expect(() => reportError(new Error('boom'), { feature: 'x' })).not.toThrow();
  });

  test('handles non-Error inputs (string, null, object)', () => {
    expect(() => reportError('string error', { feature: 'x' })).not.toThrow();
    expect(() => reportError(null, { feature: 'x' })).not.toThrow();
    expect(() => reportError({ random: 'object' }, { feature: 'x' })).not.toThrow();
  });
});

describe('reportAndShow', () => {
  test('captures to Sentry and shows curated alert', () => {
    const err = new Error('Network request failed');
    reportAndShow(err, {
      title:    'Backup Failed',
      fallback: 'fallback copy',
      feature:  'backup',
      action:   'export',
    });

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledWith('Backup Failed', expect.stringMatching(/internet/i));
  });

  test('uses fallback copy when no pattern matches', () => {
    const err = new Error('something obscure happened');
    reportAndShow(err, {
      title:    'X Failed',
      fallback: 'X did not work, please retry.',
      feature:  'x',
      action:   'y',
    });

    expect(Alert.alert).toHaveBeenCalledWith('X Failed', 'X did not work, please retry.');
  });

  test('never crashes the caller', () => {
    Sentry.captureException.mockImplementationOnce(() => { throw new Error('sentry broken'); });
    expect(() => reportAndShow(new Error('boom'), {
      title: 't', fallback: 'f', feature: 'x', action: 'y',
    })).not.toThrow();
    // Alert should still fire even if Sentry threw
    expect(Alert.alert).toHaveBeenCalled();
  });
});
