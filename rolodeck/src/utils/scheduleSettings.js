// =============================================================================
// scheduleSettings.js - Scheduling settings storage and time-slot generation
// Version: 1.1
// Last Updated: 2026-04-18
//
// PROJECT:      Rolodeck (project v0.24.2)
// FILES:        scheduleSettings.js          (this file — scheduling engine)
//               SchedulingSettingsScreen.js  (reads/writes settings)
//               ScheduleServiceModal.js      (uses generateSlots)
//               calendarSync.js              (uses getAppointmentDuration)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - All settings persisted individually to AsyncStorage so partial saves
//     are safe and defaults are always recoverable
//   - Work days stored as JSON array of JS day-of-week numbers (0=Sun…6=Sat)
//   - Times stored as integer hours (24hr): workStart=8, workEnd=17
//   - Durations stored as integer minutes: serviceMins=30, installMins=150
//   - generateSlots returns 30-min-increment slots for a given date, filtered
//     to fit within work hours and not overlapping existing appointments
//   - "Travel can overlap" rule: travel buffers are informational only and do
//     NOT block adjacent slots; only appointment work times are checked for
//     conflicts. Back-to-back appointments are allowed.
//   - Slots are returned as { startTime: Date, label: string, available: bool }
//     so the UI can show both available (teal) and booked (gray) slots
//
// CHANGE LOG:
// v1.1  2026-04-18  Claude  Harden work-day helpers against corrupted settings
//       - isWorkDay returns false (instead of throwing) when workDays is
//         undefined or not an array
//       - nextWorkDay returns fromDate instead of silently advancing 14 days
//         and returning a non-work-day when workDays is empty
// v1.0.1 2026-04-17  Claude  Fix conflict detection to include travel buffers —
//                            blocked zone is now [existStart-travelBefore,
//                            existEnd+travelAfter] instead of work time only
// v1.0  2026-04-17  Claude  Initial implementation
//       - DEFAULTS, AsyncStorage keys, getScheduleSettings, saveScheduleSettings
//       - isWorkDay, nextWorkDay, getAppointmentDuration
//       - generateSlots with overlap-only conflict detection
//       - formatSlotLabel, formatDuration helpers
// =============================================================================

'use strict';

import AsyncStorage from '@react-native-async-storage/async-storage';

// ── AsyncStorage keys ─────────────────────────────────────────────────────────

const KEYS = {
  workDays:     '@rolodeck_schedule_work_days',
  workStart:    '@rolodeck_schedule_work_start',
  workEnd:      '@rolodeck_schedule_work_end',
  serviceMins:  '@rolodeck_schedule_service_mins',
  installMins:  '@rolodeck_schedule_install_mins',
  travelBefore: '@rolodeck_schedule_travel_before',
  travelAfter:  '@rolodeck_schedule_travel_after',
};

// ── Defaults ──────────────────────────────────────────────────────────────────

export const SCHEDULE_DEFAULTS = {
  workDays:     [1, 2, 3, 4, 5], // Mon–Fri
  workStart:    8,                // 8:00 AM
  workEnd:      17,               // 5:00 PM
  serviceMins:  30,
  installMins:  150,              // 2h 30m
  travelBefore: 30,
  travelAfter:  30,
};

// ── Persistence ───────────────────────────────────────────────────────────────

export async function getScheduleSettings() {
  try {
    const [days, start, end, svc, inst, before, after] = await Promise.all([
      AsyncStorage.getItem(KEYS.workDays),
      AsyncStorage.getItem(KEYS.workStart),
      AsyncStorage.getItem(KEYS.workEnd),
      AsyncStorage.getItem(KEYS.serviceMins),
      AsyncStorage.getItem(KEYS.installMins),
      AsyncStorage.getItem(KEYS.travelBefore),
      AsyncStorage.getItem(KEYS.travelAfter),
    ]);
    return {
      workDays:     days   ? JSON.parse(days)    : SCHEDULE_DEFAULTS.workDays,
      workStart:    start  ? parseInt(start, 10) : SCHEDULE_DEFAULTS.workStart,
      workEnd:      end    ? parseInt(end,   10) : SCHEDULE_DEFAULTS.workEnd,
      serviceMins:  svc    ? parseInt(svc,   10) : SCHEDULE_DEFAULTS.serviceMins,
      installMins:  inst   ? parseInt(inst,  10) : SCHEDULE_DEFAULTS.installMins,
      travelBefore: before ? parseInt(before,10) : SCHEDULE_DEFAULTS.travelBefore,
      travelAfter:  after  ? parseInt(after, 10) : SCHEDULE_DEFAULTS.travelAfter,
    };
  } catch {
    return { ...SCHEDULE_DEFAULTS };
  }
}

export async function saveScheduleSettings(settings) {
  await Promise.all([
    AsyncStorage.setItem(KEYS.workDays,     JSON.stringify(settings.workDays)),
    AsyncStorage.setItem(KEYS.workStart,    String(settings.workStart)),
    AsyncStorage.setItem(KEYS.workEnd,      String(settings.workEnd)),
    AsyncStorage.setItem(KEYS.serviceMins,  String(settings.serviceMins)),
    AsyncStorage.setItem(KEYS.installMins,  String(settings.installMins)),
    AsyncStorage.setItem(KEYS.travelBefore, String(settings.travelBefore)),
    AsyncStorage.setItem(KEYS.travelAfter,  String(settings.travelAfter)),
  ]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true if the given Date falls on a configured work day. */
export function isWorkDay(date, workDays) {
  if (!Array.isArray(workDays) || workDays.length === 0) return false;
  return workDays.includes(date.getDay());
}

/**
 * Returns the next work day on or after fromDate.
 * If fromDate is already a work day, returns it unchanged.
 * If workDays is empty or invalid, returns fromDate unchanged rather than
 * silently advancing by 14 days and handing back a non-work-day.
 */
export function nextWorkDay(fromDate, workDays) {
  const d = new Date(fromDate);
  d.setHours(0, 0, 0, 0);
  if (!Array.isArray(workDays) || workDays.length === 0) return d;
  for (let i = 0; i < 14; i++) {
    if (workDays.includes(d.getDay())) return d;
    d.setDate(d.getDate() + 1);
  }
  return d; // fallback: shouldn't happen if workDays is non-empty
}

/** Returns appointment duration in minutes for the given type. */
export function getAppointmentDuration(type, settings) {
  return type === 'install' ? settings.installMins : settings.serviceMins;
}

/**
 * Format a time slot Date as a human-readable label: "8:00 AM", "2:30 PM".
 */
export function formatSlotLabel(date) {
  return date.toLocaleTimeString('en-US', {
    hour:   'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format a duration in minutes as a human string: "30 min", "1h 30m", "2h".
 */
export function formatDuration(mins) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Format an hour integer (24hr) as AM/PM: 8 → "8:00 AM", 17 → "5:00 PM".
 */
export function formatHour(h) {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// ── Slot generation ───────────────────────────────────────────────────────────

/**
 * Generate all 30-minute time slots for a given date that fit within work
 * hours, marking each as available or booked.
 *
 * @param {Date}   date               - The date to generate slots for (time ignored)
 * @param {string} appointmentType    - 'service' | 'install'
 * @param {Array}  existingScheduled  - Array of scheduledEntry objects for ALL dates
 *                                      (filtered internally to this date)
 * @param {object} settings           - Result of getScheduleSettings()
 * @returns {Array} [{ startTime: Date, endTime: Date, label: string, available: boolean }]
 */
export function generateSlots(date, appointmentType, existingScheduled, settings) {
  const durationMins = getAppointmentDuration(appointmentType, settings);

  // Appointments on this specific date (by local date match)
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();

  const sameDay = existingScheduled.filter((entry) => {
    const ed = new Date(entry.date);
    return ed.getFullYear() === y && ed.getMonth() === m && ed.getDate() === d;
  });

  const slots = [];
  // Step through 30-min increments from workStart to (workEnd - durationMins)
  const startMinutes = settings.workStart * 60;
  const endMinutes   = settings.workEnd   * 60;

  for (let t = startMinutes; t + durationMins <= endMinutes; t += 30) {
    const slotStart = new Date(y, m, d, Math.floor(t / 60), t % 60, 0, 0);
    const slotEnd   = new Date(slotStart.getTime() + durationMins * 60000);

    const available = !sameDay.some((entry) => {
      const existStart   = new Date(entry.date);
      const existDur     = getAppointmentDuration(entry.type || 'service', settings);
      const existEnd     = new Date(existStart.getTime() + existDur * 60000);
      // Blocked zone = work time + travel buffers on each side.
      // Travel windows between consecutive appointments are allowed to overlap,
      // so the new slot's work time just can't fall inside an existing blocked zone.
      const blockedStart = new Date(existStart.getTime() - settings.travelBefore * 60000);
      const blockedEnd   = new Date(existEnd.getTime()   + settings.travelAfter  * 60000);
      return slotStart < blockedEnd && slotEnd > blockedStart;
    });

    slots.push({
      startTime: slotStart,
      endTime:   slotEnd,
      label:     formatSlotLabel(slotStart),
      available,
    });
  }

  return slots;
}
