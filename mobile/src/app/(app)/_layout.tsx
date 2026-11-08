import { Redirect, Stack } from "expo-router";

import { LoadingScreen } from "@/components/loading-screen";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

export default function AppLayout() {
  const { status } = useAuth();
  const theme = useTheme();

  if (status === "loading") {
    return <LoadingScreen />;
  }
  if (status === "needs-server") {
    return <Redirect href="/server-setup" />;
  }
  if (status === "unreachable") {
    return <Redirect href="/connection-error" />;
  }
  if (status !== "authenticated") {
    return <Redirect href="/login" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="spool/[id]" />
      <Stack.Screen
        name="scan-confirm"
        options={{
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
    </Stack>
  );
}
