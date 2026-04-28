// =============================================================================
// OnboardingModal.js - First-launch walkthrough shown once per install
// Version: 1.1
// Last Updated: 2026-04-14
//
// PROJECT:      Rolodeck (project v0.22)
// FILES:        OnboardingModal.js  (this file — first-launch overlay)
//               App.js              (mounts this modal, owns visible state)
//               storage.js          (getOnboardingComplete, setOnboardingComplete)
//               theme.js            (useTheme)
//               typography.js       (FontSize)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Full-screen Modal (animationType="slide") rendered above NavigationContainer
//   - 5 slides managed via currentStep state + Animated crossfade transitions
//   - Active pagination dot expands to a pill to show progress at a glance
//   - onComplete callback fires on "Get Started" or "Skip"; parent writes the
//     AsyncStorage flag and hides the modal
//   - Android back button is ignored (onRequestClose no-op) so users can't
//     accidentally dismiss mid-walkthrough
//   - Styles rebuilt per render via makeStyles(theme) to react to theme changes
//
// CHANGE LOG:
// v1.0  2026-04-09  Claude  Initial 5-slide onboarding walkthrough
// v1.1  2026-04-14  Claude  Android back button now prompts to skip rather
//                           than silently doing nothing (was onRequestClose no-op)
// =============================================================================

import React, { useRef, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/theme';
import { FontSize } from '../styles/typography';

const SLIDES = [
  {
    icon:  'albums-outline',
    title: 'Welcome to Callcard',
    body:  'Your customer rolodex for service professionals — built for the field, not the office.',
  },
  {
    icon:  'people-outline',
    title: 'Build Your Client List',
    body:  'Add customers with their contact info, address, and service history — all in one place.',
  },
  {
    icon:  'construct-outline',
    title: 'Track Every Service',
    body:  'After each visit, log what you did and set a follow-up date so nothing slips through the cracks.',
  },
  {
    icon:  'calendar-outline',
    title: 'Never Miss a Follow-Up',
    body:  'The Services tab shows every customer due for a visit, sorted by urgency.',
  },
  {
    icon:  'checkmark-circle-outline',
    title: "You're All Set",
    body:  "Start building your client list — your first customer is just a tap away.",
  },
];

export default function OnboardingModal({ visible, onComplete }) {
  const { theme } = useTheme();
  const [step, setStep]   = useState(0);
  const fadeAnim          = useRef(new Animated.Value(1)).current;
  const styles            = makeStyles(theme);

  const isLast = step === SLIDES.length - 1;
  const slide  = SLIDES[step];

  const goTo = useCallback((next) => {
    Animated.timing(fadeAnim, {
      toValue:        0,
      duration:       120,
      useNativeDriver: true,
    }).start(() => {
      setStep(next);
      Animated.timing(fadeAnim, {
        toValue:        1,
        duration:       200,
        useNativeDriver: true,
      }).start();
    });
  }, [fadeAnim]);

  const handleNext = useCallback(() => {
    if (isLast) {
      onComplete();
    } else {
      goTo(step + 1);
    }
  }, [isLast, step, goTo, onComplete]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => {
        // Android back button — prompt to skip rather than silently no-op
        Alert.alert(
          'Skip walkthrough?',
          'You can always refer to the app itself to get started.',
          [
            { text: 'Continue setup', style: 'cancel' },
            { text: 'Skip',          style: 'destructive', onPress: onComplete },
          ],
        );
      }}
    >
      <View style={styles.container}>

        {/* ── Skip ── */}
        <View style={styles.header}>
          {!isLast ? (
            <Pressable onPress={onComplete} hitSlop={14} style={styles.skipHit}>
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
          ) : (
            <View style={styles.skipHit} />
          )}
        </View>

        {/* ── Slide content ── */}
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          <View style={styles.iconCircle}>
            <Ionicons name={slide.icon} size={44} color={theme.primary} />
          </View>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.body}>{slide.body}</Text>
        </Animated.View>

        {/* ── Footer: dots + button ── */}
        <View style={styles.footer}>
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
            onPress={handleNext}
          >
            <Text style={styles.btnText}>
              {isLast ? 'Get Started' : 'Next'}
            </Text>
          </Pressable>
        </View>

      </View>
    </Modal>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: {
      flex:              1,
      backgroundColor:   theme.background,
      paddingTop:        Platform.OS === 'ios' ? 64 : 44,
      paddingBottom:     Platform.OS === 'ios' ? 52 : 32,
      paddingHorizontal: 32,
    },
    header: {
      alignItems:   'flex-end',
      marginBottom: 8,
    },
    skipHit: {
      paddingVertical:   10,
      paddingHorizontal: 4,
    },
    skipText: {
      fontFamily: theme.fontUi,
      fontSize:   theme.fontSize.sm,
      color:      theme.textMuted,
    },
    content: {
      flex:              1,
      alignItems:        'center',
      justifyContent:    'center',
      paddingHorizontal: 8,
    },
    iconCircle: {
      width:           96,
      height:          96,
      borderRadius:    48,
      backgroundColor: theme.primaryPale,
      alignItems:      'center',
      justifyContent:  'center',
      marginBottom:    40,
    },
    title: {
      fontFamily:   theme.fontHeading,
      fontSize:     theme.fontSize.xxl,
      color:        theme.text,
      textAlign:    'center',
      marginBottom: 16,
    },
    body: {
      fontFamily: theme.fontBody,
      fontSize:   theme.fontSize.base,
      color:      theme.textSecondary,
      textAlign:  'center',
      lineHeight: 24,
    },
    footer: {
      alignItems: 'center',
      gap:        28,
    },
    dots: {
      flexDirection: 'row',
      gap:           8,
      alignItems:    'center',
    },
    dot: {
      width:           8,
      height:          8,
      borderRadius:    4,
      backgroundColor: theme.border,
    },
    dotActive: {
      width:           22,
      backgroundColor: theme.primary,
    },
    btn: {
      backgroundColor:   theme.primary,
      paddingVertical:   16,
      paddingHorizontal: 48,
      borderRadius:      12,
      width:             '100%',
      alignItems:        'center',
    },
    btnPressed: {
      opacity: 0.82,
    },
    btnText: {
      fontFamily: theme.fontUiBold,
      fontSize:   theme.fontSize.base,
      color:      '#FFFFFF',
    },
  });
}
