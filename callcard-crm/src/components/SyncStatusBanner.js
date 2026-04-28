// =============================================================================
// SyncStatusBanner.js - Square sync status banner for the Customers screen
// Version: 1.1
// Last Updated: 2026-04-14
//
// PROJECT:      Rolodeck (project v0.22)
// FILES:        SyncStatusBanner.js  (this file — status banner component)
//               CustomersScreen.js   (renders this banner; passes onPress nav callback)
//               storage.js           (getSquareSyncMetadata)
//               squarePlaceholder.js (isSquareConnected)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Fully self-contained: loads its own data via useFocusEffect
//   - Four visual states:
//       HIDDEN  — no Square connection (renders null)
//       GREEN   — connected, synced within 24h, no pending reviews
//       YELLOW  — pending low-conf reviews OR conflict customers exist
//       RED     — last sync entry has errors > 0, or sync has never run after connect
//   - relativeTime() produces human-readable elapsed labels (just now / Xm ago / etc.)
//   - Parent passes onPress callback so navigation stays in CustomersScreen
//   - Remounts on tab focus (unmountOnBlur: true in TabNavigator) so state is fresh
//
// CHANGE LOG:
// v1.0  2026-04-12  Claude  Initial implementation
// v1.1  2026-04-14  Claude  Accessibility: added accessibilityHint and
//                           role='button' on all tappable states; non-tappable
//                           ok state uses role='text' with informational hint
// =============================================================================

import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/theme';
import { FontSize } from '../styles/typography';
import { getSquareSyncMetadata, getAllCustomers } from '../data/storage';
import { isSquareConnected } from '../utils/squarePlaceholder';

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(isoString) {
  if (!isoString) return null;
  const diff = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * @param {object} props
 * @param {Function} props.onPress — called when user taps the banner; parent
 *                                   handles navigation to SquareSyncScreen
 */
export default function SyncStatusBanner({ onPress }) {
  const { theme } = useTheme();
  const styles    = useMemo(() => makeStyles(theme), [theme]);

  const [connected,    setConnected]    = useState(false);
  const [syncMeta,     setSyncMeta]     = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const [conn, meta, customers] = await Promise.all([
            isSquareConnected(),
            getSquareSyncMetadata(),
            getAllCustomers(),
          ]);
          if (!active) return;
          setConnected(conn);
          setSyncMeta(meta);
          setPendingCount((meta?.pendingLowConf || []).length);
          setConflictCount(
            customers.filter((c) => c.squareSyncStatus === 'conflict').length,
          );
        } catch {
          // ignore — stale data is fine
        }
      })();
      return () => { active = false; };
    }, []),
  );

  // Not connected → render nothing
  if (!connected) return null;

  // Determine banner state
  const lastLog        = syncMeta?.syncLog?.[0];
  const hasErrors      = lastLog && lastLog.errors > 0;
  const hasPending     = pendingCount > 0 || conflictCount > 0;
  const lastSyncAt     = syncMeta?.lastSyncAt;
  const syncedRecently = lastSyncAt &&
    (Date.now() - new Date(lastSyncAt).getTime()) < 24 * 60 * 60 * 1000;

  let state;
  if (hasErrors)    state = 'error';
  else if (hasPending) state = 'review';
  else if (syncedRecently) state = 'ok';
  else              state = 'stale';

  const config = {
    ok: {
      bg:   theme.success + '1A', // ~10% alpha
      icon: 'checkmark-circle-outline',
      iconColor: theme.success,
      label: `Synced with Square · ${relativeTime(lastSyncAt)}`,
      hint:  'Square sync is up to date',
      chevron: false,
    },
    review: {
      bg:   theme.warning + '1A',
      icon: 'alert-circle-outline',
      iconColor: theme.warning,
      label: `${pendingCount + conflictCount} item${pendingCount + conflictCount !== 1 ? 's' : ''} need review`,
      hint:  'Tap to open Square sync screen and review',
      chevron: true,
    },
    error: {
      bg:   theme.overdue + '1A',
      icon: 'close-circle-outline',
      iconColor: theme.overdue,
      label: 'Sync failed · Tap to retry',
      hint:  'Tap to open Square sync screen and retry',
      chevron: true,
    },
    stale: {
      bg:   theme.border,
      icon: 'sync-outline',
      iconColor: theme.textMuted,
      label: lastSyncAt
        ? `Last synced ${relativeTime(lastSyncAt)} · Tap to sync`
        : 'Never synced with Square · Tap to sync',
      hint:  'Tap to open Square sync screen',
      chevron: true,
    },
  };

  const cfg = config[state];

  return (
    <Pressable
      style={[styles.banner, { backgroundColor: cfg.bg }]}
      onPress={cfg.chevron ? onPress : undefined}
      accessibilityRole={cfg.chevron ? 'button' : 'text'}
      accessibilityLabel={cfg.label}
      accessibilityHint={cfg.hint}
    >
      <Ionicons name={cfg.icon} size={16} color={cfg.iconColor} />
      <Text style={[styles.label, { color: cfg.iconColor }]} numberOfLines={1}>
        {cfg.label}
      </Text>
      {cfg.chevron && (
        <Ionicons name="chevron-forward" size={14} color={cfg.iconColor} style={styles.chevron} />
      )}
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(theme) {
  return StyleSheet.create({
    banner: {
      flexDirection:     'row',
      alignItems:        'center',
      marginHorizontal:  16,
      marginBottom:       8,
      paddingVertical:    8,
      paddingHorizontal: 12,
      borderRadius:      10,
      gap:                8,
    },
    label: {
      flex:       1,
      fontFamily: theme.fontBodyMedium,
      fontSize:   theme.fontSize.sm,
    },
    chevron: {
      marginLeft: 2,
    },
  });
}
