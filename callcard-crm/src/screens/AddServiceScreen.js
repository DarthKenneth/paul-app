// =============================================================================
// AddServiceScreen.js - Add a service entry: date stamp + notes
// Version: 2.4
// Last Updated: 2026-04-29
//
// PROJECT:      Rolodeck (project v0.28)
// FILES:        AddServiceScreen.js  (this file)
//               storage.js           (addServiceEntry, getCustomerById,
//                                     getServiceIntervalMode,
//                                     getServiceIntervalCustomDays,
//                                     modeToIntervalDays)
//               calendarSync.js      (syncCustomerDueDate)
//               photoUtils.js        (savePhotoLocally)
//               theme.js             (useTheme)
//               typography.js        (FontFamily, FontSize)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Date input: three separate number-pad boxes (DD · MM · YYYY) with
//     auto-advance on fill (DD→MM at 2 digits, MM→YYYY at 2 digits)
//   - Calendar icon opens a modal with react-native-calendars Calendar;
//     selecting a day populates the three boxes and closes the modal
//   - No type toggle — type is stored as 'service' for all entries
//   - Notes field is optional multiline text
//   - Photos: camera or library picker (expo-image-picker); URIs copied to
//     documentDirectory via photoUtils before being stored on the entry
//   - Custom interval: when the global interval mode is 'custom', an additional
//     "Custom interval" field appears; the entered days are stored as intervalDays
//     on the service entry; this value persists for that customer's due date
//     calculation until a new entry is logged without a custom interval
//   - On save: calls addServiceEntry(), calls onAlertsRefresh if provided
//     in route.params (keeps Services tab badge current), then goBack()
//   - Date validation: round-trip check on the assembled date (catches
//     invalid month/day combos like Feb 30)
//   - Double-tap protection via saving state
//   - Storage errors caught and surfaced via Alert
//
// CHANGE LOG:
// v2.4  2026-04-29  Claude  Fire syncUp() after addServiceEntry() for immediate cross-device sync
// v2.3  2026-04-24  Claude  Equipment multi-select picker, dynamic label, deduplicated
//       - Same changes as AddServiceModal v1.9: label is "Equipment Installed" or
//         "Equipment Serviced" based on activeType; equipmentServiced entryField
//         filtered from entryFields loop; ListPickerModal used in multi mode
// v2.2  2026-04-24  Claude  Equipment Install → multi-select "Equipment Installed" checklist
// v2.1  2026-04-24  Claude  Show unit in measure checklist labels
// v2.0  2026-04-24  Claude  Use effectiveServiceTypes for type picker so hidden types
//                           don't appear and custom types do
// v1.9  2026-04-23  Claude  2×2 type grid, entry fields, service checklist
//       - Type chip row → 2×2 flexWrap grid matching AddServiceModal
//       - Entry field picker rows (tap → ListPickerModal); stored as entryValues
//       - Checklist section (check toggle / measure input); stored as checklist
//       - Pulls customLists, checklistItems, checklistVisible from useProfession()
// v1.8  2026-04-23  Claude  Service type selector + profession-driven save button
//       - Added useProfession(); serviceType state defaults to first type in config
//       - Type chip row (hidden when only 1 type) above the Date section
//       - type: serviceType saved on entry instead of hardcoded 'service'
//       - Save button uses rust color (theme.accent) for install:true types
//       - Button label reads "Log {type.label}" (e.g. "Log Equipment Install")
// v1.7  2026-04-19  Claude  Tablet width cap on form scroll container
// v1.0  2026-04-03  Claude  Initial scaffold — included service/install toggle
// v1.1  2026-04-03  Claude  Removed type toggle; simplified to date + notes
//                           only per spec ("service date stamp + notes")
// v1.2  2026-04-03  Claude  Debug + harden
//                           - Fixed date validation: was accepting invalid dates
//                             like 2026-13-45 because Date constructor silently
//                             overflows; now uses strict regex + round-trip check
//                           - Added saving state for double-tap protection
//                           - Added try/catch around addServiceEntry call
// v1.3  2026-04-06  Claude  Fire-and-forget calendar sync after successful save
//                           - Fetches updated customer via getCustomerById after
//                             addServiceEntry, then calls syncCustomerDueDate
//                           - Sync errors are swallowed; never blocks save flow
// v1.4  2026-04-09  Claude  Custom interval support
//       - Loads getServiceIntervalMode + getServiceIntervalCustomDays on mount
//       - Shows "Custom Interval" field (days input) when mode === 'custom'
//       - Stores intervalDays on the service entry when mode === 'custom';
//         omits the field for preset modes so the global setting applies
// v1.5.2 2026-04-10  Claude  Guard goBack with canGoBack check; reset to Customers
//                             root when the stack is orphaned — avoids GO_BACK
//                             errors after save from an empty back stack
// v1.5.1 2026-04-10  Claude  Restrict service date to past/today only — added
//                            future-date guard in handleSave and maxDate on Calendar
// v1.5  2026-04-09  Claude  DD/MM/YYYY split inputs + calendar picker
//       - Replaced single YYYY-MM-DD text field with three separate number-pad
//         boxes (DD, MM, YYYY); auto-advances focus on fill
//       - Calendar icon opens a Modal with react-native-calendars Calendar;
//         tapping a day fills the boxes and closes the modal
//       - Removed DATE_REGEX / todayString helpers; replaced with todayParts()
//       [updated ARCHITECTURE]
// v1.6  2026-04-17  Claude  Photo attachments on service entries
//       - Added camera + library photo pickers (expo-image-picker) to the form
//       - Photos copied to permanent local storage via savePhotoLocally (photoUtils.js)
//       - Thumbnail strip with per-photo remove button; up to 5 from library at once
//       - photos array stored on service entry (omitted when empty) [updated ARCHITECTURE]
// =============================================================================

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Modal,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Image,
  Linking,
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
import { syncUp } from '../utils/cloudSync';
import { reportError } from '../utils/errorReporting';
import { useTheme } from '../styles/theme';
import { useProfession } from '../contexts/ProfessionContext';
import ListPickerModal from '../components/ListPickerModal';
import { FontSize } from '../styles/typography';
import { useContentContainerStyle } from '../utils/responsive';

function todayParts() {
  const t = new Date();
  return {
    dd:   String(t.getDate()).padStart(2, '0'),
    mm:   String(t.getMonth() + 1).padStart(2, '0'),
    yyyy: String(t.getFullYear()),
  };
}

export default function AddServiceScreen({ route, navigation }) {
  const { customerId, onAlertsRefresh } = route.params;
  const { theme } = useTheme();
  const { profession, customLists, checklistItems, checklistVisible, effectiveServiceTypes } = useProfession();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const widthCap = useContentContainerStyle();

  const today = todayParts();
  const [serviceType, setServiceType] = useState(effectiveServiceTypes[0]?.id ?? 'service');
  const [dd, setDd]     = useState(today.dd);
  const [mm, setMm]     = useState(today.mm);
  const [yyyy, setYyyy] = useState(today.yyyy);
  const [calVisible, setCalVisible] = useState(false);

  const [notes, setNotes]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [intervalMode, setIntervalMode]   = useState('365');
  const [customDays, setCustomDays]       = useState('30');
  const [photos, setPhotos]               = useState([]);
  const [entryValues, setEntryValues]     = useState({});
  const [clValues, setClValues]           = useState({});
  const [pickerField, setPickerField]     = useState(null);

  const activeType = useMemo(
    () => effectiveServiceTypes.find((t) => t.id === serviceType) ?? effectiveServiceTypes[0],
    [effectiveServiceTypes, serviceType],
  );

  const ddRef   = useRef(null);
  const yyyyRef = useRef(null);

  useEffect(() => {
    let active = true;
    Promise.all([getServiceIntervalMode(), getServiceIntervalCustomDays()]).then(
      ([m, d]) => {
        if (active) {
          setIntervalMode(m);
          setCustomDays(String(d));
        }
      },
    );
    return () => { active = false; };
  }, []);

  const isCustom = intervalMode === 'custom';

  // ── Date input handlers ─────────────────────────────────────────────────────

  // MM → DD → YYYY order
  const handleMmChange = (text) => {
    const nums = text.replace(/\D/g, '').slice(0, 2);
    setMm(nums);
    if (nums.length === 2) ddRef.current?.focus();
  };

  const handleDdChange = (text) => {
    const nums = text.replace(/\D/g, '').slice(0, 2);
    setDd(nums);
    if (nums.length === 2) yyyyRef.current?.focus();
  };

  const handleYyyyChange = (text) => {
    setYyyy(text.replace(/\D/g, '').slice(0, 4));
  };

  // ── Calendar picker ─────────────────────────────────────────────────────────

  const handleDayPress = (day) => {
    setDd(String(day.day).padStart(2, '0'));
    setMm(String(day.month).padStart(2, '0'));
    setYyyy(String(day.year));
    setCalVisible(false);
  };

  // Build a YYYY-MM-DD string for the calendar's selected/initial date.
  // Falls back to today if the current fields aren't a valid full date.
  const calSelectedDate = useMemo(() => {
    const y = parseInt(yyyy, 10);
    const m = parseInt(mm, 10);
    const d = parseInt(dd, 10);
    if (yyyy.length === 4 && y >= 1900 && y <= 2100 &&
        mm.length >= 1 && m >= 1 && m <= 12 &&
        dd.length >= 1 && d >= 1 && d <= 31) {
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    return todayLocalKey();
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
    textDayFontSize:            theme.fontSize.sm,
    textMonthFontSize:          theme.fontSize.base,
    textDayHeaderFontSize:      theme.fontSize.xs,
  }), [theme]);

  // ── Photo handlers ──────────────────────────────────────────────────────────

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

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (saving) return;

    const y = parseInt(yyyy, 10);
    const m = parseInt(mm, 10);
    const d = parseInt(dd, 10);

    const validParts = !isNaN(y) && !isNaN(m) && !isNaN(d) &&
                       y >= 1900 && y <= 2100 &&
                       m >= 1 && m <= 12 &&
                       d >= 1 && d <= 31;

    if (!validParts) {
      Alert.alert('Invalid Date', 'Please enter a valid day, month, and year.');
      return;
    }

    // Round-trip check to catch impossible combos (e.g. Feb 30)
    const parsed = new Date(y, m - 1, d);
    if (parsed.getFullYear() !== y || parsed.getMonth() !== m - 1 || parsed.getDate() !== d) {
      Alert.alert('Invalid Date', 'That date doesn\'t exist — check the day and month.');
      return;
    }

    // Reject future dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parsed > today) {
      Alert.alert('Invalid Date', 'Service date can\'t be in the future.');
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

      const filledEntryValues = Object.fromEntries(
        Object.entries(entryValues).filter(([, v]) => Array.isArray(v) ? v.length > 0 : Boolean(v)),
      );
      const filledClValues = Object.fromEntries(
        Object.entries(clValues).filter(([, v]) => v !== undefined && v !== ''),
      );
      const entryData = {
        date:  dateObj.toISOString(),
        type:  serviceType,
        notes: notes.trim(),
        ...(photos.length > 0              && { photos }),
        ...(Object.keys(filledEntryValues).length > 0 && { entryValues: filledEntryValues }),
        ...(Object.keys(filledClValues).length   > 0 && { checklist:   filledClValues }),
      };

      if (isCustom) {
        entryData.intervalDays = Math.max(1, parseInt(customDays, 10));
      }

      await addServiceEntry(customerId, entryData);
      syncUp().catch(() => {});

      getCustomerById(customerId)
        .then((customer) => syncCustomerDueDate(customer))
        .catch((err) => reportError(err, { feature: 'calendar', action: 'sync-after-service' }));

      if (typeof onAlertsRefresh === 'function') {
        onAlertsRefresh();
      }

      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.reset({ index: 0, routes: [{ name: 'Customers' }] });
      }
    } catch {
      Alert.alert('Error', 'Failed to save service entry.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, widthCap]}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Type (2×2 grid) ── */}
          {effectiveServiceTypes.length > 1 && (
            <>
              <Text style={styles.label}>Type</Text>
              <View style={styles.typeGrid}>
                {effectiveServiceTypes.map((sType) => {
                  const active = serviceType === sType.id;
                  const isInstall = sType.install === true;
                  return (
                    <Pressable
                      key={sType.id}
                      style={[
                        styles.typeCell,
                        active && (isInstall ? styles.typeCellInstall : styles.typeCellActive),
                      ]}
                      onPress={() => setServiceType(sType.id)}
                    >
                      <Ionicons
                        name={sType.icon}
                        size={18}
                        color={active ? '#fff' : theme.textSecondary}
                      />
                      <Text style={[styles.typeText, active && styles.typeTextActive]}>
                        {sType.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {/* ── Equipment multi-select ── */}
          {(customLists.equipmentTypes?.length ?? 0) > 0 && (() => {
            const isInstall = activeType?.install === true;
            const eqLabel = isInstall ? 'Equipment Installed' : 'Equipment Serviced';
            return (
              <>
                <Text style={[styles.label, styles.labelTop]}>{eqLabel}</Text>
                <Pressable
                  style={styles.pickerRow}
                  onPress={() => setPickerField({
                    key: 'equipmentInstalled',
                    label: eqLabel,
                    source: 'equipmentTypes',
                    optional: true,
                    multi: true,
                  })}
                >
                  <Text
                    style={(entryValues.equipmentInstalled?.length ?? 0) > 0 ? styles.pickerValue : styles.pickerPlaceholder}
                    numberOfLines={1}
                  >
                    {(entryValues.equipmentInstalled?.length ?? 0) > 0
                      ? entryValues.equipmentInstalled.join(', ')
                      : 'Select equipment…'}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={theme.textMuted} />
                </Pressable>
              </>
            );
          })()}

          {/* ── Single-select entry fields (salt type, etc.) — skip equipmentServiced since handled above ── */}
          {(profession.entryFields?.length ?? 0) > 0 && profession.entryFields
            .filter((field) => field.key !== 'equipmentServiced')
            .map((field) => {
              const val = entryValues[field.key] || '';
              return (
                <React.Fragment key={field.key}>
                  <Text style={[styles.label, styles.labelTop]}>
                    {field.label}{field.optional ? '' : ' *'}
                  </Text>
                  <Pressable
                    style={styles.pickerRow}
                    onPress={() => setPickerField(field)}
                  >
                    <Text style={val ? styles.pickerValue : styles.pickerPlaceholder}>
                      {val || `Select ${field.label}…`}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={theme.textMuted} />
                  </Pressable>
                </React.Fragment>
              );
            })}

          {/* ── Checklist ── */}
          {checklistVisible && checklistItems.some((i) => i.visible) && (
            <>
              <Text style={[styles.label, styles.labelTop]}>Service Checklist</Text>
              <View style={styles.checklistCard}>
                {checklistItems.filter((i) => i.visible).map((item, idx, arr) => (
                  <View
                    key={item.id}
                    style={[
                      styles.checklistRow,
                      idx < arr.length - 1 && styles.checklistRowBorder,
                    ]}
                  >
                    <Text style={styles.checklistLabel}>
                      {item.label}{item.unit ? ` (${item.unit})` : ''}
                    </Text>
                    {item.type === 'check' ? (
                      <Pressable
                        onPress={() =>
                          setClValues((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                        }
                        hitSlop={8}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: !!clValues[item.id] }}
                      >
                        <Ionicons
                          name={clValues[item.id] ? 'checkbox' : 'square-outline'}
                          size={24}
                          color={clValues[item.id] ? theme.primary : theme.border}
                        />
                      </Pressable>
                    ) : (
                      <TextInput
                        style={styles.measureInput}
                        value={clValues[item.id] || ''}
                        onChangeText={(v) =>
                          setClValues((prev) => ({ ...prev, [item.id]: v }))
                        }
                        keyboardType="decimal-pad"
                        placeholder="—"
                        placeholderTextColor={theme.placeholder}
                      />
                    )}
                  </View>
                ))}
              </View>
            </>
          )}

          {/* ── Date ── */}
          <Text style={styles.label}>Date</Text>
          <View style={styles.dateRow}>
            {/* MM */}
            <View style={styles.dateSegmentWrap}>
              <TextInput
                style={styles.dateBox}
                value={mm}
                onChangeText={handleMmChange}
                placeholder="MM"
                placeholderTextColor={theme.placeholder}
                keyboardType="number-pad"
                maxLength={2}
                textAlign="center"
                returnKeyType="next"
                accessibilityLabel="Month"
              />
              <Text style={styles.dateSegmentLabel}>Month</Text>
            </View>

            <Text style={styles.dateSep}>/</Text>

            {/* DD */}
            <View style={styles.dateSegmentWrap}>
              <TextInput
                ref={ddRef}
                style={styles.dateBox}
                value={dd}
                onChangeText={handleDdChange}
                placeholder="DD"
                placeholderTextColor={theme.placeholder}
                keyboardType="number-pad"
                maxLength={2}
                textAlign="center"
                returnKeyType="next"
                accessibilityLabel="Day"
              />
              <Text style={styles.dateSegmentLabel}>Day</Text>
            </View>

            <Text style={styles.dateSep}>/</Text>

            {/* YYYY */}
            <View style={[styles.dateSegmentWrap, styles.dateSegmentYear]}>
              <TextInput
                ref={yyyyRef}
                style={[styles.dateBox, styles.dateBoxYear]}
                value={yyyy}
                onChangeText={handleYyyyChange}
                placeholder="YYYY"
                placeholderTextColor={theme.placeholder}
                keyboardType="number-pad"
                maxLength={4}
                textAlign="center"
                returnKeyType="done"
                accessibilityLabel="Year"
              />
              <Text style={styles.dateSegmentLabel}>Year</Text>
            </View>

            {/* Calendar icon */}
            <Pressable
              style={({ pressed }) => [styles.calBtn, pressed && styles.calBtnPressed]}
              onPress={() => setCalVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Open date picker"
            >
              <Ionicons name="calendar-outline" size={22} color={theme.primary} />
            </Pressable>
          </View>

          {/* ── Custom interval ── */}
          {isCustom && (
            <>
              <Text style={[styles.label, styles.labelTop]}>Custom Interval</Text>
              <View style={styles.customIntervalRow}>
                <TextInput
                  style={[styles.dateBox, styles.daysInput]}
                  value={customDays}
                  onChangeText={setCustomDays}
                  placeholder="e.g. 45"
                  placeholderTextColor={theme.placeholder}
                  keyboardType="number-pad"
                  returnKeyType="next"
                  maxLength={4}
                />
                <Text style={styles.daysSuffix}>days until next service</Text>
              </View>
            </>
          )}

          {/* ── Notes ── */}
          <Text style={[styles.label, styles.labelTop]}>Notes</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional — describe what was done…"
            placeholderTextColor={theme.placeholder}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            returnKeyType="default"
          />

          {/* ── Photos ── */}
          <Text style={[styles.label, styles.labelTop]}>Photos</Text>
          <View style={styles.photoButtons}>
            <Pressable style={styles.photoBtn} onPress={handleTakePhoto}>
              <Ionicons name="camera-outline" size={18} color={theme.primary} />
              <Text style={styles.photoBtnText}>Take Photo</Text>
            </Pressable>
            <Pressable style={styles.photoBtn} onPress={handleChoosePhoto}>
              <Ionicons name="image-outline" size={18} color={theme.primary} />
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

          {(() => {
            const activeType = effectiveServiceTypes.find((t) => t.id === serviceType);
            const isInstall = activeType?.install === true;
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.saveBtn,
                  isInstall && styles.saveBtnInstall,
                  (pressed || saving) && styles.saveBtnPressed,
                ]}
                onPress={handleSave}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Save service entry"
              >
                <Text style={styles.saveBtnText}>
                  {saving ? 'Saving…' : `Log ${activeType?.label ?? 'Service'}`}
                </Text>
              </Pressable>
            );
          })()}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Entry field picker ── */}
      {pickerField && (
        <ListPickerModal
          visible={!!pickerField}
          title={pickerField.label}
          items={customLists[pickerField.source] || []}
          selected={
            pickerField.multi
              ? (entryValues[pickerField.key] || [])
              : (entryValues[pickerField.key] || '')
          }
          onSelect={(v) => setEntryValues((prev) => ({ ...prev, [pickerField.key]: v }))}
          onClose={() => setPickerField(null)}
          allowClear={pickerField.optional && !pickerField.multi}
          multi={!!pickerField.multi}
        />
      )}

      {/* ── Calendar picker modal ── */}
      <Modal
        visible={calVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setCalVisible(false)}>
          {/* Prevent taps inside the card from closing the modal */}
          <Pressable style={styles.calCard} onPress={() => {}}>
            <View style={styles.calHeader}>
              <Text style={styles.calTitle}>Pick a Date</Text>
              <Pressable onPress={() => setCalVisible(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
            <Calendar
              current={calSelectedDate}
              maxDate={todayLocalKey()}
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
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: {
      flex:            1,
      backgroundColor: theme.background,
    },
    flex: {
      flex: 1,
    },
    content: {
      padding:       20,
      paddingBottom: 48,
    },
    label: {
      fontFamily:    theme.fontBodyMedium,
      fontSize:      theme.fontSize.xs,
      color:         theme.textMuted,
      marginBottom:   8,
      textTransform: 'uppercase',
      letterSpacing:  0.5,
    },
    labelTop: {
      marginTop: 22,
    },
    // ── Type grid (2×2) ──
    typeGrid: {
      flexDirection: 'row',
      flexWrap:      'wrap',
      gap:            8,
      marginBottom:   6,
    },
    typeCell: {
      width:           '48%',
      flexDirection:   'column',
      alignItems:      'center',
      justifyContent:  'center',
      gap:              6,
      paddingVertical: 14,
      borderRadius:    12,
      backgroundColor: theme.inputBg,
      borderWidth:      1,
      borderColor:     theme.inputBorder,
    },
    typeCellActive: {
      backgroundColor: theme.primary,
      borderColor:     theme.primary,
    },
    typeCellInstall: {
      backgroundColor: theme.accent,
      borderColor:     theme.accent,
    },
    typeText: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   theme.fontSize.xs,
      color:      theme.textSecondary,
      textAlign:  'center',
    },
    typeTextActive: {
      color: '#fff',
    },
    // ── Entry fields ──
    pickerRow: {
      flexDirection:     'row',
      alignItems:        'center',
      justifyContent:    'space-between',
      backgroundColor:   theme.inputBg,
      borderWidth:        1,
      borderColor:       theme.inputBorder,
      borderRadius:      12,
      paddingVertical:   13,
      paddingHorizontal: 14,
      marginBottom:       4,
    },
    pickerValue: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.base,
      color:      theme.text,
    },
    pickerPlaceholder: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.base,
      color:      theme.placeholder,
    },
    // ── Checklist ──
    checklistCard: {
      backgroundColor: theme.inputBg,
      borderWidth:      1,
      borderColor:     theme.inputBorder,
      borderRadius:    12,
      marginBottom:     4,
    },
    checklistRow: {
      flexDirection:     'row',
      alignItems:        'center',
      justifyContent:    'space-between',
      paddingVertical:   11,
      paddingHorizontal: 14,
    },
    checklistRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    checklistLabel: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.base,
      color:      theme.text,
      flex:        1,
      paddingRight: 10,
    },
    measureInput: {
      width:           70,
      borderWidth:      1,
      borderColor:     theme.border,
      borderRadius:    8,
      paddingVertical:  6,
      paddingHorizontal: 8,
      textAlign:       'right',
      fontFamily:      theme.fontBodyMedium,
      fontSize:        theme.fontSize.base,
      color:           theme.text,
      backgroundColor: theme.surface,
    },
    // ── Date row ──
    dateRow: {
      flexDirection: 'row',
      alignItems:    'flex-start',
      gap:            6,
    },
    dateSegmentWrap: {
      alignItems: 'center',
      gap:         5,
    },
    dateSegmentYear: {
      flex: 1,
    },
    dateBox: {
      fontFamily:        theme.fontBody,
      fontSize:          theme.fontSize.lg,
      color:             theme.text,
      backgroundColor:   theme.inputBg,
      borderWidth:        1,
      borderColor:       theme.inputBorder,
      borderRadius:      12,
      paddingVertical:   13,
      width:              64,
    },
    dateBoxYear: {
      width: '100%',
    },
    dateSegmentLabel: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.xs,
      color:      theme.textMuted,
    },
    dateSep: {
      fontFamily:  theme.fontBody,
      fontSize:    theme.fontSize.xl,
      color:       theme.border,
      marginTop:    13,
    },
    calBtn: {
      width:          48,
      height:         52,
      borderRadius:   12,
      backgroundColor: theme.inputBg,
      borderWidth:     1,
      borderColor:    theme.inputBorder,
      alignItems:     'center',
      justifyContent: 'center',
      marginTop:       0,
    },
    calBtnPressed: {
      opacity: 0.7,
    },
    // ── Custom interval ──
    customIntervalRow: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:            12,
    },
    daysInput: {
      width:     90,
      fontSize:  theme.fontSize.base,
      paddingVertical: 12,
    },
    daysSuffix: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.sm,
      color:      theme.textMuted,
      flex:        1,
    },
    // ── Notes ──
    input: {
      fontFamily:        theme.fontBody,
      fontSize:          theme.fontSize.base,
      color:             theme.text,
      backgroundColor:   theme.inputBg,
      borderWidth:        1,
      borderColor:       theme.inputBorder,
      borderRadius:      12,
      paddingVertical:   12,
      paddingHorizontal: 14,
    },
    notesInput: {
      height: 150,
    },
    // ── Photos ──
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
      borderWidth:      1,
      borderColor:     theme.inputBorder,
      borderRadius:    12,
      paddingVertical: 12,
      backgroundColor: theme.inputBg,
    },
    photoBtnText: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   theme.fontSize.sm,
      color:      theme.primary,
    },
    photoStrip: {
      marginBottom: 4,
    },
    photoStripContent: {
      gap: 8,
    },
    thumbWrap: {
      position: 'relative',
    },
    thumb: {
      width:        88,
      height:       88,
      borderRadius:  10,
    },
    thumbRemove: {
      position: 'absolute',
      top:      -6,
      right:    -6,
    },
    // ── Save button ──
    saveBtn: {
      backgroundColor: theme.primary,
      borderRadius:    14,
      paddingVertical:  15,
      alignItems:      'center',
      marginTop:        28,
    },
    saveBtnInstall: {
      backgroundColor: theme.accent,
    },
    saveBtnPressed: {
      opacity: 0.85,
    },
    saveBtnText: {
      fontFamily: theme.fontBodyBold,
      fontSize:   theme.fontSize.md,
      color:      theme.surface,
    },
    // ── Calendar modal ──
    modalOverlay: {
      flex:            1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent:  'center',
      alignItems:      'center',
      padding:          24,
    },
    calCard: {
      width:           '100%',
      backgroundColor: theme.surface,
      borderRadius:    20,
      overflow:        'hidden',
      shadowColor:     '#000',
      shadowOffset:    { width: 0, height: 8 },
      shadowOpacity:   0.2,
      shadowRadius:    20,
      elevation:       10,
    },
    calHeader: {
      flexDirection:  'row',
      alignItems:     'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingTop:      16,
      paddingBottom:    8,
    },
    calTitle: {
      fontFamily: theme.fontUiBold,
      fontSize:   theme.fontSize.base,
      color:      theme.text,
    },
  });
}
