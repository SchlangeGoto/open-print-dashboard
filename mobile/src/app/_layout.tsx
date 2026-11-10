import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
} from "@expo-google-fonts/geist";
import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Pressable, Text, useColorScheme, View } from "react-native";

import { AuthProvider } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    GeistMono_400Regular,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

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


export function ErrorBoundary({
  error,
  retry,
}: {
  error: Error;
  retry: () => Promise<void>;
}) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        backgroundColor: "#0a0a0a",
      }}
    >
      <Text style={{ color: "#f5f5f5", fontSize: 20, fontWeight: "600" }}>
        Something went wrong
      </Text>
      <Text
        style={{
          color: "#a3a3a3",
          marginTop: 8,
          textAlign: "center",
          maxWidth: 320,
        }}
      >
        {error.message}
      </Text>
      <Pressable onPress={() => void retry()} style={{ marginTop: 20 }}>
        <Text style={{ color: "#34d399", fontWeight: "600" }}>Try again</Text>
      </Pressable>
    </View>
  );
}
