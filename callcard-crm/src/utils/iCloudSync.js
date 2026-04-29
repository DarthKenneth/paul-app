// =============================================================================
// iCloudSync.js - iOS iCloud Drive sync via ubiquity container
// Version: 1.1
// Last Updated: 2026-04-29
//
// PROJECT:      Callcard CRM (project v2.0.0)
// FILES:        iCloudSync.js      (this file — iOS cloud sync)
//               googleDriveSync.js (Android cloud sync)
//               cloudSync.js       (unified entry point)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - All writes go to the iCloud ubiquity container (not documentDirectory).
//     The OS syncs this folder across all devices signed into the same iCloud
//     account, transparently to the user.
//   - Atomic writes: data is written to a sibling .tmp file first, then moved
//     into place. This prevents a half-written JSON from being picked up by
//     another device mid-write.
//   - Returns null / throws gracefully when iCloud is not available (simulator,
//     user not signed in to iCloud, or entitlement missing from build).
//
// DATA FILE:  callcard-data.json in the container's Documents/ folder.
//   Shape: { customers: Customer[], syncedAt: ISO-string, schemaVersion: number }
//
// CHANGE LOG:
// v1.1   2026-04-29  Claude  Hardening (project v2.0.0)
//        - Atomic writes via .tmp + moveAsync (was direct overwrite, vulnerable
//          to half-written reads from another device mid-sync)
//        - JSON.parse wrapped in try/catch so a corrupt cloud file is reported
//          as "no data" instead of crashing syncDown
// v1.0.1 2026-04-29  Claude  Fix expo-file-system import path for SDK 55
// v1.0   2026-04-29  Claude  Initial iCloud Drive sync implementation
// =============================================================================

import * as FileSystem from 'expo-file-system/legacy';
import { getContainerPath, isAvailable } from '../../modules/icloud-container';

const FILE_NAME = 'callcard-data.json';
const TMP_NAME  = 'callcard-data.json.tmp';

export { isAvailable as isICloudAvailable };

export async function uploadToICloud(payload) {
  const dir = await getContainerPath();
  if (!dir) throw new Error('iCloud not available');
  const finalPath = `${dir}/${FILE_NAME}`;
  const tmpPath   = `${dir}/${TMP_NAME}`;

  // Write to .tmp, then atomically replace the final file. moveAsync deletes
  // the destination if it exists so a stale .tmp from a crashed prior write
  // is also handled cleanly (we always wrote it fresh above).
  await FileSystem.writeAsStringAsync(tmpPath, JSON.stringify(payload), {
    encoding: FileSystem.EncodingType.UTF8,
  });
  try {
    // Best-effort: remove a stale destination first so moveAsync doesn't
    // fail on filesystems that won't overwrite.
    await FileSystem.deleteAsync(finalPath, { idempotent: true });
  } catch { /* no-op */ }
  await FileSystem.moveAsync({ from: tmpPath, to: finalPath });
}

export async function downloadFromICloud() {
  const dir = await getContainerPath();
  if (!dir) return null;
  const path = `${dir}/${FILE_NAME}`;
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return null;
  const raw = await FileSystem.readAsStringAsync(path, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  try {
    return JSON.parse(raw);
  } catch {
    // Corrupt file (truncated upload, partial sync). Treat as no data; the
    // next syncUp will rewrite atomically.
    return null;
  }
}

export async function getCloudTimestamp() {
  try {
    const data = await downloadFromICloud();
    return data?.syncedAt ?? null;
  } catch {
    return null;
  }
}
