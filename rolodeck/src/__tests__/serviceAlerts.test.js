// =============================================================================
// serviceAlerts.test.js - Adversarial stress tests for serviceAlerts.js
// Version: 1.0
// Last Updated: 2026-04-03
//
// PROJECT:      Rolodeck (project v0.14.1)
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial adversarial test suite
// =============================================================================

import {
  getLastServiceDate,
  daysSinceLastService,
  daysUntilDue,
  isOverdue,
  isDueWithin,
  filterByDueStatus,
  getAlertBadgeCount,
  getServiceStatus,
  sortByUrgency,
  groupCustomersByDueWindow,
} from '../utils/serviceAlerts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCustomer(overrides = {}) {
  return {
    id: 'test-1',
    name: 'Test Customer',
    email: '',
    phone: '',
    address: '',
    zipCode: '',
    serviceLog: [],
    ...overrides,
  };
}

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

function makeServiceLog(dates) {
  return dates.map((d, i) => ({
    id: `entry-${i}`,
    date: typeof d === 'number' ? daysAgo(d) : d,
    type: 'service',
    notes: '',
  }));
}

// ── getLastServiceDate ───────────────────────────────────────────────────────

describe('getLastServiceDate', () => {
  test('returns null for empty serviceLog', () => {
    expect(getLastServiceDate(makeCustomer())).toBeNull();
  });

  test('returns null for undefined serviceLog', () => {
    expect(getLastServiceDate(makeCustomer({ serviceLog: undefined }))).toBeNull();
  });

  test('returns null for null serviceLog', () => {
    expect(getLastServiceDate(makeCustomer({ serviceLog: null }))).toBeNull();
  });

  test('returns the most recent date from multiple entries', () => {
    const c = makeCustomer({
      serviceLog: makeServiceLog([100, 50, 200]),
    });
    const last = getLastServiceDate(c);
    // 50 days ago is the most recent
    const expected = new Date(daysAgo(50));
    expect(Math.abs(last.getTime() - expected.getTime())).toBeLessThan(1000);
  });

  test('handles single entry', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([0]) });
    const last = getLastServiceDate(c);
    expect(last).toBeInstanceOf(Date);
    expect(isNaN(last.getTime())).toBe(false);
  });

  test('does not crash on entries with invalid date strings', () => {
    const c = makeCustomer({
      serviceLog: [
        { id: '1', date: 'not-a-date', type: 'service', notes: '' },
        { id: '2', date: daysAgo(10), type: 'service', notes: '' },
      ],
    });
    // getLastServiceDate uses reduce and NaN dates can pollute the result;
    // the key assertion is that it doesn't throw
    expect(() => getLastServiceDate(c)).not.toThrow();
    const last = getLastServiceDate(c);
    expect(last).toBeInstanceOf(Date);
  });

  test('handles entries with far-future dates', () => {
    const c = makeCustomer({
      serviceLog: [
        { id: '1', date: '3000-01-01T00:00:00.000Z', type: 'service', notes: '' },
        { id: '2', date: daysAgo(10), type: 'service', notes: '' },
      ],
    });
    const last = getLastServiceDate(c);
    expect(last.getUTCFullYear()).toBe(3000);
  });

  test('handles entries with epoch date', () => {
    const c = makeCustomer({
      serviceLog: [
        { id: '1', date: '1970-01-01T00:00:00.000Z', type: 'service', notes: '' },
      ],
    });
    const last = getLastServiceDate(c);
    expect(last.getUTCFullYear()).toBe(1970);
  });
});

// ── daysSinceLastService ─────────────────────────────────────────────────────

describe('daysSinceLastService', () => {
  test('returns Infinity for no service log', () => {
    expect(daysSinceLastService(makeCustomer())).toBe(Infinity);
  });

  test('returns Infinity for empty service log', () => {
    expect(daysSinceLastService(makeCustomer({ serviceLog: [] }))).toBe(Infinity);
  });

  test('returns 0 for service done today', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([0]) });
    expect(daysSinceLastService(c)).toBe(0);
  });

  test('returns correct days for recent service', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([30]) });
    expect(daysSinceLastService(c)).toBe(30);
  });

  test('returns large number for very old service', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([3650]) }); // 10 years
    expect(daysSinceLastService(c)).toBe(3650);
  });

  test('returns Infinity for undefined serviceLog', () => {
    expect(daysSinceLastService({ serviceLog: undefined })).toBe(Infinity);
  });
});

// ── daysUntilDue ─────────────────────────────────────────────────────────────

describe('daysUntilDue', () => {
  test('returns -Infinity for never-serviced customer', () => {
    expect(daysUntilDue(makeCustomer())).toBe(-Infinity);
  });

  test('returns 365 for customer just serviced today', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([0]) });
    expect(daysUntilDue(c)).toBe(365);
  });

  test('returns 0 for customer serviced exactly 365 days ago', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([365]) });
    expect(daysUntilDue(c)).toBe(0);
  });

  test('returns negative for overdue customer', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([400]) });
    expect(daysUntilDue(c)).toBe(-35);
  });

  test('returns positive for customer not yet due', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([100]) });
    expect(daysUntilDue(c)).toBe(265);
  });
});

// ── isOverdue ────────────────────────────────────────────────────────────────

describe('isOverdue', () => {
  test('returns true for never-serviced customer', () => {
    expect(isOverdue(makeCustomer())).toBe(true);
  });

  test('returns true for customer serviced 366 days ago', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([366]) });
    expect(isOverdue(c)).toBe(true);
  });

  test('returns false for customer serviced 365 days ago (exactly on boundary)', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([365]) });
    expect(isOverdue(c)).toBe(false);
  });

  test('returns false for customer serviced today', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([0]) });
    expect(isOverdue(c)).toBe(false);
  });

  test('returns false for customer serviced 364 days ago', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([364]) });
    expect(isOverdue(c)).toBe(false);
  });

  test('returns true for undefined serviceLog', () => {
    expect(isOverdue({ serviceLog: undefined })).toBe(true);
  });

  test('returns true for null serviceLog', () => {
    expect(isOverdue({ serviceLog: null })).toBe(true);
  });
});

// ── isDueWithin ──────────────────────────────────────────────────────────────

describe('isDueWithin', () => {
  test('returns false for never-serviced customer', () => {
    expect(isDueWithin(makeCustomer(), 30)).toBe(false);
  });

  test('returns false for overdue customer', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([400]) });
    expect(isDueWithin(c, 30)).toBe(false);
  });

  test('returns true for customer due in exactly 30 days', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([335]) }); // 365-335=30
    expect(isDueWithin(c, 30)).toBe(true);
  });

  test('returns true for customer due today (boundary)', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([365]) }); // 365-365=0
    expect(isDueWithin(c, 30)).toBe(true);
  });

  test('returns false for customer due in 31 days with 30-day window', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([334]) }); // 365-334=31
    expect(isDueWithin(c, 30)).toBe(false);
  });

  test('returns false for customer with 200+ days remaining', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([100]) });
    expect(isDueWithin(c, 90)).toBe(false);
  });

  test('handles window of 0', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([365]) });
    expect(isDueWithin(c, 0)).toBe(true);
  });
});

// ── filterByDueStatus ────────────────────────────────────────────────────────

describe('filterByDueStatus', () => {
  const customers = [
    makeCustomer({ id: 'overdue', serviceLog: makeServiceLog([400]) }),
    makeCustomer({ id: 'due-soon', serviceLog: makeServiceLog([350]) }), // 15 days left
    makeCustomer({ id: 'due-mid', serviceLog: makeServiceLog([320]) }),  // 45 days left
    makeCustomer({ id: 'ok', serviceLog: makeServiceLog([100]) }),       // 265 days left
    makeCustomer({ id: 'never', serviceLog: [] }),
  ];

  test('returns all customers with "all" filter', () => {
    expect(filterByDueStatus(customers, 'all')).toHaveLength(5);
  });

  test('returns overdue + never-serviced with "overdue" filter', () => {
    const result = filterByDueStatus(customers, 'overdue');
    expect(result.map((c) => c.id).sort()).toEqual(['never', 'overdue']);
  });

  test('returns overdue + 30-day window with 30 filter', () => {
    const result = filterByDueStatus(customers, 30);
    const ids = result.map((c) => c.id).sort();
    expect(ids).toContain('overdue');
    expect(ids).toContain('due-soon');
    expect(ids).toContain('never');
  });

  test('handles empty array', () => {
    expect(filterByDueStatus([], 'all')).toEqual([]);
    expect(filterByDueStatus([], 'overdue')).toEqual([]);
    expect(filterByDueStatus([], 30)).toEqual([]);
  });
});

// ── getAlertBadgeCount ───────────────────────────────────────────────────────

describe('getAlertBadgeCount', () => {
  test('returns 0 for empty array', () => {
    expect(getAlertBadgeCount([])).toBe(0);
  });

  test('counts overdue only (not upcoming)', () => {
    const customers = [
      makeCustomer({ serviceLog: makeServiceLog([400]) }),  // overdue
      makeCustomer({ serviceLog: makeServiceLog([350]) }),  // due in 15 days (not counted)
      makeCustomer({ serviceLog: makeServiceLog([100]) }),  // ok (not counted)
      makeCustomer({ serviceLog: [] }),                      // never serviced (overdue)
    ];
    expect(getAlertBadgeCount(customers)).toBe(2);
  });

  test('returns 0 when all customers are healthy', () => {
    const customers = [
      makeCustomer({ serviceLog: makeServiceLog([0]) }),
      makeCustomer({ serviceLog: makeServiceLog([100]) }),
    ];
    expect(getAlertBadgeCount(customers)).toBe(0);
  });
});

// ── getServiceStatus ─────────────────────────────────────────────────────────

describe('getServiceStatus', () => {
  test('returns "No service on record" for never-serviced', () => {
    const s = getServiceStatus(makeCustomer());
    expect(s.label).toBe('No service on record');
    expect(s.level).toBe('overdue');
  });

  test('returns overdue label for overdue customer', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([400]) });
    const s = getServiceStatus(c);
    expect(s.label).toContain('Overdue');
    expect(s.level).toBe('overdue');
  });

  test('returns "Due today" for exactly 365 days', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([365]) });
    const s = getServiceStatus(c);
    expect(s.label).toBe('Due today');
    expect(s.level).toBe('overdue');
  });

  test('returns warning level for 1-30 day window', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([350]) });
    const s = getServiceStatus(c);
    expect(s.level).toBe('warning');
    expect(s.label).toMatch(/Due in \d+ days?/);
  });

  test('returns "Due in 1 day" (singular) for exactly 1 day remaining', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([364]) });
    const s = getServiceStatus(c);
    expect(s.label).toBe('Due in 1 day');
  });

  test('returns upcoming level for 31-90 day window', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([300]) });
    const s = getServiceStatus(c);
    expect(s.level).toBe('upcoming');
  });

  test('returns ok level for 91+ days', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([100]) });
    const s = getServiceStatus(c);
    expect(s.level).toBe('ok');
    expect(s.label).toMatch(/Next service in \d+ days/);
  });

  test('handles undefined serviceLog gracefully', () => {
    const s = getServiceStatus({ serviceLog: undefined });
    expect(s.label).toBe('No service on record');
    expect(s.level).toBe('overdue');
  });
});

// ── sortByUrgency ────────────────────────────────────────────────────────────

describe('sortByUrgency', () => {
  test('sorts most overdue first', () => {
    const customers = [
      makeCustomer({ id: 'ok', serviceLog: makeServiceLog([10]) }),
      makeCustomer({ id: 'overdue', serviceLog: makeServiceLog([500]) }),
      makeCustomer({ id: 'never', serviceLog: [] }),
    ];
    const sorted = sortByUrgency(customers);
    expect(sorted[0].id).toBe('never');
    expect(sorted[1].id).toBe('overdue');
    expect(sorted[2].id).toBe('ok');
  });

  test('does not mutate original array', () => {
    const customers = [
      makeCustomer({ id: 'a', serviceLog: makeServiceLog([10]) }),
      makeCustomer({ id: 'b', serviceLog: makeServiceLog([500]) }),
    ];
    const original = [...customers];
    sortByUrgency(customers);
    expect(customers[0].id).toBe(original[0].id);
  });

  test('handles empty array', () => {
    expect(sortByUrgency([])).toEqual([]);
  });

  test('handles single element', () => {
    const customers = [makeCustomer({ id: 'solo' })];
    expect(sortByUrgency(customers)).toHaveLength(1);
  });

  test('handles all customers with same urgency', () => {
    const customers = [
      makeCustomer({ id: 'a', serviceLog: makeServiceLog([100]) }),
      makeCustomer({ id: 'b', serviceLog: makeServiceLog([100]) }),
      makeCustomer({ id: 'c', serviceLog: makeServiceLog([100]) }),
    ];
    const sorted = sortByUrgency(customers);
    expect(sorted).toHaveLength(3);
  });
});

// ── groupCustomersByDueWindow ────────────────────────────────────────────────

describe('groupCustomersByDueWindow', () => {
  test('returns empty array for no customers', () => {
    expect(groupCustomersByDueWindow([])).toEqual([]);
  });

  test('places overdue customer in overdue section', () => {
    const customers = [makeCustomer({ serviceLog: makeServiceLog([400]) })];
    const sections = groupCustomersByDueWindow(customers);
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe('overdue');
  });

  test('places never-serviced customer in overdue section', () => {
    const customers = [makeCustomer()];
    const sections = groupCustomersByDueWindow(customers);
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe('overdue');
  });

  test('places 30-day-window customer correctly', () => {
    const customers = [makeCustomer({ serviceLog: makeServiceLog([350]) })]; // 15 days left
    const sections = groupCustomersByDueWindow(customers);
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe('next30');
  });

  test('places 31-60 day customer correctly', () => {
    const customers = [makeCustomer({ serviceLog: makeServiceLog([320]) })]; // 45 days left
    const sections = groupCustomersByDueWindow(customers);
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe('next60');
  });

  test('places 61-90 day customer correctly', () => {
    const customers = [makeCustomer({ serviceLog: makeServiceLog([290]) })]; // 75 days left
    const sections = groupCustomersByDueWindow(customers);
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe('next90');
  });

  test('places 91+ day customer in later section', () => {
    const customers = [makeCustomer({ serviceLog: makeServiceLog([100]) })]; // 265 days left
    const sections = groupCustomersByDueWindow(customers);
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe('later');
  });

  test('omits empty sections', () => {
    const customers = [
      makeCustomer({ id: 'a', serviceLog: makeServiceLog([400]) }), // overdue
      makeCustomer({ id: 'b', serviceLog: makeServiceLog([100]) }), // later
    ];
    const sections = groupCustomersByDueWindow(customers);
    const keys = sections.map((s) => s.key);
    expect(keys).toEqual(['overdue', 'later']);
  });

  test('sorts within sections by urgency', () => {
    const customers = [
      makeCustomer({ id: 'less-overdue', serviceLog: makeServiceLog([370]) }),
      makeCustomer({ id: 'more-overdue', serviceLog: makeServiceLog([500]) }),
      makeCustomer({ id: 'never', serviceLog: [] }),
    ];
    const sections = groupCustomersByDueWindow(customers);
    expect(sections[0].key).toBe('overdue');
    // Never serviced (-Infinity) should be first, then 500 days, then 370 days
    expect(sections[0].data[0].id).toBe('never');
    expect(sections[0].data[1].id).toBe('more-overdue');
    expect(sections[0].data[2].id).toBe('less-overdue');
  });

  test('handles large number of customers', () => {
    const customers = Array.from({ length: 1000 }, (_, i) =>
      makeCustomer({ id: `c-${i}`, serviceLog: makeServiceLog([i]) }),
    );
    const sections = groupCustomersByDueWindow(customers);
    const totalInSections = sections.reduce((sum, s) => sum + s.data.length, 0);
    expect(totalInSections).toBe(1000);
  });

  test('boundary: customer due in exactly 30 days goes to next30, not next60', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([335]) }); // 365-335=30
    const sections = groupCustomersByDueWindow([c]);
    expect(sections[0].key).toBe('next30');
  });

  test('boundary: customer due in exactly 60 days goes to next60, not next90', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([305]) }); // 365-305=60
    const sections = groupCustomersByDueWindow([c]);
    expect(sections[0].key).toBe('next60');
  });

  test('boundary: customer due in exactly 90 days goes to next90, not later', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([275]) }); // 365-275=90
    const sections = groupCustomersByDueWindow([c]);
    expect(sections[0].key).toBe('next90');
  });

  test('boundary: customer due in exactly 91 days goes to later', () => {
    const c = makeCustomer({ serviceLog: makeServiceLog([274]) }); // 365-274=91
    const sections = groupCustomersByDueWindow([c]);
    expect(sections[0].key).toBe('later');
  });
});

// ── Adversarial edge cases ───────────────────────────────────────────────────

describe('adversarial edge cases', () => {
  test('customer with empty object as serviceLog entry', () => {
    const c = makeCustomer({ serviceLog: [{}] });
    // Should not crash — date will be invalid/NaN
    expect(() => getServiceStatus(c)).not.toThrow();
    expect(() => daysSinceLastService(c)).not.toThrow();
  });

  test('customer with serviceLog entry containing null date', () => {
    const c = makeCustomer({
      serviceLog: [{ id: '1', date: null, type: 'service', notes: '' }],
    });
    expect(() => getServiceStatus(c)).not.toThrow();
  });

  test('customer with no id', () => {
    const c = makeCustomer({ id: undefined });
    expect(() => getServiceStatus(c)).not.toThrow();
  });

  test('customer with no name', () => {
    const c = makeCustomer({ name: undefined });
    expect(() => getServiceStatus(c)).not.toThrow();
  });

  test('customer object is completely empty except serviceLog', () => {
    expect(() => getServiceStatus({ serviceLog: [] })).not.toThrow();
    expect(() => isOverdue({ serviceLog: [] })).not.toThrow();
  });

  test('customer object is completely empty', () => {
    expect(() => getServiceStatus({})).not.toThrow();
    expect(() => isOverdue({})).not.toThrow();
    expect(() => daysSinceLastService({})).not.toThrow();
  });

  test('very large serviceLog (10000 entries)', () => {
    const c = makeCustomer({
      serviceLog: Array.from({ length: 10000 }, (_, i) => ({
        id: `e-${i}`,
        date: daysAgo(i),
        type: 'service',
        notes: 'test',
      })),
    });
    expect(() => getLastServiceDate(c)).not.toThrow();
    expect(() => getServiceStatus(c)).not.toThrow();
    expect(daysSinceLastService(c)).toBe(0);
  });

  test('service date in the future', () => {
    const future = new Date(Date.now() + 365 * 86400000).toISOString();
    const c = makeCustomer({
      serviceLog: [{ id: '1', date: future, type: 'service', notes: '' }],
    });
    // daysSinceLastService should be negative or 0
    const days = daysSinceLastService(c);
    expect(days).toBeLessThanOrEqual(0);
    // Should NOT be overdue
    expect(isOverdue(c)).toBe(false);
  });

  test('all service dates are identical', () => {
    const c = makeCustomer({
      serviceLog: makeServiceLog([100, 100, 100]),
    });
    expect(daysSinceLastService(c)).toBe(100);
  });

  test('service dates spanning decades', () => {
    const c = makeCustomer({
      serviceLog: [
        { id: '1', date: '2000-01-01T00:00:00.000Z', type: 'service', notes: '' },
        { id: '2', date: '2020-06-15T00:00:00.000Z', type: 'service', notes: '' },
        { id: '3', date: daysAgo(10), type: 'service', notes: '' },
      ],
    });
    expect(daysSinceLastService(c)).toBe(10);
  });

  test('groupCustomersByDueWindow with mixed valid and edge-case customers', () => {
    const customers = [
      makeCustomer({ id: 'empty-obj' }),                           // never serviced
      makeCustomer({ id: 'null-log', serviceLog: null }),          // null log
      makeCustomer({ id: 'normal', serviceLog: makeServiceLog([100]) }),
    ];
    expect(() => groupCustomersByDueWindow(customers)).not.toThrow();
    const sections = groupCustomersByDueWindow(customers);
    const total = sections.reduce((sum, s) => sum + s.data.length, 0);
    expect(total).toBe(3);
  });

  test('filterByDueStatus with invalid filter value defaults gracefully', () => {
    const customers = [makeCustomer({ serviceLog: makeServiceLog([100]) })];
    // Non-matching filter — should not crash
    expect(() => filterByDueStatus(customers, 'garbage')).not.toThrow();
  });
});
