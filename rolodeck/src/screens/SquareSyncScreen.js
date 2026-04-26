// =============================================================================
// SquareSyncScreen.js - Square customer sync management screen
// Version: 1.2
// Last Updated: 2026-04-25
//
// PROJECT:      Callout (project v1.3.0)
// FILES:        SquareSyncScreen.js   (this file — sync management UI)
//               squareSync.js         (runSync, resolveLowConf, resolveConflict,
//                                      pushLocalCustomers, getLocalOnlyCustomers)
//               storage.js            (getSquareSyncMetadata, getAllCustomers,
//                                      getCustomerById)
//               squarePlaceholder.js  (isSquareConnected)
//               TabNavigator.js       (registered as 'SquareSync' in Settings stack)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - ScrollView with 5 clearly delineated sections (cards):
//       1. Sync Status header — last sync time, Sync Now button, progress
//       2. Pending Review — LOW_CONF pairs; [Link] [Keep Separate] per pair
//       3. Conflicts — per-customer conflict cards; [Use Square] [Use Callout]
//                      per conflicting field
//       4. Sync Log — summary of last sync + scrollable history
//       5. Push to Square — local-only customer list; [Push] per record +
//                           [Push All] with confirm dialog
//   - loadData() fetches everything: syncMeta, conflicts list, localOnly list;
//     called on mount and via useFocusEffect refresh
//   - syncing / pushing state guards prevent double-taps
//   - Confirm dialog before any push operation (Alert.alert)
//   - LowConfRoloSide uses getCustomerById (not getAllCustomers) so it loads
//     only one record instead of the entire customer list per pending pair
//
// CHANGE LOG:
// v1.0  2026-04-12  Claude  Initial implementation
//       - Section 1: Sync Status header with Sync Now button + progress
//       - Section 2: Pending Review (LOW_CONF) with Link / Keep Separate actions
//       - Section 3: Conflicts with per-field Use Square / Use Callout actions
//       - Section 4: Sync Log history
//       - Section 5: Push to Square — individual + Push All
// v1.1  2026-04-14  Claude  Performance: LowConfRoloSide uses getCustomerById
//                           instead of getAllCustomers().find() so each pending-
//                           review row loads one record, not the full customer list
//                           [updated ARCHITECTURE]
// v1.2  2026-04-25  Claude  Rename rolodeck → callout throughout
//       - rolodeckCustomerId: roloId destructuring → calloutCustomerId: calloutId
//       - handleConflict 'rolodeck' winner string → 'callout'
//       - vals.rolodeck → vals.callout
//       - LowConfRoloSide prop roloId → calloutId
// =============================================================================

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/theme';
import { FontSize } from '../styles/typography';
import { getSquareSyncMetadata, getAllCustomers, getCustomerById } from '../data/storage';
import { isSquareConnected } from '../utils/squarePlaceholder';
import {
  runSync,
  resolveLowConf,
  resolveConflict,
  pushLocalCustomers,
  getLocalOnlyCustomers,
} from '../utils/squareSync';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimestamp(iso) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
         ' at ' +
         d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function relativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs  = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const FIELD_LABELS = {
  email:   'Email',
  phone:   'Phone',
  address: 'Address',
  zipCode: 'Zip Code',
};

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SquareSyncScreen() {
  const { theme } = useTheme();
  const styles    = useMemo(() => makeStyles(theme), [theme]);

  const [connected,     setConnected]     = useState(false);
  const [syncMeta,      setSyncMeta]      = useState(null);
  const [pendingLowConf, setPendingLowConf] = useState([]);
  const [conflicts,     setConflicts]     = useState([]);
  const [localOnly,     setLocalOnly]     = useState([]);
  const [syncing,       setSyncing]       = useState(false);
  const [syncResult,    setSyncResult]    = useState(null);
  const [pushing,       setPushing]       = useState(new Set());
  const [pushingAll,    setPushingAll]    = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [conn, meta, all, local] = await Promise.all([
        isSquareConnected(),
        getSquareSyncMetadata(),
        getAllCustomers(),
        getLocalOnlyCustomers(),
      ]);
      setConnected(conn);
      setSyncMeta(meta);
      setPendingLowConf(meta?.pendingLowConf || []);
      setConflicts(all.filter((c) => c.squareSyncStatus === 'conflict'));
      setLocalOnly(local);
    } catch (e) {
      Alert.alert('Load Error', e.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  // ── Sync Now ────────────────────────────────────────────────────────────────

  const handleSyncNow = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await runSync();
      setSyncResult(result);
      await loadData();
      if (result.errors.length > 0) {
        Alert.alert(
          'Sync Completed with Errors',
          `${result.merged} merged, ${result.created} created, ${result.errors.length} failed.\n\n` +
          result.errors.slice(0, 3).map((e) => e.message).join('\n'),
        );
      }
    } catch (e) {
      if (e.message === 'NOT_CONNECTED') {
        Alert.alert('Not Connected', 'Connect your Square account in Settings first.');
      } else {
        Alert.alert('Sync Failed', e.message);
      }
    } finally {
      setSyncing(false);
    }
  };

  // ── Low-conf resolution ─────────────────────────────────────────────────────

  const handleLowConf = async (sq, calloutId, action) => {
    try {
      await resolveLowConf(sq, calloutId, action);
      await loadData();
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  // ── Conflict resolution ─────────────────────────────────────────────────────

  const handleConflict = async (customerId, fieldName, winner) => {
    try {
      await resolveConflict(customerId, fieldName, winner);
      await loadData();
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  // ── Push to Square ──────────────────────────────────────────────────────────

  const handlePushOne = async (customerId, name) => {
    Alert.alert(
      'Push to Square',
      `Push "${name}" to Square as a new customer?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Push',
          onPress: async () => {
            setPushing((prev) => new Set([...prev, customerId]));
            try {
              const { pushed, errors } = await pushLocalCustomers([customerId]);
              await loadData();
              if (errors.length > 0) {
                Alert.alert('Push Failed', errors[0].message);
              }
            } catch (e) {
              Alert.alert('Push Failed', e.message);
            } finally {
              setPushing((prev) => {
                const next = new Set(prev);
                next.delete(customerId);
                return next;
              });
            }
          },
        },
      ],
    );
  };

  const handlePushAll = () => {
    if (localOnly.length === 0) return;
    Alert.alert(
      'Push All to Square',
      `Push ${localOnly.length} customer${localOnly.length !== 1 ? 's' : ''} to Square?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Push All',
          onPress: async () => {
            setPushingAll(true);
            try {
              const ids = localOnly.map((c) => c.id);
              const { pushed, errors } = await pushLocalCustomers(ids);
              await loadData();
              const msg = errors.length > 0
                ? `${pushed} pushed. ${errors.length} failed:\n${errors.slice(0, 3).map((e) => e.message).join('\n')}`
                : `${pushed} customer${pushed !== 1 ? 's' : ''} pushed to Square.`;
              Alert.alert('Push Complete', msg);
            } catch (e) {
              Alert.alert('Push Failed', e.message);
            } finally {
              setPushingAll(false);
            }
          },
        },
      ],
    );
  };

  // ── Render helpers ──────────────────────────────────────────────────────────

  const lastSyncAt = syncMeta?.lastSyncAt;
  const lastLog    = syncMeta?.syncLog?.[0];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* ── Section 1: Sync Status ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="sync-outline" size={20} color={theme.primary} />
            <Text style={styles.cardTitle}>Square Customer Sync</Text>
          </View>

          {!connected && (
            <View style={styles.noticeRow}>
              <Ionicons name="warning-outline" size={16} color={theme.warning} />
              <Text style={styles.noticeText}>
                No Square account connected. Connect in Settings to enable sync.
              </Text>
            </View>
          )}

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Last synced</Text>
            <Text style={styles.metaValue}>
              {lastSyncAt ? `${formatTimestamp(lastSyncAt)} (${relativeTime(lastSyncAt)})` : 'Never'}
            </Text>
          </View>

          {lastLog && (
            <View style={styles.lastResultRow}>
              <Text style={styles.lastResultText}>
                Last sync: {lastLog.merged} merged · {lastLog.created} created ·{' '}
                {lastLog.lowConf} pending · {lastLog.conflicts} conflicts
                {lastLog.errors > 0 ? ` · ${lastLog.errors} errors` : ''}
              </Text>
            </View>
          )}

          {syncResult && (
            <View style={styles.freshResultRow}>
              <Text style={styles.freshResultText}>
                Done: {syncResult.merged} merged, {syncResult.created} new,{' '}
                {syncResult.lowConf} pending review
                {syncResult.errors.length > 0 ? `, ${syncResult.errors.length} errors` : ''}
              </Text>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.syncBtn,
              (!connected || syncing) && styles.syncBtnDisabled,
              pressed && connected && !syncing && styles.syncBtnPressed,
            ]}
            onPress={handleSyncNow}
            disabled={!connected || syncing}
            accessibilityRole="button"
            accessibilityLabel="Sync customers now"
          >
            {syncing
              ? <ActivityIndicator size="small" color={theme.surface} />
              : <Ionicons name="sync" size={16} color={theme.surface} style={styles.btnIcon} />
            }
            <Text style={styles.syncBtnText}>
              {syncing ? 'Syncing…' : 'Sync Now'}
            </Text>
          </Pressable>
        </View>

        {/* ── Section 2: Pending Review ── */}
        {pendingLowConf.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="help-circle-outline" size={20} color={theme.warning} />
              <Text style={styles.cardTitle}>Pending Review ({pendingLowConf.length})</Text>
            </View>
            <Text style={styles.cardDesc}>
              These customers matched by name only. Confirm or reject each link.
            </Text>

            {pendingLowConf.map(({ squareCustomer: sq, calloutCustomerId: calloutId }, idx) => {
              const sqName  = [sq.given_name, sq.family_name].filter(Boolean).join(' ');
              return (
                <View key={`${sq.id}-${calloutId}`}>
                  {idx > 0 && <View style={styles.divider} />}
                  <View style={styles.compareGrid}>
                    <View style={styles.compareCol}>
                      <Text style={styles.compareSource}>Square</Text>
                      <Text style={styles.compareValue}>{sqName || '—'}</Text>
                      <Text style={styles.compareDetail}>{sq.email_address || ''}</Text>
                      <Text style={styles.compareDetail}>{sq.phone_number  || ''}</Text>
                    </View>
                    <View style={styles.compareArrow}>
                      <Ionicons name="swap-horizontal-outline" size={18} color={theme.textMuted} />
                    </View>
                    <LowConfRoloSide calloutId={calloutId} styles={styles} theme={theme} />
                  </View>
                  <View style={styles.actionRow}>
                    <Pressable
                      style={({ pressed }) => [styles.linkBtn, pressed && styles.btnPressed]}
                      onPress={() => handleLowConf(sq, calloutId, 'link')}
                      accessibilityRole="button"
                      accessibilityLabel="Link these customers"
                    >
                      <Text style={styles.linkBtnText}>Link</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.skipBtn, pressed && styles.btnPressed]}
                      onPress={() => handleLowConf(sq, calloutId, 'skip')}
                      accessibilityRole="button"
                      accessibilityLabel="Keep separate"
                    >
                      <Text style={styles.skipBtnText}>Keep Separate</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Section 3: Conflicts ── */}
        {conflicts.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="git-merge-outline" size={20} color={theme.overdue} />
              <Text style={styles.cardTitle}>Conflicts ({conflicts.length})</Text>
            </View>
            <Text style={styles.cardDesc}>
              Both Square and Callout have different values. Choose which wins.
            </Text>

            {conflicts.map((customer, idx) => (
              <View key={customer.id}>
                {idx > 0 && <View style={styles.divider} />}
                <Text style={styles.conflictName}>{customer.name || '(no name)'}</Text>
                {Object.entries(customer.squareConflictData || {}).map(([field, vals]) => (
                  <View key={field} style={styles.conflictField}>
                    <Text style={styles.conflictFieldLabel}>
                      {FIELD_LABELS[field] || field}
                    </Text>
                    <View style={styles.conflictValues}>
                      <Pressable
                        style={({ pressed }) => [styles.conflictOpt, pressed && styles.btnPressed]}
                        onPress={() => handleConflict(customer.id, field, 'square')}
                        accessibilityRole="button"
                        accessibilityLabel={`Use Square value for ${field}`}
                      >
                        <Text style={styles.conflictSource}>Square</Text>
                        <Text style={styles.conflictVal} numberOfLines={2}>{vals.square}</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [styles.conflictOpt, pressed && styles.btnPressed]}
                        onPress={() => handleConflict(customer.id, field, 'callout')}
                        accessibilityRole="button"
                        accessibilityLabel={`Use Callout value for ${field}`}
                      >
                        <Text style={styles.conflictSource}>Callout</Text>
                        <Text style={styles.conflictVal} numberOfLines={2}>{vals.callout}</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* ── Section 4: Sync Log ── */}
        {syncMeta?.syncLog?.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="time-outline" size={20} color={theme.textSecondary} />
              <Text style={styles.cardTitle}>Sync History</Text>
            </View>
            {syncMeta.syncLog.map((entry, idx) => (
              <View key={`${entry.at}-${idx}`} style={styles.logEntry}>
                <Text style={styles.logAt}>{formatTimestamp(entry.at)}</Text>
                <Text style={styles.logSummary}>
                  {entry.merged}↔ merged · {entry.created}+ created ·{' '}
                  {entry.lowConf} pending · {entry.conflicts} conflicts
                  {entry.errors > 0 ? ` · ${entry.errors} errors` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Section 5: Push to Square ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="cloud-upload-outline" size={20} color={theme.primary} />
            <Text style={styles.cardTitle}>Push to Square</Text>
          </View>

          {localOnly.length === 0 ? (
            <Text style={styles.cardDesc}>
              All Callout customers are linked to Square.
            </Text>
          ) : (
            <>
              <Text style={styles.cardDesc}>
                {localOnly.length} customer{localOnly.length !== 1 ? 's' : ''} exist only in Callout.
              </Text>

              <Pressable
                style={({ pressed }) => [
                  styles.pushAllBtn,
                  pushingAll && styles.syncBtnDisabled,
                  pressed && !pushingAll && styles.btnPressed,
                ]}
                onPress={handlePushAll}
                disabled={pushingAll}
                accessibilityRole="button"
                accessibilityLabel="Push all local customers to Square"
              >
                {pushingAll
                  ? <ActivityIndicator size="small" color={theme.primary} />
                  : <Ionicons name="cloud-upload-outline" size={14} color={theme.primary} />
                }
                <Text style={styles.pushAllBtnText}>
                  {pushingAll ? 'Pushing…' : `Push All (${localOnly.length})`}
                </Text>
              </Pressable>

              {localOnly.map((c, idx) => (
                <View key={c.id} style={styles.localRow}>
                  <View style={styles.localInfo}>
                    <Text style={styles.localName}>{c.name || '(no name)'}</Text>
                    {!!(c.email || c.phone) && (
                      <Text style={styles.localDetail} numberOfLines={1}>
                        {[c.email, c.phone].filter(Boolean).join(' · ')}
                      </Text>
                    )}
                  </View>
                  <Pressable
                    style={({ pressed }) => [
                      styles.pushOneBtn,
                      pushing.has(c.id) && styles.syncBtnDisabled,
                      pressed && !pushing.has(c.id) && styles.btnPressed,
                    ]}
                    onPress={() => handlePushOne(c.id, c.name)}
                    disabled={pushing.has(c.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Push ${c.name} to Square`}
                  >
                    {pushing.has(c.id)
                      ? <ActivityIndicator size="small" color={theme.primary} />
                      : <Text style={styles.pushOneBtnText}>Push</Text>
                    }
                  </Pressable>
                </View>
              ))}
            </>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── LowConfRoloSide ───────────────────────────────────────────────────────────
// Separate component to avoid loading customer in the list-level map closure

function LowConfRoloSide({ calloutId, styles, theme }) {
  const [rolo, setRolo] = React.useState(null);

  React.useEffect(() => {
    let active = true;
    getCustomerById(calloutId).then((c) => {
      if (active) setRolo(c || null);
    }).catch(() => {});
    return () => { active = false; };
  }, [calloutId]);

  return (
    <View style={styles.compareCol}>
      <Text style={styles.compareSource}>Callout</Text>
      <Text style={styles.compareValue}>{rolo?.name || '—'}</Text>
      <Text style={styles.compareDetail}>{rolo?.email || ''}</Text>
      <Text style={styles.compareDetail}>{rolo?.phone || ''}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(theme) {
  return StyleSheet.create({
    safe: {
      flex:            1,
      backgroundColor: theme.background,
    },
    content: {
      padding:       16,
      paddingBottom: 48,
      gap:           14,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius:    16,
      padding:         18,
      shadowColor:     '#000',
      shadowOffset:    { width: 0, height: 1 },
      shadowOpacity:   0.05,
      shadowRadius:    4,
      elevation:        1,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:           10,
      marginBottom:  10,
    },
    cardTitle: {
      fontFamily: theme.fontHeading,
      fontSize:   theme.fontSize.lg,
      color:      theme.text,
    },
    cardDesc: {
      fontFamily:   theme.fontBody,
      fontSize:     theme.fontSize.sm,
      color:        theme.textMuted,
      marginBottom: 12,
      lineHeight:   theme.fontSize.sm * 1.5,
    },
    metaRow: {
      flexDirection:  'row',
      justifyContent: 'space-between',
      alignItems:     'center',
      marginBottom:    6,
    },
    metaLabel: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   theme.fontSize.sm,
      color:      theme.textSecondary,
    },
    metaValue: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.sm,
      color:      theme.textMuted,
      flex:        1,
      textAlign:  'right',
    },
    lastResultRow: {
      marginBottom: 10,
    },
    lastResultText: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.xs,
      color:      theme.textMuted,
    },
    freshResultRow: {
      backgroundColor: theme.success + '1A',
      borderRadius:    8,
      paddingVertical: 6,
      paddingHorizontal: 10,
      marginBottom:    10,
    },
    freshResultText: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   theme.fontSize.sm,
      color:      theme.success,
    },
    noticeRow: {
      flexDirection:  'row',
      alignItems:     'center',
      gap:             8,
      backgroundColor: theme.warning + '1A',
      borderRadius:   10,
      padding:        10,
      marginBottom:   12,
    },
    noticeText: {
      flex:       1,
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.sm,
      color:      theme.warning,
      lineHeight: theme.fontSize.sm * 1.4,
    },
    syncBtn: {
      flexDirection:   'row',
      alignItems:      'center',
      justifyContent:  'center',
      backgroundColor: theme.primary,
      borderRadius:    12,
      paddingVertical: 12,
      gap:             8,
      marginTop:       6,
    },
    syncBtnDisabled: {
      opacity: 0.5,
    },
    syncBtnPressed: {
      opacity: 0.85,
    },
    syncBtnText: {
      fontFamily: theme.fontBodyBold,
      fontSize:   theme.fontSize.base,
      color:      theme.surface,
    },
    btnIcon: {
      marginRight: 2,
    },
    divider: {
      height:          StyleSheet.hairlineWidth,
      backgroundColor: theme.border,
      marginVertical:  14,
    },
    // ── Low-conf ──
    compareGrid: {
      flexDirection: 'row',
      alignItems:    'flex-start',
      gap:           8,
      marginBottom:  10,
    },
    compareCol: {
      flex: 1,
    },
    compareArrow: {
      paddingTop: 16,
    },
    compareSource: {
      fontFamily:    theme.fontUiBold,
      fontSize:      theme.fontSize.xs,
      color:         theme.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom:  4,
    },
    compareValue: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   theme.fontSize.base,
      color:      theme.text,
      marginBottom: 2,
    },
    compareDetail: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.xs,
      color:      theme.textMuted,
    },
    actionRow: {
      flexDirection: 'row',
      gap:           10,
    },
    linkBtn: {
      flex:            1,
      backgroundColor: theme.primary,
      borderRadius:    10,
      paddingVertical: 10,
      alignItems:      'center',
    },
    linkBtnText: {
      fontFamily: theme.fontBodyBold,
      fontSize:   theme.fontSize.sm,
      color:      theme.surface,
    },
    skipBtn: {
      flex:            1,
      backgroundColor: theme.inputBg,
      borderRadius:    10,
      paddingVertical: 10,
      alignItems:      'center',
      borderWidth:     1,
      borderColor:     theme.border,
    },
    skipBtnText: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   theme.fontSize.sm,
      color:      theme.textSecondary,
    },
    btnPressed: {
      opacity: 0.7,
    },
    // ── Conflicts ──
    conflictName: {
      fontFamily:   theme.fontBodyMedium,
      fontSize:     theme.fontSize.base,
      color:        theme.text,
      marginBottom: 10,
    },
    conflictField: {
      marginBottom: 12,
    },
    conflictFieldLabel: {
      fontFamily:    theme.fontUiBold,
      fontSize:      theme.fontSize.xs,
      color:         theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom:  6,
    },
    conflictValues: {
      flexDirection: 'row',
      gap:           8,
    },
    conflictOpt: {
      flex:              1,
      backgroundColor:   theme.inputBg,
      borderRadius:      10,
      padding:           10,
      borderWidth:        1,
      borderColor:       theme.border,
    },
    conflictSource: {
      fontFamily:    theme.fontUiBold,
      fontSize:      theme.fontSize.xs,
      color:         theme.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom:  3,
    },
    conflictVal: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.sm,
      color:      theme.text,
      lineHeight: theme.fontSize.sm * 1.4,
    },
    // ── Sync Log ──
    logEntry: {
      paddingVertical: 8,
      borderTopWidth:  StyleSheet.hairlineWidth,
      borderTopColor:  theme.border,
    },
    logAt: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   theme.fontSize.sm,
      color:      theme.text,
      marginBottom: 2,
    },
    logSummary: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.xs,
      color:      theme.textMuted,
    },
    // ── Push to Square ──
    pushAllBtn: {
      flexDirection:   'row',
      alignItems:      'center',
      justifyContent:  'center',
      borderWidth:      1,
      borderColor:     theme.primary,
      borderRadius:    12,
      paddingVertical: 10,
      gap:             8,
      marginBottom:    14,
    },
    pushAllBtnText: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   theme.fontSize.sm,
      color:      theme.primary,
    },
    localRow: {
      flexDirection:  'row',
      alignItems:     'center',
      paddingVertical: 10,
      borderTopWidth:  StyleSheet.hairlineWidth,
      borderTopColor:  theme.border,
    },
    localInfo: {
      flex: 1,
    },
    localName: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   theme.fontSize.base,
      color:      theme.text,
    },
    localDetail: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.xs,
      color:      theme.textMuted,
      marginTop:  2,
    },
    pushOneBtn: {
      borderWidth:       1,
      borderColor:       theme.primary,
      borderRadius:      8,
      paddingVertical:   7,
      paddingHorizontal: 14,
      minWidth:          60,
      alignItems:        'center',
    },
    pushOneBtnText: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   theme.fontSize.sm,
      color:      theme.primary,
    },
  });
}
