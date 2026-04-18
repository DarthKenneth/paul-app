// =============================================================================
// AddServiceModal.js - Centered modal for logging a completed service entry
// Version: 1.3
// Last Updated: 2026-04-17
//
// PROJECT:      Rolodeck (project v0.24.0)
// FILES:        AddServiceModal.js       (this file)
//               CustomerDetailScreen.js  (renders this modal)
//               storage.js               (addServiceEntry, getCustomerById,
//                                         getServiceIntervalMode,
//                                         getServiceIntervalCustomDays)
//               calendarSync.js          (syncCustomerDueDate)
//               squarePlaceholder.js     (sendSquareInvoice)
//               photoUtils.js            (savePhotoLocally)
//               theme.js                 (useTheme)
//               typography.js            (FontSize)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Centered overlay modal (same design as ScheduleServiceModal)
//   - Same MM/DD/YYYY split input + calendar picker as AddServiceScreen
//   - maxDate enforced to today in calendar and handleSave validation
//   - Loads interval mode on open; shows custom interval field when mode='custom'
//   - Photos: camera or library picker (expo-image-picker); URIs copied to
//     documentDirectory via photoUtils before being stored on the entry
//   - Three phases: 'form' → 'success' → 'invoice'
//     - 'form': date/notes/photo entry; Save persists and transitions to 'success'
//     - 'success': confirmation sheet; Done calls onSave(); Send Invoice →
//       transitions to 'invoice'
//     - 'invoice': amount entry; Send calls sendSquareInvoice then onSave();
//       Back returns to 'success'
//   - Backdrop/close: form phase → onClose(); invoice phase → confirmation Alert
//     (entry is already saved, but user may be mid-invoice); success phase → onSave()
//   - Calendar sync failure shows a non-blocking Alert (service entry is still saved)
//   - State resets to 'form' on each open via useEffect on visible prop
//
// CHANGE LOG:
// v1.0  2026-04-10  Claude  Initial implementation (extracted from AddServiceScreen)
// v1.1  2026-04-12  Claude  Post-save invoice prompt (Option F)
//         - Added phase state ('form' | 'success' | 'invoice') to drive 3-phase flow
//         - handleSave now transitions to 'success' instead of calling onSave()
//         - Success view: checkmark, "Service logged", date+name, Done + Send Invoice
//         - Invoice view: inline amount entry wired to sendSquareInvoice
//         - Backdrop/close in non-form phases calls onSave() (entry already saved)
//         - Added sendSquareInvoice import from squarePlaceholder
// v1.2  2026-04-14  Claude  Error surfacing + invoice-phase close confirmation
//         - Calendar sync failure now shows a non-blocking Alert ("Service saved,
//           but calendar sync failed") instead of silently swallowing the error
//         - Backdrop/X tap in invoice phase now prompts "Leave without sending
//           invoice?" before closing — prevents accidental loss of the invoice flow
//           [updated ARCHITECTURE]
// v1.2.1 2026-04-14  Claude  Fixed syntax error from unescaped apostrophe in the
//                            invoice-leave Alert message (customer's profile); swapped
//                            string delimiters from single to double quotes
// v1.3  2026-04-17  Claude  Photo attachments on service entries
//       - Added camera + library photo pickers (expo-image-picker) to the form phase
//       - Photos copied to permanent local storage via savePhotoLocally (photoUtils.js)
//       - Thumbnail strip with per-photo remove button; up to 5 from library at once
//       - photos array stored on service entry (omitted when empty) [updated ARCHITECTURE]
// =============================================================================

import React, { useState, useRef, useMemo, useEffect } from 'react';
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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { todayLocalKey } from '../utils/dateUtils';
import { savePhotoLocally } from '../utils/photoUtils';
import {
  addServiceEntry,
  getCustomerById,
  getServiceIntervalMode,
  getServiceIntervalCustomDays,
} from '../data/storage';
import { syncCustomerDueDate } from '../utils/calendarSync';
import { sendSquareInvoice } from '../utils/squarePlaceholder';
import { useTheme } from '../styles/theme';
import { FontSize } from '../styles/typography';

function todayParts() {
  const t = new Date();
  return {
    dd:   String(t.getDate()).padStart(2, '0'),
    mm:   String(t.getMonth() + 1).padStart(2, '0'),
    yyyy: String(t.getFullYear()),
  };
}

function todayString() {
  return todayLocalKey();
}

export default function AddServiceModal({ visible, customer, onSave, onClose }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [dd, setDd]         = useState('');
  const [mm, setMm]         = useState('');
  const [yyyy, setYyyy]     = useState('');
  const [notes, setNotes]   = useState('');
  const [customDays, setCustomDays]   = useState('30');
  const [intervalMode, setIntervalMode] = useState('365');
  const [calVisible, setCalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState([]);

  // Post-save invoice flow
  const [phase, setPhase]                 = useState('form'); // 'form' | 'success' | 'invoice'
  const [savedDateDisplay, setSavedDateDisplay] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceSending, setInvoiceSending] = useState(false);

  const mmRef   = useRef(null);
  const ddRef   = useRef(null);
  const yyyyRef = useRef(null);

  const isCustom = intervalMode === 'custom';

  // Reset state and load interval mode each time the modal opens
  useEffect(() => {
    if (visible) {
      const p = todayParts();
      setMm(p.mm);
      setDd(p.dd);
      setYyyy(p.yyyy);
      setNotes('');
      setCustomDays('30');
      setSaving(false);
      setCalVisible(false);
      setPhase('form');
      setSavedDateDisplay('');
      setInvoiceAmount('');
      setInvoiceSending(false);
      setPhotos([]);
      Promise.all([getServiceIntervalMode(), getServiceIntervalCustomDays()])
        .then(([mode, days]) => {
          setIntervalMode(mode);
          setCustomDays(String(days));
        })
        .catch(() => {});
    }
  }, [visible]);

  const calSelectedDate = useMemo(() => {
    const y = parseInt(yyyy, 10);
    const m = parseInt(mm, 10);
    const d = parseInt(dd, 10);
    if (
      yyyy.length === 4 && y >= 1900 && y <= 2100 &&
      mm.length >= 1 && m >= 1 && m <= 12 &&
      dd.length >= 1 && d >= 1 && d <= 31
    ) {
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    return todayString();
  }, [dd, mm, yyyy]);

  const calMarked = useMemo(() => ({
    [calSelectedDate]: { selected: true, selectedColor: theme.primary },
  }), [calSelectedDate, theme.primary]);

  const calTheme = useMemo(() => ({
    backgroundColor:            theme.surface,
    calendarBackground:         theme.surface,
    textSectionTitleColor:      theme.textMuted,
    selectedDayBackgroundColor: theme.primary,
    selectedDayTextColor:       '#fff',
    todayTextColor:             theme.primary,
    dayTextColor:               theme.text,
    textDisabledColor:          theme.border,
    arrowColor:                 theme.primary,
    monthTextColor:             theme.text,
    textDayFontFamily:          theme.fontBody,
    textMonthFontFamily:        theme.fontUiBold,
    textDayHeaderFontFamily:    theme.fontUiMedium,
    textDayFontSize:            FontSize.sm,
    textMonthFontSize:          FontSize.base,
    textDayHeaderFontSize:      FontSize.xs,
  }), [theme]);

  const handleDayPress = (day) => {
    setMm(String(day.month).padStart(2, '0'));
    setDd(String(day.day).padStart(2, '0'));
    setYyyy(String(day.year));
    setCalVisible(false);
  };

  // Backdrop/X close — behaviour depends on current phase:
  //   form:    onClose() (nothing saved yet)
  //   success: onSave() (entry already saved, just dismiss)
  //   invoice: confirm before dismissing (user may be mid-invoice)
  const handleClose = () => {
    if (phase === 'form') {
      onClose();
    } else if (phase === 'invoice') {
      Alert.alert(
        'Leave without sending invoice?',
        "The service has been saved. You can send an invoice later from the customer's profile.",
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: onSave },
        ],
      );
    } else {
      onSave();
    }
  };

  const handleSave = async () => {
    if (saving) return;

    const y = parseInt(yyyy, 10);
    const m = parseInt(mm, 10);
    const d = parseInt(dd, 10);

    const validParts =
      !isNaN(y) && !isNaN(m) && !isNaN(d) &&
      y >= 1900 && y <= 2100 &&
      m >= 1 && m <= 12 &&
      d >= 1 && d <= 31;

    if (!validParts) {
      Alert.alert('Invalid Date', 'Please enter a valid day, month, and year.');
      return;
    }

    const parsed = new Date(y, m - 1, d);
    if (parsed.getFullYear() !== y || parsed.getMonth() !== m - 1 || parsed.getDate() !== d) {
      Alert.alert('Invalid Date', "That date doesn't exist — check the day and month.");
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parsed > today) {
      Alert.alert('Invalid Date', "Service date can't be in the future.");
      return;
    }

    if (isCustom) {
      const cd = parseInt(customDays, 10);
      if (isNaN(cd) || cd < 1) {
        Alert.alert('Invalid Interval', 'Please enter a valid number of days (minimum 1).');
        return;
      }
    }

    setSaving(true);
    try {
      const dateObj = new Date(y, m - 1, d, 12, 0, 0);
      const entryData = {
        date:  dateObj.toISOString(),
        type:  'service',
        notes: notes.trim(),
        ...(photos.length > 0 && { photos }),
      };
      if (isCustom) {
        entryData.intervalDays = Math.max(1, parseInt(customDays, 10));
      }

      await addServiceEntry(customer.id, entryData);

      getCustomerById(customer.id)
        .then((c) => syncCustomerDueDate(c))
        .catch((e) => {
          // Non-blocking: entry is saved; sync failure is recoverable.
          Alert.alert(
            'Service saved',
            'The service was logged, but your calendar could not be updated. ' +
            'Check Calendar Sync in Settings if this keeps happening.',
          );
        });

      setSavedDateDisplay(`${mm}/${dd}/${yyyy}`);
      setPhase('success');
      setSaving(false);
    } catch {
      Alert.alert('Error', 'Failed to save service entry.');
      setSaving(false);
    }
  };

  const handleInvoiceSend = async () => {
    const dollars = parseFloat(invoiceAmount);
    if (isNaN(dollars) || dollars <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid dollar amount greater than $0.');
      return;
    }
    setInvoiceSending(true);
    try {
      await sendSquareInvoice(customer, Math.round(dollars * 100));
      onSave();
      Alert.alert(
        'Invoice Sent',
        `Invoice for $${dollars.toFixed(2)} sent to ${customer.email}.`,
      );
    } catch (err) {
      Alert.alert('Not Available', err.message);
    } finally {
      setInvoiceSending(false);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera access is needed to take photos.');
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
      Alert.alert('Permission Required', 'Photo library access is needed to choose photos.');
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} />

        {/* ── Form phase ── */}
        {phase === 'form' && (
          <View style={styles.card}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <Ionicons name="add-circle" size={20} color={theme.primary} style={styles.headerIcon} />
                  <View>
                    <Text style={styles.title}>Add a Service</Text>
                    {customer && (
                      <Text style={styles.subtitle} numberOfLines={1}>{customer.name}</Text>
                    )}
                  </View>
                </View>
                <Pressable onPress={onClose} hitSlop={12}>
                  <Ionicons name="close" size={22} color={theme.textSecondary} />
                </Pressable>
              </View>

              {/* Date */}
              <Text style={styles.label}>Date</Text>
              <View style={styles.dateRow}>
                <View style={styles.dateSegmentWrap}>
                  <TextInput
                    ref={mmRef}
                    style={styles.dateBox}
                    value={mm}
                    onChangeText={(v) => {
                      const clean = v.replace(/\D/g, '').slice(0, 2);
                      setMm(clean);
                      if (clean.length === 2) ddRef.current?.focus();
                    }}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder="MM"
                    placeholderTextColor={theme.placeholder}
                  />
                  <Text style={styles.dateSegmentLabel}>Month</Text>
                </View>

                <Text style={styles.dateSep}>/</Text>

                <View style={styles.dateSegmentWrap}>
                  <TextInput
                    ref={ddRef}
                    style={styles.dateBox}
                    value={dd}
                    onChangeText={(v) => {
                      const clean = v.replace(/\D/g, '').slice(0, 2);
                      setDd(clean);
                      if (clean.length === 2) yyyyRef.current?.focus();
                    }}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder="DD"
                    placeholderTextColor={theme.placeholder}
                  />
                  <Text style={styles.dateSegmentLabel}>Day</Text>
                </View>

                <Text style={styles.dateSep}>/</Text>

                <View style={[styles.dateSegmentWrap, styles.dateSegmentYear]}>
                  <TextInput
                    ref={yyyyRef}
                    style={[styles.dateBox, styles.dateBoxYear]}
                    value={yyyy}
                    onChangeText={(v) => setYyyy(v.replace(/\D/g, '').slice(0, 4))}
                    keyboardType="number-pad"
                    maxLength={4}
                    placeholder="YYYY"
                    placeholderTextColor={theme.placeholder}
                  />
                  <Text style={styles.dateSegmentLabel}>Year</Text>
                </View>

                <Pressable
                  style={styles.calIcon}
                  onPress={() => setCalVisible(true)}
                  accessibilityLabel="Open date picker"
                >
                  <Ionicons name="calendar-outline" size={22} color={theme.primary} />
                </Pressable>
              </View>

              {/* Notes */}
              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={styles.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional notes…"
                placeholderTextColor={theme.placeholder}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              {/* Photos */}
              <Text style={styles.label}>Photos</Text>
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
              {photos.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.photoStrip}
                  contentContainerStyle={styles.photoStripContent}
                >
                  {photos.map((uri, idx) => (
                    <View key={uri + idx} style={styles.thumbWrap}>
                      <Image source={{ uri }} style={styles.thumb} />
                      <Pressable
                        style={styles.thumbRemove}
                        onPress={() => setPhotos(prev => prev.filter((_, i) => i !== idx))}
                        hitSlop={6}
                      >
                        <Ionicons name="close-circle" size={20} color="#fff" />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              )}

              {/* Custom interval */}
              {isCustom && (
                <>
                  <Text style={styles.label}>Custom Interval (days)</Text>
                  <TextInput
                    style={[styles.dateBox, styles.customDaysInput]}
                    value={customDays}
                    onChangeText={(v) => setCustomDays(v.replace(/\D/g, ''))}
                    keyboardType="number-pad"
                    placeholder="e.g. 45"
                    placeholderTextColor={theme.placeholder}
                  />
                </>
              )}

              {/* Save button */}
              <Pressable
                style={({ pressed }) => [
                  styles.saveBtn,
                  pressed && styles.saveBtnPressed,
                  saving  && styles.saveBtnDisabled,
                ]}
                onPress={handleSave}
                disabled={saving}
              >
                <Ionicons name="add-circle-outline" size={18} color="#fff" style={styles.saveBtnIcon} />
                <Text style={styles.saveBtnText}>
                  {saving ? 'Saving…' : 'Add a Service'}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        )}

        {/* ── Success phase ── */}
        {phase === 'success' && (
          <View style={[styles.card, styles.cardCompact]}>
            <View style={styles.successView}>
              <View style={styles.checkRing}>
                <Ionicons name="checkmark" size={28} color="#fff" />
              </View>
              <Text style={styles.successTitle}>Service logged</Text>
              <Text style={styles.successSub}>
                {savedDateDisplay}{customer ? ` · ${customer.name}` : ''}
              </Text>

              <View style={styles.btnStack}>
                <Pressable
                  style={({ pressed }) => [styles.outlineBtn, pressed && styles.outlineBtnPressed]}
                  onPress={() => setPhase('invoice')}
                >
                  <Text style={styles.outlineBtnText}>Send Invoice →</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
                  onPress={onSave}
                >
                  <Text style={styles.primaryBtnText}>Done</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* ── Invoice phase ── */}
        {phase === 'invoice' && (
          <View style={[styles.card, styles.cardCompact]}>
            <Text style={styles.invoiceTitle}>Send Invoice</Text>
            <Text style={styles.invoiceSub}>
              {customer?.email
                ? `Invoice will be sent to ${customer.email}`
                : 'No email on file — add one to this customer first'}
            </Text>

            <View style={styles.amountRow}>
              <Text style={styles.dollarSign}>$</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                placeholderTextColor={theme.placeholder}
                keyboardType="decimal-pad"
                value={invoiceAmount}
                onChangeText={setInvoiceAmount}
                autoFocus
                selectTextOnFocus
              />
            </View>

            <View style={styles.invoiceActions}>
              <Pressable
                style={[styles.invoiceBtn, styles.backBtn]}
                onPress={() => setPhase('success')}
              >
                <Text style={styles.backBtnText}>Back</Text>
              </Pressable>
              <Pressable
                style={[styles.invoiceBtn, styles.sendBtn]}
                onPress={handleInvoiceSend}
                disabled={invoiceSending}
              >
                <Text style={styles.sendBtnText}>
                  {invoiceSending ? 'Sending…' : 'Send'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* ── Calendar picker modal ── */}
      <Modal
        visible={calVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCalVisible(false)}
      >
        <Pressable style={styles.calOverlay} onPress={() => setCalVisible(false)}>
          <Pressable style={styles.calCard} onPress={() => {}}>
            <View style={styles.calHeader}>
              <Text style={styles.calTitle}>Pick a Date</Text>
              <Pressable onPress={() => setCalVisible(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
            <Calendar
              current={calSelectedDate}
              maxDate={todayString()}
              markedDates={calMarked}
              onDayPress={handleDayPress}
              theme={calTheme}
              enableSwipeMonths
              renderArrow={(direction) => (
                <Ionicons
                  name={direction === 'left' ? 'chevron-back' : 'chevron-forward'}
                  size={26}
                  color={theme.primary}
                />
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
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
      backgroundColor: theme.surface,
      borderRadius:    20,
      padding:         24,
      maxHeight:       '85%',
    },
    cardCompact: {
      maxHeight: undefined,
    },
    // ── Form: Header ──
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
    title: {
      fontFamily: theme.fontHeading,
      fontSize:   FontSize.lg,
      color:      theme.text,
    },
    subtitle: {
      fontFamily: theme.fontBody,
      fontSize:   FontSize.sm,
      color:      theme.textMuted,
      marginTop:   2,
    },
    // ── Form: Date row ──
    label: {
      fontFamily:    theme.fontUiBold,
      fontSize:      FontSize.xs,
      color:         theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing:  0.6,
      marginBottom:   8,
    },
    dateRow: {
      flexDirection: 'row',
      alignItems:    'flex-end',
      marginBottom:  20,
      gap:            4,
    },
    dateSegmentWrap: {
      alignItems: 'center',
    },
    dateSegmentYear: {
      flex: 1,
    },
    dateBox: {
      width:             56,
      borderWidth:        1.5,
      borderColor:       theme.inputBorder,
      borderRadius:      10,
      paddingVertical:   10,
      paddingHorizontal:  8,
      textAlign:         'center',
      fontFamily:        theme.fontBodyMedium,
      fontSize:          FontSize.base,
      color:             theme.text,
      backgroundColor:   theme.inputBg,
    },
    dateBoxYear: {
      width: '100%',
    },
    dateSegmentLabel: {
      fontFamily: theme.fontUi,
      fontSize:   FontSize.xxs,
      color:      theme.textMuted,
      marginTop:   4,
    },
    dateSep: {
      fontFamily:   theme.fontBodyBold,
      fontSize:     FontSize.lg,
      color:        theme.textMuted,
      marginBottom: 18,
    },
    calIcon: {
      marginBottom: 16,
      marginLeft:    8,
    },
    customDaysInput: {
      width:        '100%',
      textAlign:    'left',
      marginBottom: 20,
      paddingHorizontal: 12,
    },
    // ── Form: Notes ──
    notesInput: {
      borderWidth:       1.5,
      borderColor:       theme.inputBorder,
      borderRadius:      10,
      paddingHorizontal: 14,
      paddingVertical:   10,
      fontFamily:        theme.fontBody,
      fontSize:          FontSize.base,
      color:             theme.text,
      backgroundColor:   theme.inputBg,
      minHeight:         72,
      marginBottom:      12,
    },
    // ── Form: Photos ──
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
      fontSize:   FontSize.sm,
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
    // ── Form: Save button ──
    saveBtn: {
      flexDirection:     'row',
      alignItems:        'center',
      justifyContent:    'center',
      backgroundColor:   theme.primary,
      borderRadius:      12,
      paddingVertical:   14,
      paddingHorizontal: 20,
    },
    saveBtnPressed: {
      opacity: 0.85,
    },
    saveBtnDisabled: {
      opacity: 0.6,
    },
    saveBtnIcon: {
      marginRight: 8,
    },
    saveBtnText: {
      fontFamily: theme.fontBodyBold,
      fontSize:   FontSize.base,
      color:      '#ffffff',
    },
    // ── Success phase ──
    successView: {
      alignItems:     'center',
      paddingVertical: 8,
    },
    checkRing: {
      width:           56,
      height:          56,
      borderRadius:    28,
      backgroundColor: theme.primary,
      alignItems:      'center',
      justifyContent:  'center',
      marginBottom:    16,
    },
    successTitle: {
      fontFamily:   theme.fontHeading,
      fontSize:     FontSize.xl,
      color:        theme.text,
      marginBottom:  6,
      textAlign:    'center',
    },
    successSub: {
      fontFamily:   theme.fontBody,
      fontSize:     FontSize.sm,
      color:        theme.textMuted,
      textAlign:    'center',
      lineHeight:   FontSize.sm * 1.5,
      marginBottom: 28,
    },
    btnStack: {
      width: '100%',
      gap:    10,
    },
    primaryBtn: {
      backgroundColor: theme.primary,
      borderRadius:    12,
      paddingVertical: 14,
      alignItems:      'center',
    },
    primaryBtnPressed: {
      opacity: 0.85,
    },
    primaryBtnText: {
      fontFamily: theme.fontBodyBold,
      fontSize:   FontSize.base,
      color:      '#ffffff',
    },
    outlineBtn: {
      borderWidth:     1.5,
      borderColor:     theme.primary,
      borderRadius:    12,
      paddingVertical: 14,
      alignItems:      'center',
    },
    outlineBtnPressed: {
      backgroundColor: theme.background,
    },
    outlineBtnText: {
      fontFamily: theme.fontBodyBold,
      fontSize:   FontSize.base,
      color:      theme.primary,
    },
    // ── Invoice phase ──
    invoiceTitle: {
      fontFamily:   theme.fontHeading,
      fontSize:     FontSize.xl,
      color:        theme.text,
      marginBottom:  6,
    },
    invoiceSub: {
      fontFamily:   theme.fontBody,
      fontSize:     FontSize.sm,
      color:        theme.textMuted,
      marginBottom: 20,
      lineHeight:   FontSize.sm * 1.5,
    },
    amountRow: {
      flexDirection:     'row',
      alignItems:        'center',
      backgroundColor:   theme.inputBg,
      borderWidth:        1,
      borderColor:       theme.inputBorder,
      borderRadius:      12,
      paddingHorizontal: 16,
      marginBottom:      24,
    },
    dollarSign: {
      fontFamily:  theme.fontBodyBold,
      fontSize:    FontSize.xl,
      color:       theme.text,
      marginRight:  4,
    },
    amountInput: {
      flex:            1,
      fontFamily:      theme.fontBody,
      fontSize:        FontSize.xl,
      color:           theme.text,
      paddingVertical: 16,
    },
    invoiceActions: {
      flexDirection: 'row',
      gap:            12,
    },
    invoiceBtn: {
      flex:            1,
      borderRadius:    12,
      paddingVertical: 13,
      alignItems:      'center',
    },
    backBtn: {
      backgroundColor: theme.border,
    },
    sendBtn: {
      backgroundColor: theme.primary,
    },
    backBtnText: {
      fontFamily: theme.fontBodyBold,
      fontSize:   FontSize.base,
      color:      theme.textSecondary,
    },
    sendBtnText: {
      fontFamily: theme.fontBodyBold,
      fontSize:   FontSize.base,
      color:      '#ffffff',
    },
    // ── Calendar modal ──
    calOverlay: {
      flex:            1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent:  'center',
      alignItems:      'center',
    },
    calCard: {
      backgroundColor: theme.surface,
      borderRadius:    16,
      width:           '90%',
      overflow:        'hidden',
    },
    calHeader: {
      flexDirection:  'row',
      justifyContent: 'space-between',
      alignItems:     'center',
      padding:         16,
    },
    calTitle: {
      fontFamily: theme.fontUiBold,
      fontSize:   FontSize.base,
      color:      theme.text,
    },
  });
}
