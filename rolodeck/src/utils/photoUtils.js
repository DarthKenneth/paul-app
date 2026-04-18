// =============================================================================
// photoUtils.js - Helpers for persisting local service-note photo files
// Version: 1.0
// Last Updated: 2026-04-17
//
// PROJECT:      Rolodeck (project v0.24.0)
// FILES:        photoUtils.js        (this file)
//               AddServiceModal.js   (calls savePhotoLocally)
//               AddServiceScreen.js  (calls savePhotoLocally)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - expo-image-picker returns temporary URIs that may not survive app
//     restarts; copyAsync into documentDirectory makes them permanent
//   - All photos land under documentDirectory/service-photos/
//
// CHANGE LOG:
// v1.0  2026-04-17  Claude  Initial implementation
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
