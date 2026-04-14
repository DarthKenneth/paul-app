// =============================================================================
// CustomersScreen.js - Customer list with search, sort filter, and add button
// Version: 1.5
// Last Updated: 2026-04-14
//
// PROJECT:      Rolodeck (project v0.22)
// FILES:        CustomersScreen.js      (this file)
//               CustomerCard.js         (list item component)
//               storage.js              (getAllCustomers, getSortPreference,
//                                        saveSortPreference)
//               theme.js                (useTheme)
//               typography.js           (FontFamily, FontSize)
//               SyncStatusBanner.js     (Square sync status banner)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - useFocusEffect reloads customers + saved sort preference on every focus
//   - "Add Customer" button lives at the top of the screen content (not a FAB)
//   - Sort is a 4-option filter modal: name, address, zip code, email
//   - Active sort shown as a chip with the current label + chevron
//   - Search: case-insensitive match on name, email, phone, address, zipCode
//   - Sort preference persisted to AsyncStorage via saveSortPreference()
//   - Filtered + sorted list memoized with useMemo to avoid recalc on
//     unrelated re-renders
//   - Storage errors caught with try/catch
//
// CHANGE LOG:
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

import React, { useState, useCallback, useMemo } from 'react';
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
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import CustomerCard from '../components/CustomerCard';
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

  const [customers, setCustomers]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [query, setQuery]           = useState('');
  const [sortMode, setSortMode]     = useState('firstName');
  const [sortModal, setSortModal]   = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [intervalDays, setIntervalDays] = useState(365);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      (async () => {
        try {
          const [all, pref, archived, mode, customDays] = await Promise.all([
            getAllCustomers(),
            getSortPreference(),
            getShowArchived(),
            getServiceIntervalMode(),
            getServiceIntervalCustomDays(),
          ]);
          if (active) {
            setCustomers(all);
            setSortMode(pref);
            setShowArchived(archived);
            setIntervalDays(modeToIntervalDays(mode, customDays));
          }
        } catch {
          // Storage read failed — keep stale data rather than crashing
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => { active = false; };
    }, []),
  );

  const handleSortSelect = async (key) => {
    setSortMode(key);
    setSortModal(false);
    await saveSortPreference(key);
  };

  const sections = useMemo(() => {
    const matched = customers.filter((c) => {
      if (!showArchived && c.archived) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
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

    // Group into sections by the first character of the sort key
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

  return (
    <SafeAreaView style={styles.safe}>

      {/* ── Top action row: Add Customer + Sort ── */}
      <View style={styles.actionRow}>
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

      {/* ── Search bar ── */}
      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <Ionicons
            name="search-outline"
            size={18}
            color={theme.placeholder}
            style={styles.searchIcon}
          />
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

      {/* ── Square sync status banner ── */}
      <SyncStatusBanner
        onPress={() => navigation.navigate('SettingsTab', { screen: 'SquareSync' })}
      />

      {/* ── Customer list ── */}
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
            <CustomerCard
              customer={item}
              intervalDays={intervalDays}
              onPress={() => navigation.navigate('CustomerDetail', { customerId: item.id, backLabel: 'Customers', onAlertsRefresh: route.params?.onAlertsRefresh })}
            />
          )}
          contentContainerStyle={styles.listContent}
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

      {/* ── Sort filter modal ── */}
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
                <Text
                  style={[
                    styles.modalOptionText,
                    sortMode === key && styles.modalOptionTextActive,
                  ]}
                >
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

    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: {
      flex:            1,
      backgroundColor: theme.background,
    },
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
      fontSize:   FontSize.base,
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
      fontSize:   FontSize.sm,
      color:      theme.primary,
    },
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
      fontSize:        FontSize.base,
      color:           theme.text,
      paddingVertical: 12,
    },
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
      fontFamily: theme.fontUiBold,
      fontSize:   FontSize.sm,
      color:      theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
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
      fontSize:   FontSize.lg,
      color:      theme.textSecondary,
    },
    emptyBody: {
      fontFamily: theme.fontBody,
      fontSize:   FontSize.base,
      color:      theme.textMuted,
      textAlign:  'center',
      lineHeight: FontSize.base * 1.5,
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
      fontSize:          FontSize.xs,
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
      fontSize:   FontSize.base,
      color:      theme.text,
    },
    modalOptionTextActive: {
      fontFamily: theme.fontBodyBold,
      color:      theme.primary,
    },
  });
}
