// =============================================================================
// AddServiceModal.js - Centered modal for logging a completed service entry
// Version: 1.0
// Last Updated: 2026-04-10
//
// PROJECT:      Rolodeck (project v0.15)
// FILES:        AddServiceModal.js       (this file)
//               CustomerDetailScreen.js  (renders this modal)
//               storage.js               (addServiceEntry, getCustomerById,
//                                         getServiceIntervalMode,
//                                         getServiceIntervalCustomDays)
//               calendarSync.js          (syncCustomerDueDate)
//               theme.js                 (useTheme)
//               typography.js            (FontSize)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Centered overlay modal (same design as ScheduleServiceModal)
//   - Same MM/DD/YYYY split input + calendar picker as AddServiceScreen
//   - maxDate enforced to today in calendar and handleSave validation
//   - Loads interval mode on open; shows custom interval field when mode='custom'
//   - onSave fires after persisting; parent reloads customer and closes modal
//   - State resets on each open via useEffect on visible prop
//
// CHANGE LOG:
// v1.0  2026-04-10  Claude  Initial implementation (extracted from AddServiceScreen)
// =============================================================================

import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { todayLocalKey } from '../utils/dateUtils';
import {
  addServiceEntry,
  getCustomerById,
  getServiceIntervalMode,
  getServiceIntervalCustomDays,
} from '../data/storage';
import { syncCustomerDueDate } from '../utils/calendarSync';
import { useTheme } from '../styles/theme';
import { FontSize } from '../styles/typography';

function todayParts() {
  const t = new Date();
  return {
    dd:   String(t.getDate()).padStart(2, '0'),
    mm:   String(t.getMonth() + 1).padStart(2, '0'),
    yyyy: String(t.getFullYear()),
  };
}

function todayString() {
  return todayLocalKey();
}

export default function AddServiceModal({ visible, customer, onSave, onClose }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [dd, setDd]         = useState('');
  const [mm, setMm]         = useState('');
  const [yyyy, setYyyy]     = useState('');
  const [notes, setNotes]   = useState('');
  const [customDays, setCustomDays]   = useState('30');
  const [intervalMode, setIntervalMode] = useState('365');
  const [calVisible, setCalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const mmRef   = useRef(null);
  const ddRef   = useRef(null);
  const yyyyRef = useRef(null);

  const isCustom = intervalMode === 'custom';

  // Reset state and load interval mode each time the modal opens
  useEffect(() => {
    if (visible) {
      const p = todayParts();
      setMm(p.mm);
      setDd(p.dd);
      setYyyy(p.yyyy);
      setNotes('');
      setCustomDays('30');
      setSaving(false);
      setCalVisible(false);
      Promise.all([getServiceIntervalMode(), getServiceIntervalCustomDays()])
        .then(([mode, days]) => {
          setIntervalMode(mode);
          setCustomDays(String(days));
        })
        .catch(() => {});
    }
  }, [visible]);

  const calSelectedDate = useMemo(() => {
    const y = parseInt(yyyy, 10);
    const m = parseInt(mm, 10);
    const d = parseInt(dd, 10);
    if (
      yyyy.length === 4 && y >= 1900 && y <= 2100 &&
      mm.length >= 1 && m >= 1 && m <= 12 &&
      dd.length >= 1 && d >= 1 && d <= 31
    ) {
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    return todayString();
  }, [dd, mm, yyyy]);

  const calMarked = useMemo(() => ({
    [calSelectedDate]: { selected: true, selectedColor: theme.primary },
  }), [calSelectedDate, theme.primary]);

  const calTheme = useMemo(() => ({
    backgroundColor:            theme.surface,
    calendarBackground:         theme.surface,
    textSectionTitleColor:      theme.textMuted,
    selectedDayBackgroundColor: theme.primary,
    selectedDayTextColor:       '#fff',
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

  const handleDayPress = (day) => {
    setMm(String(day.month).padStart(2, '0'));
    setDd(String(day.day).padStart(2, '0'));
    setYyyy(String(day.year));
    setCalVisible(false);
  };

  const handleSave = async () => {
    if (saving) return;

    const y = parseInt(yyyy, 10);
    const m = parseInt(mm, 10);
    const d = parseInt(dd, 10);

    const validParts =
      !isNaN(y) && !isNaN(m) && !isNaN(d) &&
      y >= 1900 && y <= 2100 &&
      m >= 1 && m <= 12 &&
      d >= 1 && d <= 31;

    if (!validParts) {
      Alert.alert('Invalid Date', 'Please enter a valid day, month, and year.');
      return;
    }

    const parsed = new Date(y, m - 1, d);
    if (parsed.getFullYear() !== y || parsed.getMonth() !== m - 1 || parsed.getDate() !== d) {
      Alert.alert('Invalid Date', "That date doesn't exist — check the day and month.");
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parsed > today) {
      Alert.alert('Invalid Date', "Service date can't be in the future.");
      return;
    }

    if (isCustom) {
      const cd = parseInt(customDays, 10);
      if (isNaN(cd) || cd < 1) {
        Alert.alert('Invalid Interval', 'Please enter a valid number of days (minimum 1).');
        return;
      }
    }

    setSaving(true);
    try {
      const dateObj = new Date(y, m - 1, d, 12, 0, 0);
      const entryData = {
        date:  dateObj.toISOString(),
        type:  'service',
        notes: notes.trim(),
      };
      if (isCustom) {
        entryData.intervalDays = Math.max(1, parseInt(customDays, 10));
      }

      await addServiceEntry(customer.id, entryData);

      getCustomerById(customer.id)
        .then((c) => syncCustomerDueDate(c))
        .catch(() => {});

      onSave();
    } catch {
      Alert.alert('Error', 'Failed to save service entry.');
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={styles.card}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Header ── */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Ionicons name="add-circle" size={20} color={theme.primary} style={styles.headerIcon} />
                <View>
                  <Text style={styles.title}>Add a Service</Text>
                  {customer && (
                    <Text style={styles.subtitle} numberOfLines={1}>{customer.name}</Text>
                  )}
                </View>
              </View>
              <Pressable onPress={onClose} hitSlop={12}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>

            {/* ── Date ── */}
            <Text style={styles.label}>Date</Text>
            <View style={styles.dateRow}>
              {/* Month */}
              <View style={styles.dateSegmentWrap}>
                <TextInput
                  ref={mmRef}
                  style={styles.dateBox}
                  value={mm}
                  onChangeText={(v) => {
                    const clean = v.replace(/\D/g, '').slice(0, 2);
                    setMm(clean);
                    if (clean.length === 2) ddRef.current?.focus();
                  }}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="MM"
                  placeholderTextColor={theme.placeholder}
                />
                <Text style={styles.dateSegmentLabel}>Month</Text>
              </View>

              <Text style={styles.dateSep}>/</Text>

              {/* Day */}
              <View style={styles.dateSegmentWrap}>
                <TextInput
                  ref={ddRef}
                  style={styles.dateBox}
                  value={dd}
                  onChangeText={(v) => {
                    const clean = v.replace(/\D/g, '').slice(0, 2);
                    setDd(clean);
                    if (clean.length === 2) yyyyRef.current?.focus();
                  }}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="DD"
                  placeholderTextColor={theme.placeholder}
                />
                <Text style={styles.dateSegmentLabel}>Day</Text>
              </View>

              <Text style={styles.dateSep}>/</Text>

              {/* Year */}
              <View style={[styles.dateSegmentWrap, styles.dateSegmentYear]}>
                <TextInput
                  ref={yyyyRef}
                  style={[styles.dateBox, styles.dateBoxYear]}
                  value={yyyy}
                  onChangeText={(v) => setYyyy(v.replace(/\D/g, '').slice(0, 4))}
                  keyboardType="number-pad"
                  maxLength={4}
                  placeholder="YYYY"
                  placeholderTextColor={theme.placeholder}
                />
                <Text style={styles.dateSegmentLabel}>Year</Text>
              </View>

              {/* Calendar icon */}
              <Pressable
                style={styles.calIcon}
                onPress={() => setCalVisible(true)}
                accessibilityLabel="Open date picker"
              >
                <Ionicons name="calendar-outline" size={22} color={theme.primary} />
              </Pressable>
            </View>

            {/* ── Notes ── */}
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional notes…"
              placeholderTextColor={theme.placeholder}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            {/* ── Custom interval ── */}
            {isCustom && (
              <>
                <Text style={styles.label}>Custom Interval (days)</Text>
                <TextInput
                  style={[styles.dateBox, styles.customDaysInput]}
                  value={customDays}
                  onChangeText={(v) => setCustomDays(v.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  placeholder="e.g. 45"
                  placeholderTextColor={theme.placeholder}
                />
              </>
            )}

            {/* ── Save button ── */}
            <Pressable
              style={({ pressed }) => [
                styles.saveBtn,
                pressed && styles.saveBtnPressed,
                saving  && styles.saveBtnDisabled,
              ]}
              onPress={handleSave}
              disabled={saving}
            >
              <Ionicons name="add-circle-outline" size={18} color="#fff" style={styles.saveBtnIcon} />
              <Text style={styles.saveBtnText}>
                {saving ? 'Saving…' : 'Add a Service'}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      {/* ── Calendar picker modal ── */}
      <Modal
        visible={calVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCalVisible(false)}
      >
        <Pressable style={styles.calOverlay} onPress={() => setCalVisible(false)}>
          <Pressable style={styles.calCard} onPress={() => {}}>
            <View style={styles.calHeader}>
              <Text style={styles.calTitle}>Pick a Date</Text>
              <Pressable onPress={() => setCalVisible(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
            <Calendar
              current={calSelectedDate}
              maxDate={todayString()}
              markedDates={calMarked}
              onDayPress={handleDayPress}
              theme={calTheme}
              enableSwipeMonths
              renderArrow={(direction) => (
                <Ionicons
                  name={direction === 'left' ? 'chevron-back' : 'chevron-forward'}
                  size={26}
                  color={theme.primary}
                />
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    overlay: {
      flex:              1,
      justifyContent:    'center',
      alignItems:        'center',
      backgroundColor:   'rgba(0,0,0,0.45)',
      paddingHorizontal: 20,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    card: {
      width:           '100%',
      backgroundColor: theme.surface,
      borderRadius:    20,
      padding:         24,
      maxHeight:       '85%',
    },
    // ── Header ──
    header: {
      flexDirection:  'row',
      justifyContent: 'space-between',
      alignItems:     'flex-start',
      marginBottom:    22,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:            10,
    },
    headerIcon: {
      marginTop: 2,
    },
    title: {
      fontFamily: theme.fontHeading,
      fontSize:   FontSize.lg,
      color:      theme.text,
    },
    subtitle: {
      fontFamily: theme.fontBody,
      fontSize:   FontSize.sm,
      color:      theme.textMuted,
      marginTop:   2,
    },
    // ── Date row ──
    label: {
      fontFamily:    theme.fontUiBold,
      fontSize:      FontSize.xs,
      color:         theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing:  0.6,
      marginBottom:   8,
    },
    dateRow: {
      flexDirection: 'row',
      alignItems:    'flex-end',
      marginBottom:  20,
      gap:            4,
    },
    dateSegmentWrap: {
      alignItems: 'center',
    },
    dateSegmentYear: {
      flex: 1,
    },
    dateBox: {
      width:             56,
      borderWidth:        1.5,
      borderColor:       theme.inputBorder,
      borderRadius:      10,
      paddingVertical:   10,
      paddingHorizontal:  8,
      textAlign:         'center',
      fontFamily:        theme.fontBodyMedium,
      fontSize:          FontSize.base,
      color:             theme.text,
      backgroundColor:   theme.inputBg,
    },
    dateBoxYear: {
      width: '100%',
    },
    dateSegmentLabel: {
      fontFamily: theme.fontUi,
      fontSize:   FontSize.xxs,
      color:      theme.textMuted,
      marginTop:   4,
    },
    dateSep: {
      fontFamily:   theme.fontBodyBold,
      fontSize:     FontSize.lg,
      color:        theme.textMuted,
      marginBottom: 18,
    },
    calIcon: {
      marginBottom: 16,
      marginLeft:    8,
    },
    customDaysInput: {
      width:        '100%',
      textAlign:    'left',
      marginBottom: 20,
      paddingHorizontal: 12,
    },
    // ── Notes ──
    notesInput: {
      borderWidth:       1.5,
      borderColor:       theme.inputBorder,
      borderRadius:      10,
      paddingHorizontal: 14,
      paddingVertical:   10,
      fontFamily:        theme.fontBody,
      fontSize:          FontSize.base,
      color:             theme.text,
      backgroundColor:   theme.inputBg,
      minHeight:         72,
      marginBottom:      22,
    },
    // ── Save button ──
    saveBtn: {
      flexDirection:     'row',
      alignItems:        'center',
      justifyContent:    'center',
      backgroundColor:   theme.primary,
      borderRadius:      12,
      paddingVertical:   14,
      paddingHorizontal: 20,
    },
    saveBtnPressed: {
      opacity: 0.85,
    },
    saveBtnDisabled: {
      opacity: 0.6,
    },
    saveBtnIcon: {
      marginRight: 8,
    },
    saveBtnText: {
      fontFamily: theme.fontBodyBold,
      fontSize:   FontSize.base,
      color:      '#ffffff',
    },
    // ── Calendar modal ──
    calOverlay: {
      flex:            1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent:  'center',
      alignItems:      'center',
    },
    calCard: {
      backgroundColor: theme.surface,
      borderRadius:    16,
      width:           '90%',
      overflow:        'hidden',
    },
    calHeader: {
      flexDirection:  'row',
      justifyContent: 'space-between',
      alignItems:     'center',
      padding:         16,
    },
    calTitle: {
      fontFamily: theme.fontUiBold,
      fontSize:   FontSize.base,
      color:      theme.text,
    },
  });
}
