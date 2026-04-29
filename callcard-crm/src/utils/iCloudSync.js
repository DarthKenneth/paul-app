// =============================================================================
// iCloudSync.js - iOS iCloud Drive sync via ubiquity container
// Version: 1.0.1
// Last Updated: 2026-04-29
//
// PROJECT:      Rolodeck (project v1.5.3)
// FILES:        iCloudSync.js      (this file — iOS cloud sync)
//               googleDriveSync.js (Android cloud sync)
//               cloudSync.js       (unified entry point)
//
// ARCHITECTURE:
//   - All writes go to the iCloud ubiquity container (not documentDirectory).
//     The OS syncs this folder across all devices signed into the same iCloud
//     account, completely transparently to the user.
//   - Returns null / throws gracefully when iCloud is not available (simulator,
//     user not signed in to iCloud, or entitlement missing from build).
//   - No UI required on iOS — iCloud sign-in is system-level.
//
// DATA FILE:  callcard-data.json in the container's Documents/ folder.
//   Shape: { customers: Customer[], syncedAt: ISO-string, schemaVersion: number }
//
// CHANGE LOG:
// v1.0.1  2026-04-29  Claude  Fix expo-file-system import path for SDK 55
//                             (bare 'expo-file-system' throws at runtime; must use '/legacy' suffix)
// v1.0  2026-04-29  Claude  Initial iCloud Drive sync implementation
// =============================================================================

import * as FileSystem from 'expo-file-system/legacy';
import { getContainerPath, isAvailable } from '../../modules/icloud-container';

const FILE_NAME = 'callcard-data.json';

export { isAvailable as isICloudAvailable };

export async function uploadToICloud(payload) {
  const dir = await getContainerPath();
  if (!dir) throw new Error('iCloud not available');
  const path = `${dir}/${FILE_NAME}`;
  await FileSystem.writeAsStringAsync(path, JSON.stringify(payload), {
    encoding: FileSystem.EncodingType.UTF8,
  });
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
  return JSON.parse(raw);
}

export async function getCloudTimestamp() {
  try {
    const data = await downloadFromICloud();
    return data?.syncedAt ?? null;
  } catch {
    return null;
  }
}
