// =============================================================================
// ServicesScreen.js - Upcoming and overdue service list, grouped by due window
// Version: 2.5.3
// Last Updated: 2026-04-19
//
// PROJECT:      Rolodeck (project v0.25.0)
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
//       Dot color = urgency level: overdue=red, warning=orange, upcoming=rust, ok=green
//       Day panel items are kind-tagged: 'scheduled' rows use blue accent +
//       "Scheduled" label (plus notes if present); 'due' rows use urgency color.
//       Scheduled takes priority when a customer is both scheduled and due
//       on the same day.
//   - SCHEDULED SECTION: collected from customer.scheduledServices[], sorted soonest-
//     first, rendered at top of list with blue (theme.scheduled) chrome
//       Never-serviced customers omitted from calendar (no pinnable due date)
//       Tapping a day shows a panel of items (scheduled + due) for that date
//   - Tapping a customer row navigates cross-tab to CustomersTab → CustomerDetail
//   - Section headers color-coded by urgency (list mode)
//
// CHANGE LOG:
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
//       - Reworked customersOnSelectedDay → itemsOnSelectedDay, tagging each
//         item with kind ('scheduled' | 'due') plus the matching scheduledEntry
//       - renderCalendarRow now branches on kind: scheduled rows render blue
//         accent + "Scheduled" label + notes meta line (matches list view);
//         due rows keep urgency accent + status label
//       - Scheduled takes priority when a customer is both scheduled and due
//         on the same day (deduped via seen Set)
//       - Dropped misleading "Due" prefix from day panel title — now just the
//         date, since the panel can contain both kinds
//       - Empty-state copy updated: "Nothing on this date." and
//         "Tap a date to see who's due or scheduled."
//       - keyExtractor changed from item.id to `${kind}-${customer.id}`
//       - Month navigation arrows now render as Ionicons chevrons inside a
//         34×34 primaryPale-filled circle (renderArrow prop) so they're
//         clearly visible against the surface background — the default tiny
//         arrows were easy to miss [updated ARCHITECTURE]
// v2.5.3  2026-04-19  Claude  Tablet width cap on SectionList content
// v1.0    2026-04-03  Claude  Initial scaffold — flat FlatList with filter chips
// v2.0    2026-04-03  Claude  Full rewrite as section-based SectionList
//         - Replaced filter chips with automatic due-window sections
//         - Rows now show last service date and status sub-line
//         - Section headers color-coded by urgency
//         - Empty state handles both zero customers and all-current cases
// v2.0.1  2026-04-03  Claude  Added try/catch on storage load in useFocusEffect
// v2.4.1 2026-04-10  Claude  Pass backTab: 'ServicesTab' in handleRowPress so back
//                            button on CustomerDetail returns to ServicesTab
// v2.4  2026-04-10  Claude  Scheduled services on calendar view
//       - markedDates now adds blue (theme.scheduled) dots for each customer's
//         scheduledServices entries in addition to due-date dots
//       - customersOnSelectedDay includes customers matched by scheduled entry
//         date as well as by due-date; deduped via Set
// v2.3  2026-04-10  Claude  Scheduled section at top of list
//       - Collects scheduledServices from all customers; sorts by date ascending
//       - Prepends { key: 'scheduled', title: 'Scheduled' } section when non-empty
//       - renderItem delegates to renderScheduledItem for scheduled section
//       - SECTION_COLOR_KEY.scheduled = 'scheduled' (blue) [updated ARCHITECTURE]
// v2.2.1 2026-04-10  Claude  Updated architecture comment: ok dot color teal → green
//                            (follows colors.js v1.1 success color change) [updated ARCHITECTURE]
// v2.2  2026-04-09  Claude  Respect configurable service interval
//       - Loads interval preference (mode + customDays) in useFocusEffect
//       - Passes intervalDays to groupCustomersByDueWindow, getServiceStatus
//       - dueDateString() now accepts globalIntervalDays and uses
//         getEffectiveIntervalForCustomer to respect per-entry overrides
//       - Imported getServiceIntervalMode, getServiceIntervalCustomDays,
//         modeToIntervalDays from storage; getEffectiveIntervalForCustomer
//         from serviceAlerts
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
import { useContentContainerStyle } from '../utils/responsive';

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

// Uses per-entry intervalDays if present, else the provided global interval.
// Returns the LOCAL-calendar due date key (YYYY-MM-DD). Previously this used
// toISOString() which returned UTC — shifted by 1 day for users in non-UTC
// timezones whose last service happened near local midnight.
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

  const [viewMode, setViewMode]           = React.useState('list');
  const [sections, setSections]           = React.useState([]);
  const [allCustomers, setAllCustomers]   = React.useState([]);
  const [totalCustomers, setTotalCustomers] = React.useState(0);
  const [selectedDate, setSelectedDate]   = React.useState(null);
  const [intervalDays, setIntervalDays]   = React.useState(365);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([
        getAllCustomers(),
        getServiceIntervalMode(),
        getServiceIntervalCustomDays(),
      ])
        .then(([all, mode, customDays]) => {
          if (active) {
            const days    = modeToIntervalDays(mode, customDays);
            const active_ = all.filter((c) => !c.archived);

            // Build scheduled section — flatten all scheduledServices, sort soonest first
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
      params: { customerId, backLabel: 'Services', backTab: 'ServicesTab' },
    });
  };

  // ── Calendar helpers ────────────────────────────────────────────────────────

  const markedDates = useMemo(() => {
    const result = {};

    // Due-date dots (service interval based)
    for (const customer of allCustomers) {
      const dateStr = dueDateString(customer, intervalDays);
      if (!dateStr) continue;
      const status = getServiceStatus(customer, intervalDays);
      if (!result[dateStr]) result[dateStr] = { dots: [] };
      if (result[dateStr].dots.length < 3) {
        result[dateStr].dots.push({
          key:   customer.id,
          color: dotColorForLevel(status.level, theme),
        });
      }
    }

    // Scheduled service dots (blue) — extract LOCAL date from stored ISO
    for (const customer of allCustomers) {
      for (const entry of (customer.scheduledServices || [])) {
        const dateStr = localDateKeyFromISO(entry.date);
        if (!dateStr) continue;
        if (!result[dateStr]) result[dateStr] = { dots: [] };
        if (result[dateStr].dots.length < 3) {
          result[dateStr].dots.push({
            key:   `sched-${entry.id}`,
            color: theme.scheduled,
          });
        }
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
  }, [allCustomers, selectedDate, theme, intervalDays]);

  // Day-panel items: each tagged with kind so the renderer can style scheduled
  // entries differently (blue + "Scheduled" label) from due-date matches (urgency
  // color + status label). Scheduled entries take priority over due-date for the
  // same customer — a customer scheduled on their due day renders as scheduled.
  const itemsOnSelectedDay = useMemo(() => {
    if (!selectedDate) return [];
    const seen = new Set();
    const result = [];

    // Scheduled first (more concrete — the user explicitly put it on this day).
    // Compare via local date key so users near midnight in non-UTC timezones
    // still see their scheduled entries on the day they picked.
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

    // Due-date matches after, skipping customers already added as scheduled
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
    const { customer, kind, scheduledEntry } = item;

    // ── Scheduled row — blue accent + "Scheduled" label, matches list view ──
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
            <Text style={styles.rowName} numberOfLines={1}>
              {customer.name || 'Unnamed'}
            </Text>
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

    // ── Due-date row — urgency accent + status label ──
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
          <Text style={styles.rowName} numberOfLines={1}>
            {customer.name || 'Unnamed'}
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
        contentContainerStyle={[styles.listContent, widthCap]}
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
