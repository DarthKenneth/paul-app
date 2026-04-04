// =============================================================================
// AddCustomerScreen.js - Form to add a new customer
// Version: 1.2
// Last Updated: 2026-04-03
//
// PROJECT:      Rolodeck (project v1.3)
// FILES:        AddCustomerScreen.js  (this file)
//               storage.js            (addCustomer)
//               zipLookup.js          (lookupZip — city/state from zip code)
//               theme.js              (useTheme)
//               typography.js         (FontFamily, FontSize)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Controlled form with 7 fields; only name is required
//   - Zip code auto-fill: when the user enters a 5-digit zip code, lookupZip()
//     fetches city and state from the Zippopotam.us API and fills them in
//     (only if city/state are currently empty, so user edits aren't overwritten)
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
// =============================================================================

import React, { useState, useRef } from 'react';
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
} from 'react-native';
import { addCustomer } from '../data/storage';
import { lookupZip } from '../utils/zipLookup';
import { useTheme } from '../styles/theme';
import { FontSize } from '../styles/typography';

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
  {
    key:           'address',
    label:         'Address',
    placeholder:   'Street address',
    autoCapitalize: 'words',
  },
];

const EMPTY_FORM = {
  name: '', email: '', phone: '', address: '',
  zipCode: '', city: '', state: '',
};

export default function AddCustomerScreen({ navigation }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const lookupDone = useRef(new Set());

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleZipChange = async (zip) => {
    setField('zipCode', zip);
    const clean = zip.replace(/\D/g, '');
    if (clean.length === 5 && !lookupDone.current.has(clean)) {
      lookupDone.current.add(clean);
      const result = await lookupZip(clean);
      if (result) {
        setForm((f) => ({
          ...f,
          city:  f.city  || result.city,
          state: f.state || result.stateAbbr,
        }));
      }
    }
  };

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
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'Failed to save customer.');
    } finally {
      setSaving(false);
    }
  };

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

          {/* ── City / State / Zip ── */}
          <View style={styles.rowFields}>
            <View style={styles.rowField}>
              <Text style={styles.label}>City</Text>
              <TextInput
                style={styles.input}
                value={form.city}
                onChangeText={(v) => setField('city', v)}
                placeholder="Auto-filled from zip"
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

          <View key="zipCode" style={styles.field}>
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
