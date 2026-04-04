// =============================================================================
// serviceAlerts.js - Service due-date calculations and filter utilities
// Version: 1.1
// Last Updated: 2026-04-03
//
// PROJECT:      Rolodeck (project v1.2)
// FILES:        serviceAlerts.js     (this file — pure alert/filter logic)
//               storage.js           (Customer data source)
//               ServicesScreen.js    (groupCustomersByDueWindow, getServiceStatus)
//               CustomerCard.js      (getServiceStatus)
//               CustomerDetailScreen.js (getServiceStatus)
//               App.js               (getAlertBadgeCount)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - All functions are pure — no storage access, no side effects
//   - "Last service date" = date of the most recent serviceLog entry
//   - Service interval: 365 days
//   - Customers with no serviceLog entries are treated as never serviced
//     (most urgent) so they surface in all alert/overdue buckets
//   - Due windows: a customer is "due within N days" if (365 - daysAgo) <= N
//     and they are not yet overdue
//   - groupCustomersByDueWindow: buckets customers into SectionList-ready
//     sections (Overdue / Next 30 / Next 31-60 / Next 61-90 / Later),
//     sorted by urgency within each bucket; empty sections omitted
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial scaffold
// v1.1  2026-04-03  Claude  Added groupCustomersByDueWindow() for ServicesScreen
//                           section-based layout [updated ARCHITECTURE]
// =============================================================================

const SERVICE_INTERVAL_DAYS = 365;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Returns the Date of the most recent service log entry, or null. */
export function getLastServiceDate(customer) {
  if (!customer.serviceLog || customer.serviceLog.length === 0) return null;
  const dates = customer.serviceLog.map((e) => new Date(e.date));
  return dates.reduce((latest, d) => (d > latest ? d : latest), dates[0]);
}

/** Returns whole days since last service, or Infinity if no record. */
export function daysSinceLastService(customer) {
  const last = getLastServiceDate(customer);
  if (!last) return Infinity;
  return Math.floor((Date.now() - last.getTime()) / MS_PER_DAY);
}

/** Returns whole days until 1-year service is due. Negative means overdue. */
export function daysUntilDue(customer) {
  const days = daysSinceLastService(customer);
  if (!isFinite(days)) return -Infinity;
  return SERVICE_INTERVAL_DAYS - days;
}

// ── Status predicates ─────────────────────────────────────────────────────────

/** True if the customer is currently overdue for service. */
export function isOverdue(customer) {
  const days = daysSinceLastService(customer);
  return !isFinite(days) || days > SERVICE_INTERVAL_DAYS;
}

/** True if service is due within `windowDays` days (and not yet overdue). */
export function isDueWithin(customer, windowDays) {
  const until = daysUntilDue(customer);
  return isFinite(until) && until >= 0 && until <= windowDays;
}

// ── Filters ───────────────────────────────────────────────────────────────────

/**
 * Filter customers by due status.
 * @param {object[]} customers
 * @param {'overdue'|30|60|90|'all'} filter
 */
export function filterByDueStatus(customers, filter) {
  if (filter === 'all') return customers;
  if (filter === 'overdue') return customers.filter(isOverdue);
  return customers.filter((c) => isOverdue(c) || isDueWithin(c, filter));
}

/** Badge count: number of customers currently overdue. */
export function getAlertBadgeCount(customers) {
  return customers.filter(isOverdue).length;
}

// ── Status label ──────────────────────────────────────────────────────────────

/**
 * Returns a human-readable status label + severity level.
 * level: 'overdue' | 'warning' | 'upcoming' | 'ok'
 */
export function getServiceStatus(customer) {
  const days = daysSinceLastService(customer);

  if (!isFinite(days)) {
    return { label: 'No service on record', level: 'overdue' };
  }

  const until = SERVICE_INTERVAL_DAYS - days;

  if (until < 0)   return { label: `Overdue by ${Math.abs(until)} days`, level: 'overdue' };
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
export function groupCustomersByDueWindow(customers) {
  const overdue = [];
  const next30  = [];
  const next60  = [];
  const next90  = [];
  const later   = [];

  for (const c of customers) {
    if (isOverdue(c)) {
      overdue.push(c);
    } else if (isDueWithin(c, 30)) {
      next30.push(c);
    } else if (isDueWithin(c, 60)) {
      next60.push(c);
    } else if (isDueWithin(c, 90)) {
      next90.push(c);
    } else {
      later.push(c);
    }
  }

  // Sort each bucket: smallest daysUntilDue first (most urgent)
  const byUrgency = (a, b) => {
    const da = daysUntilDue(a);
    const db = daysUntilDue(b);
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
    { key: 'next60',  title: 'Next 60 Days',  data: next60  },
    { key: 'next90',  title: 'Next 90 Days',  data: next90  },
    { key: 'later',   title: 'Later',            data: later   },
  ];

  return sections.filter((s) => s.data.length > 0);
}
