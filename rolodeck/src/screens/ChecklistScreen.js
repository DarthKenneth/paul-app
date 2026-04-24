// =============================================================================
// ChecklistScreen.js - Configure service checklist items visibility and custom items
// Version: 2.1.1
// Last Updated: 2026-04-24
//
// PROJECT:      Rolodeck (project v0.28.4)
// FILES:        ChecklistScreen.js           (this file)
//               ProfessionSettingsScreen.js  (navigates here)
//               ProfessionContext.js         (checklistItems, checklistVisible,
//                                             saveChecklistItem, saveChecklistVisible,
//                                             saveChecklistCustom)
//               AddServiceModal.js           (renders visible checklist items)
//               AddServiceScreen.js          (renders visible checklist items)
//               TabNavigator.js              (registers this screen)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Master toggle at top: "Show checklist on Add Service"
//   - Individual eye toggle per checklist item (visible/hidden on Add Service form)
//   - Trash button for user-created custom items
//   - Add Item card at bottom: label input + check/measure type selector
//   - All changes auto-save — no Save button
//
// CHANGE LOG:
// v1.0  2026-04-23  Claude  Initial implementation — visibility toggles only
// v2.1.1  2026-04-24  Claude  Preserve unit field on custom items during delete and add ops
// v2.1  2026-04-24  Claude  Unit field for Measurement type items (e.g. gpg, ppm)
// v2.0  2026-04-24  Claude  Custom checklist items
//       - Trash button for custom items; delete does not affect default items
//       - Add Item card: label input + check/measure type chips + Add button
//       - saveChecklistCustom wired for add and delete operations
//       [updated ARCHITECTURE]
// =============================================================================

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Animated,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/theme';
import { useProfession } from '../contexts/ProfessionContext';
import { FontSize } from '../styles/typography';

function ToggleRow({ value, onToggle, label, desc, theme, styles }) {
  const anim = React.useRef(new Animated.Value(value ? 1 : 0)).current;

  const toggle = () => {
    const next = !value;
    Animated.spring(anim, {
      toValue: next ? 1 : 0,
      useNativeDriver: false,
      friction: 6,
      tension: 80,
    }).start();
    onToggle(next);
  };

  const bg = anim.interpolate({ inputRange: [0, 1], outputRange: [theme.border, theme.primary] });
  const knob = anim.interpolate({ inputRange: [0, 1], outputRange: [2, 20] });

  return (
    <Pressable style={styles.toggleRow} onPress={toggle} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <View style={styles.toggleLeft}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {!!desc && <Text style={styles.toggleDesc}>{desc}</Text>}
      </View>
      <Animated.View style={[styles.toggle, { backgroundColor: bg }]}>
        <Animated.View style={[styles.toggleKnob, { transform: [{ translateX: knob }] }]} />
      </Animated.View>
    </Pressable>
  );
}

export default function ChecklistScreen() {
  const { theme } = useTheme();
  const {
    checklistItems,
    checklistVisible,
    saveChecklistItem,
    saveChecklistVisible,
    saveChecklistCustom,
    profession,
  } = useProfession();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType]   = useState('check');
  const [newUnit, setNewUnit]   = useState('');

  const isDefaultItem = (id) => profession.checklist?.some((i) => i.id === id);

  const handleDelete = (item) => {
    Alert.alert(
      'Delete Checklist Item',
      `Remove "${item.label}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // customChecklistItems is derived from the full list minus defaults
            const defaultIds = new Set((profession.checklist || []).map((i) => i.id));
            const currentCustom = checklistItems
              .filter((i) => !defaultIds.has(i.id))
              .map(({ id, label, type, unit }) => ({ id, label, type, ...(unit && { unit }) }));
            const newCustom = currentCustom.filter((i) => i.id !== item.id);
            saveChecklistCustom(newCustom);
          },
        },
      ],
    );
  };

  const handleAddItem = () => {
    const label = newLabel.trim();
    if (!label) {
      Alert.alert('Label Required', 'Enter a label for the checklist item.');
      return;
    }
    const id = `cl_custom_${Date.now()}`;
    const defaultIds = new Set((profession.checklist || []).map((i) => i.id));
    const currentCustom = checklistItems
      .filter((i) => !defaultIds.has(i.id))
      .map(({ id: iid, label: lbl, type: typ, unit: u }) => ({ id: iid, label: lbl, type: typ, ...(u && { unit: u }) }));
    const item = { id, label, type: newType };
    if (newType === 'measure' && newUnit.trim()) item.unit = newUnit.trim();
    const newCustom = [...currentCustom, item];
    saveChecklistCustom(newCustom);
    setNewLabel('');
    setNewType('check');
    setNewUnit('');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

        {/* Master toggle */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Add Service Form</Text>
          <View style={styles.card}>
            <ToggleRow
              value={checklistVisible}
              onToggle={(v) => saveChecklistVisible(v)}
              label="Show Checklist"
              desc="Display checklist fields when logging a service"
              theme={theme}
              styles={styles}
            />
          </View>
        </View>

        {/* Per-item list */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Checklist Items</Text>
          <View style={styles.card}>
            {checklistItems.map((item, idx) => {
              const isDefault = isDefaultItem(item.id);
              return (
                <React.Fragment key={item.id}>
                  {idx > 0 && <View style={styles.itemDivider} />}
                  <View style={styles.itemRow}>
                    <View style={styles.itemLeft}>
                      <View style={[
                        styles.typeBadge,
                        item.type === 'measure' ? styles.typeBadgeMeasure : styles.typeBadgeCheck,
                      ]}>
                        <Ionicons
                          name={item.type === 'measure' ? 'analytics-outline' : 'checkbox-outline'}
                          size={13}
                          color={item.type === 'measure' ? theme.scheduled : theme.primary}
                        />
                      </View>
                      <Text style={[styles.itemLabel, !item.visible && styles.itemLabelMuted]}>
                        {item.label}
                      </Text>
                    </View>
                    <View style={styles.itemActions}>
                      <Pressable
                        onPress={() => saveChecklistItem(item.id, !item.visible)}
                        hitSlop={8}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: item.visible }}
                        accessibilityLabel={`${item.label}: ${item.visible ? 'visible' : 'hidden'}`}
                      >
                        <Ionicons
                          name={item.visible ? 'eye-outline' : 'eye-off-outline'}
                          size={20}
                          color={item.visible ? theme.primary : theme.border}
                        />
                      </Pressable>
                      {!isDefault && (
                        <Pressable
                          onPress={() => handleDelete(item)}
                          hitSlop={8}
                          accessibilityLabel={`Delete ${item.label}`}
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
            Hidden items won't appear on the Add Service form but are still part of the profession config.
          </Text>
        </View>

        {/* Add checklist item */}
        <Text style={styles.sectionTitle}>Add Checklist Item</Text>
        <View style={styles.addCard}>
          <TextInput
            style={styles.labelInput}
            value={newLabel}
            onChangeText={setNewLabel}
            placeholder="Item label…"
            placeholderTextColor={theme.placeholder}
            maxLength={60}
          />

          <Text style={styles.addSubLabel}>Type</Text>
          <View style={styles.typeChips}>
            {['check', 'measure'].map((t) => (
              <Pressable
                key={t}
                style={[styles.typeChip, newType === t && styles.typeChipActive]}
                onPress={() => setNewType(t)}
              >
                <Ionicons
                  name={t === 'check' ? 'checkbox-outline' : 'analytics-outline'}
                  size={15}
                  color={newType === t ? '#fff' : theme.textSecondary}
                />
                <Text style={[styles.typeChipText, newType === t && styles.typeChipTextActive]}>
                  {t === 'check' ? 'Checkbox' : 'Measurement'}
                </Text>
              </Pressable>
            ))}
          </View>

          {newType === 'measure' && (
            <>
              <Text style={styles.addSubLabel}>Unit (optional)</Text>
              <TextInput
                style={[styles.labelInput, styles.unitInput]}
                value={newUnit}
                onChangeText={setNewUnit}
                placeholder="e.g. gpg, ppm, °F…"
                placeholderTextColor={theme.placeholder}
                maxLength={20}
              />
            </>
          )}

          <Pressable
            style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
            onPress={handleAddItem}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>Add Item</Text>
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
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontFamily:    theme.fontUiBold,
      fontSize:      FontSize.xs,
      color:         theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing:  0.7,
      marginBottom:   8,
      marginLeft:     4,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius:    14,
      overflow:        'hidden',
    },
    // ── Master toggle ──
    toggleRow: {
      flexDirection:     'row',
      alignItems:        'center',
      justifyContent:    'space-between',
      paddingVertical:   14,
      paddingHorizontal: 16,
    },
    toggleLeft: {
      flex:       1,
      paddingRight: 16,
    },
    toggleLabel: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   FontSize.base,
      color:      theme.text,
    },
    toggleDesc: {
      fontFamily: theme.fontBody,
      fontSize:   FontSize.xs,
      color:      theme.textMuted,
      marginTop:   2,
    },
    toggle: {
      width:        46,
      height:       28,
      borderRadius: 14,
    },
    toggleKnob: {
      position:        'absolute',
      top:             3,
      width:           22,
      height:          22,
      borderRadius:    11,
      backgroundColor: theme.surface,
      shadowColor:     '#000',
      shadowOffset:    { width: 0, height: 1 },
      shadowOpacity:   0.2,
      shadowRadius:    2,
      elevation:       2,
    },
    // ── Item rows ──
    itemDivider: {
      height:           StyleSheet.hairlineWidth,
      backgroundColor:  theme.border,
      marginHorizontal: 16,
    },
    itemRow: {
      flexDirection:     'row',
      alignItems:        'center',
      justifyContent:    'space-between',
      paddingVertical:   13,
      paddingHorizontal: 16,
    },
    itemLeft: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:            10,
      flex:            1,
    },
    itemActions: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:            10,
    },
    trashBtn: {},
    typeBadge: {
      width:           26,
      height:          26,
      borderRadius:    6,
      alignItems:      'center',
      justifyContent:  'center',
    },
    typeBadgeCheck: {
      backgroundColor: theme.primaryPale || (theme.primary + '18'),
    },
    typeBadgeMeasure: {
      backgroundColor: (theme.scheduled || theme.primary) + '18',
    },
    itemLabel: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   FontSize.base,
      color:      theme.text,
    },
    itemLabelMuted: {
      color: theme.textMuted,
    },
    hint: {
      fontFamily:        theme.fontBody,
      fontSize:          FontSize.xs,
      color:             theme.textMuted,
      paddingTop:        10,
      paddingHorizontal: 4,
      lineHeight:        FontSize.xs * 1.6,
    },
    // ── Add item card ──
    addCard: {
      backgroundColor: theme.surface,
      borderRadius:    14,
      padding:         16,
      marginBottom:    24,
    },
    labelInput: {
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
    unitInput: {
      marginBottom: 16,
    },
    addSubLabel: {
      fontFamily:    theme.fontUiBold,
      fontSize:      FontSize.xs,
      color:         theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing:  0.6,
      marginBottom:   10,
    },
    typeChips: {
      flexDirection: 'row',
      gap:            8,
      marginBottom:  16,
    },
    typeChip: {
      flex:            1,
      flexDirection:   'row',
      alignItems:      'center',
      justifyContent:  'center',
      gap:              6,
      paddingVertical: 11,
      borderRadius:    10,
      backgroundColor: theme.inputBg,
      borderWidth:     1,
      borderColor:     theme.inputBorder,
    },
    typeChipActive: {
      backgroundColor: theme.primary,
      borderColor:     theme.primary,
    },
    typeChipText: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   FontSize.sm,
      color:      theme.textSecondary,
    },
    typeChipTextActive: {
      color: '#fff',
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
