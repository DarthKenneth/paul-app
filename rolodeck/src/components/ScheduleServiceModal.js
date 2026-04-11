// =============================================================================
// ScheduleServiceModal.js - Bottom-sheet modal for scheduling a future service
// Version: 1.1
// Last Updated: 2026-04-10
//
// PROJECT:      Rolodeck (project v0.15)
// FILES:        ScheduleServiceModal.js  (this file)
//               CustomersScreen.js       (renders this modal)
//               storage.js               (addScheduledService)
//               theme.js                 (useTheme)
//               typography.js            (FontSize)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Centered overlay (justifyContent: center); card has full border radius
//   - Same DD/MM/YYYY split input + calendar picker pattern as AddServiceScreen
//   - minDate enforced to tomorrow in both the calendar (minDate prop) and
//     handleSave validation; calendar selection and save both reject today or earlier
//   - All scheduled-feature chrome uses theme.scheduled (blue) for color
//   - onSave(customerId, { date, notes }) fires and-forget; parent closes modal
//   - State resets on each open via useEffect on visible prop
//
// CHANGE LOG:
// v1.1  2026-04-10  Claude  Centered overlay instead of bottom sheet
// v1.0  2026-04-10  Claude  Initial implementation
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { useTheme } from '../styles/theme';
import { FontSize } from '../styles/typography';
import { tomorrowLocalKey } from '../utils/dateUtils';

function getTomorrowParts() {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return {
    dd:   String(t.getDate()).padStart(2, '0'),
    mm:   String(t.getMonth() + 1).padStart(2, '0'),
    yyyy: String(t.getFullYear()),
  };
}

function getTomorrowString() {
  return tomorrowLocalKey();
}

export default function ScheduleServiceModal({ visible, customer, onSave, onClose }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [dd, setDd]         = useState('');
  const [mm, setMm]         = useState('');
  const [yyyy, setYyyy]     = useState('');
  const [notes, setNotes]   = useState('');
  const [calVisible, setCalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const mmRef   = useRef(null);
  const ddRef   = useRef(null);
  const yyyyRef = useRef(null);

  // Reset to tomorrow whenever the modal opens
  useEffect(() => {
    if (visible) {
      const p = getTomorrowParts();
      setMm(p.mm);
      setDd(p.dd);
      setYyyy(p.yyyy);
      setNotes('');
      setSaving(false);
    }
  }, [visible]);

  const calSelectedDate = useMemo(() => {
    const y = parseInt(yyyy, 10);
    const m = parseInt(mm, 10);
    const d = parseInt(dd, 10);
    if (
      !isNaN(y) && !isNaN(m) && !isNaN(d) &&
      y >= 2000 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31
    ) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return getTomorrowString();
  }, [dd, mm, yyyy]);

  const calMarked = useMemo(() => ({
    [calSelectedDate]: { selected: true, selectedColor: theme.scheduled },
  }), [calSelectedDate, theme.scheduled]);

  const calTheme = useMemo(() => ({
    backgroundColor:            theme.surface,
    calendarBackground:         theme.surface,
    textSectionTitleColor:      theme.textMuted,
    selectedDayBackgroundColor: theme.scheduled,
    selectedDayTextColor:       '#ffffff',
    todayTextColor:             theme.scheduled,
    dayTextColor:               theme.text,
    textDisabledColor:          theme.border,
    arrowColor:                 theme.scheduled,
    monthTextColor:             theme.text,
    textDayFontFamily:          theme.fontBody,
    textMonthFontFamily:        theme.fontUiBold,
    textDayHeaderFontFamily:    theme.fontUiMedium,
    textDayFontSize:            FontSize.sm,
    textMonthFontSize:          FontSize.base,
    textDayHeaderFontSize:      FontSize.xs,
  }), [theme]);

  const handleDayPress = (day) => {
    const [y, m, d] = day.dateString.split('-');
    setMm(m);
    setDd(d);
    setYyyy(y);
    setCalVisible(false);
  };

  const handleSave = () => {
    if (saving) return;

    const y = parseInt(yyyy, 10);
    const m = parseInt(mm, 10);
    const d = parseInt(dd, 10);

    const validParts =
      !isNaN(y) && !isNaN(m) && !isNaN(d) &&
      y >= 2000 && y <= 2200 &&
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

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    if (parsed < tomorrow) {
      Alert.alert('Invalid Date', 'Scheduled date must be tomorrow or later.');
      return;
    }

    setSaving(true);
    const dateObj = new Date(y, m - 1, d, 12, 0, 0);
    onSave(customer.id, {
      date:  dateObj.toISOString(),
      notes: notes.trim(),
    });
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

        <View style={styles.sheet}>
          {/* ── Header ── */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="calendar" size={20} color={theme.scheduled} style={styles.headerIcon} />
              <View>
                <Text style={styles.title}>Schedule Service</Text>
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
              <Ionicons name="calendar-outline" size={22} color={theme.scheduled} />
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
            <Ionicons name="calendar-outline" size={18} color="#fff" style={styles.saveBtnIcon} />
            <Text style={styles.saveBtnText}>
              {saving ? 'Scheduling…' : 'Schedule Service'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* ── Calendar picker (nested modal) ── */}
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
              minDate={getTomorrowString()}
              markedDates={calMarked}
              onDayPress={handleDayPress}
              theme={calTheme}
              enableSwipeMonths
              renderArrow={(direction) => (
                <Ionicons
                  name={direction === 'left' ? 'chevron-back' : 'chevron-forward'}
                  size={26}
                  color={theme.scheduled}
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
      flex:            1,
      justifyContent:  'center',
      alignItems:      'center',
      backgroundColor: 'rgba(0,0,0,0.45)',
      paddingHorizontal: 20,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    sheet: {
      width:         '100%',
      backgroundColor: theme.surface,
      borderRadius:  20,
      padding:       24,
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
      backgroundColor:   theme.scheduled,
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
