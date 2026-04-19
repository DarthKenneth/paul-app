// =============================================================================
// serviceAlerts.js - Service due-date calculations and filter utilities
// Version: 1.3
// Last Updated: 2026-04-18
//
// PROJECT:      Rolodeck (project v0.24.2)
// FILES:        serviceAlerts.js     (this file — pure alert/filter logic)
//               storage.js           (Customer data source)
//               ServicesScreen.js    (groupCustomersByDueWindow, getServiceStatus)
//               CustomerCard.js      (getServiceStatus)
//               CustomerDetailScreen.js (getServiceStatus)
//               App.js               (getAlertBadgeCount)
//               calendarSync.js      (getLastServiceDate, getEffectiveIntervalForCustomer)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - All functions are pure — no storage access, no side effects
//   - "Last service date" = date of the most recent serviceLog entry
//   - Service interval: configurable; functions accept intervalDays param
//     (default 365); callers load interval from storage and pass it in
//   - Per-entry interval: if a service entry has an intervalDays field (set
//     when logged under custom interval mode), that value overrides the global
//     interval for that customer until a new entry is logged without one
//   - getEffectiveIntervalForCustomer(customer, globalIntervalDays) returns the
//     interval to use: most recent entry's intervalDays if present, else global
//   - Customers with no serviceLog entries are treated as never serviced
//     (most urgent) so they surface in all alert/overdue buckets
//   - Due windows: a customer is "due within N days" if (interval - daysAgo) <= N
//     and they are not yet overdue
//   - groupCustomersByDueWindow: buckets customers into SectionList-ready
//     sections (Overdue / Next 30 / Next 31-60 / Next 61-90 / Later),
//     sorted by urgency within each bucket; empty sections omitted
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial scaffold
// v1.1  2026-04-03  Claude  Added groupCustomersByDueWindow() for ServicesScreen
//                           section-based layout [updated ARCHITECTURE]
// v1.3  2026-04-18  Claude  Unify "latest service entry" source of truth
//       - Added getLatestServiceEntry() — reduces log by date, not position
//       - getLastServiceDate and getEffectiveIntervalForCustomer both consume
//         it so they can never disagree when log order drifts (Square import,
//         manual edit, backup restore) — previously the interval lookup trusted
//         log[0] while the date lookup scanned for max-by-date
//       - Fix "Overdue by 1 days" plural bug in getServiceStatus
// v1.2  2026-04-09  Claude  Configurable service interval
//       - Removed hardcoded SERVICE_INTERVAL_DAYS = 365 constant
//       - Added getEffectiveIntervalForCustomer() — checks most recent service
//         entry's intervalDays field, falls back to globalIntervalDays param
//       - All exported functions now accept intervalDays param (default 365)
//       - groupCustomersByDueWindow and internal sort pass intervalDays through
//         [updated ARCHITECTURE]
// =============================================================================

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// ── Date helpers ──────────────────────────────────────────────────────────────

/**
 * Returns the most recent service log entry (by date), or null.
 * Single source of truth for "latest" — both getLastServiceDate and
 * getEffectiveIntervalForCustomer consume this so they can never disagree
 * about which entry is newest when log order drifts (e.g. Square import,
 * manual edits, backup restore).
 */
export function getLatestServiceEntry(customer) {
  if (!customer || !Array.isArray(customer.serviceLog) || customer.serviceLog.length === 0) {
    return null;
  }
  return customer.serviceLog.reduce((latest, e) => {
    if (!latest) return e;
    return new Date(e.date) > new Date(latest.date) ? e : latest;
  }, null);
}

/** Returns the Date of the most recent service log entry, or null. */
export function getLastServiceDate(customer) {
  const latest = getLatestServiceEntry(customer);
  return latest ? new Date(latest.date) : null;
}

/**
 * Returns the effective interval (in days) for a customer.
 * If the most recent service entry has an intervalDays field, that takes
 * precedence — it persists until a new entry is logged without one.
 */
export function getEffectiveIntervalForCustomer(customer, globalIntervalDays) {
  const latest = getLatestServiceEntry(customer);
  if (latest && typeof latest.intervalDays === 'number' && latest.intervalDays > 0) {
    return latest.intervalDays;
  }
  return globalIntervalDays;
}

/** Returns whole days since last service, or Infinity if no record. */
export function daysSinceLastService(customer) {
  const last = getLastServiceDate(customer);
  if (!last) return Infinity;
  return Math.floor((Date.now() - last.getTime()) / MS_PER_DAY);
}

/** Returns whole days until service is due. Negative means overdue. */
export function daysUntilDue(customer, intervalDays = 365) {
  const effective = getEffectiveIntervalForCustomer(customer, intervalDays);
  const days = daysSinceLastService(customer);
  if (!isFinite(days)) return -Infinity;
  return effective - days;
}

// ── Status predicates ─────────────────────────────────────────────────────────

/** True if the customer is currently overdue for service. */
export function isOverdue(customer, intervalDays = 365) {
  const effective = getEffectiveIntervalForCustomer(customer, intervalDays);
  const days = daysSinceLastService(customer);
  return !isFinite(days) || days > effective;
}

/** True if service is due within `windowDays` days (and not yet overdue). */
export function isDueWithin(customer, windowDays, intervalDays = 365) {
  const until = daysUntilDue(customer, intervalDays);
  return isFinite(until) && until >= 0 && until <= windowDays;
}

// ── Filters ───────────────────────────────────────────────────────────────────

/**
 * Filter customers by due status.
 * @param {object[]} customers
 * @param {'overdue'|30|60|90|'all'} filter
 * @param {number} intervalDays
 */
export function filterByDueStatus(customers, filter, intervalDays = 365) {
  if (filter === 'all') return customers;
  if (filter === 'overdue') return customers.filter((c) => isOverdue(c, intervalDays));
  return customers.filter((c) => isOverdue(c, intervalDays) || isDueWithin(c, filter, intervalDays));
}

/** Badge count: number of customers currently overdue. */
export function getAlertBadgeCount(customers, intervalDays = 365) {
  return customers.filter((c) => isOverdue(c, intervalDays)).length;
}

// ── Status label ──────────────────────────────────────────────────────────────

/**
 * Returns a human-readable status label + severity level.
 * level: 'overdue' | 'warning' | 'upcoming' | 'ok'
 */
export function getServiceStatus(customer, intervalDays = 365) {
  const effective = getEffectiveIntervalForCustomer(customer, intervalDays);
  const days = daysSinceLastService(customer);

  if (!isFinite(days)) {
    return { label: 'No service on record', level: 'overdue' };
  }

  const until = effective - days;

  if (until < 0) {
    const n = Math.abs(until);
    return { label: `Overdue by ${n} day${n === 1 ? '' : 's'}`, level: 'overdue' };
  }
  if (until === 0) return { label: 'Due today',                          level: 'overdue' };
  if (until <= 30) return { label: `Due in ${until} day${until === 1 ? '' : 's'}`,  level: 'warning' };
  if (until <= 90) return { label: `Due in ${until} days`,               level: 'upcoming' };
  return { label: `Next service in ${until} days`, level: 'ok' };
}

// ── Sort ──────────────────────────────────────────────────────────────────────

/** Sort customers by urgency — most overdue (or never serviced) first. */
export function sortByUrgency(customers) {
  return [...customers].sort((a, b) => {
    const da = daysSinceLastService(a);
    const db = daysSinceLastService(b);
    // Treat Infinity as very large but still sortable
    const ia = isFinite(da) ? da : Number.MAX_SAFE_INTEGER;
    const ib = isFinite(db) ? db : Number.MAX_SAFE_INTEGER;
    return ib - ia;
  });
}

// ── Section grouping ──────────────────────────────────────────────────────────

/**
 * Buckets customers into sections for ServicesScreen SectionList.
 * Each section: { key, title, data } — empty sections are omitted.
 * Within each bucket, sorted by urgency (most urgent first).
 *
 * Buckets:
 *   Overdue        — isOverdue (includes never-serviced)
 *   Next 30 Days   — due in 0–30 days
 *   Next 31–60 Days — due in 31–60 days
 *   Next 61–90 Days — due in 61–90 days
 *   Later          — due in 91+ days
 */
export function groupCustomersByDueWindow(customers, intervalDays = 365) {
  const overdue = [];
  const next30  = [];
  const next60  = [];
  const next90  = [];
  const later   = [];

  for (const c of customers) {
    if (isOverdue(c, intervalDays)) {
      overdue.push(c);
    } else if (isDueWithin(c, 30, intervalDays)) {
      next30.push(c);
    } else if (isDueWithin(c, 60, intervalDays)) {
      next60.push(c);
    } else if (isDueWithin(c, 90, intervalDays)) {
      next90.push(c);
    } else {
      later.push(c);
    }
  }

  // Sort each bucket: smallest daysUntilDue first (most urgent)
  const byUrgency = (a, b) => {
    const da = daysUntilDue(a, intervalDays);
    const db = daysUntilDue(b, intervalDays);
    const ia = isFinite(da) ? da : -Number.MAX_SAFE_INTEGER;
    const ib = isFinite(db) ? db : -Number.MAX_SAFE_INTEGER;
    return ia - ib;
  };

  overdue.sort(byUrgency);
  next30.sort(byUrgency);
  next60.sort(byUrgency);
  next90.sort(byUrgency);
  later.sort(byUrgency);

  const sections = [
    { key: 'overdue', title: 'Overdue',         data: overdue },
    { key: 'next30',  title: 'Next 30 Days',    data: next30  },
    { key: 'next60',  title: 'Next 60 Days',    data: next60  },
    { key: 'next90',  title: 'Next 90 Days',    data: next90  },
    { key: 'later',   title: 'Later',            data: later   },
  ];

  return sections.filter((s) => s.data.length > 0);
}
