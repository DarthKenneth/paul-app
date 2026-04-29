// =============================================================================
// CustomersScreen.js - Customer list with search, sort filter, and add button
// Version: 1.8
// Last Updated: 2026-04-24
//
// PROJECT:      Rolodeck (project v0.29.0)
// FILES:        CustomersScreen.js      (this file)
//               CustomerCard.js         (list item component)
//               CustomerDetailPane.js   (right-panel detail in split view)
//               storage.js              (getAllCustomers, getSortPreference,
//                                        saveSortPreference)
//               theme.js                (useTheme)
//               typography.js           (FontFamily, FontSize)
//               SyncStatusBanner.js     (Square sync status banner)
//               responsive.js           (useSplitLayout, SPLIT_LIST_WIDTH)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - useFocusEffect reloads customers + sort on every focus; loadCustomers()
//     is extracted so the split-pane callbacks can trigger background reloads
//   - "Add Customer" button lives at the top of the screen content (not a FAB)
//   - Sort: 4-option filter modal (first name, last name, city, zip code)
//   - Active sort shown as a chip with current label + chevron
//   - Search: case-insensitive match on name, email, phone, address, city, state, zipCode
//   - Sort preference persisted to AsyncStorage via saveSortPreference()
//   - Filtered + sorted list memoized with useMemo to avoid recalc on
//     unrelated re-renders
//   - Storage errors caught with try/catch
//   - TABLET LANDSCAPE (useSplitLayout): renders a two-panel side-by-side layout
//     — left panel is SPLIT_LIST_WIDTH (320pt) wide and holds the customer list;
//     right panel holds CustomerDetailPane when a customer is selected, or an
//     empty-state prompt. Tapping a card sets selectedCustomerId instead of
//     navigating. The pane's onBack/onAlertsRefresh callbacks trigger a
//     background list reload to keep cards fresh after service changes.
//
// CHANGE LOG:
// v1.7  2026-04-24  Claude  Tablet landscape split-pane layout
//       - Imported CustomerDetailPane, useSplitLayout, SPLIT_LIST_WIDTH
//       - Extracted loadCustomers() from useFocusEffect so background reloads
//         are possible from split-pane callbacks
//       - Added selectedCustomerId state (split mode only)
//       - handlePaneBack: clears selection + triggers list reload + badge refresh
//       - handlePaneAlertsRefresh: badge refresh + list reload (service added)
//       - SectionList renderItem: navigates on phone, sets selectedCustomerId
//         on tablet; selected card highlighted with primary left border
//       - Split layout: SafeAreaView flex-row root; left panel SPLIT_LIST_WIDTH;
//         right panel flex:1 bordered; CustomerDetailPane or empty state prompt
//       - widthCap suppressed inside left panel (already constrained)
//       - Added splitRoot, splitListPanel, splitDetailPanel, emptyPane,
//         emptyPaneText, emptyPaneIcon styles [updated ARCHITECTURE]
// v1.6  2026-04-19  Claude  Tablet width cap — action row, search bar, and
//                           SectionList content are wrapped in useContentContainerStyle
//                           so the list centers at 760pt on iPad instead of stretching
// v1.0  2026-04-03  Claude  Initial scaffold — name/zip sort, FAB add button
// v1.1  2026-04-03  Claude  Replaced FAB with top Add Customer button; replaced
//                           two-option sort with 4-way sort filter modal
//                           (name, address, zip code, email)
// v1.3  2026-04-09  Claude  Load interval preference, pass to CustomerCard
//                           so status badges respect the configured interval
// v1.2  2026-04-03  Claude  Optimize + harden
//                           - Memoized filtered+sorted list with useMemo
//                           - Added try/catch on storage calls in useFocusEffect
// v1.4  2026-04-12  Claude  Added SyncStatusBanner below search bar; navigates
//                           to Settings > SquareSync on tap
// v1.5  2026-04-14  Claude  Bug fixes + hardening
//       - Added route to component props (was undefined — ReferenceError crash
//         when tapping any customer card)
//       - Removed dev seed/dedup buttons and SEED_CUSTOMERS import
//       - Fixed sort default: getSortPreference() now returns 'firstName' as
//         default (was 'name' which matched no SORT_OPTIONS key)
//       - Added loading state with ActivityIndicator while customers load
//       - Sort chip accessibilityState selected added to each option
// =============================================================================

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  SectionList,
  TextInput,
  Pressable,
  Modal,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  DeviceEventEmitter,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CLOUD_SYNC_PULLED } from '../utils/cloudSync';
import { Ionicons } from '@expo/vector-icons';
import CustomerCard from '../components/CustomerCard';
import CustomerDetailPane from '../components/CustomerDetailPane';
import SyncStatusBanner from '../components/SyncStatusBanner';
import {
  getAllCustomers,
  getSortPreference,
  saveSortPreference,
  getShowArchived,
  getServiceIntervalMode,
  getServiceIntervalCustomDays,
  modeToIntervalDays,
} from '../data/storage';
import { useTheme } from '../styles/theme';
import { FontSize } from '../styles/typography';
import { useSplitLayout, SPLIT_LIST_WIDTH, useContentContainerStyle } from '../utils/responsive';
import { reportError } from '../utils/errorReporting';

const SORT_OPTIONS = [
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName',  label: 'Last Name'  },
  { key: 'city',      label: 'City'       },
  { key: 'zip',       label: 'Zip Code'   },
];

function getLastName(name) {
  const parts = (name || '').trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0] || '';
}

function sortCustomers(customers, mode) {
  return [...customers].sort((a, b) => {
    switch (mode) {
      case 'zip':
        return (a.zipCode || '').localeCompare(b.zipCode || '', undefined, { numeric: true });
      case 'city':
        return (a.city || '').localeCompare(b.city || '');
      case 'firstName': {
        const fa = (a.name || '').trim().split(/\s+/)[0] || '';
        const fb = (b.name || '').trim().split(/\s+/)[0] || '';
        return fa.localeCompare(fb);
      }
      case 'lastName':
        return getLastName(a.name).localeCompare(getLastName(b.name));
      default:
        return (a.name || '').localeCompare(b.name || '');
    }
  });
}

export default function CustomersScreen({ navigation, route }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const widthCap = useContentContainerStyle();
  const isSplit  = useSplitLayout();

  const [customers, setCustomers]           = useState([]);
  const [loading, setLoading]               = useState(true);
  const [query, setQuery]                   = useState('');
  // debouncedQuery lags `query` by 150ms so each keystroke doesn't recompute
  // the entire sections list (re-running .filter / .sort / Map.set across
  // every customer). The TextInput stays responsive on the input value but
  // the heavy memo only fires when the user pauses typing.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sortMode, setSortMode]             = useState('firstName');
  const [sortModal, setSortModal]           = useState(false);
  const [showArchived, setShowArchived]     = useState(false);
  const [intervalDays, setIntervalDays]     = useState(365);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);

  // Extracted so split-pane callbacks can trigger background reloads without
  // setting the loading spinner (list stays visible while data refreshes).
  const loadCustomers = useCallback(async () => {
    const [all, pref, archived, mode, customDays] = await Promise.all([
      getAllCustomers(),
      getSortPreference(),
      getShowArchived(),
      getServiceIntervalMode(),
      getServiceIntervalCustomDays(),
    ]);
    setCustomers(all);
    setSortMode(pref);
    setShowArchived(archived);
    setIntervalDays(modeToIntervalDays(mode, customDays));
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      loadCustomers()
        .catch((err) => reportError(err, { feature: 'customers', action: 'load-initial' }))
        .finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }, [loadCustomers]),
  );

  // Cloud-sync-pulled: a remote merge applied while we were mounted. Reload
  // silently so the list reflects the just-arrived data without the loading
  // spinner blink.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(CLOUD_SYNC_PULLED, () => {
      loadCustomers().catch((err) => reportError(err, { feature: 'customers', action: 'reload-after-sync' }));
    });
    return () => sub.remove();
  }, [loadCustomers]);

  // Debounce the search query → filter recomputation
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(handle);
  }, [query]);

  // Split-pane: customer was deleted or archived — clear selection, refresh list + badge
  const handlePaneBack = useCallback(() => {
    setSelectedCustomerId(null);
    loadCustomers().catch((err) => reportError(err, { feature: 'customers', action: 'load' }));
    route.params?.onAlertsRefresh?.();
  }, [loadCustomers, route.params?.onAlertsRefresh]);

  // Split-pane: service added/removed — refresh badge + list cards (last service date)
  const handlePaneAlertsRefresh = useCallback(() => {
    route.params?.onAlertsRefresh?.();
    loadCustomers().catch((err) => reportError(err, { feature: 'customers', action: 'load' }));
  }, [route.params?.onAlertsRefresh, loadCustomers]);

  const handleSortSelect = async (key) => {
    setSortMode(key);
    setSortModal(false);
    await saveSortPreference(key);
  };

  const sections = useMemo(() => {
    const matched = customers.filter((c) => {
      if (!showArchived && c.archived) return false;
      if (!debouncedQuery.trim()) return true;
      const q = debouncedQuery.toLowerCase();
      return (
        c.name?.toLowerCase().includes(q)    ||
        c.email?.toLowerCase().includes(q)   ||
        c.phone?.toLowerCase().includes(q)   ||
        c.address?.toLowerCase().includes(q) ||
        c.city?.toLowerCase().includes(q)    ||
        c.state?.toLowerCase().includes(q)   ||
        c.zipCode?.toLowerCase().includes(q)
      );
    });
    const sorted = sortCustomers(matched, sortMode);

    const groups = new Map();
    for (const c of sorted) {
      let groupKey;
      switch (sortMode) {
        case 'city':
          groupKey = (c.city || '').charAt(0).toUpperCase() || '#';
          break;
        case 'zip':
          groupKey = c.zipCode || '#';
          break;
        case 'firstName':
          groupKey = ((c.name || '').trim().split(/\s+/)[0] || '').charAt(0).toUpperCase() || '#';
          break;
        case 'lastName':
          groupKey = getLastName(c.name).charAt(0).toUpperCase() || '#';
          break;
        default:
          groupKey = (c.name || '').charAt(0).toUpperCase() || '#';
          break;
      }
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push(c);
    }
    return Array.from(groups, ([title, data]) => ({ title, data }));
  }, [customers, query, sortMode, showArchived]);

  const activeSortLabel = SORT_OPTIONS.find((o) => o.key === sortMode)?.label ?? 'Name';

  // ── Shared list UI ────────────────────────────────────────────────────────────
  // Rendered in both split (left panel) and non-split (full screen) layouts.

  const listSide = (
    <>
      {/* Top action row: Add Customer + Sort */}
      <View style={[styles.actionRow, !isSplit && widthCap]}>
        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
          onPress={() => navigation.navigate('AddCustomer')}
          accessibilityRole="button"
          accessibilityLabel="Add customer"
        >
          <Ionicons name="add" size={18} color={theme.surface} style={styles.addBtnIcon} />
          <Text style={styles.addBtnText}>Add Customer</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.sortChip, pressed && styles.sortChipPressed]}
          onPress={() => setSortModal(true)}
          accessibilityRole="button"
          accessibilityLabel={`Sort by ${activeSortLabel}`}
        >
          <Ionicons name="funnel-outline" size={14} color={theme.primary} style={styles.sortChipIcon} />
          <Text style={styles.sortChipText}>{activeSortLabel}</Text>
          <Ionicons name="chevron-down" size={13} color={theme.primary} />
        </Pressable>
      </View>

      {/* Search bar */}
      <View style={[styles.searchRow, !isSplit && widthCap]}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={theme.placeholder} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search customers…"
            placeholderTextColor={theme.placeholder}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* Square sync banner */}
      <SyncStatusBanner
        onPress={() => navigation.navigate('SettingsTab', { screen: 'SquareSync' })}
      />

      {/* Customer list */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>{section.title}</Text>
              <View style={styles.sectionLine} />
            </View>
          )}
          renderItem={({ item }) => (
            <View style={isSplit && selectedCustomerId === item.id ? styles.selectedCard : undefined}>
              <CustomerCard
                customer={item}
                intervalDays={intervalDays}
                onPress={() => {
                  if (isSplit) {
                    setSelectedCustomerId(item.id);
                  } else {
                    navigation.navigate('CustomerDetail', {
                      customerId: item.id,
                      backLabel: 'Customers',
                      onAlertsRefresh: route.params?.onAlertsRefresh,
                    });
                  }
                }}
              />
            </View>
          )}
          contentContainerStyle={[styles.listContent, !isSplit && widthCap]}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={56} color={theme.border} />
              <Text style={styles.emptyTitle}>
                {query.trim() ? 'No results' : 'No customers yet'}
              </Text>
              <Text style={styles.emptyBody}>
                {query.trim()
                  ? 'Try a different search term.'
                  : 'Tap Add Customer to get started.'}
              </Text>
            </View>
          }
        />
      )}

      {/* Sort filter modal */}
      <Modal
        visible={sortModal}
        transparent
        animationType="fade"
        onRequestClose={() => setSortModal(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSortModal(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Sort by</Text>
            {SORT_OPTIONS.map(({ key, label }) => (
              <Pressable
                key={key}
                style={({ pressed }) => [
                  styles.modalOption,
                  sortMode === key && styles.modalOptionActive,
                  pressed && styles.modalOptionPressed,
                ]}
                onPress={() => handleSortSelect(key)}
                accessibilityRole="radio"
                accessibilityLabel={`Sort by ${label}`}
                accessibilityState={{ selected: sortMode === key }}
              >
                <Text style={[styles.modalOptionText, sortMode === key && styles.modalOptionTextActive]}>
                  {label}
                </Text>
                {sortMode === key && (
                  <Ionicons name="checkmark" size={18} color={theme.primary} />
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );

  // ── Split layout ──────────────────────────────────────────────────────────────

  if (isSplit) {
    return (
      <SafeAreaView style={[styles.safe, styles.splitRoot]}>
        <View style={styles.splitListPanel}>
          {listSide}
        </View>
        <View style={[styles.splitDetailPanel, { borderLeftColor: theme.border }]}>
          {selectedCustomerId ? (
            <CustomerDetailPane
              customerId={selectedCustomerId}
              onBack={handlePaneBack}
              onAlertsRefresh={handlePaneAlertsRefresh}
              isPaneMode
            />
          ) : (
            <View style={styles.emptyPane}>
              <Ionicons name="person-outline" size={48} color={theme.border} />
              <Text style={styles.emptyPaneText}>Select a customer</Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── Full-screen layout (phone / portrait tablet) ──────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      {listSide}
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: {
      flex:            1,
      backgroundColor: theme.background,
    },
    // ── Split layout ──
    splitRoot: {
      flexDirection: 'row',
    },
    splitListPanel: {
      width:           SPLIT_LIST_WIDTH,
      borderRightWidth: 1,
      borderRightColor: theme.border,
      backgroundColor: theme.background,
    },
    splitDetailPanel: {
      flex:            1,
      borderLeftWidth: 1,
      backgroundColor: theme.background,
    },
    selectedCard: {
      backgroundColor: theme.primaryPale,
    },
    emptyPane: {
      flex:            1,
      alignItems:      'center',
      justifyContent:  'center',
      gap:             12,
    },
    emptyPaneText: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.base,
      color:      theme.textMuted,
    },
    // ── Action row ──
    actionRow: {
      flexDirection:     'row',
      alignItems:        'center',
      justifyContent:    'space-between',
      paddingHorizontal: 16,
      paddingTop:         14,
      paddingBottom:       8,
      gap:                10,
    },
    addBtn: {
      flexDirection:     'row',
      alignItems:        'center',
      backgroundColor:   theme.primary,
      borderRadius:      10,
      paddingVertical:    10,
      paddingHorizontal: 16,
      flex:               1,
      justifyContent:    'center',
    },
    addBtnPressed: {
      opacity: 0.85,
    },
    addBtnIcon: {
      marginRight: 5,
    },
    addBtnText: {
      fontFamily: theme.fontBodyBold,
      fontSize:   theme.fontSize.base,
      color:      theme.surface,
    },
    sortChip: {
      flexDirection:     'row',
      alignItems:        'center',
      borderWidth:        1,
      borderColor:       theme.primary,
      borderRadius:      10,
      paddingVertical:    10,
      paddingHorizontal: 12,
      gap:                5,
      backgroundColor:   theme.surface,
    },
    sortChipPressed: {
      opacity: 0.8,
    },
    sortChipIcon: {
      marginRight: 1,
    },
    sortChipText: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   theme.fontSize.sm,
      color:      theme.primary,
    },
    // ── Search ──
    searchRow: {
      paddingHorizontal: 16,
      paddingBottom:      10,
    },
    searchWrap: {
      flexDirection:     'row',
      alignItems:        'center',
      backgroundColor:   theme.inputBg,
      borderWidth:        1,
      borderColor:       theme.inputBorder,
      borderRadius:      12,
      paddingHorizontal: 12,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex:            1,
      fontFamily:      theme.fontBody,
      fontSize:        theme.fontSize.base,
      color:           theme.text,
      paddingVertical: 12,
    },
    // ── List ──
    loadingWrap: {
      flex:            1,
      alignItems:      'center',
      justifyContent:  'center',
    },
    listContent: {
      paddingTop:    4,
      paddingBottom: 30,
    },
    sectionHeader: {
      flexDirection:     'row',
      alignItems:        'center',
      paddingHorizontal: 20,
      marginTop:          14,
      marginBottom:        2,
      gap:                10,
    },
    sectionLabel: {
      fontFamily:    theme.fontUiBold,
      fontSize:      theme.fontSize.sm,
      color:         theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing:  0.8,
    },
    sectionLine: {
      flex:            1,
      height:          1,
      backgroundColor: theme.border,
    },
    empty: {
      alignItems:        'center',
      paddingTop:         80,
      paddingHorizontal:  40,
      gap:                10,
    },
    emptyTitle: {
      fontFamily: theme.fontHeading,
      fontSize:   theme.fontSize.lg,
      color:      theme.textSecondary,
    },
    emptyBody: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.base,
      color:      theme.textMuted,
      textAlign:  'center',
      lineHeight: theme.fontSize.base * 1.5,
    },
    // ── Sort modal ──
    modalBackdrop: {
      flex:            1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent:  'flex-start',
      alignItems:      'flex-end',
      paddingTop:       120,
      paddingRight:     16,
    },
    modalSheet: {
      backgroundColor: theme.surface,
      borderRadius:    16,
      paddingVertical: 8,
      minWidth:        180,
      shadowColor:     '#000',
      shadowOffset:    { width: 0, height: 4 },
      shadowOpacity:    0.15,
      shadowRadius:      12,
      elevation:          8,
    },
    modalTitle: {
      fontFamily:        theme.fontBodyMedium,
      fontSize:          theme.fontSize.xs,
      color:             theme.textMuted,
      textTransform:     'uppercase',
      letterSpacing:      0.8,
      paddingHorizontal: 16,
      paddingTop:         8,
      paddingBottom:      10,
    },
    modalOption: {
      flexDirection:     'row',
      alignItems:        'center',
      justifyContent:    'space-between',
      paddingVertical:   13,
      paddingHorizontal: 16,
    },
    modalOptionActive: {
      backgroundColor: theme.primaryPale,
    },
    modalOptionPressed: {
      opacity: 0.7,
    },
    modalOptionText: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.base,
      color:      theme.text,
    },
    modalOptionTextActive: {
      fontFamily: theme.fontBodyBold,
      color:      theme.primary,
    },
  });
}
