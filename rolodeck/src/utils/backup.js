// =============================================================================
// backup.js - Cloud backup and restore for customer data
// Version: 1.0
// Last Updated: 2026-04-04
//
// PROJECT:      Rolodeck (project v1.6)
// FILES:        backup.js             (this file — export/import logic)
//               storage.js            (getAllCustomers, restoreCustomers)
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
//
// BACKUP FILE FORMAT:
//   {
//     "backupVersion": "1",      schema version for future migrations
//     "appVersion":    "1.6",    app version that created the backup
//     "exportedAt":    ISO-8601, timestamp
//     "platform":      "ios" | "android",
//     "customers":     Customer[]
//   }
//
// CHANGE LOG:
// v1.0  2026-04-04  Claude  Initial implementation
//       - exportBackup(): serializes all customers → JSON file → share sheet
//       - importBackup(): file picker → validate → restoreCustomers()
//       - getLastBackupDate() / saveLastBackupDate() via AsyncStorage
//       - cloudProviderLabel() returns platform-appropriate label for UI
// =============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { getAllCustomers, restoreCustomers } from '../data/storage';

const BACKUP_VERSION   = '1';
const APP_VERSION      = '1.6';
const LAST_BACKUP_KEY  = '@rolodeck_last_backup';

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
    backupVersion: BACKUP_VERSION,
    appVersion:    APP_VERSION,
    exportedAt:    new Date().toISOString(),
    platform:      Platform.OS,
    customers,
  };

  const dateStr  = new Date().toISOString().split('T')[0];
  const filename = `rolodeck-backup-${dateStr}.json`;
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
    dialogTitle: 'Save Rolodeck Backup',
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

  await restoreCustomers(payload.customers);

  return {
    exportedAt:    payload.exportedAt  || null,
    customerCount: payload.customers.length,
  };
}
