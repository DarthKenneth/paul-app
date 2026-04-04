// =============================================================================
// ServicesScreen.js - Upcoming and overdue service list, grouped by due window
// Version: 2.0.1
// Last Updated: 2026-04-03
//
// PROJECT:      Rolodeck (project v1.2)
// FILES:        ServicesScreen.js    (this file)
//               storage.js           (getAllCustomers)
//               serviceAlerts.js     (groupCustomersByDueWindow, getServiceStatus,
//                                     getLastServiceDate)
//               theme.js             (useTheme)
//               typography.js        (FontFamily, FontSize)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - useFocusEffect reloads on every tab focus
//   - SectionList driven by groupCustomersByDueWindow() from serviceAlerts.js
//   - Sections: Overdue / Next 30 Days / Next 31-60 Days / Next 61-90 Days / Later
//     Empty sections are omitted by groupCustomersByDueWindow
//   - Section headers color-coded by urgency:
//       Overdue     → theme.overdue (red)
//       Next 30     → theme.warning (amber)
//       Next 31-60  → theme.accent  (rust)
//       Next 61-90  → theme.accent  (rust, lighter treatment)
//       Later       → theme.success (green)
//   - Each row shows: customer name, last service date, status label
//   - Tapping a row navigates cross-tab to CustomersTab → CustomerDetail
//   - No filter chips — sections replace them; all customers always visible
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial scaffold — flat FlatList with filter chips
// v2.0  2026-04-03  Claude  Full rewrite as section-based SectionList
//         - Replaced filter chips with automatic due-window sections
//         - Rows now show last service date and status sub-line
//         - Section headers color-coded by urgency
//         - Empty state handles both zero customers and all-current cases
// v2.0.1  2026-04-03  Claude  Added try/catch on storage load in useFocusEffect
// =============================================================================

import React, { useCallback } from 'react';
import {
  View,
  Text,
  SectionList,
  Pressable,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getAllCustomers } from '../data/storage';
import {
  groupCustomersByDueWindow,
  getServiceStatus,
  getLastServiceDate,
} from '../utils/serviceAlerts';
import { useTheme } from '../styles/theme';
import { FontSize } from '../styles/typography';

// Color key per section — maps to theme properties
const SECTION_COLOR_KEY = {
  overdue: 'overdue',
  next30:  'warning',
  next60:  'accent',
  next90:  'accent',
  later:   'success',
};

export default function ServicesScreen({ navigation }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);

  const [sections, setSections] = React.useState([]);
  const [totalCustomers, setTotalCustomers] = React.useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getAllCustomers()
        .then((all) => {
          if (active) {
            const active_ = all.filter((c) => !c.archived);
            setSections(groupCustomersByDueWindow(active_));
            setTotalCustomers(active_.length);
          }
        })
        .catch(() => {
          // Storage read failed — keep stale data rather than crashing
        });
      return () => { active = false; };
    }, []),
  );

  const handleRowPress = (customerId) => {
    navigation.navigate('CustomersTab', {
      screen: 'CustomerDetail',
      params: { customerId },
    });
  };

  const renderSectionHeader = ({ section }) => {
    const colorKey = SECTION_COLOR_KEY[section.key] || 'textMuted';
    const color = theme[colorKey];
    return (
      <View style={[styles.sectionHeader, { borderLeftColor: color }]}>
        <Text style={[styles.sectionTitle, { color }]}>{section.title}</Text>
        <Text style={[styles.sectionCount, { color }]}>
          {section.data.length}
        </Text>
      </View>
    );
  };

  const renderItem = ({ item, section }) => {
    const status = getServiceStatus(item);
    const lastDate = getLastServiceDate(item);
    const colorKey = SECTION_COLOR_KEY[section.key] || 'textMuted';
    const accentColor = theme[colorKey];

    const lastDateStr = lastDate
      ? lastDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : 'Never serviced';

    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => handleRowPress(item.id)}
        accessibilityRole="button"
        accessibilityLabel={`${item.name || 'Customer'}, ${status.label}`}
      >
        <View style={[styles.rowAccent, { backgroundColor: accentColor }]} />
        <View style={styles.rowBody}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.name || 'Unnamed'}
          </Text>
          <View style={styles.rowMeta}>
            <Ionicons name="time-outline" size={13} color={theme.textMuted} style={styles.metaIcon} />
            <Text style={styles.rowLastDate}>{lastDateStr}</Text>
          </View>
          <Text style={[styles.rowStatus, { color: accentColor }]} numberOfLines={1}>
            {status.label}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.border} />
      </Pressable>
    );
  };

  if (totalCustomers === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.emptyFull}>
          <Ionicons name="calendar-outline" size={56} color={theme.border} />
          <Text style={styles.emptyTitle}>No customers yet</Text>
          <Text style={styles.emptyBody}>
            Add customers from the Customers tab to track their service history here.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (sections.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.emptyFull}>
          <Ionicons name="checkmark-circle-outline" size={56} color={theme.success} />
          <Text style={styles.emptyTitle}>All services current</Text>
          <Text style={styles.emptyBody}>
            No customers are overdue or coming up for service.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={renderSectionHeader}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: {
      flex:            1,
      backgroundColor: theme.background,
    },
    listContent: {
      paddingBottom: 30,
    },
    // ── Section header ──
    sectionHeader: {
      flexDirection:   'row',
      alignItems:      'center',
      justifyContent:  'space-between',
      marginTop:        20,
      marginHorizontal: 16,
      marginBottom:      6,
      paddingLeft:      10,
      borderLeftWidth:   3,
    },
    sectionTitle: {
      fontFamily: theme.fontUiBold,
      fontSize:   FontSize.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    sectionCount: {
      fontFamily: theme.fontUiBold,
      fontSize:   FontSize.sm,
    },
    // ── Row ──
    row: {
      flexDirection:     'row',
      alignItems:        'center',
      backgroundColor:   theme.cardBg,
      marginHorizontal:  16,
      borderRadius:      12,
      overflow:          'hidden',
      shadowColor:       '#000',
      shadowOffset:      { width: 0, height: 1 },
      shadowOpacity:      0.07,
      shadowRadius:        3,
      elevation:           2,
    },
    rowPressed: {
      opacity: 0.82,
    },
    rowAccent: {
      width:  4,
      alignSelf: 'stretch',
    },
    rowBody: {
      flex:              1,
      paddingVertical:   13,
      paddingHorizontal: 13,
    },
    rowName: {
      fontFamily:   theme.fontBodyBold,
      fontSize:     FontSize.base,
      color:        theme.text,
      marginBottom:  4,
    },
    rowMeta: {
      flexDirection: 'row',
      alignItems:    'center',
      marginBottom:   3,
    },
    metaIcon: {
      marginRight: 4,
    },
    rowLastDate: {
      fontFamily: theme.fontBody,
      fontSize:   FontSize.sm,
      color:      theme.textMuted,
    },
    rowStatus: {
      fontFamily: theme.fontUiMedium,
      fontSize:   FontSize.sm,
    },
    separator: {
      height: 6,
    },
    // ── Empty states ──
    emptyFull: {
      flex:              1,
      alignItems:        'center',
      justifyContent:    'center',
      paddingHorizontal: 40,
      gap:               10,
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
  });
}
