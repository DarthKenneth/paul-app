// =============================================================================
// calendarSync.js - One-way push of service due dates to the device calendar
// Version: 1.2
// Last Updated: 2026-04-09
//
// PROJECT:      Rolodeck (project v1.14)
// FILES:        calendarSync.js         (this file — calendar sync engine)
//               storage.js              (getAllCustomers, getCustomerById,
//                                        getServiceIntervalMode,
//                                        getServiceIntervalCustomDays,
//                                        modeToIntervalDays)
//               serviceAlerts.js        (getLastServiceDate,
//                                        getEffectiveIntervalForCustomer)
//               AddServiceScreen.js     (calls syncCustomerDueDate after save)
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
//       persisted to AsyncStorage (@rolodeck_calendar_id)
//       iOS:     inherits the default calendar source (usually iCloud),
//                so events auto-sync to iCloud Calendar
//                accessLevel: Calendar.CalendarAccessLevel.OWNER (iOS-only)
//       Android: scans existing calendars for a Google account source
//                (type 'com.google') so events sync to Google Calendar;
//                falls back to any writable source if no Google account found;
//                ownerAccount set to the source account's email
//   - Event IDs persisted to @rolodeck_calendar_event_ids (JSON map of
//     customerId → eventId) so events are upserted, not duplicated
//   - Event content:
//       Title: "{customer name} — Service Due"
//       All-day event on the computed due date (last service + 365 days)
//       Notes: address, phone, email
//       Alarm: 1 day before (where platform supports it)
//   - Customers with no service log entries are skipped (no pinnable due date)
//   - Archived customers are excluded from syncAllCustomers
//   - disableCalendarSync only persists the preference — it does NOT delete
//     existing calendar events (non-destructive)
//   - Permission is re-checked on every sync call; if denied, sync silently
//     no-ops rather than crashing
//
// CHANGE LOG:
// v1.0  2026-04-06  Claude  Initial scaffold
//       - requestCalendarPermission, getRoledeckCalendar
//       - getCalendarSyncEnabled, enableCalendarSync, disableCalendarSync
//       - syncCustomerDueDate (upsert single customer event)
//       - syncAllCustomers (full sync for initial enable or manual re-sync)
//       - removeCustomerEvent (for future archive/delete integration)
//       - buildEventNotes (formats customer contact info for event body)
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
import {
  getAllCustomers,
  getServiceIntervalMode,
  getServiceIntervalCustomDays,
  modeToIntervalDays,
} from '../data/storage';
import { getLastServiceDate, getEffectiveIntervalForCustomer } from './serviceAlerts';

const SYNC_ENABLED_KEY = '@rolodeck_calendar_sync_enabled';
const CALENDAR_ID_KEY  = '@rolodeck_calendar_id';
const EVENT_IDS_KEY    = '@rolodeck_calendar_event_ids';

const CALENDAR_COLOR = '#4AACA5'; // Rolodeck teal
const MS_PER_DAY     = 1000 * 60 * 60 * 24;

// ── Permission ────────────────────────────────────────────────────────────────

/** Request calendar read/write permission. Returns true if granted. */
export async function requestCalendarPermission() {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
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
  if (!granted) return false;
  await AsyncStorage.setItem(SYNC_ENABLED_KEY, 'true');
  await syncAllCustomers();
  return true;
}

/** Disable calendar sync. Does NOT delete existing calendar events. */
export async function disableCalendarSync() {
  await AsyncStorage.setItem(SYNC_ENABLED_KEY, 'false');
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
    title:        'Rolodeck',
    color:        CALENDAR_COLOR,
    entityType:   Calendar.EntityTypes.EVENT,
    sourceId:     source.id,
    source,
    name:         'rolodeck',
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
  return raw ? JSON.parse(raw) : {};
}

async function saveEventIds(map) {
  await AsyncStorage.setItem(EVENT_IDS_KEY, JSON.stringify(map));
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
 */
export async function syncCustomerDueDate(customer) {
  try {
    const enabled = await getCalendarSyncEnabled();
    if (!enabled) return;

    const granted = await requestCalendarPermission();
    if (!granted) return;

    const lastService = getLastServiceDate(customer);
    if (!lastService) return; // no service on record — nothing to pin

    const [mode, customDays] = await Promise.all([
      getServiceIntervalMode(),
      getServiceIntervalCustomDays(),
    ]);
    const globalDays  = modeToIntervalDays(mode, customDays);
    const effectiveDays = getEffectiveIntervalForCustomer(customer, globalDays);
    const dueDate = new Date(lastService.getTime() + effectiveDays * MS_PER_DAY);

    const calendarId = await getRoledeckCalendar();
    const eventIds   = await getEventIds();

    const eventDetails = {
      title:      `${customer.name || 'Customer'} — Service Due`,
      startDate:  dueDate,
      endDate:    dueDate,
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
  } catch {
    // Calendar sync is non-critical — swallow all errors
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
    if (!granted) return;

    const all = await getAllCustomers();
    const active = all.filter((c) => !c.archived);

    for (const customer of active) {
      await syncCustomerDueDate(customer);
    }
  } catch {
    // Swallow — sync is non-critical
  }
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
      // Already deleted externally — fine
    }

    delete eventIds[customerId];
    await saveEventIds(eventIds);
  } catch {
    // Swallow
  }
}
