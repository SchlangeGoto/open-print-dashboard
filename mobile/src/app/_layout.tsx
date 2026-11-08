import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";

import { AuthProvider } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

export default function RootLayout() {
  const theme = useTheme();
  const scheme = useColorScheme();

  return (
    <AuthProvider>
      <StatusBar style={scheme === "light" ? "dark" : "light"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.bg },
        }}
      >
        <Stack.Screen name="(app)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="server-setup" />
        <Stack.Screen name="connection-error" />
      </Stack>
    </AuthProvider>
  );
}
