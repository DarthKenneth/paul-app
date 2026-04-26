// =============================================================================
// ServiceLogEntry.js - Single row in a customer's service log list
// Version: 1.5
// Last Updated: 2026-04-24
//
// PROJECT:      Rolodeck (project v0.28)
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
// v1.6  2026-04-24  Claude  Show brief entry values summary in the row
//       - Added profession to useProfession() destructure
//       - detailLine computed from entryValues (equipment, salt, etc.) and shown
//         as a muted line below the type label so key info is visible without opening
// v1.5  2026-04-24  Claude  Use allServiceTypes so custom type entries resolve correctly
// v1.4  2026-04-23  Claude  Use profession config for type icon/label instead of
//                           hardcoded TYPE_CONFIG object; isInitial label reads
//                           "Initial {sType.label}" (e.g. "Initial Routine Service")
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
import { useProfession } from '../contexts/ProfessionContext';
import { FontSize } from '../styles/typography';

function ServiceLogEntry({ entry, isInitial, isLast, onPress }) {
  const { theme } = useTheme();
  const { allServiceTypes, profession } = useProfession();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const sType = allServiceTypes.find((t) => t.id === entry.type)
    ?? allServiceTypes[0];
  const label = isInitial ? `Initial ${sType.label}` : sType.label;
  const [lightboxUri, setLightboxUri] = useState(null);

  const detailLine = useMemo(() => {
    const ev = entry.entryValues;
    if (!ev) return null;
    const parts = [];
    const eq = ev.equipmentInstalled;
    if (Array.isArray(eq) && eq.length > 0) parts.push(eq.join(', '));
    for (const field of (profession.entryFields || [])) {
      if (field.key === 'equipmentServiced') continue;
      const val = ev[field.key];
      if (val) parts.push(String(val));
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  }, [entry.entryValues, profession.entryFields]);

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
          <Ionicons name={sType.icon} size={18} color={theme.primary} />
        </View>
        <View style={styles.content}>
          <View style={styles.topRow}>
            <Text style={styles.typeLabel}>{label}</Text>
            <Text style={styles.dateText}>{formattedDate}</Text>
          </View>
          {!!detailLine && (
            <Text style={styles.detailLine} numberOfLines={1}>{detailLine}</Text>
          )}
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
      fontSize:   theme.fontSize.base,
      color:      theme.text,
    },
    dateText: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.sm,
      color:      theme.textMuted,
    },
    detailLine: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.xs,
      color:      theme.textMuted,
      marginBottom: 3,
    },
    notes: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.sm,
      color:      theme.textSecondary,
      lineHeight: theme.fontSize.sm * 1.55,
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
