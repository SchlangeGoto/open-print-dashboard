import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TAB_BAR_HEIGHT } from "@/lib/layout";
import { typography, useTheme } from "@/lib/theme";

export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accentText,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          height: TAB_BAR_HEIGHT + insets.bottom,
        },
        tabBarLabelStyle: {
          ...typography.micro,
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Spools",
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons
              name={focused ? "cube" : "cube-outline"}
              size={size}
              color={color as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: "Scan",
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons
              name={focused ? "scan" : "scan-outline"}
              size={size}
              color={color as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="printers"
        options={{
          title: "Printers",
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons
              name={focused ? "print" : "print-outline"}
              size={size}
              color={color as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons
              name={focused ? "settings" : "settings-outline"}
              size={size}
              color={color as string}
            />
          ),
        }}
      />
    </Tabs>
  );
}
