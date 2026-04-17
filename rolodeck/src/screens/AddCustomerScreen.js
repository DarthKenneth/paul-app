// =============================================================================
// AddCustomerScreen.js - Form to add a new customer
// Version: 1.7.1
// Last Updated: 2026-04-17
//
// PROJECT:      Rolodeck (project v0.22.8)
// FILES:        AddCustomerScreen.js  (this file)
//               storage.js            (addCustomer)
//               placesConfig.js       (GEOAPIFY_API_KEY)
//               theme.js              (useTheme)
//               typography.js         (FontFamily, FontSize)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Controlled form with 7 fields; only name is required
//   - Address autocomplete: as the user types the address field, a debounced
//     call to the Radar.io Autocomplete API fetches suggestions; selecting one
//     fills address, city, state, and zip directly from the response (single
//     call — no separate details fetch needed)
//   - Autocomplete requires GEOAPIFY_API_KEY in src/config/placesConfig.js;
//     if the key is empty the address field works as plain text (no suggestions)
//   - Suggestions render inline (not absolutely positioned) to avoid z-index
//     issues inside ScrollView — they push city/state/zip down while visible
//   - Suggestions are debounced 350ms; cleared on blur or selection
//   - City and State rendered side-by-side in a row
//   - On save: calls addCustomer(), navigates back (list refreshes via
//     useFocusEffect in CustomersScreen)
//   - KeyboardAvoidingView + ScrollView so fields aren't hidden by keyboard
//   - Double-tap protection via saving state; all fields trimmed on save
//   - Storage errors caught and surfaced via Alert
//
// CHANGE LOG:
// v1.0    2026-04-03  Claude  Initial scaffold
// v1.0.1  2026-04-03  Claude  Added double-tap protection (saving state),
//                              input trimming on save, and try/catch around
//                              addCustomer storage call
// v1.2    2026-04-03  Claude  Added city/state fields with zip auto-fill
//                             - Zip code triggers lookupZip() at 5 digits
//                             - City/State render side-by-side
//                             - Updated EMPTY_FORM and FIELDS for new schema
// v1.3  2026-04-09  Claude  Address autocomplete via Google Places API
//       - Typing in address field calls Places Autocomplete API (debounced 350ms)
//       - Selecting a suggestion calls Places Details API to fill address,
//         city, state, zip all at once
//       - Suggestions rendered inline below the address input
//       - Requires GOOGLE_PLACES_API_KEY in placesConfig.js; falls back to
//         plain text if key is empty [updated ARCHITECTURE]
// v1.4  2026-04-09  Claude  Swap Google Places for Radar.io autocomplete
//       - fetchSuggestions now calls Radar /v1/search/autocomplete (free tier)
//       - Removed fetchPlaceDetails — Radar returns full address in one call
//       - handleSuggestionSelect simplified to sync (no second fetch needed)
//       - Config import updated to RADAR_PUBLISHABLE_KEY [updated ARCHITECTURE]
// v1.5  2026-04-09  Claude  Swap Radar for Geoapify (Radar requires sales demo)
//       - fetchSuggestions now calls Geoapify /v1/geocode/autocomplete
//       - Response is GeoJSON; address parsed from feature.properties
//       - Config import updated to GEOAPIFY_API_KEY [updated ARCHITECTURE]
// v1.5.1 2026-04-10  Claude  Guard goBack with canGoBack check; reset to Customers
//                             root when the stack is orphaned — avoids GO_BACK
//                             errors after save from an empty back stack
// v1.6  2026-04-14  Claude  AbortController on autocomplete fetch
//       - abortRef cancels the in-flight Geoapify request when a new keystroke
//         fires; prevents stale responses from overwriting fresh suggestions
//       - fetchSuggestions() now accepts a signal and passes it to fetch()
// v1.6.1 2026-04-16  Claude  Skip zip lookup when Geoapify key is present —
//                             autocomplete already fills city/state/zip
// v1.7   2026-04-17  Claude  Nuke zip autofill entirely
// v1.7.1 2026-04-17  Claude  Surface Geoapify errors in console — check res.ok,
//                             log HTTP status + body on failure, log features
//                             count on success, warn when key is empty
//        - Removed lookupZip import and all Zippopotam.us logic
//        - handleZipChange is now a plain setField call
//        - Removed lookupDone ref [updated ARCHITECTURE]
// =============================================================================

import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { addCustomer } from '../data/storage';
import { GEOAPIFY_API_KEY } from '../config/placesConfig';
import { useTheme } from '../styles/theme';
import { FontSize } from '../styles/typography';

// ── Geoapify autocomplete helper ──────────────────────────────────────────────

const GEOAPIFY_AUTOCOMPLETE_URL = 'https://api.geoapify.com/v1/geocode/autocomplete';

async function fetchSuggestions(input, signal) {
  if (!GEOAPIFY_API_KEY) {
    console.warn('[Geoapify] GEOAPIFY_API_KEY is empty — autocomplete disabled');
    return [];
  }
  const params = new URLSearchParams({
    text:   input,
    filter: 'countrycode:us',
    limit:  '5',
    apiKey: GEOAPIFY_API_KEY,
  });
  const res = await fetch(`${GEOAPIFY_AUTOCOMPLETE_URL}?${params}`, { signal });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[Geoapify] HTTP ${res.status}:`, body);
    return [];
  }
  const data = await res.json();
  console.log('[Geoapify] features count:', data.features?.length ?? 'no features key', 'for input:', input);
  return Array.isArray(data.features) ? data.features : [];
}

// ── Form fields (everything except address, which is handled separately) ──────

const FIELDS = [
  {
    key:           'name',
    label:         'Name *',
    placeholder:   'Full name',
    autoCapitalize: 'words',
  },
  {
    key:           'email',
    label:         'Email',
    placeholder:   'email@example.com',
    keyboardType:  'email-address',
    autoCapitalize: 'none',
  },
  {
    key:          'phone',
    label:        'Phone',
    placeholder:  '(555) 555-5555',
    keyboardType: 'phone-pad',
  },
];

const EMPTY_FORM = {
  name: '', email: '', phone: '', address: '',
  zipCode: '', city: '', state: '',
};

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AddCustomerScreen({ navigation }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [form, setForm]                   = useState(EMPTY_FORM);
  const [saving, setSaving]               = useState(false);
  const [suggestions, setSuggestions]     = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const debounceRef     = useRef(null);
  const abortRef        = useRef(null); // AbortController for in-flight autocomplete
  const addressInputRef = useRef(null);

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  // ── Address autocomplete ─────────────────────────────────────────────────────

  const handleAddressChange = (text) => {
    setField('address', text);
    setSuggestions([]);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!GEOAPIFY_API_KEY || text.trim().length < 3) return;

    debounceRef.current = setTimeout(async () => {
      // Cancel any previous in-flight request before starting a new one
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      setSuggestLoading(true);
      try {
        const preds = await fetchSuggestions(text, abortRef.current.signal);
        setSuggestions(preds);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('[Geoapify] fetch error:', err);
        }
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
      address: streetAddr    || f.address,
      city:    p.city        || f.city,
      state:   p.state_code  || f.state,
      zipCode: p.postcode    || f.zipCode,
    }));
  };

  const handleAddressBlur = () => {
    // Small delay so a tap on a suggestion registers before clearing the list
    setTimeout(() => setSuggestions([]), 150);
  };

  const handleZipChange = (zip) => setField('zipCode', zip);

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (saving) return;
    if (!form.name.trim()) {
      Alert.alert('Name Required', 'Please enter a name for this customer.');
      return;
    }
    setSaving(true);
    try {
      const trimmed = {};
      for (const key of Object.keys(form)) {
        trimmed[key] = (form[key] || '').trim();
      }
      await addCustomer(trimmed);
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.reset({ index: 0, routes: [{ name: 'Customers' }] });
      }
    } catch {
      Alert.alert('Error', 'Failed to save customer.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Name / Email / Phone ── */}
          {FIELDS.map(({ key, label, placeholder, keyboardType, autoCapitalize }) => (
            <View key={key} style={styles.field}>
              <Text style={styles.label}>{label}</Text>
              <TextInput
                style={styles.input}
                value={form[key]}
                onChangeText={(v) => setField(key, v)}
                placeholder={placeholder}
                placeholderTextColor={theme.placeholder}
                keyboardType={keyboardType || 'default'}
                autoCapitalize={autoCapitalize || 'sentences'}
                returnKeyType="next"
              />
            </View>
          ))}

          {/* ── Address (with autocomplete) ── */}
          <View style={styles.field}>
            <Text style={styles.label}>Address</Text>
            <View style={styles.addressInputWrap}>
              <TextInput
                ref={addressInputRef}
                style={[styles.input, styles.addressInput]}
                value={form.address}
                onChangeText={handleAddressChange}
                onBlur={handleAddressBlur}
                placeholder="Start typing a street address…"
                placeholderTextColor={theme.placeholder}
                autoCapitalize="words"
                returnKeyType="next"
              />
              {suggestLoading && (
                <ActivityIndicator
                  size="small"
                  color={theme.primary}
                  style={styles.addressSpinner}
                />
              )}
            </View>

            {/* Inline suggestion list */}
            {suggestions.length > 0 && (
              <View style={styles.suggestionList}>
                {suggestions.map((feature, idx) => {
                  const p        = feature.properties;
                  const mainText = [p.housenumber, p.street].filter(Boolean).join(' ') || p.address_line1;
                  const subParts = [p.city, [p.state_code, p.postcode].filter(Boolean).join(' ')].filter(Boolean);
                  const subText  = subParts.join(', ');
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
                      <Ionicons
                        name="location-outline"
                        size={16}
                        color={theme.primary}
                        style={styles.suggestionIcon}
                      />
                      <View style={styles.suggestionTexts}>
                        <Text style={styles.suggestionMain} numberOfLines={1}>
                          {mainText}
                        </Text>
                        {!!subText && (
                          <Text style={styles.suggestionSub} numberOfLines={1}>
                            {subText}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* ── City / State ── */}
          <View style={styles.rowFields}>
            <View style={styles.rowField}>
              <Text style={styles.label}>City</Text>
              <TextInput
                style={styles.input}
                value={form.city}
                onChangeText={(v) => setField('city', v)}
                placeholder="Auto-filled"
                placeholderTextColor={theme.placeholder}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>
            <View style={styles.rowFieldSmall}>
              <Text style={styles.label}>State</Text>
              <TextInput
                style={styles.input}
                value={form.state}
                onChangeText={(v) => setField('state', v)}
                placeholder="ST"
                placeholderTextColor={theme.placeholder}
                autoCapitalize="characters"
                maxLength={2}
                returnKeyType="next"
              />
            </View>
          </View>

          {/* ── Zip Code ── */}
          <View style={styles.field}>
            <Text style={styles.label}>Zip Code</Text>
            <TextInput
              style={styles.input}
              value={form.zipCode}
              onChangeText={handleZipChange}
              placeholder="00000"
              placeholderTextColor={theme.placeholder}
              keyboardType="number-pad"
              maxLength={5}
              returnKeyType="done"
            />
          </View>

          <Pressable
            style={({ pressed }) => [styles.saveBtn, (pressed || saving) && styles.saveBtnPressed]}
            onPress={handleSave}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Add customer"
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Add Customer'}</Text>
          </Pressable>
        </ScrollView>
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
    content: {
      padding:       20,
      paddingBottom: 48,
    },
    field: {
      marginBottom: 18,
    },
    rowFields: {
      flexDirection: 'row',
      gap:           12,
      marginBottom:  18,
    },
    rowField: {
      flex: 1,
    },
    rowFieldSmall: {
      width: 80,
    },
    label: {
      fontFamily:    theme.fontBodyMedium,
      fontSize:      FontSize.xs,
      color:         theme.textMuted,
      marginBottom:   6,
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
      borderRadius:      12,
      paddingVertical:   12,
      paddingHorizontal: 14,
    },
    // ── Address autocomplete ──
    addressInputWrap: {
      position:       'relative',
      justifyContent: 'center',
    },
    addressInput: {
      paddingRight: 40, // room for spinner
    },
    addressSpinner: {
      position: 'absolute',
      right:     14,
    },
    suggestionList: {
      marginTop:       4,
      backgroundColor: theme.surface,
      borderRadius:    12,
      borderWidth:     1,
      borderColor:     theme.border,
      overflow:        'hidden',
      shadowColor:     '#000',
      shadowOffset:    { width: 0, height: 2 },
      shadowOpacity:   0.08,
      shadowRadius:    8,
      elevation:       4,
    },
    suggestionRow: {
      flexDirection:     'row',
      alignItems:        'center',
      paddingVertical:    11,
      paddingHorizontal: 14,
      gap:               10,
    },
    suggestionRowPressed: {
      backgroundColor: theme.inputBg,
    },
    suggestionRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    suggestionIcon: {
      flexShrink: 0,
    },
    suggestionTexts: {
      flex: 1,
    },
    suggestionMain: {
      fontFamily: theme.fontBodyMedium,
      fontSize:   FontSize.sm,
      color:      theme.text,
    },
    suggestionSub: {
      fontFamily: theme.fontBody,
      fontSize:   FontSize.xs,
      color:      theme.textMuted,
      marginTop:   1,
    },
    // ── Save button ──
    saveBtn: {
      backgroundColor: theme.primary,
      borderRadius:    14,
      paddingVertical:  15,
      alignItems:      'center',
      marginTop:        6,
    },
    saveBtnPressed: {
      opacity: 0.85,
    },
    saveBtnText: {
      fontFamily: theme.fontBodyBold,
      fontSize:   FontSize.md,
      color:      theme.surface,
    },
  });
}
