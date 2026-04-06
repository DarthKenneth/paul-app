// =============================================================================
// ServicesScreen.js - Upcoming and overdue service list, grouped by due window
// Version: 2.1
// Last Updated: 2026-04-06
//
// PROJECT:      Rolodeck (project v1.7)
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
//   - Two view modes: 'list' and 'calendar', toggled via segment bar
//   - LIST MODE:
//       SectionList driven by groupCustomersByDueWindow() from serviceAlerts.js
//       Sections: Overdue / Next 30 Days / Next 31-60 Days / Next 61-90 Days / Later
//       Empty sections omitted by groupCustomersByDueWindow
//   - CALENDAR MODE:
//       react-native-calendars Calendar component
//       Each customer's due date (last service + 365 days) shown as a dot
//       Dot color = urgency level: overdue=red, warning=orange, upcoming=rust, ok=teal
//       Never-serviced customers omitted from calendar (no pinnable due date)
//       Tapping a day shows a panel of customers due on that date
//   - Tapping a customer row navigates cross-tab to CustomersTab → CustomerDetail
//   - Section headers color-coded by urgency (list mode)
//
// CHANGE LOG:
// v1.0    2026-04-03  Claude  Initial scaffold — flat FlatList with filter chips
// v2.0    2026-04-03  Claude  Full rewrite as section-based SectionList
//         - Replaced filter chips with automatic due-window sections
//         - Rows now show last service date and status sub-line
//         - Section headers color-coded by urgency
//         - Empty state handles both zero customers and all-current cases
// v2.0.1  2026-04-03  Claude  Added try/catch on storage load in useFocusEffect
// v2.1    2026-04-06  Claude  Calendar view toggle
//         - Added List/Calendar segment bar at top of screen
//         - Calendar view shows each customer's due date as an urgency-colored dot
//         - Tapping a calendar day reveals a panel of customers due on that date
//         - Never-serviced customers excluded from calendar (no pinnable due date)
//         - Added allCustomers state to support calendar data preparation
//         - Added react-native-calendars dependency [updated ARCHITECTURE]
// =============================================================================

import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  SectionList,
  FlatList,
  Pressable,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { getAllCustomers } from '../data/storage';
import {
  groupCustomersByDueWindow,
  getServiceStatus,
  getLastServiceDate,
} from '../utils/serviceAlerts';
import { useTheme } from '../styles/theme';
import { FontSize } from '../styles/typography';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const SERVICE_INTERVAL_DAYS = 365;

// Color key per section — maps to theme properties
const SECTION_COLOR_KEY = {
  overdue: 'overdue',
  next30:  'warning',
  next60:  'accent',
  next90:  'accent',
  later:   'success',
};

function dotColorForLevel(level, theme) {
  switch (level) {
    case 'overdue':  return theme.overdue;
    case 'warning':  return theme.warning;
    case 'upcoming': return theme.accent;
    default:         return theme.success;
  }
}

function dueDateString(customer) {
  const last = getLastServiceDate(customer);
  if (!last) return null;
  const due = new Date(last.getTime() + SERVICE_INTERVAL_DAYS * MS_PER_DAY);
  return due.toISOString().split('T')[0]; // YYYY-MM-DD
}

export default function ServicesScreen({ navigation }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);

  const [viewMode, setViewMode]           = React.useState('list');
  const [sections, setSections]           = React.useState([]);
  const [allCustomers, setAllCustomers]   = React.useState([]);
  const [totalCustomers, setTotalCustomers] = React.useState(0);
  const [selectedDate, setSelectedDate]   = React.useState(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getAllCustomers()
        .then((all) => {
          if (active) {
            const active_ = all.filter((c) => !c.archived);
            setSections(groupCustomersByDueWindow(active_));
            setAllCustomers(active_);
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

  // ── Calendar helpers ────────────────────────────────────────────────────────

  const markedDates = useMemo(() => {
    const result = {};
    for (const customer of allCustomers) {
      const dateStr = dueDateString(customer);
      if (!dateStr) continue; // skip never-serviced
      const status = getServiceStatus(customer);
      if (!result[dateStr]) result[dateStr] = { dots: [] };
      // Cap at 3 dots per day to avoid visual overflow
      if (result[dateStr].dots.length < 3) {
        result[dateStr].dots.push({
          key:   customer.id,
          color: dotColorForLevel(status.level, theme),
        });
      }
    }
    if (selectedDate) {
      if (!result[selectedDate]) result[selectedDate] = { dots: [] };
      result[selectedDate] = {
        ...result[selectedDate],
        selected:      true,
        selectedColor: theme.primary,
      };
    }
    return result;
  }, [allCustomers, selectedDate, theme]);

  const customersOnSelectedDay = useMemo(() => {
    if (!selectedDate) return [];
    return allCustomers.filter((c) => dueDateString(c) === selectedDate);
  }, [allCustomers, selectedDate]);

  const calendarTheme = useMemo(() => ({
    backgroundColor:            theme.surface,
    calendarBackground:         theme.surface,
    textSectionTitleColor:      theme.textMuted,
    selectedDayBackgroundColor: theme.primary,
    selectedDayTextColor:       theme.cardBg,
    todayTextColor:             theme.primary,
    dayTextColor:               theme.text,
    textDisabledColor:          theme.border,
    arrowColor:                 theme.primary,
    monthTextColor:             theme.text,
    textDayFontFamily:          theme.fontBody,
    textMonthFontFamily:        theme.fontUiBold,
    textDayHeaderFontFamily:    theme.fontUiMedium,
    textDayFontSize:            FontSize.sm,
    textMonthFontSize:          FontSize.base,
    textDayHeaderFontSize:      FontSize.xs,
  }), [theme]);

  // ── Render helpers ──────────────────────────────────────────────────────────

  const renderToggle = () => (
    <View style={styles.toggleBar}>
      <Pressable
        style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]}
        onPress={() => setViewMode('list')}
      >
        <Ionicons
          name="list"
          size={15}
          color={viewMode === 'list' ? theme.cardBg : theme.textMuted}
          style={styles.toggleIcon}
        />
        <Text style={[styles.toggleLabel, viewMode === 'list' && styles.toggleLabelActive]}>
          List
        </Text>
      </Pressable>
      <Pressable
        style={[styles.toggleBtn, viewMode === 'calendar' && styles.toggleBtnActive]}
        onPress={() => setViewMode('calendar')}
      >
        <Ionicons
          name="calendar"
          size={15}
          color={viewMode === 'calendar' ? theme.cardBg : theme.textMuted}
          style={styles.toggleIcon}
        />
        <Text style={[styles.toggleLabel, viewMode === 'calendar' && styles.toggleLabelActive]}>
          Calendar
        </Text>
      </Pressable>
    </View>
  );

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

  const renderCalendarRow = ({ item }) => {
    const status = getServiceStatus(item);
    const accentColor = dotColorForLevel(status.level, theme);
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
          <Text style={[styles.rowStatus, { color: accentColor }]} numberOfLines={1}>
            {status.label}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.border} />
      </Pressable>
    );
  };

  // ── Empty states ────────────────────────────────────────────────────────────

  if (totalCustomers === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        {renderToggle()}
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

  // ── Calendar view ───────────────────────────────────────────────────────────

  if (viewMode === 'calendar') {
    return (
      <SafeAreaView style={styles.safe}>
        {renderToggle()}
        <Calendar
          markingType="multi-dot"
          markedDates={markedDates}
          onDayPress={(day) => setSelectedDate(
            selectedDate === day.dateString ? null : day.dateString
          )}
          theme={calendarTheme}
          style={styles.calendar}
        />
        {selectedDate ? (
          customersOnSelectedDay.length > 0 ? (
            <View style={styles.dayPanel}>
              <Text style={styles.dayPanelTitle}>
                Due {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric'
                })}
              </Text>
              <FlatList
                data={customersOnSelectedDay}
                keyExtractor={(item) => item.id}
                renderItem={renderCalendarRow}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                contentContainerStyle={styles.dayPanelList}
              />
            </View>
          ) : (
            <View style={styles.dayPanelEmpty}>
              <Text style={styles.dayPanelEmptyText}>No customers due on this date.</Text>
            </View>
          )
        ) : (
          <View style={styles.dayPanelEmpty}>
            <Text style={styles.dayPanelEmptyText}>Tap a date to see who's due.</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // ── List view ───────────────────────────────────────────────────────────────

  if (sections.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        {renderToggle()}
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
        ListHeaderComponent={renderToggle}
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
    // ── Toggle ──
    toggleBar: {
      flexDirection:    'row',
      margin:           16,
      marginBottom:      8,
      backgroundColor:  theme.border,
      borderRadius:     10,
      padding:           3,
    },
    toggleBtn: {
      flex:           1,
      flexDirection:  'row',
      alignItems:     'center',
      justifyContent: 'center',
      paddingVertical: 7,
      borderRadius:    8,
      gap:             5,
    },
    toggleBtnActive: {
      backgroundColor: theme.primary,
    },
    toggleIcon: {
      // gap on parent handles spacing
    },
    toggleLabel: {
      fontFamily: theme.fontUiMedium,
      fontSize:   FontSize.sm,
      color:      theme.textMuted,
    },
    toggleLabelActive: {
      color: theme.cardBg,
    },
    // ── Calendar ──
    calendar: {
      marginHorizontal: 12,
      borderRadius:      12,
      overflow:         'hidden',
    },
    dayPanel: {
      flex:             1,
      marginTop:        12,
    },
    dayPanelTitle: {
      fontFamily:      theme.fontUiBold,
      fontSize:        FontSize.sm,
      color:           theme.textSecondary,
      textTransform:   'uppercase',
      letterSpacing:    0.6,
      marginHorizontal: 16,
      marginBottom:      8,
    },
    dayPanelList: {
      paddingBottom: 30,
    },
    dayPanelEmpty: {
      marginTop:    20,
      alignItems:  'center',
    },
    dayPanelEmptyText: {
      fontFamily: theme.fontBody,
      fontSize:   FontSize.sm,
      color:      theme.textMuted,
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
