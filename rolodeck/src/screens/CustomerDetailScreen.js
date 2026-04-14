// =============================================================================
// CustomerDetailScreen.js - Customer info, divider, service log, add service
// Version: 1.6.3
// Last Updated: 2026-04-14
//
// PROJECT:      Rolodeck (project v0.22)
// FILES:        CustomerDetailScreen.js  (this file)
//               ServiceLogEntry.js       (renders each log entry)
//               storage.js               (getCustomerById, updateCustomer,
//                                          deleteCustomer)
//               theme.js                 (useTheme)
//               typography.js            (FontFamily, FontSize)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Layout: info section → visual divider → service log → sticky footer
//   - Sticky footer: "Add a Service" (teal) + "Schedule" (blue) side by side;
//     both open centered overlay modals (AddServiceModal / ScheduleServiceModal)
//   - Service log: sorted by date descending at render time (sortedLog useMemo);
//     the last entry in the sorted list (oldest date) receives isInitial=true
//     so ServiceLogEntry labels it "Initial Install/Service"
//   - Edit mode: pencil icon in top-right toggles inline edit form
//   - Delete: trash icon with Alert confirmation
//   - useFocusEffect reloads on every focus so log updates appear immediately
//     after returning from AddServiceScreen; uses proper callback+cleanup pattern
//   - ScrollView does not scroll under the sticky footer — paddingBottom on
//     contentContainerStyle accounts for the footer height
//   - Save button has double-tap protection via saving state
//   - All storage operations wrapped in try/catch
//
// CHANGE LOG:
// v1.6.3 2026-04-14  Claude  Clear zipLookedUp Set on each focus so it doesn't
//                            grow unbounded across navigation cycles
// v1.6.2 2026-04-12  Claude  Schedule refresh + badge propagation
//       - handleScheduleSave now reloads customer from storage after saving so
//         scheduled services appear without requiring back-navigation
//       - handleAddSave calls route.params.onAlertsRefresh() after reload so the
//         Services tab badge updates immediately when a service is logged
// v1.6.1 2026-04-12  Claude  Sort service log by date descending at render time so
//                            retroactive entries appear in correct position; fixed
//                            architecture comment [updated ARCHITECTURE]
// v1.6  2026-04-10  Claude  Safe back navigation
//       - Added safeGoBack callback: navigates backTab if set, else goBack()
//         if canGoBack(), else reset to Customers root — avoids GO_BACK errors
//         when the stack is orphaned (single-screen from cross-tab navigate)
//       - Replaced all four navigation.goBack() call sites (headerLeft, customer-
//         not-found in useFocusEffect, archive, delete) with safeGoBack
//       - useFocusEffect dep array switched from [customerId, navigation] to
//         [customerId, safeGoBack] since goBack is now routed through the helper
// v1.0  2026-04-03  Claude  Initial scaffold
// v1.1  2026-04-03  Claude  Redesigned layout per spec:
//                           - Removed status badge and InvoiceButton from view
//                           - Added divider between info and service log
//                           - "Add a Service" sticky footer button (was header
//                             link in v1.0)
//                           - Pass isInitial to ServiceLogEntry for oldest entry
//                           - Removed avatar icon from info section
// v1.5.1 2026-04-10  Claude  Fix back navigation when coming from ServicesTab —
//                            read route.params.backTab and navigate(backTab) instead
//                            of goBack(), which was returning to CustomersScreen
// v1.5  2026-04-10  Claude  Dynamic back button label
//       - useLayoutEffect sets custom headerLeft reading route.params.backLabel
//       - Defaults to "Customers" if no backLabel provided
// v1.4  2026-04-10  Claude  Scheduled services section on customer detail
//       - Imported deleteScheduledService; added handleDeleteScheduled
//       - "Scheduled" section renders above service log when scheduledServices
//         is non-empty; entries sorted soonest first; each has a cancel (×) button
//       - Blue icon wrap (theme.scheduled + '18' alpha), label in theme.scheduled
// v1.3  2026-04-10  Claude  Both footer buttons now open centered modals
//       - Imported ScheduleServiceModal, AddServiceModal, addScheduledService
//       - Footer: Add a Service (teal, left) + Schedule (blue, right) side by side
//       - Add a Service opens AddServiceModal (was navigate to AddServiceScreen)
//       - Schedule opens ScheduleServiceModal; both are centered overlay modals
//       - handleAddSave reloads customer from storage after entry saved
//       - paddingBottom bumped to 110; footer flex-row [updated ARCHITECTURE]
// v1.2  2026-04-03  Claude  Debug + harden
//                           - Fixed useFocusEffect: wrapped async load in sync
//                             callback with cleanup (was passing async directly,
//                             which React warns about)
//                           - Added try/catch around all storage calls
//                           - Added saving state for double-tap protection on
//                             Save Changes button
//                           - Added ActivityIndicator loading state (was returning
//                             null while loading, causing blank flash)
// =============================================================================

import React, { useState, useCallback, useLayoutEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import ServiceLogEntry from '../components/ServiceLogEntry';
import ScheduleServiceModal from '../components/ScheduleServiceModal';
import AddServiceModal from '../components/AddServiceModal';
import { getCustomerById, updateCustomer, deleteCustomer, archiveCustomer, unarchiveCustomer, addScheduledService, deleteScheduledService } from '../data/storage';
import { lookupZip } from '../utils/zipLookup';
import { useTheme } from '../styles/theme';
import { FontSize } from '../styles/typography';

const INFO_FIELDS = [
  { key: 'name',    label: 'Name',    icon: 'person-outline',   placeholder: 'Full name',         autoCapitalize: 'words' },
  { key: 'email',   label: 'Email',   icon: 'mail-outline',     placeholder: 'email@example.com', autoCapitalize: 'none', keyboardType: 'email-address' },
  { key: 'phone',   label: 'Phone',   icon: 'call-outline',     placeholder: '(555) 555-5555',    keyboardType: 'phone-pad' },
  { key: 'address', label: 'Address', icon: 'location-outline', placeholder: 'Street address',    autoCapitalize: 'words' },
  { key: 'city',    label: 'City',    icon: 'business-outline', placeholder: 'City',              autoCapitalize: 'words' },
  { key: 'state',   label: 'State',   icon: 'flag-outline',     placeholder: 'ST',                autoCapitalize: 'characters', maxLength: 2 },
  { key: 'zipCode', label: 'Zip',     icon: 'map-outline',      placeholder: '00000',             keyboardType: 'number-pad', maxLength: 5 },
];

function InfoRow({ icon, value, styles, theme }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={15} color={theme.textMuted} style={styles.infoIcon} />
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function CustomerDetailScreen({ route, navigation }) {
  const { customerId } = route.params;
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [customer, setCustomer]           = useState(null);
  const [editing, setEditing]             = useState(false);
  const [saving, setSaving]               = useState(false);
  const [form, setForm]                   = useState({});
  const [scheduleModal, setScheduleModal] = useState(false);
  const [addModal, setAddModal]           = useState(false);

  // Safe back navigation that never throws GO_BACK errors. Handles three cases:
  //   1. backTab param set (cross-tab origin, e.g. from ServicesTab) → jump to tab
  //   2. normal in-stack navigation → goBack()
  //   3. orphaned stack (only screen in the stack) → reset to Customers root
  const safeGoBack = useCallback(() => {
    const backTab = route.params?.backTab;
    if (backTab) {
      navigation.navigate(backTab);
    } else if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.reset({ index: 0, routes: [{ name: 'Customers' }] });
    }
  }, [navigation, route.params?.backTab]);

  // Dynamic back button — shows the name of the screen that navigated here.
  useLayoutEffect(() => {
    const backLabel = route.params?.backLabel ?? 'Customers';
    navigation.setOptions({
      headerLeft: () => (
        <Pressable
          onPress={safeGoBack}
          style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingRight: 12 }}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={theme.primary} />
          <Text style={{ color: theme.primary, fontFamily: theme.fontBody, fontSize: 17 }}>
            {backLabel}
          </Text>
        </Pressable>
      ),
    });
  }, [navigation, route.params?.backLabel, theme, safeGoBack]);
  const zipLookedUp = React.useRef(new Set());

  useFocusEffect(
    useCallback(() => {
      // Clear the zip lookup cache on each navigation focus so it doesn't
      // grow unbounded if the user edits many different zip codes across sessions.
      zipLookedUp.current.clear();

      let active = true;
      (async () => {
        try {
          const c = await getCustomerById(customerId);
          if (!active) return;
          if (!c) { safeGoBack(); return; }
          setCustomer(c);
          setForm({
            name:    c.name,
            email:   c.email,
            phone:   c.phone,
            address: c.address,
            city:    c.city    || '',
            state:   c.state   || '',
            zipCode: c.zipCode,
          });
        } catch {
          if (active) Alert.alert('Error', 'Failed to load customer data.');
        }
      })();
      return () => { active = false; };
    }, [customerId, safeGoBack]),
  );

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateCustomer(customerId, form);
      setEditing(false);
      const c = await getCustomerById(customerId);
      if (c) {
        setCustomer(c);
        setForm({
          name:    c.name,
          email:   c.email,
          phone:   c.phone,
          address: c.address,
          city:    c.city    || '',
          state:   c.state   || '',
          zipCode: c.zipCode,
        });
      }
    } catch {
      Alert.alert('Error', 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveToggle = async () => {
    try {
      if (customer.archived) {
        await unarchiveCustomer(customerId);
      } else {
        await archiveCustomer(customerId);
        safeGoBack();
        return;
      }
      const c = await getCustomerById(customerId);
      if (c) setCustomer(c);
    } catch {
      Alert.alert('Error', 'Failed to update customer.');
    }
  };

  const handleDeleteScheduled = async (entryId) => {
    try {
      await deleteScheduledService(customerId, entryId);
      const c = await getCustomerById(customerId);
      if (c) setCustomer(c);
    } catch {
      Alert.alert('Error', 'Could not remove scheduled service.');
    }
  };

  const handleAddSave = async () => {
    setAddModal(false);
    try {
      const c = await getCustomerById(customerId);
      if (c) setCustomer(c);
    } catch {}
    route.params?.onAlertsRefresh?.();
  };

  const handleScheduleSave = async (cId, data) => {
    try {
      await addScheduledService(cId, data);
      const c = await getCustomerById(customerId);
      if (c) setCustomer(c);
    } catch {
      Alert.alert('Error', 'Could not save scheduled service.');
    }
    setScheduleModal(false);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Customer',
      `Remove ${customer.name || 'this customer'}? All service history will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:  'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCustomer(customerId);
              safeGoBack();
            } catch {
              Alert.alert('Error', 'Failed to delete customer.');
            }
          },
        },
      ],
    );
  };

  const sortedLog = useMemo(
    () => (customer ? [...customer.serviceLog].sort((a, b) => new Date(b.date) - new Date(a.date)) : []),
    [customer],
  );
  const logCount = sortedLog.length;

  if (!customer) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ── Scrollable content ── */}
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Info section ── */}
          <View style={styles.infoSection}>
            <View style={styles.infoHeader}>
              <Text style={styles.customerName} numberOfLines={1}>
                {customer.name || 'Unnamed'}
              </Text>
              <View style={styles.infoActions}>
                <Pressable
                  style={styles.iconBtn}
                  onPress={() => setEditing((e) => !e)}
                  accessibilityRole="button"
                  accessibilityLabel={editing ? 'Cancel edit' : 'Edit customer'}
                >
                  <Ionicons
                    name={editing ? 'close-outline' : 'pencil-outline'}
                    size={21}
                    color={theme.primary}
                  />
                </Pressable>
                <Pressable
                  style={styles.iconBtn}
                  onPress={handleArchiveToggle}
                  accessibilityRole="button"
                  accessibilityLabel={customer.archived ? 'Unarchive customer' : 'Archive customer'}
                >
                  <Ionicons
                    name={customer.archived ? 'arrow-undo-outline' : 'archive-outline'}
                    size={21}
                    color={theme.textMuted}
                  />
                </Pressable>
                <Pressable
                  style={styles.iconBtn}
                  onPress={handleDelete}
                  accessibilityRole="button"
                  accessibilityLabel="Delete customer"
                >
                  <Ionicons name="trash-outline" size={21} color={theme.overdue} />
                </Pressable>
              </View>
            </View>

            {/* View mode */}
            {!editing && (
              <View style={styles.viewFields}>
                {INFO_FIELDS.slice(1)
                  .filter(({ key }) => key !== 'city' && key !== 'state')
                  .map(({ key, icon }) => {
                    // Insert the combined city/state line right before zip
                    const rows = [];
                    if (key === 'zipCode' && (customer.city || customer.state)) {
                      rows.push(
                        <InfoRow
                          key="cityState"
                          icon="business-outline"
                          value={[customer.city, customer.state].filter(Boolean).join(', ')}
                          styles={styles}
                          theme={theme}
                        />,
                      );
                    }
                    if (customer[key]) {
                      rows.push(
                        <InfoRow
                          key={key}
                          icon={icon}
                          value={customer[key]}
                          styles={styles}
                          theme={theme}
                        />,
                      );
                    }
                    return rows;
                  })}
              </View>
            )}

            {/* Edit mode */}
            {editing && (
              <View style={styles.editFields}>
                {INFO_FIELDS
                  .filter(({ key }) => key !== 'city' && key !== 'state' && key !== 'zipCode')
                  .map(({ key, label, placeholder, keyboardType, autoCapitalize, maxLength }) => (
                  <View key={key} style={styles.field}>
                    <Text style={styles.fieldLabel}>{label}</Text>
                    <TextInput
                      style={styles.input}
                      value={form[key] || ''}
                      onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
                      placeholder={placeholder}
                      placeholderTextColor={theme.placeholder}
                      keyboardType={keyboardType || 'default'}
                      autoCapitalize={autoCapitalize || 'sentences'}
                      maxLength={maxLength}
                    />
                  </View>
                ))}
                <View style={styles.rowFields}>
                  <View style={styles.rowField}>
                    <Text style={styles.fieldLabel}>City</Text>
                    <TextInput
                      style={styles.input}
                      value={form.city || ''}
                      onChangeText={(v) => setForm((f) => ({ ...f, city: v }))}
                      placeholder="Auto-filled from zip"
                      placeholderTextColor={theme.placeholder}
                      autoCapitalize="words"
                    />
                  </View>
                  <View style={styles.rowFieldSmall}>
                    <Text style={styles.fieldLabel}>State</Text>
                    <TextInput
                      style={styles.input}
                      value={form.state || ''}
                      onChangeText={(v) => setForm((f) => ({ ...f, state: v }))}
                      placeholder="ST"
                      placeholderTextColor={theme.placeholder}
                      autoCapitalize="characters"
                      maxLength={2}
                    />
                  </View>
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Zip Code</Text>
                  <TextInput
                    style={styles.input}
                    value={form.zipCode || ''}
                    onChangeText={(v) => {
                      setForm((f) => ({ ...f, zipCode: v }));
                      const clean = v.replace(/\D/g, '');
                      if (clean.length === 5 && !zipLookedUp.current.has(clean)) {
                        zipLookedUp.current.add(clean);
                        lookupZip(clean).then((result) => {
                          if (result) {
                            setForm((f) => ({
                              ...f,
                              city:  f.city  || result.city,
                              state: f.state || result.stateAbbr,
                            }));
                          }
                        });
                      }
                    }}
                    placeholder="00000"
                    placeholderTextColor={theme.placeholder}
                    keyboardType="number-pad"
                    maxLength={5}
                  />
                </View>
                <Pressable
                  style={({ pressed }) => [styles.saveBtn, (pressed || saving) && styles.saveBtnPressed]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* ── Divider ── */}
          <View style={styles.divider} />

          {/* ── Scheduled services section (only when entries exist) ── */}
          {(customer.scheduledServices?.length > 0) && (
            <View style={styles.logSection}>
              <Text style={styles.logTitle}>Scheduled</Text>
              <View style={styles.logCard}>
                {customer.scheduledServices
                  .slice()
                  .sort((a, b) => new Date(a.date) - new Date(b.date))
                  .map((entry, idx, arr) => {
                    const dateStr = new Date(entry.date).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'short', day: 'numeric',
                    });
                    return (
                      <View
                        key={entry.id}
                        style={[styles.schedRow, idx === arr.length - 1 && styles.schedRowLast]}
                      >
                        <View style={styles.schedIconWrap}>
                          <Ionicons name="calendar-outline" size={18} color={theme.scheduled} />
                        </View>
                        <View style={styles.schedContent}>
                          <View style={styles.schedTopRow}>
                            <Text style={styles.schedLabel}>Scheduled Service</Text>
                            <Text style={styles.schedDate}>{dateStr}</Text>
                          </View>
                          {!!entry.notes && (
                            <Text style={styles.schedNotes}>{entry.notes}</Text>
                          )}
                        </View>
                        <Pressable
                          style={styles.schedDelete}
                          onPress={() => handleDeleteScheduled(entry.id)}
                          hitSlop={8}
                          accessibilityLabel="Cancel scheduled service"
                        >
                          <Ionicons name="close-circle-outline" size={20} color={theme.textMuted} />
                        </Pressable>
                      </View>
                    );
                  })}
              </View>
            </View>
          )}

          {/* ── Service log section ── */}
          <View style={styles.logSection}>
            <Text style={styles.logTitle}>Service Log</Text>

            {logCount === 0 ? (
              <View style={styles.emptyLog}>
                <Text style={styles.emptyLogText}>No services recorded yet.</Text>
                <Text style={styles.emptyLogHint}>
                  The first entry will be labeled Initial Install/Service.
                </Text>
              </View>
            ) : (
              <View style={styles.logCard}>
                {sortedLog.map((entry, idx) => (
                  <ServiceLogEntry
                    key={entry.id}
                    entry={entry}
                    isInitial={idx === logCount - 1}
                    isLast={idx === logCount - 1}
                  />
                ))}
              </View>
            )}
          </View>

        </ScrollView>

        {/* ── Sticky footer ── */}
        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [styles.footerBtn, styles.addServiceBtn, pressed && styles.footerBtnPressed]}
            onPress={() => setAddModal(true)}
            accessibilityRole="button"
            accessibilityLabel="Add a service"
          >
            <Ionicons name="add-circle-outline" size={18} color={theme.surface} style={styles.footerBtnIcon} />
            <Text style={styles.footerBtnText}>Add a Service</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.footerBtn, styles.scheduleBtn, pressed && styles.footerBtnPressed]}
            onPress={() => setScheduleModal(true)}
            accessibilityRole="button"
            accessibilityLabel="Schedule service"
          >
            <Ionicons name="calendar-outline" size={18} color="#fff" style={styles.footerBtnIcon} />
            <Text style={styles.footerBtnText}>Schedule</Text>
          </Pressable>
        </View>

        <AddServiceModal
          visible={addModal}
          customer={customer}
          onSave={handleAddSave}
          onClose={() => setAddModal(false)}
        />

        <ScheduleServiceModal
          visible={scheduleModal}
          customer={customer}
          onSave={handleScheduleSave}
          onClose={() => setScheduleModal(false)}
        />

      </KeyboardAvoidingView>
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
    loadingWrap: {
      flex:           1,
      alignItems:     'center',
      justifyContent: 'center',
    },
    content: {
      paddingBottom: 110,
    },
    // ── Info section ──
    infoSection: {
      paddingHorizontal: 20,
      paddingTop:         20,
      paddingBottom:      24,
    },
    infoHeader: {
      flexDirection:  'row',
      alignItems:     'flex-start',
      justifyContent: 'space-between',
      marginBottom:    10,
    },
    customerName: {
      fontFamily: theme.fontDisplayBold,
      fontSize:   FontSize.xxl,
      color:      theme.text,
      flex:        1,
      marginRight:  8,
    },
    infoActions: {
      flexDirection: 'row',
      gap:            4,
      marginTop:       2,
    },
    iconBtn: {
      padding: 6,
    },
    viewFields: {
      gap: 8,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems:    'center',
    },
    infoIcon: {
      width:       22,
      marginRight:  8,
    },
    infoValue: {
      fontFamily: theme.fontBody,
      fontSize:   FontSize.base,
      color:      theme.textSecondary,
      flex:        1,
    },
    editFields: {},
    rowFields: {
      flexDirection: 'row',
      gap:           12,
      marginBottom:  12,
    },
    rowField: {
      flex: 1,
    },
    rowFieldSmall: {
      width: 80,
    },
    field: {
      marginBottom: 12,
    },
    fieldLabel: {
      fontFamily:    theme.fontBodyMedium,
      fontSize:      FontSize.xs,
      color:         theme.textMuted,
      marginBottom:   5,
      textTransform: 'uppercase',
      letterSpacing:  0.5,
    },
    input: {
      fontFamily:        theme.fontBody,
      fontSize:          FontSize.base,
      color:             theme.text,
      backgroundColor:   theme.inputBg,
      borderWidth:        1,
      borderColor:       theme.inputBorder,
      borderRadius:      10,
      paddingVertical:   10,
      paddingHorizontal: 13,
    },
    saveBtn: {
      backgroundColor: theme.primary,
      borderRadius:    12,
      paddingVertical: 13,
      alignItems:      'center',
      marginTop:        4,
    },
    saveBtnPressed: {
      opacity: 0.85,
    },
    saveBtnText: {
      fontFamily: theme.fontBodyBold,
      fontSize:   FontSize.base,
      color:      theme.surface,
    },
    // ── Divider ──
    divider: {
      height:          1,
      backgroundColor: theme.border,
      marginHorizontal: 0,
    },
    // ── Service log ──
    logSection: {
      paddingHorizontal: 20,
      paddingTop:         22,
    },
    logTitle: {
      fontFamily:   theme.fontHeading,
      fontSize:     FontSize.lg,
      color:        theme.text,
      marginBottom: 14,
    },
    logCard: {
      backgroundColor: theme.surface,
      borderRadius:    14,
      overflow:        'hidden',
      borderWidth:      1,
      borderColor:     theme.border,
    },
    emptyLog: {
      paddingVertical:   30,
      alignItems:        'center',
      gap:                6,
    },
    emptyLogText: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   FontSize.base,
      color:      theme.textMuted,
    },
    // ── Scheduled entries ──
    schedRow: {
      flexDirection:     'row',
      alignItems:        'flex-start',
      paddingVertical:   14,
      paddingHorizontal: 16,
      borderBottomWidth:  1,
      borderBottomColor: theme.border,
    },
    schedRowLast: {
      borderBottomWidth: 0,
    },
    schedIconWrap: {
      width:           38,
      height:          38,
      borderRadius:    19,
      backgroundColor: theme.scheduled + '18',
      alignItems:      'center',
      justifyContent:  'center',
      marginRight:     12,
      marginTop:        1,
    },
    schedContent: {
      flex: 1,
    },
    schedTopRow: {
      flexDirection:  'row',
      justifyContent: 'space-between',
      alignItems:     'center',
      marginBottom:    3,
    },
    schedLabel: {
      fontFamily: theme.fontBodyBold,
      fontSize:   FontSize.base,
      color:      theme.scheduled,
    },
    schedDate: {
      fontFamily: theme.fontBody,
      fontSize:   FontSize.sm,
      color:      theme.textMuted,
    },
    schedNotes: {
      fontFamily: theme.fontBody,
      fontSize:   FontSize.sm,
      color:      theme.textSecondary,
      lineHeight: FontSize.sm * 1.55,
    },
    schedDelete: {
      paddingLeft: 8,
      paddingTop:   1,
    },
    emptyLogHint: {
      fontFamily: theme.fontBody,
      fontSize:   FontSize.sm,
      color:      theme.textMuted,
      textAlign:  'center',
      lineHeight: FontSize.sm * 1.5,
    },
    // ── Footer ──
    footer: {
      flexDirection:     'row',
      gap:               10,
      paddingHorizontal: 20,
      paddingVertical:   14,
      borderTopWidth:     1,
      borderTopColor:    theme.border,
      backgroundColor:   theme.background,
    },
    footerBtn: {
      flex:           1,
      flexDirection:  'row',
      alignItems:     'center',
      justifyContent: 'center',
      borderRadius:   14,
      paddingVertical: 15,
    },
    footerBtnPressed: {
      opacity: 0.85,
    },
    footerBtnIcon: {
      marginRight: 6,
    },
    footerBtnText: {
      fontFamily: theme.fontBodyBold,
      fontSize:   FontSize.base,
      color:      '#ffffff',
    },
    addServiceBtn: {
      backgroundColor: theme.primary,
    },
    scheduleBtn: {
      backgroundColor: theme.scheduled,
    },
  });
}
