// =============================================================================
// photoUtils.js - Helpers for persisting local service-note photo files
// Version: 1.1
// Last Updated: 2026-04-24
//
// PROJECT:      Rolodeck (project v0.28.4)
// FILES:        photoUtils.js        (this file)
//               AddServiceModal.js   (calls savePhotoLocally)
//               AddServiceScreen.js  (calls savePhotoLocally)
//               EditServiceModal.js  (calls deletePhotosFromDisk on remove/delete)
//               CustomerDetailScreen.js (calls deletePhotosFromDisk on customer delete)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - expo-image-picker returns temporary URIs that may not survive app
//     restarts; copyAsync into documentDirectory makes them permanent
//   - All photos land under documentDirectory/service-photos/
//   - Cleanup is best-effort: deletePhotosFromDisk swallows per-file errors so
//     one missing file never blocks cleanup of the rest
//
// CHANGE LOG:
// v1.0    2026-04-17  Claude  Initial implementation
// v1.1    2026-04-24  Claude  Added deletePhotosFromDisk for orphan cleanup
// =============================================================================

import * as FileSystem from 'expo-file-system';

const PHOTO_DIR = FileSystem.documentDirectory + 'service-photos/';

export async function savePhotoLocally(uri) {
  const dirInfo = await FileSystem.getInfoAsync(PHOTO_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true });
  }
  const raw = uri.split('?')[0];
  const ext = raw.includes('.') ? raw.split('.').pop().slice(0, 5) : 'jpg';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const dest = PHOTO_DIR + filename;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

export async function deletePhotosFromDisk(uris) {
  if (!Array.isArray(uris) || uris.length === 0) return;
  await Promise.all(
    uris.map(async (uri) => {
      if (!uri || typeof uri !== 'string') return;
      // Only touch files we put under our own photo dir
      if (!uri.startsWith(PHOTO_DIR)) return;
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch {
        // Best-effort — ignore per-file errors
      }
    }),
  );
}
