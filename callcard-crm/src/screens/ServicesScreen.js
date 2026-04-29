// =============================================================================
// ServicesScreen.js - Upcoming and overdue service list, grouped by due window
// Version: 2.7
// Last Updated: 2026-04-24
//
// PROJECT:      Rolodeck (project v0.29.0)
// FILES:        ServicesScreen.js    (this file)
//               storage.js           (getAllCustomers)
//               serviceAlerts.js     (groupCustomersByDueWindow, getServiceStatus,
//                                     getLastServiceDate)
//               CustomerDetailPane.js (right-panel detail in split view)
//               theme.js             (useTheme)
//               typography.js        (FontFamily, FontSize)
//               responsive.js        (useSplitLayout, SPLIT_LIST_WIDTH)
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
//       Dot color = urgency level: overdue=red, warning=orange, upcoming=rust, ok=green
//       Day panel items are kind-tagged: 'scheduled' rows use blue accent +
//       "Scheduled" label (plus notes if present); 'due' rows use urgency color.
//       Scheduled takes priority when a customer is both scheduled and due
//       on the same day.
//   - SCHEDULED SECTION: collected from customer.scheduledServices[], sorted soonest-
//     first, rendered at top of list with blue (theme.scheduled) chrome
//       Never-serviced customers omitted from calendar (no pinnable due date)
//       Tapping a day shows a panel of items (scheduled + due) for that date
//   - Section headers color-coded by urgency (list mode)
//   - TABLET LANDSCAPE (useSplitLayout): renders a two-panel side-by-side layout
//     — left panel is SPLIT_LIST_WIDTH (320pt) wide and holds the service list;
//     right panel holds CustomerDetailPane when a customer row is tapped. On phone,
//     tapping a row cross-tab navigates to CustomersTab → CustomerDetail as before.
//
// CHANGE LOG:
// v2.6  2026-04-24  Claude  Tablet landscape split-pane layout
//       - Imported CustomerDetailPane, useSplitLayout, SPLIT_LIST_WIDTH
//       - Added selectedCustomerId state and handleDetailBack callback
//       - handleRowPress: in split mode, sets selectedCustomerId; on phone,
//         cross-tab navigates to CustomerDetail as before
//       - All early-return render paths now wrap in split-aware root layout
//       - Split root: SafeAreaView flex-row; left panel SPLIT_LIST_WIDTH; right
//         panel CustomerDetailPane or empty-state prompt [updated ARCHITECTURE]
// v2.5.2 2026-04-17  Claude  Harden date parsing in scheduled row renderers
//        - renderScheduledItem: guards item.scheduledDate with isNaN check;
//          time row only renders when a valid date is present
//        - renderCalendarRow (scheduled): same guard on scheduledEntry.date;
//          optional-chain scheduledEntry.type reads
// v2.5.1 2026-04-17  Claude  Time and type display for scheduled service rows
//        - scheduledItems now includes type field (entry.type || 'service')
//        - renderScheduledItem (list) shows time row + type icon/label
//        - renderCalendarRow (scheduled kind) shows time row + type icon/label
// v2.5  2026-04-10  Claude  Calendar view: scheduled distinction + visible arrows
// v2.5.3  2026-04-19  Claude  Tablet width cap on SectionList content
// v1.0    2026-04-03  Claude  Initial scaffold — flat FlatList with filter chips
// v2.0    2026-04-03  Claude  Full rewrite as section-based SectionList
// v2.0.1  2026-04-03  Claude  Added try/catch on storage load in useFocusEffect
// v2.4.1 2026-04-10  Claude  Pass backTab: 'ServicesTab' in handleRowPress so back
//                            button on CustomerDetail returns to ServicesTab
// v2.4  2026-04-10  Claude  Scheduled services on calendar view
// v2.3  2026-04-10  Claude  Scheduled section at top of list
// v2.2.1 2026-04-10  Claude  Updated architecture comment: ok dot color teal → green
// v2.2  2026-04-09  Claude  Respect configurable service interval
// v2.1    2026-04-06  Claude  Calendar view toggle
// =============================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  FlatList,
  Pressable,
  StyleSheet,
  SafeAreaView,
  DeviceEventEmitter,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CLOUD_SYNC_PULLED } from '../utils/cloudSync';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import CustomerDetailPane from '../components/CustomerDetailPane';
import {
  getAllCustomers,
  getServiceIntervalMode,
  getServiceIntervalCustomDays,
  modeToIntervalDays,
} from '../data/storage';
import {
  groupCustomersByDueWindow,
  getServiceStatus,
  getLastServiceDate,
  getEffectiveIntervalForCustomer,
} from '../utils/serviceAlerts';
import { toLocalDateKey, localDateKeyFromISO, addDaysLocal } from '../utils/dateUtils';
import { useTheme } from '../styles/theme';
import { FontSize } from '../styles/typography';
import { useSplitLayout, SPLIT_LIST_WIDTH, useContentContainerStyle } from '../utils/responsive';
import { reportError } from '../utils/errorReporting';

// Color key per section — maps to theme properties
const SECTION_COLOR_KEY = {
  scheduled: 'scheduled',
  overdue:   'overdue',
  next30:    'warning',
  next60:    'accent',
  next90:    'accent',
  later:     'success',
};

function dotColorForLevel(level, theme) {
  switch (level) {
    case 'overdue':  return theme.overdue;
    case 'warning':  return theme.warning;
    case 'upcoming': return theme.accent;
    default:         return theme.success;
  }
}

function dueDateString(customer, globalIntervalDays) {
  const last = getLastServiceDate(customer);
  if (!last) return null;
  const effectiveDays = getEffectiveIntervalForCustomer(customer, globalIntervalDays);
  return toLocalDateKey(addDaysLocal(last, effectiveDays));
}

export default function ServicesScreen({ navigation }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const widthCap = useContentContainerStyle();
  const isSplit  = useSplitLayout();

  const [viewMode, setViewMode]           = useState('list');
  const [sections, setSections]           = useState([]);
  const [allCustomers, setAllCustomers]   = useState([]);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [selectedDate, setSelectedDate]   = useState(null);
  const [intervalDays, setIntervalDays]   = useState(365);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);

  const loadServices = useCallback(async () => {
    const [all, mode, customDays] = await Promise.all([
      getAllCustomers(),
      getServiceIntervalMode(),
      getServiceIntervalCustomDays(),
    ]);
    const days    = modeToIntervalDays(mode, customDays);
    const active_ = all.filter((c) => !c.archived);

    const scheduledItems = [];
    for (const c of active_) {
      for (const entry of (c.scheduledServices || [])) {
        scheduledItems.push({
          id:            entry.id,
          customerId:    c.id,
          customerName:  c.name || 'Unnamed',
          scheduledDate: entry.date,
          notes:         entry.notes,
          type:          entry.type || 'service',
        });
      }
    }
    scheduledItems.sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));

    const baseSections = groupCustomersByDueWindow(active_, days);
    const allSections  = scheduledItems.length > 0
      ? [{ key: 'scheduled', title: 'Scheduled', data: scheduledItems }, ...baseSections]
      : baseSections;

    setIntervalDays(days);
    setSections(allSections);
    setAllCustomers(active_);
    setTotalCustomers(active_.length);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadServices()
        .then(() => { /* setState guarded inside */ })
        .catch((err) => { if (active) reportError(err, { feature: 'services', action: 'load' }); });
      return () => { active = false; };
    }, [loadServices]),
  );

  // Reload after a remote merge so calendar dots and section data reflect
  // the just-arrived state without waiting for tab focus.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(CLOUD_SYNC_PULLED, () => {
      loadServices().catch((err) => reportError(err, { feature: 'services', action: 'reload-after-sync' }));
    });
    return () => sub.remove();
  }, [loadServices]);

  const handleRowPress = (customerId) => {
    if (isSplit) {
      setSelectedCustomerId(customerId);
    } else {
      navigation.navigate('CustomersTab', {
        screen: 'CustomerDetail',
        params: { customerId, backLabel: 'Services', backTab: 'ServicesTab' },
      });
    }
  };

  const handleDetailBack = useCallback(() => {
    setSelectedCustomerId(null);
  }, []);

  // ── Calendar helpers ─────────────────────────────────────────────────────────

  const markedDates = useMemo(() => {
    const result = {};
    for (const customer of allCustomers) {
      const dateStr = dueDateString(customer, intervalDays);
      if (!dateStr) continue;
      const status = getServiceStatus(customer, intervalDays);
      if (!result[dateStr]) result[dateStr] = { dots: [] };
      if (result[dateStr].dots.length < 3) {
        result[dateStr].dots.push({ key: customer.id, color: dotColorForLevel(status.level, theme) });
      }
    }
    for (const customer of allCustomers) {
      for (const entry of (customer.scheduledServices || [])) {
        const dateStr = localDateKeyFromISO(entry.date);
        if (!dateStr) continue;
        if (!result[dateStr]) result[dateStr] = { dots: [] };
        if (result[dateStr].dots.length < 3) {
          result[dateStr].dots.push({ key: `sched-${entry.id}`, color: theme.scheduled });
        }
      }
    }
    if (selectedDate) {
      if (!result[selectedDate]) result[selectedDate] = { dots: [] };
      result[selectedDate] = { ...result[selectedDate], selected: true, selectedColor: theme.primary };
    }
    return result;
  }, [allCustomers, selectedDate, theme, intervalDays]);

  const itemsOnSelectedDay = useMemo(() => {
    if (!selectedDate) return [];
    const seen = new Set();
    const result = [];
    for (const c of allCustomers) {
      if (seen.has(c.id)) continue;
      const entry = (c.scheduledServices || []).find(
        (e) => localDateKeyFromISO(e.date) === selectedDate,
      );
      if (entry) {
        seen.add(c.id);
        result.push({ customer: c, kind: 'scheduled', scheduledEntry: entry });
      }
    }
    for (const c of allCustomers) {
      if (seen.has(c.id)) continue;
      if (dueDateString(c, intervalDays) === selectedDate) {
        seen.add(c.id);
        result.push({ customer: c, kind: 'due' });
      }
    }
    return result;
  }, [allCustomers, selectedDate, intervalDays]);

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
    textDayFontSize:            theme.fontSize.sm,
    textMonthFontSize:          theme.fontSize.base,
    textDayHeaderFontSize:      theme.fontSize.xs,
  }), [theme]);

  // ── Render helpers ────────────────────────────────────────────────────────────

  const renderToggle = () => (
    <View style={styles.toggleBar}>
      <Pressable
        style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]}
        onPress={() => setViewMode('list')}
      >
        <Ionicons name="list" size={15} color={viewMode === 'list' ? theme.cardBg : theme.textMuted} style={styles.toggleIcon} />
        <Text style={[styles.toggleLabel, viewMode === 'list' && styles.toggleLabelActive]}>List</Text>
      </Pressable>
      <Pressable
        style={[styles.toggleBtn, viewMode === 'calendar' && styles.toggleBtnActive]}
        onPress={() => setViewMode('calendar')}
      >
        <Ionicons name="calendar" size={15} color={viewMode === 'calendar' ? theme.cardBg : theme.textMuted} style={styles.toggleIcon} />
        <Text style={[styles.toggleLabel, viewMode === 'calendar' && styles.toggleLabelActive]}>Calendar</Text>
      </Pressable>
    </View>
  );

  const renderSectionHeader = ({ section }) => {
    const colorKey = SECTION_COLOR_KEY[section.key] || 'textMuted';
    const color = theme[colorKey];
    return (
      <View style={[styles.sectionHeader, { borderLeftColor: color }]}>
        <Text style={[styles.sectionTitle, { color }]}>{section.title}</Text>
        <Text style={[styles.sectionCount, { color }]}>{section.data.length}</Text>
      </View>
    );
  };

  const renderScheduledItem = ({ item }) => {
    const blue = theme.scheduled;
    const d = item.scheduledDate ? new Date(item.scheduledDate) : null;
    const validDate = d && !isNaN(d.getTime());
    const dateStr = validDate
      ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : 'Date unknown';
    const timeStr = validDate
      ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      : '';
    const typeLabel = item.type === 'install' ? 'Install' : 'Service';
    const typeIcon  = item.type === 'install' ? 'home-outline' : 'construct-outline';
    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => handleRowPress(item.customerId)}
        accessibilityRole="button"
        accessibilityLabel={`${item.customerName}, scheduled ${typeLabel} ${dateStr} at ${timeStr}`}
      >
        <View style={[styles.rowAccent, { backgroundColor: blue }]} />
        <View style={styles.rowBody}>
          <Text style={styles.rowName} numberOfLines={1}>{item.customerName}</Text>
          <View style={styles.rowMeta}>
            <Ionicons name="calendar-outline" size={13} color={theme.textMuted} style={styles.metaIcon} />
            <Text style={styles.rowLastDate}>{dateStr}</Text>
          </View>
          {timeStr ? (
            <View style={styles.rowMeta}>
              <Ionicons name="time-outline" size={13} color={theme.textMuted} style={styles.metaIcon} />
              <Text style={styles.rowLastDate}>{timeStr}</Text>
            </View>
          ) : null}
          <View style={styles.rowMeta}>
            <Ionicons name={typeIcon} size={13} color={blue} style={styles.metaIcon} />
            <Text style={[styles.rowStatus, { color: blue }]}>{typeLabel}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.border} />
      </Pressable>
    );
  };

  const renderItem = ({ item, section }) => {
    if (section.key === 'scheduled') return renderScheduledItem({ item });

    const status = getServiceStatus(item, intervalDays);
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
          <Text style={styles.rowName} numberOfLines={1}>{item.name || 'Unnamed'}</Text>
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
    const { customer, kind, scheduledEntry } = item;
    if (kind === 'scheduled') {
      const blue = theme.scheduled;
      const noteText  = (scheduledEntry?.notes || '').trim();
      const d         = scheduledEntry?.date ? new Date(scheduledEntry.date) : null;
      const validDate = d && !isNaN(d.getTime());
      const timeStr   = validDate
        ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        : '';
      const typeLabel = scheduledEntry?.type === 'install' ? 'Install' : 'Service';
      const typeIcon  = scheduledEntry?.type === 'install' ? 'home-outline' : 'construct-outline';
      return (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => handleRowPress(customer.id)}
          accessibilityRole="button"
          accessibilityLabel={`${customer.name || 'Customer'}, scheduled ${typeLabel} at ${timeStr}`}
        >
          <View style={[styles.rowAccent, { backgroundColor: blue }]} />
          <View style={styles.rowBody}>
            <Text style={styles.rowName} numberOfLines={1}>{customer.name || 'Unnamed'}</Text>
            {timeStr ? (
              <View style={styles.rowMeta}>
                <Ionicons name="time-outline" size={13} color={theme.textMuted} style={styles.metaIcon} />
                <Text style={styles.rowLastDate}>{timeStr}</Text>
              </View>
            ) : null}
            <View style={styles.rowMeta}>
              <Ionicons name={typeIcon} size={13} color={blue} style={styles.metaIcon} />
              <Text style={[styles.rowStatus, { color: blue }]}>{typeLabel}</Text>
            </View>
            {noteText ? (
              <View style={styles.rowMeta}>
                <Ionicons name="document-text-outline" size={13} color={theme.textMuted} style={styles.metaIcon} />
                <Text style={styles.rowLastDate} numberOfLines={1}>{noteText}</Text>
              </View>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.border} />
        </Pressable>
      );
    }
    const status = getServiceStatus(customer, intervalDays);
    const accentColor = dotColorForLevel(status.level, theme);
    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => handleRowPress(customer.id)}
        accessibilityRole="button"
        accessibilityLabel={`${customer.name || 'Customer'}, ${status.label}`}
      >
        <View style={[styles.rowAccent, { backgroundColor: accentColor }]} />
        <View style={styles.rowBody}>
          <Text style={styles.rowName} numberOfLines={1}>{customer.name || 'Unnamed'}</Text>
          <Text style={[styles.rowStatus, { color: accentColor }]} numberOfLines={1}>{status.label}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.border} />
      </Pressable>
    );
  };

  // ── Right-panel detail (split mode only) ─────────────────────────────────────

  const detailPanel = isSplit ? (
    <View style={[styles.splitDetailPanel, { borderLeftColor: theme.border }]}>
      {selectedCustomerId ? (
        <CustomerDetailPane
          customerId={selectedCustomerId}
          onBack={handleDetailBack}
          isPaneMode
        />
      ) : (
        <View style={styles.emptyPane}>
          <Ionicons name="construct-outline" size={48} color={theme.border} />
          <Text style={styles.emptyPaneText}>Select a customer</Text>
        </View>
      )}
    </View>
  ) : null;

  // ── Empty states ─────────────────────────────────────────────────────────────

  if (totalCustomers === 0) {
    return (
      <SafeAreaView style={[styles.safe, isSplit && styles.splitRoot]}>
        <View style={isSplit ? styles.splitListPanel : styles.flex}>
          {renderToggle()}
          <View style={styles.emptyFull}>
            <Ionicons name="calendar-outline" size={56} color={theme.border} />
            <Text style={styles.emptyTitle}>No customers yet</Text>
            <Text style={styles.emptyBody}>
              Add customers from the Customers tab to track their service history here.
            </Text>
          </View>
        </View>
        {detailPanel}
      </SafeAreaView>
    );
  }

  // ── Calendar view ─────────────────────────────────────────────────────────────

  if (viewMode === 'calendar') {
    return (
      <SafeAreaView style={[styles.safe, isSplit && styles.splitRoot]}>
        <View style={isSplit ? styles.splitListPanel : styles.flex}>
          {renderToggle()}
          <Calendar
            markingType="multi-dot"
            markedDates={markedDates}
            onDayPress={(day) => setSelectedDate(
              selectedDate === day.dateString ? null : day.dateString
            )}
            theme={calendarTheme}
            style={styles.calendar}
            renderArrow={(direction) => (
              <View style={styles.calendarArrowBtn}>
                <Ionicons
                  name={direction === 'left' ? 'chevron-back' : 'chevron-forward'}
                  size={20}
                  color={theme.primary}
                />
              </View>
            )}
          />
          {selectedDate ? (
            itemsOnSelectedDay.length > 0 ? (
              <View style={styles.dayPanel}>
                <Text style={styles.dayPanelTitle}>
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric'
                  })}
                </Text>
                <FlatList
                  data={itemsOnSelectedDay}
                  keyExtractor={(item) => `${item.kind}-${item.customer.id}`}
                  renderItem={renderCalendarRow}
                  ItemSeparatorComponent={() => <View style={styles.separator} />}
                  contentContainerStyle={styles.dayPanelList}
                />
              </View>
            ) : (
              <View style={styles.dayPanelEmpty}>
                <Text style={styles.dayPanelEmptyText}>Nothing on this date.</Text>
              </View>
            )
          ) : (
            <View style={styles.dayPanelEmpty}>
              <Text style={styles.dayPanelEmptyText}>Tap a date to see who's due or scheduled.</Text>
            </View>
          )}
        </View>
        {detailPanel}
      </SafeAreaView>
    );
  }

  // ── List view — all-current empty state ───────────────────────────────────────

  if (sections.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, isSplit && styles.splitRoot]}>
        <View style={isSplit ? styles.splitListPanel : styles.flex}>
          {renderToggle()}
          <View style={styles.emptyFull}>
            <Ionicons name="checkmark-circle-outline" size={56} color={theme.success} />
            <Text style={styles.emptyTitle}>All services current</Text>
            <Text style={styles.emptyBody}>
              No customers are overdue or coming up for service.
            </Text>
          </View>
        </View>
        {detailPanel}
      </SafeAreaView>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, isSplit && styles.splitRoot]}>
      <View style={isSplit ? styles.splitListPanel : styles.flex}>
        <SectionList
          sections={sections}
          // Scheduled rows use the scheduled-service entry id; due-window rows
          // use the customer id. With UUID-style ids the chance of collision is
          // tiny but the namespace prefix removes the risk entirely.
          keyExtractor={(item) => (item.scheduledDate ? `sched-${item.id}` : `cust-${item.id}`)}
          renderSectionHeader={renderSectionHeader}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, !isSplit && widthCap]}
          stickySectionHeadersEnabled={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={renderToggle}
        />
      </View>
      {detailPanel}
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: {
      flex:            1,
      backgroundColor: theme.background,
    },
    flex: {
      flex: 1,
    },
    // ── Split layout ──
    splitRoot: {
      flexDirection: 'row',
    },
    splitListPanel: {
      width:            SPLIT_LIST_WIDTH,
      borderRightWidth:  1,
      borderRightColor: theme.border,
      backgroundColor:  theme.background,
    },
    splitDetailPanel: {
      flex:            1,
      borderLeftWidth: 1,
      backgroundColor: theme.background,
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
    // ── List ──
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
    toggleIcon: {},
    toggleLabel: {
      fontFamily: theme.fontUiMedium,
      fontSize:   theme.fontSize.sm,
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
    calendarArrowBtn: {
      width:           34,
      height:          34,
      borderRadius:    17,
      backgroundColor: theme.primaryPale,
      alignItems:      'center',
      justifyContent:  'center',
    },
    dayPanel: {
      flex:             1,
      marginTop:        12,
    },
    dayPanelTitle: {
      fontFamily:      theme.fontUiBold,
      fontSize:        theme.fontSize.sm,
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
      marginTop:   20,
      alignItems: 'center',
    },
    dayPanelEmptyText: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.sm,
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
      fontFamily:    theme.fontUiBold,
      fontSize:      theme.fontSize.sm,
      textTransform: 'uppercase',
      letterSpacing:  0.6,
    },
    sectionCount: {
      fontFamily: theme.fontUiBold,
      fontSize:   theme.fontSize.sm,
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
      width:     4,
      alignSelf: 'stretch',
    },
    rowBody: {
      flex:              1,
      paddingVertical:   13,
      paddingHorizontal: 13,
    },
    rowName: {
      fontFamily:   theme.fontBodyBold,
      fontSize:     theme.fontSize.base,
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
      fontSize:   theme.fontSize.sm,
      color:      theme.textMuted,
    },
    rowStatus: {
      fontFamily: theme.fontUiMedium,
      fontSize:   theme.fontSize.sm,
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
  });
}
