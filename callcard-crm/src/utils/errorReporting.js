// =============================================================================
// errorReporting.js - Centralized error capture and user-facing copy
// Version: 1.2
// Last Updated: 2026-04-28
//
// PROJECT:      Rolodeck (project v1.5)
// FILES:        errorReporting.js   (this file)
//               (called from any utility/screen with a catch block)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Three helpers, no other state
//   - reportError(err, context): Sentry.captureException with structured tags
//     so we can group failures by feature area (backup/restore/sync/etc).
//     Wrapped in a try/catch so a Sentry init failure can't itself crash the
//     parent error path. Accepts either flat extras or an explicit `extra: {}`
//     field — both end up under Sentry "extra" without nesting.
//   - friendlyMessage(err, fallback): never returns raw err.message to UI
//     because raw messages leak implementation details ("Cannot read property
//     'UTF8' of undefined" was shown to a user). Maps known network/permission
//     patterns to actionable copy; otherwise returns fallback.
//   - reportAndShow(): convenience wrapper that does both + opens an Alert.
//     Both halves (Sentry capture + Alert) are independently try/caught so a
//     failure in either path can't escape to the caller.
//
// CHANGE LOG:
// v1.0  2026-04-28  Claude  Initial — extracted from scattered Alert/Sentry
//                            patterns to one place after the SDK 55 backup
//                            regression that exposed raw error text to users
// v1.1  2026-04-28  Claude  Hardening pass — multiple defensive fixes
//       - reportError: tolerate null/non-object context (was crashing on
//         explicit null which bypasses the default `context = {}`)
//       - reportError: flatten an explicit `extra:` field instead of nesting
//         it as `extra.extra` in Sentry — matches reportAndShow's semantics
//       - reportError: coerce non-Error inputs to Error so Sentry stack tags
//         stay useful instead of "captured a string"
//       - reportAndShow: wrap Alert.alert in try/catch — the caller contract
//         is "never crashes the caller," and we'd been relying on Alert never
//         throwing, which is true today but not a guarantee
//       - friendlyMessage: tighten the auth regex so a 4-digit number
//         containing 401 (e.g. user IDs) doesn't trigger a session-expired
//         message; require the 401 to be a standalone token
// =============================================================================

import { Alert } from 'react-native';
import * as Sentry from '@sentry/react-native';

/**
 * Report an error to Sentry with structured context. Safe to call from any
 * catch block — never throws, never blocks.
 *
 * @param {unknown} err     The caught error.
 * @param {object}  context Extra metadata. Standard fields:
 *   feature: string  — coarse area, e.g. 'backup', 'restore', 'square-sync'
 *   action:  string  — verb, e.g. 'export', 'import', 'connect'
 *   ...any others    — added to Sentry "extra"
 */
export function reportError(err, context) {
  try {
    // Tolerate null / non-object context. Default-arg syntax only protects
    // against undefined; an explicit `null` would still blow up the rest spread.
    const ctx = (context && typeof context === 'object') ? context : {};
    const { feature, action, extra: explicitExtra, ...rest } = ctx;

    // Flatten an explicit `extra: {}` field into the rest so callers can use
    // either pattern without ending up with `extra.extra` in Sentry.
    const extra = (explicitExtra && typeof explicitExtra === 'object')
      ? { ...rest, ...explicitExtra }
      : rest;

    // Coerce non-Error values so Sentry preserves a useful stack tag instead
    // of "captured a string"/"captured an object".
    const captured = (err instanceof Error)
      ? err
      : new Error(typeof err === 'string' ? err : safeStringify(err));

    Sentry.captureException(captured, {
      tags: {
        ...(feature ? { feature } : {}),
        ...(action  ? { action }  : {}),
      },
      extra,
    });
  } catch {
    // Never let a Sentry failure mask the original error path
  }
}

function safeStringify(value) {
  try { return JSON.stringify(value) ?? String(value); }
  catch { return '[unserializable error value]'; }
}

/**
 * Map a caught error to user-safe copy. Returns the fallback for unknown
 * shapes — never returns the raw err.message, which leaks internals.
 *
 * @param {unknown} err
 * @param {string}  fallback Default copy if no specific match.
 * @returns {string}
 */
export function friendlyMessage(err, fallback) {
  const raw = (err && typeof err.message === 'string') ? err.message : '';

  // Network / connectivity. Includes iOS NSURLError variants that the base
  // pattern misses ("internet connection appears to be offline", "network
  // connection was lost").
  if (/network request failed|fetch failed|networkerror|connection appears to be offline|connection was lost|offline/i.test(raw)) {
    return 'No internet connection. Please check your network and try again.';
  }
  if (/timed out|timeout|aborted/i.test(raw)) {
    return 'The request took too long. Please try again.';
  }

  // Permissions
  if (/permission denied|not authorized|not granted/i.test(raw)) {
    return 'Permission was denied. Please update permissions in Settings.';
  }

  // Auth / token. The 401 alternative requires a non-digit boundary so a
  // longer numeric value containing the substring (e.g. user id 4012345)
  // doesn't false-positive as a session-expired error. The "expired" alt
  // requires a token/session/credential noun so unrelated "expired metadata"
  // strings don't trigger session-expired copy.
  if (/(?:^|\D)401(?:\D|$)|unauthor|invalid[_ ]token|expired (?:token|session|credential|grant|access)/i.test(raw)) {
    return 'Your session has expired. Please reconnect and try again.';
  }

  // File / storage — keep these patterns precise; do not match generic JS errors
  // like "Cannot read property X of undefined" which are programmer bugs, not
  // user-facing file problems.
  if (/no such file|enoent|file not found|cannot open file/i.test(raw)) {
    return 'The selected file could not be read.';
  }
  if (/no space|disk full|enospc/i.test(raw)) {
    return 'Your device is out of storage space.';
  }

  return fallback;
}

/**
 * One-shot helper for user-facing catch blocks: report to Sentry with
 * context, then show the user a curated alert. Pass the original error
 * — its message is logged but never shown.
 *
 * @param {unknown} err
 * @param {object}  options
 *   title:    string   — alert title (e.g., 'Backup Failed')
 *   fallback: string   — default body copy when nothing else matches
 *   feature:  string   — Sentry tag
 *   action:   string   — Sentry tag
 *   extra:    object   — any other context for Sentry
 */
export function reportAndShow(err, { title, fallback, feature, action, extra = {} }) {
  reportError(err, { feature, action, ...extra });
  try {
    Alert.alert(title, friendlyMessage(err, fallback));
  } catch {
    // Alert.alert is supposed to be infallible, but the caller's contract is
    // "never throws" — so we belt-and-suspenders it. If even Alert is broken,
    // the original error path continues unaffected.
  }
}
