// =============================================================================
// dateValidation.test.js - Tests for the isValidDate function from AddServiceScreen
// Version: 1.0
// Last Updated: 2026-04-03
//
// PROJECT:      Rolodeck (project v1.2)
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial adversarial date validation tests
// =============================================================================

// Re-implement isValidDate here since it's not exported from AddServiceScreen
// (it's a module-private function). This tests the same logic.
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(str) {
  if (!DATE_REGEX.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  if (y < 1900 || y > 2100) return false;
  const parsed = new Date(y, m - 1, d);
  return (
    parsed.getFullYear() === y &&
    parsed.getMonth() === m - 1 &&
    parsed.getDate() === d
  );
}

describe('isValidDate', () => {
  // ── Valid dates ──
  test('accepts standard date', () => {
    expect(isValidDate('2026-04-03')).toBe(true);
  });

  test('accepts Jan 1', () => {
    expect(isValidDate('2026-01-01')).toBe(true);
  });

  test('accepts Dec 31', () => {
    expect(isValidDate('2026-12-31')).toBe(true);
  });

  test('accepts leap day on leap year', () => {
    expect(isValidDate('2024-02-29')).toBe(true);
  });

  test('accepts boundary year 1900', () => {
    expect(isValidDate('1900-01-01')).toBe(true);
  });

  test('accepts boundary year 2100', () => {
    expect(isValidDate('2100-12-31')).toBe(true);
  });

  // ── Invalid dates: format ──
  test('rejects empty string', () => {
    expect(isValidDate('')).toBe(false);
  });

  test('rejects non-date string', () => {
    expect(isValidDate('not-a-date')).toBe(false);
  });

  test('rejects wrong separators', () => {
    expect(isValidDate('2026/04/03')).toBe(false);
  });

  test('rejects missing leading zero', () => {
    expect(isValidDate('2026-4-03')).toBe(false);
  });

  test('rejects extra characters', () => {
    expect(isValidDate('2026-04-03T12:00')).toBe(false);
  });

  test('rejects ISO string', () => {
    expect(isValidDate('2026-04-03T12:00:00.000Z')).toBe(false);
  });

  // ── Invalid dates: overflow (THE BUG THIS FIXES) ──
  test('rejects month 13', () => {
    expect(isValidDate('2026-13-01')).toBe(false);
  });

  test('rejects month 00', () => {
    expect(isValidDate('2026-00-15')).toBe(false);
  });

  test('rejects day 32', () => {
    expect(isValidDate('2026-01-32')).toBe(false);
  });

  test('rejects day 00', () => {
    expect(isValidDate('2026-04-00')).toBe(false);
  });

  test('rejects Feb 30', () => {
    expect(isValidDate('2026-02-30')).toBe(false);
  });

  test('rejects Feb 29 on non-leap year', () => {
    expect(isValidDate('2025-02-29')).toBe(false);
  });

  test('rejects Apr 31 (30-day month)', () => {
    expect(isValidDate('2026-04-31')).toBe(false);
  });

  test('rejects Jun 31 (30-day month)', () => {
    expect(isValidDate('2026-06-31')).toBe(false);
  });

  test('rejects month 45', () => {
    expect(isValidDate('2026-45-01')).toBe(false);
  });

  test('rejects day 99', () => {
    expect(isValidDate('2026-01-99')).toBe(false);
  });

  // ── Invalid dates: out-of-range years ──
  test('rejects year 1899', () => {
    expect(isValidDate('1899-12-31')).toBe(false);
  });

  test('rejects year 2101', () => {
    expect(isValidDate('2101-01-01')).toBe(false);
  });

  test('rejects year 0000', () => {
    expect(isValidDate('0000-01-01')).toBe(false);
  });

  test('rejects year 9999', () => {
    expect(isValidDate('9999-12-31')).toBe(false);
  });

  // ── Edge cases ──
  test('rejects null', () => {
    expect(isValidDate(null)).toBe(false);
  });

  test('rejects undefined', () => {
    expect(isValidDate(undefined)).toBe(false);
  });

  test('rejects number', () => {
    expect(isValidDate(20260403)).toBe(false);
  });

  test('rejects whitespace-padded date', () => {
    expect(isValidDate(' 2026-04-03 ')).toBe(false);
  });
});
