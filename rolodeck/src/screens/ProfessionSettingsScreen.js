// =============================================================================
// ProfessionSettingsScreen.js - Profession configuration hub
// Version: 1.0
// Last Updated: 2026-04-23
//
// PROJECT:      Rolodeck (project v0.27)
// FILES:        ProfessionSettingsScreen.js  (this file — profession settings hub)
//               ServiceTypesScreen.js        (duration config per type)
//               CustomListsScreen.js         (custom list editor)
//               ChecklistScreen.js           (checklist item editor)
//               SettingsScreen.js            (navigates here)
//               TabNavigator.js              (registers this screen)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Single card with nav rows for Service Types, Custom Lists, Checklist
//   - Shows profession emoji + name as header
//   - Only shows Custom Lists and Checklist rows when the active profession
//     has those arrays populated (so future professions can omit them cleanly)
//
// CHANGE LOG:
// v1.0  2026-04-23  Claude  Initial implementation
// =============================================================================

import React, { useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/theme';
import { useProfession } from '../contexts/ProfessionContext';
import { FontSize } from '../styles/typography';

export default function ProfessionSettingsScreen({ navigation }) {
  const { theme } = useTheme();
  const { profession } = useProfession();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const rows = [
    {
      key:   'types',
      icon:  'list-outline',
      title: 'Service Types',
      desc:  'Appointment durations for each type',
      screen: 'ServiceTypes',
      show:  true,
    },
    {
      key:   'lists',
      icon:  'albums-outline',
      title: 'Custom Lists',
      desc:  'Equipment types, brands, salt types, etc.',
      screen: 'CustomLists',
      show:  (profession.customLists?.length ?? 0) > 0,
    },
    {
      key:   'checklist',
      icon:  'checkbox-outline',
      title: 'Service Checklist',
      desc:  'Which items appear on Add Service',
      screen: 'Checklist',
      show:  (profession.checklist?.length ?? 0) > 0,
    },
  ].filter((r) => r.show);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

        {/* Profession header */}
        <View style={styles.profHeader}>
          <Text style={styles.profEmoji}>{profession.emoji}</Text>
          <View>
            <Text style={styles.profName}>{profession.name}</Text>
            <Text style={styles.profTagline}>{profession.tagline}</Text>
          </View>
        </View>

        {/* Nav rows */}
        <View style={styles.card}>
          {rows.map((row, idx) => (
            <React.Fragment key={row.key}>
              {idx > 0 && <View style={styles.rowDivider} />}
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => navigation.navigate(row.screen)}
                accessibilityRole="button"
              >
                <View style={styles.rowLeft}>
                  <View style={styles.iconWrap}>
                    <Ionicons name={row.icon} size={20} color={theme.primary} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{row.title}</Text>
                    <Text style={styles.rowDesc}>{row.desc}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
              </Pressable>
            </React.Fragment>
          ))}
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
      paddingTop:        24,
    },
    profHeader: {
      flexDirection:  'row',
      alignItems:     'center',
      gap:             16,
      paddingHorizontal: 4,
      marginBottom:    24,
    },
    profEmoji: {
      fontSize:   40,
      lineHeight: 48,
    },
    profName: {
      fontFamily:   theme.fontHeading,
      fontSize:     theme.fontSize.xl,
      color:        theme.text,
    },
    profTagline: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.sm,
      color:      theme.textMuted,
      marginTop:   2,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius:    14,
      overflow:        'hidden',
    },
    rowDivider: {
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
    rowPressed: {
      backgroundColor: theme.inputBg,
    },
    rowLeft: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:            14,
      flex:            1,
    },
    iconWrap: {
      width:           38,
      height:          38,
      borderRadius:    10,
      backgroundColor: theme.primaryPale || (theme.primary + '18'),
      alignItems:      'center',
      justifyContent:  'center',
    },
    rowText: {
      flex: 1,
    },
    rowTitle: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   theme.fontSize.base,
      color:      theme.text,
    },
    rowDesc: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.xs,
      color:      theme.textMuted,
      marginTop:   2,
    },
  });
}
