// =============================================================================
// TabNavigator.js - Root navigation: BottomTabNavigator + Stack navigators
// Version: 1.1
// Last Updated: 2026-04-09
//
// PROJECT:      Rolodeck (project v1.13)
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
//   - Customers tab stack:
//       Customers → CustomerDetail → AddCustomer / AddService
//   - Services tab stack: ServicesScreen only (navigates to CustomersTab for
//       customer detail via cross-tab navigation)
//   - Settings tab stack: SettingsScreen → ThemeScreen
//   - alertCount prop drives the Services tab badge (passed from App.js)
//   - onAlertsRefresh prop is passed to AddServiceScreen via navigation params
//     so the badge updates after a new service entry is saved
//   - Header styling: font, color, border, and background all from useTheme()
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial scaffold
// v1.1  2026-04-09  Claude  Added ThemeScreen to Settings stack
// =============================================================================

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';

import CustomersScreen      from '../screens/CustomersScreen';
import CustomerDetailScreen from '../screens/CustomerDetailScreen';
import AddCustomerScreen    from '../screens/AddCustomerScreen';
import AddServiceScreen     from '../screens/AddServiceScreen';
import ServicesScreen       from '../screens/ServicesScreen';
import SettingsScreen       from '../screens/SettingsScreen';
import ThemeScreen          from '../screens/ThemeScreen';

import { useTheme } from '../styles/theme';
import { FontSize } from '../styles/typography';

const Tab   = createBottomTabNavigator();
const CustStack     = createStackNavigator();
const ServiceStack  = createStackNavigator();
const SettingsStack = createStackNavigator();

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
    <CustStack.Navigator screenOptions={headerOptions}>
      <CustStack.Screen
        name="Customers"
        component={CustomersScreen}
        options={{ title: 'Customers' }}
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
  );
}

// ── Services stack ────────────────────────────────────────────────────────────

function ServiceStackNavigator() {
  const headerOptions = useHeaderOptions();
  return (
    <ServiceStack.Navigator screenOptions={headerOptions}>
      <ServiceStack.Screen
        name="Services"
        component={ServicesScreen}
        options={{ title: 'Services' }}
      />
    </ServiceStack.Navigator>
  );
}

// ── Settings stack ────────────────────────────────────────────────────────────

function SettingsStackNavigator() {
  const headerOptions = useHeaderOptions();
  return (
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
    </SettingsStack.Navigator>
  );
}

// ── Tab navigator ─────────────────────────────────────────────────────────────

const TAB_ICONS = {
  CustomersTab: { focused: 'people',     outline: 'people-outline'     },
  ServicesTab:  { focused: 'construct',  outline: 'construct-outline'  },
  SettingsTab:  { focused: 'settings',   outline: 'settings-outline'   },
};

export default function TabNavigator({ alertCount, onAlertsRefresh }) {
  const { theme } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.tabBar,
          borderTopColor:  theme.tabBarBorder,
          borderTopWidth:   1,
          height:           62,
          paddingBottom:     9,
          paddingTop:        7,
        },
        tabBarActiveTintColor:   theme.tabIconActive,
        tabBarInactiveTintColor: theme.tabIconInactive,
        tabBarLabelStyle: {
          fontFamily: theme.fontUiMedium,
          fontSize:   FontSize.xxs,
        },
        tabBarIcon: ({ focused, color, size }) => {
          const icons = TAB_ICONS[route.name];
          const iconName = focused ? icons.focused : icons.outline;
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="CustomersTab"
        component={CustomersStackNavigator}
        options={{ title: 'Customers' }}
        initialParams={{ onAlertsRefresh }}
      />
      <Tab.Screen
        name="ServicesTab"
        component={ServiceStackNavigator}
        options={{
          title: 'Services',
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
        options={{ title: 'Settings' }}
      />
    </Tab.Navigator>
  );
}
