// =============================================================================
// dateUtils.js - Timezone-safe local-date helpers
// Version: 1.0
// Last Updated: 2026-04-10
//
// PROJECT:      Rolodeck (project v0.18)
// FILES:        dateUtils.js            (this file — pure sync helpers)
//               ServicesScreen.js       (calendar day matching, due-date keys)
//               AddServiceScreen.js     (maxDate + default date)
//               AddServiceModal.js      (maxDate + default date)
//               ScheduleServiceModal.js (minDate = tomorrow)
//               calendarSync.js         (due-date event computation)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Service entries and scheduled entries are stored as ISO strings
//     (absolute UTC timestamps) so storage is timezone-agnostic
//   - But calendar matching, "today" defaults, and due-date display are
//     inherently LOCAL-DAY concepts. Using toISOString().split('T')[0]
//     on those values returns the UTC date, which drifts from the user's
//     local calendar day near midnight — customers scheduled for April 10
//     local time would show up on April 9 or April 11 on the calendar
//     depending on which side of the UTC offset the user lives
//   - These helpers extract local-calendar components from Date objects
//     directly (getFullYear/getMonth/getDate) so they always match what
//     the user sees on their system clock
//   - addDaysLocal() uses setDate() instead of millisecond arithmetic so
//     DST transitions don't produce off-by-an-hour drift across the year
//
// CHANGE LOG:
// v1.0  2026-04-10  Claude  Initial scaffold — extracted from inline
//                            .toISOString().split('T')[0] calls scattered
//                            across ServicesScreen, calendar modals, and
//                            calendarSync. See the audit for the bug cases.
// =============================================================================

/**
 * Returns YYYY-MM-DD for a Date, using the LOCAL calendar day.
 * Never use `date.toISOString().split('T')[0]` for this — that returns UTC.
 */
export function toLocalDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Returns today's local date as YYYY-MM-DD. */
export function todayLocalKey() {
  return toLocalDateKey(new Date());
}

/** Returns tomorrow's local date as YYYY-MM-DD. */
export function tomorrowLocalKey() {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return toLocalDateKey(t);
}

/**
 * Parses an ISO timestamp string (as stored on service/scheduled entries)
 * and returns its LOCAL calendar day. Use this when matching stored entries
 * against a day selected on the calendar.
 */
export function localDateKeyFromISO(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  return toLocalDateKey(d);
}

/**
 * Adds whole days to a Date, returning a new Date. Uses setDate() so DST
 * transitions are handled correctly (unlike `date.getTime() + days * 86400000`
 * which drifts by an hour per DST crossing).
 */
export function addDaysLocal(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** True if two dates land on the same local calendar day. */
export function isSameLocalDay(a, b) {
  return toLocalDateKey(a) === toLocalDateKey(b);
}
