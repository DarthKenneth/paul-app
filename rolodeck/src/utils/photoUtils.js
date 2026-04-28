// =============================================================================
// photoUtils.js - Helpers for persisting local service-note photo files
// Version: 1.3
// Last Updated: 2026-04-28
//
// PROJECT:      Rolodeck (project v1.5)
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
// v1.2    2026-04-28  Claude  Fix runtime crash on SDK 55 — switch import to
//                              'expo-file-system/legacy'. The namespace import
//                              from 'expo-file-system' now throws on every
//                              legacy method call (getInfoAsync, makeDirectoryAsync,
//                              copyAsync, deleteAsync). All photo save/delete
//                              flows were broken in production until this fix.
// v1.3    2026-04-28  Claude  Hardening + perf — savePhotoLocally
//       - null/undefined uri (was crashing on uri.split — image-picker can
//         return a result with no usable assets if the user backgrounds the
//         picker mid-selection)
//       - paths with a "." in a directory name (e.g. /Users/some.user/photo)
//         where the previous extension-extraction split on "." across the
//         whole URI and could yield a filename containing "/", which would
//         escape PHOTO_DIR. Extension extraction now operates on the basename
//         (segment after the last "/") and rejects anything with non-alphanum.
//       - module-level ensurePhotoDir() caches the dir-creation roundtrip so
//         bulk photo adds skip getInfoAsync after the first save
// =============================================================================

import * as FileSystem from 'expo-file-system/legacy';

const PHOTO_DIR = FileSystem.documentDirectory + 'service-photos/';

// One-shot ensure: directory creation is idempotent with intermediates:true,
// but skipping the round-trip after the first save is a measurable win when
// users add several photos in quick succession.
let _photoDirEnsured = null;
function ensurePhotoDir() {
  if (_photoDirEnsured) return _photoDirEnsured;
  _photoDirEnsured = (async () => {
    const info = await FileSystem.getInfoAsync(PHOTO_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true });
    }
  })().catch((err) => {
    // Reset so a transient error doesn't permanently mark the dir as ensured.
    _photoDirEnsured = null;
    throw err;
  });
  return _photoDirEnsured;
}

export async function savePhotoLocally(uri) {
  if (typeof uri !== 'string' || uri.length === 0) {
    throw new Error('No photo to save (empty or invalid URI).');
  }

  await ensurePhotoDir();

  // Extract extension from the basename only — splitting across the full URI
  // could pick up a "." from a parent directory and produce a filename with
  // a "/" in the extension, which would escape PHOTO_DIR.
  const noQuery   = uri.split('?')[0];
  const basename  = noQuery.substring(noQuery.lastIndexOf('/') + 1);
  const dotIdx    = basename.lastIndexOf('.');
  const rawExt    = dotIdx >= 0 ? basename.slice(dotIdx + 1, dotIdx + 6) : '';
  const ext       = /^[A-Za-z0-9]+$/.test(rawExt) ? rawExt.toLowerCase() : 'jpg';

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const dest     = PHOTO_DIR + filename;
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
