// =============================================================================
// backup.js - Cloud backup and restore for customer data
// Version: 1.5
// Last Updated: 2026-04-28
//
// PROJECT:      Rolodeck (project v1.5)
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
//   - autoBackup() runs silently once per 24h (called from App.js on mount);
//     writes to documentDirectory so iOS iCloud Backup + Android Auto Backup
//     pick it up automatically — no share sheet, no user interaction required
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
// v1.5  2026-04-28  Claude  Hardening + futureproofing pass
//       - exportBackup now checks Sharing.isAvailableAsync BEFORE writing the
//         file (was leaving stranded callcard-backup-YYYY-MM-DD.json in
//         documentDirectory whenever sharing was unavailable)
//       - importBackup now defends against picker shape variance: assets may
//         be undefined / empty even when canceled === false on some expo
//         versions; previously crashed with "Cannot read property uri of
//         undefined" instead of throwing a curated error
//       - importBackup now caps file size at MAX_BACKUP_BYTES (50 MB) to
//         prevent OOM on a malicious / corrupt picker selection
//       - importBackup now refuses any backupVersion newer than the version
//         this build understands — graceful "this backup was created by a
//         newer version of the app" message instead of silent corruption
//       - getLastBackupDate validates the parsed Date and returns null on
//         garbage input (was returning Invalid Date which the SettingsScreen
//         renders as the literal string "Invalid Date")
//       - autoBackup wraps the AsyncStorage timestamp read in a try/catch so
//         a corrupted key doesn't block the auto-backup write entirely
// v1.0  2026-04-04  Claude  Initial implementation
//       - exportBackup(): serializes all customers → JSON file → share sheet
//       - importBackup(): file picker → validate → restoreCustomers()
//       - getLastBackupDate() / saveLastBackupDate() via AsyncStorage
//       - cloudProviderLabel() returns platform-appropriate label for UI
// v1.1  2026-04-10  Claude  APP_VERSION now imported from shared src/appVersion.js
//                            (was hardcoded '1.6' — stale by 10+ versions — which
//                            meant backup files had lying metadata)
// v1.4  2026-04-28  Claude  Switch to 'expo-file-system/legacy' import
//       - The namespace import from 'expo-file-system' (SDK 55) throws at runtime
//         for writeAsStringAsync / readAsStringAsync; the v1.3 EncodingType fix
//         was insufficient — the function calls themselves throw too. The legacy
//         module is a supported drop-in async replacement that exports the same
//         API shape (writeAsStringAsync, readAsStringAsync, documentDirectory).
// v1.3  2026-04-28  Claude  Fix EncodingType crash + add autoBackup
//       - Replaced FileSystem.EncodingType.UTF8 with literal 'utf8' — EncodingType
//         is not exported from the expo-file-system v55 star-import
//       - Added AUTO_BACKUP_INTERVAL_MS (24h), AUTO_BACKUP_KEY, AUTO_BACKUP_FILE
//       - Added autoBackup(): silently writes backup JSON to documentDirectory once
//         per 24h; no share sheet — file is picked up by iOS iCloud Backup and
//         Android Auto Backup automatically [updated ARCHITECTURE]
// v1.2  2026-04-14  Claude  Schema version in export + per-record shape validation
//       - exportBackup() now embeds storageSchemaVersion: CURRENT_SCHEMA_VERSION
//         so restoring code can detect schema mismatches [updated BACKUP FILE FORMAT]
//       - importBackup() filters customers to those with a valid string id before
//         passing to restoreCustomers(); throws if zero valid records remain
//         [updated ARCHITECTURE]
// =============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { getAllCustomers, restoreCustomers, CURRENT_SCHEMA_VERSION } from '../data/storage';
import { APP_VERSION } from '../appVersion';

const BACKUP_VERSION          = '1';
const LAST_BACKUP_KEY         = '@callcard_last_backup';
const AUTO_BACKUP_KEY         = '@callcard_last_auto_backup';
const AUTO_BACKUP_FILE        = 'callcard-auto-backup.json';
const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
// 50 MB. A typical backup is ~1 KB per customer; even 10K customers fits in
// ~10 MB. A larger file is almost certainly the wrong file or a corrupt one,
// and parsing it would risk OOM on the JS thread.
const MAX_BACKUP_BYTES        = 50 * 1024 * 1024;

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
  if (!iso) return null;
  const d = new Date(iso);
  // Guard against a corrupted timestamp — Invalid Date renders as the literal
  // string "Invalid Date" in toLocaleString consumers, which is worse than null.
  return Number.isFinite(d.getTime()) ? d : null;
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
  // Pre-flight: don't write a file we can't actually share. A failed sharing
  // check used to leave the user's documentDirectory littered with backup
  // files they couldn't access.
  const sharingAvailable = await Sharing.isAvailableAsync();
  if (!sharingAvailable) {
    throw new Error('Sharing is not available on this device.');
  }

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
    { encoding: 'utf8' },
  );

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

  // Picker shape varies between expo versions: assets may be undefined / empty
  // even when canceled === false. Don't blindly index — surface a real error.
  const asset   = Array.isArray(result.assets) ? result.assets[0] : null;
  const fileUri = asset && typeof asset.uri === 'string' ? asset.uri : null;
  if (!fileUri) {
    throw new Error('Could not read the selected file.');
  }

  // Cap the file size before we even read it — a 500 MB file would parse-OOM.
  // getInfoAsync is cheap and lets us surface a precise error.
  try {
    const info = await FileSystem.getInfoAsync(fileUri, { size: true });
    if (info && typeof info.size === 'number' && info.size > MAX_BACKUP_BYTES) {
      throw new Error('Backup file is too large to import (over 50 MB).');
    }
  } catch (err) {
    // If getInfoAsync isn't available or fails, fall through to the read path
    // — readAsStringAsync will throw on its own with a sensible error. But
    // if we DID get a "too large" error above, propagate it.
    if (err && /too large/i.test(err.message || '')) throw err;
  }

  let raw;
  try {
    raw = await FileSystem.readAsStringAsync(fileUri, {
      encoding: 'utf8',
    });
  } catch {
    throw new Error('Could not read the selected file.');
  }

  // Belt-and-suspenders against environments where getInfoAsync didn't return
  // a size — string length is a cheap upper bound on byte count for UTF-8.
  if (typeof raw === 'string' && raw.length > MAX_BACKUP_BYTES) {
    throw new Error('Backup file is too large to import (over 50 MB).');
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

  // Refuse a backup envelope newer than this build understands. Compare as
  // integers so '2' > '1' but '10' > '2' too. A missing version is treated
  // as v1 (legacy files predating the envelope check).
  const fileVersion = parseInt(payload.backupVersion, 10);
  const myVersion   = parseInt(BACKUP_VERSION, 10);
  if (Number.isFinite(fileVersion) && fileVersion > myVersion) {
    throw new Error(
      'This backup was created by a newer version of the app. ' +
      'Please update Callcard and try again.',
    );
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

// ── Auto-backup ───────────────────────────────────────────────────────────────

/**
 * Silently write a backup to documentDirectory at most once every 24 hours.
 * Called from App.js on mount — no share sheet, no UI.
 * The file is automatically included in iOS iCloud Backup and Android Auto Backup.
 *
 * @returns {Promise<void>}
 */
export async function autoBackup() {
  // Wrap the read so a corrupt timestamp can't block the auto-backup forever.
  let lastIso = null;
  try { lastIso = await AsyncStorage.getItem(AUTO_BACKUP_KEY); } catch { /* ignore */ }
  if (lastIso) {
    const t = new Date(lastIso).getTime();
    if (Number.isFinite(t)) {
      const elapsed = Date.now() - t;
      // Guard against a clock that jumped backwards (DST glitch, NTP correction):
      // negative elapsed means "the last backup is in the future," which would
      // suppress backups indefinitely. Treat that as eligible-now.
      if (elapsed >= 0 && elapsed < AUTO_BACKUP_INTERVAL_MS) return;
    }
  }

  const customers = await getAllCustomers();
  if (!customers.length) return;

  const payload = {
    backupVersion:        BACKUP_VERSION,
    storageSchemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion:           APP_VERSION,
    exportedAt:           new Date().toISOString(),
    platform:             Platform.OS,
    customers,
  };

  const fileUri = FileSystem.documentDirectory + AUTO_BACKUP_FILE;
  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(payload), { encoding: 'utf8' });
  await AsyncStorage.setItem(AUTO_BACKUP_KEY, new Date().toISOString());
}
