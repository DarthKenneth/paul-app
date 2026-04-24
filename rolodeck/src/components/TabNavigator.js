// =============================================================================
// TabNavigator.js - Root navigation: BottomTabNavigator + Stack navigators
// Version: 1.7
// Last Updated: 2026-04-24
//
// PROJECT:      Rolodeck (project v0.29.0)
// FILES:        TabNavigator.js           (this file — navigation structure)
//               App.js                    (renders TabNavigator inside
//                                          NavigationContainer + ThemeProvider)
//               All screen files          (rendered within stacks)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Three bottom tabs: CustomersTab, ServicesTab, SettingsTab
//   - Each tab has its own Stack.Navigator to support push navigation
//   - Each stack is wrapped in AnimatedTabScreen so tab swaps fade + slide
//     on focus (v6 bottom-tabs has no built-in screen transition)
//   - Customers tab stack:
//       Customers → CustomerDetail → AddCustomer / AddService
//   - Services tab stack: ServicesScreen only (navigates to CustomersTab for
//       customer detail via cross-tab navigation)
//   - Settings tab stack: SettingsScreen → ThemeScreen → ServiceIntervalScreen
//   - alertCount prop drives the Services tab badge (passed from App.js)
//   - onAlertsRefresh prop is passed to AddServiceScreen via navigation params
//     so the badge updates after a new service entry is saved
//   - Header styling: font, color, border, and background all from useTheme()
//   - Customers root screen has headerLeft: () => null so the phantom "Customer"
//     back label from stack state never renders on the list
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial scaffold
// v1.1  2026-04-09  Claude  Added ThemeScreen to Settings stack
// v1.2  2026-04-09  Claude  Added ServiceIntervalScreen to Settings stack
// v1.2.1 2026-04-10  Claude  Added unmountOnBlur: true to all tab screens so
//                            switching tabs always resets that tab's stack to root
// v1.2.2 2026-04-10  Claude  Added tabPress listener on CustomersTab that forces
//                            navigate to Customers root screen, fixing the case
//                            where cross-tab navigate left CustomerDetail active
// v1.3  2026-04-10  Claude  Smooth tab swaps + phantom back button fix
//       - Added AnimatedTabScreen wrapper: fades opacity 0→1 and translateX 12→0
//         over 220ms via useFocusEffect, so tab swaps feel like the stack push
//         animation (v6 bottom-tabs has no native transition)
//       - Wrapped CustomersStack, ServiceStack, SettingsStack in AnimatedTabScreen
//       - Added headerLeft: () => null on the Customers root screen so the
//         phantom "Customer" back label from stack state can never render
//         [updated ARCHITECTURE]
// v1.3.1  2026-04-12  Claude  Added SquareSyncScreen to Settings stack
// v1.4    2026-04-14  Claude  Accessibility: Services badge announces count to
//                             screen readers via tabBarAccessibilityLabel
// v1.7  2026-04-24  Claude  hideTabs prop suppresses bottom bar when sidebar is shown
// v1.6  2026-04-23  Claude  Add profession settings screens to Settings stack
//       - Imported ProfessionSettingsScreen, ServiceTypesScreen, CustomListsScreen,
//         ChecklistScreen
//       - Added ProfessionSettings, ServiceTypes, CustomLists, Checklist screens
//         to SettingsStack.Navigator [updated ARCHITECTURE]
// v1.5.4  2026-04-23  Claude  Add sceneContainerStyle to Tab.Navigator screenOptions so the
//                             scene container uses theme.background — fixes bright white flash
//                             on tab switch in dark mode (midnight/ember themes)
// v1.5.3  2026-04-17  Claude  Fix icon size: tabBarIconSize is not a valid RN v6 bottom-tabs
//                             option (confirmed absent from installed package); replaced with
//                             hardcoded size={30} directly in tabBarIcon render function
// v1.5.2  2026-04-17  Claude  Tab bar: icon size 24→30 (+25%), paddingBottom 9→11 (+20%
//                             rounded up), height 62→70 to match
// v1.5.1  2026-04-17  Claude  Pass onAlertsRefresh as initialParams to Customers root
//                             screen so CustomersScreen can forward it to CustomerDetail
//                             — fixes badge not clearing after adding a service
// v1.5    2026-04-17  Claude  Added SchedulingSettingsScreen to Settings stack
// =============================================================================

import React, { useRef, useCallback } from 'react';
import { Animated } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import CustomersScreen      from '../screens/CustomersScreen';
import CustomerDetailScreen from '../screens/CustomerDetailScreen';
import AddCustomerScreen    from '../screens/AddCustomerScreen';
import AddServiceScreen     from '../screens/AddServiceScreen';
import ServicesScreen       from '../screens/ServicesScreen';
import SettingsScreen          from '../screens/SettingsScreen';
import ThemeScreen             from '../screens/ThemeScreen';
import ServiceIntervalScreen   from '../screens/ServiceIntervalScreen';
import SquareSyncScreen           from '../screens/SquareSyncScreen';
import SchedulingSettingsScreen   from '../screens/SchedulingSettingsScreen';
import ProfessionSettingsScreen   from '../screens/ProfessionSettingsScreen';
import ServiceTypesScreen         from '../screens/ServiceTypesScreen';
import CustomListsScreen          from '../screens/CustomListsScreen';
import ChecklistScreen            from '../screens/ChecklistScreen';

import { useTheme } from '../styles/theme';
import { FontSize } from '../styles/typography';

const Tab   = createBottomTabNavigator();
const CustStack     = createStackNavigator();
const ServiceStack  = createStackNavigator();
const SettingsStack = createStackNavigator();

// ── Animated tab wrapper ──────────────────────────────────────────────────────
// React Navigation v6 bottom-tabs has no built-in screen transition, so each
// tab's stack is wrapped in an Animated.View that fades + slides in on focus.
// This makes tab swaps feel like the stack push animation (short, smooth).
// Works well with unmountOnBlur: true — the wrapper remounts on each tab
// switch, so the animation re-runs every time.

function AnimatedTabScreen({ children }) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(12)).current;

  useFocusEffect(
    useCallback(() => {
      opacity.setValue(0);
      translateX.setValue(12);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }, [opacity, translateX]),
  );

  return (
    <Animated.View style={{ flex: 1, opacity, transform: [{ translateX }] }}>
      {children}
    </Animated.View>
  );
}

// ── Per-stack header options ──────────────────────────────────────────────────

function useHeaderOptions() {
  const { theme } = useTheme();
  return {
    headerStyle: {
      backgroundColor: theme.headerBg,
      shadowColor:     'transparent',
      elevation:        0,
      borderBottomWidth: 1,
      borderBottomColor: theme.headerBorder,
    },
    headerTitleStyle: {
      fontFamily: theme.fontHeading,
      fontSize:   FontSize.lg,
      color:      theme.headerText,
    },
    headerTintColor:  theme.primary,
    cardStyle:        { backgroundColor: theme.background },
  };
}

// ── Customers stack ───────────────────────────────────────────────────────────

function CustomersStackNavigator({ route }) {
  const headerOptions = useHeaderOptions();
  const onAlertsRefresh = route?.params?.onAlertsRefresh;

  return (
    <AnimatedTabScreen>
      <CustStack.Navigator screenOptions={headerOptions}>
        <CustStack.Screen
          name="Customers"
          component={CustomersScreen}
          initialParams={{ onAlertsRefresh }}
          options={{ title: 'Customers', headerLeft: () => null }}
        />
        <CustStack.Screen
          name="CustomerDetail"
          component={CustomerDetailScreen}
          options={{ title: 'Customer' }}
        />
        <CustStack.Screen
          name="AddCustomer"
          component={AddCustomerScreen}
          options={{ title: 'New Customer' }}
        />
        <CustStack.Screen
          name="AddService"
          component={AddServiceScreen}
          initialParams={{ onAlertsRefresh }}
          options={{ title: 'Add Service' }}
        />
      </CustStack.Navigator>
    </AnimatedTabScreen>
  );
}

// ── Services stack ────────────────────────────────────────────────────────────

function ServiceStackNavigator() {
  const headerOptions = useHeaderOptions();
  return (
    <AnimatedTabScreen>
      <ServiceStack.Navigator screenOptions={headerOptions}>
        <ServiceStack.Screen
          name="Services"
          component={ServicesScreen}
          options={{ title: 'Services' }}
        />
      </ServiceStack.Navigator>
    </AnimatedTabScreen>
  );
}

// ── Settings stack ────────────────────────────────────────────────────────────

function SettingsStackNavigator() {
  const headerOptions = useHeaderOptions();
  return (
    <AnimatedTabScreen>
      <SettingsStack.Navigator screenOptions={headerOptions}>
        <SettingsStack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: 'Settings' }}
        />
        <SettingsStack.Screen
          name="Theme"
          component={ThemeScreen}
          options={{ title: 'Theme' }}
        />
        <SettingsStack.Screen
          name="ServiceInterval"
          component={ServiceIntervalScreen}
          options={{ title: 'Service Interval' }}
        />
        <SettingsStack.Screen
          name="SquareSync"
          component={SquareSyncScreen}
          options={{ title: 'Square Sync' }}
        />
        <SettingsStack.Screen
          name="SchedulingSettings"
          component={SchedulingSettingsScreen}
          options={{ title: 'Scheduling' }}
        />
        <SettingsStack.Screen
          name="ProfessionSettings"
          component={ProfessionSettingsScreen}
          options={{ title: 'Profession' }}
        />
        <SettingsStack.Screen
          name="ServiceTypes"
          component={ServiceTypesScreen}
          options={{ title: 'Service Types' }}
        />
        <SettingsStack.Screen
          name="CustomLists"
          component={CustomListsScreen}
          options={{ title: 'Custom Lists' }}
        />
        <SettingsStack.Screen
          name="Checklist"
          component={ChecklistScreen}
          options={{ title: 'Service Checklist' }}
        />
      </SettingsStack.Navigator>
    </AnimatedTabScreen>
  );
}

// ── Tab navigator ─────────────────────────────────────────────────────────────

const TAB_ICONS = {
  CustomersTab: { focused: 'people',     outline: 'people-outline'     },
  ServicesTab:  { focused: 'construct',  outline: 'construct-outline'  },
  SettingsTab:  { focused: 'settings',   outline: 'settings-outline'   },
};

export default function TabNavigator({ alertCount, onAlertsRefresh, hideTabs }) {
  const { theme } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneContainerStyle: { backgroundColor: theme.background },
        tabBarStyle: hideTabs ? { display: 'none' } : {
          backgroundColor: theme.tabBar,
          borderTopColor:  theme.tabBarBorder,
          borderTopWidth:   1,
          height:           70,
          paddingBottom:    11,
          paddingTop:        7,
        },
        tabBarActiveTintColor:   theme.tabIconActive,
        tabBarInactiveTintColor: theme.tabIconInactive,
        tabBarLabelStyle: {
          fontFamily: theme.fontUiMedium,
          fontSize:   FontSize.xxs,
        },
        tabBarIcon: ({ focused, color }) => {
          const icons = TAB_ICONS[route.name];
          const iconName = focused ? icons.focused : icons.outline;
          return <Ionicons name={iconName} size={30} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="CustomersTab"
        component={CustomersStackNavigator}
        options={{ title: 'Customers', unmountOnBlur: true }}
        initialParams={{ onAlertsRefresh }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('CustomersTab', { screen: 'Customers' });
          },
        })}
      />
      <Tab.Screen
        name="ServicesTab"
        component={ServiceStackNavigator}
        options={{
          title:         'Services',
          unmountOnBlur: true,
          tabBarAccessibilityLabel: alertCount > 0
            ? `Services, ${alertCount} customer${alertCount === 1 ? '' : 's'} due`
            : 'Services',
          tabBarBadge:      alertCount > 0 ? alertCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: theme.badge,
            color:           theme.badgeText,
            fontSize:         10,
            minWidth:         18,
            height:           18,
            lineHeight:       18,
            borderRadius:      9,
          },
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsStackNavigator}
        options={{ title: 'Settings', unmountOnBlur: true }}
      />
    </Tab.Navigator>
  );
}
