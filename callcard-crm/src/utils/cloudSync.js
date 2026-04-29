// =============================================================================
// cloudSync.js - Unified cloud sync: iCloud (iOS) / Google Drive (Android)
// Version: 2.0
// Last Updated: 2026-04-29
//
// PROJECT:      Callcard CRM (project v2.0.0)
// FILES:        cloudSync.js       (this file — unified entry point)
//               iCloudSync.js      (iOS iCloud Drive implementation)
//               googleDriveSync.js (Android Google Drive implementation)
//               storage.js         (applyCloudMerge, getAllCustomersIncludingDeleted,
//                                   getLastLocalMutation, purgeOldTombstones)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - syncDown(): pull cloud snapshot, merge per-record into local storage.
//     Newer updatedAt wins. Tombstones (deletedAt set) propagate so deletes
//     replicate cross-device. Local-only records are preserved (syncUp pushes
//     them next).
//   - syncUp(): push the full local corpus (including tombstones, archived,
//     and otherwise-hidden records) to the cloud so other devices can merge.
//   - syncFull(): convenience for "down then up." Skips up if down was a no-op
//     and we have nothing newer locally.
//   - Single-flight gate: only one sync op runs at a time. Calls during an
//     in-flight op return that op's promise (de-dup).
//   - Schema version validation: cloud payloads with a higher schemaVersion
//     than this build are refused. Lower-version payloads are upgraded by
//     normalizeCustomer in applyCloudMerge.
//   - DeviceEventEmitter 'cloud-sync-pulled' fires when syncDown actually
//     applies remote changes; mounted screens subscribe to refresh.
//   - LAST_LOCAL_MUTATION is set by every storage write (in storage.js) and
//     is what syncFull uses to decide whether the post-pull syncUp is needed.
//
// CHANGE LOG:
// v2.0  2026-04-29  Claude  Major rewrite — per-record merge replaces blob-replace
//       - Switched from restoreCustomers (full-replace) to applyCloudMerge (per-record)
//       - Schema version envelope validated; future-version cloud payloads refused
//       - Single-flight gate prevents racing syncDown/syncUp from corrupting state
//       - Numeric timestamp comparison (Date.parse) replaces lexicographic ISO compare
//       - LAST_LOCAL_MUTATION tracked separately from LAST_SUCCESSFUL_SYNC; offline
//         edits no longer get clobbered by a syncDown after another device pushed
//       - Pushes include tombstones + archived so deletes propagate cross-device
//       - DeviceEventEmitter 'cloud-sync-pulled' notifies screens to reload
//       - Tombstone GC after every successful round (purgeOldTombstones)
//       - Removed dead getBackend() helper that v1.0.1 only half-cleaned-up
// v1.0.1  2026-04-29  Claude  Removed dead-code backend probe call in syncDown()
// v1.0    2026-04-29  Claude  Initial unified cloud sync layer
// =============================================================================

import { Platform, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  applyCloudMerge,
  getAllCustomersIncludingDeleted,
  getLastLocalMutation,
  purgeOldTombstones,
  CURRENT_SCHEMA_VERSION,
} from '../data/storage';
import * as ICloud from './iCloudSync';
import * as GDrive from './googleDriveSync';

const LAST_SYNC_KEY = '@callcard_cloud_synced_at';

export const CLOUD_SYNC_PULLED = 'cloud-sync-pulled';

// ── Single-flight gate ────────────────────────────────────────────────────────
// One sync op at a time. Concurrent callers receive the in-flight promise so
// rapid-fire syncUp() calls after multiple mutations dedupe automatically.
let _inflight = null;
function gate(fn) {
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try { return await fn(); }
    finally { _inflight = null; }
  })();
  return _inflight;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function backendAvailable() {
  if (Platform.OS === 'ios') return ICloud.isICloudAvailable();
  return GDrive.isSignedIn();
}

async function downloadSnapshot() {
  return Platform.OS === 'ios'
    ? await ICloud.downloadFromICloud()
    : await GDrive.downloadFromGoogleDrive();
}

async function uploadSnapshot(payload) {
  return Platform.OS === 'ios'
    ? await ICloud.uploadToICloud(payload)
    : await GDrive.uploadToGoogleDrive(payload);
}

async function buildPayload() {
  // Sync pushes the entire local corpus, including tombstones (so deletes
  // propagate) and archived records (so archive state stays in sync).
  const customers = await getAllCustomersIncludingDeleted();
  return {
    customers,
    syncedAt: new Date().toISOString(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

async function getLastSyncTimestamp() {
  try { return await AsyncStorage.getItem(LAST_SYNC_KEY); }
  catch { return null; }
}

async function setLastSyncTimestamp(ts) {
  try { await AsyncStorage.setItem(LAST_SYNC_KEY, ts); }
  catch { /* non-fatal */ }
}

// Compare two ISO timestamps numerically. Lexicographic compare is fragile
// across timezone-suffix variants and fractional-second precision.
function isoNewer(a, b) {
  const ta = a ? Date.parse(a) : 0;
  const tb = b ? Date.parse(b) : 0;
  if (!Number.isFinite(ta)) return false;
  if (!Number.isFinite(tb)) return true;
  return ta > tb;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Pull cloud snapshot and merge per-record.
 * Returns 'pulled' | 'skipped' | 'unavailable' | 'schema-too-new' | 'error'.
 */
export async function syncDown() {
  return gate(async () => {
    try {
      const available = await Promise.resolve(backendAvailable());
      if (!available) return 'unavailable';

      const raw = await downloadSnapshot();
      if (!raw || !Array.isArray(raw.customers)) return 'skipped';

      // Refuse cloud payloads from a newer build than we understand. Re-pulling
      // with a newer build will succeed; in the meantime the local state is
      // safe (we did not apply anything).
      if (Number.isFinite(raw.schemaVersion) && raw.schemaVersion > CURRENT_SCHEMA_VERSION) {
        return 'schema-too-new';
      }

      const result = await applyCloudMerge(raw.customers);
      const cloudTs = raw.syncedAt || new Date().toISOString();
      await setLastSyncTimestamp(cloudTs);

      const changed = result.applied + result.inserted > 0;
      if (changed) {
        DeviceEventEmitter.emit(CLOUD_SYNC_PULLED, result);
      }
      return changed ? 'pulled' : 'skipped';
    } catch {
      return 'error';
    }
  });
}

/**
 * Push the full local corpus to the cloud.
 * Returns 'pushed' | 'unavailable' | 'error'.
 */
export async function syncUp() {
  return gate(async () => {
    try {
      const available = await Promise.resolve(backendAvailable());
      if (!available) return 'unavailable';

      const payload = await buildPayload();
      await uploadSnapshot(payload);
      await setLastSyncTimestamp(payload.syncedAt);

      // Best-effort tombstone GC. Errors are non-fatal — purge will catch up
      // on the next cycle.
      purgeOldTombstones().catch(() => {});

      return 'pushed';
    } catch {
      return 'error';
    }
  });
}

/**
 * syncDown then (only if there's a local change newer than the last successful
 * sync) syncUp. Used on app launch and on foreground transitions.
 */
export async function syncFull() {
  const downResult = await syncDown();
  if (downResult === 'error' || downResult === 'unavailable' || downResult === 'schema-too-new') {
    return downResult;
  }
  // Skip the up-leg if local has nothing newer than what we just synced.
  const lastSync = await getLastSyncTimestamp();
  const lastMutation = await getLastLocalMutation();
  if (lastMutation && isoNewer(lastMutation, lastSync)) {
    return syncUp();
  }
  return downResult;
}

/** True if cloud sync is configured and ready on this device. */
export async function isCloudSyncAvailable() {
  if (Platform.OS === 'ios') return ICloud.isICloudAvailable();
  return GDrive.isSignedIn();
}

/**
 * Sign out of Google Drive on Android. Also clears the local sync timestamp
 * so a subsequent sign-in (potentially to a different Google account) does
 * not get blocked by stale state.
 */
export async function signOutGoogleDrive() {
  await GDrive.clearTokens();
  await AsyncStorage.removeItem(LAST_SYNC_KEY).catch(() => {});
}

// Re-export sign-in helper so callers import from one place
export { signInWithGoogle } from './googleDriveSync';
