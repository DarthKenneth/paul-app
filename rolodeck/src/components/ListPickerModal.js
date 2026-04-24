// =============================================================================
// ListPickerModal.js - Single- and multi-select picker modal for string lists
// Version: 1.1
// Last Updated: 2026-04-24
//
// PROJECT:      Rolodeck (project v0.28)
// FILES:        ListPickerModal.js     (this file — reusable picker modal)
//               AddServiceModal.js     (entry field dropdowns)
//               AddServiceScreen.js    (entry field dropdowns)
//               CustomerDetailScreen.js (equipment field dropdowns)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Centered overlay modal matching the AddServiceModal aesthetic
//   - Items rendered in a ScrollView; tapping an item calls onSelect(value) + closes
//   - Selected item highlighted with primary color
//   - Passing selected='' or null shows no highlighted item (valid for optional fields)
//   - allowClear: when true, shows a "None" row at top to clear the selection
//   - multi: when true, selected is string[]; items show checkboxes; modal stays open
//     on each tap; Done button at bottom closes and shows count
//
// CHANGE LOG:
// v1.0  2026-04-23  Claude  Initial implementation
// v1.1  2026-04-24  Claude  Multi-select mode
//       - Added multi prop; when true selected is string[], items show checkbox icons,
//         tapping toggles without closing, Done button at bottom closes the modal
//       - allowClear suppressed automatically in multi mode
// =============================================================================

import React, { useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/theme';
import { FontSize } from '../styles/typography';

export default function ListPickerModal({
  visible,
  title,
  items = [],
  selected,
  onSelect,
  onClose,
  allowClear = false,
  multi = false,
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const pick = (value) => {
    if (multi) {
      const current = Array.isArray(selected) ? selected : [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      onSelect(next);
    } else {
      onSelect(value);
      onClose();
    }
  };

  const selectedCount = multi && Array.isArray(selected) ? selected.length : 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {allowClear && !multi && (
              <Pressable
                style={[styles.item, !selected && styles.itemSelected]}
                onPress={() => pick('')}
              >
                <Text style={[styles.itemText, !selected && styles.itemTextSelected]}>
                  None
                </Text>
                {!selected && (
                  <Ionicons name="checkmark" size={18} color={theme.primary} />
                )}
              </Pressable>
            )}

            {items.map((item) => {
              const active = multi
                ? (Array.isArray(selected) && selected.includes(item))
                : item === selected;
              return (
                <Pressable
                  key={item}
                  style={[styles.item, active && styles.itemSelected]}
                  onPress={() => pick(item)}
                >
                  <Text style={[styles.itemText, active && styles.itemTextSelected]}>
                    {item}
                  </Text>
                  {multi ? (
                    <Ionicons
                      name={active ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={active ? theme.primary : theme.border}
                    />
                  ) : (
                    active && <Ionicons name="checkmark" size={18} color={theme.primary} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          {multi && (
            <Pressable style={styles.doneBtn} onPress={onClose}>
              <Text style={styles.doneBtnText}>
                {selectedCount > 0 ? `Done · ${selectedCount} selected` : 'Done'}
              </Text>
            </Pressable>
          )}

        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    overlay: {
      flex:            1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent:  'center',
      alignItems:      'center',
      paddingHorizontal: 24,
    },
    card: {
      width:           '100%',
      backgroundColor: theme.surface,
      borderRadius:    20,
      paddingTop:      20,
      maxHeight:       '70%',
    },
    header: {
      flexDirection:     'row',
      justifyContent:    'space-between',
      alignItems:        'center',
      paddingHorizontal: 20,
      paddingBottom:     14,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    title: {
      fontFamily: theme.fontHeading,
      fontSize:   FontSize.lg,
      color:      theme.text,
    },
    item: {
      flexDirection:     'row',
      alignItems:        'center',
      justifyContent:    'space-between',
      paddingVertical:   14,
      paddingHorizontal: 20,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    itemSelected: {
      backgroundColor: theme.primaryPale || (theme.primary + '12'),
    },
    itemText: {
      fontFamily: theme.fontBody,
      fontSize:   FontSize.base,
      color:      theme.text,
    },
    itemTextSelected: {
      fontFamily: theme.fontBodyBold,
      color:      theme.primary,
    },
    doneBtn: {
      margin:          12,
      backgroundColor: theme.primary,
      borderRadius:    12,
      paddingVertical: 13,
      alignItems:      'center',
    },
    doneBtnText: {
      fontFamily: theme.fontBodyBold,
      fontSize:   FontSize.base,
      color:      '#fff',
    },
  });
}
