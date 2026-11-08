import { Redirect, Stack } from "expo-router";

import { LoadingScreen } from "@/components/loading-screen";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

export default function AuthLayout() {
  const { status } = useAuth();
  const theme = useTheme();

  if (status === "loading") {
    return <LoadingScreen />;
  }
  if (status === "authenticated") {
    return <Redirect href="/" />;
  }
  if (status === "unreachable") {
    return <Redirect href="/connection-error" />;
  }
  if (status === "needs-server") {
    return <Redirect href="/server-setup" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    />
  );
}
