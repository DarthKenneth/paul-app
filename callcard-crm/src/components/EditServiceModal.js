// =============================================================================
// EditServiceModal.js - View or edit notes + photos on a service log entry
// Version: 1.2.2
// Last Updated: 2026-04-24
//
// PROJECT:      Rolodeck (project v0.28.4)
// FILES:        EditServiceModal.js      (this file)
//               CustomerDetailScreen.js  (renders this modal when a log row is tapped)
//               ServiceLogEntry.js       (the row that triggers this modal)
//               storage.js               (updateServiceEntry, deleteServiceEntry)
//               photoUtils.js            (savePhotoLocally, deletePhotosFromDisk)
//               dateUtils.js             (isSameLocalDay)
//               theme.js                 (useTheme)
//               typography.js            (FontSize)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Two modes: 'view' (read-only with Edit pencil) and 'edit' (form with Save
//     + Delete). Initial mode is decided by the parent:
//       * same-day entries open directly in 'edit' (quick fix-up while on-site)
//       * older entries open in 'view' to prevent accidental changes; the user
//         taps the pencil in the header to enter 'edit' mode deliberately
//   - Date is read-only (shown in the header) — editing the date of a past entry
//     would invalidate interval calculations and history ordering; if the user
//     needs a different date, they should delete and re-add
//   - View mode: entry details (entryValues + checklist) → notes → photos (lightbox).
//     No Save/Delete buttons; just Close + subtle Edit pencil.
//   - Edit mode: notes textarea + photo pickers (camera, library) + Save + Delete.
//     Photos array is working copy; changes only persist on Save.
//   - Save calls updateServiceEntry(customerId, entryId, { notes, photos })
//     and invokes onSave() so the parent can refresh
//   - Delete prompts a destructive Alert; calls deleteServiceEntry then onDelete()
//   - On re-open, mode resets to initialMode and the working copy is seeded from
//     the entry so dropped edits don't leak between opens
//   - typeLabel resolved from allServiceTypes so custom types display correctly
//
// CHANGE LOG:
// v1.2.2  2026-04-24  Claude  Detail row label no longer squeezed — label sizes to content,
//                             value takes remaining space and wraps to multiple lines instead
// v1.2.1  2026-04-24  Claude  Photo file cleanup on entry delete + on photo removal during edit
// v1.2    2026-04-24  Claude  Full entry details in view mode + subtle pencil
//       - Added useProfession(); typeLabel now resolved from allServiceTypes
//         instead of the hardcoded 'install'/'service' switch
//       - View mode now shows entry details section (entryValues: equipment,
//         salt, etc.) and checklist section (check items + measure readings)
//         above the Notes and Photos sections
//       - Edit pencil changed to pencil-outline + textMuted (more subtle)
//         [updated ARCHITECTURE]
// v1.1  2026-04-19  Claude  View/edit split for accidental-change protection
//       - Added 'view' mode (read-only notes + thumbnails + lightbox) with an
//         Edit pencil in the header that transitions to 'edit' mode
//       - New initialMode prop ('view' | 'edit'); CustomerDetailScreen passes
//         'edit' for same-day entries and 'view' for older ones
//       - Save + Delete only render in 'edit' mode
//       - Lightbox Modal added for thumbnail taps in view mode
//         [updated ARCHITECTURE]
// v1.0  2026-04-19  Claude  Initial scaffold
// =============================================================================

import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { savePhotoLocally, deletePhotosFromDisk } from '../utils/photoUtils';
import { updateServiceEntry, deleteServiceEntry } from '../data/storage';
import { useTheme } from '../styles/theme';
import { useProfession } from '../contexts/ProfessionContext';
import { FontSize } from '../styles/typography';

export default function EditServiceModal({
  visible,
  customerId,
  entry,
  isInitial,
  initialMode = 'view',
  onSave,
  onDelete,
  onClose,
}) {
  const { theme } = useTheme();
  const { allServiceTypes, profession, checklistItems } = useProfession();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [mode, setMode]       = useState(initialMode);
  const [notes, setNotes]     = useState('');
  const [photos, setPhotos]   = useState([]);
  const [saving, setSaving]   = useState(false);
  const [lightboxUri, setLightboxUri] = useState(null);

  useEffect(() => {
    if (visible && entry) {
      setMode(initialMode);
      setNotes(entry.notes || '');
      setPhotos(Array.isArray(entry.photos) ? [...entry.photos] : []);
      setSaving(false);
      setLightboxUri(null);
    }
  }, [visible, entry, initialMode]);

  if (!entry) return null;

  const sType = allServiceTypes.find((t) => t.id === entry.type) ?? allServiceTypes[0];
  const typeLabel = isInitial ? `Initial ${sType?.label ?? 'Service'}` : (sType?.label ?? 'Service');

  // Build display rows for entry values (view mode)
  const entryDetailRows = (() => {
    const rows = [];
    const ev = entry.entryValues;
    if (!ev) return rows;
    const eq = ev.equipmentInstalled;
    if (Array.isArray(eq) && eq.length > 0) {
      rows.push({ label: sType?.install ? 'Equipment Installed' : 'Equipment Serviced', value: eq.join(', ') });
    }
    for (const field of (profession.entryFields || [])) {
      if (field.key === 'equipmentServiced') continue;
      const val = ev[field.key];
      if (val) rows.push({ label: field.label, value: String(val) });
    }
    return rows;
  })();

  const checklistRows = (() => {
    const cl = entry.checklist;
    if (!cl) return [];
    return checklistItems
      .filter((item) => cl[item.id] !== undefined && cl[item.id] !== '' && cl[item.id] !== null)
      .map((item) => ({
        label: item.label,
        value: item.type === 'check' ? (cl[item.id] ? 'Yes' : '—') : String(cl[item.id]),
        isCheck: item.type === 'check' && !!cl[item.id],
      }));
  })();

  const formattedDate = new Date(entry.date).toLocaleDateString('en-US', {
    year:  'numeric',
    month: 'short',
    day:   'numeric',
  });

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Camera Access Required',
        'Allow Callcard to use your camera in Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled) {
      try {
        const saved = await savePhotoLocally(result.assets[0].uri);
        setPhotos(prev => [...prev, saved]);
      } catch {
        Alert.alert('Error', 'Could not save photo.');
      }
    }
  };

  const handleChoosePhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Photo Library Access Required',
        'Allow Callcard to access your photos in Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: 5,
    });
    if (!result.canceled) {
      try {
        const saved = await Promise.all(result.assets.map(a => savePhotoLocally(a.uri)));
        setPhotos(prev => [...prev, ...saved]);
      } catch {
        Alert.alert('Error', 'Could not save photos.');
      }
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const updates = {
        notes: notes.trim(),
      };
      if (photos.length > 0) {
        updates.photos = photos;
      } else {
        updates.photos = [];
      }
      // Find photos that were removed in this edit so we can clean up the files
      const originalPhotos = Array.isArray(entry.photos) ? entry.photos : [];
      const removed = originalPhotos.filter((uri) => !photos.includes(uri));
      await updateServiceEntry(customerId, entry.id, updates);
      if (removed.length > 0) deletePhotosFromDisk(removed); // fire-and-forget
      onSave?.();
    } catch {
      Alert.alert('Error', 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Entry',
      `Permanently delete this ${typeLabel.toLowerCase()} from ${formattedDate}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:    'Delete',
          style:   'destructive',
          onPress: async () => {
            try {
              const entryPhotos = Array.isArray(entry.photos) ? entry.photos : [];
              await deleteServiceEntry(customerId, entry.id);
              if (entryPhotos.length > 0) deletePhotosFromDisk(entryPhotos); // fire-and-forget
              onDelete?.();
            } catch {
              Alert.alert('Error', 'Failed to delete entry.');
            }
          },
        },
      ],
    );
  };

  const isEditing = mode === 'edit';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.card}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Ionicons
                  name={isEditing ? 'create-outline' : 'document-text-outline'}
                  size={20}
                  color={theme.primary}
                  style={styles.headerIcon}
                />
                <View>
                  <Text style={styles.title}>
                    {isEditing ? `Edit ${typeLabel}` : typeLabel}
                  </Text>
                  <Text style={styles.subtitle}>{formattedDate}</Text>
                </View>
              </View>
              <View style={styles.headerActions}>
                {!isEditing && (
                  <Pressable
                    onPress={() => setMode('edit')}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Edit entry"
                    style={styles.headerIconBtn}
                  >
                    <Ionicons name="pencil-outline" size={18} color={theme.textMuted} />
                  </Pressable>
                )}
                <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
                  <Ionicons name="close" size={22} color={theme.textSecondary} />
                </Pressable>
              </View>
            </View>

            {/* Entry details (view mode) */}
            {!isEditing && entryDetailRows.length > 0 && (
              <>
                <Text style={styles.label}>Details</Text>
                <View style={styles.detailsCard}>
                  {entryDetailRows.map((row, idx) => (
                    <View key={row.label} style={[styles.detailRow, idx < entryDetailRows.length - 1 && styles.detailRowBorder]}>
                      <Text style={styles.detailLabel}>{row.label}</Text>
                      <Text style={styles.detailValue}>{row.value}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Checklist (view mode) */}
            {!isEditing && checklistRows.length > 0 && (
              <>
                <Text style={styles.label}>Checklist</Text>
                <View style={styles.detailsCard}>
                  {checklistRows.map((row, idx) => (
                    <View key={row.label} style={[styles.detailRow, idx < checklistRows.length - 1 && styles.detailRowBorder]}>
                      <Text style={styles.detailLabel}>{row.label}</Text>
                      <Text style={[styles.detailValue, row.isCheck && styles.detailValueCheck]}>
                        {row.value}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Notes */}
            <Text style={styles.label}>Notes</Text>
            {isEditing ? (
              <TextInput
                style={styles.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="Add or edit notes…"
                placeholderTextColor={theme.placeholder}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            ) : (
              <View style={styles.notesView}>
                <Text style={styles.notesViewText}>
                  {notes.trim() ? notes : 'No notes.'}
                </Text>
              </View>
            )}

            {/* Photos */}
            <Text style={styles.label}>Photos</Text>
            {isEditing && (
              <View style={styles.photoButtons}>
                <Pressable style={styles.photoBtn} onPress={handleTakePhoto}>
                  <Ionicons name="camera-outline" size={17} color={theme.primary} />
                  <Text style={styles.photoBtnText}>Take Photo</Text>
                </Pressable>
                <Pressable style={styles.photoBtn} onPress={handleChoosePhoto}>
                  <Ionicons name="image-outline" size={17} color={theme.primary} />
                  <Text style={styles.photoBtnText}>Choose Photo</Text>
                </Pressable>
              </View>
            )}
            {photos.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.photoStrip}
                contentContainerStyle={styles.photoStripContent}
              >
                {photos.map((uri, idx) => (
                  <View key={uri + idx} style={styles.thumbWrap}>
                    <Pressable onPress={() => !isEditing && setLightboxUri(uri)}>
                      <Image source={{ uri }} style={styles.thumb} />
                    </Pressable>
                    {isEditing && (
                      <Pressable
                        style={styles.thumbRemove}
                        onPress={() => setPhotos(prev => prev.filter((_, i) => i !== idx))}
                        hitSlop={6}
                        accessibilityLabel="Remove photo"
                      >
                        <Ionicons name="close-circle" size={20} color="#fff" />
                      </Pressable>
                    )}
                  </View>
                ))}
              </ScrollView>
            ) : !isEditing && (
              <View style={styles.notesView}>
                <Text style={styles.notesViewText}>No photos.</Text>
              </View>
            )}

            {/* Actions (edit mode only) */}
            {isEditing && (
              <View style={styles.actionRow}>
                <Pressable
                  style={({ pressed }) => [styles.deleteBtn, pressed && styles.btnPressed]}
                  onPress={handleDelete}
                  disabled={saving}
                  accessibilityLabel="Delete entry"
                >
                  <Ionicons name="trash-outline" size={18} color={theme.overdue} />
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.saveBtn,
                    pressed && styles.btnPressed,
                    saving  && styles.saveBtnDisabled,
                  ]}
                  onPress={handleSave}
                  disabled={saving}
                  accessibilityLabel="Save changes"
                >
                  <Ionicons name="checkmark" size={18} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      {/* Lightbox (view mode) */}
      {lightboxUri !== null && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setLightboxUri(null)}
        >
          <Pressable style={styles.lightboxOverlay} onPress={() => setLightboxUri(null)}>
            <Image source={{ uri: lightboxUri }} style={styles.lightboxImage} resizeMode="contain" />
          </Pressable>
        </Modal>
      )}
    </Modal>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    overlay: {
      flex:              1,
      justifyContent:    'center',
      alignItems:        'center',
      backgroundColor:   'rgba(0,0,0,0.45)',
      paddingHorizontal: 20,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    card: {
      width:           '100%',
      maxWidth:         520,
      backgroundColor: theme.surface,
      borderRadius:    20,
      padding:         24,
      maxHeight:       '85%',
    },
    header: {
      flexDirection:  'row',
      justifyContent: 'space-between',
      alignItems:     'flex-start',
      marginBottom:    22,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:            10,
    },
    headerIcon: {
      marginTop: 2,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:            14,
    },
    headerIconBtn: {
      padding: 2,
    },
    title: {
      fontFamily: theme.fontHeading,
      fontSize:   theme.fontSize.lg,
      color:      theme.text,
    },
    subtitle: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.sm,
      color:      theme.textMuted,
      marginTop:   2,
    },
    label: {
      fontFamily:    theme.fontUiBold,
      fontSize:      theme.fontSize.xs,
      color:         theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing:  0.6,
      marginBottom:   8,
    },
    notesInput: {
      borderWidth:       1.5,
      borderColor:       theme.inputBorder,
      borderRadius:      10,
      paddingHorizontal: 14,
      paddingVertical:   10,
      fontFamily:        theme.fontBody,
      fontSize:          theme.fontSize.base,
      color:             theme.text,
      backgroundColor:   theme.inputBg,
      minHeight:         96,
      marginBottom:      20,
    },
    detailsCard: {
      backgroundColor: theme.background,
      borderWidth:      1,
      borderColor:     theme.borderLight,
      borderRadius:    10,
      marginBottom:    20,
    },
    detailRow: {
      flexDirection:     'row',
      alignItems:        'flex-start',
      justifyContent:    'space-between',
      paddingVertical:   10,
      paddingHorizontal: 14,
    },
    detailRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    detailLabel: {
      fontFamily:  theme.fontBody,
      fontSize:    theme.fontSize.sm,
      color:       theme.textMuted,
      marginRight: 12,
    },
    detailValue: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   theme.fontSize.sm,
      color:      theme.textSecondary,
      textAlign:  'right',
      flex:        1,
    },
    detailValueCheck: {
      color: theme.primary,
    },
    notesView: {
      paddingHorizontal: 14,
      paddingVertical:   12,
      borderRadius:      10,
      backgroundColor:   theme.background,
      borderWidth:        1,
      borderColor:       theme.borderLight,
      marginBottom:      20,
    },
    notesViewText: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.base,
      color:      theme.text,
      lineHeight: theme.fontSize.base * 1.5,
    },
    photoButtons: {
      flexDirection: 'row',
      gap:            10,
      marginBottom:   10,
    },
    photoBtn: {
      flex:            1,
      flexDirection:   'row',
      alignItems:      'center',
      justifyContent:  'center',
      gap:              6,
      borderWidth:      1.5,
      borderColor:     theme.inputBorder,
      borderRadius:    10,
      paddingVertical: 10,
      backgroundColor: theme.inputBg,
    },
    photoBtnText: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   theme.fontSize.sm,
      color:      theme.primary,
    },
    photoStrip: {
      marginBottom: 20,
    },
    photoStripContent: {
      gap: 6,
    },
    thumbWrap: {
      position: 'relative',
    },
    thumb: {
      width:        80,
      height:       80,
      borderRadius:  8,
    },
    thumbRemove: {
      position: 'absolute',
      top:      -6,
      right:    -6,
    },
    actionRow: {
      flexDirection:  'row',
      gap:             10,
      marginTop:        8,
    },
    deleteBtn: {
      flexDirection:   'row',
      alignItems:      'center',
      justifyContent:  'center',
      gap:              6,
      borderWidth:      1.5,
      borderColor:     theme.overdue,
      borderRadius:    12,
      paddingVertical: 13,
      paddingHorizontal: 16,
      backgroundColor: theme.surface,
    },
    deleteBtnText: {
      fontFamily: theme.fontBodyBold,
      fontSize:   theme.fontSize.base,
      color:      theme.overdue,
    },
    saveBtn: {
      flex:            1,
      flexDirection:   'row',
      alignItems:      'center',
      justifyContent:  'center',
      backgroundColor: theme.primary,
      borderRadius:    12,
      paddingVertical: 13,
    },
    saveBtnDisabled: {
      opacity: 0.6,
    },
    saveBtnText: {
      fontFamily: theme.fontBodyBold,
      fontSize:   theme.fontSize.base,
      color:      '#ffffff',
    },
    btnPressed: {
      opacity: 0.85,
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
