// =============================================================================
// CustomerDetailScreen.js - Customer info, divider, service log, add service
// Version: 1.2
// Last Updated: 2026-04-03
//
// PROJECT:      Rolodeck (project v1.2)
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
//   - Sticky footer: "Add a Service" button fixed to bottom of screen
//   - Service log: rendered newest-to-oldest (storage prepends new entries);
//     the last entry in the displayed list (oldest) receives isInitial=true
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
// v1.0  2026-04-03  Claude  Initial scaffold
// v1.1  2026-04-03  Claude  Redesigned layout per spec:
//                           - Removed status badge and InvoiceButton from view
//                           - Added divider between info and service log
//                           - "Add a Service" sticky footer button (was header
//                             link in v1.0)
//                           - Pass isInitial to ServiceLogEntry for oldest entry
//                           - Removed avatar icon from info section
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

import React, { useState, useCallback } from 'react';
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
import { getCustomerById, updateCustomer, deleteCustomer, archiveCustomer, unarchiveCustomer } from '../data/storage';
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
  const styles = makeStyles(theme);

  const [customer, setCustomer] = useState(null);
  const [editing, setEditing]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState({});
  const zipLookedUp = React.useRef(new Set());

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const c = await getCustomerById(customerId);
          if (!active) return;
          if (!c) { navigation.goBack(); return; }
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
    }, [customerId, navigation]),
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
        navigation.goBack();
        return;
      }
      const c = await getCustomerById(customerId);
      if (c) setCustomer(c);
    } catch {
      Alert.alert('Error', 'Failed to update customer.');
    }
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
              navigation.goBack();
            } catch {
              Alert.alert('Error', 'Failed to delete customer.');
            }
          },
        },
      ],
    );
  };

  if (!customer) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const logCount = customer.serviceLog.length;

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
                {customer.serviceLog.map((entry, idx) => (
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

        {/* ── Sticky footer: Add a Service ── */}
        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [styles.addServiceBtn, pressed && styles.addServiceBtnPressed]}
            onPress={() => navigation.navigate('AddService', { customerId })}
            accessibilityRole="button"
            accessibilityLabel="Add a service"
          >
            <Ionicons name="add-circle-outline" size={20} color={theme.surface} style={styles.addServiceIcon} />
            <Text style={styles.addServiceText}>Add a Service</Text>
          </Pressable>
        </View>

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
      paddingBottom: 100,
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
    emptyLogHint: {
      fontFamily: theme.fontBody,
      fontSize:   FontSize.sm,
      color:      theme.textMuted,
      textAlign:  'center',
      lineHeight: FontSize.sm * 1.5,
    },
    // ── Footer ──
    footer: {
      paddingHorizontal: 20,
      paddingVertical:   14,
      borderTopWidth:     1,
      borderTopColor:    theme.border,
      backgroundColor:   theme.background,
    },
    addServiceBtn: {
      flexDirection:     'row',
      alignItems:        'center',
      justifyContent:    'center',
      backgroundColor:   theme.primary,
      borderRadius:      14,
      paddingVertical:   15,
    },
    addServiceBtnPressed: {
      opacity: 0.85,
    },
    addServiceIcon: {
      marginRight: 8,
    },
    addServiceText: {
      fontFamily: theme.fontBodyBold,
      fontSize:   FontSize.md,
      color:      theme.surface,
    },
  });
}
