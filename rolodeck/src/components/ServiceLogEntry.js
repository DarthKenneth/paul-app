// =============================================================================
// ServiceLogEntry.js - Single row in a customer's service log list
// Version: 1.3
// Last Updated: 2026-04-19
//
// PROJECT:      Rolodeck (project v0.25.0)
// FILES:        ServiceLogEntry.js       (this file)
//               CustomerDetailScreen.js  (renders these in a list)
//               EditServiceModal.js      (opened when row is pressed)
//               theme.js                 (useTheme)
//               typography.js            (FontFamily, FontSize)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Receives a service entry object, renders it
//   - Icon: wrench (service) or construct (install), tinted with primaryPale bg
//   - Date formatted as "Apr 3, 2026" (locale-aware via toLocaleDateString)
//   - Notes text rendered only when non-empty
//   - Photos rendered as a horizontal thumbnail strip when present; tapping a
//     thumbnail opens a full-screen lightbox Modal (swallows the row press)
//   - Bottom border separates rows inside the log card
//   - isInitial=true overrides the type label to "Initial Install/Service"
//     (CustomerDetailScreen passes this for the oldest log entry)
//   - Row is pressable when onPress prop is provided (v1.3) — opens the edit
//     modal in the parent; tapping a thumbnail still opens the lightbox only
//     (thumbnail Pressable's onPress stops propagation by not calling parent)
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial scaffold
// v1.1  2026-04-03  Claude  Added isInitial prop — shows "Initial Install/Service"
//                           label when true, overriding the default type label
// v1.1.1  2026-04-03  Claude  Wrapped with React.memo to avoid unnecessary
//                              re-renders when sibling log entries change
// v1.2  2026-04-17  Claude  Photo display — thumbnail strip + lightbox
//       - Horizontal ScrollView thumbnail strip below notes for entries with photos
//       - Tap any thumbnail to open a full-screen lightbox Modal
//         [updated ARCHITECTURE]
// v1.3  2026-04-19  Claude  Row is now pressable; opens edit modal in parent
//       - Outer View swapped for Pressable; onPress prop wired through
//       - Thumbnail press opens lightbox without bubbling to row press
//       - Pressed state gets a subtle background highlight for affordance
//         [updated ARCHITECTURE]
// =============================================================================

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, Pressable, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/theme';
import { FontSize } from '../styles/typography';

const TYPE_CONFIG = {
  install: { icon: 'construct-outline', label: 'Install' },
  service: { icon: 'build-outline',     label: 'Service' },
};

function ServiceLogEntry({ entry, isInitial, isLast, onPress }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const config = TYPE_CONFIG[entry.type] || TYPE_CONFIG.service;
  const label = isInitial ? 'Initial Install/Service' : config.label;
  const [lightboxUri, setLightboxUri] = useState(null);

  const formattedDate = new Date(entry.date).toLocaleDateString('en-US', {
    year:  'numeric',
    month: 'short',
    day:   'numeric',
  });

  const RowContainer = onPress ? Pressable : View;
  const rowProps = onPress
    ? {
        onPress,
        accessibilityRole: 'button',
        accessibilityLabel: `Edit ${label} from ${formattedDate}`,
        style: ({ pressed }) => [styles.row, isLast && styles.rowLast, pressed && styles.rowPressed],
      }
    : { style: [styles.row, isLast && styles.rowLast] };

  return (
    <>
      <RowContainer {...rowProps}>
        <View style={styles.iconWrap}>
          <Ionicons name={config.icon} size={18} color={theme.primary} />
        </View>
        <View style={styles.content}>
          <View style={styles.topRow}>
            <Text style={styles.typeLabel}>{label}</Text>
            <Text style={styles.dateText}>{formattedDate}</Text>
          </View>
          {!!entry.notes && (
            <Text style={styles.notes}>{entry.notes}</Text>
          )}
          {entry.photos?.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.photoStrip}
              contentContainerStyle={styles.photoStripContent}
            >
              {entry.photos.map((uri, idx) => (
                <Pressable key={idx} onPress={() => setLightboxUri(uri)}>
                  <Image source={{ uri }} style={styles.thumb} />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
        {onPress && (
          <Ionicons
            name="chevron-forward"
            size={16}
            color={theme.textMuted}
            style={styles.chevron}
          />
        )}
      </RowContainer>
      {lightboxUri !== null && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setLightboxUri(null)}
        >
          <Pressable style={styles.lightboxOverlay} onPress={() => setLightboxUri(null)}>
            <Image
              source={{ uri: lightboxUri }}
              style={styles.lightboxImage}
              resizeMode="contain"
            />
          </Pressable>
        </Modal>
      )}
    </>
  );
}

export default React.memo(ServiceLogEntry);

function makeStyles(theme) {
  return StyleSheet.create({
    row: {
      flexDirection:     'row',
      alignItems:        'flex-start',
      paddingVertical:   14,
      paddingHorizontal: 16,
      borderBottomWidth:  1,
      borderBottomColor: theme.border,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    rowPressed: {
      backgroundColor: theme.primaryPale,
    },
    chevron: {
      alignSelf:   'center',
      marginLeft:   8,
      opacity:      0.6,
    },
    iconWrap: {
      width:           38,
      height:          38,
      borderRadius:    19,
      backgroundColor: theme.primaryPale,
      alignItems:      'center',
      justifyContent:  'center',
      marginRight:     12,
      marginTop:        1,
    },
    content: {
      flex: 1,
    },
    topRow: {
      flexDirection:  'row',
      justifyContent: 'space-between',
      alignItems:     'center',
      marginBottom:    3,
    },
    typeLabel: {
      fontFamily: theme.fontBodyBold,
      fontSize:   FontSize.base,
      color:      theme.text,
    },
    dateText: {
      fontFamily: theme.fontBody,
      fontSize:   FontSize.sm,
      color:      theme.textMuted,
    },
    notes: {
      fontFamily: theme.fontBody,
      fontSize:   FontSize.sm,
      color:      theme.textSecondary,
      lineHeight: FontSize.sm * 1.55,
    },
    photoStrip: {
      marginTop: 8,
    },
    photoStripContent: {
      gap: 6,
    },
    thumb: {
      width:        72,
      height:       72,
      borderRadius:  6,
    },
    lightboxOverlay: {
      flex:            1,
      backgroundColor: 'rgba(0,0,0,0.92)',
      alignItems:      'center',
      justifyContent:  'center',
    },
    lightboxImage: {
      width:  '100%',
      height: '80%',
    },
  });
}
