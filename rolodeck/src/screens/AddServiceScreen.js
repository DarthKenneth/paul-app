// =============================================================================
// AddServiceScreen.js - Add a service entry: date stamp + notes
// Version: 1.3
// Last Updated: 2026-04-06
//
// PROJECT:      Rolodeck (project v1.8)
// FILES:        AddServiceScreen.js  (this file)
//               storage.js           (addServiceEntry, getCustomerById)
//               calendarSync.js      (syncCustomerDueDate)
//               theme.js             (useTheme)
//               typography.js        (FontFamily, FontSize)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Date defaults to today in YYYY-MM-DD format, always editable
//   - No type toggle — type is stored as 'service' for all entries;
//     the "Initial Install/Service" label is derived automatically by
//     ServiceLogEntry when isInitial=true (oldest entry in the log)
//   - Notes field is optional multiline text
//   - On save: calls addServiceEntry(), calls onAlertsRefresh if provided
//     in route.params (keeps Services tab badge current), then goBack()
//   - Date validation: strict YYYY-MM-DD regex + range check (year 1900–2100,
//     verifies the parsed Date matches input to catch overflow like month 13)
//   - Double-tap protection via saving state
//   - Storage errors caught and surfaced via Alert
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial scaffold — included service/install toggle
// v1.1  2026-04-03  Claude  Removed type toggle; simplified to date + notes
//                           only per spec ("service date stamp + notes")
// v1.2  2026-04-03  Claude  Debug + harden
//                           - Fixed date validation: was accepting invalid dates
//                             like 2026-13-45 because Date constructor silently
//                             overflows; now uses strict regex + round-trip check
//                           - Added saving state for double-tap protection
//                           - Added try/catch around addServiceEntry call
// v1.3  2026-04-06  Claude  Fire-and-forget calendar sync after successful save
//                           - Fetches updated customer via getCustomerById after
//                             addServiceEntry, then calls syncCustomerDueDate
//                           - Sync errors are swallowed; never blocks save flow
// =============================================================================

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { addServiceEntry, getCustomerById } from '../data/storage';
import { syncCustomerDueDate } from '../utils/calendarSync';
import { useTheme } from '../styles/theme';
import { FontSize } from '../styles/typography';

function todayString() {
  return new Date().toISOString().split('T')[0];
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(str) {
  if (!DATE_REGEX.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  if (y < 1900 || y > 2100) return false;
  // Parse and round-trip to catch overflow (e.g. month 13, day 32)
  const parsed = new Date(y, m - 1, d);
  return (
    parsed.getFullYear() === y &&
    parsed.getMonth() === m - 1 &&
    parsed.getDate() === d
  );
}

export default function AddServiceScreen({ route, navigation }) {
  const { customerId, onAlertsRefresh } = route.params;
  const { theme } = useTheme();
  const styles = makeStyles(theme);

  const [date, setDate]     = useState(todayString());
  const [notes, setNotes]   = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    if (!isValidDate(date)) {
      Alert.alert('Invalid Date', 'Please enter a valid date in YYYY-MM-DD format (e.g. 2026-04-03).');
      return;
    }

    setSaving(true);
    try {
      const [y, m, d] = date.split('-').map(Number);
      const parsed = new Date(y, m - 1, d, 12, 0, 0);

      await addServiceEntry(customerId, {
        date:  parsed.toISOString(),
        type:  'service',
        notes: notes.trim(),
      });

      // Fire-and-forget calendar sync — never blocks or throws to the user
      getCustomerById(customerId)
        .then((customer) => syncCustomerDueDate(customer))
        .catch(() => {});

      if (typeof onAlertsRefresh === 'function') {
        onAlertsRefresh();
      }

      navigation.goBack();
    } catch {
      Alert.alert('Error', 'Failed to save service entry.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Date ── */}
          <Text style={styles.label}>Date</Text>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.placeholder}
            keyboardType="numbers-and-punctuation"
            returnKeyType="next"
          />
          <Text style={styles.hint}>Format: YYYY-MM-DD  ·  Defaults to today</Text>

          {/* ── Notes ── */}
          <Text style={[styles.label, styles.labelTop]}>Notes</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional — describe what was done…"
            placeholderTextColor={theme.placeholder}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            returnKeyType="default"
          />

          <Pressable
            style={({ pressed }) => [styles.saveBtn, (pressed || saving) && styles.saveBtnPressed]}
            onPress={handleSave}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Save service entry"
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Entry'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
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
    content: {
      padding:       20,
      paddingBottom: 48,
    },
    label: {
      fontFamily:    theme.fontBodyMedium,
      fontSize:      FontSize.xs,
      color:         theme.textMuted,
      marginBottom:   8,
      textTransform: 'uppercase',
      letterSpacing:  0.5,
    },
    labelTop: {
      marginTop: 22,
    },
    input: {
      fontFamily:        theme.fontBody,
      fontSize:          FontSize.base,
      color:             theme.text,
      backgroundColor:   theme.inputBg,
      borderWidth:        1,
      borderColor:       theme.inputBorder,
      borderRadius:      12,
      paddingVertical:   12,
      paddingHorizontal: 14,
    },
    hint: {
      fontFamily:   theme.fontBody,
      fontSize:     FontSize.xs,
      color:        theme.textMuted,
      marginTop:     6,
    },
    notesInput: {
      height: 150,
    },
    saveBtn: {
      backgroundColor: theme.primary,
      borderRadius:    14,
      paddingVertical:  15,
      alignItems:      'center',
      marginTop:        28,
    },
    saveBtnPressed: {
      opacity: 0.85,
    },
    saveBtnText: {
      fontFamily: theme.fontBodyBold,
      fontSize:   FontSize.md,
      color:      theme.surface,
    },
  });
}
