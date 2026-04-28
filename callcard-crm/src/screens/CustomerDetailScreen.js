// =============================================================================
// CustomerDetailScreen.js - Thin navigation wrapper for CustomerDetailPane
// Version: 3.0
// Last Updated: 2026-04-24
//
// PROJECT:      Rolodeck (project v0.29.0)
// FILES:        CustomerDetailScreen.js  (this file — nav wrapper)
//               CustomerDetailPane.js    (all data logic + UI)
//               CustomersScreen.js       (mounts pane directly in split view)
//               TabNavigator.js          (registers this screen)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - All customer detail data logic, editing, modals, and service log now live
//     in CustomerDetailPane. This screen is a thin shell that:
//       1. Sets up the navigation header (dynamic back button via useLayoutEffect)
//       2. Implements safeGoBack (handles backTab, canGoBack, reset edge cases)
//       3. Passes customerId, onBack, onAlertsRefresh to CustomerDetailPane
//   - CustomerDetailPane renders its own SafeAreaView (isPaneMode=false default),
//     so this screen does not add another SafeAreaView wrapper
//   - On tablet landscape, CustomersScreen mounts CustomerDetailPane directly in
//     the right split panel and never navigates to this screen
//
// CHANGE LOG:
// v3.0  2026-04-24  Claude  Full rewrite as thin nav wrapper — all data logic
//                           moved to CustomerDetailPane for tablet split view
// v2.3.1  2026-04-24  Claude  Customer delete now cleans up orphaned calendar events and
//                             service-photo files on disk (due-date event, every scheduled-
//                             service event, and every photo across all service-log entries)
// v2.3  2026-04-24  Claude  Last service summary on card + subtle edit pencil + view default
// v2.2  2026-04-24  Claude  Geoapify address autocomplete on edit form + zip cleanup
// v2.1  2026-04-24  Claude  Use allServiceTypes for scheduled entry lookups so custom
//                           types resolve correctly
// v2.0  2026-04-23  Claude  Equipment section on customer profile
// v1.9  2026-04-23  Claude  Use profession config for scheduled entry type label/icon
// v1.8.1 2026-04-19  Claude  Tap opens view mode on older entries; same-day entries
//                            still open directly in edit
// v1.8   2026-04-19  Claude  Tap-to-edit service log entries + tablet width cap
// v1.7   2026-04-17  Claude  Wire scheduled services to Apple Calendar
// v1.6.3 2026-04-14  Claude  Clear zipLookedUp Set on each focus
// v1.6.2 2026-04-12  Claude  Schedule refresh + badge propagation
// v1.6.1 2026-04-12  Claude  Sort service log by date descending at render time
// v1.6  2026-04-10  Claude  Safe back navigation
// v1.5.1 2026-04-10  Claude  Fix back navigation when coming from ServicesTab
// v1.5  2026-04-10  Claude  Dynamic back button label
// v1.4  2026-04-10  Claude  Scheduled services section on customer detail
// v1.3  2026-04-10  Claude  Both footer buttons now open centered modals
// v1.2  2026-04-03  Claude  Debug + harden
// v1.1  2026-04-03  Claude  Redesigned layout per spec
// v1.0  2026-04-03  Claude  Initial scaffold
// =============================================================================

import React, { useCallback, useLayoutEffect } from 'react';
import { Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CustomerDetailPane from '../components/CustomerDetailPane';
import { useTheme } from '../styles/theme';

export default function CustomerDetailScreen({ route, navigation }) {
  const { customerId } = route.params;
  const { theme } = useTheme();

  // Safe back navigation — handles cross-tab origin, normal stack pop, and
  // orphaned stacks (only screen remaining after a tab reset).
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

  return (
    <CustomerDetailPane
      customerId={customerId}
      onBack={safeGoBack}
      onAlertsRefresh={route.params?.onAlertsRefresh}
    />
  );
}
