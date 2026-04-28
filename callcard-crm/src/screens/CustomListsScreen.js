// =============================================================================
// CustomListsScreen.js - Edit custom list items per profession
// Version: 1.0
// Last Updated: 2026-04-23
//
// PROJECT:      Rolodeck (project v0.27)
// FILES:        CustomListsScreen.js         (this file)
//               ProfessionSettingsScreen.js  (navigates here)
//               ProfessionContext.js         (customLists + saveCustomList)
//               TabNavigator.js              (registers this screen)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Renders one section per custom list defined in the active profession config
//   - Each section shows current items as chips with an × remove button
//   - Text input at the bottom of each section adds a new item
//   - Adds are deduplicated (case-insensitive); removes update the list immediately
//   - All changes auto-save via saveCustomList — no explicit Save button
//   - "Reset" per section restores profession preset defaults
//
// CHANGE LOG:
// v1.0  2026-04-23  Claude  Initial implementation
// =============================================================================

import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/theme';
import { useProfession } from '../contexts/ProfessionContext';
import { FontSize } from '../styles/typography';

export default function CustomListsScreen() {
  const { theme } = useTheme();
  const { profession, customLists, saveCustomList } = useProfession();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // Per-list add-item input state
  const [inputs, setInputs] = useState({});
  const inputRefs = useRef({});

  const setInput = (key, val) => setInputs((prev) => ({ ...prev, [key]: val }));

  const handleAdd = async (list) => {
    const raw = (inputs[list.key] || '').trim();
    if (!raw) return;
    const current = customLists[list.key] || [];
    if (current.some((item) => item.toLowerCase() === raw.toLowerCase())) {
      setInput(list.key, '');
      return;
    }
    const next = [...current, raw];
    setInput(list.key, '');
    await saveCustomList(list.key, next);
  };

  const handleRemove = async (list, item) => {
    const current = customLists[list.key] || [];
    await saveCustomList(list.key, current.filter((i) => i !== item));
  };

  const handleReset = (list) => {
    Alert.alert(
      'Reset to Defaults',
      `Restore the "${list.label}" list to its defaults?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => saveCustomList(list.key, list.items),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {(profession.customLists || []).map((list) => {
          const items = customLists[list.key] || [];
          const inputVal = inputs[list.key] || '';

          return (
            <View key={list.key} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{list.label}</Text>
                <Pressable
                  onPress={() => handleReset(list)}
                  hitSlop={8}
                  accessibilityLabel={`Reset ${list.label} to defaults`}
                >
                  <Text style={styles.resetLink}>Reset</Text>
                </Pressable>
              </View>

              <View style={styles.card}>
                {/* Chip grid */}
                <View style={styles.chipGrid}>
                  {items.map((item) => (
                    <View key={item} style={styles.chip}>
                      <Text style={styles.chipText} numberOfLines={1}>
                        {item}
                      </Text>
                      <Pressable
                        onPress={() => handleRemove(list, item)}
                        hitSlop={6}
                        accessibilityLabel={`Remove ${item}`}
                      >
                        <Ionicons name="close-circle" size={16} color={theme.textMuted} />
                      </Pressable>
                    </View>
                  ))}

                  {items.length === 0 && (
                    <Text style={styles.emptyText}>No items. Add one below.</Text>
                  )}
                </View>

                {/* Add input */}
                <View style={styles.addRow}>
                  <TextInput
                    ref={(r) => { inputRefs.current[list.key] = r; }}
                    style={styles.addInput}
                    value={inputVal}
                    onChangeText={(v) => setInput(list.key, v)}
                    placeholder={`Add to ${list.label}…`}
                    placeholderTextColor={theme.placeholder}
                    returnKeyType="done"
                    onSubmitEditing={() => handleAdd(list)}
                  />
                  <Pressable
                    style={[styles.addBtn, !inputVal.trim() && styles.addBtnDisabled]}
                    onPress={() => handleAdd(list)}
                    disabled={!inputVal.trim()}
                    accessibilityLabel={`Add item to ${list.label}`}
                  >
                    <Ionicons name="add" size={20} color="#fff" />
                  </Pressable>
                </View>
              </View>
            </View>
          );
        })}

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
    sectionHeader: {
      flexDirection:  'row',
      justifyContent: 'space-between',
      alignItems:     'center',
      marginBottom:    8,
      paddingHorizontal: 4,
    },
    sectionTitle: {
      fontFamily:    theme.fontUiBold,
      fontSize:      theme.fontSize.xs,
      color:         theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.7,
    },
    resetLink: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   theme.fontSize.xs,
      color:      theme.textMuted,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius:    14,
      overflow:        'hidden',
    },
    chipGrid: {
      flexDirection:  'row',
      flexWrap:       'wrap',
      gap:             8,
      padding:         14,
    },
    chip: {
      flexDirection:     'row',
      alignItems:        'center',
      gap:                5,
      backgroundColor:   theme.inputBg,
      borderRadius:      20,
      paddingVertical:   7,
      paddingHorizontal: 12,
      borderWidth:       1,
      borderColor:       theme.border,
    },
    chipText: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   theme.fontSize.sm,
      color:      theme.text,
      maxWidth:   140,
    },
    emptyText: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.sm,
      color:      theme.textMuted,
      fontStyle:  'italic',
    },
    addRow: {
      flexDirection:    'row',
      alignItems:       'center',
      gap:               8,
      paddingHorizontal: 12,
      paddingBottom:     12,
      borderTopWidth:    1,
      borderTopColor:   theme.border,
      paddingTop:        10,
    },
    addInput: {
      flex:              1,
      fontFamily:        theme.fontBody,
      fontSize:          theme.fontSize.base,
      color:             theme.text,
      backgroundColor:   theme.inputBg,
      borderWidth:        1,
      borderColor:       theme.inputBorder,
      borderRadius:      10,
      paddingVertical:   9,
      paddingHorizontal: 12,
    },
    addBtn: {
      width:           38,
      height:          38,
      borderRadius:    10,
      backgroundColor: theme.primary,
      alignItems:      'center',
      justifyContent:  'center',
    },
    addBtnDisabled: {
      opacity: 0.35,
    },
  });
}
