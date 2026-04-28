// =============================================================================
// backup.js - Cloud backup and restore for customer data
// Version: 1.2
// Last Updated: 2026-04-14
//
// PROJECT:      Rolodeck (project v0.22)
// FILES:        backup.js             (this file — export/import logic)
//               appVersion.js         (APP_VERSION — written into backup metadata)
//               storage.js            (getAllCustomers, restoreCustomers,
//                                      CURRENT_SCHEMA_VERSION)
//               SettingsScreen.js     (Back Up / Restore buttons)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Platform-specific cloud storage via the OS share sheet:
//       iOS:     expo-sharing → native share sheet → "Save to Files" (iCloud Drive)
//       Android: expo-sharing → native share sheet → Google Drive / local Files
//   - Restore via expo-document-picker: opens OS file picker, supports iCloud
//     Drive (iOS) and Google Drive / local storage (Android)
//   - Backup format: JSON with version envelope so future migrations are possible
//   - Automatic iCloud note: iOS files written to documentDirectory are also
//     included in device iCloud Backup automatically (if the user has it enabled)
//     — the explicit export is an additional on-demand safety option
//   - No third-party cloud accounts or API keys required
//   - importBackup() validates individual customer shapes and filters out any
//     entries that are missing a valid id, so a corrupted record in one backup
//     cannot block a full restore
//
// BACKUP FILE FORMAT:
//   {
//     "backupVersion":     "1",     schema version for future migrations
//     "storageSchemaVersion": N,    storage.js CURRENT_SCHEMA_VERSION at export time
//     "appVersion":        "0.22",  app version that created the backup
//     "exportedAt":        ISO-8601,
//     "platform":          "ios" | "android",
//     "customers":         Customer[]
//   }
//
// CHANGE LOG:
// v1.0  2026-04-04  Claude  Initial implementation
//       - exportBackup(): serializes all customers → JSON file → share sheet
//       - importBackup(): file picker → validate → restoreCustomers()
//       - getLastBackupDate() / saveLastBackupDate() via AsyncStorage
//       - cloudProviderLabel() returns platform-appropriate label for UI
// v1.1  2026-04-10  Claude  APP_VERSION now imported from shared src/appVersion.js
//                            (was hardcoded '1.6' — stale by 10+ versions — which
//                            meant backup files had lying metadata)
// v1.2  2026-04-14  Claude  Schema version in export + per-record shape validation
//       - exportBackup() now embeds storageSchemaVersion: CURRENT_SCHEMA_VERSION
//         so restoring code can detect schema mismatches [updated BACKUP FILE FORMAT]
//       - importBackup() filters customers to those with a valid string id before
//         passing to restoreCustomers(); throws if zero valid records remain
//         [updated ARCHITECTURE]
// =============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { getAllCustomers, restoreCustomers, CURRENT_SCHEMA_VERSION } from '../data/storage';
import { APP_VERSION } from '../appVersion';

const BACKUP_VERSION   = '1';
const LAST_BACKUP_KEY  = '@callcard_last_backup';

// ── Cloud provider label ──────────────────────────────────────────────────────

/**
 * Returns the platform-appropriate cloud storage label for UI copy.
 * iOS → "iCloud Drive"  |  Android → "Google Drive"
 */
export function cloudProviderLabel() {
  return Platform.OS === 'ios' ? 'iCloud Drive' : 'Google Drive';
}

// ── Last backup tracking ──────────────────────────────────────────────────────

export async function getLastBackupDate() {
  const iso = await AsyncStorage.getItem(LAST_BACKUP_KEY);
  return iso ? new Date(iso) : null;
}

async function saveLastBackupDate() {
  await AsyncStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
}

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * Serialize all customer data to a JSON file and open the OS share sheet.
 *
 * iOS:     share sheet includes "Save to Files" → iCloud Drive
 * Android: share sheet includes Google Drive, local storage, etc.
 *
 * @returns {Promise<void>}
 * @throws  if sharing is unavailable or the write fails
 */
export async function exportBackup() {
  const customers = await getAllCustomers();

  const payload = {
    backupVersion:        BACKUP_VERSION,
    storageSchemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion:           APP_VERSION,
    exportedAt:           new Date().toISOString(),
    platform:             Platform.OS,
    customers,
  };

  const dateStr  = new Date().toISOString().split('T')[0];
  const filename = `callcard-backup-${dateStr}.json`;
  const fileUri  = FileSystem.documentDirectory + filename;

  await FileSystem.writeAsStringAsync(
    fileUri,
    JSON.stringify(payload, null, 2),
    { encoding: FileSystem.EncodingType.UTF8 },
  );

  const sharingAvailable = await Sharing.isAvailableAsync();
  if (!sharingAvailable) {
    throw new Error('Sharing is not available on this device.');
  }

  await Sharing.shareAsync(fileUri, {
    mimeType:    'application/json',
    dialogTitle: 'Save Callcard Backup',
    UTI:         'public.json', // iOS uniform type identifier
  });

  await saveLastBackupDate();
}

// ── Import ────────────────────────────────────────────────────────────────────

/**
 * Open the OS file picker, validate the selected backup file, and restore
 * all customers from it. Returns the backup metadata on success.
 *
 * iOS:     picker can browse iCloud Drive, local Files
 * Android: picker can browse Google Drive, local storage
 *
 * @returns {Promise<{exportedAt: string, customerCount: number} | null>}
 *   null if the user cancelled
 * @throws  if the file is invalid or restore fails
 */
export async function importBackup() {
  const result = await DocumentPicker.getDocumentAsync({
    type:                 ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
    multiple:             false,
  });

  if (result.canceled) return null;

  const fileUri = result.assets[0].uri;

  let raw;
  try {
    raw = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch {
    throw new Error('Could not read the selected file.');
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error('Invalid backup file — could not parse JSON.');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid backup file — unexpected format.');
  }
  if (!Array.isArray(payload.customers)) {
    throw new Error('Invalid backup file — missing customer data.');
  }
  if (payload.customers.length === 0) {
    throw new Error('Backup file contains no customers.');
  }

  // Filter out any records missing a valid id — a corrupt record shouldn't
  // block restoring the rest of the backup.
  const validCustomers = payload.customers.filter(
    (c) => c && typeof c === 'object' && typeof c.id === 'string' && c.id.length > 0,
  );
  if (validCustomers.length === 0) {
    throw new Error('Backup file contains no valid customer records (all entries are missing ids).');
  }

  await restoreCustomers(validCustomers);

  return {
    exportedAt:    payload.exportedAt  || null,
    customerCount: validCustomers.length,
  };
}
