// =============================================================================
// icloud-container/index.js - JS interface for the IcloudContainer native module
// Version: 1.0
// Last Updated: 2026-04-29
//
// PROJECT:      Rolodeck (project v1.5.3)
//
// ARCHITECTURE:
//   - requireNativeModule returns null on Android / Expo Go (no native module)
//   - getContainerPath() returns the iCloud Documents folder path, or null if
//     iCloud is not signed in / not available (simulator, no entitlement)
//   - isAvailable() is synchronous; safe to call before prompting the user
//
// CHANGE LOG:
// v1.0  2026-04-29  Claude  Initial JS interface
// =============================================================================

import { requireNativeModule } from 'expo-modules-core';

let _native = null;
try {
  _native = requireNativeModule('IcloudContainer');
} catch {
  // Android or Expo Go — module not present, all functions return safe defaults
}

export async function getContainerPath() {
  if (!_native) return null;
  try {
    return await _native.getContainerPath();
  } catch {
    return null;
  }
}

export function isAvailable() {
  if (!_native) return false;
  try {
    return _native.isAvailable();
  } catch {
    return false;
  }
}
