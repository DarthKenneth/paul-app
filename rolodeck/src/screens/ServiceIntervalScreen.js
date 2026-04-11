// =============================================================================
// ServiceIntervalScreen.js - Pick the default service reminder interval
// Version: 1.0
// Last Updated: 2026-04-09
//
// PROJECT:      Rolodeck (project v0.14.1)
// FILES:        ServiceIntervalScreen.js  (this file)
//               storage.js               (getServiceIntervalMode,
//                                          saveServiceIntervalMode,
//                                          getServiceIntervalCustomDays,
//                                          saveServiceIntervalCustomDays,
//                                          modeToIntervalDays)
//               SettingsScreen.js        (navigates here)
//               TabNavigator.js          (registers this screen in Settings stack)
//               theme.js                 (useTheme)
//               typography.js            (FontSize)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Option list: 30 Days / 60 Days / 90 Days / 6 Months / 1 Year / Custom
//   - Tapping a preset saves the mode immediately (no Save button)
//   - Custom option: reveals a text input for number of days; saved on blur
//     or when the user taps Done on the keyboard
//   - When mode changes back from custom to a preset, the custom days value
//     is preserved in storage so it's remembered if they switch back
//   - The per-entry intervalDays on service log entries is NOT touched here —
//     that stays with the entry until a new service is logged
//
// CHANGE LOG:
// v1.0  2026-04-09  Claude  Initial implementation
// =============================================================================

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/theme';
import { FontSize } from '../styles/typography';
import {
  getServiceIntervalMode,
  saveServiceIntervalMode,
  getServiceIntervalCustomDays,
  saveServiceIntervalCustomDays,
} from '../data/storage';

const INTERVAL_OPTIONS = [
  { mode: '30',     label: '30 Days'  },
  { mode: '60',     label: '60 Days'  },
  { mode: '90',     label: '90 Days'  },
  { mode: '180',    label: '6 Months' },
  { mode: '365',    label: '1 Year'   },
  { mode: 'custom', label: 'Custom'   },
];

export default function ServiceIntervalScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [mode, setMode]             = useState('365');
  const [customDays, setCustomDays] = useState('30');
  const customInputRef              = useRef(null);

  useEffect(() => {
    let active = true;
    Promise.all([getServiceIntervalMode(), getServiceIntervalCustomDays()]).then(
      ([m, d]) => {
        if (active) {
          setMode(m);
          setCustomDays(String(d));
        }
      },
    );
    return () => { active = false; };
  }, []);

  const handleSelectMode = async (selected) => {
    setMode(selected);
    await saveServiceIntervalMode(selected);
    if (selected === 'custom') {
      // small delay so the input mounts before we focus it
      setTimeout(() => customInputRef.current?.focus(), 100);
    }
  };

  const handleCustomDaysBlur = async () => {
    const parsed = parseInt(customDays, 10);
    const safe   = isNaN(parsed) || parsed < 1 ? 30 : parsed;
    setCustomDays(String(safe));
    await saveServiceIntervalCustomDays(safe);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.desc}>
            How often customers should be serviced. Used to compute due dates
            across the app. Custom lets you enter a specific day count when
            logging each new service.
          </Text>

          <View style={styles.card}>
            {INTERVAL_OPTIONS.map((opt, idx) => {
              const active = mode === opt.mode;
              const isLast = idx === INTERVAL_OPTIONS.length - 1;
              return (
                <React.Fragment key={opt.mode}>
                  <Pressable
                    style={styles.row}
                    onPress={() => handleSelectMode(opt.mode)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={opt.label}
                  >
                    <Text style={[styles.rowLabel, active && styles.rowLabelActive]}>
                      {opt.label}
                    </Text>
                    {active && (
                      <Ionicons name="checkmark" size={20} color={theme.primary} />
                    )}
                  </Pressable>

                  {/* Custom days input — only shown when custom is active */}
                  {opt.mode === 'custom' && mode === 'custom' && (
                    <View style={styles.customInputRow}>
                      <TextInput
                        ref={customInputRef}
                        style={styles.customInput}
                        value={customDays}
                        onChangeText={setCustomDays}
                        onBlur={handleCustomDaysBlur}
                        placeholder="e.g. 45"
                        placeholderTextColor={theme.placeholder}
                        keyboardType="number-pad"
                        returnKeyType="done"
                        maxLength={4}
                        accessibilityLabel="Custom interval in days"
                      />
                      <Text style={styles.customInputSuffix}>days</Text>
                    </View>
                  )}

                  {!isLast && <View style={styles.divider} />}
                </React.Fragment>
              );
            })}
          </View>
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
      padding:       18,
      paddingBottom: 48,
    },
    desc: {
      fontFamily:   theme.fontBody,
      fontSize:     FontSize.sm,
      color:        theme.textMuted,
      lineHeight:   FontSize.sm * 1.6,
      marginBottom: 16,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius:    16,
      shadowColor:     '#000',
      shadowOffset:    { width: 0, height: 1 },
      shadowOpacity:   0.05,
      shadowRadius:    4,
      elevation:       1,
      overflow:        'hidden',
    },
    row: {
      flexDirection:   'row',
      alignItems:      'center',
      justifyContent:  'space-between',
      paddingVertical:  15,
      paddingHorizontal: 18,
    },
    rowLabel: {
      fontFamily: theme.fontBody,
      fontSize:   FontSize.base,
      color:      theme.text,
    },
    rowLabelActive: {
      fontFamily: theme.fontBodyMedium,
      color:      theme.primary,
    },
    divider: {
      height:          StyleSheet.hairlineWidth,
      backgroundColor: theme.border,
      marginLeft:       18,
    },
    customInputRow: {
      flexDirection:   'row',
      alignItems:      'center',
      paddingHorizontal: 18,
      paddingBottom:    14,
      gap:              10,
    },
    customInput: {
      fontFamily:        theme.fontBody,
      fontSize:          FontSize.base,
      color:             theme.text,
      backgroundColor:   theme.inputBg,
      borderWidth:        1,
      borderColor:       theme.inputBorder,
      borderRadius:      10,
      paddingVertical:    9,
      paddingHorizontal: 12,
      width:              80,
      textAlign:         'center',
    },
    customInputSuffix: {
      fontFamily: theme.fontBody,
      fontSize:   FontSize.sm,
      color:      theme.textMuted,
    },
  });
}
