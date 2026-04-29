// =============================================================================
// calendarSync.js - Pushes service due dates and scheduled services to device calendar
// Version: 1.8
// Last Updated: 2026-04-18
//
// PROJECT:      Rolodeck (project v0.24.2)
// FILES:        calendarSync.js         (this file — calendar sync engine)
//               storage.js              (getAllCustomers, getCustomerById,
//                                        getServiceIntervalMode,
//                                        getServiceIntervalCustomDays,
//                                        modeToIntervalDays)
//               serviceAlerts.js        (getLastServiceDate,
//                                        getEffectiveIntervalForCustomer)
//               AddServiceScreen.js     (calls syncCustomerDueDate after save)
//               CustomerDetailScreen.js (calls syncScheduledService after schedule,
//                                        removeScheduledServiceEvent on cancel)
//               SettingsScreen.js       (calls enableCalendarSync, disableCalendarSync,
//                                        getCalendarSyncEnabled, syncAllCustomers)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - All functions are async; calendar errors never propagate to callers
//     (sync is fire-and-forget — failure should never break core app flow)
//   - Requires expo-calendar (~13.0.5); uses EventKit on iOS, Calendar API
//     on Android
//   - Calendar management:
//       A single "Rolodeck" calendar is created on first use and its ID
//       persisted to AsyncStorage (@callcard_calendar_id)
//       iOS:     inherits the default calendar source (usually iCloud),
//                so events auto-sync to iCloud Calendar
//                accessLevel: Calendar.CalendarAccessLevel.OWNER (iOS-only)
//       Android: scans existing calendars for a Google account source
//                (type 'com.google') so events sync to Google Calendar;
//                falls back to any writable source if no Google account found;
//                ownerAccount set to the source account's email
//   - Due-date event IDs persisted to @callcard_calendar_event_ids
//     (JSON map: customerId → eventId) so events are upserted, not duplicated
//   - Scheduled service event IDs persisted to @callcard_calendar_scheduled_event_ids
//     (JSON map: scheduledEntry.id → eventId)
//   - Due-date event content:
//       Title: "{customer name} — Service Due"
//       All-day event on the computed due date (last service + interval days)
//       Notes: address, phone, email
//       Alarm: 1 day before (where platform supports it)
//   - Scheduled service event content:
//       Title: "{customer name} — Scheduled Service"
//       All-day event on the user-chosen date
//       Notes: scheduled entry notes (if any) + address, phone, email
//       Alarm: 1 day before
//   - Customers with no service log entries are skipped (no pinnable due date)
//   - Archived customers are excluded from syncAllCustomers
//   - disableCalendarSync only persists the preference — it does NOT delete
//     existing calendar events (non-destructive)
//   - Permission is re-checked on every sync call; if denied, sync records
//     a 'permission-denied' status so Settings can surface it to the user
//   - Each sync operation writes a status record to AsyncStorage:
//       { status: 'ok' | 'permission-denied' | 'error', message?, at: ISO }
//     Settings reads this via getCalendarSyncStatus() and shows a banner
//     when status !== 'ok' and sync is enabled
//
// CHANGE LOG:
// v1.7.1 2026-04-18  Claude  Harden event-ID map reads — getEventIds and
//                            getScheduledEventIds now catch JSON.parse errors
//                            and return an empty map so one corrupt AsyncStorage
//                            write doesn't permanently break calendar sync
// v1.0  2026-04-06  Claude  Initial scaffold
//       - requestCalendarPermission, getRoledeckCalendar
//       - getCalendarSyncEnabled, enableCalendarSync, disableCalendarSync
//       - syncCustomerDueDate (upsert single customer event)
//       - syncAllCustomers (full sync for initial enable or manual re-sync)
//       - removeCustomerEvent (for future archive/delete integration)
//       - buildEventNotes (formats customer contact info for event body)
// v1.7  2026-04-17  Claude  Harden batch sync and status reporting
//       - syncScheduledService gains optional { writeStatus } param (default true);
//         when false, errors re-throw instead of being swallowed into a per-entry
//         status record so batch callers can own the final status write
//       - syncAllScheduledServices now calls syncScheduledService with
//         writeStatus: false and tracks per-entry failures; writes one accurate
//         final status for the whole batch instead of being overwritten by the
//         last individual entry
// v1.6  2026-04-17  Claude  Full sync for all scheduled services
//       - Added syncAllScheduledServices() — loops all active customers and calls
//         syncScheduledService for each existing scheduledServices entry
//       - Added syncAll() — calls syncAllCustomers then syncAllScheduledServices
//       - enableCalendarSync now calls syncAll() instead of syncAllCustomers()
//         so toggling sync on immediately pushes every scheduled appointment
// v1.5  2026-04-17  Claude  Timed calendar events for scheduled services
//       - syncScheduledService now creates timed events (allDay: false) using
//         appointment start time + duration from scheduleSettings
//       - Event title includes type: "— Scheduled Service" / "— Scheduled Install"
//       - Event notes include duration, travel buffer summary, and contact info
//       - Imported getScheduleSettings, getAppointmentDuration, formatDuration
// v1.4  2026-04-17  Claude  Scheduled service calendar sync
//       - Added SCHEDULED_EVENT_IDS_KEY + getScheduledEventIds/saveScheduledEventIds
//       - Added syncScheduledService(customer, scheduledEntry) — upserts a calendar
//         event on the user-chosen scheduled date; notes include any entry notes
//         followed by customer contact info [updated ARCHITECTURE]
//       - Added removeScheduledServiceEvent(entryId) — removes calendar event when
//         a scheduled service is cancelled
// v1.3  2026-04-10  Claude  Surface sync errors to user
//       - Added LAST_SYNC_STATUS_KEY with { status, message, at } record
//       - setSyncStatus() helper writes on every success/failure
//       - getCalendarSyncStatus() export for Settings to read
//       - syncCustomerDueDate, syncAllCustomers, removeCustomerEvent all now
//         record status instead of swallowing errors silently. Permission
//         denials are distinguished from other errors.
// v1.2  2026-04-09  Claude  Respect configurable service interval
//       - syncCustomerDueDate loads interval preference and uses
//         getEffectiveIntervalForCustomer to compute due date; removed
//         hardcoded SERVICE_INTERVAL_MS constant
//       - Imported getServiceIntervalMode, getServiceIntervalCustomDays,
//         modeToIntervalDays from storage; getEffectiveIntervalForCustomer
//         from serviceAlerts
// v1.1  2026-04-06  Claude  Android Google Calendar support
//       - getRoledeckCalendar: Android now scans existing calendars for a
//         Google account source (com.google) so events sync to Google Calendar
//         instead of creating a local-only calendar
//       - createCalendarAsync: accessLevel now iOS-only (CalendarAccessLevel
//         is an EventKit concept, not available on Android)
//       - ownerAccount on Android set to the discovered source account email
//         [updated ARCHITECTURE]
// =============================================================================

import * as Calendar from 'expo-calendar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getScheduleSettings, getAppointmentDuration, formatDuration } from './scheduleSettings';
import {
  getAllCustomers,
  getServiceIntervalMode,
  getServiceIntervalCustomDays,
  modeToIntervalDays,
} from '../data/storage';
import { getLastServiceDate, getEffectiveIntervalForCustomer } from './serviceAlerts';
import { addDaysLocal } from './dateUtils';

const SYNC_ENABLED_KEY            = '@callcard_calendar_sync_enabled';
const CALENDAR_ID_KEY             = '@callcard_calendar_id';
const EVENT_IDS_KEY               = '@callcard_calendar_event_ids';
const SCHEDULED_EVENT_IDS_KEY     = '@callcard_calendar_scheduled_event_ids';
const LAST_SYNC_STATUS_KEY        = '@callcard_calendar_last_sync_status';

const CALENDAR_COLOR = '#8B4513'; // Callout sienna

// ── Permission ────────────────────────────────────────────────────────────────

/** Request calendar read/write permission. Returns true if granted. */
export async function requestCalendarPermission() {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

// ── Sync status tracking ──────────────────────────────────────────────────────
//
// Every sync operation writes a status record so Settings can show the user
// whether their data is actually making it to the calendar. Status values:
//   'ok'                — last sync succeeded
//   'permission-denied' — calendar permission not granted (or revoked)
//   'error'             — sync threw an unexpected error
//
// The record is cleared when sync is disabled.

async function setSyncStatus(status, message = '') {
  const record = { status, message, at: new Date().toISOString() };
  try {
    await AsyncStorage.setItem(LAST_SYNC_STATUS_KEY, JSON.stringify(record));
  } catch {
    // If we can't even write the status, there's not much we can do
  }
}

async function clearSyncStatus() {
  try {
    await AsyncStorage.removeItem(LAST_SYNC_STATUS_KEY);
  } catch {
    // Swallow
  }
}

/**
 * Returns the last sync status record, or null if sync has never run or is
 * disabled. Shape: { status, message, at } — see setSyncStatus for values.
 * Settings should display a warning banner when status is not 'ok'.
 */
export async function getCalendarSyncStatus() {
  try {
    const raw = await AsyncStorage.getItem(LAST_SYNC_STATUS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.status) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Preferences ───────────────────────────────────────────────────────────────

export async function getCalendarSyncEnabled() {
  const val = await AsyncStorage.getItem(SYNC_ENABLED_KEY);
  return val === 'true';
}

/**
 * Enable calendar sync. Requests permission and does a full initial sync.
 * Returns true if permission was granted and sync succeeded.
 */
export async function enableCalendarSync() {
  const granted = await requestCalendarPermission();
  if (!granted) {
    await setSyncStatus('permission-denied', 'Calendar permission was denied.');
    return false;
  }
  await AsyncStorage.setItem(SYNC_ENABLED_KEY, 'true');
  await syncAll();
  return true;
}

/** Disable calendar sync. Does NOT delete existing calendar events. */
export async function disableCalendarSync() {
  await AsyncStorage.setItem(SYNC_ENABLED_KEY, 'false');
  // Clear any stale status — no point warning about sync when it's disabled
  await clearSyncStatus();
}

// ── Rolodeck calendar management ──────────────────────────────────────────────

async function getRoledeckCalendar() {
  // Check if we have a valid stored calendar
  const storedId = await AsyncStorage.getItem(CALENDAR_ID_KEY);
  if (storedId) {
    const all = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const exists = all.find((c) => c.id === storedId);
    if (exists) return storedId;
  }

  // Resolve source + ownerAccount per platform
  let source;
  let ownerAccount = 'personal';

  if (Platform.OS === 'ios') {
    // getDefaultCalendarAsync is iOS-only; its source is usually iCloud
    const defaultCal = await Calendar.getDefaultCalendarAsync();
    source = defaultCal.source;
  } else {
    // Android: prefer a Google account source so events sync to Google Calendar
    const allCalendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);

    // First choice: owned Google calendar (type 'com.google')
    const googleCal = allCalendars.find(
      (c) => c.source?.type === 'com.google' && c.allowsModifications,
    );
    // Second choice: any writable calendar
    const writableCal = allCalendars.find((c) => c.allowsModifications);

    const preferred = googleCal || writableCal;
    if (preferred?.source) {
      source       = preferred.source;
      ownerAccount = preferred.ownerAccount || preferred.source.name || 'personal';
    } else {
      // Last resort: pure local calendar (won't sync to any cloud service)
      source = { isLocalAccount: true, name: 'Expo Calendar' };
    }
  }

  // accessLevel is an iOS EventKit concept — omit it on Android
  const calendarConfig = {
    title:        'Callcard',
    color:        CALENDAR_COLOR,
    entityType:   Calendar.EntityTypes.EVENT,
    sourceId:     source.id,
    source,
    name:         'callcard',
    ownerAccount,
  };
  if (Platform.OS === 'ios') {
    calendarConfig.accessLevel = Calendar.CalendarAccessLevel.OWNER;
  }

  const calendarId = await Calendar.createCalendarAsync(calendarConfig);

  await AsyncStorage.setItem(CALENDAR_ID_KEY, calendarId);
  return calendarId;
}

// ── Event ID persistence ──────────────────────────────────────────────────────

async function getEventIds() {
  const raw = await AsyncStorage.getItem(EVENT_IDS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // Corrupted map — reset rather than kill sync forever
    return {};
  }
}

async function saveEventIds(map) {
  await AsyncStorage.setItem(EVENT_IDS_KEY, JSON.stringify(map));
}

async function getScheduledEventIds() {
  const raw = await AsyncStorage.getItem(SCHEDULED_EVENT_IDS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveScheduledEventIds(map) {
  await AsyncStorage.setItem(SCHEDULED_EVENT_IDS_KEY, JSON.stringify(map));
}

// ── Event content ─────────────────────────────────────────────────────────────

function buildEventNotes(customer) {
  const lines = [];
  const addrParts = [
    customer.address,
    customer.city,
    customer.state,
    customer.zipCode,
  ].filter(Boolean);
  if (addrParts.length) lines.push(addrParts.join(', '));
  if (customer.phone) lines.push(`Phone: ${customer.phone}`);
  if (customer.email) lines.push(`Email: ${customer.email}`);
  return lines.join('\n');
}

// ── Core sync operations ──────────────────────────────────────────────────────

/**
 * Upsert a single customer's due-date event in the Rolodeck calendar.
 * Silently no-ops if sync is disabled, permission is missing, or the
 * customer has no service history.
 *
 * @param {object}  customer
 * @param {object}  [opts]
 * @param {boolean} [opts.writeStatus=true]  Whether to write to the sync-status
 *   record. Set to false when called inside a batch (syncAllCustomers) so the
 *   batch can own one final status record instead of the per-customer noise
 *   clobbering a real failure.
 */
export async function syncCustomerDueDate(customer, opts = {}) {
  const writeStatus = opts.writeStatus !== false;
  try {
    const enabled = await getCalendarSyncEnabled();
    if (!enabled) return;

    const granted = await requestCalendarPermission();
    if (!granted) {
      if (writeStatus) await setSyncStatus('permission-denied', 'Calendar access was revoked.');
      return;
    }

    const lastService = getLastServiceDate(customer);
    if (!lastService) return; // no service on record — nothing to pin

    const [mode, customDays] = await Promise.all([
      getServiceIntervalMode(),
      getServiceIntervalCustomDays(),
    ]);
    const globalDays  = modeToIntervalDays(mode, customDays);
    const effectiveDays = getEffectiveIntervalForCustomer(customer, globalDays);
    // addDaysLocal (not millisecond arithmetic) so DST transitions don't
    // shift the due date by an hour → potentially wrong day
    const dueDate = addDaysLocal(lastService, effectiveDays);
    // expo-calendar all-day events expect endDate strictly after startDate.
    // Some Android OEMs drop the event entirely if start === end, and on iOS
    // EventKit can interpret it as the prior day in non-UTC zones. The
    // canonical pattern: end = start + 1 day.
    const endDate = addDaysLocal(dueDate, 1);

    const calendarId = await getRoledeckCalendar();
    const eventIds   = await getEventIds();

    const eventDetails = {
      title:      `${customer.name || 'Customer'} — Service Due`,
      startDate:  dueDate,
      endDate,
      allDay:     true,
      calendarId,
      notes:      buildEventNotes(customer),
      alarms:     [{ relativeOffset: -1440 }], // 1 day before
    };

    const existingId = eventIds[customer.id];
    if (existingId) {
      try {
        await Calendar.updateEventAsync(existingId, eventDetails);
      } catch {
        // Event was deleted externally — create a new one
        const newId = await Calendar.createEventAsync(calendarId, eventDetails);
        eventIds[customer.id] = newId;
        await saveEventIds(eventIds);
      }
    } else {
      const eventId = await Calendar.createEventAsync(calendarId, eventDetails);
      eventIds[customer.id] = eventId;
      await saveEventIds(eventIds);
    }
    if (writeStatus) await setSyncStatus('ok');
  } catch (err) {
    if (writeStatus) await setSyncStatus('error', err?.message || 'Calendar sync failed.');
    else throw err; // surface to the batch caller
  }
}

/**
 * Sync all active customers' due dates. Used on initial enable and
 * available for manual re-sync in Settings.
 */
export async function syncAllCustomers() {
  try {
    const enabled = await getCalendarSyncEnabled();
    if (!enabled) return;

    const granted = await requestCalendarPermission();
    if (!granted) {
      await setSyncStatus('permission-denied', 'Calendar access was revoked.');
      return;
    }

    const all = await getAllCustomers();
    const active = all.filter((c) => !c.archived);

    let firstFailure = null;
    for (const customer of active) {
      try {
        // writeStatus:false so per-customer success/failure does not clobber
        // a mid-loop failure with the next customer's "ok"
        await syncCustomerDueDate(customer, { writeStatus: false });
      } catch (err) {
        if (!firstFailure) firstFailure = err;
      }
    }
    if (firstFailure) {
      await setSyncStatus('error', firstFailure?.message || 'Calendar sync failed for some customers.');
    } else {
      await setSyncStatus('ok');
    }
  } catch (err) {
    await setSyncStatus('error', err?.message || 'Calendar sync failed.');
  }
}

/**
 * Sync calendar events for every scheduled service across all active customers.
 * Intended for initial enable and manual re-sync; fire-and-forget safe.
 */
export async function syncAllScheduledServices() {
  try {
    const enabled = await getCalendarSyncEnabled();
    if (!enabled) return;

    const granted = await requestCalendarPermission();
    if (!granted) {
      await setSyncStatus('permission-denied', 'Calendar access was revoked.');
      return;
    }

    const all = await getAllCustomers();
    let syncErrorMsg = null;
    for (const customer of all.filter((c) => !c.archived)) {
      for (const entry of (customer.scheduledServices || [])) {
        try {
          // writeStatus: false — suppress per-entry status writes so this
          // function can write one accurate final status for the whole batch
          await syncScheduledService(customer, entry, { writeStatus: false });
        } catch (err) {
          syncErrorMsg = err?.message || 'A scheduled service failed to sync.';
        }
      }
    }
    await setSyncStatus(
      syncErrorMsg ? 'error' : 'ok',
      syncErrorMsg || '',
    );
  } catch (err) {
    await setSyncStatus('error', err?.message || 'Calendar sync failed.');
  }
}

/** Full sync: due-date events for all customers + all scheduled service events. */
export async function syncAll() {
  await syncAllCustomers();
  await syncAllScheduledServices();
}

/**
 * Remove a customer's calendar event. Call when a customer is deleted
 * or archived. Silently no-ops if no event exists for this customer.
 */
export async function removeCustomerEvent(customerId) {
  try {
    const eventIds = await getEventIds();
    const eventId  = eventIds[customerId];
    if (!eventId) return;

    try {
      await Calendar.deleteEventAsync(eventId);
    } catch {
      // Already deleted externally — fine, not a failure mode worth surfacing
    }

    delete eventIds[customerId];
    await saveEventIds(eventIds);
  } catch (err) {
    await setSyncStatus('error', err?.message || 'Failed to remove calendar event.');
  }
}

/**
 * Create or update a calendar event for a user-scheduled service appointment.
 * The event lands on the exact date the user chose, not the computed due date.
 * Call after addScheduledService() returns the saved entry.
 *
 * @param {boolean} [opts.writeStatus=true] - Set false when called from a batch
 *   loop so the caller can own the final status write; errors are re-thrown
 *   instead of being silently swallowed into a per-entry status record.
 */
export async function syncScheduledService(customer, scheduledEntry, { writeStatus = true } = {}) {
  try {
    const enabled = await getCalendarSyncEnabled();
    if (!enabled) return;

    const granted = await requestCalendarPermission();
    if (!granted) {
      if (writeStatus) await setSyncStatus('permission-denied', 'Calendar access was revoked.');
      return;
    }

    const calendarId        = await getRoledeckCalendar();
    const scheduledEventIds = await getScheduledEventIds();
    const schedSettings     = await getScheduleSettings();

    const startDate    = new Date(scheduledEntry.date);
    const durationMins = getAppointmentDuration(scheduledEntry.type || 'service', schedSettings);
    const endDate      = new Date(startDate.getTime() + durationMins * 60000);

    const typeLabel = scheduledEntry.type === 'install' ? 'Install' : 'Service';
    const travelNote = [
      schedSettings.travelBefore > 0 ? `${schedSettings.travelBefore} min travel before` : '',
      schedSettings.travelAfter  > 0 ? `${schedSettings.travelAfter} min travel after`  : '',
    ].filter(Boolean).join(', ');

    const notesParts = [
      `${typeLabel} · ${formatDuration(durationMins)}${travelNote ? ` · ${travelNote}` : ''}`,
      scheduledEntry.notes,
      buildEventNotes(customer),
    ].filter(Boolean);
    const notes = notesParts.join('\n\n');

    const eventDetails = {
      title:     `${customer.name || 'Customer'} — Scheduled ${typeLabel}`,
      startDate,
      endDate,
      allDay:    false,
      calendarId,
      notes,
      alarms:    [{ relativeOffset: -1440 }], // 1 day before
    };

    const existingId = scheduledEventIds[scheduledEntry.id];
    if (existingId) {
      try {
        await Calendar.updateEventAsync(existingId, eventDetails);
      } catch {
        const newId = await Calendar.createEventAsync(calendarId, eventDetails);
        scheduledEventIds[scheduledEntry.id] = newId;
        await saveScheduledEventIds(scheduledEventIds);
      }
    } else {
      const eventId = await Calendar.createEventAsync(calendarId, eventDetails);
      scheduledEventIds[scheduledEntry.id] = eventId;
      await saveScheduledEventIds(scheduledEventIds);
    }
    if (writeStatus) await setSyncStatus('ok');
  } catch (err) {
    if (writeStatus) {
      await setSyncStatus('error', err?.message || 'Calendar sync failed.');
    } else {
      throw err; // re-throw so the batch caller can track failures
    }
  }
}

/**
 * Remove the calendar event for a scheduled service. Call when the user
 * cancels a scheduled service. Silently no-ops if no event exists.
 */
export async function removeScheduledServiceEvent(entryId) {
  try {
    const scheduledEventIds = await getScheduledEventIds();
    const eventId           = scheduledEventIds[entryId];
    if (!eventId) return;

    try {
      await Calendar.deleteEventAsync(eventId);
    } catch {
      // Already deleted externally — fine
    }

    delete scheduledEventIds[entryId];
    await saveScheduledEventIds(scheduledEventIds);
  } catch (err) {
    await setSyncStatus('error', err?.message || 'Failed to remove scheduled calendar event.');
  }
}
