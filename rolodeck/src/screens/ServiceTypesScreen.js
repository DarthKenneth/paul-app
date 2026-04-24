// =============================================================================
// ServiceTypesScreen.js - Configure service types: visibility, duration, custom
// Version: 2.0
// Last Updated: 2026-04-24
//
// PROJECT:      Rolodeck (project v0.28)
// FILES:        ServiceTypesScreen.js        (this file)
//               ProfessionSettingsScreen.js  (navigates here)
//               scheduleSettings.js          (serviceMins/installMins for legacy types)
//               ProfessionContext.js         (typeDurations, typeConfig, saveTypeDuration,
//                                             saveTypeConfig, allServiceTypes,
//                                             effectiveServiceTypes)
//               TabNavigator.js              (registers this screen)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Unified list of all service types (default + custom) with:
//     - Eye toggle (hide/show from type picker on Add Service)
//     - Duration stepper (auto-saves on tap)
//     - Trash button for custom types
//   - Cannot hide the last visible type (eye toggle disabled)
//   - Legacy types (settingsKey): duration written back to scheduleSettings
//   - Custom/new types: duration via saveTypeDuration
//   - Add Type card at bottom: name input + icon picker + duration stepper
//
// CHANGE LOG:
// v1.0  2026-04-23  Claude  Initial implementation — duration steppers only
// v2.0  2026-04-24  Claude  Editable service types
//       - Eye toggle (hide/show) per type; last visible type is protected
//       - Trash button for user-created custom types
//       - Add Type card: name input, suggested icon grid, duration stepper
//       - allServiceTypes drives the list; effectiveServiceTypes used for last-
//         visible guard; typeConfig drives hidden set
//       [updated ARCHITECTURE]
// =============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/theme';
import { useProfession } from '../contexts/ProfessionContext';
import { FontSize } from '../styles/typography';
import {
  getScheduleSettings,
  saveScheduleSettings,
  formatDuration,
} from '../utils/scheduleSettings';

const MIN_MINS = 5;
const MAX_MINS = 480;
const STEP     = 5;

const SUGGESTED_ICONS = [
  'construct-outline', 'hammer-outline', 'build-outline',
  'settings-outline', 'cog-outline', 'refresh-outline',
  'home-outline', 'business-outline', 'car-outline',
  'water-outline', 'flask-outline', 'thermometer-outline',
  'bag-handle-outline', 'cart-outline', 'cube-outline',
  'filter-outline', 'layers-outline', 'analytics-outline',
  'speedometer-outline', 'pulse-outline', 'battery-charging-outline',
  'leaf-outline', 'fire-outline', 'sunny-outline',
  'clipboard-outline', 'document-text-outline', 'calendar-outline',
  'time-outline', 'alert-circle-outline', 'checkmark-circle-outline',
];

export default function ServiceTypesScreen() {
  const { theme } = useTheme();
  const {
    allServiceTypes,
    effectiveServiceTypes,
    typeConfig,
    typeDurations,
    saveTypeDuration,
    saveTypeConfig,
  } = useProfession();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [schedSettings, setSchedSettings] = useState(null);

  const [newName, setNewName]   = useState('');
  const [newIcon, setNewIcon]   = useState(SUGGESTED_ICONS[0]);
  const [newMins, setNewMins]   = useState(30);

  useEffect(() => {
    getScheduleSettings().then(setSchedSettings);
  }, []);

  const hiddenSet = useMemo(
    () => new Set(typeConfig.hidden || []),
    [typeConfig],
  );

  const isDefaultType = (id) => !typeConfig.custom?.some((t) => t.id === id);

  const getDuration = (sType) => {
    if (sType.settingsKey && schedSettings) {
      return schedSettings[sType.settingsKey] ?? sType.defaultMins;
    }
    return typeDurations[sType.id] ?? sType.defaultMins;
  };

  const handleStep = async (sType, delta) => {
    const current = getDuration(sType);
    const next = current + delta;
    if (next < MIN_MINS || next > MAX_MINS) return;

    if (sType.settingsKey && schedSettings) {
      const updated = { ...schedSettings, [sType.settingsKey]: next };
      setSchedSettings(updated);
      await saveScheduleSettings(updated);
    } else {
      await saveTypeDuration(sType.id, next);
    }
  };

  const handleNewStep = (delta) => {
    const next = newMins + delta;
    if (next >= MIN_MINS && next <= MAX_MINS) setNewMins(next);
  };

  const handleToggleVisible = (id) => {
    const isCurrentlyVisible = !hiddenSet.has(id);
    if (isCurrentlyVisible && effectiveServiceTypes.length <= 1) {
      Alert.alert('Cannot Hide', 'At least one service type must remain visible.');
      return;
    }
    const newHidden = isCurrentlyVisible
      ? [...(typeConfig.hidden || []), id]
      : (typeConfig.hidden || []).filter((h) => h !== id);
    saveTypeConfig({ ...typeConfig, hidden: newHidden });
  };

  const handleDelete = (id) => {
    if (effectiveServiceTypes.length <= 1 && !hiddenSet.has(id)) {
      Alert.alert('Cannot Delete', 'At least one service type must remain visible.');
      return;
    }
    Alert.alert(
      'Delete Service Type',
      'Past entries logged with this type will show as Unknown. Delete anyway?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const newCustom = (typeConfig.custom || []).filter((t) => t.id !== id);
            const newHidden = (typeConfig.hidden || []).filter((h) => h !== id);
            saveTypeConfig({ hidden: newHidden, custom: newCustom });
          },
        },
      ],
    );
  };

  const handleAddType = () => {
    const label = newName.trim();
    if (!label) {
      Alert.alert('Name Required', 'Enter a name for the service type.');
      return;
    }
    const id = `custom_${Date.now()}`;
    const newType = { id, label, icon: newIcon, defaultMins: newMins };
    const newCustom = [...(typeConfig.custom || []), newType];
    saveTypeConfig({ ...typeConfig, custom: newCustom });
    setNewName('');
    setNewIcon(SUGGESTED_ICONS[0]);
    setNewMins(30);
  };

  if (!schedSettings) return null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

        {/* ── Existing types ── */}
        <View style={styles.card}>
          {allServiceTypes.map((sType, idx) => {
            const visible = !hiddenSet.has(sType.id);
            const isLast  = visible && effectiveServiceTypes.length <= 1;
            const isCustom = !isDefaultType(sType.id);
            return (
              <React.Fragment key={sType.id}>
                {idx > 0 && <View style={styles.divider} />}
                <View style={styles.row}>
                  {/* Icon + label */}
                  <View style={[styles.rowLabel, !visible && styles.rowLabelMuted]}>
                    <Ionicons
                      name={sType.icon}
                      size={18}
                      color={
                        !visible
                          ? theme.border
                          : sType.install
                          ? theme.accent
                          : theme.primary
                      }
                      style={styles.rowIcon}
                    />
                    <Text style={[styles.typeLabel, !visible && styles.typeLabelMuted]}>
                      {sType.label}
                    </Text>
                  </View>

                  <View style={styles.rowRight}>
                    {/* Duration stepper */}
                    {visible && (
                      <View style={styles.stepper}>
                        <Pressable
                          style={styles.stepBtn}
                          onPress={() => handleStep(sType, -STEP)}
                          hitSlop={8}
                        >
                          <Ionicons name="remove" size={16} color={theme.text} />
                        </Pressable>
                        <Text style={styles.stepValue}>
                          {formatDuration(getDuration(sType))}
                        </Text>
                        <Pressable
                          style={styles.stepBtn}
                          onPress={() => handleStep(sType, STEP)}
                          hitSlop={8}
                        >
                          <Ionicons name="add" size={16} color={theme.text} />
                        </Pressable>
                      </View>
                    )}

                    {/* Eye toggle */}
                    <Pressable
                      onPress={() => handleToggleVisible(sType.id)}
                      disabled={isLast}
                      hitSlop={8}
                      style={styles.eyeBtn}
                    >
                      <Ionicons
                        name={visible ? 'eye-outline' : 'eye-off-outline'}
                        size={20}
                        color={isLast ? theme.border : visible ? theme.primary : theme.border}
                      />
                    </Pressable>

                    {/* Trash (custom types only) */}
                    {isCustom && (
                      <Pressable
                        onPress={() => handleDelete(sType.id)}
                        hitSlop={8}
                        style={styles.trashBtn}
                      >
                        <Ionicons name="trash-outline" size={18} color={theme.textMuted} />
                      </Pressable>
                    )}
                  </View>
                </View>
              </React.Fragment>
            );
          })}
        </View>

        <Text style={styles.hint}>
          Hidden types won't appear in the type picker when logging or scheduling a service.
        </Text>

        {/* ── Add Service Type ── */}
        <Text style={styles.sectionTitle}>Add Service Type</Text>
        <View style={styles.addCard}>
          <TextInput
            style={styles.nameInput}
            value={newName}
            onChangeText={setNewName}
            placeholder="Type name…"
            placeholderTextColor={theme.placeholder}
            maxLength={40}
          />

          <Text style={styles.addLabel}>Icon</Text>
          <View style={styles.iconGrid}>
            {SUGGESTED_ICONS.map((icon) => (
              <Pressable
                key={icon}
                style={[styles.iconCell, newIcon === icon && styles.iconCellSelected]}
                onPress={() => setNewIcon(icon)}
                hitSlop={4}
              >
                <Ionicons
                  name={icon}
                  size={22}
                  color={newIcon === icon ? theme.primary : theme.textSecondary}
                />
              </Pressable>
            ))}
          </View>

          <Text style={styles.addLabel}>Duration</Text>
          <View style={styles.newStepper}>
            <Pressable style={styles.stepBtnLg} onPress={() => handleNewStep(-STEP)} hitSlop={8}>
              <Ionicons name="remove" size={18} color={theme.text} />
            </Pressable>
            <Text style={styles.newStepValue}>{formatDuration(newMins)}</Text>
            <Pressable style={styles.stepBtnLg} onPress={() => handleNewStep(STEP)} hitSlop={8}>
              <Ionicons name="add" size={18} color={theme.text} />
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
            onPress={handleAddType}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>Add Type</Text>
          </Pressable>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: {
      flex:            1,
      backgroundColor: theme.background,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop:        20,
    },
    sectionTitle: {
      fontFamily:    theme.fontUiBold,
      fontSize:      FontSize.xs,
      color:         theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing:  0.7,
      marginTop:      28,
      marginBottom:   8,
      marginLeft:     4,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius:    14,
      overflow:        'hidden',
    },
    divider: {
      height:           StyleSheet.hairlineWidth,
      backgroundColor:  theme.border,
      marginHorizontal: 16,
    },
    row: {
      flexDirection:     'row',
      alignItems:        'center',
      justifyContent:    'space-between',
      paddingVertical:   14,
      paddingHorizontal: 16,
    },
    rowLabel: {
      flexDirection: 'row',
      alignItems:    'center',
      flex:           1,
    },
    rowLabelMuted: {
      opacity: 0.5,
    },
    rowIcon: {
      marginRight: 10,
    },
    typeLabel: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   FontSize.base,
      color:      theme.text,
    },
    typeLabelMuted: {
      color: theme.textMuted,
    },
    rowRight: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:            6,
    },
    stepper: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:            4,
    },
    stepBtn: {
      width:           30,
      height:          30,
      borderRadius:    8,
      backgroundColor: theme.inputBg,
      borderWidth:     1.5,
      borderColor:     theme.border,
      alignItems:      'center',
      justifyContent:  'center',
    },
    stepValue: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   FontSize.xs,
      color:      theme.text,
      minWidth:   58,
      textAlign:  'center',
    },
    eyeBtn: {
      marginLeft: 4,
    },
    trashBtn: {
      marginLeft: 2,
    },
    hint: {
      fontFamily:        theme.fontBody,
      fontSize:          FontSize.xs,
      color:             theme.textMuted,
      paddingTop:        10,
      paddingHorizontal: 4,
      lineHeight:        FontSize.xs * 1.6,
    },
    // ── Add type card ──
    addCard: {
      backgroundColor: theme.surface,
      borderRadius:    14,
      padding:         16,
    },
    nameInput: {
      fontFamily:        theme.fontBody,
      fontSize:          FontSize.base,
      color:             theme.text,
      backgroundColor:   theme.inputBg,
      borderWidth:       1,
      borderColor:       theme.inputBorder,
      borderRadius:      10,
      paddingVertical:   11,
      paddingHorizontal: 13,
      marginBottom:      16,
    },
    addLabel: {
      fontFamily:    theme.fontUiBold,
      fontSize:      FontSize.xs,
      color:         theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing:  0.6,
      marginBottom:   10,
    },
    iconGrid: {
      flexDirection: 'row',
      flexWrap:      'wrap',
      gap:            8,
      marginBottom:   16,
    },
    iconCell: {
      width:           44,
      height:          44,
      borderRadius:    10,
      alignItems:      'center',
      justifyContent:  'center',
      backgroundColor: theme.inputBg,
      borderWidth:     1.5,
      borderColor:     theme.inputBorder,
    },
    iconCellSelected: {
      borderColor:     theme.primary,
      backgroundColor: theme.primaryPale || (theme.primary + '18'),
    },
    newStepper: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:            8,
      marginBottom:  18,
    },
    stepBtnLg: {
      width:           38,
      height:          38,
      borderRadius:    10,
      backgroundColor: theme.inputBg,
      borderWidth:     1.5,
      borderColor:     theme.border,
      alignItems:      'center',
      justifyContent:  'center',
    },
    newStepValue: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   FontSize.base,
      color:      theme.text,
      minWidth:   80,
      textAlign:  'center',
    },
    addBtn: {
      flexDirection:   'row',
      alignItems:      'center',
      justifyContent:  'center',
      gap:              6,
      backgroundColor: theme.primary,
      borderRadius:    10,
      paddingVertical: 13,
    },
    addBtnPressed: {
      opacity: 0.85,
    },
    addBtnText: {
      fontFamily: theme.fontBodyBold,
      fontSize:   FontSize.base,
      color:      '#fff',
    },
  });
}
