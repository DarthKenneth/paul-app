// =============================================================================
// InvoiceButton.js - Square invoice trigger button
// Version: 1.1
// Last Updated: 2026-04-04
//
// PROJECT:      Rolodeck (project v1.4)
// FILES:        InvoiceButton.js          (this file — UI + modal)
//               squarePlaceholder.js      (sendSquareInvoice logic)
//               CustomerDetailScreen.js   (renders this button)
//               theme.js                  (useTheme)
//               typography.js             (FontFamily, FontSize)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Tap "Send Invoice" → modal sheet slides up with dollar amount input
//   - Amount entered as dollars (string) → converted to cents for API call
//   - sendSquareInvoice() handles the full Square order → invoice → publish flow
//   - Alert.alert surfaces both success and error states
//   - No inline styles — all via makeStyles(theme)
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial scaffold — placeholder modal with amount
//                           entry; Square integration not yet wired
// v1.1  2026-04-04  Claude  Removed placeholder comment; wired to live
//                           sendSquareInvoice() (locationId now in config)
// =============================================================================

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  TextInput,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/theme';
import { FontSize } from '../styles/typography';
import { sendSquareInvoice } from '../utils/squarePlaceholder';

export default function InvoiceButton({ customer }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const [modalVisible, setModalVisible] = useState(false);
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);

  const closeModal = () => {
    setModalVisible(false);
    setAmount('');
  };

  const handleSend = async () => {
    const dollars = parseFloat(amount);
    if (isNaN(dollars) || dollars <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid dollar amount greater than $0.');
      return;
    }
    setSending(true);
    try {
      await sendSquareInvoice(customer, Math.round(dollars * 100));
      closeModal();
      Alert.alert(
        'Invoice Sent',
        `Invoice for $${dollars.toFixed(2)} sent to ${customer.email}.`,
      );
    } catch (err) {
      Alert.alert('Not Available', err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={() => setModalVisible(true)}
        accessibilityRole="button"
        accessibilityLabel="Send Square invoice"
      >
        <Ionicons name="receipt-outline" size={18} color={theme.surface} style={styles.buttonIcon} />
        <Text style={styles.buttonLabel}>Send Invoice</Text>
      </Pressable>

      {/* ── Amount entry modal ── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.backdrop} onPress={closeModal} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Send Invoice</Text>
            <Text style={styles.sheetSub}>
              {customer.email
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
                value={amount}
                onChangeText={setAmount}
                autoFocus
                selectTextOnFocus
              />
            </View>

            <View style={styles.actions}>
              <Pressable
                style={[styles.actionBtn, styles.cancelBtn]}
                onPress={closeModal}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, styles.sendBtn]}
                onPress={handleSend}
                disabled={sending}
              >
                <Text style={styles.sendText}>
                  {sending ? 'Sending…' : 'Send'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    button: {
      flexDirection:     'row',
      alignItems:        'center',
      justifyContent:    'center',
      backgroundColor:   theme.accent,
      borderRadius:      12,
      paddingVertical:   12,
      paddingHorizontal: 20,
    },
    buttonPressed: {
      opacity: 0.8,
    },
    buttonIcon: {
      marginRight: 7,
    },
    buttonLabel: {
      fontFamily: theme.fontBodyBold,
      fontSize:   FontSize.base,
      color:      theme.surface,
    },
    overlay: {
      flex:            1,
      justifyContent:  'center',
      alignItems:      'center',
      paddingHorizontal: 24,
    },
    backdrop: {
      position:        'absolute',
      top:              0,
      left:             0,
      right:            0,
      bottom:           0,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
      backgroundColor: theme.surface,
      borderRadius:    20,
      padding:          28,
      width:           '100%',
      maxWidth:         400,
      zIndex:            1,
    },
    sheetTitle: {
      fontFamily:   theme.fontHeading,
      fontSize:     FontSize.xl,
      color:        theme.text,
      marginBottom:  6,
    },
    sheetSub: {
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
    actions: {
      flexDirection: 'row',
      gap:            12,
    },
    actionBtn: {
      flex:            1,
      borderRadius:    12,
      paddingVertical: 13,
      alignItems:      'center',
    },
    cancelBtn: {
      backgroundColor: theme.border,
    },
    sendBtn: {
      backgroundColor: theme.accent,
    },
    cancelText: {
      fontFamily: theme.fontBodyBold,
      fontSize:   FontSize.base,
      color:      theme.textSecondary,
    },
    sendText: {
      fontFamily: theme.fontBodyBold,
      fontSize:   FontSize.base,
      color:      theme.surface,
    },
  });
}
