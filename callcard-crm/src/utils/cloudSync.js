// =============================================================================
// cloudSync.js - Unified cloud sync: iCloud (iOS) / Google Drive (Android)
// Version: 1.0.1
// Last Updated: 2026-04-29
//
// PROJECT:      Rolodeck (project v1.5.3)
// FILES:        cloudSync.js       (this file — unified entry point)
//               iCloudSync.js      (iOS iCloud Drive implementation)
//               googleDriveSync.js (Android Google Drive implementation)
//               storage.js         (getAllCustomers, restoreCustomers)
//
// ARCHITECTURE:
//   - syncDown(): on app launch, pull cloud data if it is newer than local.
//     Conflict resolution: whichever side has the later syncedAt wins.
//   - syncUp(): after any data change (debounced), push local data to cloud.
//   - Both are fire-and-forget at call sites; errors are caught and reported.
//   - SYNC_KEY in AsyncStorage tracks the last successful local sync timestamp
//     so we can compare without reading the cloud file every time.
//   - Platform.OS drives which backend is used; the caller never needs to know.
//
// CHANGE LOG:
// v1.0.1  2026-04-29  Claude  Removed dead-code backend probe call in syncDown() that
//                             fired before the proper platform-branched re-download
// v1.0  2026-04-29  Claude  Initial unified cloud sync layer
// =============================================================================

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAllCustomers, restoreCustomers } from '../data/storage';
import * as ICloud from './iCloudSync';
import * as GDrive from './googleDriveSync';

const SYNC_KEY = '@callcard_cloud_synced_at';
const SCHEMA_VERSION = 1;

// ── Internal helpers ──────────────────────────────────────────────────────────

function getBackend() {
  return Platform.OS === 'ios' ? ICloud : GDrive;
}

async function buildPayload() {
  const customers = await getAllCustomers();
  return {
    customers,
    syncedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
  };
}

async function getLocalTimestamp() {
  try {
    return await AsyncStorage.getItem(SYNC_KEY);
  } catch {
    return null;
  }
}

async function setLocalTimestamp(ts) {
  try {
    await AsyncStorage.setItem(SYNC_KEY, ts);
  } catch {
    // non-fatal
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Pull cloud data down if it is newer than what we have locally.
 * Returns 'pulled' | 'skipped' | 'unavailable' | 'error'.
 */
export async function syncDown() {
  try {
    const backend = getBackend();

    // Quick availability check (sync / no-iCloud-signed-in guard)
    if (Platform.OS === 'ios' && !ICloud.isICloudAvailable()) return 'unavailable';
    if (Platform.OS === 'android' && !(await GDrive.isSignedIn())) return 'unavailable';

    const raw =
      Platform.OS === 'ios'
        ? await ICloud.downloadFromICloud()
        : await GDrive.downloadFromGoogleDrive();

    if (!raw?.customers) return 'skipped';

    const localTs = await getLocalTimestamp();
    const cloudTs = raw.syncedAt ?? null;

    // Cloud wins only if it's strictly newer
    if (!localTs || (cloudTs && cloudTs > localTs)) {
      await restoreCustomers(raw.customers);
      await setLocalTimestamp(cloudTs ?? new Date().toISOString());
      return 'pulled';
    }
    return 'skipped';
  } catch (err) {
    return 'error';
  }
}

/**
 * Push local data up to cloud. Call after any mutation, debounced by the caller.
 * Returns 'pushed' | 'unavailable' | 'error'.
 */
export async function syncUp() {
  try {
    if (Platform.OS === 'ios' && !ICloud.isICloudAvailable()) return 'unavailable';
    if (Platform.OS === 'android' && !(await GDrive.isSignedIn())) return 'unavailable';

    const payload = await buildPayload();

    if (Platform.OS === 'ios') {
      await ICloud.uploadToICloud(payload);
    } else {
      await GDrive.uploadToGoogleDrive(payload);
    }

    await setLocalTimestamp(payload.syncedAt);
    return 'pushed';
  } catch {
    return 'error';
  }
}

/** Convenience: run down then up (full sync). Used on app foreground. */
export async function syncFull() {
  const down = await syncDown();
  if (down === 'error') return 'error';
  return syncUp();
}

/** True if cloud sync is configured and ready to use on this device. */
export async function isCloudSyncAvailable() {
  if (Platform.OS === 'ios') return ICloud.isICloudAvailable();
  return GDrive.isSignedIn();
}

// Re-export sign-in helpers so callers import from one place
export { signInWithGoogle, clearTokens as signOutGoogleDrive } from './googleDriveSync';
