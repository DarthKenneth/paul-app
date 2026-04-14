// =============================================================================
// CustomerCard.js - Pressable card displaying a customer summary row
// Version: 1.3
// Last Updated: 2026-04-14
//
// PROJECT:      Rolodeck (project v0.22)
// FILES:        CustomerCard.js         (this file)
//               CustomersScreen.js      (renders this in a FlatList)
//               serviceAlerts.js        (getServiceStatus)
//               theme.js                (useTheme)
//               typography.js           (FontFamily, FontSize)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Receives customer object + onPress callback as props
//   - Reads theme via useTheme(); all colors from theme, never hardcoded
//   - makeStyles(theme) factory creates StyleSheet — called inside component
//     so styles regenerate when theme changes
//   - Badge color: overdue → theme.overdue, warning → theme.warning,
//     upcoming → theme.accent, ok → theme.success
//   - Badge background uses hex + '22' alpha suffix (8-digit hex opacity)
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial scaffold
// v1.2.2 2026-04-12  Claude  Removed sort hint label — name is always shown so the
//                             highlighted sort-field subtitle was redundant
// v1.3   2026-04-14  Claude  Differentiate missing name: renders "No name" in
//                             theme.textMuted italic so it reads as placeholder,
//                             not as an actual customer named "Unnamed"
// v1.2.1 2026-04-10  Claude  Reverted column layout; schedule button moved to
//                             CustomerDetailScreen footer instead
// v1.2  2026-04-09  Claude  Accept intervalDays prop; pass to getServiceStatus
//                           so status badge respects the configured interval
// v1.1  2026-04-03  Claude  Optimize + harden
//       - Wrapped component with React.memo to avoid unnecessary re-renders
//         in FlatList when other cards change
//       - Added maxWidth and flex constraint on badge to prevent text overflow
//         pushing chevron off-screen with long status labels
// =============================================================================

import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/theme';
import { FontSize } from '../styles/typography';
import { getServiceStatus } from '../utils/serviceAlerts';

const LEVEL_COLORS = {
  overdue:  'overdue',
  warning:  'warning',
  upcoming: 'accent',
  ok:       'success',
};

function CustomerCard({ customer, onPress, intervalDays = 365 }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const status = getServiceStatus(customer, intervalDays);
  const badgeColor = theme[LEVEL_COLORS[status.level]] || theme.textMuted;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${customer.name || 'Unnamed customer'}, ${status.label}`}
    >
      <View style={styles.avatarWrap}>
        <Ionicons name="person-circle-outline" size={44} color={theme.primary} />
      </View>

      <View style={styles.info}>
        <Text
          style={[styles.name, !customer.name && styles.namePlaceholder]}
          numberOfLines={1}
        >
          {customer.name || 'No name'}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {[customer.phone, [customer.city, customer.state].filter(Boolean).join(', ') || customer.zipCode].filter(Boolean).join(' · ')}
        </Text>
      </View>

      <View style={styles.right}>
        <View style={[styles.badge, { backgroundColor: badgeColor + '22' }]}>
          <Text style={[styles.badgeText, { color: badgeColor }]} numberOfLines={1}>
            {status.label}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
      </View>
    </Pressable>
  );
}

export default React.memo(CustomerCard);

function makeStyles(theme) {
  return StyleSheet.create({
    card: {
      flexDirection:     'row',
      alignItems:        'center',
      backgroundColor:   theme.cardBg,
      borderRadius:      14,
      paddingVertical:   14,
      paddingHorizontal: 16,
      marginHorizontal:  16,
      marginVertical:     5,
      shadowColor:       '#000',
      shadowOffset:      { width: 0, height: 1 },
      shadowOpacity:     0.07,
      shadowRadius:       4,
      elevation:          2,
    },
    cardPressed: {
      opacity: 0.82,
    },
    avatarWrap: {
      marginRight: 12,
    },
    info: {
      flex:        1,
      marginRight:  8,
    },
    name: {
      fontFamily:   theme.fontBodyBold,
      fontSize:     FontSize.md,
      color:        theme.text,
      marginBottom:  3,
    },
    namePlaceholder: {
      fontFamily:  theme.fontBody,
      color:       theme.textMuted,
      fontStyle:   'italic',
    },
    sub: {
      fontFamily: theme.fontBody,
      fontSize:   FontSize.sm,
      color:      theme.textMuted,
    },
    right: {
      alignItems: 'flex-end',
      gap:         6,
      flexShrink:  0,
      maxWidth:    '40%',
    },
    badge: {
      borderRadius:      20,
      paddingVertical:    3,
      paddingHorizontal: 10,
      maxWidth:          '100%',
    },
    badgeText: {
      fontFamily: theme.fontUiMedium,
      fontSize:   FontSize.xxs,
    },
  });
}
