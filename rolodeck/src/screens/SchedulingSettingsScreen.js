// =============================================================================
// SchedulingSettingsScreen.js - Configure scheduling rules and defaults
// Version: 1.2
// Last Updated: 2026-04-23
//
// PROJECT:      Rolodeck (project v0.27)
// FILES:        SchedulingSettingsScreen.js  (this file)
//               scheduleSettings.js          (settings storage + helpers)
//               SettingsScreen.js            (navigates here)
//               TabNavigator.js              (registers this screen)
//               theme.js                     (useTheme)
//               typography.js                (FontSize)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Settings auto-save on every change (no explicit Save button), consistent
//     with ServiceIntervalScreen pattern
//   - Work days: 7 toggle chips (Su Mo Tu We Th Fr Sa), at least one must be
//     selected (tapping the last active day is a no-op)
//   - Work hours: stepper buttons (±1 hr) for start and end; start clamped
//     [0..workEnd-1], end clamped [workStart+1..23]
//   - Durations and travel times: stepper buttons (±15 min); durations min 15,
//     travel min 0
//   - "Reset to Defaults" button restores SCHEDULE_DEFAULTS and re-saves
//
// CHANGE LOG:
// v1.2  2026-04-23  Claude  Remove Appointment Duration section (moved to ServiceTypesScreen)
//       - Removed useProfession() import and usage; removed Appointment Duration card
//       - Duration config now lives in Settings → Profession → Service Types
// v1.1  2026-04-23  Claude  Appointment Duration section driven by profession config
//       - Added useProfession(); duration steppers map over profession.serviceTypes
//         instead of hardcoded Service/Install pair; settingsKey on each type
//         determines which settings field to update (serviceMins / installMins)
// v1.0  2026-04-17  Claude  Initial implementation
// =============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/theme';
import { FontSize } from '../styles/typography';
import {
  getScheduleSettings,
  saveScheduleSettings,
  SCHEDULE_DEFAULTS,
  formatHour,
  formatDuration,
} from '../utils/scheduleSettings';

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_FULL   = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function SchedulingSettingsScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [settings, setSettings] = useState(null);

  useEffect(() => {
    getScheduleSettings().then(setSettings);
  }, []);

  const update = async (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveScheduleSettings(next);
  };

  const toggleDay = (dayNum) => {
    const current = settings.workDays;
    if (current.includes(dayNum)) {
      if (current.length === 1) return; // must keep at least one work day
      update({ workDays: current.filter((d) => d !== dayNum) });
    } else {
      update({ workDays: [...current, dayNum].sort((a, b) => a - b) });
    }
  };

  const stepHour = (field, delta) => {
    const val = settings[field] + delta;
    if (field === 'workStart') {
      if (val < 0 || val >= settings.workEnd) return;
    } else {
      if (val > 23 || val <= settings.workStart) return;
    }
    update({ [field]: val });
  };

  const stepMins = (field, delta, min = 15) => {
    const val = settings[field] + delta;
    if (val < min || val > 480) return;
    update({ [field]: val });
  };

  const resetDefaults = () => {
    Alert.alert(
      'Reset to Defaults',
      'Restore all scheduling settings to their defaults?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            setSettings({ ...SCHEDULE_DEFAULTS });
            saveScheduleSettings({ ...SCHEDULE_DEFAULTS });
          },
        },
      ],
    );
  };

  if (!settings) return null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Work Days ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Work Days</Text>
          <View style={styles.card}>
            <View style={styles.dayRow}>
              {DAY_LABELS.map((label, idx) => {
                const active = settings.workDays.includes(idx);
                return (
                  <Pressable
                    key={idx}
                    style={[styles.dayChip, active && styles.dayChipActive]}
                    onPress={() => toggleDay(idx)}
                    accessibilityLabel={`${DAY_FULL[idx]}: ${active ? 'enabled' : 'disabled'}`}
                    accessibilityRole="checkbox"
                  >
                    <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>
              Tap to enable or disable. At least one day required.
            </Text>
          </View>
        </View>

        {/* ── Work Hours ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Work Hours</Text>
          <View style={styles.card}>
            <View style={styles.stepRow}>
              <Text style={styles.stepLabel}>Start</Text>
              <View style={styles.stepper}>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => stepHour('workStart', -1)}
                  hitSlop={8}
                >
                  <Ionicons name="remove" size={18} color={theme.text} />
                </Pressable>
                <Text style={styles.stepValue}>{formatHour(settings.workStart)}</Text>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => stepHour('workStart', 1)}
                  hitSlop={8}
                >
                  <Ionicons name="add" size={18} color={theme.text} />
                </Pressable>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.stepRow}>
              <Text style={styles.stepLabel}>End</Text>
              <View style={styles.stepper}>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => stepHour('workEnd', -1)}
                  hitSlop={8}
                >
                  <Ionicons name="remove" size={18} color={theme.text} />
                </Pressable>
                <Text style={styles.stepValue}>{formatHour(settings.workEnd)}</Text>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => stepHour('workEnd', 1)}
                  hitSlop={8}
                >
                  <Ionicons name="add" size={18} color={theme.text} />
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        {/* ── Travel Time ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Travel Time</Text>
          <View style={styles.card}>
            <View style={styles.stepRow}>
              <View style={styles.stepLabelWrap}>
                <Ionicons name="arrow-forward-outline" size={16} color={theme.textSecondary} style={styles.stepIcon} />
                <Text style={styles.stepLabel}>Before</Text>
              </View>
              <View style={styles.stepper}>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => stepMins('travelBefore', -5, 0)}
                  hitSlop={8}
                >
                  <Ionicons name="remove" size={18} color={theme.text} />
                </Pressable>
                <Text style={styles.stepValue}>
                  {settings.travelBefore === 0 ? 'None' : formatDuration(settings.travelBefore)}
                </Text>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => stepMins('travelBefore', 5, 0)}
                  hitSlop={8}
                >
                  <Ionicons name="add" size={18} color={theme.text} />
                </Pressable>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.stepRow}>
              <View style={styles.stepLabelWrap}>
                <Ionicons name="arrow-back-outline" size={16} color={theme.textSecondary} style={styles.stepIcon} />
                <Text style={styles.stepLabel}>After</Text>
              </View>
              <View style={styles.stepper}>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => stepMins('travelAfter', -5, 0)}
                  hitSlop={8}
                >
                  <Ionicons name="remove" size={18} color={theme.text} />
                </Pressable>
                <Text style={styles.stepValue}>
                  {settings.travelAfter === 0 ? 'None' : formatDuration(settings.travelAfter)}
                </Text>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => stepMins('travelAfter', 5, 0)}
                  hitSlop={8}
                >
                  <Ionicons name="add" size={18} color={theme.text} />
                </Pressable>
              </View>
            </View>

            <Text style={styles.hint}>
              Travel time buffers are shown in calendar event notes. Back-to-back appointments are allowed — travel windows overlap.
            </Text>
          </View>
        </View>

        {/* ── Reset ── */}
        <Pressable
          style={({ pressed }) => [styles.resetBtn, pressed && styles.resetBtnPressed]}
          onPress={resetDefaults}
        >
          <Text style={styles.resetText}>Reset to Defaults</Text>
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.background,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop:        20,
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontFamily:    theme.fontUiBold,
      fontSize:      FontSize.xs,
      color:         theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.7,
      marginBottom:  8,
      marginLeft:    4,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius:    14,
      overflow:        'hidden',
    },
    // ── Day chips ──
    dayRow: {
      flexDirection:   'row',
      justifyContent:  'space-between',
      padding:         14,
      gap:              6,
    },
    dayChip: {
      flex:            1,
      alignItems:      'center',
      paddingVertical: 9,
      borderRadius:    8,
      backgroundColor: theme.inputBg,
      borderWidth:     1.5,
      borderColor:     theme.border,
    },
    dayChipActive: {
      backgroundColor: theme.scheduled,
      borderColor:     theme.scheduled,
    },
    dayChipText: {
      fontFamily: theme.fontUiBold,
      fontSize:   FontSize.xs,
      color:      theme.textSecondary,
    },
    dayChipTextActive: {
      color: '#ffffff',
    },
    // ── Stepper rows ──
    stepRow: {
      flexDirection:   'row',
      alignItems:      'center',
      justifyContent:  'space-between',
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    stepLabelWrap: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:            6,
    },
    stepIcon: {
      // just spacing
    },
    stepLabel: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   FontSize.base,
      color:      theme.text,
    },
    stepper: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:            4,
    },
    stepBtn: {
      width:           34,
      height:          34,
      borderRadius:    8,
      backgroundColor: theme.inputBg,
      borderWidth:     1.5,
      borderColor:     theme.border,
      alignItems:      'center',
      justifyContent:  'center',
    },
    stepValue: {
      fontFamily:  theme.fontBodyMedium,
      fontSize:    FontSize.sm,
      color:       theme.text,
      minWidth:    76,
      textAlign:   'center',
    },
    divider: {
      height:          1,
      backgroundColor: theme.border,
      marginHorizontal: 16,
    },
    hint: {
      fontFamily:   theme.fontBody,
      fontSize:     FontSize.xs,
      color:        theme.textMuted,
      paddingHorizontal: 16,
      paddingBottom: 12,
      paddingTop:    4,
    },
    // ── Reset ──
    resetBtn: {
      alignItems:      'center',
      paddingVertical: 14,
      borderRadius:    12,
      borderWidth:     1.5,
      borderColor:     theme.border,
      marginBottom:    8,
    },
    resetBtnPressed: {
      opacity: 0.6,
    },
    resetText: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   FontSize.base,
      color:      theme.textSecondary,
    },
  });
}
