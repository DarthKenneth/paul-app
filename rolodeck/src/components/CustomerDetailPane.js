// =============================================================================
// CustomerDetailPane.js - Embeddable customer detail body (no nav header)
// Version: 1.1
// Last Updated: 2026-04-25
//
// PROJECT:      Rolodeck (project v1.1.0)
// FILES:        CustomerDetailPane.js     (this file — embeddable pane body)
//               CustomerDetailScreen.js   (thin nav wrapper using this pane)
//               CustomersScreen.js        (mounts pane in split view on tablet)
//               storage.js               (getCustomerById, updateCustomer, deleteCustomer…)
//               calendarSync.js          (syncScheduledService, removeCustomerEvent…)
//               photoUtils.js            (deletePhotosFromDisk)
//               theme.js                 (useTheme)
//               typography.js            (FontSize)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Extracted from CustomerDetailScreen so the same UI can render both as a
//     full pushed screen (phone) and as an embedded right-pane (tablet split view)
//   - Props replace what was previously sourced from route.params and navigation:
//       customerId     — the customer to show
//       onBack         — called on delete / archive (split view: clears selection)
//       onAlertsRefresh — called after add/delete service (badge refresh)
//       isPaneMode     — when true, skips SafeAreaView (parent handles insets)
//       style          — additional style for the root container
//   - All modal overlays (AddServiceModal, EditServiceModal, ScheduleServiceModal)
//     remain inline so they work correctly in both embedded and full-screen modes
//   - useFocusEffect is replaced by a prop-triggered useEffect so the pane
//     refreshes when customerId changes (split view tap) without needing focus
//
// CHANGE LOG:
// v1.0  2026-04-24  Claude  Extracted from CustomerDetailScreen for tablet split view
// v1.1  2026-04-25  Claude  Tap-to-call and tap-to-email on phone/email info rows
// =============================================================================

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ServiceLogEntry     from './ServiceLogEntry';
import ScheduleServiceModal from './ScheduleServiceModal';
import AddServiceModal     from './AddServiceModal';
import EditServiceModal    from './EditServiceModal';
import ListPickerModal     from './ListPickerModal';
import {
  getCustomerById, updateCustomer, deleteCustomer,
  archiveCustomer, unarchiveCustomer,
  addScheduledService, deleteScheduledService,
} from '../data/storage';
import { syncScheduledService, removeScheduledServiceEvent, removeCustomerEvent } from '../utils/calendarSync';
import { deletePhotosFromDisk } from '../utils/photoUtils';
import { GEOAPIFY_API_KEY } from '../config/placesConfig';
import { useTheme } from '../styles/theme';
import { useProfession } from '../contexts/ProfessionContext';
import { FontSize } from '../styles/typography';
import { useContentContainerStyle } from '../utils/responsive';

// ── Geoapify ─────────────────────────────────────────────────────────────────

const GEOAPIFY_AUTOCOMPLETE_URL = 'https://api.geoapify.com/v1/geocode/autocomplete';

async function fetchSuggestions(input, signal) {
  if (!GEOAPIFY_API_KEY) return [];
  const params = new URLSearchParams({
    text: input, filter: 'countrycode:us', limit: '5', apiKey: GEOAPIFY_API_KEY,
  });
  const res = await fetch(`${GEOAPIFY_AUTOCOMPLETE_URL}?${params}`, { signal });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.features) ? data.features : [];
}

// ── Field config ──────────────────────────────────────────────────────────────

const INFO_FIELDS = [
  { key: 'name',    label: 'Name',    icon: 'person-outline',   placeholder: 'Full name',         autoCapitalize: 'words' },
  { key: 'email',   label: 'Email',   icon: 'mail-outline',     placeholder: 'email@example.com', autoCapitalize: 'none', keyboardType: 'email-address' },
  { key: 'phone',   label: 'Phone',   icon: 'call-outline',     placeholder: '(555) 555-5555',    keyboardType: 'phone-pad' },
  { key: 'address', label: 'Address', icon: 'location-outline', placeholder: 'Street address',    autoCapitalize: 'words' },
  { key: 'city',    label: 'City',    icon: 'business-outline', placeholder: 'City',              autoCapitalize: 'words' },
  { key: 'state',   label: 'State',   icon: 'flag-outline',     placeholder: 'ST',                autoCapitalize: 'characters', maxLength: 2 },
  { key: 'zipCode', label: 'Zip',     icon: 'map-outline',      placeholder: '00000',             keyboardType: 'number-pad', maxLength: 5 },
];

function InfoRow({ icon, value, onPress, styles, theme }) {
  const iconColor = onPress ? theme.tint : theme.textMuted;
  const textStyle = onPress ? [styles.infoValue, styles.infoValueTappable] : styles.infoValue;
  const inner = (
    <>
      <Ionicons name={icon} size={15} color={iconColor} style={styles.infoIcon} />
      <Text style={textStyle}>{value}</Text>
    </>
  );
  if (onPress) {
    return (
      <Pressable style={({ pressed }) => [styles.infoRow, pressed && styles.infoRowPressed]}
        onPress={onPress} accessibilityRole="button">
        {inner}
      </Pressable>
    );
  }
  return <View style={styles.infoRow}>{inner}</View>;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CustomerDetailPane({
  customerId,
  onBack,
  onAlertsRefresh,
  isPaneMode = false,
  style,
}) {
  const { theme } = useTheme();
  const { profession, customLists, allServiceTypes } = useProfession();
  const styles   = useMemo(() => makeStyles(theme), [theme]);
  const widthCap = useContentContainerStyle();

  const [customer, setCustomer]             = useState(null);
  const [editing, setEditing]               = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [form, setForm]                     = useState({});
  const [scheduleModal, setScheduleModal]   = useState(false);
  const [addModal, setAddModal]             = useState(false);
  const [editEntry, setEditEntry]           = useState(null);
  const [editIsInitial, setEditIsInitial]   = useState(false);
  const [editInitialMode, setEditInitialMode] = useState('view');
  const [equipPicker, setEquipPicker]       = useState(null);
  const [suggestions, setSuggestions]       = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const debounceRef = useRef(null);
  const abortRef    = useRef(null);

  // Reload whenever customerId changes (handles split-view tap switching)
  useEffect(() => {
    let active = true;
    setCustomer(null);
    setEditing(false);
    (async () => {
      try {
        const c = await getCustomerById(customerId);
        if (!active) return;
        if (!c) { onBack?.(); return; }
        setCustomer(c);
        setForm({
          name:      c.name,
          email:     c.email,
          phone:     c.phone,
          address:   c.address,
          city:      c.city    || '',
          state:     c.state   || '',
          zipCode:   c.zipCode,
          equipment: { ...(c.equipment || {}) },
        });
      } catch {
        if (active) Alert.alert('Error', 'Failed to load customer data.');
      }
    })();
    return () => { active = false; };
  }, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Address autocomplete ───────────────────────────────────────────────────

  const handleAddressChange = (text) => {
    setForm((f) => ({ ...f, address: text }));
    setSuggestions([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!GEOAPIFY_API_KEY || text.trim().length < 3) return;
    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      setSuggestLoading(true);
      try {
        const preds = await fetchSuggestions(text, abortRef.current.signal);
        setSuggestions(preds);
      } catch (err) {
        if (err.name !== 'AbortError') console.error('[Geoapify]', err);
      } finally {
        setSuggestLoading(false);
      }
    }, 350);
  };

  const handleSuggestionSelect = (feature) => {
    setSuggestions([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const p = feature.properties;
    const streetAddr = [p.housenumber, p.street].filter(Boolean).join(' ') || p.address_line1;
    setForm((f) => ({
      ...f,
      address: streetAddr   || f.address,
      city:    p.city       || f.city,
      state:   p.state_code || f.state,
      zipCode: p.postcode   || f.zipCode,
    }));
  };

  const handleAddressBlur = () => { setTimeout(() => setSuggestions([]), 150); };

  // ── Mutations ──────────────────────────────────────────────────────────────

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
          name:      c.name,
          email:     c.email,
          phone:     c.phone,
          address:   c.address,
          city:      c.city    || '',
          state:     c.state   || '',
          zipCode:   c.zipCode,
          equipment: { ...(c.equipment || {}) },
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
        onBack?.();
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
      removeScheduledServiceEvent(entryId);
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
    onAlertsRefresh?.();
  };

  const handleScheduleSave = async (cId, data) => {
    try {
      const entry = await addScheduledService(cId, data);
      const c = await getCustomerById(customerId);
      if (c) {
        setCustomer(c);
        syncScheduledService(c, entry);
      }
    } catch {
      Alert.alert('Error', 'Could not save scheduled service.');
    }
    setScheduleModal(false);
  };

  const handleContactPress = useCallback((type, value) => {
    const isPhone = type === 'phone';
    Alert.alert(
      isPhone ? 'Call Customer' : 'Email Customer',
      isPhone ? `Call ${value}?` : `Email ${value}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: isPhone ? 'Call' : 'Email', onPress: () => Linking.openURL(isPhone ? `tel:${value}` : `mailto:${value}`) },
      ]
    );
  }, []);

  const handleDelete = () => {
    Alert.alert(
      'Delete Customer',
      `Remove ${customer.name || 'this customer'}? All service history will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              const photoUris  = (customer.serviceLog || []).flatMap((e) => (Array.isArray(e.photos) ? e.photos : []));
              const scheduledIds = (customer.scheduledServices || []).map((s) => s.id);
              await deleteCustomer(customerId);
              removeCustomerEvent(customerId);
              scheduledIds.forEach((sid) => removeScheduledServiceEvent(sid));
              deletePhotosFromDisk(photoUris);
              onBack?.();
            } catch {
              Alert.alert('Error', 'Failed to delete customer.');
            }
          },
        },
      ],
    );
  };

  // ── Derived state ──────────────────────────────────────────────────────────

  const sortedLog = useMemo(
    () => (customer ? [...customer.serviceLog].sort((a, b) => new Date(b.date) - new Date(a.date)) : []),
    [customer],
  );

  const latestEntryValues = useMemo(() => {
    for (const entry of sortedLog) {
      const ev = entry.entryValues;
      if (!ev) continue;
      const hasEquipment = Array.isArray(ev.equipmentInstalled) && ev.equipmentInstalled.length > 0;
      const hasOther = (profession.entryFields || []).some((f) => f.key !== 'equipmentServiced' && ev[f.key]);
      if (hasEquipment || hasOther) return { values: ev, date: entry.date };
    }
    return null;
  }, [sortedLog, profession.entryFields]);

  const logCount = sortedLog.length;

  // ── Loading state ──────────────────────────────────────────────────────────

  if (!customer) {
    const loading = (
      <View style={[styles.loadingWrap, style]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
    if (isPaneMode) return loading;
    return <SafeAreaView style={styles.safe}>{loading}</SafeAreaView>;
  }

  // ── Main render ────────────────────────────────────────────────────────────

  const body = (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.content, widthCap]}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Info section ── */}
        <View style={styles.infoSection}>
          <View style={styles.infoHeader}>
            <Text style={styles.customerName} numberOfLines={1}>
              {customer.name || 'Unnamed'}
            </Text>
            <View style={styles.infoActions}>
              <Pressable style={styles.iconBtn} onPress={() => setEditing((e) => !e)}
                accessibilityRole="button" accessibilityLabel={editing ? 'Cancel edit' : 'Edit customer'}>
                <Ionicons name={editing ? 'close-outline' : 'pencil-outline'} size={18}
                  color={editing ? theme.textSecondary : theme.textMuted} />
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={handleArchiveToggle}
                accessibilityRole="button" accessibilityLabel={customer.archived ? 'Unarchive' : 'Archive'}>
                <Ionicons name={customer.archived ? 'arrow-undo-outline' : 'archive-outline'} size={21}
                  color={theme.textMuted} />
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={handleDelete}
                accessibilityRole="button" accessibilityLabel="Delete customer">
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
                  const rows = [];
                  if (key === 'zipCode' && (customer.city || customer.state)) {
                    rows.push(
                      <InfoRow key="cityState" icon="business-outline"
                        value={[customer.city, customer.state].filter(Boolean).join(', ')}
                        styles={styles} theme={theme} />
                    );
                  }
                  if (customer[key]) {
                    const onPress = (key === 'phone' || key === 'email')
                      ? () => handleContactPress(key, customer[key])
                      : undefined;
                    rows.push(<InfoRow key={key} icon={icon} value={customer[key]} onPress={onPress} styles={styles} theme={theme} />);
                  }
                  return rows;
                })}
            </View>
          )}

          {/* Edit mode */}
          {editing && (
            <View style={styles.editFields}>
              {INFO_FIELDS
                .filter(({ key }) => key !== 'city' && key !== 'state' && key !== 'zipCode' && key !== 'address')
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

              {/* Address with autocomplete */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Address</Text>
                <View style={styles.addressInputWrap}>
                  <TextInput
                    style={[styles.input, styles.addressInput]}
                    value={form.address || ''}
                    onChangeText={handleAddressChange}
                    onBlur={handleAddressBlur}
                    placeholder="Start typing a street address…"
                    placeholderTextColor={theme.placeholder}
                    autoCapitalize="words"
                  />
                  {suggestLoading && (
                    <ActivityIndicator size="small" color={theme.primary} style={styles.addressSpinner} />
                  )}
                </View>
                {suggestions.length > 0 && (
                  <View style={styles.suggestionList}>
                    {suggestions.map((feature, idx) => {
                      const p = feature.properties;
                      const mainText = [p.housenumber, p.street].filter(Boolean).join(' ') || p.address_line1;
                      const subParts = [p.city, [p.state_code, p.postcode].filter(Boolean).join(' ')].filter(Boolean);
                      return (
                        <Pressable
                          key={p.formatted || idx}
                          style={({ pressed }) => [
                            styles.suggestionRow,
                            pressed && styles.suggestionRowPressed,
                            idx < suggestions.length - 1 && styles.suggestionRowBorder,
                          ]}
                          onPress={() => handleSuggestionSelect(feature)}
                        >
                          <Ionicons name="location-outline" size={16} color={theme.primary} style={styles.suggestionIcon} />
                          <View style={styles.suggestionTexts}>
                            <Text style={styles.suggestionMain} numberOfLines={1}>{mainText}</Text>
                            {!!subParts.join(', ') && (
                              <Text style={styles.suggestionSub} numberOfLines={1}>{subParts.join(', ')}</Text>
                            )}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>

              <View style={styles.rowFields}>
                <View style={styles.rowField}>
                  <Text style={styles.fieldLabel}>City</Text>
                  <TextInput style={styles.input} value={form.city || ''}
                    onChangeText={(v) => setForm((f) => ({ ...f, city: v }))}
                    placeholder="City" placeholderTextColor={theme.placeholder} autoCapitalize="words" />
                </View>
                <View style={styles.rowFieldSmall}>
                  <Text style={styles.fieldLabel}>State</Text>
                  <TextInput style={styles.input} value={form.state || ''}
                    onChangeText={(v) => setForm((f) => ({ ...f, state: v }))}
                    placeholder="ST" placeholderTextColor={theme.placeholder}
                    autoCapitalize="characters" maxLength={2} />
                </View>
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Zip Code</Text>
                <TextInput style={styles.input} value={form.zipCode || ''}
                  onChangeText={(v) => setForm((f) => ({ ...f, zipCode: v }))}
                  textContentType="none" placeholder="00000"
                  placeholderTextColor={theme.placeholder} keyboardType="number-pad" maxLength={5} />
              </View>
              <Pressable
                style={({ pressed }) => [styles.saveBtn, (pressed || saving) && styles.saveBtnPressed]}
                onPress={handleSave} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* ── Equipment section (view) ── */}
        {!editing && (profession.equipmentFields?.length ?? 0) > 0 &&
          customer.equipment && Object.values(customer.equipment).some(Boolean) && (
          <View style={styles.equipSection}>
            <Text style={styles.equipTitle}>Equipment</Text>
            {profession.equipmentFields.map(({ key, label }) => {
              const val = customer.equipment?.[key];
              if (!val) return null;
              return (
                <View key={key} style={styles.equipRow}>
                  <Text style={styles.equipLabel}>{label}</Text>
                  <Text style={styles.equipValue}>{val}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Last service details (view) ── */}
        {!editing && latestEntryValues && (() => {
          const ev = latestEntryValues.values;
          const dateStr = new Date(latestEntryValues.date).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
          });
          const rows = [];
          if (Array.isArray(ev.equipmentInstalled) && ev.equipmentInstalled.length > 0) {
            rows.push({ label: 'Equipment', value: ev.equipmentInstalled.join(', ') });
          }
          for (const field of (profession.entryFields || [])) {
            if (field.key === 'equipmentServiced') continue;
            const val = ev[field.key];
            if (val) rows.push({ label: field.label, value: String(val) });
          }
          if (rows.length === 0) return null;
          return (
            <View style={styles.lastServiceSection}>
              <View style={styles.lastServiceHeader}>
                <Text style={styles.equipTitle}>Last Service Details</Text>
                <Text style={styles.lastServiceDate}>{dateStr}</Text>
              </View>
              {rows.map(({ label, value }) => (
                <View key={label} style={styles.equipRow}>
                  <Text style={styles.equipLabel}>{label}</Text>
                  <Text style={styles.equipValue}>{value}</Text>
                </View>
              ))}
            </View>
          );
        })()}

        {/* ── Equipment fields (edit) ── */}
        {editing && (profession.equipmentFields?.length ?? 0) > 0 && (
          <View style={styles.equipEditSection}>
            <Text style={styles.equipTitle}>Equipment</Text>
            {profession.equipmentFields.map(({ key, label, kind, source }) => (
              <View key={key} style={styles.field}>
                <Text style={styles.fieldLabel}>{label}</Text>
                {kind === 'dropdown' ? (
                  <Pressable style={styles.equipPickerRow}
                    onPress={() => setEquipPicker({ field: { key, label, source } })}>
                    <Text style={form.equipment?.[key] ? styles.equipPickerValue : styles.equipPickerPlaceholder}>
                      {form.equipment?.[key] || `Select ${label}…`}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={theme.textMuted} />
                  </Pressable>
                ) : (
                  <TextInput
                    style={styles.input}
                    value={form.equipment?.[key] || ''}
                    onChangeText={(v) =>
                      setForm((f) => ({ ...f, equipment: { ...(f.equipment || {}), [key]: v } }))
                    }
                    placeholder={`Enter ${label}…`}
                    placeholderTextColor={theme.placeholder}
                    autoCapitalize="words"
                  />
                )}
              </View>
            ))}
          </View>
        )}

        {/* ── Divider ── */}
        <View style={styles.divider} />

        {/* ── Scheduled services ── */}
        {(customer.scheduledServices?.length > 0) && (
          <View style={styles.logSection}>
            <Text style={styles.logTitle}>Scheduled</Text>
            <View style={styles.logCard}>
              {customer.scheduledServices
                .slice().sort((a, b) => new Date(a.date) - new Date(b.date))
                .map((entry, idx, arr) => {
                  const apptDate = new Date(entry.date);
                  const dateStr  = apptDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                  const timeStr  = apptDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                  const schedType = allServiceTypes.find((t) => t.id === entry.type) ?? allServiceTypes[0];
                  return (
                    <View key={entry.id} style={[styles.schedRow, idx === arr.length - 1 && styles.schedRowLast]}>
                      <View style={styles.schedIconWrap}>
                        <Ionicons name={schedType.icon} size={18} color={theme.scheduled} />
                      </View>
                      <View style={styles.schedContent}>
                        <View style={styles.schedTopRow}>
                          <Text style={styles.schedLabel}>Scheduled {schedType.label}</Text>
                          <Text style={styles.schedDate}>{dateStr}</Text>
                        </View>
                        <Text style={styles.schedTime}>{timeStr}</Text>
                        {!!entry.notes && <Text style={styles.schedNotes}>{entry.notes}</Text>}
                      </View>
                      <Pressable style={styles.schedDelete} onPress={() => handleDeleteScheduled(entry.id)}
                        hitSlop={8} accessibilityLabel="Cancel scheduled service">
                        <Ionicons name="close-circle-outline" size={20} color={theme.textMuted} />
                      </Pressable>
                    </View>
                  );
                })}
            </View>
          </View>
        )}

        {/* ── Service log ── */}
        <View style={styles.logSection}>
          <Text style={styles.logTitle}>Service Log</Text>
          {logCount === 0 ? (
            <View style={styles.emptyLog}>
              <Text style={styles.emptyLogText}>No services recorded yet.</Text>
              <Text style={styles.emptyLogHint}>The first entry will be labeled Initial Install/Service.</Text>
            </View>
          ) : (
            <View style={styles.logCard}>
              {sortedLog.map((entry, idx) => {
                const isInitial = idx === logCount - 1;
                return (
                  <ServiceLogEntry key={entry.id} entry={entry} isInitial={isInitial}
                    isLast={idx === logCount - 1}
                    onPress={() => {
                      setEditIsInitial(isInitial);
                      setEditInitialMode('view');
                      setEditEntry(entry);
                    }}
                  />
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Footer ── */}
      <View style={styles.footer}>
        <View style={[styles.footerInner, widthCap]}>
          <Pressable
            style={({ pressed }) => [styles.footerBtn, styles.addServiceBtn, pressed && styles.footerBtnPressed]}
            onPress={() => setAddModal(true)} accessibilityRole="button" accessibilityLabel="Add a service">
            <Ionicons name="add-circle-outline" size={18} color={theme.surface} style={styles.footerBtnIcon} />
            <Text style={styles.footerBtnText}>Add a Service</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.footerBtn, styles.scheduleBtn, pressed && styles.footerBtnPressed]}
            onPress={() => setScheduleModal(true)} accessibilityRole="button" accessibilityLabel="Schedule service">
            <Ionicons name="calendar-outline" size={18} color="#fff" style={styles.footerBtnIcon} />
            <Text style={styles.footerBtnText}>Schedule</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Modals ── */}
      <AddServiceModal
        visible={addModal} customer={customer}
        onSave={handleAddSave} onClose={() => setAddModal(false)}
      />
      <ScheduleServiceModal
        visible={scheduleModal} customer={customer}
        onSave={handleScheduleSave} onClose={() => setScheduleModal(false)}
      />
      <EditServiceModal
        visible={editEntry !== null}
        customerId={customerId}
        entry={editEntry}
        isInitial={editIsInitial}
        initialMode={editInitialMode}
        onSave={async () => {
          setEditEntry(null);
          try { const c = await getCustomerById(customerId); if (c) setCustomer(c); } catch {}
        }}
        onDelete={async () => {
          setEditEntry(null);
          try { const c = await getCustomerById(customerId); if (c) setCustomer(c); } catch {}
          onAlertsRefresh?.();
        }}
        onClose={() => setEditEntry(null)}
      />
      {equipPicker && (
        <ListPickerModal
          visible={!!equipPicker}
          title={equipPicker.field.label}
          items={customLists[equipPicker.field.source] || []}
          selected={form.equipment?.[equipPicker.field.key] || ''}
          onSelect={(v) => {
            setForm((f) => ({ ...f, equipment: { ...(f.equipment || {}), [equipPicker.field.key]: v } }));
          }}
          onClose={() => setEquipPicker(null)}
          allowClear
        />
      )}
    </KeyboardAvoidingView>
  );

  if (isPaneMode) {
    return <View style={[styles.pane, style]}>{body}</View>;
  }
  return (
    <SafeAreaView style={[styles.safe, style]}>
      {body}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(theme) {
  return StyleSheet.create({
    safe:        { flex: 1, backgroundColor: theme.background },
    pane:        { flex: 1, backgroundColor: theme.background },
    flex:        { flex: 1 },
    loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content:     { paddingBottom: 110 },
    // Info
    infoSection:    { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 },
    infoHeader:     { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
    customerName:   { fontFamily: theme.fontHeading, fontSize: FontSize.xl, color: theme.textPrimary, flex: 1, marginRight: 8 },
    infoActions:    { flexDirection: 'row', gap: 4, marginTop: 4 },
    iconBtn:        { padding: 4 },
    viewFields:     { gap: 6 },
    infoRow:          { flexDirection: 'row', alignItems: 'center' },
    infoRowPressed:   { opacity: 0.5 },
    infoIcon:         { width: 22, marginRight: 6 },
    infoValue:        { fontFamily: theme.fontBody, fontSize: FontSize.sm, color: theme.textSecondary, flex: 1 },
    infoValueTappable: { color: theme.tint },
    editFields:     {},
    rowFields:      { flexDirection: 'row', gap: 12, marginBottom: 12 },
    rowField:       { flex: 1 },
    rowFieldSmall:  { width: 72 },
    field:          { marginBottom: 12 },
    fieldLabel:     { fontFamily: theme.fontUiMedium, fontSize: FontSize.xs, color: theme.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
    input:          { fontFamily: theme.fontBody, fontSize: FontSize.base, color: theme.textPrimary, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12 },
    addressInputWrap: { position: 'relative' },
    addressInput:   { paddingRight: 36 },
    addressSpinner: { position: 'absolute', right: 10, top: 12 },
    suggestionList: { marginTop: 4, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 8, overflow: 'hidden' },
    suggestionRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, backgroundColor: theme.surface },
    suggestionRowPressed: { backgroundColor: theme.background },
    suggestionRowBorder:  { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
    suggestionIcon: { marginRight: 8 },
    suggestionTexts: { flex: 1 },
    suggestionMain: { fontFamily: theme.fontBody, fontSize: FontSize.sm, color: theme.textPrimary },
    suggestionSub:  { fontFamily: theme.fontBody, fontSize: FontSize.xs, color: theme.textMuted, marginTop: 1 },
    saveBtn:        { backgroundColor: theme.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
    saveBtnPressed: { opacity: 0.8 },
    saveBtnText:    { fontFamily: theme.fontUiMedium, fontSize: FontSize.base, color: '#fff' },
    // Equipment
    lastServiceSection: { paddingHorizontal: 20, paddingBottom: 16 },
    lastServiceHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    lastServiceDate:    { fontFamily: theme.fontBody, fontSize: FontSize.xs, color: theme.textMuted },
    equipSection:       { paddingHorizontal: 20, paddingBottom: 16 },
    equipEditSection:   { paddingHorizontal: 20, paddingBottom: 16 },
    equipTitle:         { fontFamily: theme.fontUiMedium, fontSize: FontSize.xs, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    equipRow:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
    equipLabel:         { fontFamily: theme.fontBody, fontSize: FontSize.sm, color: theme.textMuted },
    equipValue:         { fontFamily: theme.fontBodyMedium, fontSize: FontSize.sm, color: theme.textPrimary, flex: 1, textAlign: 'right' },
    equipPickerRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12 },
    equipPickerValue:   { fontFamily: theme.fontBody, fontSize: FontSize.base, color: theme.textPrimary },
    equipPickerPlaceholder: { fontFamily: theme.fontBody, fontSize: FontSize.base, color: theme.placeholder },
    // Divider + log
    divider:      { height: 1, backgroundColor: theme.border, marginHorizontal: 20, marginVertical: 4 },
    logSection:   { paddingHorizontal: 20, paddingTop: 20 },
    logTitle:     { fontFamily: theme.fontUiMedium, fontSize: FontSize.xs, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
    logCard:      { backgroundColor: theme.surface, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: theme.border },
    emptyLog:     { paddingVertical: 24, alignItems: 'center', gap: 6 },
    emptyLogText: { fontFamily: theme.fontBody, fontSize: FontSize.sm, color: theme.textSecondary },
    emptyLogHint: { fontFamily: theme.fontBody, fontSize: FontSize.xs, color: theme.textMuted, textAlign: 'center', lineHeight: 18 },
    // Scheduled
    schedRow:       { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
    schedRowLast:   { borderBottomWidth: 0 },
    schedIconWrap:  { width: 32, height: 32, borderRadius: 8, backgroundColor: theme.scheduled + '18', alignItems: 'center', justifyContent: 'center', marginRight: 10, marginTop: 1 },
    schedContent:   { flex: 1 },
    schedTopRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
    schedLabel:     { fontFamily: theme.fontBodyMedium, fontSize: FontSize.sm, color: theme.textPrimary },
    schedDate:      { fontFamily: theme.fontBody, fontSize: FontSize.xs, color: theme.textMuted },
    schedTime:      { fontFamily: theme.fontBody, fontSize: FontSize.xs, color: theme.textSecondary, marginTop: 1 },
    schedNotes:     { fontFamily: theme.fontBody, fontSize: FontSize.xs, color: theme.textMuted, lineHeight: 16, marginTop: 4 },
    schedDelete:    { paddingLeft: 8, paddingTop: 4 },
    // Footer
    footer:         { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, backgroundColor: theme.surface },
    footerInner:    { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
    footerBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 13 },
    footerBtnPressed: { opacity: 0.8 },
    footerBtnIcon:  { marginRight: 6 },
    footerBtnText:  { fontFamily: theme.fontUiMedium, fontSize: FontSize.base, color: '#fff' },
    addServiceBtn:  { backgroundColor: theme.primary },
    scheduleBtn:    { backgroundColor: theme.scheduled },
  });
}
